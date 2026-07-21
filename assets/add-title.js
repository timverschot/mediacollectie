/**
 * Herbruikbare 'titel toevoegen'-logica (zoeken op TMDb, seizoenen kiezen,
 * hoesfoto's uploaden, opslaan naar Drive). Wordt gebruikt op zowel
 * index.html (snel een titel toevoegen) als beheer.html.
 *
 * Fase 1-uitbreiding: duplicaat-check. Bij het selecteren van een zoekresultaat
 * wordt meteen gecontroleerd of die titel al in je collectie zit; opslaan
 * overschrijft dan pas na expliciete bevestiging, en behoudt bestaande
 * hoesfoto's en de oorspronkelijke toevoegdatum.
 *
 * Verwacht dat de pagina een formulier bevat met deze exacte element-ID's:
 * search-input, search-btn, search-results, add-form, form-poster,
 * form-title, form-year, form-content-type, form-format, form-watched,
 * seasons-section, seasons-list, form-notes, form-front, form-back,
 * submit-btn, form-status. Verwacht ook dat assets/drive.js en
 * assets/admin.js al geladen zijn (voor TMDb-, config- en Drive-functies).
 *
 * Gebruik: roep initAddTitleUI(onSaved) éénmaal aan na het laden van de
 * pagina. onSaved(entry) wordt aangeroepen na een geslaagde opslag.
 */

// Laatst gekozen formaat onthouden. Beginwaarde is DVD: dat is voor de meeste
// verzamelingen het grootste deel, en het scheelt handmatig omschakelen.
const ADD_FORMAT_KEY = 'mediacollectie_last_format';

function addTitlePreferredFormat() {
  try {
    const v = localStorage.getItem(ADD_FORMAT_KEY);
    if (v && typeof FORMAT_BY_VALUE !== 'undefined' && FORMAT_BY_VALUE[v]) return v;
  } catch {}
  return 'dvd';
}

let addTitleSelectedDetails = null;
let addTitleExistingEntry = null; // bestaande collectie-entry met dezelfde slug (of null)
let addTitleOnSaved = null;

function initAddTitleUI(onSaved) {
  addTitleOnSaved = onSaved || null;
  document.getElementById('search-btn').addEventListener('click', addTitleDoSearch);
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTitleDoSearch();
  });
  document.getElementById('add-form').addEventListener('submit', addTitleSubmit);

  // Formaatkeuze opbouwen uit de gedeelde lijst (drive.js), zodat er maar één
  // plek is waar formaten gedefinieerd staan. Het laatst gekozen formaat wordt
  // onthouden — wie een kast vol dvd's invoert, wil niet elke keer omschakelen.
  const formatSel = document.getElementById('form-format');
  if (formatSel && typeof MEDIA_FORMATS !== 'undefined') {
    const preferred = addTitlePreferredFormat();
    formatSel.innerHTML = MEDIA_FORMATS.map(
      (f) => `<option value="${f.value}"${f.value === preferred ? ' selected' : ''}>${addTitleEscapeHtml(f.label)}</option>`
    ).join('');
    formatSel.addEventListener('change', () => {
      try {
        localStorage.setItem(ADD_FORMAT_KEY, formatSel.value);
      } catch {
        // Voorkeur niet kunnen bewaren is niet erg.
      }
    });
  }

  const bulkBtn = document.getElementById('saga-bulk-btn');
  if (bulkBtn) bulkBtn.addEventListener('click', addTitleAddWholeSaga);

  const bulkAdd = document.getElementById('bulk-add-btn');
  if (bulkAdd) bulkAdd.addEventListener('click', addTitleBulkSubmit);

  const bulkClear = document.getElementById('bulk-clear-btn');
  if (bulkClear) {
    bulkClear.addEventListener('click', () => {
      addTitleBulkSelection = [];
      document.querySelectorAll('#search-results .bulk-pick').forEach((cb) => {
        cb.checked = false;
        const card = cb.closest('.result-card');
        if (card) card.classList.remove('selected');
      });
      addTitleUpdateBulkBar();
    });
  }
}

// ---------- Meerdere titels tegelijk toevoegen ----------

let addTitleBulkSelection = [];

function addTitleUpdateBulkBar() {
  const bar = document.getElementById('bulk-add-bar');
  if (!bar) return;
  const n = addTitleBulkSelection.length;
  bar.classList.toggle('hidden', n === 0);
  const count = document.getElementById('bulk-add-count');
  if (count) count.textContent = `${n} titel${n === 1 ? '' : 's'}`;

  const sel = document.getElementById('bulk-format');
  if (sel && !sel.options.length && typeof MEDIA_FORMATS !== 'undefined') {
    const preferred = addTitlePreferredFormat();
    sel.innerHTML = MEDIA_FORMATS.map(
      (f) => `<option value="${f.value}"${f.value === preferred ? ' selected' : ''}>${addTitleEscapeHtml(f.label)}</option>`
    ).join('');
  }
}

/**
 * Voegt alle aangevinkte zoekresultaten in één keer toe met dezelfde
 * instellingen. Bedoeld voor reeksen als Ace Ventura: aanvinken, formaat
 * kiezen, klaar. Titels die je al hebt worden overgeslagen.
 */
async function addTitleBulkSubmit() {
  const c = getConfig();
  const btn = document.getElementById('bulk-add-btn');
  const status = document.getElementById('bulk-add-status');
  const setStatus = (t, cls) => {
    status.textContent = t;
    status.className = 'text-sm font-mono ' + (cls || 'text-muted');
  };

  if (!addTitleBulkSelection.length) return;
  const format = document.getElementById('bulk-format').value;
  const wishlist = document.getElementById('bulk-owned').value === 'wishlist';
  const boxset = (document.getElementById('bulk-boxset').value || '').trim();

  btn.disabled = true;
  try {
    localStorage.setItem(ADD_FORMAT_KEY, format);
  } catch {}

  const { movies } = await driveLoadMovies();
  const existingIds = new Set(movies.map((m) => m.id));
  const today = new Date().toISOString().slice(0, 10);

  const entries = [];
  const skipped = [];

  for (let i = 0; i < addTitleBulkSelection.length; i++) {
    const r = addTitleBulkSelection[i];
    const label = r.title || r.name;
    setStatus(`(${i + 1}/${addTitleBulkSelection.length}) ${label}…`);
    try {
      const details = await tmdbDetails(r.id, r.media_type === 'tv' ? 'tv' : 'movie', c.tmdbKey);
      const slug = slugify(details.title, details.release_year);
      if (existingIds.has(slug)) {
        skipped.push(details.title);
        continue;
      }
      const entry = {
        id: slug,
        content_type: r.media_type === 'tv' ? 'tv' : 'movie',
        date_added: today,
        watched: false,
        editions: [
          {
            eid: 'e1',
            format,
            notes: '',
            boxset,
            location: '',
            steelbook: false,
            wishlist,
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
      entries.push(entry);
      existingIds.add(slug);
    } catch (err) {
      console.warn('Overgeslagen:', label, err);
      skipped.push(label + ' (fout)');
    }
    await new Promise((res) => setTimeout(res, 200));
  }

  if (!entries.length) {
    setStatus(skipped.length ? 'Niets toegevoegd — alles stond er al.' : 'Niets toegevoegd.', 'text-gold');
    btn.disabled = false;
    return;
  }

  setStatus('Opslaan naar Drive…');
  try {
    await upsertMoviesBatchInDrive(entries);
    setStatus(
      `✓ ${entries.length} toegevoegd` + (skipped.length ? `, ${skipped.length} overgeslagen (stond er al)` : '') + '.',
      'text-teal'
    );
    addTitleBulkSelection = [];
    document.querySelectorAll('#search-results .bulk-pick').forEach((cb) => {
      cb.checked = false;
      cb.closest('.result-card').classList.remove('selected');
    });
    addTitleUpdateBulkBar();
    if (addTitleOnSaved) addTitleOnSaved(entries[0]);
  } catch (err) {
    setStatus('✗ ' + err.message, 'text-red-400');
  } finally {
    btn.disabled = false;
  }
}

// Bouwt één exemplaar op basis van wat er in het formulier staat.
function addTitleBuildEdition(eid, coverIds) {
  const boxsetEl = document.getElementById('form-boxset');
  const steelEl = document.getElementById('form-steelbook');
  const ownedSelect = document.getElementById('form-owned');
  return {
    eid: eid || 'e1',
    format: document.getElementById('form-format').value,
    notes: document.getElementById('form-notes').value.trim(),
    boxset: boxsetEl ? boxsetEl.value.trim() : '',
    steelbook: steelEl ? steelEl.checked : false,
    wishlist: ownedSelect ? ownedSelect.value === 'wishlist' : false,
    date_added: new Date().toISOString().slice(0, 10),
    custom_front_cover_id: (coverIds && coverIds.front) || '',
    custom_back_cover_id: (coverIds && coverIds.back) || '',
    custom_front_cover: '',
    custom_back_cover: '',
  };
}

function addTitleEscapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function addTitleDoSearch() {
  const c = getConfig();
  if (!c.tmdbKey) {
    alert('Vul eerst je TMDb API-key in via Instellingen op de Beheer-pagina.');
    return;
  }
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  const resultsEl = document.getElementById('search-results');
  resultsEl.innerHTML = '<p class="col-span-full text-muted text-sm">Zoeken...</p>';
  try {
    const results = await tmdbSearch(query, c.tmdbKey);
    if (!results.length) {
      resultsEl.innerHTML = '<p class="col-span-full text-muted text-sm">Geen resultaten.</p>';
      return;
    }
    resultsEl.innerHTML = '';
    addTitleBulkSelection = [];
    addTitleUpdateBulkBar();

    results.slice(0, 12).forEach((r) => {
      const title = r.title || r.name;
      const date = r.release_date || r.first_air_date || '';
      const div = document.createElement('div');
      div.className = 'result-card relative';
      div.innerHTML = `
        <label class="absolute top-1 left-1 z-10 flex items-center justify-center w-7 h-7 rounded bg-black/70 cursor-pointer"
          title="Selecteer om samen toe te voegen">
          <input type="checkbox" class="w-4 h-4 bulk-pick" >
        </label>
        ${r.poster_path ? `<img src="${TMDB_IMG_BASE}${r.poster_path}" class="w-full rounded mb-1">` : '<div class="w-full aspect-[2/3] bg-bg rounded mb-1"></div>'}
        <p class="text-xs truncate">${addTitleEscapeHtml(title)}</p>
        <p class="text-[10px] text-muted font-mono">${date.slice(0, 4)}</p>
      `;

      // Klik op de kaart = één titel openen met alle keuzes.
      // Vinkje = toevoegen aan de meervoudige selectie.
      div.addEventListener('click', (ev) => {
        if (ev.target.closest('label')) return;
        addTitleSelectResult(r);
      });

      const cb = div.querySelector('.bulk-pick');
      cb.addEventListener('change', () => {
        if (cb.checked) addTitleBulkSelection.push(r);
        else addTitleBulkSelection = addTitleBulkSelection.filter((x) => x.id !== r.id);
        div.classList.toggle('selected', cb.checked);
        addTitleUpdateBulkBar();
      });

      resultsEl.appendChild(div);
    });
  } catch (err) {
    resultsEl.innerHTML = `<p class="col-span-full text-red-400 text-sm">${addTitleEscapeHtml(err.message)}</p>`;
  }
}

/**
 * Opent het volledige toevoegformulier voor één TMDb-titel, zonder dat je
 * eerst hoeft te zoeken. Wordt gebruikt vanuit de reekslijst in de
 * detailweergave: klik op een ontbrekend deel en je krijgt dezelfde keuzes
 * als bij een gewone toevoeging — formaat, status, hoesfoto's, boxset.
 */
async function addTitleOpenForTmdb(tmdbId, mediaType) {
  const results = document.getElementById('search-results');
  if (results) results.innerHTML = '';
  addTitleBulkSelection = [];
  addTitleUpdateBulkBar();

  const sagaBulk = document.getElementById('saga-bulk');
  if (sagaBulk) sagaBulk.classList.add('hidden');

  await addTitleSelectResult({ id: tmdbId, media_type: mediaType === 'tv' ? 'tv' : 'movie' });
}

async function addTitleSelectResult(r) {
  const c = getConfig();
  addTitleSelectedDetails = await tmdbDetails(r.id, r.media_type, c.tmdbKey);
  addTitleExistingEntry = null;

  document.getElementById('form-poster').src = addTitleSelectedDetails.poster_path ? TMDB_IMG_BASE + addTitleSelectedDetails.poster_path : '';
  document.getElementById('form-title').textContent = addTitleSelectedDetails.title;
  document.getElementById('form-year').textContent = addTitleSelectedDetails.release_year || '';
  document.getElementById('form-content-type').value = r.media_type === 'tv' ? 'tv' : 'movie';
  document.getElementById('add-form').classList.remove('hidden');

  const statusEl = document.getElementById('form-status');
  statusEl.textContent = '';
  statusEl.className = 'text-sm font-mono';

  const seasonsSection = document.getElementById('seasons-section');
  if (r.media_type === 'tv' && addTitleSelectedDetails.seasons && addTitleSelectedDetails.seasons.length) {
    seasonsSection.classList.remove('hidden');
    addTitleRenderSeasonPicker(addTitleSelectedDetails.seasons);
  } else {
    seasonsSection.classList.add('hidden');
    document.getElementById('seasons-list').innerHTML = '';
  }

  // Duplicaat-check: staat deze titel al in je collectie? (stil op de
  // achtergrond; een mislukte check blokkeert het formulier niet)
  try {
    const slug = slugify(addTitleSelectedDetails.title, addTitleSelectedDetails.release_year);
    const { movies } = await driveLoadMovies();
    const existing = movies.find((m) => m.id === slug);
    if (existing && addTitleSelectedDetails && slugify(addTitleSelectedDetails.title, addTitleSelectedDetails.release_year) === slug) {
      addTitleExistingEntry = existing;
      normalizeMovieEntry(existing);
      const have = existing.editions.map((e) => formatLabel(e.format)).join(', ');
      statusEl.textContent =
        `⚠ Deze titel heb je al op ${have}. Kies hieronder een ánder formaat om een tweede exemplaar toe te voegen ` +
        `— of hetzelfde formaat om dat exemplaar bij te werken.`;
      statusEl.className = 'text-sm font-mono text-gold';

      // Een formaat voorstellen dat je nog niet hebt.
      const used = new Set(existing.editions.map((e) => e.format));
      const suggestion = MEDIA_FORMATS.map((f) => f.value).find((v) => !used.has(v));
      if (suggestion) document.getElementById('form-format').value = suggestion;

      document.getElementById('form-content-type').value = existing.content_type || document.getElementById('form-content-type').value;
      document.getElementById('form-watched').checked = !!existing.watched;
    }

    // Hoort deze titel bij een officiële reeks? Dan kan je alle delen in
    // één keer toevoegen.
    const bulk = document.getElementById('saga-bulk');
    if (bulk) {
      const hasSaga = !!(addTitleSelectedDetails && addTitleSelectedDetails.saga_id);
      bulk.classList.toggle('hidden', !hasSaga);
      if (hasSaga) {
        document.getElementById('saga-bulk-name').textContent = addTitleSelectedDetails.saga || 'deze reeks';
        document.getElementById('saga-bulk-status').textContent = '';
      }
    }
  } catch (err) {
    console.warn('Duplicaat-check mislukt:', err);
  }
}

// Bouwt de seizoenkiezer: per seizoen een checkbox ('in bezit') en een
// formaat-dropdown die standaard de algemene formaatkeuze overneemt maar
// per seizoen aan te passen is.
function addTitleRenderSeasonPicker(seasons) {
  const defaultFormat = document.getElementById('form-format').value;
  const opt = (value, label) =>
    `<option value="${value}" ${defaultFormat === value ? 'selected' : ''}>${label}</option>`;
  document.getElementById('seasons-list').innerHTML = seasons
    .map(
      (s) => `
    <label class="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0 !normal-case">
      <input type="checkbox" class="season-owned w-4 h-4 shrink-0" data-season="${s.season_number}" checked>
      <span class="flex-1 text-sm text-ink">${addTitleEscapeHtml(s.name)}
        <span class="text-muted font-mono text-xs">(${s.episode_count ?? '?'} afl.)</span>
      </span>
      <select class="season-format bg-surface border border-white/10 rounded px-2 py-1 text-xs font-mono w-28" data-season="${s.season_number}">
        ${opt('4k', '4K UHD')}${opt('bluray', 'Blu-ray')}${opt('dvd', 'DVD')}
      </select>
    </label>
  `
    )
    .join('');

  // Uitgevinkt seizoen: formaat-dropdown uitschakelen (niet in bezit = geen formaat).
  document.querySelectorAll('#seasons-list .season-owned').forEach((cb) => {
    const sel = document.querySelector(`#seasons-list .season-format[data-season="${cb.dataset.season}"]`);
    const sync = () => { sel.disabled = !cb.checked; };
    cb.addEventListener('change', sync);
    sync();
  });
}

/**
 * Voegt alle delen van de reeks waartoe de gekozen titel behoort in één keer
 * toe. Handig voor boxsets: je scant niet vier keer hetzelfde doosje.
 *
 * Delen die je al hebt worden overgeslagen. Het formaat, de boxsetnaam en de
 * status komen uit het formulier hierboven, zodat je die maar één keer invult.
 */
async function addTitleAddWholeSaga() {
  const details = addTitleSelectedDetails;
  if (!details || !details.saga_id) return;

  const c = getConfig();
  const btn = document.getElementById('saga-bulk-btn');
  const status = document.getElementById('saga-bulk-status');
  const setStatus = (text, cls) => {
    status.textContent = text;
    status.className = 'text-xs font-mono mt-2 ' + (cls || 'text-muted');
  };

  btn.disabled = true;
  setStatus('Delen van de reeks ophalen…');

  try {
    const collection = await tmdbCollection(details.saga_id, c.tmdbKey);
    const parts = collection.parts || [];
    if (!parts.length) {
      setStatus('Geen delen gevonden.', 'text-gold');
      return;
    }

    const { movies } = await driveLoadMovies();
    const haveByTmdb = {};
    movies.forEach((m) => {
      if (m.tmdb_id) haveByTmdb[String(m.tmdb_id)] = m;
    });

    const todo = parts.filter((p) => !haveByTmdb[String(p.tmdb_id)]);
    if (!todo.length) {
      setStatus('Je hebt alle delen van deze reeks al.', 'text-teal');
      return;
    }

    if (!confirm(
      `${todo.length} van de ${parts.length} delen ontbreken nog:\n\n` +
      todo.map((p) => `• ${p.title}${p.release_year ? ' (' + p.release_year + ')' : ''}`).join('\n') +
      `\n\nAlle ${todo.length} toevoegen met het formaat en de boxset uit het formulier?`
    )) {
      return;
    }

    const entries = [];
    for (let i = 0; i < todo.length; i++) {
      const part = todo[i];
      setStatus(`(${i + 1}/${todo.length}) ${part.title}…`);
      try {
        const partDetails = await tmdbDetails(part.tmdb_id, 'movie', c.tmdbKey);
        const entry = {
          id: slugify(partDetails.title, partDetails.release_year),
          content_type: 'movie',
          date_added: new Date().toISOString().slice(0, 10),
          watched: false,
          editions: [addTitleBuildEdition('e1', null)],
          ...partDetails,
          seasons: [],
        };
        normalizeMovieEntry(entry);
        entries.push(entry);
      } catch (err) {
        console.warn('Deel overslaan:', part.title, err);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!entries.length) {
      setStatus('Geen enkel deel kon opgehaald worden.', 'text-red-400');
      return;
    }

    setStatus('Opslaan naar Drive…');
    await upsertMoviesBatchInDrive(entries);
    setStatus(`✓ ${entries.length} delen toegevoegd.`, 'text-teal');
    if (addTitleOnSaved) addTitleOnSaved(entries[0]);
  } catch (err) {
    setStatus('✗ ' + err.message, 'text-red-400');
  } finally {
    btn.disabled = false;
  }
}

async function addTitleSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');

  // Titel bestaat al: bevestigen of we een exemplaar toevoegen dan wel bijwerken.
  if (addTitleExistingEntry) {
    normalizeMovieEntry(addTitleExistingEntry);
    const chosen = document.getElementById('form-format').value;
    const already = addTitleExistingEntry.editions.some((e) => e.format === chosen);
    const ok = confirm(
      already
        ? `Je hebt "${addTitleSelectedDetails.title}" al op ${formatLabel(chosen)}.\n\n` +
            `Dat exemplaar bijwerken met wat nu in het formulier staat?`
        : `"${addTitleSelectedDetails.title}" staat al in je collectie.\n\n` +
            `${formatLabel(chosen)} toevoegen als extra exemplaar?\n` +
            `(Je bestaande exemplaren en hun hoesfoto's blijven ongemoeid.)`
    );
    if (!ok) return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Bezig met opslaan naar Drive...';
  statusEl.className = 'text-sm font-mono text-muted';

  try {
    const slug = slugify(addTitleSelectedDetails.title, addTitleSelectedDetails.release_year);
    let frontCoverId = '', backCoverId = '';

    const frontFile = document.getElementById('form-front').files[0];
    const backFile = document.getElementById('form-back').files[0];
    if (frontFile) {
      statusEl.textContent = 'Voorkant-hoes uploaden...';
      const b64 = await resizeImageFile(frontFile, 1200);
      frontCoverId = await driveUploadCoverFile(b64, slug, 'front');
    }
    if (backFile) {
      statusEl.textContent = 'Achterkant-hoes uploaden...';
      const b64 = await resizeImageFile(backFile, 1200);
      backCoverId = await driveUploadCoverFile(b64, slug, 'back');
    }

    // Seizoensdata verzamelen (enkel relevant als de seizoenkiezer zichtbaar is).
    let seasons = [];
    if (!document.getElementById('seasons-section').classList.contains('hidden')) {
      seasons = (addTitleSelectedDetails.seasons || []).map((s) => {
        const cb = document.querySelector(`#seasons-list .season-owned[data-season="${s.season_number}"]`);
        const sel = document.querySelector(`#seasons-list .season-format[data-season="${s.season_number}"]`);
        const owned = cb ? cb.checked : false;
        return {
          season_number: s.season_number,
          name: s.name,
          episode_count: s.episode_count,
          owned,
          format: owned && sel ? sel.value : '',
        };
      });
    }

    const existing = addTitleExistingEntry;
    let entry;

    if (existing) {
      // Titel bestaat al: het formulier voegt een EXTRA exemplaar toe
      // (bv. je had de DVD, nu koop je de 4K) in plaats van alles te
      // overschrijven. Bestaat dat formaat al, dan werken we dat exemplaar bij.
      normalizeMovieEntry(existing);
      const newEdition = addTitleBuildEdition(nextEditionId(existing), { front: frontCoverId, back: backCoverId });
      const sameFormat = existing.editions.find((e) => e.format === newEdition.format);
      if (sameFormat) {
        sameFormat.notes = newEdition.notes;
        sameFormat.boxset = newEdition.boxset;
        sameFormat.steelbook = newEdition.steelbook;
        sameFormat.wishlist = newEdition.wishlist;
        if (frontCoverId) sameFormat.custom_front_cover_id = frontCoverId;
        if (backCoverId) sameFormat.custom_back_cover_id = backCoverId;
      } else {
        existing.editions.push(newEdition);
      }

      entry = existing;
      entry.content_type = document.getElementById('form-content-type').value;
      entry.watched = document.getElementById('form-watched').checked;
      if (seasons.length) entry.seasons = seasons;
      // TMDb-gegevens verversen, persoonlijke keuzes behouden.
      if (typeof applyTmdbFields === 'function') applyTmdbFields(entry, addTitleSelectedDetails);
      syncLegacyFieldsFromEditions(entry);
    } else {
      entry = {
        id: slug,
        content_type: document.getElementById('form-content-type').value,
        date_added: new Date().toISOString().slice(0, 10),
        watched: document.getElementById('form-watched').checked,
        editions: [addTitleBuildEdition('e1', { front: frontCoverId, back: backCoverId })],
        ...addTitleSelectedDetails,
        seasons,
      };
      normalizeMovieEntry(entry);
    }

    statusEl.textContent = 'movies.json bijwerken in Drive...';
    const status = await upsertMovieInDrive(entry);
    statusEl.textContent = `✓ '${entry.title}' ${status} in je Google Drive.`;
    statusEl.className = 'text-sm font-mono text-teal';

    addTitleExistingEntry = null;
    document.getElementById('add-form').reset();
    document.getElementById('add-form').classList.add('hidden');
    document.getElementById('seasons-section').classList.add('hidden');
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';

    if (addTitleOnSaved) addTitleOnSaved(entry);
  } catch (err) {
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className = 'text-sm font-mono text-red-400';
  } finally {
    submitBtn.disabled = false;
  }
}
