/**
 * Collection Dashboard — gedeelde motor
 * -------------------------------------
 * Generiek opgezet zodat een tweede verzameling (bv. strips.html) hem kan
 * hergebruiken via een eigen `config` (loadData of dataUrl).
 *
 * Fase 2b-uitbreidingen:
 * - Optimistic UI: wijzigingen zijn meteen zichtbaar, opslaan gebeurt op de
 *   achtergrond (indicator rechtsboven), met automatisch terugdraaien bij fouten
 * - Hoesfoto's als losse Drive-bestanden (movies.json blijft klein en snel)
 * - Grid toont altijd de TMDb-poster; hoesfoto's in de detailmodal, met
 *   tabs (Poster / Hoesfoto's) en zoom-lightbox
 * - A–Z-letterfilter
 * - Reeksen: sorteeroptie 'Op reeks' + 'Groepeer reeksen'-weergave met
 *   reekskaarten en een reeksoverzicht-modaal
 */

const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';
const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';
const THUMB_BASE = 'https://image.tmdb.org/t/p/w92';
const PAGE_SIZE = 60;

// Weergavekeuze onthouden tussen bezoeken.
const VIEW_STORAGE_KEY = 'mediacollectie_view';
const VALID_VIEWS = ['grid', 'shelf', 'compact', 'text'];

function loadStoredView() {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (VALID_VIEWS.includes(v)) return v;
  } catch {
    // localStorage geblokkeerd: gewoon met het raster starten.
  }
  return 'grid';
}

// In de tekst- en compacte weergave laden we bewust meer titels per keer:
// er zijn geen afbeeldingen, dus scrollen blijft licht.
function pageSizeForView(view) {
  // De plank toont álles (cover-flow bladert horizontaal), de tekst- en
  // compacte lijst laden meer per keer.
  if (view === 'shelf') return 9999;
  return view === 'text' ? 400 : view === 'compact' ? 150 : PAGE_SIZE;
}

/**
 * Controleert of de andere bestanden bij deze versie van app.js horen.
 * Bij een halve upload (bv. wel app.js, niet drive.js) krijg je anders een
 * cryptische melding als "X is not defined" die niets zegt over de oorzaak.
 */
function checkAssetVersions() {
  const missing = [];
  if (typeof MEDIA_FORMATS === 'undefined' || typeof normalizeMovieEntry === 'undefined') {
    missing.push('assets/drive.js');
  }
  if (
    typeof tmdbPerson === 'undefined' ||
    typeof applyTmdbFields === 'undefined' ||
    typeof tmdbSeason === 'undefined' ||
    typeof tmdbSearchKeyword === 'undefined'
  ) {
    missing.push('assets/admin.js');
  }
  if (typeof loadUniverseMembers === 'undefined') {
    missing.push('assets/universes.js');
  }
  if (typeof addTitleOpenForTmdb === 'undefined' || typeof addTitleBulkSubmit === 'undefined') {
    missing.push('assets/add-title.js');
  }
  if (typeof parseTitleList === 'undefined' || typeof initBulkImportUI === 'undefined') {
    missing.push('assets/bulk-import.js');
  }
  return missing;
}

function initCollectionApp(config) {
  const outdated = checkAssetVersions();
  if (outdated.length) {
    const grid = document.getElementById('grid');
    if (grid) {
      grid.innerHTML =
        '<div class="col-span-full text-center py-16 px-6">' +
        '<p class="text-[#C9A227] font-mono text-sm mb-3">Bestanden komen niet overeen</p>' +
        '<p class="text-[#F2F0EA] mb-2">Deze versie van <code>assets/app.js</code> heeft een nieuwere ' +
        outdated.map((f) => '<code>' + f + '</code>').join(' en ') +
        ' nodig.</p>' +
        '<p class="text-[#8B8A92] text-sm">Upload ' +
        (outdated.length === 1 ? 'dat bestand' : 'die bestanden') +
        ' opnieuw en herlaad met Ctrl+Shift+R.</p>' +
        '</div>';
    }
    console.error('Verouderde bestanden:', outdated.join(', '));
    return;
  }

  const state = {
    all: [],
    filtered: [],
    // Prijs-index: sleutel (zie priceKeyForLocal) -> laatste niet-gearchiveerde
    // meting uit price_history.json. Wordt na de collectie geladen; blijft leeg
    // als er nog geen prijsdata is of Drive niet beschikbaar is.
    priceIndex: {},
    visibleCount: PAGE_SIZE,
    search: '',
    activeFormats: new Set(),
    activeTypes: new Set(),
    activeGenres: new Set(),
    activeStatus: new Set(),   // 'owned' / 'wishlist'
    activeWatched: new Set(),  // 'watched' / 'unwatched'
    activeDecades: new Set(),  // 1970, 1980, … (beginjaar van het decennium)
    activeCerts: new Set(),    // leeftijdskeuring, bv. 'AL', '12', '16'
    activeBoxsets: new Set(),  // namen van boxsets
    activeLocations: new Set(), // waar de schijf fysiek ligt
    activeUniverses: new Set(), // universum-id's (bv. MCU)
    activeLetter: null,        // 'A'..'Z' of '#'
    groupSagas: false,
    sort: 'date_added_desc',
    // 'grid' = posterraster, 'compact' = rij met miniatuur, 'text' = pure
    // tekstlijst (snelst om door te scrollen, verbruikt geen data)
    view: loadStoredView(),
  };

  const els = {
    grid: document.getElementById('grid'),
    empty: document.getElementById('empty-state'),
    count: document.getElementById('result-count'),
    search: document.getElementById('filter-search'),
    sort: document.getElementById('sort-select'),
    formatChips: document.getElementById('format-chips'),
    typeChips: document.getElementById('type-chips'),
    genreChips: document.getElementById('genre-chips'),
    decadeChips: document.getElementById('decade-chips'),
    certChips: document.getElementById('cert-chips'),
    certRow: document.getElementById('cert-row'),
    boxsetChips: document.getElementById('boxset-chips'),
    boxsetRow: document.getElementById('boxset-row'),
    locationChips: document.getElementById('location-chips'),
    locationRow: document.getElementById('location-row'),
    universeChips: document.getElementById('universe-chips'),
    universeRow: document.getElementById('universe-row'),
    ambient: document.getElementById('ambient-glow'),
    shelfStage: document.getElementById('shelf-stage'),
    shelfTrack: document.getElementById('shelf-track'),
    shelfMeta: document.getElementById('shelf-meta'),
    statusChips: document.getElementById('status-chips'),
    watchedChips: document.getElementById('watched-chips'),
    letterChips: document.getElementById('letter-chips'),
    groupToggle: document.getElementById('group-sagas-toggle'),
    viewChips: document.getElementById('view-chips'),
    filterToggle: document.getElementById('filter-toggle'),
    filterPanel: document.getElementById('filter-panel'),
    clearFilters: document.getElementById('clear-filters'),
    personModal: document.getElementById('person-modal'),
    episodeModal: document.getElementById('episode-modal'),
    pickModal: document.getElementById('pick-modal'),
    dupesModal: document.getElementById('dupes-modal'),
    saveIndicator: document.getElementById('save-indicator'),
    loadMore: document.getElementById('load-more'),
    modal: document.getElementById('detail-modal'),
    modalClose: document.getElementById('modal-close'),
    groupModal: document.getElementById('group-modal'),
    lightbox: document.getElementById('lightbox'),
  };

  // ---------- Hulpfuncties ----------

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // Sorteertitel: lidwoorden vooraan negeren ("The Matrix" → "matrix"),
  // accenten weglaten. Gebruikt voor alfabetisch sorteren én het letterfilter.
  // Zelfde normalisatie als sortTitle, maar op een losse tekst — nodig om
  // titels uit TMDb te vergelijken met titels uit je collectie.
  function normalizeTitleText(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^(the|a|an|de|het|een|le|la|les|l')\s+/i, '')
      .toLowerCase()
      .trim();
  }

  function sortTitle(item) {
    return String(item.title || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^(the|a|an|de|het|een|le|la|les|l')\s+/i, '')
      .toLowerCase();
  }

  function firstLetter(item) {
    const c = sortTitle(item).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }

  function sagaOf(item) {
    return (item.saga || '').trim();
  }

  // Decennium waarin een titel uitkwam: 1994 → 1990. Null als er geen jaar is.
  function decadeOf(item) {
    const y = Number(item.release_year);
    if (!y || y < 1000) return null;
    return Math.floor(y / 10) * 10;
  }

  function decadeLabel(decade) {
    // 1990 → "jaren '90", 2000 → "jaren '00"
    return "jaren '" + String(decade).slice(2);
  }

  // Heb je zelf een alternatieve TMDb-poster gekozen (bv. de artwork van jouw
  // editie), dan krijgt die voorrang op de standaardposter.
  function posterUrl(item) {
    const path = item.custom_poster_path || item.poster_path;
    return path ? POSTER_BASE + path : '';
  }

  function backdropUrl(item) {
    return item.backdrop_path ? BACKDROP_BASE + item.backdrop_path : '';
  }

  // Hoesfoto's horen bij een exemplaar, niet bij de film: van dezelfde titel
  // kan je een DVD- én een 4K-doosje hebben. Zonder exemplaar valt het terug
  // op de oude velden op filmniveau.
  function frontCoverRef(item, edition) {
    const src = edition || item;
    if (src.custom_front_cover_id) return { fileId: src.custom_front_cover_id };
    if (src.custom_front_cover) return { dataUrl: src.custom_front_cover };
    return null;
  }
  function backCoverRef(item, edition) {
    const src = edition || item;
    if (src.custom_back_cover_id) return { fileId: src.custom_back_cover_id };
    if (src.custom_back_cover) return { dataUrl: src.custom_back_cover };
    return null;
  }

  // Zet een cover-referentie om naar een bruikbare img-src (async bij Drive-bestanden).
  async function resolveCoverSrc(ref) {
    if (!ref) return '';
    if (ref.dataUrl) return ref.dataUrl;
    if (ref.fileId && typeof driveCoverBlobUrl === 'function') {
      try {
        return await driveCoverBlobUrl(ref.fileId);
      } catch {
        return '';
      }
    }
    return '';
  }

  // ---------- Opslag-indicator + achtergrond-opslag (optimistic UI) ----------

  let indicatorTimer = null;
  function setIndicator(mode) {
    if (!els.saveIndicator) return;
    clearTimeout(indicatorTimer);
    if (mode === 'saving') {
      els.saveIndicator.textContent = '● opslaan…';
      els.saveIndicator.className = 'font-mono text-xs text-gold';
    } else if (mode === 'saved') {
      els.saveIndicator.textContent = '✓ opgeslagen';
      els.saveIndicator.className = 'font-mono text-xs text-teal';
      indicatorTimer = setTimeout(() => { els.saveIndicator.textContent = ''; }, 2500);
    } else if (mode === 'error') {
      els.saveIndicator.textContent = '✗ niet opgeslagen';
      els.saveIndicator.className = 'font-mono text-xs text-red-400';
    } else {
      els.saveIndicator.textContent = '';
    }
  }

  // Achtergrond-opslag in volgorde (één tegelijk). De interface is dan al
  // bijgewerkt; bij een fout wordt de wijziging teruggedraaid.
  let saveChain = Promise.resolve();
  function backgroundSave(taskFn, revertFn) {
    setIndicator('saving');
    saveChain = saveChain.then(async () => {
      try {
        await taskFn();
        setIndicator('saved');
      } catch (err) {
        console.error('Achtergrond-opslag mislukt:', err);
        if (revertFn) revertFn();
        buildFacetChips(state.all);
        applyFilters();
        setIndicator('error');
        alert('Opslaan mislukt: ' + err.message + '\nJe wijziging is teruggedraaid.');
      }
    });
    return saveChain;
  }

  // ---------- Data laden ----------

  function reload() {
    const p =
      typeof config.loadData === 'function'
        ? config.loadData()
        : fetch(config.dataUrl).then((r) => {
            if (!r.ok) throw new Error('Kon ' + config.dataUrl + ' niet laden');
            return r.json();
          });
    return p.then((data) => {
      state.all = data;
      buildFacetChips(data);
      applyFilters();

      // Universums op de achtergrond laden zodat het universumfilter kan
      // verschijnen. Heb je er geen, dan gebeurt er niets. De ledenlijsten
      // komen live van TMDb, dus dit mag de collectie niet ophouden.
      if (typeof loadUniverseData === 'function') {
        loadUniverseData().catch((e) => console.warn('Universums niet geladen:', e));
      }

      // Prijsdata op de achtergrond laden (optioneel). Zodra ze binnen is,
      // bouwen we de prijs-index en verversen we de weergave, zodat de
      // richtwaarde bij elke titel verschijnt en 'Sorteer op waarde' klopt.
      // Faalt dit (geen Drive-sessie, of nog geen prijzen ververst), dan blijft
      // de collectie gewoon werken — enkel zonder prijzen.
      loadPriceIndex();
    });
  }
  window.__collectionReload = reload;

  reload().catch((err) => {
    els.grid.innerHTML =
      '<p class="col-span-full text-center text-[#8B8A92] py-16">Kon de collectie niet laden: ' +
      escapeHtml(err.message) +
      '</p>';
    console.error(err);
  });

  // ---------- Filterchips ----------

  function buildGenreChips(data) {
    const genres = new Set();
    data.forEach((item) => (item.genres || []).forEach((g) => genres.add(g)));
    els.genreChips.innerHTML = '';
    [...genres]
      .sort((a, b) => a.localeCompare(b))
      .forEach((genre) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip' + (state.activeGenres.has(genre) ? ' chip-active' : '');
        chip.textContent = genre;
        chip.dataset.genre = genre;
        chip.addEventListener('click', () => {
          toggleSetValue(state.activeGenres, genre);
          chip.classList.toggle('chip-active');
          applyFilters();
        });
        els.genreChips.appendChild(chip);
      });
  }

  // Decennia komen uit de collectie zelf: je ziet dus enkel decennia die je
  // ook echt bezit, van oud naar nieuw. Titels zonder jaar krijgen een
  // aparte chip 'onbekend'.
  function buildDecadeChips(data) {
    if (!els.decadeChips) return;
    const decades = new Set();
    let hasUnknown = false;
    data.forEach((item) => {
      const d = decadeOf(item);
      if (d === null) hasUnknown = true;
      else decades.add(d);
    });

    const values = [...decades].sort((a, b) => a - b);
    if (hasUnknown) values.push('unknown');

    els.decadeChips.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeDecades.has(value) ? ' chip-active' : '');
      chip.textContent = value === 'unknown' ? 'onbekend' : decadeLabel(value);
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeDecades, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.decadeChips.appendChild(chip);
    });

    // Decennia die intussen uit de collectie verdwenen zijn, niet blijven filteren.
    [...state.activeDecades].forEach((v) => {
      if (!values.includes(v)) state.activeDecades.delete(v);
    });
  }

  // Leeftijdskeuring (Kijkwijzer/MPAA). De rij blijft verborgen zolang geen
  // enkele titel een keuring heeft — bv. vóór je één keer hebt ververst.
  function buildCertChips(data) {
    if (!els.certChips) return;
    const counts = {};
    data.forEach((item) => {
      const c = (item.certification || '').trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    });

    // Numerieke keuringen (6, 12, 16) netjes op leeftijd; de rest alfabetisch erna.
    const values = Object.keys(counts).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });

    if (els.certRow) els.certRow.classList.toggle('hidden', values.length === 0);
    if (els.certRow && values.length) els.certRow.classList.add('flex');

    els.certChips.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeCerts.has(value) ? ' chip-active' : '');
      chip.textContent = value;
      chip.title = `${counts[value]} titel(s)`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeCerts, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.certChips.appendChild(chip);
    });

    [...state.activeCerts].forEach((v) => {
      if (!values.includes(v)) state.activeCerts.delete(v);
    });
  }

  // Formaatchips komen uit de collectie zelf: je ziet enkel formaten die je
  // ook echt hebt, van hoogste naar laagste kwaliteit.
  function buildFormatChips(data) {
    if (!els.formatChips) return;
    const counts = {};
    data.forEach((item) => {
      allFormats(item).forEach((f) => {
        counts[f] = (counts[f] || 0) + 1;
      });
    });
    const values = MEDIA_FORMATS.map((f) => f.value).filter((v) => counts[v]);

    els.formatChips.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeFormats.has(value) ? ' chip-active' : '');
      chip.textContent = formatLabel(value);
      chip.title = `${counts[value]} titel(s)`;
      chip.dataset.format = value;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeFormats, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.formatChips.appendChild(chip);
    });

    [...state.activeFormats].forEach((v) => {
      if (!values.includes(v)) state.activeFormats.delete(v);
    });
  }

  // Chiprij op basis van een veld binnen de exemplaren (boxset, locatie).
  // Verschijnt pas zodra je dat veld ergens gebruikt.
  function buildEditionFieldChips(data, field, activeSet, chipsEl, rowEl) {
    if (!chipsEl) return;
    const counts = {};
    data.forEach((item) => {
      const values = new Set(
        (item.editions || []).map((e) => (e[field] || '').trim()).filter(Boolean)
      );
      values.forEach((v) => {
        counts[v] = (counts[v] || 0) + 1;
      });
    });
    const values = Object.keys(counts).sort((a, b) => a.localeCompare(b));

    if (rowEl) {
      rowEl.classList.toggle('hidden', values.length === 0);
      if (values.length) rowEl.classList.add('flex');
    }

    chipsEl.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (activeSet.has(value) ? ' chip-active' : '');
      chip.textContent = value;
      chip.title = `${counts[value]} titel(s)`;
      chip.addEventListener('click', () => {
        toggleSetValue(activeSet, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      chipsEl.appendChild(chip);
    });

    [...activeSet].forEach((v) => {
      if (!values.includes(v)) activeSet.delete(v);
    });
  }

  function buildBoxsetChips(data) {
    buildEditionFieldChips(data, 'boxset', state.activeBoxsets, els.boxsetChips, els.boxsetRow);
  }

  function buildLocationChips(data) {
    buildEditionFieldChips(data, 'location', state.activeLocations, els.locationChips, els.locationRow);
  }

  // Universumchips: op basis van de geladen ledenlijsten. Tonen enkel universums
  // waarvan je ook echt een titel bezit of op je verlanglijst hebt.
  function buildUniverseChips() {
    if (!els.universeChips || !universeData) return;

    const counts = {};
    Object.values(universeByMovieId).forEach((set) => {
      set.forEach((uid) => {
        counts[uid] = (counts[uid] || 0) + 1;
      });
    });

    const universes = universeData.universes.filter((u) => counts[u.id]);
    if (els.universeRow) {
      els.universeRow.classList.toggle('hidden', universes.length === 0);
      if (universes.length) els.universeRow.classList.add('flex');
    }

    els.universeChips.innerHTML = '';
    universes.forEach((u) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeUniverses.has(u.id) ? ' chip-active' : '');
      chip.textContent = u.name;
      chip.title = `${counts[u.id]} titel(s) uit dit universum`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeUniverses, u.id);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.universeChips.appendChild(chip);
    });

    [...state.activeUniverses].forEach((uid) => {
      if (!universes.some((u) => u.id === uid)) state.activeUniverses.delete(uid);
    });
  }

  // Alle chips die uit de data zelf worden afgeleid, in één keer opnieuw opbouwen.
  function buildFacetChips(data) {
    buildFormatChips(data);
    buildGenreChips(data);
    buildDecadeChips(data);
    buildCertChips(data);
    buildBoxsetChips(data);
    buildLocationChips(data);
    // Universumchips hangen af van live TMDb-data die apart geladen wordt.
    // Is die er al, dan de index verversen (een bewerkte of nieuwe titel kan
    // intussen bij een universum horen); anders vult loadUniverseData de index
    // vanzelf zodra de data binnen is.
    if (universeData) buildUniverseIndex();
    else buildUniverseChips();
  }

  function buildLetterChips() {
    if (!els.letterChips) return;
    const letters = ['#'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
    els.letterChips.innerHTML = '';
    letters.forEach((letter) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'letter-chip';
      chip.textContent = letter;
      chip.addEventListener('click', () => {
        state.activeLetter = state.activeLetter === letter ? null : letter;
        els.letterChips.querySelectorAll('.letter-chip').forEach((c) => {
          c.classList.toggle('letter-chip-active', c.textContent === state.activeLetter);
        });
        applyFilters();
      });
      els.letterChips.appendChild(chip);
    });
  }
  buildLetterChips();

  function toggleSetValue(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  // ---------- Filteren & sorteren ----------

  // Vingerafdruk van alles wat de sélectie bepaalt. Verandert die niet, dan is
  // er alleen data gewijzigd en blijft je positie in de lijst behouden.
  let lastFilterSignature = null;

  function filterSignature() {
    const s = (set) => [...set].sort().join(',');
    return [
      state.search.trim().toLowerCase(),
      s(state.activeFormats),
      s(state.activeTypes),
      s(state.activeGenres),
      s(state.activeStatus),
      s(state.activeWatched),
      s(state.activeDecades),
      s(state.activeCerts),
      s(state.activeBoxsets),
      s(state.activeLocations),
      s(state.activeUniverses),
      state.activeLetter || '',
      state.sort,
      state.view,
      state.groupSagas ? 'g' : '',
    ].join('|');
  }

  function applyFilters() {
    const q = state.search.trim().toLowerCase();
    let list = state.all.filter((item) => {
      if (q) {
        const inTitle = item.title.toLowerCase().includes(q);
        const inOriginal = (item.original_title || '').toLowerCase().includes(q);
        const inCast = (item.cast || []).some((name) => name.toLowerCase().includes(q));
        const inDirector = (item.director || '').toLowerCase().includes(q);
        const inWriters = (item.writers || '').toLowerCase().includes(q);
        const inSaga = sagaOf(item).toLowerCase().includes(q);
        if (!inTitle && !inOriginal && !inCast && !inDirector && !inWriters && !inSaga) return false;
      }
      if (state.activeFormats.size && !allFormats(item).some((f) => state.activeFormats.has(f))) return false;
      if (state.activeBoxsets.size) {
        const boxes = (item.editions || []).map((e) => (e.boxset || '').trim()).filter(Boolean);
        if (!boxes.some((b) => state.activeBoxsets.has(b))) return false;
      }
      if (state.activeLocations.size) {
        const locs = (item.editions || []).map((e) => (e.location || '').trim()).filter(Boolean);
        if (!locs.some((l) => state.activeLocations.has(l))) return false;
      }
      if (state.activeUniverses.size) {
        const belongs = universeByMovieId[item.id];
        if (!belongs || ![...state.activeUniverses].some((u) => belongs.has(u))) return false;
      }
      if (state.activeTypes.size && !state.activeTypes.has(item.content_type)) return false;
      if (state.activeGenres.size) {
        const hasGenre = (item.genres || []).some((g) => state.activeGenres.has(g));
        if (!hasGenre) return false;
      }
      if (state.activeStatus.size) {
        const status = item.wishlist ? 'wishlist' : 'owned';
        if (!state.activeStatus.has(status)) return false;
      } else if (item.wishlist) {
        // Standaard toont de collectie enkel wat je bezit; de verlanglijst is een
        // opt-in via het statusfilter, niet iets dat je moet wegfilteren.
        return false;
      }
      if (state.activeWatched.size) {
        const w = item.watched ? 'watched' : 'unwatched';
        if (!state.activeWatched.has(w)) return false;
      }
      if (state.activeDecades.size) {
        const d = decadeOf(item);
        if (!state.activeDecades.has(d === null ? 'unknown' : d)) return false;
      }
      if (state.activeCerts.size && !state.activeCerts.has((item.certification || '').trim())) return false;
      if (state.activeLetter && firstLetter(item) !== state.activeLetter) return false;
      return true;
    });

    list = sortList(list, state.sort);
    state.filtered = list;

    // Terug naar de eerste pagina hoort alleen te gebeuren als je de selectie
    // wijzigt — een filter, de zoekterm, de sortering of de weergave. Bewerk je
    // een titel die je pas na 'Toon meer' zag, dan moet je blijven waar je was.
    // Daarom vergelijken we een 'vingerafdruk' van de selectie in plaats van
    // op elke plek in de code te moeten onthouden wat er wel of niet mag.
    const signature = filterSignature();
    if (signature !== lastFilterSignature) {
      state.visibleCount = pageSizeForView(state.view);
      lastFilterSignature = signature;
    }

    updateFilterButton();
    render();
  }

  function sortList(list, mode) {
    const copy = [...list];
    switch (mode) {
      case 'title_asc':
        return copy.sort((a, b) => sortTitle(a).localeCompare(sortTitle(b)));
      case 'saga_asc':
        return copy.sort((a, b) => {
          const ka = sagaOf(a) ? sagaOf(a).toLowerCase() : sortTitle(a);
          const kb = sagaOf(b) ? sagaOf(b).toLowerCase() : sortTitle(b);
          if (ka !== kb) return ka.localeCompare(kb);
          // Zelfde reeks: op releasejaar
          return (a.release_year || 0) - (b.release_year || 0);
        });
      case 'my_rating_desc':
        // Zonder eigen score achteraan, anders zou een lege waarde bovenaan komen.
        return copy.sort((a, b) => (b.my_rating || -1) - (a.my_rating || -1));
      case 'watched_desc': {
        const last = (m) => {
          const log = m.watch_log || [];
          return log.length ? log[log.length - 1].date : '';
        };
        return copy.sort((a, b) => String(last(b)).localeCompare(String(last(a))));
      }
      case 'year_desc':
        return copy.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
      case 'year_asc':
        return copy.sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
      case 'value_desc':
        // Hoogste richtwaarde eerst; titels zonder prijsdata achteraan.
        return copy.sort((a, b) => (titleValue(b) ?? -1) - (titleValue(a) ?? -1));
      case 'value_asc':
        // Laagste richtwaarde eerst, maar titels zónder prijsdata achteraan
        // (anders zouden die als '0' bovenaan komen).
        return copy.sort((a, b) => {
          const va = titleValue(a);
          const vb = titleValue(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          return va - vb;
        });
      case 'date_added_desc':
      default:
        return copy.sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
    }
  }

  // ---------- Weergave ----------

  // Bouwt de weergave-eenheden: losse titels, of (bij 'Groepeer reeksen')
  // één reekskaart per reeks + losse kaarten voor titels zonder reeks.
  function buildRenderUnits() {
    if (!state.groupSagas) {
      return state.filtered.map((item) => ({ type: 'item', item }));
    }
    const units = [];
    const groupIndex = {};
    state.filtered.forEach((item) => {
      const saga = sagaOf(item);
      if (!saga) {
        units.push({ type: 'item', item });
        return;
      }
      if (groupIndex[saga] === undefined) {
        groupIndex[saga] = units.length;
        units.push({ type: 'group', saga, items: [item] });
      } else {
        units[groupIndex[saga]].items.push(item);
      }
    });
    // Groepen met maar één (zichtbaar) deel tonen we als gewone kaart.
    return units.map((u) => (u.type === 'group' && u.items.length === 1 ? { type: 'item', item: u.items[0] } : u));
  }

  // De container krijgt per weergave andere opmaak: een raster voor posters,
  // een verticale lijst voor de andere twee.
  // Meer kolommen naarmate het scherm breder wordt — op een breedbeeldscherm
  // stond er anders een smalle strook posters met veel lege ruimte ernaast.
  // De tekst- en compacte lijst krijgen kolommen in plaats van één lange rij,
  // want een titel van 30 tekens over 1800 pixels uitsmeren leest slecht.
  const VIEW_CONTAINER_CLASSES = {
    grid: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-5 gap-y-8',
    compact: 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-x-8',
    text: 'grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-x-8',
  };

  function applyViewClasses() {
    els.grid.className = VIEW_CONTAINER_CLASSES[state.view] || VIEW_CONTAINER_CLASSES.grid;
    if (els.viewChips) {
      els.viewChips.querySelectorAll('[data-view]').forEach((chip) => {
        chip.classList.toggle('chip-active', chip.dataset.view === state.view);
      });
    }
  }

  // Kaarten getrapt laten verschijnen na het bouwen van het raster.
  function runReveal() {
    const cards = els.grid.querySelectorAll('.reveal');
    cards.forEach((c, i) => {
      // Cap de vertraging zodat een grote lijst niet traag oogt.
      c.style.transitionDelay = Math.min(i, 24) * 28 + 'ms';
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')));
    });
  }

  // Sfeerlicht koppelen aan de kaarten van de huidige weergave: bij hover toont
  // de achtergrond de vervaagde poster van die titel. Voor een reeks (groep)
  // pakken we de poster van het eerste deel.
  function wireAmbient(container) {
    container.querySelectorAll('[data-accent-id]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const openId = el.dataset.openId;
        const groupKey = el.dataset.openGroup;
        let item = null;
        if (openId) item = state.all.find((m) => m.id === openId);
        else if (groupKey) item = state.all.find((m) => sagaOf(m) === groupKey) || null;
        setAmbient(item, false, groupKey || el.dataset.accentId);
      });
    });
    container.addEventListener('mouseleave', clearAmbient);
  }

  function render() {
    // Plankweergave heeft een eigen opbouw.
    if (state.view === 'shelf') {
      renderShelf();
      return;
    }
    els.grid.classList.remove('hidden');
    if (els.shelfStage) els.shelfStage.classList.add('hidden');

    const units = buildRenderUnits();
    // Kom je terug uit de plank, zorg dan dat de ankertitel meegeladen wordt
    // (ook als die voorbij de eerste pagina ligt), zodat we ernaartoe kunnen.
    if (gridAnchor) {
      const idx = units.findIndex((u) =>
        gridAnchor.group
          ? u.type === 'group' && u.saga === gridAnchor.group
          : u.type !== 'group' && u.item.id === gridAnchor.id
      );
      if (idx >= 0) state.visibleCount = Math.max(state.visibleCount, idx + 1);
    }
    const visible = units.slice(0, state.visibleCount);
    const wishCount = state.filtered.filter((i) => i.wishlist).length;

    els.count.textContent =
      state.filtered.length + ' titel' + (state.filtered.length === 1 ? '' : 's') +
      (wishCount ? ` · ${wishCount} verlanglijst` : '');
    els.empty.classList.toggle('hidden', state.filtered.length !== 0);
    els.loadMore.classList.toggle('hidden', state.visibleCount >= units.length);

    applyViewClasses();

    const renderUnit =
      state.view === 'grid'
        ? (u) => (u.type === 'group' ? groupCardTemplate(u) : cardTemplate(u.item))
        : state.view === 'compact'
        ? (u) => (u.type === 'group' ? groupRowTemplate(u, true) : rowTemplate(u.item, true))
        : (u) => (u.type === 'group' ? groupRowTemplate(u, false) : rowTemplate(u.item, false));

    els.grid.innerHTML = visible.map(renderUnit).join('');

    els.grid.querySelectorAll('[data-open-id]').forEach((card) => {
      card.addEventListener('click', () => openModal(card.dataset.openId));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(card.dataset.openId);
        }
      });
    });

    els.grid.querySelectorAll('[data-open-group]').forEach((card) => {
      card.addEventListener('click', () => openGroupModal(card.dataset.openGroup));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openGroupModal(card.dataset.openGroup);
        }
      });
    });

    els.grid.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteTitle(btn.dataset.deleteId, btn.dataset.deleteTitle);
      });
    });

    runReveal();
    wireAmbient(els.grid);

    // Scroll naar de titel waar de plank stond en wis het anker. Uitgesteld tot
    // de volgende frame: het raster was tot zojuist verborgen, en meteen scrollen
    // (vóór de layout klaar is) doet in veel browsers niets.
    if (gridAnchor) {
      const key = gridAnchor;
      gridAnchor = null;
      requestAnimationFrame(() => {
        const el = [...els.grid.querySelectorAll('[data-open-id],[data-open-group]')].find((c) =>
          key.group ? c.dataset.openGroup === key.group : c.dataset.openId === key.id
        );
        if (!el) return;
        const bar = document.querySelector('.sticky');
        const barH = bar ? bar.getBoundingClientRect().height : 0;
        const y = window.scrollY + el.getBoundingClientRect().top - barH - 24;
        window.scrollTo({ top: Math.max(0, y) });
      });
    }
  }

  // ---------- Plankweergave / cover-flow (fase 20) ----------

  let shelfActive = 0;
  let shelfAnchor = null; // titel/reeks waarop de plank moet openen na wissel vanuit het raster
  let gridAnchor = null; // titel/reeks waarop het raster moet uitkomen na wissel vanuit de plank
  const SHELF_PAD = 20; // 10px links + rechts

  // Onthoudt welke kaart bovenaan in beeld staat, zodat de plank dáár opent
  // in plaats van waar hij de vorige keer bleef staan.
  function captureShelfAnchor() {
    if (!els.grid) return;
    // Onder de vaste zoekbalk beginnen, zodat we ankeren op wat je écht ziet.
    const bar = document.querySelector('.sticky');
    const cutoff = bar ? bar.getBoundingClientRect().bottom : 0;
    const cards = els.grid.querySelectorAll('[data-open-id],[data-open-group]');
    let best = null, bestTop = Infinity;
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      // De hoogst zichtbare kaart die onder de balk uitkomt.
      if (r.bottom > cutoff + 8 && r.top < bestTop) { bestTop = r.top; best = c; }
    });
    if (!best && cards.length) best = cards[0];
    shelfAnchor = best ? { id: best.dataset.openId || null, group: best.dataset.openGroup || null } : null;
  }

  // Leest de actuele slidebreedte uit de CSS-variabele, zodat de centrering
  // klopt op zowel breedbeeld als gsm.
  function shelfItemWidth() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--shelf-item');
    const n = parseInt(v, 10);
    return isNaN(n) ? 220 : n;
  }

  function renderShelf() {
    if (!els.shelfStage || !els.shelfTrack) return;
    // Eerst de chip-status bijwerken; daarna het raster verbergen, want
    // applyViewClasses() overschrijft de klasse van het raster.
    applyViewClasses();
    els.grid.classList.add('hidden');
    els.loadMore.classList.add('hidden');
    els.shelfStage.classList.remove('hidden');
    // Bij binnenkomst vanuit een andere weergave naar boven, zodat de (grote)
    // plank meteen volledig in beeld staat.
    if (shelfAnchor) window.scrollTo({ top: 0 });

    const units = buildRenderUnits();
    const wishCount = state.filtered.filter((i) => i.wishlist).length;
    els.count.textContent =
      state.filtered.length + ' titel' + (state.filtered.length === 1 ? '' : 's') +
      (wishCount ? ` · ${wishCount} verlanglijst` : '');
    els.empty.classList.toggle('hidden', state.filtered.length !== 0);

    shelfUnits = units;
    // Kom je vanuit het raster, open de plank dan op de titel die je daar zag.
    if (shelfAnchor) {
      const idx = units.findIndex((u) =>
        shelfAnchor.group
          ? u.type === 'group' && u.saga === shelfAnchor.group
          : u.type !== 'group' && u.item.id === shelfAnchor.id
      );
      if (idx >= 0) shelfActive = idx;
      shelfAnchor = null;
    }
    if (shelfActive >= units.length) shelfActive = 0;

    els.shelfTrack.innerHTML = units
      .map((u, i) => {
        const item = u.type === 'group' ? u.items[0] : u.item;
        const cover = posterUrl(item);
        const title = u.type === 'group' ? u.saga : item.title;
        return `
          <div class="shelf-slide" data-shelf-i="${i}">
            <div class="poster-wrap relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] ring-1 ring-white/10 shadow-2xl">
              ${
                cover
                  ? `<img data-src="${escapeAttr(cover)}" alt="${escapeAttr(title)}" class="shelf-img w-full h-full object-cover">`
                  : posterFallbackHtml(title)
              }
              ${u.type === 'group' ? `<span class="saga-count">${u.items.length} delen</span>` : ribbonsHtml(item)}
            </div>
          </div>`;
      })
      .join('');

    els.shelfTrack.querySelectorAll('[data-shelf-i]').forEach((s) => {
      s.addEventListener('click', () => {
        const i = Number(s.dataset.shelfI);
        if (i === shelfActive) {
          const u = shelfUnits[i];
          if (u.type === 'group') openGroupModal(u.saga);
          else openModal(u.item.id);
        } else {
          shelfActive = i;
          updateShelf();
        }
      });
    });

    updateShelf();
  }

  let shelfUnits = [];

  // Zoveel slides links en rechts van de actieve houden we "levend" (poster
  // geladen, 3D-transform aan). Alles daarbuiten lossen we, zodat het geheugen
  // begrensd blijft — anders houdt een grote collectie honderden grote posters
  // tegelijk in beeld en crasht de browser op een gsm.
  const SHELF_WINDOW = 5;

  function updateShelf() {
    if (!els.shelfTrack || !shelfUnits.length) return;
    const slides = els.shelfTrack.querySelectorAll('.shelf-slide');
    slides.forEach((s, i) => {
      const d = i - shelfActive;
      const img = s.querySelector('.shelf-img');
      if (Math.abs(d) > SHELF_WINDOW) {
        // Ver weg (en toch onzichtbaar buiten de plank): poster lossen en de
        // 3D-laag opheffen om geheugen vrij te geven.
        if (img && img.getAttribute('src')) img.removeAttribute('src');
        s.style.transform = 'none';
        s.style.opacity = '0';
        return;
      }
      // Binnen bereik: poster laden (indien nog niet) en positioneren.
      if (img && !img.getAttribute('src') && img.dataset.src) img.setAttribute('src', img.dataset.src);
      const scale = d === 0 ? 1 : 0.72;
      const opacity = d === 0 ? 1 : 0.5;
      const ry = Math.max(-1, Math.min(1, -d)) * 22;
      s.style.transform = `perspective(1000px) rotateY(${ry}deg) scale(${scale})`;
      s.style.opacity = opacity;
    });
    const stageW = els.shelfStage.clientWidth || 800;
    // De werkelijke slidebreedte uit de DOM meten (inclusief padding) i.p.v.
    // te schatten — anders stapelt een klein verschil op tot zichtbare drift.
    const stride = slides.length ? slides[0].offsetWidth : shelfItemWidth();
    els.shelfTrack.style.transform = `translateX(${stageW / 2 - (shelfActive * stride + stride / 2)}px)`;

    const u = shelfUnits[shelfActive];
    if (u) {
      const item = u.type === 'group' ? u.items[0] : u.item;
      const title = u.type === 'group' ? u.saga : item.title;
      const sub =
        u.type === 'group'
          ? `${u.items.length} delen`
          : `${item.release_year || ''}${item.rating ? ' · ★ ' + item.rating.toFixed(1) : ''} · ${ownedFormats(item)
              .map(formatLabel)
              .join(', ')}`;
      els.shelfMeta.innerHTML = `<p class="font-display text-3xl tracking-wide text-ink">${escapeHtml(
        title
      )}</p><p class="font-mono text-xs text-muted mt-1">${escapeHtml(sub)}</p>`;
      // De achtergrond baadt in de vervaagde poster van de gecentreerde titel
      // (voor een reeks: de poster van het eerste deel).
      setAmbient(item, true, u.type === 'group' ? u.saga : item.id);
    }
  }

  function shelfStep(delta) {
    if (state.view !== 'shelf' || !shelfUnits.length) return;
    shelfActive = Math.max(0, Math.min(shelfUnits.length - 1, shelfActive + delta));
    updateShelf();
  }

  // ---------- Acties (optimistic) ----------

  function handleDeleteTitle(id, title) {
    if (!confirm(`Weet je zeker dat je "${title}" volledig wilt verwijderen uit je collectie? Dit kan niet ongedaan gemaakt worden.`)) {
      return;
    }
    const removed = state.all.find((m) => m.id === id);
    const idx = state.all.indexOf(removed);
    state.all = state.all.filter((m) => m.id !== id);
    buildFacetChips(state.all);
    applyFilters();
    if (!els.modal.classList.contains('hidden')) closeModal();

    backgroundSave(
      () => deleteMovieInDrive(id),
      () => { if (removed) state.all.splice(Math.min(idx, state.all.length), 0, removed); }
    );
  }

  function handleRemoveSeason(item, seasonNumber) {
    if (!confirm(`Seizoen ${seasonNumber} niet langer als 'in bezit' markeren?`)) return;
    const season = item.seasons.find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const prev = { owned: season.owned, format: season.format };
    season.owned = false;
    season.format = '';
    applyFilters();
    openModal(item.id);
    backgroundSave(
      () => upsertMovieInDrive(item),
      () => { season.owned = prev.owned; season.format = prev.format; openModal(item.id); }
    );
  }

  function handleAddSeason(item, seasonNumber, format) {
    const season = item.seasons.find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const prev = { owned: season.owned, format: season.format };
    season.owned = true;
    season.format = format;
    applyFilters();
    openModal(item.id);
    backgroundSave(
      () => upsertMovieInDrive(item),
      () => { season.owned = prev.owned; season.format = prev.format; openModal(item.id); }
    );
  }

  // ---------- Kaarten ----------

  // Alle formaten die je van deze titel bezit, van hoog naar laag. Bij series
  // tellen ook de formaten van de seizoenen mee.
  function ownedFormats(item) {
    const set = new Set();
    (item.editions || []).forEach((e) => {
      if (!e.wishlist) set.add(e.format);
    });
    (item.seasons || []).forEach((s) => {
      if (s.owned && s.format) set.add(s.format);
    });
    return [...set].sort((a, b) => formatRank(b) - formatRank(a));
  }

  // Alle formaten, inclusief die op je verlanglijst staan. Voor het filteren.
  function allFormats(item) {
    const set = new Set((item.editions || []).map((e) => e.format));
    (item.seasons || []).forEach((s) => {
      if (s.owned && s.format) set.add(s.format);
    });
    return [...set];
  }

  // ---------- Prijzen op de collectiepagina (fase 23) ----------
  //
  // De richtwaarde en de range komen uit price_history.json — dezelfde bron als
  // de prijzen- en verzekeringspagina. We tonen ze hier alleen (lezen), we
  // verversen niets: verversen gebeurt op de prijzenpagina via de Worker.

  // Benaderende wisselkoersen naar euro, voor titels waarvan enkel een niet-
  // euromarkt (meestal het VK) een prijs opleverde. Eén vaste koers houdt het
  // licht en stabiel; werk hem hier bij als je hem wil actualiseren.
  const FX_TO_EUR = { EUR: 1, GBP: 1.17, USD: 0.92 };

  // Sleutel per gevolgd exemplaar. LET OP: moet exact gelijk blijven aan
  // priceKeyFor() in assets/price-app.js, anders vinden we de metingen niet.
  function priceKeyForLocal(movieId, format, opts) {
    const o = opts || {};
    let key = `${movieId}|${format}`;
    if (o.season) key += `|s${o.season}`;
    const variants = o.variants || [];
    if (variants.length) key += '|' + variants.join('+');
    return key;
  }

  // Bouwt state.priceIndex: sleutel -> laatste niet-gearchiveerde meting.
  // Achtergrondtaak; na afloop verversen we de weergave.
  function loadPriceIndex() {
    if (typeof driveLoadPrices !== 'function') return;
    driveLoadPrices()
      .then(({ prices }) => {
        const idx = {};
        (prices || []).forEach((p) => {
          if (!p || p.archived || !p.id) return;
          const hist = p.history || [];
          if (!hist.length) return;
          const last = hist[hist.length - 1];
          idx[p.id] = {
            value: last.ebay_median != null ? last.ebay_median : last.ebay_avg,
            q1: last.ebay_q1,
            q3: last.ebay_q3,
            low: last.ebay_low,
            high: last.ebay_high,
            currency: last.ebay_currency || 'EUR',
            date: last.date || '',
          };
        });
        state.priceIndex = idx;
        // Opnieuw filteren/renderen zodat de bedragen verschijnen en een
        // eventuele sortering-op-waarde meteen klopt.
        applyFilters();
      })
      .catch((e) => console.warn('Prijsgegevens niet geladen:', e));
  }

  // Zoekt de meting voor een sleutel, met dezelfde terugval als de
  // verzekeringsexport: eerst de volledige sleutel (met uitvoeringen), dan
  // titel|formaat, dan het kale titel-id (oude data).
  function pricePointFor(...keys) {
    for (const k of keys) {
      if (k && state.priceIndex[k]) return state.priceIndex[k];
    }
    return null;
  }

  // Richtwaarde + range voor één filmexemplaar (editie).
  function editionPriceInfo(item, edition) {
    const variants = editionVariantKeys(edition);
    const p = pricePointFor(
      priceKeyForLocal(item.id, edition.format, { variants }),
      `${item.id}|${edition.format}`,
      item.id
    );
    return normalizePriceInfo(p, edition.format);
  }

  // Richtwaarde + range voor één seizoen van een serie.
  function seasonPriceInfo(item, season) {
    const fmt = season.format || item.format;
    // Uitvoeringen van het eerste bezeten exemplaar, net als in de export.
    const ed = (item.editions || []).filter((e) => !e.wishlist)[0] || (item.editions || [])[0] || {};
    const variants = editionVariantKeys(ed);
    const p = pricePointFor(
      priceKeyForLocal(item.id, fmt, { season: season.season_number, variants }),
      `${item.id}|${fmt}|s${season.season_number}`,
      `${item.id}|${fmt}`,
      item.id
    );
    return normalizePriceInfo(p, fmt);
  }

  function normalizePriceInfo(p, format) {
    if (!p || p.value == null) return null;
    const cur = p.currency || 'EUR';
    // Titels waarvan enkel een niet-euromarkt (meestal het VK) een prijs gaf,
    // rekenen we om naar euro met een vaste benaderende koers. Zo staat alles
    // in dezelfde munt: het totaal, de sortering en de weergave kloppen dan.
    const rate = FX_TO_EUR[cur] != null ? FX_TO_EUR[cur] : 1;
    const conv = (v) => (v == null ? null : Math.round(v * rate * 100) / 100);
    const lowRaw = p.q1 != null ? p.q1 : p.low != null ? p.low : p.value;
    const highRaw = p.q3 != null ? p.q3 : p.high != null ? p.high : p.value;
    return {
      format,
      value: conv(p.value),
      low: conv(lowRaw),
      high: conv(highRaw),
      currency: 'EUR',
      convertedFrom: cur !== 'EUR' ? cur : null,
      date: p.date || '',
    };
  }

  // Alle bezeten exemplaren van een titel met hun richtwaarde/range. Series met
  // seizoensgegevens: één regel per bezeten seizoen; anders één per (niet-
  // verlanglijst-)editie.
  function ownedPriceInfos(item) {
    const ownedSeasons = (item.seasons || []).filter((s) => s.owned);
    if (ownedSeasons.length) {
      return ownedSeasons.map((s) => {
        const info = seasonPriceInfo(item, s);
        return { label: `Seizoen ${s.season_number}`, format: s.format || item.format, info };
      });
    }
    return (item.editions || [])
      .filter((e) => !e.wishlist)
      .map((e) => ({ label: formatLabel(e.format), format: e.format, info: editionPriceInfo(item, e) }));
  }

  // Somwaarde van een titel (voor de sortering). Titels zonder enige meting
  // krijgen null, zodat ze achteraan belanden.
  function titleValue(item) {
    const infos = ownedPriceInfos(item).map((x) => x.info).filter(Boolean);
    if (!infos.length) return null;
    return infos.reduce((sum, i) => sum + (i.value || 0), 0);
  }

  // Muntsymbool zoals op de prijzenpagina; ponden/euro's worden nooit gemengd.
  function priceSymbol(cur) {
    return cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : (cur || '') + ' ';
  }

  // Kort bedrag: hele euro's zonder decimalen (€6), anders met komma (€13,95).
  function priceMoney(value, cur) {
    if (value == null) return '';
    const sym = priceSymbol(cur);
    const n = Math.round(value * 100) / 100;
    const txt = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
    return sym + txt;
  }

  // Eén compacte prijsregel: richtwaarde + range. compact=true laat het label
  // (formaat) weg wanneer de context dat al toont.
  function priceRangeText(info) {
    if (!info) return '';
    const mid = priceMoney(info.value, info.currency);
    const showRange = info.low != null && info.high != null && info.low !== info.high;
    return showRange
      ? `${mid} · ${priceMoney(info.low, info.currency)}–${priceMoney(info.high, info.currency)}`
      : mid;
  }

  // Waarde-pill voor op de poster: één afgerond totaalbedrag (alle bezeten
  // exemplaren samen, in euro). Leeg als er (nog) geen prijsdata is. De
  // opsplitsing per formaat + range staat in de detailmodal.
  function cardValueBadgeHtml(item) {
    const total = titleValue(item);
    if (total == null) return '';
    const txt = '€' + Math.round(total).toLocaleString('nl-BE');
    return `<span class="value-badge" title="Totale richtwaarde van deze titel (eBay-mediaan, omgerekend naar euro)">${escapeHtml(
      txt
    )}</span>`;
  }

  // Kleine hint voor in de detailmodal wanneer een bedrag uit een niet-
  // euromunt is omgerekend (meestal het VK).
  function convertedHint(info) {
    if (!info || !info.convertedFrom) return '';
    const sym = info.convertedFrom === 'GBP' ? '£' : info.convertedFrom === 'USD' ? '$' : info.convertedFrom;
    return ` <span class="text-muted">· omgerekend uit ${escapeHtml(sym)}</span>`;
  }

  // Opgetelde richtwaarde van alle delen in een gegroepeerde reeks (in euro).
  // Null als geen enkel deel prijsdata heeft.
  function groupValue(unit) {
    const vals = unit.items.map(titleValue).filter((v) => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0);
  }

  // Waarde-pill voor een reeks-kaart (som van alle delen).
  function groupValueBadgeHtml(unit) {
    const total = groupValue(unit);
    if (total == null) return '';
    const txt = '€' + Math.round(total).toLocaleString('nl-BE');
    return `<span class="value-badge" title="Totale richtwaarde van deze reeks (eBay-mediaan, omgerekend naar euro)">${escapeHtml(
      txt
    )}</span>`;
  }

  // Totaalbedrag van een reeks voor de tekst-/compacte rij.
  function rowGroupValueHtml(unit) {
    const total = groupValue(unit);
    if (total == null) return '';
    const txt = '€' + Math.round(total).toLocaleString('nl-BE');
    return `<span class="font-mono text-[11px] text-teal/90 w-16 text-right shrink-0" title="Totale richtwaarde van deze reeks">${escapeHtml(
      txt
    )}</span>`;
  }

  // Compacte totaalwaarde voor de tekst-/compacte rij (één bedrag; de
  // opsplitsing per formaat staat op de kaart en in de detailmodal).
  function rowValueHtml(item) {
    const v = titleValue(item);
    if (v == null) return '';
    const infos = ownedPriceInfos(item).map((x) => x.info).filter(Boolean);
    const cur = infos.length ? infos[0].currency : 'EUR';
    return `<span class="font-mono text-[11px] text-teal/90 w-16 text-right shrink-0" title="Totale richtwaarde van dit exemplaar">${escapeHtml(
      priceMoney(v, cur)
    )}</span>`;
  }

  function ribbonInfo(item) {
    const formats = ownedFormats(item);
    if (formats.length > 1) return { label: 'Gemengd', cls: '', formats };
    const f = formats[0] || (item.editions && item.editions[0] && item.editions[0].format) || item.format;
    const cls = f === '4k' ? 'ribbon-4k' : f === 'bluray' || f === 'bluray3d' ? 'ribbon-bluray' : 'ribbon-dvd';
    return { label: formatLabel(f), cls, formats: formats.length ? formats : [f] };
  }

  // Lintjes op de poster: één per formaat dat je bezit, onder elkaar.
  // Bij één formaat past de volledige naam ("Blu-ray"); zodra er gestapeld
  // wordt, is er alleen ruimte voor de korte code ("BD").
  function ribbonsHtml(item) {
    const formats = ownedFormats(item);
    const list = formats.length ? formats : allFormats(item);
    const shown = list.slice(0, 3);
    const useShort = shown.length > 1;

    return shown
      .map(
        (f, i) =>
          `<span class="ribbon" style="background:${formatColor(f)};color:#14141A;top:${
            0.5 + i * 1.35
          }rem" title="${escapeAttr(formatLabel(f))}">${escapeHtml(
            useShort ? formatShort(f) : formatLabel(f)
          )}</span>`
      )
      .join('');
  }

  // ---------- Sfeerlicht (fase 20 + 21) ----------
  //
  // De achtergrond neemt de sfeer van de poster over: een sterk vervaagde,
  // uitvergrote kopie van de poster zelf. Zo zie je altijd de échte filmkleuren.
  // Anders dan pixels uitlezen heeft dit géén CORS-toestemming van TMDb nodig —
  // een afbeelding tónen mag altijd — dus het werkt voor elke poster.
  // Alleen als een titel helemaal geen poster heeft, valt het terug op een
  // zachte kleurgloed uit een vast palet.

  const ACCENTS = ['#C9A227', '#2FA4A9', '#C14B3A', '#2A6FB0', '#639922', '#7F77DD', '#C14B7E', '#B8935C', '#1F9E6E', '#4FB3C9'];
  const AMBIENT_BASE = 'https://image.tmdb.org/t/p/w342'; // klein, want het beeld wordt toch vervaagd

  function paletteAccent(key) {
    let h = 0;
    const s = String(key || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ACCENTS[h % ACCENTS.length];
  }

  // item = het titel-object (of null). strong = sterker voor de plank.
  // fallbackKey bepaalt de palet-kleur als er geen poster is (bv. reeksnaam).
  function setAmbient(item, strong, fallbackKey) {
    if (!els.ambient) return;
    const path = item && (item.custom_poster_path || item.poster_path);
    if (path) {
      els.ambient.style.backgroundImage = `url("${AMBIENT_BASE + path}")`;
      els.ambient.classList.add('has-poster');
      els.ambient.style.opacity = strong ? '0.6' : '0.42';
    } else {
      const c = paletteAccent(fallbackKey || (item && item.id));
      els.ambient.style.backgroundImage = `radial-gradient(55% 45% at 50% 22%, ${c}, transparent 70%)`;
      els.ambient.classList.remove('has-poster');
      els.ambient.style.opacity = strong ? '0.8' : '0.65';
    }
  }
  function clearAmbient() {
    if (els.ambient) els.ambient.style.opacity = '0';
  }

  // Score, formaten en bekeken-status voor de snelblik-overlay.
  function peekHtml(item) {
    const rating = item.rating ? '★ ' + item.rating.toFixed(1) : '';
    const fmts = (ownedFormats(item).length ? ownedFormats(item) : allFormats(item)).map(formatShort).join(' · ');
    const tag = item.watched
      ? '<span class="peek-tag">✓ bekeken</span>'
      : '<span class="peek-tag unseen">nog kijken</span>';
    return `
      <div class="peek">
        <div class="peek-top">
          <span class="peek-star">${rating}</span>
          <span class="peek-fmt">${escapeHtml(fmts)}</span>
        </div>
        ${tag}
      </div>`;
  }

  function seasonBadgeInfo(item) {
    if (!item.seasons || !item.seasons.length) return null;
    const ownedCount = item.seasons.filter((s) => s.owned).length;
    return {
      text: `${ownedCount}/${item.seasons.length}`,
      complete: ownedCount === item.seasons.length,
    };
  }

  function cardTemplate(item) {
    // Grid toont bewust altijd de TMDb-poster (snel, uniform); je eigen
    // hoesfoto's bekijk je in de detailmodal.
    const cover = posterUrl(item);
    const seasonBadge = seasonBadgeInfo(item);

    return `
      <div data-open-id="${escapeHtml(item.id)}" data-accent-id="${escapeAttr(item.id)}" class="case-card reveal group text-left cursor-pointer" role="button" tabindex="0">
        <div class="poster-wrap relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] shadow-lg ring-1 ring-white/5 group-hover:ring-[#C9A227]/40">
          ${cover ? '<div class="poster-skel"></div>' : ''}
          ${
            cover
              ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(item.title)}" loading="lazy"
                   class="w-full h-full object-cover relative z-[2]"
                   onload="this.previousElementSibling && this.previousElementSibling.remove()"
                   onerror="this.replaceWith(posterFallback('${escapeAttr(item.title)}'))">`
              : posterFallbackHtml(item.title)
          }
          ${ribbonsHtml(item)}
          ${cardValueBadgeHtml(item)}
          ${item.watched ? '<span class="watched-dot" title="Bekeken"></span>' : ''}
          ${
            seasonBadge
              ? `<span class="season-badge ${seasonBadge.complete ? '' : 'season-badge-partial'}" title="${seasonBadge.text} seizoenen in bezit">${seasonBadge.text}</span>`
              : ''
          }
          ${item.wishlist ? '<span class="wish-banner">Verlanglijst</span>' : ''}
          ${peekHtml(item)}
          <button type="button" class="delete-btn z-[4]" data-delete-id="${escapeAttr(item.id)}" data-delete-title="${escapeAttr(item.title)}" title="Verwijderen uit collectie" aria-label="Verwijderen uit collectie">&times;</button>
        </div>
        <p class="mt-2 font-display tracking-wide text-[15px] leading-tight text-[#F2F0EA] truncate">${escapeHtml(item.title)}</p>
        <p class="text-xs text-[#8B8A92] font-mono">${item.release_year || ''}</p>
      </div>
    `;
  }

  function groupCardTemplate(unit) {
    const sorted = [...unit.items].sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
    const first = sorted[0];
    const cover = posterUrl(first);
    const years = sorted.map((i) => i.release_year).filter(Boolean);
    const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';

    return `
      <div data-open-group="${escapeAttr(unit.saga)}" data-accent-id="${escapeAttr(unit.saga)}" class="case-card reveal group text-left cursor-pointer" role="button" tabindex="0">
        <div class="poster-wrap relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] shadow-lg ring-1 ring-white/5 group-hover:ring-[#C9A227]/40 saga-stack">
          ${
            cover
              ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(unit.saga)}" loading="lazy" class="w-full h-full object-cover">`
              : posterFallbackHtml(unit.saga)
          }
          ${groupValueBadgeHtml(unit)}
          <span class="saga-count">${unit.items.length} delen</span>
        </div>
        <p class="mt-2 font-display tracking-wide text-[15px] leading-tight text-[#F2F0EA] truncate">${escapeHtml(unit.saga)}</p>
        <p class="text-xs text-[#8B8A92] font-mono">${yearRange}</p>
      </div>
    `;
  }

  // ---------- Rijen (compacte en tekstweergave) ----------

  // Toont alle formaten die je van deze titel bezit, bv. "4K·BD".
  function formatTagHtml(item) {
    const formats = ownedFormats(item);
    const list = formats.length ? formats : allFormats(item);
    const text = list.map(formatShort).join('·') || '—';
    const color = list.length ? formatColor(list[0]) : '#8B8A92';
    return `<span class="font-mono text-[11px] w-16 text-right shrink-0" style="color:${color}">${escapeHtml(
      text
    )}</span>`;
  }

  // withThumb=true → compacte weergave met miniatuur; false → pure tekst.
  function rowTemplate(item, withThumb) {
    const seasonBadge = seasonBadgeInfo(item);
    const thumb = withThumb
      ? `<div class="w-8 h-12 shrink-0 rounded-sm overflow-hidden bg-[#1E1E26]">
           ${
             item.poster_path || item.custom_poster_path
               ? `<img src="${escapeAttr(
                   THUMB_BASE + (item.custom_poster_path || item.poster_path)
                 )}" alt="" loading="lazy" class="w-full h-full object-cover">`
               : ''
           }
         </div>`
      : '';

    return `
      <div data-open-id="${escapeHtml(item.id)}"
        class="case-card flex items-center gap-3 py-2 px-1 cursor-pointer hover:bg-white/5 rounded"
        role="button" tabindex="0">
        ${thumb}
        <span class="w-2 shrink-0">${
          item.watched ? '<span class="block w-1.5 h-1.5 rounded-full bg-teal" title="Bekeken"></span>' : ''
        }</span>
        <span class="flex-1 min-w-0 truncate text-sm text-ink">${escapeHtml(item.title)}</span>
        ${
          seasonBadge
            ? `<span class="font-mono text-[11px] ${
                seasonBadge.complete ? 'text-muted' : 'text-gold'
              } shrink-0">${seasonBadge.text}</span>`
            : ''
        }
        ${item.wishlist ? '<span class="font-mono text-[10px] text-gold shrink-0">wens</span>' : ''}
        ${rowValueHtml(item)}
        <span class="font-mono text-[11px] text-muted w-10 text-right shrink-0">${item.release_year || ''}</span>
        ${formatTagHtml(item)}
      </div>`;
  }

  function groupRowTemplate(unit, withThumb) {
    const sorted = [...unit.items].sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
    const first = sorted[0];
    const years = sorted.map((i) => i.release_year).filter(Boolean);
    const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';
    const thumb = withThumb
      ? `<div class="w-8 h-12 shrink-0 rounded-sm overflow-hidden bg-[#1E1E26]">
           ${
             first.poster_path
               ? `<img src="${escapeAttr(THUMB_BASE + first.poster_path)}" alt="" loading="lazy" class="w-full h-full object-cover">`
               : ''
           }
         </div>`
      : '';

    return `
      <div data-open-group="${escapeAttr(unit.saga)}"
        class="case-card flex items-center gap-3 py-2 px-1 cursor-pointer hover:bg-white/5 rounded"
        role="button" tabindex="0">
        ${thumb}
        <span class="w-2 shrink-0"></span>
        <span class="flex-1 min-w-0 truncate text-sm text-ink">${escapeHtml(unit.saga)}</span>
        <span class="font-mono text-[11px] text-gold shrink-0">${unit.items.length} delen</span>
        ${rowGroupValueHtml(unit)}
        <span class="font-mono text-[11px] text-muted w-20 text-right shrink-0">${escapeHtml(yearRange)}</span>
      </div>`;
  }

  function posterFallbackHtml(title) {
    return `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1E1E26] to-[#14141A] p-4">
      <span class="text-center text-[#8B8A92] text-sm font-mono">${escapeHtml(title)}</span>
    </div>`;
  }

  window.posterFallback = function (title) {
    const div = document.createElement('div');
    div.className = 'w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1E1E26] to-[#14141A] p-4';
    div.innerHTML = '<span class="text-center text-[#8B8A92] text-sm font-mono">' + escapeHtml(title) + '</span>';
    return div;
  };

  // ---------- Reeksmodaal ----------

  function openGroupModal(saga) {
    if (!els.groupModal) return;
    const items = state.filtered.filter((i) => sagaOf(i) === saga)
      .sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
    els.groupModal.querySelector('[data-group-title]').textContent = saga;
    const grid = els.groupModal.querySelector('[data-group-grid]');
    grid.innerHTML = items.map((item) => {
      const cover = posterUrl(item);
      const ribbon = ribbonInfo(item);
      return `
        <div data-group-open="${escapeAttr(item.id)}" class="cursor-pointer group" role="button" tabindex="0">
          <div class="relative rounded-md overflow-hidden aspect-[2/3] bg-[#14141A] ring-1 ring-white/5 group-hover:ring-[#C9A227]/40 transition">
            ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(item.title)}" loading="lazy" class="w-full h-full object-cover">` : posterFallbackHtml(item.title)}
            <span class="ribbon ${ribbon.cls}">${ribbon.label}</span>
            ${cardValueBadgeHtml(item)}
            ${item.wishlist ? '<span class="wish-banner">Verlanglijst</span>' : ''}
          </div>
          <p class="mt-1 text-xs truncate">${escapeHtml(item.title)}</p>
          <p class="text-[10px] text-[#8B8A92] font-mono">${item.release_year || ''}</p>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-group-open]').forEach((el) => {
      el.addEventListener('click', () => {
        closeGroupModal();
        openModal(el.dataset.groupOpen);
      });
    });

    els.groupModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeGroupModal() {
    if (!els.groupModal) return;
    els.groupModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  // Knoppen van de reeks-verlanglijstbalk: eenmalig koppelen (de balk zelf
  // wordt bij elke openModal opnieuw gevuld, maar de knoppen blijven bestaan).
  const sagaWishBtn = els.modal.querySelector('[data-saga-bulk-wish]');
  if (sagaWishBtn) sagaWishBtn.addEventListener('click', sagaBulkToWishlist);
  const sagaClearBtn = els.modal.querySelector('[data-saga-bulk-clear]');
  if (sagaClearBtn) {
    sagaClearBtn.addEventListener('click', () => {
      sagaBulkSelection = [];
      els.modal.querySelectorAll('[data-saga-pick]').forEach((cb) => (cb.checked = false));
      updateSagaBulkBar();
    });
  }

  if (els.groupModal) {
    els.groupModal.addEventListener('click', (e) => {
      if (e.target === els.groupModal) closeGroupModal();
    });
    const closeBtn = els.groupModal.querySelector('[data-group-close]');
    if (closeBtn) closeBtn.addEventListener('click', closeGroupModal);
  }

  // ---------- Lightbox (zoom) ----------

  function openLightbox(src, alt) {
    if (!els.lightbox || !src) return;
    const img = els.lightbox.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    img.classList.remove('zoomed');
    els.lightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    if (!els.lightbox) return;
    els.lightbox.classList.add('hidden');
  }

  if (els.lightbox) {
    const img = els.lightbox.querySelector('img');
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      img.classList.toggle('zoomed');
    });
    els.lightbox.addEventListener('click', closeLightbox);
  }

  // ---------- Detailmodal ----------

  // Huidige cover-weergave in de modal: 'poster' of 'hoes'
  let modalCoverMode = 'poster';
  let modalCoverSrcs = { poster: '', front: '', back: '' };

  function updateModalCoverTabs(item) {
    const tabs = els.modal.querySelector('[data-cover-tabs]');
    if (!tabs) return;
    const ed = activeEdition(item);
    const hasCustom = !!(frontCoverRef(item, ed) || backCoverRef(item, ed));
    tabs.classList.toggle('hidden', !hasCustom);
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('chip-active', b.dataset.coverTab === modalCoverMode);
    });
  }

  async function showModalCovers(item) {
    const flipCard = els.modal.querySelector('.flip-card');
    const flipBtn = els.modal.querySelector('[data-flip-btn]');
    const frontImg = els.modal.querySelector('[data-cover="front"]');
    const backImg = els.modal.querySelector('[data-cover="back"]');

    flipCard.classList.remove('flipped');
    modalCoverSrcs = { poster: posterUrl(item), front: '', back: '' };

    if (modalCoverMode === 'poster') {
      frontImg.src = modalCoverSrcs.poster;
      frontImg.alt = item.title + ' — TMDb-poster';
      flipBtn.classList.add('hidden');
    } else {
      // Hoesfoto's van het gekozen exemplaar: voorkant (of de poster als er
      // geen voorkant-foto is) + eventueel de achterkant.
      const ed = activeEdition(item);
      const frontRef = frontCoverRef(item, ed);
      const backRef = backCoverRef(item, ed);
      frontImg.src = modalCoverSrcs.poster; // tijdelijke placeholder terwijl blob laadt
      frontImg.alt = item.title + ' — voorkant hoes';
      if (frontRef) {
        resolveCoverSrc(frontRef).then((src) => {
          if (src) { frontImg.src = src; modalCoverSrcs.front = src; }
        });
      }
      if (backRef) {
        flipBtn.classList.remove('hidden');
        backImg.alt = item.title + ' — achterkant hoes';
        resolveCoverSrc(backRef).then((src) => {
          if (src) { backImg.src = src; modalCoverSrcs.back = src; }
        });
      } else {
        flipBtn.classList.add('hidden');
      }
    }
    updateModalCoverTabs(item);
  }

  // ---------- Fase 5: verrijkte velden in de detailmodal ----------

  // Toont of verbergt een element op basis van of er inhoud is.
  function setOptionalField(selector, value, formatter) {
    const el = els.modal.querySelector(selector);
    if (!el) return;
    const has = value !== null && value !== undefined && value !== '';
    el.classList.toggle('hidden', !has);
    if (has) el.textContent = formatter ? formatter(value) : value;
  }

  const TV_STATUS_LABELS = {
    'Ended': 'Afgelopen reeks',
    'Canceled': 'Stopgezet',
    'Returning Series': 'Loopt nog',
    'In Production': 'In productie',
    'Planned': 'Gepland',
  };

  function fillEnrichedFields(item) {
    // Achtergrondafbeelding bovenaan
    const wrap = els.modal.querySelector('[data-backdrop-wrap]');
    const img = els.modal.querySelector('[data-backdrop]');
    const bd = backdropUrl(item);
    const body = els.modal.querySelector('[data-detail-body]');
    if (wrap && img) {
      wrap.classList.toggle('hidden', !bd);
      if (bd) {
        img.src = bd;
        img.alt = item.title + ' — achtergrondafbeelding';
      } else {
        img.removeAttribute('src');
      }
    }
    // De poster mag enkel over de achtergrond schuiven als die er ook is.
    if (body) body.classList.toggle('with-backdrop', !!bd);

    // Originele titel enkel tonen als ze afwijkt van de Nederlandse.
    const original = item.original_title && item.original_title !== item.title ? item.original_title : '';
    setOptionalField('[data-field="original-title"]', original);
    setOptionalField('[data-field="tagline"]', item.tagline);
    setOptionalField('[data-field="cert"]', item.certification, (c) =>
      item.certification_country ? `${item.certification_country} ${c}` : c
    );
    setOptionalField('[data-field="tv-status"]', item.tv_status, (s) => TV_STATUS_LABELS[s] || s);

    const votes = els.modal.querySelector('[data-field="votes"]');
    if (votes) votes.textContent = item.vote_count ? ` (${Number(item.vote_count).toLocaleString('nl-BE')} stemmen)` : '';

    // Scenario en muziek verbergen we volledig als ze onbekend zijn — anders
    // staat de modal vol met streepjes.
    const writersWrap = els.modal.querySelector('[data-field="writers-wrap"]');
    if (writersWrap) {
      writersWrap.classList.toggle('hidden', !item.writers);
      const w = writersWrap.querySelector('[data-field="writers"]');
      if (w) w.textContent = item.writers || '';
    }
    const composerWrap = els.modal.querySelector('[data-field="composer-wrap"]');
    if (composerWrap) {
      composerWrap.classList.toggle('hidden', !item.composer);
      const c = composerWrap.querySelector('[data-field="composer"]');
      if (c) c.textContent = item.composer || '';
    }

    // Trailer en IMDb
    const trailer = els.modal.querySelector('[data-field="trailer-link"]');
    if (trailer) {
      trailer.classList.toggle('hidden', !item.trailer_key);
      if (item.trailer_key) trailer.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(item.trailer_key);
    }
    const imdb = els.modal.querySelector('[data-field="imdb-link"]');
    if (imdb) {
      imdb.classList.toggle('hidden', !item.imdb_id);
      if (item.imdb_id) imdb.href = 'https://www.imdb.com/title/' + encodeURIComponent(item.imdb_id) + '/';
    }

    // Cast: met portretfoto's als die er zijn, anders gewoon de namen.
    // Heeft een acteur een TMDb-id, dan is de kaart klikbaar naar zijn profiel.
    const castList = els.modal.querySelector('[data-field="cast-list"]');
    if (castList) {
      const details = item.cast_details || [];
      if (details.length) {
        castList.innerHTML = details
          .map((c) => {
            const clickable = !!c.id;
            return `
              <div class="w-20 shrink-0 text-center ${clickable ? 'cursor-pointer group/person' : ''}"
                ${clickable ? `data-person-id="${escapeAttr(c.id)}" role="button" tabindex="0"` : ''}
                ${clickable ? `title="Bekijk alles van ${escapeAttr(c.name)}"` : ''}>
                <div class="w-20 h-20 rounded-full overflow-hidden bg-bg ring-1 ring-white/10 mb-1 ${
                  clickable ? 'group-hover/person:ring-gold' : ''
                }">
                  ${
                    c.profile_path
                      ? `<img src="${escapeAttr(PROFILE_BASE + c.profile_path)}" alt="${escapeAttr(c.name)}" loading="lazy" class="w-full h-full object-cover">`
                      : `<div class="w-full h-full flex items-center justify-center text-[#8B8A92] font-mono text-lg">${escapeHtml((c.name || '?').charAt(0))}</div>`
                  }
                </div>
                <p class="text-[11px] leading-tight text-ink truncate" title="${escapeAttr(c.name)}">${escapeHtml(c.name)}</p>
                ${c.character ? `<p class="text-[10px] leading-tight text-muted truncate" title="${escapeAttr(c.character)}">${escapeHtml(c.character)}</p>` : ''}
                ${c.episode_count ? `<p class="text-[10px] leading-tight text-muted/70 font-mono">${c.episode_count} afl.</p>` : ''}
              </div>`;
          })
          .join('');

        castList.querySelectorAll('[data-person-id]').forEach((el) => {
          el.addEventListener('click', () => openPersonModal(el.dataset.personId));
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPersonModal(el.dataset.personId);
            }
          });
        });
      } else {
        castList.innerHTML = `<p class="text-sm text-muted">${escapeHtml((item.cast || []).join(', ') || '—')}</p>`;
      }
    }

    // Crew: klikbaar zodra de titel ververst is. Zolang dat niet gebeurd is,
    // tonen we de oude tekstvelden.
    const crewBlock = els.modal.querySelector('[data-field="crew-block"]');
    const crewFallback = els.modal.querySelector('[data-field="crew-fallback"]');
    const crewList = els.modal.querySelector('[data-field="crew-list"]');
    const crewDetails = item.crew_details || [];
    if (crewBlock && crewList && crewFallback) {
      crewBlock.classList.toggle('hidden', crewDetails.length === 0);
      crewFallback.classList.toggle('hidden', crewDetails.length > 0);
      if (crewDetails.length) {
        crewList.innerHTML = crewDetails
          .map((c) => {
            const clickable = !!c.id;
            return `
              <span class="text-sm">
                <span class="text-muted font-mono uppercase text-[10px]">${escapeHtml(c.jobs.join(' · '))}</span><br>
                ${
                  clickable
                    ? `<button type="button" data-person-id="${escapeAttr(c.id)}" class="text-ink hover:text-gold underline decoration-white/20 underline-offset-2">${escapeHtml(c.name)}</button>`
                    : escapeHtml(c.name)
                }
              </span>`;
          })
          .join('');
        crewList.querySelectorAll('[data-person-id]').forEach((el) => {
          el.addEventListener('click', () => openPersonModal(el.dataset.personId));
        });
      }
    }

    showSagaCompleteness(item);
    showUniverses(item);
  }

  // ---------- Universums in de detailweergave ----------

  // Universums en hun ledenlijsten worden één keer per bezoek geladen. Zolang
  // dat loopt blijft het blok verborgen; het is bijzaak en mag de rest van de
  // detailweergave niet ophouden.
  let universeData = null;
  let universeLoading = null;

  function loadUniverseData() {
    if (universeData) return Promise.resolve(universeData);
    if (universeLoading) return universeLoading;

    universeLoading = (async () => {
      const c = typeof getConfig === 'function' ? getConfig() : {};
      if (!c.tmdbKey || typeof driveLoadUniverses !== 'function') return { universes: [], members: {} };

      const { universes } = await driveLoadUniverses();
      const members = {};
      for (const u of universes) {
        try {
          members[u.id] = await loadUniverseMembers(u, c.tmdbKey);
        } catch (err) {
          console.warn('Universum niet geladen:', u.name, err);
        }
      }
      universeData = { universes, members };
      buildUniverseIndex();
      return universeData;
    })();

    return universeLoading;
  }

  // Index per titel-id → set van universum-id's waar die titel bij hoort.
  // Wordt gebruikt door het universumfilter op de collectiepagina en één keer
  // opgebouwd nadat de ledenlijsten geladen zijn.
  const universeByMovieId = {};

  function buildUniverseIndex() {
    if (!universeData) return;
    Object.keys(universeByMovieId).forEach((k) => delete universeByMovieId[k]);

    universeData.universes.forEach((u) => {
      const members = universeData.members[u.id];
      if (!members) return;
      const matcher = buildOwnedMatcher(state.all);
      members.items.forEach((part) => {
        const mine = matcher(part);
        if (!mine) return;
        (universeByMovieId[mine.id] = universeByMovieId[mine.id] || new Set()).add(u.id);
      });
    });

    // Nu de index klaar is: de filterchips opbouwen en het filter toepassen.
    buildUniverseChips();
    if (state.activeUniverses.size) applyFilters();
  }

  async function showUniverses(item) {
    const section = els.modal.querySelector('[data-field="universe-section"]');
    const list = els.modal.querySelector('[data-field="universe-list"]');
    if (!section || !list) return;
    section.classList.add('hidden');

    const requestedFor = item.id;
    let data;
    try {
      data = await loadUniverseData();
    } catch {
      return;
    }
    if (requestedFor !== currentModalId || !data.universes.length) return;

    const matchOne = buildOwnedMatcher([item]);
    const hits = data.universes.filter((u) => {
      const m = data.members[u.id];
      return m && m.items.some((part) => matchOne(part) === item);
    });

    if (!hits.length) return;

    list.innerHTML = hits
      .map((u) => {
        const status = universeStatus(data.members[u.id].items, state.all);
        const pct = status.total ? Math.round((status.owned / status.total) * 100) : 0;
        return `
          <div class="flex items-center justify-between gap-3">
            <a href="universums.html" class="text-sm text-ink hover:text-gold underline decoration-white/20 underline-offset-2 truncate min-w-0">${escapeHtml(
              u.name
            )}</a>
            <span class="font-mono text-xs text-gold shrink-0">${status.owned}/${status.total} · ${pct}%</span>
          </div>`;
      })
      .join('');

    section.classList.remove('hidden');
  }

  // ---------- Filterpaneel open en dicht (fase 14) ----------

  // Hoeveel filters staan er aan? Bepaalt het label op de knop en of de
  // wisknop zichtbaar is.
  function activeFilterCount() {
    return (
      state.activeFormats.size +
      state.activeTypes.size +
      state.activeGenres.size +
      state.activeStatus.size +
      state.activeWatched.size +
      state.activeDecades.size +
      state.activeCerts.size +
      state.activeBoxsets.size +
      state.activeLocations.size +
      state.activeUniverses.size +
      (state.activeLetter ? 1 : 0) +
      (state.search.trim() ? 1 : 0)
    );
  }

  function updateFilterButton() {
    if (!els.filterToggle) return;
    const n = activeFilterCount();
    const open = els.filterPanel && els.filterPanel.classList.contains('filter-open');
    els.filterToggle.textContent = `Filters${n ? ` (${n})` : ''} ${open ? '▴' : '▾'}`;
    els.filterToggle.classList.toggle('chip-active', n > 0);
    els.filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (els.clearFilters) els.clearFilters.classList.toggle('hidden', n === 0);
  }

  function setFilterPanel(open) {
    if (!els.filterPanel) return;
    els.filterPanel.classList.toggle('filter-open', open);
    updateFilterButton();
  }

  function clearAllFilters() {
    state.activeFormats.clear();
    state.activeTypes.clear();
    state.activeGenres.clear();
    state.activeStatus.clear();
    state.activeWatched.clear();
    state.activeDecades.clear();
    state.activeCerts.clear();
    state.activeBoxsets.clear();
    state.activeLocations.clear();
    state.activeUniverses.clear();
    state.activeLetter = null;
    state.search = '';
    if (els.search) els.search.value = '';
    buildFacetChips(state.all);
    if (els.letterChips) {
      els.letterChips.querySelectorAll('.letter-chip').forEach((c) => c.classList.remove('letter-chip-active'));
    }
    els.typeChips.querySelectorAll('[data-type]').forEach((c) => c.classList.remove('chip-active'));
    if (els.statusChips) els.statusChips.querySelectorAll('[data-status]').forEach((c) => c.classList.remove('chip-active'));
    if (els.watchedChips) els.watchedChips.querySelectorAll('[data-watched]').forEach((c) => c.classList.remove('chip-active'));
    applyFilters();
  }

  if (els.filterToggle && els.filterPanel) {
    els.filterToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setFilterPanel(!els.filterPanel.classList.contains('filter-open'));
    });

    // Buitenom klikken sluit het paneel — zowel met de muis als met een vinger.
    document.addEventListener('click', (e) => {
      if (!els.filterPanel.classList.contains('filter-open')) return;
      if (els.filterPanel.contains(e.target) || els.filterToggle.contains(e.target)) return;
      setFilterPanel(false);
    });

    if (els.clearFilters) {
      els.clearFilters.addEventListener('click', (e) => {
        e.stopPropagation();
        clearAllFilters();
      });
    }

    updateFilterButton();
  }

  // ---------- Klikbaar filteren (fase 13) ----------

  // Klik je in de detailweergave op een genre, regisseur of jaar, dan sluit de
  // pop-up en staat je collectie meteen op dat filter. Bestaande filters worden
  // gewist, anders krijg je onbedoeld een lege lijst.
  function applyQuickFilter(kind, value) {
    state.activeGenres.clear();
    state.activeDecades.clear();
    state.activeCerts.clear();
    state.activeBoxsets.clear();
    state.activeLocations.clear();
    state.activeLetter = null;
    state.search = '';
    els.search.value = '';

    if (kind === 'genre') state.activeGenres.add(value);
    if (kind === 'decade') state.activeDecades.add(Number(value));
    if (kind === 'search') {
      state.search = value;
      els.search.value = value;
    }

    closeModal();
    buildFacetChips(state.all);
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Kijkgeschiedenis en eigen score (fase 13) ----------

  // item.watch_log = [{ date: '2026-07-21' }, ...] — oudste eerst.
  function addWatchEntry(item, date) {
    const d = date || new Date().toISOString().slice(0, 10);
    item.watch_log = item.watch_log || [];
    // Twee keer dezelfde dag telt als één kijkbeurt.
    if (item.watch_log.some((e) => e.date === d)) return false;
    item.watch_log.push({ date: d });
    item.watch_log.sort((a, b) => a.date.localeCompare(b.date));
    return true;
  }

  function renderWatchLog(item) {
    const section = els.modal.querySelector('[data-field="watchlog-section"]');
    const summary = els.modal.querySelector('[data-field="watchlog-summary"]');
    const list = els.modal.querySelector('[data-field="watchlog-list"]');
    const addBtn = els.modal.querySelector('[data-watchlog-add]');
    if (!section || !summary || !list) return;

    const log = item.watch_log || [];
    section.classList.toggle('hidden', !item.watched && log.length === 0);
    if (!item.watched && !log.length) return;

    const fmt = (d) => {
      const dt = new Date(d);
      return isNaN(dt) ? d : dt.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    if (!log.length) {
      summary.textContent = 'Gezien, maar zonder datum — die is er pas sinds deze versie.';
      list.innerHTML = '';
    } else if (log.length === 1) {
      summary.textContent = `Gezien op ${fmt(log[0].date)}`;
      list.innerHTML = '';
    } else {
      summary.textContent = `${log.length}× gezien, laatst op ${fmt(log[log.length - 1].date)}`;
      list.innerHTML = log
        .slice()
        .reverse()
        .map(
          (e) => `
            <div class="flex items-center justify-between gap-2 text-[11px] text-muted">
              <span>${escapeHtml(fmt(e.date))}</span>
              <button type="button" class="hover:text-red-400 underline" data-log-remove="${escapeAttr(e.date)}">verwijderen</button>
            </div>`
        )
        .join('');
    }

    list.querySelectorAll('[data-log-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const before = JSON.parse(JSON.stringify(item.watch_log || []));
        item.watch_log = (item.watch_log || []).filter((e) => e.date !== btn.dataset.logRemove);
        openModal(item.id);
        backgroundSave(
          () => upsertMovieInDrive(item),
          () => { item.watch_log = before; if (!els.modal.classList.contains('hidden')) openModal(item.id); }
        );
      });
    });

    if (addBtn) {
      addBtn.onclick = () => {
        const before = JSON.parse(JSON.stringify(item.watch_log || []));
        if (!addWatchEntry(item)) return; // vandaag stond er al in
        item.watched = true;
        applyFilters();
        openModal(item.id);
        backgroundSave(
          () => upsertMovieInDrive(item),
          () => { item.watch_log = before; if (!els.modal.classList.contains('hidden')) openModal(item.id); }
        );
      };
    }
  }

  function renderMyRating(item) {
    const sel = els.modal.querySelector('[data-my-rating]');
    if (!sel) return;
    if (sel.options.length <= 1) {
      for (let n = 10; n >= 1; n--) {
        const o = document.createElement('option');
        o.value = String(n);
        o.textContent = String(n);
        sel.appendChild(o);
      }
    }
    sel.value = item.my_rating != null ? String(item.my_rating) : '';
    sel.onchange = () => {
      const before = item.my_rating;
      const v = sel.value === '' ? null : Number(sel.value);
      item.my_rating = v;
      applyFilters();
      backgroundSave(
        () => upsertMovieInDrive(item),
        () => { item.my_rating = before; if (!els.modal.classList.contains('hidden')) openModal(item.id); }
      );
    };
  }

  // ---------- Afleveringen en kijkvoortgang (fase 13) ----------

  // Opgehaalde seizoenen worden per bezoek onthouden.
  const seasonCache = {};

  // Welke afleveringen je gezien hebt, per seizoen:
  //   item.watched_episodes = { "3": [1,2,3,5] }
  function watchedEpisodes(item, seasonNumber) {
    const map = item.watched_episodes || {};
    return new Set(map[String(seasonNumber)] || []);
  }

  function setWatchedEpisodes(item, seasonNumber, set) {
    if (!item.watched_episodes) item.watched_episodes = {};
    const list = [...set].sort((a, b) => a - b);
    if (list.length) item.watched_episodes[String(seasonNumber)] = list;
    else delete item.watched_episodes[String(seasonNumber)];
  }

  function seasonProgress(item, season) {
    const total = Number(season.episode_count) || 0;
    const seen = watchedEpisodes(item, season.season_number).size;
    return { seen, total, pct: total ? Math.round((seen / total) * 100) : 0 };
  }

  // Waar ben je gebleven: hoogste seizoen met kijkactiviteit, en daarbinnen de
  // hoogste aflevering die je zag.
  function lastWatchedPoint(item) {
    const map = item.watched_episodes || {};
    const seasons = Object.keys(map)
      .map(Number)
      .filter((n) => (map[String(n)] || []).length)
      .sort((a, b) => b - a);
    if (!seasons.length) return null;
    const s = seasons[0];
    const eps = map[String(s)];
    return { season: s, episode: Math.max(...eps) };
  }

  function totalWatchedEpisodes(item) {
    const map = item.watched_episodes || {};
    return Object.values(map).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
  }

  function totalOwnedEpisodes(item) {
    return (item.seasons || [])
      .filter((s) => s.owned)
      .reduce((sum, s) => sum + (Number(s.episode_count) || 0), 0);
  }

  // Slaat de kijkvoortgang op. Voor series bepaalt de voortgang meteen of de
  // titel als 'bekeken' geldt: alles gezien = bekeken.
  function saveEpisodeProgress(item, revertSnapshot) {
    const owned = totalOwnedEpisodes(item);
    const seen = totalWatchedEpisodes(item);
    if (owned) item.watched = seen >= owned;

    applyFilters();
    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        item.watched_episodes = revertSnapshot.episodes;
        item.watched = revertSnapshot.watched;
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  function snapshotProgress(item) {
    return {
      episodes: JSON.parse(JSON.stringify(item.watched_episodes || {})),
      watched: item.watched,
    };
  }

  async function toggleSeasonEpisodes(item, season, container, btn) {
    const open = container.dataset.open === '1';
    if (open) {
      container.classList.add('hidden');
      container.dataset.open = '0';
      btn.textContent = 'afleveringen ▾';
      return;
    }

    container.classList.remove('hidden');
    container.dataset.open = '1';
    btn.textContent = 'afleveringen ▴';

    if (container.dataset.loaded === '1') return;

    // Aparte meldingen per oorzaak — "geen TMDb-koppeling" is misleidend als
    // in werkelijkheid het bestand assets/admin.js verouderd is.
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (typeof tmdbSeason !== 'function') {
      container.innerHTML =
        '<p class="text-xs text-gold py-2">Je <code>assets/admin.js</code> is verouderd — ' +
        'die kent de functie voor afleveringen nog niet. Upload dat bestand opnieuw en herlaad met Ctrl+Shift+R.</p>';
      return;
    }
    if (!c.tmdbKey) {
      container.innerHTML = '<p class="text-xs text-gold py-2">Vul eerst je TMDb-key in via Beheer → Instellingen.</p>';
      return;
    }
    if (!item.tmdb_id) {
      container.innerHTML = '<p class="text-xs text-muted py-2">Deze titel heeft geen TMDb-koppeling, dus er zijn geen afleveringen op te halen.</p>';
      return;
    }

    container.innerHTML = '<p class="text-xs text-muted py-2">Afleveringen ophalen…</p>';
    const cacheKey = `${item.tmdb_id}:${season.season_number}`;
    let data;
    try {
      data = seasonCache[cacheKey] || (seasonCache[cacheKey] = await tmdbSeason(item.tmdb_id, season.season_number, c.tmdbKey));
    } catch (err) {
      container.innerHTML = `<p class="text-xs text-muted py-2">Kon de afleveringen niet ophalen: ${escapeHtml(err.message)}</p>`;
      return;
    }

    container.dataset.loaded = '1';
    renderEpisodes(item, season, data, container);
  }

  // ---------- Afleveringpagina ----------

  const STILL_BASE = 'https://image.tmdb.org/t/p/w780';
  let episodeContext = null; // { item, season, data, index }

  function openEpisodeModal(item, season, data, index) {
    const m = els.episodeModal;
    if (!m || !data.episodes[index]) return;
    episodeContext = { item, season, data, index };
    const e = data.episodes[index];

    const wrap = m.querySelector('[data-ep-still-wrap]');
    const img = m.querySelector('[data-ep-still]');
    if (e.still_path) {
      img.src = STILL_BASE + e.still_path;
      img.alt = e.name || '';
      wrap.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      wrap.classList.add('hidden');
    }

    m.querySelector('[data-ep-number]').textContent =
      `${escapeHtml(item.title)} · Seizoen ${season.season_number}, aflevering ${e.episode_number}`;
    m.querySelector('[data-ep-title]').textContent = e.name || `Aflevering ${e.episode_number}`;

    const meta = [];
    if (e.air_date) {
      const d = new Date(e.air_date);
      meta.push(isNaN(d) ? e.air_date : d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }));
    }
    if (e.runtime) meta.push(e.runtime + ' min');
    if (e.rating) meta.push(`TMDb ${e.rating.toFixed(1)}${e.vote_count ? ` (${e.vote_count})` : ''}`);
    m.querySelector('[data-ep-meta]').textContent = meta.join(' · ');

    m.querySelector('[data-ep-overview]').textContent =
      e.overview || 'Voor deze aflevering is nog geen beschrijving beschikbaar op TMDb.';

    // Regie en scenario van deze aflevering
    const crewWrap = m.querySelector('[data-ep-crew-wrap]');
    const dWrap = m.querySelector('[data-ep-directors-wrap]');
    const wWrap = m.querySelector('[data-ep-writers-wrap]');
    const hasCrew = (e.directors && e.directors.length) || (e.writers && e.writers.length);
    crewWrap.classList.toggle('hidden', !hasCrew);
    if (hasCrew) {
      dWrap.classList.toggle('hidden', !(e.directors && e.directors.length));
      wWrap.classList.toggle('hidden', !(e.writers && e.writers.length));
      m.querySelector('[data-ep-directors]').textContent = (e.directors || []).join(', ');
      m.querySelector('[data-ep-writers]').textContent = [...new Set(e.writers || [])].join(', ');
    }

    // Gastrollen, klikbaar naar hun profiel
    const guestsWrap = m.querySelector('[data-ep-guests-wrap]');
    const guests = m.querySelector('[data-ep-guests]');
    const list = e.guest_stars || [];
    guestsWrap.classList.toggle('hidden', list.length === 0);
    if (list.length) {
      guests.innerHTML = list
        .map(
          (g) => `
            <div class="w-20 shrink-0 text-center ${g.id ? 'cursor-pointer group/person' : ''}"
              ${g.id ? `data-person-id="${escapeAttr(g.id)}" role="button" tabindex="0"` : ''}>
              <div class="w-20 h-20 rounded-full overflow-hidden bg-bg ring-1 ring-white/10 mb-1 ${
                g.id ? 'group-hover/person:ring-gold' : ''
              }">
                ${
                  g.profile_path
                    ? `<img src="${escapeAttr(PROFILE_BASE + g.profile_path)}" alt="${escapeAttr(g.name)}" loading="lazy" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-[#8B8A92] font-mono text-lg">${escapeHtml((g.name || '?').charAt(0))}</div>`
                }
              </div>
              <p class="text-[11px] leading-tight text-ink truncate" title="${escapeAttr(g.name)}">${escapeHtml(g.name)}</p>
              ${g.character ? `<p class="text-[10px] leading-tight text-muted truncate">${escapeHtml(g.character)}</p>` : ''}
            </div>`
        )
        .join('');
      guests.querySelectorAll('[data-person-id]').forEach((el) => {
        el.addEventListener('click', () => {
          closeEpisodeModal();
          openPersonModal(el.dataset.personId);
        });
      });
    }

    // Gezien-knop
    const seen = watchedEpisodes(item, season.season_number).has(e.episode_number);
    const btn = m.querySelector('[data-ep-watched]');
    btn.textContent = seen ? '✓ Gezien — haal het vinkje weg' : 'Markeer als gezien';
    btn.classList.toggle('chip-active', seen);
    btn.onclick = () => {
      const before = snapshotProgress(item);
      const set = watchedEpisodes(item, season.season_number);
      if (set.has(e.episode_number)) set.delete(e.episode_number);
      else set.add(e.episode_number);
      setWatchedEpisodes(item, season.season_number, set);
      saveEpisodeProgress(item, before);
      openEpisodeModal(item, season, data, index);
    };

    // Bladeren binnen het seizoen
    const prev = m.querySelector('[data-ep-prev]');
    const next = m.querySelector('[data-ep-next]');
    prev.disabled = index === 0;
    next.disabled = index >= data.episodes.length - 1;
    prev.style.opacity = prev.disabled ? '0.4' : '1';
    next.style.opacity = next.disabled ? '0.4' : '1';
    prev.onclick = () => !prev.disabled && openEpisodeModal(item, season, data, index - 1);
    next.onclick = () => !next.disabled && openEpisodeModal(item, season, data, index + 1);

    m.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    m.scrollTop = 0;
  }

  function closeEpisodeModal() {
    if (!els.episodeModal) return;
    els.episodeModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    // Voortgang in de seizoenslijst bijwerken
    if (episodeContext && currentModalId) openModal(currentModalId);
    episodeContext = null;
  }

  if (els.episodeModal) {
    els.episodeModal.addEventListener('click', (e) => {
      if (e.target === els.episodeModal) closeEpisodeModal();
    });
    const close = els.episodeModal.querySelector('[data-ep-close]');
    if (close) close.addEventListener('click', closeEpisodeModal);
  }

  function renderEpisodes(item, season, data, container) {
    const seen = watchedEpisodes(item, season.season_number);

    container.innerHTML = `
      <div class="flex flex-wrap gap-2 mb-2">
        <button type="button" class="chip !py-1 !px-2.5 text-[10px]" data-ep-all>Alles aanvinken</button>
        <button type="button" class="chip !py-1 !px-2.5 text-[10px]" data-ep-none>Alles uitvinken</button>
      </div>
      <div class="space-y-1">
        ${data.episodes
          .map((e, i) => {
            const isSeen = seen.has(e.episode_number);
            return `
              <div class="flex items-center gap-3 py-2 px-2 rounded hover:bg-white/5">
                <input type="checkbox" class="w-4 h-4 shrink-0 cursor-pointer" data-ep="${e.episode_number}" ${
              isSeen ? 'checked' : ''
            } title="Markeer als gezien">
                ${
                  e.still_path
                    ? `<img src="${escapeAttr('https://image.tmdb.org/t/p/w185' + e.still_path)}" alt="" loading="lazy" class="w-16 h-9 object-cover rounded shrink-0">`
                    : '<span class="w-16 h-9 rounded bg-bg shrink-0"></span>'
                }
                <button type="button" class="flex-1 min-w-0 text-left" data-ep-open="${i}">
                  <span class="block text-sm text-ink ${isSeen ? 'opacity-60' : ''} truncate">
                    <span class="font-mono text-xs text-muted mr-1">${season.season_number}×${String(e.episode_number).padStart(2, '0')}</span>
                    ${escapeHtml(e.name || 'Aflevering ' + e.episode_number)}
                  </span>
                  <span class="block text-xs text-muted truncate">${
                    e.air_date ? escapeHtml(e.air_date) : ''
                  }${e.rating ? ' · ' + e.rating.toFixed(1) : ''}${e.runtime ? ' · ' + e.runtime + ' min' : ''}</span>
                </button>
                <span class="text-muted text-xs shrink-0">›</span>
              </div>`;
          })
          .join('')}
      </div>
      <p class="text-[11px] text-muted mt-2">Klik een aflevering aan voor de volledige beschrijving.</p>`;

    const applyChange = (mutate) => {
      const before = snapshotProgress(item);
      const set = watchedEpisodes(item, season.season_number);
      mutate(set);
      setWatchedEpisodes(item, season.season_number, set);
      saveEpisodeProgress(item, before);
      openModal(item.id);
    };

    container.querySelectorAll('[data-ep]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const n = Number(cb.dataset.ep);
        applyChange((set) => (cb.checked ? set.add(n) : set.delete(n)));
      });
    });

    container.querySelectorAll('[data-ep-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEpisodeModal(item, season, data, Number(btn.dataset.epOpen));
      });
    });
    container.querySelector('[data-ep-all]').addEventListener('click', () => {
      applyChange((set) => data.episodes.forEach((e) => set.add(e.episode_number)));
    });
    container.querySelector('[data-ep-none]').addEventListener('click', () => {
      applyChange((set) => set.clear());
    });
  }

  // ---------- Wat zullen we kijken? ----------

  let pickScope = 'unwatched';

  function pickCandidates() {
    const genre = els.pickModal.querySelector('[data-pick-genre]').value;
    const maxRuntime = Number(els.pickModal.querySelector('[data-pick-runtime]').value) || 0;

    return state.all.filter((m) => {
      // Verlanglijst-titels kan je vanavond niet kijken.
      if (m.wishlist) return false;
      if (pickScope === 'unwatched' && m.watched) return false;
      if (genre && !(m.genres || []).includes(genre)) return false;
      if (maxRuntime) {
        const rt = Number(m.runtime) || 0;
        // Bij series is runtime de afleveringsduur; die past bijna altijd.
        if (!rt || rt > maxRuntime) return false;
      }
      return true;
    });
  }

  function updatePickCount() {
    const n = pickCandidates().length;
    els.pickModal.querySelector('[data-pick-count]').textContent =
      n === 0 ? 'Geen titels die hieraan voldoen' : `${n} titel${n === 1 ? '' : 's'} om uit te kiezen`;
  }

  function rollPick() {
    const list = pickCandidates();
    const box = els.pickModal.querySelector('[data-pick-result]');
    if (!list.length) {
      box.classList.remove('hidden');
      box.innerHTML = '<p class="text-sm text-muted">Niets gevonden. Probeer een ruimer filter.</p>';
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    const cover = posterUrl(pick);

    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="flex gap-4">
        <div class="w-24 shrink-0 aspect-[2/3] rounded overflow-hidden bg-bg ring-1 ring-white/10">
          ${cover ? `<img src="${escapeAttr(cover)}" alt="" class="w-full h-full object-cover">` : ''}
        </div>
        <div class="min-w-0 flex-1">
          <p class="font-display text-2xl tracking-wide leading-tight">${escapeHtml(pick.title)}</p>
          <p class="text-sm text-muted font-mono">${pick.release_year || ''}${
      pick.runtime ? ' · ' + pick.runtime + ' min' : ''
    }${pick.rating ? ' · TMDb ' + pick.rating.toFixed(1) : ''}</p>
          <p class="text-xs text-muted mt-1">${escapeHtml((pick.genres || []).join(' · '))}</p>
          <p class="text-xs text-muted mt-1">${escapeHtml(ownedFormats(pick).map(formatLabel).join(', '))}</p>
          <div class="flex gap-2 mt-3">
            <button type="button" class="chip" data-pick-open="${escapeAttr(pick.id)}">Bekijk details</button>
            <button type="button" class="chip" data-pick-again>Nog eens</button>
          </div>
        </div>
      </div>`;

    box.querySelector('[data-pick-open]').addEventListener('click', () => {
      closePickModal();
      openModal(pick.id);
    });
    box.querySelector('[data-pick-again]').addEventListener('click', rollPick);
  }

  function openPickModal() {
    if (!els.pickModal) return;
    // Genrelijst vullen met wat er in je collectie zit.
    const genres = new Set();
    state.all.forEach((m) => (m.genres || []).forEach((g) => genres.add(g)));
    const sel = els.pickModal.querySelector('[data-pick-genre]');
    sel.innerHTML =
      '<option value="">alle genres</option>' +
      [...genres].sort((a, b) => a.localeCompare(b)).map((g) => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join('');

    els.pickModal.querySelector('[data-pick-result]').classList.add('hidden');
    updatePickCount();
    els.pickModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closePickModal() {
    if (!els.pickModal) return;
    els.pickModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  // ---------- Dubbels ----------

  // Twee soorten dubbels: hetzelfde formaat meer dan eens binnen één titel,
  // en twee losse titels met een vrijwel gelijke naam en hetzelfde jaar.
  function findDuplicates() {
    const results = [];

    state.all.forEach((m) => {
      const counts = {};
      (m.editions || []).forEach((e) => {
        if (e.wishlist) return;
        counts[e.format] = (counts[e.format] || 0) + 1;
      });
      Object.keys(counts)
        .filter((f) => counts[f] > 1)
        .forEach((f) => {
          results.push({
            kind: 'edition',
            items: [m],
            text: `${counts[f]}× ${formatLabel(f)} van dezelfde titel`,
          });
        });
    });

    const byKey = {};
    state.all.forEach((m) => {
      if (m.wishlist) return;
      const key = sortTitle(m) + '|' + (m.release_year || '');
      (byKey[key] = byKey[key] || []).push(m);
    });
    Object.values(byKey)
      .filter((group) => group.length > 1)
      .forEach((group) => {
        results.push({
          kind: 'title',
          items: group,
          text: `${group.length} aparte titels met dezelfde naam en jaar`,
        });
      });

    return results;
  }

  function openDupesModal() {
    if (!els.dupesModal) return;
    const list = els.dupesModal.querySelector('[data-dupes-list]');
    const dupes = findDuplicates();

    list.innerHTML = dupes.length
      ? dupes
          .map(
            (d) => `
              <div class="bg-bg rounded-lg p-3">
                <p class="text-sm text-ink">${escapeHtml(d.items[0].title)} <span class="text-muted font-mono text-xs">${
              d.items[0].release_year || ''
            }</span></p>
                <p class="text-xs text-gold font-mono mt-0.5">${escapeHtml(d.text)}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  ${d.items
                    .map(
                      (it) =>
                        `<button type="button" class="chip !py-1 !px-2.5 text-[11px]" data-dupe-open="${escapeAttr(
                          it.id
                        )}">Open ${escapeHtml(it.id)}</button>`
                    )
                    .join('')}
                </div>
              </div>`
          )
          .join('')
      : '<p class="text-sm text-muted py-4">Geen dubbels gevonden. Netjes.</p>';

    list.querySelectorAll('[data-dupe-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeDupesModal();
        openModal(btn.dataset.dupeOpen);
      });
    });

    els.dupesModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeDupesModal() {
    if (!els.dupesModal) return;
    els.dupesModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  window.__openPickModal = openPickModal;
  window.__openDupesModal = openDupesModal;

  if (els.pickModal) {
    els.pickModal.addEventListener('click', (e) => {
      if (e.target === els.pickModal) closePickModal();
    });
    els.pickModal.querySelector('[data-pick-close]').addEventListener('click', closePickModal);
    els.pickModal.querySelector('[data-pick-roll]').addEventListener('click', rollPick);
    els.pickModal.querySelector('[data-pick-genre]').addEventListener('change', updatePickCount);
    els.pickModal.querySelector('[data-pick-runtime]').addEventListener('change', updatePickCount);
    els.pickModal.querySelectorAll('[data-pick-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pickScope = btn.dataset.pickScope;
        els.pickModal.querySelectorAll('[data-pick-scope]').forEach((b) => {
          b.classList.toggle('chip-active', b === btn);
        });
        updatePickCount();
      });
    });
  }

  if (els.dupesModal) {
    els.dupesModal.addEventListener('click', (e) => {
      if (e.target === els.dupesModal) closeDupesModal();
    });
    els.dupesModal.querySelector('[data-dupes-close]').addEventListener('click', closeDupesModal);
  }

  // ---------- Exemplaren (fase 8) ----------

  // Welk exemplaar staat er in de detailweergave centraal? Bepaalt welke
  // hoesfoto's en opmerkingen je ziet en wat het bewerkpaneel aanpast.
  let activeEditionId = null;

  function activeEdition(item) {
    const eds = item.editions || [];
    return eds.find((e) => e.eid === activeEditionId) || primaryEdition(item) || eds[0] || null;
  }

  function renderEditions(item) {
    const section = els.modal.querySelector('[data-field="editions-section"]');
    const list = els.modal.querySelector('[data-field="editions-list"]');
    if (!section || !list) return;

    const eds = item.editions || [];
    const active = activeEdition(item);
    if (active) activeEditionId = active.eid;

    list.innerHTML = eds
      .map((e) => {
        const isActive = active && e.eid === active.eid;
        const priceInfo = editionPriceInfo(item, e);
        const bits = [];
        editionVariantLabels(e).forEach((l) => bits.push(escapeHtml(l)));
        if (e.boxset) bits.push(escapeHtml(e.boxset));
        if (e.location) bits.push('📍 ' + escapeHtml(e.location));
        if (e.notes) bits.push(escapeHtml(e.notes));
        const hasPhotos = e.custom_front_cover_id || e.custom_front_cover || e.custom_back_cover_id || e.custom_back_cover;

        return `
          <div class="flex items-center gap-3 py-2 px-2 rounded ${
            isActive ? 'bg-white/5 ring-1 ring-gold/40' : 'hover:bg-white/5'
          } cursor-pointer" data-edition="${escapeAttr(e.eid)}" role="button" tabindex="0">
            <span class="font-mono text-xs px-1.5 py-0.5 rounded shrink-0" style="background:${formatColor(
              e.format
            )};color:#14141A">${escapeHtml(formatShort(e.format))}</span>
            <span class="flex-1 min-w-0">
              <span class="block text-sm text-ink">${escapeHtml(formatLabel(e.format))}${
          e.wishlist ? ' <span class="text-gold font-mono text-[10px]">verlanglijst</span>' : ''
        }</span>
              ${bits.length ? `<span class="block text-[11px] text-muted truncate">${bits.join(' · ')}</span>` : ''}
              ${
                priceInfo
                  ? `<span class="block text-[11px] font-mono text-teal/90" title="Richtwaarde op eBay (mediaan) met de middenrange">${escapeHtml(
                      priceRangeText(priceInfo)
                    )}${convertedHint(priceInfo)}${priceInfo.date ? ` <span class="text-muted">· gemeten ${escapeHtml(priceInfo.date)}</span>` : ''}</span>`
                  : ''
              }
            </span>
            ${hasPhotos ? '<span class="font-mono text-[10px] text-teal shrink-0" title="Eigen hoesfoto\'s">foto</span>' : ''}
            <button type="button" class="text-muted hover:text-red-400 text-xs underline shrink-0"
              data-remove-edition="${escapeAttr(e.eid)}">verwijderen</button>
          </div>`;
      })
      .join('');

    section.classList.remove('hidden');

    list.querySelectorAll('[data-edition]').forEach((row) => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-remove-edition]')) return;
        activeEditionId = row.dataset.edition;
        openModal(item.id);
      });
    });
    list.querySelectorAll('[data-remove-edition]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handleRemoveEdition(item, btn.dataset.removeEdition);
      });
    });
  }

  function handleAddEdition(item) {
    const used = new Set((item.editions || []).map((e) => e.format));
    const next = MEDIA_FORMATS.map((f) => f.value).find((v) => !used.has(v)) || 'bluray';
    const edition = {
      eid: nextEditionId(item),
      format: next,
      notes: '',
      boxset: '',
      steelbook: false,
      wishlist: false,
      date_added: new Date().toISOString().slice(0, 10),
      custom_front_cover_id: '',
      custom_back_cover_id: '',
      custom_front_cover: '',
      custom_back_cover: '',
    };
    const snapshot = JSON.parse(JSON.stringify(item.editions || []));
    item.editions = [...(item.editions || []), edition];
    syncLegacyFieldsFromEditions(item);
    activeEditionId = edition.eid;

    buildFacetChips(state.all);
    applyFilters();
    openModal(item.id);

    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        item.editions = snapshot;
        syncLegacyFieldsFromEditions(item);
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  function handleRemoveEdition(item, eid) {
    const eds = item.editions || [];
    if (eds.length <= 1) {
      alert('Dit is het laatste exemplaar. Gebruik "Volledige titel verwijderen" als je de titel helemaal weg wil.');
      return;
    }
    const target = eds.find((e) => e.eid === eid);
    if (!target) return;
    if (!confirm(`Exemplaar op ${formatLabel(target.format)} verwijderen uit je collectie?`)) return;

    const snapshot = JSON.parse(JSON.stringify(eds));
    item.editions = eds.filter((e) => e.eid !== eid);
    syncLegacyFieldsFromEditions(item);
    activeEditionId = null;

    buildFacetChips(state.all);
    applyFilters();
    openModal(item.id);

    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        item.editions = snapshot;
        syncLegacyFieldsFromEditions(item);
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  // ---------- Personen ----------

  const personCache = {};
  let personState = { data: null, filter: 'all', shown: 40, bioExpanded: false };
  const PERSON_PAGE = 40;
  // Volgnummer per aanvraag: klik je snel door naar een andere persoon, dan
  // mag het trage antwoord van de vorige het scherm niet meer overschrijven.
  let personRequestSeq = 0;

  // Koppelt een TMDb-titel aan wat jij in je collectie hebt.
  function ownedIndexByTmdb() {
    const index = {};
    state.all.forEach((m) => {
      if (m.tmdb_id) index[String(m.tmdb_id)] = m;
    });
    return index;
  }

  function personCreditRowHtml(credit, mine) {
    const owned = mine && !mine.wishlist;
    const onWishlist = mine && mine.wishlist;
    const year = credit.release_year || '—';
    const roles = credit.roles.length ? credit.roles.slice(0, 3).join(' · ') : '';
    const typeLabel = credit.media_type === 'tv' ? 'serie' : '';

    let marker;
    if (owned) marker = '<span class="font-mono text-[11px] text-teal shrink-0">✓ in bezit</span>';
    else if (onWishlist) marker = '<span class="font-mono text-[11px] text-gold shrink-0">verlanglijst</span>';
    else marker = '<span class="font-mono text-[11px] text-muted/60 shrink-0">—</span>';

    return `
      <div class="flex items-center gap-3 py-1.5 ${owned ? '' : 'opacity-75'} ${
      mine ? 'cursor-pointer hover:bg-white/5 rounded px-1' : 'px-1'
    }" ${mine ? `data-open-owned="${escapeAttr(mine.id)}" role="button" tabindex="0"` : ''}>
        <span class="font-mono text-[11px] text-muted w-10 shrink-0">${year}</span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm text-ink">${escapeHtml(credit.title)}${
      typeLabel ? ` <span class="text-muted font-mono text-[10px]">${typeLabel}</span>` : ''
    }</span>
          ${roles ? `<span class="block truncate text-[11px] text-muted">${escapeHtml(roles)}</span>` : ''}
        </span>
        ${marker}
      </div>`;
  }

  function renderPersonCredits() {
    const m = els.personModal;
    if (!m || !personState.data) return;
    const index = ownedIndexByTmdb();
    const listEl = m.querySelector('[data-person-credits]');
    const moreBtn = m.querySelector('[data-person-more]');

    const all = personState.data.credits;
    const filtered = all.filter((c) => {
      const mine = index[String(c.tmdb_id)];
      if (personState.filter === 'owned') return mine && !mine.wishlist;
      if (personState.filter === 'missing') return !mine || mine.wishlist;
      return true;
    });

    const visible = filtered.slice(0, personState.shown);
    listEl.innerHTML = visible.length
      ? visible.map((c) => personCreditRowHtml(c, index[String(c.tmdb_id)])).join('')
      : '<p class="text-sm text-muted py-3">Niets gevonden met dit filter.</p>';

    moreBtn.classList.toggle('hidden', personState.shown >= filtered.length);
    moreBtn.textContent = `Toon meer (${filtered.length - personState.shown} resterend)`;

    listEl.querySelectorAll('[data-open-owned]').forEach((el) => {
      el.addEventListener('click', () => {
        closePersonModal();
        openModal(el.dataset.openOwned);
      });
    });
  }

  async function openPersonModal(personId) {
    const m = els.personModal;
    if (!m) return;
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey || typeof tmdbPerson !== 'function') return;

    const myRequest = ++personRequestSeq;
    personState = { data: null, filter: 'all', shown: PERSON_PAGE, bioExpanded: false };

    m.querySelector('[data-person-name]').textContent = 'Laden…';
    m.querySelector('[data-person-meta]').textContent = '';
    m.querySelector('[data-person-owned]').textContent = '';
    m.querySelector('[data-person-bio]').textContent = '';
    m.querySelector('[data-person-credits]').innerHTML = '';
    m.querySelector('[data-person-photo]').removeAttribute('src');
    m.querySelector('[data-person-appearances-wrap]').classList.add('hidden');
    m.querySelectorAll('[data-person-filter]').forEach((b) =>
      b.classList.toggle('chip-active', b.dataset.personFilter === 'all')
    );
    m.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    let person;
    try {
      person = personCache[personId] || (personCache[personId] = await tmdbPerson(personId, c.tmdbKey));
    } catch (err) {
      if (myRequest !== personRequestSeq) return;
      m.querySelector('[data-person-name]').textContent = 'Kon deze persoon niet laden';
      m.querySelector('[data-person-meta]').textContent = err.message;
      return;
    }

    // Intussen doorgeklikt naar iemand anders, of het venster gesloten?
    // Dan dit antwoord laten vallen.
    if (myRequest !== personRequestSeq || m.classList.contains('hidden')) return;

    personState.data = person;

    m.querySelector('[data-person-name]').textContent = person.name;

    const photo = m.querySelector('[data-person-photo]');
    if (person.profile_path) {
      photo.src = PROFILE_BASE + person.profile_path;
      photo.alt = person.name;
    }

    const bits = [];
    const DEPT = { Acting: 'Acteur', Directing: 'Regisseur', Writing: 'Scenarist', Sound: 'Muziek', Production: 'Productie' };
    if (person.known_for_department) bits.push(DEPT[person.known_for_department] || person.known_for_department);
    if (person.birthday) {
      const born = new Date(person.birthday);
      if (!isNaN(born)) {
        if (person.deathday) {
          const died = new Date(person.deathday);
          bits.push(`${born.getFullYear()}–${isNaN(died) ? '' : died.getFullYear()}`);
        } else {
          const age = Math.floor((Date.now() - born) / 31557600000);
          bits.push(`geboren ${born.toLocaleDateString('nl-BE')} (${age})`);
        }
      }
    }
    if (person.place_of_birth) bits.push(person.place_of_birth);
    m.querySelector('[data-person-meta]').textContent = bits.join(' · ');

    // Hoeveel van deze filmografie staat er bij jou in de kast?
    const index = ownedIndexByTmdb();
    const ownedCount = person.credits.filter((cr) => {
      const mine = index[String(cr.tmdb_id)];
      return mine && !mine.wishlist;
    }).length;
    m.querySelector('[data-person-owned]').textContent = ownedCount
      ? `Je bezit ${ownedCount} van de ${person.credits.length} titels`
      : `Nog geen van deze ${person.credits.length} titels in je collectie`;

    // Biografie inkorten tot een leesbaar blok, met knop om uit te klappen.
    const bioEl = m.querySelector('[data-person-bio]');
    const bioBtn = m.querySelector('[data-person-bio-toggle]');
    const bio = person.biography || '';
    const SHORT = 320;
    const applyBio = () => {
      if (!bio) {
        bioEl.textContent = 'Geen biografie beschikbaar.';
        bioBtn.classList.add('hidden');
        return;
      }
      if (bio.length <= SHORT) {
        bioEl.textContent = bio;
        bioBtn.classList.add('hidden');
        return;
      }
      bioEl.textContent = personState.bioExpanded ? bio : bio.slice(0, SHORT).trimEnd() + '…';
      bioBtn.classList.remove('hidden');
      bioBtn.textContent = personState.bioExpanded ? 'Minder' : 'Meer lezen';
    };
    applyBio();
    bioBtn.onclick = () => {
      personState.bioExpanded = !personState.bioExpanded;
      applyBio();
    };

    renderPersonCredits();

    // Gastoptredens als zichzelf staan apart, achter een knop.
    const appWrap = m.querySelector('[data-person-appearances-wrap]');
    const appList = m.querySelector('[data-person-appearances]');
    const appBtn = m.querySelector('[data-person-appearances-toggle]');
    if (person.appearances.length) {
      appWrap.classList.remove('hidden');
      appList.classList.add('hidden');
      appBtn.textContent = `Gastoptredens als zichzelf tonen (${person.appearances.length})`;
      appBtn.onclick = () => {
        const hidden = appList.classList.toggle('hidden');
        appBtn.textContent = hidden
          ? `Gastoptredens als zichzelf tonen (${person.appearances.length})`
          : 'Gastoptredens verbergen';
        if (!hidden && !appList.dataset.filled) {
          const idx = ownedIndexByTmdb();
          appList.innerHTML = person.appearances
            .map((cr) => personCreditRowHtml(cr, idx[String(cr.tmdb_id)]))
            .join('');
          appList.dataset.filled = '1';
        }
      };
      delete appList.dataset.filled;
      appList.innerHTML = '';
    } else {
      appWrap.classList.add('hidden');
    }
  }

  function closePersonModal() {
    if (!els.personModal) return;
    els.personModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  if (els.personModal) {
    els.personModal.addEventListener('click', (e) => {
      if (e.target === els.personModal) closePersonModal();
    });
    const closeBtn = els.personModal.querySelector('[data-person-close]');
    if (closeBtn) closeBtn.addEventListener('click', closePersonModal);

    els.personModal.querySelectorAll('[data-person-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        personState.filter = btn.dataset.personFilter;
        personState.shown = PERSON_PAGE;
        els.personModal.querySelectorAll('[data-person-filter]').forEach((b) => {
          b.classList.toggle('chip-active', b === btn);
        });
        renderPersonCredits();
      });
    });

    const moreBtn = els.personModal.querySelector('[data-person-more]');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        personState.shown += PERSON_PAGE;
        renderPersonCredits();
      });
    }
  }

  // ---------- Reeks-compleetheid ----------

  // Eenmaal opgehaalde reeksen onthouden we voor deze sessie, zodat je bij het
  // heen-en-weer klikken niet telkens opnieuw TMDb aanspreekt.
  const sagaCache = {};

  async function showSagaCompleteness(item) {
    const section = els.modal.querySelector('[data-field="saga-section"]');
    const listEl = els.modal.querySelector('[data-field="saga-parts"]');
    const progressEl = els.modal.querySelector('[data-field="saga-progress"]');
    if (!section || !listEl) return;

    if (!item.saga_id) {
      section.classList.add('hidden');
      return;
    }

    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey || typeof tmdbCollection !== 'function') {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    progressEl.textContent = '';
    listEl.innerHTML = '<p class="text-sm text-muted">Delen van de reeks ophalen…</p>';

    // Onthouden voor welke titel we bezig zijn: klikt de gebruiker intussen
    // door naar een andere titel, dan gooien we dit resultaat weg.
    const requestedFor = item.id;

    let collection;
    try {
      if (sagaCache[item.saga_id]) {
        collection = sagaCache[item.saga_id];
      } else {
        collection = await tmdbCollection(item.saga_id, c.tmdbKey);
        sagaCache[item.saga_id] = collection;
      }
    } catch (err) {
      if (requestedFor !== currentModalId) return;
      listEl.innerHTML = `<p class="text-sm text-muted">Kon de reeks niet ophalen: ${escapeHtml(err.message)}</p>`;
      return;
    }

    if (requestedFor !== currentModalId) return;

    // Koppelen gebeurt op TMDb-id, maar dat lukt niet altijd: TMDb bevat soms
    // meerdere records voor dezelfde film, en dan heeft jouw exemplaar een
    // ander id dan het deel in de officiële reeks. Daarom vergelijken we ook
    // op genormaliseerde titel met een jaar dat hooguit één jaar afwijkt.
    const ownedByTmdb = {};
    const ownedByTitle = {};
    state.all.forEach((m) => {
      if (m.tmdb_id) ownedByTmdb[String(m.tmdb_id)] = m;
      const key = normalizeTitleText(m.title);
      (ownedByTitle[key] = ownedByTitle[key] || []).push(m);
    });

    function findMine(part) {
      const byId = ownedByTmdb[String(part.tmdb_id)];
      if (byId) return byId;
      const candidates = ownedByTitle[normalizeTitleText(part.title)] || [];
      if (!candidates.length) return null;
      return (
        candidates.find(
          (m) =>
            !part.release_year ||
            !m.release_year ||
            Math.abs(m.release_year - part.release_year) <= 1
        ) || null
      );
    }

    const parts = collection.parts || [];
    const matched = new Set();

    // Titels die jij onder dezelfde reeksnaam hebt gezet maar die TMDb niet in
    // deze collectie heeft — bijvoorbeeld een andere uitgave of een deel dat
    // TMDb elders onderbrengt.
    const sagaName = sagaOf(item);
    const extras = state.all.filter((m) => {
      if (sagaOf(m) !== sagaName) return false;
      return !parts.some((p) => findMine(p) === m);
    });

    const ownedCount =
      parts.filter((p) => {
        const mine = findMine(p);
        return mine && !mine.wishlist;
      }).length + extras.filter((m) => !m.wishlist).length;

    progressEl.textContent = `${ownedCount}/${parts.length + extras.length} in bezit`;

    listEl.innerHTML = parts
      .map((p) => {
        const mine = findMine(p);
        if (mine) matched.add(mine.id);
        const owned = mine && !mine.wishlist;
        const onWishlist = mine && mine.wishlist;
        const year = p.release_year || '—';

        let right;
        let checkbox = '<span class="w-4 shrink-0"></span>';
        if (owned) {
          right = '<span class="font-mono text-xs text-teal">✓ in bezit</span>';
        } else if (onWishlist) {
          right = '<span class="font-mono text-xs text-gold">verlanglijst</span>';
        } else {
          // Ontbrekend deel: aanvinken om samen op de verlanglijst te zetten,
          // of los toevoegen via de twee knoppen.
          checkbox = `<input type="checkbox" class="w-4 h-4 shrink-0 cursor-pointer" data-saga-pick="${escapeAttr(
            p.tmdb_id
          )}" title="Aanvinken om samen op de verlanglijst te zetten">`;
          right = `
            <span class="flex gap-2 shrink-0">
              <button type="button" class="text-gold hover:text-white text-xs underline" data-saga-add="${escapeAttr(p.tmdb_id)}">+ wens</button>
              <button type="button" class="text-teal hover:text-white text-xs underline" data-saga-own="${escapeAttr(p.tmdb_id)}">+ in bezit…</button>
            </span>`;
        }

        return `
          <div class="flex items-center gap-2 text-sm ${owned ? '' : 'opacity-75'}">
            ${checkbox}
            <span class="flex-1 min-w-0 truncate">${escapeHtml(p.title)} <span class="text-muted font-mono text-xs">(${year})</span></span>
            <span class="shrink-0">${right}</span>
          </div>`;
      })
      .join('') +
      (extras.length
        ? `<div class="pt-2 mt-2 border-t border-white/5">
             <p class="text-[11px] text-muted mb-1">Ook door jou bij deze reeks gezet:</p>
             ${extras
               .map(
                 (m) => `
                   <div class="flex items-center justify-between gap-2 text-sm">
                     <span class="truncate min-w-0">${escapeHtml(m.title)} <span class="text-muted font-mono text-xs">(${
                   m.release_year || '—'
                 })</span></span>
                     <span class="shrink-0 font-mono text-xs ${m.wishlist ? 'text-gold' : 'text-teal'}">${
                   m.wishlist ? 'verlanglijst' : '✓ in bezit'
                 }</span>
                   </div>`
               )
               .join('')}
           </div>`
        : '');

    listEl.querySelectorAll('[data-saga-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const part = parts.find((p) => String(p.tmdb_id) === btn.dataset.sagaAdd);
        if (part) addSagaPartToWishlist(part, btn);
      });
    });

    // Aanvinken van ontbrekende delen om ze samen op de verlanglijst te zetten.
    sagaBulkSelection = [];
    const missingParts = parts.filter((p) => {
      const mine = findMine(p);
      return !mine;
    });
    updateSagaBulkBar();

    listEl.querySelectorAll('[data-saga-pick]').forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const part = missingParts.find((p) => String(p.tmdb_id) === cb.dataset.sagaPick);
        if (!part) return;
        if (cb.checked) sagaBulkSelection.push(part);
        else sagaBulkSelection = sagaBulkSelection.filter((x) => String(x.tmdb_id) !== cb.dataset.sagaPick);
        updateSagaBulkBar();
      });
    });

    // Volledig toevoegformulier openen voor een ontbrekend deel.
    listEl.querySelectorAll('[data-saga-own]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        // Stil terugkeren maakt de knop 'dood' zonder uitleg — liever zeggen
        // wat eraan scheelt.
        if (typeof addTitleOpenForTmdb !== 'function') {
          alert(
            'Deze knop heeft een nieuwere assets/add-title.js nodig.\n\n' +
            'Upload dat bestand opnieuw en herlaad met Ctrl+Shift+R.'
          );
          return;
        }
        closeModal();
        const addModal = document.getElementById('add-title-modal');
        if (addModal) addModal.classList.remove('hidden');
        try {
          await addTitleOpenForTmdb(btn.dataset.sagaOwn, 'movie');
        } catch (err) {
          alert('Kon de gegevens niet ophalen: ' + err.message);
        }
      });
    });
  }

  // Zet een ontbrekend deel van een reeks op de verlanglijst. Haalt de volledige
  // TMDb-gegevens op zodat de titel meteen compleet in je collectie staat.
  // ---------- Meerdere reeksdelen samen op de verlanglijst ----------

  let sagaBulkSelection = [];

  function updateSagaBulkBar() {
    const bar = els.modal.querySelector('[data-field="saga-bulk-bar"]');
    const count = els.modal.querySelector('[data-field="saga-bulk-count"]');
    if (!bar || !count) return;
    const n = sagaBulkSelection.length;
    bar.classList.toggle('hidden', n === 0);
    count.textContent = `${n} aangevinkt`;
  }

  async function sagaBulkToWishlist() {
    const bar = els.modal.querySelector('[data-field="saga-bulk-bar"]');
    const status = els.modal.querySelector('[data-field="saga-bulk-status"]');
    const wishBtn = els.modal.querySelector('[data-saga-bulk-wish]');
    if (!sagaBulkSelection.length) return;

    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey) {
      status.textContent = 'TMDb-key ontbreekt.';
      status.className = 'text-[11px] font-mono text-gold';
      return;
    }

    const selection = [...sagaBulkSelection];
    if (wishBtn) wishBtn.disabled = true;

    const entries = [];
    for (let i = 0; i < selection.length; i++) {
      const part = selection[i];
      status.textContent = `(${i + 1}/${selection.length}) ${part.title}…`;
      status.className = 'text-[11px] font-mono text-muted';
      try {
        const details = await tmdbDetails(part.tmdb_id, 'movie', c.tmdbKey);
        const id = slugify(details.title, details.release_year);
        if (state.all.some((m) => m.id === id)) continue; // stond er intussen al
        const today = new Date().toISOString().slice(0, 10);
        const entry = {
          id,
          content_type: 'movie',
          date_added: today,
          watched: false,
          editions: [
            {
              eid: 'e1',
              format: 'bluray',
              notes: '',
              boxset: '',
              location: '',
              wishlist: true,
              date_added: today,
              custom_front_cover_id: '',
              custom_back_cover_id: '',
              custom_front_cover: '',
              custom_back_cover: '',
            },
          ],
          ...details,
          seasons: [],
        };
        normalizeMovieEntry(entry);
        entries.push(entry);
      } catch (err) {
        console.warn('Reeksdeel overslaan:', part.title, err);
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    if (!entries.length) {
      status.textContent = 'Niets toegevoegd (stonden er al in).';
      status.className = 'text-[11px] font-mono text-gold';
      if (wishBtn) wishBtn.disabled = false;
      return;
    }

    // Meteen in de interface, opslaan op de achtergrond.
    entries.forEach((e) => state.all.push(e));
    buildFacetChips(state.all);
    applyFilters();

    backgroundSave(
      () => upsertMoviesBatchInDrive(entries),
      () => {
        const ids = new Set(entries.map((e) => e.id));
        state.all = state.all.filter((m) => !ids.has(m.id));
      }
    );

    sagaBulkSelection = [];
    if (wishBtn) wishBtn.disabled = false;
    // Reekslijst opnieuw opbouwen zodat de nieuwe verlanglijst-status klopt.
    openModal(currentModalId);
  }

  async function addSagaPartToWishlist(part, btn) {
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey) return;

    btn.disabled = true;
    btn.textContent = 'bezig…';
    try {
      const details = await tmdbDetails(part.tmdb_id, 'movie', c.tmdbKey);
      const entry = {
        id: slugify(details.title, details.release_year),
        content_type: 'movie',
        format: 'bluray',
        wishlist: true,
        watched: false,
        notes: '',
        date_added: new Date().toISOString().slice(0, 10),
        custom_front_cover_id: '',
        custom_back_cover_id: '',
        custom_front_cover: '',
        custom_back_cover: '',
        ...details,
        seasons: [],
      };

      if (state.all.some((m) => m.id === entry.id)) {
        btn.textContent = 'stond er al';
        return;
      }

      state.all.push(entry);
      buildFacetChips(state.all);
      applyFilters();
      btn.outerHTML = '<span class="font-mono text-xs text-gold">verlanglijst</span>';

      backgroundSave(
        () => upsertMovieInDrive(entry),
        () => { state.all = state.all.filter((m) => m.id !== entry.id); }
      );
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '+ verlanglijst';
      alert('Toevoegen mislukt: ' + err.message);
    }
  }

  // Welke titel staat er op dit moment open? Nodig om trage TMDb-antwoorden
  // te kunnen negeren als je intussen al doorgeklikt bent.
  let currentModalId = null;

  function openModal(id) {
    const item = state.all.find((m) => m.id === id);
    if (!item) return;
    // Wissel je van titel, dan begint de exemplaarkeuze opnieuw.
    if (currentModalId !== id) activeEditionId = null;
    currentModalId = id;

    const ribbon = ribbonInfo(item);

    els.modal.querySelector('[data-field="title"]').textContent = item.title;
    els.modal.querySelector('[data-field="year"]').textContent = item.release_year || '—';
    els.modal.querySelector('[data-field="runtime"]').textContent = item.runtime ? item.runtime + ' min' : '—';
    els.modal.querySelector('[data-field="rating"]').textContent = item.rating ? item.rating.toFixed(1) + ' / 10' : '—';
    // Genres en regisseur zijn klikbaar: je filtert er meteen je collectie mee.
    const genresEl = els.modal.querySelector('[data-field="genres"]');
    genresEl.innerHTML = (item.genres || []).length
      ? item.genres
          .map(
            (g) =>
              `<button type="button" class="hover:text-gold underline decoration-white/20 underline-offset-2" data-filter-genre="${escapeAttr(
                g
              )}">${escapeHtml(g)}</button>`
          )
          .join(' <span class="text-muted">·</span> ')
      : '—';
    genresEl.querySelectorAll('[data-filter-genre]').forEach((btn) => {
      btn.addEventListener('click', () => applyQuickFilter('genre', btn.dataset.filterGenre));
    });

    const directorEl = els.modal.querySelector('[data-field="director"]');
    directorEl.innerHTML = item.director
      ? item.director
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
          .map(
            (n) =>
              `<button type="button" class="hover:text-gold underline decoration-white/20 underline-offset-2" data-filter-search="${escapeAttr(
                n
              )}">${escapeHtml(n)}</button>`
          )
          .join(', ')
      : '—';
    directorEl.querySelectorAll('[data-filter-search]').forEach((btn) => {
      btn.addEventListener('click', () => applyQuickFilter('search', btn.dataset.filterSearch));
    });

    fillEnrichedFields(item);
    const ed = activeEdition(item);
    els.modal.querySelector('[data-field="format"]').textContent =
      (ed ? formatLabel(ed.format) : ribbon.label) + (ed && ed.wishlist ? ' · Verlanglijst' : '');
    els.modal.querySelector('[data-field="notes"]').textContent =
      (ed && ed.notes) || 'Geen opmerkingen';
    renderEditions(item);
    els.modal.querySelector('[data-field="overview"]').textContent = item.overview || '';
    const sagaField = els.modal.querySelector('[data-field="saga"]');
    if (sagaField) sagaField.textContent = sagaOf(item) || '—';

    // Covers: standaard poster; hoesfoto-tab enkel als er eigen foto's zijn.
    modalCoverMode = 'poster';
    const tabs = els.modal.querySelector('[data-cover-tabs]');
    if (tabs) {
      tabs.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          modalCoverMode = b.dataset.coverTab;
          showModalCovers(item);
        };
      });
    }
    showModalCovers(item);

    // Klik op de cover → lightbox met de nu zichtbare afbeelding.
    const flipCard = els.modal.querySelector('.flip-card');
    flipCard.onclick = (e) => {
      if (e.target.closest('[data-flip-btn]')) return;
      const flipped = flipCard.classList.contains('flipped');
      let src;
      if (modalCoverMode === 'poster') src = modalCoverSrcs.poster;
      else src = flipped ? (modalCoverSrcs.back || modalCoverSrcs.front) : (modalCoverSrcs.front || modalCoverSrcs.poster);
      openLightbox(src, item.title);
    };

    const seasonsSection = els.modal.querySelector('[data-field="seasons-section"]');
    const seasonsList = els.modal.querySelector('[data-field="seasons-list"]');
    if (item.seasons && item.seasons.length) {
      seasonsSection.classList.remove('hidden');
      const fmtLabel = { '4k': '4K UHD', bluray: 'Blu-ray', dvd: 'DVD' };
      const fmtOption = (value, label, selected) =>
        `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`;
      seasonsList.innerHTML = item.seasons
        .map((s) => {
          if (s.owned) {
            const p = seasonProgress(item, s);
            return `
              <div class="border-b border-white/5 last:border-0 pb-2 mb-2 last:pb-0 last:mb-0">
                <div class="flex items-center justify-between text-sm gap-2">
                  <span class="truncate min-w-0">${escapeHtml(s.name)} <span class="text-muted font-mono text-xs">(${s.episode_count ?? '?'} afl.)</span></span>
                  <span class="flex items-center gap-2 shrink-0">
                    <span class="font-mono text-xs text-gold">${fmtLabel[s.format] || s.format}</span>
                    ${(() => {
                      const pi = seasonPriceInfo(item, s);
                      return pi
                        ? `<span class="font-mono text-[11px] text-teal/90" title="Richtwaarde op eBay (mediaan) met de middenrange">${escapeHtml(
                            priceRangeText(pi)
                          )}</span>`
                        : '';
                    })()}
                    <button type="button" class="text-muted hover:text-red-400 text-xs underline" data-remove-season="${s.season_number}">verwijderen</button>
                  </span>
                </div>
                <div class="flex items-center gap-2 mt-1">
                  <div class="flex-1 h-1 bg-bg rounded-full overflow-hidden">
                    <div class="h-full rounded-full ${p.pct === 100 ? 'bg-teal' : 'bg-gold'}" style="width:${p.pct}%"></div>
                  </div>
                  <span class="font-mono text-[10px] text-muted shrink-0">${p.seen}/${p.total || '?'}</span>
                  <button type="button" class="text-gold hover:text-white text-[10px] underline shrink-0" data-episodes="${s.season_number}">afleveringen ▾</button>
                </div>
                <div data-episodes-for="${s.season_number}" class="hidden mt-2 pl-1" data-open="0" data-loaded="0"></div>
              </div>
            `;
          }
          return `
            <div class="flex items-center justify-between text-sm opacity-70 gap-2">
              <span class="truncate min-w-0">${escapeHtml(s.name)} <span class="text-muted font-mono text-xs">(${s.episode_count ?? '?'} afl.)</span></span>
              <span class="flex items-center gap-2 shrink-0">
                <select class="add-season-format bg-surface border border-white/10 rounded px-2 py-0.5 text-xs font-mono" data-season="${s.season_number}">
                  ${fmtOption('4k', '4K UHD', 'bluray')}${fmtOption('bluray', 'Blu-ray', 'bluray')}${fmtOption('dvd', 'DVD', 'bluray')}
                </select>
                <button type="button" class="text-gold hover:text-white text-xs underline" data-add-season="${s.season_number}">in bezit</button>
              </span>
            </div>
          `;
        })
        .join('');

      // Uitklappen naar de afleveringen van een seizoen
      seasonsList.querySelectorAll('[data-episodes]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const num = Number(btn.dataset.episodes);
          const season = item.seasons.find((s) => s.season_number === num);
          const box = seasonsList.querySelector(`[data-episodes-for="${num}"]`);
          if (season && box) toggleSeasonEpisodes(item, season, box, btn);
        });
      });

      // 'Waar ben je gebleven' bovenaan de seizoenen
      const point = lastWatchedPoint(item);
      const resumeEl = els.modal.querySelector('[data-field="resume"]');
      if (resumeEl) {
        const totals = { seen: totalWatchedEpisodes(item), owned: totalOwnedEpisodes(item) };
        if (point && totals.owned) {
          resumeEl.textContent =
            totals.seen >= totals.owned
              ? `Alles gezien — ${totals.seen} afleveringen`
              : `Gebleven bij ${point.season}×${String(point.episode).padStart(2, '0')} · ${totals.seen} van ${totals.owned} gezien`;
          resumeEl.classList.remove('hidden');
        } else {
          resumeEl.classList.add('hidden');
        }
      }

      seasonsList.querySelectorAll('[data-remove-season]').forEach((btn) => {
        btn.addEventListener('click', () => handleRemoveSeason(item, Number(btn.dataset.removeSeason)));
      });
      seasonsList.querySelectorAll('[data-add-season]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const num = Number(btn.dataset.addSeason);
          const sel = seasonsList.querySelector(`.add-season-format[data-season="${num}"]`);
          handleAddSeason(item, num, sel ? sel.value : 'bluray');
        });
      });
    } else {
      seasonsSection.classList.add('hidden');
      seasonsList.innerHTML = '';
    }

    els.modal.querySelector('[data-delete-full]').onclick = () => handleDeleteTitle(item.id, item.title);

    const addEditionBtn = els.modal.querySelector('[data-add-edition]');
    if (addEditionBtn) addEditionBtn.onclick = () => handleAddEdition(item);

    // Snelle 'bekeken'-toggle (optimistic). Sinds fase 13 wordt er meteen een
    // datum bijgehouden, zodat je later ziet wanneer je iets gezien hebt.
    const watchedBtn = els.modal.querySelector('[data-toggle-watched]');
    if (watchedBtn) {
      watchedBtn.textContent = item.watched ? '✓ Bekeken — zet terug op niet bekeken' : 'Markeer als bekeken';
      watchedBtn.classList.toggle('chip-active', !!item.watched);
      watchedBtn.onclick = () => {
        const previous = { watched: item.watched, log: JSON.parse(JSON.stringify(item.watch_log || [])) };
        item.watched = !item.watched;
        if (item.watched) addWatchEntry(item);
        else item.watch_log = []; // terug op 'niet bekeken' wist ook het logboek
        applyFilters();
        openModal(item.id);
        backgroundSave(
          () => upsertMovieInDrive(item),
          () => {
            item.watched = previous.watched;
            item.watch_log = previous.log;
            if (!els.modal.classList.contains('hidden')) openModal(item.id);
          }
        );
      };
    }

    renderWatchLog(item);
    renderMyRating(item);

    // Bewerken-paneel
    const editPanel = els.modal.querySelector('[data-edit-panel]');
    const editBtn = els.modal.querySelector('[data-edit-open]');
    if (editPanel && editBtn) {
      editPanel.classList.add('hidden');
      editBtn.onclick = () => {
        editPanel.classList.toggle('hidden');
        if (!editPanel.classList.contains('hidden')) fillEditPanel(item);
      };
      els.modal.querySelector('[data-edit-cancel]').onclick = () => editPanel.classList.add('hidden');
      els.modal.querySelector('[data-edit-save]').onclick = () => saveEditPanel(item);
      const refreshBtn = els.modal.querySelector('[data-edit-refresh]');
      if (refreshBtn) refreshBtn.onclick = () => refreshTmdbData(item);
    }

    const flipBtn = els.modal.querySelector('[data-flip-btn]');
    flipBtn.onclick = (e) => {
      e.stopPropagation();
      els.modal.querySelector('.flip-card').classList.toggle('flipped');
    };

    els.modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  // ---------- Bewerken ----------

  function fillEditPanel(item) {
    const m = els.modal;
    const ed = activeEdition(item) || {};

    // Formaatkeuze opbouwen uit de gedeelde formatenlijst.
    const formatSel = m.querySelector('[data-edit-format]');
    formatSel.innerHTML = MEDIA_FORMATS.map(
      (f) => `<option value="${f.value}">${escapeHtml(f.label)}</option>`
    ).join('');

    m.querySelector('[data-edit-content]').value = item.content_type || 'movie';
    formatSel.value = ed.format || 'bluray';
    m.querySelector('[data-edit-owned]').value = ed.wishlist ? 'wishlist' : 'owned';
    m.querySelector('[data-edit-watched]').checked = !!item.watched;
    m.querySelector('[data-edit-notes]').value = ed.notes || '';
    // Uitvoeringen (steelbook, limited, extended, director's cut) worden uit
    // de gedeelde lijst opgebouwd, zodat er maar één plek is waar ze staan.
    const variantsBox = m.querySelector('[data-edit-variants]');
    if (variantsBox) {
      variantsBox.innerHTML = EDITION_VARIANTS.map(
        (v) => `
          <label class="!normal-case !text-sm text-ink flex items-center gap-2">
            <input type="checkbox" data-edit-variant="${escapeAttr(v.key)}" class="w-4 h-4"> ${escapeHtml(v.label)}
          </label>`
      ).join('');
      variantsBox.querySelectorAll('[data-edit-variant]').forEach((cb) => {
        cb.checked = !!ed[cb.dataset.editVariant];
      });
    }
    const boxsetInput = m.querySelector('[data-edit-boxset]');
    if (boxsetInput) boxsetInput.value = ed.boxset || '';
    const locationInput = m.querySelector('[data-edit-location]');
    if (locationInput) locationInput.value = ed.location || '';
    const sagaInput = m.querySelector('[data-edit-saga]');
    if (sagaInput) sagaInput.value = item.saga || '';

    // Duidelijk maken welk exemplaar je aan het bewerken bent.
    const which = m.querySelector('[data-edit-which]');
    if (which) {
      which.textContent =
        (item.editions || []).length > 1 ? `je ${formatLabel(ed.format)}-exemplaar` : '';
    }

    m.querySelector('[data-edit-front]').value = '';
    m.querySelector('[data-edit-back]').value = '';
    const remFront = m.querySelector('[data-edit-remove-front]');
    const remBack = m.querySelector('[data-edit-remove-back]');
    remFront.checked = false;
    remBack.checked = false;
    remFront.closest('label').classList.toggle('hidden', !frontCoverRef(item, ed));
    remBack.closest('label').classList.toggle('hidden', !backCoverRef(item, ed));
    const status = m.querySelector('[data-edit-status]');
    status.textContent = '';
    status.className = 'text-sm font-mono';
    setupPosterPicker(item);
  }

  // ---------- Posterkeuze ----------
  // Je kan een andere TMDb-poster kiezen dan de standaard, bv. de artwork die
  // op jouw editie staat. De keuze wordt pas bewaard bij 'Opslaan'.
  let pendingPosterPath = null; // null = onveranderd, '' = terug naar standaard

  function setupPosterPicker(item) {
    const m = els.modal;
    const loadBtn = m.querySelector('[data-edit-poster-load]');
    const resetBtn = m.querySelector('[data-edit-poster-reset]');
    const grid = m.querySelector('[data-edit-poster-grid]');
    const statusEl = m.querySelector('[data-edit-poster-status]');
    if (!loadBtn || !grid) return;

    pendingPosterPath = null;
    grid.innerHTML = '';
    grid.classList.add('hidden');
    statusEl.textContent = item.custom_poster_path ? 'eigen poster gekozen' : '';
    resetBtn.classList.toggle('hidden', !item.custom_poster_path);

    resetBtn.onclick = () => {
      pendingPosterPath = '';
      statusEl.textContent = 'terug naar standaard bij opslaan';
      grid.querySelectorAll('[data-poster-option]').forEach((el) => el.classList.remove('ring-2', 'ring-gold'));
    };

    loadBtn.onclick = async () => {
      const c = typeof getConfig === 'function' ? getConfig() : {};
      if (!c.tmdbKey || typeof tmdbPosters !== 'function') {
        statusEl.textContent = 'TMDb-key ontbreekt';
        return;
      }
      if (!item.tmdb_id) {
        statusEl.textContent = 'geen TMDb-koppeling';
        return;
      }
      loadBtn.disabled = true;
      statusEl.textContent = 'posters ophalen…';
      try {
        const posters = await tmdbPosters(item.tmdb_id, item.content_type === 'tv' ? 'tv' : 'movie', c.tmdbKey);
        if (!posters.length) {
          statusEl.textContent = 'geen alternatieve posters gevonden';
          return;
        }
        grid.classList.remove('hidden');
        // Vaste hoogtes in plaats van aspect-ratio: dat laatste liep op smalle
        // schermen over elkaar heen. Minder kolommen op gsm, zodat elke poster
        // groot genoeg blijft om te herkennen.
        grid.innerHTML = posters
          .map(
            (p) => `
              <button type="button" data-poster-option="${escapeAttr(p.file_path)}"
                class="block w-full h-32 sm:h-36 rounded overflow-hidden bg-bg ring-1 ring-white/10 ${
                  item.custom_poster_path === p.file_path ? 'ring-2 ring-gold' : ''
                }" title="Poster${p.language ? ' (' + escapeAttr(p.language) + ')' : ''}">
                <img src="${escapeAttr('https://image.tmdb.org/t/p/w185' + p.file_path)}" loading="lazy"
                  class="block w-full h-full object-contain bg-black/30" alt="Poster">
              </button>`
          )
          .join('');
        statusEl.textContent = `${posters.length} posters — klik om te kiezen`;

        grid.querySelectorAll('[data-poster-option]').forEach((btn) => {
          btn.addEventListener('click', () => {
            pendingPosterPath = btn.dataset.posterOption;
            grid.querySelectorAll('[data-poster-option]').forEach((el) => el.classList.remove('ring-2', 'ring-gold'));
            btn.classList.add('ring-2', 'ring-gold');
            statusEl.textContent = 'gekozen — klik Opslaan om te bewaren';
          });
        });
      } catch (err) {
        statusEl.textContent = '✗ ' + err.message;
      } finally {
        loadBtn.disabled = false;
      }
    };
  }

  async function saveEditPanel(item) {
    const m = els.modal;
    const saveBtn = m.querySelector('[data-edit-save]');
    const status = m.querySelector('[data-edit-status]');
    saveBtn.disabled = true;

    const ed = activeEdition(item);
    if (!ed) return;

    const previous = {
      content_type: item.content_type,
      watched: item.watched,
      saga: item.saga,
      custom_poster_path: item.custom_poster_path,
      editions: JSON.parse(JSON.stringify(item.editions || [])),
    };

    try {
      // Foto's verwerken (dit deel blijft zichtbaar 'bezig': uploads kosten even)
      const frontFile = m.querySelector('[data-edit-front]').files[0];
      const backFile = m.querySelector('[data-edit-back]').files[0];
      // Hoesfoto's horen bij dít exemplaar; de bestandsnaam bevat daarom ook
      // het exemplaar-id, zodat een DVD- en een 4K-doosje elkaar niet
      // overschrijven.
      const coverKey = item.id + '-' + ed.eid;
      if (frontFile) {
        status.textContent = 'Voorkant-foto uploaden...';
        status.className = 'text-sm font-mono text-muted';
        ed.custom_front_cover_id = await driveUploadCoverFile(await resizeImageFile(frontFile, 1200), coverKey, 'front');
        ed.custom_front_cover = '';
        if (typeof _coverUrlCache !== 'undefined') delete _coverUrlCache[ed.custom_front_cover_id];
      } else if (m.querySelector('[data-edit-remove-front]').checked) {
        await driveDeleteCoverFile(ed.custom_front_cover_id);
        ed.custom_front_cover_id = '';
        ed.custom_front_cover = '';
      }
      if (backFile) {
        status.textContent = 'Achterkant-foto uploaden...';
        status.className = 'text-sm font-mono text-muted';
        ed.custom_back_cover_id = await driveUploadCoverFile(await resizeImageFile(backFile, 1200), coverKey, 'back');
        ed.custom_back_cover = '';
        if (typeof _coverUrlCache !== 'undefined') delete _coverUrlCache[ed.custom_back_cover_id];
      } else if (m.querySelector('[data-edit-remove-back]').checked) {
        await driveDeleteCoverFile(ed.custom_back_cover_id);
        ed.custom_back_cover_id = '';
        ed.custom_back_cover = '';
      }

      // Velden: meteen doorvoeren in de interface, opslaan op de achtergrond.
      // Filmniveau:
      item.content_type = m.querySelector('[data-edit-content]').value;
      item.watched = m.querySelector('[data-edit-watched]').checked;
      const sagaInput = m.querySelector('[data-edit-saga]');
      if (sagaInput) item.saga = sagaInput.value.trim();

      // Exemplaarniveau:
      ed.format = m.querySelector('[data-edit-format]').value;
      ed.wishlist = m.querySelector('[data-edit-owned]').value === 'wishlist';
      ed.notes = m.querySelector('[data-edit-notes]').value.trim();
      m.querySelectorAll('[data-edit-variant]').forEach((cb) => {
        ed[cb.dataset.editVariant] = cb.checked;
      });
      const boxsetInput = m.querySelector('[data-edit-boxset]');
      if (boxsetInput) ed.boxset = boxsetInput.value.trim();
      const locationInput = m.querySelector('[data-edit-location]');
      if (locationInput) ed.location = locationInput.value.trim();

      syncLegacyFieldsFromEditions(item);
      // Posterkeuze: null = niets veranderd, '' = terug naar de standaardposter.
      if (pendingPosterPath !== null) item.custom_poster_path = pendingPosterPath;

      buildFacetChips(state.all);
      applyFilters();
      openModal(item.id);

      backgroundSave(
        () => upsertMovieInDrive(item),
        () => {
          Object.assign(item, previous);
          syncLegacyFieldsFromEditions(item);
          if (!els.modal.classList.contains('hidden')) openModal(item.id);
        }
      );
    } catch (err) {
      Object.assign(item, previous);
      syncLegacyFieldsFromEditions(item);
      status.textContent = '✗ ' + err.message;
      status.className = 'text-sm font-mono text-red-400';
    } finally {
      saveBtn.disabled = false;
    }
  }

  // Haalt de nieuwste TMDb-gegevens op (incl. officiële reeks) en werkt de
  // titel bij — persoonlijke velden (status, notities, foto's, seizoensbezit)
  // blijven onaangeroerd.
  async function refreshTmdbData(item) {
    const m = els.modal;
    const status = m.querySelector('[data-edit-status]');
    if (typeof tmdbDetails !== 'function' || typeof getConfig !== 'function') return;
    const c = getConfig();
    if (!c.tmdbKey) {
      status.textContent = 'Vul eerst je TMDb-key in via Instellingen (Beheer).';
      status.className = 'text-sm font-mono text-gold';
      return;
    }
    if (!item.tmdb_id) {
      status.textContent = 'Geen TMDb-koppeling voor deze titel.';
      status.className = 'text-sm font-mono text-gold';
      return;
    }
    status.textContent = 'TMDb-gegevens ophalen...';
    status.className = 'text-sm font-mono text-muted';
    try {
      const mediaType = item.content_type === 'tv' ? 'tv' : 'movie';
      const fresh = await tmdbDetails(item.tmdb_id, mediaType, c.tmdbKey);

      // Samenvoegen gebeurt centraal in admin.js: TMDb-velden worden ververst,
      // persoonlijke keuzes (formaat, notities, foto's, seizoensbezit,
      // posterkeuze) blijven staan.
      applyTmdbFields(item, fresh);

      buildFacetChips(state.all);
      applyFilters();
      openModal(item.id);
      const panel = m.querySelector('[data-edit-panel]');
      panel.classList.remove('hidden');
      fillEditPanel(item);
      m.querySelector('[data-edit-status]').textContent = '✓ Gegevens ververst — klik Opslaan om te bewaren.';
      m.querySelector('[data-edit-status]').className = 'text-sm font-mono text-teal';
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.className = 'text-sm font-mono text-red-400';
    }
  }

  function closeModal() {
    currentModalId = null;
    els.modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  // ---------- Events ----------

  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.filterPanel && els.filterPanel.classList.contains('filter-open')) {
        setFilterPanel(false);
        return;
      }
      if (els.lightbox && !els.lightbox.classList.contains('hidden')) closeLightbox();
      else if (els.episodeModal && !els.episodeModal.classList.contains('hidden')) closeEpisodeModal();
      else if (els.pickModal && !els.pickModal.classList.contains('hidden')) closePickModal();
      else if (els.dupesModal && !els.dupesModal.classList.contains('hidden')) closeDupesModal();
      else if (els.personModal && !els.personModal.classList.contains('hidden')) closePersonModal();
      else if (els.groupModal && !els.groupModal.classList.contains('hidden')) closeGroupModal();
      else closeModal();
    }
  });

  els.search.addEventListener('input', (e) => {
    state.search = e.target.value;
    applyFilters();
  });

  els.sort.addEventListener('change', (e) => {
    state.sort = e.target.value;
    applyFilters();
  });

  // De formaatchips worden dynamisch opgebouwd in buildFormatChips().

  els.typeChips.querySelectorAll('[data-type]').forEach((chip) => {
    chip.addEventListener('click', () => {
      toggleSetValue(state.activeTypes, chip.dataset.type);
      chip.classList.toggle('chip-active');
      applyFilters();
    });
  });

  if (els.statusChips) {
    els.statusChips.querySelectorAll('[data-status]').forEach((chip) => {
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeStatus, chip.dataset.status);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
    });
  }

  if (els.watchedChips) {
    els.watchedChips.querySelectorAll('[data-watched]').forEach((chip) => {
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeWatched, chip.dataset.watched);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
    });
  }

  if (els.viewChips) {
    els.viewChips.querySelectorAll('[data-view]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prev = state.view;
        state.view = chip.dataset.view;
        // Wissel je vanuit een andere weergave naar de plank, laat die dan
        // meespringen naar de titel die je op dat moment in beeld had.
        if (state.view === 'shelf' && prev !== 'shelf') captureShelfAnchor();
        // Verlaat je de plank, onthoud dan de gecentreerde titel zodat het
        // raster daarop uitkomt in plaats van bovenaan te herstarten.
        if (prev === 'shelf' && state.view !== 'shelf') {
          const u = shelfUnits[shelfActive];
          gridAnchor = u
            ? u.type === 'group'
              ? { id: null, group: u.saga }
              : { id: u.item.id, group: null }
            : null;
        }
        try {
          localStorage.setItem(VIEW_STORAGE_KEY, state.view);
        } catch {
          // Voorkeur niet kunnen bewaren is niet erg; de weergave werkt gewoon.
        }
        state.visibleCount = pageSizeForView(state.view);
        render();
      });
    });
    applyViewClasses();
  }

  // Plank-navigatie: pijlknoppen, pijltjestoetsen en herberekenen bij resize.
  if (els.shelfStage) {
    const prev = els.shelfStage.querySelector('[data-shelf-prev]');
    const next = els.shelfStage.querySelector('[data-shelf-next]');
    if (prev) prev.addEventListener('click', () => shelfStep(-1));
    if (next) next.addEventListener('click', () => shelfStep(1));
    document.addEventListener('keydown', (e) => {
      if (state.view !== 'shelf') return;
      // Niet kapen terwijl je in een invoerveld of een open pop-up zit.
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const anyModalOpen = [els.modal, els.personModal, els.episodeModal, els.pickModal, els.dupesModal]
        .some((m) => m && !m.classList.contains('hidden'));
      if (anyModalOpen) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); shelfStep(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); shelfStep(1); }
    });
    let shelfResizeTimer = null;
    window.addEventListener('resize', () => {
      if (state.view !== 'shelf') return;
      clearTimeout(shelfResizeTimer);
      shelfResizeTimer = setTimeout(updateShelf, 120);
    });
  }

  if (els.groupToggle) {
    els.groupToggle.addEventListener('click', () => {
      state.groupSagas = !state.groupSagas;
      els.groupToggle.classList.toggle('chip-active', state.groupSagas);
      applyFilters();
    });
  }

  els.loadMore.addEventListener('click', () => {
    state.visibleCount += pageSizeForView(state.view);
    render();
  });
}
