/**
 * Drive-opslag voor Mijn Mediacollectie
 * --------------------------------------
 * Bewaart movies.json en price_history.json verborgen in de "App Data"-map
 * van je eigen Google Drive: alleen deze app kan erbij, en je ziet de
 * bestanden niet tussen je normale Drive-bestanden staan.
 *
 * Hoesfoto's worden als data-URL rechtstreeks in movies.json meegestuurd
 * (dus als onderdeel van dat ene JSON-bestand) — geen aparte Drive-bestanden
 * of extra downloads nodig om ze te tonen.
 *
 * Verwacht een globale `GOOGLE_CLIENT_ID` (staat bovenaan elke HTML-pagina)
 * en dat de Google Identity Services-library geladen is via:
 *   <script src="https://accounts.google.com/gsi/client" onload="gisLoaded()"></script>
 */

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_TOKEN_CACHE_KEY = 'mediacollectie_drive_token';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let isReady = false;
let readyCallbacks = [];

let moviesFileIdCache = null;
let pricesFileIdCache = null;

// ---------- Opstarten ----------

function gapiLoaded() {
  // De klassieke gapi-clientbibliotheek is niet nodig: alle Drive-aanroepen
  // hieronder gaan rechtstreeks via fetch(). Deze functie bestaat enkel om
  // de <script onload="gapiLoaded()"> in de HTML-pagina's geen foutmelding
  // te laten geven.
}

function gisLoaded() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    reportError('Kon de Google-inlogbibliotheek niet laden.');
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: onTokenResponse,
  });
  isReady = true;
  readyCallbacks.forEach((cb) => cb());
  readyCallbacks = [];

  tryRestoreSession();
}

function driveOnReady(cb) {
  if (isReady) cb();
  else readyCallbacks.push(cb);
}

function tryRestoreSession() {
  // Als je op een andere pagina van deze site al was ingelogd, hoef je niet
  // opnieuw in te loggen (localStorage werkt over alle tabbladen/pagina's heen).
  try {
    const cached = JSON.parse(localStorage.getItem(DRIVE_TOKEN_CACHE_KEY) || 'null');
    if (cached && cached.access_token && cached.expires_at > Date.now() + 30000) {
      accessToken = cached.access_token;
      tokenExpiresAt = cached.expires_at;
      notifyAuthenticated();
    }
  } catch {
    // Corrupte cache negeren, gewoon opnieuw laten inloggen.
  }
}

// Stuurt het "ingelogd"-sein pas zodra de hele pagina geparsed is. Dit
// voorkomt dat het sein verloren gaat wanneer de Google-bibliotheek
// (die asynchroon laadt) sneller klaar is dan de rest van de pagina, en de
// pagina zelf (window._driveAuthenticated) dat sein dus nog niet kan opvangen.
function notifyAuthenticated() {
  const fire = () => {
    if (window._driveAuthenticated) window._driveAuthenticated();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fire, { once: true });
  } else {
    fire();
  }
}

// ---------- Inloggen ----------

function driveSignIn() {
  if (!tokenClient) {
    // Bibliotheek nog niet klaar (bv. net op een nieuwe pagina geland): wacht
    // gewoon en log automatisch in zodra ze klaar is, geen foutmelding nodig.
    driveOnReady(driveSignIn);
    return;
  }
  // Een expliciete klik op de inlogknop betekent altijd dat je niet (meer)
  // bent ingelogd (anders zou dit scherm niet zichtbaar zijn). Vraag daarom
  // altijd het echte Google-inlogscherm aan ('consent'), nooit een stille
  // herverbinding — die kan namelijk onopgemerkt mislukken (bv. na het
  // verlopen van je vorige sessie), waardoor de knop dan niets lijkt te doen.
  accessToken = null;
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function onTokenResponse(resp) {
  if (resp.error) {
    reportError(resp.error);
    return;
  }
  accessToken = resp.access_token;
  tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
  try {
    localStorage.setItem(
      DRIVE_TOKEN_CACHE_KEY,
      JSON.stringify({ access_token: accessToken, expires_at: tokenExpiresAt })
    );
  } catch {
    // Als localStorage niet beschikbaar is, blijft inloggen wel werken,
    // dan moet je het straks alleen opnieuw doen op een andere pagina.
  }
  notifyAuthenticated();
}

// Zorgt dat er altijd een geldig (niet-verlopen) token is vóór een Drive-aanroep.
// Vraagt zo nodig stilletjes een nieuw token aan (zonder inlogscherm) als je al
// eerder toestemming gaf.
function ensureToken() {
  if (accessToken && tokenExpiresAt > Date.now() + 30000) {
    return Promise.resolve(accessToken);
  }
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Google-inlogbibliotheek niet klaar.'));
      return;
    }
    const previousCallback = tokenClient.callback;
    tokenClient.callback = (resp) => {
      tokenClient.callback = previousCallback;
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      onTokenResponse(resp);
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

function reportError(msg) {
  if (window._driveError) window._driveError(msg);
  else console.error('Drive-fout:', msg);
}

// ---------- Generieke Drive-bestandshelpers (App Data-map) ----------

async function driveApiFetch(url, options = {}) {
  const token = await ensureToken();
  const resp = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Drive-fout (${resp.status}): ${text.slice(0, 200)}`);
  }
  return resp;
}

async function driveFindFileId(name) {
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const resp = await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`
  );
  const data = await resp.json();
  return data.files && data.files.length ? data.files[0].id : null;
}

async function driveCreateJsonFile(name, obj) {
  const boundary = 'mediacollectie-' + Math.random().toString(16).slice(2);
  const metadata = { name, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(obj)}\r\n` +
    `--${boundary}--`;

  const resp = await driveApiFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  const data = await resp.json();
  return data.id;
}

async function driveUpdateJsonFile(fileId, obj) {
  await driveApiFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(obj),
  });
}

async function driveReadJsonFile(fileId) {
  const resp = await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return resp.json();
}

async function driveGetOrCreateFileId(name, defaultValue) {
  let fileId = name === 'movies.json' ? moviesFileIdCache : pricesFileIdCache;
  if (!fileId) {
    fileId = await driveFindFileId(name);
    if (!fileId) fileId = await driveCreateJsonFile(name, defaultValue);
    if (name === 'movies.json') moviesFileIdCache = fileId;
    else pricesFileIdCache = fileId;
  }
  return fileId;
}

async function driveSaveNamedFile(name, obj) {
  const fileId = await driveGetOrCreateFileId(name, obj);
  await driveUpdateJsonFile(fileId, obj);
}

// ---------- Films ----------

async function driveLoadMovies() {
  const fileId = await driveGetOrCreateFileId('movies.json', []);
  const movies = await driveReadJsonFile(fileId);
  return { movies: Array.isArray(movies) ? movies : [] };
}

async function upsertMovieInDrive(entry) {
  const { movies } = await driveLoadMovies();
  const idx = movies.findIndex((m) => m.id === entry.id);
  const status = idx >= 0 ? 'bijgewerkt' : 'toegevoegd';
  if (idx >= 0) movies[idx] = entry;
  else movies.push(entry);
  await driveSaveNamedFile('movies.json', movies);
  return status;
}

async function upsertMoviesBatchInDrive(entries) {
  const { movies } = await driveLoadMovies();
  entries.forEach((entry) => {
    const idx = movies.findIndex((m) => m.id === entry.id);
    if (idx >= 0) movies[idx] = entry;
    else movies.push(entry);
  });
  await driveSaveNamedFile('movies.json', movies);
}

async function importMoviesJsonIntoDrive(arr) {
  const { movies } = await driveLoadMovies();
  arr.forEach((entry) => {
    const idx = movies.findIndex((m) => m.id === entry.id);
    if (idx >= 0) movies[idx] = entry;
    else movies.push(entry);
  });
  await driveSaveNamedFile('movies.json', movies);
  return movies.length;
}

// ---------- Hoesfoto's ----------
// Hoesfoto's worden als data-URL in movies.json zelf opgeslagen (zie hierboven),
// zodat app.js ze direct als <img src="..."> kan tonen zonder extra Drive-aanroep.

async function driveUploadCoverImage(base64Jpeg, slug, side) {
  return `data:image/jpeg;base64,${base64Jpeg}`;
}

// ---------- Prijzen ----------

async function driveLoadPrices() {
  const fileId = await driveGetOrCreateFileId('price_history.json', []);
  const prices = await driveReadJsonFile(fileId);
  return { prices: Array.isArray(prices) ? prices : [] };
}

async function importPriceHistoryJsonIntoDrive(arr) {
  const { prices } = await driveLoadPrices();
  arr.forEach((entry) => {
    const key = entry.id || entry.title;
    const idx = prices.findIndex((p) => (p.id || p.title) === key);
    if (idx >= 0) prices[idx] = entry;
    else prices.push(entry);
  });
  await driveSaveNamedFile('price_history.json', prices);
  return prices.length;
}
