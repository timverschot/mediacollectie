# FASE 39 — Stoppen met bloeden (blok A)

**Datum:** 2 augustus 2026 · **Service worker:** `v39` → **`v40`**
**Volgt op:** de doorlichting van 2 augustus, §2 en §3.

---

## ⬆ UPLOADCHECKLIST

- [ ] `index.html`
- [ ] `beheer.html`
- [ ] `assets/drive.js`
- [ ] `assets/app.js`
- [ ] `assets/admin.js`
- [ ] `assets/add-title.js`
- [ ] `assets/universes-page.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v40'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek in je repo op `mergeSeasons` (drive.js,
> admin.js), `insertMovieIfAbsentInDrive` (drive.js, add-title.js,
> universes-page.js), `covers-clean-btn` (beheer.html) en `#toast.hidden`
> (index.html). Ontbreekt er één, dan is dat bestand niet mee geüpload.

Deze acht bestanden hangen aan elkaar: `app.js`, `admin.js`, `add-title.js` en
`universes-page.js` roepen alle vier nieuwe functies uit `drive.js` aan. Laad je
`drive.js` niet mee, dan breekt de rest.

---

## 1. Waar dit over gaat

Negen plekken waar een gewone handeling gegevens weggooide zonder dat je het
zag. Ze zijn allemaal klein op zich — samen zijn ze de reden dat ik je aanraadde
hiermee te beginnen: van alles in dit verslag is dit het enige dat niet meer te
repareren valt zodra het gebeurd is.

Elke reparatie hieronder heeft een test die aantoonbaar faalt op de oude code.
Dat heb ik nagekeken door de oude regels tijdelijk terug te zetten: tien
controles sloegen dan om naar rood. Zonder die stap weet je niet of een test
iets meet of alleen maar meeknikt.

---

## 2. Wat er nu níet meer verdwijnt

### 2.1 "Alles verversen" wiste elk seizoen-exemplaar

Eén klik in Beheer nam van elk seizoen van elke serie alleen *in bezit* en
*formaat* over. Alles wat FASE 35 aan seizoenen gaf — tweede exemplaren,
uitvoering, boxset, locatie, opmerking, hoesfoto's — ging weg. Bij álle series
tegelijk, zonder melding. Je merkt dat maanden later, als je een boxset zoekt
en de aantekening er niet meer bij staat.

De regel is nu omgekeerd. TMDb mag alleen de velden aanraken die van TMDb kómen:
naam, aantal afleveringen, seizoenposter, beschrijving, uitzenddatum. Al de rest
is van jou en wordt niet meer bekeken. Kent TMDb een seizoen niet meer terwijl
jij het bezit — dat gebeurt bij een hernummering — dan blijft het gewoon staan.

### 2.2 Een serie opnieuw toevoegen deed hetzelfde

Koop je de 4K-box van een serie waarvan je seizoen 1 op DVD en seizoen 2 als
steelbook hebt, dan verving het toevoegformulier je hele seizoenenlijst door wat
de vinkjes zeiden. En die staan standaard állemaal aan, met één formaat.

Nu komt er per aangevinkt seizoen een exemplaar bíj. Had je dat formaat al, dan
gebeurt er niets — twee keer opslaan levert dus geen dubbels op. Kies je bewust
"een tweede kopie", dan komt hij er wél bij.

### 2.3 Een handmatige special brak bij de eerste bewerking

De keuzelijst content-type kende film, TV-reeks en animatie — maar niet
*special*, terwijl FASE 36 dat wél wegschrijft. Een keuzelijst die een waarde
niet kent wordt leeg, en bij opslaan ging die leegte terug het record in. Eén
opmerking wijzigen was genoeg om de titel uit élk type-filter te laten vallen,
inclusief de Specials-chip. De hele functie van FASE 36 was daarmee in de
praktijk stuk.

*Special / anders* staat er nu bij. En als de app ooit een type tegenkomt dat ze
niet kent, zet ze dat er eerst bij in plaats van het te wissen.

### 2.4 Hoesfoto's zaten in géén enkele backup

Dit is het belangrijkste punt van deze fase, en het enige dat echt werk was.

Een backup bevat `movies.json`. Hoesfoto's zijn losse bestanden in Drive en
gingen nergens in mee. Verwijderde je één titel, dan werden zijn foto's
definitief gewist — zonder backup vooraf. Terwijl dat de enige onvervangbare
gegevens in dit hele systeem zijn: TMDb-data komt altijd terug, de foto van jóuw
doosje niet.

**Wat er nu gebeurt:** een hoesfoto wordt bij het verwijderen niet gewist maar
hernoemd naar `wees-…`. Het bestand blijft bestaan onder hetzelfde nummer, en
omdat `movies.json` alleen die nummers bewaart, komt de foto vanzelf weer
tevoorschijn zodra je een backup terugzet. Verwijderen is dus terug te draaien
geworden.

**Ruimte terugwinnen** kan in Beheer → *Bewaarde hoesfoto's*. Die kijkt niet
alleen naar je huidige collectie maar naar élke backup, en gooit alleen weg wat
in geen van beide voorkomt. Zolang een backup nog naar een foto verwijst, blijft
die staan. Is één backup onleesbaar, dan stopt het opruimen helemaal in plaats
van te gokken.

De wisdialoog beloofde bovendien een backup die voor universums niet bestond.
Die zitten er nu wel in, naast de prijsgeschiedenis.

### 2.5 Er zat geen ondergrens op het schrijven

Leverde Drive ooit iets anders dan een lijst — een foutobject, een half
geschreven bestand — dan begon de app bij nul, en schreef de eerstvolgende
bewerking één titel terug over je hele collectie. Met de melding "✓ opgeslagen".

Nu stopt de app daar met een uitleg en de verwijzing naar Beheer → Herstellen.
Een bewerking die niet doorgaat is te herstellen; een lege collectie niet.

Daarbovenop een tweede rem: elke schrijfactie weet vooraf hoeveel titels er na
afloop moeten staan — evenveel, eentje meer, of zoveel minder als je wilde
verwijderen. Klopt dat niet, dan gaat er niets naar Drive.

### 2.6 De universumpagina kon bezit overschrijven met een wens

Die pagina controleerde tegen de lijst van bij het openen. Stond dat tabblad
open terwijl je op je gsm iets toevoegde, dan zette "+ verlanglijst" daar je
bezit, je exemplaren en je hoesfoto's terug naar een kaal wensrecord.

De controle gebeurt nu binnen de vergrendeling, tegen wat er op dát moment in
Drive staat. Bestaat de titel al, dan wordt er niets aangeraakt en zegt de knop
"stond er al". Dezelfde behandeling voor de knop **+ wens** bij de
zoekresultaten, die precies hetzelfde gat had.

---

## 3. Drie dingen van mijn eigen laatste fasen

### 3.1 Seizoen op de verlanglijst was onzichtbaar

De knop uit FASE 37 legde je wens netjes vast, maar het scherm filterde precies
die eruit. Je zag niets, je kon het niet weghalen, en nog eens klikken stapelde
duplicaten op die wél meetelden in de formaatfilters.

Een wens staat nu gewoon in beeld, met een gouden label **wens** ernaast zodat
hij nooit met bezit verward wordt, en met dezelfde *bewerken* en *weg* als een
gewoon exemplaar. Het seizoen zegt bovenaan "op je verlanglijst" in plaats van
"niet in bezit". Nog eens klikken op hetzelfde formaat doet niets meer.

### 3.2 De weggeklikte melding ving taps op

De melding onderaan werd wel doorzichtig maar verdween nooit echt: de regel die
hem moest verbergen verloor van een sterkere regel erboven. Gemeten op een
scherm van 390 px bleef er een onzichtbaar blok van 206 × 120 px klikken
opvangen, onderaan het midden — precies waar je duim zit.

Nu verdwijnt hij echt, en vangt hij ook tijdens het in- en uitvliegen niets meer
op. Alleen de knop *Sluiten* erin blijft aanklikbaar.

### 3.3 De universumpagina had FASE 32 nooit gekregen

Nul voorkomens van `added_at`. Alles wat je daar toevoegde sorteerde verkeerd
bij "Onlangs toegevoegd".

Dat kwam doordat de opbouw van een nieuw record op acht plaatsen met de hand
stond en uit elkaar was gegroeid. Er is nu één fabriek in `drive.js` waar elke
nieuwe titel doorheen gaat. Dat is niet alleen deze fout gerepareerd, het is die
hele klasse fouten weggenomen: een veld dat je daar toevoegt, komt overal
terecht.

---

## 4. Nog twee kleine dingen die ik meenam

- **De formaatkeuze bij een seizoen toonde drie van de zes formaten.** Een
  seizoen op Laserdisc liet de kale waarde `laserdisc` zien en je kon het ook
  niet kiezen. Dat lijstje is vervangen door de echte formaatlijst.
- **Seizoenen deelden hun exemplarenlijst met het origineel** na een
  samenvoeging, waardoor een latere toevoeging stilletjes ook het record
  veranderde waar je van vertrok. Dat kwam bij het schrijven van de tests boven.

---

## 5. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Een serie openen waarvan je een seizoen met opmerking/boxset hebt · noteer wat er staat | — |
| 3 | Beheer → **Alle titels verversen via TMDb** | Duurt even |
| 4 | Terug naar die serie | Exemplaren, opmerking, boxset, locatie: **allemaal nog er** |
| 5 | Diezelfde serie opnieuw toevoegen via + Titel toevoegen, alles aangevinkt, formaat 4K | Melding dat hij bijgewerkt is |
| 6 | Serie openen | Per seizoen een 4K-exemplaar **erbij**, het oude staat er nog |
| 7 | Nog eens hetzelfde doen | Geen dubbel 4K-exemplaar |
| 8 | Een handmatige special openen → ✎ Bewerken | Content-type staat op **Special / anders**, niet leeg |
| 9 | Opmerking wijzigen → Opslaan → Filters → **Specials** | De special staat er nog steeds bij |
| 10 | Een serie openen, bij een seizoen dat je mist op **op verlanglijst** klikken | Er verschijnt een regel met een goud **wens**-label |
| 11 | Nog eens op dezelfde knop klikken | "stond al op je verlanglijst", geen tweede regel |
| 12 | Op **weg** klikken bij die wens | Weg |
| 13 | Filters → Formaat | Die wens voegt geen formaat toe |
| 14 | Op je gsm: een melding laten verschijnen, wachten tot ze weg is, dan onderaan het midden tikken | De tik komt aan bij wat eronder ligt |
| 15 | Beheer → **Bewaarde hoesfoto's** → nakijken | Aantal ongebruikte foto's, of "niets op te ruimen" |
| 16 | Een titel mét hoesfoto verwijderen, dan opnieuw nakijken | Het aantal blijft gelijk — de foto zit nog in een backup |
| 17 | Universums openen in twee tabbladen, in het ene iets toevoegen, in het andere **+ verlanglijst** bij dezelfde titel | "stond er al", je bezit blijft |

Test 4, 6 en 16 zijn de belangrijkste: dat is het stille dataverlies waar deze
fase over gaat.

---

## 6. Geautomatiseerd nagekeken

**64 nieuwe controles, alle geslaagd.** En belangrijker: tien daarvan sloegen
aantoonbaar om naar rood toen ik de oude regels tijdelijk terugzette — dus ze
meten echt iets.

Onder meer: een verversing die de twee exemplaren van een seizoen laat staan
mét opmerking, boxset, locatie, hoesfoto-verwijzing en uitvoering, terwijl TMDb
zijn eigen velden wél bijwerkt; een seizoen dat TMDb niet meer kent en toch
blijft staan; het opnieuw toevoegen van een serie dat exemplaren toevoegt in
plaats van vervangt, twee keer opslaan zonder dubbel, en een bewuste tweede
kopie die wél mag; een special die zijn content-type houdt na een bewerking; een
onverwacht antwoord van Drive dat een fout geeft in plaats van stil een lege
collectie te schrijven; de verlanglijstknop die een bestaande titel met bezit
niet aanraakt; een hoesfoto die hernoemd wordt in plaats van verwijderd; het
opruimen dat foto's uit backups spaart — óók seizoenfoto's — en helemaal stopt
bij een onleesbare backup; de melding die op een gsm-scherm van 390 px echt
verdwijnt en niets meer opvangt.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24 + 16), 33 (37 + 16), 34 (16), 35 (41), 36 (31),
37 (25), 38 (20). Plus een nieuwe Tailwind-build met dekkingscontrole en de
vergelijking van 312 elementen × 32 eigenschappen — geen enkel verschil.

Eén test van FASE 37 moest bijgewerkt worden: die bootste de oude schrijffunctie
na. De controle zelf is ongewijzigd gebleven.

---

## 7. Commit-bericht

**Titel:**

```
FASE 39: stil dataverlies dichten -- seizoenen, specials, hoesfoto's, schrijfrem (sw v40)
```

**Beschrijving:**

```
Blok A uit de doorlichting van 2 augustus: negen plekken waar een gewone
handeling gegevens weggooide zonder melding.

- "Alles verversen" nam van elk seizoen alleen owned en format over. Exemplaren,
  uitvoering, boxset, locatie, opmerking en hoesfoto's van elke serie gingen weg
  bij een klik. Nieuwe mergeSeasons(): TMDb mag enkel zijn eigen velden
  bijwerken, en een seizoen dat TMDb niet meer kent maar jij bezit blijft staan.
- Een serie opnieuw toevoegen verving de hele seizoenenlijst door de vinkjes uit
  het formulier (standaard alles aan, een formaat). Nu mergeSeizoenKeuzes():
  exemplaren komen erbij, geen dubbels bij twee keer opslaan, wel bij een
  bewuste tweede kopie.
- De keuzelijst content-type kende "special" niet, terwijl FASE 36 dat
  wegschrijft. Een bewerking maakte het veld leeg en de titel viel uit elk
  type-filter. Optie toegevoegd, plus een terugval voor onbekende waarden.
- Hoesfoto's zaten in geen enkele backup en werden bij het verwijderen van een
  titel definitief gewist. Ze worden nu hernoemd naar wees-... en blijven
  bestaan, zodat een backup ze terugbrengt. Beheer krijgt "Ongebruikte
  hoesfoto's opruimen", die ook alle backups nakijkt en stopt bij een onleesbare
  backup. Universums zitten nu ook in de backup.
- driveLoadMovies viel bij een niet-lijst terug op [], waarna de eerstvolgende
  bewerking een lege collectie wegschreef met "opgeslagen". Gooit nu een fout.
  Daarbovenop controleert elke schrijfactie het verwachte aantal titels.
- De "+ verlanglijst"-knoppen werkten met een lijst van bij het openen van de
  pagina en konden bezit overschrijven met een wens. Nieuwe
  insertMovieIfAbsentInDrive() controleert binnen de vergrendeling.
- De opbouw van een nieuw record stond op acht plaatsen; de universumpagina had
  added_at nooit gekregen. Een fabriek nieuweCollectieTitel() in drive.js.

Uit de laatste twee fasen:
- Seizoen op de verlanglijst (FASE 37) werd weggeschreven maar uit het scherm
  gefilterd: onzichtbaar, niet weg te halen, dubbels bij nog eens klikken.
- De toast (FASE 30) bleef na het wegklikken een onzichtbaar blok van 206x120 px
  dat taps opving, onderaan het midden.
- Formaatkeuze bij een seizoen toonde drie van de zes formaten.

64 nieuwe geautomatiseerde controles geslaagd; tien daarvan aantoonbaar rood op
de oude code. Alle eerdere suites blijven geslaagd.
Details en testchecklist: FASE-39-stoppen-met-bloeden.md
```

---

## 8. Wat hierna komt

Volgens het advies uit de doorlichting: **blok D — verzamelaarsvelden**
(aankoopprijs, aankoopdatum, staat, uitgeleend aan, regiocode, aantal schijven,
talen, doorzoekbare opmerkingen, aanpasbare toevoegdatum). Niet omdat het het
leukste is, maar omdat elke titel die je vanaf nu invoert zonder die velden
later opnieuw langs moet — en je bent nu actief aan het invoeren.

Daarna blok B (de app afmaken) en blok C (snelheid en toegankelijkheid).

Nog steeds open uit eerdere fasen:

- **Punt 6 van je oude lijst:** de aanmelding die je onderbreekt tijdens het
  werken. Hoort bij blok B.
- **Hoesfoto's per seizoen-exemplaar** (uit FASE 35): de velden staan in het
  datamodel — en worden sinds deze fase ook netjes bewaard — maar het
  uploadscherm ontbreekt nog.
