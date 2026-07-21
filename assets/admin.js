/**
 * Beheer-tool — zoekt op TMDb. De config (TMDb-key) wordt enkel lokaal in je
 * browser bewaard (localStorage), nooit verstuurd naar iets anders dan TMDb.
 * Het wegschrijven naar je collectie gebeurt via assets/drive.js (Google Drive).
 *
 * Fase 2b: tmdbDetails geeft ook de officiële TMDb-reeks mee
 * (belongs_to_collection, bv. "Harry Potter Collection") als `saga`.
 *
 * Fase 5 — rijkere TMDb-gegevens, nog steeds in één enkele API-aanroep dankzij
 * append_to_response:
 * - backdrop (brede achtergrondafbeelding) en tagline
 * - leeftijdskeuring (Kijkwijzer/MPAA) via release_dates resp. content_ratings
 * - reeks-ID, zodat we alle delen van een reeks kunnen opvragen
 * - volledige crew (scenario, muziek) en cast mét foto's en rolnamen
 * - trailer (YouTube) en IMDb-link via external_ids
 * - voor series: status (afgelopen / loopt nog) en aantal seizoenen
 * - terugval op Engelse tekst wanneer de Nederlandse synopsis leeg is
 */

const LS_KEY = 'mediacollectie_admin_config';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w200';

// Volgorde waarin we naar een leeftijdskeuring zoeken: eerst Nederlands/Belgisch
// (Kijkwijzer), dan Brits/Amerikaans als die er niet zijn.
const TMDB_CERT_COUNTRIES = ['NL', 'BE', 'GB', 'US'];

// Welke crewfuncties we bewaren, en in welke volgorde ze getoond worden.
// TMDb levert vaak honderden crewleden; dit houdt het bij wie ertoe doet.
const KEY_CREW_JOBS = {
  Director: 1,
  Screenplay: 2,
  Writer: 2,
  Story: 3,
  Novel: 3,
  'Original Music Composer': 4,
  'Director of Photography': 5,
  Editor: 6,
  'Production Design': 7,
  'Costume Design': 8,
  Producer: 9,
  'Executive Producer': 10,
};

const KEY_CREW_LABELS = {
  Director: 'Regie',
  Screenplay: 'Scenario',
  Writer: 'Scenario',
  Story: 'Verhaal',
  Novel: 'Roman',
  'Original Music Composer': 'Muziek',
  'Director of Photography': 'Camera',
  Editor: 'Montage',
  'Production Design': 'Decor',
  'Costume Design': 'Kostuums',
  Producer: 'Productie',
  'Executive Producer': 'Uitvoerend producent',
};

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

function slugify(title, year) {
  let s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-');
  return year ? `${s}-${year}` : s;
}

function resizeImageFile(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result.split(',')[1]);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- TMDb ----------

async function tmdbSearch(query, apiKey) {
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(apiKey)}&language=nl-NL&query=${encodeURIComponent(query)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('TMDb-fout: ' + resp.status);
  const data = await resp.json();
  return (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
}

async function tmdbGet(path, params, apiKey) {
  const query = new URLSearchParams({ api_key: apiKey, ...params }).toString();
  const resp = await fetch(`https://api.themoviedb.org/3/${path}?${query}`);
  if (!resp.ok) throw new Error('TMDb-fout: ' + resp.status);
  return resp.json();
}

// Leeftijdskeuring uit de TMDb-respons vissen. Films en series leveren dit in
// een verschillende vorm aan, vandaar de twee takken.
function tmdbCertification(d, mediaType) {
  const results =
    mediaType === 'tv' ? d.content_ratings && d.content_ratings.results : d.release_dates && d.release_dates.results;
  if (!Array.isArray(results)) return { certification: '', certification_country: '' };

  for (const country of TMDB_CERT_COUNTRIES) {
    const match = results.find((r) => r.iso_3166_1 === country);
    if (!match) continue;

    if (mediaType === 'tv') {
      if (match.rating) return { certification: String(match.rating), certification_country: country };
    } else {
      // Een land kan meerdere releases hebben (bioscoop, digitaal, fysiek);
      // we nemen de eerste met een ingevulde keuring.
      const rated = (match.release_dates || []).find((r) => r.certification);
      if (rated) return { certification: rated.certification, certification_country: country };
    }
  }
  return { certification: '', certification_country: '' };
}

// Beste trailer kiezen: liefst een officiële Nederlandse of Engelse trailer op
// YouTube; anders een teaser.
function tmdbTrailerKey(d) {
  const videos = (d.videos && d.videos.results) || [];
  // Enkel echte trailers en teasers; clips, featurettes en interviews vallen af.
  const usable = videos.filter(
    (v) => v.site === 'YouTube' && v.key && (v.type === 'Trailer' || v.type === 'Teaser')
  );
  const score = (v) => (v.type === 'Trailer' ? 2 : 1) + (v.official ? 0.5 : 0);
  const best = usable.sort((a, b) => score(b) - score(a))[0];
  return best ? best.key : '';
}

async function tmdbDetails(id, mediaType, apiKey) {
  // Alles in één aanroep: details + credits + keuring + trailer + externe ID's.
  const appends =
    mediaType === 'tv'
      ? 'credits,content_ratings,external_ids,videos'
      : 'credits,release_dates,external_ids,videos';
  const d = await tmdbGet(`${mediaType}/${id}`, { language: 'nl-NL', append_to_response: appends }, apiKey);

  // Nederlandse synopsis ontbreekt vaak bij minder bekende titels; dan vallen
  // we terug op de Engelse tekst in plaats van niets te tonen.
  let overview = d.overview || '';
  let tagline = d.tagline || '';
  if (!overview || !tagline) {
    try {
      const en = await tmdbGet(`${mediaType}/${id}`, { language: 'en-US' }, apiKey);
      if (!overview) overview = en.overview || '';
      if (!tagline) tagline = en.tagline || '';
    } catch {
      // Terugval is een extraatje: mislukt ze, dan gaan we gewoon verder.
    }
  }

  const crew = (d.credits && d.credits.crew) || [];
  const uniqueNames = (list) => [...new Set(list.map((c) => c.name))];

  let directors = uniqueNames(crew.filter((c) => c.job === 'Director'));
  if (!directors.length && d.created_by) directors = uniqueNames(d.created_by);
  const writers = uniqueNames(crew.filter((c) => ['Screenplay', 'Writer', 'Story', 'Author'].includes(c.job))).slice(0, 3);
  const composers = uniqueNames(crew.filter((c) => c.job === 'Original Music Composer')).slice(0, 2);

  const castRaw = ((d.credits && d.credits.cast) || []).slice(0, 12);
  // `cast` blijft een simpele namenlijst (zo blijft bestaande code werken);
  // `cast_details` voegt rolnaam, portretfoto en het TMDb-id toe. Dat id is
  // nodig om de filmografie van die persoon te kunnen opvragen.
  const cast = castRaw.slice(0, 5).map((c) => c.name);
  const castDetails = castRaw.map((c) => ({
    id: c.id || null,
    name: c.name,
    character: c.character || '',
    profile_path: c.profile_path || '',
  }));

  // Crew: enkel de functies die er voor een verzamelaar toe doen, anders staan
  // er al snel honderd namen in. Dezelfde persoon met meerdere functies wordt
  // samengevoegd ("Regie · Scenario").
  const crewByPerson = {};
  crew
    .filter((c) => KEY_CREW_JOBS[c.job])
    .forEach((c) => {
      const key = c.id || c.name;
      if (!crewByPerson[key]) {
        crewByPerson[key] = {
          id: c.id || null,
          name: c.name,
          profile_path: c.profile_path || '',
          jobs: [],
          rank: KEY_CREW_JOBS[c.job],
        };
      }
      const label = KEY_CREW_LABELS[c.job] || c.job;
      if (!crewByPerson[key].jobs.includes(label)) crewByPerson[key].jobs.push(label);
      crewByPerson[key].rank = Math.min(crewByPerson[key].rank, KEY_CREW_JOBS[c.job]);
    });

  // Bij series staan de bedenkers niet in de crew-lijst maar apart.
  (d.created_by || []).forEach((p) => {
    const key = p.id || p.name;
    if (!crewByPerson[key]) {
      crewByPerson[key] = { id: p.id || null, name: p.name, profile_path: p.profile_path || '', jobs: [], rank: 0 };
    }
    if (!crewByPerson[key].jobs.includes('Bedenker')) crewByPerson[key].jobs.unshift('Bedenker');
    crewByPerson[key].rank = 0;
  });

  const crewDetails = Object.values(crewByPerson)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 14)
    .map(({ rank, ...rest }) => rest);

  const title = d.title || d.name;
  const date = d.release_date || d.first_air_date || '';
  const year = /^\d{4}/.test(date) ? parseInt(date.slice(0, 4), 10) : null;
  let runtime = d.runtime;
  if (!runtime && d.episode_run_time && d.episode_run_time.length) runtime = d.episode_run_time[0];

  // Voor TV-reeksen: lijst van seizoenen meesturen (nummer, naam, aantal
  // afleveringen), zodat je per seizoen kan aangeven of je het bezit en in
  // welk formaat. 'Specials' (seizoen 0) worden overgeslagen.
  const seasons =
    mediaType === 'tv' && Array.isArray(d.seasons)
      ? d.seasons
          .filter((s) => s.season_number > 0)
          .map((s) => ({
            season_number: s.season_number,
            name: s.name,
            episode_count: s.episode_count,
          }))
      : undefined;

  const cert = tmdbCertification(d, mediaType);

  return {
    tmdb_id: id,
    title,
    original_title: d.original_title || d.original_name || '',
    original_language: d.original_language || '',
    release_year: year,
    release_date: date,
    poster_path: d.poster_path || '',
    backdrop_path: d.backdrop_path || '',
    genres: (d.genres || []).map((g) => g.name),
    director: directors.join(', '),
    writers: writers.join(', '),
    composer: composers.join(', '),
    cast,
    cast_details: castDetails,
    crew_details: crewDetails,
    runtime: runtime || null,
    rating: d.vote_average || null,
    vote_count: d.vote_count || 0,
    overview,
    tagline,
    certification: cert.certification,
    certification_country: cert.certification_country,
    trailer_key: tmdbTrailerKey(d),
    imdb_id: (d.external_ids && d.external_ids.imdb_id) || d.imdb_id || '',
    // Officiële TMDb-reeks (enkel films), bv. "Harry Potter Collection".
    // Handmatig aan te passen via het bewerken-paneel.
    saga: (d.belongs_to_collection && d.belongs_to_collection.name) || '',
    // Het ID maakt het mogelijk om alle delen van de reeks op te vragen en te
    // zien welke je nog mist.
    saga_id: (d.belongs_to_collection && d.belongs_to_collection.id) || null,
    // Enkel voor series: 'Ended', 'Returning Series', 'Canceled', ...
    ...(mediaType === 'tv' ? { tv_status: d.status || '', number_of_seasons: d.number_of_seasons || null } : {}),
    ...(seasons ? { seasons } : {}),
  };
}

// Alle delen van een reeks (TMDb-collectie), gesorteerd op releasejaar.
// Wordt gebruikt om te tonen welke delen nog in je collectie ontbreken.
async function tmdbCollection(collectionId, apiKey) {
  const d = await tmdbGet(`collection/${collectionId}`, { language: 'nl-NL' }, apiKey);
  const parts = (d.parts || [])
    .map((p) => {
      const date = p.release_date || '';
      return {
        tmdb_id: p.id,
        title: p.title || p.name,
        release_year: /^\d{4}/.test(date) ? parseInt(date.slice(0, 4), 10) : null,
        poster_path: p.poster_path || '',
        release_date: date,
      };
    })
    // Titels zonder releasedatum zijn meestal nog niet uitgebrachte films;
    // die tonen we achteraan in plaats van ze weg te laten.
    .sort((a, b) => (a.release_year || 9999) - (b.release_year || 9999));
  return { id: d.id, name: d.name || '', overview: d.overview || '', poster_path: d.poster_path || '', parts };
}

/**
 * Alles van één persoon: profiel, biografie en de volledige filmografie
 * (zowel acteerwerk als crewfuncties, samengevoegd per titel).
 *
 * Dezelfde film kan meermaals voorkomen — bv. als regisseur én scenarist —
 * en wordt dan tot één regel samengevoegd met beide functies.
 */
async function tmdbPerson(personId, apiKey) {
  const d = await tmdbGet(
    `person/${personId}`,
    { language: 'nl-NL', append_to_response: 'combined_credits' },
    apiKey
  );

  // Nederlandse biografieën ontbreken vaak; dan de Engelse tonen.
  let biography = d.biography || '';
  if (!biography) {
    try {
      const en = await tmdbGet(`person/${personId}`, { language: 'en-US' }, apiKey);
      biography = en.biography || '';
    } catch {
      // Geen biografie is niet erg.
    }
  }

  const credits = d.combined_credits || {};
  const merged = {};
  const order = [];

  const addCredit = (c, role, kind) => {
    if (!c || !c.id) return;
    const mediaType = c.media_type === 'tv' ? 'tv' : 'movie';
    const key = mediaType + ':' + c.id;
    if (!merged[key]) {
      const date = c.release_date || c.first_air_date || '';
      merged[key] = {
        tmdb_id: c.id,
        media_type: mediaType,
        title: c.title || c.name || '',
        release_year: /^\d{4}/.test(date) ? parseInt(date.slice(0, 4), 10) : null,
        poster_path: c.poster_path || '',
        roles: [],
        as_cast: false,
        popularity: c.popularity || 0,
      };
      order.push(key);
    }
    if (kind === 'cast') merged[key].as_cast = true;
    const label = kind === 'crew' ? KEY_CREW_LABELS[role] || role : role;
    if (label && !merged[key].roles.includes(label)) merged[key].roles.push(label);
  };

  (credits.cast || []).forEach((c) => addCredit(c, c.character || '', 'cast'));
  (credits.crew || []).forEach((c) => addCredit(c, c.job || '', 'crew'));

  const all = order.map((k) => merged[k]);

  // Gastoptredens als zichzelf (talkshows, documentaires) zijn zelden wat je
  // zoekt en overspoelen de lijst; die zetten we apart.
  const isSelfAppearance = (entry) =>
    entry.as_cast && entry.roles.length > 0 && entry.roles.every((r) => /^self\b/i.test(r) || r === 'Zichzelf');

  const main = all.filter((e) => !isSelfAppearance(e));
  const appearances = all.filter(isSelfAppearance);

  const byYearDesc = (a, b) => (b.release_year || 0) - (a.release_year || 0);
  main.sort(byYearDesc);
  appearances.sort(byYearDesc);

  return {
    id: d.id,
    name: d.name || '',
    biography,
    profile_path: d.profile_path || '',
    birthday: d.birthday || '',
    deathday: d.deathday || '',
    place_of_birth: d.place_of_birth || '',
    known_for_department: d.known_for_department || '',
    credits: main,
    appearances,
  };
}

// Beschikbare posters voor een titel, zodat je zelf de afbeelding kan kiezen
// die bij jouw editie past. include_image_language haalt ook posters zonder
// taalmarkering op (vaak de mooiste, tekstloze varianten).
async function tmdbPosters(id, mediaType, apiKey) {
  const d = await tmdbGet(
    `${mediaType}/${id}/images`,
    { include_image_language: 'nl,en,null' },
    apiKey
  );
  return (d.posters || [])
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, 24)
    .map((p) => ({ file_path: p.file_path, language: p.iso_639_1 || '', width: p.width, height: p.height }));
}

// Velden die van TMDb komen en dus veilig overschreven mogen worden bij een
// verversing. Persoonlijke velden (formaat, notities, bekeken, hoesfoto's,
// verlanglijst, toevoegdatum, eigen posterkeuze) staan hier bewust NIET bij.
const TMDB_MANAGED_FIELDS = [
  'title', 'original_title', 'original_language', 'release_year', 'release_date',
  'poster_path', 'backdrop_path', 'genres', 'director', 'writers', 'composer',
  'cast', 'cast_details', 'crew_details', 'runtime', 'rating', 'vote_count', 'overview', 'tagline',
  'certification', 'certification_country', 'trailer_key', 'imdb_id',
  'saga_id', 'tv_status', 'number_of_seasons',
];

/**
 * Werkt een bestaande collectie-entry bij met verse TMDb-gegevens, zonder
 * persoonlijke keuzes te verliezen. Seizoensbezit blijft behouden; de reeksnaam
 * wordt enkel overschreven als TMDb er een kent (zodat een zelfgekozen naam
 * zoals "Kerstfilms" blijft staan).
 */
function applyTmdbFields(item, fresh) {
  if (fresh.seasons && item.seasons) {
    fresh = {
      ...fresh,
      seasons: fresh.seasons.map((s) => {
        const old = item.seasons.find((o) => o.season_number === s.season_number);
        return old ? { ...s, owned: old.owned, format: old.format } : { ...s, owned: false, format: '' };
      }),
    };
  }

  TMDB_MANAGED_FIELDS.forEach((field) => {
    if (fresh[field] !== undefined) item[field] = fresh[field];
  });
  if (fresh.saga) item.saga = fresh.saga;
  if (fresh.seasons) item.seasons = fresh.seasons;
  return item;
}

/**
 * Ververst je hele collectie in één keer met de nieuwste TMDb-gegevens.
 * Bedoeld om bestaande titels de velden te geven die er bij het toevoegen nog
 * niet waren (backdrop, keuring, cast met foto's, trailer, reeks-ID, ...).
 *
 * Slaat tussentijds op (elke SAVE_EVERY titels), zodat een onderbroken
 * verversing niet voor niets is geweest. Titels zonder TMDb-koppeling of met
 * een fout worden overgeslagen en teruggemeld — ze blijven ongewijzigd.
 *
 * onProgress(huidige, totaal, titel), shouldStop() → true om te stoppen.
 */
async function tmdbRefreshAllTitles(apiKey, onProgress, shouldStop) {
  const SAVE_EVERY = 25;
  const PAUSE_MS = 250; // nette throttle richting TMDb

  const { movies } = await driveLoadMovies();
  const failed = [];
  let updated = 0;
  let sinceSave = 0;
  let stopped = false;

  const save = () => withWriteLock(() => driveSaveNamedFile('movies.json', movies));

  for (let i = 0; i < movies.length; i++) {
    if (shouldStop && shouldStop()) {
      stopped = true;
      break;
    }
    const m = movies[i];
    if (onProgress) onProgress(i + 1, movies.length, m.title);

    if (!m.tmdb_id) {
      failed.push(`${m.title} (geen TMDb-koppeling)`);
      continue;
    }

    try {
      const fresh = await tmdbDetails(m.tmdb_id, m.content_type === 'tv' ? 'tv' : 'movie', apiKey);
      applyTmdbFields(m, fresh);
      updated++;
      sinceSave++;
    } catch (err) {
      failed.push(`${m.title} (${err.message})`);
    }

    if (sinceSave >= SAVE_EVERY) {
      await save();
      sinceSave = 0;
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  if (sinceSave > 0) await save();
  return { updated, failed, total: movies.length, stopped };
}
