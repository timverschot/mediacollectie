# FASE 26 — Afmaken wat half af was

**Datum:** 30 juli 2026 · **Service worker:** `v24` → **`v25`**
**Basis:** de vier openstaande fouten uit `DOORLICHTING-2026-07-28` en blok C uit
`ANALYSE-2026-07-29.md`.

Na deze fase staat er niets meer op de lijst dat "bestaat maar niet werkt".

---

## 1. De vier openstaande fouten

### F1 · "+ wens" bij een ontbrekend reeksdeel maakte een kapotte titel

`app.js` — `addSagaPartToWishlist()` bouwde een titel op de oude manier: formaat
en notities op titelniveau, **geen `editions[]`**, en zonder
`normalizeMovieEntry()`. Zolang je de pagina niet herlaadde vond het
formaatfilter die titel niet, bleef "Mijn exemplaren" leeg en gaf
`activeEdition()` `null`.

Nu identiek aan elk ander pad waar een titel ontstaat: mét exemplaar, mét
normalisatie, en met jouw onthouden voorkeursformaat in plaats van
hardgecodeerd Blu-ray.

### F2 · De Opslaan-knop kon permanent grijs blijven

`app.js` — `saveEditPanel()` deed eerst `saveBtn.disabled = true` en viel dan uit
op `if (!ed) return`, vóór de `finally` die de knop weer aanzet. Dat gebeurde bij
precies de titels uit F1: je moest de pop-up sluiten en heropenen, zonder één
woord uitleg.

De controle staat nu **vóór** het uitschakelen, en bij een ontbrekend exemplaar
verschijnt een leesbare melding in plaats van niets.

### F3 · Hoesfoto's bleven achter in Drive

Bij het verwijderen van een titel of een exemplaar werd alleen de regel uit
`movies.json` gehaald; de `cover-*.jpg`-bestanden bleven staan. Onzichtbaar, maar
het groeit — en het vult je Drive-quota.

Nieuw in `drive.js`: `driveDeleteCoversOfEdition()` en
`driveDeleteCoversOfMovie()`. Beide worden aangeroepen **nádat** het wegschrijven
gelukt is: mislukt dat en draaien we terug, dan moeten de foto's er nog zijn.

### F4 · Blob-URL's werden nooit vrijgegeven — een echt geheugenlek

`drive.js` — `_coverUrlCache` maakte een blob-URL per bekeken hoesfoto en gaf die
nooit vrij. Een blob-URL houdt de hele afbeelding in het geheugen van het tabblad
tot je hem expliciet vrijgeeft, en die foto's zijn tot 1200 px geresized. Op een
telefoon liep dat na een half uur bladeren op tot een herstart van de browser.

De cache is nu begrensd op **24 foto's**, met de langst niet gebruikte eruit —
inclusief `URL.revokeObjectURL()`, want alleen de sleutel weggooien geeft het
geheugen niet terug. Er is ook een losse `driveReleaseCoverUrl()`, die gebruikt
wordt zodra een foto vervangen of verwijderd wordt.

Gemeten in een simulatie: bij 34 opgevraagde foto's blijven er nooit meer dan 24
blob-URL's in leven; voorheen waren dat er 34 en groeide dat onbeperkt door.

---

## 2. Blok C — het afmaken

### Filter op uitvoering

De vier uitvoeringen (steelbook, limited edition, extended edition, director's
cut) zaten al volledig in de data en in de prijssleutel, maar je kon er niet op
filteren. Nu is er een chiprij **Uitvoering** in het filterpaneel.

Details die de moeite waren:

- **Alleen wat je bezit krijgt een chip.** Een rij met vier knoppen die allemaal
  nul resultaten geven, helpt niemand.
- **Verlanglijst-exemplaren tellen niet mee.** Het filter gaat over wat er in je
  kast staat; een steelbook die je nog wíl hebben hoort er niet bij.
- **Vaste volgorde** uit `EDITION_VARIANTS`, niet alfabetisch — zo staan
  verpakking (steelbook, limited) en inhoud (extended, director's cut) altijd op
  dezelfde plek.
- Meegeteld in de teller op de Filters-knop, gewist door "Alles wissen", en
  opgenomen in de filtervingerafdruk zodat je scrollpositie bewaard blijft.

### Prijsopvolging stopzetten

`priceUntrackTitle()` bestond compleet maar had geen knop: je kon een titel
toevoegen aan de tracker en er nooit meer uit halen. Nu staat er **"niet meer
volgen"** op de prijskaart, met bevestiging.

Alleen bij verlanglijst-titels: wat in je collectie zit wordt bij elke
verversing sowieso opnieuw gevolgd, dus daar zou de knop niets uithalen.

Meteen meegenomen: `priceUntrackTitle()` en `priceTrackNewTitle()` lazen buiten
de schrijfvergrendeling en schreven daarna de hele lijst terug — dezelfde fout
die FASE 25 elders al opruimde. Beide lezen nu binnen de vergrendeling.

### beheer.html gelijkgetrokken

`add-title.js` draait op zowel `index.html` als `beheer.html`, maar de
beheerpagina miste vier blokken die dat bestand wél opzoekt:

| | |
|---|---|
| `bulk-add-bar` | je kon zoekresultaten **aanvinken** — de kaart lichtte op — en er verscheen nooit een knop om er iets mee te doen |
| `form-boxset` | boxset kon je op de beheerpagina niet invullen |
| `form-variants` | uitvoeringen evenmin |
| `saga-bulk` | "alle delen van deze reeks toevoegen" was daar onbereikbaar |

Alle vier toegevoegd. Er was geen JavaScript-wijziging nodig.

### Locatie kan nu ook bij het toevoegen

`edition.location` werd gelezen door het filter, de chips én de exemplarenlijst,
maar door **geen enkel** toevoegformulier ingevuld — je kon het alleen achteraf
via het bewerkpaneel zetten. Er staat nu een veld **Locatie** in beide
formulieren.

### Service worker op prijzen.html

`prijzen.html` was de enige van de vijf pagina's zonder
`navigator.serviceWorker.register()`. Daardoor viel ze buiten de offline-schil en
opende ze als losse pagina in de geïnstalleerde app.

### Standaardformaat DVD wordt overal gerespecteerd

Zes plekken maakten een nieuw exemplaar met hardgecodeerd `'bluray'`, terwijl de
afspraak "standaardformaat DVD, laatste keuze onthouden" is. Alle zes gebruiken
nu `addTitlePreferredFormat()`.

`handleAddEdition` ("+ Formaat toevoegen") koos bovendien altijd het eerste
ongebruikte formaat uit de lijst — dus 4K, ook als je net een Blu-ray gekocht
had. Nu eerst je voorkeursformaat, en pas als je dat al hebt het volgende vrije.

### README herschreven

Het README beschreef nog de allereerste opzet: `data/movies.json` als database,
een GitHub-token met schrijfrechten, een `images/`-map die niet bestaat, en de
stelling dat de site "geen live API-calls doet". `index.html` verwees naar een
sectie "Google Drive-koppeling" **die er niet in stond**.

Volledig herschreven naar de Drive-werkwijze, met die ontbrekende sectie erin
(inclusief de Google Cloud Console-stappen), een eerlijke waarschuwing dat de
Python-scripts niet meer in gebruik zijn, en een verwijzing naar `WERKWIJZE.md`.

---

## 3. Bestanden om te uploaden

**Samen uploaden:**

```
assets/app.js
assets/drive.js
assets/add-title.js
assets/price-app.js
assets/universes-page.js
index.html
beheer.html
prijzen.html
sw.js                      ← VERSION = 'v25'
README.md
FASE-26-afmaken.md         ← nieuw
```

Na het uploaden: **Ctrl+Shift+R**.

---

## 4. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Alle vijf de pagina's openen, F12 → Console | Geen fouten, geen "Bestanden komen niet overeen" |
| 2 | Open een film uit een reeks → bij een ontbrekend deel op **+ wens** klikken | De titel verschijnt op je verlanglijst |
| 3 | Die nieuwe titel meteen openen → **✎ Bewerken** → iets wijzigen → **Opslaan** | Werkt gewoon. De knop blijft niet grijs |
| 4 | Filterpaneel openen | Er staat een rij **Uitvoering** met alleen de uitvoeringen die je bezit |
| 5 | Op **Steelbook** klikken | Alleen je steelbooks blijven over; de teller op de Filters-knop gaat omhoog |
| 6 | **Alles wissen** | De uitvoeringschip gaat uit, alles komt terug |
| 7 | Een titel verwijderen die hoesfoto's had | Titel weg. (De foto's zijn nu ook uit Drive weg — niet zichtbaar, wel het punt) |
| 8 | Op gsm: een half uur door titels mét hoesfoto's bladeren | Merkbaar stabieler; voorheen liep het geheugen vol |
| 9 | Prijzen → een verlanglijst-titel → **niet meer volgen** | Bevestiging, daarna is de kaart weg. Collectietitels hebben die knop niet |
| 10 | Beheer → een titel zoeken → meerdere posters **aanvinken** | Er verschijnt nu een balk "N geselecteerd" met een knop om ze toe te voegen |
| 11 | Beheer → één titel selecteren | Het formulier heeft nu ook Boxset, Locatie, Uitvoering en (bij een reeks) "alle delen toevoegen" |
| 12 | Een titel toevoegen met een locatie ingevuld | De locatie verschijnt bij het exemplaar én als filterchip |
| 13 | "+ Formaat toevoegen" bij een titel die je op DVD hebt | Er wordt niet meer automatisch 4K gekozen |
| 14 | Prijzen op je gsm installeren/verversen | De pagina hoort nu bij de geïnstalleerde app |

Test 3 is de belangrijkste: dat is precies het geval dat voorheen vastliep.

---

## 5. Geautomatiseerd nagekeken

35 controles gedraaid, alle geslaagd:

- **Hoesfoto's en geheugen (12):** hoogstens 24 blob-URL's tegelijk; oudste
  opgeruimd; dezelfde foto twee keer opvragen maakt geen tweede blob; voor- én
  achterkant van een exemplaar worden verwijderd; alle exemplaren van een titel
  plus het oude hoofdniveau; een verwijderde foto verdwijnt ook uit het geheugen.
- **Uitvoeringsfilter (12):** filteren per uitvoering en op combinaties (OR);
  verlanglijst-exemplaren tellen niet mee; chips volgen de vaste volgorde; de rij
  verdwijnt als je geen bijzondere uitvoeringen hebt.
- **F1/F2, voorkeursformaat, locatie, untrack-knop (11).**

Daarnaast: syntaxcontrole op alle negen JS-bestanden, `sw.js` en elk inline
script; controle dat alle 33 element-ID's die `add-title.js` verwacht op **beide**
pagina's precies één keer voorkomen; en een controle op dubbele ID's per pagina.

---

## 6. Commit-bericht

**Titel:**

```
FASE 26: afmaken wat half af was (sw v25)
```

**Beschrijving:**

```
De vier openstaande fouten uit de doorlichting:
- "+ wens" bij een ontbrekend reeksdeel bouwde een titel zonder editions[],
  waardoor het formaatfilter hem niet vond en "Mijn exemplaren" leeg bleef.
- saveEditPanel schakelde de Opslaan-knop uit voor de controle en viel dan
  uit voor de finally: de knop bleef permanent grijs op precies die titels.
- Hoesfoto's bleven in Drive achter bij het verwijderen van een titel of een
  exemplaar. Nieuw: driveDeleteCoversOfEdition/driveDeleteCoversOfMovie, die
  pas lopen nadat het wegschrijven gelukt is.
- Blob-URLs van hoesfoto's werden nooit vrijgegeven (geheugenlek op gsm). De
  cache is nu begrensd op 24 met revokeObjectURL bij het opruimen.

Blok C - afmaken:
- Filter op uitvoering (steelbook, limited, extended, director's cut). De
  data zat er al; alleen de chiprij en de filterlogica ontbraken. Alleen
  uitvoeringen die je bezit krijgen een chip, verlanglijst telt niet mee.
- priceUntrackTitle() heeft eindelijk een knop: "niet meer volgen" op de
  prijskaart van verlanglijst-titels. Die functie en priceTrackNewTitle
  lezen nu binnen de schrijfvergrendeling.
- beheer.html miste vier blokken die add-title.js wel opzoekt: de
  selectiebalk voor meerdere titels, boxset, uitvoeringen en de reeks-bulk.
  Aanvinken deed daar zichtbaar iets en had geen effect.
- Nieuw veld Locatie in beide toevoegformulieren; dat werd gelezen door het
  filter maar door geen enkel formulier gevuld.
- prijzen.html registreert nu de service worker (was de enige pagina zonder).
- Zes plekken maakten een exemplaar met hardgecodeerd 'bluray'; die volgen nu
  je onthouden voorkeursformaat (standaard DVD). "+ Formaat toevoegen" koos
  altijd 4K en probeert nu eerst je voorkeur.
- README volledig herschreven naar de Drive-werkwijze, inclusief de sectie
  "Google Drive-koppeling" waar index.html naar verwees maar die ontbrak.

35 geautomatiseerde controles geslaagd, plus syntaxcontrole en een controle
dat alle element-ID's op beide formulierpagina's aanwezig zijn.
Details en testchecklist: FASE-26-afmaken.md
```

---

## 7. Wat hierna nog openstaat

**Blok D — gsm en gebruiksgemak** (uit de analyse van 29 juli):

- `srcset` op de rasterposters — grootste mobiele winst, kleinste ingreep
- Leesmodus vóór het inlogscherm, zodat de winkeltaak werkt zonder netwerk
- De opslag-indicator als toast in plaats van in de weggescrolde paginakop
- Laadtoestanden op de collectie-, statistieken- en universumpagina
- De snelblik-overlay overslaan op touch (wordt nu gegenereerd en verborgen)
- Tailwind lokaal compileren: veiligheid én snelheid in één

**Veiligheid:** de oude GitHub-token intrekken als je die ooit aanmaakte; rate
limiting op de Cloudflare Worker; `price_history.json` mee in de automatische
backup.

**Bewuste keuze, geen fout:** de statistiekenpagina houdt munten apart terwijl de
collectiepagina alles naar euro omrekent. Wil je één van de twee, dan is dat een
knoop die jij moet doorhakken.
