# FASE 27 — Meerdere titels tegelijk verwijderen

**Datum:** 30 juli 2026 · **Service worker:** `v25` → **`v26`**
**Aanleiding:** je merkte dat er geen manier is om een reeks of een hele
selectie in één keer te wissen.

> Deze fase stond niet in de planning en schuift blok D (gsm en gebruiksgemak)
> één plaats op. De rest van de volgorde blijft: 28 gsm en snelheid,
> 29 bediening en vertrouwen, 30 veiligheid en opruimen, 31 datamodel,
> 32 consistentie en toegankelijkheid.

---

## 1. Wat er was

Verwijderen kon op precies twee plekken, allebei per titel:

| Waar | Wat |
|---|---|
| `app.js:1610` | het **×** op een poster |
| `app.js:3892` | **"Volledige titel verwijderen"** in de detailmodal |

De reeksmodal had **geen enkele** verwijderoptie, en er bestond nergens in de
collectie meervoudige selectie — de enige selectievakjes die er waren, zaten in
de zoekresultaten bij het *toevoegen*.

Gevolg: 200 per ongeluk geïmporteerde titels betekende 200 keer klikken en
bevestigen. Een verkochte boxset van acht delen, acht keer.

---

## 2. Wat er nu is

### Selectiemodus

Een knop **Selecteren** in de balk zet vinkjes op de kaarten en rijen. Werkt in
alle drie de lijstweergaven — in de tekstweergave staan er 400 op een scherm,
dus daar gaat het aanvinken het snelst.

Onderaan verschijnt een balk met het aantal, en vier knoppen: **Alles in beeld**,
**Wissen**, **Verwijderen (N)** en **Klaar**. Escape sluit de modus ook.

Twee keuzes die bewust zo zijn:

- **"Alles in beeld"** vinkt aan wat je op dat moment ziet, niet alles wat het
  filter oplevert. Wat je niet ziet, vink je niet per ongeluk aan. Wil je meer,
  klik dan eerst "Toon meer".
- **Een gegroepeerde reekskaart telt als al haar delen.** Eén klik op *The Matrix
  Collection* selecteert de drie films. De selectie bestaat intern altijd uit
  titel-id's; een reekskaart is een weergave, geen apart record.

In selectiemodus verdwijnen het verwijderkruisje en de snelblik van de kaarten,
en opent een klik géén detailmodal meer. Het hele kaartje is dan één knop.

### Een hele reeks in één keer

De reeksmodal heeft onderaan **"Alle N delen van deze reeks verwijderen"**. Die
knop zet de reeks als selectie en loopt daarna door precies dezelfde
bevestiging en beveiligingen — geen tweede, lossere weg naar hetzelfde gevolg.

### Vier beveiligingen, in deze volgorde

1. **De bevestiging noemt namen.** Aantal plus de eerste vijf titels, en
   "… en N andere". Niet alleen "weet je het zeker".
2. **Vanaf 25 titels moet je het aantal overtypen.** Eén tik naast een knop mag
   geen halve collectie kosten.
3. **Backup vlak vóór het verwijderen**, naar je Drive, via de nieuwe
   `driveBackupNow()`. Lukt die backup niet, dan gebeurt er níets. Terugzetten
   kan via **Beheer → Herstellen**, ook als je het pas morgen merkt.
   De naam bevat datum én tijd, zodat deze veiligheidskopie niet meetelt als de
   wekelijkse backup en dat schema gewoon doorloopt.
4. **Wegschrijven per blok van 25**, met voortgang in beeld. Valt je sessie
   halverwege weg, dan zie je waar het gestopt is en is de rest intact.

Hoesfoto's van verwijderde titels gaan mee — dat werkt sinds FASE 26.

### Nieuw in `drive.js`: `deleteMoviesInDrive(ids)`

Verwijdert alles in **één** lees- en één schrijfactie. De voor de hand liggende
lus (`for (id of ids) await deleteMovieInDrive(id)`) zou bij 200 titels
200 keer de volledige `movies.json` op- én neerhalen: minutenlang, en met
200 kansen om te stranden. `deleteMovieInDrive` is nu een aanroep van de nieuwe
functie met één id, zodat er maar één stuk logica is.

---

## 3. Bestanden om te uploaden

**Samen uploaden:**

```
assets/app.js
assets/drive.js
index.html
sw.js                      ← VERSION = 'v26'
FASE-27-selectie-en-verwijderen.md   ← nieuw
```

Na het uploaden: **Ctrl+Shift+R**.

> Heb je FASE 26 nog niet geüpload, neem dan die bestanden mee — `sw.js` staat
> nu op v26 en dekt beide.

---

## 4. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Op **Selecteren** klikken | Vinkjes op de kaarten, balk onderaan, "0 geselecteerd" |
| 3 | Twee posters aanklikken | Teller op 2, kaarten oplichten, **geen** detailmodal |
| 4 | Nog eens op dezelfde klikken | Vinkje gaat weer uit |
| 5 | **Alles in beeld** → **Wissen** | Alles aan, dan alles uit |
| 6 | "Reeksen groeperen" aan, dan een reekskaart aanvinken | Alle delen tellen mee in de teller |
| 7 | Twee titels selecteren → **Verwijderen (2)** | Bevestiging noemt beide titels bij naam |
| 8 | Bevestigen | "Backup maken…", dan "✓ 2 titels verwijderd" |
| 9 | Beheer → Backups | Er staat een `movies-backup-voor-verwijderen-…` bestand |
| 10 | 25+ titels selecteren en verwijderen | Na de bevestiging moet je het aantal overtypen |
| 11 | Bij dat venster op Annuleren klikken | Er is **niets** verwijderd |
| 12 | Een verkeerd getal typen | Melding "Het getal kwam niet overeen", niets verwijderd |
| 13 | Een reeks openen → "Alle N delen verwijderen" | Zelfde bevestiging en backup |
| 14 | Escape in selectiemodus | Modus sluit, selectie weg |
| 15 | Op gsm: selecteren en verwijderen | Balk staat boven de home-balk, knoppen goed te raken |

Test 11 en 12 zijn de belangrijkste: die controleren dat de rem écht werkt.

---

## 5. Geautomatiseerd nagekeken

33 controles, alle geslaagd.

**In een echte browser** (Chromium, `index.html` geladen met een nagebootste
Drive-laag, 24 controles): selectiemodus aan en uit, vinkjes verschijnen,
aanvinken en uitvinken, teller en knoptekst, geen detailmodal in selectiemodus,
"Alles in beeld" en "Wissen", een gegroepeerde reeks die al haar delen meeneemt,
een échte verwijderactie van 2 titels met controle op wat er in Drive
overbleef en dat de backup vooraf gemaakt is, het overtypen dat bij 33 titels
gevraagd wordt, en dat annuleren daar niets verwijdert. Plus: nul
JavaScript-fouten in de console.

**In `drive.js`** (9 controles): meerdere titels in precies één lees- en één
schrijfactie, een lege lijst die niets doet, een onbekend id dat niet schrijft,
en de backup — inclusief de naamgeving die hem buiten het wekelijkse schema
houdt, en een lege collectie die geen backup oplevert.

Daarnaast: syntaxcontrole op alle JS, elk inline script, en de HTML-tagbalans.

---

## 6. Commit-bericht

**Titel:**

```
FASE 27: meerdere titels tegelijk kunnen verwijderen (sw v26)
```

**Beschrijving:**

```
Verwijderen kon alleen per titel: het kruisje op een poster en "Volledige
titel verwijderen" in de detailmodal. De reeksmodal had geen verwijderoptie
en er bestond nergens meervoudige selectie, dus 200 per ongeluk geimporteerde
titels betekende 200 keer klikken en bevestigen.

Nieuw:
- Selectiemodus via de knop "Selecteren": vinkjes op kaarten en rijen in alle
  drie de lijstweergaven, met een balk onderaan (aantal, alles in beeld,
  wissen, verwijderen, klaar). Escape sluit de modus. In selectiemodus opent
  een klik geen detailmodal en verdwijnen het kruisje en de snelblik.
- Een gegroepeerde reekskaart telt als al haar delen; de selectie bestaat
  intern altijd uit titel-id's.
- "Alle N delen van deze reeks verwijderen" in de reeksmodal, via dezelfde
  bevestiging en beveiligingen.
- deleteMoviesInDrive(ids) in drive.js: alles in een lees- en een
  schrijfactie in plaats van een lus over deleteMovieInDrive.
  deleteMovieInDrive roept die nu aan, zodat er een stuk logica is.
- driveBackupNow(reden): backup los van het wekelijkse schema, met datum en
  tijd in de naam zodat dat schema niet verstoord raakt.

Beveiligingen bij het verwijderen, in volgorde:
1. De bevestiging noemt het aantal en de eerste vijf titels bij naam.
2. Vanaf 25 titels moet het aantal overgetypt worden.
3. Backup naar Drive vlak ervoor; mislukt die, dan gebeurt er niets.
4. Wegschrijven per blok van 25 met voortgang, zodat een onderbreking
   zichtbaar is en de rest intact blijft.

33 geautomatiseerde controles geslaagd, waarvan 24 in een echte browser tegen
index.html met een nagebootste Drive-laag.
Details en testchecklist: FASE-27-selectie-en-verwijderen.md
```

---

## 7. Wat hierna komt

**FASE 28 — gsm en snelheid:** `srcset` op de posters, snelblik overslaan op
touch, ambient-achtergrond ook op touch, "Toon meer" zonder de hele lijst te
herbouwen, sticky balk inkorten op smalle schermen, laadtoestanden.

Daarna 29 (bediening en vertrouwen), 30 (veiligheid en opruimen), 31
(datamodel: jaar- en regisseurfilter, animation als eigenschap) en 32
(consistentie en toegankelijkheid).
