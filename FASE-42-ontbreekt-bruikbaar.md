# FASE 42 — Ontbreekt bruikbaar (blok B, deel 2)

**Datum:** 2 augustus 2026 · **Service worker:** `v42` → **`v43`**

---

## ⬆ UPLOADCHECKLIST

- [ ] `index.html`
- [ ] `ontbreekt.html`
- [ ] `assets/app.js`
- [ ] `assets/add-title.js`
- [ ] `assets/missing.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v43'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek op `data-pick` (missing.js), `pick-bar` en
> `print-list` (ontbreekt.html), en `Selectie leegmaken` (index.html).

---

## 1. De pagina Ontbreekt kon niets

Die pagina zei letterlijk *"Bedoeld om mee te nemen naar de winkel"*, maar er
viel niets aan te vinken, niets op de verlanglijst te zetten en niets af te
drukken. De ontbrekende seizoenen waren dode chips. Je kon hem lezen en verder
niets.

### Aanvinken en in één keer wegzetten

Elk ontbrekend seizoen en elk ontbrekend deel van een filmreeks is nu een knop.
Klik aan wat je zoekt, en onderaan verschijnt een balk met hoeveel je gekozen
hebt en **+ verlanglijst**.

Wat er dan gebeurt hangt af van wat het is, want dat verschilt echt:

- Een **seizoen** hoort bij een serie die je al hebt. Daar komt een exemplaar
  met wens-status bij, precies zoals de knop in het detailscherm doet. Het
  seizoen telt daardoor níet als bezit en voegt geen formaat toe aan je filters.
- Een **deel van een filmreeks** heb je nog helemaal niet. Dat wordt een nieuw
  record, opgebouwd met dezelfde fabriek als overal elders, en toegevoegd
  zonder ooit een bestaande titel te overschrijven.

Alle seizoenen van dezelfde serie gaan in één schrijfactie, niet één per
seizoen. Kies je iets dat er al op staat, dan gebeurt er niets en zegt de
melding hoeveel er overgeslagen is — geen stille dubbels.

Delen die al op je verlanglijst staan zijn niet aanklikbaar; die hoeven niet
nog eens.

### Afdrukken

Knop **Afdrukken** rechtsboven. Wat er uit de printer komt is een
boodschappenlijst: titels met een vakje ervoor, gegroepeerd per serie en per
reeks, met de datum erbij. Geen posters, geen filters, geen donkere
achtergrond die je inktpatroon leegtrekt. Werkt net zo goed als "bewaren als
PDF" op je telefoon.

---

## 2. Eén naam voor één actie

Er waren **vijf** verschillende namen voor hetzelfde: *+ wens*, *op
verlanglijst*, *+ verlanglijst*, *Op verlanglijst*. Overal staat nu
**+ verlanglijst**. (Het statusveld in een formulier blijft *Verlanglijst* —
dat is een toestand, geen knop.)

En in de selectiebalk stond **Wissen** naast **Verwijderen**, terwijl dat in
het Nederlands hetzelfde betekent — bij een knop die je collectie kan legen is
dat geen woordspelletje. *Wissen* heet nu **Selectie leegmaken**, met een
tooltip die zegt dat er niets verwijderd wordt.

---

## 3. De verwijderknop weg van je posters

Op een aanraakscherm stond het rode kruisje **permanent zichtbaar op élke
poster**. In een tweekoloms raster op een gsm is dat een dozijn verwijderknoppen
tegelijk, en één misgetikte veeg opende de verwijderdialoog.

Verwijderen hoort iets te zijn dat je opzoekt, niet iets dat je per ongeluk
raakt. De knop is op aanraakschermen weg; verwijderen gaat via het detailscherm
(waar *Volledige titel verwijderen* al stond) of via de selectiemodus, die daar
precies voor bedoeld is. Op een muisscherm verandert er niets: daar verscheen
hij al alleen bij hover.

---

## 4. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | **Ontbreekt** openen, F12 → Console | Geen fouten |
| 2 | Op een ontbrekend seizoennummer klikken | Het wordt goud; onderaan verschijnt een balk |
| 3 | Nog een paar aanklikken → **+ verlanglijst** | "✓ N op je verlanglijst" |
| 4 | Naar **Collectie** → ♡ Verlanglijst | Die serie staat erbij |
| 5 | Die serie openen, kijk bij de seizoenen | De gekozen seizoenen staan er als **wens**, niet als bezit |
| 6 | Filters → Formaat | Die wensen voegen geen formaat toe |
| 7 | Terug naar Ontbreekt, hetzelfde seizoen nog eens kiezen | "overgeslagen (stond er al)", geen dubbel |
| 8 | **Filmreeksen nakijken** → een ontbrekend deel aanklikken → + verlanglijst | Nieuwe titel op je verlanglijst |
| 9 | **Afdrukken** | Voorbeeldvenster met een zwart-op-wit lijst met vakjes |
| 10 | Een serie openen in de collectie, bij een ontbrekend seizoen | De knop heet **+ verlanglijst** |
| 11 | Op een gsm: kijk naar de posters in het raster | Géén rood kruisje meer |
| 12 | Een titel openen op je gsm | **Volledige titel verwijderen** staat er gewoon |

Test 5, 6 en 7 zijn de belangrijkste: een wens mag nooit als bezit tellen en
nooit stapelen.

---

## 5. Geautomatiseerd nagekeken

**30 nieuwe controles, alle geslaagd.** Onder meer: elk ontbrekend seizoen als
knop met de juiste sleutel; de selectiebalk die verschijnt en verdwijnt; twee
seizoenen die in één schrijfactie als wens weggezet worden, zónder dat het
seizoen als bezit gaat tellen of een formaat krijgt; een seizoen dat al gewenst
was en dus overgeslagen wordt zonder iets te schrijven; de afdruklijst die de
serie mét zijn ontbrekende seizoennummers en de eigen reeks bevat en op het
scherm verborgen blijft; de knoplabels die overal gelijk zijn; en op een
gsm-profiel de verwijderknop die geen tikken meer opvangt terwijl verwijderen
via het detailscherm gewoon blijft werken.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24 + 16), 33 (37 + 16), 34 (16), 35 (41), 36 (31),
37 (25), 38 (20), 39 (64), 40 (76), 41 (42). Plus een Tailwind-build met
dekkingscontrole.

---

## 6. Commit-bericht

**Titel:**

```
FASE 42: Ontbreekt met acties en afdrukken, één naam per actie, verwijderknop van de posters (sw v43)
```

**Beschrijving:**

```
Blok B deel 2 uit de doorlichting van 2 augustus.

- De pagina Ontbreekt zei "bedoeld om mee te nemen naar de winkel" maar kon
  niets: dode chips, geen acties, niet af te drukken. Ontbrekende seizoenen en
  ontbrekende reeksdelen zijn nu aanklikbaar, met een selectiebalk en één knop
  "+ verlanglijst". Een seizoen krijgt een exemplaar met wens-status bij de
  serie die je al hebt (telt niet als bezit, voegt geen formaat toe); een
  reeksdeel wordt een nieuw record via nieuweCollectieTitel +
  insertMovieIfAbsentInDrive, dus zonder ooit iets te overschrijven. Seizoenen
  van dezelfde serie gaan in één schrijfactie. Wat er al op staat wordt
  overgeslagen en gemeld in plaats van gedupliceerd.
- Knop Afdrukken met een eigen printstijl: een zwart-op-wit boodschappenlijst
  met aanvinkvakjes, gegroepeerd per serie en reeks, met datum. Posters,
  filters en navigatie gaan er niet in mee.
- Vijf namen voor dezelfde actie ("+ wens", "op verlanglijst",
  "+ verlanglijst", "Op verlanglijst") zijn overal "+ verlanglijst" geworden.
  Het statusveld in formulieren blijft "Verlanglijst": dat is een toestand.
- In de selectiebalk stond "Wissen" naast "Verwijderen", wat in het Nederlands
  hetzelfde betekent. Nu "Selectie leegmaken", met uitleg in de tooltip.
- De verwijderknop stond op aanraakschermen permanent op elke poster; in een
  tweekoloms raster is dat een dozijn rode kruisjes en opent één misgetikte
  veeg de verwijderdialoog. Weg daar; verwijderen gaat via het detailscherm of
  de selectiemodus. Op een muisscherm verandert er niets.

30 nieuwe geautomatiseerde controles geslaagd. Alle eerdere suites blijven
geslaagd. Details en testchecklist: FASE-42-ontbreekt-bruikbaar.md
```

---

## 7. Wat er nog open staat

**Uit blok B, bewust nog niet gedaan:** de dubbele invoerroutes uit Beheer
schrappen. De tabs *Eén titel* en *Bulk* daar laden exact hetzelfde formulier
als de modal op de collectiepagina, met dezelfde element-id's. Dat opruimen
raakt drie bestanden tegelijk en levert jou niets nieuws op — het maakt de app
alleen makkelijker te onderhouden. Ik doe dat liever samen met het onderhoud uit
§8 van de doorlichting, in één keer, dan er nu een halve fase aan te besteden.

**Hierna: blok C — snelheid en toegankelijkheid.** Dat is het laatste blok:

- de plankweergave vensteren en opruimen (nu 423-485 ms bevriezing, en de 652
  slides blijven de hele sessie in de DOM staan);
- de hoesfoto-cache repareren (na een filterklik zijn ze aantoonbaar kapot);
- universums cachen in plaats van bij élke opening opnieuw ophalen;
- de service worker naar stale-while-revalidate;
- focusbeheer in de modals, Enter op vier dode elementen, contrast van de
  doorschijnende teksten, leesbare foutmeldingen.

Nog open uit FASE 35: **hoesfoto's per seizoen-exemplaar**.
