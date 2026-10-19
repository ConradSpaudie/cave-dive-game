/*
 * main.js: boots the game, runs the loop, and owns the flow of a run.
 *
 *   Boot:   check three.js, call every module's init() in INIT_ORDER, go to 'title'.
 *           If WebGL cannot start, say so. If any other module fails to start, show the real error and
 *           the module's name. Non-essential modules (creatures, finds, hands, audio) are switched off
 *           and their safe stubs from core.js put back, so the game still runs without them.
 *   Loop:   each animation frame, run fixed simulation steps (TU.cfg.loop.fixedDt) and then render.
 *           While diving: update(dt) of each system in UPDATE_ORDER, then the run director.
 *           In menus: idle(dt) so the title screen stays alive. Paused: nothing moves.
 *           After the steps: frame(dt) of each system once, then the renderer draws (skipped while a
 *           full-screen UI such as the camp hides the 3D view).
 *   Flow:   TU.game.startDive / pause / resume / restart / endRun / keepDiving / toTitle / openLoadout.
 *   Director: tracks which cave area you are in (area banners), the win touch, deaths, run stats.
 *   Debug:  window.__debug for tests and filming (teleport, step, sim, setState, getStats, ...).
 */
(function () {
  'use strict';
  var TU = window.TU;
  var INIT_ORDER = ['fx', 'cave', 'creatures', 'player', 'audio', 'ui'];
  var UPDATE_ORDER = ['player', 'cave', 'creatures', 'fx', 'audio', 'ui'];
  var IDLE_STATES = { title: 1, loadout: 1, results: 1, dead: 1 };
  // The game cannot run without these. Anything else can fail and the game goes on without it.
  var ESSENTIAL = { fx: 1, cave: 1, player: 1, ui: 1 };
  // Which TU API each system fills (to put the stubs back when a module is switched off).
  var API_OF = { creatures: 'creatures', audio: 'audio' };
  var disabled = {};    // systems switched off after a failure
  var booting = true;

  /* ------------------------------------------------------------------ */
  /* Error messages for the player                                       */
  /* ------------------------------------------------------------------ */
  // Full screen: the game cannot start.
  function bootError(text) {
    var el = document.getElementById('boot-err');
    if (el) { el.textContent = text; el.style.display = 'flex'; }
  }
  // A small bar at the top: something broke but the game keeps running.
  function softError(text) {
    var el = document.getElementById('boot-err');
    if (!el) return;
    el.style.cssText = 'display:flex;position:fixed;left:16px;right:16px;top:16px;bottom:auto;padding:10px 14px;gap:12px;align-items:center;justify-content:space-between;' +
      'background:rgba(30,16,4,.92);border:1px solid rgba(255,180,92,.4);border-radius:4px;font-size:12px;text-align:left;z-index:20';
    el.innerHTML = '';
    var span = document.createElement('span'); span.textContent = text; el.appendChild(span);
    var b = document.createElement('button'); b.textContent = 'OK';
    b.style.cssText = 'font:inherit;color:#021412;background:#FFB45C;border:0;padding:6px 12px;cursor:pointer;border-radius:3px';
    b.onclick = function () { el.style.display = 'none'; };
    el.appendChild(b);
  }
  function errText(e) { return (e && (e.message || String(e))) || 'unknown error'; }
  if (!window.THREE) { bootError('Could not load the 3D engine (three.js from cdnjs). Check your connection and reload.'); return; }

  // Systems in a given order, plus any extra systems a module registered that are not listed.
  var orderCache = {};
  function ordered(list) {
    var key = list === INIT_ORDER ? 'i' : 'u';
    if (orderCache[key]) return orderCache[key];
    var out = [], seen = {};
    list.forEach(function (n) { if (TU.systems[n] && !disabled[n]) { out.push(TU.systems[n]); seen[n] = 1; } });
    Object.keys(TU.systems).forEach(function (n) { if (!seen[n] && !disabled[n] && n !== 'director') out.push(TU.systems[n]); });
    orderCache[key] = out;
    return out;
  }
  // Switch a non-essential system off and put its API stubs back.
  function disable(name, e) {
    disabled[name] = true; orderCache = {};
    var api = API_OF[name], stubs = api && TU._stubs[api], obj = api && TU[api];
    if (stubs && obj) {
      // functions the module added beyond the stubs go too (callers check typeof before using them)
      for (var k in obj) if (typeof obj[k] === 'function' && !stubs[k]) delete obj[k];
      for (var k2 in stubs) obj[k2] = stubs[k2];
    }
    console.error('[TU] ' + name + ' was switched off after an error:', e);
  }
  // Run one hook. During boot an error is rethrown (handled below). During play it is logged
  // (a few times, not every frame) and the other systems keep running; a non-essential system
  // that keeps failing is switched off.
  var fails = {};
  function call(sys, hook, arg) {
    if (!sys[hook]) return;
    if (booting) { sys[hook](arg); return; }
    try { sys[hook](arg); } catch (e) {
      var k = sys.name + '.' + hook, n = fails[k] = (fails[k] || 0) + 1;
      if (n <= 3) console.error('[TU] ' + k + ' failed:', e);
      if (n >= 3 && !ESSENTIAL[sys.name] && !disabled[sys.name]) {
        disable(sys.name, e);
        softError('Something went wrong in ' + sys.name + ': ' + errText(e) + '. The game keeps going without it.');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Run director                                                        */
  /* ------------------------------------------------------------------ */
  function directorStep(dt) {
    var run = TU.run; if (!run || run.ended) return;
    run.t += dt;
    var P = TU.player.state, env = P.env;
    // Area banners: the first time you enter each named area this run.
    var areaId = env && env.area;
    if (areaId && areaId !== run.area) {
      run.area = areaId;
      if (!run.areasSeen[areaId]) {
        run.areasSeen[areaId] = true;
        var a = TU.cave.areas[areaId];
        if (a && a.style !== 'none') TU.emit('area:enter', { id: a.id, title: a.title, subtitle: a.subtitle, style: a.style });
      }
    }
    // Deepest zone reached this run (0..4 in the first cave, 5+ in the Beyond: endless segments).
    var zi = TU.cave.zoneAt ? TU.cave.zoneAt(P.pos).index : P.zone;
    if (zi > (run.maxZone || 0)) run.maxZone = zi;
    // Win: touch the Ancient Ring at the end of this leg. In endless mode every new segment ends in
    // another ring (features.bottom.segment is the segment it belongs to; run.endSeg is the goal).
    var bottom = TU.cave.features.bottom;
    var goal = bottom && (bottom.segment || 0) === (run.endSeg || 0) && (!run.endless || run.endSeg > 0);
    if (goal && !run.tutorial && P.pos.distanceTo(bottom.pos) < bottom.radius) TU.game.endRun({ won: true, reason: 'bottom' });
  }
  // Deaths. In the practice hole Marv pulls you out instead (no fail states in the tutorial).
  function death(reason) {
    return function () {
      if (!TU.state.simulating() || !TU.run || TU.run.ended) return;
      if (TU.run.tutorial) {
        if (TU.player.rescue) TU.player.rescue();
        TU.emit('ui:msg', { text: 'MARV: "Up you get. Nobody dies in the practice hole. Paperwork."', dur: 4 });
        return;
      }
      TU.game.endRun({ won: false, reason: reason });
    };
  }
  TU.on('player:drown', death('drowned'));
  TU.on('player:bledOut', death('bled'));
  TU.on('player:crushed', death('crushed'));

  function summary() {
    var P = TU.player.state, run = TU.run || {};
    return {
      seed: run.seed, won: !!run.won, reason: run.reason || null, timeS: run.t || 0,
      maxDepthM: P.maxDepth, ropeM: TU.player.ropeLength(), airLeftBar: P.airTotal,
      creaturesSeen: TU.creatures.seenCount(), creaturesTotal: TU.creatures.total(),
      distM: P.dist, waypoints: P.wpCount, siltOuts: P.siltOuts, wallHits: P.wallHits,
      loadout: run.loadout ? run.loadout.tank : null,
      difficulty: run.difficulty || null, tutorial: !!run.tutorial,
      // endless: true for a leg that ends past a ring without touching a new one (the results screen then
      // says "past the bottom"). A leg that ends at a new ring in the Beyond is a normal 'bottom'
      // result with the same END RUN / KEEP DIVING choice; endlessRun says it was still an endless leg.
      endless: !!run.endless && run.reason !== 'bottom', endlessRun: !!run.endless, leg: run.leg || 1, bottomReached: !!run.bottomReached,
      // endless mode: the deepest zone (5+ = the Beyond), how many rings deep, and whether the way
      // back up has collapsed behind you (the results screen can say so)
      maxZone: run.maxZone || 0, maxZoneName: zoneName(run.maxZone || 0), segment: run.endSeg || 0,
      beyond: (run.maxZone || 0) >= 5, sealedAbove: (run.endSeg || 0) >= 2,
      endlessNote: (run.endSeg || 0) >= 2 ? 'Every shaft above the last ring collapsed behind you. Marv had to send the long rope.' : null
    };
  }
  function zoneName(z) { return TU.cave.zoneName ? TU.cave.zoneName(z) : (TU.util.ZONE_NAMES[z] || ''); }

  /* ------------------------------------------------------------------ */
  /* Game flow                                                           */
  /* ------------------------------------------------------------------ */
  var lastOpts = {};
  function resetAll(run) { ordered(INIT_ORDER).forEach(function (s) { call(s, 'reset', run); }); }
  function makeRun(opts) {
    var seed = opts.seed != null ? (opts.seed >>> 0) : (TU.mix32((Date.now() & 0xffffffff) >>> 0) >>> 0);
    var difficulty = opts.difficulty || 'standard', layout = null;
    try { layout = TU.gen ? TU.gen.generate(seed, { difficulty: difficulty, modifiers: opts.modifiers || [] }) : null; } catch (e) { console.error('[TU] generator failed', e); }
    return {
      seed: seed, difficulty: difficulty, layout: layout, modifiers: opts.modifiers || [],
      loadout: JSON.parse(JSON.stringify(TU.save.data.loadout)), upgrades: JSON.parse(JSON.stringify(TU.save.data.upgrades)),
      touch: !!opts.touch, tutorial: !!opts.tutorial, startedAt: Date.now(), t: 0, area: null, areasSeen: {},
      ended: false, won: false, reason: null, endless: false, leg: 1, legStartT: 0, bottomReached: false,
      endSeg: 0, maxZone: 0
    };
  }
  TU.define('game', {
    startDive: function (opts) {
      opts = opts || {}; lastOpts = opts;
      TU.audio.unlock(); // must happen inside the click that started the dive
      TU.run = makeRun(opts);
      resetAll(TU.run);
      // The practice dive runs in state 'dive' too (player input and the HUD only listen in 'dive').
      TU.setState('dive', { run: TU.run });
      TU.emit('run:start', { run: TU.run });
    },
    pause: function () { if (TU.state.is('dive')) TU.setState('paused'); },
    resume: function () { if (TU.state.is('paused')) TU.setState('dive'); },
    restart: function () { TU.game.startDive(lastOpts); },
    endRun: function (info) {
      var run = TU.run; if (!run || run.ended) return;
      info = info || {};
      run.ended = true;
      run.reason = info.reason || (info.won ? 'bottom' : 'quit');
      // Calling the dive after the bottom (endless mode) still counts as a good dive.
      run.won = !!info.won || (run.endless && run.reason === 'quit');
      if (run.won && (run.reason === 'bottom' || run.reason === 'debug')) run.bottomReached = true;
      if (run.endless && run.reason === 'quit') run.reason = 'endless';
      var s = summary();
      if (!run.tutorial) TU.progress.recordRun(s, run.leg > 1 ? { continued: true, prevTimeS: run.legStartT } : null);
      TU.emit('run:end', { won: run.won, reason: run.reason, summary: s });
      TU.setState(run.won ? 'results' : 'dead', { summary: s });
    },
    // KEEP DIVING: after a ring, carry on with the same air, rope and kit. The floor of the ring
    // chamber breaks open over the next few seconds (TU.cave.endless) and a new, deeper cave
    // (a new segment from the run seed + its number) leads down to the next ring. The run is open
    // again (endless): it ends at the next ring (the same choice), when you call it, or when you die.
    keepDiving: function () {
      var run = TU.run;
      if (!run || !run.ended || !run.won) return false;
      run.ended = false; run.won = false; run.reason = null; run.endless = true;
      run.leg = (run.leg || 1) + 1; run.legStartT = run.t;
      var next = (run.endSeg || 0) + 1, r = null;
      if (!run.tutorial && TU.cave.endless && TU.cave.endless.descend) {
        try { r = TU.cave.endless.descend(next, { seed: run.seed, difficulty: run.difficulty }); } catch (e) { console.error('[TU] endless descend failed', e); r = null; }
      }
      if (r && r.ok) run.endSeg = next;
      TU.setState('dive', { run: run, continued: true });
      TU.emit('run:continue', { run: run, leg: run.leg, segment: run.endSeg });
      if (!r || !r.ok) TU.emit('ui:msg', { text: 'KEEP DIVING. The water goes on past the map.', dur: 4 });
      return true;
    },
    toTitle: function () { TU.run = null; resetAll(makeRun({ seed: 1 })); TU.run = null; TU.setState('title'); },
    openLoadout: function () { TU.setState('loadout'); }
  });

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  var initList = ordered(INIT_ORDER).slice();
  for (var bi = 0; bi < initList.length; bi++) {
    var sys = initList[bi];
    try { call(sys, 'init'); } catch (e) {
      console.error('[TU] ' + sys.name + '.init failed:', e);
      if (e && e.tuWebGL) { bootError('WebGL is not available in this browser, so the dive cannot render.'); return; }
      if (ESSENTIAL[sys.name]) { bootError('Something went wrong while loading: ' + errText(e) + ' (module: ' + sys.name + ')'); return; }
      disable(sys.name, e);
      softError('Something went wrong while loading: ' + errText(e) + ' (module: ' + sys.name + '). The game runs without it.');
    }
  }
  booting = false;
  TU.setState('title');

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */
  var acc = 0, last = performance.now(), frameNo = 0;
  function stepOnce(dt) {
    var list = ordered(UPDATE_ORDER), i;
    if (TU.state.simulating()) {
      for (i = 0; i < list.length; i++) call(list[i], 'update', dt);
      try { directorStep(dt); } catch (e) { if ((fails.director = (fails.director || 0) + 1) <= 3) console.error('[TU] director failed:', e); }
    } else if (IDLE_STATES[TU.state.current]) {
      for (i = 0; i < list.length; i++) call(list[i], 'idle', dt);
    }
  }
  function frameHooks(dt) { var list = ordered(UPDATE_ORDER); for (var i = 0; i < list.length; i++) call(list[i], 'frame', dt); }
  function draw() {
    // The camp and the story screen cover the whole view: drawing the cave behind them is wasted work.
    var covered = false;
    try { covered = !!TU.ui.coversScreen(); } catch (e) { covered = false; }
    if (!covered) TU.fx.render();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    var L = TU.cfg.loop;
    var dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) dt = L.fixedDt; dt = Math.min(dt, L.maxFrameDt);
    frameNo++;
    if (TU.state.current !== 'paused') {
      acc += dt;
      var n = 0;
      while (acc >= L.fixedDt && n < L.maxSteps) { stepOnce(L.fixedDt); acc -= L.fixedDt; n++; }
      if (n >= L.maxSteps) acc = 0; // drop the backlog instead of spiraling
    }
    frameHooks(dt);
    try { draw(); } catch (e) { if ((fails.render = (fails.render || 0) + 1) <= 3) console.error('[TU] render failed:', e); }
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------------ */
  /* Debug hooks (tests and filming)                                     */
  /* ------------------------------------------------------------------ */
  function getStats() {
    var P = TU.player.state, env = P.env || {};
    return {
      state: TU.state.current, s: env.s, pathId: env.pathId, area: env.area, zone: P.zone, depth: P.depth, air: P.air, airTotal: P.airTotal,
      tanks: P.tanks.map(function (t) { return +t.bar.toFixed(1); }), battery: P.battery, stamina: P.stamina, panic: P.panic, silt: P.silt,
      surfaced: P.surfaced, speed: P.speed, rope: TU.player.ropeLength(), inBranch: env.pathId === 'branch',
      seen: TU.creatures.seenCount(), creatures: TU.creatures.total(), pos: [P.pos.x, P.pos.y, P.pos.z], vestAir: P.vestAir, wp: P.wpCount,
      runT: TU.run ? TU.run.t : 0, seed: TU.run ? TU.run.seed : null, layoutOk: !!(TU.run && TU.run.layout && TU.run.layout.ok),
      health: P.health, endless: !!(TU.run && TU.run.endless), tutorial: !!(TU.run && TU.run.tutorial), disabled: Object.keys(disabled),
      endSeg: TU.run ? TU.run.endSeg || 0 : 0, maxZone: TU.run ? TU.run.maxZone || 0 : 0,
      zoneAt: TU.cave.zoneAt ? TU.cave.zoneAt(P.pos).index : P.zone, building: !!(TU.cave.endless && TU.cave.endless.building())
    };
  }
  window.__debug = {
    TU: TU,
    getStats: getStats,
    state: getStats,
    setState: function (s, data) { TU.setState(s, data); return TU.state.current; },
    start: function (opts) { TU.game.startDive(opts || {}); return getStats(); },
    win: function () { TU.game.endRun({ won: true, reason: 'debug' }); },
    // teleport('entrance'|'mid'|'junction'|'pocket'|'pocketSurface'|'squeeze'|'silt'|'drop'|'deep'|'end'|'stalactites'|'branch'|'branchEnd'|'bottom'|meters, {dy, yaw, pitch, low})
    teleport: function (where, opts) { var sp = TU.cave.spot(where, opts); if (!sp) return null; TU.player.teleport(sp.pos, sp.yaw, sp.pitch); return sp.s; },
    look: function (yaw, pitch) { TU.player.look(yaw, pitch); },
    lookAt: function (p) { var P = TU.player.state; var d = { x: p.x - P.pos.x, y: p.y - P.pos.y, z: p.z - P.pos.z }; var yp = TU.util.yawPitchOf(d); TU.player.look(yp.yaw, yp.pitch); },
    lookAtCore: function () { var b = TU.cave.features.bottom; if (b) window.__debug.lookAt(b.pos); },
    set: function (k, v) { if (k === 'air') TU.player.setAir(v, false); else TU.player.state[k] = v; },
    setAir: function (v, all) { TU.player.setAir(v, all !== false); },
    get: function (k) { return k === 't' ? (TU.run ? TU.run.t : 0) : TU.player.state[k]; },
    silt: function (n) { TU.fx.spawnSilt(n || 300, { pos: TU.player.state.pos, burst: true }); },
    // Run n fixed steps right now (only while diving).
    step: function (n) { n = n || 1; for (var i = 0; i < n && TU.state.simulating(); i++) stepOnce(TU.cfg.loop.fixedDt); return getStats(); },
    // Hold keys (KeyboardEvent codes) for sec seconds of game time, then release them.
    sim: function (sec, held) {
      held = held || []; var keys = TU.player.input.keys;
      held.forEach(function (k) { keys[k] = true; });
      var n = Math.round(sec / TU.cfg.loop.fixedDt);
      for (var i = 0; i < n && TU.state.simulating(); i++) stepOnce(TU.cfg.loop.fixedDt);
      held.forEach(function (k) { keys[k] = false; });
      return getStats();
    },
    // Draw one frame now (so a screenshot shows the latest state).
    render: function () { frameHooks(TU.cfg.loop.fixedDt); draw(); return true; },
    // Hide HUD and mask overlays for clean shots.
    screenshotMode: function (on) { TU.fx.screenshotMode(on); TU.ui.setHudVisible(!on && TU.state.is('dive')); },
    gen: function (seed, opts) { return TU.gen.generate(seed, opts); },
    // Which systems were switched off after an error.
    disabled: function () { return Object.keys(disabled); }
  };
})();
