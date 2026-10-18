/*
 * ui-logbook.js: the waterproof field logbook and the in-dive slate.
 *
 *   Species list  The 50 species from the design vault (Logbook Species List.md) as a fallback catalog.
 *                 When creatures.js (agent B) defines TU.creatures.species, its fields win.
 *   Sketches      a small pencil silhouette per body type (fish, eel, crustacean, jelly, fungus ...),
 *                 drawn as SVG. Unknown species show as a dark silhouette until you log them.
 *   Camp book     K.logbook.renderBook(el): paper notebook with zone tabs, a flora section, and a card per
 *                 species (name, zone, best size, times logged, shiny badge, bounty).
 *   Dive slate    press J during a dive: what you logged this dive, sizes measured, finds, waypoints.
 *
 * Owner: agent D. Part of the ui system (see ui.js, K.part).
 */
(function () {
  'use strict';
  var TU = window.TU, K = TU.uiKit, U = TU.util, fmtTime = U.fmtTime, $ = TU.$;
  if (!K) return;

  // [name, type, zone 0..4, rarity, min size m, max size m, glows]
  var RAW = [
    ['Stalag Moss', 'Moss', 0, 'common', 0.05, 0.4], ['Maidenhair Spleenwort', 'Fern', 0, 'common', 0.05, 0.2], ['Green Rock Film', 'Algae', 0, 'common', 0.1, 2],
    ['Goblin\'s Gold', 'Moss', 0, 'uncommon', 0.02, 0.1, 1], ['Root Curtain', 'Plant', 0, 'common', 0.5, 6], ['Cenote Molly', 'Fish', 0, 'common', 0.04, 0.09],
    ['Silver Tetra', 'Fish', 0, 'common', 0.06, 0.12], ['Entrance Crayfish', 'Crustacean', 0, 'common', 0.06, 0.12], ['Cave Cricket', 'Insect', 0, 'common', 0.015, 0.04],
    ['Roost Bats', 'Mammal', 0, 'uncommon', 0.2, 0.35],
    ['Starlight Glowworm', 'Insect larva', 1, 'common', 0.01, 0.04, 1], ['Foxfire Wood', 'Fungus', 1, 'common', 0.1, 0.8, 1], ['Bitter Oyster', 'Fungus', 1, 'common', 0.01, 0.03, 1],
    ['Ghost Cap', 'Fungus', 1, 'uncommon', 0.05, 0.3], ['Blind Cavefish', 'Fish', 1, 'common', 0.06, 0.12], ['Glass Shrimp', 'Crustacean', 1, 'common', 0.01, 0.03],
    ['Groundwater Scud', 'Crustacean', 1, 'common', 0.005, 0.03], ['Elder Crayfish', 'Crustacean', 1, 'uncommon', 0.05, 0.09], ['Ghost Salamander', 'Amphibian', 1, 'uncommon', 0.08, 0.14],
    ['Blind Swamp Eel', 'Fish', 1, 'rare', 0.15, 0.35],
    ['Olm', 'Amphibian', 2, 'rare', 0.2, 0.4], ['Remipede', 'Crustacean', 2, 'uncommon', 0.01, 0.045], ['Cave Brotula', 'Fish', 2, 'uncommon', 0.08, 0.15],
    ['Ghost Fire Fungus', 'Fungus', 2, 'uncommon', 0.01, 0.03, 1], ['Sulfur Bloom Mat', 'Bacteria', 2, 'common', 0.2, 5], ['Sea Firefly', 'Crustacean', 2, 'uncommon', 0.001, 0.003, 1],
    ['Giant Isopod', 'Crustacean', 2, 'uncommon', 0.2, 0.5], ['Volt Eel', 'Fish', 2, 'rare', 1, 2.5], ['Cave Snail Colony', 'Mollusk', 2, 'common', 0.001, 0.005],
    ['Siltbloom Puffer', 'Fish', 2, 'uncommon', 0.1, 0.25],
    ['Snottites', 'Bacteria', 3, 'uncommon', 0.01, 0.1], ['Halocline Veil', 'Bacteria cloud', 3, 'rare', 1, 8], ['Blind Water Scorpion', 'Insect', 3, 'rare', 0.015, 0.025],
    ['Lanternjaw', 'Fish', 3, 'rare', 0.5, 1.5, 1], ['Slimewarden', 'Fish', 3, 'uncommon', 0.5, 1.2], ['Halo Jelly', 'Jellyfish', 3, 'uncommon', 0.05, 0.3, 1],
    ['Grout Crab', 'Crustacean', 3, 'uncommon', 0.15, 0.4], ['Rope Leech', 'Worm', 3, 'common', 0.05, 0.2], ['Glimmer Moss', 'Moss', 3, 'uncommon', 0.05, 0.5, 1],
    ['Bellows Fish', 'Fish', 3, 'uncommon', 0.2, 0.6],
    ['Deep Lobefin', 'Fish', 4, 'rare', 1, 2], ['Platejaw', 'Fish', 4, 'very_rare', 2, 5], ['Cathedral Isopod', 'Crustacean', 4, 'rare', 1, 3],
    ['Starfall Swarm', 'Crustacean', 4, 'rare', 1, 5, 1], ['Spiral Drifter', 'Mollusk', 4, 'rare', 0.15, 0.6, 1], ['Choir Lilies', 'Animal', 4, 'uncommon', 0.5, 2],
    ['Echo Ray', 'Fish', 4, 'rare', 1, 3], ['Rockcrawler', 'Arthropod', 4, 'common', 0.03, 0.7], ['Gulper Tubes', 'Worm', 4, 'uncommon', 0.5, 3],
    ['The Lamplighter', 'Unknown', 4, 'legendary', 0, 0, 1]
  ];
  var FLORA = { Moss: 1, Fern: 1, Algae: 1, Plant: 1, Fungus: 1, Bacteria: 1, 'Bacteria cloud': 1 };
  var CATALOG = [], BY_ID = {};
  function idOf(name) { return name.toLowerCase().replace(/^the /, '').replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
  RAW.forEach(function (r) {
    var sp = { id: idOf(r[0]), name: r[0], type: r[1], zones: [r[2]], rarity: r[3], sizeM: [r[4], r[5]], glows: !!r[6], flora: !!FLORA[r[1]] };
    CATALOG.push(sp); BY_ID[sp.id] = sp;
  });
  var BOUNTY = { common: 25, uncommon: 60, rare: 150, very_rare: 400, legendary: 1000 };
  K.BOUNTY = BOUNTY;

  // Species lookup: creatures.js data first, the fallback catalog fills the gaps.
  K.species = function (id) {
    var b = (TU.creatures && TU.creatures.species && TU.creatures.species[id]) || null, f = BY_ID[id] || null;
    if (!b && !f) return null;
    var out = {}, k;
    if (f) for (k in f) out[k] = f[k];
    if (b) for (k in b) out[k] = b[k];
    if (out.flora == null) out.flora = !!FLORA[out.type];
    if (!out.zones || !out.zones.length) out.zones = [0];
    return out;
  };
  function allSpecies() {
    var list = CATALOG.map(function (s) { return K.species(s.id); }), b = (TU.creatures && TU.creatures.species) || {};
    Object.keys(b).forEach(function (id) { if (!BY_ID[id]) list.push(K.species(id)); });
    return list;
  }

  /* ------------------------------------------------------------------ */
  /* Pencil sketches                                                     */
  /* ------------------------------------------------------------------ */
  var SHAPES = {
    fish: 'M6 20C14 8 38 6 50 20C38 34 14 32 6 20ZM50 20L60 10L58 20L60 30Z',
    eel: 'M4 22C14 14 24 28 34 20S52 14 60 20C52 24 44 26 34 25S14 30 4 22Z',
    crust: 'M12 20C20 13 40 13 48 20C40 27 20 27 12 20ZM48 18L58 11L61 17L52 20ZM48 22L58 29L61 23L52 20ZM12 20L4 12L6 12L14 18ZM12 20L4 28L6 28L14 22ZM22 15L22 26M30 14L30 26M38 15L38 26',
    amph: 'M8 22C16 16 34 16 44 20C50 20 56 18 60 20C56 24 50 22 44 24C34 28 16 28 8 22ZM20 25L15 33L18 33L22 26ZM34 25L36 33L39 33L37 25ZM20 19L15 11L18 11L22 18ZM34 19L36 11L39 11L37 19Z',
    insect: 'M20 20A12 7 0 1 0 44 20A12 7 0 1 0 20 20ZM14 20A5 5 0 1 0 22 20A5 5 0 1 0 14 20ZM25 15L17 7L19 6L27 14ZM32 14L32 5L34 5L34 14ZM39 15L47 7L49 8L41 16ZM25 25L17 33L19 34L27 26ZM32 26L32 35L34 35L34 26ZM39 25L47 33L49 32L41 24Z',
    bat: 'M32 16C26 8 14 8 4 14C10 16 12 20 14 24C18 20 24 22 28 26L32 22L36 26C40 22 46 20 50 24C52 20 54 16 60 14C50 8 38 8 32 16Z',
    jelly: 'M14 22C14 6 50 6 50 22ZM17 22L19 22C21 28 17 32 20 38L18 38C15 32 19 28 17 22ZM25 22L27 22C29 30 25 32 28 38L26 38C23 32 27 30 25 22ZM35 22L37 22C35 30 39 32 36 38L34 38C37 32 33 30 35 22ZM43 22L45 22C43 28 47 32 44 38L42 38C45 32 41 28 43 22Z',
    shell: 'M32 6A14 14 0 1 0 32 34A14 14 0 1 0 32 6ZM32 12A8 8 0 1 1 32 28A5 5 0 1 1 32 18',
    worm: 'M6 30C14 10 22 10 28 24S42 36 48 18S58 10 60 14L58 17C54 14 52 22 48 26S34 40 26 28S16 18 9 31Z',
    moss: 'M6 34C10 22 18 22 22 34ZM18 34C22 16 32 16 38 34ZM34 34C40 22 50 22 56 34ZM12 34C14 28 16 28 18 34Z',
    fern: 'M32 36L32 6L33 6L33 36ZM32 12L22 6L24 10L32 15ZM33 12L43 6L41 10L33 15ZM32 20L18 13L21 18L32 23ZM33 20L47 13L44 18L33 23ZM32 28L16 22L20 27L32 31ZM33 28L49 22L45 27L33 31Z',
    fungus: 'M12 22C12 6 52 6 52 22ZM27 22L26 36L38 36L37 22Z',
    bact: 'M10 26C8 16 22 12 30 18C38 10 56 14 54 24C58 32 40 36 32 32C24 38 10 34 10 26Z',
    ray: 'M32 10C40 14 54 18 62 24C50 26 40 26 34 30L32 38L30 30C24 26 14 26 2 24C10 18 24 14 32 10Z',
    lily: 'M32 36L31 18L33 18ZM32 18C24 18 20 10 22 6C26 10 28 12 32 12C36 12 38 10 42 6C44 10 40 18 32 18Z'
  };
  function shapeOf(sp) {
    if (!sp) return 'fish';
    var t = (sp.type || '').toLowerCase(), n = (sp.name || '').toLowerCase();
    if (/ ray$/.test(n)) return 'ray';
    if (/eel/.test(n) && /fish/.test(t)) return 'eel';
    if (/fish/.test(t)) return 'fish';
    if (/crust|arthro/.test(t)) return 'crust';
    if (/amphib/.test(t)) return 'amph';
    if (/insect/.test(t)) return 'insect';
    if (/mammal/.test(t)) return 'bat';
    if (/jelly/.test(t)) return 'jelly';
    if (/mollusk/.test(t)) return 'shell';
    if (/worm/.test(t)) return 'worm';
    if (/fung/.test(t)) return 'fungus';
    if (/moss|algae|plant/.test(t)) return 'moss';
    if (/fern/.test(t)) return 'fern';
    if (/bacteria/.test(t)) return 'bact';
    if (/animal/.test(t)) return 'lily';
    if (/unknown/.test(t)) return null;
    return 'fish';
  }
  // found: pencil outline with hatching. not found: solid silhouette.
  function sketchSVG(id, found, hud) {
    var sp = K.species(id), sh = shapeOf(sp), d = sh ? SHAPES[sh] : null;
    var stroke = hud ? '#4FF2D0' : '#2B2B2B';
    if (!d) return '<svg viewBox="0 0 64 40" aria-hidden="true"><text x="32" y="30" text-anchor="middle" font-size="28" font-family="Caveat,cursive" fill="' + stroke + '">?</text></svg>';
    if (!found) return '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="' + d + '" fill="#2B2B2B" fill-rule="evenodd" opacity=".82"/></svg>';
    var pid = 'h' + Math.random().toString(36).slice(2, 7);
    return '<svg viewBox="0 0 64 40" aria-hidden="true"><defs><pattern id="' + pid + '" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="3" stroke="' + stroke + '" stroke-width=".7" opacity="' + (hud ? '.5' : '.35') + '"/></pattern></defs>' +
      '<path d="' + d + '" fill="url(#' + pid + ')" fill-rule="evenodd" stroke="' + stroke + '" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width=".5" opacity=".5" transform="translate(.8 .6)"/></svg>';
  }

  TU.css('ui-logbook', [
    '.ui-book{background:var(--ui-paper);color:var(--ui-pencil);border-radius:4px 10px 10px 4px;padding:18px 18px 18px 30px;position:relative;box-shadow:0 18px 50px rgba(0,0,0,.5), inset 10px 0 18px rgba(0,0,0,.12);',
    '  background-image:linear-gradient(90deg, transparent 18px, rgba(190,60,50,.35) 18px, rgba(190,60,50,.35) 19px, transparent 19px), repeating-linear-gradient(180deg, transparent 0 25px, rgba(60,110,160,.16) 25px 26px)}',
    '.ui-book h3{font-family:var(--ui-hand);font-weight:700;font-size:34px;margin:0;line-height:1;color:#22201b}',
    '.ui-book-sub{font-family:var(--mono);font-size:11px;letter-spacing:.18em;color:#6b6352;margin:4px 0 12px}',
    '.ui-book .ui-tabs{border-bottom-color:rgba(0,0,0,.15)}',
    '.ui-book .ui-tab{color:#5a5345;letter-spacing:.1em}',
    '.ui-book .ui-tab.ui-sel{color:#1d1b16;border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.35)}',
    '.ui-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}',
    '.ui-sp{background:rgba(255,255,255,.42);border:1px solid rgba(0,0,0,.12);border-radius:3px;padding:8px 10px;position:relative;min-height:128px}',
    '.ui-sp svg{width:100%;height:52px;display:block}',
    '.ui-sp b{display:block;font-family:var(--ui-hand);font-size:21px;line-height:1.05;margin-top:2px}',
    '.ui-sp small{display:block;font-size:11.5px;color:#5a5345;line-height:1.45}',
    '.ui-sp.ui-unk b{color:#7a7262}',
    '.ui-sp .ui-shiny{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:#E6B23A;color:#3b2a00;font-size:12px;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 1px 0 rgba(0,0,0,.25)}',
    '.ui-sp .ui-rar{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;color:#8a806c}',
    '.ui-book-empty{font-family:var(--ui-hand);font-size:24px;color:#5a5345;padding:12px 0}',
    /* in-dive slate */
    '#ui-slate{position:fixed;right:calc(var(--gr) + 8px);top:50%;transform:translateY(-50%) rotate(1.2deg);z-index:4;width:min(400px, calc(100% - 32px));max-height:calc(100% - 120px);overflow:auto;display:none;',
    '  background:linear-gradient(160deg,#F4F4EE,#D9DBD2);color:#1d2522;border-radius:12px;padding:20px 18px 16px;box-shadow:0 20px 60px rgba(0,0,0,.6), inset 0 0 0 5px #C9CBC0}',
    '#ui-slate.ui-on{display:block}',
    '#ui-slate h4{font-family:var(--mono);font-weight:400;font-size:11px;letter-spacing:.22em;color:#5d6660;margin:12px 0 4px}',
    '#ui-slate .ui-hd{font-family:var(--ui-hand);font-size:30px;font-weight:700;line-height:1}',
    '#ui-slate .ui-hdsub{font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:#5d6660;margin-top:4px}',
    '#ui-slate ul{list-style:none;margin:0;padding:0}',
    '#ui-slate li{display:flex;align-items:center;gap:8px;font-family:var(--ui-hand);font-size:21px;line-height:1.15;border-bottom:1px dashed rgba(0,0,0,.18);padding:3px 0}',
    '#ui-slate li svg{width:40px;height:25px;flex:none}',
    '#ui-slate li em{margin-left:auto;font-style:normal;font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:#fff;background:#1d2522;padding:2px 5px;border-radius:2px}',
    '#ui-slate li em.ui-gold{background:#B9861B}',
    '#ui-slate .ui-none{font-family:var(--ui-hand);font-size:20px;color:#6b726c}',
    '#ui-slate .ui-foot{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:#5d6660;margin-top:12px}'
  ].join('\n'));

  /* ------------------------------------------------------------------ */
  /* Camp logbook                                                        */
  /* ------------------------------------------------------------------ */
  function card(sp) {
    var e = TU.logbook.get(sp.id), found = !!e, z = (sp.zones && sp.zones[0]) || 0;
    var shiny = e && (e.shiny || e.shinies > 0);
    var rar = String(sp.rarity || 'common').replace('_', ' ').toUpperCase();
    if (!found) return '<div class="ui-sp ui-unk">' + sketchSVG(sp.id, false) + '<b>???</b><small>' + U.ZONE_NAMES[z] + '</small><small class="ui-rar">' + rar + ' · BOUNTY ' + K.money(BOUNTY[sp.rarity] || 25) + '</small></div>';
    var best = e.maxSizeM != null ? K.cm(e.maxSizeM) : 'not measured';
    return '<div class="ui-sp">' + (shiny ? '<span class="ui-shiny" title="Shiny">★</span>' : '') + sketchSVG(sp.id, true) + '<b>' + K.esc(sp.name) + '</b><small>' + U.ZONE_NAMES[z] + (sp.glows ? ' · glows' : '') + '</small><small>Best size: <b style="display:inline;font-size:18px">' + best + '</b></small><small>Logged ' + e.count + 'x' + (e.photos ? ' · ' + e.photos + ' photo' + (e.photos > 1 ? 's' : '') : '') + '</small><small class="ui-rar">' + rar + '</small></div>';
  }
  function renderBook(root) {
    var list = allSpecies(), have = list.filter(function (s) { return TU.logbook.has(s.id); }).length;
    root.innerHTML = '<div class="ui-book"><h3>Field Logbook</h3><div class="ui-book-sub">' + have + ' / ' + list.length + ' SPECIES · PROPERTY OF SUMP CAMP · IF FOUND, RETURN TO MARV</div><div id="ui-book-tabs"></div></div>';
    var tabs = U.ZONE_NAMES.map(function (n, z) {
      return { id: 'z' + z, label: (z + 1) + ' ' + n.replace(/^The /, '').toUpperCase(), render: function (el) {
        var sp = list.filter(function (s) { return !s.flora && s.zones[0] === z; });
        el.innerHTML = '<div class="ui-cards">' + sp.map(card).join('') + '</div>';
      } };
    });
    tabs.push({ id: 'flora', label: 'FLORA', render: function (el) {
      var sp = list.filter(function (s) { return s.flora; });
      el.innerHTML = '<p class="ui-book-empty" style="font-size:20px;padding:0 0 8px">Moss, fungi, mats and roots. Measure a patch to log it.</p><div class="ui-cards">' + sp.map(card).join('') + '</div>';
    } });
    K.tabs(root.querySelector('#ui-book-tabs'), tabs, 'z0');
  }

  /* ------------------------------------------------------------------ */
  /* In-dive slate (J)                                                   */
  /* ------------------------------------------------------------------ */
  var slateOpen = false;
  function renderSlate() {
    var el = $('ui-slate'); if (!el) return;
    var log = K.run || { logged: [], treasure: [], waypoints: [] }, P = TU.player.state, run = TU.run || {};
    var wps = (TU.player.waypoints() || []).map(function (w) { return { index: w.index, name: K.wpName(w.index, w.name), depth: w.depth }; });
    var h = '<div class="ui-hd">Dive slate</div><div class="ui-hdsub">' + fmtTime(run.t || 0) + ' IN · ' + (P.depth || 0).toFixed(1) + ' m NOW · MAX ' + (P.maxDepth || 0).toFixed(1) + ' m</div>';
    h += '<h4>LOGGED THIS DIVE</h4>';
    if (log.logged.length) h += '<ul>' + log.logged.slice().reverse().map(function (x) {
      var sp = K.species(x.speciesId);
      return '<li>' + sketchSVG(x.speciesId, true) + K.esc(sp ? sp.name : x.speciesId) + (x.sizeM != null ? ', ' + K.cm(x.sizeM) : '') + (x.first ? '<em class="ui-gold">NEW</em>' : x.record ? '<em>RECORD</em>' : '') + '</li>';
    }).join('') + '</ul>';
    else h += '<div class="ui-none">Nothing yet. Aim the tape (' + K.keyName('KeyT') + ') at something alive.</div>';
    h += '<h4>FINDS</h4>' + (log.treasure.length ? '<ul>' + log.treasure.map(function (t) { return '<li>' + K.esc(t.name) + '<em>' + K.money(t.value) + '</em></li>'; }).join('') + '</ul>' : '<div class="ui-none">No treasure. Check the silt.</div>');
    h += '<h4>WAYPOINTS</h4>' + (wps.length ? '<ul>' + wps.map(function (w) { return '<li>' + K.esc(w.name) + '<em>' + (w.depth || 0).toFixed(0) + ' m</em></li>'; }).join('') + '</ul>' : '<div class="ui-none">None placed. ' + K.keyName('KeyQ') + ' drops one.</div>');
    h += '<div class="ui-foot">LOGBOOK ' + TU.logbook.count() + ' / ' + allSpecies().length + ' · ' + K.keyName('KeyJ') + ' CLOSES</div>';
    el.innerHTML = h;
  }
  function setSlate(on) {
    slateOpen = !!on && K.simulating();
    var el = $('ui-slate'); if (!el) return;
    if (slateOpen) renderSlate();
    el.classList.toggle('ui-on', slateOpen);
    K.emit('slate', { open: slateOpen });
  }

  K.logbook = {
    catalog: CATALOG, all: allSpecies, renderBook: renderBook, sketch: sketchSVG,
    iconSVG: function (id, hud) { return sketchSVG(id, true, hud); },
    openSlate: setSlate, slateOpen: function () { return slateOpen; }
  };

  K.part('logbook', {
    init: function () {
      TU.el('aside', { id: 'ui-slate', attrs: { 'aria-label': 'Dive slate' } });
      window.addEventListener('keydown', function (e) {
        var tag = (e.target && e.target.tagName) || '';
        if (e.repeat || e.code !== 'KeyJ' || tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (K.simulating()) setSlate(!slateOpen);
      });
      ['creature:logged', 'treasure:found', 'waypoint:placed'].forEach(function (n) { TU.on(n, function () { if (slateOpen) setTimeout(renderSlate, 0); }); });
      K.on('wpname', function () { if (slateOpen) renderSlate(); });
    },
    reset: function () { setSlate(false); },
    state: function (e) { if (e.to !== 'dive' && e.to !== 'tutorial') { slateOpen = false; var el = $('ui-slate'); if (el) el.classList.remove('ui-on'); } }
  });
})();
