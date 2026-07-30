# Werkwijze bij dit project

Vaste afspraken voor iedereen (mens of Claude) die aan de mediacollectie werkt.
Kort houden, en alleen dingen die anders telkens opnieuw fout gaan.

---

## Bij elke wijziging

1. **Service-worker-versie ophogen.** `sw.js` → `VERSION` één omhoog. Vergeet je
   dat, dan blijft de oude schil uit de cache komen en lijkt je wijziging niet te
   werken. Na het uploaden altijd **Ctrl+Shift+R**.
2. **Onderling afhankelijke bestanden samen uploaden.** `assets/drive.js` en
   `assets/admin.js` bevatten gedeelde functies; de andere bestanden controleren
   bij het laden of die aanwezig zijn en tonen anders "Bestanden komen niet
   overeen".
3. **Eén FASE-document per wijziging**, met: wat er mis was, wat er veranderde,
   de uploadlijst, een testchecklist, en het commit-bericht.
4. **Nederlandstalige, becommentarieerde code.** Commentaar legt uit *waarom*,
   niet *wat*.

---

## Commit-berichten

Elke FASE levert een kant-en-klaar commit-bericht in zijn eigen document, onder
het kopje **Commit-bericht**. Overnemen in GitHub, niets zelf verzinnen.

**Titel** — één regel, hoogstens ±70 tekens, in de gebiedende of beschrijvende
vorm, met het fasenummer en de nieuwe service-worker-versie:

```
FASE 25: dataverlies dichten en correctheid herstellen (sw v24)
```

**Beschrijving** — opsomming per onderdeel. Per punt: wát er mis was en wát er nu
gebeurt, niet alleen de bestandsnaam. Een regel die alleen "fix" of
"Update app.js" zegt, kost je later een uur zoeken.

Sluit af met een verwijzing naar het FASE-document, zodat de volledige uitleg en
de testchecklist vindbaar blijven vanuit de geschiedenis:

```
Details en testchecklist: FASE-25-dataverlies-en-correctheid.md
```

**Één commit per FASE.** Splits alleen als de bestanden echt los van elkaar
staan — en let dan op dat `sw.js` maar één versienummer tegelijk kan hebben, dus
die hoort bij de laatste commit van de reeks.

---

## Wat waar staat

| | |
|---|---|
| De collectie zelf | **Google Drive**, `appDataFolder` — niet in deze repo |
| `data/movies.json` | voorbeeldbestand, wordt nergens meer gelezen |
| TMDb-key | localStorage van je browser, gesynchroniseerd via Drive |
| Prijzen | Cloudflare Worker → eBay; geschiedenis in Drive |
| Hoesfoto's | losse bestanden in Drive, naam `cover-<id>-<eid>-<zijde>.jpg` |

Het `README.md` beschrijft nog de oude GitHub-token-werkwijze en klopt op
verschillende punten niet meer. Herschrijven staat op de lijst.
