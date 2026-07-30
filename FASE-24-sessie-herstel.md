# FASE 24 — Verlopen Google-sessie netjes opvangen

**Datum:** 28 juli 2026
**Aanleiding:** bij het toevoegen van een lijst van 250 titels verscheen
`✗ Cannot set properties of null (setting 'textContent')` en waren de 199
opgezochte titels verloren.

---

## 1. Wat er werkelijk aan de hand was

De melding die je zag was niet de fout. Het was de **foutmelding die zelf
stukliep** op de fout die hij moest tonen.

De keten, van achter naar voren:

1. Een Google-token is één uur geldig. Tijdens het opzoeken van 250 titels
   (minuten werk) verliep het.
2. Bij de eerste Drive-schrijfactie probeerde `ensureToken()` het stil te
   vernieuwen met `prompt: ''`. Dat mislukt in deze app altijd — dat staat zelfs
   in je eigen commentaar bij `driveSignIn`: *"twee keer getest en beide keren
   lag de inlogknop plat"*.
3. Google meldde die mislukking via `error_callback` → `onTokenError` →
   `reportError` → `window._driveError`.
4. `_driveError` schreef naar `#login-status`. Maar dat element zat ín
   `#login-gate`, en dat werd bij het inloggen **verwijderd** met `.remove()`.
   Dus: `null.textContent` → TypeError.
5. Die TypeError kwam uit `requestAccessToken()` naar boven, verwierp de belofte
   van `ensureToken()`, en belandde in de `catch` van de lijstinvoer — waar hij
   werd afgedrukt in plaats van de echte oorzaak.

Daar bovenop kwam nog dat **alles pas aan het eind in één keer werd
weggeschreven**. Eén mislukte schrijfactie = al het opzoekwerk kwijt.

En er was geen weg terug: het inlogscherm was verwijderd, dus opnieuw inloggen
kon alleen door de pagina te herladen.

---

## 2. Wat er is veranderd

### `assets/drive.js` — het zwaartepunt

**Inlogpoort centraal en null-veilig.** Nieuwe functies `driveGateStatus()`,
`driveGateHide()`, `driveGateShow()` en `driveIsSignedIn()`. Ze werken allemaal
ook op een pagina waar de poort niet (meer) bestaat: geen enkele schrijfactie
naar `#login-status` kan nog crashen.

**De poort wordt verborgen, niet verwijderd.** Daardoor kan ze bij een verlopen
sessie terugkomen — met de inlogknop die er nog gewoon in zit en werkt.

**`notifyAuthenticated()` geeft het startsein maar één keer.** Log je later
opnieuw in, dan wordt niet de hele pagina opnieuw opgebouwd (dubbele listeners,
dubbele modals), maar de nieuwe haak `window._driveReauthenticated` aangeroepen.

**`storeToken()` afgesplitst van `onTokenResponse()`.** Een vernieuwd token
bewaren mag de pagina niet opnieuw laten opstarten; dat hoort alleen bij een
echte nieuwe aanmelding.

**`driveSessionExpired()`** gooit het token weg en brengt de poort terug met:
*"Je Google-sessie is verlopen. Log opnieuw in om verder te gaan — je gegevens
blijven bewaard."*

**`ensureToken()` herschreven** (het vernieuwen zit nu in `renewToken()`):

- `silentAttemptInProgress` gaat aan, zodat een mislukte stille poging niet als
  gewone inlogfout wordt gemeld.
- Ook `error_callback` wordt tijdelijk overgenomen. Google meldt een mislukte
  stille poging dáár, niet via de gewone callback — zonder dit bleef de belofte
  eeuwig open staan en **hing de app** in plaats van te falen.
- Tijdslimiet van 20 seconden, zodat uitblijvend antwoord ook een duidelijke
  fout geeft.
- Loopt er al een vernieuwing (collectie én prijzen laden tegelijk), dan wachten
  alle aanroepers op diezelfde poging. Voorheen overschreven twee gelijktijdige
  pogingen elkaars callbacks.
- De fout die naar boven komt is nu Nederlands en zegt wat je moet doen.

### `assets/bulk-import.js` — in blokken opslaan

Stap 3 schrijft nu per **25 titels** weg in plaats van alles aan het eind:

- Wat opgeslagen is, blijft opgeslagen.
- Geslaagde rijen gaan automatisch uit het vinkje; de rest blijft aangevinkt.
- Bij een fout: *"25 opgeslagen, daarna gestopt: … — de rest staat nog
  aangevinkt, klik opnieuw om verder te gaan."* Eén klik maakt het af.
- Titels die bij TMDb niet opgezocht konden worden, komen in de console te staan
  in plaats van alleen als aantal.

### De vijf pagina's

`_driveError` gebruikt overal `driveGateShow(...)` en `.remove()` is weg.
Verder:

| Pagina | `_driveReauthenticated` |
|---|---|
| `index.html` | `__collectionReload()` — alleen de collectie opnieuw ophalen |
| `statistieken.html` | `location.reload()` — pure weergave, niets te verliezen |
| `universums.html` | `location.reload()` — idem |
| `prijzen.html` | geen — poort verdwijnt, je herhaalt je actie |
| `beheer.html` | geen — een formulier mag niet onder je handen weglopen |

In `index.html` is bovendien de `driveOnReady`-melding null-veilig gemaakt en
alleen actief zolang je niet ingelogd bent. Die schreef **bij elke paginalading**
een stille TypeError in je console: de Google-bibliotheek is asynchroon, dus die
callback liep altijd ná het verwijderen van de poort. Ook de iPhone-melding
verderop is nu null-veilig.

### `index.html` — de verticale prijs-pill (toevoeging 29 juli)

De prijs-pill rekte zich op gsm uit over vrijwel de volledige poster. De vorige
poging (`white-space: nowrap` in v21) loste het niet op, omdat het niet aan het
afbreken van tekst lag.

De echte oorzaak: het blok `@media (pointer: coarse)` stond **middenin** het
stijlblok (regel 177), vóór de klassen die het moest overschrijven (regel 231 tot
493). Bij gelijke specificiteit wint de laatste regel. Gevolg per regel:

| Aanraakregel | Basisregel later? | Uitkomst |
|---|---|---|
| `.value-badge { top: auto; bottom: .5rem }` | `top` wél, `bottom` niet | **half toegepast**: top én bottom actief, geen hoogte → pill rekt uit over de hele poster |
| `.chip { padding: .55rem 1rem }` | ja | deed niets — chips bleven 27 px |
| `.letter-chip { min-width: 2.25rem }` | ja | deed niets |
| `.delete-btn { opacity: 1; 2rem }` | ja | deed niets — verwijderknop bleef onzichtbaar op touch |
| `.watched-dot { left: 2.9rem }` | ja | deed niets |
| `.nav-link`, `select`, `input[type=search]` | nee | werkten wel |

Het blok staat nu **onderaan** het stijlblok, met een waarschuwing erboven dat
het daar moet blijven. Daarmee is de pill hersteld én werken de vier
aanraakverbeteringen voor het eerst.

Eén aanpassing binnen het blok: de bekeken-stip gaat nu naar bovenaan, naast de
verwijderknop, in plaats van naast de pill. Bij een bedrag van vier cijfers is de
pill 53 px breed en lag de stip eronder; rechtsonder zit al de seizoenenteller.

Gemeten in Chromium op een viewport van 390 px met aanraakscherm:

| | voor | na |
|---|---|---|
| hoogte prijs-pill | 254 px (94% van de poster) | **16 px** |
| chip-hoogte | 27 px | **34 px** |
| letterchip | 27×24 px | **36×32 px** |
| verwijderknop | 26 px, `opacity: 0` | **32 px, zichtbaar** |
| overlappende elementen op de poster | — | **geen**, op gsm én desktop |

**Let op:** de verwijderknop op de poster is hierdoor voor het eerst zichtbaar op
je gsm (32 px, linksboven). Dat is wat de code altijd bedoelde, maar het is wel
nieuw gedrag. Bevalt het niet, dan is het één regel om hem op aanraakschermen
weg te laten — in de detailmodal staat "Volledige titel verwijderen" ook.

### `sw.js`

`VERSION` van `v21` naar **`v23`** (v22 was de sessie-herstelwijziging, v23 voegt
de pill-fix toe — in één keer uploaden).

---

## 3. Bestanden om te uploaden

Deze horen bij elkaar — **samen uploaden**, anders klopt de ene helft niet met
de andere:

```
assets/drive.js          ← kern van de wijziging
assets/bulk-import.js
index.html
beheer.html
prijzen.html
statistieken.html
universums.html
sw.js                    ← VERSION = 'v23'
```

Na het uploaden: **Ctrl+Shift+R**.

---

## 4. Testchecklist

**Eerst controleren wat er van je 250-titellijst wél is aangekomen.** De fout
sloeg toe vóór het wegschrijven, dus vermoedelijk niets — maar kijk je aantal na
in de collectie voordat je opnieuw begint.

| # | Test | Verwacht |
|---|---|---|
| 1 | Open `index.html`, F12 → Console | Geen enkele `Cannot set properties of null`. Die verscheen voorheen bij élke lading |
| 2 | Normaal inloggen | Poort verdwijnt, collectie verschijnt — zoals altijd |
| 3 | Naar Statistieken, Prijzen, Universums, Beheer | Alle vier openen zonder inlogscherm en zonder consolefouten |
| 4 | Lijst van ±60 titels invoeren | Voortgang loopt door, dan per blok "Blok opslaan naar Drive… (25/60)", "(50/60)", "(60/60)", en tot slot "✓ 60 toegevoegd" |
| 5 | Verlopen sessie namaken: F12 → Application → Local Storage → `mediacollectie_drive_token` verwijderen, dan iets bewerken (bv. een titel als gezien markeren) | Het inlogscherm komt terug met "Je Google-sessie is verlopen…" — géén TypeError |
| 6 | In dat scherm op "Inloggen met Google" klikken | Je logt in, de poort verdwijnt, de collectie wordt vers opgehaald. **Niet** dubbele modals of dubbele knoppen |
| 7 | Test 5 herhalen, maar dan tijdens een lijstinvoer van ±60 | Melding "… opgeslagen, daarna gestopt: Je Google-sessie is verlopen…" met de rest nog aangevinkt |
| 8 | Na opnieuw inloggen nogmaals op "Toevoegen aan collectie" klikken | Alleen de resterende titels worden toegevoegd, geen dubbels |
| 9 | Op gsm: installeer/verver de PWA | Nieuwe schil wordt opgehaald dankzij `v23` |
| 10 | Op gsm naar de collectie kijken | De prijs-pill is een klein rond label linksonder op de poster, niet meer een verticale strook |
| 11 | Op gsm een filterchip aanraken | Chips zijn merkbaar hoger (34 px) en makkelijker te raken dan voorheen |
| 12 | Op gsm naar een poster kijken | Linksboven staat nu een verwijderknop van 32 px. Dit is nieuw — laat weten of je hem daar wil houden |

Test 5 is de belangrijkste: dat is precies het scenario dat vandaag stukliep.

---

## 5. Geautomatiseerd nagekeken

Vóór oplevering zijn 27 controles gedraaid tegen de gewijzigde code:

- **drive.js (12):** foutmelders crashen niet zonder inlogscherm; poort verbergen
  en terugbrengen; token gewist bij verlopen sessie; startsein precies één keer;
  mislukte stille vernieuwing geeft een Nederlandse melding zonder TypeError;
  drie gelijktijdige aanroepen delen één aanvraag bij Google.
- **bulk-import.js (15):** 60 titels in 3 blokken; bij een fout in blok 2 blijven
  de eerste 25 bewaard, stopt de lus, en blijft de rest aangevinkt; een tweede
  klik maakt het af zonder dubbels.

Alle 27 geslaagd. Daarnaast is de syntaxis van alle gewijzigde JavaScript en van
elk inline script in de vijf HTML-pagina's gecontroleerd.

---

## 6. Wat hierna nog open staat

Uit de doorlichting van vandaag, nog niet aangepakt:

- **F1/F2** — "+ verlanglijst" bij een ontbrekend reeksdeel maakt een titel
  zonder `editions[]`, en zet daarna de Opslaan-knop permanent uit.
- **F3** — hoesfoto's blijven achter in Drive na verwijderen.
- **F4** — blob-URL's van hoesfoto's worden nooit vrijgegeven (geheugenlek op gsm).
- **Filter op uitvoering** — steelbook/limited/extended/director's cut staan in de
  data maar je kan er niet op filteren.
- **`srcset` op de rasterposters** — grootste mobiele winst, kleinste ingreep.
- **README** beschrijft nog de oude GitHub-token-werkwijze in plaats van Drive.
