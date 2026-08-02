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

  // FASE 36 — handmatig toevoegen, voor schijven die nergens geregistreerd zijn.
  const manualBtn = document.getElementById('manual-btn');
  if (manualBtn && typeof manualEntryDialog === 'function') {
    manualBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('form-status') || document.getElementById('search-results');
      try {
        const { movies } = await driveLoadMovies();
        movies.forEach((m) => normalizeMovieEntry(m));
        const gegevens = await manualEntryDialog(movies);
        if (!gegevens) return;

        const { entry, ouder } = manualBuildEntry(gegevens, movies);
        // De ouder mee wegschrijven als die een reeksnaam gekregen heeft;
        // anders staat de special in een reeks die aan de andere kant niet
        // bestaat en komt hij bij het groeperen alleen te staan.
        const teBewaren = ouder ? [entry, ouder] : [entry];
        await upsertMoviesBatchInDrive(teBewaren);

        const waar = entry.saga ? ` bij "${entry.saga}"` : '';
        if (statusEl) {
          statusEl.textContent = `✓ "${entry.title}" handmatig toegevoegd${waar}.`;
          statusEl.className = 'text-sm font-mono text-teal';
        }
        if (addTitleOnSaved) addTitleOnSaved(entry);
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = '✗ ' + err.message;
          statusEl.className = 'text-sm font-mono text-red-400';
        }
      }
    });
  }
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

  // Uitvoeringen uit de gedeelde lijst (drive.js) opbouwen.
  const variantsBox = document.getElementById('form-variants');
  if (variantsBox && typeof EDITION_VARIANTS !== 'undefined') {
    variantsBox.innerHTML = EDITION_VARIANTS.map(
      (v) => `
        <label class="!normal-case !text-sm text-ink flex items-center gap-2">
          <input type="checkbox" class="w-4 h-4 form-variant" data-variant="${v.key}"> ${addTitleEscapeHtml(v.label)}
        </label>`
    ).join('');
  }

  // FASE 40 — verzamelaarsvelden uit dezelfde gedeelde lijst.
  const collectorBox = document.getElementById('form-collector');
  if (collectorBox && typeof collectorVeldenHtml === 'function') {
    collectorBox.innerHTML = collectorVeldenHtml({});
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

  // Je collectie ophalen kan mislukken (verlopen sessie, geen verbinding).
  // Zonder deze afhandeling klapte de functie hier uit en bleef de knop grijs,
  // zonder melding.
  let movies;
  try {
    ({ movies } = await driveLoadMovies());
  } catch (err) {
    setStatus('✗ ' + err.message, 'text-red-400');
    btn.disabled = false;
    return;
  }
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
        added_at: new Date().toISOString(),
        watched: false,
        editions: [
          {
            eid: 'e1',
            format,
            notes: '',
            boxset,
            location: '',
            wishlist,
            date_added: today,
            added_at: new Date().toISOString(),
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
  const locationEl = document.getElementById('form-location');
  const ownedSelect = document.getElementById('form-owned');

  // Alle vier de uitvoeringen zetten, ook de niet-aangevinkte. Zo is een nieuw
  // exemplaar meteen compleet en hoeft normalizeMovieEntry niets aan te vullen.
  const variants = {};
  if (typeof EDITION_VARIANTS !== 'undefined') {
    EDITION_VARIANTS.forEach((v) => { variants[v.key] = false; });
  }
  document.querySelectorAll('#form-variants .form-variant').forEach((cb) => {
    variants[cb.dataset.variant] = cb.checked;
  });

  return {
    eid: eid || 'e1',
    format: document.getElementById('form-format').value,
    notes: document.getElementById('form-notes').value.trim(),
    boxset: boxsetEl ? boxsetEl.value.trim() : '',
    // Waar de schijf fysiek ligt. Werd wél gelezen door het filter, de chips en
    // de exemplarenlijst, maar door geen enkel toevoegformulier ingevuld.
    location: locationEl ? locationEl.value.trim() : '',
    ...variants,
    wishlist: ownedSelect ? ownedSelect.value === 'wishlist' : false,
    date_added: new Date().toISOString().slice(0, 10),
    added_at: new Date().toISOString(),
    custom_front_cover_id: (coverIds && coverIds.front) || '',
    custom_back_cover_id: (coverIds && coverIds.back) || '',
    custom_front_cover: '',
    custom_back_cover: '',
    // FASE 40 — verzamelaarsgegevens uit het dichtgeklapte blok. Vul je niets
    // in, dan komen er lege velden te staan, precies zoals overal elders.
    ...(typeof legeCollectorVelden === 'function' ? legeCollectorVelden() : {}),
    ...(typeof collectorLeesVelden === 'function'
      ? collectorLeesVelden(document.getElementById('form-collector'))
      : {}),
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
      // Het posterpad komt van TMDb en gaat rechtstreeks een HTML-attribuut in.
      // Het is nooit misgegaan, maar een pad met een aanhalingsteken zou uit
      // het attribuut breken — dus ontsnappen, net als overal elders (FASE 31).
      div.className = 'result-card relative';
      div.innerHTML = `
        <label class="absolute top-1 left-1 z-10 flex items-center justify-center w-7 h-7 rounded bg-black/70 cursor-pointer"
          title="Selecteer om samen toe te voegen">
          <input type="checkbox" class="w-4 h-4 bulk-pick" >
        </label>
        <!-- FASE 33 — vergrootglas opent het voorbeeld zónder de titel te kiezen.
             Bij een remake of een gelijknamige serie zag je aan een posterzegel
             van twee centimeter niet welke je voor je had. -->
        <button type="button" class="absolute top-1 right-1 z-10 flex items-center justify-center w-7 h-7 rounded bg-black/70 hover:bg-black/90 text-ink text-sm"
          data-preview title="Bekijk de gegevens van deze titel">&#128269;</button>
        <button type="button" class="absolute bottom-9 right-1 z-10 chip !py-0.5 !px-2 text-[10px] !bg-black/70 !border-gold/50 !text-gold"
          data-wish title="Meteen op je verlanglijst zetten">+ wens</button>
        ${r.poster_path ? `<img src="${addTitleEscapeHtml('https://image.tmdb.org/t/p/w342' + r.poster_path)}" loading="lazy" class="w-full rounded mb-1">` : '<div class="w-full aspect-[2/3] bg-bg rounded mb-1"></div>'}
        <p class="text-xs leading-tight" title="${addTitleEscapeHtml(title)}">${addTitleEscapeHtml(title)}</p>
        <p class="text-[10px] text-muted font-mono">${date.slice(0, 4)}</p>
      `;

      // Klik op de kaart = één titel openen met alle keuzes.
      // Vinkje = toevoegen aan de meervoudige selectie.
      div.addEventListener('click', (ev) => {
        if (ev.target.closest('label') || ev.target.closest('[data-preview]')) return;
        addTitleSelectResult(r);
      });

      // FASE 37 — rechtstreeks naar de verlanglijst, zonder het formulier.
      // Kon alleen via het volledige formulier met het statusveld, en dat
      // vond je niet als je gewoon een lijstje wil opbouwen van wat je nog zoekt.
      const wensKnop = div.querySelector('[data-wish]');
      if (wensKnop) {
        wensKnop.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          await addTitleQuickWishlist(r, wensKnop);
        });
      }

      // Voorbeeld bekijken; "Deze gebruiken" kiest hem alsnog.
      const kijk = div.querySelector('[data-preview]');
      if (kijk) {
        kijk.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (typeof tmdbPreviewOverlay !== 'function') return;
          const keuze = await tmdbPreviewOverlay(
            [
              {
                title: r.title || r.name || '',
                release_year: date.slice(0, 4),
                media_type: r.media_type === 'tv' ? 'tv' : 'movie',
                poster_path: r.poster_path || '',
                overview: r.overview || '',
                rating: r.vote_average || 0,
              },
            ],
            0
          );
          if (keuze !== null) addTitleSelectResult(r);
        });
      }

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

/**
 * Zet een zoekresultaat meteen op de verlanglijst (FASE 37).
 *
 * Zonder het formulier te openen: je bent een lijstje aan het opbouwen van wat
 * je nog zoekt, niet iets aan het registreren dat in je kast staat. Formaat
 * wordt je onthouden voorkeur; dat pas je later aan als je hem koopt.
 */
async function addTitleQuickWishlist(r, knop) {
  const c = getConfig();
  const statusEl = document.getElementById('form-status');
  const zeg = (tekst, kleur) => {
    if (statusEl) {
      statusEl.textContent = tekst;
      statusEl.className = 'text-sm font-mono ' + (kleur || 'text-muted');
    }
  };
  if (!c.tmdbKey) {
    zeg('Vul eerst je TMDb-sleutel in via Beheer → Instellingen.', 'text-gold');
    return;
  }
  if (knop) knop.disabled = true;
  try {
    const details = await tmdbDetails(r.id, r.media_type === 'tv' ? 'tv' : 'movie', c.tmdbKey);
    const slug = slugify(details.title, details.release_year);
    const { movies } = await driveLoadMovies();
    if (movies.some((m) => m.id === slug)) {
      zeg(`"${details.title}" staat al in je collectie.`, 'text-gold');
      return;
    }
    // FASE 39 — één fabriek voor een nieuw record (zie drive.js), zodat velden
    // als `added_at` nooit meer op één plek kunnen ontbreken.
    const entry = nieuweCollectieTitel({
      id: slug,
      content_type: r.media_type === 'tv' ? 'tv' : 'movie',
      format: typeof addTitlePreferredFormat === 'function' ? addTitlePreferredFormat() : 'dvd',
      wishlist: true,
      details,
    });
    entry.seasons = [];

    // Niet upsert: de controle hierboven werkte met een lijst die intussen
    // verouderd kan zijn. insertMovieIfAbsent kijkt binnen de vergrendeling
    // opnieuw en raakt een bestaande titel gegarandeerd niet aan.
    const uitkomst = await insertMovieIfAbsentInDrive(entry);
    if (uitkomst === 'bestond-al') {
      zeg(`"${details.title}" staat al in je collectie.`, 'text-gold');
      return;
    }
    zeg(`✓ "${details.title}" op je verlanglijst gezet.`, 'text-teal');
    if (knop) {
      knop.textContent = '✓ wens';
      knop.classList.add('chip-active');
    }
    if (addTitleOnSaved) addTitleOnSaved(entry);
  } catch (err) {
    zeg('✗ ' + err.message, 'text-red-400');
  } finally {
    if (knop) knop.disabled = false;
  }
}

async function addTitleSelectResult(r) {
  const c = getConfig();
  addTitleSelectedDetails = await tmdbDetails(r.id, r.media_type, c.tmdbKey);
  addTitleExistingEntry = null;
  addTitleDuplicateChoice = null;

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
        `⚠ Deze titel heb je al op ${have}. Kies een ánder formaat voor een tweede exemplaar — ` +
        `of hetzelfde formaat: dan vraagt hij of je dat exemplaar wil bijwerken of er tóch een tweede bij wil zetten ` +
        `(andere uitgave, remaster, uit een boxset).`;
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
    const haveIds = new Set(movies.map((m) => m.id));
    movies.forEach((m) => {
      if (m.tmdb_id) haveByTmdb[String(m.tmdb_id)] = m;
    });

    // Ook op slug controleren, niet alleen op tmdb_id. Het wegschrijven matcht
    // namelijk op id en VERVANGT het bestaande record volledig. Heb je een deel
    // ooit langs een andere weg toegevoegd (of heeft TMDb er twee records van),
    // dan zou je exemplaren, hoesfoto's, kijklog en score kwijtraken.
    const todo = parts.filter(
      (p) => !haveByTmdb[String(p.tmdb_id)] && !haveIds.has(slugify(p.title, p.release_year))
    );
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
        const slug = slugify(partDetails.title, partDetails.release_year);
        // Tweede zeef: de volledige gegevens kunnen een andere titel (en dus een
        // andere slug) opleveren dan de reekslijst. Botst die met een bestaande
        // titel, dan overslaan in plaats van overschrijven.
        if (haveIds.has(slug)) {
          console.info('Deel overgeslagen, id bestaat al:', slug);
          continue;
        }
        haveIds.add(slug);
        const entry = {
          id: slug,
          content_type: 'movie',
          date_added: new Date().toISOString().slice(0, 10),
          added_at: new Date().toISOString(),
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

/* ==========================================================================
 * Dubbele titel: drie keuzes in plaats van twee (FASE 33)
 * ==========================================================================
 * Had je een titel al in hetzelfde formaat, dan bood het formulier alleen
 * "bijwerken" of "annuleren". Maar twee schijven van dezelfde film in hetzelfde
 * formaat is heel gewoon: een oude uitgave naast een remaster, een losse DVD
 * naast dezelfde DVD uit een boxset. Die kon je dus niet registreren.
 *
 * Een confirm() geeft maar twee knoppen, vandaar een eigen scherm. Het wordt
 * ter plekke opgebouwd en daarna weer opgeruimd, zodat het op elke pagina werkt
 * die dit bestand laadt (collectie én beheer) zonder in beide HTML-bestanden
 * te moeten staan.
 * ========================================================================== */

let addTitleDuplicateChoice = null; // 'update' | 'extra' | null

/**
 * @returns Promise<'update' | 'extra' | null>  null = annuleren
 */
function addTitleAskDuplicate(titel, formaatNaam, aantalZelfde) {
  return new Promise((resolve) => {
    const laag = document.createElement('div');
    laag.className = 'fixed inset-0 z-[95] flex items-center justify-center p-4';
    laag.style.background = 'rgba(0,0,0,.7)';

    const paneel = document.createElement('div');
    paneel.className = 'bg-surface rounded-xl w-full max-w-md shadow-2xl ring-1 ring-white/10 p-5 sm:p-6';
    paneel.style.paddingBottom = 'calc(1.25rem + env(safe-area-inset-bottom))';

    const titelEl = document.createElement('h2');
    titelEl.className = 'font-display text-2xl tracking-wide mb-2';
    titelEl.textContent = 'Deze heb je al';

    const uitleg = document.createElement('p');
    uitleg.className = 'text-sm text-muted mb-1';
    uitleg.textContent =
      `Je hebt "${titel}" al ${aantalZelfde > 1 ? aantalZelfde + '× ' : ''}op ${formaatNaam}.`;

    const uitleg2 = document.createElement('p');
    uitleg2.className = 'text-sm text-muted mb-5';
    uitleg2.textContent =
      'Gaat het om een andere uitgave — een remaster, een exemplaar uit een boxset — ' +
      'kies dan "Tweede exemplaar". Zet er een opmerking of uitvoering bij, dan zie je later welke welke is.';

    const knoppen = document.createElement('div');
    knoppen.className = 'flex flex-col gap-2';

    const maakKnop = (tekst, klasse, waarde) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = klasse;
      b.textContent = tekst;
      b.addEventListener('click', () => klaar(waarde));
      return b;
    };

    knoppen.appendChild(maakKnop('Tweede exemplaar toevoegen', 'btn btn-primary w-full', 'extra'));
    knoppen.appendChild(maakKnop('Bestaand exemplaar bijwerken', 'btn btn-secondary w-full', 'update'));
    knoppen.appendChild(maakKnop('Annuleren', 'chip w-full', null));

    paneel.append(titelEl, uitleg, uitleg2, knoppen);
    laag.appendChild(paneel);

    function klaar(waarde) {
      document.removeEventListener('keydown', opToets);
      laag.remove();
      resolve(waarde);
    }
    function opToets(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        klaar(null);
      }
    }
    laag.addEventListener('click', (ev) => {
      if (ev.target === laag) klaar(null);
    });
    document.addEventListener('keydown', opToets);

    document.body.appendChild(laag);
    paneel.querySelector('button').focus();
  });
}

async function addTitleSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');

  // Titel bestaat al: kiezen wat er moet gebeuren.
  addTitleDuplicateChoice = null;
  if (addTitleExistingEntry) {
    normalizeMovieEntry(addTitleExistingEntry);
    const chosen = document.getElementById('form-format').value;
    const zelfde = addTitleExistingEntry.editions.filter((e) => e.format === chosen);
    if (zelfde.length) {
      // Zelfde formaat: bijwerken, of tóch een tweede exemplaar (FASE 33).
      const keuze = await addTitleAskDuplicate(
        addTitleSelectedDetails.title,
        formatLabel(chosen),
        zelfde.length
      );
      if (!keuze) return;
      addTitleDuplicateChoice = keuze;
    } else {
      const ok = confirm(
        `"${addTitleSelectedDetails.title}" staat al in je collectie.\n\n` +
          `${formatLabel(chosen)} toevoegen als extra exemplaar?\n` +
          `(Je bestaande exemplaren en hun hoesfoto's blijven ongemoeid.)`
      );
      if (!ok) return;
      addTitleDuplicateChoice = 'extra';
    }
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Bezig met opslaan naar Drive...';
  statusEl.className = 'text-sm font-mono text-muted';

  try {
    const slug = slugify(addTitleSelectedDetails.title, addTitleSelectedDetails.release_year);

    // Voor wélk exemplaar is deze foto? Dat moeten we wéten vóór de upload.
    //
    // driveUploadCoverFile zoekt op bestandsnaam en overschrijft een bestaand
    // bestand. Gebruikten we hier alleen de slug (zoals voorheen), dan kreeg de
    // 4K van een film die je al op DVD hebt exact dezelfde bestandsnaam: de
    // foto van je DVD-doosje werd dan overschreven en beide exemplaren wezen
    // naar hetzelfde bestand. Het bewerkpaneel doet dit al goed met
    // `item.id + '-' + ed.eid`; hier gebruiken we dezelfde sleutel.
    let doelEid = 'e1';
    if (addTitleExistingEntry) {
      normalizeMovieEntry(addTitleExistingEntry);
      const gekozenFormaat = document.getElementById('form-format').value;
      const zelfdeFormaat = addTitleExistingEntry.editions.find((ed) => ed.format === gekozenFormaat);
      // Koos je bewust voor een tweede exemplaar, dan krijgt dat een eigen id —
      // en dus ook een eigen hoesfoto, los van het exemplaar dat je al had.
      doelEid =
        zelfdeFormaat && addTitleDuplicateChoice !== 'extra'
          ? zelfdeFormaat.eid
          : nextEditionId(addTitleExistingEntry);
    }
    const coverKey = slug + '-' + doelEid;

    let frontCoverId = '', backCoverId = '';

    const frontFile = document.getElementById('form-front').files[0];
    const backFile = document.getElementById('form-back').files[0];
    if (frontFile) {
      statusEl.textContent = 'Voorkant-hoes uploaden...';
      const b64 = await resizeImageFile(frontFile, 1200);
      frontCoverId = await driveUploadCoverFile(b64, coverKey, 'front');
    }
    if (backFile) {
      statusEl.textContent = 'Achterkant-hoes uploaden...';
      const b64 = await resizeImageFile(backFile, 1200);
      backCoverId = await driveUploadCoverFile(b64, coverKey, 'back');
    }
    // De blob-cache kan nog de vorige foto onder ditzelfde bestand-ID hebben.
    // Vrijgeven, niet enkel vergeten: anders blijft de oude afbeelding in het
    // geheugen van het tabblad staan.
    if (typeof driveReleaseCoverUrl === 'function') {
      if (frontCoverId) driveReleaseCoverUrl(frontCoverId);
      if (backCoverId) driveReleaseCoverUrl(backCoverId);
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
          // Seizoencover, -beschrijving en -datum meenemen, zodat de TMDb-achtige
          // seizoenenweergave meteen de juiste cover per seizoen toont (anders
          // viel alles terug op de algemene serieposter).
          poster_path: s.poster_path || '',
          overview: s.overview || '',
          air_date: s.air_date || '',
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
      // doelEid is hierboven al bepaald, vóór de foto-upload, zodat de
      // bestandsnaam van de hoesfoto bij het juiste exemplaar hoort.
      const newEdition = addTitleBuildEdition(doelEid, { front: frontCoverId, back: backCoverId });
      // Bij een bewuste tweede kopie niet samenvoegen, maar er echt een
      // exemplaar bij zetten.
      const sameFormat =
        addTitleDuplicateChoice === 'extra'
          ? null
          : existing.editions.find((e) => e.format === newEdition.format);
      if (sameFormat) {
        sameFormat.notes = newEdition.notes;
        sameFormat.boxset = newEdition.boxset;
        sameFormat.wishlist = newEdition.wishlist;
        EDITION_VARIANTS.forEach((v) => {
          sameFormat[v.key] = !!newEdition[v.key];
        });
        if (frontCoverId) sameFormat.custom_front_cover_id = frontCoverId;
        if (backCoverId) sameFormat.custom_back_cover_id = backCoverId;
      } else {
        existing.editions.push(newEdition);
      }

      entry = existing;
      entry.content_type = document.getElementById('form-content-type').value;
      entry.watched = document.getElementById('form-watched').checked;
      // FASE 39 — hier stond `entry.seasons = seasons`, wat de volledige
      // seizoenenlijst verving door wat de vinkjes zeiden. En die staan
      // standaard állemaal aan, met één formaat: koop je de 4K-box van een
      // serie waarvan je S1 op DVD en S2 als steelbook hebt, dan was die
      // opbouw weg. Nu komt er per aangevinkt seizoen een exemplaar bíj.
      if (seasons.length) {
        entry.seasons = mergeSeizoenKeuzes(entry.seasons, seasons, {
          altijdExtra: addTitleDuplicateChoice === 'extra',
        });
      }
      // TMDb-gegevens verversen, persoonlijke keuzes behouden.
      if (typeof applyTmdbFields === 'function') applyTmdbFields(entry, addTitleSelectedDetails);
      syncLegacyFieldsFromEditions(entry);
    } else {
      entry = {
        id: slug,
        content_type: document.getElementById('form-content-type').value,
        date_added: new Date().toISOString().slice(0, 10),
        added_at: new Date().toISOString(),
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
    addTitleDuplicateChoice = null;
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
