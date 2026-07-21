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
 * Fase 1-uitbreidingen:
 * - Export (download) van movies.json en price_history.json
 * - Automatische wekelijkse backup in Drive (laatste 4 bewaard) + herstel
 * - Schrijf-lock zodat twee tabbladen elkaars wijzigingen niet overschrijven
 * - TMDb-key gesynchroniseerd via config.json in Drive (eenmalig invullen)
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

// Bestandsnaam → Drive file-ID (zodat we niet telkens opnieuw hoeven te zoeken)
const fileIdCache = {};

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

// ---------- Schrijf-lock (fase 1) ----------
// Voorkomt dat twee tabbladen/pagina's van deze site tegelijk movies.json of
// price_history.json herschrijven en zo elkaars wijziging ongedaan maken.
// Werkt via localStorage (gedeeld over alle tabbladen van dezelfde browser).

const WRITE_LOCK_KEY = 'mediacollectie_write_lock';
const WRITE_LOCK_TTL_MS = 20000; // vergrendeling vervalt vanzelf (bv. na crash)

async function withWriteLock(fn) {
  const started = Date.now();
  for (;;) {
    let lock = null;
    try {
      lock = JSON.parse(localStorage.getItem(WRITE_LOCK_KEY) || 'null');
    } catch {}
    if (!lock || lock.expires < Date.now()) break; // vrij (of verlopen)
    if (Date.now() - started > 12000) {
      throw new Error('Een ander tabblad is nog aan het opslaan. Wacht even en probeer opnieuw.');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const myToken = Math.random().toString(16).slice(2);
  try {
    localStorage.setItem(WRITE_LOCK_KEY, JSON.stringify({ token: myToken, expires: Date.now() + WRITE_LOCK_TTL_MS }));
  } catch {}
  try {
    return await fn();
  } finally {
    try {
      const cur = JSON.parse(localStorage.getItem(WRITE_LOCK_KEY) || 'null');
      if (cur && cur.token === myToken) localStorage.removeItem(WRITE_LOCK_KEY);
    } catch {}
  }
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

async function driveDeleteFile(fileId) {
  await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
}

async function driveGetOrCreateFileId(name, defaultValue) {
  let fileId = fileIdCache[name];
  if (!fileId) {
    fileId = await driveFindFileId(name);
    if (!fileId) fileId = await driveCreateJsonFile(name, defaultValue);
    fileIdCache[name] = fileId;
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

// ---------- Offline-kopie van de collectie (fase 6) ----------
// Na elke geslaagde download bewaren we de collectie lokaal. Kan de app Drive
// niet bereiken (geen verbinding, of net geen geldig token), dan tonen we die
// kopie in plaats van een foutmelding.
//
// Belangrijk: deze kopie wordt UITSLUITEND gebruikt om te tónen. Alle
// schrijfacties gaan via driveLoadMovies() en dus altijd langs de echte Drive —
// zo kan een verouderde kopie nooit je collectie overschrijven.

const MOVIES_CACHE_KEY = 'mediacollectie_movies_cache';

function _cacheMoviesLocally(movies) {
  try {
    localStorage.setItem(
      MOVIES_CACHE_KEY,
      JSON.stringify({ saved_at: new Date().toISOString(), movies })
    );
  } catch {
    // Opslag vol of geblokkeerd: offline tonen werkt dan niet, verder niets aan de hand.
  }
}

function driveCachedMovies() {
  try {
    const raw = JSON.parse(localStorage.getItem(MOVIES_CACHE_KEY) || 'null');
    if (raw && Array.isArray(raw.movies)) return raw;
  } catch {}
  return null;
}

/**
 * Laadt de collectie om te tónen: eerst van Drive, met terugval op de laatst
 * bewaarde kopie. Geeft { movies, offline, saved_at } terug.
 */
async function driveLoadMoviesForDisplay() {
  try {
    const { movies } = await driveLoadMovies();
    _cacheMoviesLocally(movies);
    return { movies, offline: false, saved_at: null };
  } catch (err) {
    const cached = driveCachedMovies();
    if (cached) {
      console.warn('Drive onbereikbaar, laatst bewaarde collectie getoond:', err);
      return { movies: cached.movies, offline: true, saved_at: cached.saved_at };
    }
    throw err;
  }
}

async function upsertMovieInDrive(entry) {
  return withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    const idx = movies.findIndex((m) => m.id === entry.id);
    const status = idx >= 0 ? 'bijgewerkt' : 'toegevoegd';
    if (idx >= 0) movies[idx] = entry;
    else movies.push(entry);
    await driveSaveNamedFile('movies.json', movies);
    return status;
  });
}

async function upsertMoviesBatchInDrive(entries) {
  return withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    entries.forEach((entry) => {
      const idx = movies.findIndex((m) => m.id === entry.id);
      if (idx >= 0) movies[idx] = entry;
      else movies.push(entry);
    });
    await driveSaveNamedFile('movies.json', movies);
  });
}

async function deleteMovieInDrive(id) {
  return withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    const filtered = movies.filter((m) => m.id !== id);
    await driveSaveNamedFile('movies.json', filtered);
  });
}

async function importMoviesJsonIntoDrive(arr) {
  return withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    arr.forEach((entry) => {
      const idx = movies.findIndex((m) => m.id === entry.id);
      if (idx >= 0) movies[idx] = entry;
      else movies.push(entry);
    });
    await driveSaveNamedFile('movies.json', movies);
    return movies.length;
  });
}

// ---------- Hoesfoto's ----------
// Fase 2b: hoesfoto's worden voortaan als LOSSE bestandjes in de App Data-map
// bewaard (cover-<id>-front.jpg / -back.jpg). movies.json bevat enkel nog het
// Drive-bestand-ID, waardoor het klein en snel blijft — hoe groot je
// fotocollectie ook wordt. Oude foto's (data-URL's in movies.json) worden
// eenmalig automatisch gemigreerd via driveMigrateCoversToFiles().

function _base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Upload (of overschrijf) een hoesfoto als los Drive-bestand; geeft het file-ID terug.
async function driveUploadCoverFile(base64Jpeg, id, side) {
  const name = `cover-${id}-${side}.jpg`;
  const bytes = _base64ToBytes(base64Jpeg);

  let fileId = await driveFindFileId(name);
  if (!fileId) {
    const resp = await driveApiFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: ['appDataFolder'] }),
    });
    fileId = (await resp.json()).id;
  }
  await driveApiFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  return fileId;
}

// Haalt een hoesfoto op en geeft een lokale blob-URL terug (met cache, zodat
// dezelfde foto maar één keer gedownload wordt per sessie).
const _coverUrlCache = {};
async function driveCoverBlobUrl(fileId) {
  if (_coverUrlCache[fileId]) return _coverUrlCache[fileId];
  const resp = await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  _coverUrlCache[fileId] = url;
  return url;
}

async function driveDeleteCoverFile(fileId) {
  if (!fileId) return;
  try {
    await driveDeleteFile(fileId);
  } catch {
    // Al verwijderd of onbereikbaar: geen probleem.
  }
}

function _isCoverDataUrl(v) {
  return typeof v === 'string' && v.startsWith('data:image');
}

// Eenmalige migratie: zet alle foto's die nog als data-URL in movies.json
// zitten om naar losse Drive-bestanden. onProgress(klaar, totaal) per titel.
async function driveMigrateCoversToFiles(onProgress) {
  const { movies } = await driveLoadMovies();
  const todo = movies.filter((m) => _isCoverDataUrl(m.custom_front_cover) || _isCoverDataUrl(m.custom_back_cover));
  if (!todo.length) return 0;

  let done = 0;
  for (const m of todo) {
    if (_isCoverDataUrl(m.custom_front_cover)) {
      m.custom_front_cover_id = await driveUploadCoverFile(m.custom_front_cover.split(',')[1], m.id, 'front');
      m.custom_front_cover = '';
    }
    if (_isCoverDataUrl(m.custom_back_cover)) {
      m.custom_back_cover_id = await driveUploadCoverFile(m.custom_back_cover.split(',')[1], m.id, 'back');
      m.custom_back_cover = '';
    }
    done++;
    if (onProgress) onProgress(done, todo.length);
  }

  await withWriteLock(() => driveSaveNamedFile('movies.json', movies));
  return todo.length;
}

// Oude helper (data-URL in movies.json) — enkel nog aanwezig zodat een
// verouderde pagina-versie in cache geen fout geeft. Niet meer gebruiken.
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
  return withWriteLock(async () => {
    const { prices } = await driveLoadPrices();
    arr.forEach((entry) => {
      const key = entry.id || entry.title;
      const idx = prices.findIndex((p) => (p.id || p.title) === key);
      if (idx >= 0) prices[idx] = entry;
      else prices.push(entry);
    });
    await driveSaveNamedFile('price_history.json', prices);
    return prices.length;
  });
}

// ---------- Instellingen-sync (fase 1) ----------
// Bewaart de TMDb-key ook in Drive (config.json in de App Data-map), zodat je
// hem op een nieuw toestel niet opnieuw hoeft in te vullen. De lokale kopie in
// localStorage blijft de 'werkkopie' die admin.js gebruikt.

const CONFIG_LS_KEY = 'mediacollectie_admin_config';

async function driveSyncConfig() {
  let local = {};
  try {
    local = JSON.parse(localStorage.getItem(CONFIG_LS_KEY)) || {};
  } catch {}

  const fileId = await driveGetOrCreateFileId('config.json', {});
  let remote = {};
  try {
    const r = await driveReadJsonFile(fileId);
    if (r && typeof r === 'object' && !Array.isArray(r)) remote = r;
  } catch {}

  if (local.tmdbKey && local.tmdbKey !== remote.tmdbKey) {
    // Lokaal ingevulde key naar Drive pushen (nieuwste wint: lokaal is waar je hem invult).
    await driveUpdateJsonFile(fileId, { ...remote, ...local });
  } else if (!local.tmdbKey && remote.tmdbKey) {
    // Nieuw toestel: key uit Drive overnemen.
    try {
      localStorage.setItem(CONFIG_LS_KEY, JSON.stringify({ ...local, ...remote }));
    } catch {}
  }
}

async function driveSaveConfig(cfg) {
  const fileId = await driveGetOrCreateFileId('config.json', {});
  await driveUpdateJsonFile(fileId, cfg || {});
}

// ---------- Backup & export (fase 1) ----------

const BACKUP_PREFIX = 'movies-backup-';
const BACKUP_KEEP = 4; // aantal automatische (wekelijkse) backups dat bewaard blijft
const BACKUP_INTERVAL_DAYS = 7;

function _isDatedBackupName(name) {
  return /^movies-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name);
}

// Alle backup-bestanden in Drive, nieuwste eerst.
async function driveListBackups() {
  const q = encodeURIComponent(`name contains '${BACKUP_PREFIX}' and trashed=false`);
  const resp = await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,createdTime,size)&pageSize=100`
  );
  const data = await resp.json();
  return (data.files || []).sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''));
}

// Maakt (maximaal 1× per week) automatisch een backup-kopie van movies.json
// in Drive en ruimt oude automatische backups op. Stil op de achtergrond;
// een mislukte backup blokkeert de site nooit.
async function driveAutoBackup() {
  try {
    return await withWriteLock(async () => {
      const backups = await driveListBackups();
      const dated = backups.filter((f) => _isDatedBackupName(f.name));
      const today = new Date().toISOString().slice(0, 10);

      if (dated.length) {
        const newestDate = dated[0].name.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10);
        const ageDays = (new Date(today) - new Date(newestDate)) / 86400000;
        if (!isNaN(ageDays) && ageDays < BACKUP_INTERVAL_DAYS) return false; // recent genoeg
      }

      const { movies } = await driveLoadMovies();
      if (!movies.length) return false; // lege collectie: niets te back-uppen

      await driveCreateJsonFile(`${BACKUP_PREFIX}${today}.json`, movies);

      // Oude automatische backups opruimen (nieuwste BACKUP_KEEP blijven staan).
      const after = (await driveListBackups()).filter((f) => _isDatedBackupName(f.name));
      for (const f of after.slice(BACKUP_KEEP)) {
        try { await driveDeleteFile(f.id); } catch {}
      }
      return true;
    });
  } catch (e) {
    console.warn('Automatische backup mislukt (site werkt gewoon verder):', e);
    return false;
  }
}

// Zet een gekozen backup terug als actieve collectie. Bewaart eerst de
// huidige staat als extra backup ('voor-herstel'), zodat herstellen zelf
// nooit definitief data kan vernietigen.
async function driveRestoreBackup(fileId) {
  return withWriteLock(async () => {
    const data = await driveReadJsonFile(fileId);
    if (!Array.isArray(data)) throw new Error('Dit backup-bestand bevat geen geldige collectie.');

    const { movies } = await driveLoadMovies();
    if (movies.length) {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', 'u');
      await driveCreateJsonFile(`${BACKUP_PREFIX}voor-herstel-${stamp}.json`, movies);
      // Maximaal 2 'voor-herstel'-kopieën bewaren.
      const restorePoints = (await driveListBackups()).filter((f) => f.name.startsWith(`${BACKUP_PREFIX}voor-herstel-`));
      for (const f of restorePoints.slice(2)) {
        try { await driveDeleteFile(f.id); } catch {}
      }
    }

    await driveSaveNamedFile('movies.json', data);
    return data.length;
  });
}

// Browser-download van een JSON-bestand.
function _downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function driveExportMovies() {
  const { movies } = await driveLoadMovies();
  _downloadJson(`movies-export-${new Date().toISOString().slice(0, 10)}.json`, movies);
  return movies.length;
}

async function driveExportPrices() {
  const { prices } = await driveLoadPrices();
  _downloadJson(`price_history-export-${new Date().toISOString().slice(0, 10)}.json`, prices);
  return prices.length;
}
