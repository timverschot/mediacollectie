# FASE 33 — Invoeren

**Datum:** 31 juli 2026 · **Service worker:** `v32` → **`v34`**

---

## ⬆ UPLOADCHECKLIST — vink af, alle zeven horen bij elkaar

- [ ] `index.html`
- [ ] `beheer.html`
- [ ] `assets/app.js`
- [ ] `assets/admin.js`
- [ ] `assets/add-title.js`
- [ ] `assets/bulk-import.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v34'`
- [ ] Daarna: **Ctrl+Shift+R**

> Vorige keer bleef `index.html` achter en waren drie van de vier punten
> onzichtbaar, zonder één foutmelding. Vandaar deze lijst bovenaan.
>
> **Snelle controle achteraf**, zoek in je repo op:
> `data-preview` (index.html) · `tmdbPreviewOverlay` (admin.js) ·
> `data-cover-poster` (app.js) · `data-bulk-preview` (bulk-import.js)

---

Dit zijn de punten 3, 4, 7 en 8 uit je lijst. Punt 8 stuurde ik al eerder
apart; hij staat hieronder voor de volledigheid.

---

## 1. Zoekresultaten die je kan bekíjken (punt 3)

De treffers waren posterzegels van een centimeter of twee. Bij een remake, een
gelijknamige serie of een film die je maar half herkent moest je gokken — en
dat merk je pas als de verkeerde titel in je collectie staat.

**Bij de lijstinvoer** is de miniatuur nu ruim twee keer zo groot, en klikbaar.
De knop rechts heet niet meer *"andere (1/3)"* maar **kies (1/3)** — die opende
vroeger blind de volgende kandidaat, nu opent hij een overzicht:

- de poster groot, met jaar, soort, TMDb-score en de samenvatting;
- alle gevonden treffers als posterstrook eronder, zodat je ze *naast elkaar*
  ziet in plaats van er één voor één doorheen te klikken;
- **Deze gebruiken** zet je keuze in de lijst.

Is er maar één treffer, dan staat er **bekijk** — zelfde scherm, om even te
controleren of het klopt.

**Bij het gewone zoeken** (+ Titel toevoegen) zijn de posters groter geworden —
vier kolommen in plaats van zeven op een breed scherm — en er zit een
vergrootglas rechtsboven op elke kaart. Dat opent hetzelfde overzicht **zonder**
de titel te kiezen; blijkt het de juiste, dan neemt *Deze gebruiken* je alsnog
mee naar het formulier.

> Alle gegevens komen uit de zoekopdracht die toch al gedaan was. Het
> voorbeeldscherm kost dus geen extra TMDb-verkeer.

---

## 2. Een IMDb-link plakken (punt 4)

Eerst het eerlijke deel: **een gratis IMDb-API bestaat niet.** IMDb verkoopt
zijn gegevens via AWS Data Exchange aan bedrijfstarieven, en alles wat gratis
rondzwerft is scraping — tegen hun voorwaarden, en stuk zodra zij iets
veranderen.

Maar de oorzaak is meestal een andere dan je denkt: **de film stáát wel in
TMDb**, alleen onder een titel die jij niet intikt — een andere landstitel, een
vertaling, een spellingsvariant. TMDb heeft een gratis opzoekfunctie op externe
ID's, dus met de tt-code uit de IMDb-link kom je er alsnog.

Je kan nu in het zoekveld plakken:

| Wat je plakt | Werkt |
|---|---|
| `https://www.imdb.com/title/tt0087363/?ref_=nv_sr_1` | ✓ hele link |
| `tt0087363` | ✓ kale code |
| `Gremlins tt0087363` | ✓ code middenin een zin |

Levert de code niets op, dan zoekt hij alsnog gewoon op de tekst die je typte —
je verliest dus niks.

Dit werkt overal waar je zoekt: het toevoegformulier, de beheerpagina, én de
lijstinvoer (zet een tt-code op een regel).

---

## 3. Je eigen hoesfoto als poster (punt 7)

In het bewerkpaneel van een titel staat naast *Andere poster kiezen* nu ook
**Mijn hoesfoto als poster**. Die knop verschijnt alleen als er ook echt een
voorkantfoto is — anders zou het een dode knop zijn.

Gekozen? Dan toont het raster jouw foto in plaats van de TMDb-poster. Met de
knop **Toch de TMDb-poster gebruiken** draai je het terug; *Terug naar
standaardposter* wist beide keuzes. Een TMDb-poster kiezen en je hoesfoto
gebruiken sluiten elkaar uit — er kan er maar één op de kaart.

**Over de snelheid**, want dat is hier de gevoelige plek. Een TMDb-poster is een
gewoon webadres; jouw hoesfoto staat in je Drive en moet opgehaald worden. Zou
het raster dat voor alles tegelijk doen, dan was FASE 29 voor niks geweest.
Daarom:

- de foto wordt pas opgehaald wanneer die kaart **in beeld komt** (met een
  aanloop van 400 pixels, zodat je hem zelden ziet opbouwen);
- eenmaal opgehaald blijft hij voor de rest van je bezoek in het geheugen;
- de kosten schalen met je eigen keuzes — alleen titels waar jij dit instelt
  halen een bestand op. Bij de rest verandert er niets.

Is de foto er niet meer (verwijderd, of geen verbinding), dan verschijnt gewoon
de TMDb-poster in de plaats. De kaart blijft nooit eeuwig staan laden.

---

## 4. Dubbels toch kunnen toevoegen (punt 8, al geleverd)

Had je een titel al in hetzelfde formaat, dan bood het formulier alleen
*bijwerken* of *annuleren* — een `confirm()` heeft nu eenmaal twee knoppen.
Twee schijven van dezelfde film in hetzelfde formaat is nochtans heel gewoon:
een oude uitgave naast een remaster, een losse DVD naast dezelfde DVD uit een
boxset.

Nu krijg je drie keuzes: **Tweede exemplaar toevoegen**, **Bestaand exemplaar
bijwerken**, of **Annuleren**. Zo'n tweede exemplaar krijgt een eigen id, dus
ook een eigen hoesfoto en eigen opmerkingen.

De dubbels-waarschuwing blijft melden dat je er twee hebt, zoals je vroeg. Zet
je er een uitvoering bij (steelbook, extended), dan telt het níet als dubbel —
die regel bestond al en klopt hier precies.

---

## 5. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | + Titel toevoegen → iets zoeken | Grotere posters, vergrootglas rechtsboven op elke kaart |
| 3 | Op een vergrootglas klikken | Poster groot, jaar, soort, score en samenvatting |
| 4 | Daar op **Deze gebruiken** | Het formulier opent met die titel |
| 5 | Daar op **Sluiten** of Escape | Terug naar de resultaten, niets gekozen |
| 6 | Een IMDb-link plakken in het zoekveld | De juiste titel verschijnt |
| 7 | Alleen `tt0087363` plakken | Idem |
| 8 | Onzin plakken die op een code lijkt | Valt terug op gewoon zoeken, geen foutmelding |
| 9 | Lijst → een paar titels plakken → Controleren | Miniaturen zijn groter en klikbaar |
| 10 | Op **kies (1/3)** klikken | Alle treffers naast elkaar, met samenvatting |
| 11 | Een andere kiezen → Deze gebruiken | De lijst toont die keuze |
| 12 | Een titel met hoesfoto openen → Bewerken | Knop **Mijn hoesfoto als poster** staat er |
| 13 | Die kiezen → Opslaan → terug naar het raster | Jouw foto staat op de kaart |
| 14 | Doorscrollen en terug | Blijft vlot; de foto laadt pas als de kaart in beeld komt |
| 15 | Titel zónder hoesfoto openen → Bewerken | Die knop is er niet |
| 16 | **Toch de TMDb-poster gebruiken** → Opslaan | De gewone poster is terug |
| 17 | Een titel toevoegen die je al op DVD hebt | Drie keuzes, niet twee |

Test 14 is de belangrijkste van deze fase: die controleert dat je eigen posters
het scrollen niet vertragen.

---

## 6. Geautomatiseerd nagekeken

**37 nieuwe controles voor punt 3, 4 en 7, plus 16 voor punt 8 — alle
geslaagd.** Onder meer: het voorbeeldscherm met samenvatting, jaar, soort en
score, wisselen tussen treffers en de teruggegeven keuze; zes vormen van
IMDb-invoer (kale code, hele link, hoofdletters, middenin een zin, gewone
titel, te korte code); de opzoekroute die aantoonbaar `/find/tt…` met
`external_source=imdb_id` aanroept en bij nul treffers alsnog op tekst zoekt;
de hoesfoto-poster die alleen bij de juiste titel verschijnt, door de waarnemer
uit zichzelf opgehaald wordt, zichtbaar wordt en het laadhokje opruimt; en een
verwijderd bestand dat netjes terugvalt op de TMDb-poster.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24), filterpaneel (16). Plus de
opmaakvergelijking (geen verschil), een nieuwe Tailwind-build met
dekkingscontrole, syntaxcontrole op alle JS en alle inline scripts van vijf
pagina's, en de HTML-tagbalans.

Eén zwakke test die ik onderweg zelf betrapte: de controle op het ophalen van
de hoesfoto was zo geschreven dat hij altijd slaagde. Vervangen door een die
echt meet dat de waarnemer Drive aanroept en de foto op de kaart zet.

---

## 7. Commit-bericht

**Titel:**

```
FASE 33: voorbeeld bij zoekresultaten, IMDb-ID, hoesfoto als poster (sw v34)
```

**Beschrijving:**

```
Zoekresultaten:
- De treffers waren posterzegels van twee centimeter; bij een remake of een
  gelijknamige serie kon je alleen gokken. Nieuw voorbeeldscherm met de poster
  groot, jaar, soort, TMDb-score en samenvatting.
- Bij de lijstinvoer zijn de miniaturen ruim twee keer zo groot en klikbaar.
  De knop "andere (1/3)" opende blind de volgende kandidaat; nu toont "kies
  (1/3)" alle treffers als posterstrook naast elkaar.
- Bij het gewone zoeken minder kolommen (grotere posters) en een vergrootglas
  per kaart dat het voorbeeld opent zonder de titel te kiezen.
- Alle gegevens komen uit de zoekopdracht die al gedaan was: geen extra
  TMDb-verkeer.

IMDb:
- Een gratis IMDb-API bestaat niet (AWS Data Exchange, bedrijfstarieven). De
  oorzaak is meestal ook een andere: de film staat wel in TMDb, maar onder een
  andere landstitel of spelling.
- Het zoekveld herkent nu een tt-code, ook uit een hele IMDb-link of middenin
  een zin, en zoekt via TMDb's gratis find-route op external_source=imdb_id.
  Levert dat niets op, dan wordt alsnog op tekst gezocht.
- Werkt in het toevoegformulier, op de beheerpagina en in de lijstinvoer.

Hoesfoto als poster:
- Knop "Mijn hoesfoto als poster" in het bewerkpaneel, alleen zichtbaar als er
  een voorkantfoto is. Sluit elkaar uit met een gekozen TMDb-poster; terug kan
  via "Toch de TMDb-poster gebruiken" of "Terug naar standaardposter".
- Een Drive-foto moet opgehaald worden, in tegenstelling tot een TMDb-adres.
  Daarom lazy: pas wanneer de kaart in beeld komt (400px aanloop), daarna
  onthouden voor de rest van het bezoek. De kosten schalen met het aantal
  titels waarvoor je dit instelt.
- Ontbreekt het bestand of is er geen verbinding, dan valt de kaart terug op de
  TMDb-poster in plaats van eeuwig te laden.

37 nieuwe geautomatiseerde controles geslaagd, plus de 16 van het keuzescherm
bij dubbels. FASE 29 (41), 30 (39), 31 (50), 32 (24) en het filterpaneel (16)
blijven geslaagd.
Details en testchecklist: FASE-33-invoeren.md
```

---

## 8. Wat hierna komt

**FASE 34 — aanmelden (punt 6):** het Google-token stil vernieuwen terwijl je
bezig bent, in plaats van pas op het moment dat er iets misgaat. Google-tokens
duren vast één uur en zijn niet te verlengen, maar ze kunnen wél op tijd en
ongemerkt vervangen worden zolang je actief bent — dan zie je dat inlogscherm
tijdens het werken niet meer.
