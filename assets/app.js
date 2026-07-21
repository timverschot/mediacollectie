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
const PAGE_SIZE = 60;

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
    activeLetter: null,        // 'A'..'Z' of '#'
    groupSagas: false,
    sort: 'date_added_desc',
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
    statusChips: document.getElementById('status-chips'),
    watchedChips: document.getElementById('watched-chips'),
    letterChips: document.getElementById('letter-chips'),
    groupToggle: document.getElementById('group-sagas-toggle'),
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

  function posterUrl(item) {
    return item.poster_path ? POSTER_BASE + item.poster_path : '';
  }

  function frontCoverRef(item) {
    // Nieuw: los Drive-bestand (id). Oud (nog niet gemigreerd): data-URL.
    if (item.custom_front_cover_id) return { fileId: item.custom_front_cover_id };
    if (item.custom_front_cover) return { dataUrl: item.custom_front_cover };
    return null;
  }
  function backCoverRef(item) {
    if (item.custom_back_cover_id) return { fileId: item.custom_back_cover_id };
    if (item.custom_back_cover) return { dataUrl: item.custom_back_cover };
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

  // Alle chips die uit de data zelf worden afgeleid, in één keer opnieuw opbouwen.
  function buildFacetChips(data) {
    buildGenreChips(data);
    buildDecadeChips(data);
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
        const inCast = (item.cast || []).some((name) => name.toLowerCase().includes(q));
        const inDirector = (item.director || '').toLowerCase().includes(q);
        const inSaga = sagaOf(item).toLowerCase().includes(q);
        if (!inTitle && !inCast && !inDirector && !inSaga) return false;
      }
      if (state.activeFormats.size && !state.activeFormats.has(item.format)) return false;
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
      if (state.activeLetter && firstLetter(item) !== state.activeLetter) return false;
      return true;
    });

    list = sortList(list, state.sort);
    state.filtered = list;
    state.visibleCount = PAGE_SIZE;
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

  function render() {
    const units = buildRenderUnits();
    const visible = units.slice(0, state.visibleCount);
    const wishCount = state.filtered.filter((i) => i.wishlist).length;

    els.count.textContent =
      state.filtered.length + ' titel' + (state.filtered.length === 1 ? '' : 's') +
      (wishCount ? ` · ${wishCount} verlanglijst` : '');
    els.empty.classList.toggle('hidden', state.filtered.length !== 0);
    els.loadMore.classList.toggle('hidden', state.visibleCount >= units.length);

    els.grid.innerHTML = visible
      .map((u) => (u.type === 'group' ? groupCardTemplate(u) : cardTemplate(u.item)))
      .join('');

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

  function ribbonInfo(item) {
    const labels = { '4k': '4K UHD', bluray: 'Blu-ray', dvd: 'DVD' };
    const classes = { '4k': 'ribbon-4k', bluray: 'ribbon-bluray', dvd: 'ribbon-dvd' };
    if (item.seasons && item.seasons.length) {
      const owned = [...new Set(item.seasons.filter((s) => s.owned).map((s) => s.format))];
      if (owned.length === 1) return { label: labels[owned[0]] || owned[0], cls: classes[owned[0]] || '' };
      if (owned.length > 1) return { label: 'Gemengd', cls: '' };
    }
    return { label: labels[item.format] || item.format, cls: classes[item.format] || '' };
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
    const ribbon = ribbonInfo(item);
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
          <span class="ribbon ${ribbon.cls}">${ribbon.label}</span>
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
    const hasCustom = !!(frontCoverRef(item) || backCoverRef(item));
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
      // Hoesfoto's: voorkant (of poster als er geen voorkant-foto is) + evt. achterkant
      const frontRef = frontCoverRef(item);
      const backRef = backCoverRef(item);
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

  function openModal(id) {
    const item = state.all.find((m) => m.id === id);
    if (!item) return;

    const ribbon = ribbonInfo(item);

    els.modal.querySelector('[data-field="title"]').textContent = item.title;
    els.modal.querySelector('[data-field="year"]').textContent = item.release_year || '—';
    els.modal.querySelector('[data-field="runtime"]').textContent = item.runtime ? item.runtime + ' min' : '—';
    els.modal.querySelector('[data-field="rating"]').textContent = item.rating ? item.rating.toFixed(1) + ' / 10' : '—';
    els.modal.querySelector('[data-field="director"]').textContent = item.director || '—';
    els.modal.querySelector('[data-field="cast"]').textContent = (item.cast || []).join(', ') || '—';
    els.modal.querySelector('[data-field="genres"]').textContent = (item.genres || []).join(' · ') || '—';
    els.modal.querySelector('[data-field="format"]').textContent = ribbon.label + (item.wishlist ? ' · Verlanglijst' : '');
    els.modal.querySelector('[data-field="notes"]').textContent = item.notes || 'Geen opmerkingen';
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
                <span>${escapeHtml(s.name)} <span class="text-muted font-mono text-xs">(${s.episode_count ?? '?'} afl.)</span></span>
                <span class="flex items-center gap-2">
                  <span class="font-mono text-xs text-gold">${fmtLabel[s.format] || s.format}</span>
                  <button type="button" class="text-muted hover:text-red-400 text-xs underline" data-remove-season="${s.season_number}">verwijderen</button>
                </span>
              </div>
            `;
          }
          return `
            <div class="flex items-center justify-between text-sm opacity-70">
              <span>${escapeHtml(s.name)} <span class="text-muted font-mono text-xs">(${s.episode_count ?? '?'} afl.)</span></span>
              <span class="flex items-center gap-2">
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
    m.querySelector('[data-edit-content]').value = item.content_type || 'movie';
    m.querySelector('[data-edit-format]').value = item.format || 'bluray';
    m.querySelector('[data-edit-owned]').value = item.wishlist ? 'wishlist' : 'owned';
    m.querySelector('[data-edit-watched]').checked = !!item.watched;
    m.querySelector('[data-edit-notes]').value = item.notes || '';
    const sagaInput = m.querySelector('[data-edit-saga]');
    if (sagaInput) sagaInput.value = item.saga || '';
    m.querySelector('[data-edit-front]').value = '';
    m.querySelector('[data-edit-back]').value = '';
    const remFront = m.querySelector('[data-edit-remove-front]');
    const remBack = m.querySelector('[data-edit-remove-back]');
    remFront.checked = false;
    remBack.checked = false;
    remFront.closest('label').classList.toggle('hidden', !frontCoverRef(item));
    remBack.closest('label').classList.toggle('hidden', !backCoverRef(item));
    const status = m.querySelector('[data-edit-status]');
    status.textContent = '';
    status.className = 'text-sm font-mono';
  }

  async function saveEditPanel(item) {
    const m = els.modal;
    const saveBtn = m.querySelector('[data-edit-save]');
    const status = m.querySelector('[data-edit-status]');
    saveBtn.disabled = true;

    const previous = {
      content_type: item.content_type,
      format: item.format,
      wishlist: item.wishlist,
      watched: item.watched,
      notes: item.notes,
      saga: item.saga,
      custom_front_cover: item.custom_front_cover,
      custom_back_cover: item.custom_back_cover,
      custom_front_cover_id: item.custom_front_cover_id,
      custom_back_cover_id: item.custom_back_cover_id,
    };

    try {
      // Foto's verwerken (dit deel blijft zichtbaar 'bezig': uploads kosten even)
      const frontFile = m.querySelector('[data-edit-front]').files[0];
      const backFile = m.querySelector('[data-edit-back]').files[0];
      if (frontFile) {
        status.textContent = 'Voorkant-foto uploaden...';
        status.className = 'text-sm font-mono text-muted';
        item.custom_front_cover_id = await driveUploadCoverFile(await resizeImageFile(frontFile, 1200), item.id, 'front');
        item.custom_front_cover = '';
        if (typeof _coverUrlCache !== 'undefined') delete _coverUrlCache[item.custom_front_cover_id];
      } else if (m.querySelector('[data-edit-remove-front]').checked) {
        await driveDeleteCoverFile(item.custom_front_cover_id);
        item.custom_front_cover_id = '';
        item.custom_front_cover = '';
      }
      if (backFile) {
        status.textContent = 'Achterkant-foto uploaden...';
        status.className = 'text-sm font-mono text-muted';
        item.custom_back_cover_id = await driveUploadCoverFile(await resizeImageFile(backFile, 1200), item.id, 'back');
        item.custom_back_cover = '';
        if (typeof _coverUrlCache !== 'undefined') delete _coverUrlCache[item.custom_back_cover_id];
      } else if (m.querySelector('[data-edit-remove-back]').checked) {
        await driveDeleteCoverFile(item.custom_back_cover_id);
        item.custom_back_cover_id = '';
        item.custom_back_cover = '';
      }

      // Velden: meteen doorvoeren in de interface, opslaan op de achtergrond.
      item.content_type = m.querySelector('[data-edit-content]').value;
      item.format = m.querySelector('[data-edit-format]').value;
      item.wishlist = m.querySelector('[data-edit-owned]').value === 'wishlist';
      item.watched = m.querySelector('[data-edit-watched]').checked;
      item.notes = m.querySelector('[data-edit-notes]').value.trim();
      const sagaInput = m.querySelector('[data-edit-saga]');
      if (sagaInput) item.saga = sagaInput.value.trim();

      buildFacetChips(state.all);
      applyFilters();
      openModal(item.id);

      backgroundSave(
        () => upsertMovieInDrive(item),
        () => { Object.assign(item, previous); if (!els.modal.classList.contains('hidden')) openModal(item.id); }
      );
    } catch (err) {
      Object.assign(item, previous);
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

      // Seizoensbezit behouden bij het samenvoegen van verse seizoensdata.
      if (fresh.seasons && item.seasons) {
        fresh.seasons = fresh.seasons.map((s) => {
          const old = item.seasons.find((o) => o.season_number === s.season_number);
          return old ? { ...s, owned: old.owned, format: old.format } : { ...s, owned: false, format: '' };
        });
      }

      item.title = fresh.title;
      item.release_year = fresh.release_year;
      item.poster_path = fresh.poster_path;
      item.genres = fresh.genres;
      item.director = fresh.director;
      item.cast = fresh.cast;
      item.runtime = fresh.runtime;
      item.rating = fresh.rating;
      item.overview = fresh.overview;
      if (fresh.saga) item.saga = fresh.saga;
      if (fresh.seasons) item.seasons = fresh.seasons;

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

  els.formatChips.querySelectorAll('[data-format]').forEach((chip) => {
    chip.addEventListener('click', () => {
      toggleSetValue(state.activeFormats, chip.dataset.format);
      chip.classList.toggle('chip-active');
      applyFilters();
    });
  });

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

  if (els.groupToggle) {
    els.groupToggle.addEventListener('click', () => {
      state.groupSagas = !state.groupSagas;
      els.groupToggle.classList.toggle('chip-active', state.groupSagas);
      applyFilters();
    });
  }

  els.loadMore.addEventListener('click', () => {
    state.visibleCount += PAGE_SIZE;
    render();
  });
}
