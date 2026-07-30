/**
 * Drive-opslag voor Mijn Mediacollectie
 * --------------------------------------
 * Bewaart movies.json en price_history.json verborgen in de "App Data"-map
 * van je eigen Google Drive: alleen deze app kan erbij, en je ziet de
 * bestanden niet tussen je normale Drive-bestanden staan.
 *
 * Hoesfoto's staan als LOSSE bestanden in diezelfde App Data-map, met de naam
 * cover-<titel-id>-<exemplaar-id>-<voor|achter>.jpg. In movies.json staat per
 * exemplaar alleen het Drive-bestand-ID. Zo blijft movies.json klein — dat
 * bestand wordt bij elke wijziging volledig op- en neergehaald, en met foto's
 * erin liep dat op tot megabytes per bewerking.
 * (Vóór fase 2b zaten de foto's als data-URL ín movies.json; oude records
 * worden eenmalig omgezet door driveMigrateCoversToFiles.)
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

/* ==========================================================================
 * Gedeelde gegevensstructuur (fase 8)
 * ==========================================================================
 * Een titel kan meerdere fysieke exemplaren hebben: dezelfde film op DVD én
 * op 4K. Die staan in `editions`. Alles wat bij de FILM hoort (titel, cast,
 * bekeken, seizoenen) blijft op het hoofdniveau; alles wat bij een SCHIJF
 * hoort (formaat, opmerkingen, hoesfoto's, boxset, verlanglijst) zit per
 * exemplaar.
 *
 * Oude titels hebben nog geen `editions`. Die worden bij het laden in het
 * geheugen omgezet (normalizeMovieEntry). Er wordt pas naar Drive geschreven
 * wanneer je die titel effectief bewerkt — zo gebeurt de overgang geleidelijk
 * en kan een fout nooit je hele collectie in één keer raken.
 * ========================================================================== */

// Alle formaten, van hoogste naar laagste kwaliteit.
const MEDIA_FORMATS = [
  { value: '4k', label: '4K UHD', short: '4K', rank: 6, color: '#C9A227' },
  { value: 'bluray3d', label: '3D Blu-ray', short: '3D', rank: 5, color: '#4FB3C9' },
  { value: 'bluray', label: 'Blu-ray', short: 'BD', rank: 4, color: '#2FA4A9' },
  { value: 'dvd', label: 'DVD', short: 'DVD', rank: 3, color: '#8B8A92' },
  { value: 'laserdisc', label: 'Laserdisc', short: 'LD', rank: 2, color: '#9C7B5C' },
  { value: 'vhs', label: 'VHS', short: 'VHS', rank: 1, color: '#7A6E62' },
];

/**
 * Uitvoeringen van een exemplaar. Staan los van het formaat — een DVD kan
 * evengoed een steelbook zijn als een 4K.
 *
 * Twee soorten door elkaar, bewust gelijk behandeld:
 * - Verpakking: steelbook, limited edition
 * - Inhoud: extended edition, director's cut (andere montage, langere film)
 *
 * Voor de prijsopvolging maakt dat onderscheid niet uit: alle vier vragen ze
 * een eigen zoekterm en hebben ze een eigen markt.
 *
 * `search` is wat er in de eBay-zoekterm komt; `match` bepaalt of een
 * advertentie bij die uitvoering hoort.
 */
const EDITION_VARIANTS = [
  {
    key: 'steelbook',
    label: 'Steelbook',
    search: 'steelbook',
    match: /(^|[^a-z])steel\s?book([^a-z]|$)/i,
  },
  {
    key: 'limited',
    label: 'Limited edition',
    search: 'limited edition',
    match: /(^|[^a-z])limited(\s+edition)?([^a-z]|$)/i,
  },
  {
    key: 'extended',
    label: 'Extended edition',
    search: 'extended edition',
    match: /(^|[^a-z])extended(\s+(edition|cut|version))?([^a-z]|$)/i,
  },
  {
    key: 'directors',
    label: "Director's cut",
    search: "director's cut",
    // Vangt "director's cut", "directors cut" en "director cut"
    match: /(^|[^a-z])director'?s?\s+cut([^a-z]|$)/i,
  },
];

// Welke uitvoeringen staan er aan bij dit exemplaar? Vaste volgorde, zodat
// dezelfde combinatie altijd dezelfde sleutel oplevert.
function editionVariantKeys(edition) {
  if (!edition) return [];
  return EDITION_VARIANTS.filter((v) => edition[v.key]).map((v) => v.key);
}

function editionVariantLabels(edition) {
  if (!edition) return [];
  return EDITION_VARIANTS.filter((v) => edition[v.key]).map((v) => v.label);
}

const FORMAT_BY_VALUE = {};
MEDIA_FORMATS.forEach((f) => { FORMAT_BY_VALUE[f.value] = f; });

function formatLabel(value) {
  return (FORMAT_BY_VALUE[value] && FORMAT_BY_VALUE[value].label) || value || '';
}
function formatShort(value) {
  return (FORMAT_BY_VALUE[value] && FORMAT_BY_VALUE[value].short) || value || '';
}
function formatColor(value) {
  return (FORMAT_BY_VALUE[value] && FORMAT_BY_VALUE[value].color) || '#8B8A92';
}
function formatRank(value) {
  return (FORMAT_BY_VALUE[value] && FORMAT_BY_VALUE[value].rank) || 0;
}

// Zorgt dat een titel altijd een `editions`-lijst heeft. Wijzigt het object
// ter plaatse en geeft het terug. Veilig om meermaals aan te roepen.
function normalizeMovieEntry(m) {
  if (!m || typeof m !== 'object') return m;

  if (!Array.isArray(m.editions) || m.editions.length === 0) {
    // Omzetten van de oude structuur: de losse velden vormen samen één exemplaar.
    m.editions = [
      {
        eid: 'e1',
        format: m.format || 'bluray',
        notes: m.notes || '',
        boxset: '',
        location: '',
        // Alle vier de uitvoeringen meteen zetten; voorheen stond alleen
        // steelbook hier en kwamen de andere drie pas bij de volgende
        // normalisatieronde erbij.
        ...Object.fromEntries(EDITION_VARIANTS.map((v) => [v.key, false])),
        wishlist: !!m.wishlist,
        date_added: m.date_added || '',
        custom_front_cover_id: m.custom_front_cover_id || '',
        custom_back_cover_id: m.custom_back_cover_id || '',
        custom_front_cover: m.custom_front_cover || '',
        custom_back_cover: m.custom_back_cover || '',
      },
    ];
  } else {
    // Ontbrekende velden binnen bestaande exemplaren aanvullen.
    m.editions.forEach((ed, i) => {
      if (!ed.eid) ed.eid = 'e' + (i + 1);
      if (!ed.format) ed.format = 'bluray';
      if (typeof ed.wishlist !== 'boolean') ed.wishlist = false;
      EDITION_VARIANTS.forEach((v) => {
        if (typeof ed[v.key] !== 'boolean') ed[v.key] = false;
      });
      if (ed.notes == null) ed.notes = '';
      if (ed.boxset == null) ed.boxset = '';
      if (ed.location == null) ed.location = '';
    });
  }

  // De oude velden blijven meelopen als spiegel van het 'beste' exemplaar,
  // zodat oudere code en bestaande prijsgegevens blijven kloppen.
  syncLegacyFieldsFromEditions(m);
  return m;
}

// Het representatieve exemplaar: het beste formaat dat je écht bezit,
// anders het beste van de verlanglijst.
function primaryEdition(m) {
  const eds = (m && m.editions) || [];
  if (!eds.length) return null;
  const owned = eds.filter((e) => !e.wishlist);
  const pool = owned.length ? owned : eds;
  return pool.reduce((best, e) => (formatRank(e.format) > formatRank(best.format) ? e : best), pool[0]);
}

function syncLegacyFieldsFromEditions(m) {
  const p = primaryEdition(m);
  if (!p) return;
  m.format = p.format;
  m.notes = p.notes;
  m.custom_front_cover_id = p.custom_front_cover_id || '';
  m.custom_back_cover_id = p.custom_back_cover_id || '';
  m.custom_front_cover = p.custom_front_cover || '';
  m.custom_back_cover = p.custom_back_cover || '';
  // Een titel staat op de verlanglijst zolang je er geen enkel exemplaar van bezit.
  m.wishlist = m.editions.every((e) => e.wishlist);
  if (!m.date_added) {
    const dates = m.editions.map((e) => e.date_added).filter(Boolean).sort();
    if (dates.length) m.date_added = dates[0];
  }
}

// Volgend vrij exemplaar-id binnen een titel.
function nextEditionId(m) {
  const used = new Set(((m && m.editions) || []).map((e) => e.eid));
  let n = 1;
  while (used.has('e' + n)) n++;
  return 'e' + n;
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_TOKEN_CACHE_KEY = 'mediacollectie_drive_token';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let isReady = false;
let readyCallbacks = [];
// Staat er op dit moment een stille aanmeldpoging open? Bepaalt of een fout
// aan de gebruiker gemeld moet worden of stilletjes genegeerd mag worden.
// Stille pogingen komen alleen van ensureToken(), nooit van de inlogknop.
let silentAttemptInProgress = false;

// Bestandsnaam → Drive file-ID (zodat we niet telkens opnieuw hoeven te zoeken)
const fileIdCache = {};

// ---------- Opstarten ----------

function gapiLoaded() {
  // De klassieke gapi-clientbibliotheek is niet nodig: alle Drive-aanroepen
  // hieronder gaan rechtstreeks via fetch(). Deze functie bestaat enkel om
  // de <script onload="gapiLoaded()"> in de HTML-pagina's geen foutmelding
  // te laten geven.
}

// Was de Google-bibliotheek al binnen vóórdat dit bestand geladen werd, dan
// heeft de <script onload> in de HTML dat onthouden. Meteen na de definitie
// hieronder halen we dat in — zie onderaan dit blok.
function gisLoaded() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    reportError('Kon de Google-inlogbibliotheek niet laden.');
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: onTokenResponse,
    // Google meldt fouten die niets met OAuth zelf te maken hebben (popup
    // geblokkeerd of gesloten, stille aanmelding niet mogelijk) NIET via de
    // gewone callback maar hier. Zonder deze afhandeling lijkt de inlogknop
    // in die gevallen niets te doen.
    error_callback: onTokenError,
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

let sessionRestoreAttempted = false;

/**
 * Herstelt je sessie uit de lokale opslag.
 *
 * Belangrijk: dit gebeurt METEEN bij het laden van dit bestand, zonder te
 * wachten op de Google-bibliotheek. Die bibliotheek wordt bij elke paginawissel
 * opnieuw van Google opgehaald, en zolang dat duurde stond het inlogscherm er
 * terwijl je token gewoon geldig in de browser lag. De bibliotheek is alleen
 * nodig om opnieuw in te loggen of een verlopen token te vernieuwen — niet om
 * vast te stellen dat je al ingelogd bent.
 */
function tryRestoreSession() {
  if (sessionRestoreAttempted) return;
  sessionRestoreAttempted = true;

  // Als je op een andere pagina van deze site al was ingelogd, hoef je niet
  // opnieuw in te loggen (localStorage werkt over alle tabbladen/pagina's heen).
  try {
    const cached = JSON.parse(localStorage.getItem(DRIVE_TOKEN_CACHE_KEY) || 'null');
    if (cached && cached.access_token && cached.expires_at > Date.now() + 30000) {
      accessToken = cached.access_token;
      tokenExpiresAt = cached.expires_at;
      notifyAuthenticated();
      return;
    }
  } catch {
    // Corrupte cache negeren, gewoon opnieuw laten inloggen.
  }

  // Geen (geldig) token meer in de cache: het inlogscherm blijft staan.
  // Automatisch opnieuw aanmelden proberen we hier bewust NIET — dat vereist
  // een popup, en een popup zonder klik van jou wordt door de browser
  // geblokkeerd. Eén klik op de knop is genoeg, en die toont dankzij de lege
  // prompt meestal helemaal geen scherm.
}

// Meteen proberen, nog voor de Google-bibliotheek geladen is. Dit is wat het
// kortstondig verschijnen van het inlogscherm bij paginawissels wegneemt.
tryRestoreSession();

/* ==========================================================================
 * Inlogpoort — gedeeld over alle pagina's (fase 24)
 * ==========================================================================
 * Elke pagina heeft dezelfde #login-gate met daarin #login-status. Die poort
 * werd voorheen per pagina met .remove() weggegooid zodra je inlogde. Dat gaf
 * twee problemen die samen één verwarrende fout opleverden:
 *
 * 1. Alles wat daarna nog naar #login-status schreef (de foutmelder, de
 *    driveOnReady-melding) liep stuk op null. Die TypeError kwam bovendrijven
 *    in plaats van de échte oorzaak — je zag "Cannot set properties of null"
 *    terwijl er in werkelijkheid iets heel anders aan de hand was.
 * 2. Er was geen weg terug: verliep je token, dan kon je niet opnieuw inloggen
 *    zonder de pagina te herladen.
 *
 * Daarom zit het verbergen en terugbrengen van de poort nu hier, op één plek,
 * en is alles null-veilig: een pagina zónder poort mag deze functies gewoon
 * aanroepen.
 */

function driveGateStatus(msg) {
  const el = document.getElementById('login-status');
  if (el) el.textContent = msg;
}

function driveGateHide() {
  const gate = document.getElementById('login-gate');
  if (gate) gate.classList.add('hidden');
}

// Poort terugbrengen met uitleg. Gebruikt bij een verlopen sessie: de
// inlogknop zit er nog in en werkt gewoon, dus herladen is niet meer nodig.
function driveGateShow(msg) {
  const gate = document.getElementById('login-gate');
  if (gate) gate.classList.remove('hidden');
  if (msg) driveGateStatus(msg);
}

// Inhaalslag voor de wedloop hierboven beschreven.
if (typeof window !== 'undefined' && window.__gisWachtte) {
  window.__gisWachtte = false;
  gisLoaded();
}

function driveIsSignedIn() {
  return !!accessToken;
}

// Stuurt het "ingelogd"-sein pas zodra de hele pagina geparsed is. Dit
// voorkomt dat het sein verloren gaat wanneer de Google-bibliotheek
// (die asynchroon laadt) sneller klaar is dan de rest van de pagina, en de
// pagina zelf (window._driveAuthenticated) dat sein dus nog niet kan opvangen.
//
// Het sein gaat maar ÉÉN keer naar _driveAuthenticated. Log je later opnieuw in
// (na een verlopen sessie), dan zou een tweede aanroep de hele pagina opnieuw
// opbouwen: dubbele event-listeners, dubbele modals. Daarvoor is er een aparte
// haak, _driveReauthenticated, waarin een pagina enkel haar gegevens ververst.
let authNotified = false;

function notifyAuthenticated() {
  const fire = () => {
    driveGateHide();
    if (!authNotified) {
      authNotified = true;
      if (window._driveAuthenticated) window._driveAuthenticated();
    } else if (window._driveReauthenticated) {
      window._driveReauthenticated();
    }
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
  silentAttemptInProgress = false;
  accessToken = null;

  // BELANGRIJK — niet 'verbeteren' naar prompt: ''.
  //
  // Met een lege prompt zou Google zelf beslissen of het toestemmingsscherm
  // nodig is, en zou je dat scherm meestal niet meer zien. In de praktijk
  // blijkt die stille vraag hier niet ingewilligd te worden: Google antwoordt
  // met een fout in plaats van een token, en dan opent er dus niets. Dat is
  // twee keer getest en beide keren lag de inlogknop plat.
  //
  // Automatisch herproberen kan het niet redden: een popup mag alleen openen
  // als rechtstreeks gevolg van jouw klik, en die is na een mislukte eerste
  // poging verbruikt.
  //
  // Daarom bewust altijd 'consent'. Dat toont telkens het toestemmingsscherm —
  // één extra klik — maar werkt gegarandeerd. Betrouwbaar inloggen weegt hier
  // zwaarder dan een schermpje minder.
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// Stille aanmelding zonder tussenkomst. Wordt gebruikt door ensureToken() om
// een verlopen token te vernieuwen tijdens het gebruik van de app. Niet
// geschikt als vervanging van de inlogknop: zonder klik van de gebruiker
// blokkeert de browser het venster dat Google hiervoor opent.
function driveTrySilentSignIn() {
  if (!tokenClient || accessToken) return;
  silentAttemptInProgress = true;
  try {
    tokenClient.requestAccessToken({ prompt: '' });
  } catch (e) {
    silentAttemptInProgress = false;
  }
}

function onTokenError(err) {
  const type = (err && (err.type || err.message)) || 'onbekende fout';
  if (silentAttemptInProgress) {
    // Stille poging mislukt is volkomen normaal (eerste bezoek, of cookies van
    // derden geblokkeerd). Gewoon het inlogscherm laten staan.
    silentAttemptInProgress = false;
    console.info('Stille aanmelding niet mogelijk, gebruik de inlogknop:', type);
    return;
  }
  reportError(type);
}

// Token bewaren, zonder het "ingelogd"-sein te geven. Apart gezet zodat het
// vernieuwen van een verlopen token (ensureToken) de pagina niet opnieuw laat
// opstarten — dat hoort alleen bij een échte nieuwe aanmelding.
function storeToken(resp) {
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
}

// Sessie is niet meer geldig: token weggooien en de inlogpoort terugbrengen,
// zodat je gewoon opnieuw kan inloggen zonder de pagina te herladen.
function driveSessionExpired() {
  accessToken = null;
  tokenExpiresAt = 0;
  try {
    localStorage.removeItem(DRIVE_TOKEN_CACHE_KEY);
  } catch {}
  driveGateShow('Je Google-sessie is verlopen. Log opnieuw in om verder te gaan — je gegevens blijven bewaard.');
}

function onTokenResponse(resp) {
  const wasSilent = silentAttemptInProgress;
  silentAttemptInProgress = false;

  if (resp.error) {
    // Een mislukte stille poging is geen fout om de gebruiker mee lastig te
    // vallen; die klikt gewoon op de inlogknop.
    if (wasSilent) {
      console.info('Stille aanmelding niet mogelijk:', resp.error);
      return;
    }
    reportError(resp.error);
    return;
  }
  storeToken(resp);
  notifyAuthenticated();
}

// Zorgt dat er altijd een geldig (niet-verlopen) token is vóór een Drive-aanroep.
// Vraagt zo nodig stilletjes een nieuw token aan (zonder inlogscherm) als je al
// eerder toestemming gaf.
/**
 * Wacht tot de Google-bibliotheek klaar is. Nodig omdat we de sessie nu al
 * herstellen vóór die bibliotheek geladen is: een Drive-aanroep vlak na het
 * openen van de pagina zou anders stuklopen op een tokenClient die er nog
 * niet is.
 */
function whenTokenClientReady(timeoutMs) {
  if (tokenClient) return Promise.resolve(tokenClient);
  const limit = timeoutMs || 15000;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (tokenClient) return resolve(tokenClient);
      if (Date.now() - started > limit) {
        return reject(new Error('De Google-inlogbibliotheek kon niet geladen worden. Controleer je verbinding.'));
      }
      setTimeout(check, 100);
    };
    check();
  });
}

/**
 * Zorgt dat er een geldig token is vóór een Drive-aanroep. Is het token bijna
 * verlopen, dan proberen we het stil te vernieuwen.
 *
 * Die stille poging lukt vaak níet (Google wil er meestal een klik bij zien).
 * Dat is geen ramp, maar het moet wel netjes eindigen. Vandaar drie dingen die
 * hier eerder ontbraken en samen die verwarrende "Cannot set properties of
 * null"-melding veroorzaakten:
 *
 * 1. `silentAttemptInProgress` gaat aan, zodat onTokenError deze mislukking
 *    niet als een gewone inlogfout aan de gebruiker meldt.
 * 2. Ook `error_callback` wordt tijdelijk overgenomen. Google meldt een
 *    mislukte stille poging namelijk dáár, niet via de gewone callback — zonder
 *    dit bleef de belofte eeuwig open staan en hing de app.
 * 3. Een tijdslimiet, zodat er ook bij een uitblijvend antwoord een duidelijke
 *    fout komt in plaats van stilte.
 *
 * Loopt er al een vernieuwing (de collectie én de prijzen laden bijvoorbeeld
 * tegelijk), dan wachten alle aanroepers op diezelfde poging. Twee gelijktijdige
 * pogingen zouden elkaars callbacks overschrijven.
 */
let tokenRenewal = null;

async function ensureToken() {
  if (accessToken && tokenExpiresAt > Date.now() + 30000) {
    return accessToken;
  }
  if (tokenRenewal) return tokenRenewal;
  tokenRenewal = renewToken().finally(() => {
    tokenRenewal = null;
  });
  return tokenRenewal;
}

async function renewToken() {
  await whenTokenClientReady();
  return new Promise((resolve, reject) => {
    const previousCallback = tokenClient.callback;
    const previousErrorCallback = tokenClient.error_callback;
    let settled = false;

    const restore = () => {
      tokenClient.callback = previousCallback;
      tokenClient.error_callback = previousErrorCallback;
      silentAttemptInProgress = false;
      clearTimeout(timer);
    };

    const fail = (detail) => {
      if (settled) return;
      settled = true;
      restore();
      console.info('Stille tokenvernieuwing mislukt:', detail || '(geen details)');
      driveSessionExpired();
      reject(new Error('Je Google-sessie is verlopen. Log opnieuw in en probeer het daarna nog eens.'));
    };

    const succeed = (resp) => {
      if (settled) return;
      settled = true;
      restore();
      storeToken(resp);
      driveGateHide();
      resolve(accessToken);
    };

    const timer = setTimeout(() => fail('geen antwoord binnen 20 seconden'), 20000);

    silentAttemptInProgress = true;
    tokenClient.callback = (resp) => {
      if (!resp || resp.error) fail(resp && resp.error);
      else succeed(resp);
    };
    tokenClient.error_callback = (err) => fail(err && (err.type || err.message));

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (err) {
      fail(err && err.message);
    }
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
  const list = Array.isArray(movies) ? movies : [];
  // Altijd normaliseren: elke titel krijgt een exemplarenlijst. Dit gebeurt
  // enkel in het geheugen — naar Drive wordt pas geschreven bij een bewerking.
  list.forEach(normalizeMovieEntry);
  return { movies: list };
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
  return deleteMoviesInDrive([id]);
}

/**
 * Verwijdert meerdere titels in één schrijfactie.
 *
 * Bewust niet: `for (id of ids) await deleteMovieInDrive(id)`. Dat zou bij
 * 200 titels 200 keer de volledige movies.json op- én neerhalen — minutenlang,
 * en met 200 kansen om halverwege te stranden. Nu is het één lees- en één
 * schrijfactie binnen dezelfde vergrendeling.
 *
 * Geeft het aantal daadwerkelijk verwijderde titels terug; id's die al weg
 * waren tellen niet mee.
 */
async function deleteMoviesInDrive(ids) {
  const weg = new Set(ids || []);
  if (!weg.size) return 0;
  return withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    const filtered = movies.filter((m) => !weg.has(m.id));
    const verwijderd = movies.length - filtered.length;
    if (verwijderd) await driveSaveNamedFile('movies.json', filtered);
    return verwijderd;
  });
}

/**
 * Controleert een te importeren collectiebestand vóórdat er iets wordt
 * weggeschreven (FASE 31).
 *
 * Tot nu toe ging de inhoud van het gekozen bestand er ongezien in: was het
 * geen lijst, dan kreeg je een onbegrijpelijke foutmelding, en waren het
 * records zonder `id`, dan belandden die als losse rommel in je collectie —
 * onzichtbaar, want zonder id kan je ze ook niet meer verwijderen.
 *
 * Geeft een rapport terug in plaats van te gooien, zodat de beheerpagina kan
 * tonen wát er gaat gebeuren en om bevestiging kan vragen.
 */
function controleerImportCollectie(data, huidige) {
  const rapport = { geldig: false, reden: '', totaal: 0, nieuw: 0, vervangt: 0, ongeldig: 0, voorbeelden: [] };

  if (!Array.isArray(data)) {
    rapport.reden = 'Dit bestand bevat geen lijst met titels. Verwacht werd een JSON-bestand dat begint met [ en eindigt met ].';
    return rapport;
  }
  if (!data.length) {
    rapport.reden = 'Het bestand bevat nul titels — er valt niets te importeren.';
    return rapport;
  }

  const bestaandeIds = new Set((huidige || []).map((m) => m.id));
  const gezien = new Set();

  data.forEach((entry) => {
    rapport.totaal++;
    const heeftId = entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id.trim();
    const heeftTitel = entry && typeof entry.title === 'string' && entry.title.trim();
    if (!heeftId || !heeftTitel) {
      rapport.ongeldig++;
      if (rapport.voorbeelden.length < 3) {
        rapport.voorbeelden.push(
          !heeftId ? 'record zonder bruikbare id' : `"${String(entry.title || '?').slice(0, 40)}" zonder titel`
        );
      }
      return;
    }
    if (gezien.has(entry.id)) { rapport.ongeldig++; return; } // dubbel in het bestand zelf
    gezien.add(entry.id);
    if (bestaandeIds.has(entry.id)) rapport.vervangt++;
    else rapport.nieuw++;
  });

  if (rapport.nieuw + rapport.vervangt === 0) {
    rapport.reden = `Geen enkele van de ${rapport.totaal} records is bruikbaar (elke titel heeft een id en een titel nodig).`;
    return rapport;
  }
  rapport.geldig = true;
  return rapport;
}

/**
 * Leest het bestand, controleert het, en geeft het rapport terug — zonder iets
 * weg te schrijven. De beheerpagina toont dat rapport en vraagt pas daarna om
 * bevestiging.
 */
async function beoordeelImportBestand(tekst) {
  let data;
  try {
    data = JSON.parse(tekst);
  } catch (e) {
    return { geldig: false, reden: 'Dit is geen geldig JSON-bestand (' + e.message + ').' };
  }
  const { movies } = await driveLoadMovies();
  const rapport = controleerImportCollectie(data, movies);
  rapport.data = rapport.geldig ? data : null;
  rapport.huidigAantal = movies.length;
  return rapport;
}

/**
 * Voert de import daadwerkelijk uit. Maakt eerst een backup: importeren
 * overschrijft bestaande titels, en dat was tot nu toe onomkeerbaar.
 * Records zonder id of titel worden overgeslagen in plaats van meegenomen.
 */
async function importMoviesJsonIntoDrive(arr) {
  const backup = await driveBackupNow('voor-import');
  return withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    let overgeslagen = 0;
    arr.forEach((entry) => {
      const bruikbaar =
        entry && typeof entry === 'object' &&
        typeof entry.id === 'string' && entry.id.trim() &&
        typeof entry.title === 'string' && entry.title.trim();
      if (!bruikbaar) { overgeslagen++; return; }
      const idx = movies.findIndex((m) => m.id === entry.id);
      if (idx >= 0) movies[idx] = entry;
      else movies.push(entry);
    });
    await driveSaveNamedFile('movies.json', movies);
    return { totaal: movies.length, overgeslagen, backup };
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
/**
 * Cache van blob-URL's per Drive-bestand-ID, met een bovengrens.
 *
 * Een blob-URL houdt de volledige afbeelding in het geheugen van het tabblad
 * tot je hem expliciet vrijgeeft met URL.revokeObjectURL(). Dat gebeurde
 * nergens: elke hoesfoto die je bekeek bleef de hele sessie staan, en die zijn
 * tot 1200 px geresized. Op een telefoon liep dat na een half uur bladeren op
 * tot een herstart van de browser.
 *
 * Daarom: hoogstens COVER_CACHE_MAX foto's tegelijk, en de langst niet
 * gebruikte gaat eruit — inclusief revokeObjectURL, want alleen de sleutel
 * weggooien geeft het geheugen niet terug.
 */
const COVER_CACHE_MAX = 24;
const _coverUrlCache = {};
const _coverUrlOrder = []; // oudst gebruikt eerst

function _coverCacheTouch(fileId) {
  const i = _coverUrlOrder.indexOf(fileId);
  if (i >= 0) _coverUrlOrder.splice(i, 1);
  _coverUrlOrder.push(fileId);
}

// Geeft één blob-URL vrij en haalt hem uit de cache. Ook los bruikbaar,
// bijvoorbeeld nadat een foto vervangen of verwijderd is.
function driveReleaseCoverUrl(fileId) {
  const url = _coverUrlCache[fileId];
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Al vrijgegeven of niet meer geldig: niets aan de hand.
  }
  delete _coverUrlCache[fileId];
  const i = _coverUrlOrder.indexOf(fileId);
  if (i >= 0) _coverUrlOrder.splice(i, 1);
}

function _coverCacheTrim() {
  while (_coverUrlOrder.length > COVER_CACHE_MAX) {
    driveReleaseCoverUrl(_coverUrlOrder[0]);
  }
}

async function driveCoverBlobUrl(fileId) {
  if (_coverUrlCache[fileId]) {
    _coverCacheTouch(fileId);
    return _coverUrlCache[fileId];
  }
  const resp = await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  _coverUrlCache[fileId] = url;
  _coverCacheTouch(fileId);
  _coverCacheTrim();
  return url;
}

async function driveDeleteCoverFile(fileId) {
  if (!fileId) return;
  // Eerst de blob-URL vrijgeven: het bestand bestaat straks niet meer, dus de
  // kopie in het geheugen hoeft er ook niet meer te zijn.
  driveReleaseCoverUrl(fileId);
  try {
    await driveDeleteFile(fileId);
  } catch {
    // Al verwijderd of onbereikbaar: geen probleem.
  }
}

/**
 * Verwijdert alle hoesfoto's van één exemplaar, of van een hele titel.
 * Faalt nooit: een foto die al weg is, is precies wat we wilden.
 */
async function driveDeleteCoversOfEdition(edition) {
  if (!edition) return;
  await driveDeleteCoverFile(edition.custom_front_cover_id);
  await driveDeleteCoverFile(edition.custom_back_cover_id);
}

async function driveDeleteCoversOfMovie(movie) {
  if (!movie) return;
  for (const ed of movie.editions || []) {
    await driveDeleteCoversOfEdition(ed);
  }
  // Titels van vóór de exemplaren-structuur hebben de ID's op het hoofdniveau.
  await driveDeleteCoverFile(movie.custom_front_cover_id);
  await driveDeleteCoverFile(movie.custom_back_cover_id);
}

function _isCoverDataUrl(v) {
  return typeof v === 'string' && v.startsWith('data:image');
}

/**
 * Eenmalige migratie: zet alle foto's die nog als data-URL in movies.json
 * zitten om naar losse Drive-bestanden. onProgress(klaar, totaal) per titel.
 *
 * Werkt per EXEMPLAAR, niet per titel. Dat is wezenlijk: normalizeMovieEntry()
 * kopieert een oude data-URL van het hoofdniveau naar editions[0], en
 * syncLegacyFieldsFromEditions() zet het hoofdniveau daarna weer terug vanuit
 * dat exemplaar. Migreerde je alleen het hoofdniveau, dan werd het net
 * toegekende Drive-bestand-ID bij de volgende lading overschreven met een lege
 * waarde en stond de data-URL er weer — waardoor de migratie bij élk bezoek
 * opnieuw draaide en movies.json nooit kleiner werd.
 */
async function driveMigrateCoversToFiles(onProgress) {
  const { movies } = await driveLoadMovies();
  const heeftDataUrl = (m) =>
    (m.editions || []).some((e) => _isCoverDataUrl(e.custom_front_cover) || _isCoverDataUrl(e.custom_back_cover)) ||
    _isCoverDataUrl(m.custom_front_cover) ||
    _isCoverDataUrl(m.custom_back_cover);
  const todo = movies.filter(heeftDataUrl);
  if (!todo.length) return 0;

  let done = 0;
  for (const m of todo) {
    for (const ed of m.editions || []) {
      // Dezelfde bestandsnaam als het bewerkpaneel gebruikt, zodat een DVD- en
      // een 4K-doosje van dezelfde film elkaar niet overschrijven.
      const coverKey = m.id + '-' + ed.eid;
      if (_isCoverDataUrl(ed.custom_front_cover)) {
        ed.custom_front_cover_id = await driveUploadCoverFile(ed.custom_front_cover.split(',')[1], coverKey, 'front');
        ed.custom_front_cover = '';
      }
      if (_isCoverDataUrl(ed.custom_back_cover)) {
        ed.custom_back_cover_id = await driveUploadCoverFile(ed.custom_back_cover.split(',')[1], coverKey, 'back');
        ed.custom_back_cover = '';
      }
    }
    // Restanten op het hoofdniveau (een record zonder editions[] hoort niet te
    // bestaan, maar we laten er geen data-URL achter).
    if (_isCoverDataUrl(m.custom_front_cover)) m.custom_front_cover = '';
    if (_isCoverDataUrl(m.custom_back_cover)) m.custom_back_cover = '';
    // Hoofdniveau opnieuw afleiden uit het representatieve exemplaar.
    syncLegacyFieldsFromEditions(m);

    done++;
    if (onProgress) onProgress(done, todo.length);
  }

  // Herlezen binnen de vergrendeling en samenvoegen op id: deze migratie kan
  // minuten duren, en ondertussen kan je op een ander toestel iets wijzigen.
  await withWriteLock(async () => {
    const { movies: actueel } = await driveLoadMovies();
    const gemigreerd = new Map(todo.map((m) => [m.id, m]));
    const samen = actueel.map((m) => gemigreerd.get(m.id) || m);
    await driveSaveNamedFile('movies.json', samen);
  });
  return todo.length;
}

// Oude helper (data-URL in movies.json) — enkel nog aanwezig zodat een
// verouderde pagina-versie in cache geen fout geeft. Niet meer gebruiken.
async function driveUploadCoverImage(base64Jpeg, slug, side) {
  return `data:image/jpeg;base64,${base64Jpeg}`;
}

// ---------- Universums (fase 11) ----------
// Overkoepelende franchises zoals het MCU. Elk universum verwijst naar een
// TMDb-trefwoord; de ledenlijst wordt live opgehaald en niet bewaard, zodat
// nieuwe releases vanzelf meetellen.

async function driveLoadUniverses() {
  const fileId = await driveGetOrCreateFileId('universes.json', []);
  const data = await driveReadJsonFile(fileId);
  return { universes: Array.isArray(data) ? data : [] };
}

async function driveSaveUniverses(universes) {
  return withWriteLock(() => driveSaveNamedFile('universes.json', universes || []));
}

// ---------- Prijzen ----------

async function driveLoadPrices() {
  const fileId = await driveGetOrCreateFileId('price_history.json', []);
  const prices = await driveReadJsonFile(fileId);
  return { prices: Array.isArray(prices) ? prices : [] };
}

function controleerImportPrijzen(data) {
  const rapport = { geldig: false, reden: '', totaal: 0, ongeldig: 0 };
  if (!Array.isArray(data)) {
    rapport.reden = 'Dit bestand bevat geen lijst met prijsmetingen.';
    return rapport;
  }
  if (!data.length) {
    rapport.reden = 'Het bestand bevat nul metingen.';
    return rapport;
  }
  data.forEach((entry) => {
    rapport.totaal++;
    const sleutel = entry && typeof entry === 'object' && (entry.id || entry.title);
    if (!sleutel) rapport.ongeldig++;
  });
  if (rapport.ongeldig === rapport.totaal) {
    rapport.reden = 'Geen enkele meting heeft een id of titel om op te herkennen.';
    return rapport;
  }
  rapport.geldig = true;
  return rapport;
}

async function importPriceHistoryJsonIntoDrive(arr) {
  return withWriteLock(async () => {
    const { prices } = await driveLoadPrices();
    arr = arr.filter((entry) => entry && typeof entry === 'object' && (entry.id || entry.title));
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
// FASE 31 — de prijsgeschiedenis krijgt een eigen backupbestand met dezelfde
// tijdstempel als de collectiebackup. Bewust een apart bestand en niet één
// gecombineerd bestand: dan blijft het formaat van bestaande backups precies
// zoals het was, en kan je oudere backups gewoon blijven terugzetten.
// Prijzen zijn maanden opbouwwerk (metingen die je niet opnieuw kan doen) en
// stonden tot nu toe in géén enkele backup.
const PRICE_BACKUP_PREFIX = 'prices-backup-';
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

// Alle prijsbackups in Drive, nieuwste eerst.
async function driveListPriceBackups() {
  const q = encodeURIComponent(`name contains '${PRICE_BACKUP_PREFIX}' and trashed=false`);
  const resp = await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,createdTime,size)&pageSize=100`
  );
  const data = await resp.json();
  return (data.files || []).sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''));
}

/**
 * Zet de prijsgeschiedenis weg onder dezelfde naamstaart als de
 * collectiebackup, zodat de twee bij elkaar te vinden zijn. Faalt dit, dan mag
 * dat de collectiebackup nooit tegenhouden — die is belangrijker.
 * `staart` is bv. '2026-07-30' of 'voor-import-2026-07-30-21u15'.
 */
async function _backupPricesMet(staart, maxBewaren) {
  try {
    const { prices } = await driveLoadPrices();
    if (!prices.length) return null;
    const naam = `${PRICE_BACKUP_PREFIX}${staart}.json`;
    await driveCreateJsonFile(naam, prices);
    if (maxBewaren) {
      const zelfde = (await driveListPriceBackups()).filter((f) => f.name.startsWith(PRICE_BACKUP_PREFIX));
      for (const f of zelfde.slice(maxBewaren)) {
        try { await driveDeleteFile(f.id); } catch {}
      }
    }
    return naam;
  } catch (e) {
    console.warn('Prijsgeschiedenis niet mee geback-upt (collectie wél):', e);
    return null;
  }
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
      await _backupPricesMet(today, BACKUP_KEEP);

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
/**
 * Maakt nú een backup, los van het wekelijkse schema. Gebruikt vóór een actie
 * die veel titels in één keer weghaalt: dan staat er altijd een terugweg klaar
 * via Beheer → Herstellen, ook als je pas morgen merkt dat je te veel wiste.
 *
 * De naam bevat datum én tijd, zodat hij níet meetelt als "de wekelijkse
 * backup van vandaag" en het gewone schema gewoon doorloopt.
 * Geeft de bestandsnaam terug, of null als er niets te back-uppen viel.
 */
async function driveBackupNow(reden) {
  return withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    if (!movies.length) return null;
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', 'u');
    const label = (reden || 'handmatig').replace(/[^a-z0-9-]/gi, '');
    const naam = `${BACKUP_PREFIX}${label}-${stamp}.json`;
    await driveCreateJsonFile(naam, movies);
    await _backupPricesMet(`${label}-${stamp}`, 6);

    // Hoogstens 3 van deze veiligheidskopieën bewaren, anders groeit het aan.
    const zelfde = (await driveListBackups()).filter((f) => f.name.startsWith(`${BACKUP_PREFIX}${label}-`));
    for (const f of zelfde.slice(3)) {
      try { await driveDeleteFile(f.id); } catch {}
    }
    return naam;
  });
}

/* ==========================================================================
 * Volledig leegmaken (fase 28)
 * ==========================================================================
 * Bedoeld voor één moment: je hebt getest, je wil met een schone lei aan de
 * échte collectie beginnen. Nooit iets dat per ongeluk gebeurt — de knop zit
 * in een aparte gevarenzone op de beheerpagina, met een woord dat je moet
 * overtypen, en er gaat altijd eerst een backup naar Drive.
 * ========================================================================== */

// Alle hoesfoto-bestanden in de App Data-map.
async function driveListCoverFiles() {
  const q = encodeURIComponent(`name contains 'cover-' and trashed=false`);
  const resp = await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)&pageSize=1000`
  );
  const data = await resp.json();
  return (data.files || []).filter((f) => /^cover-.*\.(jpg|jpeg|png)$/i.test(f.name));
}

/**
 * Maakt de collectie leeg. `opties` bepaalt wat er méé weggaat:
 *   { covers, prices, universes }  — alle drie standaard uit.
 *
 * Let op de volgorde: eerst de backup, dan pas wissen. En hoesfoto's staan
 * bewust standaard uit — de backup bevat alleen movies.json, dus wie de foto's
 * weggooit en later een backup terugzet, houdt titels over die naar bestanden
 * verwijzen die niet meer bestaan.
 *
 * onProgress(tekst) meldt elke stap. Geeft een overzicht terug van wat er weg is.
 */
async function driveWipeCollection(opties, onProgress) {
  const o = opties || {};
  const melden = (t) => { if (onProgress) onProgress(t); };

  melden('Backup maken naar Drive…');
  const backup = await driveBackupNow('voor-reset');

  const uitkomst = { backup, titels: 0, covers: 0, prijzen: false, universums: false };

  melden('Collectie leegmaken…');
  await withWriteLock(async () => {
    const { movies } = await driveLoadMovies();
    uitkomst.titels = movies.length;
    await driveSaveNamedFile('movies.json', []);
  });

  if (o.covers) {
    melden('Hoesfoto’s verwijderen…');
    const files = await driveListCoverFiles();
    for (let i = 0; i < files.length; i++) {
      melden(`Hoesfoto’s verwijderen… (${i + 1}/${files.length})`);
      try {
        await driveDeleteFile(files[i].id);
        uitkomst.covers++;
      } catch {
        // Eén onbereikbaar bestand mag de rest niet blokkeren.
      }
    }
    // Blob-URL's van net verwijderde foto's horen ook uit het geheugen.
    Object.keys(_coverUrlCache).forEach((id) => driveReleaseCoverUrl(id));
  }

  if (o.prices) {
    melden('Prijsgeschiedenis wissen…');
    await withWriteLock(() => driveSaveNamedFile('price_history.json', []));
    uitkomst.prijzen = true;
  }

  if (o.universes) {
    melden('Universums wissen…');
    await withWriteLock(() => driveSaveNamedFile('universes.json', []));
    uitkomst.universums = true;
  }

  // De lokale offline-kopie mag niet blijven staan; die zou de gewiste
  // collectie bij het volgende bezoek weer tonen alsof er niets gebeurd is.
  try {
    localStorage.removeItem(MOVIES_CACHE_KEY);
  } catch {}

  melden('Klaar.');
  return uitkomst;
}

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

    // Hoort er een prijsbackup met dezelfde tijdstempel bij, zet die dan ook
    // terug. Anders wijst je collectie naar titels waarvan de prijsmetingen
    // uit een ander moment komen.
    try {
      const naam = (await driveListBackups()).find((f) => f.id === fileId);
      if (naam) {
        const staart = naam.name.replace(BACKUP_PREFIX, '').replace(/\.json$/, '');
        const prijsBestand = (await driveListPriceBackups())
          .find((f) => f.name === `${PRICE_BACKUP_PREFIX}${staart}.json`);
        if (prijsBestand) {
          const prijzen = await driveReadJsonFile(prijsBestand.id);
          if (Array.isArray(prijzen)) await driveSaveNamedFile('price_history.json', prijzen);
        }
      }
    } catch (e) {
      console.warn('Bijhorende prijsbackup niet teruggezet:', e);
    }

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
