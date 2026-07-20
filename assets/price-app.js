/**
 * Prijstracker — toont per gevolgde titel de laatste eBay-prijsrange/
 * gemiddelde, een trendlijntje en (indien aanwezig) de bol.com-nieuwprijs.
 *
 * Tussenfase 'prijzen live': de prijzen worden nu rechtstreeks vanuit de
 * browser ververst via jouw Cloudflare Worker (het veilige doorgeefluik naar
 * eBay) — geen Python-script meer nodig. Bij het verversen wordt je hele
 * collectie automatisch mee gevolgd; extra (verlanglijst-)titels voeg je toe
 * via 'Volg extra titel' op de pagina.
 *
 * Verwacht dat assets/drive.js (Drive-functies) en assets/admin.js
 * (TMDb-functies, slugify, getConfig) al geladen zijn.
 */

const POSTER_BASE_PRICES = 'https://image.tmdb.org/t/p/w200';

const FORMAT_KEYWORDS_PRICES = { '4k': '4K UHD', bluray: 'Blu-ray', dvd: 'DVD' };

function initPriceTracker() {
  const state = { all: [], sort: 'updated_desc' };

  const els = {
    grid: document.getElementById('price-grid'),
    empty: document.getElementById('price-empty'),
    count: document.getElementById('price-count'),
    sort: document.getElementById('price-sort'),
  };

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function load() {
    const loader =
      typeof window.__priceTrackerLoadData === 'function'
        ? window.__priceTrackerLoadData()
        : fetch('data/price_history.json').then((r) => r.json());

    return loader
      .then((data) => {
        state.all = Array.isArray(data) ? data : [];
        render();
      })
      .catch((err) => {
        els.grid.innerHTML = '<p class="col-span-full text-center text-[#8B8A92] py-16">Kon de prijsgegevens niet laden.</p>';
        console.error(err);
      });
  }
  window.__priceReload = load;
  load();

  els.sort.addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  function latest(entry) {
    return entry.history && entry.history.length ? entry.history[entry.history.length - 1] : null;
  }

  function trend(entry) {
    if (!entry.history || entry.history.length < 2) return 0;
    const last = latest(entry).ebay_avg;
    const prev = entry.history[entry.history.length - 2].ebay_avg;
    if (last == null || prev == null) return 0;
    return last - prev;
  }

  function sortedList() {
    const list = [...state.all];
    const lastAvg = (e) => (latest(e) ? latest(e).ebay_avg || 0 : 0);
    const lastDate = (e) => (latest(e) ? latest(e).date || '' : '');
    switch (state.sort) {
      case 'title_asc':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'price_desc':
        return list.sort((a, b) => lastAvg(b) - lastAvg(a));
      case 'price_asc':
        return list.sort((a, b) => lastAvg(a) - lastAvg(b));
      case 'trend_desc':
        return list.sort((a, b) => trend(b) - trend(a));
      case 'updated_desc':
      default:
        return list.sort((a, b) => String(lastDate(b)).localeCompare(String(lastDate(a))));
    }
  }

  function sparkline(entry) {
    const values = (entry.history || []).map((h) => h.ebay_avg).filter((v) => v != null);
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 160;
    const h = 40;
    const step = w / (values.length - 1);
    const points = values
      .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
      .join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-10">
      <polyline points="${points}" fill="none" stroke="#2FA4A9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
  }

  function trendBadge(entry) {
    const t = trend(entry);
    if (Math.abs(t) < 0.5) return '<span class="text-muted font-mono text-xs">→ stabiel</span>';
    if (t > 0) return `<span class="text-[#C9A227] font-mono text-xs">↑ +${t.toFixed(2)}</span>`;
    return `<span class="text-[#2FA4A9] font-mono text-xs">↓ ${t.toFixed(2)}</span>`;
  }

  function render() {
    const list = sortedList();
    els.count.textContent = list.length + ' gevolgde titel' + (list.length === 1 ? '' : 's');
    els.empty.classList.toggle('hidden', list.length !== 0);

    els.grid.innerHTML = list.map((entry) => {
      const last = latest(entry);
      const cover = entry.poster_path ? POSTER_BASE_PRICES + entry.poster_path : '';
      const priceBlock = last
        ? `
            <p class="text-xs text-muted font-mono mb-2">${esc(entry.release_year || '')} — bijgewerkt ${esc(last.date || '')}</p>
            <p class="text-sm">
              <span class="font-mono text-ink">${last.ebay_low ?? '—'}–${last.ebay_high ?? '—'} ${esc(last.ebay_currency || '')}</span>
              <span class="text-muted"> · gem. </span><span class="font-mono text-gold">${last.ebay_avg ?? '—'}</span>
              ${trendBadge(entry)}
            </p>
            ${last.bol_new_price ? `<p class="text-xs text-muted font-mono">bol.com nieuw: €${esc(last.bol_new_price)}</p>` : ''}
            <div class="mt-2">${sparkline(entry)}</div>
          `
        : `
            <p class="text-xs text-muted font-mono mb-2">${esc(entry.release_year || '')}</p>
            <p class="text-sm text-muted">Nog geen prijsdata — klik op "Ververs prijzen".</p>
          `;
      return `
        <div class="bg-surface rounded-lg p-4 flex gap-4 ring-1 ring-white/5">
          <div class="w-16 shrink-0 rounded overflow-hidden aspect-[2/3] bg-[#14141A]">
            ${cover ? `<img src="${esc(cover)}" class="w-full h-full object-cover" loading="lazy" alt="${esc(entry.title)}">` : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <p class="font-display text-xl tracking-wide truncate">${esc(entry.title)}</p>
              ${entry.owned ? '<span class="chip chip-active shrink-0 !text-[10px] !py-0.5">In collectie</span>' : '<span class="chip shrink-0 !text-[10px] !py-0.5">Verlanglijst</span>'}
            </div>
            ${priceBlock}
          </div>
        </div>
      `;
    }).join('');
  }
}

// ---------- Prijzen verversen via de Cloudflare Worker ----------

/**
 * Ververst de prijzen van alle gevolgde titels: je volledige collectie
 * (automatisch) + extra verlanglijst-titels die al in de tracker zitten.
 * Eén datapunt per dag per titel; vandaag opnieuw verversen overschrijft
 * het datapunt van vandaag.
 *
 * onProgress(huidige, totaal, titel) wordt per titel aangeroepen.
 */
async function priceRefreshAll(workerUrl, markt, onProgress) {
  const { movies } = await driveLoadMovies();
  const { prices } = await driveLoadPrices();
  const byId = {};
  prices.forEach((p) => { byId[p.id] = p; });

  // Gevolgde titels = hele collectie + extra titels die al in de tracker zitten.
  // Collectie-titels die op je verlanglijst staan (wishlist=true) tellen als
  // 'Verlanglijst' in de tracker, niet als 'In collectie'.
  const tracked = {};
  movies.forEach((m) => {
    tracked[m.id] = {
      id: m.id,
      title: m.title,
      release_year: m.release_year,
      poster_path: m.poster_path || '',
      format: m.format,
      owned: !m.wishlist,
    };
  });
  prices.forEach((h) => {
    if (!tracked[h.id]) {
      tracked[h.id] = {
        id: h.id,
        title: h.title,
        release_year: h.release_year,
        poster_path: h.poster_path || '',
        format: h.format || 'bluray',
        owned: false,
      };
    }
  });

  const list = Object.values(tracked);
  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (onProgress) onProgress(i + 1, list.length, t.title);

    const formatWord = FORMAT_KEYWORDS_PRICES[t.format] || '';
    const q = `${t.title} ${t.release_year || ''} ${formatWord}`.trim();

    let data = null;
    try {
      const resp = await fetch(`${workerUrl}?q=${encodeURIComponent(q)}&markt=${encodeURIComponent(markt)}`);
      const body = await resp.json();
      if (!resp.ok) throw new Error(body.error || 'fout ' + resp.status);
      if (body.found) data = body;
    } catch (err) {
      console.warn('Prijs ophalen mislukt voor', t.title, err);
    }

    if (!data) {
      skipped++;
      continue;
    }

    const entry =
      byId[t.id] ||
      (byId[t.id] = {
        id: t.id,
        title: t.title,
        release_year: t.release_year,
        poster_path: t.poster_path,
        format: t.format,
        owned: t.owned,
        history: [],
      });
    entry.owned = t.owned; // kan wijzigen als een verlanglijst-titel intussen gekocht is
    if (!entry.format) entry.format = t.format;

    entry.history = (entry.history || []).filter((h) => h.date !== today);
    entry.history.push({
      date: today,
      ebay_low: data.ebay_low,
      ebay_high: data.ebay_high,
      ebay_avg: data.ebay_avg,
      ebay_currency: data.ebay_currency,
      ebay_count: data.ebay_count,
    });
    updated++;

    // Nette throttle richting eBay.
    await new Promise((r) => setTimeout(r, 300));
  }

  await withWriteLock(() => driveSaveNamedFile('price_history.json', Object.values(byId)));
  return { updated, skipped, total: list.length };
}

/**
 * Voegt een titel toe aan de prijstracker zonder ze aan je collectie toe te
 * voegen (verlanglijst). details = resultaat van tmdbDetails().
 */
async function priceTrackNewTitle(details, format) {
  const slug = slugify(details.title, details.release_year);
  const { prices } = await driveLoadPrices();
  if (prices.some((p) => p.id === slug)) return { status: 'bestaat', id: slug, title: details.title };

  prices.push({
    id: slug,
    title: details.title,
    release_year: details.release_year,
    poster_path: details.poster_path || '',
    format: format || 'bluray',
    owned: false,
    history: [],
  });
  await withWriteLock(() => driveSaveNamedFile('price_history.json', prices));
  return { status: 'toegevoegd', id: slug, title: details.title };
}

/**
 * Verwijdert een titel uit de prijstracker (enkel de prijsopvolging; je
 * collectie zelf blijft ongemoeid — al keert een collectie-titel bij de
 * volgende verversing automatisch terug).
 */
async function priceUntrackTitle(id) {
  const { prices } = await driveLoadPrices();
  const filtered = prices.filter((p) => p.id !== id);
  await withWriteLock(() => driveSaveNamedFile('price_history.json', filtered));
}
