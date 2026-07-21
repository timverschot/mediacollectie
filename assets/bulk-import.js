/**
 * Lijstinvoer — een geplakte lijst titels omzetten naar collectie-items.
 * ---------------------------------------------------------------------
 * Bedoeld voor deze werkwijze: maak een foto van een plank of stapel, laat
 * een AI zoals Gemini of ChatGPT de titels van de ruggen aflezen, en plak het
 * resultaat hier. De app zoekt elke regel op bij TMDb, jij bevestigt, en alles
 * gaat in één keer je collectie in.
 *
 * Zo blijven de kosten en de sleutels buiten de app, en verstuurt de app zelf
 * nooit foto's — dat is een bewuste handeling van jou, ergens anders.
 *
 * Verwacht assets/drive.js, assets/admin.js en assets/add-title.js.
 */

// Formaatwoorden die vaak achter een titel plakken en het zoeken storen.
const BULK_FORMAT_NOISE = /[\s\-–—]*[\(\[]?\s*(dvd|blu-?ray|bluray|4k|uhd|ultra hd|vhs|laserdisc|steelbook|boxset|box ?set)\s*[\)\]]?\s*$/gi;

/**
 * Ontleedt een geplakte lijst. Verdraagt nummering, opsommingstekens,
 * jaartallen tussen haakjes of achteraan, en formaatwoorden.
 * Geeft [{ raw, title, year }] terug, zonder dubbels.
 */
function parseTitleList(text) {
  const seen = new Set();
  const out = [];

  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const raw = line.trim();
      if (!raw) return;

      // Nummering ("1.", "12)") en opsommingstekens ("-", "*", "•") weghalen
      let cleaned = raw.replace(/^\s*(?:\d{1,3}\s*[.)\]]\s*|[-*•·–—]\s+)/, '').trim();

      // Formaatwoorden achteraan weghalen, eventueel meerdere na elkaar
      let previous;
      do {
        previous = cleaned;
        cleaned = cleaned.replace(BULK_FORMAT_NOISE, '').trim();
      } while (cleaned !== previous && cleaned.length);

      if (cleaned.length < 2) return;

      // Jaartal tussen haakjes of blokhaken achteraan
      let title = cleaned;
      let year = null;

      const bracketed = cleaned.match(/^(.*?)[\s\-–—,]*[([{](\d{4})[)\]}]\s*$/);
      if (bracketed) {
        title = bracketed[1].trim();
        year = Number(bracketed[2]);
      } else {
        // Los jaartal achteraan, alleen als het een plausibel filmjaar is
        const bare = cleaned.match(/^(.*?)[\s,\-–—]+(\d{4})$/);
        if (bare) {
          const y = Number(bare[2]);
          if (y >= 1880 && y <= new Date().getFullYear() + 5 && bare[1].trim().length > 1) {
            title = bare[1].trim();
            year = y;
          }
        }
      }

      // Afsluitende leestekens die overblijven
      title = title.replace(/[\s,;:.\-–—]+$/, '').trim();
      if (title.length < 2) return;

      const key = title.toLowerCase() + '|' + (year || '');
      if (seen.has(key)) return;
      seen.add(key);

      out.push({ raw, title, year });
    });

  return out;
}

/**
 * Zoekt één ontlede regel op bij TMDb en geeft kandidaten terug.
 * Staat er een jaartal bij, dan krijgen treffers uit dat jaar voorrang.
 */
async function bulkFindCandidates(entry, apiKey) {
  const results = await tmdbSearch(entry.title, apiKey);
  const scored = results.slice(0, 8).map((r) => {
    const date = r.release_date || r.first_air_date || '';
    const y = /^\d{4}/.test(date) ? parseInt(date.slice(0, 4), 10) : null;
    let score = r.popularity || 0;
    if (entry.year && y) {
      if (y === entry.year) score += 1000;
      else if (Math.abs(y - entry.year) <= 1) score += 400;
    }
    // Exacte titeltreffer weegt zwaar — anders wint soms een populaire remake.
    const name = (r.title || r.name || '').toLowerCase();
    if (name === entry.title.toLowerCase()) score += 800;
    return {
      tmdb_id: r.id,
      media_type: r.media_type === 'tv' ? 'tv' : 'movie',
      title: r.title || r.name || '',
      release_year: y,
      poster_path: r.poster_path || '',
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/* ==========================================================================
 * Interface
 * ========================================================================== */

let bulkRows = [];

function bulkEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function initBulkImportUI(onSaved) {
  const modal = document.getElementById('bulk-text-modal');
  if (!modal) return;

  const stepInput = modal.querySelector('[data-bulktext-step="input"]');
  const stepReview = modal.querySelector('[data-bulktext-step="review"]');
  const status = document.getElementById('bulk-text-status');
  const listEl = document.getElementById('bulk-review-list');
  const summary = document.getElementById('bulk-review-summary');
  const progress = document.getElementById('bulk-add-progress');

  const setStatus = (t, cls) => {
    status.textContent = t;
    status.className = 'text-sm font-mono ' + (cls || 'text-muted');
  };

  const showStep = (which) => {
    stepInput.classList.toggle('hidden', which !== 'input');
    stepReview.classList.toggle('hidden', which !== 'review');
  };

  window.__openBulkTextModal = () => {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    showStep('input');
    setStatus('');
    progress.textContent = '';

    const sel = document.getElementById('bulk-text-format');
    if (sel && !sel.options.length && typeof MEDIA_FORMATS !== 'undefined') {
      const preferred = typeof addTitlePreferredFormat === 'function' ? addTitlePreferredFormat() : 'dvd';
      sel.innerHTML = MEDIA_FORMATS.map(
        (f) => `<option value="${f.value}"${f.value === preferred ? ' selected' : ''}>${bulkEsc(f.label)}</option>`
      ).join('');
    }
  };

  const close = () => {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  };
  modal.querySelector('[data-bulktext-close]').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.getElementById('copy-prompt-btn').addEventListener('click', () => {
    const text = document.getElementById('bulk-prompt').textContent;
    navigator.clipboard.writeText(text).then(
      () => setStatus('✓ Opdracht gekopieerd — plak hem bij je AI samen met de foto.', 'text-teal'),
      () => setStatus('Kopiëren lukte niet; selecteer de tekst handmatig.', 'text-gold')
    );
  });

  // ---------- Stap 1: opzoeken ----------

  document.getElementById('bulk-text-analyse').addEventListener('click', async () => {
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey) {
      setStatus('Vul eerst je TMDb-key in via Beheer → Instellingen.', 'text-gold');
      return;
    }

    const parsed = parseTitleList(document.getElementById('bulk-text-input').value);
    if (!parsed.length) {
      setStatus('Geen bruikbare regels gevonden.', 'text-gold');
      return;
    }

    const btn = document.getElementById('bulk-text-analyse');
    btn.disabled = true;

    const { movies } = await driveLoadMovies();
    const haveIds = new Set(movies.map((m) => m.id));
    const haveTmdb = new Set(movies.filter((m) => m.tmdb_id).map((m) => String(m.tmdb_id)));

    bulkRows = [];
    for (let i = 0; i < parsed.length; i++) {
      setStatus(`(${i + 1}/${parsed.length}) ${parsed[i].title}…`);
      let candidates = [];
      try {
        candidates = await bulkFindCandidates(parsed[i], c.tmdbKey);
      } catch (err) {
        console.warn('Zoeken mislukt:', parsed[i].title, err);
      }
      const best = candidates[0] || null;
      const already =
        best && (haveTmdb.has(String(best.tmdb_id)) || haveIds.has(slugify(best.title, best.release_year)));

      bulkRows.push({
        source: parsed[i],
        candidates,
        chosen: 0,
        // Al in bezit of niets gevonden: standaard uitgevinkt.
        selected: !!best && !already,
        already,
      });
      await new Promise((r) => setTimeout(r, 150));
    }

    btn.disabled = false;
    renderReview();
    showStep('review');
  });

  // ---------- Stap 2: bevestigen ----------

  function renderReview() {
    const found = bulkRows.filter((r) => r.candidates.length).length;
    const already = bulkRows.filter((r) => r.already).length;
    const missing = bulkRows.length - found;

    summary.innerHTML =
      `<span class="text-ink">${bulkRows.length} regels</span> · ` +
      `<span class="text-teal">${found} gevonden</span>` +
      (already ? ` · <span class="text-gold">${already} had je al</span>` : '') +
      (missing ? ` · <span class="text-muted">${missing} niet gevonden</span>` : '');

    listEl.innerHTML = bulkRows
      .map((row, i) => {
        const cand = row.candidates[row.chosen];
        if (!cand) {
          return `
            <div class="flex items-center gap-3 py-2 px-2 rounded bg-bg/50">
              <span class="w-4 shrink-0"></span>
              <span class="w-10 h-14 shrink-0 rounded bg-bg"></span>
              <span class="flex-1 min-w-0">
                <span class="block text-sm text-muted truncate">${bulkEsc(row.source.title)}</span>
                <span class="block text-xs text-muted/70">niets gevonden — voeg hem handmatig toe</span>
              </span>
            </div>`;
        }
        return `
          <div class="flex items-center gap-3 py-2 px-2 rounded hover:bg-white/5 ${row.already ? 'opacity-60' : ''}">
            <input type="checkbox" class="w-4 h-4 shrink-0" data-bulk-row="${i}" ${row.selected ? 'checked' : ''}>
            ${
              cand.poster_path
                ? `<img src="https://image.tmdb.org/t/p/w92${bulkEsc(cand.poster_path)}" class="w-10 h-14 object-cover rounded shrink-0" loading="lazy" alt="">`
                : '<span class="w-10 h-14 shrink-0 rounded bg-bg"></span>'
            }
            <span class="flex-1 min-w-0">
              <span class="block text-sm text-ink truncate">${bulkEsc(cand.title)}
                <span class="text-muted font-mono text-xs">${cand.release_year || '—'}</span>
                ${cand.media_type === 'tv' ? '<span class="text-muted font-mono text-[10px]">serie</span>' : ''}
              </span>
              <span class="block text-[11px] text-muted truncate">
                uit: "${bulkEsc(row.source.raw)}"${row.already ? ' · heb je al' : ''}
              </span>
            </span>
            ${
              row.candidates.length > 1
                ? `<button type="button" class="chip !py-1 !px-2 text-[10px] shrink-0" data-bulk-next="${i}">andere (${row.chosen + 1}/${row.candidates.length})</button>`
                : ''
            }
          </div>`;
      })
      .join('');

    listEl.querySelectorAll('[data-bulk-row]').forEach((cb) => {
      cb.addEventListener('change', () => {
        bulkRows[Number(cb.dataset.bulkRow)].selected = cb.checked;
      });
    });
    listEl.querySelectorAll('[data-bulk-next]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = bulkRows[Number(btn.dataset.bulkNext)];
        row.chosen = (row.chosen + 1) % row.candidates.length;
        renderReview();
      });
    });
  }

  document.getElementById('bulk-review-all').addEventListener('click', () => {
    bulkRows.forEach((r) => {
      if (r.candidates.length) r.selected = true;
    });
    renderReview();
  });
  document.getElementById('bulk-review-none').addEventListener('click', () => {
    bulkRows.forEach((r) => (r.selected = false));
    renderReview();
  });
  document.getElementById('bulk-review-back').addEventListener('click', () => showStep('input'));

  // ---------- Stap 3: toevoegen ----------

  document.getElementById('bulk-text-add').addEventListener('click', async () => {
    const c = typeof getConfig === 'function' ? getConfig() : {};
    const chosen = bulkRows.filter((r) => r.selected && r.candidates[r.chosen]);
    if (!chosen.length) {
      progress.textContent = 'Niets aangevinkt.';
      progress.className = 'text-sm font-mono text-gold';
      return;
    }

    const opts = {
      format: document.getElementById('bulk-text-format').value,
      wishlist: document.getElementById('bulk-text-owned').value === 'wishlist',
      boxset: document.getElementById('bulk-text-boxset').value.trim(),
      location: document.getElementById('bulk-text-location').value.trim(),
    };
    try {
      localStorage.setItem('mediacollectie_last_format', opts.format);
    } catch {}

    const btn = document.getElementById('bulk-text-add');
    btn.disabled = true;

    const entries = [];
    const failed = [];
    for (let i = 0; i < chosen.length; i++) {
      const cand = chosen[i].candidates[chosen[i].chosen];
      progress.textContent = `(${i + 1}/${chosen.length}) ${cand.title}…`;
      progress.className = 'text-sm font-mono text-muted';
      try {
        entries.push(await bulkBuildEntry(cand, opts, c.tmdbKey));
      } catch (err) {
        failed.push(cand.title);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!entries.length) {
      progress.textContent = '✗ Niets kunnen toevoegen.';
      progress.className = 'text-sm font-mono text-red-400';
      btn.disabled = false;
      return;
    }

    try {
      progress.textContent = 'Opslaan naar Drive…';
      await upsertMoviesBatchInDrive(entries);
      progress.textContent =
        `✓ ${entries.length} toegevoegd` + (failed.length ? `, ${failed.length} mislukt` : '') + '.';
      progress.className = 'text-sm font-mono text-teal';
      if (onSaved) onSaved(entries[0]);
    } catch (err) {
      progress.textContent = '✗ ' + err.message;
      progress.className = 'text-sm font-mono text-red-400';
    } finally {
      btn.disabled = false;
    }
  });
}

/**
 * Bouwt een collectie-item uit een gekozen kandidaat.
 * Gebruikt dezelfde structuur als het gewone toevoegformulier.
 */
async function bulkBuildEntry(candidate, opts, apiKey) {
  const details = await tmdbDetails(candidate.tmdb_id, candidate.media_type, apiKey);
  const today = new Date().toISOString().slice(0, 10);
  const entry = {
    id: slugify(details.title, details.release_year),
    content_type: candidate.media_type === 'tv' ? 'tv' : 'movie',
    date_added: today,
    watched: false,
    editions: [
      {
        eid: 'e1',
        format: opts.format,
        notes: '',
        boxset: opts.boxset || '',
        location: opts.location || '',
        steelbook: false,
        wishlist: !!opts.wishlist,
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
  return entry;
}
