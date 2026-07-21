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
const VALID_VIEWS = ['grid', 'compact', 'text'];

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
  return view === 'text' ? 400 : view === 'compact' ? 150 : PAGE_SIZE;
}

function initCollectionApp(config) {
  const state = {
    all: [],
    filtered: [],
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
    statusChips: document.getElementById('status-chips'),
    watchedChips: document.getElementById('watched-chips'),
    letterChips: document.getElementById('letter-chips'),
    groupToggle: document.getElementById('group-sagas-toggle'),
    viewChips: document.getElementById('view-chips'),
    personModal: document.getElementById('person-modal'),
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

  // Boxsets: enkel tonen als je er ook echt gebruik van maakt.
  function buildBoxsetChips(data) {
    if (!els.boxsetChips) return;
    const counts = {};
    data.forEach((item) => {
      const boxes = new Set(
        (item.editions || []).map((e) => (e.boxset || '').trim()).filter(Boolean)
      );
      boxes.forEach((b) => {
        counts[b] = (counts[b] || 0) + 1;
      });
    });
    const values = Object.keys(counts).sort((a, b) => a.localeCompare(b));

    if (els.boxsetRow) {
      els.boxsetRow.classList.toggle('hidden', values.length === 0);
      if (values.length) els.boxsetRow.classList.add('flex');
    }

    els.boxsetChips.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeBoxsets.has(value) ? ' chip-active' : '');
      chip.textContent = value;
      chip.title = `${counts[value]} titel(s)`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeBoxsets, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.boxsetChips.appendChild(chip);
    });

    [...state.activeBoxsets].forEach((v) => {
      if (!values.includes(v)) state.activeBoxsets.delete(v);
    });
  }

  // Alle chips die uit de data zelf worden afgeleid, in één keer opnieuw opbouwen.
  function buildFacetChips(data) {
    buildFormatChips(data);
    buildGenreChips(data);
    buildDecadeChips(data);
    buildCertChips(data);
    buildBoxsetChips(data);
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
      if (state.activeTypes.size && !state.activeTypes.has(item.content_type)) return false;
      if (state.activeGenres.size) {
        const hasGenre = (item.genres || []).some((g) => state.activeGenres.has(g));
        if (!hasGenre) return false;
      }
      if (state.activeStatus.size) {
        const status = item.wishlist ? 'wishlist' : 'owned';
        if (!state.activeStatus.has(status)) return false;
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
    state.visibleCount = pageSizeForView(state.view);
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
      case 'year_desc':
        return copy.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
      case 'year_asc':
        return copy.sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
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
  const VIEW_CONTAINER_CLASSES = {
    grid: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8',
    compact: 'flex flex-col divide-y divide-white/5',
    text: 'flex flex-col divide-y divide-white/5',
  };

  function applyViewClasses() {
    els.grid.className = VIEW_CONTAINER_CLASSES[state.view] || VIEW_CONTAINER_CLASSES.grid;
    if (els.viewChips) {
      els.viewChips.querySelectorAll('[data-view]').forEach((chip) => {
        chip.classList.toggle('chip-active', chip.dataset.view === state.view);
      });
    }
  }

  function render() {
    const units = buildRenderUnits();
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

  function ribbonInfo(item) {
    const formats = ownedFormats(item);
    if (formats.length > 1) return { label: 'Gemengd', cls: '', formats };
    const f = formats[0] || (item.editions && item.editions[0] && item.editions[0].format) || item.format;
    const cls = f === '4k' ? 'ribbon-4k' : f === 'bluray' || f === 'bluray3d' ? 'ribbon-bluray' : 'ribbon-dvd';
    return { label: formatLabel(f), cls, formats: formats.length ? formats : [f] };
  }

  // Lintjes op de poster: één per formaat dat je bezit, onder elkaar.
  function ribbonsHtml(item) {
    const formats = ownedFormats(item);
    const list = formats.length ? formats : allFormats(item);
    return list
      .slice(0, 3)
      .map(
        (f, i) =>
          `<span class="ribbon" style="background:${formatColor(f)};color:#14141A;top:${
            0.5 + i * 1.35
          }rem">${escapeHtml(formatShort(f))}</span>`
      )
      .join('');
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
      <div data-open-id="${escapeHtml(item.id)}" class="case-card group text-left cursor-pointer" role="button" tabindex="0">
        <div class="relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] shadow-lg ring-1 ring-white/5 group-hover:ring-[#C9A227]/40 transition">
          ${
            cover
              ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(item.title)}" loading="lazy"
                   class="w-full h-full object-cover"
                   onerror="this.replaceWith(posterFallback('${escapeAttr(item.title)}'))">`
              : posterFallbackHtml(item.title)
          }
          ${ribbonsHtml(item)}
          ${item.watched ? '<span class="watched-dot" title="Bekeken"></span>' : ''}
          ${
            seasonBadge
              ? `<span class="season-badge ${seasonBadge.complete ? '' : 'season-badge-partial'}" title="${seasonBadge.text} seizoenen in bezit">${seasonBadge.text}</span>`
              : ''
          }
          ${item.wishlist ? '<span class="wish-banner">Verlanglijst</span>' : ''}
          <button type="button" class="delete-btn" data-delete-id="${escapeAttr(item.id)}" data-delete-title="${escapeAttr(item.title)}" title="Verwijderen uit collectie" aria-label="Verwijderen uit collectie">&times;</button>
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
      <div data-open-group="${escapeAttr(unit.saga)}" class="case-card group text-left cursor-pointer" role="button" tabindex="0">
        <div class="relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] shadow-lg ring-1 ring-white/5 group-hover:ring-[#C9A227]/40 transition saga-stack">
          ${
            cover
              ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(unit.saga)}" loading="lazy" class="w-full h-full object-cover">`
              : posterFallbackHtml(unit.saga)
          }
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
        const bits = [];
        if (e.steelbook) bits.push('Steelbook');
        if (e.boxset) bits.push(escapeHtml(e.boxset));
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

    const ownedByTmdb = {};
    state.all.forEach((m) => {
      if (m.tmdb_id) ownedByTmdb[String(m.tmdb_id)] = m;
    });

    const parts = collection.parts || [];
    const ownedCount = parts.filter((p) => {
      const mine = ownedByTmdb[String(p.tmdb_id)];
      return mine && !mine.wishlist;
    }).length;

    progressEl.textContent = `${ownedCount}/${parts.length} in bezit`;

    listEl.innerHTML = parts
      .map((p) => {
        const mine = ownedByTmdb[String(p.tmdb_id)];
        const owned = mine && !mine.wishlist;
        const onWishlist = mine && mine.wishlist;
        const year = p.release_year || '—';

        let right;
        if (owned) {
          right = '<span class="font-mono text-xs text-teal">✓ in bezit</span>';
        } else if (onWishlist) {
          right = '<span class="font-mono text-xs text-gold">verlanglijst</span>';
        } else {
          right = `<button type="button" class="text-gold hover:text-white text-xs underline" data-saga-add="${escapeAttr(p.tmdb_id)}">+ verlanglijst</button>`;
        }

        return `
          <div class="flex items-center justify-between gap-2 text-sm ${owned ? '' : 'opacity-75'}">
            <span class="truncate min-w-0">${escapeHtml(p.title)} <span class="text-muted font-mono text-xs">(${year})</span></span>
            <span class="shrink-0">${right}</span>
          </div>`;
      })
      .join('');

    listEl.querySelectorAll('[data-saga-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const part = parts.find((p) => String(p.tmdb_id) === btn.dataset.sagaAdd);
        if (part) addSagaPartToWishlist(part, btn);
      });
    });
  }

  // Zet een ontbrekend deel van een reeks op de verlanglijst. Haalt de volledige
  // TMDb-gegevens op zodat de titel meteen compleet in je collectie staat.
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
    els.modal.querySelector('[data-field="director"]').textContent = item.director || '—';
    els.modal.querySelector('[data-field="genres"]').textContent = (item.genres || []).join(' · ') || '—';

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
            return `
              <div class="flex items-center justify-between text-sm">
                <span class="truncate min-w-0">${escapeHtml(s.name)} <span class="text-muted font-mono text-xs">(${s.episode_count ?? '?'} afl.)</span></span>
                <span class="flex items-center gap-2 shrink-0">
                  <span class="font-mono text-xs text-gold">${fmtLabel[s.format] || s.format}</span>
                  <button type="button" class="text-muted hover:text-red-400 text-xs underline" data-remove-season="${s.season_number}">verwijderen</button>
                </span>
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

    // Snelle 'bekeken'-toggle (optimistic)
    const watchedBtn = els.modal.querySelector('[data-toggle-watched]');
    if (watchedBtn) {
      watchedBtn.textContent = item.watched ? '✓ Bekeken — zet terug op niet bekeken' : 'Markeer als bekeken';
      watchedBtn.classList.toggle('chip-active', !!item.watched);
      watchedBtn.onclick = () => {
        const previous = item.watched;
        item.watched = !item.watched;
        applyFilters();
        openModal(item.id);
        backgroundSave(
          () => upsertMovieInDrive(item),
          () => { item.watched = previous; if (!els.modal.classList.contains('hidden')) openModal(item.id); }
        );
      };
    }

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
    const steelbook = m.querySelector('[data-edit-steelbook]');
    if (steelbook) steelbook.checked = !!ed.steelbook;
    const boxsetInput = m.querySelector('[data-edit-boxset]');
    if (boxsetInput) boxsetInput.value = ed.boxset || '';
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
        grid.innerHTML = posters
          .map(
            (p) => `
              <button type="button" data-poster-option="${escapeAttr(p.file_path)}"
                class="rounded overflow-hidden aspect-[2/3] bg-bg ring-1 ring-white/10 ${
                  item.custom_poster_path === p.file_path ? 'ring-2 ring-gold' : ''
                }">
                <img src="${escapeAttr('https://image.tmdb.org/t/p/w185' + p.file_path)}" loading="lazy" class="w-full h-full object-cover" alt="Poster${p.language ? ' (' + escapeAttr(p.language) + ')' : ''}">
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
      const steelbook = m.querySelector('[data-edit-steelbook]');
      if (steelbook) ed.steelbook = steelbook.checked;
      const boxsetInput = m.querySelector('[data-edit-boxset]');
      if (boxsetInput) ed.boxset = boxsetInput.value.trim();

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
      if (els.lightbox && !els.lightbox.classList.contains('hidden')) closeLightbox();
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
        state.view = chip.dataset.view;
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
