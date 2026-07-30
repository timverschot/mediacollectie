# Mijn Mediacollectie

Een persoonlijk dashboard voor je fysieke filmcollectie (DVD, Blu-ray, 3D
Blu-ray, 4K UHD, Laserdisc en VHS), gehost op GitHub Pages.

De website is statisch: er draait geen server. Je gegevens staan in je **eigen
Google Drive**, in een verborgen map die alleen deze app kan zien.

---

## Hoe het werkt

| | |
|---|---|
| `index.html` | de collectiepagina — zoeken, filteren, bewerken |
| `beheer.html` | titels toevoegen, instellingen, backups, import/export |
| `prijzen.html` | prijsopvolging via eBay |
| `statistieken.html` | cijfers en grafieken over je collectie |
| `universums.html` | universums (MCU, Star Wars, …) via TMDb-trefwoorden |
| `assets/` | alle JavaScript; `drive.js` is de opslaglaag, `admin.js` doet TMDb |
| `sw.js` | service worker: maakt de site installeerbaar en offline bruikbaar |
| `data/` | **voorbeeldbestanden**, worden door de site niet gelezen |

### Waar je gegevens staan

- **Je collectie** staat als `movies.json` in de *App Data*-map van je Google
  Drive. Die map is onzichtbaar tussen je gewone bestanden en alleen deze app
  kan erbij. De app vraagt dan ook maar één rechtenniveau: `drive.appdata`.
- **Hoesfoto's** staan als losse bestanden in diezelfde map, met de naam
  `cover-<titel-id>-<exemplaar-id>-<front|back>.jpg`. In `movies.json` staat
  alleen het bestand-ID — zo blijft dat bestand klein, en dat telt: het wordt
  bij elke wijziging volledig op- en neergehaald.
- **Prijsgeschiedenis** staat er als `price_history.json`, **universums** als
  `universes.json`, en je **TMDb-key** als `config.json` — zo hoef je die maar
  één keer in te vullen en werkt het meteen op je andere toestellen.
- **Backups**: de app maakt wekelijks een kopie van `movies.json` in dezelfde
  map en bewaart de laatste vier. Via Beheer kan je ook exporteren naar je pc.
  Doe dat af en toe: een backup in dezelfde Drive-map overleeft het niet als je
  de app-toegang in je Google-account intrekt.

> `data/movies.json` en `data/price_history.json` in deze repo zijn
> voorbeeldbestanden uit de begintijd van het project. De site leest ze niet
> meer. Ze blijven handig als voorbeeld voor de import-knop in Beheer.

---

## 1. Eenmalige set-up

### 1.1 TMDb API-key

Alle filmgegevens (posters, cast, genres, seizoenen) komen van
[The Movie Database](https://www.themoviedb.org/). Maak een gratis account en
vraag een API-key aan via **Instellingen → API**.

Open daarna `beheer.html` → **⚙ Instellingen**, plak je key en klik **Opslaan**.
De key wordt bewaard in je browser én in je Drive, zodat je hem op een tweede
toestel niet opnieuw hoeft in te vullen.

Zonder key werkt de site wel, maar dan kan je geen titels toevoegen en vallen de
persoonspagina's, de reeks-compleetheid en de universums weg.

### 1.2 Google Drive-koppeling

Dit heb je alleen nodig als je de site zelf publiceert onder je eigen adres.
Draai je op een reeds werkende installatie, dan hoef je hier niets te doen.

1. Ga naar de [Google Cloud Console](https://console.cloud.google.com/) en maak
   een project aan.
2. **API's en services → Bibliotheek** → zoek **Google Drive API** → inschakelen.
3. **API's en services → OAuth-toestemmingsscherm** → type **Extern**, vul een
   naam en je e-mailadres in. Voeg jezelf toe als **testgebruiker**.
4. **API's en services → Inloggegevens → Inloggegevens maken → OAuth-client-ID**
   → type **Webapplicatie**.
5. Bij **Geautoriseerde JavaScript-oorsprongen** zet je het adres van je site,
   bijvoorbeeld `https://<gebruikersnaam>.github.io`. Zonder deze regel weigert
   Google het inloggen.
6. Kopieer het client-ID en plak het bovenaan **elk van de vijf HTML-pagina's**,
   in de regel `var GOOGLE_CLIENT_ID = '...'`.

Het client-ID is geen geheim: de beveiliging zit in de oorsprongen die je bij
stap 5 opgeeft.

---

## 2. Titels toevoegen

### Eén titel

Op `index.html` klik je op **+ Titel toevoegen**, of je gebruikt het formulier op
`beheer.html`. Zoek de titel, klik de juiste poster aan, kies formaat,
uitvoering (steelbook, limited, extended, director's cut), eventueel boxset en
locatie, en koppel desgewenst foto's van je eigen doosje.

Heb je de titel al, dan biedt het formulier aan om er een **extra exemplaar** bij
te zetten — je DVD blijft dan gewoon staan naast je nieuwe 4K, elk met hun eigen
hoesfoto's.

Het laatst gekozen formaat wordt onthouden; de beginwaarde is DVD.

### Meerdere tegelijk

- **Zoekresultaten aanvinken.** Vink meerdere posters aan, kies één keer formaat
  en status, en voeg ze in één keer toe.
- **Hele reeks.** Hoort de titel bij een TMDb-reeks (Harry Potter, Alien, …), dan
  verschijnt er een knop om alle ontbrekende delen ineens toe te voegen.
- **📋 Lijst invoeren** (op `index.html`). Bedoeld voor een plank of stapel: maak
  er een foto van, laat een AI de titels van de ruggen aflezen, en plak het
  resultaat. De app zoekt elke regel op bij TMDb, jij bevestigt per titel, en
  alles gaat in blokken van 25 je collectie in. Titels die je al hebt worden
  overgeslagen, zodat bestaande gegevens niet overschreven worden.

---

## 3. Publiceren op GitHub Pages

1. Push deze map naar een GitHub-repository.
2. **Settings → Pages** → Source: **Deploy from a branch**, branch `main`, map
   `/ (root)`.
3. Na een minuut staat je site op
   `https://<gebruikersnaam>.github.io/<reponaam>/`.

Het bestand `.nojekyll` staat er niet voor niets: het voorkomt dat GitHub de map
door Jekyll haalt.

**Na elke wijziging**: verhoog `VERSION` bovenaan `sw.js` en herlaad met
**Ctrl+Shift+R**. Doe je dat niet, dan blijft de service worker de oude versie
uit de cache serveren en lijkt je wijziging niet aan te komen. Zie
`WERKWIJZE.md`.

---

## 4. Op je telefoon

De site is een PWA: open hem in je browser en kies **Toevoegen aan
beginscherm**. Hij opent dan als een app, en de laatst geladen collectie blijft
zichtbaar zonder verbinding (wijzigen kan dan niet).

> **iPhone:** installeer hem vanuit **Safari**. Inloggen bij Google werkt niet
> vanuit een schermvullend geïnstalleerde app die van vóór deze aanpassing
> dateert; verwijder dat pictogram, open de site opnieuw in Safari en zet hem
> daar opnieuw op je beginscherm.

---

## 5. Prijsopvolging

`prijzen.html` haalt richtprijzen op bij eBay via een eigen **Cloudflare
Worker** — een klein doorgeefluik dat je eBay-sleutels buiten de browser houdt.
De Worker-URL staat bovenaan `prijzen.html`.

Per gevolgd exemplaar wordt de mediaan bewaard, met eerste en derde kwartiel als
bandbreedte, over meerdere markten (NL, DE, UK). Series worden per seizoen
gevolgd zodra je seizoenen registreert. Op `statistieken.html` staat een
verzekeringsoverzicht dat je kan exporteren als CSV of afdrukken.

> Zet **rate limiting** op je Worker-route in Cloudflare. De URL staat in een
> publieke pagina, dus wie hem kent kan hem aanroepen en je eBay-quota
> opgebruiken.

---

## 6. De Python-scripts

`scripts/add_movie.py` en `scripts/price_tracker.py` komen uit de begintijd, toen
de collectie nog als `data/movies.json` in deze repo stond. **Ze zijn niet meer
in gebruik**: ze schrijven naar een bestand dat de site niet leest, in een ouder
gegevensformaat zonder exemplaren. Gebruik ze niet zonder ze eerst bij te werken.

Ze staan er nog omdat de eBay-aanroepen erin een bruikbaar voorbeeld zijn. Maak
je er tóch gebruik van, kopieer dan `scripts/config.example.json` naar
`scripts/config.json` en vul je sleutels in — dat bestand staat in `.gitignore`
en komt dus nooit in de repo terecht.

---

## 7. Documentatie in deze repo

| Bestand | Inhoud |
|---|---|
| `WERKWIJZE.md` | vaste afspraken: versie ophogen, commit-berichten, waar wat staat |
| `FASE-24-…`, `FASE-25-…`, `FASE-26-…` | per wijziging: wat er mis was, wat er veranderde, uploadlijst, testchecklist |
| `ANALYSE-2026-07-29.md` | volledige doorlichting op gebruiksgemak, volledigheid, veiligheid en correctheid |

---

## Mappenstructuur

```
index.html              collectiepagina
beheer.html             toevoegen, instellingen, backups
prijzen.html            prijsopvolging
statistieken.html       cijfers en grafieken
universums.html         universums via TMDb-trefwoorden
manifest.json           PWA-manifest
sw.js                   service worker (versie ophogen bij elke wijziging!)
.nojekyll               laat GitHub Pages de bestanden ongemoeid
assets/
  app.js                de collectiepagina
  drive.js              Google Drive + het gedeelde gegevensmodel
  admin.js              TMDb-aanroepen en configuratie
  add-title.js          toevoegformulier
  bulk-import.js        lijstinvoer in drie stappen
  price-app.js          prijzenpagina
  stats.js              statistiekenpagina
  universes.js          universum-logica
  universes-page.js     universumpagina
  icons/                app-pictogrammen
data/                   voorbeeldbestanden (niet gebruikt door de site)
scripts/                oude Python-scripts (niet meer in gebruik)
```
