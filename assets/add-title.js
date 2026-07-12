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
    results.slice(0, 8).forEach((r) => {
      const title = r.title || r.name;
      const date = r.release_date || r.first_air_date || '';
      const div = document.createElement('div');
      div.className = 'result-card';
      div.innerHTML = `
        ${r.poster_path ? `<img src="${TMDB_IMG_BASE}${r.poster_path}" class="w-full rounded mb-1">` : '<div class="w-full aspect-[2/3] bg-bg rounded mb-1"></div>'}
        <p class="text-xs truncate">${addTitleEscapeHtml(title)}</p>
        <p class="text-[10px] text-muted font-mono">${date.slice(0, 4)}</p>
      `;
      div.addEventListener('click', () => addTitleSelectResult(r));
      resultsEl.appendChild(div);
    });
  } catch (err) {
    resultsEl.innerHTML = `<p class="col-span-full text-red-400 text-sm">${addTitleEscapeHtml(err.message)}</p>`;
  }
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
      statusEl.textContent = `⚠ Staat al in je collectie (toegevoegd op ${existing.date_added || 'onbekende datum'}). Opslaan werkt de bestaande titel bij.`;
      statusEl.className = 'text-sm font-mono text-gold';
      // Formulier alvast invullen met de bestaande gegevens, zodat je niets kwijtraakt.
      document.getElementById('form-format').value = existing.format || 'bluray';
      document.getElementById('form-content-type').value = existing.content_type || document.getElementById('form-content-type').value;
      document.getElementById('form-watched').checked = !!existing.watched;
      document.getElementById('form-notes').value = existing.notes || '';
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

async function addTitleSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');

  // Duplicaat: expliciete bevestiging vóór overschrijven.
  if (addTitleExistingEntry) {
    const ok = confirm(
      `"${addTitleSelectedDetails.title}" staat al in je collectie.\n\n` +
      `Wil je de bestaande gegevens bijwerken met wat nu in het formulier staat?\n` +
      `(Bestaande hoesfoto's blijven behouden als je geen nieuwe koos; de oorspronkelijke toevoegdatum blijft staan.)`
    );
    if (!ok) return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Bezig met opslaan naar Drive...';
  statusEl.className = 'text-sm font-mono text-muted';

  try {
    const slug = slugify(addTitleSelectedDetails.title, addTitleSelectedDetails.release_year);
    let frontCover = '', backCover = '';

    const frontFile = document.getElementById('form-front').files[0];
    const backFile = document.getElementById('form-back').files[0];
    if (frontFile) {
      statusEl.textContent = 'Voorkant-hoes verwerken...';
      const b64 = await resizeImageFile(frontFile, 1200);
      frontCover = await driveUploadCoverImage(b64, slug, 'front');
    }
    if (backFile) {
      statusEl.textContent = 'Achterkant-hoes verwerken...';
      const b64 = await resizeImageFile(backFile, 1200);
      backCover = await driveUploadCoverImage(b64, slug, 'back');
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
    const entry = {
      id: slug,
      content_type: document.getElementById('form-content-type').value,
      format: document.getElementById('form-format').value,
      // Bij bijwerken blijft de oorspronkelijke toevoegdatum behouden.
      date_added: (existing && existing.date_added) || new Date().toISOString().slice(0, 10),
      watched: document.getElementById('form-watched').checked,
      notes: document.getElementById('form-notes').value.trim(),
      // Geen nieuwe foto gekozen? Dan blijven eventuele bestaande hoesfoto's staan.
      custom_front_cover: frontCover || (existing && existing.custom_front_cover) || '',
      custom_back_cover: backCover || (existing && existing.custom_back_cover) || '',
      ...addTitleSelectedDetails,
      seasons,
    };

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
