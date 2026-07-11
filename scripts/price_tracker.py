#!/usr/bin/env python3
"""
price_tracker.py — Prijsevolutie bijhouden voor gevolgde titels
------------------------------------------------------------------
Haalt een actuele vraagprijs-range op via de eBay Browse API (en optioneel
bol.com), en voegt een datapunt toe aan data/price_history.json. Elke keer
dat je dit script draait, groeit de prijsgeschiedenis van je gevolgde
titels aan — zo bouw je een trend op.

Belangrijk: dit geeft de range van ACTIEVE vraagprijzen op eBay, niet van
bevestigd verkochte items (die data zit achter een sterk beperkte
eBay-partner-API). Het is een eerlijke, legale prijsindicatie, geen
gegarandeerd verkoopcijfer.

Gebruik:
    python scripts/price_tracker.py --refresh
        → ververst de prijzen van ALLE gevolgde titels (je collectie +
          eventuele extra's toegevoegd via --track)

    python scripts/price_tracker.py --track "Blade Runner" --year 1982
        → voegt een titel toe aan de tracker zonder ze aan je collectie
          toe te voegen (bv. een verlanglijst-titel)

Vereist in scripts/config.json:
    "ebay_client_id": "...",
    "ebay_client_secret": "...",
    "ebay_marketplace": "EBAY_GB"   (of EBAY_DE, EBAY_FR, ...)

    Optioneel, enkel als je bol.com-affiliate bent:
    "bol_client_id": "...",
    "bol_client_secret": "..."
"""

import argparse
import base64
import json
import statistics
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Ontbrekende library: installeer met  pip install requests")

ROOT = Path(__file__).resolve().parent.parent
MOVIES_FILE = ROOT / "data" / "movies.json"
HISTORY_FILE = ROOT / "data" / "price_history.json"
CONFIG_FILE = Path(__file__).resolve().parent / "config.json"

EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
BOL_OAUTH_URL = "https://login.bol.com/token"
BOL_SEARCH_URL = "https://api.bol.com/marketing/catalog/v1/products/search"

FORMAT_KEYWORDS = {"4k": "4K UHD", "bluray": "Blu-ray", "dvd": "DVD"}

_ebay_token_cache = {"token": None, "expires_at": 0}


def load_config():
    if not CONFIG_FILE.exists():
        sys.exit("scripts/config.json ontbreekt. Kopieer config.example.json en vul je keys in.")
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def get_ebay_token(cfg):
    if _ebay_token_cache["token"] and time.time() < _ebay_token_cache["expires_at"]:
        return _ebay_token_cache["token"]

    creds = f"{cfg['ebay_client_id']}:{cfg['ebay_client_secret']}"
    b64_creds = base64.b64encode(creds.encode()).decode()

    resp = requests.post(
        EBAY_OAUTH_URL,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {b64_creds}",
        },
        data={
            "grant_type": "client_credentials",
            "scope": "https://api.ebay.com/oauth/api_scope",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    _ebay_token_cache["token"] = data["access_token"]
    _ebay_token_cache["expires_at"] = time.time() + data.get("expires_in", 7200) - 60
    return _ebay_token_cache["token"]


def search_ebay_prices(cfg, title, format_key, year=None):
    token = get_ebay_token(cfg)
    format_word = FORMAT_KEYWORDS.get(format_key, "")
    query = f"{title} {year or ''} {format_word}".strip()

    resp = requests.get(
        EBAY_SEARCH_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": cfg.get("ebay_marketplace", "EBAY_GB"),
        },
        params={"q": query, "limit": 30},
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"  ! eBay-fout ({resp.status_code}) voor '{query}'")
        return None

    items = resp.json().get("itemSummaries", [])
    prices = []
    for item in items:
        price = item.get("price", {})
        if price.get("currency") in ("GBP", "EUR", "USD") and price.get("value"):
            prices.append(float(price["value"]))

    if not prices:
        return None

    return {
        "ebay_low": round(min(prices), 2),
        "ebay_high": round(max(prices), 2),
        "ebay_avg": round(statistics.mean(prices), 2),
        "ebay_currency": items[0]["price"]["currency"],
        "ebay_count": len(prices),
    }


def get_bol_token(cfg):
    creds = f"{cfg['bol_client_id']}:{cfg['bol_client_secret']}"
    b64_creds = base64.b64encode(creds.encode()).decode()
    resp = requests.post(
        BOL_OAUTH_URL,
        params={"grant_type": "client_credentials"},
        headers={"Authorization": f"Basic {b64_creds}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def search_bol_price(cfg, title):
    if not cfg.get("bol_client_id") or not cfg.get("bol_client_secret"):
        return None
    try:
        token = get_bol_token(cfg)
        resp = requests.get(
            BOL_SEARCH_URL,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params={"search-term": title, "country-code": "BE"},
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        results = resp.json().get("products", [])
        if not results:
            return None
        offer = results[0].get("offer", {})
        price = offer.get("price")
        return round(float(price), 2) if price else None
    except Exception as e:
        print(f"  ! bol.com-fout (overgeslagen): {e}")
        return None


def load_json(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def get_tracked_titles():
    """Combineert eigen collectie + extra gevolgde (niet-bezeten) titels."""
    movies = load_json(MOVIES_FILE, [])
    history = load_json(HISTORY_FILE, [])

    tracked = {
        m["id"]: {
            "id": m["id"],
            "title": m["title"],
            "release_year": m.get("release_year"),
            "poster_path": m.get("poster_path", ""),
            "format": m.get("format"),
            "owned": True,
        }
        for m in movies
    }

    # Extra getrackte titels die niet in movies.json staan (verlanglijst)
    for h in history:
        if h["id"] not in tracked:
            tracked[h["id"]] = {
                "id": h["id"],
                "title": h["title"],
                "release_year": h.get("release_year"),
                "poster_path": h.get("poster_path", ""),
                "format": h.get("format", "bluray"),
                "owned": False,
            }

    return list(tracked.values())


def refresh_prices():
    cfg = load_config()
    history = load_json(HISTORY_FILE, [])
    history_by_id = {h["id"]: h for h in history}
    today = time.strftime("%Y-%m-%d")

    titles = get_tracked_titles()
    print(f"Prijzen verversen voor {len(titles)} gevolgde titels...\n")

    for i, t in enumerate(titles, 1):
        print(f"[{i}/{len(titles)}] {t['title']} ({t.get('release_year', '?')})")
        ebay_data = search_ebay_prices(cfg, t["title"], t.get("format"), t.get("release_year"))
        bol_price = search_bol_price(cfg, t["title"])

        if not ebay_data and not bol_price:
            print("  ✗ Geen prijsdata gevonden, overgeslagen")
            continue

        entry = history_by_id.setdefault(
            t["id"],
            {
                "id": t["id"],
                "title": t["title"],
                "release_year": t.get("release_year"),
                "poster_path": t.get("poster_path", ""),
                "owned": t["owned"],
                "history": [],
            }
        )
        entry["owned"] = t["owned"]  # kan wijzigen als titel intussen aangekocht is

        point = {"date": today}
        if ebay_data:
            point.update(ebay_data)
            print(f"  ✓ eBay: {ebay_data['ebay_low']}–{ebay_data['ebay_high']} {ebay_data['ebay_currency']} "
                  f"(gem. {ebay_data['ebay_avg']}, n={ebay_data['ebay_count']})")
        if bol_price:
            point["bol_new_price"] = bol_price
            print(f"  ✓ bol.com nieuwprijs: €{bol_price}")

        # Eén datapunt per dag: overschrijf als er vandaag al een is
        entry["history"] = [h for h in entry["history"] if h["date"] != today]
        entry["history"].append(point)

        time.sleep(0.3)  # nette throttle

    save_json(HISTORY_FILE, list(history_by_id.values()))
    print(f"\nKlaar. {HISTORY_FILE.relative_to(ROOT)} bijgewerkt.")


def track_new_title(title, year, content_type, format_):
    """Voegt een titel toe aan de tracker zonder ze in movies.json te zetten."""
    from add_movie import search_tmdb, get_details, slugify  # hergebruik van add_movie.py

    query = f"{title} {year or ''}".strip()
    results = search_tmdb(query)
    if not results:
        print("Geen TMDb-resultaat gevonden.")
        return

    best = results[0]
    details = get_details(best["id"], best["media_type"])
    slug = slugify(details["title"], details["release_year"])

    history = load_json(HISTORY_FILE, [])
    if any(h["id"] == slug for h in history):
        print(f"'{details['title']}' wordt al gevolgd.")
        return

    history.append({
        "id": slug,
        "title": details["title"],
        "release_year": details["release_year"],
        "poster_path": details.get("poster_path", ""),
        "format": format_ or "bluray",
        "owned": False,
        "history": [],
    })
    save_json(HISTORY_FILE, history)
    print(f"'{details['title']}' toegevoegd aan de prijstracker (nog niet in je collectie).")
    print("Draai --refresh om meteen een eerste prijs op te halen.")


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    parser = argparse.ArgumentParser(description="Prijsevolutie bijhouden voor gevolgde titels")
    parser.add_argument("--refresh", action="store_true", help="Ververs prijzen voor alle gevolgde titels")
    parser.add_argument("--track", metavar="TITEL", help="Voeg een titel toe aan de tracker (zonder aan te kopen)")
    parser.add_argument("--year", type=int, help="Releasejaar (helpt bij --track de juiste match te vinden)")
    parser.add_argument("--content-type", default="movie", choices=["movie", "tv", "animation"])
    parser.add_argument("--format", default="bluray", choices=["4k", "bluray", "dvd"],
                         help="Formaat om op te zoeken bij --track (beïnvloedt de eBay-zoekterm)")
    args = parser.parse_args()

    if args.track:
        track_new_title(args.track, args.year, args.content_type, args.format)
    elif args.refresh:
        refresh_prices()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
