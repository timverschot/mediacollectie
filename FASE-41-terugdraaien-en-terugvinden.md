# FASE 41 — Terugdraaien en terugvinden (blok B, deel 1)

**Datum:** 2 augustus 2026 · **Service worker:** `v41` → **`v42`**
**Volgt op:** de doorlichting van 2 augustus, §4 — *bediening*.

---

## ⬆ UPLOADCHECKLIST

- [ ] `index.html`
- [ ] `beheer.html`
- [ ] `assets/drive.js`
- [ ] `assets/app.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v42'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek op `wishlist-toggle` (index.html),
> `meldMetOngedaan` (app.js), `mediacollectie_filters` (app.js),
> `driveHerstelCoversOfMovie` (drive.js), `planTokenVernieuwing` (drive.js) en
> `#instellingen` (beheer.html).

---

## 1. Ongedaan maken

De terugdraaikant bestond al: mislukte een opslag, dan zette de app je
wijziging netjes terug. Alleen was er geen knop. Een fout van de server was dus
te herstellen, en een verkeerde klik van jou niet.

Nu meldt elke handeling die iets weghaalt of omzet wat er gebeurde, met
**Ongedaan maken** ernaast. Negen seconden lang. Werkt voor:

- **een titel verwijderen** — komt terug mét zijn hoesfoto's, want die worden
  sinds FASE 39 bewaard in plaats van gewist;
- **een exemplaar verwijderen** — idem;
- **een bewerking opslaan** — alles wat je in het bewerkpaneel wijzigde gaat in
  één keer terug: formaat, status, opmerking, uitvoering, reeks, eigen titel,
  de verzamelaarsvelden en de toevoegdatum.

De waarschuwing bij verwijderen zei *"Dit kan niet ongedaan gemaakt worden."*
Dat klopt niet meer, dus die zin is weg.

**Eén ding dat hier niet in zit:** hoesfoto's die je in dezelfde bewerking
uploadde. Die zijn op het moment van opslaan al naar Drive gegaan; het
terugdraaien raakt ze niet aan.

**En de massaverwijdering ook niet.** Daar wordt vooraf een echte backup naar
Drive geschreven en dat wordt ook zo gemeld — die weg terug is sterker dan een
knop van negen seconden.

Terzijde: de melding "✓ Opgeslagen" overschreef de terugdraaiknop meteen. De
knop verschijnt daarom pas nádat het wegschrijven gelukt is. Mislukt het, dan
krijg je de foutmelding en geen knop — er valt dan ook niets terug te draaien.

---

## 2. De verlanglijst zichtbaar

Uit de doorlichting: de verlanglijst had geen enkele ingang in de kop. Hij zat
drie klikken diep in een dichtgeklapt paneel, en wat je erop zette verdween
meteen uit beeld — de collectie toont standaard alleen wat je bezit. Dat je hem
zelf niet terugvond was dus geen vergissing van jou.

Er staat nu **♡ Verlanglijst** in de balk, met hoeveel titels erop staan. Eén
klik en je ziet ze; nog een klik en je bent terug. Het is exact hetzelfde
filter als de chip in het paneel, dus die twee bewegen mee.

Die knop en **Filters ▾** staan bewust búiten de horizontaal schuifbare rij.
Op een gsm stond *Filters* helemaal achteraan in die rij, zonder dat iets liet
zien dat er nog wat achter zat.

---

## 3. Filters overleven een paginawissel

Ging je even naar Statistieken en terug, dan stond alles weer op nul — precies
bij het soort werk waarbij je hetzelfde filter tien keer nodig hebt.

Filters, letterfilter, sortering, weergave en *Reeksen groeperen* worden nu
onthouden. Ook na het sluiten van je browser.

Om te voorkomen dat je je een week later afvraagt waar je films gebleven zijn,
zegt de app het als er filters teruggezet zijn — met een knop **Wissen** erin.
En de knop *Filters* toont, zoals altijd al, tussen haakjes hoeveel er aanstaan.

---

## 4. Twee dode links

- **Vanaf de pagina Ontbreekt** klikte je op een titel en kwam je op de
  collectie terecht zonder te weten waar hij stond. `index.html#<id>` opent nu
  meteen het detailscherm van die titel. Stond er nog een filter aan waardoor
  hij niet zichtbaar was, dan wordt dat eerst gewist — anders opent er een
  scherm van iets dat er volgens het raster niet is. Het anker wordt daarna
  opgeruimd, zodat herladen niet ongevraagd hetzelfde scherm opent.
- **`beheer.html#instellingen`**, waar de collectiepagina naar verwijst als je
  TMDb-sleutel ontbreekt, bestond niet: je kwam op een pagina die niets deed
  terwijl je net te horen kreeg dat je daar moest zijn. Het instellingenscherm
  gaat nu meteen open.

---

## 5. De aanmelding onderbreekt je niet meer

*Dit is punt 6 van je oude lijst — het langst openstaande punt.*

Een Google-token leeft precies één uur. Dat valt niet te verlengen; wie anders
beweert, verkoopt je iets. Maar het kan wél stil vernieuwd worden vóórdat het
verloopt.

Tot nu toe gebeurde dat pas op het moment dat je iets opsloeg en het token al
bijna om was. Lukte die stille vernieuwing dan niet, dan sloeg de inlogpoort
dicht — midden in je werk.

Nu werkt de app vooruit:

- **Vijf minuten vóór het verloopt** wordt het token stil vernieuwd, op een
  rustig moment in plaats van tijdens een bewerking.
- **Alleen als je actief bent.** Elke klik, toetsaanslag of scroll schuift de
  teller vooruit, precies zoals je vroeg. Ben je een kwartier weg, dan gebeurt
  er niets — er is geen reden om een sessie levend te houden voor een tabblad
  waar niemand naar kijkt.
- **Kom je terug** naar een tabblad waar het token bijna om is, dan wordt het
  meteen vernieuwd in plaats van bij je eerstvolgende bewerking.
- **Mislukt een vooruitziende poging**, dan gebeurt er níets zichtbaars. Je
  scherm blijft staan. Pas wanneer een échte schrijfactie strandt komt de poort
  terug — zoals het hoort.

Wat dit níet oplost: laat je het tabblad een nacht openstaan en kom je 's
ochtends terug, dan is het token verlopen en moet je één keer opnieuw inloggen.
Dat is een grens van Google, niet van deze app.

---

## 6. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Een titel openen → **Volledige titel verwijderen** | Melding met **Ongedaan maken** |
| 3 | Daarop klikken | De titel staat er weer, met zijn hoesfoto |
| 4 | Een titel met twee exemplaren → één **verwijderen** → Ongedaan maken | Beide exemplaren terug |
| 5 | Een titel bewerken (opmerking + prijs) → Opslaan → **Ongedaan maken** | Alles terug zoals het was |
| 6 | Bovenaan: **♡ Verlanglijst** | Toont het aantal; klikken toont alleen je verlanglijst |
| 7 | Nog eens klikken | Terug naar je collectie |
| 8 | Een genrefilter aanzetten → naar **Statistieken** → terug naar **Collectie** | Het filter staat er nog, mét een melding erover |
| 9 | Op **Wissen** in die melding klikken | Alles weer zichtbaar |
| 10 | Sorteren op Titel → pagina verlaten en terugkomen | De sortering staat er nog |
| 11 | Naar **Ontbreekt**, op een poster van een titel klikken | De collectie opent mét het detailscherm van die titel |
| 12 | Op een gsm: kijk naar de balk bovenaan | **♡ Verlanglijst** en **Filters ▾** staan er, zonder te moeten schuiven |
| 13 | Blijf een uur werken zonder pauze | Geen inlogscherm tussendoor |

Test 3, 5 en 13 zijn de belangrijkste.

---

## 7. Geautomatiseerd nagekeken

**42 nieuwe controles, alle geslaagd.** Onder meer: een verwijderde titel die
terugkomt inclusief het herstellen van zijn hoesfoto's én het opnieuw
wegschrijven naar Drive; een verwijderd exemplaar dat terugkomt; een bewerking
die in één keer terug op zijn oorspronkelijke waarden staat; de
verlanglijstknop met de juiste telling die het statusfilter meebeweegt; filters
die een volledige herlaadbeurt overleven inclusief chip-opmaak, sortering en
groeperen, plus de melding met werkende wisknop; `index.html#<id>` dat het juiste
detailscherm opent en het anker daarna opruimt; `beheer.html#instellingen` dat
opengaat mét de controle dat het zónder anker dicht blijft; en de
activiteitsteller die een tik vooruitschuift, na een kwartier stilte niet meer
als actief geldt, en bij terugkomen op een bijna verlopen token meteen
vernieuwt zónder de inlogpoort te tonen.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24 + 16), 33 (37 + 16), 34 (16), 35 (41), 36 (31),
37 (25), 38 (20), 39 (64), 40 (76). Plus een nieuwe Tailwind-build met
dekkingscontrole.

**Gemeten op een gsm-profiel** (390×844, 3× dichtheid, processor 4× vertraagd,
680 titels): opstarttijd, DOM-omvang, geheugen en filterklik onveranderd.

---

## 8. Commit-bericht

**Titel:**

```
FASE 41: ongedaan maken, verlanglijst in de balk, filters onthouden, aanmelding vooruit vernieuwen (sw v42)
```

**Beschrijving:**

```
Blok B deel 1 uit de doorlichting van 2 augustus.

- Ongedaan maken. De terugdraaikant bestond al in backgroundSave, er was alleen
  geen knop: een fout van de server was herstelbaar, een verkeerde klik van jou
  niet. Nu een melding met "Ongedaan maken" na het verwijderen van een titel
  (inclusief herstel van de hoesfoto's, die sinds FASE 39 bewaard blijven), na
  het verwijderen van een exemplaar, en na het opslaan van een bewerking. De
  knop verschijnt pas na een geslaagde opslag -- anders overschreef de melding
  "Opgeslagen" hem meteen. De waarschuwing "kan niet ongedaan gemaakt worden"
  klopt niet meer en is weg.
- De verlanglijst had geen enkele ingang in de kop en zat drie klikken diep in
  een dichtgeklapt paneel. Nu een knop met telling in de balk, die hetzelfde
  filter bedient als de chip. Die knop en "Filters" staan buiten de horizontaal
  schuifbare rij, waar Filters op gsm helemaal achteraan stond.
- Filters, letterfilter, sortering, weergave en groeperen worden onthouden en
  overleven een paginawissel. Bij het terugzetten volgt een melding met een
  wisknop, zodat je nooit voor raadsels staat.
- index.html#<id> vanaf de pagina Ontbreekt opent nu het detailscherm van die
  titel, wist eerst een filter dat hem zou verbergen, en ruimt het anker op.
  Ook een hashchange op dezelfde pagina wordt opgepikt. beheer.html#instellingen
  bestond niet als anker; het instellingenscherm opent nu.
- Punt 6 van de oude lijst: de aanmelding onderbreekt niet meer. Een
  Google-token leeft een uur en dat valt niet te verlengen, maar wel stil te
  vernieuwen. Dat gebeurt nu vijf minuten voor het verlopen, alleen zolang je
  actief bent (elke klik, toets of scroll schuift de teller vooruit), en meteen
  bij het terugkeren naar het tabblad. Mislukt een vooruitziende poging, dan
  gebeurt er niets zichtbaars; pas een echte schrijfactie brengt de poort terug.

42 nieuwe geautomatiseerde controles geslaagd. Alle eerdere suites blijven
geslaagd. Details en testchecklist: FASE-41-terugdraaien-en-terugvinden.md
```

---

## 9. Wat er nog van blok B over is

Voor een volgende fase:

- De pagina **Ontbreekt** bruikbaar maken: de ontbrekende delen zijn nu dode
  chips. Aanvinken, op de verlanglijst zetten, afdrukken.
- **Dubbele invoerroutes uit Beheer.** De tabs "Eén titel" en "Bulk" laden exact
  hetzelfde formulier als de modal op de collectiepagina, met dezelfde
  element-id's. Beheer zou puur backup, instellingen en gevarenzone moeten zijn.
- **Eén naam per actie.** Er zijn vijf verschillende namen voor "op de
  verlanglijst zetten", en "Wissen" staat naast "Verwijderen" terwijl dat
  hetzelfde betekent.
- **Mobiel:** de verwijderknop staat permanent zichtbaar op elke poster in een
  tweekoloms raster.

Daarna blok C — snelheid en toegankelijkheid.

Nog open uit FASE 35: **hoesfoto's per seizoen-exemplaar**.
