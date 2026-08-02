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
  return escHtml(str);
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
  // FASE 42 — wat je aangevinkt hebt om op je verlanglijst te zetten.
  const gekozenSet = new Set();

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
          // FASE 42 — deze chips waren dode tekst. Nu zijn het knoppen: klik
          // ze aan en zet ze in één keer op je verlanglijst.
          const nummers = r.ontbreekt
            .map((s) => {
              const sleutel = `seizoen:${r.item.id}:${s.season_number}`;
              const gekozen = gekozenSet.has(sleutel);
              return `<button type="button" data-pick="${missEsc(sleutel)}"
                  class="chip !py-1 !px-2.5 text-[11px] ${gekozen ? 'chip-active' : '!border-gold/40 !text-gold'}"
                  aria-pressed="${gekozen ? 'true' : 'false'}"
                  title="${missEsc(s.name || '')} — aanklikken om op je verlanglijst te zetten">S${s.season_number}</button>`;
            })
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
              const sleutel = `deel:${p.tmdb_id}:${p.title}`;
              const gekozen = gekozenSet.has(sleutel);
              return `
                <button type="button" data-pick="${missEsc(sleutel)}" aria-pressed="${gekozen ? 'true' : 'false'}"
                        class="w-24 shrink-0 text-left" ${wens ? 'disabled' : ''}
                        title="${wens ? 'Staat al op je verlanglijst' : 'Aanklikken om op je verlanglijst te zetten'}">
                  <div class="ring-2 ${
                    gekozen ? 'ring-gold' : wens ? 'ring-gold/60' : 'ring-white/10'
                  } rounded overflow-hidden">${poster}</div>
                  <p class="text-[11px] leading-tight mt-1 truncate" title="${missEsc(p.title)}">${missEsc(p.title)}</p>
                  <p class="text-[10px] font-mono ${gekozen ? 'text-gold' : 'text-muted'}">${p.release_year || '—'}${
                wens ? ' · wens' : gekozen ? ' · gekozen' : ''
              }</p>
                </button>`;
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
    werkSelectieBalkBij();
    bouwAfdruklijst();
  }

  /* ---------- Aanvinken en op de verlanglijst zetten (FASE 42) ----------
   *
   * De pagina zei zelf "bedoeld om mee te nemen naar de winkel", maar er viel
   * niets aan te vinken, niets op de verlanglijst te zetten en niets af te
   * drukken. Alles was dode tekst.
   */
  const pickBar = document.getElementById('pick-bar');
  const pickCount = document.getElementById('pick-count');
  const pickStatus = document.getElementById('pick-status');

  function werkSelectieBalkBij() {
    if (!pickBar) return;
    const n = gekozenSet.size;
    pickBar.classList.toggle('hidden', n === 0);
    if (pickCount) pickCount.textContent = `${n} ${n === 1 ? 'ding' : 'dingen'} gekozen`;
    // Ruimte onderaan zodat de balk niets afdekt.
    document.body.style.paddingBottom = n ? '5rem' : '';
  }

  document.addEventListener('click', (e) => {
    const knop = e.target.closest('[data-pick]');
    if (!knop || knop.disabled) return;
    e.preventDefault();
    const sleutel = knop.dataset.pick;
    if (gekozenSet.has(sleutel)) gekozenSet.delete(sleutel);
    else gekozenSet.add(sleutel);
    tekenAlles();
  });

  const pickNone = document.getElementById('pick-none');
  if (pickNone) {
    pickNone.addEventListener('click', () => {
      gekozenSet.clear();
      if (pickStatus) pickStatus.textContent = '';
      tekenAlles();
    });
  }

  const pickWish = document.getElementById('pick-wish');
  if (pickWish) pickWish.addEventListener('click', zetGekozenOpVerlanglijst);

  /**
   * Twee soorten selectie, twee wegen:
   *
   * - Een **seizoen** hoort bij een serie die je al hebt. Daar komt een
   *   exemplaar met `wishlist: true` bij, precies zoals de knop in het
   *   detailscherm doet. Het seizoen telt daardoor niet als bezit.
   * - Een **deel van een filmreeks** heb je nog helemaal niet. Dat wordt een
   *   nieuw record, opgebouwd met dezelfde fabriek als overal elders, en
   *   toegevoegd zonder ooit een bestaande titel te overschrijven.
   */
  async function zetGekozenOpVerlanglijst() {
    const keuzes = [...gekozenSet];
    if (!keuzes.length) return;
    pickWish.disabled = true;

    const c = typeof getConfig === 'function' ? getConfig() : {};
    let gedaan = 0;
    let overgeslagen = 0;

    const seizoenen = keuzes.filter((k) => k.startsWith('seizoen:'));
    const delen = keuzes.filter((k) => k.startsWith('deel:'));

    // Seizoenen per serie samennemen: één schrijfactie per titel in plaats van
    // één per seizoen.
    const perFilm = new Map();
    seizoenen.forEach((k) => {
      const [, filmId, nummer] = k.split(':');
      if (!perFilm.has(filmId)) perFilm.set(filmId, []);
      perFilm.get(filmId).push(Number(nummer));
    });

    for (const [filmId, nummers] of perFilm) {
      const film = movies.find((m) => m.id === filmId);
      if (!film) { overgeslagen += nummers.length; continue; }
      if (pickStatus) pickStatus.textContent = `${film.title}…`;
      let gewijzigd = false;
      nummers.forEach((nr) => {
        const seizoen = (film.seasons || []).find((s) => s.season_number === nr);
        if (!seizoen) { overgeslagen++; return; }
        if (!Array.isArray(seizoen.editions)) seizoen.editions = [];
        // Al gewenst in dit formaat? Dan niets doen — geen dubbels stapelen.
        const formaat = typeof addTitlePreferredFormat === 'function' ? addTitlePreferredFormat() : 'dvd';
        if (seizoen.editions.some((ed) => ed.wishlist && ed.format === formaat)) { overgeslagen++; return; }
        seizoen.editions.push({
          ...nieuwSeizoenExemplaar(nextSeasonEditionId(seizoen), formaat),
          wishlist: true,
          date_added: new Date().toISOString().slice(0, 10),
        });
        gewijzigd = true;
        gedaan++;
      });
      if (gewijzigd) {
        normalizeSeasonEditions(film);
        try {
          await upsertMovieInDrive(film);
        } catch (err) {
          if (pickStatus) pickStatus.textContent = '✗ ' + err.message;
          pickWish.disabled = false;
          return;
        }
      }
    }

    for (let i = 0; i < delen.length; i++) {
      const [, tmdbId, titel] = delen[i].split(':');
      if (pickStatus) pickStatus.textContent = `(${i + 1}/${delen.length}) ${titel}…`;
      if (!c.tmdbKey) { overgeslagen++; continue; }
      try {
        const details = await tmdbDetails(Number(tmdbId), 'movie', c.tmdbKey);
        const entry = nieuweCollectieTitel({
          id: slugify(details.title, details.release_year),
          content_type: 'movie',
          format: typeof addTitlePreferredFormat === 'function' ? addTitlePreferredFormat() : 'dvd',
          wishlist: true,
          details,
        });
        const uitkomst = await insertMovieIfAbsentInDrive(entry);
        if (uitkomst === 'toegevoegd') {
          gedaan++;
          movies.push(entry);
          opWens.add(entry.id);
          heb.add(entry.id);
        } else {
          overgeslagen++;
        }
      } catch (err) {
        console.warn('Deel overgeslagen:', titel, err);
        overgeslagen++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    gekozenSet.clear();
    pickWish.disabled = false;
    if (pickStatus) {
      pickStatus.textContent =
        `✓ ${gedaan} op je verlanglijst` + (overgeslagen ? ` · ${overgeslagen} overgeslagen (stond er al)` : '');
    }
    tekenAlles();
  }

  /* ---------- Afdrukken (FASE 42) ----------
   * Een boodschappenlijst hoort op papier te passen: titels met vakjes ervoor,
   * geen posters, geen filters, zwart op wit.
   */
  function bouwAfdruklijst() {
    const el = document.getElementById('print-list');
    if (!el) return;
    const blokken = [];

    if (series.length) {
      blokken.push(
        '<h3>Series — ontbrekende seizoenen</h3><ul>' +
          series
            .map(
              (r) =>
                `<li>${missEsc(r.item.title)} — seizoen ${r.ontbreekt
                  .map((s) => s.season_number)
                  .join(', ')}</li>`
            )
            .join('') +
          '</ul>'
      );
    }

    const eigenMetWens = eigenReeksen.filter((g) => g.wensen.length);
    if (eigenMetWens.length) {
      blokken.push(
        '<h3>Je eigen reeksen</h3><ul>' +
          eigenMetWens
            .map((g) =>
              g.wensen
                .map((m) => `<li>${missEsc(m.title)}${m.release_year ? ' (' + m.release_year + ')' : ''} — ${missEsc(g.naam)}</li>`)
                .join('')
            )
            .join('') +
          '</ul>'
      );
    }

    if (sagaResultaten) {
      const metGaten = sagaResultaten.filter((r) => r.ontbreekt.length);
      if (metGaten.length) {
        blokken.push(
          '<h3>Filmreeksen — ontbrekende delen</h3><ul>' +
            metGaten
              .map((r) =>
                r.ontbreekt
                  .map((p) => `<li>${missEsc(p.title)}${p.release_year ? ' (' + p.release_year + ')' : ''} — ${missEsc(r.naam)}</li>`)
                  .join('')
              )
              .join('') +
            '</ul>'
        );
      }
    }

    const datum = new Date().toLocaleDateString('nl-BE');
    el.innerHTML = blokken.length
      ? `<h2>Nog te halen</h2><p>Mijn Mediacollectie · ${missEsc(datum)}</p>` + blokken.join('')
      : `<h2>Nog te halen</h2><p>Niets ontbrekend gevonden op ${missEsc(datum)}.</p>`;
  }

  const printKnop = document.getElementById('missing-print');
  if (printKnop) {
    printKnop.addEventListener('click', () => {
      bouwAfdruklijst();
      window.print();
    });
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
