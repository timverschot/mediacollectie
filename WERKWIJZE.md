# Werkwijze bij dit project

Vaste afspraken voor iedereen (mens of Claude) die aan de mediacollectie werkt.
Kort houden, en alleen dingen die anders telkens opnieuw fout gaan.

> **Voor Claude, lees dit eerst.** Timothy werkt met GitHub Desktop en moet bij
> elke commit zelf een titel en een beschrijving invullen. **Lever die dus altijd
> mee, ongevraagd**, zodra je bestanden oplevert — kant-en-klaar om te plakken,
> in twee aparte codeblokken (titel en beschrijving apart, want het zijn twee
> velden in GitHub Desktop). Ook bij een wijziging van één regel. Hij hoeft er
> nooit om te vragen.

---

## Bij elke wijziging

1. **Commit-bericht meeleveren.** Titel én beschrijving, in aparte codeblokken,
   in het FASE-document én in het antwoord in de chat. Zie hieronder.
2. **Service-worker-versie ophogen.** `sw.js` → `VERSION` één omhoog. Vergeet je
   dat, dan blijft de oude schil uit de cache komen en lijkt je wijziging niet te
   werken. Na het uploaden altijd **Ctrl+Shift+R**.
3. **Onderling afhankelijke bestanden samen uploaden.** `assets/drive.js` en
   `assets/admin.js` bevatten gedeelde functies; de andere bestanden controleren
   bij het laden of die aanwezig zijn en tonen anders "Bestanden komen niet
   overeen".
4. **Eén FASE-document per wijziging**, met: wat er mis was, wat er veranderde,
   de uploadlijst, een testchecklist, en het commit-bericht.
5. **Nederlandstalige, becommentarieerde code.** Commentaar legt uit *waarom*,
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

**Ook bij kleine dingen.** Een losse fix, een documentwijziging, het opruimen van
een bestand dat er per ongeluk in beland is: overal hoort een titel en een
beschrijving bij. "fix" of "Update app.js" is geen commit-bericht.

---

## Wat waar staat

| | |
|---|---|
| De collectie zelf | **Google Drive**, `appDataFolder` — niet in deze repo |
| `data/movies.json` | voorbeeldbestand, wordt nergens meer gelezen |
| TMDb-key | localStorage van je browser, gesynchroniseerd via Drive |
| Prijzen | Cloudflare Worker → eBay; geschiedenis in Drive |
| Hoesfoto's | losse bestanden in Drive, naam `cover-<id>-<eid>-<zijde>.jpg` |

---

## Praktisch

- **Werkmap:** `C:\Users\jaspe\Desktop\PAPA\mediacollectie_1C\MEDIACOLLECTIE\mediacollectie`
- **Repo:** `timverschot/mediacollectie`, branch `main`, GitHub Pages vanaf de root.
- **Draai geen git-commando's op Timothy's pc via de bestandsbrug.** Git laat dan
  een `.git/index.lock` achter die de brug niet kan verwijderen, waarna GitHub
  Desktop weigert te committen met "A lock file already exists". Wil je weten wat
  er nog niet gepusht is: kloon de repo in de cloud en vergelijk daar.
