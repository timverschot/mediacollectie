# FASE 32 — Collectie op orde

**Datum:** 31 juli 2026 · **Service worker:** `v31` → **`v32`**
**Aanleiding:** vier punten uit je lijst — de sorteervolgorde die niet klopte,
en drie dingen die je alleen titel-per-titel kon doen.

> Van je tien punten zijn dit 1, 2, 9 en 10. De rest volgt in FASE 33
> (invoeren: grotere zoekresultaten, IMDb-ID, coverfoto als poster, dubbels
> toch toevoegen) en FASE 34 (de aanmeldingsonderbreking).

---

## 1. Waarom je nieuwe uploads onderaan belandden

`date_added` bewaarde alleen een **datum**, geen tijdstip. Alles wat je op één
dag toevoegt is daardoor precies even "nieuw". Een sortering laat gelijke
waarden staan zoals ze in het bestand staan — en nieuwe titels komen achteraan
in `movies.json`. Je batch van vanmiddag kwam dus **onder** alles wat je die
ochtend al had toegevoegd, in plaats van erboven.

Twee dingen lossen het op:

- Nieuwe titels krijgen vanaf nu een **volledig tijdstip** (`added_at`), tot op
  de seconde. Alles wat je hierna toevoegt staat gegarandeerd in de juiste
  volgorde.
- Bij gelijke tijden valt de sortering terug op de **plek in het bestand**:
  verderop betekent later toegevoegd, dus hoger in de lijst. Daardoor komen ook
  je bestaande titels — die alleen een datum hebben — per dag in de goede
  volgorde te staan, zonder dat er iets aan je gegevens gewijzigd hoeft te
  worden.

De datum blijft wel zwaarder wegen dan de plek in het bestand, dus een titel
van vorig jaar springt niet ineens naar boven.

---

## 2. De selecteerknop kan nu ook bewerken

Tot nu toe kon je met een selectie alleen verwijderen. Zet je een batch per
ongeluk op het verkeerde formaat, dan was elke titel apart openen de enige weg
terug — bij honderd titels een avond werk.

**Selecteren → titels aanvinken → Bewerken.** In dat scherm:

| | |
|---|---|
| **Formaat omzetten** | van *Blu-ray (137)* naar *DVD* |
| **Status** | in bezit / op verlanglijst |
| **Bekeken** | ja / nee |
| **Locatie** | vrij tekstveld |

Alles staat standaard op *niet wijzigen*; je verandert alleen wat je zelf
aanraakt.

**Waarom "van X naar Y" en niet gewoon "zet alles op Y":** een titel kan
meerdere exemplaren hebben — een DVD én een 4K van dezelfde film. Botweg alles
op één formaat zetten zou die twee samenvoegen tot twee identieke exemplaren,
en dat krijg je zonder backup nooit meer uit elkaar. Met "van Blu-ray naar DVD"
blijft je 4K ongemoeid.

Nog drie dingen die het scherm doet:

- De lijst "van" toont **alleen formaten die echt in je selectie zitten**, met
  hoeveel exemplaren erachter. Je kan dus niet kiezen voor iets wat er niet is.
- Er staat een **voorbeeldtelling**: *"Dit wijzigt 137 exemplaren."* Staat alles
  al goed, dan zegt hij dat, en gebeurt er niets.
- Vóór het wegschrijven gaat er altijd een **backup naar Drive**
  (`movies-backup-voor-bewerken-…`), en de bevestigingsvraag noemt het exacte
  aantal titels dat verandert.

> Voor je huidige situatie: **Selecteren → Alles in beeld → Bewerken → van
> Blu-ray naar DVD.** Wil je alleen de laatste batch, filter dan eerst of
> gebruik "Onlangs toegevoegd" en vink handmatig aan.

---

## 3. Ontbrekende reeksdelen samen op "in bezit"

In het reeksblok van een titel kon je ontbrekende delen aanvinken en samen op
de verlanglijst zetten. Delen die je wél hebt, moest je één voor één via het
volledige formulier toevoegen.

Er staat nu een tweede knop naast: **→ In bezit**. Zelfde aanvinken, zelfde
lijst, maar de delen komen meteen als bezit in je collectie te staan — met je
onthouden voorkeursformaat.

---

## 4. Filter op filmreeksen

Er was wel een filter op **TV-reeksen**, maar niets om alleen films te zien die
bij een reeks horen — Bond, Star Wars, Alien. "Reeksen groeperen" is een
weergave, geen filter: dat toont nog steeds al je losse titels ernaast.

Onder **Filters** staat nu een rij **Reeks** met twee chips:

- **In een reeks** — alleen titels die bij een filmreeks horen
- **Losstaand** — alleen titels zonder reeks

Beide aan is hetzelfde als beide uit. "Alle filters wissen" neemt ze mee.

---

## 5. Bestanden om te uploaden

```
index.html
assets/app.js
assets/add-title.js
assets/bulk-import.js
assets/tailwind.css        ← opnieuw gebouwd (nieuwe klassen)
sw.js                      ← VERSION = 'v32'
FASE-32-collectie-op-orde.md   ← nieuw
```

Na het uploaden: **Ctrl+Shift+R**.

---

## 6. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Sorteren op "Onlangs toegevoegd" | Je laatste batch staat bovenaan |
| 3 | Eén titel toevoegen, terug naar de collectie | Die titel staat op plek 1 |
| 4 | Selecteren → een paar titels aanvinken | Knop toont "Bewerken (3)" |
| 5 | Bewerken openen | Titels én exemplaren geteld; "van" toont alleen jouw formaten met aantallen |
| 6 | Formaat kiezen van → naar | De hint noemt het aantal exemplaren dat wijzigt |
| 7 | Toepassen | Vraag met het aantal, daarna "✓ … gewijzigd" en de kaarten kloppen |
| 8 | Beheer → Herstellen bekijken | Er staat een `voor-bewerken`-backup |
| 9 | Bewerken openen en niets kiezen → Toepassen | "Er is niets gekozen om te wijzigen" |
| 10 | Een titel met 4K én DVD selecteren, Blu-ray → DVD | Beide exemplaren blijven ongemoeid |
| 11 | Een reekstitel openen, ontbrekende delen aanvinken → **In bezit** | Ze komen als bezit in je collectie |
| 12 | Filters → **In een reeks** | Alleen reekstitels |
| 13 | **Losstaand** | Alleen titels zonder reeks |
| 14 | Alle filters wissen | Beide chips gaan uit, alles is terug |

Test 10 is de belangrijkste: die controleert dat de massabewerking je
meervoudige exemplaren niet samenvoegt.

---

## 7. Geautomatiseerd nagekeken

**24 nieuwe controles, alle geslaagd.** Onder meer: een batch die op dezelfde
dag is toegevoegd en toch bovenaan hoort te staan, een echt oudere titel die
onderaan blijft, het bewerkscherm dat alleen bestaande formaten aanbiedt met de
juiste aantallen, de voorbeeldtelling, tien titels die daadwerkelijk
weggeschreven worden, een titel met twee formaten die beide behoudt, de drie
standen van het reeksfilter, en het wissen van filters.

De suites van FASE 29 (41), 30 (39), 31 (50) en het filterpaneel (16) zijn
opnieuw gedraaid en blijven volledig geslaagd. Plus syntaxcontrole op alle JS,
de inline scripts en de HTML-tagbalans, en een nieuwe Tailwind-build met
dekkingscontrole.

Eén fout die de test ving: "Alle filters wissen" schakelde het reeksfilter wel
uit, maar liet de chip opgelicht staan.

---

## 8. Commit-bericht

**Titel:**

```
FASE 32: sorteervolgorde, massabewerking, reeksdelen in bezit, reeksfilter (sw v32)
```

**Beschrijving:**

```
Sorteervolgorde:
- date_added bewaarde alleen een datum. Alles van dezelfde dag was daardoor
  gelijk, en een stabiele sortering hield de volgorde van movies.json aan --
  waar nieuwe titels achteraan bijkomen. Een batch kwam dus onder alles wat er
  die dag al stond.
- Nieuwe titels krijgen nu added_at met een volledig tijdstip. Bij gelijke
  tijden valt de sortering terug op de plek in het bestand (verderop = later
  toegevoegd), zodat ook bestaande titels zonder tijdstip per dag goed staan.
  De datum blijft zwaarder wegen dan de plek in het bestand.

Massabewerking:
- De selectiemodus kon alleen verwijderen. Nu een Bewerken-knop met formaat
  omzetten, status (in bezit / verlanglijst), bekeken-status en locatie.
- Bewust "van formaat X naar Y" in plaats van "zet alles op Y": een titel kan
  meerdere exemplaren hebben (DVD en 4K van dezelfde film) en die zouden anders
  samenvallen tot twee identieke exemplaren.
- De keuzelijst toont alleen formaten die in de selectie voorkomen, met het
  aantal erbij, plus een voorbeeldtelling van wat er gaat wijzigen. Er gaat
  altijd een backup naar Drive vooraf, en de bevestiging noemt het exacte
  aantal titels.

Reeksdelen:
- Ontbrekende delen kon je alleen samen op de verlanglijst zetten. Er is nu
  ook een knop "In bezit", met je onthouden voorkeursformaat.

Reeksfilter:
- Er was een filter op TV-reeksen maar niets voor filmreeksen; "Reeksen
  groeperen" is een weergave, geen filter. Nu twee chips: "In een reeks" en
  "Losstaand", meegenomen in de filterteller en in "Alle filters wissen".

24 nieuwe geautomatiseerde controles geslaagd. De suites van FASE 29 (41),
30 (39), 31 (50) en het filterpaneel (16) blijven geslaagd.
Details en testchecklist: FASE-32-collectie-op-orde.md
```

---

## 9. Wat hierna komt

**FASE 33 — invoeren:** grotere en aanklikbare zoekresultaten met een
voorbeeldweergave (punt 3), een IMDb-ID plakken zodat TMDb hem alsnog vindt
(punt 4), je eigen coverfoto als poster gebruiken (punt 7), en dubbels toch
kunnen toevoegen met de waarschuwing erbij (punt 8).

**FASE 34 — aanmelden:** het token stil vernieuwen terwijl je bezig bent, in
plaats van pas op het moment dat er iets misgaat (punt 6).
