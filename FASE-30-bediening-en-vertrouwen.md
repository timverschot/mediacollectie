# FASE 30 — Bediening en vertrouwen

**Datum:** 30 juli 2026 · **Service worker:** `v28` → **`v29`**
**Aanleiding:** de punten uit de analyse over bediening — plekken waar de app
je liet raden of iets gelukt was, of je tegenhield zonder reden.

> Volgorde hierna: 31 veiligheid en opruimen, 32 datamodel,
> 33 consistentie en toegankelijkheid.

---

## 1. Leesmodus — kijken zonder inloggen

Het inlogscherm blokkeerde alles. Sta je in een winkel met slecht bereik, dan
wil je meestal één ding weten: *heb ik deze al?* Dat antwoord stond al in je
toestel — elke geslaagde ophaling wordt lokaal bewaard — maar je kwam er niet
bij zonder eerst een Google-scherm door te worstelen.

Op het inlogscherm staat nu, als er zo'n kopie is, een tweede knop:
**Bekijken zonder inloggen**, met eronder hoeveel titels het zijn en van wanneer
de kopie is. Eén tik en je collectie staat er.

**Wijzigen kan niet in leesmodus**, en dat is met opzet: die kopie kan dagen oud
zijn, en wegschrijven zou je echte collectie kunnen overschrijven. Alle
schrijfwegen lopen langs één controle (`requireWrite`). Probeer je toch iets te
verwijderen of aan te passen, dan gebeurt er niets en zegt een melding waarom.

Onderaan blijft een balkje staan: *Leesmodus — kopie van 20/07 19:30*, met een
**Inloggen**-knop. Log je in, dan begint de pagina opnieuw — schoner dan de app
half omschakelen.

Lezen mag wél gewoon: filteren, zoeken, detailschermen, **Dubbels** en
**Wat kijken?** werken allemaal.

> Nevenvangst: die twee knoppen werden alleen gekoppeld ná het inloggen. Ze
> stonden er dus altijd, maar deden vóór het inloggen niets — een dode klik.
> Nu worden ze in beide gevallen gekoppeld.

---

## 2. Meldingen waar je kijkt

De opslagstatus was een klein bolletje in de kop. Die kop scrollt weg en is op
een telefoon vrijwel nooit in beeld op het moment dat er iets gebeurt. Je zag
dus niet dat een wijziging *niet* bewaard was.

Meldingen verschijnen nu onderaan, boven de home-balk:

| | |
|---|---|
| Bezig | *Opslaan…*, goudkleurige rand |
| Gelukt | *✓ Opgeslagen*, verdwijnt na een paar seconden |
| Mislukt | rode rand, **blijft staan** tot je hem sluit, mét de reden |

De `alert()` bij een mislukte opslag is weg. Die onderbrak alles, moest
weggeklikt worden vóór je iets kon zien, en liet daarna geen spoor na. De
melding onderaan blijft juist staan.

De indicator in de kop blijft bestaan voor wie op een breed scherm werkt.

---

## 3. Escape sluit één laag

De Escape-keten sloot lagen in een vaste volgorde, maar met twee gaten:

- De modal **"+ Titel toevoegen"** zat er helemaal niet in. Escape deed daar
  niets, terwijl dat scherm op een gsm het hele beeld vult.
- De laatste stap was altijd `closeModal()`, ook als er níets openstond.

Nu is het één lijst in dezelfde volgorde als de lagen boven elkaar liggen:
foto → aflevering → titel toevoegen → wat kijken → dubbels → persoon → reeks →
detail → filterpaneel → selectiemodus. Staat er niets open, dan doet Escape wat
de browser normaal doet (bijvoorbeeld een zoekveld leegmaken).

**En de lightbox heeft een sluitknop gekregen.** Je kon een foto alleen sluiten
door ernáást te klikken of op Escape te drukken — op een telefoon vult de foto
het hele scherm en heb je geen Escape-toets. De knop is 44 px, staat
rechtsboven en houdt rekening met de inkeping en de statusbalk.

---

## 4. Twee lege toestanden in plaats van één

Er stond altijd dezelfde zin: *"Geen titels gevonden met deze filters."* Ook
wanneer je collectie gewoon nog leeg was — dan stuurt die zin je op zoek naar
filters die je nooit hebt aangezet.

| Situatie | Wat er nu staat |
|---|---|
| Collectie is leeg | **Je collectie is nog leeg** + knop *+ Eerste titel toevoegen* |
| Filter levert niets op | **Niets gevonden** — "geen van je 137 titels past bij deze zoekopdracht en filters" + knop *Alle filters wissen* |

In leesmodus staat er bij de eerste geen knop maar de uitleg dat je moet
inloggen om toe te voegen.

---

## 5. Geen dode kliks meer zonder TMDb-sleutel

Zonder TMDb-sleutel opende **+ Titel toevoegen** gewoon, en pas nadat je een
titel had ingetypt en op Zoeken had geklikt kwam er een pop-up dat er een
sleutel ontbreekt. Nu staat het er meteen bij het openen, met een directe link
naar **Beheer → Instellingen**. Zodra er een sleutel is, verdwijnt de melding.

---

## 6. Bestanden om te uploaden

**Samen uploaden:**

```
assets/app.js
index.html
sw.js                          ← VERSION = 'v29'
FASE-30-bediening-en-vertrouwen.md   ← nieuw
```

Na het uploaden: **Ctrl+Shift+R**.

---

## 7. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | Een titel op bekeken zetten | Onderaan "Opslaan…", daarna "✓ Opgeslagen" |
| 3 | Wifi uitzetten en iets wijzigen | Rode melding die blíjft staan, met een sluitknop; wijziging teruggedraaid |
| 4 | Uitloggen (of privévenster) en de site openen | Inlogscherm mét **Bekijken zonder inloggen** en het aantal titels |
| 5 | Daarop klikken | Je collectie staat er, balkje "Leesmodus" onderaan |
| 6 | In leesmodus een titel proberen te verwijderen | Er gebeurt niets; melding legt uit dat je moet inloggen |
| 7 | In leesmodus **Dubbels** en **Wat kijken?** | Werken gewoon |
| 8 | In leesmodus op **Inloggen** in het balkje | Inlogscherm komt terug; na inloggen herlaadt de pagina |
| 9 | Een titel openen, dan een hoesfoto groot bekijken, dan Escape | Alleen de foto sluit; de titel blijft open |
| 10 | Nog eens Escape | De titel sluit |
| 11 | **+ Titel toevoegen** openen, dan Escape | Sluit nu ook |
| 12 | **Op gsm:** een foto groot bekijken | Ronde × rechtsboven, goed te raken |
| 13 | Zoeken op iets wat niet bestaat | "Niets gevonden" + knop "Alle filters wissen" |
| 14 | Op die knop klikken | Alles staat er weer |
| 15 | (Eventueel) TMDb-sleutel weghalen en **+ Titel toevoegen** openen | Gele uitleg bovenaan met link naar Beheer |

Test 6 is de belangrijkste: die controleert dat leesmodus echt alleen leest.

---

## 8. Geautomatiseerd nagekeken

**39 controles, alle geslaagd** — in een echte browser (Chromium) tegen
`index.html`, met een nagebootste Drive-laag en een vooraf gevulde lokale kopie
om de leesmodus te kunnen starten zonder in te loggen.

Nagekeken: het aanbod dat alleen verschijnt als er écht een kopie is, de
collectie die daarna op het scherm staat, de leesmodus-melding, een
verwijderpoging die **aantoonbaar niets wegschrijft** (de schrijffunctie werd
onderschept en is niet aangeroepen) en netjes uitlegt waarom, "Dubbels" die er
wél werkt, "+ Titel toevoegen" die geen scherm opent dat toch niet zou werken,
de meldingen onderaan met hun blijvende foutvariant en sluitknop, de
Escape-keten over twee gestapelde lagen én de modal die er vroeger niet in
zat, de sluitknop van de lightbox op een nagebootste telefoon, beide lege
toestanden met hun knoppen, en de TMDb-uitleg die verschijnt en weer verdwijnt.

De 41 controles van FASE 29 zijn opnieuw gedraaid en blijven geslaagd.

Daarnaast: syntaxcontrole op alle JS, elk inline script, en de HTML-tagbalans.

---

## 9. Commit-bericht

**Titel:**

```
FASE 30: leesmodus zonder inloggen, meldingen onderaan, Escape-keten (sw v29)
```

**Beschrijving:**

```
Vier plekken waar de app je liet raden of tegenhield zonder reden.

Leesmodus:
- Het inlogscherm blokkeerde alles, terwijl de laatst opgehaalde collectie al
  lokaal bewaard staat. Is die er, dan biedt het inlogscherm nu "Bekijken
  zonder inloggen" aan, met het aantal titels en de datum van de kopie.
- Wijzigen is daar geblokkeerd via een enkele controle (requireWrite) op
  backgroundSave, handleDeleteTitle en handleBulkDelete; er wordt niets
  weggeschreven en een melding legt uit waarom. Een verouderde kopie
  wegschrijven zou de echte collectie kunnen overschrijven.
- Balkje onderaan met een Inloggen-knop; na inloggen herlaadt de pagina in
  plaats van de app half om te schakelen.
- "Wat kijken?" en "Dubbels" werden alleen gekoppeld na het inloggen en
  deden daarvoor dus niets. Ze worden nu in beide gevallen gekoppeld.

Meldingen:
- De opslagstatus stond in de kop, die wegscrollt en op gsm nooit in beeld is
  op het moment dat er iets misgaat. Nu een melding onderaan: bezig, gelukt,
  of een foutmelding die blijft staan tot je hem sluit, met de reden erbij.
- De alert() bij een mislukte opslag is vervangen door die blijvende melding.

Escape en lightbox:
- De modal "+ Titel toevoegen" zat niet in de Escape-keten, en de laatste stap
  was altijd closeModal() ook als er niets openstond. Nu een geordende lijst
  die de bovenste openstaande laag sluit, en anders niets doet.
- De lightbox heeft een zichtbare sluitknop van 44px, met safe-area-marges.
  Sluiten kon alleen door naast de foto te klikken of via Escape; op gsm vult
  de foto het hele scherm en is er geen Escape-toets.

Lege toestand en dode kliks:
- "Geen titels gevonden met deze filters" verscheen ook bij een lege
  collectie. Nu twee teksten: "Je collectie is nog leeg" met een knop om de
  eerste titel toe te voegen, of "Niets gevonden" met het aantal titels dat je
  wel hebt en een knop om de filters te wissen.
- Zonder TMDb-sleutel meldde "+ Titel toevoegen" dat pas na een mislukte
  zoekopdracht. Nu staat de uitleg er bij het openen, met een link naar
  Beheer.

39 geautomatiseerde controles geslaagd in een echte browser tegen index.html,
inclusief een verwijderpoging in leesmodus waarbij de schrijffunctie
onderschept werd en aantoonbaar niet aangeroepen is. De 41 controles van
FASE 29 blijven geslaagd.
Details en testchecklist: FASE-30-bediening-en-vertrouwen.md
```

---

## 10. Wat hierna komt

**FASE 31 — veiligheid en opruimen:** Tailwind lokaal in plaats van via de CDN
plus een inhoudsbeleid (CSP), de ongebruikte `apis.google.com` eruit, importeren
met bevestiging en controle van het bestand, `price_history.json` mee in de
backup, en twee plekken waar een posterpad nog niet ontsnapt wordt.

Daarna 32 (datamodel: jaar- en regisseurfilter, animatie als eigenschap,
seizoenen in alle formaten, kijklog met datumkeuze, universum hernoemen) en 33
(consistentie en toegankelijkheid).
