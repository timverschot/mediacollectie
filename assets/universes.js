/**
 * Universums — overkoepelende franchises (fase 11)
 * ------------------------------------------------
 * TMDb kent per film maar één collectie: Iron Man hoort bij "Iron Man
 * Collection", en daar houdt het op. Een franchise als het Marvel Cinematic
 * Universe loopt over tientallen films én series heen en bestaat bij TMDb
 * enkel als trefwoord.
 *
 * Een universum in deze app is dus: een naam plus een TMDb-trefwoord. De
 * ledenlijst wordt live opgehaald en niet opgeslagen, zodat nieuwe releases
 * vanzelf in je compleetheidsteller verschijnen.
 *
 * Dit bestand bevat de logica die zowel de universumpagina als de
 * detailweergave op de collectiepagina gebruikt.
 *
 * Verwacht assets/drive.js en assets/admin.js.
 */

// Ledenlijsten worden per bezoek onthouden: het MCU ophalen kost enkele
// aanroepen, en dat hoeft niet bij elke klik opnieuw.
const _universeMemberCache = {};

function universeCacheKey(u) {
  return `${u.keyword_id}:${u.include_tv ? 'tv' : 'nofilm'}`;
}

/**
 * Alle titels die bij een universum horen, films en (indien gewenst) series,
 * gesorteerd op releasedatum. Geeft { items, truncated } terug.
 */
async function loadUniverseMembers(universe, apiKey) {
  const key = universeCacheKey(universe);
  if (_universeMemberCache[key]) return _universeMemberCache[key];

  const movies = await tmdbDiscoverByKeyword(universe.keyword_id, 'movie', apiKey);
  let items = movies.items;
  let truncated = movies.truncated;

  if (universe.include_tv) {
    const tv = await tmdbDiscoverByKeyword(universe.keyword_id, 'tv', apiKey);
    items = items.concat(tv.items);
    truncated = truncated || tv.truncated;
  }

  // Op releasedatum, oudste eerst. Titels zonder datum achteraan.
  items.sort((a, b) => {
    const ad = a.release_date || '9999';
    const bd = b.release_date || '9999';
    return ad.localeCompare(bd);
  });

  const result = { items, truncated };
  _universeMemberCache[key] = result;
  return result;
}

// Dezelfde normalisatie als elders: lidwoorden vooraan negeren, accenten weg.
function universeNormalizeTitle(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(the|a|an|de|het|een|le|la|les|l')\s+/i, '')
    .toLowerCase()
    .trim();
}

/**
 * Bouwt een zoekindex over je collectie en geeft een functie terug die een
 * TMDb-titel koppelt aan jouw exemplaar.
 *
 * Eerst op TMDb-id. Lukt dat niet — TMDb heeft voor sommige films meerdere
 * records — dan op genormaliseerde titel met hooguit één jaar verschil.
 */
function buildOwnedMatcher(collection) {
  const byTmdb = {};
  const byTitle = {};
  (collection || []).forEach((m) => {
    if (m.tmdb_id) byTmdb[String(m.tmdb_id)] = m;
    const key = universeNormalizeTitle(m.title);
    (byTitle[key] = byTitle[key] || []).push(m);
  });

  return function findMine(part) {
    const direct = byTmdb[String(part.tmdb_id)];
    if (direct) return direct;
    const candidates = byTitle[universeNormalizeTitle(part.title)] || [];
    if (!candidates.length) return null;
    return (
      candidates.find(
        (m) =>
          !part.release_year ||
          !m.release_year ||
          Math.abs(m.release_year - part.release_year) <= 1
      ) || null
    );
  };
}

/**
 * Koppelt de ledenlijst aan je collectie en telt.
 * Geeft rijen terug met status: 'owned' | 'wishlist' | 'missing'.
 */
function universeStatus(members, collection) {
  const findMine = buildOwnedMatcher(collection);

  const rows = members.map((part) => {
    const mine = findMine(part);
    let status = 'missing';
    if (mine) status = mine.wishlist ? 'wishlist' : 'owned';
    return { ...part, mine, status };
  });

  const owned = rows.filter((r) => r.status === 'owned').length;
  const wishlist = rows.filter((r) => r.status === 'wishlist').length;

  return {
    rows,
    owned,
    wishlist,
    missing: rows.length - owned - wishlist,
    total: rows.length,
    movies: rows.filter((r) => r.media_type === 'movie').length,
    series: rows.filter((r) => r.media_type === 'tv').length,
  };
}

/**
 * Bij welke universums hoort deze titel? Vereist dat de ledenlijsten al
 * geladen zijn (via loadUniverseMembers).
 */
function universesForTitle(item, universes, membersByUniverseId) {
  const out = [];
  (universes || []).forEach((u) => {
    const members = membersByUniverseId[u.id];
    if (!members) return;
    const findMine = buildOwnedMatcher([item]);
    const hit = members.items.some((part) => findMine(part) === item);
    if (hit) out.push(u);
  });
  return out;
}

// Maakt een leeg universum aan op basis van een gekozen trefwoord.
function makeUniverse(name, keyword, includeTv) {
  return {
    id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: (name || keyword.name || '').trim(),
    keyword_id: keyword.id,
    keyword_name: keyword.name,
    include_tv: includeTv !== false,
    created: new Date().toISOString().slice(0, 10),
  };
}
