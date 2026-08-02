/**
 * Collection Dashboard — gedeelde motor
 * -------------------------------------
 * Generiek opgezet zodat een tweede verzameling (bv. strips.html) hem kan
 * hergebruiken via een eigen `config` (loadData of dataUrl).
 *
 * Fase 2b-uitbreidingen:
 * - Optimistic UI: wijzigingen zijn meteen zichtbaar, opslaan gebeurt op de
 *   achtergrond (indicator rechtsboven), met automatisch terugdraaien bij fouten
 * - Hoesfoto's als losse Drive-bestanden (movies.json blijft klein en snel)
 * - Grid toont altijd de TMDb-poster; hoesfoto's in de detailmodal, met
 *   tabs (Poster / Hoesfoto's) en zoom-lightbox
 * - A–Z-letterfilter
 * - Reeksen: sorteeroptie 'Op reeks' + 'Groepeer reeksen'-weergave met
 *   reekskaarten en een reeksoverzicht-modaal
 */

const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';
const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';
const THUMB_BASE = 'https://image.tmdb.org/t/p/w92';
const SEASON_POSTER_BASE = 'https://image.tmdb.org/t/p/w185'; // seizoencover in de detailmodal
const EPISODE_STILL_BASE = 'https://image.tmdb.org/t/p/w300'; // aflevering-still (grotere weergave)
const PAGE_SIZE = 60;

// FASE 29 — posters op maat.
//
// Tot nu toe kreeg elke poster de w500-versie, ongeacht hoe groot hij op het
// scherm getekend werd. Op gsm is een posterhokje ongeveer 175 px breed; zelfs
// op een scherm met dubbele pixeldichtheid is w342 dan ruim genoeg en w185
// vaak al voldoende. Met een srcset kiest de browser zélf de kleinste versie
// die scherp genoeg is — dat scheelt mobiele data en geheugen, want een
// gedecodeerde afbeelding kost geheugen naar rato van zijn píxels, niet zijn
// bestandsgrootte. 60 posters van w500 in plaats van w185 is ruim 7× zoveel
// beeldgeheugen.
const POSTER_WIDTHS = [185, 342, 500];

/** srcset-regel voor een TMDb-posterpad, of '' als er geen pad is. */
function posterSrcsetFor(path) {
  if (!path) return '';
  return POSTER_WIDTHS.map((w) => `https://image.tmdb.org/t/p/w${w}${path} ${w}w`).join(', ');
}

// Hoe breed een posterhokje ongeveer is per schermbreedte. Volgt de
// kolomindeling van het raster (2 → 3 → 4 → 6 → 7 → 9 kolommen). Bij
// benadering: de browser hoeft dit niet exact te weten, alleen goed genoeg om
// niet onnodig groot te kiezen.
//
// De laatste waarde (voor schermen onder 640 px) is bewust kleiner dan de
// werkelijke 45vw. De browser vermenigvuldigt `sizes` met de pixeldichtheid van
// het scherm, en moderne telefoons zitten op 2 tot 3. Met de eerlijke 45vw komt
// zo'n toestel altijd op de zwaarste variant uit — precies wat we hier willen
// vermijden. Met 25vw plafonneert het op w342: op een posterhokje van ±175 px
// is dat nog steeds bijna dubbele dichtheid, en dat zie je niet, maar de helft
// minder data en beeldgeheugen merk je wel.
const GRID_POSTER_SIZES =
  '(min-width: 1536px) 11vw, (min-width: 1280px) 13vw, (min-width: 1024px) 15vw, ' +
  '(min-width: 768px) 23vw, (min-width: 640px) 30vw, 25vw';

// Aanraakscherm zonder muisaanwijzer. Bepaalt of we de snelblik-overlay
// überhaupt in de HTML zetten (die is daar toch onzichtbaar) en hoe zwaar de
// sfeerachtergrond mag zijn.
const IS_TOUCH =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

// Weergavekeuze onthouden tussen bezoeken.
const VIEW_STORAGE_KEY = 'mediacollectie_view';
const VALID_VIEWS = ['grid', 'shelf', 'compact', 'text'];

function loadStoredView() {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (VALID_VIEWS.includes(v)) return v;
  } catch {
    // localStorage geblokkeerd: gewoon met het raster starten.
  }
  return 'grid';
}

// In de tekst- en compacte weergave laden we bewust meer titels per keer:
// er zijn geen afbeeldingen, dus scrollen blijft licht.
function pageSizeForView(view) {
  // De plank toont álles (cover-flow bladert horizontaal), de tekst- en
  // compacte lijst laden meer per keer.
  if (view === 'shelf') return 9999;
  return view === 'text' ? 400 : view === 'compact' ? 150 : PAGE_SIZE;
}

/**
 * Controleert of de andere bestanden bij deze versie van app.js horen.
 * Bij een halve upload (bv. wel app.js, niet drive.js) krijg je anders een
 * cryptische melding als "X is not defined" die niets zegt over de oorzaak.
 */
function checkAssetVersions() {
  const missing = [];
  if (
    typeof MEDIA_FORMATS === 'undefined' ||
    typeof normalizeMovieEntry === 'undefined' ||
    typeof deleteMoviesInDrive === 'undefined' ||
    typeof driveBackupNow === 'undefined' ||
    // FASE 35 — seizoenen met meerdere exemplaren
    typeof normalizeSeasonEditions === 'undefined'
  ) {
    missing.push('assets/drive.js');
  }
  if (
    typeof tmdbPerson === 'undefined' ||
    typeof applyTmdbFields === 'undefined' ||
    typeof tmdbSeason === 'undefined' ||
    typeof tmdbSearchKeyword === 'undefined' ||
    typeof tmdbMediaTypeOf === 'undefined'
  ) {
    missing.push('assets/admin.js');
  }
  if (typeof loadUniverseMembers === 'undefined') {
    missing.push('assets/universes.js');
  }
  if (typeof addTitleOpenForTmdb === 'undefined' || typeof addTitleBulkSubmit === 'undefined') {
    missing.push('assets/add-title.js');
  }
  if (typeof parseTitleList === 'undefined' || typeof initBulkImportUI === 'undefined') {
    missing.push('assets/bulk-import.js');
  }
  return missing;
}

// De container krijgt per weergave andere opmaak: een raster voor posters,
// een verticale lijst voor de andere twee.
// Meer kolommen naarmate het scherm breder wordt — op een breedbeeldscherm
// stond er anders een smalle strook posters met veel lege ruimte ernaast.
// De tekst- en compacte lijst krijgen kolommen in plaats van één lange rij,
// want een titel van 30 tekens over 1800 pixels uitsmeren leest slecht.
//
// Staat bewust buiten initCollectionApp: de laadtoestand (showGridSkeleton)
// wordt meteen bij het opstarten getekend, nog vóór dit punt in de functie
// bereikt zou zijn. Als const daarbinnen gaf dat "Cannot access
// VIEW_CONTAINER_CLASSES before initialization" — een lege pagina dus.
const VIEW_CONTAINER_CLASSES = {
  grid: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-5 gap-y-8',
  compact: 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-x-8',
  text: 'grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-x-8',
};

function initCollectionApp(config) {
  const outdated = checkAssetVersions();
  if (outdated.length) {
    const grid = document.getElementById('grid');
    if (grid) {
      grid.innerHTML =
        '<div class="col-span-full text-center py-16 px-6">' +
        '<p class="text-[#C9A227] font-mono text-sm mb-3">Bestanden komen niet overeen</p>' +
        '<p class="text-[#F2F0EA] mb-2">Deze versie van <code>assets/app.js</code> heeft een nieuwere ' +
        outdated.map((f) => '<code>' + f + '</code>').join(' en ') +
        ' nodig.</p>' +
        '<p class="text-[#8B8A92] text-sm">Upload ' +
        (outdated.length === 1 ? 'dat bestand' : 'die bestanden') +
        ' opnieuw en herlaad met Ctrl+Shift+R.</p>' +
        '</div>';
    }
    console.error('Verouderde bestanden:', outdated.join(', '));
    return;
  }

  const state = {
    all: [],
    filtered: [],
    // Prijs-index: sleutel (zie priceKeyForLocal) -> laatste niet-gearchiveerde
    // meting uit price_history.json. Wordt na de collectie geladen; blijft leeg
    // als er nog geen prijsdata is of Drive niet beschikbaar is.
    priceIndex: {},
    visibleCount: PAGE_SIZE,
    search: '',
    activeFormats: new Set(),
    activeTypes: new Set(),
    activeGenres: new Set(),
    activeStatus: new Set(),   // 'owned' / 'wishlist'
    activeSaga: new Set(),     // 'in' = hoort bij een filmreeks, 'los' = losstaand
    activeWatched: new Set(),  // 'watched' / 'unwatched'
    activeLoaned: new Set(),   // FASE 40 — 'uit' / 'thuis'
    activeDecades: new Set(),  // 1970, 1980, … (beginjaar van het decennium)
    activeCerts: new Set(),    // leeftijdskeuring, bv. 'AL', '12', '16'
    activeVariants: new Set(), // uitvoeringen: steelbook, limited, extended, directors
    activeBoxsets: new Set(),  // namen van boxsets
    activeLocations: new Set(), // waar de schijf fysiek ligt
    activeUniverses: new Set(), // universum-id's (bv. MCU)
    activeLetter: null,        // 'A'..'Z' of '#'
    groupSagas: false,
    // Selectiemodus: vinkjes op de kaarten om meerdere titels tegelijk te
    // verwijderen. `selected` bevat titel-id's, ook wanneer je een hele reeks
    // aanvinkt — een reekskaart is een weergave, geen apart record.
    selectMode: false,
    selected: new Set(),
    sort: 'date_added_desc',
    // 'grid' = posterraster, 'compact' = rij met miniatuur, 'text' = pure
    // tekstlijst (snelst om door te scrollen, verbruikt geen data)
    view: loadStoredView(),
  };

  const els = {
    grid: document.getElementById('grid'),
    empty: document.getElementById('empty-state'),
    count: document.getElementById('result-count'),
    search: document.getElementById('filter-search'),
    sort: document.getElementById('sort-select'),
    formatChips: document.getElementById('format-chips'),
    typeChips: document.getElementById('type-chips'),
    genreChips: document.getElementById('genre-chips'),
    decadeChips: document.getElementById('decade-chips'),
    certChips: document.getElementById('cert-chips'),
    certRow: document.getElementById('cert-row'),
    variantChips: document.getElementById('variant-chips'),
    variantRow: document.getElementById('variant-row'),
    boxsetChips: document.getElementById('boxset-chips'),
    boxsetRow: document.getElementById('boxset-row'),
    locationChips: document.getElementById('location-chips'),
    locationRow: document.getElementById('location-row'),
    universeChips: document.getElementById('universe-chips'),
    universeRow: document.getElementById('universe-row'),
    ambient: document.getElementById('ambient-glow'),
    shelfStage: document.getElementById('shelf-stage'),
    shelfTrack: document.getElementById('shelf-track'),
    shelfMeta: document.getElementById('shelf-meta'),
    statusChips: document.getElementById('status-chips'),
    sagaChips: document.getElementById('saga-chips'),
    watchedChips: document.getElementById('watched-chips'),
    loanedChips: document.getElementById('loaned-chips'),
    letterChips: document.getElementById('letter-chips'),
    groupToggle: document.getElementById('group-sagas-toggle'),
    selectToggle: document.getElementById('select-toggle'),
    selectBar: document.getElementById('select-bar'),
    selectCount: document.getElementById('select-count'),
    selectAll: document.getElementById('select-all'),
    selectNone: document.getElementById('select-none'),
    selectDelete: document.getElementById('select-delete'),
    selectClose: document.getElementById('select-close'),
    selectStatus: document.getElementById('select-status'),
    selectEdit: document.getElementById('select-edit'),
    bulkEditModal: document.getElementById('bulk-edit-modal'),
    viewChips: document.getElementById('view-chips'),
    filterToggle: document.getElementById('filter-toggle'),
    wishlistToggle: document.getElementById('wishlist-toggle'),
    wishlistCount: document.getElementById('wishlist-count'),
    filterPanel: document.getElementById('filter-panel'),
    clearFilters: document.getElementById('clear-filters'),
    personModal: document.getElementById('person-modal'),
    episodeModal: document.getElementById('episode-modal'),
    pickModal: document.getElementById('pick-modal'),
    dupesModal: document.getElementById('dupes-modal'),
    saveIndicator: document.getElementById('save-indicator'),
    loadMore: document.getElementById('load-more'),
    modal: document.getElementById('detail-modal'),
    modalClose: document.getElementById('modal-close'),
    groupModal: document.getElementById('group-modal'),
    lightbox: document.getElementById('lightbox'),
  };

  // ---------- Hulpfuncties ----------

  // FASE 44 — één ontsnappingsfunctie voor de hele app; zie escHtml in
  // drive.js. Deze twee namen blijven bestaan omdat ze op honderden plaatsen
  // gebruikt worden, maar ze doen nu allebei hetzelfde als de rest.
  function escapeHtml(str) {
    return escHtml(str);
  }
  function escapeAttr(str) {
    return escHtml(str);
  }

  // Sorteertitel: lidwoorden vooraan negeren ("The Matrix" → "matrix"),
  // accenten weglaten. Gebruikt voor alfabetisch sorteren én het letterfilter.
  // Zelfde normalisatie als sortTitle, maar op een losse tekst — nodig om
  // titels uit TMDb te vergelijken met titels uit je collectie.
  function normalizeTitleText(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^(the|a|an|de|het|een|le|la|les|l')\s+/i, '')
      .toLowerCase()
      .trim();
  }

  function sortTitle(item) {
    return String(item.title || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^(the|a|an|de|het|een|le|la|les|l')\s+/i, '')
      .toLowerCase();
  }

  function firstLetter(item) {
    const c = sortTitle(item).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }

  function sagaOf(item) {
    return (item.saga || '').trim();
  }

  // Decennium waarin een titel uitkwam: 1994 → 1990. Null als er geen jaar is.
  function decadeOf(item) {
    const y = Number(item.release_year);
    if (!y || y < 1000) return null;
    return Math.floor(y / 10) * 10;
  }

  function decadeLabel(decade) {
    // 1990 → "jaren '90", 2000 → "jaren '00"
    return "jaren '" + String(decade).slice(2);
  }

  // Heb je zelf een alternatieve TMDb-poster gekozen (bv. de artwork van jouw
  // editie), dan krijgt die voorrang op de standaardposter.
  function posterUrl(item) {
    const path = item.custom_poster_path || item.poster_path;
    return path ? POSTER_BASE + path : '';
  }

  /* ------------------------------------------------------------------
   * Je eigen hoesfoto als poster (FASE 33)
   * ------------------------------------------------------------------
   * TMDb-posters zijn gewone webadressen; een hoesfoto van jou staat in je
   * Drive en moet eerst opgehaald worden. Dat mag het raster niet vertragen,
   * dus laden we zo'n foto pas wanneer de kaart in beeld komt — en daarna
   * onthouden we hem voor de rest van het bezoek.
   *
   * De kosten schalen met je eigen keuzes: alleen titels waarbij jij dit
   * instelt halen een bestand op. Bij de rest verandert er niets.
   */
  // FASE 43 — hier stond een eigen cache van Drive-id naar blob-URL. Die wist
  // niets van de LRU in drive.js, die na 24 foto's de oudste blob-URL intrekt.
  // Gevolg: na een filterklik gaf deze cache een adres terug dat niet meer
  // bestond, en bleef de poster leeg zonder terugval. Er is nu nog één cache —
  // die in drive.js — en een geladen poster die alsnog stukgaat probeert het
  // één keer opnieuw voor hij terugvalt op de TMDb-poster.
  let coverPosterWaarnemer = null;

  function coverPosterObserver() {
    if (coverPosterWaarnemer || typeof IntersectionObserver === 'undefined') return coverPosterWaarnemer;
    coverPosterWaarnemer = new IntersectionObserver(
      (rijen) => {
        rijen.forEach((rij) => {
          if (!rij.isIntersecting) return;
          const el = rij.target;
          coverPosterWaarnemer.unobserve(el);
          laadCoverPoster(el);
        });
      },
      // Ruim vóór de kaart in beeld komt beginnen, zodat je hem zelden ziet
      // opbouwen tijdens het scrollen.
      { rootMargin: '400px 0px' }
    );
    return coverPosterWaarnemer;
  }

  async function laadCoverPoster(el) {
    const fileId = el.dataset.coverPoster;
    if (!fileId) return;
    try {
      if (typeof driveCoverBlobUrl !== 'function') return;
      const url = await driveCoverBlobUrl(fileId);

      // Een blob-URL kan intussen ingetrokken zijn door de LRU. Dan laadt het
      // beeld niet en krijgen we onerror: één keer opnieuw ophalen, en lukt dat
      // ook niet, dan de gewone poster tonen in plaats van een leeg vak.
      el.onerror = async () => {
        el.onerror = null;
        try {
          if (typeof driveReleaseCoverUrl === 'function') driveReleaseCoverUrl(fileId);
          el.src = await driveCoverBlobUrl(fileId);
        } catch {
          const terugval = el.dataset.coverFallback;
          if (terugval) el.src = terugval;
        }
      };

      el.src = url;
      el.classList.remove('opacity-0');
      const skel = el.previousElementSibling;
      if (skel && skel.classList.contains('poster-skel')) skel.remove();
    } catch (err) {
      // Foto niet op te halen — offline, of het bestand is intussen verwijderd.
      // Dan tonen we alsnog de TMDb-poster in plaats van een kaart die eeuwig
      // blijft laden.
      console.warn('Hoesfoto-poster niet geladen, terugval op TMDb:', err);
      const terugval = el.dataset.coverFallback;
      const skel = el.previousElementSibling;
      if (terugval) {
        el.src = terugval;
        el.classList.remove('opacity-0');
        if (skel && skel.classList.contains('poster-skel')) skel.remove();
      } else if (skel && skel.classList.contains('poster-skel')) {
        skel.remove();
      }
    }
  }

  /** Koppelt de waarnemer aan alle nog niet geladen hoesfoto-posters. */
  function volgCoverPosters(container) {
    const waarnemer = coverPosterObserver();
    if (!waarnemer) return;
    (container || els.grid).querySelectorAll('img[data-cover-poster]:not([src])').forEach((el) => {
      waarnemer.observe(el);
    });
  }

  /** Gebruikt deze titel een eigen hoesfoto als poster? */
  function coverPosterId(item) {
    return item && item.custom_poster_cover_id ? item.custom_poster_cover_id : '';
  }

  /** srcset voor de poster van een titel (leeg als er geen poster is). */
  function posterSrcset(item) {
    return posterSrcsetFor(item.custom_poster_path || item.poster_path);
  }

  /**
   * Bouwt de srcset- en sizes-attributen als tekst, klaar om in een <img> te
   * zetten. Zonder srcset (geen posterpad) geeft het een lege tekst terug,
   * zodat de img gewoon op zijn src terugvalt.
   */
  function posterSizingAttrs(item, sizes) {
    const set = posterSrcset(item);
    return set ? ` srcset="${escapeAttr(set)}" sizes="${escapeAttr(sizes)}"` : '';
  }

  function backdropUrl(item) {
    return item.backdrop_path ? BACKDROP_BASE + item.backdrop_path : '';
  }

  // Hoesfoto's horen bij een exemplaar, niet bij de film: van dezelfde titel
  // kan je een DVD- én een 4K-doosje hebben. Zonder exemplaar valt het terug
  // op de oude velden op filmniveau.
  function frontCoverRef(item, edition) {
    const src = edition || item;
    if (src.custom_front_cover_id) return { fileId: src.custom_front_cover_id };
    if (src.custom_front_cover) return { dataUrl: src.custom_front_cover };
    return null;
  }
  function backCoverRef(item, edition) {
    const src = edition || item;
    if (src.custom_back_cover_id) return { fileId: src.custom_back_cover_id };
    if (src.custom_back_cover) return { dataUrl: src.custom_back_cover };
    return null;
  }

  // Zet een cover-referentie om naar een bruikbare img-src (async bij Drive-bestanden).
  async function resolveCoverSrc(ref) {
    if (!ref) return '';
    if (ref.dataUrl) return ref.dataUrl;
    if (ref.fileId && typeof driveCoverBlobUrl === 'function') {
      try {
        return await driveCoverBlobUrl(ref.fileId);
      } catch {
        return '';
      }
    }
    return '';
  }

  // ---------- Meldingen (FASE 30) ----------
  //
  // De opslagstatus stond als klein bolletje in de kop. Die kop scrollt weg, en
  // op een gsm is hij vrijwel nooit in beeld op het moment dat er iets misgaat —
  // je zag dus niet dat een wijziging níet bewaard was. Meldingen verschijnen nu
  // onderaan, waar je kijkt. Een fout blijft staan tot je hem wegklikt.

  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  /**
   * @param tekst  wat er gebeurd is
   * @param soort  'ok' | 'bezig' | 'fout'
   * @param opts   { blijft: true } om hem te laten staan tot de gebruiker sluit
   */
  function showToast(tekst, soort, opts) {
    if (!toastEl) return;
    const o = opts || {};
    clearTimeout(toastTimer);
    toastEl.textContent = '';
    const p = document.createElement('span');
    p.textContent = tekst;
    toastEl.appendChild(p);
    // FASE 41 — een knop ín de melding. Zo kan een handeling meteen
    // teruggedraaid worden op de plek waar je hem net deed, in plaats van dat
    // je moet weten dat er ergens een terugweg bestaat.
    if (o.actie) {
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.textContent = o.actie.label;
      knop.addEventListener('click', () => {
        hideToast();
        o.actie.fn();
      });
      toastEl.appendChild(knop);
    }
    if (o.blijft) {
      const sluit = document.createElement('button');
      sluit.type = 'button';
      sluit.textContent = 'Sluiten';
      sluit.addEventListener('click', hideToast);
      toastEl.appendChild(sluit);
    }
    toastEl.className = 'toast-' + (soort || 'ok');
    // Eerst zichtbaar maken, dán pas laten invliegen (anders geen overgang).
    requestAnimationFrame(() => toastEl.classList.add('toast-in'));
    if (!o.blijft) toastTimer = setTimeout(hideToast, o.duur || 2600);
  }

  function hideToast() {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.classList.remove('toast-in');
    // Pas echt verbergen als de overgang klaar is, anders springt hij weg.
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 260);
  }
  window.__toast = showToast;

  // ---------- Opslag-indicator + achtergrond-opslag (optimistic UI) ----------

  let indicatorTimer = null;
  function setIndicator(mode) {
    // De kop houdt zijn indicator (handig op een breed scherm), maar de melding
    // onderaan is wat je op een telefoon werkelijk ziet.
    if (mode === 'saving') showToast('Opslaan…', 'bezig', { duur: 8000 });
    else if (mode === 'saved') showToast('✓ Opgeslagen', 'ok');
    else if (mode === 'error') showToast('✗ Niet opgeslagen — je wijziging is teruggedraaid', 'fout', { blijft: true });

    if (!els.saveIndicator) return;
    clearTimeout(indicatorTimer);
    if (mode === 'saving') {
      els.saveIndicator.textContent = '● opslaan…';
      els.saveIndicator.className = 'font-mono text-xs text-gold';
    } else if (mode === 'saved') {
      els.saveIndicator.textContent = '✓ opgeslagen';
      els.saveIndicator.className = 'font-mono text-xs text-teal';
      indicatorTimer = setTimeout(() => { els.saveIndicator.textContent = ''; }, 2500);
    } else if (mode === 'error') {
      els.saveIndicator.textContent = '✗ niet opgeslagen';
      els.saveIndicator.className = 'font-mono text-xs text-red-400';
    } else {
      els.saveIndicator.textContent = '';
    }
  }

  // ---------- Leesmodus (FASE 30) ----------
  //
  // Zonder inloggen kan je de laatst bewaarde kopie bekíjken. Wijzigen niet:
  // die kopie kan verouderd zijn, en wegschrijven zou je echte collectie
  // kunnen overschrijven. Alle schrijfwegen lopen langs requireWrite().
  const readOnly = !!config.readOnly;

  function requireWrite() {
    if (!readOnly) return true;
    showToast('Leesmodus — log in met Google om wijzigingen te maken', 'fout', { duur: 3500 });
    return false;
  }

  // Achtergrond-opslag in volgorde (één tegelijk). De interface is dan al
  // bijgewerkt; bij een fout wordt de wijziging teruggedraaid.
  let saveChain = Promise.resolve();
  function backgroundSave(taskFn, revertFn, naGelukt) {
    // Enige plek waar de collectie weggeschreven wordt vanuit de
    // collectiepagina. In leesmodus draaien we de wijziging meteen terug.
    if (!requireWrite()) {
      if (revertFn) revertFn();
      buildFacetChips(state.all);
      applyFilters();
      return Promise.resolve();
    }
    setIndicator('saving');
    saveChain = saveChain.then(async () => {
      try {
        await taskFn();
        setIndicator('saved');
        // FASE 41 — pas hier, ná de melding "✓ Opgeslagen": anders overschrijft
        // die routineboodschap meteen de knop om het terug te draaien.
        if (naGelukt) naGelukt();
      } catch (err) {
        console.error('Achtergrond-opslag mislukt:', err);
        if (revertFn) revertFn();
        buildFacetChips(state.all);
        applyFilters();
        // Geen alert meer: die onderbreekt alles, moet weggeklikt worden vóór
        // je iets kan zien, en verdwijnt daarna spoorloos. De melding onderaan
        // blijft staan tot je hem zelf sluit, mét de reden erbij.
        showToast('✗ Niet opgeslagen: ' + err.message + ' — je wijziging is teruggedraaid', 'fout', { blijft: true });
      }
    });
    return saveChain;
  }

  // ---------- Data laden ----------

  function reload() {
    const p =
      typeof config.loadData === 'function'
        ? config.loadData()
        : fetch(config.dataUrl).then((r) => {
            if (!r.ok) throw new Error('Kon ' + config.dataUrl + ' niet laden');
            return r.json();
          });
    return p.then((data) => {
      state.all = data;
      // FASE 41 — eerst je bewaarde keuzes terugzetten, dán pas de chips
      // bouwen: die zetten zichzelf al op 'aan' op basis van de state, dus zo
      // klopt het scherm meteen zonder extra ronde.
      const hersteld = laadBewaardeFilters();
      buildFacetChips(data);
      applyFilters();
      meldHersteldeFilters(hersteld);

      // Universums op de achtergrond laden zodat het universumfilter kan
      // verschijnen. Heb je er geen, dan gebeurt er niets. De ledenlijsten
      // komen live van TMDb, dus dit mag de collectie niet ophouden.
      if (typeof loadUniverseData === 'function') {
        loadUniverseData().catch((e) => console.warn('Universums niet geladen:', e));
      }

      // Prijsdata op de achtergrond laden (optioneel). Zodra ze binnen is,
      // bouwen we de prijs-index en verversen we de weergave, zodat de
      // richtwaarde bij elke titel verschijnt en 'Sorteer op waarde' klopt.
      // Faalt dit (geen Drive-sessie, of nog geen prijzen ververst), dan blijft
      // de collectie gewoon werken — enkel zonder prijzen.
      loadPriceIndex();

      // FASE 41 — een titel die via de pagina Ontbreekt is aangeklikt.
      opendeTitelUitAdres();
    });
  }
  window.__collectionReload = reload;

  /* ---------- Filters onthouden (FASE 41) ----------
   *
   * Filters, sortering en groeperen overleefden geen paginawissel. Ging je
   * even naar Statistieken en terug, dan stond alles weer op nul — precies bij
   * het soort werk waarbij je hetzelfde filter tien keer nodig hebt.
   *
   * Wat bewaard wordt gaat in localStorage, dus het overleeft ook het sluiten
   * van je browser. Om te voorkomen dat je je een week later afvraagt waar je
   * films gebleven zijn, meldt de app het als er filters teruggezet zijn — mét
   * een knop om ze weg te doen.
   */
  const FILTER_KEY = 'mediacollectie_filters';
  const FILTER_SETS = [
    ['formats', 'activeFormats'], ['types', 'activeTypes'], ['genres', 'activeGenres'],
    ['status', 'activeStatus'], ['saga', 'activeSaga'], ['watched', 'activeWatched'],
    ['loaned', 'activeLoaned'], ['decades', 'activeDecades'], ['certs', 'activeCerts'],
    ['variants', 'activeVariants'], ['boxsets', 'activeBoxsets'],
    ['locations', 'activeLocations'], ['universes', 'activeUniverses'],
  ];

  function bewaarFilters() {
    try {
      const uit = { sort: state.sort, view: state.view, groep: !!state.groupSagas, letter: state.activeLetter || '' };
      FILTER_SETS.forEach(([naam, sleutel]) => {
        const v = [...state[sleutel]];
        if (v.length) uit[naam] = v;
      });
      localStorage.setItem(FILTER_KEY, JSON.stringify(uit));
    } catch {
      // Niets kunnen bewaren is niet erg; dan begin je gewoon opnieuw.
    }
  }

  function laadBewaardeFilters() {
    let opgeslagen = null;
    try {
      opgeslagen = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
    } catch {}
    if (!opgeslagen) return 0;

    let aantal = 0;
    FILTER_SETS.forEach(([naam, sleutel]) => {
      (opgeslagen[naam] || []).forEach((v) => { state[sleutel].add(v); aantal++; });
    });
    if (opgeslagen.letter) { state.activeLetter = opgeslagen.letter; aantal++; }
    if (opgeslagen.sort) state.sort = opgeslagen.sort;
    if (opgeslagen.view) state.view = opgeslagen.view;
    state.groupSagas = !!opgeslagen.groep;

    // De knoppen laten zien wat er aanstaat, anders klopt het scherm niet met
    // de werkelijkheid. De chiprijen die uit de collectie opgebouwd worden doen
    // dat zelf al; de vaste rijen hieronder niet.
    if (els.sort) els.sort.value = state.sort;
    if (els.groupToggle) els.groupToggle.classList.toggle('chip-active', state.groupSagas);
    if (els.viewChips) {
      els.viewChips.querySelectorAll('[data-view]').forEach((c) =>
        c.classList.toggle('chip-active', c.dataset.view === state.view)
      );
    }
    markeerActieveChips();
    return aantal;
  }

  /* ---------- De verlanglijst zichtbaar (FASE 41) ----------
   *
   * De verlanglijst had geen enkele ingang in de kop: hij zat drie klikken
   * diep in een dichtgeklapt paneel, en wat je erop zette verdween meteen uit
   * beeld — de collectie toont standaard alleen wat je bezit. Dat je hem zelf
   * niet terugvond was dus geen vergissing van jou.
   *
   * Deze knop is precies hetzelfde filter, maar dan waar je hem ziet, met
   * hoeveel titels erop staan.
   */
  function werkVerlanglijstKnopBij() {
    if (!els.wishlistToggle) return;
    const aan = state.activeStatus.has('wishlist') && !state.activeStatus.has('owned');
    els.wishlistToggle.classList.toggle('chip-active', aan);
    els.wishlistToggle.setAttribute('aria-pressed', aan ? 'true' : 'false');
    if (els.wishlistCount) {
      const n = state.all.filter((m) => m.wishlist).length;
      els.wishlistCount.textContent = n ? `(${n})` : '';
    }
  }

  function wisselVerlanglijst() {
    const aan = state.activeStatus.has('wishlist') && !state.activeStatus.has('owned');
    state.activeStatus.clear();
    if (!aan) state.activeStatus.add('wishlist');
    markeerActieveChips();
    applyFilters();
  }

  function meldHersteldeFilters(aantal) {
    if (!aantal) return;
    showToast(`Je filters van vorige keer staan nog aan (${aantal})`, 'ok', {
      duur: 7000,
      actie: { label: 'Wissen', fn: () => { if (els.clearFilters) els.clearFilters.click(); } },
    });
  }

  /** De vaste chiprijen gelijkzetten met wat er in state staat. */
  function markeerActieveChips() {
    const paren = [
      ['[data-type]', 'type', state.activeTypes],
      ['[data-status]', 'status', state.activeStatus],
      ['[data-saga-filter]', 'sagaFilter', state.activeSaga],
      ['[data-watched]', 'watched', state.activeWatched],
      ['[data-loaned]', 'loaned', state.activeLoaned],
    ];
    paren.forEach(([kiezer, attr, set]) => {
      document.querySelectorAll(kiezer).forEach((c) => {
        c.classList.toggle('chip-active', set.has(c.dataset[attr]));
      });
    });
  }

  /**
   * De pagina Ontbreekt linkt naar `index.html#<id>` (FASE 41). Dat anker deed
   * niets: je kwam op de collectie terecht zonder te weten waar de titel stond,
   * en als er nog een filter aanstond zag je hem helemaal niet.
   */
  function opendeTitelUitAdres() {
    const id = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!id) return;
    const item = state.all.find((m) => m.id === id);
    if (!item) return;
    // Staat hij achter een filter, dan eerst alles wissen — anders opent er een
    // detailscherm van iets dat er volgens het raster niet is.
    if (!state.filtered.some((m) => m.id === id)) {
      if (els.clearFilters) els.clearFilters.click();
      else applyFilters();
    }
    openModal(id);
    // Het anker weer weghalen, zodat opnieuw laden niet ongevraagd hetzelfde
    // scherm opent.
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Sta je al op de collectiepagina, dan is index.html#<id> voor de browser
  // géén nieuwe pagina: er wordt niets opnieuw geladen. Zonder deze luisteraar
  // deed zo'n link vanuit je geschiedenis of een ander tabblad alsnog niets.
  window.addEventListener('hashchange', opendeTitelUitAdres);

  // Klik-, toets- en sfeerlichtafhandeling één keer op het raster zetten, vóór
  // de eerste keer tekenen. Daarna hoeft geen enkele herteken-beurt nog
  // handlers te koppelen.
  wireGridInteractions();
  showGridSkeleton();

  reload().catch((err) => {
    els.grid.innerHTML =
      '<p class="col-span-full text-center text-[#8B8A92] py-16">Kon de collectie niet laden: ' +
      escapeHtml(err.message) +
      '</p>';
    console.error(err);
  });

  // ---------- Filterchips ----------

  function buildGenreChips(data) {
    const genres = new Set();
    data.forEach((item) => (item.genres || []).forEach((g) => genres.add(g)));
    els.genreChips.innerHTML = '';
    [...genres]
      .sort((a, b) => a.localeCompare(b))
      .forEach((genre) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip' + (state.activeGenres.has(genre) ? ' chip-active' : '');
        chip.textContent = genre;
        chip.dataset.genre = genre;
        chip.addEventListener('click', () => {
          toggleSetValue(state.activeGenres, genre);
          chip.classList.toggle('chip-active');
          applyFilters();
        });
        els.genreChips.appendChild(chip);
      });
  }

  // Decennia komen uit de collectie zelf: je ziet dus enkel decennia die je
  // ook echt bezit, van oud naar nieuw. Titels zonder jaar krijgen een
  // aparte chip 'onbekend'.
  function buildDecadeChips(data) {
    if (!els.decadeChips) return;
    const decades = new Set();
    let hasUnknown = false;
    data.forEach((item) => {
      const d = decadeOf(item);
      if (d === null) hasUnknown = true;
      else decades.add(d);
    });

    const values = [...decades].sort((a, b) => a - b);
    if (hasUnknown) values.push('unknown');

    els.decadeChips.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeDecades.has(value) ? ' chip-active' : '');
      chip.textContent = value === 'unknown' ? 'onbekend' : decadeLabel(value);
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeDecades, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.decadeChips.appendChild(chip);
    });

    // Decennia die intussen uit de collectie verdwenen zijn, niet blijven filteren.
    [...state.activeDecades].forEach((v) => {
      if (!values.includes(v)) state.activeDecades.delete(v);
    });
  }

  // Leeftijdskeuring (Kijkwijzer/MPAA). De rij blijft verborgen zolang geen
  // enkele titel een keuring heeft — bv. vóór je één keer hebt ververst.
  function buildCertChips(data) {
    if (!els.certChips) return;
    const counts = {};
    data.forEach((item) => {
      const c = (item.certification || '').trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    });

    // Numerieke keuringen (6, 12, 16) netjes op leeftijd; de rest alfabetisch erna.
    const values = Object.keys(counts).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });

    if (els.certRow) els.certRow.classList.toggle('hidden', values.length === 0);
    if (els.certRow && values.length) els.certRow.classList.add('flex');

    els.certChips.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeCerts.has(value) ? ' chip-active' : '');
      chip.textContent = value;
      chip.title = `${counts[value]} titel(s)`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeCerts, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.certChips.appendChild(chip);
    });

    [...state.activeCerts].forEach((v) => {
      if (!values.includes(v)) state.activeCerts.delete(v);
    });
  }

  // Formaatchips komen uit de collectie zelf: je ziet enkel formaten die je
  // ook echt hebt, van hoogste naar laagste kwaliteit.
  function buildFormatChips(data) {
    if (!els.formatChips) return;
    const counts = {};
    data.forEach((item) => {
      allFormats(item).forEach((f) => {
        counts[f] = (counts[f] || 0) + 1;
      });
    });
    const values = MEDIA_FORMATS.map((f) => f.value).filter((v) => counts[v]);

    els.formatChips.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeFormats.has(value) ? ' chip-active' : '');
      chip.textContent = formatLabel(value);
      chip.title = `${counts[value]} titel(s)`;
      chip.dataset.format = value;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeFormats, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.formatChips.appendChild(chip);
    });

    [...state.activeFormats].forEach((v) => {
      if (!values.includes(v)) state.activeFormats.delete(v);
    });
  }

  // Chiprij op basis van een veld binnen de exemplaren (boxset, locatie).
  // Verschijnt pas zodra je dat veld ergens gebruikt.
  function buildEditionFieldChips(data, field, activeSet, chipsEl, rowEl) {
    if (!chipsEl) return;
    const counts = {};
    data.forEach((item) => {
      const values = new Set(
        (item.editions || []).map((e) => (e[field] || '').trim()).filter(Boolean)
      );
      values.forEach((v) => {
        counts[v] = (counts[v] || 0) + 1;
      });
    });
    const values = Object.keys(counts).sort((a, b) => a.localeCompare(b));

    if (rowEl) {
      rowEl.classList.toggle('hidden', values.length === 0);
      if (values.length) rowEl.classList.add('flex');
    }

    chipsEl.innerHTML = '';
    values.forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (activeSet.has(value) ? ' chip-active' : '');
      chip.textContent = value;
      chip.title = `${counts[value]} titel(s)`;
      chip.addEventListener('click', () => {
        toggleSetValue(activeSet, value);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      chipsEl.appendChild(chip);
    });

    [...activeSet].forEach((v) => {
      if (!values.includes(v)) activeSet.delete(v);
    });
  }

  /**
   * Chips voor de uitvoeringen (steelbook, limited, extended, director's cut).
   * Alleen de uitvoeringen die je écht bezit krijgen een chip — een lege rij
   * met vier knoppen die allemaal nul resultaten geven helpt niemand.
   */
  function buildVariantChips(data) {
    if (!els.variantChips || typeof EDITION_VARIANTS === 'undefined') return;
    const counts = {};
    data.forEach((item) => {
      const keys = new Set();
      (item.editions || []).forEach((e) => {
        if (e.wishlist) return;
        editionVariantKeys(e).forEach((k) => keys.add(k));
      });
      keys.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    });
    // Vaste volgorde uit EDITION_VARIANTS, niet alfabetisch: zo staan
    // verpakking en inhoud altijd op dezelfde plek.
    const aanwezig = EDITION_VARIANTS.filter((v) => counts[v.key]);

    if (els.variantRow) {
      els.variantRow.classList.toggle('hidden', aanwezig.length === 0);
      if (aanwezig.length) els.variantRow.classList.add('flex');
    }

    els.variantChips.innerHTML = '';
    aanwezig.forEach((v) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeVariants.has(v.key) ? ' chip-active' : '');
      chip.textContent = v.label;
      chip.title = `${counts[v.key]} titel(s)`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeVariants, v.key);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.variantChips.appendChild(chip);
    });

    [...state.activeVariants].forEach((k) => {
      if (!counts[k]) state.activeVariants.delete(k);
    });
  }

  function buildBoxsetChips(data) {
    buildEditionFieldChips(data, 'boxset', state.activeBoxsets, els.boxsetChips, els.boxsetRow);
  }

  function buildLocationChips(data) {
    buildEditionFieldChips(data, 'location', state.activeLocations, els.locationChips, els.locationRow);
  }

  // Universumchips: op basis van de geladen ledenlijsten. Tonen enkel universums
  // waarvan je ook echt een titel bezit of op je verlanglijst hebt.
  function buildUniverseChips() {
    if (!els.universeChips || !universeData) return;

    const counts = {};
    Object.values(universeByMovieId).forEach((set) => {
      set.forEach((uid) => {
        counts[uid] = (counts[uid] || 0) + 1;
      });
    });

    const universes = universeData.universes.filter((u) => counts[u.id]);
    if (els.universeRow) {
      els.universeRow.classList.toggle('hidden', universes.length === 0);
      if (universes.length) els.universeRow.classList.add('flex');
    }

    els.universeChips.innerHTML = '';
    universes.forEach((u) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.activeUniverses.has(u.id) ? ' chip-active' : '');
      chip.textContent = u.name;
      chip.title = `${counts[u.id]} titel(s) uit dit universum`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeUniverses, u.id);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
      els.universeChips.appendChild(chip);
    });

    [...state.activeUniverses].forEach((uid) => {
      if (!universes.some((u) => u.id === uid)) state.activeUniverses.delete(uid);
    });
  }

  // Alle chips die uit de data zelf worden afgeleid, in één keer opnieuw opbouwen.
  function buildFacetChips(data) {
    buildFormatChips(data);
    buildGenreChips(data);
    buildDecadeChips(data);
    buildCertChips(data);
    buildVariantChips(data);
    buildBoxsetChips(data);
    buildLocationChips(data);
    // Universumchips hangen af van live TMDb-data die apart geladen wordt.
    // Is die er al, dan de index verversen (een bewerkte of nieuwe titel kan
    // intussen bij een universum horen); anders vult loadUniverseData de index
    // vanzelf zodra de data binnen is.
    if (universeData) buildUniverseIndex();
    else buildUniverseChips();
  }

  function buildLetterChips() {
    if (!els.letterChips) return;
    const letters = ['#'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
    els.letterChips.innerHTML = '';
    letters.forEach((letter) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'letter-chip';
      chip.textContent = letter;
      chip.addEventListener('click', () => {
        state.activeLetter = state.activeLetter === letter ? null : letter;
        els.letterChips.querySelectorAll('.letter-chip').forEach((c) => {
          c.classList.toggle('letter-chip-active', c.textContent === state.activeLetter);
        });
        applyFilters();
      });
      els.letterChips.appendChild(chip);
    });
  }
  buildLetterChips();

  function toggleSetValue(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  // ---------- Filteren & sorteren ----------

  // Vingerafdruk van alles wat de sélectie bepaalt. Verandert die niet, dan is
  // er alleen data gewijzigd en blijft je positie in de lijst behouden.
  let lastFilterSignature = null;

  function filterSignature() {
    const s = (set) => [...set].sort().join(',');
    return [
      state.search.trim().toLowerCase(),
      s(state.activeFormats),
      s(state.activeTypes),
      s(state.activeGenres),
      s(state.activeStatus),
      s(state.activeSaga),
      s(state.activeWatched),
      s(state.activeLoaned),
      s(state.activeDecades),
      s(state.activeCerts),
      s(state.activeVariants),
      s(state.activeBoxsets),
      s(state.activeLocations),
      s(state.activeUniverses),
      state.activeLetter || '',
      state.sort,
      state.view,
      state.groupSagas ? 'g' : '',
    ].join('|');
  }

  /**
   * Alles wat jíj bij een titel schreef, als één doorzoekbare tekst (FASE 40).
   * Het resultaat wordt per titel onthouden zolang de titel niet verandert —
   * bij 680 titels wordt dit anders bij elke toetsaanslag opnieuw opgebouwd.
   */
  const eigenTekstCache = new WeakMap();
  function eigenTekstVan(item) {
    const gehad = eigenTekstCache.get(item);
    if (gehad !== undefined) return gehad;
    const stukken = [];
    const uitEd = (e) => {
      stukken.push(e.notes, e.boxset, e.location);
      if (typeof COLLECTOR_FIELDS !== 'undefined') {
        COLLECTOR_FIELDS.forEach((v) => { if (v.zoekbaar) stukken.push(e[v.key]); });
      }
    };
    (item.editions || []).forEach(uitEd);
    (item.seasons || []).forEach((s) => (s.editions || []).forEach(uitEd));
    const tekst = stukken.filter(Boolean).join(' ').toLowerCase();
    eigenTekstCache.set(item, tekst);
    return tekst;
  }
  /** Na een bewerking moet de zoektekst van die titel opnieuw opgebouwd worden. */
  function vergeetEigenTekst(item) {
    if (item) eigenTekstCache.delete(item);
  }

  function applyFilters() {
    const q = state.search.trim().toLowerCase();
    let list = state.all.filter((item) => {
      if (q) {
        const inTitle = String(item.title || '').toLowerCase().includes(q);
        const inOriginal = (item.original_title || '').toLowerCase().includes(q);
        // Gaf je een titel zelf een andere naam, dan blijft de TMDb-naam ook
        // werken als zoekterm — anders vind je hem niet meer terug onder de
        // naam die op het doosje staat.
        const inTmdbNaam = (item.tmdb_title || '').toLowerCase().includes(q);
        const inCast = (item.cast || []).some((name) => name.toLowerCase().includes(q));
        const inDirector = (item.director || '').toLowerCase().includes(q);
        const inWriters = (item.writers || '').toLowerCase().includes(q);
        const inSaga = sagaOf(item).toLowerCase().includes(q);
        // FASE 40 — je eigen aantekeningen waren nooit doorzoekbaar, terwijl
        // dáár tot nu toe alles in stond wat het datamodel niet kon opslaan.
        // Nu zoeken we ook in opmerkingen, boxset, locatie, aan wie je iets
        // uitleende, en de talen op de schijf — van films én van seizoenen.
        const inEigen = !inTitle && !inOriginal && !inTmdbNaam && !inCast && !inDirector && !inWriters && !inSaga
          ? eigenTekstVan(item).includes(q)
          : false;
        if (!inTitle && !inOriginal && !inTmdbNaam && !inCast && !inDirector && !inWriters && !inSaga && !inEigen) {
          return false;
        }
      }
      if (state.activeFormats.size && !allFormats(item).some((f) => state.activeFormats.has(f))) return false;
      if (state.activeVariants.size) {
        // Een titel telt mee zodra één van je exemplaren de gevraagde uitvoering
        // heeft. Verlanglijst-exemplaren tellen niet mee: het filter gaat over
        // wat er in je kast staat.
        const heeft = (item.editions || []).some(
          (e) => !e.wishlist && [...state.activeVariants].some((k) => e[k])
        );
        if (!heeft) return false;
      }
      if (state.activeBoxsets.size) {
        const boxes = (item.editions || []).map((e) => (e.boxset || '').trim()).filter(Boolean);
        if (!boxes.some((b) => state.activeBoxsets.has(b))) return false;
      }
      if (state.activeLocations.size) {
        const locs = (item.editions || []).map((e) => (e.location || '').trim()).filter(Boolean);
        if (!locs.some((l) => state.activeLocations.has(l))) return false;
      }
      if (state.activeUniverses.size) {
        const belongs = universeByMovieId[item.id];
        if (!belongs || ![...state.activeUniverses].some((u) => belongs.has(u))) return false;
      }
      if (state.activeTypes.size && !state.activeTypes.has(item.content_type)) return false;
      if (state.activeGenres.size) {
        const hasGenre = (item.genres || []).some((g) => state.activeGenres.has(g));
        if (!hasGenre) return false;
      }
      if (state.activeStatus.size) {
        const status = item.wishlist ? 'wishlist' : 'owned';
        if (!state.activeStatus.has(status)) return false;
      } else if (item.wishlist) {
        // Standaard toont de collectie enkel wat je bezit; de verlanglijst is een
        // opt-in via het statusfilter, niet iets dat je moet wegfilteren.
        return false;
      }
      if (state.activeWatched.size) {
        const w = item.watched ? 'watched' : 'unwatched';
        if (!state.activeWatched.has(w)) return false;
      }
      // FASE 40 — uitgeleend. Kijkt naar alle exemplaren, ook die van
      // seizoenen: leen je seizoen 2 uit, dan wil je die serie hier zien.
      if (state.activeLoaned.size) {
        const alle = (item.editions || []).concat(
          ...(item.seasons || []).map((s) => s.editions || [])
        );
        const uitgeleend = alle.some((e) => !e.wishlist && isUitgeleend(e));
        if (!state.activeLoaned.has(uitgeleend ? 'uit' : 'thuis')) return false;
      }
      // FASE 32 — filter op filmreeksen. Er was wel een filter op TV-reeksen,
      // maar niets om alleen films te zien die bij een reeks horen (Bond, Star
      // Wars, Alien). 'Reeksen groeperen' is een wéérgave, geen filter: dat
      // toont nog steeds al je losse titels ernaast.
      if (state.activeSaga.size) {
        const hoortBijReeks = sagaOf(item) ? 'in' : 'los';
        if (!state.activeSaga.has(hoortBijReeks)) return false;
      }
      if (state.activeDecades.size) {
        const d = decadeOf(item);
        if (!state.activeDecades.has(d === null ? 'unknown' : d)) return false;
      }
      if (state.activeCerts.size && !state.activeCerts.has((item.certification || '').trim())) return false;
      if (state.activeLetter && firstLetter(item) !== state.activeLetter) return false;
      return true;
    });

    list = sortList(list, state.sort);
    state.filtered = list;
    // FASE 41 — je keuzes onthouden, zodat ze een paginawissel overleven.
    bewaarFilters();
    werkVerlanglijstKnopBij();

    // Terug naar de eerste pagina hoort alleen te gebeuren als je de selectie
    // wijzigt — een filter, de zoekterm, de sortering of de weergave. Bewerk je
    // een titel die je pas na 'Toon meer' zag, dan moet je blijven waar je was.
    // Daarom vergelijken we een 'vingerafdruk' van de selectie in plaats van
    // op elke plek in de code te moeten onthouden wat er wel of niet mag.
    const signature = filterSignature();
    if (signature !== lastFilterSignature) {
      state.visibleCount = pageSizeForView(state.view);
      lastFilterSignature = signature;
    }

    updateFilterButton();
    render();
  }

  function sortList(list, mode) {
    const copy = [...list];
    switch (mode) {
      case 'title_asc':
        return copy.sort((a, b) => sortTitle(a).localeCompare(sortTitle(b)));
      case 'saga_asc':
        return copy.sort((a, b) => {
          const ka = sagaOf(a) ? sagaOf(a).toLowerCase() : sortTitle(a);
          const kb = sagaOf(b) ? sagaOf(b).toLowerCase() : sortTitle(b);
          if (ka !== kb) return ka.localeCompare(kb);
          // Zelfde reeks: op releasejaar
          return (a.release_year || 0) - (b.release_year || 0);
        });
      case 'my_rating_desc':
        // Zonder eigen score achteraan, anders zou een lege waarde bovenaan komen.
        return copy.sort((a, b) => (b.my_rating || -1) - (a.my_rating || -1));
      case 'watched_desc': {
        const last = (m) => {
          const log = m.watch_log || [];
          return log.length ? log[log.length - 1].date : '';
        };
        return copy.sort((a, b) => String(last(b)).localeCompare(String(last(a))));
      }
      case 'year_desc':
        return copy.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
      case 'year_asc':
        return copy.sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
      case 'value_desc':
        // Hoogste richtwaarde eerst; titels zonder prijsdata achteraan.
        return copy.sort((a, b) => (titleValue(b) ?? -1) - (titleValue(a) ?? -1));
      case 'value_asc':
        // Laagste richtwaarde eerst, maar titels zónder prijsdata achteraan
        // (anders zouden die als '0' bovenaan komen).
        return copy.sort((a, b) => {
          const va = titleValue(a);
          const vb = titleValue(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          return va - vb;
        });
      case 'date_added_desc':
      default: {
        // FASE 32 — nieuwe uploads kwamen niet bovenaan te staan.
        //
        // `date_added` bewaart alleen een dátum. Alles wat je op één dag
        // toevoegt is dus gelijk, en een stabiele sortering laat gelijke
        // waarden staan in de volgorde van movies.json — waar nieuwe titels
        // achteraan bijkomen. Een batch van vanmiddag belandde daardoor ónder
        // alles wat je die ochtend al had toegevoegd.
        //
        // Twee dingen lossen dat op: nieuwe titels krijgen sinds deze fase een
        // volledig tijdstip (`added_at`), en bij gelijke tijden valt de
        // sortering terug op de plek in het bestand — later toegevoegd staat
        // verderop, dus die hoort bovenaan. Zo staan ook je oudere titels,
        // die alleen een datum hebben, per dag in de juiste volgorde.
        const plek = new Map(state.all.map((m, i) => [m.id, i]));
        return copy.sort((a, b) => {
          const verschil = addedTime(b) - addedTime(a);
          if (verschil) return verschil;
          return (plek.get(b.id) ?? 0) - (plek.get(a.id) ?? 0);
        });
      }
    }
  }

  /**
   * Moment waarop een titel is toegevoegd, als getal.
   * `added_at` is een volledig tijdstip (nieuw sinds FASE 32), `date_added`
   * alleen een datum. Ontbreken beide, dan telt de titel als 'heel oud' zodat
   * hij niet per ongeluk bovenaan springt.
   */
  function addedTime(m) {
    const t = Date.parse(m.added_at || m.date_added || '');
    return isNaN(t) ? 0 : t;
  }

  // ---------- Weergave ----------

  // Bouwt de weergave-eenheden: losse titels, of (bij 'Groepeer reeksen')
  // één reekskaart per reeks + losse kaarten voor titels zonder reeks.
  function buildRenderUnits() {
    if (!state.groupSagas) {
      return state.filtered.map((item) => ({ type: 'item', item }));
    }
    const units = [];
    const groupIndex = {};
    state.filtered.forEach((item) => {
      const saga = sagaOf(item);
      if (!saga) {
        units.push({ type: 'item', item });
        return;
      }
      if (groupIndex[saga] === undefined) {
        groupIndex[saga] = units.length;
        units.push({ type: 'group', saga, items: [item] });
      } else {
        units[groupIndex[saga]].items.push(item);
      }
    });
    // Groepen met maar één (zichtbaar) deel tonen we als gewone kaart.
    return units.map((u) => (u.type === 'group' && u.items.length === 1 ? { type: 'item', item: u.items[0] } : u));
  }

  function applyViewClasses() {
    els.grid.className = VIEW_CONTAINER_CLASSES[state.view] || VIEW_CONTAINER_CLASSES.grid;
    if (els.viewChips) {
      els.viewChips.querySelectorAll('[data-view]').forEach((chip) => {
        chip.classList.toggle('chip-active', chip.dataset.view === state.view);
      });
    }
  }

  /**
   * Laadtoestand (FASE 29).
   *
   * Tussen inloggen en het binnenkomen van je collectie stond er niets: een
   * lege pagina die niet te onderscheiden is van "je hebt nog geen titels", of
   * van een app die vastloopt. Nu staan er grijze posterhokjes in de vorm van
   * het uiteindelijke raster, zodat je ziet dat er iets onderweg is. Ze worden
   * bij de eerste echte render vanzelf overschreven.
   */
  function showGridSkeleton() {
    if (!els.grid || state.all.length) return;
    applyViewClasses();
    const isRaster = state.view === 'grid' || state.view === 'shelf';
    const n = isRaster ? 12 : 8;
    const kaart = isRaster
      ? '<div class="skel-card"><div class="relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26]"><div class="poster-skel"></div></div><div class="skel-line mt-2"></div></div>'
      : '<div class="skel-card flex items-center gap-3 py-2"><div class="skel-line !w-8 !h-12 shrink-0"></div><div class="skel-line flex-1"></div></div>';
    els.grid.innerHTML = kaart.repeat(n);
    if (els.count) els.count.textContent = 'Collectie laden…';
    if (els.empty) els.empty.classList.add('hidden');
    if (els.loadMore) els.loadMore.classList.add('hidden');
  }

  /**
   * Lege toestand (FASE 30).
   *
   * Er stond één zin: "Geen titels gevonden met deze filters." Ook wanneer je
   * collectie gewoon nog leeg was — dan stuurt die zin je op zoek naar filters
   * die je nooit hebt aangezet. Het zijn twee verschillende situaties, met twee
   * verschillende volgende stappen.
   */
  function updateEmptyState() {
    if (!els.empty) return;
    const leeg = state.filtered.length === 0;
    els.empty.classList.toggle('hidden', !leeg);
    if (!leeg) return;

    if (state.all.length === 0) {
      els.empty.innerHTML =
        '<p class="text-[#F2F0EA] text-lg mb-2">Je collectie is nog leeg</p>' +
        '<p class="mb-5">Voeg je eerste schijf toe — zoek de titel op en kies het formaat.</p>' +
        (readOnly
          ? '<p class="text-xs">Je kijkt naar een bewaarde kopie. Log in met Google om titels toe te voegen.</p>'
          : '<button type="button" data-empty-add class="btn btn-primary">+ Eerste titel toevoegen</button>');
    } else {
      els.empty.innerHTML =
        '<p class="text-[#F2F0EA] text-lg mb-2">Niets gevonden</p>' +
        '<p class="mb-5">Geen van je ' + state.all.length + ' titels past bij deze zoekopdracht en filters.</p>' +
        '<button type="button" data-empty-clear class="chip">Alle filters wissen</button>';
    }

    const add = els.empty.querySelector('[data-empty-add]');
    if (add) {
      add.addEventListener('click', () => {
        const knop = document.getElementById('open-add-title-btn');
        if (knop) knop.click();
      });
    }
    const wis = els.empty.querySelector('[data-empty-clear]');
    if (wis) wis.addEventListener('click', () => clearAllFilters());
  }

  // Kaarten getrapt laten verschijnen na het bouwen van het raster.
  // Alleen kaarten die nog niet 'in' zijn: na "Toon meer" verschijnen zo enkel
  // de nieuwe kaarten, in plaats van dat de hele lijst opnieuw invliegt.
  function runReveal() {
    const cards = els.grid.querySelectorAll('.reveal:not(.in)');
    cards.forEach((c, i) => {
      // Cap de vertraging zodat een grote lijst niet traag oogt.
      c.style.transitionDelay = Math.min(i, 24) * 28 + 'ms';
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')));
    });
  }

  // ---------- Sfeerlicht koppelen (FASE 29) ----------
  //
  // Vroeger kreeg élke kaart een eigen mouseenter-handler, opnieuw bij elke
  // herteken-beurt. In de tekstweergave zijn dat 400 handlers die telkens weer
  // opgebouwd worden. Nu hangt er één handler op het raster; welke kaart het
  // betreft leiden we af uit het doelelement. Dat scheelt geheugen én maakt
  // "Toon meer" mogelijk zonder opnieuw te koppelen.

  function ambientItemFor(el) {
    const openId = el.dataset.openId;
    const groupKey = el.dataset.openGroup;
    if (openId) return state.all.find((m) => m.id === openId) || null;
    if (groupKey) return state.all.find((m) => sagaOf(m) === groupKey) || null;
    return null;
  }

  function wireAmbient(container) {
    // mouseover bubbelt (mouseenter niet), dus één handler volstaat.
    container.addEventListener('mouseover', (e) => {
      const el = e.target.closest && e.target.closest('[data-accent-id]');
      if (!el || !container.contains(el)) return;
      setAmbient(ambientItemFor(el), false, el.dataset.openGroup || el.dataset.accentId);
    });
    container.addEventListener('mouseleave', clearAmbient);
  }

  // Op een aanraakscherm bestaat hover niet, dus bleef de achtergrond daar
  // altijd zwart. Nu volgt hij wat je bekijkt: na het scrollen pakken we de
  // kaart die bovenaan in beeld staat. Bewust ná het scrollen (en niet tijdens)
  // en met één peiling in plaats van een waarnemer per kaart — scrollen op gsm
  // moet vloeiend blijven.
  let touchAmbientTimer = null;
  function wireTouchAmbient() {
    if (!IS_TOUCH || !els.ambient) return;
    window.addEventListener(
      'scroll',
      () => {
        clearTimeout(touchAmbientTimer);
        touchAmbientTimer = setTimeout(updateTouchAmbient, 220);
      },
      { passive: true }
    );
  }

  function updateTouchAmbient() {
    if (state.view === 'shelf' || !els.grid || els.grid.classList.contains('hidden')) return;
    const bar = document.querySelector('.sticky');
    // Onderkant van de vaste balk, maar nooit negatief: als de balk (nog) niet
    // plakt, zou de peiling anders buiten het scherm vallen en niets vinden.
    const barBottom = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
    const y = Math.min(barBottom + 40, window.innerHeight - 10);
    // Op drie plaatsen peilen in plaats van één: precies in het midden zit op
    // een gsm (twee kolommen) de tussenruimte tússen de posters, en dan vind je
    // niets. De eerste raak is goed genoeg.
    let kaart = null;
    for (const deel of [0.25, 0.5, 0.75]) {
      const el = document.elementFromPoint(Math.round(window.innerWidth * deel), Math.round(y));
      kaart = el && el.closest ? el.closest('[data-accent-id]') : null;
      if (kaart) break;
    }
    if (!kaart) return;
    setAmbient(ambientItemFor(kaart), false, kaart.dataset.openGroup || kaart.dataset.accentId);
  }

  // ---------- Raster tekenen ----------

  // In selectiemodus is een klik op een kaart een vinkje, geen pop-up.
  function toggleSelectCard(kaart) {
    const ids = (kaart.dataset.selIds || '').split(',').filter(Boolean);
    if (!ids.length) return;
    const aanzetten = !isUnitSelected(ids);
    ids.forEach((id) => (aanzetten ? state.selected.add(id) : state.selected.delete(id)));
    // Alleen deze kaart bijwerken; de rest opnieuw tekenen zou je scrollpositie
    // en de vlotte bediening kosten.
    kaart.classList.toggle('is-selected', aanzetten);
    const mark = kaart.querySelector('.select-mark');
    if (mark) mark.textContent = aanzetten ? '✓' : '';
    updateSelectBar();
  }

  /**
   * Eén klik- en één toetsafhandeling voor het hele raster, één keer gekoppeld
   * bij het opstarten. Voorheen kreeg elke kaart twee tot drie eigen handlers,
   * en werden die bij élke herteken-beurt opnieuw aangemaakt: bij 400 rijen
   * ruim duizend handlers per beurt. Met delegatie kan het raster ook groeien
   * zonder opnieuw te koppelen — dat is wat "Toon meer" licht maakt.
   */
  function wireGridInteractions() {
    if (!els.grid) return;

    const activeer = (e, viaToets) => {
      // Verwijderkruisje eerst: dat zit ín een kaart, dus anders opent de
      // detailmodal er overheen.
      const del = e.target.closest('[data-delete-id]');
      if (del && !state.selectMode) {
        e.stopPropagation();
        if (viaToets) e.preventDefault();
        handleDeleteTitle(del.dataset.deleteId, del.dataset.deleteTitle);
        return;
      }
      if (state.selectMode) {
        const kaart = e.target.closest('[data-sel-ids]');
        if (!kaart) return;
        if (viaToets) e.preventDefault();
        toggleSelectCard(kaart);
        return;
      }
      const opener = e.target.closest('[data-open-id],[data-open-group]');
      if (!opener) return;
      if (viaToets) e.preventDefault();
      if (opener.dataset.openId) openModal(opener.dataset.openId);
      else openGroupModal(opener.dataset.openGroup);
    };

    els.grid.addEventListener('click', (e) => activeer(e, false));
    els.grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      activeer(e, true);
    });

    wireAmbient(els.grid);
    wireTouchAmbient();
  }

  /** Sjabloonfunctie voor de huidige weergave. */
  function renderUnitFn() {
    return state.view === 'grid'
      ? (u) => (u.type === 'group' ? groupCardTemplate(u) : cardTemplate(u.item))
      : state.view === 'compact'
      ? (u) => (u.type === 'group' ? groupRowTemplate(u, true) : rowTemplate(u.item, true))
      : (u) => (u.type === 'group' ? groupRowTemplate(u, false) : rowTemplate(u.item, false));
  }

  /**
   * "Toon meer" zonder de hele lijst opnieuw op te bouwen.
   *
   * Voorheen verhoogde de knop het aantal en riep gewoon render() aan: die gooit
   * het raster leeg en bouwt álles opnieuw. Bij de derde klik in de
   * tekstweergave betekende dat 1200 rijen weggooien en 1600 nieuwe maken, met
   * een zichtbare hapering en een piek in geheugengebruik. Nu maken we enkel de
   * nieuwe kaarten en hangen we die achteraan.
   */
  function appendMore() {
    const units = buildRenderUnits();
    const vanaf = state.visibleCount;
    state.visibleCount += pageSizeForView(state.view);
    const extra = units.slice(vanaf, state.visibleCount);
    if (!extra.length) {
      els.loadMore.classList.add('hidden');
      return;
    }
    // Buiten het document opbouwen en in één keer invoegen: één layout-beurt
    // in plaats van één per kaart.
    const houder = document.createElement('div');
    houder.innerHTML = extra.map(renderUnitFn()).join('');
    const fragment = document.createDocumentFragment();
    while (houder.firstChild) fragment.appendChild(houder.firstChild);
    els.grid.appendChild(fragment);

    els.loadMore.classList.toggle('hidden', state.visibleCount >= units.length);
    volgCoverPosters();
    runReveal();
  }

  function render() {
    // Plankweergave heeft een eigen opbouw.
    if (state.view === 'shelf') {
      renderShelf();
      return;
    }
    els.grid.classList.remove('hidden');
    if (els.shelfStage) els.shelfStage.classList.add('hidden');
    // FASE 43 — de plank leeghalen bij het verlaten. Voorheen bleven zijn
    // slides de hele sessie in de DOM staan, ook al keek je naar het raster.
    ruimShelfOp();

    const units = buildRenderUnits();
    // Kom je terug uit de plank, zorg dan dat de ankertitel meegeladen wordt
    // (ook als die voorbij de eerste pagina ligt), zodat we ernaartoe kunnen.
    if (gridAnchor) {
      const idx = units.findIndex((u) =>
        gridAnchor.group
          ? u.type === 'group' && u.saga === gridAnchor.group
          : u.type !== 'group' && u.item.id === gridAnchor.id
      );
      if (idx >= 0) state.visibleCount = Math.max(state.visibleCount, idx + 1);
    }
    const visible = units.slice(0, state.visibleCount);
    const wishCount = state.filtered.filter((i) => i.wishlist).length;

    els.count.textContent =
      state.filtered.length + ' titel' + (state.filtered.length === 1 ? '' : 's') +
      (wishCount ? ` · ${wishCount} verlanglijst` : '');
    updateEmptyState();
    els.loadMore.classList.toggle('hidden', state.visibleCount >= units.length);

    applyViewClasses();

    els.grid.innerHTML = visible.map(renderUnitFn()).join('');

    // Klikken, toetsen en sfeerlicht hangen aan het ráster, niet aan de kaarten
    // (zie wireGridInteractions). Hier hoeft dus niets meer gekoppeld te worden.
    volgCoverPosters();
    runReveal();

    // Scroll naar de titel waar de plank stond en wis het anker. Uitgesteld tot
    // de volgende frame: het raster was tot zojuist verborgen, en meteen scrollen
    // (vóór de layout klaar is) doet in veel browsers niets.
    if (gridAnchor) {
      const key = gridAnchor;
      gridAnchor = null;
      requestAnimationFrame(() => {
        const el = [...els.grid.querySelectorAll('[data-open-id],[data-open-group]')].find((c) =>
          key.group ? c.dataset.openGroup === key.group : c.dataset.openId === key.id
        );
        if (!el) return;
        const bar = document.querySelector('.sticky');
        const barH = bar ? bar.getBoundingClientRect().height : 0;
        const y = window.scrollY + el.getBoundingClientRect().top - barH - 24;
        window.scrollTo({ top: Math.max(0, y) });
      });
    }
  }

  // ---------- Plankweergave / cover-flow (fase 20) ----------

  let shelfActive = 0;
  let shelfAnchor = null; // titel/reeks waarop de plank moet openen na wissel vanuit het raster
  let gridAnchor = null; // titel/reeks waarop het raster moet uitkomen na wissel vanuit de plank
  const SHELF_PAD = 20; // 10px links + rechts

  // Onthoudt welke kaart bovenaan in beeld staat, zodat de plank dáár opent
  // in plaats van waar hij de vorige keer bleef staan.
  function captureShelfAnchor() {
    if (!els.grid) return;
    // Onder de vaste zoekbalk beginnen, zodat we ankeren op wat je écht ziet.
    const bar = document.querySelector('.sticky');
    const cutoff = bar ? bar.getBoundingClientRect().bottom : 0;
    const cards = els.grid.querySelectorAll('[data-open-id],[data-open-group]');
    let best = null, bestTop = Infinity;
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      // De hoogst zichtbare kaart die onder de balk uitkomt.
      if (r.bottom > cutoff + 8 && r.top < bestTop) { bestTop = r.top; best = c; }
    });
    if (!best && cards.length) best = cards[0];
    shelfAnchor = best ? { id: best.dataset.openId || null, group: best.dataset.openGroup || null } : null;
  }

  // Leest de actuele slidebreedte uit de CSS-variabele, zodat de centrering
  // klopt op zowel breedbeeld als gsm.
  function shelfItemWidth() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--shelf-item');
    const n = parseInt(v, 10);
    return isNaN(n) ? 220 : n;
  }

  function renderShelf() {
    if (!els.shelfStage || !els.shelfTrack) return;
    // Eerst de chip-status bijwerken; daarna het raster verbergen, want
    // applyViewClasses() overschrijft de klasse van het raster.
    applyViewClasses();
    els.grid.classList.add('hidden');
    els.loadMore.classList.add('hidden');
    els.shelfStage.classList.remove('hidden');
    // Bij binnenkomst vanuit een andere weergave naar boven, zodat de (grote)
    // plank meteen volledig in beeld staat.
    if (shelfAnchor) window.scrollTo({ top: 0 });

    const units = buildRenderUnits();
    const wishCount = state.filtered.filter((i) => i.wishlist).length;
    els.count.textContent =
      state.filtered.length + ' titel' + (state.filtered.length === 1 ? '' : 's') +
      (wishCount ? ` · ${wishCount} verlanglijst` : '');
    updateEmptyState();

    shelfUnits = units;
    // Kom je vanuit het raster, open de plank dan op de titel die je daar zag.
    if (shelfAnchor) {
      const idx = units.findIndex((u) =>
        shelfAnchor.group
          ? u.type === 'group' && u.saga === shelfAnchor.group
          : u.type !== 'group' && u.item.id === shelfAnchor.id
      );
      if (idx >= 0) shelfActive = idx;
      shelfAnchor = null;
    }
    if (shelfActive >= units.length) shelfActive = 0;

    // Niets gevonden: de plank leegmaken. updateShelf() stopt hieronder meteen
    // bij een lege lijst, waardoor de naam, het jaar en het sfeerlicht van de
    // vórige titel bleven staan — alsof die nog geselecteerd was.
    if (!units.length) {
      els.shelfTrack.innerHTML = '';
      if (els.shelfMeta) els.shelfMeta.innerHTML = '';
      clearAmbient();
      return;
    }

    // FASE 43 — vroeger werd hier de volledige inhoud van álle eenheden
    // opgebouwd: bij 652 titels 3914 DOM-elementen en 652 losse klikhandlers,
    // goed voor een bevriezing van bijna een halve seconde. En na terugkeer
    // naar het raster bleven die 652 slides de hele sessie staan.
    //
    // Nu krijgt elke eenheid alleen een leeg hokje met de juiste breedte — dat
    // houdt de geometrie van de plank exact zoals ze was — en wordt de inhoud
    // pas gevuld voor de slides rond de actieve. Wat uit beeld schuift wordt
    // weer leeggemaakt.
    els.shelfTrack.innerHTML = units
      .map((u, i) => `<div class="shelf-slide" data-shelf-i="${i}"></div>`)
      .join('');

    // Eén handler op de rail in plaats van één per slide.
    if (!els.shelfTrack.dataset.wired) {
      els.shelfTrack.dataset.wired = '1';
      els.shelfTrack.addEventListener('click', (e) => {
        const slide = e.target.closest('[data-shelf-i]');
        if (!slide) return;
        const i = Number(slide.dataset.shelfI);
        const u = shelfUnits[i];
        if (!u) return;
        if (i === shelfActive) {
          if (u.type === 'group') openGroupModal(u.saga);
          else openModal(u.item.id);
        } else {
          shelfActive = i;
          updateShelf();
        }
      });
    }

    updateShelf();
  }

  /** De inhoud van één slide opbouwen; alleen voor wat in beeld komt. */
  function vulShelfSlide(slide, u) {
    if (!u || slide.dataset.gevuld === '1') return;
    const item = u.type === 'group' ? u.items[0] : u.item;
    const cover = posterUrl(item);
    const title = u.type === 'group' ? u.saga : item.title;
    slide.innerHTML = `
      <div class="poster-wrap relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] ring-1 ring-white/10 shadow-2xl">
        ${
          cover
            ? `<img data-src="${escapeAttr(cover)}" alt="${escapeAttr(title)}" class="shelf-img w-full h-full object-cover">`
            : posterFallbackHtml(title)
        }
        ${u.type === 'group' ? `<span class="saga-count">${u.items.length} delen</span>` : ribbonsHtml(item)}
      </div>`;
    slide.dataset.gevuld = '1';
  }

  /** Alles uit de plank halen. Aangeroepen bij het verlaten van die weergave. */
  function ruimShelfOp() {
    if (!els.shelfTrack) return;
    els.shelfTrack.querySelectorAll('.shelf-img').forEach((img) => img.removeAttribute('src'));
    els.shelfTrack.innerHTML = '';
    shelfUnits = [];
  }

  let shelfUnits = [];

  // Zoveel slides links en rechts van de actieve houden we "levend" (poster
  // geladen, 3D-transform aan). Alles daarbuiten lossen we, zodat het geheugen
  // begrensd blijft — anders houdt een grote collectie honderden grote posters
  // tegelijk in beeld en crasht de browser op een gsm.
  const SHELF_WINDOW = 5;

  function updateShelf() {
    if (!els.shelfTrack || !shelfUnits.length) return;
    const slides = els.shelfTrack.querySelectorAll('.shelf-slide');
    slides.forEach((s, i) => {
      const d = i - shelfActive;
      const img = s.querySelector('.shelf-img');
      if (Math.abs(d) > SHELF_WINDOW) {
        // Ver weg (en toch onzichtbaar buiten de plank): poster lossen, de
        // 3D-laag opheffen én — sinds FASE 43 — de inhoud helemaal weghalen.
        if (img && img.getAttribute('src')) img.removeAttribute('src');
        if (s.dataset.gevuld === '1' && Math.abs(d) > SHELF_WINDOW + 3) {
          // Iets ruimer dan het venster leegmaken, zodat één stapje heen en
          // weer niet telkens opnieuw opbouwt.
          s.innerHTML = '';
          delete s.dataset.gevuld;
        }
        s.style.transform = 'none';
        s.style.opacity = '0';
        return;
      }
      // Binnen bereik: inhoud opbouwen als dat nog niet gebeurd is.
      vulShelfSlide(s, shelfUnits[i]);
      const img2 = s.querySelector('.shelf-img');
      if (img2 && !img2.getAttribute('src') && img2.dataset.src) img2.setAttribute('src', img2.dataset.src);
      const scale = d === 0 ? 1 : 0.72;
      const opacity = d === 0 ? 1 : 0.5;
      const ry = Math.max(-1, Math.min(1, -d)) * 22;
      s.style.transform = `perspective(1000px) rotateY(${ry}deg) scale(${scale})`;
      s.style.opacity = opacity;
    });
    const stageW = els.shelfStage.clientWidth || 800;
    // De werkelijke slidebreedte uit de DOM meten (inclusief padding) i.p.v.
    // te schatten — anders stapelt een klein verschil op tot zichtbare drift.
    const stride = slides.length ? slides[0].offsetWidth : shelfItemWidth();
    els.shelfTrack.style.transform = `translateX(${stageW / 2 - (shelfActive * stride + stride / 2)}px)`;

    const u = shelfUnits[shelfActive];
    if (u) {
      const item = u.type === 'group' ? u.items[0] : u.item;
      const title = u.type === 'group' ? u.saga : item.title;
      const sub =
        u.type === 'group'
          ? `${u.items.length} delen`
          : `${item.release_year || ''}${item.rating ? ' · ★ ' + item.rating.toFixed(1) : ''} · ${ownedFormats(item)
              .map(formatLabel)
              .join(', ')}`;
      els.shelfMeta.innerHTML = `<p class="font-display text-3xl tracking-wide text-ink">${escapeHtml(
        title
      )}</p><p class="font-mono text-xs text-muted mt-1">${escapeHtml(sub)}</p>`;
      // De achtergrond baadt in de vervaagde poster van de gecentreerde titel
      // (voor een reeks: de poster van het eerste deel).
      setAmbient(item, true, u.type === 'group' ? u.saga : item.id);
    }
  }

  function shelfStep(delta) {
    if (state.view !== 'shelf' || !shelfUnits.length) return;
    shelfActive = Math.max(0, Math.min(shelfUnits.length - 1, shelfActive + delta));
    updateShelf();
  }

  // ---------- Acties (optimistic) ----------

  /* ---------- Ongedaan maken (FASE 41) ----------
   *
   * De terugdraaikant bestond al: backgroundSave() zet een mislukte opslag
   * netjes terug. Alleen was er geen knop — een verkeerde klik van jou was
   * definitief, terwijl een fout van de server dat niet was.
   *
   * Hier staat één helper. Elke handeling die iets weghaalt of omzet, meldt
   * wat er gebeurde en biedt meteen de weg terug aan.
   */
  function meldMetOngedaan(tekst, herstel) {
    showToast(tekst, 'ok', {
      duur: 9000,
      actie: {
        label: 'Ongedaan maken',
        fn: () => {
          try {
            herstel();
          } catch (err) {
            showToast('✗ Terugdraaien mislukt: ' + err.message, 'fout', { blijft: true });
          }
        },
      },
    });
  }

  function handleDeleteTitle(id, title) {
    if (!requireWrite()) return;
    // FASE 41 — "Dit kan niet ongedaan gemaakt worden" klopt niet meer: er
    // staat nu negen seconden lang een knop om het terug te halen, en de
    // hoesfoto's worden sinds FASE 39 bewaard in plaats van gewist.
    if (!confirm(`"${title}" volledig uit je collectie verwijderen?`)) return;

    const removed = state.all.find((m) => m.id === id);
    const idx = state.all.indexOf(removed);
    state.all = state.all.filter((m) => m.id !== id);
    buildFacetChips(state.all);
    applyFilters();
    if (!els.modal.classList.contains('hidden')) closeModal();

    backgroundSave(
      // Hoesfoto's pas opruimen nádat movies.json is weggeschreven. Mislukt dat,
      // dan draaien we de verwijdering terug en moeten de foto's er nog zijn.
      () =>
        deleteMovieInDrive(id).then(async () => {
          if (removed && typeof driveDeleteCoversOfMovie === 'function') {
            await driveDeleteCoversOfMovie(removed);
          }
        }),
      () => { if (removed) state.all.splice(Math.min(idx, state.all.length), 0, removed); },
      () => {
        if (removed) meldMetOngedaan(`"${title}" verwijderd`, () => herstelTitel(removed, idx));
      }
    );
  }

  /** Een verwijderde titel terugzetten, mét zijn hoesfoto's. */
  function herstelTitel(titel, idx) {
    if (!requireWrite()) return;
    state.all.splice(Math.min(idx, state.all.length), 0, titel);
    buildFacetChips(state.all);
    applyFilters();
    backgroundSave(
      async () => {
        if (typeof driveHerstelCoversOfMovie === 'function') await driveHerstelCoversOfMovie(titel);
        await upsertMovieInDrive(titel);
        showToast(`"${titel.title}" is terug`, 'ok');
      },
      () => { state.all = state.all.filter((m) => m !== titel); }
    );
  }

  /* ---------- Exemplaren per seizoen (FASE 35) ----------
   *
   * Een seizoen kon maar één schijf bevatten: één formaat, en verder niets.
   * Had je seizoen 1 op DVD én op Blu-ray, of een gewone uitgave naast een
   * steelbook, dan was daar geen plaats voor. Nu heeft een seizoen dezelfde
   * exemplaren als een film, met uitvoering, opmerking, locatie en boxset.
   */

  function seasonEditionsHtml(s) {
    // FASE 39 — hier stond `.filter((e) => !e.wishlist)`, waardoor het seizoen
    // dat je in FASE 37 op de verlanglijst zette nérgens verscheen: je zag
    // niets, je kon het niet weghalen, en nog eens klikken stapelde onzichtbare
    // duplicaten op. Wensen horen zichtbaar te zijn — met een eigen label,
    // zodat ze nooit met bezit verward worden.
    const alle = s.editions || [];
    const bezit = alle.filter((e) => !e.wishlist);
    const wensen = alle.filter((e) => e.wishlist);
    if (!alle.length) return '';

    const regel = (ed) => {
      const uitvoeringen =
        typeof editionVariantKeys === 'function'
          ? editionVariantKeys(ed)
              .map((k) => (EDITION_VARIANTS.find((v) => v.key === k) || {}).label || k)
              .join(' · ')
          : '';
      // FASE 40 — ook bij een seizoen-exemplaar tonen wat je betaalde, in welke
      // staat het is en aan wie je het uitleende.
      const verzamel =
        typeof collectorSamenvatting === 'function' ? collectorSamenvatting(ed) : [];
      const extra = [uitvoeringen, ed.boxset, ed.location, ed.notes]
        .concat(verzamel)
        .filter(Boolean)
        .join(' · ');
      const wens = !!ed.wishlist;
      return `
          <div class="flex items-center gap-2 py-1${wens ? ' opacity-90' : ''}">
            <span class="font-mono text-[11px] px-1.5 py-0.5 rounded" style="background:rgba(255,255,255,.06);color:${formatColor(
              ed.format
            )}">${escapeHtml(formatShort(ed.format) || '—')}</span>
            ${
              wens
                ? '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded border border-gold/40 text-gold shrink-0">wens</span>'
                : ''
            }
            <span class="text-[11px] text-muted truncate flex-1 min-w-0">${escapeHtml(extra)}</span>
            <button type="button" class="text-gold hover:text-white text-[11px] underline shrink-0"
              data-edit-season-ed="${s.season_number}" data-eid="${escapeAttr(ed.eid)}">bewerken</button>
            <button type="button" class="text-muted hover:text-red-400 text-[11px] underline shrink-0"
              data-del-season-ed="${s.season_number}" data-eid="${escapeAttr(ed.eid)}">weg</button>
          </div>`;
    };

    const kop = [];
    if (bezit.length) kop.push(bezit.length === 1 ? 'exemplaar' : bezit.length + ' exemplaren');
    if (wensen.length) kop.push(wensen.length === 1 ? '1 wens' : wensen.length + ' wensen');

    return `
      <div class="mt-2 rounded-md bg-bg/60 px-2 py-1">
        <p class="text-[10px] font-mono text-muted uppercase mb-0.5">${kop.join(' · ')}</p>
        ${bezit.map(regel).join('')}${wensen.map(regel).join('')}
        <button type="button" class="text-teal hover:text-white text-[11px] underline mt-1"
          data-add-season-ed="${s.season_number}">+ nog een exemplaar</button>
      </div>`;
  }

  /** Klein scherm om één seizoen-exemplaar in te vullen. */
  function seizoenExemplaarScherm(bestaand) {
    return new Promise((resolve) => {
      const ed = bestaand || {};
      const laag = document.createElement('div');
      laag.className = 'fixed inset-0 z-[97] flex items-center justify-center p-4 overflow-y-auto';
      laag.style.background = 'rgba(0,0,0,.8)';
      const paneel = document.createElement('div');
      paneel.className = 'bg-surface rounded-xl w-full max-w-md shadow-2xl ring-1 ring-white/10 p-5 my-auto';
      paneel.style.paddingBottom = 'calc(1.25rem + env(safe-area-inset-bottom))';

      const formaatOpties = MEDIA_FORMATS.map(
        (f) => `<option value="${escapeAttr(f.value)}"${ed.format === f.value ? ' selected' : ''}>${escapeHtml(f.label)}</option>`
      ).join('');
      const uitvoeringen = EDITION_VARIANTS.map(
        (v) => `
          <label class="flex items-center gap-1.5 text-xs">
            <input type="checkbox" data-v="${escapeAttr(v.key)}" class="w-4 h-4"${ed[v.key] ? ' checked' : ''}>
            ${escapeHtml(v.label)}
          </label>`
      ).join('');

      paneel.innerHTML = `
        <h2 class="font-display text-xl tracking-wide mb-4">${bestaand ? 'Exemplaar bewerken' : 'Exemplaar toevoegen'}</h2>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Formaat</label>
            <select data-f="format" class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink">${formaatOpties}</select>
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Uitvoering</label>
            <div class="flex flex-wrap gap-3">${uitvoeringen}</div>
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Opmerking</label>
            <input type="text" data-f="notes" value="${escapeAttr(ed.notes || '')}" placeholder="Bv. met slipcover"
              class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Boxset</label>
            <input type="text" data-f="boxset" value="${escapeAttr(ed.boxset || '')}" placeholder="Leeg laten bij een losse uitgave"
              class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Locatie</label>
            <input type="text" data-f="location" value="${escapeAttr(ed.location || '')}" placeholder="Bv. Kast woonkamer"
              class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
          </div>
          <!-- FASE 40 — dezelfde verzamelaarsvelden als bij een film: een
               seizoen-exemplaar is ook gewoon een schijf in je kast. -->
          <details class="rounded-md bg-bg/60 ring-1 ring-white/5"${
            typeof COLLECTOR_FIELDS !== 'undefined' &&
            COLLECTOR_FIELDS.some((v) => ed[v.key] !== '' && ed[v.key] != null)
              ? ' open'
              : ''
          }>
            <summary class="cursor-pointer select-none px-3 py-2 text-xs font-mono uppercase text-muted">Verzamelaarsgegevens</summary>
            <div data-col-box class="grid grid-cols-2 gap-3 px-3 pb-3">
              ${typeof collectorVeldenHtml === 'function' ? collectorVeldenHtml(ed, { stijl: 'compact' }) : ''}
            </div>
          </details>
        </div>
        <div class="flex gap-2 justify-end mt-5">
          <button type="button" data-annuleer class="chip">Annuleren</button>
          <button type="button" data-bewaar class="btn btn-primary">Bewaren</button>
        </div>`;

      laag.appendChild(paneel);

      const klaar = (waarde) => {
        document.removeEventListener('keydown', opToets);
        laag.remove();
        resolve(waarde);
      };
      const opToets = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); klaar(null); }
      };
      paneel.querySelector('[data-annuleer]').addEventListener('click', () => klaar(null));
      paneel.querySelector('[data-bewaar]').addEventListener('click', () => {
        const uit = {
          format: paneel.querySelector('[data-f="format"]').value,
          notes: paneel.querySelector('[data-f="notes"]').value.trim(),
          boxset: paneel.querySelector('[data-f="boxset"]').value.trim(),
          location: paneel.querySelector('[data-f="location"]').value.trim(),
        };
        paneel.querySelectorAll('[data-v]').forEach((cb) => {
          uit[cb.dataset.v] = cb.checked;
        });
        if (typeof collectorLeesVelden === 'function') {
          Object.assign(uit, collectorLeesVelden(paneel.querySelector('[data-col-box]')));
        }
        klaar(uit);
      });
      laag.addEventListener('click', (e) => { if (e.target === laag) klaar(null); });
      document.addEventListener('keydown', opToets);
      document.body.appendChild(laag);
    });
  }

  /** Wijziging aan de seizoenen wegschrijven, met terugdraaien bij een fout. */
  function bewaarSeizoenen(item, vorigeSeizoenen) {
    normalizeSeasonEditions(item);
    vergeetEigenTekst(item);
    buildFacetChips(state.all);
    applyFilters();
    openModal(item.id);
    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        item.seasons = vorigeSeizoenen;
        buildFacetChips(state.all);
        applyFilters();
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  async function handleAddSeasonEdition(item, seasonNumber) {
    if (!requireWrite()) return;
    const season = (item.seasons || []).find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const gegevens = await seizoenExemplaarScherm(null);
    if (!gegevens) return;
    const vorige = JSON.parse(JSON.stringify(item.seasons));
    if (!Array.isArray(season.editions)) season.editions = [];
    season.editions.push({
      ...nieuwSeizoenExemplaar(nextSeasonEditionId(season), gegevens.format),
      ...gegevens,
      date_added: new Date().toISOString().slice(0, 10),
    });
    bewaarSeizoenen(item, vorige);
  }

  async function handleEditSeasonEdition(item, seasonNumber, eid) {
    if (!requireWrite()) return;
    const season = (item.seasons || []).find((s) => s.season_number === seasonNumber);
    const ed = season && (season.editions || []).find((e) => e.eid === eid);
    if (!ed) return;
    const gegevens = await seizoenExemplaarScherm(ed);
    if (!gegevens) return;
    const vorige = JSON.parse(JSON.stringify(item.seasons));
    Object.assign(ed, gegevens);
    bewaarSeizoenen(item, vorige);
  }

  function handleDeleteSeasonEdition(item, seasonNumber, eid) {
    if (!requireWrite()) return;
    const season = (item.seasons || []).find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const ed = (season.editions || []).find((e) => e.eid === eid);
    if (!ed) return;
    const overblijft = (season.editions || []).filter((e) => !e.wishlist).length - 1;
    const vraag =
      overblijft > 0
        ? `Dit exemplaar (${formatLabel(ed.format)}) van seizoen ${seasonNumber} weghalen?\n\nJe houdt er nog ${overblijft} over.`
        : `Dit is je laatste exemplaar van seizoen ${seasonNumber}. Weghalen betekent dat je dit seizoen niet meer bezit.`;
    if (!confirm(vraag)) return;
    const vorige = JSON.parse(JSON.stringify(item.seasons));
    season.editions = (season.editions || []).filter((e) => e.eid !== eid);
    bewaarSeizoenen(item, vorige);
  }

  function handleRemoveSeason(item, seasonNumber) {
    const season = item.seasons.find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const aantal = (season.editions || []).filter((e) => !e.wishlist).length;
    const vraag =
      aantal > 1
        ? `Seizoen ${seasonNumber} helemaal weghalen? Je hebt er ${aantal} exemplaren van.`
        : `Seizoen ${seasonNumber} niet langer als 'in bezit' markeren?`;
    if (!confirm(vraag)) return;
    const prev = { owned: season.owned, format: season.format, editions: JSON.parse(JSON.stringify(season.editions || [])) };
    season.owned = false;
    season.format = '';
    season.editions = [];
    // Seizoensbezit bepaalt mee welke formaten je hebt, dus de filterchips
    // moeten opnieuw opgebouwd worden — anders bleef er een chip staan die geen
    // enkel resultaat meer geeft (of verscheen er geen nieuwe).
    buildFacetChips(state.all);
    applyFilters();
    openModal(item.id);
    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        season.owned = prev.owned;
        season.format = prev.format;
        season.editions = prev.editions;
        buildFacetChips(state.all);
        applyFilters();
        // Alleen heropenen als de modal nog openstond; anders springt hij
        // vanzelf weer open nadat je hem net gesloten had.
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  /**
   * Seizoen op de verlanglijst (FASE 37). Een exemplaar met `wishlist: true`,
   * dus het seizoen telt níet als in bezit — maar het staat wel vast dat je het
   * nog wil, en het verschijnt zo op de pagina Ontbreekt.
   */
  function handleWishSeason(item, seasonNumber, format) {
    if (!requireWrite()) return;
    const season = (item.seasons || []).find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const vorige = JSON.parse(JSON.stringify(item.seasons));
    if (!Array.isArray(season.editions)) season.editions = [];
    // FASE 39 — de wens was onzichtbaar, dus klikte je gewoon nog eens en
    // stapelden er duplicaten op. Zelfde formaat = niets te doen.
    if (season.editions.some((e) => e.wishlist && e.format === format)) {
      showToast(`Seizoen ${seasonNumber} stond al op je verlanglijst`, 'ok');
      return;
    }
    season.editions.push({
      ...nieuwSeizoenExemplaar(nextSeasonEditionId(season), format),
      wishlist: true,
      date_added: new Date().toISOString().slice(0, 10),
    });
    bewaarSeizoenen(item, vorige);
  }

  function handleAddSeason(item, seasonNumber, format) {
    const season = item.seasons.find((s) => s.season_number === seasonNumber);
    if (!season) return;
    const prev = { owned: season.owned, format: season.format, editions: JSON.parse(JSON.stringify(season.editions || [])) };
    season.owned = true;
    season.format = format;
    // Ook meteen als exemplaar vastleggen, zodat je er later een tweede naast
    // kan zetten (FASE 35).
    if (!Array.isArray(season.editions)) season.editions = [];
    season.editions.push({
      ...nieuwSeizoenExemplaar(nextSeasonEditionId(season), format),
      date_added: new Date().toISOString().slice(0, 10),
    });
    buildFacetChips(state.all);
    applyFilters();
    openModal(item.id);
    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        season.owned = prev.owned;
        season.format = prev.format;
        season.editions = prev.editions;
        buildFacetChips(state.all);
        applyFilters();
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  /* ---------- Selectiemodus (fase 27) ----------
   *
   * Eén titel verwijderen kon al, maar een hele reeks of een volledige
   * filterselectie niet — bij 200 per ongeluk geïmporteerde titels was dat
   * 200 keer klikken en bevestigen. Deze modus zet vinkjes op de kaarten en
   * rijen; het verwijderen zelf zit in handleBulkDelete().
   */

  // Vanaf hoeveel titels moet je het aantal overtypen? Eén misklik mag geen
  // halve collectie kosten.
  const BULK_TYPE_CONFIRM = 25;

  // De titel-id's achter één weergave-eenheid: één titel, of alle delen van
  // een gegroepeerde reeks.
  function unitIds(u) {
    return u.type === 'group' ? u.items.map((m) => m.id) : [u.item.id];
  }

  function isUnitSelected(ids) {
    return ids.length > 0 && ids.every((id) => state.selected.has(id));
  }

  // Het vinkje op een kaart of rij. Leeg buiten de selectiemodus, zodat er in
  // normaal gebruik geen enkel extra element per kaart wordt aangemaakt.
  function selectMarkHtml(ids) {
    if (!state.selectMode) return '';
    return `<span class="select-mark" aria-hidden="true">${isUnitSelected(ids) ? '✓' : ''}</span>`;
  }

  // Attributen voor de kaart-root: welke id's hangen eraan, en staat hij aan?
  function selectAttrs(ids) {
    if (!state.selectMode) return '';
    return ` data-sel-ids="${escapeAttr(ids.join(','))}"${isUnitSelected(ids) ? ' data-sel-on="1"' : ''}`;
  }

  function selectRootClass(ids) {
    return state.selectMode && isUnitSelected(ids) ? ' is-selected' : '';
  }

  function updateSelectBar() {
    if (!els.selectBar) return;
    els.selectBar.classList.toggle('hidden', !state.selectMode);
    document.body.classList.toggle('selecting', state.selectMode);
    if (els.selectToggle) {
      els.selectToggle.classList.toggle('chip-active', state.selectMode);
      els.selectToggle.setAttribute('aria-pressed', state.selectMode ? 'true' : 'false');
    }
    const n = state.selected.size;
    if (els.selectCount) {
      els.selectCount.textContent = n === 1 ? '1 geselecteerd' : `${n} geselecteerd`;
    }
    if (els.selectDelete) {
      els.selectDelete.disabled = n === 0;
      els.selectDelete.textContent = n ? `Verwijderen (${n})` : 'Verwijderen';
    }
    if (els.selectEdit) {
      els.selectEdit.disabled = n === 0;
      els.selectEdit.textContent = n ? `Bewerken (${n})` : 'Bewerken';
    }
  }

  function setSelectStatus(tekst, kleur) {
    if (!els.selectStatus) return;
    els.selectStatus.textContent = tekst || '';
    els.selectStatus.className = 'text-xs font-mono mt-2 ' + (kleur || 'text-muted') + (tekst ? '' : ' hidden');
  }

  function setSelectMode(aan) {
    state.selectMode = !!aan;
    if (!state.selectMode) state.selected.clear();
    setSelectStatus('');
    updateSelectBar();
    render();
  }

  // Alles wat op dit moment in beeld staat aanvinken. Bewust "in beeld" en niet
  // "alles wat het filter oplevert": wat je niet ziet, vink je niet per ongeluk aan.
  function selectAllVisible() {
    els.grid.querySelectorAll('[data-sel-ids]').forEach((el) => {
      el.dataset.selIds.split(',').filter(Boolean).forEach((id) => state.selected.add(id));
    });
    render();
    updateSelectBar();
  }

  /**
   * Verwijdert alle aangevinkte titels.
   *
   * Vier beveiligingen, in deze volgorde:
   * 1. De bevestiging noemt het aantal én de eerste vijf titels bij naam.
   * 2. Vanaf BULK_TYPE_CONFIRM moet je het aantal overtypen.
   * 3. Vlak vóór het verwijderen gaat er een backup naar Drive, terug te zetten
   *    via Beheer → Herstellen. Lukt die backup niet, dan stoppen we.
   * 4. Wegschrijven per blok van 25, met voortgang. Valt je sessie halverwege
   *    weg, dan weet je precies waar het gebleven is en is de rest nog intact.
   */
  // ---------- Massabewerking (FASE 32) ----------
  //
  // De selectiemodus kon alleen verwijderen. Zet je een hele batch per ongeluk
  // op het verkeerde formaat, dan was elke titel apart openen de enige weg
  // terug — bij honderd titels een avond werk.
  //
  // Bewust "van formaat X naar Y" en niet "zet alles op Y": een titel kan
  // meerdere exemplaren hebben (een DVD én een 4K van dezelfde film). Alles
  // botweg op één formaat zetten zou die samenvoegen tot twee identieke
  // exemplaren — onherstelbaar zonder backup.

  function bulkGeselecteerdeTitels() {
    const perId = new Map(state.all.map((m) => [m.id, m]));
    return [...state.selected].map((id) => perId.get(id)).filter(Boolean);
  }

  /** Hoe vaak elk formaat voorkomt binnen de selectie. */
  function bulkFormaatTelling(titels) {
    const telling = new Map();
    titels.forEach((m) => {
      (m.editions || []).forEach((ed) => {
        telling.set(ed.format, (telling.get(ed.format) || 0) + 1);
      });
    });
    return telling;
  }

  function vulFormaatKeuzes(telling) {
    const van = document.getElementById('bulk-format-from');
    const naar = document.getElementById('bulk-format-to');
    if (!van || !naar) return;

    // 'Van' toont alleen formaten die in de selectie voorkomen — kiezen uit
    // iets wat er niet is, levert alleen verwarring op.
    const aanwezig = MEDIA_FORMATS.filter((f) => telling.get(f.value));
    van.innerHTML =
      '<option value="">— niet wijzigen —</option>' +
      (aanwezig.length ? '<option value="*">alle formaten</option>' : '') +
      aanwezig
        .map((f) => `<option value="${escapeAttr(f.value)}">${escapeHtml(f.label)} (${telling.get(f.value)})</option>`)
        .join('');
    naar.innerHTML = MEDIA_FORMATS.map(
      (f) => `<option value="${escapeAttr(f.value)}">${escapeHtml(f.label)}</option>`
    ).join('');
    van.value = '';
    naar.value = 'dvd';
  }

  function bulkFormaatHint() {
    const van = document.getElementById('bulk-format-from');
    const naar = document.getElementById('bulk-format-to');
    const hint = document.getElementById('bulk-format-hint');
    if (!van || !naar || !hint) return;
    if (!van.value) {
      hint.textContent = 'Kies een formaat om om te zetten, of laat dit staan.';
      return;
    }
    const titels = bulkGeselecteerdeTitels();
    let raak = 0;
    titels.forEach((m) => {
      (m.editions || []).forEach((ed) => {
        if ((van.value === '*' || ed.format === van.value) && ed.format !== naar.value) raak++;
      });
    });
    hint.textContent =
      raak === 0
        ? 'Dit wijzigt niets — die exemplaren staan al op dat formaat.'
        : `Dit wijzigt ${raak} ${raak === 1 ? 'exemplaar' : 'exemplaren'}.`;
  }

  function openBulkEdit() {
    if (!requireWrite()) return;
    const titels = bulkGeselecteerdeTitels();
    if (!titels.length || !els.bulkEditModal) return;

    const exemplaren = titels.reduce((n, m) => n + ((m.editions || []).length || 0), 0);
    const scope = document.getElementById('bulk-edit-scope');
    if (scope) {
      scope.textContent =
        `${titels.length} ${titels.length === 1 ? 'titel' : 'titels'} · ` +
        `${exemplaren} ${exemplaren === 1 ? 'exemplaar' : 'exemplaren'}`;
    }
    vulFormaatKeuzes(bulkFormaatTelling(titels));
    bulkFormaatHint();
    ['bulk-status', 'bulk-watched'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const loc = document.getElementById('bulk-location');
    if (loc) loc.value = '';
    setBulkEditStatus('');
    els.bulkEditModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeBulkEdit() {
    if (!els.bulkEditModal) return;
    els.bulkEditModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  function setBulkEditStatus(tekst, kleur) {
    const el = document.getElementById('bulk-edit-status');
    if (!el) return;
    el.textContent = tekst || '';
    el.className = 'text-sm font-mono mt-5 ' + (kleur || 'text-muted');
  }

  /**
   * Past de gekozen wijzigingen toe op één titel. Geeft terug of er
   * daadwerkelijk iets veranderd is, zodat we alleen gewijzigde titels
   * wegschrijven.
   */
  function bulkPasToe(m, keuze) {
    let gewijzigd = false;

    (m.editions || []).forEach((ed) => {
      if (keuze.formaatVan && (keuze.formaatVan === '*' || ed.format === keuze.formaatVan)) {
        if (ed.format !== keuze.formaatNaar) {
          ed.format = keuze.formaatNaar;
          gewijzigd = true;
        }
      }
      if (keuze.status) {
        const wens = keuze.status === 'wishlist';
        if (ed.wishlist !== wens) {
          ed.wishlist = wens;
          gewijzigd = true;
        }
      }
      if (keuze.locatie !== null) {
        const nieuweLoc = keuze.locatie;
        if ((ed.location || '') !== nieuweLoc) {
          ed.location = nieuweLoc;
          gewijzigd = true;
        }
      }
    });

    if (keuze.bekeken !== null) {
      if (!!m.watched !== keuze.bekeken) {
        m.watched = keuze.bekeken;
        gewijzigd = true;
      }
    }

    if (gewijzigd && typeof syncLegacyFieldsFromEditions === 'function') {
      syncLegacyFieldsFromEditions(m);
    }
    return gewijzigd;
  }

  async function pasBulkEditToe() {
    if (!requireWrite()) return;
    const titels = bulkGeselecteerdeTitels();
    if (!titels.length) return;

    const van = document.getElementById('bulk-format-from');
    const naar = document.getElementById('bulk-format-to');
    const statusKeuze = document.getElementById('bulk-status');
    const bekekenKeuze = document.getElementById('bulk-watched');
    const locInvoer = document.getElementById('bulk-location');

    const ruweLocatie = locInvoer ? locInvoer.value : '';
    const keuze = {
      formaatVan: van && van.value ? van.value : '',
      formaatNaar: naar ? naar.value : '',
      status: statusKeuze ? statusKeuze.value : '',
      bekeken: bekekenKeuze && bekekenKeuze.value ? bekekenKeuze.value === 'yes' : null,
      // Leeg = niet wijzigen. Alleen spaties = bewust leegmaken.
      locatie: ruweLocatie === '' ? null : ruweLocatie.trim(),
    };

    if (!keuze.formaatVan && !keuze.status && keuze.bekeken === null && keuze.locatie === null) {
      setBulkEditStatus('Er is niets gekozen om te wijzigen.', 'text-gold');
      return;
    }

    // Op een kopie proberen: pas als we weten wat er verandert, vragen we
    // bevestiging. Zo staat het aantal in de vraag en niet een schatting.
    const kopie = JSON.parse(JSON.stringify(titels));
    const teWijzigen = kopie.filter((m) => bulkPasToe(m, keuze));
    if (!teWijzigen.length) {
      setBulkEditStatus('Alles stond al zo — er is niets gewijzigd.', 'text-gold');
      return;
    }

    const regels = [`${teWijzigen.length} ${teWijzigen.length === 1 ? 'titel wordt' : 'titels worden'} gewijzigd:`, ''];
    if (keuze.formaatVan) {
      regels.push(
        `• formaat ${keuze.formaatVan === '*' ? 'alles' : formatLabel(keuze.formaatVan)} → ${formatLabel(keuze.formaatNaar)}`
      );
    }
    if (keuze.status) regels.push(`• status → ${keuze.status === 'wishlist' ? 'verlanglijst' : 'in bezit'}`);
    if (keuze.bekeken !== null) regels.push(`• bekeken → ${keuze.bekeken ? 'ja' : 'nee'}`);
    if (keuze.locatie !== null) regels.push(`• locatie → ${keuze.locatie || '(leeg)'}`);
    regels.push('', 'Er wordt eerst een backup naar Drive geschreven.', '', 'Doorgaan?');
    if (!confirm(regels.join('\n'))) return;

    const knop = document.getElementById('bulk-edit-apply');
    if (knop) knop.disabled = true;

    try {
      setBulkEditStatus('Backup maken naar Drive…');
      try {
        await driveBackupNow('voor-bewerken');
      } catch (err) {
        setBulkEditStatus('Backup mislukt, er is niets gewijzigd: ' + err.message, 'text-red-400');
        return;
      }

      // Nu pas op de échte objecten toepassen.
      const gewijzigd = titels.filter((m) => bulkPasToe(m, keuze));

      const BLOK = 25;
      for (let start = 0; start < gewijzigd.length; start += BLOK) {
        const blok = gewijzigd.slice(start, start + BLOK);
        setBulkEditStatus(`Opslaan… (${Math.min(start + blok.length, gewijzigd.length)}/${gewijzigd.length})`);
        await upsertMoviesBatchInDrive(blok);
      }

      buildFacetChips(state.all);
      applyFilters();
      setBulkEditStatus(`✓ ${gewijzigd.length} ${gewijzigd.length === 1 ? 'titel' : 'titels'} gewijzigd.`, 'text-teal');
      showToast(`✓ ${gewijzigd.length} ${gewijzigd.length === 1 ? 'titel' : 'titels'} gewijzigd`, 'ok');
      setTimeout(closeBulkEdit, 900);
    } catch (err) {
      console.error('Massabewerking mislukt:', err);
      setBulkEditStatus('✗ ' + err.message + ' — zet zo nodig de backup terug via Beheer → Herstellen.', 'text-red-400');
      // Wat er lokaal al gewijzigd is, opnieuw ophalen zodat het scherm klopt
      // met wat er écht in Drive staat.
      if (window.__collectionReload) window.__collectionReload();
    } finally {
      if (knop) knop.disabled = false;
    }
  }

  async function handleBulkDelete() {
    if (!requireWrite()) return;
    const ids = [...state.selected];
    if (!ids.length) return;

    const perId = new Map(state.all.map((m) => [m.id, m]));
    const titels = ids.map((id) => (perId.get(id) || {}).title || id);
    const voorbeeld =
      titels.slice(0, 5).map((t) => '\u2022 ' + t).join('\n') +
      (titels.length > 5 ? `\n\u2026 en ${titels.length - 5} andere` : '');

    if (
      !confirm(
        `${ids.length} ${ids.length === 1 ? 'titel' : 'titels'} verwijderen uit je collectie?\n\n` +
          voorbeeld +
          `\n\nEr wordt eerst een backup naar je Google Drive geschreven; je kan dit terugzetten via Beheer \u2192 Herstellen.`
      )
    ) {
      return;
    }

    if (ids.length >= BULK_TYPE_CONFIRM) {
      const antwoord = prompt(
        `Je staat op het punt ${ids.length} titels te verwijderen.\n\n` +
          `Typ het aantal (${ids.length}) om te bevestigen:`
      );
      if (antwoord === null) return;
      if (antwoord.trim() !== String(ids.length)) {
        setSelectStatus('Het getal kwam niet overeen \u2014 er is niets verwijderd.', 'text-gold');
        return;
      }
    }

    const knoppen = [els.selectDelete, els.selectAll, els.selectNone, els.selectClose].filter(Boolean);
    knoppen.forEach((b) => (b.disabled = true));

    try {
      setSelectStatus('Backup maken naar Drive\u2026');
      try {
        await driveBackupNow('voor-verwijderen');
      } catch (err) {
        setSelectStatus('Backup mislukt, er is niets verwijderd: ' + err.message, 'text-red-400');
        return;
      }

      const BLOK = 25;
      let weg = 0;
      for (let start = 0; start < ids.length; start += BLOK) {
        const blok = ids.slice(start, start + BLOK);
        setSelectStatus(`Verwijderen\u2026 (${Math.min(start + blok.length, ids.length)}/${ids.length})`);
        await deleteMoviesInDrive(blok);

        // Pas ná het wegschrijven: hoesfoto's opruimen en de titels uit het
        // scherm halen. Strandt het hierna, dan klopt wat je ziet met Drive.
        for (const id of blok) {
          const m = perId.get(id);
          if (m && typeof driveDeleteCoversOfMovie === 'function') {
            try {
              await driveDeleteCoversOfMovie(m);
            } catch {
              // Een achtergebleven foto is vervelend, geen reden om te stoppen.
            }
          }
          state.selected.delete(id);
        }
        const gedaan = new Set(blok);
        state.all = state.all.filter((m) => !gedaan.has(m.id));
        weg += blok.length;
        buildFacetChips(state.all);
        applyFilters();
        updateSelectBar();
      }

      setSelectStatus(
        `\u2713 ${weg} ${weg === 1 ? 'titel' : 'titels'} verwijderd. Terugzetten kan via Beheer \u2192 Herstellen.`,
        'text-teal'
      );
    } catch (err) {
      setSelectStatus('\u2717 Gestopt: ' + err.message + ' \u2014 wat al verwijderd is, blijft verwijderd.', 'text-red-400');
      buildFacetChips(state.all);
      applyFilters();
    } finally {
      knoppen.forEach((b) => (b.disabled = false));
      updateSelectBar();
    }
  }

  // ---------- Kaarten ----------

  // Alle formaten die je van deze titel bezit, van hoog naar laag. Bij series
  // tellen ook de formaten van de seizoenen mee.
  function ownedFormats(item) {
    const set = new Set();
    (item.editions || []).forEach((e) => {
      if (!e.wishlist) set.add(e.format);
    });
    (item.seasons || []).forEach((s) => {
      // Sinds FASE 35 kan één seizoen meerdere exemplaren hebben. Zonder deze
      // lus zag het formaatfilter alleen het béste formaat per seizoen, en vond
      // je je DVD-seizoen niet meer zodra je er ook een Blu-ray van had.
      (s.editions || []).forEach((e) => {
        if (!e.wishlist && e.format) set.add(e.format);
      });
      if (!(s.editions || []).length && s.owned && s.format) set.add(s.format);
    });
    return [...set].sort((a, b) => formatRank(b) - formatRank(a));
  }

  // Alle formaten, inclusief die op je verlanglijst staan. Voor het filteren.
  function allFormats(item) {
    const set = new Set((item.editions || []).map((e) => e.format));
    (item.seasons || []).forEach((s) => {
      (s.editions || []).forEach((e) => {
        if (e.format) set.add(e.format);
      });
      if (!(s.editions || []).length && s.owned && s.format) set.add(s.format);
    });
    return [...set];
  }

  // ---------- Prijzen op de collectiepagina (fase 23) ----------
  //
  // De richtwaarde en de range komen uit price_history.json — dezelfde bron als
  // de prijzen- en verzekeringspagina. We tonen ze hier alleen (lezen), we
  // verversen niets: verversen gebeurt op de prijzenpagina via de Worker.

  // Benaderende wisselkoersen naar euro, voor titels waarvan enkel een niet-
  // euromarkt (meestal het VK) een prijs opleverde. Eén vaste koers houdt het
  // licht en stabiel; werk hem hier bij als je hem wil actualiseren.
  const FX_TO_EUR = { EUR: 1, GBP: 1.17, USD: 0.92 };

  // Sleutel per gevolgd exemplaar. LET OP: moet exact gelijk blijven aan
  // priceKeyFor() in assets/price-app.js, anders vinden we de metingen niet.
  function priceKeyForLocal(movieId, format, opts) {
    const o = opts || {};
    let key = `${movieId}|${format}`;
    if (o.season) key += `|s${o.season}`;
    const variants = o.variants || [];
    if (variants.length) key += '|' + variants.join('+');
    return key;
  }

  // Bouwt state.priceIndex: sleutel -> laatste niet-gearchiveerde meting.
  // Achtergrondtaak; na afloop verversen we de weergave.
  function loadPriceIndex() {
    if (typeof driveLoadPrices !== 'function') return;
    driveLoadPrices()
      .then(({ prices }) => {
        const idx = {};
        (prices || []).forEach((p) => {
          if (!p || p.archived || !p.id) return;
          const hist = p.history || [];
          if (!hist.length) return;
          const last = hist[hist.length - 1];
          idx[p.id] = {
            value: last.ebay_median != null ? last.ebay_median : last.ebay_avg,
            q1: last.ebay_q1,
            q3: last.ebay_q3,
            low: last.ebay_low,
            high: last.ebay_high,
            currency: last.ebay_currency || 'EUR',
            date: last.date || '',
          };
        });
        state.priceIndex = idx;
        // Opnieuw filteren/renderen zodat de bedragen verschijnen en een
        // eventuele sortering-op-waarde meteen klopt.
        applyFilters();
      })
      .catch((e) => console.warn('Prijsgegevens niet geladen:', e));
  }

  // Zoekt de meting voor een sleutel, met dezelfde terugval als de
  // verzekeringsexport: eerst de volledige sleutel (met uitvoeringen), dan
  // titel|formaat, dan het kale titel-id (oude data).
  function pricePointFor(...keys) {
    for (const k of keys) {
      if (k && state.priceIndex[k]) return state.priceIndex[k];
    }
    return null;
  }

  // Richtwaarde + range voor één filmexemplaar (editie).
  function editionPriceInfo(item, edition) {
    const variants = editionVariantKeys(edition);
    const p = pricePointFor(
      priceKeyForLocal(item.id, edition.format, { variants }),
      `${item.id}|${edition.format}`,
      item.id
    );
    return normalizePriceInfo(p, edition.format);
  }

  // Richtwaarde + range voor één seizoen van een serie.
  function seasonPriceInfo(item, season) {
    const fmt = season.format || item.format;
    // Uitvoeringen van het eerste bezeten exemplaar, net als in de export.
    const ed = (item.editions || []).filter((e) => !e.wishlist)[0] || (item.editions || [])[0] || {};
    const variants = editionVariantKeys(ed);
    const p = pricePointFor(
      priceKeyForLocal(item.id, fmt, { season: season.season_number, variants }),
      `${item.id}|${fmt}|s${season.season_number}`,
      `${item.id}|${fmt}`,
      item.id
    );
    return normalizePriceInfo(p, fmt);
  }

  function normalizePriceInfo(p, format) {
    if (!p || p.value == null) return null;
    // `point` (helemaal onderaan toegevoegd) is de ruwe meting uit de index.
    // Daarmee kan ownedPriceInfos zien of twee exemplaren of seizoenen op
    // dezelfde meting uitkomen — zie de uitleg daar.
    const cur = p.currency || 'EUR';
    // Titels waarvan enkel een niet-euromarkt (meestal het VK) een prijs gaf,
    // rekenen we om naar euro met een vaste benaderende koers. Zo staat alles
    // in dezelfde munt: het totaal, de sortering en de weergave kloppen dan.
    const rate = FX_TO_EUR[cur] != null ? FX_TO_EUR[cur] : 1;
    const conv = (v) => (v == null ? null : Math.round(v * rate * 100) / 100);
    const lowRaw = p.q1 != null ? p.q1 : p.low != null ? p.low : p.value;
    const highRaw = p.q3 != null ? p.q3 : p.high != null ? p.high : p.value;
    return {
      format,
      value: conv(p.value),
      low: conv(lowRaw),
      high: conv(highRaw),
      currency: 'EUR',
      convertedFrom: cur !== 'EUR' ? cur : null,
      date: p.date || '',
      point: p,
    };
  }

  /**
   * Alle bezeten exemplaren van een titel met hun richtwaarde/range. Series met
   * seizoensgegevens: één regel per bezeten seizoen; anders één per
   * (niet-verlanglijst-)editie.
   *
   * Elke meting telt hoogstens één keer mee. Dat is nodig door de terugval in
   * pricePointFor: een oude meting die alleen onder het kale titel-id staat
   * (of onder "titel|formaat" bij twee exemplaren van hetzelfde formaat) wordt
   * anders door élk exemplaar en élk seizoen opgepikt. Een serie met één
   * gemeten box en zes bezeten seizoenen kwam zo op zesmaal de waarde uit —
   * bovenaan bij "Sorteer op waarde" en met honderden euro's te veel in de
   * statistieken. Komt een tweede regel op dezelfde meting uit, dan tonen we
   * daar geen bedrag: we weten simpelweg niet wat dát exemplaar waard is.
   */
  function ownedPriceInfos(item) {
    const gebruikt = new Set();
    const uniek = (info) => {
      if (!info) return null;
      if (info.point && gebruikt.has(info.point)) return null;
      if (info.point) gebruikt.add(info.point);
      return info;
    };

    const ownedSeasons = (item.seasons || []).filter((s) => s.owned);
    if (ownedSeasons.length) {
      return ownedSeasons.map((s) => ({
        label: `Seizoen ${s.season_number}`,
        format: s.format || item.format,
        info: uniek(seasonPriceInfo(item, s)),
      }));
    }
    return (item.editions || [])
      .filter((e) => !e.wishlist)
      .map((e) => ({ label: formatLabel(e.format), format: e.format, info: uniek(editionPriceInfo(item, e)) }));
  }

  // Somwaarde van een titel (voor de sortering). Titels zonder enige meting
  // krijgen null, zodat ze achteraan belanden.
  function titleValue(item) {
    const infos = ownedPriceInfos(item).map((x) => x.info).filter(Boolean);
    if (!infos.length) return null;
    return infos.reduce((sum, i) => sum + (i.value || 0), 0);
  }

  // Muntsymbool zoals op de prijzenpagina; ponden/euro's worden nooit gemengd.
  function priceSymbol(cur) {
    return cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : (cur || '') + ' ';
  }

  // Kort bedrag: hele euro's zonder decimalen (€6), anders met komma (€13,95).
  function priceMoney(value, cur) {
    if (value == null) return '';
    const sym = priceSymbol(cur);
    const n = Math.round(value * 100) / 100;
    const txt = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
    return sym + txt;
  }

  // Eén compacte prijsregel: richtwaarde + range. compact=true laat het label
  // (formaat) weg wanneer de context dat al toont.
  function priceRangeText(info) {
    if (!info) return '';
    const mid = priceMoney(info.value, info.currency);
    const showRange = info.low != null && info.high != null && info.low !== info.high;
    return showRange
      ? `${mid} · ${priceMoney(info.low, info.currency)}–${priceMoney(info.high, info.currency)}`
      : mid;
  }

  // Waarde-pill voor op de poster: één afgerond totaalbedrag (alle bezeten
  // exemplaren samen, in euro). Leeg als er (nog) geen prijsdata is. De
  // opsplitsing per formaat + range staat in de detailmodal.
  function cardValueBadgeHtml(item) {
    // Op verlanglijst-kaarten geen pill: die zou op gsm botsen met de
    // volle-breedte "Verlanglijst"-banner onderaan de poster. De waarde blijft
    // zichtbaar in de detailmodal.
    if (item.wishlist) return '';
    const total = titleValue(item);
    if (total == null) return '';
    const txt = '€' + Math.round(total).toLocaleString('nl-BE');
    return `<span class="value-badge" title="Totale richtwaarde van deze titel (eBay-mediaan, omgerekend naar euro)">${escapeHtml(
      txt
    )}</span>`;
  }

  // Kleine hint voor in de detailmodal wanneer een bedrag uit een niet-
  // euromunt is omgerekend (meestal het VK).
  function convertedHint(info) {
    if (!info || !info.convertedFrom) return '';
    const sym = info.convertedFrom === 'GBP' ? '£' : info.convertedFrom === 'USD' ? '$' : info.convertedFrom;
    return ` <span class="text-muted">· omgerekend uit ${escapeHtml(sym)}</span>`;
  }

  // Opgetelde richtwaarde van alle delen in een gegroepeerde reeks (in euro).
  // Null als geen enkel deel prijsdata heeft.
  function groupValue(unit) {
    const vals = unit.items.map(titleValue).filter((v) => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0);
  }

  // Waarde-pill voor een reeks-kaart (som van alle delen).
  function groupValueBadgeHtml(unit) {
    const total = groupValue(unit);
    if (total == null) return '';
    const txt = '€' + Math.round(total).toLocaleString('nl-BE');
    return `<span class="value-badge" title="Totale richtwaarde van deze reeks (eBay-mediaan, omgerekend naar euro)">${escapeHtml(
      txt
    )}</span>`;
  }

  // Totaalbedrag van een reeks voor de tekst-/compacte rij.
  function rowGroupValueHtml(unit) {
    const total = groupValue(unit);
    if (total == null) return '';
    const txt = '€' + Math.round(total).toLocaleString('nl-BE');
    return `<span class="font-mono text-[11px] text-teal/90 w-16 text-right shrink-0" title="Totale richtwaarde van deze reeks">${escapeHtml(
      txt
    )}</span>`;
  }

  // Compacte totaalwaarde voor de tekst-/compacte rij (één bedrag; de
  // opsplitsing per formaat staat op de kaart en in de detailmodal).
  function rowValueHtml(item) {
    const v = titleValue(item);
    if (v == null) return '';
    const infos = ownedPriceInfos(item).map((x) => x.info).filter(Boolean);
    const cur = infos.length ? infos[0].currency : 'EUR';
    return `<span class="font-mono text-[11px] text-teal/90 w-16 text-right shrink-0" title="Totale richtwaarde van dit exemplaar">${escapeHtml(
      priceMoney(v, cur)
    )}</span>`;
  }

  function ribbonInfo(item) {
    const formats = ownedFormats(item);
    if (formats.length > 1) return { label: 'Gemengd', cls: '', formats };
    const f = formats[0] || (item.editions && item.editions[0] && item.editions[0].format) || item.format;
    const cls = f === '4k' ? 'ribbon-4k' : f === 'bluray' || f === 'bluray3d' ? 'ribbon-bluray' : 'ribbon-dvd';
    return { label: formatLabel(f), cls, formats: formats.length ? formats : [f] };
  }

  // Lintjes op de poster: één per formaat dat je bezit, onder elkaar.
  // Bij één formaat past de volledige naam ("Blu-ray"); zodra er gestapeld
  // wordt, is er alleen ruimte voor de korte code ("BD").
  function ribbonsHtml(item) {
    const formats = ownedFormats(item);
    const list = formats.length ? formats : allFormats(item);
    const shown = list.slice(0, 3);
    const useShort = shown.length > 1;

    return shown
      .map(
        (f, i) =>
          `<span class="ribbon" style="background:${formatColor(f)};color:#14141A;top:${
            0.5 + i * 1.35
          }rem" title="${escapeAttr(formatLabel(f))}">${escapeHtml(
            useShort ? formatShort(f) : formatLabel(f)
          )}</span>`
      )
      .join('');
  }

  // ---------- Sfeerlicht (fase 20 + 21) ----------
  //
  // De achtergrond neemt de sfeer van de poster over: een sterk vervaagde,
  // uitvergrote kopie van de poster zelf. Zo zie je altijd de échte filmkleuren.
  // Anders dan pixels uitlezen heeft dit géén CORS-toestemming van TMDb nodig —
  // een afbeelding tónen mag altijd — dus het werkt voor elke poster.
  // Alleen als een titel helemaal geen poster heeft, valt het terug op een
  // zachte kleurgloed uit een vast palet.

  const ACCENTS = ['#C9A227', '#2FA4A9', '#C14B3A', '#2A6FB0', '#639922', '#7F77DD', '#C14B7E', '#B8935C', '#1F9E6E', '#4FB3C9'];
  const AMBIENT_BASE = 'https://image.tmdb.org/t/p/w342'; // klein, want het beeld wordt toch vervaagd

  function paletteAccent(key) {
    let h = 0;
    const s = String(key || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ACCENTS[h % ACCENTS.length];
  }

  // item = het titel-object (of null). strong = sterker voor de plank.
  // fallbackKey bepaalt de palet-kleur als er geen poster is (bv. reeksnaam).
  function setAmbient(item, strong, fallbackKey) {
    if (!els.ambient) return;
    const path = item && (item.custom_poster_path || item.poster_path);
    if (path) {
      // encodeURI zodat een posterpad met een aanhalingsteken of haakje niet uit
      // de CSS-waarde kan breken. TMDb-paden zien er altijd uit als /abc123.jpg,
      // dus dit verandert in de praktijk niets aan de geladen afbeelding (FASE 31).
      els.ambient.style.backgroundImage = `url("${encodeURI(AMBIENT_BASE + path)}")`;
      els.ambient.classList.add('has-poster');
      els.ambient.style.opacity = strong ? '0.6' : '0.42';
    } else {
      const c = paletteAccent(fallbackKey || (item && item.id));
      els.ambient.style.backgroundImage = `radial-gradient(55% 45% at 50% 22%, ${c}, transparent 70%)`;
      els.ambient.classList.remove('has-poster');
      els.ambient.style.opacity = strong ? '0.8' : '0.65';
    }
  }
  function clearAmbient() {
    if (els.ambient) els.ambient.style.opacity = '0';
  }

  // Score, formaten en bekeken-status voor de snelblik-overlay.
  function peekHtml(item) {
    const rating = item.rating ? '★ ' + item.rating.toFixed(1) : '';
    const fmts = (ownedFormats(item).length ? ownedFormats(item) : allFormats(item)).map(formatShort).join(' · ');
    const tag = item.watched
      ? '<span class="peek-tag">✓ bekeken</span>'
      : '<span class="peek-tag unseen">nog kijken</span>';
    return `
      <div class="peek">
        <div class="peek-top">
          <span class="peek-star">${rating}</span>
          <span class="peek-fmt">${escapeHtml(fmts)}</span>
        </div>
        ${tag}
      </div>`;
  }

  function seasonBadgeInfo(item) {
    if (!item.seasons || !item.seasons.length) return null;
    const ownedCount = item.seasons.filter((s) => s.owned).length;
    return {
      text: `${ownedCount}/${item.seasons.length}`,
      complete: ownedCount === item.seasons.length,
    };
  }

  function cardTemplate(item) {
    // Grid toont bewust altijd de TMDb-poster (snel, uniform); je eigen
    // hoesfoto's bekijk je in de detailmodal.
    const cover = posterUrl(item);
    const seasonBadge = seasonBadgeInfo(item);
    const selIds = [item.id];

    return `
      <div data-open-id="${escapeHtml(item.id)}" data-accent-id="${escapeAttr(item.id)}"${selectAttrs(selIds)} class="case-card reveal group text-left cursor-pointer${selectRootClass(selIds)}" role="button" tabindex="0">
        <div class="poster-wrap relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] shadow-lg ring-1 ring-white/5 group-hover:ring-[#C9A227]/40">
          ${selectMarkHtml(selIds)}
          ${cover || coverPosterId(item) ? '<div class="poster-skel"></div>' : ''}
          ${
            coverPosterId(item)
              ? `<img data-cover-poster="${escapeAttr(coverPosterId(item))}" data-cover-fallback="${escapeAttr(cover)}"
                   alt="${escapeAttr(item.title)}" decoding="async"
                   class="w-full h-full object-cover relative z-[2] opacity-0 transition-opacity duration-200">`
              : cover
              ? `<img src="${escapeAttr(cover)}"${posterSizingAttrs(item, GRID_POSTER_SIZES)} alt="${escapeAttr(item.title)}" loading="lazy" decoding="async"
                   class="w-full h-full object-cover relative z-[2]"
                   onload="this.previousElementSibling && this.previousElementSibling.remove()"
                   onerror="this.replaceWith(posterFallback(this.alt))">`
              : posterFallbackHtml(item.title)
          }
          ${ribbonsHtml(item)}
          ${cardValueBadgeHtml(item)}
          ${item.watched ? '<span class="watched-dot" title="Bekeken"></span>' : ''}
          ${
            seasonBadge
              ? `<span class="season-badge ${seasonBadge.complete ? '' : 'season-badge-partial'}" title="${seasonBadge.text} seizoenen in bezit">${seasonBadge.text}</span>`
              : ''
          }
          ${item.wishlist ? '<span class="wish-banner">Verlanglijst</span>' : ''}
          ${IS_TOUCH ? '' : peekHtml(item)}
          <button type="button" class="delete-btn z-[4]" data-delete-id="${escapeAttr(item.id)}" data-delete-title="${escapeAttr(item.title)}" title="Verwijderen uit collectie" aria-label="Verwijderen uit collectie">&times;</button>
        </div>
        <p class="mt-2 font-display tracking-wide text-[15px] leading-tight text-[#F2F0EA] truncate">${escapeHtml(item.title)}</p>
        <p class="text-xs text-[#8B8A92] font-mono">${item.release_year || ''}</p>
      </div>
    `;
  }

  function groupCardTemplate(unit) {
    const sorted = [...unit.items].sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
    const first = sorted[0];
    const cover = posterUrl(first);
    const years = sorted.map((i) => i.release_year).filter(Boolean);
    const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';
    const selIds = unit.items.map((m) => m.id);

    return `
      <div data-open-group="${escapeAttr(unit.saga)}" data-accent-id="${escapeAttr(unit.saga)}"${selectAttrs(selIds)} class="case-card reveal group text-left cursor-pointer${selectRootClass(selIds)}" role="button" tabindex="0">
        <div class="poster-wrap relative rounded-md overflow-hidden aspect-[2/3] bg-[#1E1E26] shadow-lg ring-1 ring-white/5 group-hover:ring-[#C9A227]/40 saga-stack">
          ${selectMarkHtml(selIds)}
          ${
            cover
              ? `<img src="${escapeAttr(cover)}"${posterSizingAttrs(first, GRID_POSTER_SIZES)} alt="${escapeAttr(unit.saga)}" loading="lazy" decoding="async" class="w-full h-full object-cover">`
              : posterFallbackHtml(unit.saga)
          }
          ${groupValueBadgeHtml(unit)}
          <span class="saga-count">${unit.items.length} delen</span>
        </div>
        <p class="mt-2 font-display tracking-wide text-[15px] leading-tight text-[#F2F0EA] truncate">${escapeHtml(unit.saga)}</p>
        <p class="text-xs text-[#8B8A92] font-mono">${yearRange}</p>
      </div>
    `;
  }

  // ---------- Rijen (compacte en tekstweergave) ----------

  // Toont alle formaten die je van deze titel bezit, bv. "4K·BD".
  function formatTagHtml(item) {
    const formats = ownedFormats(item);
    const list = formats.length ? formats : allFormats(item);
    const text = list.map(formatShort).join('·') || '—';
    const color = list.length ? formatColor(list[0]) : '#8B8A92';
    return `<span class="font-mono text-[11px] w-16 text-right shrink-0" style="color:${color}">${escapeHtml(
      text
    )}</span>`;
  }

  // withThumb=true → compacte weergave met miniatuur; false → pure tekst.
  function rowTemplate(item, withThumb) {
    const seasonBadge = seasonBadgeInfo(item);
    const thumb = withThumb
      ? `<div class="w-8 h-12 shrink-0 rounded-sm overflow-hidden bg-[#1E1E26]">
           ${
             item.poster_path || item.custom_poster_path
               ? `<img src="${escapeAttr(
                   THUMB_BASE + (item.custom_poster_path || item.poster_path)
                 )}" alt="" loading="lazy" class="w-full h-full object-cover">`
               : ''
           }
         </div>`
      : '';

    const selIds = [item.id];

    return `
      <div data-open-id="${escapeHtml(item.id)}"${selectAttrs(selIds)}
        class="case-card row-select flex items-center gap-3 py-2 px-1 cursor-pointer hover:bg-white/5 rounded${selectRootClass(selIds)}"
        role="button" tabindex="0">
        ${selectMarkHtml(selIds)}
        ${thumb}
        <span class="w-2 shrink-0">${
          item.watched ? '<span class="block w-1.5 h-1.5 rounded-full bg-teal" title="Bekeken"></span>' : ''
        }</span>
        <span class="flex-1 min-w-0 truncate text-sm text-ink">${escapeHtml(item.title)}</span>
        ${
          seasonBadge
            ? `<span class="font-mono text-[11px] ${
                seasonBadge.complete ? 'text-muted' : 'text-gold'
              } shrink-0">${seasonBadge.text}</span>`
            : ''
        }
        ${item.wishlist ? '<span class="font-mono text-[10px] text-gold shrink-0">wens</span>' : ''}
        ${rowValueHtml(item)}
        <span class="font-mono text-[11px] text-muted w-10 text-right shrink-0">${item.release_year || ''}</span>
        ${formatTagHtml(item)}
      </div>`;
  }

  function groupRowTemplate(unit, withThumb) {
    const sorted = [...unit.items].sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
    const first = sorted[0];
    const years = sorted.map((i) => i.release_year).filter(Boolean);
    const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';
    const thumb = withThumb
      ? `<div class="w-8 h-12 shrink-0 rounded-sm overflow-hidden bg-[#1E1E26]">
           ${
             first.poster_path
               ? `<img src="${escapeAttr(THUMB_BASE + first.poster_path)}" alt="" loading="lazy" class="w-full h-full object-cover">`
               : ''
           }
         </div>`
      : '';

    const selIds = unit.items.map((m) => m.id);

    return `
      <div data-open-group="${escapeAttr(unit.saga)}"${selectAttrs(selIds)}
        class="case-card row-select flex items-center gap-3 py-2 px-1 cursor-pointer hover:bg-white/5 rounded${selectRootClass(selIds)}"
        role="button" tabindex="0">
        ${selectMarkHtml(selIds)}
        ${thumb}
        <span class="w-2 shrink-0"></span>
        <span class="flex-1 min-w-0 truncate text-sm text-ink">${escapeHtml(unit.saga)}</span>
        <span class="font-mono text-[11px] text-gold shrink-0">${unit.items.length} delen</span>
        ${rowGroupValueHtml(unit)}
        <span class="font-mono text-[11px] text-muted w-20 text-right shrink-0">${escapeHtml(yearRange)}</span>
      </div>`;
  }

  function posterFallbackHtml(title) {
    return `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1E1E26] to-[#14141A] p-4">
      <span class="text-center text-[#8B8A92] text-sm font-mono">${escapeHtml(title)}</span>
    </div>`;
  }

  window.posterFallback = function (title) {
    const div = document.createElement('div');
    div.className = 'w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1E1E26] to-[#14141A] p-4';
    div.innerHTML = '<span class="text-center text-[#8B8A92] text-sm font-mono">' + escapeHtml(title) + '</span>';
    return div;
  };

  // ---------- Reeksmodaal ----------

  function openGroupModal(saga) {
    if (!els.groupModal) return;
    const items = state.filtered.filter((i) => sagaOf(i) === saga)
      .sort((a, b) => (a.release_year || 0) - (b.release_year || 0));
    els.groupModal.querySelector('[data-group-title]').textContent = saga;
    const grid = els.groupModal.querySelector('[data-group-grid]');
    grid.innerHTML = items.map((item) => {
      const cover = posterUrl(item);
      const ribbon = ribbonInfo(item);
      return `
        <div data-group-open="${escapeAttr(item.id)}" class="cursor-pointer group" role="button" tabindex="0">
          <div class="relative rounded-md overflow-hidden aspect-[2/3] bg-[#14141A] ring-1 ring-white/5 group-hover:ring-[#C9A227]/40 transition">
            ${cover ? `<img src="${escapeAttr(cover)}"${posterSizingAttrs(item, '(min-width: 768px) 15vw, 30vw')} alt="${escapeAttr(item.title)}" loading="lazy" decoding="async" class="w-full h-full object-cover">` : posterFallbackHtml(item.title)}
            <span class="ribbon ${ribbon.cls}">${ribbon.label}</span>
            ${cardValueBadgeHtml(item)}
            ${item.wishlist ? '<span class="wish-banner">Verlanglijst</span>' : ''}
          </div>
          <p class="mt-1 text-xs truncate">${escapeHtml(item.title)}</p>
          <p class="text-[10px] text-[#8B8A92] font-mono">${item.release_year || ''}</p>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-group-open]').forEach((el) => {
      el.addEventListener('click', () => {
        closeGroupModal();
        openModal(el.dataset.groupOpen);
      });
    });

    // Hele reeks in één keer weg — bijvoorbeeld een boxset die je verkocht
    // hebt. Loopt via dezelfde weg als de selectiemodus, dus met backup,
    // overtypen bij grote aantallen en opslaan per blok.
    const delBtn = els.groupModal.querySelector('[data-group-delete]');
    const statusEl = els.groupModal.querySelector('[data-group-status]');
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'text-xs font-mono mt-2 hidden';
    }
    if (delBtn) {
      delBtn.textContent = `Alle ${items.length} ${items.length === 1 ? 'deel' : 'delen'} van deze reeks verwijderen`;
      delBtn.disabled = false;
      delBtn.onclick = () => {
        closeGroupModal();
        // De reeks wordt de selectie; daarna precies dezelfde bevestiging en
        // beveiligingen als bij handmatig aanvinken.
        setSelectMode(true);
        state.selected = new Set(items.map((m) => m.id));
        updateSelectBar();
        render();
        handleBulkDelete();
      };
    }

    els.groupModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeGroupModal() {
    if (!els.groupModal) return;
    els.groupModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  // Knoppen van de reeks-verlanglijstbalk: eenmalig koppelen (de balk zelf
  // wordt bij elke openModal opnieuw gevuld, maar de knoppen blijven bestaan).
  const sagaWishBtn = els.modal.querySelector('[data-saga-bulk-wish]');
  if (sagaWishBtn) sagaWishBtn.addEventListener('click', () => sagaBulkToevoegen(true));
  const sagaOwnBtn = els.modal.querySelector('[data-saga-bulk-own]');
  if (sagaOwnBtn) sagaOwnBtn.addEventListener('click', () => sagaBulkToevoegen(false));
  const sagaClearBtn = els.modal.querySelector('[data-saga-bulk-clear]');
  if (sagaClearBtn) {
    sagaClearBtn.addEventListener('click', () => {
      sagaBulkSelection = [];
      els.modal.querySelectorAll('[data-saga-pick]').forEach((cb) => (cb.checked = false));
      updateSagaBulkBar();
    });
  }

  if (els.groupModal) {
    els.groupModal.addEventListener('click', (e) => {
      if (e.target === els.groupModal) closeGroupModal();
    });
    const closeBtn = els.groupModal.querySelector('[data-group-close]');
    if (closeBtn) closeBtn.addEventListener('click', closeGroupModal);
  }

  // ---------- Lightbox (zoom) ----------

  function openLightbox(src, alt) {
    if (!els.lightbox || !src) return;
    const img = els.lightbox.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    img.classList.remove('zoomed');
    els.lightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    if (!els.lightbox) return;
    els.lightbox.classList.add('hidden');
  }

  if (els.lightbox) {
    const img = els.lightbox.querySelector('img');
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      img.classList.toggle('zoomed');
    });
    // Zichtbare sluitknop (FASE 30): op een gsm vult de foto het hele scherm,
    // dus "klik naast de foto" bestond daar in de praktijk niet.
    const sluitKnop = document.getElementById('lightbox-close');
    if (sluitKnop) {
      sluitKnop.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
      });
    }
    els.lightbox.addEventListener('click', closeLightbox);
  }

  // ---------- Detailmodal ----------

  // Huidige cover-weergave in de modal: 'poster' of 'hoes'
  let modalCoverMode = 'poster';
  let modalCoverSrcs = { poster: '', front: '', back: '' };

  function updateModalCoverTabs(item) {
    const tabs = els.modal.querySelector('[data-cover-tabs]');
    if (!tabs) return;
    const ed = activeEdition(item);
    const hasCustom = !!(frontCoverRef(item, ed) || backCoverRef(item, ed));
    tabs.classList.toggle('hidden', !hasCustom);
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('chip-active', b.dataset.coverTab === modalCoverMode);
    });
  }

  async function showModalCovers(item) {
    const flipCard = els.modal.querySelector('.flip-card');
    const flipBtn = els.modal.querySelector('[data-flip-btn]');
    const frontImg = els.modal.querySelector('[data-cover="front"]');
    const backImg = els.modal.querySelector('[data-cover="back"]');

    flipCard.classList.remove('flipped');
    modalCoverSrcs = { poster: posterUrl(item), front: '', back: '' };

    if (modalCoverMode === 'poster') {
      frontImg.src = modalCoverSrcs.poster;
      frontImg.alt = item.title + ' — TMDb-poster';
      flipBtn.classList.add('hidden');
    } else {
      // Hoesfoto's van het gekozen exemplaar: voorkant (of de poster als er
      // geen voorkant-foto is) + eventueel de achterkant.
      const ed = activeEdition(item);
      const frontRef = frontCoverRef(item, ed);
      const backRef = backCoverRef(item, ed);
      frontImg.src = modalCoverSrcs.poster; // tijdelijke placeholder terwijl blob laadt
      frontImg.alt = item.title + ' — voorkant hoes';
      if (frontRef) {
        resolveCoverSrc(frontRef).then((src) => {
          if (src) { frontImg.src = src; modalCoverSrcs.front = src; }
        });
      }
      if (backRef) {
        flipBtn.classList.remove('hidden');
        backImg.alt = item.title + ' — achterkant hoes';
        resolveCoverSrc(backRef).then((src) => {
          if (src) { backImg.src = src; modalCoverSrcs.back = src; }
        });
      } else {
        flipBtn.classList.add('hidden');
      }
    }
    updateModalCoverTabs(item);
  }

  // ---------- Fase 5: verrijkte velden in de detailmodal ----------

  // Toont of verbergt een element op basis van of er inhoud is.
  function setOptionalField(selector, value, formatter) {
    const el = els.modal.querySelector(selector);
    if (!el) return;
    const has = value !== null && value !== undefined && value !== '';
    el.classList.toggle('hidden', !has);
    if (has) el.textContent = formatter ? formatter(value) : value;
  }

  const TV_STATUS_LABELS = {
    'Ended': 'Afgelopen reeks',
    'Canceled': 'Stopgezet',
    'Returning Series': 'Loopt nog',
    'In Production': 'In productie',
    'Planned': 'Gepland',
  };

  function fillEnrichedFields(item) {
    // Achtergrondafbeelding bovenaan
    const wrap = els.modal.querySelector('[data-backdrop-wrap]');
    const img = els.modal.querySelector('[data-backdrop]');
    const bd = backdropUrl(item);
    const body = els.modal.querySelector('[data-detail-body]');
    if (wrap && img) {
      wrap.classList.toggle('hidden', !bd);
      if (bd) {
        img.src = bd;
        img.alt = item.title + ' — achtergrondafbeelding';
      } else {
        img.removeAttribute('src');
      }
    }
    // De poster mag enkel over de achtergrond schuiven als die er ook is.
    if (body) body.classList.toggle('with-backdrop', !!bd);

    // Originele titel enkel tonen als ze afwijkt van de Nederlandse.
    const original = item.original_title && item.original_title !== item.title ? item.original_title : '';
    setOptionalField('[data-field="original-title"]', original);
    setOptionalField('[data-field="tagline"]', item.tagline);
    setOptionalField('[data-field="cert"]', item.certification, (c) =>
      item.certification_country ? `${item.certification_country} ${c}` : c
    );
    setOptionalField('[data-field="tv-status"]', item.tv_status, (s) => TV_STATUS_LABELS[s] || s);

    const votes = els.modal.querySelector('[data-field="votes"]');
    if (votes) votes.textContent = item.vote_count ? ` (${Number(item.vote_count).toLocaleString('nl-BE')} stemmen)` : '';

    // Scenario en muziek verbergen we volledig als ze onbekend zijn — anders
    // staat de modal vol met streepjes.
    const writersWrap = els.modal.querySelector('[data-field="writers-wrap"]');
    if (writersWrap) {
      writersWrap.classList.toggle('hidden', !item.writers);
      const w = writersWrap.querySelector('[data-field="writers"]');
      if (w) w.textContent = item.writers || '';
    }
    const composerWrap = els.modal.querySelector('[data-field="composer-wrap"]');
    if (composerWrap) {
      composerWrap.classList.toggle('hidden', !item.composer);
      const c = composerWrap.querySelector('[data-field="composer"]');
      if (c) c.textContent = item.composer || '';
    }

    // Trailer en IMDb
    const trailer = els.modal.querySelector('[data-field="trailer-link"]');
    if (trailer) {
      trailer.classList.toggle('hidden', !item.trailer_key);
      if (item.trailer_key) trailer.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(item.trailer_key);
    }
    const imdb = els.modal.querySelector('[data-field="imdb-link"]');
    if (imdb) {
      imdb.classList.toggle('hidden', !item.imdb_id);
      if (item.imdb_id) imdb.href = 'https://www.imdb.com/title/' + encodeURIComponent(item.imdb_id) + '/';
    }

    // Cast: met portretfoto's als die er zijn, anders gewoon de namen.
    // Heeft een acteur een TMDb-id, dan is de kaart klikbaar naar zijn profiel.
    const castList = els.modal.querySelector('[data-field="cast-list"]');
    if (castList) {
      const details = item.cast_details || [];
      if (details.length) {
        castList.innerHTML = details
          .map((c) => {
            const clickable = !!c.id;
            return `
              <div class="w-20 shrink-0 text-center ${clickable ? 'cursor-pointer group/person' : ''}"
                ${clickable ? `data-person-id="${escapeAttr(c.id)}" role="button" tabindex="0"` : ''}
                ${clickable ? `title="Bekijk alles van ${escapeAttr(c.name)}"` : ''}>
                <div class="w-20 h-20 rounded-full overflow-hidden bg-bg ring-1 ring-white/10 mb-1 ${
                  clickable ? 'group-hover/person:ring-gold' : ''
                }">
                  ${
                    c.profile_path
                      ? `<img src="${escapeAttr(PROFILE_BASE + c.profile_path)}" alt="${escapeAttr(c.name)}" loading="lazy" class="w-full h-full object-cover">`
                      : `<div class="w-full h-full flex items-center justify-center text-[#8B8A92] font-mono text-lg">${escapeHtml((c.name || '?').charAt(0))}</div>`
                  }
                </div>
                <p class="text-[11px] leading-tight text-ink truncate" title="${escapeAttr(c.name)}">${escapeHtml(c.name)}</p>
                ${c.character ? `<p class="text-[10px] leading-tight text-muted truncate" title="${escapeAttr(c.character)}">${escapeHtml(c.character)}</p>` : ''}
                ${c.episode_count ? `<p class="text-[10px] leading-tight text-muted font-mono">${c.episode_count} afl.</p>` : ''}
              </div>`;
          })
          .join('');

        castList.querySelectorAll('[data-person-id]').forEach((el) => {
          el.addEventListener('click', () => openPersonModal(el.dataset.personId));
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPersonModal(el.dataset.personId);
            }
          });
        });
      } else {
        castList.innerHTML = `<p class="text-sm text-muted">${escapeHtml((item.cast || []).join(', ') || '—')}</p>`;
      }
    }

    // Crew: klikbaar zodra de titel ververst is. Zolang dat niet gebeurd is,
    // tonen we de oude tekstvelden.
    const crewBlock = els.modal.querySelector('[data-field="crew-block"]');
    const crewFallback = els.modal.querySelector('[data-field="crew-fallback"]');
    const crewList = els.modal.querySelector('[data-field="crew-list"]');
    const crewDetails = item.crew_details || [];
    if (crewBlock && crewList && crewFallback) {
      crewBlock.classList.toggle('hidden', crewDetails.length === 0);
      crewFallback.classList.toggle('hidden', crewDetails.length > 0);
      if (crewDetails.length) {
        crewList.innerHTML = crewDetails
          .map((c) => {
            const clickable = !!c.id;
            return `
              <span class="text-sm">
                <span class="text-muted font-mono uppercase text-[10px]">${escapeHtml(c.jobs.join(' · '))}</span><br>
                ${
                  clickable
                    ? `<button type="button" data-person-id="${escapeAttr(c.id)}" class="text-ink hover:text-gold underline decoration-white/20 underline-offset-2">${escapeHtml(c.name)}</button>`
                    : escapeHtml(c.name)
                }
              </span>`;
          })
          .join('');
        crewList.querySelectorAll('[data-person-id]').forEach((el) => {
          el.addEventListener('click', () => openPersonModal(el.dataset.personId));
        });
      }
    }

    showSagaCompleteness(item);
    showUniverses(item);
  }

  // ---------- Universums in de detailweergave ----------

  // Universums en hun ledenlijsten worden één keer per bezoek geladen. Zolang
  // dat loopt blijft het blok verborgen; het is bijzaak en mag de rest van de
  // detailweergave niet ophouden.
  let universeData = null;
  let universeLoading = null;

  function loadUniverseData() {
    if (universeData) return Promise.resolve(universeData);
    if (universeLoading) return universeLoading;

    universeLoading = (async () => {
      const c = typeof getConfig === 'function' ? getConfig() : {};
      if (!c.tmdbKey || typeof driveLoadUniverses !== 'function') return { universes: [], members: {} };

      const { universes } = await driveLoadUniverses();
      const members = {};
      for (const u of universes) {
        try {
          members[u.id] = await loadUniverseMembers(u, c.tmdbKey);
        } catch (err) {
          console.warn('Universum niet geladen:', u.name, err);
        }
      }
      universeData = { universes, members };
      buildUniverseIndex();
      return universeData;
    })();

    return universeLoading;
  }

  // Index per titel-id → set van universum-id's waar die titel bij hoort.
  // Wordt gebruikt door het universumfilter op de collectiepagina en één keer
  // opgebouwd nadat de ledenlijsten geladen zijn.
  const universeByMovieId = {};

  function buildUniverseIndex() {
    if (!universeData) return;
    Object.keys(universeByMovieId).forEach((k) => delete universeByMovieId[k]);

    universeData.universes.forEach((u) => {
      const members = universeData.members[u.id];
      if (!members) return;
      const matcher = buildOwnedMatcher(state.all);
      members.items.forEach((part) => {
        const mine = matcher(part);
        if (!mine) return;
        (universeByMovieId[mine.id] = universeByMovieId[mine.id] || new Set()).add(u.id);
      });
    });

    // Nu de index klaar is: de filterchips opbouwen en het filter toepassen.
    buildUniverseChips();
    if (state.activeUniverses.size) applyFilters();
  }

  async function showUniverses(item) {
    const section = els.modal.querySelector('[data-field="universe-section"]');
    const list = els.modal.querySelector('[data-field="universe-list"]');
    if (!section || !list) return;
    section.classList.add('hidden');

    const requestedFor = item.id;
    let data;
    try {
      data = await loadUniverseData();
    } catch {
      return;
    }
    if (requestedFor !== currentModalId || !data.universes.length) return;

    const matchOne = buildOwnedMatcher([item]);
    const hits = data.universes.filter((u) => {
      const m = data.members[u.id];
      return m && m.items.some((part) => matchOne(part) === item);
    });

    if (!hits.length) return;

    list.innerHTML = hits
      .map((u) => {
        const status = universeStatus(data.members[u.id].items, state.all);
        const pct = status.total ? Math.round((status.owned / status.total) * 100) : 0;
        return `
          <div class="flex items-center justify-between gap-3">
            <a href="universums.html" class="text-sm text-ink hover:text-gold underline decoration-white/20 underline-offset-2 truncate min-w-0">${escapeHtml(
              u.name
            )}</a>
            <span class="font-mono text-xs text-gold shrink-0">${status.owned}/${status.total} · ${pct}%</span>
          </div>`;
      })
      .join('');

    section.classList.remove('hidden');
  }

  // ---------- Filterpaneel open en dicht (fase 14) ----------

  // Hoeveel filters staan er aan? Bepaalt het label op de knop en of de
  // wisknop zichtbaar is.
  function activeFilterCount() {
    return (
      state.activeFormats.size +
      state.activeTypes.size +
      state.activeGenres.size +
      state.activeStatus.size +
      state.activeSaga.size +
      state.activeWatched.size +
      state.activeLoaned.size +
      state.activeDecades.size +
      state.activeCerts.size +
      state.activeVariants.size +
      state.activeBoxsets.size +
      state.activeLocations.size +
      state.activeUniverses.size +
      (state.activeLetter ? 1 : 0) +
      (state.search.trim() ? 1 : 0)
    );
  }

  /**
   * Per filterrij een klein kruisje om alleen díe rij te wissen (fase 28).
   *
   * "Alle filters wissen" bestond al, maar wie op tien genres heeft geklikt en
   * alleen het formaatfilter kwijt wil, moest die chips één voor één uitzetten.
   * De knop wordt één keer aangemaakt en daarna alleen getoond of verborgen —
   * hij hangt aan de rij, niet aan de chips, dus hij overleeft het opnieuw
   * opbouwen van de chips.
   */
  function filterRowDefs() {
    return [
      { key: 'formats', set: state.activeFormats, chips: els.formatChips },
      { key: 'types', set: state.activeTypes, chips: els.typeChips },
      { key: 'status', set: state.activeStatus, chips: els.statusChips },
      { key: 'saga', set: state.activeSaga, chips: els.sagaChips },
      { key: 'watched', set: state.activeWatched, chips: els.watchedChips },
      { key: 'loaned', set: state.activeLoaned, chips: els.loanedChips },
      { key: 'genres', set: state.activeGenres, chips: els.genreChips },
      { key: 'decades', set: state.activeDecades, chips: els.decadeChips },
      { key: 'certs', set: state.activeCerts, chips: els.certChips },
      { key: 'variants', set: state.activeVariants, chips: els.variantChips },
      { key: 'boxsets', set: state.activeBoxsets, chips: els.boxsetChips },
      { key: 'locations', set: state.activeLocations, chips: els.locationChips },
      { key: 'universes', set: state.activeUniverses, chips: els.universeChips },
    ].filter((r) => r.chips && r.chips.parentElement);
  }

  function clearFilterRow(key) {
    const r = filterRowDefs().find((x) => x.key === key);
    if (!r) return;
    r.set.clear();
    r.chips.querySelectorAll('.chip-active').forEach((c) => c.classList.remove('chip-active'));
    applyFilters();
  }

  function updateRowClearButtons() {
    filterRowDefs().forEach((r) => {
      // Let op: formaat, type, status en bekeken delen één container. Daarom
      // zoeken we op de sleutel én hangen we de knop direct achter de eigen
      // chips-groep, niet onderaan de rij — anders krijgen die vier samen één
      // kruisje dat alleen de eerste rij wist.
      let btn = r.chips.parentElement.querySelector(`[data-row-clear="${r.key}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.rowClear = r.key;
        btn.className = 'row-clear';
        btn.textContent = '×';
        btn.title = 'Deze filterrij wissen';
        btn.setAttribute('aria-label', 'Deze filterrij wissen');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearFilterRow(r.key);
        });
        r.chips.insertAdjacentElement('afterend', btn);
      }
      btn.classList.toggle('hidden', r.set.size === 0);
    });
  }

  function updateFilterButton() {
    if (!els.filterToggle) return;
    const n = activeFilterCount();
    const open = els.filterPanel && els.filterPanel.classList.contains('filter-open');
    els.filterToggle.textContent = `Filters${n ? ` (${n})` : ''} ${open ? '▴' : '▾'}`;
    els.filterToggle.classList.toggle('chip-active', n > 0);
    els.filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (els.clearFilters) els.clearFilters.classList.toggle('hidden', n === 0);
    updateRowClearButtons();
  }

  function setFilterPanel(open) {
    if (!els.filterPanel) return;
    els.filterPanel.classList.toggle('filter-open', open);
    updateFilterButton();
    volgScrollVoorFilterPaneel(open);
  }

  // Scrollen sluit het filterpaneel (FASE 32).
  //
  // Het paneel zit ín de balk die blijft plakken, en mag tot 60% van de hoogte
  // innemen. Liet je het openstaan en ging je scrollen, dan bleef het dus
  // meereizen en keek je door een kier naar de collectie die je net aan het
  // filteren was. Zodra je scrolt, klapt het dicht — je gekozen filters blijven
  // gewoon aanstaan, alleen het menu gaat weg.
  //
  // De luisteraar hangt er alléén terwijl het paneel openstaat: een blijvende
  // scroll-luisteraar is precies wat we in FASE 29 aan het weghalen waren.
  let filterScrollStart = 0;
  let filterScrollHandler = null;

  function volgScrollVoorFilterPaneel(open) {
    if (filterScrollHandler) {
      window.removeEventListener('scroll', filterScrollHandler);
      filterScrollHandler = null;
    }
    if (!open) return;
    filterScrollStart = window.scrollY;
    filterScrollHandler = () => {
      // Een kleine drempel: het openklappen zelf verschuift de pagina soms een
      // paar pixels, en dat mag het paneel niet meteen weer dichtdoen.
      if (Math.abs(window.scrollY - filterScrollStart) < 8) return;
      setFilterPanel(false);
    };
    window.addEventListener('scroll', filterScrollHandler, { passive: true });
  }

  // opts.stil = true: alleen de status en de chip-opmaak wissen, zonder meteen
  // opnieuw te filteren. Gebruikt door applyQuickFilter, dat er daarna zelf een
  // filter voor in de plaats zet.
  function clearAllFilters(opts) {
    state.activeFormats.clear();
    state.activeTypes.clear();
    state.activeGenres.clear();
    state.activeStatus.clear();
    state.activeSaga.clear();
    state.activeWatched.clear();
    state.activeLoaned.clear();
    state.activeDecades.clear();
    state.activeCerts.clear();
    state.activeVariants.clear();
    state.activeBoxsets.clear();
    state.activeLocations.clear();
    state.activeUniverses.clear();
    state.activeLetter = null;
    state.search = '';
    if (els.search) els.search.value = '';
    buildFacetChips(state.all);
    if (els.letterChips) {
      els.letterChips.querySelectorAll('.letter-chip').forEach((c) => c.classList.remove('letter-chip-active'));
    }
    els.typeChips.querySelectorAll('[data-type]').forEach((c) => c.classList.remove('chip-active'));
    if (els.statusChips) els.statusChips.querySelectorAll('[data-status]').forEach((c) => c.classList.remove('chip-active'));
    if (els.sagaChips) els.sagaChips.querySelectorAll('[data-saga-filter]').forEach((c) => c.classList.remove('chip-active'));
    if (els.watchedChips) els.watchedChips.querySelectorAll('[data-watched]').forEach((c) => c.classList.remove('chip-active'));
    if (els.loanedChips) els.loanedChips.querySelectorAll('[data-loaned]').forEach((c) => c.classList.remove('chip-active'));
    if (!(opts && opts.stil)) applyFilters();
  }

  if (els.filterToggle && els.filterPanel) {
    els.filterToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setFilterPanel(!els.filterPanel.classList.contains('filter-open'));
    });

    // Buitenom klikken sluit het paneel — zowel met de muis als met een vinger.
    document.addEventListener('click', (e) => {
      if (!els.filterPanel.classList.contains('filter-open')) return;
      if (els.filterPanel.contains(e.target) || els.filterToggle.contains(e.target)) return;
      setFilterPanel(false);
    });

    if (els.clearFilters) {
      els.clearFilters.addEventListener('click', (e) => {
        e.stopPropagation();
        clearAllFilters();
      });
    }

    updateFilterButton();
  }

  // ---------- Klikbaar filteren (fase 13) ----------

  // Klik je in de detailweergave op een genre, regisseur of jaar, dan sluit de
  // pop-up en staat je collectie meteen op dat filter. Bestaande filters worden
  // gewist, anders krijg je onbedoeld een lege lijst.
  function applyQuickFilter(kind, value) {
    // Écht álle filters wissen, ook formaat, type, status en bekeken. Bleven
    // die staan, dan kon een klik op een genre een lege lijst opleveren terwijl
    // het filterpaneel dicht was — je zag dan niet wat er in de weg zat.
    clearAllFilters({ stil: true });

    if (kind === 'genre') state.activeGenres.add(value);
    if (kind === 'decade') state.activeDecades.add(Number(value));
    if (kind === 'search') {
      state.search = value;
      els.search.value = value;
    }

    closeModal();
    buildFacetChips(state.all);
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Kijkgeschiedenis en eigen score (fase 13) ----------

  // item.watch_log = [{ date: '2026-07-21' }, ...] — oudste eerst.
  function addWatchEntry(item, date) {
    const d = date || new Date().toISOString().slice(0, 10);
    item.watch_log = item.watch_log || [];
    // Twee keer dezelfde dag telt als één kijkbeurt.
    if (item.watch_log.some((e) => e.date === d)) return false;
    item.watch_log.push({ date: d });
    item.watch_log.sort((a, b) => a.date.localeCompare(b.date));
    return true;
  }

  function renderWatchLog(item) {
    const section = els.modal.querySelector('[data-field="watchlog-section"]');
    const summary = els.modal.querySelector('[data-field="watchlog-summary"]');
    const list = els.modal.querySelector('[data-field="watchlog-list"]');
    const addBtn = els.modal.querySelector('[data-watchlog-add]');
    if (!section || !summary || !list) return;

    const log = item.watch_log || [];
    section.classList.toggle('hidden', !item.watched && log.length === 0);
    if (!item.watched && !log.length) return;

    const fmt = (d) => {
      const dt = new Date(d);
      return isNaN(dt) ? d : dt.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    if (!log.length) {
      summary.textContent = 'Gezien, maar zonder datum — die is er pas sinds deze versie.';
      list.innerHTML = '';
    } else if (log.length === 1) {
      summary.textContent = `Gezien op ${fmt(log[0].date)}`;
      list.innerHTML = '';
    } else {
      summary.textContent = `${log.length}× gezien, laatst op ${fmt(log[log.length - 1].date)}`;
      list.innerHTML = log
        .slice()
        .reverse()
        .map(
          (e) => `
            <div class="flex items-center justify-between gap-2 text-[11px] text-muted">
              <span>${escapeHtml(fmt(e.date))}</span>
              <button type="button" class="hover:text-red-400 underline" data-log-remove="${escapeAttr(e.date)}">verwijderen</button>
            </div>`
        )
        .join('');
    }

    list.querySelectorAll('[data-log-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const before = JSON.parse(JSON.stringify(item.watch_log || []));
        item.watch_log = (item.watch_log || []).filter((e) => e.date !== btn.dataset.logRemove);
        openModal(item.id);
        backgroundSave(
          () => upsertMovieInDrive(item),
          () => { item.watch_log = before; if (!els.modal.classList.contains('hidden')) openModal(item.id); }
        );
      });
    });

    if (addBtn) {
      addBtn.onclick = () => {
        const before = JSON.parse(JSON.stringify(item.watch_log || []));
        // Ook de bekeken-vlag onthouden: die wordt hieronder gezet, dus hoort
        // hij bij een mislukte opslag ook teruggedraaid te worden. Anders bleef
        // de titel als bekeken in het raster staan terwijl er "je wijziging is
        // teruggedraaid" gemeld was.
        const watchedBefore = item.watched;
        if (!addWatchEntry(item)) return; // vandaag stond er al in
        item.watched = true;
        applyFilters();
        openModal(item.id);
        backgroundSave(
          () => upsertMovieInDrive(item),
          () => {
            item.watch_log = before;
            item.watched = watchedBefore;
            applyFilters();
            if (!els.modal.classList.contains('hidden')) openModal(item.id);
          }
        );
      };
    }
  }

  function renderMyRating(item) {
    const sel = els.modal.querySelector('[data-my-rating]');
    if (!sel) return;
    if (sel.options.length <= 1) {
      for (let n = 10; n >= 1; n--) {
        const o = document.createElement('option');
        o.value = String(n);
        o.textContent = String(n);
        sel.appendChild(o);
      }
    }
    sel.value = item.my_rating != null ? String(item.my_rating) : '';
    sel.onchange = () => {
      const before = item.my_rating;
      const v = sel.value === '' ? null : Number(sel.value);
      item.my_rating = v;
      applyFilters();
      backgroundSave(
        () => upsertMovieInDrive(item),
        () => { item.my_rating = before; if (!els.modal.classList.contains('hidden')) openModal(item.id); }
      );
    };
  }

  // ---------- Afleveringen en kijkvoortgang (fase 13) ----------

  // Opgehaalde seizoenen worden per bezoek onthouden.
  const seasonCache = {};

  // Welke afleveringen je gezien hebt, per seizoen:
  //   item.watched_episodes = { "3": [1,2,3,5] }
  function watchedEpisodes(item, seasonNumber) {
    const map = item.watched_episodes || {};
    return new Set(map[String(seasonNumber)] || []);
  }

  function setWatchedEpisodes(item, seasonNumber, set) {
    if (!item.watched_episodes) item.watched_episodes = {};
    const list = [...set].sort((a, b) => a - b);
    if (list.length) item.watched_episodes[String(seasonNumber)] = list;
    else delete item.watched_episodes[String(seasonNumber)];
  }

  function seasonProgress(item, season) {
    const total = Number(season.episode_count) || 0;
    const seen = watchedEpisodes(item, season.season_number).size;
    return { seen, total, pct: total ? Math.round((seen / total) * 100) : 0 };
  }

  // Waar ben je gebleven: hoogste seizoen met kijkactiviteit, en daarbinnen de
  // hoogste aflevering die je zag.
  function lastWatchedPoint(item) {
    const map = item.watched_episodes || {};
    const seasons = Object.keys(map)
      .map(Number)
      .filter((n) => (map[String(n)] || []).length)
      .sort((a, b) => b - a);
    if (!seasons.length) return null;
    const s = seasons[0];
    const eps = map[String(s)];
    return { season: s, episode: Math.max(...eps) };
  }

  // Alleen afleveringen van seizoenen die je nog BEZIT tellen mee. Verkoop je
  // een uitgekeken seizoen, dan blijft zijn kijkgeschiedenis bewaard (dat wil je
  // ook: koop je het opnieuw, dan staat alles er nog). Zou die mee blijven
  // tellen, dan werd de serie ten onrechte als 'bekeken' gemarkeerd zodra je
  // daarna nog één aflevering aanvinkte.
  function totalWatchedEpisodes(item) {
    const map = item.watched_episodes || {};
    const bezeten = new Set(
      (item.seasons || []).filter((s) => s.owned).map((s) => String(s.season_number))
    );
    // Geen seizoensgegevens (bv. een serie zonder seizoenenlijst): alles tellen,
    // anders zou de voortgang altijd op nul blijven staan.
    if (!bezeten.size) return Object.values(map).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
    return Object.keys(map).reduce((sum, k) => sum + (bezeten.has(k) ? (map[k] || []).length : 0), 0);
  }

  function totalOwnedEpisodes(item) {
    return (item.seasons || [])
      .filter((s) => s.owned)
      .reduce((sum, s) => sum + (Number(s.episode_count) || 0), 0);
  }

  // Slaat de kijkvoortgang op. Voor series bepaalt de voortgang meteen of de
  // titel als 'bekeken' geldt: alles gezien = bekeken.
  function saveEpisodeProgress(item, revertSnapshot) {
    const owned = totalOwnedEpisodes(item);
    const seen = totalWatchedEpisodes(item);
    if (owned) item.watched = seen >= owned;

    applyFilters();
    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        item.watched_episodes = revertSnapshot.episodes;
        item.watched = revertSnapshot.watched;
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  function snapshotProgress(item) {
    return {
      episodes: JSON.parse(JSON.stringify(item.watched_episodes || {})),
      watched: item.watched,
    };
  }

  async function toggleSeasonEpisodes(item, season, container, btn) {
    const open = container.dataset.open === '1';
    if (open) {
      container.classList.add('hidden');
      container.dataset.open = '0';
      if (btn) btn.textContent = 'afleveringen ▾';
      return;
    }

    container.classList.remove('hidden');
    container.dataset.open = '1';
    if (btn) btn.textContent = 'afleveringen ▴';

    if (container.dataset.loaded === '1') return;

    // Aparte meldingen per oorzaak — "geen TMDb-koppeling" is misleidend als
    // in werkelijkheid het bestand assets/admin.js verouderd is.
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (typeof tmdbSeason !== 'function') {
      container.innerHTML =
        '<p class="text-xs text-gold py-2">Je <code>assets/admin.js</code> is verouderd — ' +
        'die kent de functie voor afleveringen nog niet. Upload dat bestand opnieuw en herlaad met Ctrl+Shift+R.</p>';
      return;
    }
    if (!c.tmdbKey) {
      container.innerHTML = '<p class="text-xs text-gold py-2">Vul eerst je TMDb-key in via Beheer → Instellingen.</p>';
      return;
    }
    if (!item.tmdb_id) {
      container.innerHTML = '<p class="text-xs text-muted py-2">Deze titel heeft geen TMDb-koppeling, dus er zijn geen afleveringen op te halen.</p>';
      return;
    }

    container.innerHTML = '<p class="text-xs text-muted py-2">Afleveringen ophalen…</p>';
    const cacheKey = `${item.tmdb_id}:${season.season_number}`;
    let data;
    try {
      data = seasonCache[cacheKey] || (seasonCache[cacheKey] = await tmdbSeason(item.tmdb_id, season.season_number, c.tmdbKey));
    } catch (err) {
      container.innerHTML = `<p class="text-xs text-muted py-2">Kon de afleveringen niet ophalen: ${escapeHtml(err.message)}</p>`;
      return;
    }

    container.dataset.loaded = '1';
    renderEpisodes(item, season, data, container);
  }

  // ---------- Afleveringpagina ----------

  const STILL_BASE = 'https://image.tmdb.org/t/p/w780';
  let episodeContext = null; // { item, season, data, index }

  function openEpisodeModal(item, season, data, index) {
    const m = els.episodeModal;
    if (!m || !data.episodes[index]) return;
    episodeContext = { item, season, data, index };
    const e = data.episodes[index];

    const wrap = m.querySelector('[data-ep-still-wrap]');
    const img = m.querySelector('[data-ep-still]');
    if (e.still_path) {
      img.src = STILL_BASE + e.still_path;
      img.alt = e.name || '';
      wrap.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      wrap.classList.add('hidden');
    }

    m.querySelector('[data-ep-number]').textContent =
      `${escapeHtml(item.title)} · Seizoen ${season.season_number}, aflevering ${e.episode_number}`;
    m.querySelector('[data-ep-title]').textContent = e.name || `Aflevering ${e.episode_number}`;

    const meta = [];
    if (e.air_date) {
      const d = new Date(e.air_date);
      meta.push(isNaN(d) ? e.air_date : d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }));
    }
    if (e.runtime) meta.push(e.runtime + ' min');
    if (e.rating) meta.push(`TMDb ${e.rating.toFixed(1)}${e.vote_count ? ` (${e.vote_count})` : ''}`);
    m.querySelector('[data-ep-meta]').textContent = meta.join(' · ');

    m.querySelector('[data-ep-overview]').textContent =
      e.overview || 'Voor deze aflevering is nog geen beschrijving beschikbaar op TMDb.';

    // Regie en scenario van deze aflevering
    const crewWrap = m.querySelector('[data-ep-crew-wrap]');
    const dWrap = m.querySelector('[data-ep-directors-wrap]');
    const wWrap = m.querySelector('[data-ep-writers-wrap]');
    const hasCrew = (e.directors && e.directors.length) || (e.writers && e.writers.length);
    crewWrap.classList.toggle('hidden', !hasCrew);
    if (hasCrew) {
      dWrap.classList.toggle('hidden', !(e.directors && e.directors.length));
      wWrap.classList.toggle('hidden', !(e.writers && e.writers.length));
      m.querySelector('[data-ep-directors]').textContent = (e.directors || []).join(', ');
      m.querySelector('[data-ep-writers]').textContent = [...new Set(e.writers || [])].join(', ');
    }

    // Gastrollen, klikbaar naar hun profiel
    const guestsWrap = m.querySelector('[data-ep-guests-wrap]');
    const guests = m.querySelector('[data-ep-guests]');
    const list = e.guest_stars || [];
    guestsWrap.classList.toggle('hidden', list.length === 0);
    if (list.length) {
      guests.innerHTML = list
        .map(
          (g) => `
            <div class="w-20 shrink-0 text-center ${g.id ? 'cursor-pointer group/person' : ''}"
              ${g.id ? `data-person-id="${escapeAttr(g.id)}" role="button" tabindex="0"` : ''}>
              <div class="w-20 h-20 rounded-full overflow-hidden bg-bg ring-1 ring-white/10 mb-1 ${
                g.id ? 'group-hover/person:ring-gold' : ''
              }">
                ${
                  g.profile_path
                    ? `<img src="${escapeAttr(PROFILE_BASE + g.profile_path)}" alt="${escapeAttr(g.name)}" loading="lazy" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-[#8B8A92] font-mono text-lg">${escapeHtml((g.name || '?').charAt(0))}</div>`
                }
              </div>
              <p class="text-[11px] leading-tight text-ink truncate" title="${escapeAttr(g.name)}">${escapeHtml(g.name)}</p>
              ${g.character ? `<p class="text-[10px] leading-tight text-muted truncate">${escapeHtml(g.character)}</p>` : ''}
            </div>`
        )
        .join('');
      guests.querySelectorAll('[data-person-id]').forEach((el) => {
        el.addEventListener('click', () => {
          closeEpisodeModal();
          openPersonModal(el.dataset.personId);
        });
      });
    }

    // Gezien-knop
    const seen = watchedEpisodes(item, season.season_number).has(e.episode_number);
    const btn = m.querySelector('[data-ep-watched]');
    btn.textContent = seen ? '✓ Gezien — haal het vinkje weg' : 'Markeer als gezien';
    btn.classList.toggle('chip-active', seen);
    btn.onclick = () => {
      const before = snapshotProgress(item);
      const set = watchedEpisodes(item, season.season_number);
      if (set.has(e.episode_number)) set.delete(e.episode_number);
      else set.add(e.episode_number);
      setWatchedEpisodes(item, season.season_number, set);
      saveEpisodeProgress(item, before);
      openEpisodeModal(item, season, data, index);
    };

    // Bladeren binnen het seizoen
    const prev = m.querySelector('[data-ep-prev]');
    const next = m.querySelector('[data-ep-next]');
    prev.disabled = index === 0;
    next.disabled = index >= data.episodes.length - 1;
    prev.style.opacity = prev.disabled ? '0.4' : '1';
    next.style.opacity = next.disabled ? '0.4' : '1';
    prev.onclick = () => !prev.disabled && openEpisodeModal(item, season, data, index - 1);
    next.onclick = () => !next.disabled && openEpisodeModal(item, season, data, index + 1);

    m.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    m.scrollTop = 0;
  }

  function closeEpisodeModal() {
    if (!els.episodeModal) return;
    els.episodeModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    // Voortgang in de seizoenslijst bijwerken
    if (episodeContext && currentModalId) openModal(currentModalId);
    episodeContext = null;
  }

  if (els.episodeModal) {
    els.episodeModal.addEventListener('click', (e) => {
      if (e.target === els.episodeModal) closeEpisodeModal();
    });
    const close = els.episodeModal.querySelector('[data-ep-close]');
    if (close) close.addEventListener('click', closeEpisodeModal);
  }

  function renderEpisodes(item, season, data, container) {
    const seen = watchedEpisodes(item, season.season_number);
    const epDate = (str) => {
      const d = new Date(str);
      return isNaN(d) ? str : d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    container.innerHTML = `
      <div class="flex flex-wrap gap-2 mb-3">
        <button type="button" class="chip !py-1 !px-2.5 text-[10px]" data-ep-all>Alles aanvinken</button>
        <button type="button" class="chip !py-1 !px-2.5 text-[10px]" data-ep-none>Alles uitvinken</button>
      </div>
      <div class="space-y-3">
        ${data.episodes
          .map((e, i) => {
            const isSeen = seen.has(e.episode_number);
            const still = e.still_path ? EPISODE_STILL_BASE + e.still_path : '';
            const meta = [
              e.air_date ? epDate(e.air_date) : '',
              e.rating ? '★ ' + e.rating.toFixed(1) : '',
              e.runtime ? e.runtime + ' min' : '',
            ].filter(Boolean).join(' · ');
            return `
              <div class="flex gap-3 sm:gap-4 ${isSeen ? 'opacity-85' : ''}">
                <button type="button" data-ep-open="${i}" class="shrink-0 w-32 sm:w-44 rounded-md overflow-hidden ring-1 ring-white/10 hover:ring-gold/50 bg-[#14141A] block transition">
                  ${
                    still
                      ? `<img src="${escapeAttr(still)}" alt="" loading="lazy" class="w-full aspect-video object-cover">`
                      : '<div class="w-full aspect-video flex items-center justify-center text-muted text-[10px]">geen beeld</div>'
                  }
                </button>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <button type="button" data-ep-open="${i}" class="text-left min-w-0 group/ep">
                      <p class="text-sm text-ink leading-tight group-hover/ep:text-gold">
                        <span class="font-mono text-xs text-muted mr-1">${season.season_number}×${String(e.episode_number).padStart(2, '0')}</span>${escapeHtml(e.name || 'Aflevering ' + e.episode_number)}
                      </p>
                      ${meta ? `<p class="text-[11px] text-muted font-mono mt-0.5">${escapeHtml(meta)}</p>` : ''}
                    </button>
                    <label class="flex items-center gap-1.5 text-[11px] text-muted shrink-0 cursor-pointer" title="Markeer als gezien">
                      <input type="checkbox" class="w-4 h-4 cursor-pointer" data-ep="${e.episode_number}" ${isSeen ? 'checked' : ''}> gezien
                    </label>
                  </div>
                  ${e.overview ? `<p class="text-xs text-muted mt-1 clamp-2 leading-snug">${escapeHtml(e.overview)}</p>` : ''}
                </div>
              </div>`;
          })
          .join('')}
      </div>
      <p class="text-[11px] text-muted mt-3">Klik op het beeld of de titel voor de volledige beschrijving.</p>`;

    const applyChange = (mutate) => {
      const before = snapshotProgress(item);
      const set = watchedEpisodes(item, season.season_number);
      mutate(set);
      setWatchedEpisodes(item, season.season_number, set);
      saveEpisodeProgress(item, before);
      openModal(item.id);
    };

    container.querySelectorAll('[data-ep]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const n = Number(cb.dataset.ep);
        applyChange((set) => (cb.checked ? set.add(n) : set.delete(n)));
      });
    });

    container.querySelectorAll('[data-ep-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEpisodeModal(item, season, data, Number(btn.dataset.epOpen));
      });
    });
    container.querySelector('[data-ep-all]').addEventListener('click', () => {
      applyChange((set) => data.episodes.forEach((e) => set.add(e.episode_number)));
    });
    container.querySelector('[data-ep-none]').addEventListener('click', () => {
      applyChange((set) => set.clear());
    });
  }

  // ---------- Wat zullen we kijken? ----------

  let pickScope = 'unwatched';

  function pickCandidates() {
    const genre = els.pickModal.querySelector('[data-pick-genre]').value;
    const maxRuntime = Number(els.pickModal.querySelector('[data-pick-runtime]').value) || 0;

    return state.all.filter((m) => {
      // Verlanglijst-titels kan je vanavond niet kijken.
      if (m.wishlist) return false;
      if (pickScope === 'unwatched' && m.watched) return false;
      if (genre && !(m.genres || []).includes(genre)) return false;
      if (maxRuntime) {
        const rt = Number(m.runtime) || 0;
        // Bij series is runtime de afleveringsduur; die past bijna altijd.
        // Titels zonder bekende speelduur laten we staan: op een collectie die
        // nog niet ververst is, filterde "hoogstens 2 uur" anders bijna alles
        // weg zonder dat je kon zien waarom.
        if (rt && rt > maxRuntime) return false;
      }
      return true;
    });
  }

  function updatePickCount() {
    const n = pickCandidates().length;
    els.pickModal.querySelector('[data-pick-count]').textContent =
      n === 0 ? 'Geen titels die hieraan voldoen' : `${n} titel${n === 1 ? '' : 's'} om uit te kiezen`;
  }

  function rollPick() {
    const list = pickCandidates();
    const box = els.pickModal.querySelector('[data-pick-result]');
    if (!list.length) {
      box.classList.remove('hidden');
      box.innerHTML = '<p class="text-sm text-muted">Niets gevonden. Probeer een ruimer filter.</p>';
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    const cover = posterUrl(pick);

    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="flex gap-4">
        <div class="w-24 shrink-0 aspect-[2/3] rounded overflow-hidden bg-bg ring-1 ring-white/10">
          ${cover ? `<img src="${escapeAttr(cover)}" alt="" class="w-full h-full object-cover">` : ''}
        </div>
        <div class="min-w-0 flex-1">
          <p class="font-display text-2xl tracking-wide leading-tight">${escapeHtml(pick.title)}</p>
          <p class="text-sm text-muted font-mono">${pick.release_year || ''}${
      pick.runtime ? ' · ' + pick.runtime + ' min' : ''
    }${pick.rating ? ' · TMDb ' + pick.rating.toFixed(1) : ''}</p>
          <p class="text-xs text-muted mt-1">${escapeHtml((pick.genres || []).join(' · '))}</p>
          <p class="text-xs text-muted mt-1">${escapeHtml(ownedFormats(pick).map(formatLabel).join(', '))}</p>
          <div class="flex gap-2 mt-3">
            <button type="button" class="chip" data-pick-open="${escapeAttr(pick.id)}">Bekijk details</button>
            <button type="button" class="chip" data-pick-again>Nog eens</button>
          </div>
        </div>
      </div>`;

    box.querySelector('[data-pick-open]').addEventListener('click', () => {
      closePickModal();
      openModal(pick.id);
    });
    box.querySelector('[data-pick-again]').addEventListener('click', rollPick);
  }

  function openPickModal() {
    if (!els.pickModal) return;
    // Genrelijst vullen met wat er in je collectie zit.
    const genres = new Set();
    state.all.forEach((m) => (m.genres || []).forEach((g) => genres.add(g)));
    const sel = els.pickModal.querySelector('[data-pick-genre]');
    sel.innerHTML =
      '<option value="">alle genres</option>' +
      [...genres].sort((a, b) => a.localeCompare(b)).map((g) => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join('');

    els.pickModal.querySelector('[data-pick-result]').classList.add('hidden');
    updatePickCount();
    els.pickModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closePickModal() {
    if (!els.pickModal) return;
    els.pickModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  // ---------- Dubbels ----------

  // Twee soorten dubbels: hetzelfde formaat meer dan eens binnen één titel,
  // en twee losse titels met een vrijwel gelijke naam en hetzelfde jaar.
  function findDuplicates() {
    const results = [];

    state.all.forEach((m) => {
      const counts = {};
      (m.editions || []).forEach((e) => {
        if (e.wishlist) return;
        // Exemplaren zonder formaat zijn geen dubbel maar een gat in de
        // gegevens; die zouden anders als "2× " (zonder naam) opduiken.
        if (!e.format) return;
        // Uitvoering hoort bij de sleutel: een standaard-DVD naast een
        // DVD-steelbook zijn twee bewust verschillende exemplaren, met elk een
        // eigen markt en prijs. Die als dubbel melden is vals alarm, en zet aan
        // tot verwijderen van iets wat je expres hebt.
        const uitvoering = (typeof editionVariantKeys === 'function' ? editionVariantKeys(e) : []).join('+');
        const sleutel = e.format + (uitvoering ? '|' + uitvoering : '');
        counts[sleutel] = (counts[sleutel] || 0) + 1;
      });
      Object.keys(counts)
        .filter((f) => counts[f] > 1)
        .forEach((f) => {
          const [fmt, uitvoering] = f.split('|');
          const labels =
            uitvoering && typeof EDITION_VARIANTS !== 'undefined'
              ? uitvoering
                  .split('+')
                  .map((k) => (EDITION_VARIANTS.find((v) => v.key === k) || {}).label || k)
                  .join(' + ')
              : '';
          results.push({
            kind: 'edition',
            items: [m],
            text: `${counts[f]}× ${formatLabel(fmt)}${labels ? ' (' + labels + ')' : ''} van dezelfde titel`,
          });
        });
    });

    const byKey = {};
    state.all.forEach((m) => {
      if (m.wishlist) return;
      // Het type hoort in de sleutel: een film en een serie met dezelfde naam
      // en hetzelfde jaar zijn geen dubbel.
      const key = sortTitle(m) + '|' + (m.release_year || '') + '|' + (m.content_type || '');
      (byKey[key] = byKey[key] || []).push(m);
    });
    Object.values(byKey)
      .filter((group) => group.length > 1)
      .forEach((group) => {
        results.push({
          kind: 'title',
          items: group,
          text: `${group.length} aparte titels met dezelfde naam en jaar`,
        });
      });

    return results;
  }

  function openDupesModal() {
    if (!els.dupesModal) return;
    const list = els.dupesModal.querySelector('[data-dupes-list]');
    const dupes = findDuplicates();

    list.innerHTML = dupes.length
      ? dupes
          .map(
            (d) => `
              <div class="bg-bg rounded-lg p-3">
                <p class="text-sm text-ink">${escapeHtml(d.items[0].title)} <span class="text-muted font-mono text-xs">${
              d.items[0].release_year || ''
            }</span></p>
                <p class="text-xs text-gold font-mono mt-0.5">${escapeHtml(d.text)}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  ${d.items
                    .map(
                      (it) =>
                        `<button type="button" class="chip !py-1 !px-2.5 text-[11px]" data-dupe-open="${escapeAttr(
                          it.id
                        )}">Open ${escapeHtml(it.id)}</button>`
                    )
                    .join('')}
                </div>
              </div>`
          )
          .join('')
      : '<p class="text-sm text-muted py-4">Geen dubbels gevonden. Netjes.</p>';

    list.querySelectorAll('[data-dupe-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeDupesModal();
        openModal(btn.dataset.dupeOpen);
      });
    });

    els.dupesModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeDupesModal() {
    if (!els.dupesModal) return;
    els.dupesModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  window.__openPickModal = openPickModal;
  window.__openDupesModal = openDupesModal;

  if (els.pickModal) {
    els.pickModal.addEventListener('click', (e) => {
      if (e.target === els.pickModal) closePickModal();
    });
    els.pickModal.querySelector('[data-pick-close]').addEventListener('click', closePickModal);
    els.pickModal.querySelector('[data-pick-roll]').addEventListener('click', rollPick);
    els.pickModal.querySelector('[data-pick-genre]').addEventListener('change', updatePickCount);
    els.pickModal.querySelector('[data-pick-runtime]').addEventListener('change', updatePickCount);
    els.pickModal.querySelectorAll('[data-pick-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pickScope = btn.dataset.pickScope;
        els.pickModal.querySelectorAll('[data-pick-scope]').forEach((b) => {
          b.classList.toggle('chip-active', b === btn);
        });
        updatePickCount();
      });
    });
  }

  if (els.dupesModal) {
    els.dupesModal.addEventListener('click', (e) => {
      if (e.target === els.dupesModal) closeDupesModal();
    });
    els.dupesModal.querySelector('[data-dupes-close]').addEventListener('click', closeDupesModal);
  }

  // ---------- Exemplaren (fase 8) ----------

  // Welk exemplaar staat er in de detailweergave centraal? Bepaalt welke
  // hoesfoto's en opmerkingen je ziet en wat het bewerkpaneel aanpast.
  let activeEditionId = null;

  function activeEdition(item) {
    const eds = item.editions || [];
    return eds.find((e) => e.eid === activeEditionId) || primaryEdition(item) || eds[0] || null;
  }

  function renderEditions(item) {
    const section = els.modal.querySelector('[data-field="editions-section"]');
    const list = els.modal.querySelector('[data-field="editions-list"]');
    if (!section || !list) return;

    const eds = item.editions || [];
    const active = activeEdition(item);
    if (active) activeEditionId = active.eid;

    list.innerHTML = eds
      .map((e) => {
        const isActive = active && e.eid === active.eid;
        const priceInfo = editionPriceInfo(item, e);
        const bits = [];
        editionVariantLabels(e).forEach((l) => bits.push(escapeHtml(l)));
        if (e.boxset) bits.push(escapeHtml(e.boxset));
        if (e.location) bits.push('📍 ' + escapeHtml(e.location));
        if (e.notes) bits.push(escapeHtml(e.notes));
        // FASE 40 — betaald, staat, uitgeleend, regiocode, schijven, talen.
        const verzamel =
          typeof collectorSamenvatting === 'function' ? collectorSamenvatting(e) : [];
        const hasPhotos = e.custom_front_cover_id || e.custom_front_cover || e.custom_back_cover_id || e.custom_back_cover;

        return `
          <div class="flex items-center gap-3 py-2 px-2 rounded ${
            isActive ? 'bg-white/5 ring-1 ring-gold/40' : 'hover:bg-white/5'
          } cursor-pointer" data-edition="${escapeAttr(e.eid)}" role="button" tabindex="0">
            <span class="font-mono text-xs px-1.5 py-0.5 rounded shrink-0" style="background:${formatColor(
              e.format
            )};color:#14141A">${escapeHtml(formatShort(e.format))}</span>
            <span class="flex-1 min-w-0">
              <span class="block text-sm text-ink">${escapeHtml(formatLabel(e.format))}${
          e.wishlist ? ' <span class="text-gold font-mono text-[10px]">verlanglijst</span>' : ''
        }</span>
              ${bits.length ? `<span class="block text-[11px] text-muted truncate">${bits.join(' · ')}</span>` : ''}
              ${
                verzamel.length
                  ? `<span class="block text-[11px] ${
                      isUitgeleend(e) ? 'text-gold' : 'text-muted'
                    }">${verzamel.map(escapeHtml).join(' · ')}</span>`
                  : ''
              }
              ${
                priceInfo
                  ? `<span class="block text-[11px] font-mono text-teal/90" title="Richtwaarde op eBay (mediaan) met de middenrange">${escapeHtml(
                      priceRangeText(priceInfo)
                    )}${convertedHint(priceInfo)}${priceInfo.date ? ` <span class="text-muted">· gemeten ${escapeHtml(priceInfo.date)}</span>` : ''}</span>`
                  : ''
              }
            </span>
            ${hasPhotos ? '<span class="font-mono text-[10px] text-teal shrink-0" title="Eigen hoesfoto\'s">foto</span>' : ''}
            <button type="button" class="text-muted hover:text-red-400 text-xs underline shrink-0"
              data-remove-edition="${escapeAttr(e.eid)}">verwijderen</button>
          </div>`;
      })
      .join('');

    section.classList.remove('hidden');

    list.querySelectorAll('[data-edition]').forEach((row) => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-remove-edition]')) return;
        activeEditionId = row.dataset.edition;
        openModal(item.id);
      });
    });
    list.querySelectorAll('[data-remove-edition]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handleRemoveEdition(item, btn.dataset.removeEdition);
      });
    });
  }

  function handleAddEdition(item) {
    const used = new Set((item.editions || []).map((e) => e.format));
    // Eerst je onthouden voorkeursformaat proberen (standaard DVD); heb je dat
    // al van deze titel, dan het eerste formaat dat je nog niet hebt. Voorheen
    // begon dit altijd bovenaan de lijst, dus kreeg je 4K aangeboden terwijl je
    // net een Blu-ray gekocht had.
    const voorkeur = typeof addTitlePreferredFormat === 'function' ? addTitlePreferredFormat() : 'dvd';
    const next = !used.has(voorkeur)
      ? voorkeur
      : MEDIA_FORMATS.map((f) => f.value).find((v) => !used.has(v)) || voorkeur;
    const edition = {
      eid: nextEditionId(item),
      format: next,
      notes: '',
      boxset: '',
      // Alle vier de uitvoeringen meteen zetten; voorheen stond alleen
      // steelbook hier en kwamen de andere drie pas bij de volgende
      // normalisatieronde erbij.
      ...Object.fromEntries(EDITION_VARIANTS.map((v) => [v.key, false])),
      wishlist: false,
      date_added: new Date().toISOString().slice(0, 10),
      added_at: new Date().toISOString(),
      custom_front_cover_id: '',
      custom_back_cover_id: '',
      custom_front_cover: '',
      custom_back_cover: '',
    };
    const snapshot = JSON.parse(JSON.stringify(item.editions || []));
    item.editions = [...(item.editions || []), edition];
    syncLegacyFieldsFromEditions(item);
    activeEditionId = edition.eid;

    buildFacetChips(state.all);
    applyFilters();
    openModal(item.id);

    backgroundSave(
      () => upsertMovieInDrive(item),
      () => {
        item.editions = snapshot;
        syncLegacyFieldsFromEditions(item);
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      }
    );
  }

  function handleRemoveEdition(item, eid) {
    const eds = item.editions || [];
    if (eds.length <= 1) {
      alert('Dit is het laatste exemplaar. Gebruik "Volledige titel verwijderen" als je de titel helemaal weg wil.');
      return;
    }
    const target = eds.find((e) => e.eid === eid);
    if (!target) return;
    if (!confirm(`Exemplaar op ${formatLabel(target.format)} verwijderen uit je collectie?`)) return;

    const snapshot = JSON.parse(JSON.stringify(eds));
    item.editions = eds.filter((e) => e.eid !== eid);
    syncLegacyFieldsFromEditions(item);
    activeEditionId = null;

    buildFacetChips(state.all);
    applyFilters();
    openModal(item.id);

    // FASE 41 — een exemplaar weghalen is nu terug te draaien; de hoesfoto's
    // van dat exemplaar worden sinds FASE 39 bewaard, dus die komen mee terug.
    const herstelExemplaar = () => {
      item.editions = JSON.parse(JSON.stringify(snapshot));
      syncLegacyFieldsFromEditions(item);
      vergeetEigenTekst(item);
      buildFacetChips(state.all);
      applyFilters();
      openModal(item.id);
      backgroundSave(async () => {
        if (typeof driveHerstelCoversOfMovie === 'function') await driveHerstelCoversOfMovie(item);
        await upsertMovieInDrive(item);
      });
    };

    backgroundSave(
      // Ook hier: de foto's van dit exemplaar pas weg als het wegschrijven
      // gelukt is, anders blijven ze bestaan bij een terugdraaiing.
      () =>
        upsertMovieInDrive(item).then(async () => {
          if (typeof driveDeleteCoversOfEdition === 'function') {
            await driveDeleteCoversOfEdition(target);
          }
        }),
      () => {
        item.editions = snapshot;
        syncLegacyFieldsFromEditions(item);
        if (!els.modal.classList.contains('hidden')) openModal(item.id);
      },
      () => meldMetOngedaan(`Exemplaar op ${formatLabel(target.format)} verwijderd`, herstelExemplaar)
    );
  }

  // ---------- Personen ----------

  const personCache = {};
  let personState = { data: null, filter: 'all', shown: 40, bioExpanded: false };
  const PERSON_PAGE = 40;
  // Volgnummer per aanvraag: klik je snel door naar een andere persoon, dan
  // mag het trage antwoord van de vorige het scherm niet meer overschrijven.
  let personRequestSeq = 0;

  // Koppelt een TMDb-titel aan wat jij in je collectie hebt.
  function ownedIndexByTmdb() {
    const index = {};
    state.all.forEach((m) => {
      if (m.tmdb_id) index[String(m.tmdb_id)] = m;
    });
    return index;
  }

  function personCreditRowHtml(credit, mine) {
    const owned = mine && !mine.wishlist;
    const onWishlist = mine && mine.wishlist;
    const year = credit.release_year || '—';
    const roles = credit.roles.length ? credit.roles.slice(0, 3).join(' · ') : '';
    const typeLabel = credit.media_type === 'tv' ? 'serie' : '';

    let marker;
    if (owned) marker = '<span class="font-mono text-[11px] text-teal shrink-0">✓ in bezit</span>';
    else if (onWishlist) marker = '<span class="font-mono text-[11px] text-gold shrink-0">verlanglijst</span>';
    else marker = '<span class="font-mono text-[11px] text-muted/60 shrink-0">—</span>';

    return `
      <div class="flex items-center gap-3 py-1.5 ${owned ? '' : 'opacity-75'} ${
      mine ? 'cursor-pointer hover:bg-white/5 rounded px-1' : 'px-1'
    }" ${mine ? `data-open-owned="${escapeAttr(mine.id)}" role="button" tabindex="0"` : ''}>
        <span class="font-mono text-[11px] text-muted w-10 shrink-0">${year}</span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm text-ink">${escapeHtml(credit.title)}${
      typeLabel ? ` <span class="text-muted font-mono text-[10px]">${typeLabel}</span>` : ''
    }</span>
          ${roles ? `<span class="block truncate text-[11px] text-muted">${escapeHtml(roles)}</span>` : ''}
        </span>
        ${marker}
      </div>`;
  }

  function renderPersonCredits() {
    const m = els.personModal;
    if (!m || !personState.data) return;
    const index = ownedIndexByTmdb();
    const listEl = m.querySelector('[data-person-credits]');
    const moreBtn = m.querySelector('[data-person-more]');

    const all = personState.data.credits;
    const filtered = all.filter((c) => {
      const mine = index[String(c.tmdb_id)];
      if (personState.filter === 'owned') return mine && !mine.wishlist;
      if (personState.filter === 'missing') return !mine || mine.wishlist;
      return true;
    });

    const visible = filtered.slice(0, personState.shown);
    listEl.innerHTML = visible.length
      ? visible.map((c) => personCreditRowHtml(c, index[String(c.tmdb_id)])).join('')
      : '<p class="text-sm text-muted py-3">Niets gevonden met dit filter.</p>';

    moreBtn.classList.toggle('hidden', personState.shown >= filtered.length);
    moreBtn.textContent = `Toon meer (${filtered.length - personState.shown} resterend)`;

    listEl.querySelectorAll('[data-open-owned]').forEach((el) => {
      el.addEventListener('click', () => {
        closePersonModal();
        openModal(el.dataset.openOwned);
      });
    });
  }

  async function openPersonModal(personId) {
    const m = els.personModal;
    if (!m) return;
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey || typeof tmdbPerson !== 'function') return;

    const myRequest = ++personRequestSeq;
    personState = { data: null, filter: 'all', shown: PERSON_PAGE, bioExpanded: false };

    m.querySelector('[data-person-name]').textContent = 'Laden…';
    m.querySelector('[data-person-meta]').textContent = '';
    m.querySelector('[data-person-owned]').textContent = '';
    m.querySelector('[data-person-bio]').textContent = '';
    m.querySelector('[data-person-credits]').innerHTML = '';
    m.querySelector('[data-person-photo]').removeAttribute('src');
    m.querySelector('[data-person-appearances-wrap]').classList.add('hidden');
    m.querySelectorAll('[data-person-filter]').forEach((b) =>
      b.classList.toggle('chip-active', b.dataset.personFilter === 'all')
    );
    m.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    let person;
    try {
      person = personCache[personId] || (personCache[personId] = await tmdbPerson(personId, c.tmdbKey));
    } catch (err) {
      if (myRequest !== personRequestSeq) return;
      m.querySelector('[data-person-name]').textContent = 'Kon deze persoon niet laden';
      m.querySelector('[data-person-meta]').textContent = err.message;
      return;
    }

    // Intussen doorgeklikt naar iemand anders, of het venster gesloten?
    // Dan dit antwoord laten vallen.
    if (myRequest !== personRequestSeq || m.classList.contains('hidden')) return;

    personState.data = person;

    m.querySelector('[data-person-name]').textContent = person.name;

    const photo = m.querySelector('[data-person-photo]');
    if (person.profile_path) {
      photo.src = PROFILE_BASE + person.profile_path;
      photo.alt = person.name;
    }

    const bits = [];
    const DEPT = { Acting: 'Acteur', Directing: 'Regisseur', Writing: 'Scenarist', Sound: 'Muziek', Production: 'Productie' };
    if (person.known_for_department) bits.push(DEPT[person.known_for_department] || person.known_for_department);
    if (person.birthday) {
      const born = new Date(person.birthday);
      if (!isNaN(born)) {
        if (person.deathday) {
          const died = new Date(person.deathday);
          bits.push(`${born.getFullYear()}–${isNaN(died) ? '' : died.getFullYear()}`);
        } else {
          const age = Math.floor((Date.now() - born) / 31557600000);
          bits.push(`geboren ${born.toLocaleDateString('nl-BE')} (${age})`);
        }
      }
    }
    if (person.place_of_birth) bits.push(person.place_of_birth);
    m.querySelector('[data-person-meta]').textContent = bits.join(' · ');

    // Hoeveel van deze filmografie staat er bij jou in de kast?
    const index = ownedIndexByTmdb();
    const ownedCount = person.credits.filter((cr) => {
      const mine = index[String(cr.tmdb_id)];
      return mine && !mine.wishlist;
    }).length;
    m.querySelector('[data-person-owned]').textContent = ownedCount
      ? `Je bezit ${ownedCount} van de ${person.credits.length} titels`
      : `Nog geen van deze ${person.credits.length} titels in je collectie`;

    // Biografie inkorten tot een leesbaar blok, met knop om uit te klappen.
    const bioEl = m.querySelector('[data-person-bio]');
    const bioBtn = m.querySelector('[data-person-bio-toggle]');
    const bio = person.biography || '';
    const SHORT = 320;
    const applyBio = () => {
      if (!bio) {
        bioEl.textContent = 'Geen biografie beschikbaar.';
        bioBtn.classList.add('hidden');
        return;
      }
      if (bio.length <= SHORT) {
        bioEl.textContent = bio;
        bioBtn.classList.add('hidden');
        return;
      }
      bioEl.textContent = personState.bioExpanded ? bio : bio.slice(0, SHORT).trimEnd() + '…';
      bioBtn.classList.remove('hidden');
      bioBtn.textContent = personState.bioExpanded ? 'Minder' : 'Meer lezen';
    };
    applyBio();
    bioBtn.onclick = () => {
      personState.bioExpanded = !personState.bioExpanded;
      applyBio();
    };

    renderPersonCredits();

    // Gastoptredens als zichzelf staan apart, achter een knop.
    const appWrap = m.querySelector('[data-person-appearances-wrap]');
    const appList = m.querySelector('[data-person-appearances]');
    const appBtn = m.querySelector('[data-person-appearances-toggle]');
    if (person.appearances.length) {
      appWrap.classList.remove('hidden');
      appList.classList.add('hidden');
      appBtn.textContent = `Gastoptredens als zichzelf tonen (${person.appearances.length})`;
      appBtn.onclick = () => {
        const hidden = appList.classList.toggle('hidden');
        appBtn.textContent = hidden
          ? `Gastoptredens als zichzelf tonen (${person.appearances.length})`
          : 'Gastoptredens verbergen';
        if (!hidden && !appList.dataset.filled) {
          const idx = ownedIndexByTmdb();
          appList.innerHTML = person.appearances
            .map((cr) => personCreditRowHtml(cr, idx[String(cr.tmdb_id)]))
            .join('');
          appList.dataset.filled = '1';
        }
      };
      delete appList.dataset.filled;
      appList.innerHTML = '';
    } else {
      appWrap.classList.add('hidden');
    }
  }

  function closePersonModal() {
    if (!els.personModal) return;
    els.personModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  if (els.personModal) {
    els.personModal.addEventListener('click', (e) => {
      if (e.target === els.personModal) closePersonModal();
    });
    const closeBtn = els.personModal.querySelector('[data-person-close]');
    if (closeBtn) closeBtn.addEventListener('click', closePersonModal);

    els.personModal.querySelectorAll('[data-person-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        personState.filter = btn.dataset.personFilter;
        personState.shown = PERSON_PAGE;
        els.personModal.querySelectorAll('[data-person-filter]').forEach((b) => {
          b.classList.toggle('chip-active', b === btn);
        });
        renderPersonCredits();
      });
    });

    const moreBtn = els.personModal.querySelector('[data-person-more]');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        personState.shown += PERSON_PAGE;
        renderPersonCredits();
      });
    }
  }

  // ---------- Reeks-compleetheid ----------

  // Eenmaal opgehaalde reeksen onthouden we voor deze sessie, zodat je bij het
  // heen-en-weer klikken niet telkens opnieuw TMDb aanspreekt.
  const sagaCache = {};

  async function showSagaCompleteness(item) {
    const section = els.modal.querySelector('[data-field="saga-section"]');
    const listEl = els.modal.querySelector('[data-field="saga-parts"]');
    const progressEl = els.modal.querySelector('[data-field="saga-progress"]');
    if (!section || !listEl) return;

    if (!item.saga_id) {
      section.classList.add('hidden');
      return;
    }

    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey || typeof tmdbCollection !== 'function') {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    progressEl.textContent = '';
    listEl.innerHTML = '<p class="text-sm text-muted">Delen van de reeks ophalen…</p>';

    // Onthouden voor welke titel we bezig zijn: klikt de gebruiker intussen
    // door naar een andere titel, dan gooien we dit resultaat weg.
    const requestedFor = item.id;

    let collection;
    try {
      if (sagaCache[item.saga_id]) {
        collection = sagaCache[item.saga_id];
      } else {
        collection = await tmdbCollection(item.saga_id, c.tmdbKey);
        sagaCache[item.saga_id] = collection;
      }
    } catch (err) {
      if (requestedFor !== currentModalId) return;
      listEl.innerHTML = `<p class="text-sm text-muted">Kon de reeks niet ophalen: ${escapeHtml(err.message)}</p>`;
      return;
    }

    if (requestedFor !== currentModalId) return;

    // Koppelen gebeurt op TMDb-id, maar dat lukt niet altijd: TMDb bevat soms
    // meerdere records voor dezelfde film, en dan heeft jouw exemplaar een
    // ander id dan het deel in de officiële reeks. Daarom vergelijken we ook
    // op genormaliseerde titel met een jaar dat hooguit één jaar afwijkt.
    const ownedByTmdb = {};
    const ownedByTitle = {};
    state.all.forEach((m) => {
      if (m.tmdb_id) ownedByTmdb[String(m.tmdb_id)] = m;
      const key = normalizeTitleText(m.title);
      (ownedByTitle[key] = ownedByTitle[key] || []).push(m);
    });

    function findMine(part) {
      const byId = ownedByTmdb[String(part.tmdb_id)];
      if (byId) return byId;
      const candidates = ownedByTitle[normalizeTitleText(part.title)] || [];
      if (!candidates.length) return null;
      return (
        candidates.find(
          (m) =>
            !part.release_year ||
            !m.release_year ||
            Math.abs(m.release_year - part.release_year) <= 1
        ) || null
      );
    }

    const parts = collection.parts || [];
    const matched = new Set();

    // Titels die jij onder dezelfde reeksnaam hebt gezet maar die TMDb niet in
    // deze collectie heeft — bijvoorbeeld een andere uitgave of een deel dat
    // TMDb elders onderbrengt.
    const sagaName = sagaOf(item);
    // Titels die jij zelf bij deze reeks hebt gezet maar die TMDb er niet bij
    // rekent. Alleen zinvol bij een ingevulde reeksnaam: is die leeg, dan
    // matcht `sagaOf(m) === ''` élke titel zonder reeks — en stond hier ineens
    // je hele collectie, met duizenden rijen HTML per keer dat je de titel
    // opende.
    const extras = sagaName
      ? state.all.filter((m) => {
          if (sagaOf(m) !== sagaName) return false;
          return !parts.some((p) => findMine(p) === m);
        })
      : [];

    const ownedCount =
      parts.filter((p) => {
        const mine = findMine(p);
        return mine && !mine.wishlist;
      }).length + extras.filter((m) => !m.wishlist).length;

    progressEl.textContent = `${ownedCount}/${parts.length + extras.length} in bezit`;

    listEl.innerHTML = parts
      .map((p) => {
        const mine = findMine(p);
        if (mine) matched.add(mine.id);
        const owned = mine && !mine.wishlist;
        const onWishlist = mine && mine.wishlist;
        const year = p.release_year || '—';

        let right;
        let checkbox = '<span class="w-4 shrink-0"></span>';
        if (owned) {
          right = '<span class="font-mono text-xs text-teal">✓ in bezit</span>';
        } else if (onWishlist) {
          right = '<span class="font-mono text-xs text-gold">verlanglijst</span>';
        } else {
          // Ontbrekend deel: aanvinken om er samen iets mee te doen (naar de
          // verlanglijst of meteen als in bezit), of los toevoegen via de twee
          // knoppen rechts.
          checkbox = `<input type="checkbox" class="w-4 h-4 shrink-0 cursor-pointer" data-saga-pick="${escapeAttr(
            p.tmdb_id
          )}" title="Aanvinken om samen toe te voegen — op de verlanglijst of meteen als in bezit">`;
          right = `
            <span class="flex gap-2 shrink-0">
              <button type="button" class="text-gold hover:text-white text-xs underline" data-saga-add="${escapeAttr(p.tmdb_id)}">+ verlanglijst</button>
              <button type="button" class="text-teal hover:text-white text-xs underline" data-saga-own="${escapeAttr(p.tmdb_id)}">+ in bezit…</button>
            </span>`;
        }

        return `
          <div class="flex items-center gap-2 text-sm ${owned ? '' : 'opacity-75'}">
            ${checkbox}
            <span class="flex-1 min-w-0 truncate">${escapeHtml(p.title)} <span class="text-muted font-mono text-xs">(${year})</span></span>
            <span class="shrink-0">${right}</span>
          </div>`;
      })
      .join('') +
      (extras.length
        ? `<div class="pt-2 mt-2 border-t border-white/5">
             <p class="text-[11px] text-muted mb-1">Ook door jou bij deze reeks gezet:</p>
             ${extras
               .map(
                 (m) => `
                   <div class="flex items-center justify-between gap-2 text-sm">
                     <span class="truncate min-w-0">${escapeHtml(m.title)} <span class="text-muted font-mono text-xs">(${
                   m.release_year || '—'
                 })</span></span>
                     <span class="shrink-0 font-mono text-xs ${m.wishlist ? 'text-gold' : 'text-teal'}">${
                   m.wishlist ? 'verlanglijst' : '✓ in bezit'
                 }</span>
                   </div>`
               )
               .join('')}
           </div>`
        : '');

    listEl.querySelectorAll('[data-saga-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const part = parts.find((p) => String(p.tmdb_id) === btn.dataset.sagaAdd);
        if (part) addSagaPartToWishlist(part, btn);
      });
    });

    // Aanvinken van ontbrekende delen om ze samen op de verlanglijst te zetten.
    sagaBulkSelection = [];
    const missingParts = parts.filter((p) => {
      const mine = findMine(p);
      return !mine;
    });
    updateSagaBulkBar();

    listEl.querySelectorAll('[data-saga-pick]').forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const part = missingParts.find((p) => String(p.tmdb_id) === cb.dataset.sagaPick);
        if (!part) return;
        if (cb.checked) sagaBulkSelection.push(part);
        else sagaBulkSelection = sagaBulkSelection.filter((x) => String(x.tmdb_id) !== cb.dataset.sagaPick);
        updateSagaBulkBar();
      });
    });

    // Volledig toevoegformulier openen voor een ontbrekend deel.
    listEl.querySelectorAll('[data-saga-own]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        // Stil terugkeren maakt de knop 'dood' zonder uitleg — liever zeggen
        // wat eraan scheelt.
        if (typeof addTitleOpenForTmdb !== 'function') {
          alert(
            'Deze knop heeft een nieuwere assets/add-title.js nodig.\n\n' +
            'Upload dat bestand opnieuw en herlaad met Ctrl+Shift+R.'
          );
          return;
        }
        closeModal();
        const addModal = document.getElementById('add-title-modal');
        if (addModal) addModal.classList.remove('hidden');
        try {
          await addTitleOpenForTmdb(btn.dataset.sagaOwn, 'movie');
        } catch (err) {
          alert('Kon de gegevens niet ophalen: ' + err.message);
        }
      });
    });
  }

  // Zet een ontbrekend deel van een reeks op de verlanglijst. Haalt de volledige
  // TMDb-gegevens op zodat de titel meteen compleet in je collectie staat.
  // ---------- Meerdere reeksdelen samen op de verlanglijst ----------

  let sagaBulkSelection = [];

  function updateSagaBulkBar() {
    const bar = els.modal.querySelector('[data-field="saga-bulk-bar"]');
    const count = els.modal.querySelector('[data-field="saga-bulk-count"]');
    if (!bar || !count) return;
    const n = sagaBulkSelection.length;
    bar.classList.toggle('hidden', n === 0);
    count.textContent = `${n} aangevinkt`;
  }

  /**
   * Voegt de aangevinkte ontbrekende reeksdelen in één keer toe (FASE 32).
   *
   * `alsWens = false` zet ze meteen als in bezit. Dat kon eerder niet: er was
   * alleen een knop voor de verlanglijst, en wilde je delen die je wél hebt
   * toevoegen, dan moest je ze één voor één via het volledige formulier doen.
   */
  async function sagaBulkToevoegen(alsWens) {
    const bar = els.modal.querySelector('[data-field="saga-bulk-bar"]');
    const status = els.modal.querySelector('[data-field="saga-bulk-status"]');
    const wishBtn = els.modal.querySelector('[data-saga-bulk-wish]');
    const ownBtn = els.modal.querySelector('[data-saga-bulk-own]');
    const knoppen = [wishBtn, ownBtn].filter(Boolean);
    if (!sagaBulkSelection.length) return;

    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey) {
      status.textContent = 'TMDb-key ontbreekt.';
      status.className = 'text-[11px] font-mono text-gold';
      return;
    }

    const selection = [...sagaBulkSelection];
    knoppen.forEach((b) => (b.disabled = true));

    const entries = [];
    for (let i = 0; i < selection.length; i++) {
      const part = selection[i];
      status.textContent = `(${i + 1}/${selection.length}) ${part.title}…`;
      status.className = 'text-[11px] font-mono text-muted';
      try {
        const details = await tmdbDetails(part.tmdb_id, 'movie', c.tmdbKey);
        const id = slugify(details.title, details.release_year);
        if (state.all.some((m) => m.id === id)) continue; // stond er intussen al
        const today = new Date().toISOString().slice(0, 10);
        const entry = {
          id,
          content_type: 'movie',
          date_added: today,
          added_at: new Date().toISOString(),
          watched: false,
          editions: [
            {
              eid: 'e1',
              // Jouw onthouden voorkeursformaat (standaard DVD), niet
              // hardgecodeerd Blu-ray.
              format: typeof addTitlePreferredFormat === 'function' ? addTitlePreferredFormat() : 'dvd',
              notes: '',
              boxset: '',
              location: '',
              wishlist: !!alsWens,
              date_added: today,
              added_at: new Date().toISOString(),
              custom_front_cover_id: '',
              custom_back_cover_id: '',
              custom_front_cover: '',
              custom_back_cover: '',
            },
          ],
          ...details,
          seasons: [],
        };
        normalizeMovieEntry(entry);
        entries.push(entry);
      } catch (err) {
        console.warn('Reeksdeel overslaan:', part.title, err);
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    if (!entries.length) {
      status.textContent = 'Niets toegevoegd (stonden er al in).';
      status.className = 'text-[11px] font-mono text-gold';
      knoppen.forEach((b) => (b.disabled = false));
      return;
    }

    // Meteen in de interface, opslaan op de achtergrond.
    entries.forEach((e) => state.all.push(e));
    buildFacetChips(state.all);
    applyFilters();

    backgroundSave(
      () => upsertMoviesBatchInDrive(entries),
      () => {
        const ids = new Set(entries.map((e) => e.id));
        state.all = state.all.filter((m) => !ids.has(m.id));
      }
    );

    sagaBulkSelection = [];
    knoppen.forEach((b) => (b.disabled = false));
    // Reekslijst opnieuw opbouwen zodat de nieuwe verlanglijst-status klopt.
    openModal(currentModalId);
  }

  async function addSagaPartToWishlist(part, btn) {
    const c = typeof getConfig === 'function' ? getConfig() : {};
    if (!c.tmdbKey) return;

    btn.disabled = true;
    btn.textContent = 'bezig…';
    try {
      const details = await tmdbDetails(part.tmdb_id, 'movie', c.tmdbKey);
      const vandaag = new Date().toISOString().slice(0, 10);
      // Mét editions[] en genormaliseerd, net als elke andere plek waar een
      // titel ontstaat. Voorheen bouwde deze knop een titel op de oude manier
      // (formaat en notities op titelniveau, geen exemplaren). Zolang je de
      // pagina niet herlaadde, vond het formaatfilter die titel niet, bleef
      // "Mijn exemplaren" leeg, en gaf activeEdition() null — waardoor de
      // Opslaan-knop van het bewerkpaneel permanent grijs bleef.
      const entry = {
        id: slugify(details.title, details.release_year),
        content_type: 'movie',
        watched: false,
        date_added: vandaag,
        added_at: new Date().toISOString(),
        editions: [
          {
            eid: 'e1',
            format: typeof addTitlePreferredFormat === 'function' ? addTitlePreferredFormat() : 'dvd',
            notes: '',
            boxset: '',
            location: '',
            wishlist: true,
            date_added: vandaag,
            added_at: new Date().toISOString(),
            custom_front_cover_id: '',
            custom_back_cover_id: '',
            custom_front_cover: '',
            custom_back_cover: '',
          },
        ],
        ...details,
        seasons: [],
      };
      normalizeMovieEntry(entry);

      if (state.all.some((m) => m.id === entry.id)) {
        btn.textContent = 'stond er al';
        return;
      }

      state.all.push(entry);
      buildFacetChips(state.all);
      applyFilters();
      btn.outerHTML = '<span class="font-mono text-xs text-gold">verlanglijst</span>';

      backgroundSave(
        () => upsertMovieInDrive(entry),
        () => { state.all = state.all.filter((m) => m.id !== entry.id); }
      );
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '+ verlanglijst';
      alert('Toevoegen mislukt: ' + err.message);
    }
  }

  // Welke titel staat er op dit moment open? Nodig om trage TMDb-antwoorden
  // te kunnen negeren als je intussen al doorgeklikt bent.
  let currentModalId = null;

  function openModal(id) {
    const item = state.all.find((m) => m.id === id);
    if (!item) return;
    // Wissel je van titel, dan begint de exemplaarkeuze opnieuw.
    if (currentModalId !== id) activeEditionId = null;
    currentModalId = id;

    const ribbon = ribbonInfo(item);

    els.modal.querySelector('[data-field="title"]').textContent = item.title;
    els.modal.querySelector('[data-field="year"]').textContent = item.release_year || '—';
    els.modal.querySelector('[data-field="runtime"]').textContent = item.runtime ? item.runtime + ' min' : '—';
    els.modal.querySelector('[data-field="rating"]').textContent = item.rating ? item.rating.toFixed(1) + ' / 10' : '—';
    // Genres en regisseur zijn klikbaar: je filtert er meteen je collectie mee.
    const genresEl = els.modal.querySelector('[data-field="genres"]');
    genresEl.innerHTML = (item.genres || []).length
      ? item.genres
          .map(
            (g) =>
              `<button type="button" class="hover:text-gold underline decoration-white/20 underline-offset-2" data-filter-genre="${escapeAttr(
                g
              )}">${escapeHtml(g)}</button>`
          )
          .join(' <span class="text-muted">·</span> ')
      : '—';
    genresEl.querySelectorAll('[data-filter-genre]').forEach((btn) => {
      btn.addEventListener('click', () => applyQuickFilter('genre', btn.dataset.filterGenre));
    });

    const directorEl = els.modal.querySelector('[data-field="director"]');
    directorEl.innerHTML = item.director
      ? item.director
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
          .map(
            (n) =>
              `<button type="button" class="hover:text-gold underline decoration-white/20 underline-offset-2" data-filter-search="${escapeAttr(
                n
              )}">${escapeHtml(n)}</button>`
          )
          .join(', ')
      : '—';
    directorEl.querySelectorAll('[data-filter-search]').forEach((btn) => {
      btn.addEventListener('click', () => applyQuickFilter('search', btn.dataset.filterSearch));
    });

    fillEnrichedFields(item);
    const ed = activeEdition(item);
    els.modal.querySelector('[data-field="format"]').textContent =
      (ed ? formatLabel(ed.format) : ribbon.label) + (ed && ed.wishlist ? ' · Verlanglijst' : '');
    els.modal.querySelector('[data-field="notes"]').textContent =
      (ed && ed.notes) || 'Geen opmerkingen';
    renderEditions(item);
    els.modal.querySelector('[data-field="overview"]').textContent = item.overview || '';
    const sagaField = els.modal.querySelector('[data-field="saga"]');
    if (sagaField) sagaField.textContent = sagaOf(item) || '—';

    // Covers: standaard poster; hoesfoto-tab enkel als er eigen foto's zijn.
    modalCoverMode = 'poster';
    const tabs = els.modal.querySelector('[data-cover-tabs]');
    if (tabs) {
      tabs.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          modalCoverMode = b.dataset.coverTab;
          showModalCovers(item);
        };
      });
    }
    showModalCovers(item);

    // Klik op de cover → lightbox met de nu zichtbare afbeelding.
    const flipCard = els.modal.querySelector('.flip-card');
    flipCard.onclick = (e) => {
      if (e.target.closest('[data-flip-btn]')) return;
      const flipped = flipCard.classList.contains('flipped');
      let src;
      if (modalCoverMode === 'poster') src = modalCoverSrcs.poster;
      else src = flipped ? (modalCoverSrcs.back || modalCoverSrcs.front) : (modalCoverSrcs.front || modalCoverSrcs.poster);
      openLightbox(src, item.title);
    };

    const seasonsSection = els.modal.querySelector('[data-field="seasons-section"]');
    const seasonsList = els.modal.querySelector('[data-field="seasons-list"]');
    if (item.seasons && item.seasons.length) {
      seasonsSection.classList.remove('hidden');
      // FASE 39 — hier stond een eigen lijstje met drie van de zes formaten.
      // Een seizoen op Laserdisc toonde daardoor de kale waarde `laserdisc`, en
      // je kon het ook niet kiezen. MEDIA_FORMATS is de enige echte lijst.
      const fmtLabel = {};
      MEDIA_FORMATS.forEach((f) => { fmtLabel[f.value] = f.label; });
      const fmtOpties = (selected) =>
        MEDIA_FORMATS.map(
          (f) =>
            `<option value="${escapeAttr(f.value)}" ${selected === f.value ? 'selected' : ''}>${escapeHtml(
              f.label
            )}</option>`
        ).join('');
      seasonsList.innerHTML = item.seasons
        .map((s) => {
          // Seizoencover: eigen seizoenposter indien beschikbaar (na een
          // verversing via Beheer), anders de serieposter, anders een plek.
          const poster = s.poster_path
            ? SEASON_POSTER_BASE + s.poster_path
            : item.poster_path
            ? SEASON_POSTER_BASE + item.poster_path
            : '';
          const yr = (s.air_date || '').slice(0, 4);
          const posterHtml = poster
            ? `<img src="${escapeAttr(poster)}" alt="${escapeAttr(s.name)}" loading="lazy" class="w-full aspect-[2/3] object-cover">`
            : `<div class="w-full aspect-[2/3] flex items-center justify-center text-muted text-[10px] text-center px-1">geen beeld</div>`;

          if (s.owned) {
            const p = seasonProgress(item, s);
            const pi = seasonPriceInfo(item, s);
            return `
              <div class="border-b border-white/10 last:border-0 py-3 first:pt-0">
                <div class="flex gap-3 sm:gap-4">
                  <button type="button" data-episodes="${s.season_number}" class="shrink-0 w-20 sm:w-24 rounded-md overflow-hidden ring-1 ring-white/10 hover:ring-gold/50 bg-[#14141A] block transition" title="Toon afleveringen">
                    ${posterHtml}
                  </button>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                      <button type="button" data-episodes="${s.season_number}" class="text-left min-w-0 group/season">
                        <p class="font-display tracking-wide text-lg text-ink leading-tight truncate group-hover/season:text-gold">${escapeHtml(s.name)}</p>
                        <p class="text-xs text-muted font-mono mt-0.5">${yr ? yr + ' · ' : ''}${s.episode_count ?? '?'} afl. · <span class="text-gold">${escapeHtml(
              seasonOwnedFormats(s).map((f) => fmtLabel[f] || f).join(' + ') || fmtLabel[s.format] || s.format
            )}</span>${
              pi ? ` · <span class="text-teal/90">${escapeHtml(priceRangeText(pi))}</span>` : ''
            }</p>
                      </button>
                      <button type="button" class="text-muted hover:text-red-400 text-xs underline shrink-0" data-remove-season="${s.season_number}" title="Alle exemplaren van dit seizoen weghalen">verwijderen</button>
                    </div>
                    ${s.overview ? `<p class="text-xs text-muted mt-1.5 clamp-2 leading-snug">${escapeHtml(s.overview)}</p>` : ''}
                    ${seasonEditionsHtml(s)}
                    <div class="flex items-center gap-2 mt-2">
                      <div class="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
                        <div class="h-full rounded-full ${p.pct === 100 ? 'bg-teal' : 'bg-gold'}" style="width:${p.pct}%"></div>
                      </div>
                      <span class="font-mono text-[10px] text-muted shrink-0">${p.seen}/${p.total || '?'}</span>
                      <button type="button" data-episodes="${s.season_number}" data-episodes-toggle="${s.season_number}" class="text-gold hover:text-white text-[11px] underline shrink-0">afleveringen ▾</button>
                    </div>
                  </div>
                </div>
                <div data-episodes-for="${s.season_number}" class="hidden mt-3" data-open="0" data-loaded="0"></div>
              </div>
            `;
          }
          // Niet in bezit. FASE 39 — stond hier een wens op de verlanglijst,
          // dan was die volledig onzichtbaar. Nu staat ze er gewoon, met de
          // knop om ze weer weg te halen.
          const wensen = (s.editions || []).filter((e) => e.wishlist);
          return `
            <div class="flex gap-3 sm:gap-4 border-b border-white/10 last:border-0 py-3 first:pt-0 opacity-80">
              <div class="shrink-0 w-20 sm:w-24 rounded-md overflow-hidden ring-1 ring-white/10 bg-[#14141A]">
                ${posterHtml}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-display tracking-wide text-lg text-ink leading-tight truncate">${escapeHtml(s.name)}</p>
                <p class="text-xs text-muted font-mono mt-0.5">${yr ? yr + ' · ' : ''}${s.episode_count ?? '?'} afl. · ${
              wensen.length
                ? '<span class="text-gold">op je verlanglijst</span>'
                : '<span class="text-muted">niet in bezit</span>'
            }</p>
                ${s.overview ? `<p class="text-xs text-muted mt-1.5 clamp-2 leading-snug">${escapeHtml(s.overview)}</p>` : ''}
                ${wensen.length ? seasonEditionsHtml(s) : ''}
                <div class="flex items-center gap-2 mt-2">
                  <select class="add-season-format bg-surface border border-white/10 rounded px-2 py-1 text-xs font-mono" data-season="${s.season_number}">
                    ${fmtOpties('bluray')}
                  </select>
                  <button type="button" class="text-teal hover:text-white text-xs underline" data-add-season="${s.season_number}">in bezit</button>
                  <!-- FASE 37 — een seizoen dat je nog moet kopen kon je nergens
                       vastleggen; alleen 'in bezit' bestond. -->
                  <button type="button" class="text-gold hover:text-white text-xs underline" data-wish-season="${s.season_number}">+ verlanglijst</button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      // Uitklappen naar de afleveringen van een seizoen. Meerdere triggers
      // (cover, titel én de tekstknop) klappen uit; de tekstknop
      // (data-episodes-toggle) is degene waarvan het label ▾/▴ wisselt — zo
      // overschrijven we nooit per ongeluk de cover of de titel.
      seasonsList.querySelectorAll('[data-episodes]').forEach((trigger) => {
        trigger.addEventListener('click', () => {
          const num = Number(trigger.dataset.episodes);
          const season = item.seasons.find((s) => s.season_number === num);
          const box = seasonsList.querySelector(`[data-episodes-for="${num}"]`);
          const label = seasonsList.querySelector(`[data-episodes-toggle="${num}"]`);
          if (season && box) toggleSeasonEpisodes(item, season, box, label);
        });
      });

      // 'Waar ben je gebleven' bovenaan de seizoenen
      const point = lastWatchedPoint(item);
      const resumeEl = els.modal.querySelector('[data-field="resume"]');
      if (resumeEl) {
        const totals = { seen: totalWatchedEpisodes(item), owned: totalOwnedEpisodes(item) };
        if (point && totals.owned) {
          resumeEl.textContent =
            totals.seen >= totals.owned
              ? `Alles gezien — ${totals.seen} afleveringen`
              : `Gebleven bij ${point.season}×${String(point.episode).padStart(2, '0')} · ${totals.seen} van ${totals.owned} gezien`;
          resumeEl.classList.remove('hidden');
        } else {
          resumeEl.classList.add('hidden');
        }
      }

      seasonsList.querySelectorAll('[data-remove-season]').forEach((btn) => {
        btn.addEventListener('click', () => handleRemoveSeason(item, Number(btn.dataset.removeSeason)));
      });
      seasonsList.querySelectorAll('[data-add-season]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const num = Number(btn.dataset.addSeason);
          const sel = seasonsList.querySelector(`.add-season-format[data-season="${num}"]`);
          handleAddSeason(item, num, sel ? sel.value : 'bluray');
        });
      });

      seasonsList.querySelectorAll('[data-wish-season]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const num = Number(btn.dataset.wishSeason);
          const sel = seasonsList.querySelector(`.add-season-format[data-season="${num}"]`);
          handleWishSeason(item, num, sel ? sel.value : 'bluray');
        });
      });

      // Exemplaren per seizoen (FASE 35)
      seasonsList.querySelectorAll('[data-add-season-ed]').forEach((btn) => {
        btn.addEventListener('click', () => handleAddSeasonEdition(item, Number(btn.dataset.addSeasonEd)));
      });
      seasonsList.querySelectorAll('[data-edit-season-ed]').forEach((btn) => {
        btn.addEventListener('click', () =>
          handleEditSeasonEdition(item, Number(btn.dataset.editSeasonEd), btn.dataset.eid)
        );
      });
      seasonsList.querySelectorAll('[data-del-season-ed]').forEach((btn) => {
        btn.addEventListener('click', () =>
          handleDeleteSeasonEdition(item, Number(btn.dataset.delSeasonEd), btn.dataset.eid)
        );
      });
    } else {
      seasonsSection.classList.add('hidden');
      seasonsList.innerHTML = '';
    }

    els.modal.querySelector('[data-delete-full]').onclick = () => handleDeleteTitle(item.id, item.title);

    const addEditionBtn = els.modal.querySelector('[data-add-edition]');
    if (addEditionBtn) addEditionBtn.onclick = () => handleAddEdition(item);

    // Snelle 'bekeken'-toggle (optimistic). Sinds fase 13 wordt er meteen een
    // datum bijgehouden, zodat je later ziet wanneer je iets gezien hebt.
    const watchedBtn = els.modal.querySelector('[data-toggle-watched]');
    if (watchedBtn) {
      watchedBtn.textContent = item.watched ? '✓ Bekeken — zet terug op niet bekeken' : 'Markeer als bekeken';
      watchedBtn.classList.toggle('chip-active', !!item.watched);
      watchedBtn.onclick = () => {
        const previous = { watched: item.watched, log: JSON.parse(JSON.stringify(item.watch_log || [])) };
        item.watched = !item.watched;
        if (item.watched) addWatchEntry(item);
        else item.watch_log = []; // terug op 'niet bekeken' wist ook het logboek
        applyFilters();
        openModal(item.id);
        backgroundSave(
          () => upsertMovieInDrive(item),
          () => {
            item.watched = previous.watched;
            item.watch_log = previous.log;
            if (!els.modal.classList.contains('hidden')) openModal(item.id);
          }
        );
      };
    }

    renderWatchLog(item);
    renderMyRating(item);

    // Bewerken-paneel
    const editPanel = els.modal.querySelector('[data-edit-panel]');
    const editBtn = els.modal.querySelector('[data-edit-open]');
    if (editPanel && editBtn) {
      editPanel.classList.add('hidden');
      editBtn.onclick = () => {
        editPanel.classList.toggle('hidden');
        if (!editPanel.classList.contains('hidden')) fillEditPanel(item);
      };
      els.modal.querySelector('[data-edit-cancel]').onclick = () => editPanel.classList.add('hidden');
      els.modal.querySelector('[data-edit-save]').onclick = () => saveEditPanel(item);
      const refreshBtn = els.modal.querySelector('[data-edit-refresh]');
      if (refreshBtn) refreshBtn.onclick = () => refreshTmdbData(item);
    }

    const flipBtn = els.modal.querySelector('[data-flip-btn]');
    flipBtn.onclick = (e) => {
      e.stopPropagation();
      els.modal.querySelector('.flip-card').classList.toggle('flipped');
    };

    els.modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    // FASE 43 — de focus mee naar binnen nemen. Zonder dit liep Tab door naar
    // de kaarten eronder, die niet meescrollen: je focus verdween uit beeld.
    focusNaarOverlay(els.modal);
  }

  // ---------- Bewerken ----------

  function fillEditPanel(item) {
    const m = els.modal;
    const ed = activeEdition(item) || {};

    // Formaatkeuze opbouwen uit de gedeelde formatenlijst.
    const formatSel = m.querySelector('[data-edit-format]');
    formatSel.innerHTML = MEDIA_FORMATS.map(
      (f) => `<option value="${f.value}">${escapeHtml(f.label)}</option>`
    ).join('');

    // FASE 39 — een waarde die niet in de lijst staat maakt een <select> leeg,
    // en bij opslaan gaat die leegte terug naar het record. Kent de app het
    // type niet, dan zetten we het er eerst bij in plaats van het te wissen.
    const typeSel = m.querySelector('[data-edit-content]');
    const huidigType = item.content_type || 'movie';
    if (!Array.from(typeSel.options).some((o) => o.value === huidigType)) {
      typeSel.add(new Option(huidigType, huidigType));
    }
    typeSel.value = huidigType;
    formatSel.value = ed.format || 'bluray';
    m.querySelector('[data-edit-owned]').value = ed.wishlist ? 'wishlist' : 'owned';
    m.querySelector('[data-edit-watched]').checked = !!item.watched;
    m.querySelector('[data-edit-notes]').value = ed.notes || '';
    // Uitvoeringen (steelbook, limited, extended, director's cut) worden uit
    // de gedeelde lijst opgebouwd, zodat er maar één plek is waar ze staan.
    const variantsBox = m.querySelector('[data-edit-variants]');
    if (variantsBox) {
      variantsBox.innerHTML = EDITION_VARIANTS.map(
        (v) => `
          <label class="!normal-case !text-sm text-ink flex items-center gap-2">
            <input type="checkbox" data-edit-variant="${escapeAttr(v.key)}" class="w-4 h-4"> ${escapeHtml(v.label)}
          </label>`
      ).join('');
      variantsBox.querySelectorAll('[data-edit-variant]').forEach((cb) => {
        cb.checked = !!ed[cb.dataset.editVariant];
      });
    }
    const boxsetInput = m.querySelector('[data-edit-boxset]');
    if (boxsetInput) boxsetInput.value = ed.boxset || '';
    const locationInput = m.querySelector('[data-edit-location]');
    if (locationInput) locationInput.value = ed.location || '';

    // FASE 40 — verzamelaarsvelden, opgebouwd uit de gedeelde lijst.
    const colBox = m.querySelector('[data-edit-collector]');
    if (colBox && typeof collectorVeldenHtml === 'function') {
      colBox.innerHTML = collectorVeldenHtml(ed);
      // Op het kopje tonen hoeveel er al ingevuld is, zodat je niet hoeft open
      // te klappen om te zien of er iets in zit.
      const teller = m.querySelector('[data-edit-collector-count]');
      if (teller) {
        const n = COLLECTOR_FIELDS.filter((v) => ed[v.key] !== '' && ed[v.key] != null).length;
        teller.textContent = n ? `· ${n} ingevuld` : '';
      }
      const doos = m.querySelector('[data-edit-collector-box]');
      // Staat er al iets in, dan meteen open: dan wil je het zien.
      if (doos) doos.open = COLLECTOR_FIELDS.some((v) => ed[v.key] !== '' && ed[v.key] != null);
    }

    // FASE 40 — de toevoegdatum was altijd "vandaag" en nergens aanpasbaar.
    // Bij het invoeren van een bestaande collectie is die datum als
    // sorteersleutel daardoor waardeloos.
    const addedInput = m.querySelector('[data-edit-added]');
    if (addedInput) addedInput.value = (item.date_added || '').slice(0, 10);

    const sagaInput = m.querySelector('[data-edit-saga]');
    if (sagaInput) sagaInput.value = item.saga || '';

    // Suggestielijst vullen met de reeksen die je al gebruikt (FASE 37). Zonder
    // dit typ je "The Young Pope" de tweede keer nét anders en blijven de twee
    // series alsnog los van elkaar staan.
    const sagaLijst = document.getElementById('saga-suggesties');
    if (sagaLijst) {
      const namen = [...new Set(state.all.map((x) => (x.saga || '').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      );
      sagaLijst.innerHTML = namen.map((n) => `<option value="${escapeAttr(n)}"></option>`).join('');
    }

    // Eigen titel (FASE 34). Het interne id van een titel blijft ongewijzigd —
    // daar hangen je hoesfoto's, prijsmetingen en backups aan vast. We wijzigen
    // alleen de naam die je overal ziet.
    const titelInput = m.querySelector('[data-edit-title]');
    const titelHint = m.querySelector('[data-edit-title-hint]');
    const titelReset = m.querySelector('[data-edit-title-reset]');
    if (titelInput) {
      titelInput.value = item.title || '';
      const tmdbNaam = item.tmdb_title || '';
      const afwijkend = item.title_locked && tmdbNaam && tmdbNaam !== item.title;
      if (titelHint) {
        titelHint.textContent = afwijkend
          ? `TMDb noemt deze titel "${tmdbNaam}"`
          : 'Wijzig je dit, dan blijft de TMDb-koppeling gewoon bestaan.';
      }
      if (titelReset) {
        titelReset.classList.toggle('hidden', !afwijkend);
        titelReset.onclick = () => {
          titelInput.value = tmdbNaam;
        };
      }
    }

    // Duidelijk maken welk exemplaar je aan het bewerken bent.
    const which = m.querySelector('[data-edit-which]');
    if (which) {
      which.textContent =
        (item.editions || []).length > 1 ? `je ${formatLabel(ed.format)}-exemplaar` : '';
    }

    m.querySelector('[data-edit-front]').value = '';
    m.querySelector('[data-edit-back]').value = '';
    const remFront = m.querySelector('[data-edit-remove-front]');
    const remBack = m.querySelector('[data-edit-remove-back]');
    remFront.checked = false;
    remBack.checked = false;
    remFront.closest('label').classList.toggle('hidden', !frontCoverRef(item, ed));
    remBack.closest('label').classList.toggle('hidden', !backCoverRef(item, ed));
    const status = m.querySelector('[data-edit-status]');
    status.textContent = '';
    status.className = 'text-sm font-mono';
    setupPosterPicker(item);
  }

  // ---------- Posterkeuze ----------
  // Je kan een andere TMDb-poster kiezen dan de standaard, bv. de artwork die
  // op jouw editie staat. De keuze wordt pas bewaard bij 'Opslaan'.
  let pendingPosterPath = null; // null = onveranderd, '' = terug naar standaard
  // FASE 33 — je eigen hoesfoto als poster. null = onveranderd, '' = niet meer
  // gebruiken, anders het Drive-bestand-id van de voorkantfoto.
  let pendingPosterCoverId = null;

  function setupPosterPicker(item) {
    const m = els.modal;
    const loadBtn = m.querySelector('[data-edit-poster-load]');
    const resetBtn = m.querySelector('[data-edit-poster-reset]');
    const grid = m.querySelector('[data-edit-poster-grid]');
    const statusEl = m.querySelector('[data-edit-poster-status]');
    if (!loadBtn || !grid) return;

    pendingPosterPath = null;
    pendingPosterCoverId = null;
    grid.innerHTML = '';
    grid.classList.add('hidden');
    statusEl.textContent = item.custom_poster_cover_id
      ? 'je eigen hoesfoto wordt als poster gebruikt'
      : item.custom_poster_path
      ? 'eigen poster gekozen'
      : '';
    resetBtn.classList.toggle('hidden', !item.custom_poster_path && !item.custom_poster_cover_id);

    // Knop 'Mijn hoesfoto als poster' alleen tonen als er ook echt een
    // voorkantfoto is; anders is het een dode knop.
    const coverBtn = m.querySelector('[data-edit-poster-cover]');
    const eigenCovers = (item.editions || [])
      .map((ed) => ed.custom_front_cover_id)
      .filter(Boolean);
    if (coverBtn) {
      const bruikbaar = eigenCovers.length > 0;
      coverBtn.classList.toggle('hidden', !bruikbaar);
      coverBtn.textContent =
        item.custom_poster_cover_id ? 'Toch de TMDb-poster gebruiken' : 'Mijn hoesfoto als poster';
      coverBtn.onclick = () => {
        if (item.custom_poster_cover_id && pendingPosterCoverId === null) {
          pendingPosterCoverId = '';
          statusEl.textContent = 'terug naar de TMDb-poster bij opslaan';
          return;
        }
        // De voorkantfoto van het exemplaar dat je nu bekijkt, anders de eerste.
        const ed = typeof activeEdition === 'function' ? activeEdition(item) : null;
        pendingPosterCoverId = (ed && ed.custom_front_cover_id) || eigenCovers[0];
        pendingPosterPath = ''; // eigen hoesfoto en TMDb-poster sluiten elkaar uit
        statusEl.textContent = 'je hoesfoto wordt de poster — klik Opslaan';
        grid.querySelectorAll('[data-poster-option]').forEach((el) => el.classList.remove('ring-2', 'ring-gold'));
      };
    }

    resetBtn.onclick = () => {
      pendingPosterPath = '';
      pendingPosterCoverId = '';
      statusEl.textContent = 'terug naar standaard bij opslaan';
      grid.querySelectorAll('[data-poster-option]').forEach((el) => el.classList.remove('ring-2', 'ring-gold'));
    };

    loadBtn.onclick = async () => {
      const c = typeof getConfig === 'function' ? getConfig() : {};
      if (!c.tmdbKey || typeof tmdbPosters !== 'function') {
        statusEl.textContent = 'TMDb-key ontbreekt';
        return;
      }
      if (!item.tmdb_id) {
        statusEl.textContent = 'geen TMDb-koppeling';
        return;
      }
      loadBtn.disabled = true;
      statusEl.textContent = 'posters ophalen…';
      try {
        const posters = await tmdbPosters(item.tmdb_id, tmdbMediaTypeOf(item), c.tmdbKey);
        if (!posters.length) {
          statusEl.textContent = 'geen alternatieve posters gevonden';
          return;
        }
        grid.classList.remove('hidden');
        // Vaste hoogtes in plaats van aspect-ratio: dat laatste liep op smalle
        // schermen over elkaar heen. Minder kolommen op gsm, zodat elke poster
        // groot genoeg blijft om te herkennen.
        grid.innerHTML = posters
          .map(
            (p) => `
              <button type="button" data-poster-option="${escapeAttr(p.file_path)}"
                class="block w-full h-32 sm:h-36 rounded overflow-hidden bg-bg ring-1 ring-white/10 ${
                  item.custom_poster_path === p.file_path ? 'ring-2 ring-gold' : ''
                }" title="Poster${p.language ? ' (' + escapeAttr(p.language) + ')' : ''}">
                <img src="${escapeAttr('https://image.tmdb.org/t/p/w185' + p.file_path)}" loading="lazy"
                  class="block w-full h-full object-contain bg-black/30" alt="Poster">
              </button>`
          )
          .join('');
        statusEl.textContent = `${posters.length} posters — klik om te kiezen`;

        grid.querySelectorAll('[data-poster-option]').forEach((btn) => {
          btn.addEventListener('click', () => {
            pendingPosterPath = btn.dataset.posterOption;
            pendingPosterCoverId = ''; // een TMDb-poster vervangt de hoesfotokeuze
            grid.querySelectorAll('[data-poster-option]').forEach((el) => el.classList.remove('ring-2', 'ring-gold'));
            btn.classList.add('ring-2', 'ring-gold');
            statusEl.textContent = 'gekozen — klik Opslaan om te bewaren';
          });
        });
      } catch (err) {
        statusEl.textContent = '✗ ' + err.message;
      } finally {
        loadBtn.disabled = false;
      }
    };
  }

  async function saveEditPanel(item) {
    const m = els.modal;
    const saveBtn = m.querySelector('[data-edit-save]');
    const status = m.querySelector('[data-edit-status]');

    // Eerst controleren, dán pas de knop uitschakelen. Stond dit andersom, dan
    // liet een vroegtijdige return de knop permanent grijs achter — de
    // finally-tak verderop werd immers nooit bereikt. Enige uitweg was de
    // pop-up sluiten en opnieuw openen, zonder één woord uitleg.
    const ed = activeEdition(item);
    if (!ed) {
      if (status) {
        status.textContent = 'Geen exemplaar gevonden om te bewerken. Herlaad de pagina en probeer opnieuw.';
        status.className = 'text-sm font-mono text-red-400';
      }
      return;
    }
    saveBtn.disabled = true;

    const previous = {
      content_type: item.content_type,
      watched: item.watched,
      saga: item.saga,
      custom_poster_path: item.custom_poster_path,
      custom_poster_cover_id: item.custom_poster_cover_id,
      title: item.title,
      tmdb_title: item.tmdb_title,
      title_locked: item.title_locked,
      custom_title: item.custom_title,
      editions: JSON.parse(JSON.stringify(item.editions || [])),
      // FASE 40 — de toevoegdatum is aanpasbaar, dus die hoort ook bij het
      // terugdraaien.
      date_added: item.date_added,
      added_at: item.added_at,
    };

    try {
      // Foto's verwerken (dit deel blijft zichtbaar 'bezig': uploads kosten even)
      const frontFile = m.querySelector('[data-edit-front]').files[0];
      const backFile = m.querySelector('[data-edit-back]').files[0];
      // Hoesfoto's horen bij dít exemplaar; de bestandsnaam bevat daarom ook
      // het exemplaar-id, zodat een DVD- en een 4K-doosje elkaar niet
      // overschrijven.
      const coverKey = item.id + '-' + ed.eid;
      if (frontFile) {
        // Eerst verkleinen, dán uploaden — en dat ook zeggen. Bij een grote
        // foto duurt het verkleinen merkbaar lang, en zonder deze melding lijkt
        // de pagina te hangen terwijl ze gewoon aan het werk is (FASE 38).
        status.textContent = `Voorkant-foto verkleinen (${Math.round(frontFile.size / 1024)} kB)…`;
        status.className = 'text-sm font-mono text-muted';
        const voorkantKlein = await resizeImageFile(frontFile, 1200);
        status.textContent = 'Voorkant-foto uploaden…';
        ed.custom_front_cover_id = await driveUploadCoverFile(voorkantKlein, coverKey, 'front');
        ed.custom_front_cover = '';
        if (typeof driveReleaseCoverUrl === 'function') driveReleaseCoverUrl(ed.custom_front_cover_id);
      } else if (m.querySelector('[data-edit-remove-front]').checked) {
        await driveDeleteCoverFile(ed.custom_front_cover_id);
        ed.custom_front_cover_id = '';
        ed.custom_front_cover = '';
      }
      if (backFile) {
        status.textContent = `Achterkant-foto verkleinen (${Math.round(backFile.size / 1024)} kB)…`;
        status.className = 'text-sm font-mono text-muted';
        const achterkantKlein = await resizeImageFile(backFile, 1200);
        status.textContent = 'Achterkant-foto uploaden…';
        ed.custom_back_cover_id = await driveUploadCoverFile(achterkantKlein, coverKey, 'back');
        ed.custom_back_cover = '';
        if (typeof driveReleaseCoverUrl === 'function') driveReleaseCoverUrl(ed.custom_back_cover_id);
      } else if (m.querySelector('[data-edit-remove-back]').checked) {
        await driveDeleteCoverFile(ed.custom_back_cover_id);
        ed.custom_back_cover_id = '';
        ed.custom_back_cover = '';
      }

      // Velden: meteen doorvoeren in de interface, opslaan op de achtergrond.
      // Filmniveau:
      item.content_type = m.querySelector('[data-edit-content]').value;
      item.watched = m.querySelector('[data-edit-watched]').checked;
      // Eigen titel (FASE 34)
      const titelInput = m.querySelector('[data-edit-title]');
      if (titelInput) {
        const nieuweTitel = titelInput.value.trim();
        // De TMDb-naam onthouden vóór de eerste wijziging, anders kan je nooit
        // meer terug en verlies je hem ook als zoekterm.
        if (!item.tmdb_title) item.tmdb_title = item.title || '';
        if (!nieuweTitel || nieuweTitel === item.tmdb_title) {
          // Leeggemaakt of weer gelijk aan TMDb: geen eigen titel meer.
          item.title = item.tmdb_title || item.title;
          item.title_locked = false;
          delete item.custom_title;
        } else if (nieuweTitel !== item.title) {
          item.title = nieuweTitel;
          item.custom_title = nieuweTitel;
          item.title_locked = true;
        }
      }

      const sagaInput = m.querySelector('[data-edit-saga]');
      if (sagaInput) {
        item.saga = sagaInput.value.trim();
        // Wis je de reeksnaam, wis dan ook de koppeling naar de TMDb-reeks.
        // Anders bleef het reeksblok in de detailweergave actief op een lege
        // naam, en dat trok elke titel zonder reeks mee in "ook door jou bij
        // deze reeks gezet".
        if (!item.saga) item.saga_id = null;
      }

      // Exemplaarniveau:
      ed.format = m.querySelector('[data-edit-format]').value;
      ed.wishlist = m.querySelector('[data-edit-owned]').value === 'wishlist';
      ed.notes = m.querySelector('[data-edit-notes]').value.trim();
      m.querySelectorAll('[data-edit-variant]').forEach((cb) => {
        ed[cb.dataset.editVariant] = cb.checked;
      });
      const boxsetInput = m.querySelector('[data-edit-boxset]');
      if (boxsetInput) ed.boxset = boxsetInput.value.trim();
      const locationInput = m.querySelector('[data-edit-location]');
      if (locationInput) ed.location = locationInput.value.trim();

      // FASE 40 — verzamelaarsvelden.
      const colBox = m.querySelector('[data-edit-collector]');
      if (colBox && typeof collectorLeesVelden === 'function') {
        Object.assign(ed, collectorLeesVelden(colBox));
      }

      // FASE 40 — aanpasbare toevoegdatum. `added_at` bepaalt de volgorde
      // binnen één dag; die zetten we mee zodat een handmatig gekozen datum
      // ook echt op zijn plek in "Onlangs toegevoegd" komt te staan.
      const addedInput = m.querySelector('[data-edit-added]');
      if (addedInput) {
        const nieuw = addedInput.value.trim();
        if (nieuw && nieuw !== (item.date_added || '').slice(0, 10)) {
          item.date_added = nieuw;
          item.added_at = nieuw + 'T12:00:00.000Z';
        }
      }

      syncLegacyFieldsFromEditions(item);
      // De doorzoekbare eigen tekst is nu verouderd (FASE 40).
      vergeetEigenTekst(item);
      // Posterkeuze: null = niets veranderd, '' = terug naar de standaardposter.
      if (pendingPosterPath !== null) item.custom_poster_path = pendingPosterPath;
      if (pendingPosterCoverId !== null) item.custom_poster_cover_id = pendingPosterCoverId;

      buildFacetChips(state.all);
      applyFilters();
      openModal(item.id);

      backgroundSave(
        () => upsertMovieInDrive(item),
        () => {
          Object.assign(item, previous);
          syncLegacyFieldsFromEditions(item);
          vergeetEigenTekst(item);
          if (!els.modal.classList.contains('hidden')) openModal(item.id);
        },
        // FASE 41 — een bewerking is nu terug te draaien. De momentopname
        // bestond al voor het geval de opslag mislukt; hier krijgt ze een knop.
        // Hoesfoto's vallen erbuiten: die zijn op dit punt al geüpload.
        () =>
          meldMetOngedaan('Wijzigingen opgeslagen', () => {
            Object.assign(item, JSON.parse(JSON.stringify(previous)));
            syncLegacyFieldsFromEditions(item);
            vergeetEigenTekst(item);
            buildFacetChips(state.all);
            applyFilters();
            if (!els.modal.classList.contains('hidden')) openModal(item.id);
            backgroundSave(() => upsertMovieInDrive(item));
          })
      );
    } catch (err) {
      Object.assign(item, previous);
      syncLegacyFieldsFromEditions(item);
      status.textContent = '✗ ' + err.message;
      status.className = 'text-sm font-mono text-red-400';
    } finally {
      saveBtn.disabled = false;
    }
  }

  // Haalt de nieuwste TMDb-gegevens op (incl. officiële reeks) en werkt de
  // titel bij — persoonlijke velden (status, notities, foto's, seizoensbezit)
  // blijven onaangeroerd.
  async function refreshTmdbData(item) {
    const m = els.modal;
    const status = m.querySelector('[data-edit-status]');
    if (typeof tmdbDetails !== 'function' || typeof getConfig !== 'function') return;
    const c = getConfig();
    if (!c.tmdbKey) {
      status.textContent = 'Vul eerst je TMDb-key in via Instellingen (Beheer).';
      status.className = 'text-sm font-mono text-gold';
      return;
    }
    if (!item.tmdb_id) {
      status.textContent = 'Geen TMDb-koppeling voor deze titel.';
      status.className = 'text-sm font-mono text-gold';
      return;
    }
    status.textContent = 'TMDb-gegevens ophalen...';
    status.className = 'text-sm font-mono text-muted';
    try {
      // Niet uit content_type afleiden: 'animation' zou dan als 'movie' worden
      // opgevraagd, en een animatieserie kreeg zo de gegevens van een
      // wildvreemde film. tmdbMediaTypeOf kijkt naar het bewaarde mediatype.
      const mediaType = tmdbMediaTypeOf(item);
      const fresh = await tmdbDetails(item.tmdb_id, mediaType, c.tmdbKey);

      // Samenvoegen gebeurt centraal in admin.js: TMDb-velden worden ververst,
      // persoonlijke keuzes (formaat, notities, foto's, seizoensbezit,
      // posterkeuze) blijven staan.
      applyTmdbFields(item, fresh);

      buildFacetChips(state.all);
      applyFilters();
      openModal(item.id);
      const panel = m.querySelector('[data-edit-panel]');
      panel.classList.remove('hidden');
      fillEditPanel(item);
      m.querySelector('[data-edit-status]').textContent = '✓ Gegevens ververst — klik Opslaan om te bewaren.';
      m.querySelector('[data-edit-status]').className = 'text-sm font-mono text-teal';
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.className = 'text-sm font-mono text-red-400';
    }
  }

  function closeModal() {
    currentModalId = null;
    els.modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    focusTerug();
  }

  // ---------- Events ----------

  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });
  /**
   * Escape sluit één laag: de bovenste die openstaat (FASE 30).
   *
   * De lijst staat in dezelfde volgorde als de lagen boven elkaar liggen. Twee
   * dingen die eerder misgingen:
   *  - de modal "+ Titel toevoegen" (die in index.html zit, niet hier) stond
   *    níet in de keten. Escape deed daar niets, terwijl hij op een gsm het
   *    hele scherm vult;
   *  - de laatste stap was altijd closeModal(), ook als er niets openstond.
   *    Nu geeft de keten door dat er niets te sluiten viel, zodat Escape in een
   *    open zoekveld gewoon doet wat de browser normaal doet.
   */
  /* ---------- Toetsenbord en focus (FASE 43) ----------
   *
   * Twee dingen die er nooit van gekomen zijn.
   *
   * 1. Vier soorten aanklikbare regels in de detailschermen — delen van een
   *    reeks, exemplarenrijen, namen in de credits, gastrollen — reageerden
   *    niet op Enter. Je tabde erop en er gebeurde niets.
   * 2. Geen enkel detailscherm hield de focus vast. Tab liep door naar de
   *    kaarten eronder, die niet meescrollen: je focus verdween letterlijk uit
   *    beeld. En bij sluiten kwam hij niet terug waar je was.
   */

  // Enter en spatie op alles wat zich als knop aandient binnen een overlay.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (!el || el.getAttribute('role') !== 'button') return;
    // Het raster heeft zijn eigen afhandeling; die niet dubbel laten vuren.
    if (els.grid && els.grid.contains(el)) return;
    if (!el.closest('#detail-modal, #person-modal, #episode-modal, #group-modal')) return;
    e.preventDefault();
    el.click();
  });

  /** Alles waar je met Tab naartoe kan binnen een element. */
  function focusbareElementen(root) {
    return [...root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  // Waar de focus stond vóór er een overlay openging.
  let focusVoorOverlay = null;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const laag = document.querySelector(
      '#detail-modal:not(.hidden), #person-modal:not(.hidden), #episode-modal:not(.hidden), ' +
        '#group-modal:not(.hidden), #bulk-edit-modal:not(.hidden), #add-title-modal:not(.hidden)'
    );
    if (!laag) return;
    const kandidaten = focusbareElementen(laag);
    if (!kandidaten.length) return;
    const eerste = kandidaten[0];
    const laatste = kandidaten[kandidaten.length - 1];

    // Staat de focus buiten de laag (bv. nog op een kaart eronder), dan
    // meteen naar binnen halen.
    if (!laag.contains(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? laatste : eerste).focus();
      return;
    }
    if (!e.shiftKey && document.activeElement === laatste) {
      e.preventDefault();
      eerste.focus();
    } else if (e.shiftKey && document.activeElement === eerste) {
      e.preventDefault();
      laatste.focus();
    }
  });

  /** Onthoudt waar je was en zet de focus in de zojuist geopende laag. */
  function focusNaarOverlay(laag) {
    if (!laag) return;
    if (!laag.contains(document.activeElement)) focusVoorOverlay = document.activeElement;
    const kandidaten = focusbareElementen(laag);
    const doel = laag.querySelector('[data-modal-close], #modal-close') || kandidaten[0];
    if (doel && typeof doel.focus === 'function') doel.focus({ preventScroll: true });
  }

  /** Zet de focus terug waar hij was vóór de overlay openging. */
  function focusTerug() {
    const el = focusVoorOverlay;
    focusVoorOverlay = null;
    if (el && document.contains(el) && typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
    }
  }

  function overlayLagen() {
    const zichtbaar = (el) => el && !el.classList.contains('hidden');
    const anderePagina = (id) => {
      const el = document.getElementById(id);
      return zichtbaar(el) ? el : null;
    };
    return [
      { open: () => zichtbaar(els.lightbox), sluit: closeLightbox },
      { open: () => zichtbaar(els.bulkEditModal), sluit: closeBulkEdit },
      { open: () => zichtbaar(els.episodeModal), sluit: closeEpisodeModal },
      { open: () => !!anderePagina('add-title-modal'), sluit: () => window.__closeAddTitleModal && window.__closeAddTitleModal() },
      { open: () => zichtbaar(els.pickModal), sluit: closePickModal },
      { open: () => zichtbaar(els.dupesModal), sluit: closeDupesModal },
      { open: () => zichtbaar(els.personModal), sluit: closePersonModal },
      { open: () => zichtbaar(els.groupModal), sluit: closeGroupModal },
      { open: () => zichtbaar(els.modal), sluit: closeModal },
      { open: () => els.filterPanel && els.filterPanel.classList.contains('filter-open'), sluit: () => setFilterPanel(false) },
      { open: () => state.selectMode, sluit: () => setSelectMode(false) },
    ];
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const laag = overlayLagen().find((l) => l.open());
    if (!laag) return;
    e.preventDefault();
    laag.sluit();
  });

  // Debounce: op een grote collectie is een volledige her-render per toetsaanslag
  // merkbaar traag op gsm. We wachten kort tot het typen even stilvalt.
  let searchDebounce = null;
  els.search.addEventListener('input', (e) => {
    state.search = e.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyFilters, 150);
  });

  els.sort.addEventListener('change', (e) => {
    state.sort = e.target.value;
    applyFilters();
  });

  // De formaatchips worden dynamisch opgebouwd in buildFormatChips().

  els.typeChips.querySelectorAll('[data-type]').forEach((chip) => {
    chip.addEventListener('click', () => {
      toggleSetValue(state.activeTypes, chip.dataset.type);
      chip.classList.toggle('chip-active');
      applyFilters();
    });
  });

  if (els.statusChips) {
    els.statusChips.querySelectorAll('[data-status]').forEach((chip) => {
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeStatus, chip.dataset.status);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
    });
  }

  if (els.sagaChips) {
    els.sagaChips.querySelectorAll('[data-saga-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeSaga, chip.dataset.sagaFilter);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
    });
  }

  if (els.watchedChips) {
    els.watchedChips.querySelectorAll('[data-watched]').forEach((chip) => {
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeWatched, chip.dataset.watched);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
    });
  }

  // FASE 41 — de verlanglijst, waar je hem ziet.
  if (els.wishlistToggle) {
    els.wishlistToggle.addEventListener('click', wisselVerlanglijst);
  }

  // FASE 40 — uitgeleend of in je kast.
  if (els.loanedChips) {
    els.loanedChips.querySelectorAll('[data-loaned]').forEach((chip) => {
      chip.addEventListener('click', () => {
        toggleSetValue(state.activeLoaned, chip.dataset.loaned);
        chip.classList.toggle('chip-active');
        applyFilters();
      });
    });
  }

  if (els.viewChips) {
    els.viewChips.querySelectorAll('[data-view]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prev = state.view;
        state.view = chip.dataset.view;
        // Wissel je vanuit een andere weergave naar de plank, laat die dan
        // meespringen naar de titel die je op dat moment in beeld had.
        if (state.view === 'shelf' && prev !== 'shelf') captureShelfAnchor();
        // Verlaat je de plank, onthoud dan de gecentreerde titel zodat het
        // raster daarop uitkomt in plaats van bovenaan te herstarten.
        if (prev === 'shelf' && state.view !== 'shelf') {
          const u = shelfUnits[shelfActive];
          gridAnchor = u
            ? u.type === 'group'
              ? { id: null, group: u.saga }
              : { id: u.item.id, group: null }
            : null;
        }
        try {
          localStorage.setItem(VIEW_STORAGE_KEY, state.view);
        } catch {
          // Voorkeur niet kunnen bewaren is niet erg; de weergave werkt gewoon.
        }
        state.visibleCount = pageSizeForView(state.view);
        render();
      });
    });
    applyViewClasses();
  }

  // Plank-navigatie: pijlknoppen, pijltjestoetsen en herberekenen bij resize.
  if (els.shelfStage) {
    const prev = els.shelfStage.querySelector('[data-shelf-prev]');
    const next = els.shelfStage.querySelector('[data-shelf-next]');
    if (prev) prev.addEventListener('click', () => shelfStep(-1));
    if (next) next.addEventListener('click', () => shelfStep(1));
    document.addEventListener('keydown', (e) => {
      if (state.view !== 'shelf') return;
      // Niet kapen terwijl je in een invoerveld of een open pop-up zit.
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const anyModalOpen = [els.modal, els.personModal, els.episodeModal, els.pickModal, els.dupesModal]
        .some((m) => m && !m.classList.contains('hidden'));
      if (anyModalOpen) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); shelfStep(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); shelfStep(1); }
    });

    // Veeg-bediening op gsm: een cover-flow hoort te swipen. Verticaal scrollen
    // blijft werken (touchstart is passief); een duidelijke horizontale veeg
    // stapt door en onderdrukt de tik-selectie die er anders op zou volgen.
    let shelfTouchX = null, shelfTouchY = null;
    els.shelfStage.addEventListener('touchstart', (e) => {
      if (state.view !== 'shelf' || e.touches.length !== 1) { shelfTouchX = null; return; }
      shelfTouchX = e.touches[0].clientX;
      shelfTouchY = e.touches[0].clientY;
    }, { passive: true });
    els.shelfStage.addEventListener('touchend', (e) => {
      if (shelfTouchX == null || state.view !== 'shelf') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - shelfTouchX;
      const dy = t.clientY - shelfTouchY;
      shelfTouchX = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        e.preventDefault();
        shelfStep(dx < 0 ? 1 : -1);
      }
    }, { passive: false });

    let shelfResizeTimer = null;
    window.addEventListener('resize', () => {
      if (state.view !== 'shelf') return;
      clearTimeout(shelfResizeTimer);
      shelfResizeTimer = setTimeout(updateShelf, 120);
    });
  }

  if (els.groupToggle) {
    els.groupToggle.addEventListener('click', () => {
      state.groupSagas = !state.groupSagas;
      els.groupToggle.classList.toggle('chip-active', state.groupSagas);
      applyFilters();
    });
  }

  // ---------- Selectiemodus ----------

  if (els.selectToggle) {
    els.selectToggle.addEventListener('click', () => setSelectMode(!state.selectMode));
  }
  if (els.selectClose) els.selectClose.addEventListener('click', () => setSelectMode(false));
  if (els.selectAll) els.selectAll.addEventListener('click', selectAllVisible);
  if (els.selectNone) {
    els.selectNone.addEventListener('click', () => {
      state.selected.clear();
      render();
      updateSelectBar();
    });
  }
  if (els.selectDelete) els.selectDelete.addEventListener('click', handleBulkDelete);

  // Massabewerking (FASE 32)
  if (els.selectEdit) els.selectEdit.addEventListener('click', openBulkEdit);
  if (els.bulkEditModal) {
    const sluit = ['bulk-edit-close', 'bulk-edit-cancel'];
    sluit.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', closeBulkEdit);
    });
    els.bulkEditModal.addEventListener('click', (e) => {
      if (e.target === els.bulkEditModal) closeBulkEdit();
    });
    const toepassen = document.getElementById('bulk-edit-apply');
    if (toepassen) toepassen.addEventListener('click', pasBulkEditToe);
    ['bulk-format-from', 'bulk-format-to'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', bulkFormaatHint);
    });
  }


  els.loadMore.addEventListener('click', appendMore);
}
