/**
 * Statistieken — Mijn Mediacollectie
 * ----------------------------------
 * Rekent de collectie (movies.json) en de prijsgeschiedenis
 * (price_history.json) om naar overzichtscijfers en grafieken.
 *
 * Bewust zonder externe grafiekbibliotheek: alle grafieken zijn handgemaakte
 * div-balken en inline SVG, in dezelfde stijl als de sparklines op de
 * prijzenpagina. Dat houdt de pagina snel en offline-vriendelijk.
 *
 * Verwacht dat assets/drive.js geladen is (driveLoadMovies, driveLoadPrices).
 */

const STATS_FORMAT_LABELS = { '4k': '4K UHD', bluray: 'Blu-ray', dvd: 'DVD' };
const STATS_FORMAT_COLORS = { '4k': '#C9A227', bluray: '#2FA4A9', dvd: '#8B8A92' };
const STATS_TYPE_LABELS = { movie: 'Films', tv: 'TV-reeksen', animation: 'Animatie' };

function statsEsc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Kleine rekenhulpjes ----------

function statsDecade(item) {
  const y = Number(item.release_year);
  if (!y || y < 1000) return null;
  return Math.floor(y / 10) * 10;
}

function statsDecadeLabel(decade) {
  return "jaren '" + String(decade).slice(2);
}

function statsMoney(value, currency) {
  const symbol = currency === 'EUR' || !currency ? '€' : currency + ' ';
  return symbol + value.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Laatste prijsnotering met een bruikbaar gemiddelde.
function statsLatestPrice(entry) {
  const history = (entry && entry.history) || [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] && history[i].ebay_avg != null) return history[i];
  }
  return null;
}

// ---------- Grafiek-bouwstenen ----------

// Horizontale balken: rows = [{ label, value, color?, sub? }]
function statsBarChart(rows, options = {}) {
  const valid = rows.filter((r) => r.value > 0 || options.keepZero);
  if (!valid.length) {
    return '<p class="text-sm text-muted py-4">Nog geen gegevens.</p>';
  }
  const max = Math.max(...valid.map((r) => r.value)) || 1;
  const total = valid.reduce((sum, r) => sum + r.value, 0) || 1;

  return (
    '<div class="space-y-2">' +
    valid
      .map((row) => {
        const width = Math.max((row.value / max) * 100, 1.5);
        const share = ((row.value / total) * 100).toFixed(0);
        const color = row.color || '#C9A227';
        return `
          <div class="flex items-center gap-2 sm:gap-3">
            <span class="w-20 sm:w-36 shrink-0 text-[11px] sm:text-xs font-mono text-muted truncate" title="${statsEsc(row.label)}">${statsEsc(row.label)}</span>
            <div class="flex-1 min-w-0 h-5 bg-bg rounded-sm overflow-hidden ring-1 ring-white/5">
              <div class="h-full rounded-sm" style="width:${width}%;background:${color}"></div>
            </div>
            <span class="w-16 sm:w-20 shrink-0 text-right text-[11px] sm:text-xs font-mono text-ink">
              ${row.sub != null ? statsEsc(row.sub) : row.value}
              ${options.showShare ? `<span class="text-muted"> ${share}%</span>` : ''}
            </span>
          </div>`;
      })
      .join('') +
    '</div>'
  );
}

// Lijngrafiek met gevulde vlak eronder. points = [{ label, value }]
function statsLineChart(points, options = {}) {
  if (points.length < 2) {
    return '<p class="text-sm text-muted py-4">Nog te weinig gegevens voor een grafiek (minstens twee maanden nodig).</p>';
  }
  const w = 720;
  const h = 200;
  const padLeft = 44;
  const padBottom = 26;
  const padTop = 12;
  const values = points.map((p) => p.value);
  const max = Math.max(...values) || 1;
  const stepX = (w - padLeft - 8) / (points.length - 1);
  const scaleY = (v) => padTop + (1 - v / max) * (h - padTop - padBottom);

  const coords = points.map((p, i) => [padLeft + i * stepX, scaleY(p.value)]);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${padLeft},${h - padBottom} ${line} ${(padLeft + (points.length - 1) * stepX).toFixed(1)},${h - padBottom}`;

  // Hooguit ~6 labels op de x-as, anders wordt het onleesbaar.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = points
    .map((p, i) =>
      i % labelStep === 0 || i === points.length - 1
        ? `<text x="${(padLeft + i * stepX).toFixed(1)}" y="${h - 8}" font-size="10" fill="#8B8A92" font-family="monospace" text-anchor="middle">${statsEsc(p.label)}</text>`
        : ''
    )
    .join('');

  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const y = scaleY(max * f);
      return `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${w - 8}" y2="${y.toFixed(1)}" stroke="rgba(242,240,234,0.08)" stroke-width="1" />
              <text x="${padLeft - 8}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#8B8A92" font-family="monospace" text-anchor="end">${Math.round(max * f)}</text>`;
    })
    .join('');

  const color = options.color || '#C9A227';
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full" role="img" aria-label="${statsEsc(options.aria || 'Grafiek')}">
    ${gridLines}
    <polygon points="${area}" fill="${color}" opacity="0.12" />
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${xLabels}
  </svg>`;
}

// Verhoudingsbalk (bv. bekeken / niet bekeken)
function statsRatioBar(parts) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return '<p class="text-sm text-muted py-4">Nog geen gegevens.</p>';
  return `
    <div class="flex h-7 rounded-md overflow-hidden ring-1 ring-white/5">
      ${parts
        .map((p) =>
          p.value
            ? `<div style="width:${(p.value / total) * 100}%;background:${p.color}" title="${statsEsc(p.label)}: ${p.value}"></div>`
            : ''
        )
        .join('')}
    </div>
    <div class="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs font-mono">
      ${parts
        .map(
          (p) => `<span class="flex items-center gap-1.5 text-muted">
            <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${p.color}"></span>
            ${statsEsc(p.label)} <span class="text-ink">${p.value}</span>
            <span>(${((p.value / total) * 100).toFixed(0)}%)</span>
          </span>`
        )
        .join('')}
    </div>`;
}

function statsKpi(label, value, sub) {
  return `
    <div class="bg-surface rounded-lg p-4 ring-1 ring-white/5">
      <p class="text-xs font-mono uppercase text-muted tracking-wide">${statsEsc(label)}</p>
      <p class="font-display text-4xl tracking-wide text-ink mt-1 leading-none">${statsEsc(value)}</p>
      ${sub ? `<p class="text-xs text-muted font-mono mt-1">${statsEsc(sub)}</p>` : ''}
    </div>`;
}

// ---------- Hoofdfunctie ----------

async function initStatsPage() {
  const els = {
    kpis: document.getElementById('stats-kpis'),
    formats: document.getElementById('chart-formats'),
    types: document.getElementById('chart-types'),
    decades: document.getElementById('chart-decades'),
    genres: document.getElementById('chart-genres'),
    growth: document.getElementById('chart-growth'),
    growthNote: document.getElementById('growth-note'),
    watched: document.getElementById('chart-watched'),
    watchedPerFormat: document.getElementById('chart-watched-format'),
    value: document.getElementById('value-block'),
    scopeChips: document.getElementById('scope-chips'),
  };

  const { movies } = await driveLoadMovies();

  // Prijzen zijn optioneel: zonder prijsdata werkt de rest gewoon.
  let prices = [];
  try {
    prices = (await driveLoadPrices()).prices;
  } catch (e) {
    console.warn('Prijsgegevens niet beschikbaar:', e);
  }

  const state = { scope: 'owned' }; // 'owned' | 'all'

  function scoped() {
    return state.scope === 'owned' ? movies.filter((m) => !m.wishlist) : movies;
  }

  function renderKpis(list) {
    const owned = movies.filter((m) => !m.wishlist).length;
    const wish = movies.filter((m) => m.wishlist).length;
    const watched = list.filter((m) => m.watched).length;
    const watchedPct = list.length ? Math.round((watched / list.length) * 100) : 0;

    // Speelduur: films tellen hun eigen runtime; bij reeksen rekenen we de
    // afleveringen van de seizoenen die je bezit mee (runtime = afleveringsduur).
    let minutes = 0;
    list.forEach((m) => {
      const rt = Number(m.runtime) || 0;
      if (m.seasons && m.seasons.length) {
        m.seasons.filter((s) => s.owned).forEach((s) => { minutes += rt * (Number(s.episode_count) || 0); });
      } else {
        minutes += rt;
      }
    });
    const days = minutes / 60 / 24;

    els.kpis.innerHTML = [
      statsKpi('Titels in beeld', String(list.length), state.scope === 'owned' ? 'enkel in bezit' : 'incl. verlanglijst'),
      statsKpi('In bezit', String(owned), wish ? `${wish} op verlanglijst` : 'geen verlanglijst'),
      statsKpi('Bekeken', watchedPct + '%', `${watched} van ${list.length}`),
      statsKpi('Speelduur', Math.round(minutes / 60).toLocaleString('nl-BE') + ' u', days >= 1 ? `≈ ${days.toFixed(1)} dagen non-stop` : ''),
    ].join('');
  }

  function renderFormats(list) {
    const counts = {};
    list.forEach((m) => {
      // Bij reeksen telt elk seizoen dat je bezit mee in zijn eigen formaat;
      // bij films elk exemplaar (dezelfde film op DVD én 4K telt dus dubbel).
      if (m.seasons && m.seasons.some((s) => s.owned)) {
        m.seasons.filter((s) => s.owned).forEach((s) => {
          const f = s.format || m.format;
          counts[f] = (counts[f] || 0) + 1;
        });
      } else {
        (m.editions || [{ format: m.format, wishlist: m.wishlist }])
          .filter((e) => !e.wishlist)
          .forEach((e) => {
            counts[e.format] = (counts[e.format] || 0) + 1;
          });
      }
    });
    const rows = (typeof MEDIA_FORMATS !== 'undefined' ? MEDIA_FORMATS : [])
      .filter((f) => counts[f.value])
      .map((f) => ({ label: f.label, value: counts[f.value], color: f.color }));
    els.formats.innerHTML = statsBarChart(rows, { showShare: true });
  }

  function renderTypes(list) {
    const counts = {};
    list.forEach((m) => { counts[m.content_type] = (counts[m.content_type] || 0) + 1; });
    const rows = Object.keys(STATS_TYPE_LABELS).map((t) => ({
      label: STATS_TYPE_LABELS[t],
      value: counts[t] || 0,
      color: '#2FA4A9',
    }));
    els.types.innerHTML = statsBarChart(rows, { showShare: true });
  }

  function renderDecades(list) {
    const counts = {};
    let unknown = 0;
    list.forEach((m) => {
      const d = statsDecade(m);
      if (d === null) unknown++;
      else counts[d] = (counts[d] || 0) + 1;
    });
    const rows = Object.keys(counts)
      .map(Number)
      .sort((a, b) => a - b)
      .map((d) => ({ label: statsDecadeLabel(d), value: counts[d], color: '#C9A227' }));
    if (unknown) rows.push({ label: 'onbekend', value: unknown, color: '#8B8A92' });
    els.decades.innerHTML = statsBarChart(rows, { showShare: true });
  }

  function renderGenres(list) {
    const counts = {};
    list.forEach((m) => (m.genres || []).forEach((g) => { counts[g] = (counts[g] || 0) + 1; }));
    const rows = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, value]) => ({ label, value, color: '#2FA4A9' }));
    els.genres.innerHTML = statsBarChart(rows);
  }

  function renderGrowth(list) {
    // Per maand groeperen op date_added; daarna cumulatief optellen.
    const perMonth = {};
    let missing = 0;
    list.forEach((m) => {
      const raw = m.date_added;
      const d = raw ? new Date(raw) : null;
      if (!d || isNaN(d)) { missing++; return; }
      const key = d.toISOString().slice(0, 7); // YYYY-MM
      perMonth[key] = (perMonth[key] || 0) + 1;
    });

    const keys = Object.keys(perMonth).sort();
    if (!keys.length) {
      els.growth.innerHTML = '<p class="text-sm text-muted py-4">Nog geen datums beschikbaar.</p>';
      els.growthNote.textContent = '';
      return;
    }

    // Ontbrekende maanden aanvullen, zodat de lijn de echte tijdas volgt.
    const points = [];
    let running = 0;
    const [startY, startM] = keys[0].split('-').map(Number);
    const [endY, endM] = keys[keys.length - 1].split('-').map(Number);
    const monthNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    for (let y = startY, mth = startM; y < endY || (y === endY && mth <= endM); ) {
      const key = `${y}-${String(mth).padStart(2, '0')}`;
      running += perMonth[key] || 0;
      points.push({ label: `${monthNames[mth - 1]} '${String(y).slice(2)}`, value: running });
      mth++;
      if (mth > 12) { mth = 1; y++; }
    }

    els.growth.innerHTML = statsLineChart(points, { aria: 'Groei van de collectie over tijd' });

    const busiest = keys.reduce((best, k) => (perMonth[k] > perMonth[best] ? k : best), keys[0]);
    const [by, bm] = busiest.split('-').map(Number);
    els.growthNote.textContent =
      `Drukste maand: ${monthNames[bm - 1]} ${by} (${perMonth[busiest]} titels).` +
      (missing ? ` ${missing} titel(s) zonder toevoegdatum zijn niet meegeteld.` : '');
  }

  function renderWatched(list) {
    const watched = list.filter((m) => m.watched).length;
    els.watched.innerHTML = statsRatioBar([
      { label: 'Bekeken', value: watched, color: '#2FA4A9' },
      { label: 'Nog te kijken', value: list.length - watched, color: '#3A3A45' },
    ]);

    const formats = typeof MEDIA_FORMATS !== 'undefined' ? MEDIA_FORMATS : [];
    const rows = formats
      .map((f) => {
        // Een titel telt mee bij elk formaat waarin je haar bezit.
        const inFormat = list.filter((m) =>
          (m.editions || [{ format: m.format, wishlist: m.wishlist }]).some(
            (e) => !e.wishlist && e.format === f.value
          )
        );
        const seen = inFormat.filter((m) => m.watched).length;
        return {
          label: f.label,
          value: inFormat.length ? Math.round((seen / inFormat.length) * 100) : 0,
          sub: inFormat.length ? `${seen}/${inFormat.length}` : '—',
          color: f.color,
          _has: inFormat.length,
        };
      })
      .filter((r) => r._has);
    els.watchedPerFormat.innerHTML = statsBarChart(rows, { keepZero: true });
  }

  function renderValue(list) {
    const byId = {};
    prices.forEach((p) => { byId[p.id] = p; });

    const valued = [];
    let currency = 'EUR';
    list.forEach((m) => {
      const last = statsLatestPrice(byId[m.id]);
      if (!last) return;
      if (last.ebay_currency) currency = last.ebay_currency;
      valued.push({ title: m.title, year: m.release_year, format: m.format, value: Number(last.ebay_avg), date: last.date });
    });

    if (!valued.length) {
      els.value.innerHTML = `
        <p class="text-sm text-muted">
          Nog geen prijsdata. Ga naar <a href="prijzen.html" class="text-gold underline">Prijzen</a> en klik op
          “Ververs prijzen” — daarna verschijnt hier de geschatte waarde van je collectie.
        </p>`;
      return;
    }

    const total = valued.reduce((sum, v) => sum + v.value, 0);
    const average = total / valued.length;
    const coverage = Math.round((valued.length / list.length) * 100);
    // Ruwe extrapolatie naar de volledige selectie, op basis van het gemiddelde.
    const projected = average * list.length;
    const top = [...valued].sort((a, b) => b.value - a.value).slice(0, 5);
    const oldest = valued.reduce((o, v) => (String(v.date) < String(o.date) ? v : o), valued[0]);

    els.value.innerHTML = `
      <div class="grid sm:grid-cols-3 gap-4 mb-5">
        ${statsKpi('Waarde met prijsdata', statsMoney(total, currency), `${valued.length} van ${list.length} titels (${coverage}%)`)}
        ${statsKpi('Gemiddeld per titel', statsMoney(average, currency), 'op basis van eBay-vraagprijzen')}
        ${statsKpi('Geschat totaal', statsMoney(projected, currency), 'hele selectie, geëxtrapoleerd')}
      </div>

      <p class="text-xs font-mono uppercase text-muted mb-2">Duurste titels</p>
      ${statsBarChart(
        top.map((t) => ({
          label: `${t.title}${t.year ? ' (' + t.year + ')' : ''}`,
          value: t.value,
          sub: statsMoney(t.value, currency),
          color: STATS_FORMAT_COLORS[t.format] || '#C9A227',
        }))
      )}

      <p class="text-xs text-muted mt-4 leading-relaxed">
        Schatting op basis van actieve eBay-vraagprijzen, niet van bevestigde verkopen — beschouw dit als een
        indicatie, geen taxatie. Oudste gebruikte notering: ${statsEsc(oldest.date || 'onbekend')}.
        Het geschatte totaal rekent het gemiddelde door naar titels zonder prijsdata en is dus het minst betrouwbare cijfer.
      </p>`;
  }

  function renderAll() {
    const list = scoped();
    renderKpis(list);
    renderFormats(list);
    renderTypes(list);
    renderDecades(list);
    renderGenres(list);
    renderGrowth(list);
    renderWatched(list);
    renderValue(list);
  }

  // Schakelaar: enkel wat je bezit, of ook je verlanglijst.
  if (els.scopeChips) {
    els.scopeChips.querySelectorAll('[data-scope]').forEach((chip) => {
      chip.classList.toggle('chip-active', chip.dataset.scope === state.scope);
      chip.addEventListener('click', () => {
        state.scope = chip.dataset.scope;
        els.scopeChips.querySelectorAll('[data-scope]').forEach((c) => {
          c.classList.toggle('chip-active', c.dataset.scope === state.scope);
        });
        renderAll();
      });
    });
  }

  renderAll();
}
