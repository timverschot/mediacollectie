/**
 * Beheer-tool — zoekt op TMDb. De config (TMDb-key) wordt enkel lokaal in je
 * browser bewaard (localStorage), nooit verstuurd naar iets anders dan TMDb.
 * Het wegschrijven naar je collectie gebeurt via assets/drive.js (Google Drive).
 *
 * Fase 2b: tmdbDetails geeft nu ook de officiële TMDb-reeks mee
 * (belongs_to_collection, bv. "Harry Potter Collection") als `saga`.
 */

const LS_KEY = 'mediacollectie_admin_config';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w200';

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

async function tmdbDetails(id, mediaType, apiKey) {
  const url = `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${encodeURIComponent(apiKey)}&language=nl-NL&append_to_response=credits`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('TMDb-fout: ' + resp.status);
  const d = await resp.json();

  const crew = d.credits?.crew || [];
  let directors = crew.filter((c) => c.job === 'Director').map((c) => c.name);
  if (!directors.length && d.created_by) directors = d.created_by.map((c) => c.name);
  const cast = (d.credits?.cast || []).slice(0, 5).map((c) => c.name);

  const title = d.title || d.name;
  const date = d.release_date || d.first_air_date || '';
  const year = /^\d{4}/.test(date) ? parseInt(date.slice(0, 4), 10) : null;
  let runtime = d.runtime;
  if (!runtime && d.episode_run_time?.length) runtime = d.episode_run_time[0];

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

  return {
    tmdb_id: id,
    title,
    release_year: year,
    poster_path: d.poster_path || '',
    genres: (d.genres || []).map((g) => g.name),
    director: directors.join(', '),
    cast,
    runtime: runtime || null,
    rating: d.vote_average || null,
    overview: d.overview || '',
    // Officiële TMDb-reeks (enkel films), bv. "Harry Potter Collection".
    // Handmatig aan te passen via het bewerken-paneel.
    saga: (d.belongs_to_collection && d.belongs_to_collection.name) || '',
    ...(seasons ? { seasons } : {}),
  };
}
