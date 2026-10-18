/*
 * main.js: boots the game, runs the loop, and owns the flow of a run.
 *
 *   Boot:   check three.js and WebGL, call every module's init() in INIT_ORDER, go to 'title'.
 *   Loop:   each animation frame, run fixed simulation steps (TU.cfg.loop.fixedDt) and then render.
 *           While diving: update(dt) of each system in UPDATE_ORDER, then the run director.
 *           In menus: idle(dt) so the title screen stays alive. Paused: nothing moves.
 *           After the steps: frame(dt) of each system once, then the renderer draws.
 *   Flow:   TU.game.startDive / pause / resume / restart / endRun / toTitle / openLoadout.
 *   Director: tracks which cave area you are in (area banners), the win touch, drowning, run stats.
 *   Debug:  window.__debug for tests and filming (teleport, step, sim, setState, getStats, ...).
 */
(function () {
  'use strict';
  var TU = window.TU;
  var INIT_ORDER = ['fx', 'cave', 'creatures', 'player', 'audio', 'ui'];
  var UPDATE_ORDER = ['player', 'cave', 'creatures', 'fx', 'audio', 'ui'];
  var IDLE_STATES = { title: 1, loadout: 1, results: 1, dead: 1 };

  function bootError(text) {
    var el = document.getElementById('boot-err');
    if (el) { el.textContent = text; el.style.display = 'flex'; }
  }
  if (!window.THREE) { bootError('Could not load the 3D engine (three.js from cdnjs). Check your connection and reload.'); return; }

  // Systems in a given order, plus any extra systems a module registered that are not listed.
  function ordered(list) {
    var out = [], seen = {};
    list.forEach(function (n) { if (TU.systems[n]) { out.push(TU.systems[n]); seen[n] = 1; } });
    Object.keys(TU.systems).forEach(function (n) { if (!seen[n] && n !== 'director') out.push(TU.systems[n]); });
    return out;
  }
  function call(sys, hook, arg) {
    if (!sys[hook]) return;
    try { sys[hook](arg); } catch (e) { console.error('[TU] ' + sys.name + '.' + hook + ' failed:', e); throw e; }
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
    // Win: touch the thing at the bottom.
    var bottom = TU.cave.features.bottom;
    if (bottom && P.pos.distanceTo(bottom.pos) < bottom.radius) TU.game.endRun({ won: true, reason: 'bottom' });
  }
  TU.on('player:drown', function () { if (TU.state.is('dive')) TU.game.endRun({ won: false, reason: 'drowned' }); });

  function summary() {
    var P = TU.player.state, run = TU.run || {};
    return {
      seed: run.seed, won: !!run.won, reason: run.reason || null, timeS: run.t || 0,
      maxDepthM: P.maxDepth, ropeM: TU.player.ropeLength(), airLeftBar: P.airTotal,
      creaturesSeen: TU.creatures.seenCount(), creaturesTotal: TU.creatures.total(),
      distM: P.dist, waypoints: P.wpCount, siltOuts: P.siltOuts, wallHits: P.wallHits,
      loadout: run.loadout ? run.loadout.tank : null
    };
  }

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
      touch: !!opts.touch, startedAt: Date.now(), t: 0, area: null, areasSeen: {}, ended: false, won: false, reason: null
    };
  }
  TU.define('game', {
    startDive: function (opts) {
      opts = opts || {}; lastOpts = opts;
      TU.audio.unlock(); // must happen inside the click that started the dive
      TU.run = makeRun(opts);
      resetAll(TU.run);
      TU.setState('dive', { run: TU.run });
      TU.emit('run:start', { run: TU.run });
    },
    pause: function () { if (TU.state.is('dive')) TU.setState('paused'); },
    resume: function () { if (TU.state.is('paused')) TU.setState('dive'); },
    restart: function () { TU.game.startDive(lastOpts); },
    endRun: function (info) {
      var run = TU.run; if (!run || run.ended) return;
      run.ended = true; run.won = !!info.won; run.reason = info.reason || (info.won ? 'bottom' : 'quit');
      var s = summary();
      TU.progress.recordRun(s);
      TU.emit('run:end', { won: run.won, reason: run.reason, summary: s });
      TU.setState(run.won ? 'results' : 'dead', { summary: s });
    },
    toTitle: function () { TU.run = null; resetAll(makeRun({ seed: 1 })); TU.run = null; TU.setState('title'); },
    openLoadout: function () { TU.setState('loadout'); }
  });

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  try {
    ordered(INIT_ORDER).forEach(function (s) { call(s, 'init'); });
  } catch (e) {
    bootError('WebGL is not available in this browser, so the dive cannot render.');
    console.error(e);
    return;
  }
  TU.setState('title');

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */
  var acc = 0, last = performance.now(), frameNo = 0;
  function stepOnce(dt) {
    if (TU.state.simulating()) {
      var list = ordered(UPDATE_ORDER);
      for (var i = 0; i < list.length; i++) call(list[i], 'update', dt);
      directorStep(dt);
    } else if (IDLE_STATES[TU.state.current]) {
      var l2 = ordered(UPDATE_ORDER);
      for (var j = 0; j < l2.length; j++) call(l2[j], 'idle', dt);
    }
  }
  function frameHooks(dt) { var list = ordered(UPDATE_ORDER); for (var i = 0; i < list.length; i++) call(list[i], 'frame', dt); }
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
    TU.fx.render();
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
      runT: TU.run ? TU.run.t : 0, seed: TU.run ? TU.run.seed : null, layoutOk: !!(TU.run && TU.run.layout && TU.run.layout.ok)
    };
  }
  window.__debug = {
    TU: TU,
    getStats: getStats,
    state: getStats,
    setState: function (s, data) { TU.setState(s, data); return TU.state.current; },
    start: function (opts) { TU.game.startDive(opts || {}); return getStats(); },
    win: function () { TU.game.endRun({ won: true, reason: 'debug' }); },
    // teleport('entrance'|'mid'|'junction'|'pocket'|'pocketSurface'|'squeeze'|'silt'|'drop'|'deep'|'end'|'stalactites'|'branch'|'branchEnd'|meters, {dy, yaw, pitch, low})
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
    render: function () { frameHooks(TU.cfg.loop.fixedDt); TU.fx.render(); return true; },
    // Hide HUD and mask overlays for clean shots.
    screenshotMode: function (on) { TU.fx.screenshotMode(on); TU.ui.setHudVisible(!on && TU.state.is('dive')); },
    gen: function (seed, opts) { return TU.gen.generate(seed, opts); }
  };
})();
