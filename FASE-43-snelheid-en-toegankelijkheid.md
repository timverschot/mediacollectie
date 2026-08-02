# FASE 43 — Snelheid en toegankelijkheid (blok C)

**Datum:** 2 augustus 2026 · **Service worker:** `v43` → **`v44`**
**Volgt op:** de doorlichting van 2 augustus, §5 en §6.

---

## ⬆ UPLOADCHECKLIST

- [ ] `index.html`
- [ ] `assets/app.js`
- [ ] `assets/drive.js`
- [ ] `assets/admin.js`
- [ ] `assets/universes.js`
- [ ] `assets/universes-page.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v44'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek op `ruimShelfOp` en `focusNaarOverlay`
> (app.js), `driveFoutTekst` (drive.js), `tmdbFoutTekst` (admin.js),
> `UNIVERSE_CACHE_KEY` (universes.js) en `MAX_IMAGES = 1500` (sw.js).

---

## 1. De plank was de enige plek waar de lessen van FASE 29 niet toegepast waren

Bij 652 titels bouwde de plankweergave in één keer **alle** eenheden op: 3914
DOM-elementen en 652 losse klikhandlers, goed voor een bevriezing van bijna een
halve seconde. En kwam je terug naar het raster, dan bleven die 652 slides de
hele sessie staan.

Nu krijgt elke titel alleen een leeg hokje met de juiste breedte — dat houdt de
geometrie van de plank exact zoals ze was — en wordt de inhoud pas opgebouwd
voor de slides rond de actieve. Wat uit beeld schuift wordt weer leeggemaakt.
Eén klikhandler op de rail in plaats van één per slide. En bij het verlaten
wordt de plank echt opgeruimd.

**Gemeten**, gsm-profiel (390×844, 3× dichtheid, processor 4× vertraagd, 652
titels):

| | vóór | na |
|---|---|---|
| Plankweergave openen | 423-485 ms | **24 ms** |
| DOM in de plank | 3914 | 1965 |
| Klikhandlers erbij | 652 | **1** |
| Slides ná terugkeer naar het raster | 652 | **0** |
| DOM na een volledige sessie heen en weer | 3505 | **827** |

---

## 2. Hoesfoto-posters gingen stuk na een filterklik

Er waren twéé caches voor dezelfde foto's. De ene in `app.js` bewaarde het
adres van een foto voorgoed; de andere in `drive.js` trok datzelfde adres in
zodra er 24 nieuwe foto's bij kwamen. Gevolg: na een filterklik gaf de eerste
cache een adres terug dat niet meer bestond, en bleef de poster leeg — zonder
terug te vallen op de gewone TMDb-poster.

Er is nu nog één cache. En een foto die tóch stukgaat probeert het één keer
opnieuw voor hij terugvalt op de standaardposter, zodat je nooit meer een leeg
vak ziet. De cache is van 24 naar 48 gegaan: 24 was kleiner dan één schermvol,
dus de foto die je net zag werd alweer weggegooid.

---

## 3. Universums werden bij élke opening opnieuw opgehaald

Tot zestig opeenvolgende TMDb-verzoeken met pauzes ertussen, bij elke opening
van de collectie — ook als je die dag nooit op een universum filterde.

De ledenlijst werd bewust niet bewaard, zodat nieuwe releases vanzelf in je
compleetheidsteller verschijnen. Dat idee klopt; de prijs was alleen te hoog.
De lijst wordt nu een dag bewaard: geen verkeer bij normaal gebruik, en een
nieuwe film staat er hoogstens een dag later in. Wijzig of verwijder je een
universum, dan wordt het bewaarde meteen weggegooid.

---

## 4. De service worker haalde op tot 145 kB per opening opnieuw op

Die stond op *netwerk eerst*: bij elke opening werden de app-bestanden opnieuw
opgehaald terwijl er een geldige kopie klaarstond, en op een trage verbinding
stond je te wachten op bestanden die je al had.

Nu krijg je de kopie meteen en wordt de nieuwe versie ernáást opgehaald en
bewaard. **Aan jouw werkwijze verandert er niets:** het versienummer in `sw.js`
moet bij elke wijziging omhoog en er is één keer Ctrl+Shift+R nodig na een
upload — dat was al zo, en die versiebump haalt nog steeds alles vers op.

De postercache stond op 600, kleiner dan je collectie van 680 titels — de
posters die je het eerst zag vielen er dus telkens uit en werden opnieuw
gedownload. Nu 1500.

---

## 5. Toegankelijkheid

Dit stond ooit als FASE 33 gepland en is er nooit van gekomen.

- **De focus blijft nu in een detailscherm.** Voorheen liep Tab door naar de
  kaarten eronder, die niet meescrollen: je focus verdween letterlijk uit beeld,
  en bij sluiten kwam hij niet terug. Nu springt de focus bij het openen naar
  binnen, blijft hij binnen, en komt hij bij sluiten terug op de kaart waar je
  vandaan kwam.
- **Enter werkt op de regels die eruitzien als knoppen**: delen van een reeks,
  exemplarenrijen, namen in de credits, gastrollen. Je tabde erop en er gebeurde
  niets.
- **De vier weergaveknoppen (▦ ▤▤ ▤ ≡) hebben een naam** voor een schermlezer.
  Die las tot nu toe alleen de tekens voor.
- **Contrast.** De basis was prima, maar overal waar doorzichtige tekst stond
  zakte het naar 2,7-3,3:1 — onder de leesbaarheidsgrens. Die plekken zijn
  weggewerkt, en de kleine labels op de snelblik gingen van 8,5 naar 10,5 px.
- **Foutmeldingen in gewone taal.** Er stond letterlijk `✗ TMDb-fout: 401` en
  `Drive-fout (403): {ruwe JSON}` op je scherm. Nu staat er wat er aan de hand
  is en wat je eraan kan doen — de ruwe tekst gaat naar de console, waar hij
  hoort.

---

## 6. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Naar de **plankweergave** (▤▤) | Opent vlot, ook bij een grote collectie |
| 3 | Een eind doorbladeren met de pijltjes | Blijft soepel |
| 4 | Terug naar het raster (▦) en weer naar de plank, drie keer | Blijft even snel; je gsm wordt niet warm |
| 5 | Een titel met een eigen hoesfoto als poster; filter aan- en uitzetten | De hoesfoto blijft staan, geen leeg vak |
| 6 | **Universums** openen, dan terug en opnieuw | De tweede keer meteen klaar, zonder wachten |
| 7 | Een universum wijzigen en terugkeren | Wordt wél opnieuw opgehaald |
| 8 | De site tweede keer openen | Merkbaar sneller in beeld |
| 9 | Een titel openen en op **Tab** blijven drukken | De focus blijft in het scherm, verdwijnt niet naar beneden |
| 10 | Het scherm sluiten met Escape | De focus staat weer op de kaart waar je vandaan kwam |
| 11 | Een titel met twee exemplaren openen, met Tab naar de tweede rij, **Enter** | Dat exemplaar wordt gekozen |
| 12 | Je TMDb-sleutel tijdelijk foutief maken en zoeken | "TMDb aanvaardt je sleutel niet…" in plaats van "TMDb-fout: 401" |

Test 4, 5 en 9 zijn de belangrijkste.

---

## 7. Geautomatiseerd nagekeken

**37 nieuwe controles, alle geslaagd.** Onder meer: de plank die bij 300 titels
wel 300 hokjes maakt maar hoogstens een handvol vult en evenveel posters laadt,
met een DOM onder de 2500; het aantal gevulde slides dat begrensd blijft na
veertig stappen; nul achtergebleven slides na drie keer heen en weer; hoogstens
een paar klikhandlers en geen nieuwe bij het opnieuw openen; de LRU die na 48
foto's echt vrijgeeft en waarbij opnieuw opvragen een nieuw adres oplevert
(plus de controle dat de tweede cache niet meer bestaat); de universumlijst die
bij een tweede bezoek nul TMDb-verzoeken doet, na een wijziging wél opnieuw
ophaalt en na een dag verloopt; vier weergaveknoppen met vier verschillende
namen; Enter op een exemplaarregel die dat exemplaar echt kiest; de focus die
naar binnen springt, binnen blijft bij Tab vanaf het laatste element en
terugkomt op de kaart; en foutmeldingen die zeggen wat je moet doen zonder ruwe
JSON.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24 + 16), 33 (37 + 16), 34 (16), 35 (41), 36 (31),
37 (25), 38 (20), 39 (64), 40 (76), 41 (42), 42 (30). Plus een Tailwind-build
met dekkingscontrole.

---

## 8. Commit-bericht

**Titel:**

```
FASE 43: plank vensteren, hoesfoto-cache, universums bewaren, focus en leesbare fouten (sw v44)
```

**Beschrijving:**

```
Blok C uit de doorlichting van 2 augustus.

- De plankweergave bouwde alle 652 eenheden ineens op: 3914 DOM-elementen, 652
  klikhandlers, 423-485 ms bevriezing, en na terugkeer bleven die slides de
  hele sessie staan. Nu lege hokjes met de juiste breedte (geometrie blijft
  gelijk) en inhoud alleen rond de actieve slide, een handler op de rail, en
  echt opruimen bij het verlaten. Gemeten op gsm: openen van 423-485 ms naar
  24 ms, DOM na een sessie van 3505 naar 827.
- Twee caches voor dezelfde hoesfoto's: die in app.js bewaarde blob-URL's
  voorgoed, die in drive.js trok ze na 24 stuks in. Na een filterklik gaf de
  eerste een dood adres terug en bleef de poster leeg zonder terugval. Nog maar
  een cache, groter (48, was kleiner dan een schermvol), plus een onerror die
  eenmaal opnieuw ophaalt en anders terugvalt op de TMDb-poster.
- Universums werden bij elke opening opnieuw opgehaald: tot zestig verzoeken
  met pauzes, ook zonder universumfilter. Ledenlijsten worden nu een dag
  bewaard in localStorage en gewist zodra je een universum wijzigt.
- De service worker stond op netwerk-eerst en haalde tot 145 kB per opening
  opnieuw op terwijl er een geldige kopie was. Nu stale-while-revalidate; de
  versiebump blijft het mechanisme voor een verse schil. Postercache van 600
  (kleiner dan de collectie) naar 1500.
- Toegankelijkheid: focus blijft in de detailschermen en komt bij sluiten terug
  op de kaart; Enter werkt op reeksdelen, exemplarenrijen, credits en
  gastrollen; de vier weergaveknoppen hebben een aria-label; doorzichtige tekst
  op 2,7-3,3:1 is weggewerkt en .peek-tag ging van 8,5 naar 10,5 px;
  foutmeldingen zeggen wat er aan de hand is in plaats van "TMDb-fout: 401" of
  ruwe JSON van Google (die gaat naar de console).

37 nieuwe geautomatiseerde controles geslaagd. Alle eerdere suites blijven
geslaagd. Details en testchecklist: FASE-43-snelheid-en-toegankelijkheid.md
```

---

## 9. Wat er nog open staat

Hiermee zijn de vier blokken uit de doorlichting van 2 augustus gedaan: A
(stoppen met bloeden), D (verzamelaarsvelden), B (de app afmaken) en C
(snelheid en toegankelijkheid).

Wat er bewust nog ligt:

- **Onderhoud, §8 van de doorlichting.** De dubbele invoerroutes uit Beheer, de
  formaatlabels die op meerdere plaatsen naast `MEDIA_FORMATS` staan, de negen
  escape-functies, en `app.js` dat 6.000 regels telt terwijl vijf blokken er
  nauwelijks aan hangen. Dit levert jou niets zichtbaars op — het maakt de app
  alleen makkelijker te onderhouden en voorkomt precies het soort fouten dat in
  FASE 39 boven kwam. Eén keer goed doen, in één fase.
- **`prijzen.html` tekent alles in één keer**: 8639 DOM-elementen. Dezelfde
  aanpak als de plank hierboven zou dat oplossen.
- **Hoesfoto's per seizoen-exemplaar** (uit FASE 35): de velden staan in het
  datamodel en worden sinds FASE 39 netjes bewaard, maar het uploadscherm
  ontbreekt nog.

Mijn voorstel: het onderhoud, en daarna een nieuwe doorlichting — de vorige
kwam er niet voor niets uit.
