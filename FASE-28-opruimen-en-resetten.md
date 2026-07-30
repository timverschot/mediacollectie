# FASE 28 — Opruimen en resetten

**Datum:** 30 juli 2026 · **Service worker:** `v26` → **`v27`**
**Aanleiding:** je vroeg om *alle* variaties van wissen, plus een volledige
resetknop in het beheervak — je hebt tot nu toe vooral testtitels toegevoegd en
wil met een schone lei beginnen.

> Deze fase schuift de rest opnieuw één plaats op: 29 gsm en snelheid,
> 30 bediening en vertrouwen, 31 veiligheid en opruimen, 32 datamodel,
> 33 consistentie en toegankelijkheid.

---

## 1. Alle manieren van wissen, nu compleet

FASE 27 gaf je meervoudige selectie in de collectie. Wat nog ontbrak stond op
drie plekken, en die zijn nu alle drie gedicht.

| Wat je wil wissen | Waar | Nieuw? |
|---|---|---|
| Eén titel | kruisje op de poster, of de detailmodal | bestond al |
| Eén exemplaar (formaat) van een titel | detailmodal | bestond al |
| Een handvol titels | selectiemodus → **Verwijderen (N)** | FASE 27 |
| Een hele reeks | reeksmodal → **Alle N delen verwijderen** | FASE 27 |
| **Eén filterrij leegmaken** | het **×** naast die rij chips | **FASE 28** |
| **Een aanvinkselectie bij het toevoegen** | **Selectie wissen** in de bulkbalk | **FASE 28** |
| **Je hele collectie** | Beheer → **Gevarenzone** | **FASE 28** |

### Per filterrij wissen

Er was één knop "Alles wissen" die *alle* filters tegelijk weggooide. Wil je
alleen de vier aangevinkte genres kwijt maar je formaatkeuze houden, dan moest
je vier keer terugklikken.

Nu staat er achter elke rij chips een klein **×**, maar alléén wanneer die rij
iets actiefs heeft. Rijen zonder actieve chips tonen niets, zodat de balk niet
volloopt met knoppen die niets doen. Op touch is het raakvlak groter dan het
kruisje zelf.

Kleine valkuil die eruit is: formaat, type, status en bekeken delen in de HTML
**één** ouderelement. De eerste versie plaatste daardoor één × voor alle vier de
rijen. De browsertest ving dat op; het zoeken gebeurt nu op een sleutel per rij.

### Selectie wissen bij het toevoegen

De bulkbalk in Beheer kon titels toevoegen, maar niet je aanvinkwerk
terugdraaien zonder de zoekopdracht opnieuw te doen. **Selectie wissen** vinkt
alles uit, haalt de oplichting van de kaarten en verbergt de balk.

---

## 2. De gevarenzone

Onderaan **Beheer → Backups** staat een dichtgeklapt vak *Gevarenzone —
collectie leegmaken*. Dichtgeklapt en anders van kleur, zodat je er niet
per ongeluk in belandt.

Open je het, dan haalt hij eerst je collectie op en zegt hoeveel titels het
zijn: *"Je collectie bevat nu 37 titels."* Bevestigen zonder te weten waar je ja
tegen zegt, hoeft dus niet.

### Drie optionele extra's, standaard uit

| Vinkje | Wist ook |
|---|---|
| Hoesfoto's | alle `cover-*.jpg`-bestanden in je Drive |
| Prijsgeschiedenis | `price_history.json` — jaren aan metingen, komen niet terug |
| Universums | `universes.json` |

**Hoesfoto's staan bewust standaard uit.** De backup die vlak ervoor gemaakt
wordt bevat alleen `movies.json`. Zet je de collectie later terug, dan verwijzen
de titels naar foto's die er niet meer zijn. Vink dit alleen aan als je zeker
weet dat je écht helemaal opnieuw begint.

### Vier remmen

1. **Het vak zit dichtgeklapt** en is rood omrand.
2. **Je typt `WISSEN` over**, hoofdlettergevoelig. Tot dat klopt is de knop
   grijs. Een tik naast een knop kan dit niet uitlokken.
3. **Een bevestiging die het aantal noemt**, plus welke extra's meegaan:
   *"37 titels worden gewist, samen met alle hoesfoto's en de universums."*
4. **Backup naar Drive vóór alles**, via `driveBackupNow('voor-reset')`.
   Mislukt die, dan gebeurt er niets — de rest van de functie wordt niet eens
   bereikt. Terugzetten kan via **Beheer → Herstellen**, ook morgen nog.

Tijdens het wissen zie je waar hij is: *"Backup maken naar Drive…"*,
*"Hoesfoto's verwijderen (12/47)…"*. Achteraf staat er wat er precies gebeurd is
én onder welke naam de backup bewaard is, en de backuplijst hierboven ververst
zichzelf zodat je hem meteen ziet staan.

### Nieuw in `drive.js`

```
driveListCoverFiles()              — alle cover-bestanden in appDataFolder
driveWipeCollection(opties, cb)    — backup, dan leegmaken, met voortgang
```

`driveWipeCollection` schrijft `movies.json` leeg binnen het schrijfslot, wist
daarna pas de optionele extra's, geeft de blob-URL's van verwijderde covers vrij
(anders houdt het tabblad geheugen vast dat nergens meer naar verwijst) en gooit
de lokale cache weg. Terug komt een overzicht: backupnaam, aantal titels, aantal
covers, en of prijzen en universums meegingen.

### Versiebewaking op beheer.html

`beheer.html` had als enige pagina géén controle of de meegeleverde
`assets/*.js` wel bij de HTML horen. Precies de pagina waar je de gevaarlijkste
knoppen indrukt. Die controle zit er nu ook op: staat er een oude `drive.js` in
je cache, dan zegt de pagina dat, in plaats van halverwege te struikelen.

---

## 3. Bestanden om te uploaden

**Samen uploaden:**

```
assets/app.js
assets/drive.js
assets/add-title.js
beheer.html
index.html
sw.js                       ← VERSION = 'v27'
FASE-28-opruimen-en-resetten.md   ← nieuw
```

Na het uploaden: **Ctrl+Shift+R**.

> Staan FASE 26 of 27 nog niet online, neem die bestanden dan mee — `sw.js`
> staat nu op v27 en dekt alles.

---

## 4. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Filters openen, twee genres aanvinken | Een **×** verschijnt achter de genre-rij |
| 3 | Op dat × klikken | Alleen de genres gaan uit, andere filters blijven |
| 4 | Een formaat én een genre aanvinken | Twee ×'en, elk bij de eigen rij |
| 5 | Op het × van formaat klikken | Genre blijft actief |
| 6 | Alle chips van een rij handmatig uitzetten | Het × van die rij verdwijnt |
| 7 | Beheer → zoeken → twee resultaten aanvinken | Bulkbalk verschijnt, "2 titels" |
| 8 | **Selectie wissen** | Vinkjes uit, kaarten dof, balk weg |
| 9 | Beheer → **Gevarenzone** openklappen | Meldt het juiste aantal titels |
| 10 | Op de rode knop klikken zonder te typen | Knop is grijs, er gebeurt niets |
| 11 | `wissen` in kleine letters typen | Knop blijft grijs |
| 12 | `WISSEN` typen | Knop wordt rood en klikbaar |
| 13 | Klikken → **Annuleren** in de bevestiging | Er is **niets** gewist |
| 14 | Klikken → bevestigen | "Backup maken…", dan "✓ N titels gewist. Backup bewaard als: …" |
| 15 | Collectie herladen | Leeg |
| 16 | Beheer → Backups → de `voor-reset`-backup terugzetten | Alles staat er weer |
| 17 | Op gsm: gevarenzone bedienen | Tekstveld en knop goed te raken, ×'en op de filterrijen ook |

Test 13 en 16 zijn de belangrijkste: die controleren dat de rem werkt en dat de
terugweg bestaat. **Doe test 16 minstens één keer** voor je de reset écht
gebruikt — dan weet je dat terugzetten werkt vóór je het nodig hebt.

---

## 5. Geautomatiseerd nagekeken

32 controles, alle geslaagd.

**In een echte browser** (Chromium, `index.html` met een nagebootste Drive-laag):
de ×'en verschijnen alleen bij rijen met actieve chips, wissen alleen hun eigen
rij, verdwijnen weer als de rij leeg is, en — na het opsporen van de gedeelde
ouder — staat elk × bij de juiste rij in plaats van vier keer bij dezelfde.

**In `drive.js`** (sandbox met een nagebootste Drive): de backup gaat vooraf aan
het leegmaken, een mislukte backup laat de collectie ongemoeid, covers worden
alleen verwijderd als het vinkje aanstaat, prijzen en universums idem, en de
teruggave klopt met wat er werkelijk weg is.

Daarnaast: syntaxcontrole op alle JS, elk inline script, en de HTML-tagbalans
van `index.html` en `beheer.html`.

---

## 6. Commit-bericht

**Titel:**

```
FASE 28: gevarenzone met volledige reset, per filterrij wissen (sw v27)
```

**Beschrijving:**

```
Wissen kon na FASE 27 per titel, per exemplaar, per selectie en per reeks,
maar drie gaten bleven open: er was geen manier om je collectie in een keer
leeg te maken, filters konden alleen allemaal tegelijk gewist worden, en een
aanvinkselectie bij het toevoegen kon je niet terugdraaien zonder opnieuw te
zoeken.

Nieuw:
- Gevarenzone in beheer.html: dichtgeklapt, rood omrand, meldt bij openen
  hoeveel titels je hebt, en maakt de collectie leeg. Drie optionele extra's,
  standaard uit: hoesfoto's, prijsgeschiedenis, universums. Hoesfoto's staan
  uit omdat de backup alleen movies.json bevat.
- driveWipeCollection(opties, onProgress) en driveListCoverFiles() in
  drive.js. Backup via driveBackupNow('voor-reset') gaat vooraf; mislukt die,
  dan gebeurt er niets. movies.json wordt binnen het schrijfslot leeggemaakt,
  blob-URL's van verwijderde covers worden vrijgegeven en de lokale cache
  wordt gewist.
- Een x per filterrij in de collectie, alleen zichtbaar als die rij actieve
  chips heeft; groter raakvlak op touch.
- "Selectie wissen" in de bulkbalk van beheer.html.
- Versiebewaking (beheerCheckAssets) op beheer.html, die daar als enige
  pagina nog ontbrak.

Remmen op de reset, in volgorde: dichtgeklapt vak, het woord WISSEN
hoofdlettergevoelig overtypen voor de knop uit het grijs komt, een
bevestiging die het aantal en de gekozen extra's noemt, en een backup vooraf.

Opgelost tijdens het testen: formaat, type, status en bekeken delen een
ouderelement, waardoor de eerste versie een enkele x voor alle vier de rijen
plaatste.

32 geautomatiseerde controles geslaagd, waarvan de filterrij-controles in een
echte browser tegen index.html.
Details en testchecklist: FASE-28-opruimen-en-resetten.md
```

---

## 7. Wat hierna komt

**FASE 29 — gsm en snelheid:** `srcset` op de posters, snelblik overslaan op
touch, ambient-achtergrond ook op touch, "Toon meer" zonder de hele lijst te
herbouwen, sticky balk inkorten op smalle schermen, laadtoestanden.

Daarna 30 (bediening en vertrouwen), 31 (veiligheid en opruimen), 32
(datamodel: jaar- en regisseurfilter, animation als eigenschap) en 33
(consistentie en toegankelijkheid).
