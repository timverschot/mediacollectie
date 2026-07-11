/**
 * Collection Dashboard — gedeelde motor
 * -------------------------------------
 * Deze module is bewust generiek opgezet zodat een tweede verzameling
 * (bv. strips.html) hem kan hergebruiken door enkel een ander `config`
 * object mee te geven aan initCollectionApp().
 *
 * `config.loadData` (async functie die een array teruggeeft) heeft
 * voorrang; is die niet meegegeven, dan valt de app terug op
 * `config.dataUrl` (een JSON-bestand rechtstreeks ophalen via fetch).
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
    loadMore: document.getElementById('load-more'),
    modal: document.getElementById('detail-modal'),
    modalClose: document.getElementById('modal-close'),
  };

  // Laadt (of herlaadt) de collectie. Herbruikt voor de eerste keer laden én
  // om te verversen nadat er via de '+ Titel toevoegen'-modal iets is
  // toegevoegd, zonder de hele pagina opnieuw te moeten laden.
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
      buildGenreChips(data);
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

  function toggleSetValue(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  function applyFilters() {
    const q = state.search.trim().toLowerCase();
    let list = state.all.filter((item) => {
      if (q) {
        const inTitle = item.title.toLowerCase().includes(q);
        const inCast = (item.cast || []).some((name) => name.toLowerCase().includes(q));
        if (!inTitle && !inCast) return false;
      }
      if (state.activeFormats.size && !state.activeFormats.has(item.format)) return false;
      if (state.activeTypes.size && !state.activeTypes.has(item.content_type)) return false;
      if (state.activeGenres.size) {
        const hasGenre = (item.genres || []).some((g) => state.activeGenres.has(g));
        if (!hasGenre) return false;
      }
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
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case 'year_desc':
        return copy.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
      case 'year_asc':
        return copy.sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
      case 'date_added_desc':
      default:
        return copy.sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
    }
  }

  function render() {
    const visible = state.filtered.slice(0, state.visibleCount);
    els.count.textContent = state.filtered.length + ' titel' + (state.filtered.length === 1 ? '' : 's');
    els.empty.classList.toggle('hidden', state.filtered.length !== 0);
    els.loadMore.classList.toggle('hidden', state.visibleCount >= state.filtered.length);

    els.grid.innerHTML = visible.map(cardTemplate).join('');

    els.grid.querySelectorAll('[data-open-id]').forEach((card) => {
      card.addEventListener('click', () => openModal(card.dataset.openId));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(card.dataset.openId);
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

  // Verwijdert een volledige titel uit de collectie (na bevestiging), en
  // werkt zowel het lokale overzicht als je Google Drive bij.
  async function handleDeleteTitle(id, title) {
    if (!confirm(`Weet je zeker dat je "${title}" volledig wilt verwijderen uit je collectie? Dit kan niet ongedaan gemaakt worden.`)) {
      return;
    }
    try {
      await deleteMovieInDrive(id);
      state.all = state.all.filter((m) => m.id !== id);
      buildGenreChips(state.all);
      applyFilters();
      if (!els.modal.classList.contains('hidden')) closeModal();
    } catch (err) {
      alert('Verwijderen mislukt: ' + err.message);
    }
  }

  // Markeert één seizoen van een reeks als 'niet meer in bezit' (behoudt de
  // rest van de titel, enkel dat seizoen wordt losgekoppeld).
  async function handleRemoveSeason(item, seasonNumber) {
    if (!confirm(`Seizoen ${seasonNumber} niet langer als 'in bezit' markeren?`)) return;
    const season = item.seasons.find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const previousOwned = season.owned;
    const previousFormat = season.format;
    season.owned = false;
    season.format = '';
    try {
      await upsertMovieInDrive(item);
      buildGenreChips(state.all);
      applyFilters();
      openModal(item.id);
    } catch (err) {
      season.owned = previousOwned;
      season.format = previousFormat;
      alert('Bijwerken mislukt: ' + err.message);
    }
  }

  // Markeert een ontbrekend seizoen alsnog als 'in bezit', met het gekozen formaat.
  async function handleAddSeason(item, seasonNumber, format) {
    const season = item.seasons.find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const previousOwned = season.owned;
    const previousFormat = season.format;
    season.owned = true;
    season.format = format;
    try {
      await upsertMovieInDrive(item);
      buildGenreChips(state.all);
      applyFilters();
      openModal(item.id);
    } catch (err) {
      season.owned = previousOwned;
      season.format = previousFormat;
      alert('Bijwerken mislukt: ' + err.message);
    }
  }

  // Voor reeksen met seizoensdata: geeft het formaat terug als alle bezeten
  // seizoenen hetzelfde formaat hebben, anders 'Gemengd'. Zonder seizoensdata
  // (films, of oudere titels) wordt gewoon item.format gebruikt.
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

  // Compact seizoensoverzicht voor op de kaart, bv. '2/4' (aantal bezeten
  // seizoenen / totaal aantal seizoenen). null als er geen seizoensdata is.
  function seasonBadgeInfo(item) {
    if (!item.seasons || !item.seasons.length) return null;
    const ownedCount = item.seasons.filter((s) => s.owned).length;
    return {
      text: `${ownedCount}/${item.seasons.length}`,
      complete: ownedCount === item.seasons.length,
    };
  }

  function cardTemplate(item) {
    const cover = item.custom_front_cover || (item.poster_path ? POSTER_BASE + item.poster_path : '');
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
          <button type="button" class="delete-btn" data-delete-id="${escapeAttr(item.id)}" data-delete-title="${escapeAttr(item.title)}" title="Verwijderen uit collectie" aria-label="Verwijderen uit collectie">&times;</button>
        </div>
        <p class="mt-2 font-display tracking-wide text-[15px] leading-tight text-[#F2F0EA] truncate">${escapeHtml(item.title)}</p>
        <p class="text-xs text-[#8B8A92] font-mono">${item.release_year || ''}</p>
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

  function openModal(id) {
    const item = state.all.find((m) => m.id === id);
    if (!item) return;

    const front = item.custom_front_cover || (item.poster_path ? POSTER_BASE + item.poster_path : '');
    const back = item.custom_back_cover || '';
    const ribbon = ribbonInfo(item);

    els.modal.querySelector('[data-field="title"]').textContent = item.title;
    els.modal.querySelector('[data-field="year"]').textContent = item.release_year || '—';
    els.modal.querySelector('[data-field="runtime"]').textContent = item.runtime ? item.runtime + ' min' : '—';
    els.modal.querySelector('[data-field="rating"]').textContent = item.rating ? item.rating.toFixed(1) + ' / 10' : '—';
    els.modal.querySelector('[data-field="director"]').textContent = item.director || '—';
    els.modal.querySelector('[data-field="cast"]').textContent = (item.cast || []).join(', ') || '—';
    els.modal.querySelector('[data-field="genres"]').textContent = (item.genres || []).join(' · ') || '—';
    els.modal.querySelector('[data-field="format"]').textContent = ribbon.label;
    els.modal.querySelector('[data-field="notes"]').textContent = item.notes || 'Geen opmerkingen';
    els.modal.querySelector('[data-field="overview"]').textContent = item.overview || '';

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

    const flipCard = els.modal.querySelector('.flip-card');
    const flipBtn = els.modal.querySelector('[data-flip-btn]');
    const frontImg = els.modal.querySelector('[data-cover="front"]');
    const backImg = els.modal.querySelector('[data-cover="back"]');
    frontImg.src = front;
    frontImg.alt = item.title + ' — voorkant';

    if (back) {
      backImg.src = back;
      backImg.alt = item.title + ' — achterkant';
      flipBtn.classList.remove('hidden');
      flipCard.classList.remove('flipped');
    } else {
      flipBtn.classList.add('hidden');
      flipCard.classList.remove('flipped');
    }

    flipBtn.onclick = () => flipCard.classList.toggle('flipped');

    els.modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeModal() {
    els.modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
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

  els.loadMore.addEventListener('click', () => {
    state.visibleCount += PAGE_SIZE;
    render();
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }
}
