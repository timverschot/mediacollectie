# Mijn Mediacollectie

Een persoonlijk dashboard voor je fysieke filmcollectie (DVD, Blu-ray, 4K UHD), gehost op GitHub Pages.

## Hoe het werkt

- **`index.html`** — de live website. Leest enkel `data/movies.json` uit, doet geen live API-calls.
- **`data/movies.json`** — je "database": één JSON-bestand met alle titels.
- **`scripts/add_movie.py`** — lokale tool om titels toe te voegen: zoekt op TMDb, haalt metadata op, en schrijft weg naar `movies.json`.
- **`images/`** — hoesfoto's van je fysieke exemplaren, per titel in een submap.

Omdat het invoerscript alle TMDb-data al ophaalt en **cachet** in `movies.json`, heeft de live website zelf geen TMDb API-key nodig — sneller, en je key staat nergens in de browser zichtbaar.

## 1. Eenmalige set-up

1. Maak een gratis TMDb-account op [themoviedb.org](https://www.themoviedb.org/) en vraag een API-key aan via Instellingen → API.
2. Installeer Python 3 als je dat nog niet hebt.
3. Installeer de benodigde libraries:
   ```
   pip install requests pillow
   ```
4. Kopieer `scripts/config.example.json` naar `scripts/config.json` en plak je API-key erin:
   ```json
   { "tmdb_api_key": "jouw-eigen-key" }
   ```
   Dit bestand staat in `.gitignore` en wordt dus nooit meegepusht naar GitHub.

## 2. Titels toevoegen via de website (aanbevolen, geen Python nodig)

Naast het Python-script (zie verderop, handig voor wie toch met de terminal wil werken) heb je **`beheer.html`** — een pagina die je gewoon in je browser opent en waarmee je titels toevoegt zonder ooit een terminal te openen. Ze zoekt op TMDb (met posters) en schrijft rechtstreeks een commit naar je GitHub-repo.

**Eenmalige set-up:**

1. Maak een gratis TMDb-account + API-key (zie hierboven bij stap 1, punt 1 — dit heb je sowieso nodig).
2. Maak een **GitHub Personal Access Token**:
   - Ga naar GitHub → je profielfoto rechtsboven → **Settings** → helemaal onderaan **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
   - Geef het een naam (bv. "mediacollectie-beheer").
   - Bij **Repository access**: kies "Only select repositories" en selecteer je mediacollectie-repo.
   - Bij **Permissions** → **Repository permissions** → zet **Contents** op **Read and write**.
   - Genereer de token en **kopieer hem meteen** (je kan hem nadien niet meer terugzien).
3. Open `beheer.html` (dubbelklikken vanuit de Verkenner volstaat, of via je gepubliceerde site) en klik op **⚙ Instellingen**. Vul in:
   - Je TMDb API-key
   - De GitHub-token die je net aanmaakte
   - Je GitHub-gebruikersnaam en de naam van je repo
   - De branch (meestal `main`)
   
   Klik **Test verbinding** om te controleren of alles klopt, en dan **Opslaan**.

> **Veiligheid:** deze gegevens worden enkel lokaal in je browser bewaard (localStorage), nooit ergens anders naartoe verstuurd. Gebruik dit niet op een gedeelde/publieke computer, en deel je token nooit met iemand anders.

**Gebruik:**
- **Eén titel**: zoek, klik op de juiste poster, vul formaat/opmerkingen in, koppel eventueel hoesfoto's, klik "Toevoegen aan collectie". Na ongeveer een minuut staat je site bijgewerkt.
- **Meerdere tegelijk**: ga naar het tabblad "Bulk (lijst)", plak een lijst zoals:
  ```
  The Matrix | 1999 | 4k
  Spirited Away | 2001 | bluray
  Breaking Bad | 2008 | bluray | tv
  ```
  en klik "Bulk toevoegen". Hoesfoto's koppel je nadien nog los per titel via het "Eén titel"-tabblad.

## 4. Alternatief: titels toevoegen via Python (optioneel)

Als je toch liever met de terminal werkt: `python scripts/add_movie.py` doet hetzelfde als "Eén titel" in `beheer.html`, maar dan lokaal (zie stap 1 hierboven voor de config.json-setup).

## 5. Grote collecties in bulk toevoegen (1000+ titels, via Python)

Maak een CSV-bestand, bijvoorbeeld `mijn-lijst.csv`:

```csv
title,year,format,content_type,notes
The Matrix,1999,4k,movie,Steelbook editie
Spirited Away,2001,bluray,animation,
Breaking Bad,2008,bluray,tv,Volledige box set
```

En voer uit:
```
python scripts/add_movie.py --bulk mijn-lijst.csv
```

Dit haalt automatisch de beste TMDb-match op voor elke rij. Hoesfoto's koppel je nadien per titel via de gewone interactieve modus (herhaal met dezelfde titel/jaar — het script werkt bestaande titels bij in plaats van ze te dupliceren).

Tip: het "Bulk (lijst)"-tabblad in `beheer.html` doet nu ook een bulk-import, rechtstreeks in de browser — dat is voor de meeste mensen makkelijker dan deze CSV-route.

## 6. Publiceren op GitHub Pages

1. Maak een nieuwe **privé** GitHub-repository aan.
2. Push dit hele project (behalve `scripts/config.json`, die blijft lokaal).
3. Ga naar **Settings → Pages** en kies je hoofdbranch als bron.
4. Je site staat na enkele minuten live op `https://jouwgebruikersnaam.github.io/reponaam/`.

> **Let op — privacy:** een privérepo verbergt je broncode, maar zodra Pages actief is, is de gepubliceerde site zelf via de URL voor iedereen bereikbaar die de link kent. Er bestaat geen ingebouwde "paywall" bij statische GitHub Pages-sites. Wil je dat later echt afschermen, dan is een aparte toegangslaag nodig (bv. Cloudflare Access of een kleine serverless-functie) — dat is een uitbreiding op deze architectuur, geen herbouw.

## 7. Prijsevolutie volgen

Naast je collectie kun je een aparte **Prijzen**-tab bijhouden die de prijsevolutie toont van titels die je zelf kiest om te volgen — je hele collectie, of losse titels die je nog niet bezit (een soort verlanglijst).

**Belangrijk om te weten:** dit toont de range van *actieve vraagprijzen* op eBay (wat mensen er nu voor vragen), niet bevestigde verkoopprijzen — die laatste data zit achter een sterk beperkte eBay-partner-API die niet toegankelijk is voor persoonlijke projecten. Het is wel een eerlijke, gratis en legale indicatie.

**Eenmalige set-up:**
1. Maak een gratis account op [developer.ebay.com](https://developer.ebay.com/) en maak een "Application Keyset" aan (Production). Zet `ebay_client_id` en `ebay_client_secret` in `scripts/config.json`.
2. *(Optioneel)* Als je bol.com-affiliate/partner bent, kun je `bol_client_id` en `bol_client_secret` invullen voor een extra nieuwprijs-referentie. Dit is niet vereist — zonder deze keys wordt bol.com gewoon overgeslagen.

**Gebruik:**
```
# Ververs de prijzen van je hele collectie + gevolgde extra titels
python scripts/price_tracker.py --refresh

# Voeg een titel toe die je nog niet bezit, enkel om de prijs te volgen
python scripts/price_tracker.py --track "Blade Runner" --year 1982 --format 4k
```

Draai `--refresh` regelmatig (bv. maandelijks) — elke keer komt er een nieuw datapunt bij in `data/price_history.json`, waardoor de trendlijn op de Prijzen-pagina opbouwt.

> Dit toont dus enkel prijzen voor titels die je zelf laat volgen, niet elke fysieke release die ooit bestaan heeft — zo'n allesomvattende prijsgids zou een compleet eigen database-project zijn, vergelijkbaar met het herbouwen van Blu-ray.com, en is geen realistische uitbreiding van dit dashboard.

## 8. Later uitbreiden: een tweede verzameling (bv. strips)

`assets/app.js` is bewust generiek geschreven. Voor een tweede pagina (bv. `strips.html`) volstaat het om:
1. Een `data/strips.json` aan te maken met hetzelfde soort schema.
2. `strips.html` te kopiëren van `index.html` en de labels/filters aan te passen (bv. "Uitgeverij" in plaats van "Regisseur").
3. Onderaan `initCollectionApp({ dataUrl: 'data/strips.json' })` te zetten.

Geen herbouw van de motor nodig.

## Mappenstructuur

```
.
├── index.html
├── prijzen.html
├── beheer.html
├── assets/
│   ├── app.js
│   ├── price-app.js
│   └── admin.js
├── data/
│   ├── movies.json
│   └── price_history.json
├── images/
│   └── <titel-slug>/
│       ├── front.jpg
│       └── back.jpg
├── scripts/
│   ├── add_movie.py
│   ├── price_tracker.py
│   └── config.example.json   (kopieer naar config.json, niet naar Git pushen)
└── .gitignore
```
