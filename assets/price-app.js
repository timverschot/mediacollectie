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

// Korte namen voor de marktplaatsen in de weergave.
const MARKET_LABELS = {
  EBAY_NL: 'NL',
  EBAY_BE: 'BE',
  EBAY_DE: 'DE',
  EBAY_GB: 'UK',
  EBAY_FR: 'FR',
  EBAY_US: 'US',
};

// Zoekwoord per formaat, gebruikt in de eBay-zoekopdracht.
const FORMAT_KEYWORDS_PRICES = {
  '4k': '4K UHD',
  bluray3d: '3D Blu-ray',
  bluray: 'Blu-ray',
  dvd: 'DVD',
  laserdisc: 'Laserdisc',
  vhs: 'VHS',
};

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
        // Gearchiveerde regels (bv. hele-serie-metingen van vóór de
        // seizoensopdeling) blijven in het bestand staan, maar tonen we niet.
        state.all = (Array.isArray(data) ? data : []).filter((e) => !e.archived);
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

  // De richtprijs van een meting: sinds fase 9 de mediaan, daarvoor het
  // gemiddelde. Zo blijven oude metingen gewoon leesbaar in de grafiek.
  function pointValue(h) {
    if (!h) return null;
    return h.ebay_median != null ? h.ebay_median : h.ebay_avg;
  }

  function trend(entry) {
    if (!entry.history || entry.history.length < 2) return 0;
    const last = pointValue(latest(entry));
    const prev = pointValue(entry.history[entry.history.length - 2]);
    if (last == null || prev == null) return 0;
    return last - prev;
  }

  function sortedList() {
    const list = [...state.all];
    const lastAvg = (e) => (latest(e) ? pointValue(latest(e)) || 0 : 0);
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
    const values = (entry.history || []).map(pointValue).filter((v) => v != null);
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

  // Vergelijking tussen markten, bv. "NL €16,50 · DE €13,95 · UK £11,00".
  // Munten worden bewust niet omgerekend of gemengd.
  function marketsLine(h) {
    if (!h || !h.markets) return '';
    const parts = Object.entries(h.markets)
      .filter(([, v]) => v && v.median != null)
      .map(([k, v]) => {
        const sym = v.currency === 'EUR' ? '€' : v.currency === 'GBP' ? '£' : v.currency + ' ';
        return `${esc(MARKET_LABELS[k] || k)} ${sym}${v.median}`;
      });
    if (parts.length < 2) return '';
    return `<p class="text-[11px] text-muted font-mono mt-0.5">${parts.join(' · ')}</p>`;
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
      const cur = esc(last && last.ebay_currency === 'EUR' ? '€' : (last && last.ebay_currency) || '');
      const median = last ? pointValue(last) : null;
      const hasRange = last && last.ebay_q1 != null && last.ebay_q3 != null;

      const priceBlock = last
        ? `
            <p class="text-xs text-muted font-mono mb-2">${esc(entry.release_year || '')} · ${esc(
            FORMAT_KEYWORDS_PRICES[entry.format] || entry.format || ''
          )} — bijgewerkt ${esc(last.date || '')}</p>
            <p class="text-sm flex flex-wrap items-baseline gap-x-2">
              <span class="font-mono text-gold text-lg">${cur}${median != null ? median : '—'}</span>
              ${
                hasRange
                  ? `<span class="font-mono text-muted text-xs">midden ${cur}${last.ebay_q1}–${cur}${last.ebay_q3}</span>`
                  : `<span class="font-mono text-muted text-xs">${cur}${last.ebay_low ?? '—'}–${cur}${last.ebay_high ?? '—'}</span>`
              }
              ${trendBadge(entry)}
            </p>
            <p class="text-[11px] text-muted font-mono">${last.ebay_count ?? '?'} advertenties${
            last.ebay_primary_market ? ' · ' + esc(MARKET_LABELS[last.ebay_primary_market] || last.ebay_primary_market) : ''
          }${
            last.ebay_filter_level && last.ebay_filter_level !== 'strikt'
              ? ' · ruwe schatting (' + esc(last.ebay_filter_level) + ')'
              : ''
          }</p>
            ${marketsLine(last)}
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
              <p class="font-display text-xl tracking-wide truncate">${esc(entry.label || entry.title)}</p>
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
/**
 * Bouwt de eBay-zoekterm voor één gevolgd exemplaar.
 *
 * - Film: titel + jaar + formaat. Het jaartal helpt hier om verwarring tussen
 *   remakes te vermijden.
 * - Seizoen van een serie: titel + "season N" + formaat, zonder jaartal. Het
 *   jaar van eerste uitzending staat zelden in een advertentie voor seizoen 4.
 * - Serie zonder seizoensgegevens: titel + "complete series" + formaat.
 */
function buildPriceQuery(t) {
  const formatWord = FORMAT_KEYWORDS_PRICES[t.format] || '';
  if (t.season) return `${t.title} season ${t.season} ${formatWord}`.replace(/\s+/g, ' ').trim();
  if (t.whole_series) return `${t.title} complete series ${formatWord}`.replace(/\s+/g, ' ').trim();
  return `${t.title} ${t.release_year || ''} ${formatWord}`.replace(/\s+/g, ' ').trim();
}

async function priceRefreshAll(workerUrl, markt, onProgress) {
  const { movies } = await driveLoadMovies();
  const { prices } = await driveLoadPrices();

  // Fase 9: prijzen worden per EXEMPLAAR bijgehouden, want een DVD en een 4K
  // van dezelfde film zijn heel verschillend geprijsd. De sleutel is
  // "titel-id|formaat". Oude gegevens (sleutel = enkel het titel-id) worden
  // hier eenmalig omgezet naar het formaat dat je toen bezat.
  const byId = {};
  prices.forEach((p) => {
    if (p.id && p.id.includes('|')) {
      byId[p.id] = p;
      return;
    }
    const movie = movies.find((m) => m.id === p.id);
    const fmt = (movie && movie.format) || p.format || 'bluray';
    const newId = p.id + '|' + fmt;
    byId[newId] = { ...p, id: newId, movie_id: p.id, format: fmt };
  });

  // Gevolgde exemplaren = alles wat je bezit of op je verlanglijst hebt,
  // plus losse titels die al in de tracker zaten.
  const tracked = {};
  movies.forEach((m) => {
    normalizeMovieEntry(m);
    const ownedSeasons = (m.seasons || []).filter((s) => s.owned);

    if (ownedSeasons.length) {
      // Series: per seizoen meten. Een losse seizoensbox en een complete
      // reeks zijn heel verschillend geprijsd; door "seizoen N" in de
      // zoekterm te zetten vergelijk je appels met appels. Het jaartal laten
      // we weg — dat is de eerste uitzending en staat zelden in advertenties.
      ownedSeasons.forEach((s) => {
        const fmt = s.format || m.format;
        const key = `${m.id}|${fmt}|s${s.season_number}`;
        tracked[key] = {
          id: key,
          movie_id: m.id,
          title: m.title,
          label: `${m.title} — seizoen ${s.season_number}`,
          release_year: m.release_year,
          poster_path: m.poster_path || '',
          format: fmt,
          season: s.season_number,
          owned: true,
        };
      });
      return;
    }

    m.editions.forEach((ed) => {
      const key = m.id + '|' + ed.format;
      tracked[key] = {
        id: key,
        movie_id: m.id,
        title: m.title,
        label: m.title,
        release_year: m.release_year,
        poster_path: m.poster_path || '',
        format: ed.format,
        // Series zonder seizoensgegevens: als geheel opvragen.
        whole_series: m.content_type === 'tv',
        owned: !ed.wishlist,
      };
    });
  });
  // Titels die we nu per seizoen volgen, hadden vroeger één meting voor de
  // hele serie. Die oude regel meet iets anders en hoort niet meer thuis in de
  // lijst — anders blijft ze staan met het onjuiste label 'verlanglijst'.
  // We verwijderen niets: de geschiedenis blijft bewaard, maar de regel wordt
  // gearchiveerd en niet meer getoond of bijgewerkt.
  const perSeasonMovies = new Set();
  Object.values(tracked).forEach((t) => {
    if (t.season) perSeasonMovies.add(t.movie_id);
  });

  Object.values(byId).forEach((h) => {
    const movieId = h.movie_id || String(h.id).split('|')[0];
    if (!tracked[h.id] && perSeasonMovies.has(movieId)) {
      h.archived = true;
      h.archived_reason = 'vervangen door metingen per seizoen';
      return;
    }
    if (!tracked[h.id]) {
      tracked[h.id] = {
        id: h.id,
        movie_id: movieId,
        title: h.title,
        label: h.label || h.title,
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

    const q = buildPriceQuery(t);

    let data = null;
    try {
      // Het formaat gaat apart mee zodat de Worker advertenties kan weren die
      // wel de titel maar niet het juiste formaat bevatten.
      const resp = await fetch(
        `${workerUrl}?q=${encodeURIComponent(q)}&markt=${encodeURIComponent(markt)}&formaat=${encodeURIComponent(t.format || '')}`
      );
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
        movie_id: t.movie_id,
        title: t.title,
        label: t.label || t.title,
        season: t.season || null,
        release_year: t.release_year,
        poster_path: t.poster_path,
        format: t.format,
        owned: t.owned,
        history: [],
      });
    entry.owned = t.owned; // kan wijzigen als een verlanglijst-titel intussen gekocht is
    if (!entry.format) entry.format = t.format;
    if (!entry.movie_id) entry.movie_id = t.movie_id;

    entry.history = (entry.history || []).filter((h) => h.date !== today);
    entry.history.push({
      date: today,
      ebay_median: data.ebay_median,
      ebay_q1: data.ebay_q1,
      ebay_q3: data.ebay_q3,
      ebay_low: data.ebay_low,
      ebay_high: data.ebay_high,
      ebay_avg: data.ebay_avg,
      ebay_currency: data.ebay_currency,
      ebay_count: data.ebay_count,
      ebay_filter_level: data.ebay_filter_level,
      ebay_primary_market: data.ebay_primary_market,
      // Per markt bewaren we alleen de kerncijfers, anders groeit het bestand
      // onnodig hard bij wekelijks meten.
      markets: data.markets
        ? Object.fromEntries(
            Object.entries(data.markets)
              .filter(([, v]) => v && v.found)
              .map(([k, v]) => [k, { median: v.ebay_median, currency: v.ebay_currency, count: v.ebay_count }])
          )
        : undefined,
    });
    updated++;

    // Nette throttle richting eBay.
    await new Promise((r) => setTimeout(r, 300));
  }

  await withWriteLock(() => driveSaveNamedFile('price_history.json', Object.values(byId)));
  return { updated, skipped, total: list.length };
}

/* ==========================================================================
 * Verzekeringsoverzicht (fase 9)
 * ==========================================================================
 * Een regel per fysiek exemplaar dat je bezit, met de laatst bekende
 * richtprijs. Bedoeld om bij je verzekeringspapieren te bewaren of aan een
 * expert te geven na brand, diefstal of waterschade.
 * ========================================================================== */

async function buildInsuranceRows() {
  const { movies } = await driveLoadMovies();
  const { prices } = await driveLoadPrices();

  const priceByKey = {};
  prices.forEach((p) => {
    priceByKey[p.id] = p;
  });

  // Gearchiveerde metingen (bv. hele-serie-prijzen van vóór de seizoensopdeling)
  // tellen niet mee; het exemplaar zelf blijft wel in het overzicht staan.
  const priceFor = (...keys) => {
    for (const k of keys) {
      const e = priceByKey[k];
      if (e && !e.archived && e.history && e.history.length) return e.history[e.history.length - 1];
    }
    return null;
  };

  const rows = [];
  movies.forEach((m) => {
    normalizeMovieEntry(m);
    const ownedSeasons = (m.seasons || []).filter((s) => s.owned);

    if (ownedSeasons.length) {
      // Series: één regel per seizoen dat je bezit.
      const ed = m.editions[0] || {};
      ownedSeasons.forEach((s) => {
        const fmt = s.format || m.format;
        const last = priceFor(`${m.id}|${fmt}|s${s.season_number}`, `${m.id}|${fmt}`, m.id);
        const value = last ? (last.ebay_median != null ? last.ebay_median : last.ebay_avg) : null;
        const low = last ? (last.ebay_q1 != null ? last.ebay_q1 : last.ebay_low != null ? last.ebay_low : value) : null;
        rows.push({
          title: `${m.title} — seizoen ${s.season_number}`,
          year: m.release_year || '',
          format: formatLabel(fmt),
          steelbook: '',
          boxset: ed.boxset || '',
          notes: s.name || '',
          acquired: ed.date_added || '',
          value,
          low,
          currency: (last && last.ebay_currency) || 'EUR',
          measured: (last && last.date) || '',
        });
      });
      return;
    }

    m.editions.forEach((ed) => {
      if (ed.wishlist) return; // verlanglijst bezit je niet

      const last = priceFor(`${m.id}|${ed.format}`, m.id);
      const value = last ? (last.ebay_median != null ? last.ebay_median : last.ebay_avg) : null;

      rows.push({
        title: m.title,
        year: m.release_year || '',
        format: formatLabel(ed.format),
        steelbook: ed.steelbook ? 'ja' : '',
        boxset: ed.boxset || '',
        notes: ed.notes || '',
        acquired: ed.date_added || '',
        value,
        low,
        currency: (last && last.ebay_currency) || 'EUR',
        measured: (last && last.date) || '',
      });
    });
  });

  rows.sort((a, b) => (b.value || 0) - (a.value || 0));
  return rows;
}

/**
 * Totalen per munt. Ponden en euro's mogen niet bij elkaar opgeteld worden;
 * de hoofdmunt is die met de meeste exemplaren, de rest wordt apart gemeld.
 *
 * Naast de richtwaarde (som van de medianen) berekenen we een voorzichtige
 * ondergrens (som van de eerste kwartielen): wat je realistisch minstens
 * voor je collectie zou krijgen.
 */
function insuranceTotals(rows) {
  const priced = rows.filter((r) => r.value != null);

  const byCurrency = {};
  priced.forEach((r) => {
    const c = (byCurrency[r.currency] = byCurrency[r.currency] || { items: 0, total: 0, low: 0 });
    c.items++;
    c.total += r.value;
    c.low += r.low != null ? r.low : r.value;
  });

  const currencies = Object.keys(byCurrency).sort((a, b) => byCurrency[b].items - byCurrency[a].items);
  const currency = currencies[0] || 'EUR';
  const main = byCurrency[currency] || { items: 0, total: 0, low: 0 };
  const average = main.items ? main.total / main.items : 0;
  const r2 = (n) => Math.round(n * 100) / 100;

  return {
    items: rows.length,
    priced: main.items,
    total: r2(main.total),
    lowTotal: r2(main.low),
    average: r2(average),
    // Ruwe schatting voor exemplaren zonder prijsdata, op basis van het gemiddelde.
    projected: r2(average * rows.length),
    currency,
    otherCurrencies: currencies.slice(1).map((c) => ({
      currency: c,
      items: byCurrency[c].items,
      total: r2(byCurrency[c].total),
      lowTotal: r2(byCurrency[c].low),
    })),
  };
}

function insuranceCsv(rows, totals) {
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [];
  const num = (v) => (v != null ? String(v).replace('.', ',') : '');
  lines.push(
    ['Titel', 'Jaar', 'Formaat', 'Steelbook', 'Boxset', 'Opmerkingen', 'In bezit sinds', 'Richtwaarde', 'Ondergrens', 'Munt', 'Prijs gemeten op'].join(';')
  );
  rows.forEach((r) => {
    lines.push(
      [r.title, r.year, r.format, r.steelbook, r.boxset, r.notes, r.acquired, num(r.value), num(r.low), r.currency, r.measured]
        .map(esc)
        .join(';')
    );
  });
  lines.push('');
  lines.push(['TOTAAL exemplaren', totals.items].map(esc).join(';'));
  lines.push(['Met prijsdata', totals.priced].map(esc).join(';'));
  lines.push([`Richtwaarde (${totals.currency})`, num(totals.total)].map(esc).join(';'));
  lines.push([`Voorzichtige ondergrens (${totals.currency})`, num(totals.lowTotal)].map(esc).join(';'));
  lines.push([`Geschat totaal hele collectie (${totals.currency})`, num(totals.projected)].map(esc).join(';'));
  (totals.otherCurrencies || []).forEach((o) => {
    lines.push([`Apart in ${o.currency} (${o.items} exemplaren, niet omgerekend)`, num(o.total)].map(esc).join(';'));
  });
  return lines.join('\r\n');
}

async function downloadInsuranceCsv() {
  const rows = await buildInsuranceRows();
  const totals = insuranceTotals(rows);
  // BOM zodat Excel de accenten goed leest.
  const blob = new Blob(['﻿' + insuranceCsv(rows, totals)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectie-waardeoverzicht-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return totals;
}

// Afdrukbare pagina in een nieuw venster: handig om als PDF te bewaren.
async function openInsurancePrintView() {
  const rows = await buildInsuranceRows();
  const totals = insuranceTotals(rows);
  const money = (v, c) => (v == null ? '—' : (c === 'EUR' ? '€' : c + ' ') + v.toFixed(2).replace('.', ','));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
<title>Waardeoverzicht mediacollectie</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { font-size: 1.4rem; margin-bottom: 0.2rem; }
  p.sub { color: #555; font-size: 0.85rem; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.8rem; margin-top: 1rem; }
  th, td { border-bottom: 1px solid #ddd; padding: 0.35rem 0.5rem; text-align: left; }
  th { background: #f3f3f3; }
  td.num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 600; border-top: 2px solid #333; }
  .note { margin-top: 1.5rem; font-size: 0.75rem; color: #555; line-height: 1.5; }
  @media print { body { margin: 0.8cm; } }
</style></head><body>
<h1>Waardeoverzicht mediacollectie</h1>
<p class="sub">Opgemaakt op ${new Date().toLocaleDateString('nl-BE')} — ${totals.items} exemplaren, waarvan ${totals.priced} met prijsgegevens</p>
<table>
  <thead><tr><th>Titel</th><th>Jaar</th><th>Formaat</th><th>Bijzonderheden</th><th class="num">Ondergrens</th><th class="num">Richtwaarde</th></tr></thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr>
          <td>${esc(r.title)}</td>
          <td>${esc(r.year)}</td>
          <td>${esc(r.format)}</td>
          <td>${esc([r.steelbook ? 'Steelbook' : '', r.boxset, r.notes].filter(Boolean).join(' · '))}</td>
          <td class="num">${money(r.low, r.currency)}</td>
          <td class="num">${money(r.value, r.currency)}</td>
        </tr>`
      )
      .join('')}
  </tbody>
  <tfoot>
    <tr><td colspan="4">Totaal van exemplaren met prijsgegevens</td><td class="num">${money(totals.lowTotal, totals.currency)}</td><td class="num">${money(totals.total, totals.currency)}</td></tr>
    <tr><td colspan="4">Geschat totaal voor de volledige collectie</td><td class="num">—</td><td class="num">${money(totals.projected, totals.currency)}</td></tr>
  </tfoot>
</table>
${
  (totals.otherCurrencies || []).length
    ? `<p class="note"><strong>Niet in bovenstaand totaal:</strong> ${totals.otherCurrencies
        .map((o) => `${o.items} exemplaren geprijsd in ${esc(o.currency)} (${money(o.total, o.currency)})`)
        .join(', ')}. Deze zijn niet omgerekend, omdat een wisselkoers een nauwkeurigheid zou suggereren die de schatting niet heeft.</p>`
    : ''
}
<p class="note">
  De bedragen zijn richtprijzen op basis van actieve vraagprijzen op eBay (veilingen buiten beschouwing gelaten).
  Het zijn geen bevestigde verkoopprijzen en geen taxatie.
  De <strong>richtwaarde</strong> is de mediaan van vergelijkbare aanbiedingen; de <strong>ondergrens</strong> is
  het eerste kwartiel — een kwart van het aanbod staat lager geprijsd — en geeft dus een voorzichtige minimumwaarde.
  Het geschatte totaal rekent het gemiddelde door naar exemplaren zonder prijsgegevens en is het minst
  betrouwbare cijfer. Bewaar dit overzicht samen met aankoopbewijzen en foto's van je collectie.
</p>
<script>window.onload = function () { window.print(); };<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Je browser blokkeerde het nieuwe venster. Sta pop-ups toe voor deze site en probeer opnieuw.');
    return totals;
  }
  win.document.write(html);
  win.document.close();
  return totals;
}

/**
 * Voegt een titel toe aan de prijstracker zonder ze aan je collectie toe te
 * voegen (verlanglijst). details = resultaat van tmdbDetails().
 */
async function priceTrackNewTitle(details, format) {
  // Sleutel bevat het formaat, zodat je dezelfde film op DVD en 4K apart
  // kunt volgen.
  const slug = slugify(details.title, details.release_year) + '|' + (format || 'bluray');
  const { prices } = await driveLoadPrices();
  if (prices.some((p) => p.id === slug)) return { status: 'bestaat', id: slug, title: details.title };

  prices.push({
    id: slug,
    movie_id: slugify(details.title, details.release_year),
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
