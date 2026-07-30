# Tailwind opnieuw bouwen

Sinds FASE 31 komt de opmaak niet meer van `cdn.tailwindcss.com`, maar uit
`assets/tailwind.css` — een bestand dat vooraf gebouwd wordt.

**Je hoeft dit alleen te doen als je een Tailwind-klasse gebruikt die er nog
niet in zit.** Voeg je bijvoorbeeld ergens `text-3xl` of `md:grid-cols-5` toe
en die stond nog nergens in het project, dan moet je opnieuw bouwen. Eigen
klassen (`.chip`, `.btn`, `.case-card`) staan in het `<style>`-blok van de
pagina zelf en hebben hier niets mee te maken.

## Eenmalig installeren

Je hebt Node.js nodig. In de projectmap:

```
npm install -D tailwindcss@3
```

## Bouwen

```
npx tailwindcss -c tailwind.config.js -i tailwind-input.css -o assets/tailwind.css --minify
```

Daarna:

1. `assets/tailwind.css` mee uploaden;
2. het versienummer in `sw.js` ophogen;
3. **Ctrl+Shift+R**.

## Twee dingen om te onthouden

**1. Het stijlblad staat bewust ónderaan de `<head>`, ná het `<style>`-blok
van de pagina.** Bij gelijke specificiteit wint de laatste regel, en de CDN
hing zijn opmaak vroeger ook achteraan. Verplaats je de `<link>` naar boven,
dan wint bijvoorbeeld `main, header, .sticky { position: relative }` van
Tailwinds `.sticky` en plakt de filterbalk niet meer tijdens het scrollen.

**2. `content` in `tailwind.config.js` moet ook de JS-bestanden bevatten.**
De CDN bouwde de opmaak in de browser en zag dus élke klasse, ook die
javascript pas later toevoegde. De bouwer hier leest de bestanden vooraf.

Er is een controle die dit bewaakt: die verzamelt elke klassenaam uit de HTML
en de JS en kijkt of ze in de gebouwde CSS staat. Draait die schoon, dan mist
er niets.
