# FASE 36 — Handmatig toevoegen

**Datum:** 1 augustus 2026 · **Service worker:** `v36` → **`v37`**

---

## ⬆ UPLOADCHECKLIST

- [ ] `assets/manual-entry.js` — **nieuw bestand**
- [ ] `index.html`
- [ ] `beheer.html`
- [ ] `assets/add-title.js`
- [ ] `assets/tailwind.css`
- [ ] `sw.js` — `VERSION = 'v37'`
- [ ] Daarna: **Ctrl+Shift+R**

> **Snelle controle achteraf:** zoek in je repo op `manual-btn` — moet in
> `index.html` én `beheer.html` staan.

---

## 1. Het probleem

Alles in deze app hangt aan TMDb. Je zoekt een titel op, en die levert de
poster, het jaar, de cast en een uniek nummer. Voor vrijwel je hele collectie
werkt dat prima — en sinds FASE 33 vang je met een IMDb-code ook de gevallen op
waarin de film er wél staat maar onvindbaar is.

Maar er bestaan schijven die in **géén enkele databank** staan. Een special die
bij een serie werd uitgebracht, een lokale uitgave, een bonusschijf uit een
boxset die nergens apart geregistreerd is. Die kon je simpelweg niet vastleggen.

---

## 2. Wat er nu kan

In het scherm **+ Titel toevoegen** staat naast *Zoeken* een knop
**Handmatig**. Daar vul je zelf in:

| | |
|---|---|
| **Soort** | Special · Film · Serie · Seizoen · Aflevering · Iets anders |
| **Titel** | het enige verplichte veld |
| **Jaar** | optioneel, vier cijfers of leeg |
| **Hoort bij** | een bestaande reeks, of een titel uit je collectie |
| **Formaat en status** | zoals bij elke andere schijf |
| **Uitvoering, boxset, locatie, opmerking, beschrijving** | allemaal optioneel |

### Het koppelen — daar zit de kern

Je vraagt terecht dat zo'n special automatisch meekomt als je op de serie zoekt
of groepeert. Dat gebeurt via het **reeksveld** dat al bestaat: groeperen,
zoeken en het reeksfilter werken daar allemaal al op. Een handmatige special
valt daardoor vanzelf op zijn plek, zonder dat daar iets voor aangepast hoefde
te worden.

Concreet:

- Koppel je aan een **bestaande reeks**, dan neemt de special die naam over.
- Koppel je aan een **titel die al een reeks heeft**, dan idem.
- Koppel je aan een **titel die nog géén reeks heeft** — bijvoorbeeld een losse
  serie — dan wordt er een reeks aangemaakt op de naam van die serie, en wordt
  **ook die serie bijgewerkt**. Dat is nodig: een reeks bestaat alleen als
  beide kanten hem kennen. Het formulier zegt dit vooraf, en beide records
  worden in één keer weggeschreven.

Daarna: zoeken op de serienaam vindt de special, en *Reeksen groeperen* zet ze
onder één kaart. Beide zijn getest.

### Drie dingen die zo'n record anders maken

1. **Geen TMDb-nummer.** De verversing in Beheer slaat titels zonder koppeling
   al over, dus wat jij invult wordt nooit overschreven.
2. **Een eigen id met `handmatig-` ervoor.** Zo botst hij nooit met een echte
   titel die later tóch in TMDb blijkt te staan. Voeg je twee schijven met
   dezelfde naam en hetzelfde jaar toe, dan krijgt de tweede een volgnummer.
3. **Een `soort`** naast het gewone type. "Special" is geen filmtype, maar wel
   iets wat je wil terugvinden — daarom staat er nu ook een filterchip
   **Specials** naast Films, TV-reeksen en Animatie.

Geen poster? Dan toont de kaart de titel als tekst, zoals altijd al gebeurde bij
titels zonder beeld. Wil je er toch een plaatje op, dan kan je sinds FASE 33 je
eigen hoesfoto als poster instellen.

### Over "aflevering"

Die staat in de lijst, maar met een kanttekening: een losse aflevering is in
deze app een **titel**, geen onderdeel van een seizoen. Dat is met opzet. Een
schijf met één aflevering erop is een schijf die je bezit — hij hoort in je
collectie als eigen record, gekoppeld aan de serie. Een parallel systeem
bouwen waarin je afleveringen *binnen* een seizoen bezit zou het datamodel
verdubbelen zonder dat je er iets mee kan wat je nu niet kan.

---

## 3. Testchecklist

| # | Test | Verwacht |
|---|---|---|
| 1 | Collectie openen, F12 → Console | Geen fouten |
| 2 | + Titel toevoegen → **Handmatig** | Formulier verschijnt |
| 3 | Bewaren zonder titel | "Een titel is het enige wat echt nodig is" |
| 4 | Jaar `19` invullen | "Een jaartal bestaat uit vier cijfers" |
| 5 | Special invullen, koppelen aan je serie, toevoegen | Melding met de reeksnaam erbij |
| 6 | Terug naar de collectie | De special staat er, gesorteerd bovenaan |
| 7 | Zoeken op de naam van de serie | De special komt mee |
| 8 | **Reeksen groeperen** aanzetten | Serie en special staan onder één kaart |
| 9 | Filters → **Specials** | Alleen je handmatige specials |
| 10 | De special openen en bewerken | Formaat, locatie en opmerking zijn aanpasbaar |
| 11 | Beheer → collectie verversen met TMDb | De special blijft ongewijzigd |
| 12 | Twee specials met dezelfde naam en jaar | De tweede krijgt een eigen id, geen overschrijving |

Test 8 en 11 zijn de belangrijkste: dat de koppeling werkt, en dat een
verversing je handwerk niet wist.

---

## 4. Geautomatiseerd nagekeken

**31 nieuwe controles, alle geslaagd.** Onder meer: de zes soorten en de
koppellijst met zowel bestaande reeksen als je eigen titels; de weigering bij
een ontbrekende titel en bij een half jaartal; het opgebouwde record met zijn
`handmatig-`-id, zonder TMDb-nummer, met de juiste soort; het aanmaken van een
reeks op een ouder die er nog geen had — inclusief de controle dat die ouder
mee weggeschreven wordt; een botsend id dat een volgnummer krijgt; en in de
draaiende app: de special in het raster, gevonden bij zoeken op de serienaam,
onder één kaart bij groeperen, en alleen zichtbaar onder het filter Specials.

Alle eerdere suites opnieuw gedraaid en nog steeds geslaagd: FASE 29 (41),
30 (39), 31 (50), 32 (24), 33 (37 + 16), 35 (41), eigen titel (16). Plus een
nieuwe Tailwind-build met dekkingscontrole en de gebruikelijke
syntaxcontroles.

---

## 5. Commit-bericht

**Titel:**

```
FASE 36: handmatig toevoegen voor uitgaves buiten TMDb en IMDb (sw v37)
```

**Beschrijving:**

```
Alles in de app hangt aan TMDb. Sinds FASE 33 vangt een IMDb-code de gevallen
op waarin de film er wel staat maar onvindbaar is -- maar er bestaan schijven
die in geen enkele databank staan: specials bij een serie, lokale uitgaves,
bonusschijven uit een boxset. Die konden niet vastgelegd worden.

- Knop "Handmatig" naast Zoeken in het toevoegscherm, op de collectiepagina en
  op Beheer. Soort (special, film, serie, seizoen, aflevering, anders), titel,
  jaar, formaat, status, uitvoering, boxset, locatie, opmerking, beschrijving.
  Alleen de titel is verplicht.
- Koppelen gebeurt via het bestaande saga-veld, niet via een nieuw mechanisme:
  groeperen, zoeken en het reeksfilter werken daar al op, dus een handmatige
  special valt vanzelf op zijn plek.
- Koppel je aan een titel die nog geen reeks heeft, dan wordt er een reeks
  aangemaakt op de naam van die titel en wordt de ouder mee weggeschreven --
  anders bestaat de reeks maar aan een kant.
- Het record krijgt geen tmdb_id (de verversing in Beheer slaat die al over,
  dus handwerk wordt nooit overschreven) en een id met "handmatig-" ervoor, met
  een volgnummer bij een botsing.
- Nieuw veld `soort` naast content_type, en een filterchip "Specials" naast
  Films, TV-reeksen en Animatie.
- Een losse aflevering wordt bewust een titel en geen onderdeel van een
  seizoen: een schijf met een aflevering erop is een schijf die je bezit.

31 nieuwe geautomatiseerde controles geslaagd, waaronder de koppeling die de
ouder mee bijwerkt en de special die bij groeperen onder de serie komt te
staan. Alle eerdere suites blijven geslaagd.
Details en testchecklist: FASE-36-handmatig-toevoegen.md
```

---

## 6. Wat nog open staat

- **Punt 6 van je oude lijst:** de aanmelding die je onderbreekt tijdens het
  werken.
- **Hoesfoto's per seizoen-exemplaar** (uit FASE 35): de velden staan in het
  datamodel, het uploadscherm nog niet.
