/**
 * Instellingen voor het bouwen van assets/tailwind.css.
 *
 * Dit is exact dezelfde configuratie die vroeger inline in elke HTML-pagina
 * stond, toen Tailwind nog via de CDN kwam. Sinds FASE 31 wordt de opmaak
 * vooraf gebouwd: sneller, geen script van een vreemde server, en de service
 * worker kan het bestand bewaren.
 *
 * Opnieuw bouwen: zie BOUWEN-tailwind.md
 */
module.exports = {
  // Alles waar klassenamen in kunnen staan. De javascript-bestanden móéten
  // hier bij: veel kaarten en knoppen worden pas in de browser opgebouwd, en
  // wat hier niet gelezen wordt, bestaat straks niet in de CSS.
  content: ['./*.html', './assets/*.js'],
  theme: {
    extend: {
      colors: {
        bg: '#14141A',
        surface: '#1E1E26',
        gold: '#C9A227',
        teal: '#2FA4A9',
        ink: '#F2F0EA',
        muted: '#8B8A92',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
};
