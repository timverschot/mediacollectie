/**
 * Service worker — Mijn Mediacollectie
 * ------------------------------------
 * Zorgt dat de site als app kan worden geïnstalleerd en meteen opent, ook
 * zonder verbinding.
 *
 * Drie strategieën, elk voor een ander soort verzoek:
 *
 * 1. App-schil (HTML, JS, pictogrammen) — network-first: online krijg je
 *    altijd de nieuwste versie, offline de bewaarde kopie. Zo hoef je nooit
 *    handmatig cache te legen na een upload.
 * 2. Afbeeldingen van TMDb (posters, backdrops, acteursfoto's) — cache-first:
 *    die veranderen toch niet, en zo blijft je bibliotheek er offline uitzien
 *    zoals je gewend bent. Het aantal wordt begrensd.
 * 3. Google Drive en TMDb-API — nooit uit cache: je collectie moet altijd de
 *    echte, actuele gegevens zijn. Het opvangen van 'geen verbinding' gebeurt
 *    in de app zelf (die toont dan de laatst geladen collectie).
 *
 * Versienummer ophogen forceert een schone installatie bij je volgende bezoek.
 */

const VERSION = 'v18';
const SHELL_CACHE = `mediacollectie-shell-${VERSION}`;
const IMAGE_CACHE = `mediacollectie-images-${VERSION}`;
const MAX_IMAGES = 600;

// Relatieve paden, zodat dit ook werkt onder een submap op GitHub Pages.
const SHELL_ASSETS = [
  './',
  './index.html',
  './universums.html',
  './statistieken.html',
  './beheer.html',
  './prijzen.html',
  './manifest.json',
  './assets/app.js',
  './assets/drive.js',
  './assets/admin.js',
  './assets/add-title.js',
  './assets/stats.js',
  './assets/price-app.js',
  './assets/universes.js',
  './assets/universes-page.js',
  './assets/bulk-import.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Eén ontbrekend bestand mag de hele installatie niet laten mislukken.
      await Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('mediacollectie-') && k !== SHELL_CACHE && k !== IMAGE_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Houdt de afbeeldingscache binnen de perken (oudste eruit).
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key);
  }
}

function isTmdbImage(url) {
  return url.hostname === 'image.tmdb.org';
}

// Vaste hulpbestanden van derden: Tailwind (de volledige opmaak van de site)
// en de lettertypes. Zonder deze in cache opent de app offline zónder enige
// vormgeving, dus die bewaren we net zo goed als onze eigen bestanden.
function isStaticVendor(url) {
  return (
    url.hostname === 'cdn.tailwindcss.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
}

function isLiveData(url) {
  if (isStaticVendor(url)) return false;
  return (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('google.com') ||
    url.hostname === 'api.themoviedb.org' ||
    url.hostname.endsWith('workers.dev')
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Live gegevens: altijd rechtstreeks, nooit uit cache.
  if (isLiveData(url)) return;

  // Afbeeldingen van TMDb én vaste bestanden van derden: eerst uit cache.
  if (isTmdbImage(url) || isStaticVendor(url)) {
    event.respondWith(
      (async () => {
        // Opmaak en lettertypes horen bij de schil, afbeeldingen in hun eigen
        // (begrensde) cache — anders zou een grote bibliotheek de opmaak
        // kunnen verdringen.
        const vendor = isStaticVendor(url);
        const cache = await caches.open(vendor ? SHELL_CACHE : IMAGE_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const resp = await fetch(request);
          // Lettertypes en CDN's antwoorden vaak 'opaque' (status 0) door CORS;
          // die mogen we bewaren, ze zijn nog steeds bruikbaar.
          if (resp && (resp.status === 200 || resp.type === 'opaque')) {
            cache.put(request, resp.clone());
            if (!vendor) trimCache(IMAGE_CACHE, MAX_IMAGES);
          }
          return resp;
        } catch (err) {
          // Geen verbinding en niet in cache: doorgeven als fout, de app
          // toont dan haar eigen terugvalafbeelding.
          throw err;
        }
      })()
    );
    return;
  }

  // Eigen bestanden: netwerk eerst, cache als vangnet.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          const resp = await fetch(request);
          if (resp && resp.status === 200) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, resp.clone());
          }
          return resp;
        } catch (err) {
          const hit = await caches.match(request);
          if (hit) return hit;
          // Navigatie zonder verbinding en zonder kopie: val terug op de
          // startpagina, die wél bewaard is.
          if (request.mode === 'navigate') {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
          }
          throw err;
        }
      })()
    );
  }
});
