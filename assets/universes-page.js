/**
 * Universumpagina — beheren en compleetheid bekijken.
 * Verwacht assets/drive.js, assets/admin.js en assets/universes.js.
 */

const POSTER_BASE_UNI = 'https://image.tmdb.org/t/p/w154';

function uniEsc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

async function initUniversesPage() {
  const els = {
    query: document.getElementById('kw-query'),
    includeTv: document.getElementById('kw-include-tv'),
    searchBtn: document.getElementById('kw-search-btn'),
    results: document.getElementById('kw-results'),
    status: document.getElementById('kw-status'),
    list: document.getElementById('universe-list'),
    empty: document.getElementById('universe-empty'),
  };

  const config = typeof getConfig === 'function' ? getConfig() : {};
  if (!config.tmdbKey) {
    els.status.textContent = 'Vul eerst je TMDb-key in via Beheer → Instellingen.';
    els.status.className = 'text-sm font-mono mt-2 text-gold';
  }

  let { universes } = await driveLoadUniverses();
  const { movies: collection } = await driveLoadMovies();
  // Per universum onthouden we of de gebruiker alles, enkel bezit of enkel
  // ontbrekende titels wil zien.
  const viewFilter = {};

  // ---------- Trefwoord zoeken ----------

  async function doKeywordSearch() {
    const q = els.query.value.trim();
    if (!q) return;
    if (!config.tmdbKey) return;

    els.results.innerHTML = '';
    els.status.textContent = 'Zoeken…';
    els.status.className = 'text-sm font-mono mt-2 text-muted';

    try {
      const found = await tmdbSearchKeyword(q, config.tmdbKey);
      if (!found.length) {
        els.status.textContent = 'Geen trefwoorden gevonden. Probeer een andere formulering.';
        els.status.className = 'text-sm font-mono mt-2 text-gold';
        return;
      }
      els.status.textContent = `${found.length} trefwoord(en) — kies het juiste:`;
      els.status.className = 'text-sm font-mono mt-2 text-muted';

      els.results.innerHTML = found
        .map(
          (k) => `
            <div class="flex items-center justify-between gap-3 bg-bg rounded px-3 py-2">
              <span class="text-sm truncate">${uniEsc(k.name)}
                <span class="text-muted font-mono text-xs">#${k.id}</span>
              </span>
              <button type="button" class="chip shrink-0" data-add-kw="${k.id}" data-kw-name="${uniEsc(k.name)}">Toevoegen</button>
            </div>`
        )
        .join('');

      els.results.querySelectorAll('[data-add-kw]').forEach((btn) => {
        btn.addEventListener('click', () => addUniverse(Number(btn.dataset.addKw), btn.dataset.kwName, btn));
      });
    } catch (err) {
      els.status.textContent = '✗ ' + err.message;
      els.status.className = 'text-sm font-mono mt-2 text-red-400';
    }
  }

  async function addUniverse(keywordId, keywordName, btn) {
    if (universes.some((u) => u.keyword_id === keywordId)) {
      els.status.textContent = 'Dat universum staat er al.';
      els.status.className = 'text-sm font-mono mt-2 text-gold';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'bezig…';

    const name = prompt('Naam voor dit universum:', keywordName) || keywordName;
    const universe = makeUniverse(name, { id: keywordId, name: keywordName }, els.includeTv.checked);
    universes = [...universes, universe];

    try {
      await driveSaveUniverses(universes);
      els.results.innerHTML = '';
      els.query.value = '';
      els.status.textContent = `✓ "${universe.name}" toegevoegd.`;
      els.status.className = 'text-sm font-mono mt-2 text-teal';
      await renderAll();
    } catch (err) {
      universes = universes.filter((u) => u.id !== universe.id);
      els.status.textContent = '✗ ' + err.message;
      els.status.className = 'text-sm font-mono mt-2 text-red-400';
      btn.disabled = false;
      btn.textContent = 'Toevoegen';
    }
  }

  els.searchBtn.addEventListener('click', doKeywordSearch);
  els.query.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doKeywordSearch();
  });

  // ---------- Universums tonen ----------

  function rowHtml(r) {
    // Ontbrekende titels krijgen een vinkje om ze samen op de verlanglijst te
    // zetten; daarnaast blijft de losse knop bestaan.
    let left = '<span class="w-4 shrink-0"></span>';
    let marker;
    if (r.status === 'owned') {
      marker = '<span class="font-mono text-[11px] text-teal shrink-0">✓ in bezit</span>';
    } else if (r.status === 'wishlist') {
      marker = '<span class="font-mono text-[11px] text-gold shrink-0">verlanglijst</span>';
    } else {
      left = `<input type="checkbox" class="w-4 h-4 shrink-0 cursor-pointer" data-uni-pick="${r.tmdb_id}" data-media="${r.media_type}" title="Aanvinken om samen op de verlanglijst te zetten">`;
      marker = `<button type="button" class="text-gold hover:text-white text-[11px] underline shrink-0" data-wish="${r.tmdb_id}" data-media="${r.media_type}">+ verlanglijst</button>`;
    }

    return `
      <div class="flex items-center gap-3 py-1.5 px-1 ${r.status === 'owned' ? '' : 'opacity-80'}">
        ${left}
        <span class="font-mono text-[11px] text-muted w-10 shrink-0">${r.release_year || '—'}</span>
        <span class="flex-1 min-w-0 truncate text-sm text-ink">${uniEsc(r.title)}${
      r.media_type === 'tv' ? ' <span class="text-muted font-mono text-[10px]">serie</span>' : ''
    }</span>
        ${marker}
      </div>`;
  }

  // Aangevinkte ontbrekende titels, per universum bijgehouden.
  const bulkPick = {};

  function renderUniverseBody(container, universe, status) {
    const filter = viewFilter[universe.id] || 'all';
    const rows = status.rows.filter((r) => {
      if (filter === 'owned') return r.status === 'owned';
      if (filter === 'missing') return r.status !== 'owned';
      return true;
    });

    const body = container.querySelector('[data-uni-body]');
    body.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : '<p class="text-sm text-muted py-3">Niets in deze weergave.</p>';

    body.querySelectorAll('[data-wish]').forEach((btn) => {
      btn.addEventListener('click', () => addToWishlist(Number(btn.dataset.wish), btn.dataset.media, btn));
    });

    bulkPick[universe.id] = bulkPick[universe.id] || [];
    const updateBar = () => {
      const bar = container.querySelector('[data-uni-bulk]');
      const count = container.querySelector('[data-uni-bulk-count]');
      const list = bulkPick[universe.id];
      if (bar) bar.classList.toggle('hidden', list.length === 0);
      if (count) count.textContent = `${list.length} aangevinkt`;
    };

    body.querySelectorAll('[data-uni-pick]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = Number(cb.dataset.uniPick);
        const row = status.rows.find((r) => r.tmdb_id === id);
        if (!row) return;
        if (cb.checked) bulkPick[universe.id].push(row);
        else bulkPick[universe.id] = bulkPick[universe.id].filter((x) => x.tmdb_id !== id);
        updateBar();
      });
    });
    updateBar();

    // Knoppen van de balk (worden bij elke render opnieuw gekoppeld).
    const wishBtn = container.querySelector('[data-uni-bulk-wish]');
    if (wishBtn) {
      wishBtn.onclick = () => bulkToWishlist(container, universe);
    }
    const clearBtn = container.querySelector('[data-uni-bulk-clear]');
    if (clearBtn) {
      clearBtn.onclick = () => {
        bulkPick[universe.id] = [];
        body.querySelectorAll('[data-uni-pick]').forEach((cb) => (cb.checked = false));
        updateBar();
      };
    }
  }

  async function bulkToWishlist(container, universe) {
    const list = [...(bulkPick[universe.id] || [])];
    if (!list.length || !config.tmdbKey) return;

    const status = container.querySelector('[data-uni-bulk-status]');
    const wishBtn = container.querySelector('[data-uni-bulk-wish]');
    if (wishBtn) wishBtn.disabled = true;

    let added = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (status) status.textContent = `(${i + 1}/${list.length}) ${r.title}…`;
      try {
        const details = await tmdbDetails(r.tmdb_id, r.media_type === 'tv' ? 'tv' : 'movie', config.tmdbKey);
        const id = slugify(details.title, details.release_year);
        if (collection.some((m) => m.id === id)) continue;
        const today = new Date().toISOString().slice(0, 10);
        const entry = {
          id,
          content_type: r.media_type === 'tv' ? 'tv' : 'movie',
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
          seasons: details.seasons ? details.seasons.map((s) => ({ ...s, owned: false, format: '' })) : [],
        };
        normalizeMovieEntry(entry);
        await upsertMovieInDrive(entry);
        collection.push(entry);
        added++;
      } catch (err) {
        console.warn('Overslaan:', r.title, err);
      }
      await new Promise((res) => setTimeout(res, 150));
    }

    bulkPick[universe.id] = [];
    if (status) status.textContent = `✓ ${added} op de verlanglijst gezet.`;
    if (wishBtn) wishBtn.disabled = false;
    // De hele pagina opnieuw opbouwen zodat de tellers en statussen kloppen.
    await renderAll();
  }

  async function addToWishlist(tmdbId, mediaType, btn) {
    if (!config.tmdbKey) return;
    btn.disabled = true;
    btn.textContent = 'bezig…';
    try {
      const details = await tmdbDetails(tmdbId, mediaType === 'tv' ? 'tv' : 'movie', config.tmdbKey);
      const entry = {
        id: slugify(details.title, details.release_year),
        content_type: mediaType === 'tv' ? 'tv' : 'movie',
        date_added: new Date().toISOString().slice(0, 10),
        watched: false,
        editions: [
          {
            eid: 'e1',
            format: 'bluray',
            notes: '',
            boxset: '',
            steelbook: false,
            wishlist: true,
            date_added: new Date().toISOString().slice(0, 10),
            custom_front_cover_id: '',
            custom_back_cover_id: '',
            custom_front_cover: '',
            custom_back_cover: '',
          },
        ],
        ...details,
        seasons: details.seasons
          ? details.seasons.map((s) => ({ ...s, owned: false, format: '' }))
          : [],
      };
      normalizeMovieEntry(entry);

      if (collection.some((m) => m.id === entry.id)) {
        btn.textContent = 'stond er al';
        return;
      }

      await upsertMovieInDrive(entry);
      collection.push(entry);
      btn.outerHTML = '<span class="font-mono text-[11px] text-gold shrink-0">verlanglijst</span>';
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '+ verlanglijst';
      alert('Toevoegen mislukt: ' + err.message);
    }
  }

  async function renderAll() {
    els.empty.classList.toggle('hidden', universes.length > 0);
    els.list.innerHTML = '';

    for (const universe of universes) {
      const section = document.createElement('section');
      section.className = 'panel';
      section.innerHTML = `
        <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div class="min-w-0">
            <p class="font-display text-2xl tracking-wide">${uniEsc(universe.name)}</p>
            <p class="text-xs text-muted font-mono">trefwoord: ${uniEsc(universe.keyword_name)} · #${universe.keyword_id}${
        universe.include_tv ? ' · films en series' : ' · enkel films'
      }</p>
          </div>
          <button type="button" class="text-xs text-muted hover:text-red-400 underline shrink-0" data-remove-uni="${universe.id}">verwijderen</button>
        </div>
        <p data-uni-count class="font-mono text-sm text-gold mb-3">Laden…</p>
        <div data-uni-filters class="hidden flex-wrap gap-2 mb-3">
          <button type="button" class="chip chip-active" data-uni-filter="all">Alles</button>
          <button type="button" class="chip" data-uni-filter="owned">In bezit</button>
          <button type="button" class="chip" data-uni-filter="missing">Nog niet</button>
        </div>
        <div data-uni-body class="space-y-0.5"></div>
        <div data-uni-bulk class="hidden mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-2 items-center">
          <span data-uni-bulk-count class="text-xs text-gold font-mono"></span>
          <button type="button" data-uni-bulk-wish class="chip !py-1 !px-2.5 text-[11px]">→ Naar verlanglijst</button>
          <button type="button" data-uni-bulk-clear class="chip !py-1 !px-2.5 text-[11px]">Selectie wissen</button>
          <span data-uni-bulk-status class="text-[11px] font-mono text-muted"></span>
        </div>
        <p data-uni-note class="text-[11px] text-muted mt-3"></p>
      `;
      els.list.appendChild(section);

      section.querySelector('[data-remove-uni]').addEventListener('click', async () => {
        if (!confirm(`"${universe.name}" verwijderen? Je collectie zelf blijft ongewijzigd.`)) return;
        universes = universes.filter((u) => u.id !== universe.id);
        await driveSaveUniverses(universes);
        await renderAll();
      });

      if (!config.tmdbKey) {
        section.querySelector('[data-uni-count]').textContent = 'TMDb-key ontbreekt.';
        continue;
      }

      try {
        const members = await loadUniverseMembers(universe, config.tmdbKey);
        const status = universeStatus(members.items, collection);

        section.querySelector('[data-uni-count]').textContent =
          `${status.owned} van de ${status.total} in bezit` +
          (status.wishlist ? ` · ${status.wishlist} op verlanglijst` : '') +
          ` · ${status.movies} films${universe.include_tv ? `, ${status.series} series` : ''}`;

        const filters = section.querySelector('[data-uni-filters]');
        filters.classList.remove('hidden');
        filters.classList.add('flex');
        filters.querySelectorAll('[data-uni-filter]').forEach((btn) => {
          btn.addEventListener('click', () => {
            viewFilter[universe.id] = btn.dataset.uniFilter;
            filters.querySelectorAll('[data-uni-filter]').forEach((b) => {
              b.classList.toggle('chip-active', b === btn);
            });
            renderUniverseBody(section, universe, status);
          });
        });

        renderUniverseBody(section, universe, status);

        section.querySelector('[data-uni-note]').textContent =
          'Lijst komt van TMDb-trefwoorden, die door de gemeenschap worden onderhouden — kleine gaten of vreemde titels zijn mogelijk.' +
          (members.truncated ? ' De lijst is afgekapt omdat dit trefwoord erg breed is.' : '');
      } catch (err) {
        section.querySelector('[data-uni-count]').textContent = 'Kon de lijst niet ophalen: ' + err.message;
      }
    }
  }

  await renderAll();
}
