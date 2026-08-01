# FASE 35 — Seizoenen met exemplaren, en de pagina Ontbreekt

**Datum:** 1 augustus 2026 · **Service worker:** `v35` → **`v36`**

---

## ⬆ UPLOADCHECKLIST — alle tien horen bij elkaar

- [ ] `ontbreekt.html` — **nieuw bestand**
- [ ] `assets/missing.js` — **nieuw bestand**
- [ ] `index.html`
- [ ] `universums.html`
- [ ] `statistieken.html`
- [ ] `prijzen.html`
- [ ] `beheer.html`
- [ ] `assets/app.js`
- [ ] `assets/drive.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v36'`
- [ ] Daarna: **Ctrl+Shift+R**

> De vier andere pagina's zitten er alleen bij omdat de navigatie een link naar
> *Ontbreekt* nodig heeft. Sla je die over, dan werkt de pagina wel maar kom je
> er alleen via de adresbalk.
>
> **Snelle controle achteraf:** zoek in je repo op `ontbreekt.html`
> (moet in alle zes de HTML-bestanden voorkomen) en op `normalizeSeasonEditions`
> (drive.js).

---

## 1. Een seizoen kon maar één schijf zijn

Films hebben al sinds fase 12 **exemplaren**: per schijf een formaat, een
uitvoering, een opmerking, een locatie, een boxset en eigen hoesfoto's. Een
seizoen had niets van dat alles — alleen `in bezit: ja/nee` en één formaat.
Seizoen 1 op DVD én op Blu-ray? Een gewone uitgave naast een steelbook? Daar
was letterlijk geen plaats voor.

Seizoenen hebben nu dezelfde structuur als films. In de detailweergave staat
onder elk seizoen dat je bezit een blokje met je exemplaren:

```
EXEMPLAREN
[DVD]   Kast woonkamer                      bewerken  weg
[4K]    Steelbook · Alien Anthology         bewerken  weg
+ nog een exemplaar
```

**Bewerken** opent een klein scherm met formaat, uitvoering, opmerking, boxset
en locatie. **Weg** haalt er één weg en zegt erbij hoeveel je er nog overhoudt;
is het je laatste, dan zegt hij dát in plaats van een teller.

### Wat er met je bestaande gegevens gebeurt

Niets waar je iets voor moet doen. Bij het inlezen krijgt elk seizoen dat je al
bezat automatisch één exemplaar, met het formaat dat er stond. Dat gebeurt in
het geheugen; pas als je iets wijzigt wordt het weggeschreven.

De oude velden `owned` en `format` blijven ook bestaan, als **spiegel** van je
beste exemplaar. Dat is met opzet: de seizoenenteller op de kaart, de
statistieken, de prijssleutels en de filters lezen die velden, en die hoeven
nu niets te weten van exemplaren. Eén uitzondering die ik wél moest aanpassen —
het **formaatfilter**. Dat keek alleen naar het spiegelveld, dus zodra je van
een seizoen ook een Blu-ray had, vond je je DVD-seizoen niet meer terug onder
"DVD". Nu telt elk exemplaar mee.

---

## 2. Nieuwe pagina: Ontbreekt

Compleetheid bestond alleen *binnenin* een titel. Wilde je weten wat je in het
algemeen miste, dan moest je titel per titel openen — onbruikbaar als je in een
winkel staat.

**Ontbreekt** staat nu in de navigatie, tussen Collectie en Universums, en toont
twee dingen onder elkaar.

**Series met ontbrekende seizoenen** — meteen zichtbaar, zonder wachten. Per
serie de poster, hoeveel van hoeveel seizoenen je hebt, en welke nummers er
ontbreken als losse chips. Bijna-complete series staan bovenaan: dat zijn de
goedkoopste gaten om te dichten.

Twee dingen die er bewust *niet* in staan:

- Series waarvan je **nog niets** hebt. Dat is geen gat in je collectie maar een
  titel die je niet verzamelt — anders stond je hele verlanglijst hier.
- **Seizoen 0** (specials). Bijna niemand bezit die, en anders zou zowat elke
  serie hier als onvolledig verschijnen.

**Filmreeksen met ontbrekende delen** — met één verschil dat je zal merken: dit
verschijnt pas als je erop klikt. Welke delen een reeks heeft weet alleen TMDb,
en dat is één opvraging per reeks. Met dertig reeksen zou de pagina seconden
lang niets doen, elke keer opnieuw. Nu staat er hoeveel opvragingen het kost en
kies je zelf. Daarna blijft het bewaard zolang de pagina openstaat.

Verder: tabbladen om alleen series of alleen reeksen te tonen, een
vinkje om te verbergen wat al op je verlanglijst staat, en een teller bovenaan
in de trant van *"Ontbreekt: 14 seizoenen in 6 series · 9 delen in 4 reeksen"*.

---

## 3. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Een serie openen die je deels hebt | Onder elk seizoen in bezit staat een exemplaren-blokje |
| 3 | **+ nog een exemplaar** bij een seizoen | Scherm met formaat, uitvoering, opmerking, boxset, locatie |
| 4 | Een tweede formaat toevoegen | Beide staan in de lijst; de titelregel toont bv. "4K + DVD" |
| 5 | Filters → Formaat → DVD | De serie staat er nog bij, ook al heb je er ook een Blu-ray van |
| 6 | **bewerken** bij een exemplaar | Waarden staan er al in; wijzigen en bewaren werkt |
| 7 | **weg** bij een exemplaar | Vraag noemt hoeveel je overhoudt |
| 8 | **weg** bij je laatste exemplaar | Vraag zegt dat je het seizoen dan niet meer bezit |
| 9 | **verwijderen** naast de seizoentitel | Haalt alle exemplaren van dat seizoen weg |
| 10 | Naar **Ontbreekt** | Series verschijnen meteen, zonder laden |
| 11 | Een complete serie zoeken in die lijst | Staat er niet in |
| 12 | **Filmreeksen nakijken** | Voortgang per reeks, daarna de ontbrekende delen |
| 13 | Tabbladen Series / Filmreeksen | Tonen alleen dat deel |
| 14 | Verlanglijst-vinkje aanzetten | Delen die al op je verlanglijst staan verdwijnen |
| 15 | Op gsm de pagina openen | Leesbaar, de posterstroken schuiven opzij |

Test 5 is de belangrijkste: die controleert dat je oudere seizoenen niet
onvindbaar worden zodra er een tweede formaat bij komt.

---

## 4. Geautomatiseerd nagekeken

**41 nieuwe controles, alle geslaagd.** Onder meer: de migratie van een bestaand
seizoen naar één exemplaar met alle velden die een film ook heeft; een tweede
exemplaar met een eigen id; het spiegelveld dat het beste formaat toont; het
formaatfilter dat de serie onder béide formaten vindt; de pagina die de halve
serie toont maar niet de complete en niet die waarvan je niets hebt; de
filmreeksen die aantoonbaar niet uit zichzelf opgehaald worden en na één klik
wél; de telling *3 van 4 delen*; de tabbladen; en de navigatielink in alle zes
de pagina's plus de service worker.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24), 33 (37 + 16), eigen titel (16), filterpaneel (16).
Plus een nieuwe Tailwind-build met dekkingscontrole, syntaxcontrole op alle JS
en alle inline scripts van zes pagina's, en de HTML-tagbalans.

Eén fout die de test onderweg ving: bij het bouwen van de nieuwe pagina had ik
het inlogscherm eruit gesneden samen met de oude inhoud. De pagina laadde dan
wel, maar startte nooit — en de enige zichtbare melding was een `null`-fout in
de console.

---

## 5. Commit-bericht

**Titel:**

```
FASE 35: exemplaren per seizoen + pagina Ontbreekt (sw v36)
```

**Beschrijving:**

```
Seizoenen:
- Een seizoen had alleen owned (ja/nee) en een format: plaats voor één schijf.
  Seizoen 1 op DVD en op Blu-ray, of een steelbook naast een gewone uitgave,
  kon niet. Films hadden die exemplaren-structuur al.
- Seizoenen krijgen nu dezelfde editions als films: formaat, uitvoering,
  opmerking, boxset, locatie en velden voor eigen hoesfoto's.
- Migratie bij het inlezen: een seizoen dat je al bezat wordt één exemplaar met
  het formaat dat er stond. Er wordt niets weggeschreven tot je zelf iets
  wijzigt.
- owned en format blijven bestaan als spiegel van het beste exemplaar, zodat de
  seizoenenteller, de statistieken en de prijssleutels ongewijzigd blijven
  werken.
- Uitzondering die wel moest wijzigen: het formaatfilter keek alleen naar dat
  spiegelveld, waardoor een DVD-seizoen onvindbaar werd zodra je er ook een
  Blu-ray van had. Nu telt elk exemplaar mee.
- UI in de detailweergave: exemplaren per seizoen, met toevoegen, bewerken en
  verwijderen. Verwijderen noemt hoeveel exemplaren je overhoudt.

Pagina Ontbreekt:
- Compleetheid bestond alleen binnenin een titel; er was geen overzicht van wat
  je in het algemeen mist. Nieuwe pagina in de navigatie van alle pagina's.
- Series met ontbrekende seizoenen verschijnen meteen: die gegevens staan al in
  movies.json, dus geen netwerkverzoek. Bijna-complete series eerst.
- Series waarvan je nog niets hebt en seizoen 0 (specials) tellen bewust niet
  als gat.
- Filmreeksen vragen één TMDb-opvraging per reeks en worden daarom pas op
  verzoek nagekeken, met vermelding van wat het kost. Resultaat blijft bewaard
  zolang de pagina openstaat.
- Tabbladen per soort, een optie om verlanglijst-titels te verbergen, en een
  teller bovenaan.

41 nieuwe geautomatiseerde controles geslaagd. Alle eerdere suites blijven
geslaagd (29: 41, 30: 39, 31: 50, 32: 24, 33: 37+16, titel: 16, filter: 16).
Details en testchecklist: FASE-35-seizoenen-en-ontbreekt.md
```

---

## 6. Wat nog open staat

**Punt 6 van je lijst:** de aanmelding die je onderbreekt terwijl je aan het
werk bent. Google-tokens duren vast één uur en zijn niet te verlengen, maar ze
kunnen wél op tijd en ongemerkt vervangen worden zolang je actief bent.

Daarnaast, uit deze fase: **hoesfoto's per seizoen-exemplaar**. De velden zitten
in het datamodel, zodat er later niets opnieuw gemigreerd hoeft te worden, maar
het uploadscherm ervoor is er nog niet. Zeg het als je dat nodig hebt.
