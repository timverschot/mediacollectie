/**
 * Handmatig toevoegen — voor uitgaves die nergens bestaan (FASE 36)
 * =================================================================
 *
 * Alles in deze app hangt aan TMDb: je zoekt een titel op, en die levert de
 * poster, het jaar, de cast en een uniek nummer. Voor 99% van je collectie
 * werkt dat. Maar er bestaan schijven die in géén enkele databank staan — een
 * special die bij een serie werd uitgebracht, een lokale uitgave, een schijf
 * uit een boxset die nergens apart geregistreerd is. Die kon je tot nu toe
 * simpelweg niet vastleggen.
 *
 * Zo'n record verschilt op drie punten van een gewone titel:
 *
 * 1. Geen `tmdb_id`. De verversing in Beheer slaat titels zonder koppeling al
 *    over, dus jouw handmatige gegevens worden nooit overschreven.
 * 2. Een eigen `id` met een `handmatig-`-voorvoegsel. Zo botst hij nooit met
 *    een echte titel die later tóch in TMDb blijkt te staan.
 * 3. Een `soort` (special, aflevering, …) naast het gewone content_type, want
 *    "special" is geen filmtype maar wél iets wat je wil terugvinden.
 *
 * Koppelen aan een serie of reeks gebeurt via het bestaande `saga`-veld. Dat
 * is met opzet: groeperen, zoeken en het reeksfilter werken daar al op, dus
 * een handmatige special valt automatisch op zijn plek zonder dat daar ook
 * maar iets voor aangepast hoeft te worden.
 */

/** Soorten die je handmatig kan vastleggen. */
const MANUAL_KINDS = [
  { key: 'special', label: 'Special', content_type: 'special' },
  { key: 'movie', label: 'Film', content_type: 'movie' },
  { key: 'tv', label: 'Serie', content_type: 'tv' },
  { key: 'season', label: 'Seizoen', content_type: 'tv' },
  { key: 'episode', label: 'Aflevering', content_type: 'special' },
  { key: 'other', label: 'Iets anders', content_type: 'special' },
];

function manualEsc(s) {
  return escHtml(s);
}

/** Maakt een id dat gegarandeerd niet botst met een TMDb-titel. */
function manualId(titel, jaar, bestaandeIds) {
  const basis =
    'handmatig-' +
    (typeof slugify === 'function'
      ? slugify(titel, jaar)
      : String(titel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  let id = basis;
  let n = 2;
  while (bestaandeIds.has(id)) id = basis + '-' + n++;
  return id;
}

/**
 * Toont het formulier. Geeft het nieuwe record terug, of null bij annuleren.
 * @param movies  je huidige collectie (voor de koppelingslijst en unieke id's)
 */
function manualEntryDialog(movies) {
  return new Promise((resolve) => {
    // Alles waaraan je kan koppelen: bestaande reeksnamen én series/titels.
    const reeksen = [...new Set(movies.map((m) => (m.saga || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
    const titels = movies
      .slice()
      .sort((a, b) => String(a.title).localeCompare(String(b.title)))
      .map((m) => ({ id: m.id, title: m.title, year: m.release_year || '', saga: (m.saga || '').trim() }));

    const laag = document.createElement('div');
    laag.className = 'fixed inset-0 z-[98] flex items-center justify-center p-4 overflow-y-auto';
    laag.style.background = 'rgba(0,0,0,.8)';

    const paneel = document.createElement('div');
    paneel.className = 'bg-surface rounded-xl w-full max-w-lg shadow-2xl ring-1 ring-white/10 p-5 sm:p-6 my-auto';
    paneel.style.paddingBottom = 'calc(1.25rem + env(safe-area-inset-bottom))';

    const formaten =
      typeof MEDIA_FORMATS !== 'undefined'
        ? MEDIA_FORMATS.map((f) => `<option value="${manualEsc(f.value)}">${manualEsc(f.label)}</option>`).join('')
        : '<option value="dvd">DVD</option>';
    const soorten = MANUAL_KINDS.map(
      (k) => `<option value="${manualEsc(k.key)}">${manualEsc(k.label)}</option>`
    ).join('');
    const uitvoeringen =
      typeof EDITION_VARIANTS !== 'undefined'
        ? EDITION_VARIANTS.map(
            (v) => `
              <label class="flex items-center gap-1.5 text-xs">
                <input type="checkbox" data-v="${manualEsc(v.key)}" class="w-4 h-4"> ${manualEsc(v.label)}
              </label>`
          ).join('')
        : '';

    paneel.innerHTML = `
      <h2 class="font-display text-2xl tracking-wide mb-1">Handmatig toevoegen</h2>
      <p class="text-xs text-muted mb-5">
        Voor schijven die niet in TMDb of IMDb staan. Deze titel krijgt geen koppeling,
        dus een verversing van je collectie laat hem ongemoeid.
      </p>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Soort</label>
            <select data-f="kind" class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink">${soorten}</select>
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Jaar</label>
            <input type="text" data-f="year" inputmode="numeric" placeholder="Bv. 1998"
              class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
          </div>
        </div>

        <div>
          <label class="block text-xs font-mono text-muted uppercase mb-1">Titel *</label>
          <input type="text" data-f="title" placeholder="Zoals hij op het doosje staat"
            class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
        </div>

        <div>
          <label class="block text-xs font-mono text-muted uppercase mb-1">Hoort bij</label>
          <select data-f="parent" class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink">
            <option value="">— los, hoort nergens bij —</option>
            ${reeksen.length ? `<optgroup label="Bestaande reeksen">${reeksen
              .map((r) => `<option value="saga:${manualEsc(r)}">${manualEsc(r)}</option>`)
              .join('')}</optgroup>` : ''}
            <optgroup label="Bij een titel uit je collectie">
              ${titels
                .map(
                  (t) =>
                    `<option value="titel:${manualEsc(t.id)}">${manualEsc(t.title)}${t.year ? ' (' + t.year + ')' : ''}</option>`
                )
                .join('')}
            </optgroup>
          </select>
          <p data-f="parent-hint" class="text-xs font-mono text-muted mt-1">
            Kies je een titel die nog geen reeks heeft, dan wordt daar een reeks voor aangemaakt.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Formaat</label>
            <select data-f="format" class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink">${formaten}</select>
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Status</label>
            <select data-f="status" class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink">
              <option value="owned">In bezit</option>
              <option value="wishlist">Op verlanglijst</option>
            </select>
          </div>
        </div>

        ${uitvoeringen ? `<div>
          <label class="block text-xs font-mono text-muted uppercase mb-1">Uitvoering</label>
          <div class="flex flex-wrap gap-3">${uitvoeringen}</div>
        </div>` : ''}

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Boxset</label>
            <input type="text" data-f="boxset" placeholder="Leeg bij een losse uitgave"
              class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase mb-1">Locatie</label>
            <input type="text" data-f="location" placeholder="Bv. Kast woonkamer"
              class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
          </div>
        </div>

        <div>
          <label class="block text-xs font-mono text-muted uppercase mb-1">Opmerking</label>
          <input type="text" data-f="notes" placeholder="Bv. bonusschijf uit de boxset"
            class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted">
        </div>

        <div>
          <label class="block text-xs font-mono text-muted uppercase mb-1">Beschrijving</label>
          <textarea data-f="overview" rows="2" placeholder="Optioneel — wat staat erop?"
            class="w-full bg-bg border border-white/10 rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted"></textarea>
        </div>
      </div>

      <p data-f="status-line" class="text-sm font-mono mt-4"></p>

      <div class="flex gap-2 justify-end mt-5">
        <button type="button" data-annuleer class="chip">Annuleren</button>
        <button type="button" data-bewaar class="btn btn-primary">Toevoegen</button>
      </div>`;

    laag.appendChild(paneel);

    const veld = (naam) => paneel.querySelector(`[data-f="${naam}"]`);
    const statusLijn = veld('status-line');

    // Bij een seizoen of aflevering is koppelen aan een serie eigenlijk altijd
    // de bedoeling; dat zeggen we erbij in plaats van het af te dwingen.
    veld('kind').addEventListener('change', () => {
      const k = veld('kind').value;
      const hint = veld('parent-hint');
      hint.textContent =
        k === 'season' || k === 'episode'
          ? 'Kies hier de serie waar dit bij hoort, dan staat het er straks automatisch bij.'
          : 'Kies je een titel die nog geen reeks heeft, dan wordt daar een reeks voor aangemaakt.';
    });

    const klaar = (waarde) => {
      document.removeEventListener('keydown', opToets);
      laag.remove();
      resolve(waarde);
    };
    const opToets = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); klaar(null); }
    };

    paneel.querySelector('[data-annuleer]').addEventListener('click', () => klaar(null));
    laag.addEventListener('click', (e) => { if (e.target === laag) klaar(null); });
    document.addEventListener('keydown', opToets);

    paneel.querySelector('[data-bewaar]').addEventListener('click', () => {
      const titel = veld('title').value.trim();
      if (!titel) {
        statusLijn.textContent = 'Een titel is het enige wat echt nodig is.';
        statusLijn.className = 'text-sm font-mono mt-4 text-gold';
        veld('title').focus();
        return;
      }
      const jaarRuw = veld('year').value.trim();
      const jaar = /^\d{4}$/.test(jaarRuw) ? Number(jaarRuw) : null;
      if (jaarRuw && !jaar) {
        statusLijn.textContent = 'Een jaartal bestaat uit vier cijfers, of laat het leeg.';
        statusLijn.className = 'text-sm font-mono mt-4 text-gold';
        return;
      }

      const soort = MANUAL_KINDS.find((k) => k.key === veld('kind').value) || MANUAL_KINDS[0];
      const koppeling = veld('parent').value;
      const varianten = {};
      paneel.querySelectorAll('[data-v]').forEach((cb) => { varianten[cb.dataset.v] = cb.checked; });

      klaar({
        titel,
        jaar,
        soort,
        koppeling,
        format: veld('format').value,
        wishlist: veld('status').value === 'wishlist',
        boxset: veld('boxset').value.trim(),
        location: veld('location').value.trim(),
        notes: veld('notes').value.trim(),
        overview: veld('overview').value.trim(),
        varianten,
      });
    });

    document.body.appendChild(laag);
    veld('title').focus();
  });
}

/**
 * Bouwt het collectierecord uit wat je invulde.
 *
 * Geeft `{ entry, ouder }` terug: `ouder` is de titel waarvan de reeksnaam
 * aangevuld moest worden (of null). Die moet de aanroeper óók wegschrijven —
 * anders staat de special in een reeks die aan de andere kant niet bestaat.
 */
function manualBuildEntry(gegevens, movies) {
  const bestaandeIds = new Set(movies.map((m) => m.id));
  let saga = '';
  let ouder = null;
  let parentId = '';

  if (gegevens.koppeling.startsWith('saga:')) {
    saga = gegevens.koppeling.slice(5);
  } else if (gegevens.koppeling.startsWith('titel:')) {
    parentId = gegevens.koppeling.slice(6);
    const p = movies.find((m) => m.id === parentId);
    if (p) {
      if ((p.saga || '').trim()) {
        saga = p.saga.trim();
      } else {
        // De ouder heeft nog geen reeks. We maken er één op zijn eigen naam,
        // want dát is het haakje waar groeperen, zoeken en het reeksfilter op
        // werken. Zonder deze stap zou de special nergens bij komen te staan.
        saga = p.title;
        p.saga = saga;
        ouder = p;
      }
    }
  }

  const nu = new Date();
  const entry = {
    id: manualId(gegevens.titel, gegevens.jaar, bestaandeIds),
    manual: true,
    soort: gegevens.soort.key,
    content_type: gegevens.soort.content_type,
    title: gegevens.titel,
    release_year: gegevens.jaar,
    overview: gegevens.overview,
    saga,
    saga_id: null,
    parent_id: parentId || null,
    tmdb_id: null,
    poster_path: '',
    genres: [],
    cast: [],
    watched: false,
    date_added: nu.toISOString().slice(0, 10),
    added_at: nu.toISOString(),
    editions: [
      {
        eid: 'e1',
        format: gegevens.format,
        notes: gegevens.notes,
        boxset: gegevens.boxset,
        location: gegevens.location,
        wishlist: !!gegevens.wishlist,
        ...gegevens.varianten,
        date_added: nu.toISOString().slice(0, 10),
        custom_front_cover_id: '',
        custom_back_cover_id: '',
        custom_front_cover: '',
        custom_back_cover: '',
      },
    ],
    seasons: [],
  };

  if (typeof normalizeMovieEntry === 'function') normalizeMovieEntry(entry);
  return { entry, ouder };
}
