# FASE 25 — Dataverlies dichten en correctheid herstellen

**Datum:** 30 juli 2026 · **Service worker:** `v23` → **`v24`**
**Basis:** de volledige analyse van 29 juli (`ANALYSE-2026-07-29.md`), blok A + B.

Deze fase raakt geen enkel ontwerp. Alles hieronder is een fout die stil
gebeurde: zonder melding, en zonder weg terug.

---

## 1. Blok A — vijf paden waarlangs je data verloor

### A1 · "Alles aan" overschreef titels die je al had

`bulk-import.js` — twee plekken.

"Alles aan" vinkte élke rij aan, óók de rijen die de app zelf als *"had je al"*
had gemarkeerd en daarom bewust had uitgevinkt. Toevoegen is voor een bestaande
titel namelijk **vervangen** (`movies[idx] = entry`), dus die titels verloren hun
bekeken-status, eigen score, kijklog, notities, boxset, locatie en **alle extra
exemplaren** — je 4K náást de DVD werd één vers exemplaar.

Nu: "Alles aan" slaat die rijen over, en stap 3 laat ze hoe dan ook staan, ook
als het vinkje er met de hand op gezet is. Je krijgt te lezen hoeveel er zijn
overgeslagen, zodat je niet denkt dat er iets stuk is.

> Bij je lijst van gisteren stond *"41 had je al"*. Dat waren de 41 titels die je
> kwijt zou zijn geweest.

### A2 · De hoesfoto-migratie voltooide nooit en draaide bij élk bezoek

`drive.js` — `driveMigrateCoversToFiles()`.

De migratie keek en schreef alleen op **titelniveau**. Maar `normalizeMovieEntry`
kopieert een oude data-URL vóóraf naar `editions[0]`, en
`syncLegacyFieldsFromEditions` zet het hoofdniveau daarna weer terug vanuit dat
exemplaar — waarmee het net toegekende Drive-bestand-ID werd weggegooid.

Nagebootst met je echte code, drie rondes vóór de wijziging:

```
ronde 1: migratie nodig=true | uploads=1
ronde 2: migratie nodig=true | uploads=2   ← identiek
ronde 3: migratie nodig=true | uploads=3   ← identiek
```

en erna:

```
ronde 1: te migreren=1 | uploads=1
ronde 2: te migreren=0 | uploads=1   ✓ klaar
ronde 3: te migreren=0 | uploads=1
```

De migratie werkt nu per exemplaar, met dezelfde bestandsnaam als het
bewerkpaneel (`<id>-<eid>`), en schrijft samenvoegend weg.

### A3 · Een tweede exemplaar overschreef de hoesfoto van het eerste

`add-title.js` — `addTitleSubmit()`.

Het bewerkpaneel gebruikte `item.id + '-' + ed.eid` als bestandsnaam, het
toevoegformulier alleen de slug. En `driveUploadCoverFile` overschrijft een
bestaand bestand met dezelfde naam. Voegde je de 4K toe van een film die je al op
DVD had, met foto's van het steelbook, dan was de foto van je DVD-doosje weg —
definitief, want de automatische backup dekt alleen `movies.json`.

Nu wordt het doel-exemplaar bepaald **vóór** de upload (bestaand formaat → dat
exemplaar; anders het volgende vrije id), en gebruikt het formulier dezelfde
sleutel als het bewerkpaneel. Bestaande foto's blijven gewoon werken: `movies.json`
bewaart het bestand-ID, niet de naam.

### A4 · "Alle delen van deze reeks toevoegen" kon een bestaande titel wissen

`add-title.js` — `addTitleAddWholeSaga()`.

De dubbelcheck keek alleen naar `tmdb_id`, terwijl het wegschrijven op `id`/slug
matcht en het record volledig vervangt. Had je een deel ooit langs een andere weg
toegevoegd, dan werd het opnieuw opgehaald en overschreven.

Nu wordt er op beide gecontroleerd, met een tweede zeef in de lus: de volledige
gegevens kunnen een andere titel — en dus een andere slug — opleveren dan de
reekslijst.

### A5 · Langlopende taken schreven een verouderde momentopname terug

`admin.js` (alles verversen), `price-app.js` (prijzen verversen), `drive.js`
(covermigratie) en de bulk-tab in `beheer.html`.

Alle vier lazen één keer in, werkten daarna minuten tot uren, en schreven dan de
**volledige lijst van dat oude moment** terug. `withWriteLock` beschermt alleen
de schrijfactie, niet het venster ertussen. Wijzigde je ondertussen iets op je
gsm, dan was dat weg — terwijl daar netjes "✓ opgeslagen" had gestaan.

Alle vier herlezen nu binnen de vergrendeling en voegen samen op `id`. Een titel
die je intussen verwijderde blijft verwijderd: we vervangen alleen wat de taak
zelf heeft aangeraakt, we voegen niets terug toe.

Gecontroleerd scenario:

```
pc ververst titel a  ·  gsm zet b op bekeken  ·  gsm verwijdert c
→ a is ververst ✓   b blijft bekeken ✓   c komt niet terug ✓
```

### A5b · De bulk-tab in Beheer wiste bovendien je seizoensbezit

Dezelfde tab deed voor bestaande titels `{...existing, ...details}`. Die spread
overschreef `seasons` met de verse TMDb-lijst — **zonder** je `owned`-vlaggen.
Ook zette hij het formaat op titelniveau, waar het bij de volgende lading toch
weer werd overschreven: je opgegeven formaat werd stilzwijgend genegeerd.

Nu gebruikt die tab `applyTmdbFields` (met whitelist, net als de rest van de
app), voegt een opgegeven formaat toe als **exemplaar**, schrijft per 25 weg, en
schakelt de knop uit tijdens de run zodat een tweede klik geen tweede run start.

---

## 2. Blok B — wat er stil verkeerd uitkwam

### B1 · Prijzen werden dubbel geteld

`app.js` en `stats.js`.

De terugval op het kale titel-id leverde voor **elk** exemplaar en **elk** seizoen
dezelfde meting op, en die werden opgeteld. Nagerekend, met één oude meting van
€20:

| | voor | na |
|---|---|---|
| 1 exemplaar | €20 | €20 |
| 2 exemplaren (DVD + 4K) | **€40** | €20 |
| 2× DVD (standaard + steelbook) | **€40** | €20 |
| 6 bezeten seizoenen | **€120** | €20 |
| echte metingen per formaat (€10 + €35) | €45 | €45 |

Elke meting telt nu hoogstens één keer mee. Komt een tweede regel op dezelfde
meting uit, dan staat daar geen bedrag: we weten simpelweg niet wat dát exemplaar
waard is.

De statistiekenpagina sloeg daarbij **gearchiveerde metingen** niet over, wat de
collectiepagina wel deed. Dat is nu gelijkgetrokken.

> Blijft open, bewust: de statistiekenpagina houdt munten apart (pond en euro
> naast elkaar), de collectiepagina rekent alles naar euro om. Beide zijn
> intern consistent en het staat allebei zo becommentarieerd. Wil je één van de
> twee, zeg het dan — dat is een keuze, geen fout.

### B2 · `content_type: 'animation'` haalde metadata van een andere film op

`admin.js`, `app.js`, `price-app.js`.

Overal stond `content_type === 'tv' ? 'tv' : 'movie'`. Voor een animatie**serie**
is `content_type` gelijk aan `'animation'`, dus viel dat terug op `movie` — met
een tv-id. TMDb heeft aparte, grotendeels overlappende id-reeksen, dus
`movie/<tv-id>` levert vaak een geldige maar volstrekt **andere film** op. Klikte
je "Gegevens verversen" op *Avatar: The Last Airbender* nadat je die op "Animatie"
had gezet, dan stond er daarna een andere film in je collectie.

Nieuw: `tmdbMediaTypeOf(item)` in `admin.js`, en `tmdb_media_type` wordt vanaf nu
bij elke titel meegeschreven. Voor bestaande records wordt het afgeleid uit de
aanwezigheid van seizoenen of `tv_status`. Oude records leren hun mediatype
kennen bij hun eerste verversing.

| invoer | uitkomst |
|---|---|
| animatieserie (heeft seizoenen) | `tv` |
| animatieserie (heeft `tv_status`) | `tv` |
| animatiefilm | `movie` |
| bewaard `tmdb_media_type` | wint altijd |

### B3 · Zeven kleinere fouten

| Wat er gebeurde | Waar |
|---|---|
| Een leeggemaakte reeksnaam trok élke titel zonder reeks mee: "1502/1508 in bezit" en duizenden rijen HTML per keer dat je die film opende. Nu wordt bij een lege naam ook `saga_id` gewist | `app.js` |
| Een verkocht seizoen bleef meetellen, waardoor de serie op "bekeken" sprong zodra je daarna nog één aflevering aanvinkte. Nu tellen alleen bezeten seizoenen mee — de geschiedenis blijft wél bewaard | `app.js` |
| "+ vandaag gezien" zette `watched` maar draaide dat niet terug bij een mislukte opslag | `app.js` |
| Seizoenacties verversten de filterchips niet, en heropenden de modal ook als je die net gesloten had | `app.js` |
| De dubbelcontrole meldde je DVD-standaard náást je DVD-steelbook als dubbel, negeerde het type (film vs. serie met dezelfde naam), en toonde "2×" zonder naam bij een exemplaar zonder formaat | `app.js` |
| "Wat kijken?" gooide alle titels zonder bekende speelduur weg zodra je een maximumduur koos | `app.js` |
| De plank bleef bij 0 resultaten de naam, het jaar en het sfeerlicht van de vórige titel tonen | `app.js` |
| Een klik op een genre wiste wel genre/decennium/letter maar niet formaat/type/status — met een lege lijst tot gevolg terwijl het filterpaneel dicht was. Nu wordt écht alles gewist, zoals het commentaar altijd al beloofde | `app.js` |
| "Annuleren" bij het benoemen van een universum voegde het universum tóch toe | `universes-page.js` |
| Twee knoppen bleven grijs na een mislukte Drive-aanroep, zonder melding | `add-title.js`, `bulk-import.js` |

---

## 3. Bestanden om te uploaden

**Samen uploaden** — ze verwijzen naar elkaar:

```
assets/app.js
assets/drive.js
assets/admin.js            ← nieuw: tmdbMediaTypeOf()
assets/add-title.js
assets/bulk-import.js
assets/price-app.js
assets/stats.js
assets/universes-page.js
beheer.html
index.html
sw.js                      ← VERSION = 'v24'
```

Na het uploaden: **Ctrl+Shift+R**.

> `index.html` bevat ook nog de prijs-pill-fix uit v23. Heb je die nog niet
> geüpload, dan zit hij hier gewoon bij.

De versiecontrole in `app.js` en `statistieken.html` kijkt nu ook naar
`tmdbMediaTypeOf`. Upload je `assets/admin.js` niet mee, dan krijg je bovenaan de
melding "Bestanden komen niet overeen" in plaats van een cryptische fout.

---

## 3b. Commit-bericht

Klaar om over te nemen in GitHub. **Titel** (het bovenste veld):

```
FASE 25: dataverlies dichten en correctheid herstellen (sw v24)
```

**Beschrijving** (het grote veld eronder):

```
Blok A - vijf paden waarlangs stil data verloren ging:
- "Alles aan" in de lijstinvoer overschreef titels die je al had (bekeken,
  score, kijklog, notities, extra exemplaren). Die worden nu overgeslagen.
- Covermigratie werkt per exemplaar. Ze voltooide nooit, omdat
  normalizeMovieEntry de data-URL terugzette uit editions[0], en draaide
  daardoor bij elk bezoek opnieuw.
- Toevoegformulier gebruikt <id>-<eid> als naam voor hoesfoto's, zodat een
  tweede exemplaar de foto van het eerste niet overschrijft.
- "Alle delen van deze reeks" controleert ook op slug, niet enkel op tmdb_id.
- Alles verversen, prijzen verversen, covermigratie en de bulk-tab in
  beheer.html herlezen binnen de schrijfvergrendeling en voegen samen op id
  in plaats van een verouderde momentopname terug te schrijven. Die bulk-tab
  wiste bovendien seizoensbezit via {...existing, ...details}.

Blok B - correctheid:
- Prijzen worden niet meer dubbel geteld: de terugval op het kale titel-id
  gaf elk exemplaar en elk seizoen dezelfde meting (6 seizoenen = 6x).
  Statistieken slaat nu ook gearchiveerde metingen over.
- Nieuw: tmdb_media_type + tmdbMediaTypeOf(). content_type 'animation' viel
  terug op movie met een tv-id, dus verversen haalde een andere film op.
- Lege reeksnaam wist nu ook saga_id; een verkocht seizoen telt niet meer
  mee voor "bekeken"; de dubbelcontrole kent uitvoeringen en content_type;
  plus zeven kleinere fouten.

Bevat ook de prijs-pill-fix (v23): het blok @media (pointer: coarse) stond
voor de klassen die het moest overschrijven, waardoor de pill een top en een
bottom kreeg en zich over de volle poster uitrekte.

40 geautomatiseerde controles geslaagd, plus syntaxcontrole op alle JS en
elk inline script. Details en testchecklist:
FASE-25-dataverlies-en-correctheid.md
```

---

## 4. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Alle vijf de pagina's openen, F12 → Console | Geen fouten, geen "Bestanden komen niet overeen" |
| 2 | Lijst invoeren met een paar titels die je al hebt, dan "Alles aan" | Die titels blijven **uit** staan |
| 3 | Die vinkjes met de hand aanzetten en toevoegen | Ze worden overgeslagen; de melding eindigt op "… overgeslagen (had je al)" |
| 4 | Een titel die je al hebt controleren na test 3 | Bekeken-status, score, notities en extra exemplaren staan er nog |
| 5 | `index.html` twee keer na elkaar openen | De banner "Hoesfoto's eenmalig optimaliseren…" verschijnt hoogstens één keer, en daarna nooit meer |
| 6 | Een film die je op DVD hebt, opnieuw toevoegen als 4K met een andere hoesfoto | Beide exemplaren hebben hun **eigen** foto; de DVD-foto is niet vervangen |
| 7 | Een serie: seizoen 1 uitkijken, seizoen 1 dan uit bezit halen, seizoen 2 aanvinken | De serie springt **niet** op "bekeken" |
| 8 | Een animatieserie op "Animatie" zetten en "Gegevens verversen" klikken | De juiste serie blijft staan — geen wildvreemde film |
| 9 | Een titel met twee exemplaren waarvan er maar één prijsdata heeft | De waarde-pill toont dat bedrag **één** keer |
| 10 | Statistieken openen | Richtwaarde ligt niet meer hoger dan de som op de collectiepagina |
| 11 | Bij een film het reeksveld leegmaken en opslaan, dan die film openen | Het reeksblok is weg — geen "1502/1508 in bezit" |
| 12 | In de detailweergave op een genre klikken terwijl "Niet bekeken" aanstaat | Alle filters worden gewist; je krijgt gewoon dat genre te zien |
| 13 | Universums → trefwoord zoeken → Toevoegen → **Annuleren** in het naamvenster | Er wordt niets toegevoegd, de knop werkt weer |
| 14 | Beheer → Bulk (lijst) met ±30 regels | Voortgang per blok van 25; de knop is grijs tijdens de run |
| 15 | "Alles verversen" starten en ondertussen op je gsm een titel op bekeken zetten | Dat vinkje staat er na afloop nog steeds |

Test 15 is de belangrijkste van deze fase: dat is het pad waarlangs je het
stilst data verloor.

---

## 5. Geautomatiseerd nagekeken

40 controles gedraaid tegen de gewijzigde code, alle geslaagd:

- **Lijstinvoer (9):** "Alles aan" laat bestaande titels met rust; handmatig
  aangevinkte bestaande titels worden alsnog overgeslagen en gemeld; een
  mislukte Drive-aanroep laat de knop bruikbaar met een leesbare fout.
- **Covermigratie (5):** voltooit in één ronde en herhaalt zich niet; twee
  exemplaren krijgen elk hun eigen bestand.
- **Prijzen (6):** de vijf dubbeltel-scenario's geven nu het juiste bedrag,
  terwijl echte metingen per formaat wél blijven optellen.
- **Mediatype (6):** alle zes de gevallen rond `animation`.
- **Samenvoegend opslaan (3):** verversing doorgevoerd, vreemd vinkje bewaard,
  verwijderde titel niet teruggekomen.
- **Seizoenen (3), dubbels (4), lege reeksnaam (2), toegangscontroles (2).**

Daarnaast: syntaxcontrole op alle negen JS-bestanden, `sw.js`, en elk inline
script in de vijf HTML-pagina's.

---

## 6. Wat hierna nog openstaat

Uit de analyse van 29 juli, nog niet aangepakt:

**Blok C — het afmaken:** filter op uitvoering (steelbook/limited/extended/
director's cut); `priceUntrackTitle()` aan een knop hangen; de vier ontbrekende
velden naar `beheer.html`; service worker registreren op `prijzen.html`; het
README herschrijven naar de Drive-werkwijze.

**Blok D — gsm en gebruiksgemak:** `srcset` op de posters; leesmodus vóór het
inlogscherm (de winkeltaak); de opslag-indicator als toast; laadtoestanden op
drie pagina's; snelblik overslaan op touch; Tailwind lokaal compileren.

**Uit de doorlichting van 28 juli:** F1/F2 (`addSagaPartToWishlist` maakt een
titel zonder `editions[]`, en `saveEditPanel` laat de Opslaan-knop daarna dood),
F3 (hoesfoto's blijven achter bij verwijderen) en F4 (blob-URL's worden nooit
vrijgegeven).

**Veiligheid:** trek de oude GitHub-token in als je die ooit hebt aangemaakt;
rate limiting op de Cloudflare Worker; `price_history.json` mee in de
automatische backup.
