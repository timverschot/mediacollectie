# FASE 44 — Onderhoud, en de schrijfkant getest

**Datum:** 2 augustus 2026 · **Service worker:** `v44` → **`v45`**
**Volgt op:** de doorlichting van 2 augustus, §8.

---

## ⬆ UPLOADCHECKLIST

- [ ] `beheer.html`
- [ ] `assets/drive.js`
- [ ] `assets/app.js`
- [ ] `assets/admin.js`
- [ ] `assets/add-title.js`
- [ ] `assets/stats.js`
- [ ] `assets/price-app.js`
- [ ] `assets/missing.js`
- [ ] `assets/manual-entry.js`
- [ ] `assets/universes-page.js`
- [ ] `assets/bulk-import.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v45'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek op `function escHtml` (moet **alleen** in
> `drive.js` staan), `addTitlePreferredFormat` (nu ook in `drive.js`),
> `statsFormatLabel` (stats.js) en `tab-btn` (mag **nergens** meer staan).

Veel bestanden, maar bijna allemaal met één regel gewijzigd: ze verwijzen nu
naar één gedeelde functie in plaats van hun eigen kopie.

---

## 1. Waarom deze fase

Dit is de enige fase die je zelf niet ziet. Ze bestaat omdat §8 van de
doorlichting de *oorzaak* beschreef van de fouten die in FASE 39 boven kwamen:
hetzelfde ding op meerdere plaatsen, dat langzaam uit elkaar groeit.

Ik heb bewust de dingen gedaan die een foutenbron wegnemen, en één ding
overgeslagen. Dat staat in §6.

---

## 2. Formaatlabels op vier plaatsen → op één

`MEDIA_FORMATS` in `drive.js` kent zes formaten. Daarnaast stonden er drie
eigen lijstjes mét telkens drie van die zes:

- de statistiekenpagina had een eigen label- én kleurenlijst;
- het toevoegformulier bood bij seizoenen alleen 4K, Blu-ray en DVD;
- de seizoenweergave in de detailmodal had er ook één (die was al weg in
  FASE 39).

Gevolg: **een seizoen op Laserdisc toonde de kale waarde `laserdisc`** en kreeg
in de statistieken dezelfde kleur als 4K. Alles leidt nu af uit die ene lijst.
En passant: bij "per type" ontbraken de **Specials** uit FASE 36; die staan er
nu bij.

---

## 3. Negen ontsnappingsfuncties → één

Er stonden er negen, verspreid over acht bestanden, met **twee verschillende
gedragingen**: de helft maakte van een lege waarde de tekst `null` of
`undefined` op je scherm, de andere helft een lege tekst.

Er is nu één echte (`escHtml` in `drive.js`, dat op elke pagina als eerste
laadt); de andere acht zijn een verwijzing daarnaartoe. De namen blijven
bestaan omdat ze op honderden plaatsen gebruikt worden, maar ze doen nu
allemaal hetzelfde.

Klein maar belangrijk detail: ze zijn functies gebleven en geen `const`. Een
`const` wordt niet vooruit gehesen, en precies die val zorgde in FASE 29 voor
een blanco pagina.

---

## 4. Beheer is beheer geworden

Er waren vier ingangen om iets toe te voegen, waarvan er twee identiek waren:
het tabblad *Eén titel* op Beheer laadde exact hetzelfde formulier als de modal
op de collectiepagina, met dezelfde element-id's. Twee schermen die hetzelfde
deden, en die dus allebei bijgewerkt moesten worden bij élke wijziging aan het
toevoegen.

Dat tabblad is weg. Op Beheer staat nu een regel die zegt waar je wél titels
toevoegt, met een knop ernaartoe.

**Wat er blijft:** backup en herstellen, het opruimen van hoesfoto's, verversen
via TMDb, de import van oude bestanden, de gevarenzone, en de **lijst-import**
(plak een lijst titels, één per regel). Dat laatste was in mijn doorlichting
onterecht als dubbel aangemerkt — het is een eigen gereedschap dat nergens
anders bestaat. Het staat nu gewoon zichtbaar op de pagina in plaats van
achter een tabblad.

Eén functie is meeverhuisd: het onthouden voorkeursformaat stond in
`add-title.js` maar gaat over de formaatlijst, niet over dat formulier. Die
staat nu bij de formaten in `drive.js`, zodat de lijst-import hem heeft zonder
het hele toevoegformulier te moeten laden. Beheer laadt daardoor twee
JS-bestanden minder.

---

## 5. De schrijfkant eindelijk getest

Uit de doorlichting: *"De tests raken alleen de leeskant. Er wordt nergens
gecontroleerd wát er in `movies.json` belandt, en de terugdraai bij een
mislukte opslag — de kern van de hele opzet — is nooit uitgevoerd in een
test."*

Dat was de scherpste opmerking uit dat hele verslag, en ze klopte. Er zijn nu
controles die:

- **het werkelijke bestand nakijken** dat na een bewerking naar Drive gaat: dat
  het `movies.json` heet, dat de hele collectie meegaat en niet alleen de
  gewijzigde titel, dat de wijziging erin staat, dat de prijs er als getal in
  staat, dat de ándere titels ongemoeid zijn, en dat elke titel nog een id en
  een titel heeft;
- **de terugdraai uitvoeren**: een opslag die mislukt geeft een melding mét de
  reden, zet je wijziging terug, en biedt géén knop om iets terug te draaien —
  er valt dan immers niets terug te draaien;
- **een mislukte verwijdering** nakijken: de titel blijft staan en zijn
  hoesfoto's worden niet aangeraakt.

---

## 6. Wat ik bewust níet gedaan heb

`app.js` is 6.000 regels, en de doorlichting stelde voor er vijf blokken uit te
halen. Ik heb dat níet gedaan, en dat is een keuze en geen vergetelheid.

Die blokken zien er los uit, maar ze delen allemaal dezelfde afgeschermde
toestand: de collectie, de filterstand, de schermelementen, de opslagfunctie.
Ze eruit halen betekent die toestand openbreken of overal doorgeven — een
ingreep die dagen kost, elke bestaande test raakt, en waarvan jij niets merkt
behalve als er iets stukgaat.

De dingen hierboven nemen wél een echte foutenbron weg. Het opsplitsen van een
bestand doet dat niet; het maakt een groot bestand alleen kleiner. Als je er
ooit toch aan wil beginnen, doen we dat als eigen project met de tests als
vangnet — niet als bijzaak in een onderhoudsfase.

---

## 7. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Alle zes pagina's openen, F12 → Console | Geen fouten |
| 2 | **Beheer** | Geen zoekveld of toevoegformulier meer; wel een regel "Titels toevoegen…" met knop |
| 3 | Beheer → de lijst-import | Staat er gewoon, zonder tabblad |
| 4 | Een lijstje plakken en toevoegen | Werkt zoals voorheen, met je onthouden formaat |
| 5 | Beheer → backups, hoesfoto's opruimen, verversen, gevarenzone | Allemaal nog aanwezig |
| 6 | Collectie → **+ Titel toevoegen** | Werkt onveranderd, inclusief **Handmatig** |
| 7 | Een serie met een seizoen op Laserdisc openen | "Laserdisc", niet `laserdisc` |
| 8 | Bij een ontbrekend seizoen: de formaatkeuze openen | Alle zes formaten |
| 9 | **Statistieken** → per formaat en "wat je betaalde" | Laserdisc netjes benoemd, eigen kleur |
| 10 | Statistieken → per type | **Specials** staat erbij |
| 11 | Een titel met een apostrof of `&` in de naam | Overal correct weergegeven, nergens `null` |

Test 2 t/m 6 zijn de belangrijkste: dat er niets verdwenen is wat je gebruikte.

---

## 8. Geautomatiseerd nagekeken

**38 nieuwe controles, alle geslaagd** — waarvan negen over de schrijfkant, die
tot nu toe helemaal onbeproefd was.

Twee bestaande controles moesten bijgewerkt worden: FASE 36 en 38 gingen ervan
uit dat het toevoegformulier óók op Beheer stond. Ze controleren nu dat het daar
juist wég is en op de collectiepagina compleet blijft.

Alle suites opnieuw gedraaid en geslaagd: FASE 29 (41), 30 (39), 31 (50),
32 (24 + 16), 33 (37 + 16), 34 (16), 35 (41), 36 (31), 37 (25), 38 (20),
39 (64), 40 (76), 41 (42), 42 (30), 43 (37), 44 (38). Samen **582 controles**.
Plus een Tailwind-build met dekkingscontrole.

---

## 9. Commit-bericht

**Titel:**

```
FASE 44: één formaatlijst, één escape-functie, Beheer opgeruimd, schrijfkant getest (sw v45)
```

**Beschrijving:**

```
Onderhoud uit §8 van de doorlichting: hetzelfde ding op meerdere plaatsen, dat
langzaam uit elkaar groeit -- de oorzaak van de fouten die in FASE 39 boven
kwamen.

- Formaatlabels stonden op drie plaatsen naast MEDIA_FORMATS, telkens met drie
  van de zes formaten. Een seizoen op Laserdisc toonde de kale waarde en kreeg
  in de statistieken de kleur van 4K. Alles leidt nu af uit die ene lijst. Bij
  "per type" ontbraken de Specials uit FASE 36; toegevoegd.
- Negen escape-functies over acht bestanden, met twee gedragingen: de helft
  toonde "null" of "undefined" bij een lege waarde. Nu één escHtml() in
  drive.js; de rest verwijst ernaar. Bewust functiedeclaraties gebleven en geen
  const -- een const wordt niet gehesen, en die val gaf in FASE 29 een blanco
  pagina.
- Het tabblad "Eén titel" op Beheer laadde exact hetzelfde formulier als de
  modal op de collectiepagina, met dezelfde element-id's. Weg; Beheer verwijst
  nu naar de collectie. Backup, herstellen, hoesfoto's opruimen, verversen,
  import en gevarenzone blijven, net als de lijst-import (die in de doorlichting
  onterecht als dubbel was aangemerkt -- dat is een eigen gereedschap).
  addTitlePreferredFormat is meeverhuisd naar drive.js, waar de formaten staan,
  zodat de lijst-import hem heeft zonder het hele toevoegformulier. Beheer laadt
  twee JS-bestanden minder.
- De schrijfkant was nooit getest. Nu wordt nagekeken wat er werkelijk in
  movies.json belandt (naam, volledige collectie, gewijzigde velden, andere
  titels ongemoeid, elke titel met id en titel) en wordt de terugdraai bij een
  mislukte opslag en een mislukte verwijdering echt uitgevoerd.

app.js opsplitsen is bewust niet gedaan: die blokken delen dezelfde afgeschermde
toestand, dus dat is een eigen project en geen bijzaak -- en het neemt geen
foutenbron weg.

38 nieuwe controles geslaagd, waarvan negen over de schrijfkant. Twee bestaande
controles bijgewerkt (ze gingen uit van het formulier op Beheer). Alle suites
samen: 582 controles, alle geslaagd.
Details en testchecklist: FASE-44-onderhoud.md
```

---

## 10. Hierna

De vier blokken uit de doorlichting van 2 augustus zijn af, en het onderhoud
ook. Wat er nog ligt:

- **`prijzen.html` tekent alles in één keer**: 8639 DOM-elementen. Dezelfde
  aanpak als de plank in FASE 43.
- **Hoesfoto's per seizoen-exemplaar** (uit FASE 35): de velden staan in het
  datamodel en worden sinds FASE 39 bewaard, maar het uploadscherm ontbreekt.
- **`app.js` opsplitsen**, als je dat ooit wil (zie §6).

Mijn voorstel: een nieuwe doorlichting. De vorige leverde negen plekken met
stil dataverlies op, en er is sindsdien een flinke hoeveelheid bijgekomen —
verzamelaarsvelden, ongedaan maken, een actieve pagina Ontbreekt, een
gevensterde plank. Dat is precies het moment om opnieuw met verse ogen te
kijken in plaats van door te bouwen.
