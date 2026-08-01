# FASE 37 — Eigen reeksen en de verlanglijst

**Datum:** 1 augustus 2026 · **Service worker:** `v37` → **`v38`**

---

## ⬆ UPLOADCHECKLIST

- [ ] `index.html`
- [ ] `ontbreekt.html`
- [ ] `assets/app.js`
- [ ] `assets/add-title.js`
- [ ] `assets/missing.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v38'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek op `saga-suggesties` (index.html),
> `data-wish` (add-title.js) en `eigenReeksenFrom` (missing.js).

---

## 1. Waarom The New Pope losstaat

TMDb kent **collecties alleen voor films**. Voor series bestaat dat begrip
daar niet: *The Young Pope* en *The New Pope* zijn twee volledig losse records,
ook al is de tweede het vervolg op de eerste. Er valt dus niets op te halen —
dat verband bestaat alleen in jouw hoofd, en moet dus door jou vastgelegd
worden.

Dat kón al: het veld **Reeks** in het bewerkpaneel. Zet je bij beide titels
dezelfde naam, dan groeperen ze samen en vindt zoeken ze allebei. Maar er zaten
twee gaten in die weg, en die zijn nu gedicht.

### Gat 1 — één typfout en ze staan alsnog los

Het reeksveld was vrije tekst. "The Young Pope" en "Young Pope" zijn voor de
app twee verschillende reeksen, en je zag niet dat je ernaast zat.

Het veld heeft nu een **suggestielijst** van alle reeksen die je al gebruikt.
Je typt een letter en kiest de bestaande naam. Eronder staat waar het veld voor
dient: *zelfde naam bij twee titels = ze horen bij elkaar.*

### Gat 2 — de pagina Ontbreekt sloeg je eigen reeksen over

Die keek alleen naar reeksen die TMDb kent. Een reeks die je zelf had gemaakt
was daar onzichtbaar, dus zag je nog steeds niet dat er iets miste.

Er staat nu een blok **Je eigen reeksen**. Wat er ontbreekt kan de app niet
zélf weten — er is geen bron die zegt hoeveel delen zo'n reeks heeft. Wat ze
wél weet is wat jíj hebt vastgelegd: **alles wat je op je verlanglijst zette**.
Per eigen reeks zie je dus wat je hebt en wat je nog zoekt.

Concreet voor jouw geval:

1. Zet bij *The New Pope* de reeks op **Pope** (of hoe je hem wil noemen).
2. Zoek *The Young Pope* op en zet hem met één klik op je verlanglijst.
3. Geef die ook de reeks **Pope**.
4. Op **Ontbreekt** staat nu: *Pope — 1 in bezit · 1 nog te halen.*

Reeksen die TMDb wél kent blijven in het andere blok; die worden volledig
nagekeken en horen niet twee keer op de pagina.

---

## 2. Verlanglijst in één klik

Je kon een titel wél op de verlanglijst zetten — via het statusveld ín het
toevoegformulier. Maar dat betekent: zoeken, doorklikken, formulier invullen,
opslaan. Voor het opbouwen van een lijstje van wat je nog zoekt is dat te veel
werk, en de knop die je zocht stond ergens waar je niet keek.

Op elk zoekresultaat staat nu **+ wens** rechtsonder. Eén klik en de titel gaat
naar je verlanglijst met je onthouden voorkeursformaat — geen formulier, geen
tussenstap. De knop wordt daarna een vinkje. Staat de titel er al, dan zegt hij
dat in plaats van iets te overschrijven.

**En seizoenen ook.** Bij een seizoen dat je niet hebt stond alleen *in bezit*.
Daar staat nu ook **op verlanglijst** naast. Zo'n seizoen telt níet mee als
bezit — de teller op de kaart en de formaatfilters blijven kloppen — maar het
staat wel vast dat je het nog wil.

---

## 3. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Een titel openen → **✎ Bewerken** | Bij Reeks verschijnen je bestaande reeksnamen zodra je typt |
| 3 | Bij *The New Pope* de reeks **Pope** zetten → Opslaan | Bewaard |
| 4 | + Titel toevoegen → zoeken op *The Young Pope* | Elk resultaat heeft **+ wens** rechtsonder |
| 5 | Op **+ wens** klikken | "✓ … op je verlanglijst gezet", knop wordt een vinkje |
| 6 | Nog eens op dezelfde klikken | "staat al in je collectie", niets overschreven |
| 7 | Filters → Status → **Verlanglijst** | De nieuwe titel staat erbij |
| 8 | Die openen → Bewerken → reeks **Pope** → Opslaan | Bewaard |
| 9 | Naar **Ontbreekt** | Blok "Je eigen reeksen" met *Pope — 1 in bezit · 1 nog te halen* |
| 10 | Een serie openen, bij een seizoen dat je mist | Naast *in bezit* staat nu *op verlanglijst* |
| 11 | Daarop klikken | Seizoen blijft "niet in bezit"; de teller op de kaart verandert niet |
| 12 | Filters → Formaat | Dat wens-seizoen voegt geen formaat toe aan je filters |

Test 11 en 12 zijn de belangrijkste: een wens mag nooit meetellen als bezit.

---

## 4. Geautomatiseerd nagekeken

**25 nieuwe controles, alle geslaagd.** Onder meer: de suggestielijst die aan
het reeksveld hangt en gevuld wordt met je bestaande reeksen (en geen lege
namen); een seizoen-wens die vastgelegd wordt zonder dat het seizoen als bezit
telt of een formaat krijgt; de knop **+ wens** die aantoonbaar een record met
`wishlist: true` wegschrijft en zichzelf daarna bevestigt; en op de pagina
Ontbreekt de eigen reeks met de juiste telling, terwijl een reeks die TMDb kent
er niet in staat en een eigen reeks zónder openstaande wensen ook niet.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24), 33 (37), 35 (41), 36 (31). Plus een nieuwe
Tailwind-build met dekkingscontrole en de gebruikelijke syntaxcontroles.

---

## 5. Commit-bericht

**Titel:**

```
FASE 37: eigen reeksen op Ontbreekt, verlanglijst in één klik (sw v38)
```

**Beschrijving:**

```
TMDb kent collecties alleen voor films. Twee series die elkaars vervolg zijn
(The Young Pope / The New Pope) staan daar volledig los van elkaar, dus dat
verband moet je zelf vastleggen via het reeksveld. Twee gaten in die weg:

- Het reeksveld was vrije tekst: een typfout en de twee titels bleven alsnog
  los. Nu een suggestielijst met de reeksen die je al gebruikt, plus uitleg
  onder het veld.
- De pagina Ontbreekt keek alleen naar reeksen die TMDb kent, dus je eigen
  reeksen waren daar onzichtbaar. Nieuw blok "Je eigen reeksen". Wat er
  ontbreekt kan de app niet zelf weten -- er is geen bron -- maar wel wat jij
  op je verlanglijst zette. Reeksen met een TMDb-collectie blijven in het
  andere blok, zodat ze niet twee keer verschijnen.

Verlanglijst:
- Kon alleen via het statusveld in het volledige toevoegformulier. Nu een knop
  "+ wens" op elk zoekresultaat: één klik, onthouden voorkeursformaat, geen
  formulier. Bestaat de titel al, dan wordt er niets overschreven.
- Seizoenen hadden alleen "in bezit". Nu ook "op verlanglijst", als exemplaar
  met wishlist: true -- het seizoen telt daardoor niet als bezit en voegt geen
  formaat toe aan de filters.

25 nieuwe geautomatiseerde controles geslaagd. Alle eerdere suites blijven
geslaagd (29: 41, 30: 39, 31: 50, 32: 24, 33: 37, 35: 41, 36: 31).
Details en testchecklist: FASE-37-eigen-reeksen-en-verlanglijst.md
```

---

## 6. Wat nog open staat

- **Punt 6 van je oude lijst:** de aanmelding die je onderbreekt tijdens het
  werken.
- **Hoesfoto's per seizoen-exemplaar** (uit FASE 35): de velden staan in het
  datamodel, het uploadscherm nog niet.
