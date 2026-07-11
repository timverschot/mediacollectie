/**
 * Beheer-tool — zoekt op TMDb en schrijft rechtstreeks naar je GitHub-repo
 * via de Contents API (fetch met CORS, geen backend nodig). De config
 * (tokens/keys) wordt enkel lokaal in je browser bewaard (localStorage),
 * nooit verstuurd naar iets anders dan TMDb en GitHub zelf.
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

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
  return new TextDecoder().decode(bytes);
}

function slugify(title, year) {
  let s = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
  };
}

// ---------- GitHub Contents API ----------

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
}

async function ghGetFile(cfg, path) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`;
  const resp = await fetch(url, { headers: ghHeaders(cfg.token) });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub-fout bij ophalen ${path}: ${resp.status}`);
  const data = await resp.json();
  return { content: base64ToUtf8(data.content), sha: data.sha };
}

async function ghGetFileRaw(cfg, path) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`;
  const resp = await fetch(url, { headers: ghHeaders(cfg.token) });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub-fout bij ophalen ${path}: ${resp.status}`);
  return resp.json(); // bevat sha, gebruikt voor binaire bestanden (afbeeldingen)
}

async function ghPutFile(cfg, path, base64Content, message, existingSha) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  const body = {
    message,
    content: base64Content,
    branch: cfg.branch,
  };
  if (existingSha) body.sha = existingSha;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`GitHub-fout bij wegschrijven ${path}: ${resp.status} ${err.message || ''}`);
  }
  return resp.json();
}

async function testConnection(cfg) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  const resp = await fetch(url, { headers: ghHeaders(cfg.token) });
  if (!resp.ok) throw new Error(`Verbinding mislukt (${resp.status}). Controleer token/repo-naam.`);
  return resp.json();
}

// ---------- Movies.json upsert ----------

async function upsertMovie(cfg, entry) {
  const file = await ghGetFile(cfg, 'data/movies.json');
  const movies = file ? JSON.parse(file.content) : [];
  const idx = movies.findIndex((m) => m.id === entry.id);
  const status = idx >= 0 ? 'bijgewerkt' : 'toegevoegd';
  if (idx >= 0) movies[idx] = entry;
  else movies.push(entry);

  const newContent = utf8ToBase64(JSON.stringify(movies, null, 2));
  await ghPutFile(
    cfg,
    'data/movies.json',
    newContent,
    `${status === 'toegevoegd' ? 'Voeg toe' : 'Werk bij'}: ${entry.title} (via beheer.html)`,
    file?.sha
  );
  return status;
}

async function upsertMoviesBatch(cfg, entries) {
  const file = await ghGetFile(cfg, 'data/movies.json');
  const movies = file ? JSON.parse(file.content) : [];
  entries.forEach((entry) => {
    const idx = movies.findIndex((m) => m.id === entry.id);
    if (idx >= 0) movies[idx] = entry;
    else movies.push(entry);
  });
  const newContent = utf8ToBase64(JSON.stringify(movies, null, 2));
  await ghPutFile(cfg, 'data/movies.json', newContent, `Bulk-toevoeging van ${entries.length} titels (via beheer.html)`, file?.sha);
}

async function uploadCover(cfg, slug, side, base64Jpeg) {
  const path = `images/${slug}/${side}.jpg`;
  const existing = await ghGetFileRaw(cfg, path);
  await ghPutFile(cfg, path, base64Jpeg, `Hoesfoto (${side}) voor ${slug}`, existing?.sha);
  return path;
}
