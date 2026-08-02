# FASE 40 — Verzamelaarsvelden (blok D)

**Datum:** 2 augustus 2026 · **Service worker:** `v40` → **`v41`**
**Volgt op:** de doorlichting van 2 augustus, §7 — *wat je niet kan vastleggen*.

---

## ⬆ UPLOADCHECKLIST

- [ ] `index.html`
- [ ] `beheer.html`
- [ ] `statistieken.html`
- [ ] `assets/drive.js`
- [ ] `assets/app.js`
- [ ] `assets/add-title.js`
- [ ] `assets/stats.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v41'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek in je repo op `COLLECTOR_FIELDS`
> (drive.js), `data-edit-collector` (index.html), `form-collector`
> (index.html én beheer.html), `loaned-chips` (index.html) en `spend-kpis`
> (statistieken.html én stats.js).

Deze negen horen bij elkaar: `app.js`, `add-title.js` en `stats.js` bouwen hun
invoervelden op uit één lijst in `drive.js`. Laad je `drive.js` niet mee, dan
blijven de vakjes leeg.

---

## 1. Waarom dit vóór de rest komt

Uit de doorlichting: het datamodel was rijk aan *wat een film is* — regie, cast,
genre, rating, poster — en arm aan *wat een schijf is*. Wat je ervoor betaalde,
in welke staat hij is, aan wie je hem uitleende, hoeveel schijven erin zitten:
daar was nergens plaats voor. Alles moest in het vrije opmerkingenveld, en dat
werd niet eens doorzocht.

Ik raadde aan dit meteen na het dataverlies te doen, en niet later, om één
reden: elke titel die je vanaf nu invoert zonder aankoopprijs moet later
opnieuw langs. En je bent nu actief aan het invoeren.

---

## 2. Acht velden, per exemplaar

Niet per titel — **per exemplaar**. Je DVD en je 4K-steelbook van dezelfde film
hebben elk hun eigen prijs, staat en regiocode. Seizoenen krijgen ze ook: een
seizoen-exemplaar is een schijf als elke andere.

| Veld | |
|---|---|
| **Betaald (€)** | Wat jij ervoor gaf |
| **Gekocht op** | Datum |
| **Staat** | Nieuw (geseald) · Als nieuw · Goed · Redelijk · Matig |
| **Uitgeleend aan** | Leeg = staat in je kast |
| **Regiocode** | Regiovrij, DVD 1-6, Blu-ray A/B/C |
| **Aantal schijven** | |
| **Talen** | Vrije tekst, bv. *NL, EN, FR* |
| **Ondertitels** | Vrije tekst |

### Waar je ze invult

Op **drie** plekken, en alle drie bouwen ze zich op uit dezelfde lijst in
`drive.js`. Dat is met opzet: precies zó groeide de universumpagina uit elkaar
met de rest en miste ze jarenlang `added_at`. Voeg ik later een veld toe, dan
verschijnt het overal tegelijk.

1. **Bij het toevoegen** — een dichtgeklapt blok *Verzamelaarsgegevens
   (optioneel)*. Dicht kost het niets, dus snel invoeren blijft snel; open je
   het, dan hoef je de titel later niet opnieuw langs voor een prijs die je nu
   nog weet.
2. **Bij ✎ Bewerken** — hetzelfde blok. Staat er al iets in, dan gaat het
   meteen open en zie je op het kopje hoeveel er ingevuld is.
3. **Bij een seizoen-exemplaar** — in het kleine scherm dat je krijgt via
   *bewerken* naast een seizoen.

### Één regel die ik bewust zo gehouden heb

**Leeg blijft leeg.** Een exemplaar zonder prijs telt niet als € 0. Anders zou
"nog niet ingevuld" er in de statistieken uitzien als "gratis gekregen", en zou
het totaal stiller zakken naarmate je méér toevoegt. Vul je onzin in een
getalveld, dan wordt het leeg — niet 0.

En: na het opslaan van een titel wordt het formulier echt leeggemaakt. Voeg je
tien titels na elkaar toe, dan erft de elfde niet de prijs van de tiende.

---

## 3. Je aantekeningen zijn eindelijk doorzoekbaar

Tot nu toe zocht het zoekveld in titel, originele titel, cast, regie, scenario
en reeks. Níet in wat jíj erbij schreef — terwijl daar tot vandaag alles in
stond wat het datamodel niet kon opslaan.

Nu zoekt het ook in opmerkingen, boxset, locatie, aan wie je iets uitleende, en
de talen en ondertitels op de schijf — van films én van seizoenen. Zoek je op
*zolder*, dan krijg je alles wat daar ligt. Zoek je op de naam van je broer,
dan zie je wat hij nog heeft.

Dat kost niets aan snelheid: de eigen tekst van een titel wordt één keer
samengesteld en onthouden tot je die titel bewerkt. Gemeten met 680 titels op
een gsm-profiel is de zoektijd exact gelijk gebleven.

---

## 4. Uitgeleend als filter

Naast *Bekeken* staat nu **Uitgeleend**, met twee chips: *Uitgeleend* en *In je
kast*. Kijkt naar al je exemplaren, ook die van seizoenen — leen je seizoen 2
uit, dan zie je die serie hier staan. Een verlanglijst-exemplaar telt nooit
mee; je kan niet uitlenen wat je niet hebt.

---

## 5. Toevoegdatum aanpasbaar

`date_added` was altijd "vandaag" en nergens te wijzigen. Bij het invoeren van
een bestaande collectie is die datum als sorteersleutel daardoor waardeloos —
alles komt op de dag van invoeren te staan.

In het bewerkpaneel staat nu **Toegevoegd aan je collectie op**. Wijzig je die,
dan schuift de titel ook echt op zijn plek in *Onlangs toegevoegd* (de
volgorde binnen één dag hangt aan `added_at`, en die wordt meegezet).

---

## 6. Wat je betaalde — nieuw blok in de statistieken

Boven *Geschatte collectiewaarde* staat nu **Wat je betaalde**. Dat is het enige
bedrag op die pagina dat je zélf hebt ingevoerd en dus zeker weet; de rest is
een schatting op basis van eBay.

- Totaal betaald, met erbij over hoeveel exemplaren dat gaat
- Gemiddeld per schijf
- Je duurste aankoop, met de titel erbij
- Hoeveel exemplaren nog géén prijs hebben — zodat je ziet hoe compleet het is
- Een verdeling per formaat

Verlanglijst-exemplaren tellen niet mee. Heb je nog niets ingevuld, dan zegt het
blok waar je het veld vindt in plaats van een lege grafiek te tonen.

---

## 7. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Een titel openen → **✎ Bewerken** | Blok *Verzamelaarsgegevens* onderaan |
| 3 | Openklappen, prijs `19,99`, staat *Als nieuw*, uitgeleend aan *Peter*, 2 schijven → Opslaan | Melding opgeslagen |
| 4 | Kijk bij **Mijn exemplaren** | €19,99 · Als nieuw · ↗ uitgeleend aan Peter · 2 schijven — in het goud |
| 5 | Opnieuw Bewerken | Het blok staat meteen open, alles staat er nog |
| 6 | In hetzelfde paneel: **Toegevoegd op** naar een oude datum → Opslaan → sorteren op *Onlangs toegevoegd* | De titel schuift naar achteren |
| 7 | Zoekveld: de naam *Peter* | Die titel komt boven |
| 8 | Zoekveld: een woord uit een opmerking of je locatie | Idem |
| 9 | Filters → **Uitgeleend** | Alleen wat je uitleende |
| 10 | Filters → **In je kast** | De rest |
| 11 | Een serie openen → bij een seizoen op **bewerken** | Zelfde blok, met prijs en uitgeleend-aan |
| 12 | Prijs invullen → Bewaren | Staat op de regel van dat seizoen-exemplaar |
| 13 | **+ Titel toevoegen** → een titel kiezen → blok openklappen, prijs invullen → Toevoegen | Bewaard |
| 14 | Meteen nog een titel toevoegen | Het prijsveld is **leeg** — geen erfenis van de vorige |
| 15 | **Statistieken** → blok *Wat je betaalde* | Totaal, gemiddelde, duurste, en hoeveel er nog geen prijs hebben |
| 16 | Beheer → collectie verversen met TMDb → terug naar die titel | Prijs, staat en uitgeleend-aan staan er nog |

Test 4, 14 en 16 zijn de belangrijkste: dat je het terugziet, dat je het niet
per ongeluk aan de verkeerde titel hangt, en dat een verversing het niet wist.

---

## 8. Geautomatiseerd nagekeken

**76 nieuwe controles, alle geslaagd.**

Onder meer: alle acht velden aanwezig op zowel een titel- als een
seizoen-exemplaar, ook bij een oude titel die ze nog niet had; een prijs die een
getal wordt en onzin die leeg wordt in plaats van 0; twee keer normaliseren dat
niets verandert; het bewerkpaneel dat de velden bewaart én weer terugtoont bij
heropenen; een gewijzigde toevoegdatum die de sorteervolgorde echt verandert;
zoeken op een opmerking, een locatie, een uitleennaam, een taal en een boxset
van een seizoen; de zoektekst die meteen klopt na een bewerking; het filter
uitgeleend dat ook seizoenen ziet en verlanglijst-exemplaren overslaat; het
seizoenscherm met dezelfde velden; het toevoegformulier dat leeggemaakt wordt na
opslaan; het statistiekenblok met een uitgerekend totaal van € 60,00 waarin de
wenstitel van € 99 níet meetelt; en de velden die een TMDb-verversing overleven.

Van de zoekcontroles heb ik nagekeken dat ze rood worden op de code van vóór
deze fase — anders weet je niet of een test iets meet.

**Gemeten op een gsm-profiel** (390×844, 3× dichtheid, processor 4× vertraagd,
680 titels): zoektijd identiek aan die vóór deze fase, geheugen onveranderd op
10 MB, DOM onveranderd op 1290 elementen.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24 + 16), 33 (37 + 16), 34 (16), 35 (41), 36 (31),
37 (25), 38 (20), 39 (64). Plus een nieuwe Tailwind-build met dekkingscontrole
en de vergelijking van 327 elementen × 32 eigenschappen — geen enkel verschil.

Twee dingen aan het testharnas zelf rechtgezet: de statistiekenpagina bleef in
tests eeuwig wachten op een Drive-token (waardoor die pagina nul dekking had —
dat stond ook in de doorlichting), en één FASE 38-test keek na een vaste
wachttijd in plaats van te wachten tot het werk klaar was.

---

## 9. Commit-bericht

**Titel:**

```
FASE 40: verzamelaarsvelden per exemplaar, doorzoekbare aantekeningen, wat je betaalde (sw v41)
```

**Beschrijving:**

```
Blok D uit de doorlichting van 2 augustus. Het datamodel was rijk aan wat een
film is en arm aan wat een schijf is: aankoopprijs, staat, uitgeleend aan,
regiocode, aantal schijven, talen -- nergens plaats voor. Alles moest in het
vrije opmerkingenveld, dat niet eens doorzocht werd.

- Acht velden per exemplaar (niet per titel): purchase_price, purchase_date,
  condition, loaned_to, region, disc_count, languages, subtitles. Ook op
  seizoen-exemplaren.
- Eén definitie in drive.js (COLLECTOR_FIELDS); het bewerkpaneel, het
  toevoegformulier en het seizoen-exemplaarscherm bouwen zich daaruit op. Zo
  kan er geen scherm meer achterblijven -- precies hoe de universumpagina
  added_at nooit kreeg.
- Leeg blijft leeg: een exemplaar zonder prijs telt niet als 0, anders ziet
  "nog niet ingevuld" eruit als "gratis gekregen". Het toevoegformulier wordt
  na opslaan echt leeggemaakt, zodat de volgende titel de prijs van de vorige
  niet erft.
- Zoeken kijkt nu ook in je eigen aantekeningen: opmerkingen, boxset, locatie,
  uitgeleend aan, talen en ondertitels -- van films en van seizoenen. De eigen
  tekst wordt per titel onthouden tot je hem bewerkt; gemeten op gsm met 680
  titels is de zoektijd onveranderd.
- Filterchips "Uitgeleend" en "In je kast", die ook seizoen-exemplaren zien.
  Verlanglijst-exemplaren tellen niet mee.
- date_added is aanpasbaar in het bewerkpaneel; added_at schuift mee, zodat de
  volgorde bij "Onlangs toegevoegd" ook echt verandert. Bij het invoeren van
  een bestaande collectie was die datum als sorteersleutel waardeloos.
- Nieuw statistiekenblok "Wat je betaalde": totaal, gemiddelde, duurste
  aankoop, hoeveel exemplaren nog geen prijs hebben, en een verdeling per
  formaat. Het enige bedrag op die pagina dat je zelf weet.
- De formaatkeuze bij een seizoen toonde drie van de zes formaten; nu de echte
  lijst.

76 nieuwe geautomatiseerde controles geslaagd, waarvan de zoekcontroles
aantoonbaar rood op de oude code. Alle eerdere suites blijven geslaagd.
Details en testchecklist: FASE-40-verzamelaarsvelden.md
```

---

## 10. Wat hierna komt

Volgens het advies uit de doorlichting: **blok B — de app afmaken**.
Verlanglijst zichtbaar in de kop, ongedaan maken na verwijderen, de pagina
Ontbreekt bruikbaar met acties en afdrukken, twee dode links, dubbele
invoerroutes uit Beheer schrappen, één naam voor één actie, filters onthouden.
Daarin zit ook **punt 6 van je oude lijst**: de aanmelding die je onderbreekt
tijdens het werken.

Daarna **blok C — snelheid en toegankelijkheid**.

Nog open uit FASE 35: **hoesfoto's per seizoen-exemplaar**. De velden staan in
het datamodel en worden sinds FASE 39 netjes bewaard, maar het uploadscherm
ontbreekt nog.
