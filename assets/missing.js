/**
 * Pagina "Ontbreekt" — alle gaten in je collectie op één plek (FASE 35)
 * =====================================================================
 *
 * Compleetheid bestond alleen bínnenin een titel: open je een serie, dan zie je
 * welke seizoenen ontbreken; open je een reeksfilm, dan zie je de ontbrekende
 * delen. Wilde je weten wat je in het algemeen nog miste, dan moest je titel
 * per titel openen — onbruikbaar als je in een winkel staat.
 *
 * Twee bronnen, met een belangrijk verschil in kostprijs:
 *
 * 1. SERIES. De seizoenen staan al in je eigen gegevens (`item.seasons`, met
 *    per seizoen of je hem bezit). Die lijst is dus meteen klaar, zonder één
 *    netwerkverzoek. Daarom staat hij bovenaan en verschijnt hij onmiddellijk.
 *
 * 2. FILMREEKSEN. Welke delen een reeks heeft, weet alleen TMDb. Dat is één
 *    verzoek per reeks, en met tientallen reeksen zou de pagina seconden lang
 *    niets doen. Daarom wordt dat pas opgehaald als je erom vraagt, en daarna
 *    voor deze sessie onthouden.
 */

const MISSING_POSTER = 'https://image.tmdb.org/t/p/w154';

function missEsc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/** Ontbreekt hier iets van? Geeft de ontbrekende seizoenen van één serie. */
function missingSeasonsOf(item) {
  const seasons = item.seasons || [];
  if (!seasons.length) return null;
  // Seizoen 0 is bij TMDb de "specials"-bak. Die telt niet mee als gat: bijna
  // niemand bezit die, en anders zou zowat elke serie hier onvolledig staan.
  const echte = seasons.filter((s) => s.season_number !== 0);
  if (!echte.length) return null;
  const ontbreekt = echte.filter((s) => !s.owned);
  if (!ontbreekt.length) return null;
  return {
    item,
    totaal: echte.length,
    inBezit: echte.length - ontbreekt.length,
    ontbreekt,
  };
}

/**
 * Series waarvan je minstens één seizoen hebt maar niet alles. Series waarvan
 * je nog niets hebt horen hier niet thuis — dat is geen gat in je collectie
 * maar een titel die je nog niet verzameld hebt.
 */
function missingSeriesFrom(movies) {
  return movies
    .filter((m) => !m.wishlist && (m.seasons || []).length)
    .map(missingSeasonsOf)
    .filter(Boolean)
    .filter((r) => r.inBezit > 0)
    .sort((a, b) => {
      // Bijna compleet eerst: dat zijn de goedkoopste gaten om te dichten.
      const restA = a.totaal - a.inBezit;
      const restB = b.totaal - b.inBezit;
      if (restA !== restB) return restA - restB;
      return String(a.item.title).localeCompare(String(b.item.title));
    });
}

/** Alle reeksen (saga's) waarvan je iets bezit, met hun TMDb-reeks-id. */
function sagasFrom(movies) {
  const perSaga = new Map();
  movies.forEach((m) => {
    const naam = (m.saga || '').trim();
    if (!naam || !m.saga_id) return;
    if (!perSaga.has(naam)) perSaga.set(naam, { naam, saga_id: m.saga_id, mijn: [] });
    perSaga.get(naam).mijn.push(m);
  });
  return [...perSaga.values()].sort((a, b) => a.naam.localeCompare(b.naam));
}

/**
 * Je eigen reeksen (FASE 37).
 *
 * TMDb kent alleen filmcollecties. Twee series die elkaars vervolg zijn — The
 * Young Pope en The New Pope — staan daar volledig los van elkaar, en dus ook
 * hier. Zet je ze zelf in dezelfde reeks, dan hoort dat verband bij jou thuis
 * en niet bij TMDb.
 *
 * Wat er ontbreekt kan de app dan niet zélf weten: er is geen bron die zegt
 * hoeveel delen zo'n reeks heeft. Wél weet ze wat jíj erover hebt vastgelegd —
 * alles wat je op je verlanglijst zette. Dat zijn de gaten die je zelf hebt
 * benoemd, en precies die horen op deze pagina.
 */
function eigenReeksenFrom(movies) {
  const perSaga = new Map();
  movies.forEach((m) => {
    const naam = (m.saga || '').trim();
    if (!naam) return;
    if (!perSaga.has(naam)) perSaga.set(naam, { naam, metTmdb: false, inBezit: [], wensen: [] });
    const groep = perSaga.get(naam);
    if (m.saga_id) groep.metTmdb = true;
    if (m.wishlist) groep.wensen.push(m);
    else groep.inBezit.push(m);
  });
  return [...perSaga.values()]
    // Reeksen die TMDb kent worden hieronder al volledig nagekeken; die hoeven
    // hier niet nog eens. En zonder openstaande wensen valt er niets te melden.
    .filter((g) => !g.metTmdb && g.wensen.length)
    .sort((a, b) => a.naam.localeCompare(b.naam));
}

async function initMissingPage() {
  const seriesEl = document.getElementById('missing-series');
  const sagasEl = document.getElementById('missing-sagas');
  const summaryEl = document.getElementById('missing-summary');
  const emptyEl = document.getElementById('missing-empty');
  const laadBox = document.getElementById('saga-load-box');
  const laadTekst = document.getElementById('saga-load-text');
  const laadKnop = document.getElementById('saga-load-btn');
  const laadStatus = document.getElementById('saga-load-status');
  const verbergWens = document.getElementById('missing-hide-wish');

  const { movies } = await driveLoadMoviesForDisplay();
  movies.forEach((m) => normalizeMovieEntry(m));

  const series = missingSeriesFrom(movies);
  const sagas = sagasFrom(movies);
  const eigenReeksen = eigenReeksenFrom(movies);
  let sagaResultaten = null; // pas gevuld na het nakijken
  let tab = 'alles';

  // Titels die je al hebt of al op de verlanglijst zette, herkennen we op id.
  const heb = new Set(movies.map((m) => m.id));
  const opWens = new Set(movies.filter((m) => m.wishlist).map((m) => m.id));

  function toonSeries() {
    if (tab === 'reeksen' || !series.length) {
      seriesEl.innerHTML = '';
      return;
    }
    seriesEl.innerHTML =
      `<p class="font-display text-2xl tracking-wide">Series met ontbrekende seizoenen</p>` +
      series
        .map((r) => {
          const poster = r.item.poster_path
            ? `<img src="${missEsc(MISSING_POSTER + r.item.poster_path)}" alt="" loading="lazy" class="w-full rounded ring-1 ring-white/10">`
            : '<div class="w-full aspect-[2/3] rounded bg-bg"></div>';
          const nummers = r.ontbreekt
            .map(
              (s) =>
                `<span class="chip !py-1 !px-2.5 text-[11px] !border-gold/40 !text-gold" title="${missEsc(s.name || '')}">S${s.season_number}</span>`
            )
            .join('');
          return `
            <div class="panel flex gap-4">
              <a href="index.html#${missEsc(r.item.id)}" class="w-20 sm:w-24 shrink-0">${poster}</a>
              <div class="min-w-0 flex-1">
                <p class="font-display text-xl tracking-wide leading-tight">${missEsc(r.item.title)}</p>
                <p class="font-mono text-xs text-muted mt-1">
                  ${r.inBezit} van ${r.totaal} seizoenen · <span class="text-gold">${r.ontbreekt.length} ontbreekt</span>
                </p>
                <div class="flex flex-wrap gap-1.5 mt-3">${nummers}</div>
              </div>
            </div>`;
        })
        .join('');
  }

  function toonSagas() {
    if (tab === 'series') {
      sagasEl.innerHTML = '';
      laadBox.classList.add('hidden');
      return;
    }
    if (!sagas.length) {
      sagasEl.innerHTML = '';
      laadBox.classList.add('hidden');
      return;
    }
    if (!sagaResultaten) {
      // Nog niet nagekeken: uitleggen wat het kost en het aan jou laten.
      sagasEl.innerHTML = '';
      laadTekst.textContent =
        `Je hebt ${sagas.length} filmreeks${sagas.length === 1 ? '' : 'en'} in je collectie. ` +
        `Welke delen daarvan bestaan weet alleen TMDb, dus dat vraagt ${sagas.length} opvraging${sagas.length === 1 ? '' : 'en'}. ` +
        `Daarna blijft het bewaard zolang deze pagina openstaat.`;
      laadBox.classList.remove('hidden');
      return;
    }

    laadBox.classList.add('hidden');
    const metGaten = sagaResultaten.filter((r) => r.ontbreekt.length);
    if (!metGaten.length) {
      sagasEl.innerHTML =
        '<p class="font-display text-2xl tracking-wide">Filmreeksen</p>' +
        '<p class="text-sm text-muted">Al je filmreeksen zijn compleet.</p>';
      return;
    }

    sagasEl.innerHTML =
      '<p class="font-display text-2xl tracking-wide">Filmreeksen met ontbrekende delen</p>' +
      metGaten
        .map((r) => {
          const delen = r.ontbreekt
            .filter((p) => !(verbergWens.checked && opWens.has(p.id)))
            .map((p) => {
              const poster = p.poster_path
                ? `<img src="${missEsc(MISSING_POSTER + p.poster_path)}" alt="" loading="lazy" class="w-full rounded">`
                : '<div class="w-full aspect-[2/3] rounded bg-bg"></div>';
              const wens = opWens.has(p.id);
              return `
                <div class="w-24 shrink-0">
                  <div class="ring-1 ${wens ? 'ring-gold/60' : 'ring-white/10'} rounded overflow-hidden">${poster}</div>
                  <p class="text-[11px] leading-tight mt-1 truncate" title="${missEsc(p.title)}">${missEsc(p.title)}</p>
                  <p class="text-[10px] text-muted font-mono">${p.release_year || '—'}${wens ? ' · wens' : ''}</p>
                </div>`;
            })
            .join('');
          if (!delen) return '';
          return `
            <div class="panel">
              <div class="flex items-baseline justify-between gap-3 flex-wrap">
                <p class="font-display text-xl tracking-wide">${missEsc(r.naam)}</p>
                <p class="font-mono text-xs text-muted">
                  ${r.inBezit} van ${r.totaal} delen · <span class="text-gold">${r.ontbreekt.length} ontbreekt</span>
                </p>
              </div>
              <div class="flex gap-3 overflow-x-auto mt-3 pb-1">${delen}</div>
            </div>`;
        })
        .join('');
  }

  function toonEigenReeksen() {
    const el = document.getElementById('missing-eigen');
    if (!el) return;
    if (tab === 'series' || !eigenReeksen.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<p class="font-display text-2xl tracking-wide">Je eigen reeksen</p>' +
      '<p class="text-sm text-muted -mt-2">Reeksen die je zelf hebt gemaakt, bijvoorbeeld voor twee series die TMDb niet aan elkaar koppelt. Wat hier als ontbrekend staat, is wat jij op je verlanglijst zette.</p>' +
      eigenReeksen
        .map((g) => {
          const kaartje = (m, wens) => {
            const poster = m.poster_path
              ? `<img src="${missEsc(MISSING_POSTER + m.poster_path)}" alt="" loading="lazy" class="w-full rounded">`
              : '<div class="w-full aspect-[2/3] rounded bg-bg"></div>';
            return `
              <div class="w-24 shrink-0">
                <div class="ring-1 ${wens ? 'ring-gold/60' : 'ring-white/10'} rounded overflow-hidden">${poster}</div>
                <p class="text-[11px] leading-tight mt-1 truncate" title="${missEsc(m.title)}">${missEsc(m.title)}</p>
                <p class="text-[10px] font-mono ${wens ? 'text-gold' : 'text-muted'}">${
                  m.release_year || '—'
                }${wens ? ' · wens' : ''}</p>
              </div>`;
          };
          return `
            <div class="panel">
              <div class="flex items-baseline justify-between gap-3 flex-wrap">
                <p class="font-display text-xl tracking-wide">${missEsc(g.naam)}</p>
                <p class="font-mono text-xs text-muted">
                  ${g.inBezit.length} in bezit · <span class="text-gold">${g.wensen.length} nog te halen</span>
                </p>
              </div>
              <div class="flex gap-3 overflow-x-auto mt-3 pb-1">
                ${g.wensen.map((m) => kaartje(m, true)).join('')}
                ${g.inBezit.map((m) => kaartje(m, false)).join('')}
              </div>
            </div>`;
        })
        .join('');
  }

  function toonSamenvatting() {
    const seizoenGaten = series.reduce((n, r) => n + r.ontbreekt.length, 0);
    const stukken = [];
    if (series.length) {
      stukken.push(`${seizoenGaten} seizoen${seizoenGaten === 1 ? '' : 'en'} in ${series.length} serie${series.length === 1 ? '' : 's'}`);
    }
    const eigenGaten = eigenReeksen.reduce((n, g) => n + g.wensen.length, 0);
    if (eigenGaten) {
      stukken.push(`${eigenGaten} titel${eigenGaten === 1 ? '' : 's'} in ${eigenReeksen.length} eigen reeks${eigenReeksen.length === 1 ? '' : 'en'}`);
    }
    if (sagaResultaten) {
      const deelGaten = sagaResultaten.reduce((n, r) => n + r.ontbreekt.length, 0);
      const reeksen = sagaResultaten.filter((r) => r.ontbreekt.length).length;
      if (deelGaten) stukken.push(`${deelGaten} deel${deelGaten === 1 ? '' : 'en'} in ${reeksen} reeks${reeksen === 1 ? '' : 'en'}`);
    }
    summaryEl.textContent = stukken.length ? 'Ontbreekt: ' + stukken.join(' · ') : '';
    const leeg = !series.length && !eigenReeksen.length && (!sagaResultaten || !sagaResultaten.some((r) => r.ontbreekt.length)) && !sagas.length;
    emptyEl.classList.toggle('hidden', !leeg);
  }

  function tekenAlles() {
    toonSeries();
    toonEigenReeksen();
    toonSagas();
    toonSamenvatting();
  }

  // ---- Filmreeksen nakijken (op verzoek) ----
  laadKnop.addEventListener('click', async () => {
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey) {
      laadStatus.textContent = 'Vul eerst je TMDb-sleutel in via Beheer → Instellingen.';
      laadStatus.className = 'text-sm font-mono mt-2 text-gold';
      return;
    }
    laadKnop.disabled = true;
    const uit = [];
    for (let i = 0; i < sagas.length; i++) {
      const saga = sagas[i];
      laadStatus.textContent = `(${i + 1}/${sagas.length}) ${saga.naam}…`;
      laadStatus.className = 'text-sm font-mono mt-2 text-muted';
      try {
        const delen = await tmdbCollection(saga.saga_id, c.tmdbKey);
        const mijnIds = new Set(saga.mijn.map((m) => String(m.tmdb_id)));
        const ontbreekt = (delen || [])
          .filter((p) => !mijnIds.has(String(p.tmdb_id ?? p.id)))
          .map((p) => ({
            tmdb_id: p.tmdb_id ?? p.id,
            title: p.title || p.name || '',
            release_year: p.release_year || (p.release_date || '').slice(0, 4),
            poster_path: p.poster_path || '',
            id: typeof slugify === 'function' ? slugify(p.title || p.name || '', p.release_year || (p.release_date || '').slice(0, 4)) : '',
          }))
          // Titels die je onder een andere naam al hebt, tellen niet als gat.
          .filter((p) => !heb.has(p.id) || opWens.has(p.id));
        uit.push({
          naam: saga.naam,
          totaal: (delen || []).length,
          inBezit: (delen || []).length - ontbreekt.length,
          ontbreekt,
        });
      } catch (err) {
        console.warn('Reeks overgeslagen:', saga.naam, err);
      }
      // TMDb niet overbelasten.
      await new Promise((r) => setTimeout(r, 120));
    }
    sagaResultaten = uit;
    laadStatus.textContent = '';
    laadKnop.disabled = false;
    tekenAlles();
  });

  document.getElementById('missing-tabs').addEventListener('click', (e) => {
    const knop = e.target.closest('[data-tab]');
    if (!knop) return;
    tab = knop.dataset.tab;
    document.querySelectorAll('#missing-tabs [data-tab]').forEach((b) => {
      b.classList.toggle('chip-active', b.dataset.tab === tab);
    });
    tekenAlles();
  });

  verbergWens.addEventListener('change', tekenAlles);

  tekenAlles();
}
