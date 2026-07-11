#!/usr/bin/env python3
"""
add_movie.py — Lokale invoertool voor de mediacollectie
--------------------------------------------------------
Zoekt een titel op via TMDb, laat je het fysieke formaat en eventuele
hoesfoto's koppelen, en schrijft het resultaat weg naar data/movies.json.

Gebruik:
    python scripts/add_movie.py                 # interactieve modus, één titel
    python scripts/add_movie.py --bulk lijst.csv # bulk-import voor grote collecties

Vereisten:
    pip install requests pillow

TMDb API-key:
    Zet je key in scripts/config.json (zie config.example.json) of als
    omgevingsvariabele TMDB_API_KEY. config.json staat in .gitignore en
    wordt dus nooit mee gepusht naar GitHub.

CSV-formaat voor --bulk (kolommen, met header):
    title,year,format,content_type,notes
    The Matrix,1999,4k,movie,Steelbook editie
    Breaking Bad,2008,bluray,tv,Volledige box set
"""

import argparse
import csv
import json
import os
import re
import shutil
import sys
import time
import unicodedata
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Ontbrekende library: installeer met  pip install requests pillow")

try:
    from PIL import Image
except ImportError:
    sys.exit("Ontbrekende library: installeer met  pip install requests pillow")

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "movies.json"
IMAGES_DIR = ROOT / "images"
CONFIG_FILE = Path(__file__).resolve().parent / "config.json"

TMDB_BASE = "https://api.themoviedb.org/3"
MAX_COVER_WIDTH = 1200  # px — genoeg detail voor een hoesfoto, houdt bestanden klein


def get_api_key():
    key = os.environ.get("TMDB_API_KEY")
    if key:
        return key
    if CONFIG_FILE.exists():
        cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        if cfg.get("tmdb_api_key"):
            return cfg["tmdb_api_key"]
    sys.exit(
        "Geen TMDb API-key gevonden.\n"
        "Zet 'm in scripts/config.json (zie config.example.json) of als "
        "omgevingsvariabele TMDB_API_KEY."
    )


API_KEY = None  # wordt ingevuld in main()


def tmdb_get(path, params=None):
    params = params or {}
    params["api_key"] = API_KEY
    params["language"] = "nl-NL"
    resp = requests.get(f"{TMDB_BASE}{path}", params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def search_tmdb(query):
    data = tmdb_get("/search/multi", {"query": query})
    results = [r for r in data.get("results", []) if r.get("media_type") in ("movie", "tv")]
    return results


def get_details(tmdb_id, media_type):
    details = tmdb_get(f"/{media_type}/{tmdb_id}", {"append_to_response": "credits"})
    crew = details.get("credits", {}).get("crew", [])
    directors = [c["name"] for c in crew if c.get("job") == "Director"]
    if not directors and media_type == "tv":
        directors = [c.get("name") for c in details.get("created_by", [])]
    cast = [c["name"] for c in details.get("credits", {}).get("cast", [])[:5]]

    title = details.get("title") or details.get("name")
    date = details.get("release_date") or details.get("first_air_date") or ""
    year = int(date[:4]) if date[:4].isdigit() else None
    runtime = details.get("runtime")
    if not runtime and details.get("episode_run_time"):
        runtime = details["episode_run_time"][0] if details["episode_run_time"] else None

    return {
        "tmdb_id": tmdb_id,
        "title": title,
        "release_year": year,
        "poster_path": details.get("poster_path") or "",
        "genres": [g["name"] for g in details.get("genres", [])],
        "director": ", ".join(directors) if directors else "",
        "cast": cast,
        "runtime": runtime,
        "rating": details.get("vote_average"),
        "overview": details.get("overview", ""),
    }


def slugify(text, year):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    text = re.sub(r"[\s_]+", "-", text)
    return f"{text}-{year}" if year else text


def save_cover(source_path, slug, side):
    """Kopieert, comprimeert en hernoemt een hoesfoto naar images/<slug>/<side>.jpg"""
    source_path = Path(source_path).expanduser()
    if not source_path.exists():
        print(f"  ! Bestand niet gevonden: {source_path} — overgeslagen")
        return ""

    target_dir = IMAGES_DIR / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{side}.jpg"

    with Image.open(source_path) as img:
        img = img.convert("RGB")
        if img.width > MAX_COVER_WIDTH:
            ratio = MAX_COVER_WIDTH / img.width
            img = img.resize((MAX_COVER_WIDTH, int(img.height * ratio)), Image.LANCZOS)
        img.save(target_path, "JPEG", quality=85, optimize=True)

    rel_path = target_path.relative_to(ROOT).as_posix()
    print(f"  ✓ Hoes opgeslagen als {rel_path}")
    return rel_path


def load_movies():
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return []


def save_movies(movies):
    DATA_FILE.write_text(json.dumps(movies, indent=2, ensure_ascii=False), encoding="utf-8")


def upsert_movie(movies, entry):
    for i, m in enumerate(movies):
        if m["id"] == entry["id"]:
            movies[i] = entry
            return "bijgewerkt"
    movies.append(entry)
    return "toegevoegd"


def prompt(text, default=None):
    suffix = f" [{default}]" if default is not None else ""
    val = input(f"{text}{suffix}: ").strip()
    return val or (default or "")


def interactive_add():
    query = prompt("Zoek titel op TMDb")
    if not query:
        print("Lege zoekopdracht, gestopt.")
        return

    results = search_tmdb(query)
    if not results:
        print("Geen resultaten gevonden.")
        return

    print("\nResultaten:")
    for i, r in enumerate(results[:8]):
        title = r.get("title") or r.get("name")
        date = r.get("release_date") or r.get("first_air_date") or "????"
        media = "Film" if r["media_type"] == "movie" else "TV"
        print(f"  {i + 1}. [{media}] {title} ({date[:4]})")

    choice = prompt("Kies een nummer", "1")
    try:
        chosen = results[int(choice) - 1]
    except (ValueError, IndexError):
        print("Ongeldige keuze, gestopt.")
        return

    details = get_details(chosen["id"], chosen["media_type"])
    print(f"\nGekozen: {details['title']} ({details['release_year']})")

    content_type_default = "tv" if chosen["media_type"] == "tv" else "movie"
    if "Animatie" in details["genres"] or "Animation" in details["genres"]:
        content_type_default = "animation"
    content_type = prompt("Content-type (movie/tv/animation)", content_type_default)

    format_ = prompt("Fysiek formaat (4k/bluray/dvd)", "bluray")
    notes = prompt("Opmerkingen (optioneel)", "")
    watched = prompt("Al bekeken? (j/n)", "n").lower().startswith("j")

    slug = slugify(details["title"], details["release_year"])
    front_cover = back_cover = ""
    if prompt("Hoesfoto's koppelen? (j/n)", "n").lower().startswith("j"):
        front_path = prompt("  Pad naar voorkant-foto (leeg om over te slaan)")
        if front_path:
            front_cover = save_cover(front_path, slug, "front")
        back_path = prompt("  Pad naar achterkant-foto (leeg om over te slaan)")
        if back_path:
            back_cover = save_cover(back_path, slug, "back")

    entry = {
        "id": slug,
        "content_type": content_type,
        "format": format_,
        "date_added": time.strftime("%Y-%m-%d"),
        "watched": watched,
        "notes": notes,
        "custom_front_cover": front_cover,
        "custom_back_cover": back_cover,
        **details,
    }

    movies = load_movies()
    status = upsert_movie(movies, entry)
    save_movies(movies)
    print(f"\n'{entry['title']}' {status} in {DATA_FILE.relative_to(ROOT)}")


def bulk_add(csv_path):
    movies = load_movies()
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"Bulk-import van {len(rows)} titels uit {csv_path}\n")
    for i, row in enumerate(rows, 1):
        title = row["title"].strip()
        year = row.get("year", "").strip()
        query = f"{title} {year}".strip()
        print(f"[{i}/{len(rows)}] Zoeken: {query}")

        results = search_tmdb(query)
        if not results:
            print(f"  ✗ Geen resultaat voor '{title}' — overgeslagen")
            continue

        # Beste match: exacte jaartal-match krijgt voorrang, anders eerste resultaat
        best = results[0]
        if year:
            for r in results:
                date = r.get("release_date") or r.get("first_air_date") or ""
                if date[:4] == year:
                    best = r
                    break

        details = get_details(best["id"], best["media_type"])
        slug = slugify(details["title"], details["release_year"])

        entry = {
            "id": slug,
            "content_type": row.get("content_type") or ("tv" if best["media_type"] == "tv" else "movie"),
            "format": row.get("format", "bluray"),
            "date_added": time.strftime("%Y-%m-%d"),
            "watched": False,
            "notes": row.get("notes", ""),
            "custom_front_cover": "",
            "custom_back_cover": "",
            **details,
        }
        status = upsert_movie(movies, entry)
        print(f"  ✓ {details['title']} ({details['release_year']}) — {status}")

        time.sleep(0.25)  # lichte throttle, netjes richting de TMDb API

    save_movies(movies)
    print(f"\nKlaar. {DATA_FILE.relative_to(ROOT)} bevat nu {len(movies)} titels.")
    print("Tip: koppel hoesfoto's nadien per titel via de interactieve modus (herhaal met dezelfde titel/jaar).")


def main():
    global API_KEY
    parser = argparse.ArgumentParser(description="Voeg titels toe aan de mediacollectie")
    parser.add_argument("--bulk", metavar="CSV_BESTAND", help="Bulk-import vanuit een CSV-bestand")
    args = parser.parse_args()

    API_KEY = get_api_key()

    if args.bulk:
        bulk_add(args.bulk)
    else:
        interactive_add()


if __name__ == "__main__":
    main()
