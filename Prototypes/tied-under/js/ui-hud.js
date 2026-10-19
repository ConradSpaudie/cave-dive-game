/*
 * ui-hud.js: the HUD inside the diver's mask.
 *
 *   Readouts      depth, max depth, distance down the cave, pressure, tank air (with time left), stamina,
 *                 panic, battery, vest, rope used, cold, compass. Each one can be switched on or off and
 *                 placed in one of 8 slots around the mask (top left, top center, ... bottom right).
 *                 The layout is saved in TU.save.data.ui.hud.layout.
 *   Glass layer   readouts sit "behind" the mask glass: a curved edge, a faint reflection, and
 *                 condensation that grows with panic and cold.
 *   Warnings      bleeding (untaped cuts), mask flooding (water line rising inside the mask), low air.
 *   HUD editor    K.hudEditor(el) draws the layout editor used in Settings.
 *   Toasts        K.toast(...) for "New species: Blind Cavefish, 8.4 cm" style notices.
 *   Waypoints     when you drop a waypoint a small name box opens (default "WP n"). Enter saves.
 *
 * Owner: agent D. Part of the ui system (see ui.js, K.part).
 */
(function () {
  'use strict';
  var TU = window.TU, K = TU.uiKit, U = TU.util, cfg = TU.cfg, clamp = U.clamp, fmtTime = U.fmtTime, $ = TU.$;
  if (!K) return;

  var SLOTS = [['tl', 'Top left'], ['tc', 'Top center'], ['tr', 'Top right'], ['ml', 'Middle left'], ['mr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom center'], ['br', 'Bottom right']];
  var SLOT_NAME = {}; SLOTS.forEach(function (s) { SLOT_NAME[s[0]] = s[1]; });
  // Every readout: id, label, kind ('big' number, 'bar', 'line', 'compass'), default slot, default on.
  var READOUTS = [
    { id: 'depth', label: 'Depth', kind: 'big', slot: 'tl', on: true },
    { id: 'maxdepth', label: 'Max depth', kind: 'line', slot: 'tl', on: true },
    { id: 'distance', label: 'Distance down cave', kind: 'line', slot: 'tl', on: true },
    { id: 'pressure', label: 'Pressure (bar / atm)', kind: 'line', slot: 'ml', on: false },
    { id: 'air', label: 'Tank air and time left', kind: 'big', slot: 'tr', on: true },
    { id: 'compass', label: 'Compass', kind: 'compass', slot: 'tc', on: true },
    { id: 'stamina', label: 'Stamina', kind: 'bar', slot: 'bl', on: true },
    { id: 'battery', label: 'Light battery', kind: 'bar', slot: 'bl', on: true },
    { id: 'vest', label: 'Vest (buoyancy)', kind: 'bar', slot: 'bl', on: true },
    { id: 'panic', label: 'Panic', kind: 'bar', slot: 'br', on: true },
    { id: 'rope', label: 'Rope used', kind: 'line', slot: 'br', on: true },
    { id: 'cold', label: 'Cold', kind: 'bar', slot: 'mr', on: false },
    { id: 'weapon', label: 'Weapon and ammo', kind: 'line', slot: 'br', on: true }
  ];
  var BY_ID = {}; READOUTS.forEach(function (r) { BY_ID[r.id] = r; });

  TU.css('ui-hud', [
    '#ui-hud{position:fixed;inset:0;pointer-events:none;font-family:var(--mono);color:var(--hud);display:none;z-index:2;text-shadow:0 0 8px rgba(79,242,208,.45)}',
    '#ui-hud.ui-on{display:block}',
    /* glass layer */
    '#ui-glass{position:absolute;inset:0;border-radius:64px;box-shadow:inset 0 0 0 1px rgba(160,240,230,.07), inset 0 0 60px rgba(120,220,210,.06);',
    '  background:linear-gradient(118deg, rgba(200,255,250,.045) 0%, rgba(200,255,250,.0) 22%, transparent 60%, rgba(200,255,250,.025) 78%, transparent 84%)}',
    '#ui-cond{position:absolute;inset:0;border-radius:64px;background-size:420px 420px;opacity:.25;',
    '  -webkit-mask-image:radial-gradient(ellipse 72% 68% at 50% 50%, transparent 58%, #000 100%);mask-image:radial-gradient(ellipse 72% 68% at 50% 50%, transparent 58%, #000 100%)}',
    '#ui-fog{position:absolute;inset:0;border-radius:64px;opacity:0;background:radial-gradient(ellipse 70% 62% at 50% 50%, transparent 40%, rgba(200,225,222,.22) 100%)}',
    /* slots */
    '.ui-slot{position:absolute;display:flex;flex-direction:column;gap:6px;max-width:min(300px, 42vw)}',
    '.ui-slot-tl{top:calc(var(--gt) + 8px);left:calc(var(--gx) + 10px)}',
    '.ui-slot-tc{top:calc(var(--gt) + 4px);left:50%;transform:translateX(-50%);align-items:center;text-align:center}',
    '.ui-slot-tr{top:calc(var(--gt) + 8px);right:calc(var(--gr) + 10px);align-items:flex-end;text-align:right}',
    '.ui-slot-ml{top:50%;left:calc(var(--gx) + 10px);transform:translateY(-50%)}',
    '.ui-slot-mr{top:50%;right:calc(var(--gr) + 10px);transform:translateY(-50%);align-items:flex-end;text-align:right}',
    '.ui-slot-bl{bottom:calc(var(--gb) + 8px);left:calc(var(--gx) + 10px)}',
    '.ui-slot-bc{bottom:calc(var(--gb) + 40px);left:50%;transform:translateX(-50%);align-items:center;text-align:center}',
    '.ui-slot-br{bottom:calc(var(--gb) + 8px);right:calc(var(--gr) + 10px);align-items:flex-end;text-align:right}',
    '.ui-ro{position:relative}',
    '.ui-lbl{font-size:11px;letter-spacing:.22em;color:var(--hud-dim)}',
    '.ui-big{font-size:30px;line-height:1.05;letter-spacing:.02em;font-variant-numeric:tabular-nums}',
    '.ui-big span{font-size:13px;margin-left:4px;color:var(--hud-dim)}',
    '.ui-sub{font-size:12px;color:var(--hud-dim);margin-top:2px;font-variant-numeric:tabular-nums}',
    '.ui-row{display:flex;align-items:center;gap:8px;font-size:12px}',
    '.ui-right .ui-row{flex-direction:row-reverse}',
    '.ui-row b{font-weight:400;min-width:62px;color:var(--hud-dim);letter-spacing:.14em;font-size:11px}',
    '.ui-bar{position:relative;width:110px;height:6px;border:1px solid var(--hud-faint);background:rgba(79,242,208,.05)}',
    '.ui-bar i{position:absolute;left:0;top:0;bottom:0;width:50%;background:var(--hud);box-shadow:0 0 8px var(--hud)}',
    '.ui-right .ui-bar i{left:auto;right:0}',
    '.ui-bar .ui-tick{position:absolute;top:-3px;bottom:-3px;width:1px;background:var(--hud-dim)}',
    '.ui-v{font-variant-numeric:tabular-nums;min-width:56px}',
    '.ui-warn{color:var(--warn)!important;text-shadow:0 0 8px rgba(255,180,92,.5)} .ui-warn i{background:var(--warn)!important;box-shadow:0 0 8px var(--warn)!important}',
    '.ui-bad{color:var(--bad)!important;text-shadow:0 0 8px rgba(255,90,79,.6)} .ui-bad i{background:var(--bad)!important;box-shadow:0 0 8px var(--bad)!important}',
    /* compass */
    '.ui-cmp{width:260px;max-width:60vw;height:30px;position:relative;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)}',
    '.ui-cmp-t{position:absolute;left:50%;top:0;height:100%;white-space:nowrap}',
    '.ui-cmp-t span{position:absolute;top:0;width:30px;margin-left:-15px;text-align:center;font-size:12px;color:var(--hud-dim)}',
    '.ui-cmp-t span.ui-c4{color:var(--hud);font-size:13px}',
    '.ui-cmp-t span::after{content:"";position:absolute;left:50%;top:18px;width:1px;height:6px;background:var(--hud-dim)}',
    '.ui-cmp::after{content:"";position:absolute;left:50%;bottom:0;margin-left:-4px;border:4px solid transparent;border-bottom-color:var(--hud)}',
    '.ui-cmp-deg{font-size:11px;color:var(--hud-dim);letter-spacing:.2em;margin-top:1px}',
    /* center bits */
    '#ui-dot{position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:var(--hud);opacity:.5}',
    /* weapon crosshair: a dot with four short ticks that close in while you aim (right mouse) */
    '#ui-xh{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;transition:opacity .2s;--g:9px}',
    '#ui-xh.ui-on{opacity:1}',
    '#ui-xh i{position:absolute;background:var(--hud);box-shadow:0 0 6px rgba(79,242,208,.7)}',
    '#ui-xh .ui-x0{left:-2px;top:-2px;width:4px;height:4px;border-radius:50%}',
    '#ui-xh .ui-x1,#ui-xh .ui-x2{top:-1px;width:7px;height:2px} #ui-xh .ui-x1{left:calc(-7px - var(--g))} #ui-xh .ui-x2{left:var(--g)}',
    '#ui-xh .ui-x3,#ui-xh .ui-x4{left:-1px;width:2px;height:7px} #ui-xh .ui-x3{top:calc(-7px - var(--g))} #ui-xh .ui-x4{top:var(--g)}',
    '#ui-xh.ui-low i{background:var(--warn);box-shadow:0 0 6px rgba(255,180,92,.7)}',
    '#ui-xh.ui-hitm i{background:#fff;box-shadow:0 0 10px #fff}',
    '#ui-xh.ui-busy{opacity:.25}',
    '.ui-wpn{font-size:12px;letter-spacing:.14em}',
    '.ui-wpn b{font-weight:400;color:var(--hud)}',
    '.ui-wpn small{display:block;font-size:11px;color:var(--hud-dim);letter-spacing:.12em;margin-top:2px}',
    '.ui-wpn .ui-bar{width:110px;margin-top:4px}',
    '.ui-wpn.ui-off{opacity:.55}',
    '#ui-breath{position:absolute;left:50%;bottom:var(--gb);transform:translateX(-50%);font-size:11px;letter-spacing:.2em;color:var(--hud-dim);text-align:center}',
    '#ui-breath .ui-bb{width:120px;height:3px;margin:6px auto 0;background:var(--hud-faint);position:relative;overflow:hidden}',
    '#ui-breath .ui-bb i{position:absolute;left:50%;top:0;bottom:0;width:0;background:var(--hud);transform:translateX(-50%)}',
    '#ui-warns{position:absolute;left:50%;top:calc(var(--gt) + 62px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px;letter-spacing:.2em;text-align:center;width:min(520px, calc(100% - 32px))}',
    '#ui-warns div{animation:ui-blink 1.1s steps(2,start) infinite}',
    '@keyframes ui-blink{to{opacity:.35}}',
    /* damage overlays */
    '#ui-bleed{position:absolute;inset:0;opacity:0;border-radius:64px;background:radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgba(150,10,14,.55) 100%);animation:ui-pulse 1.6s ease-in-out infinite}',
    '@keyframes ui-pulse{50%{filter:brightness(1.6)}}',
    '#ui-flood{position:absolute;left:0;right:0;bottom:0;height:0;overflow:hidden;border-radius:0 0 64px 64px}',
    '#ui-flood i{position:absolute;inset:0;background:linear-gradient(180deg, rgba(90,150,150,.42), rgba(18,52,56,.72));-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '#ui-flood b{position:absolute;left:-10%;right:-10%;top:-7px;height:14px;background:radial-gradient(14px 7px at 14px 7px, rgba(190,240,235,.55) 40%, transparent 42%) 0 0/28px 14px repeat-x;animation:ui-wave 2.2s linear infinite}',
    '@keyframes ui-wave{to{transform:translateX(28px)}}',
    /* toasts */
    '#ui-toasts{position:absolute;right:calc(var(--gr) + 10px);top:calc(var(--gt) + 130px);display:flex;flex-direction:column;gap:8px;align-items:flex-end;width:min(330px, calc(100% - 32px))}',
    '.ui-toast{display:flex;gap:10px;align-items:center;background:rgba(4,18,18,.72);border:1px solid var(--line);border-left:3px solid var(--hud);padding:8px 12px;transition:opacity .5s, transform .5s;max-width:100%}',
    '.ui-toast svg{width:46px;height:30px;flex:none}',
    '.ui-toast small{display:block;font-size:10.5px;letter-spacing:.22em;color:var(--hud-dim)}',
    '.ui-toast strong{display:block;font-weight:400;font-size:14px;color:#dffff8;letter-spacing:.04em}',
    '.ui-toast.ui-gold{border-left-color:#FFC857} .ui-toast.ui-gold small{color:#FFC857}',
    '.ui-toast.ui-gone{opacity:0;transform:translateX(20px)}',
    /* waypoint name box */
    '#ui-wpname{position:fixed;left:50%;bottom:calc(var(--gb) + 150px);transform:translateX(-50%);z-index:6;display:none;width:min(380px, calc(100% - 32px));background:rgba(4,16,18,.88);border:1px solid var(--hud-dim);box-shadow:0 0 30px rgba(79,242,208,.18);padding:12px 14px;font-family:var(--mono);color:var(--hud)}',
    '#ui-wpname.ui-on{display:block}',
    '#ui-wpname label{display:block;font-size:11px;letter-spacing:.24em;color:var(--hud-dim);margin-bottom:6px}',
    '#ui-wpname input{width:100%;background:rgba(79,242,208,.06);border:1px solid var(--line);color:#E8FFFA;font:16px var(--mono);padding:8px 10px;outline:none;border-radius:2px}',
    '#ui-wpname input:focus{border-color:var(--hud)}',
    '#ui-wpname p{margin:6px 0 0;font-size:11px;color:var(--hud-dim);letter-spacing:.08em}',
    /* HUD editor */
    '.ui-he{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;align-items:start}',
    '.ui-he-mask{position:relative;aspect-ratio:16/12;min-height:250px;border-radius:28px;background:radial-gradient(ellipse at 50% 45%, #0e2a2c 0%, #050c0e 70%);border:1px solid var(--line);box-shadow:inset 0 0 40px rgba(0,0,0,.7);overflow:hidden}',
    '.ui-he-slot{position:absolute;width:31%;min-height:20%;max-height:31%;overflow:hidden;border:1px dashed rgba(79,242,208,.25);border-radius:6px;padding:4px;display:flex;flex-wrap:wrap;gap:3px;align-content:flex-start;cursor:pointer;background:rgba(79,242,208,.02)}',
    '.ui-he-slot:hover,.ui-he-slot.ui-target{border-color:var(--hud);background:rgba(79,242,208,.08)}',
    '.ui-he-slot em{position:absolute;bottom:2px;right:5px;font-style:normal;font-family:var(--mono);font-size:9px;letter-spacing:.14em;color:rgba(79,242,208,.35);pointer-events:none}',
    '.ui-he-chip{font-family:var(--mono);font-size:10px;padding:1px 5px;border:1px solid var(--line);color:var(--hud);background:rgba(2,10,12,.8);border-radius:3px;cursor:grab}',
    '.ui-he-chip.ui-sel{background:var(--hud);color:#021412}',
    '.ui-he-list{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;font-size:13px;color:var(--ink-dim)}',
    '.ui-he-list input{accent-color:var(--hud);width:17px;height:17px}',
    '.ui-he-list select{background:#071214;color:var(--ink);border:1px solid var(--line);font:12px var(--mono);padding:5px 6px;border-radius:3px;max-width:130px}',
    '.ui-he-list label{cursor:pointer}',
    '@media (max-width: 760px){',
    '  .ui-slot{max-width:46vw}',
    '  .ui-big{font-size:22px}',
    '  .ui-bar{width:64px}',
    '  .ui-row b{min-width:44px;font-size:10px}',
    '  .ui-cmp{width:170px}',
    '}',
    '@media (max-width: 480px){',
    '  .ui-cmp{width:96px} .ui-cmp-deg{font-size:10px} .ui-slot-tl,.ui-slot-tr{max-width:34vw} .ui-lbl{letter-spacing:.12em}',
    '  #ui-warns{top:calc(var(--gt) + 118px)} #ui-toasts{top:calc(var(--gt) + 150px)}',
    '  .ui-he{grid-template-columns:1fr}',
    '  #ui-glass,#ui-cond,#ui-fog,#ui-bleed{border-radius:28px}',
    '}'
  ].join('\n'));

  /* ------------------------------------------------------------------ */
  /* Layout (saved)                                                      */
  /* ------------------------------------------------------------------ */
  function layout() {
    var hud = K.data().hud;
    if (!hud.layout || typeof hud.layout !== 'object') hud.layout = {};
    READOUTS.forEach(function (r) {
      var l = hud.layout[r.id];
      if (!l || !SLOT_NAME[l.slot]) hud.layout[r.id] = { on: l && typeof l.on === 'boolean' ? l.on : r.on, slot: r.slot };
    });
    return hud.layout;
  }
  function resetLayout() { K.data().hud.layout = {}; layout(); K.write(); buildHud(); }
  function setReadout(id, on, slot) {
    var L = layout(); if (!L[id]) return;
    if (on != null) L[id].on = !!on;
    if (slot && SLOT_NAME[slot]) L[id].slot = slot;
    K.write(); buildHud();
  }

  /* ------------------------------------------------------------------ */
  /* Condensation droplets (drawn once on a canvas, used as a CSS image) */
  /* ------------------------------------------------------------------ */
  function dropletURL() {
    var c = document.createElement('canvas'); c.width = c.height = 420;
    var g = c.getContext('2d'), r = TU.rng(4242, 61);
    for (var i = 0; i < 260; i++) {
      var x = r.float() * 420, y = r.float() * 420, s = 0.6 + Math.pow(r.float(), 3) * 5.5;
      var gr = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s);
      gr.addColorStop(0, 'rgba(235,255,252,.55)'); gr.addColorStop(0.6, 'rgba(200,235,230,.16)'); gr.addColorStop(1, 'rgba(200,235,230,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
    // a few streaks where drops ran down the glass
    g.strokeStyle = 'rgba(220,250,245,.08)'; g.lineWidth = 1.2;
    for (var j = 0; j < 14; j++) { var sx = r.float() * 420, sy = r.float() * 300; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + r.range(-6, 6), sy + 40, sx + r.range(-4, 4), sy + 60 + r.float() * 60); g.stroke(); }
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */
  var els = {}, hudOn = false;
  function buildRoot() {
    var root = TU.el('div', { id: 'ui-hud', attrs: { 'aria-hidden': 'true' } });
    root.innerHTML = '<div id="ui-glass"></div><div id="ui-cond"></div><div id="ui-fog"></div><div id="ui-bleed"></div><div id="ui-flood"><i></i><b></b></div>' +
      SLOTS.map(function (s) { return '<div class="ui-slot ui-slot-' + s[0] + (/r$/.test(s[0]) ? ' ui-right' : '') + '" id="ui-slot-' + s[0] + '"></div>'; }).join('') +
      '<div id="ui-dot"></div><div id="ui-xh"><i class="ui-x0"></i><i class="ui-x1"></i><i class="ui-x2"></i><i class="ui-x3"></i><i class="ui-x4"></i></div><div id="ui-warns"></div><div id="ui-toasts"></div>' +
      '<div id="ui-breath"><span id="ui-breathlbl">BREATHE</span><div class="ui-bb"><i id="ui-b-breath"></i></div></div>';
    var url = dropletURL(); if (url) $('ui-cond').style.backgroundImage = 'url(' + url + ')';
    TU.el('div', { id: 'ui-wpname', html: '<label for="ui-wp-input" id="ui-wp-lbl">NAME THIS WAYPOINT</label><input id="ui-wp-input" maxlength="24" autocomplete="off" spellcheck="false"><p>Enter saves. Esc keeps the default.</p>' });
    bindWpName();
  }
  function barRow(lbl, id, extraTick) {
    return '<div class="ui-row"><b>' + lbl + '</b><div class="ui-bar" id="ui-bw-' + id + '"><i id="ui-b-' + id + '"></i>' + (extraTick ? '<span class="ui-tick" id="ui-t-' + id + '"></span>' : '') + '</div><span class="ui-v" id="ui-v-' + id + '"></span></div>';
  }
  function compassHTML() {
    var h = '<div class="ui-cmp"><div class="ui-cmp-t" id="ui-cmp-t">', names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (var d = -360; d <= 720; d += 15) {
      var n = ((d % 360) + 360) % 360, lbl = names[n] || (n % 30 === 0 ? String(n) : '');
      h += '<span class="' + (n % 90 === 0 ? 'ui-c4' : '') + '" style="left:' + (d * 2) + 'px">' + lbl + '</span>';
    }
    return h + '</div></div><div class="ui-cmp-deg" id="ui-cmp-deg">000°</div>';
  }
  var RO_HTML = {
    depth: function () { return '<div class="ui-lbl">DEPTH</div><div class="ui-big" id="ui-depth">0.0<span>m</span></div><div class="ui-sub" id="ui-zonen"></div>'; },
    maxdepth: function () { return '<div class="ui-sub" id="ui-max">MAX 0.0 m</div>'; },
    distance: function () { return '<div class="ui-sub" id="ui-dist">DOWN CAVE 0 m</div>'; },
    pressure: function () { return '<div class="ui-sub" id="ui-press">PRESS 1.01 bar</div>'; },
    air: function () { return '<div class="ui-lbl" id="ui-airlbl">AIR</div><div class="ui-big" id="ui-air">200<span>bar</span></div><div class="ui-row"><b id="ui-tanklbl">TANK</b><div class="ui-bar" id="ui-bw-air"><i id="ui-b-air"></i></div></div><div class="ui-sub" id="ui-airt">10:00 left</div>'; },
    compass: compassHTML,
    stamina: function () { return barRow('STAMINA', 'sta'); },
    battery: function () { return barRow('LIGHT', 'bat'); },
    vest: function () { return barRow('VEST', 'vest', true); },
    panic: function () { return barRow('PANIC', 'pan'); },
    rope: function () { return '<div class="ui-row"><b>ROPE</b><span class="ui-v" id="ui-rope">0 m</span></div>'; },
    cold: function () { return barRow('COLD', 'cold'); },
    weapon: function () { return '<div class="ui-wpn" id="ui-wpn"><b id="ui-wpn-name">WEAPON</b><small id="ui-wpn-ammo"></small><div class="ui-bar" id="ui-bw-wpn" style="visibility:hidden"><i id="ui-b-wpn"></i></div><small id="ui-wpn-lbl"></small></div>'; }
  };
  function buildHud() {
    if (!$('ui-hud')) return;
    var L = layout();
    SLOTS.forEach(function (s) { $('ui-slot-' + s[0]).innerHTML = ''; });
    READOUTS.forEach(function (r) {
      if (!L[r.id].on) return;
      TU.el('div', { className: 'ui-ro ui-ro-' + r.id, attrs: { 'data-ro': r.id }, html: RO_HTML[r.id]() }, $('ui-slot-' + L[r.id].slot));
    });
    els = {};
    tHud = 0;
  }
  function E(id) { var e = els[id]; if (e === undefined) e = els[id] = $(id); return e; }
  function setText(id, t) { var e = E(id); if (e && e.textContent !== t) e.textContent = t; }
  function setBar(id, v, c) {
    var e = E('ui-b-' + id); if (!e) return;
    e.style.width = (clamp(v, 0, 1) * 100).toFixed(1) + '%';
    var w = E('ui-bw-' + id); if (w) { w.classList.toggle('ui-warn', c === 'warn'); w.classList.toggle('ui-bad', c === 'bad'); }
  }
  function setCls(id, c) { var e = E(id); if (e) { e.classList.toggle('ui-warn', c === 'warn'); e.classList.toggle('ui-bad', c === 'bad'); } }

  /* ------------------------------------------------------------------ */
  /* HUD update (10 times per second, the breath bar every step)         */
  /* ------------------------------------------------------------------ */
  var tHud = 0, fog = 0;
  function heading(P) { var d = (-(P.yaw || 0) * 180 / Math.PI) % 360; return d < 0 ? d + 360 : d; }
  K.heading = heading;
  function update(dt) {
    var P = TU.player.state;
    var ph = P.breathPhase || 0, bw, BR = cfg.breath;
    if (ph < BR.inhale) bw = ph / BR.inhale; else if (ph < BR.inhale + BR.exhale) bw = 1 - (ph - BR.inhale) / BR.exhale; else bw = 0;
    var bb = E('ui-b-breath'); if (bb) bb.style.width = (bw * 100).toFixed(0) + '%';
    crosshair();
    var cmp = E('ui-cmp-t'); if (cmp) cmp.style.transform = 'translateX(' + (-heading(P) * 2).toFixed(1) + 'px)';
    // Fog on the glass from panic and cold (smoothed).
    var fogT = clamp(Math.max((P.panic || 0) / 100 - 0.35, 0) * 1.2 + (P.cold || 0) * 0.7 + (K.data().settings.maskFogs ? 0.2 : 0), 0, 1);
    if (TU.run && TU.run.loadout && TU.run.loadout.mask === 'headlamp') fogT = clamp(fogT + 0.18, 0, 1); // the headlamp mask fogs
    fog = U.damp(fog, fogT, 1.5, dt);
    tHud -= dt; if (tHud > 0) return; tHud = 0.1;
    var env = P.env || {}, depth = P.depth || 0;
    // depth
    var d = E('ui-depth'); if (d) d.innerHTML = depth.toFixed(1) + '<span>m</span>';
    // zone name from the cave (knows the Beyond zones of endless segments), else from the depth
    var zi = TU.cave && typeof TU.cave.zoneAt === 'function' && P.pos ? TU.cave.zoneAt(P.pos) : null;
    setText('ui-zonen', ((zi && zi.name) || U.ZONE_NAMES[U.zoneOfDepth(depth)] || '').toUpperCase());
    setText('ui-max', 'MAX ' + (P.maxDepth || 0).toFixed(1) + ' m');
    setText('ui-dist', 'DOWN CAVE ' + Math.max(0, env.s || 0).toFixed(0) + ' m');
    var bar = 1.013 + depth * 0.0981;
    setText('ui-press', 'PRESS ' + bar.toFixed(2) + ' bar · ' + (bar / 1.01325).toFixed(2) + ' atm');
    // air
    var airC = P.airTotal < 25 ? 'bad' : P.airTotal < 60 ? 'warn' : '';
    var a = E('ui-air'); if (a) { a.innerHTML = (P.air || 0).toFixed(0) + '<span>bar</span>'; setCls('ui-air', airC); }
    var nt = (P.tanks || []).length;
    setText('ui-airlbl', nt > 1 ? 'AIR  ' + (P.airTotal || 0).toFixed(0) + ' TOTAL' : 'AIR');
    setText('ui-tanklbl', nt > 1 ? 'TANK ' + ((P.activeTank || 0) + 1) + '/' + nt : 'TANK');
    setBar('air', (P.air || 0) / (P.airMax || 1), airC);
    setText('ui-airt', P.surfaced ? 'REFILLING' : (P.airRate > 0 ? fmtTime(P.airTotal / P.airRate) + ' left at this rate' : 'HOLDING'));
    // bars
    setBar('sta', (P.stamina || 0) / (P.staminaMax || 100), P.stamina < 20 ? 'warn' : ''); setText('ui-v-sta', (P.stamina || 0).toFixed(0));
    var batC = P.battery < 10 ? 'bad' : P.battery < 25 ? 'warn' : '';
    setBar('bat', (P.battery || 0) / 100, batC); setText('ui-v-bat', P.flashOn ? (P.battery || 0).toFixed(0) + '%' : (P.battery <= 0 ? 'DEAD' : 'OFF'));
    setBar('vest', P.vestAir || 0, ''); var vt = E('ui-t-vest'); if (vt) vt.style.left = (cfg.vest.neutral * 100) + '%';
    var bd = (P.vestAir || 0) - cfg.vest.neutral; setText('ui-v-vest', Math.abs(bd) < 0.03 ? 'NEUTRAL' : bd > 0 ? 'RISING' : 'SINKING');
    var panC = P.panic > 70 ? 'bad' : P.panic > 40 ? 'warn' : '';
    setBar('pan', (P.panic || 0) / 100, panC); setText('ui-v-pan', (P.panic || 0).toFixed(0)); setCls('ui-v-pan', panC);
    setText('ui-rope', TU.player.ropeLength().toFixed(0) + ' m');
    var cold = P.cold || 0; setBar('cold', cold, cold > 0.7 ? 'bad' : cold > 0.4 ? 'warn' : ''); setText('ui-v-cold', (env.temperature != null ? env.temperature.toFixed(0) + '°C' : Math.round(cold * 100) + '%'));
    var hd = Math.round(heading(P)) % 360; setText('ui-cmp-deg', ('00' + hd).slice(-3) + '°');
    weaponReadout();
    setText('ui-breathlbl', P.surfaced ? 'AIR' : P.slow ? 'SLOW BREATH' : P.airTotal <= 0 ? 'NO AIR' : (P.breathStage === 1 ? 'INHALE' : P.breathStage === 2 ? 'EXHALE' : 'BREATHE'));
    damage(P);
  }
  // Weapon: the crosshair (every step, it is cheap) and the ammo readout (10 times a second).
  var xhKey = '';
  function crosshair() {
    var w = null; try { w = TU.weapons && TU.weapons.hudInfo ? TU.weapons.hudInfo() : null; } catch (e) { w = null; }
    var xh = E('ui-xh'), dot = E('ui-dot'); if (!xh) return;
    var on = !!(w && w.drawn), k = on ? [w.raised ? 1 : 0, w.low ? 1 : 0, w.hit ? 1 : 0, Math.round(w.aim * 10)].join(',') : 'off';
    if (k === xhKey) return; xhKey = k;
    xh.classList.toggle('ui-on', on); xh.classList.toggle('ui-busy', on && !w.raised); xh.classList.toggle('ui-low', on && w.low); xh.classList.toggle('ui-hitm', on && w.hit);
    if (on) xh.style.setProperty('--g', (9 - w.aim * 5).toFixed(1) + 'px');
    if (dot) dot.style.display = on ? 'none' : '';
  }
  function weaponReadout() {
    var w = null; try { w = TU.weapons && TU.weapons.hudInfo ? TU.weapons.hudInfo() : null; } catch (e) { w = null; }
    var box = E('ui-wpn'); if (!box) return;
    if (!w) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.classList.toggle('ui-off', !w.drawn);
    setText('ui-wpn-name', w.short + (w.drawn ? '' : ' · PUT AWAY'));
    setText('ui-wpn-ammo', w.ammo); setCls('ui-wpn-ammo', w.low ? 'warn' : '');
    var bw = E('ui-bw-wpn'); if (bw) bw.style.visibility = w.charge != null ? 'visible' : 'hidden';
    if (w.charge != null) setBar('wpn', w.charge, '');
    setText('ui-wpn-lbl', w.label || (w.drawn ? '' : K.keyName('Digit4') + ' TO DRAW'));
  }
  // Mouse buttons and the wheel have readable names on the Controls screen.
  var baseKeyName = K.keyName;
  K.keyName = function (code) { return code === 'MouseRight' ? 'Right click' : code === 'MouseLeft' ? 'Click' : baseKeyName(code); };

  // Warnings and damage overlays.
  function damage(P) {
    var cut = 0, untaped = 0, list = P.injuries || [], names = [];
    for (var i = 0; i < list.length; i++) {
      var inj = list[i];
      if (inj.type === 'cut' && !inj.taped) { cut += inj.severity || 0.5; untaped++; }
      if (!inj.taped && inj.type !== 'cut') names.push((inj.type || 'injury').toUpperCase());
    }
    var flood = typeof P.maskFlood === 'number' ? P.maskFlood : (P.maskFlooded ? 0.38 : 0);
    var w = [];
    if (untaped) w.push(['bad', ((P.bleedOut || 0) > 0 ? 'BLEEDING OUT' : 'BLEEDING') + (untaped > 1 ? ' x' + untaped : '') + ' · ' + K.keyName('KeyX') + ' OR 1 TO TAPE']);
    if ((P.health == null ? 100 : P.health) < 40) w.push([P.health < 20 ? 'bad' : 'warn', 'HEALTH ' + Math.round(P.health)]);
    if (flood > 0.01) w.push(['bad', 'MASK FLOODING · HOLD ' + K.keyName('KeyM') + ' TO CLEAR']);
    if (names.length) w.push(['warn', names.join(' · ')]);
    if (P.airTotal <= 0) w.push(['bad', 'NO AIR']); else if (P.airTotal < cfg.air.criticalAir) w.push(['bad', 'AIR CRITICAL']); else if (P.airTotal < cfg.air.lowAir) w.push(['warn', 'LOW AIR']);
    var key = w.map(function (x) { return x.join(':'); }).join('|');
    var wr = E('ui-warns');
    if (wr && wr.getAttribute('data-k') !== key) { wr.setAttribute('data-k', key); wr.innerHTML = w.map(function (x) { return '<div class="ui-' + x[0] + '">' + K.esc(x[1]) + '</div>'; }).join(''); }
    var bl = E('ui-bleed'); if (bl) bl.style.opacity = clamp(cut * 0.8, 0, 0.95).toFixed(2);
    var fl = E('ui-flood'); if (fl) fl.style.height = (clamp(flood, 0, 1) * 48).toFixed(1) + '%';
    var fg = E('ui-fog'); if (fg) fg.style.opacity = fog.toFixed(2);
    var cd = E('ui-cond'); if (cd) cd.style.opacity = (0.22 + fog * 0.6).toFixed(2);
  }

  function setHudVisible(on) { hudOn = !!on; var h = $('ui-hud'); if (h) h.classList.toggle('ui-on', hudOn); }
  K.setHudVisible = setHudVisible;

  /* ------------------------------------------------------------------ */
  /* Toasts                                                              */
  /* ------------------------------------------------------------------ */
  var toasts = [];
  K.toast = function (kicker, title, opts) {
    opts = opts || {};
    var box = $('ui-toasts'); if (!box) return;
    var t = TU.el('div', { className: 'ui-toast' + (opts.gold ? ' ui-gold' : ''), html: (opts.icon || '') + '<div><small>' + K.esc(kicker) + '</small><strong>' + K.esc(title) + '</strong></div>' }, box);
    toasts.push({ el: t, t: opts.dur || 4.5 });
    while (toasts.length > 3) { var o = toasts.shift(); if (o.el.parentNode) o.el.parentNode.removeChild(o.el); }
  };
  function tickToasts(dt) {
    for (var i = toasts.length - 1; i >= 0; i--) {
      var o = toasts[i]; o.t -= dt;
      if (o.t < 0.5) o.el.classList.add('ui-gone');
      if (o.t <= 0) { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); toasts.splice(i, 1); }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Waypoint naming                                                     */
  /* ------------------------------------------------------------------ */
  K.wpNames = {};
  K.wpName = function (index, fallback) { return K.wpNames[index] || fallback || ('WP ' + index); };
  var wpEdit = { index: 0, t: 0, open: false, def: '' };
  function openWpName(index, current) {
    var box = $('ui-wpname'), inp = $('ui-wp-input');
    wpEdit.index = index; wpEdit.open = true; wpEdit.t = 10; wpEdit.def = current || ('WP ' + index);
    $('ui-wp-lbl').textContent = 'NAME WAYPOINT ' + index;
    inp.value = wpEdit.def;
    box.classList.add('ui-on');
    try { inp.focus({ preventScroll: true }); inp.select(); } catch (e) { inp.focus(); }
  }
  K.renameWaypoint = function (index) { openWpName(index, K.wpName(index)); };
  function closeWpName(save) {
    if (!wpEdit.open) return;
    var inp = $('ui-wp-input'), name = (save ? inp.value : wpEdit.def).replace(/\s+/g, ' ').trim().slice(0, 24) || wpEdit.def;
    wpEdit.open = false; $('ui-wpname').classList.remove('ui-on'); inp.blur();
    applyWpName(wpEdit.index, name);
  }
  function applyWpName(index, name) {
    K.wpNames[index] = name;
    if (typeof TU.player.renameWaypoint === 'function') { try { TU.player.renameWaypoint(index, name); } catch (e) { console.error('[TU] renameWaypoint failed', e); } }
    if (K.run) K.run.waypoints.forEach(function (w) { if (w.index === index) w.name = name; });
    K.msg('WAYPOINT "' + name + '" SET', 2);
    K.emit('wpname', { index: index, name: name });
  }
  K.applyWpName = applyWpName;
  function bindWpName() {
    var inp = $('ui-wp-input');
    // Stop typed keys from reaching the swim controls (player.js listens on window).
    inp.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); closeWpName(true); }
      else if (e.code === 'Escape') { e.preventDefault(); closeWpName(false); }
    });
    inp.addEventListener('input', function () { wpEdit.t = 10; });
    inp.addEventListener('blur', function () { if (wpEdit.open) closeWpName(true); });
  }

  /* ------------------------------------------------------------------ */
  /* HUD editor (Settings > HUD LAYOUT)                                  */
  /* ------------------------------------------------------------------ */
  var SLOT_POS = { tl: [2, 3], tc: [34.5, 3], tr: [67, 3], ml: [2, 36], mr: [67, 36], bl: [2, -1], bc: [34.5, -1], br: [67, -1] }; // -1 = anchored to the bottom
  K.hudEditor = function (root) {
    var picked = null;
    function render() {
      var L = layout();
      var h = '<p class="ui-note" style="margin:0 0 12px">Pick what shows inside your mask and where. Click a readout chip, then click a spot on the mask to move it. Or use the list.</p><div class="ui-he"><div class="ui-he-mask" id="ui-he-mask">';
      SLOTS.forEach(function (s) {
        var p = SLOT_POS[s[0]];
        h += '<div class="ui-he-slot" data-slot="' + s[0] + '" style="left:' + p[0] + '%;' + (p[1] < 0 ? 'bottom:3%' : 'top:' + p[1] + '%') + '" role="button" tabindex="0" aria-label="' + s[1] + '"><em>' + s[0].toUpperCase() + '</em>';
        READOUTS.forEach(function (r) { if (L[r.id].on && L[r.id].slot === s[0]) h += '<span class="ui-he-chip' + (picked === r.id ? ' ui-sel' : '') + '" data-ro="' + r.id + '">' + K.esc(r.label.split(' (')[0]) + '</span>'; });
        h += '</div>';
      });
      h += '</div><div class="ui-he-list">';
      READOUTS.forEach(function (r) {
        var id = 'ui-he-' + r.id;
        h += '<input type="checkbox" id="' + id + '" data-ro="' + r.id + '"' + (L[r.id].on ? ' checked' : '') + '><label for="' + id + '">' + K.esc(r.label) + '</label><select data-ro="' + r.id + '" aria-label="Position of ' + K.esc(r.label) + '">' +
          SLOTS.map(function (s) { return '<option value="' + s[0] + '"' + (L[r.id].slot === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>';
      });
      h += '</div></div><div class="ui-btnrow" style="margin-top:12px"><button class="ui-btn ui-ghost ui-small" id="ui-he-reset">Reset layout</button></div>';
      root.innerHTML = h;
      Array.prototype.forEach.call(root.querySelectorAll('.ui-he-chip'), function (c) {
        c.addEventListener('click', function (e) { e.stopPropagation(); picked = picked === c.getAttribute('data-ro') ? null : c.getAttribute('data-ro'); render(); });
      });
      Array.prototype.forEach.call(root.querySelectorAll('.ui-he-slot'), function (s) {
        function drop() { if (!picked) return; setReadout(picked, true, s.getAttribute('data-slot')); picked = null; render(); }
        s.addEventListener('click', drop);
        s.addEventListener('keydown', function (e) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); drop(); } });
      });
      Array.prototype.forEach.call(root.querySelectorAll('.ui-he-list input'), function (c) { c.addEventListener('change', function () { setReadout(c.getAttribute('data-ro'), c.checked); render(); }); });
      Array.prototype.forEach.call(root.querySelectorAll('.ui-he-list select'), function (c) { c.addEventListener('change', function () { setReadout(c.getAttribute('data-ro'), true, c.value); render(); }); });
      root.querySelector('#ui-he-reset').addEventListener('click', function () { resetLayout(); picked = null; render(); });
    }
    render();
  };
  K.hudLayout = function () { return JSON.parse(JSON.stringify(layout())); };
  K.setReadout = setReadout;

  /* ------------------------------------------------------------------ */
  /* Part hooks                                                          */
  /* ------------------------------------------------------------------ */
  K.part('hud', {
    init: function () {
      buildRoot(); buildHud();
      TU.on('ui:toggleHud', function () { var on = !hudOn; setHudVisible(on); TU.save.data.settings.hudHidden = !on; TU.save.write(); });
      TU.on('waypoint:placed', function (e) {
        if (!K.simulating()) return;
        var def = e.name || ('WP ' + e.index);
        if (K.tut && K.tut.active && !K.tut.kevinNamed) { def = 'Kevin\'s Grave'; K.tut.kevinNamed = true; } // Marv's suggestion
        openWpName(e.index, def);
      });
      TU.on('creature:logged', function (e) {
        if (!K.simulating()) return;
        var sp = K.species ? K.species(e.speciesId) : null, name = sp ? sp.name : e.speciesId, size = e.sizeM != null ? ', ' + K.cm(e.sizeM) : '';
        var icon = K.logbook ? K.logbook.iconSVG(e.speciesId, true) : '';
        if (e.first) K.toast('NEW SPECIES', name + size, { icon: icon, gold: true, dur: 5 });
        else K.toast(e.record ? 'NEW SIZE RECORD' : 'LOGGED', name + size, { icon: icon });
      });
    },
    reset: function () { K.wpNames = {}; tHud = 0; closeWpName(false); toasts.forEach(function (o) { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); }); toasts = []; },
    state: function (e) {
      var sim = e.to === 'dive' || e.to === 'tutorial';
      setHudVisible(sim && !TU.save.data.settings.hudHidden);
      if (!sim && wpEdit.open && e.to !== 'paused') closeWpName(true);
    },
    update: function (dt) {
      update(dt); tickToasts(dt);
      if (wpEdit.open) { wpEdit.t -= dt; if (wpEdit.t <= 0) closeWpName(true); } // closes by itself if you just keep swimming
    }
  });
})();
