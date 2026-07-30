# FASE 29 — Gsm en snelheid

**Datum:** 30 juli 2026 · **Service worker:** `v27` → **`v28`**
**Aanleiding:** de vaste afspraak uit het project — *licht en snel, zeker op
gsm, gaat vóór visuele hoogstandjes.* Deze fase maakt daar werk van.

> Volgorde hierna: 30 bediening en vertrouwen, 31 veiligheid en opruimen,
> 32 datamodel, 33 consistentie en toegankelijkheid.

---

## 1. Posters op maat in plaats van altijd de grootste

Elke poster werd als `w500` opgehaald — ook in een hokje van 160 pixels breed.
Dat kost dubbel: mobiele data bij het downloaden, en geheugen zolang het beeld
in het tabblad staat. Een uitgepakte afbeelding kost geheugen naar rato van
zijn *pixels*, niet van zijn bestandsgrootte, dus w500 in plaats van w185 is
ruim zeven keer zoveel voor exact hetzelfde beeld op het scherm.

Elke poster heeft nu een `srcset` met drie maten (w185, w342, w500) en een
`sizes` die de kolomindeling volgt. De browser kiest zelf.

**Gemeten in Chromium**, 60 posters in beeld:

| | vroeger | nu |
|---|---|---|
| Desktop 1280 px | 23 Mpixels | **3 Mpixels** |
| Gsm 390 px, 3× dichtheid | 8 Mpixels (22 zichtbare) | **4 Mpixels** |

Eén bewuste keuze: op schermen onder 640 px staat er `25vw` in plaats van de
eerlijke `45vw`. De browser vermenigvuldigt `sizes` met de pixeldichtheid, en
telefoons zitten op 2 à 3 — met de eerlijke waarde belandt zo'n toestel altijd
op de zwaarste variant. Met 25vw plafonneert het op **w342**: op een
posterhokje van ±160 px is dat nog altijd meer dan dubbele dichtheid. Dat zie
je niet; de helft minder data en geheugen merk je wel.

Ook toegevoegd: `decoding="async"`, zodat het uitpakken van een poster het
scrollen niet onderbreekt.

---

## 2. "Toon meer" bouwt bij in plaats van opnieuw

De knop verhoogde het aantal en riep gewoon `render()` aan — en die gooit het
hele raster leeg en bouwt alles opnieuw. Bij de derde klik in de tekstweergave
betekende dat 1200 rijen weggooien om er 1600 te maken: een zichtbare hapering,
een piek in geheugengebruik, en alle kaarten die opnieuw naar binnen komen
vliegen alsof je net was aangekomen.

Nu maakt `appendMore()` alleen de nieuwe kaarten, bouwt ze buiten het document
op en hangt ze in één keer achteraan. De bestaande kaarten worden niet
aangeraakt — de test zet er letterlijk een merkteken op en controleert dat dat
er na drie keer "Toon meer" nog op zit.

De verschijn-animatie loopt nu ook alleen over de nieuwe kaarten.

### Eén handler op het raster in plaats van drie per kaart

Om dat mogelijk te maken hangen klikken, toetsen en het sfeerlicht niet meer
aan de kaarten zelf maar aan het ráster, één keer bij het opstarten. Voorheen
kreeg elke kaart twee tot drie eigen handlers, en werden die bij élke
herteken-beurt opnieuw aangemaakt: bij 400 rijen in de tekstweergave ruim
duizend per beurt, bij elke filterklik opnieuw.

Bijkomend voordeel: bijgeladen kaarten werken meteen, zonder dat er iets
gekoppeld hoeft te worden. De tests controleren dat een bijgeladen kaart
gewoon opent én aan te vinken is in selectiemodus.

---

## 3. Het scherm doet niet meer wat je niet ziet

**Snelblik.** De overlay met score en formaten was op een aanraakscherm al
onzichtbaar (`hover: none`), maar werd wél voor elke kaart in de HTML gezet.
Bij 400 rijen zijn dat 400 stukjes pagina die niemand ooit ziet. Op touch
wordt hij nu helemaal niet meer aangemaakt.

**`will-change: transform`.** Dat stond op élke poster, voor alle apparaten.
Het geeft elke poster een eigen GPU-laag — op een telefoon met tientallen
posters in beeld tientallen megabytes videogeheugen, voor een hover-effect dat
daar niet eens bestaat. Nu staat het alleen nog waar er een muisaanwijzer is.

---

## 4. Sfeerlicht werkt eindelijk op gsm

De ambient-achtergrond hing aan `mouseenter`, en dat gebeurt op een
aanraakscherm nooit. De achtergrond bleef daar dus altijd zwart.

Nu volgt hij wat je bekijkt: **na** het scrollen (220 ms stil) peilt hij welke
kaart bovenaan in beeld staat en neemt die poster over. Bewust ná het scrollen
en met één peiling, in plaats van een waarnemer per kaart — scrollen moet
vloeiend blijven.

Twee dingen die de test aan het licht bracht:

- Precies in het midden peilen valt op een gsm (twee kolommen) in de
  *tussenruimte* tussen de posters. Er wordt nu op drie plaatsen gepeild.
- Als de vaste balk nog niet plakt, kwam de peiling buiten het scherm terecht.
  Nu afgegrensd.

En het beeld zelf is daar goedkoper: op touch laadt hij een piepklein
posterbeeld dat uitvergroot uit zichzelf al vaag is, met **18 px** blur in
plaats van 44 px. Hetzelfde resultaat, een fractie van het werk voor de GPU.

---

## 5. De vaste balk eet je scherm niet meer op

Op een telefoon wikkelde de bedieningsrij over vier regels: zoeken, sorteren,
vier weergaveknoppen, groeperen, selecteren, filters. Die balk blíjft plakken
tijdens het scrollen, dus dat was permanent een kwart van je scherm.

De bediening staat nu in één rij die je opzij schuift. Er verdwijnt niets —
de tekstweergave, die op gsm juist het handigst is, blijft één tik weg. Op
schermen vanaf 640 px doet de wikkel niets (`display: contents`) en ziet de
balk er exact uit als vroeger. De marges rondom zijn op smalle schermen ook
wat krapper.

---

## 6. Je ziet nu dat er iets laadt

Tussen inloggen en het binnenkomen van je collectie stond er niets. Een lege
pagina is niet te onderscheiden van "je hebt nog geen titels" of van een app
die vastloopt. Nu staan er grijze posterhokjes in de vorm van het raster, en
staat er *Collectie laden…* bij de teller. Ze verdwijnen zodra de eerste
titels er zijn.

---

## 7. Bestanden om te uploaden

**Samen uploaden:**

```
assets/app.js
index.html
sw.js                    ← VERSION = 'v28'
FASE-29-gsm-en-snelheid.md   ← nieuw
```

Na het uploaden: **Ctrl+Shift+R**.

---

## 8. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Herladen en meteen kijken | Even grijze hokjes + "Collectie laden…", dan je posters |
| 3 | F12 → Network → Img, dan herladen | De posters komen als `w185`/`w342`, niet meer als `w500` |
| 4 | Naar beneden scrollen tot **Toon meer**, klikken | Nieuwe kaarten komen erbij; de kaarten die er al stonden bewegen niet en vliegen niet opnieuw in |
| 5 | Nog twee keer "Toon meer" | Blijft vlot; knop verdwijnt aan het eind |
| 6 | Op een bijgeladen kaart klikken | Detailmodal opent gewoon |
| 7 | Selecteren aan, een bijgeladen kaart aanvinken | Teller loopt op |
| 8 | Het kruisje op een kaart | Verwijdert die titel, opent géén detailmodal |
| 9 | Met de muis over een poster | Snelblik en sfeerlicht werken als vroeger |
| 10 | **Op gsm:** de vaste balk bekijken | Eén rij die je opzij kan schuiven, niet vier regels |
| 11 | **Op gsm:** rustig scrollen | Achtergrond neemt de kleur over van de poster bovenaan |
| 12 | **Op gsm:** lang scrollen door 300+ titels | Blijft vloeiend, geen haperingen |
| 13 | Wisselen tussen raster / plank / compact / tekst | Alle vier werken, ook na "Toon meer" |

Test 4 is de belangrijkste van deze fase, test 12 de reden dat ze bestaat.

---

## 9. Geautomatiseerd nagekeken

**41 controles, alle geslaagd** — in een echte browser (Chromium) tegen
`index.html` met een nagebootste Drive-laag, zowel op een breedbeeldscherm als
op een nagebootste telefoon (390 px, 3× pixeldichtheid, aanraakbediening).

Wat er gecontroleerd is: srcset en sizes op de posters, welke variant de
browser werkelijk kiest en of die past bij het hokje, het beeldgeheugen tegen
het oude gedrag, "Toon meer" die bestaande kaarten met rust laat (drie keer na
elkaar, met een merkteken op een bestaande kaart), de gedelegeerde
klikafhandeling op zowel eerste als bijgeladen kaarten, selectiemodus op
bijgeladen kaarten, de afwezigheid van de snelblik op touch, het sfeerlicht dat
na scrollen aangaat en een poster toont, de opbouw van de vaste balk op smal
én breed, en de laadtoestand die verschijnt en weer verdwijnt.

Daarnaast: syntaxcontrole op alle JS, elk inline script, en de HTML-tagbalans.

**Twee echte fouten die de test onderweg ving:**

1. De laadtoestand tekende vóórdat de weergaveklassen bestonden — *"Cannot
   access VIEW_CONTAINER_CLASSES before initialization"*, oftewel een lege
   pagina. Die tabel staat nu buiten de opstartfunctie.
2. Het sfeerlicht peilde precies in het midden en vond op een gsm de
   tussenruimte tussen twee posters. Er wordt nu op drie plaatsen gepeild.

En twee in het testharnas zelf, het vermelden waard omdat ze anders als
appfouten zouden tellen: de nagebootste Tailwind moet ná het inline
`<style>`-blok geladen worden (anders is `.sticky` niet sticky), en lazy
posters die nog niet opgehaald zijn rapporteren hun `src` — die meetellen zou
de meting laten verzinnen dat er nog w500's geladen worden.

---

## 10. Commit-bericht

**Titel:**

```
FASE 29: posters op maat, Toon meer zonder herrender, gsm-winst (sw v28)
```

**Beschrijving:**

```
Vaste projectafspraak is dat licht en snel op gsm voorgaat op visuele
hoogstandjes. Deze fase pakt de vier plekken aan waar dat niet klopte.

Posters:
- srcset (w185/w342/w500) en sizes per poster in plaats van altijd w500.
  Gemeten in Chromium met 60 posters: desktop 23 -> 3 Mpixels, gsm 8 -> 4
  Mpixels aan beeldgeheugen.
- Onder 640px staat er bewust 25vw in plaats van de eerlijke 45vw: de
  browser vermenigvuldigt sizes met de pixeldichtheid, en anders belandt elke
  moderne telefoon alsnog op w500. Zo plafonneert het op w342, nog altijd
  ruim dubbele dichtheid op een hokje van 160px.
- decoding="async" erbij.

Toon meer:
- appendMore() maakt alleen de nieuwe kaarten en hangt ze in een keer
  achteraan, in plaats van render() die het hele raster opnieuw opbouwde.
- Klikken, toetsen en sfeerlicht hangen nu aan het raster (delegatie), een
  keer gekoppeld bij het opstarten, in plaats van twee tot drie handlers per
  kaart bij elke herteken-beurt. Bijgeladen kaarten werken daardoor meteen.
- De verschijn-animatie loopt alleen nog over nieuwe kaarten.

Minder werk voor het toestel:
- De snelblik-overlay wordt op touch niet meer aangemaakt; hij was daar toch
  onzichtbaar, maar stond wel voor elke kaart in de HTML.
- will-change: transform stond op elke poster voor alle apparaten en gaf er
  elk een eigen GPU-laag. Nu alleen waar hover bestaat.

Sfeerlicht en balk:
- De ambient-achtergrond hing aan mouseenter en deed op touch dus niets. Nu
  volgt hij na het scrollen de kaart bovenaan in beeld, met een klein
  posterbeeld en 18px blur in plaats van 44px.
- De bedieningsrij in de vaste balk wikkelde op gsm over vier regels en at
  permanent een kwart van het scherm. Nu een horizontaal schuifbare rij;
  vanaf 640px (display: contents) verandert er niets aan de opmaak.
- Laadtoestand: grijze posterhokjes en "Collectie laden..." in plaats van een
  lege pagina tussen inloggen en de eerste titels.

Onderweg gevonden en opgelost: de laadtoestand tekende voordat
VIEW_CONTAINER_CLASSES bestond (lege pagina), en de peiling voor het
sfeerlicht kwam op gsm in de tussenruimte tussen twee posters terecht.

41 geautomatiseerde controles geslaagd in een echte browser tegen index.html,
zowel op breedbeeld als op een nagebootste telefoon (390px, 3x, touch).
Details en testchecklist: FASE-29-gsm-en-snelheid.md
```

---

## 11. Wat hierna komt

**FASE 30 — bediening en vertrouwen:** leesmodus vóór het inlogscherm, een
toast in plaats van de indicator in de kop, een sluitende Escape-keten en
veilige marges, een sluitknop op de lightbox, de lege toestand opsplitsen, en
geen dode kliks meer als er nog geen TMDb-sleutel is.

Daarna 31 (veiligheid en opruimen), 32 (datamodel) en 33 (consistentie en
toegankelijkheid).
