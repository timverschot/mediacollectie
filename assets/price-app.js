/**
 * Prijstracker — leest data/price_history.json en toont per gevolgde titel
 * de laatste eBay-prijsrange/gemiddelde, een trendlijntje en (indien
 * aanwezig) de bol.com-nieuwprijs.
 */

const POSTER_BASE_PRICES = 'https://image.tmdb.org/t/p/w200';

function initPriceTracker() {
  const state = { all: [], sort: 'updated_desc' };

  const els = {
    grid: document.getElementById('price-grid'),
    empty: document.getElementById('price-empty'),
    count: document.getElementById('price-count'),
    sort: document.getElementById('price-sort'),
  };

  fetch('data/price_history.json')
    .then((r) => r.json())
    .then((data) => {
      state.all = data.filter((t) => t.history && t.history.length);
      render();
    })
    .catch((err) => {
      els.grid.innerHTML = '<p class="col-span-full text-center text-[#8B8A92] py-16">Kon price_history.json niet laden.</p>';
      console.error(err);
    });

  els.sort.addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  function latest(entry) {
    return entry.history[entry.history.length - 1];
  }

  function trend(entry) {
    if (entry.history.length < 2) return 0;
    const last = latest(entry).ebay_avg;
    const prev = entry.history[entry.history.length - 2].ebay_avg;
    if (last == null || prev == null) return 0;
    return last - prev;
  }

  function sortedList() {
    const list = [...state.all];
    switch (state.sort) {
      case 'title_asc':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'price_desc':
        return list.sort((a, b) => (latest(b).ebay_avg || 0) - (latest(a).ebay_avg || 0));
      case 'price_asc':
        return list.sort((a, b) => (latest(a).ebay_avg || 0) - (latest(b).ebay_avg || 0));
      case 'trend_desc':
        return list.sort((a, b) => trend(b) - trend(a));
      case 'updated_desc':
      default:
        return list.sort((a, b) => new Date(latest(b).date) - new Date(latest(a).date));
    }
  }

  function sparkline(entry) {
    const values = entry.history.map((h) => h.ebay_avg).filter((v) => v != null);
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
      return `
        <div class="bg-surface rounded-lg p-4 flex gap-4 ring-1 ring-white/5">
          <div class="w-16 shrink-0 rounded overflow-hidden aspect-[2/3] bg-[#14141A]">
            ${cover ? `<img src="${cover}" class="w-full h-full object-cover" loading="lazy" alt="${entry.title}">` : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <p class="font-display text-xl tracking-wide truncate">${entry.title}</p>
              ${entry.owned ? '<span class="chip chip-active shrink-0 !text-[10px] !py-0.5">In collectie</span>' : '<span class="chip shrink-0 !text-[10px] !py-0.5">Verlanglijst</span>'}
            </div>
            <p class="text-xs text-muted font-mono mb-2">${entry.release_year || ''} — bijgewerkt ${last.date}</p>
            <p class="text-sm">
              <span class="font-mono text-ink">${last.ebay_low ?? '—'}–${last.ebay_high ?? '—'} ${last.ebay_currency || ''}</span>
              <span class="text-muted"> · gem. </span><span class="font-mono text-gold">${last.ebay_avg ?? '—'}</span>
              ${trendBadge(entry)}
            </p>
            ${last.bol_new_price ? `<p class="text-xs text-muted font-mono">bol.com nieuw: €${last.bol_new_price}</p>` : ''}
            <div class="mt-2">${sparkline(entry)}</div>
          </div>
        </div>
      `;
    }).join('');
  }
}
