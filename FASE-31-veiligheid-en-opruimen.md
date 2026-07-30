# FASE 31 — Veiligheid en opruimen

**Datum:** 30 juli 2026 · **Service worker:** `v29` → **`v30`**
**Aanleiding:** de veiligheidspunten uit de analyse, plus twee dingen die stil
konden misgaan zonder dat je het merkte.

> Volgorde hierna: 32 datamodel, 33 consistentie en toegankelijkheid.

---

## 1. Tailwind komt niet meer van een vreemde server

Elke pagina laadde `cdn.tailwindcss.com`: ongeveer **120 kB javascript** dat
bij élk bezoek je hele pagina doorleest en de opmaak ter plekke samenstelt.
Drie bezwaren, waarvan de eerste de zwaarste is gezien de vaste afspraak dat
snelheid op gsm voorgaat:

1. **Traag.** Die opmaak-samenstelling gebeurt in de browser, op je telefoon,
   vóór er iets zichtbaar wordt.
2. **Afhankelijk.** Ligt die server plat of blokkeert een netwerk hem, dan
   staat je collectie er als kale tekst.
3. **Onafgeschermd.** Een script van een derde partij dat volledige toegang
   heeft tot je pagina, kan je met geen enkel beleid nog dichttimmeren.

De opmaak wordt nu vooraf gebouwd tot **`assets/tailwind.css`, 27 kB**, dat de
service worker gewoon kan bewaren. Zelfde configuratie, zelfde kleuren, zelfde
lettertypes.

### Waar dit bijna misging

De CDN hing zijn opmaak achteraan in de `<head>`, dus **ná** het
`<style>`-blok van de pagina. Bij gelijke specificiteit wint de laatste regel.
Ik zette het stijlblad eerst op de plek waar het CDN-script stond — vóór dat
blok — en toen won `main, header, .sticky { position: relative }` van Tailwinds
`.sticky`: **de filterbalk plakte niet meer tijdens het scrollen.** Ook alle
chips en knoppen veranderden van formaat.

De vergelijkingstest ving het: die bouwt de pagina twee keer op, één keer in de
oude volgorde en één keer in de nieuwe, en vergelijkt 284 elementen op 32
opmaak-eigenschappen. Na verplaatsing: **geen enkel verschil.**

In de HTML staat op die plek nu een waarschuwing, zodat dit niet per ongeluk
teruggedraaid wordt.

### Opnieuw bouwen

Alleen nodig als je een Tailwind-klasse gebruikt die nog nergens in het project
stond. `BOUWEN-tailwind.md` legt uit hoe. Er is ook een controle die élke
klassenaam uit de HTML en de JS opzoekt in de gebouwde CSS — die vindt het
meteen als er iets ontbreekt.

---

## 2. Een inhoudsbeleid (CSP)

Elke pagina zegt nu vooraf waar dingen vandaan mogen komen: scripts alleen van
de site zelf en van Google (voor het inloggen), afbeeldingen van TMDb, gegevens
van Drive en TMDb. Al de rest wordt door de browser geweigerd, ook als het via
een omweg binnenkomt.

Eerlijk over wat dit wél en niet doet: de pagina's staan vol met inline
scripts, dus `'unsafe-inline'` moest toegelaten blijven. Dat betekent dat dit
beleid geen bescherming biedt tegen code die ín de pagina zelf geïnjecteerd
zou worden. Wat het wél doet: het maakt het onmogelijk om code van een
**andere server** te laden, sluit `<object>`/`<embed>` af, en beperkt naar
welke servers de pagina gegevens kan sturen. Dat laatste is de belangrijkste:
mocht er ooit iets meeliften, dan kan het je collectie nergens naartoe sturen.

> `prijzen.html` mag daarnaast je eigen Cloudflare Worker aanspreken
> (`*.workers.dev`).

**En de ongebruikte Google-bibliotheek is weg.** `apis.google.com/js/api.js`
werd op alle vijf de pagina's geladen terwijl de code hem nergens gebruikt —
alle Drive-verkeer loopt rechtstreeks. Vijf pagina's, één verzoek minder.

### Nog een vondst: de inlogknop kon stil breken

Het Google-inlogscript staat in de kop, `assets/drive.js` onderaan de pagina.
Is Google sneller klaar dan de rest van de pagina, dan bestaat `gisLoaded()`
nog niet en krijg je `gisLoaded is not defined` — met een inlogknop die niets
doet en geen enkele uitleg. Zeldzaam, maar precies het soort fout dat op een
trage verbinding toeslaat. Dat geval wordt nu onthouden en `drive.js` haalt het
zelf in.

---

## 3. Importeren kijkt eerst

Bij **Beheer → een oude `movies.json` importeren** ging de inhoud van het
gekozen bestand er tot nu toe **ongezien** in:

- Was het geen lijst, dan kreeg je een onbegrijpelijke foutmelding.
- Zaten er records zonder `id` in, dan belandden die als losse rommel in je
  collectie — onzichtbaar, en zonder id kon je ze ook niet meer verwijderen.
- Bestaande titels werden overschreven, zonder backup en zonder vragen.

Nu wordt het bestand eerst gecontroleerd, en krijg je te zien wat er gaat
gebeuren:

```
Het bestand bevat 214 records.

• 187 nieuwe titels erbij
• 24 bestaande titels worden OVERSCHREVEN
• 3 records worden overgeslagen (geen id of titel)
   bv. record zonder bruikbare id

Je collectie heeft nu 341 titels.
Er wordt eerst automatisch een backup gemaakt.

Doorgaan?
```

Pas na **Doorgaan** wordt er iets weggeschreven, en er gaat altijd eerst een
backup naar Drive (`movies-backup-voor-import-…`). Annuleren wijzigt niets.
De prijsimport kreeg dezelfde behandeling.

---

## 4. Je prijsgeschiedenis zat in géén enkele backup

`movies.json` werd wekelijks geback-upt, en vóór elke riskante actie.
`price_history.json` niet — terwijl dat maanden opbouwwerk is: metingen van
gepasseerde momenten, die je niet opnieuw kan doen.

Vanaf nu gaat er bij elke backup een `prices-backup-…` mee, met dezelfde
tijdstempel. Zet je een collectiebackup terug, dan komt de bijhorende
prijsbackup automatisch mee — anders wijst je collectie naar titels waarvan de
prijzen uit een ander moment stammen.

Bewust een **apart bestand** en niet één gecombineerd bestand: zo blijft het
formaat van je bestaande backups precies zoals het was, en kan je oudere
backups gewoon blijven terugzetten.

---

## 5. Twee posterpaden die niet ontsnapt werden

Twee plekken waar een pad van TMDb rechtstreeks in de pagina terechtkwam:

- de zoekresultaten bij **+ Titel toevoegen** (in een `src`-attribuut);
- de sfeerachtergrond (in een CSS-`url()`).

Het is nooit misgegaan — TMDb-paden zien er altijd uit als `/abc123.jpg` — maar
een pad met een aanhalingsteken zou eruit kunnen breken. Beide worden nu
ontsnapt, zoals overal elders al gebeurde. Een test voert nu een titel op met
een posterpad dat probeert code uit te voeren, en controleert dat er niets
gebeurt.

---

## 6. Bestanden om te uploaden

**Alles samen uploaden** — de pagina's en het stijlblad horen bij elkaar:

```
index.html
beheer.html
prijzen.html
statistieken.html
universums.html
assets/tailwind.css        ← nieuw
assets/app.js
assets/drive.js
assets/add-title.js
sw.js                      ← VERSION = 'v30'
tailwind.config.js         ← nieuw (alleen nodig om te bouwen)
tailwind-input.css         ← nieuw (alleen nodig om te bouwen)
BOUWEN-tailwind.md         ← nieuw
FASE-31-veiligheid-en-opruimen.md   ← nieuw
```

Na het uploaden: **Ctrl+Shift+R**.

> Belangrijk: `assets/tailwind.css` móét mee. Zonder dat bestand heeft de site
> geen opmaak meer — de CDN die het vroeger deed, wordt niet meer geladen.

---

## 7. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen | Ziet er exact hetzelfde uit als gisteren |
| 2 | F12 → Console | Geen fouten, geen CSP-meldingen |
| 3 | Naar beneden scrollen | De filterbalk blijft bovenaan plakken |
| 4 | F12 → Network, herladen | Geen verzoek naar `cdn.tailwindcss.com` of `apis.google.com` |
| 5 | De vier andere pagina's openen | Universums, Statistieken, Prijzen, Beheer zien er normaal uit |
| 6 | Uitloggen en opnieuw inloggen | Werkt gewoon |
| 7 | Beheer → een `movies.json` importeren | Eerst een overzicht met aantallen, dan pas vragen om te bevestigen |
| 8 | Daar op **Annuleren** | "Geannuleerd — er is niets gewijzigd", collectie ongewijzigd |
| 9 | Een tekstbestand met onzin proberen te importeren | Duidelijke weigering, niets weggeschreven |
| 10 | Beheer → Backup nu maken | Er verschijnt zowel een `movies-backup-…` als een `prices-backup-…` |
| 11 | Beheer → Herstellen | Werkt; de prijzen van datzelfde moment komen mee |
| 12 | **Op gsm:** de site openen | Merkbaar sneller klaar dan vroeger |

Test 1 en 3 zijn de belangrijkste van deze fase — die controleren dat de
overstap naar lokale opmaak niets veranderd heeft.

---

## 8. Geautomatiseerd nagekeken

**50 nieuwe controles, alle geslaagd**, plus:

- **Opmaakvergelijking:** de pagina twee keer opgebouwd — één keer met de
  stijlvolgorde van de CDN, één keer zoals hij nu is — en 284 elementen op 32
  eigenschappen vergeleken. **Geen enkel verschil.** Dit is de test die de
  niet-plakkende filterbalk ving.
- **Klassendekking:** alle 406 mogelijke Tailwind-klassen uit de HTML en de JS
  opgezocht in de gebouwde CSS. Alle aanwezig.
- **Herbouw:** opnieuw bouwen vanuit de projectmap levert een byte-voor-byte
  identiek `tailwind.css` op.
- **FASE 29 (41 controles) en FASE 30 (39 controles)** opnieuw gedraaid — nu
  tegen de échte Tailwind in plaats van een namaakversie in het testharnas.
  Beide blijven volledig geslaagd.
- Syntaxcontrole op alle JS, elk inline script van alle vijf de pagina's, en de
  HTML-tagbalans.

De nieuwe controles dekken: geen CDN-verwijzingen meer en de juiste volgorde in
alle vijf de pagina's, geen enkel netwerkverzoek naar de CDN of naar
apis.google.com, de kritieke opmaakregels (plakkende balk, kolommen,
posterverhouding, achtergrondkleur, ronde chips), een CSP op elke pagina zonder
overtredingen bij laden en openen, zes soorten kapotte importbestanden, de
telling van nieuw/overschreven/overgeslagen, de backup die vóór het schrijven
gemaakt wordt, de prijsbackup met dezelfde tijdstempel, en een posterpad dat
probeert code uit te voeren.

Twee fouten die de tests onderweg vingen: de stijlvolgorde hierboven, en het
`gisLoaded`-wedloopje.

---

## 9. Commit-bericht

**Titel:**

```
FASE 31: Tailwind lokaal, inhoudsbeleid, importcontrole, prijzen in backup (sw v30)
```

**Beschrijving:**

```
Tailwind lokaal in plaats van de CDN:
- cdn.tailwindcss.com laadde ~120 kB javascript dat bij elk bezoek de opmaak
  in de browser samenstelde. Nu een vooraf gebouwd assets/tailwind.css van
  27 kB dat de service worker kan bewaren. Zelfde config, zelfde resultaat.
- Het stijlblad staat BEWUST na het inline <style>-blok. De CDN hing zijn
  opmaak achteraan in de head; bij gelijke specificiteit wint de laatste
  regel. Op de plek van het oude script won "main, header, .sticky {
  position: relative }" van Tailwinds .sticky en plakte de filterbalk niet
  meer. Er staat nu een waarschuwing bij.
- tailwind.config.js, tailwind-input.css en BOUWEN-tailwind.md toegevoegd.
  Opnieuw bouwen is alleen nodig bij een nieuwe Tailwind-klasse.

Inhoudsbeleid en opruimen:
- Content-Security-Policy op alle vijf de pagina's. Scripts alleen van de site
  zelf en Google, afbeeldingen van TMDb, gegevens naar Drive en TMDb. Inline
  scripts moeten toegelaten blijven, dus dit beschermt niet tegen injectie in
  de pagina zelf, wel tegen code van derden en tegen wegsturen van gegevens.
- apis.google.com/js/api.js werd op alle pagina's geladen maar nergens
  gebruikt; alle Drive-verkeer loopt rechtstreeks. Verwijderd.
- Het Google-inlogscript staat in de kop en drive.js onderaan. Is Google
  sneller klaar, dan bestond gisLoaded() nog niet: "gisLoaded is not defined"
  met een inlogknop die niets doet. Dat geval wordt nu onthouden en ingehaald.

Importeren:
- De inhoud van een geimporteerd bestand ging ongezien naar Drive. Geen lijst
  gaf een cryptische fout, records zonder id belandden als onzichtbare rommel
  in de collectie, en bestaande titels werden overschreven zonder backup.
- Nu eerst een controle en een overzicht (nieuw / overschreven / overgeslagen),
  dan pas bevestigen, en er gaat altijd een backup vooraf. Zelfde voor de
  prijsimport.

Backups:
- price_history.json zat in geen enkele backup, terwijl dat maanden metingen
  zijn die je niet opnieuw kan doen. Elke backup krijgt nu een prices-backup
  met dezelfde tijdstempel, en bij herstellen komt die mee. Bewust een apart
  bestand, zodat bestaande backups terugzetbaar blijven.

Ontsnapping:
- Twee plekken waar een TMDb-posterpad ongefilterd in de pagina kwam: de
  zoekresultaten bij toevoegen (src-attribuut) en de sfeerachtergrond
  (CSS-url). Beide ontsnappen nu.

50 nieuwe geautomatiseerde controles geslaagd, plus een opmaakvergelijking van
284 elementen op 32 eigenschappen tussen de oude en nieuwe stijlvolgorde (geen
enkel verschil) en een dekkingscontrole van alle 406 Tailwind-klassen. De 41
controles van FASE 29 en de 39 van FASE 30 draaien nu tegen de echte Tailwind
en blijven geslaagd.
Details en testchecklist: FASE-31-veiligheid-en-opruimen.md
```

---

## 10. Wat hierna komt

**FASE 32 — datamodel:** jaar- en regisseurfilter, animatie als eigenschap in
plaats van als type, seizoenen in alle formaten, kijklog met datumkeuze, en
universums hernoemen.

Daarna 33 (consistentie en toegankelijkheid).
