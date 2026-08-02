# FASE 45 — Hotfix: de aanmelding die bleef terugkomen

**Datum:** 2 augustus 2026 · **Service worker:** `v45` → **`v46`**
**Draait terug:** de vooruitziende tokenvernieuwing uit FASE 41.

---

## ⬆ UPLOADCHECKLIST

- [ ] `assets/drive.js`
- [ ] `sw.js` — `VERSION = 'v46'`
- [ ] Daarna: **Ctrl+Shift+R**

Twee bestanden. Doe dit los van de rest, want het is dringend.

> **Snelle controle achteraf:** zoek op `planTokenVernieuwing` in `drive.js` —
> dat mag **nergens** meer voorkomen.

---

## 1. Wat er misging

In FASE 41 heb ik het langst openstaande punt van je lijst aangepakt: de
aanmelding die je onderbrak tijdens het werken. Ik liet de app het token
voortaan **vooruit** vernieuwen — vijf minuten vóór het verloopt, en meteen bij
het terugkeren naar het tabblad.

Dat werkt niet, en het staat al jaren in datzelfde bestand uitgelegd. Bij
`driveSignIn()` staat, in mijn eigen commentaar van een eerdere fase:

> *Met een lege prompt zou Google zelf beslissen of het toestemmingsscherm
> nodig is. In de praktijk blijkt die stille vraag hier niet ingewilligd te
> worden: Google antwoordt met een fout in plaats van een token. Dat is twee
> keer getest en beide keren lag de inlogknop plat.*

Een stille vernieuwing gebruikt precies diezelfde lege prompt. Ze mislukt dus
vrijwel altijd — en een mislukte vernieuwing loopt via `renewToken()`, die bij
een fout `driveSessionExpired()` aanroept. Die wist je token en zet de
inlogpoort terug over je scherm.

Het gevolg: de functie die de onderbreking moest wégnemen, veroorzaakte hem —
en omdat hij óók bij elke tabwissel afging, telkens opnieuw.

Ik heb in het fasedocument van FASE 41 letterlijk geschreven dat een mislukte
vooruitziende poging niets zichtbaars mocht doen. Dat heb ik opgeschreven en
niet gebouwd. Mijn tests controleerden of de teller vooruit schoof en of de
poort dicht bleef bij een *geslaagde* poging — niet wat er gebeurde als de
poging mislukte, en dat is precies het geval dat zich in de praktijk voordoet.

---

## 2. Wat er nu gebeurt

De hele vooruitziende vernieuwing is eruit: de timer, de activiteitsteller en
de poging bij het terugkeren naar het tabblad. Het token wordt weer alleen
vernieuwd wanneer er écht iets mee moet gebeuren, zoals vóór FASE 41.

Op de plek waar die code stond staat nu uitgelegd waarom ze er niet hoort, met
de verwijzing naar het commentaar bij `driveSignIn()` — zodat niemand (ik) op
het idee komt het nog eens te proberen.

**Je bent hiermee terug op het gedrag van vóór FASE 41:** één keer inloggen, en
daarna pas weer wanneer je Google-sessie na een uur echt verlopen is. Punt 6
van je oude lijst is dus wéér open. Dat is beter dan wat er nu staat, maar het
is geen oplossing — zie hieronder.

---

## 3. Hoe het wél zou kunnen

Niet door slimmer te vernieuwen: één uur is een harde grens van Google en een
stille verlenging werkt hier aantoonbaar niet. Wat wél kan, is de onderbreking
*minder erg* maken:

- **Je scherm niet wegnemen.** Nu valt de inlogpoort over alles heen zodra de
  sessie verloopt. In plaats daarvan een balk bovenaan met een inlogknop, terwijl
  je collectie gewoon zichtbaar blijft.
- **De mislukte handeling onthouden en na het inloggen alsnog uitvoeren.** Nu
  krijg je "niet opgeslagen, teruggedraaid" en mag je het zelf overdoen.
- **Waarschuwen vóórdat het gebeurt**, bijvoorbeeld vijf minuten van tevoren,
  zodat je zelf kiest wanneer je die ene klik doet — in plaats van er middenin
  een bewerking mee overvallen te worden.

Dat is een echte fase, geen hotfix. Ik doe hem als je wil, maar niet nu en niet
zonder dat de mislukkingskant zelf getest is.

---

## 4. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Uploaden, **Ctrl+Shift+R**, inloggen | Één keer, zoals vroeger |
| 2 | Een kwartier werken, tussendoor naar een ander tabblad en terug | Geen inlogscherm |
| 3 | Een titel bewerken en opslaan | Gewoon opgeslagen |
| 4 | F12 → Console | Geen fouten |

Merk je nog steeds dat je te vaak moet inloggen, laat het meteen weten — dan
zit de oorzaak ergens anders en zoek ik verder.

---

## 5. Geautomatiseerd nagekeken

De controle uit FASE 41 die het vooruitwerken bevestigde is vervangen door een
controle die het tegenovergestelde bewaakt: dat die functies niet meer bestaan,
dat een tabwissel géén aanmelding uitlokt, en dat de inlogpoort daarbij dicht
blijft. Zo kan dit niet ongemerkt terugkomen.

Alle suites opnieuw gedraaid en geslaagd, waaronder FASE 41 (40) en de vier
suites die het meest van `drive.js` afhangen: 39 (64), 40 (76), 43 (37),
44 (38).

---

## 6. Commit-bericht

**Titel:**

```
FASE 45: vooruitziende tokenvernieuwing teruggedraaid -- die veroorzaakte het herhaald inloggen (sw v46)
```

**Beschrijving:**

```
FASE 41 liet het token vijf minuten voor het verlopen stil vernieuwen, en ook
bij het terugkeren naar het tabblad. Een stille aanvraag (prompt: '') wordt in
deze opstelling niet ingewilligd -- dat stond al beschreven bij driveSignIn().
Zo'n mislukte poging loopt via renewToken(), die bij een fout
driveSessionExpired() aanroept: token gewist, inlogpoort over het scherm. De
functie die de onderbreking moest wegnemen veroorzaakte hem dus, bij elke
tabwissel opnieuw.

Alles van die vooruitziende vernieuwing is verwijderd (timer, activiteitsteller,
visibilitychange-poging). Het token wordt weer alleen vernieuwd wanneer een
handeling het nodig heeft. Op die plek staat nu uitgelegd waarom dit er niet
hoort.

De test die het vooruitwerken bevestigde is vervangen door een test die bewaakt
dat het weg blijft: functies afwezig, tabwissel lokt geen aanmelding uit,
inlogpoort blijft dicht.

Punt 6 van de oude lijst (aanmelding onderbreekt tijdens het werken) is hiermee
weer open. De weg vooruit is niet slimmer vernieuwen -- een uur is een harde
grens van Google -- maar de onderbreking minder erg maken: een balk in plaats
van een poort over je scherm, en de mislukte handeling na het inloggen alsnog
uitvoeren.
```
