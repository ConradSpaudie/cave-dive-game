/*
 * core.js: the shared foundation every other file builds on.
 *
 * What lives here:
 *   TU            the one global namespace (window.TU). No ES modules: every file is a plain script.
 *   TU.util       small math helpers (clamp, lerp, smooth step, time formatting, depth zones).
 *   TU.noise      seeded simplex noise (n3, fbm) used for rock shapes, drift and shake.
 *   TU.rng        seeded random numbers (xoshiro128**, the same algorithm as the cave generator).
 *   TU.on/off/emit  a tiny event bus. Modules talk through events instead of calling each other.
 *   TU.cfg        every tunable number in the game, in one place, with units in comments.
 *   TU.state      the game state machine ('title', 'loadout', 'tutorial', 'dive', 'paused', 'results', 'dead').
 *   TU.save       localStorage wrapper (always inside try/catch) for progress, money, upgrades, logbook, leaderboards, settings.
 *   TU.logbook / TU.progress  helpers that read and write the save.
 *   TU.addSystem  how a module registers its per-step hooks (init, reset, update, idle, frame).
 *   TU.define     how a module fills in its public API. core.js creates safe stub versions of every
 *                 module API first, so the game still runs if a module is missing a function.
 *   TU.css / TU.el  helpers so each module injects its own CSS and DOM (no shared HTML to fight over).
 *   TU.tex        shared procedural textures (glow, dot, bubble, silt, rock normal map, water, labels).
 *
 * Conventions (see CONTRACT.md): meters, seconds, Y is up, the cave entrance water surface is y = 0,
 * depth = -y. Air is in bar, battery and stamina and panic are 0 to 100.
 * This file must not crash if three.js failed to load: anything that needs THREE is created lazily.
 */
(function () {
  'use strict';

  var TU = window.TU = window.TU || {};
  TU.version = '0.2.0';

  /* ------------------------------------------------------------------ */
  /* Math helpers                                                        */
  /* ------------------------------------------------------------------ */
  var ZONE_NAMES = ['The Mouth', 'Twilight Throat', 'The Black Galleries', 'The Sulfur Deep', 'The Old Water'];
  var ZONE_TOP_M = [0, 20, 60, 120, 200];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // Smooth 0..1 ramp between a and b (works with a > b too, then it ramps down).
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  // Mix two [r,g,b] arrays.
  function mix3(a, b, t) { t = clamp(t, 0, 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // Frame-rate independent approach: move a toward b with a rate per second.
  function damp(a, b, rate, dt) { return a + (b - a) * (1 - Math.exp(-rate * dt)); }
  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  // Depth zone index 0..4 from depth in meters (same boundaries as the generator).
  function zoneOfDepth(m) { return m < 20 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 200 ? 3 : 4; }

  TU.util = {
    clamp: clamp, lerp: lerp, smooth: smooth, mix3: mix3, damp: damp, fmtTime: fmtTime,
    zoneOfDepth: zoneOfDepth, ZONE_NAMES: ZONE_NAMES, ZONE_TOP_M: ZONE_TOP_M,
    reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    // Make a THREE.Vector3 if three.js is loaded, else a plain {x,y,z} (keeps stubs crash-free).
    v3: function (x, y, z) { return window.THREE ? new THREE.Vector3(x || 0, y || 0, z || 0) : { x: x || 0, y: y || 0, z: z || 0 }; },
    // Yaw and pitch (radians) that look along a direction. Yaw 0 looks down -Z.
    yawPitchOf: function (d) { var l = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) || 1; return { yaw: Math.atan2(-d.x / l, -d.z / l), pitch: Math.asin(clamp(d.y / l, -1, 1)) }; }
  };

  /* ------------------------------------------------------------------ */
  /* Seeded simplex noise (moved unchanged from the prototype)           */
  /* ------------------------------------------------------------------ */
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  TU.noise = (function () {
    var g = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
    var perm = new Uint8Array(512), pm = new Uint8Array(512);
    var r = mulberry(77), p = [], i;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
    var F3 = 1 / 3, G3 = 1 / 6;
    function n3(x, y, z) {
      var s = (x + y + z) * F3;
      var i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
      var t = (i + j + k) * G3;
      var x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
      var i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      var x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      var x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      var x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      var ii = i & 255, jj = j & 255, kk = k & 255;
      var n = 0, tt, gi;
      tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (tt > 0) { gi = pm[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x0 + g[gi + 1] * y0 + g[gi + 2] * z0); }
      tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (tt > 0) { gi = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x1 + g[gi + 1] * y1 + g[gi + 2] * z1); }
      tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (tt > 0) { gi = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x2 + g[gi + 1] * y2 + g[gi + 2] * z2); }
      tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (tt > 0) { gi = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x3 + g[gi + 1] * y3 + g[gi + 2] * z3); }
      return 32 * n;
    }
    function fbm(x, y, z, o) { var a = 0.5, f = 1, s = 0; for (var i = 0; i < o; i++) { s += a * n3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s; }
    return { n3: n3, fbm: fbm };
  })();

  /* ------------------------------------------------------------------ */
  /* Seeded RNG: xoshiro128** seeded by SplitMix32 (same as generator.js) */
  /* ------------------------------------------------------------------ */
  function mix32(z) {
    z = z >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B);
    z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35);
    return (z ^ (z >>> 16)) >>> 0;
  }
  function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }
  // TU.rng(seed, stream) gives an independent random stream. Same seed and stream, same numbers.
  // Streams used so far: 0 run meta, 10 cave dressing, 20 creatures, 30 fx particles, 40 player.
  function Rng(seed, stream) {
    var sm = ((seed >>> 0) ^ Math.imul((stream || 0) >>> 0, 0x9E3779B9)) >>> 0;
    this.s = new Uint32Array(4);
    for (var i = 0; i < 4; i++) { sm = (sm + 0x9E3779B9) >>> 0; this.s[i] = mix32(sm); }
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) this.s[0] = 1;
  }
  Rng.prototype.next = function () {
    var s = this.s;
    var result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    var t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = rotl(s[3], 11);
    return result;
  };
  Rng.prototype.float = function () { return this.next() / 4294967296; };        // [0, 1)
  Rng.prototype.below = function (n) { var th = (4294967296 - n) % n; for (;;) { var r = this.next(); if (r >= th) return r % n; } };
  Rng.prototype.range = function (lo, hi) { return lo + this.float() * (hi - lo); }; // float in [lo, hi)
  Rng.prototype.int = function (lo, hi) { return lo + this.below(hi - lo + 1); };     // int in [lo, hi]
  Rng.prototype.chance = function (p) { return this.float() < p; };                 // p is 0..1
  Rng.prototype.pick = function (arr) { return arr[this.below(arr.length)]; };
  // A plain function () -> [0,1), handy for code written against Math.random.
  Rng.prototype.fn = function () { var self = this; return function () { return self.float(); }; };
  TU.Rng = Rng;
  TU.rng = function (seed, stream) { return new Rng(seed, stream); };
  TU.mix32 = mix32;

  /* ------------------------------------------------------------------ */
  /* Event bus                                                           */
  /* ------------------------------------------------------------------ */
  var handlers = {};
  TU.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); return fn; };
  TU.off = function (name, fn) { var a = handlers[name]; if (!a) return; var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  TU.once = function (name, fn) { var w = function (p) { TU.off(name, w); fn(p); }; return TU.on(name, w); };
  // Handlers run synchronously, in the order they subscribed. One bad handler never stops the others.
  TU.emit = function (name, payload) {
    var a = handlers[name]; if (!a) return;
    a = a.slice();
    for (var i = 0; i < a.length; i++) {
      try { a[i](payload || {}); } catch (e) { if (window.console) console.error('[TU] handler for "' + name + '" failed:', e); }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Config: every tunable number. Units in comments.                    */
  /* ------------------------------------------------------------------ */
  TU.cfg = {
    loop: {
      fixedDt: 1 / 60,       // s, simulation step
      maxSteps: 5,           // max simulation steps per rendered frame (avoids a spiral after a hitch)
      maxFrameDt: 0.25       // s, longer gaps (tab switch) are clamped
    },
    world: {
      surfaceY: 0,           // m, the entrance water surface. depth = surfaceY - y
      playerRadius: 0.32     // m, collision radius of the diver's head and body
    },
    // Swim feel. The first 8 keys are the pause-menu sliders (see tuneUI below).
    swim: {
      kick: 4.6,             // m/s^2, peak push of one fin kick
      interval: 0.82,        // s, time between kicks while holding a move key
      drag1: 0.35,           // 1/s, glide drag (always on)
      drag2: 0.45,           // 1/m, extra drag that grows with speed
      buoy: 1.4,             // m/s^2 per unit of vest offset from neutral
      sens: 1.0,             // mouse look multiplier
      smooth: 18,            // 1/s, look smoothing (higher = snappier)
      fov: 75,               // degrees, camera field of view
      kickTime: 0.32,        // s, length of one kick's push
      hold: 0.4,             // m/s^2, small constant push while a move key is held
      strafe: 0.8,           // sideways kicks are this fraction of forward
      vertical: 0.9,         // Space / C vertical kick fraction
      sprintKick: 1.8,       // x kick strength while sprinting
      sprintInterval: 0.6,   // x kick interval while sprinting (faster rhythm)
      slowInterval: 1.25,    // x kick interval while slow breathing
      squeezeThrust: 0.5,    // x push inside a squeeze
      squeezeDrag: 1.6,      // x drag inside a squeeze
      wallHitMin: 0.75,      // m/s, impact speed that counts as a wall hit
      headroom: 0.25,        // m, how far your head can poke above an air pocket surface
      floatHeight: 0.12,     // m, where you bob above the surface when surfaced
      lookLimit: 1.45        // rad, max look up or down
    },
    tuneUI: [ // [key, label, min, max, step] for the pause menu sliders (keys live in cfg.swim)
      ['kick', 'Kick strength', 2, 8, 0.1], ['interval', 'Kick rhythm (s)', 0.45, 1.3, 0.01], ['drag1', 'Glide drag', 0.1, 1.0, 0.01], ['drag2', 'Speed drag', 0.1, 1.2, 0.01],
      ['buoy', 'Buoyancy force', 0.4, 3.0, 0.05], ['sens', 'Look sensitivity', 0.3, 2.5, 0.05], ['smooth', 'Look smoothing', 4, 40, 1], ['fov', 'Field of view', 60, 95, 1]
    ],
    air: {
      tankBar: 200,          // bar in one full tank at upgrade level 1 (10 minutes calm)
      baseRate: 200 / 600,   // bar/s at calm breathing (one tank lasts 600 s)
      sprintMul: 2,          // x air while sprinting
      panicMul: 0.8,         // at panic 100 you use 80% more air
      slowMul: 0.6,          // x air while slow breathing
      depthPer: 100,         // m, air use grows by 1x per this many meters
      inflateCost: 1.2,      // bar/s while breathing into the vest
      deflateRefund: 0.5,    // bar/s you get back while sucking vest air back
      refillRate: 12,        // bar/s refill while surfaced in air
      lowAir: 40,            // bar, warning beeps and panic start
      criticalAir: 15,       // bar, faster beeps
      drownSeconds: 4,       // s with no air before you drown
      fastDrainMul: 3        // x drain for the "fast drain demo" option
    },
    vest: {
      neutral: 0.4,          // vest fill (0..1) where you neither rise nor sink
      inflateRate: 0.12,     // fill per second while holding B
      deflateRate: 0.15      // fill per second while holding V
    },
    stamina: {
      max: 100, sprintDrain: 12, regen: 6, regenSurfaced: 14, // per second
      lockBelow: 4, unlockAbove: 25                            // sprint locks out when nearly empty
    },
    light: {
      batteryMinutes: 8,     // min of light at battery upgrade level 1
      lowAt: 20,             // %, low battery warning
      flickerBelow: 0.2,     // fraction, flicker starts below this
      intensity: 2.6, range: 15, angle: 0.40, penumbra: 0.55, decay: 1.35, // spot light
      lag: 7,                // 1/s, how fast the beam follows your view
      sway: 0.012,           // beam wobble, grows with panic
      bounce: 0.55           // intensity of the soft bounce light where the beam hits
    },
    panic: {
      calm: -2.2, sprint: 4, dark: 3.2, lowAir: 2.5, silt: 3, squeeze: 1.4, slow: -9, surfaced: -8, // per second
      hitBase: 6, hitScale: 16, // added on a wall hit
      siltPanicAt: 0.45      // silt visibility (0..1) that adds panic
    },
    breath: {
      period: 4.8, slowPeriod: 7.2, surfacedPeriod: 4.2, // s per breath
      panicSpeed: 1.4,       // at panic 100 breaths are 2.4x faster
      sprintMul: 0.62,       // x period while sprinting
      inhale: 0.36, exhale: 0.46 // fraction of the period
    },
    silt: {
      speedThreshold: 1.2,   // m/s, faster than this near a silty floor kicks silt up
      floorRange: 1.9,       // m above the floor where kicks disturb silt
      minSiltiness: 0.4,     // floor siltiness (0..1) needed to stir it
      outAt: 0.5, clearAt: 0.2 // visibility thresholds for a "silt out" and for it ending
    },
    narcosis: { start: 28, full: 46, msgDepth: 30 }, // m
    loadouts: { // tank options from the design (Proposed Answers #33)
      light: { tanks: 1, swimMul: 1.08, staminaMul: 1.15, label: 'Light', desc: '1 tank. Fastest, most stamina.' },
      standard: { tanks: 2, swimMul: 1.0, staminaMul: 1.0, label: 'Standard', desc: '2 tanks. The normal choice.' },
      heavy: { tanks: 3, swimMul: 0.88, staminaMul: 0.8, label: 'Heavy', desc: '3 tanks. Slow, tires fast, lots of air.' }
    },
    upgrades: { // per level 1..5 (index 0 = level 1). From Design/Economy and Progression.md
      tank: { airMinutes: [10, 11, 12, 13.5, 15], cost: [0, 300, 900, 2500, 6000] },
      stamina: { max: [100, 110, 120, 135, 150], regen: [1, 1.05, 1.1, 1.2, 1.3], cost: [0, 250, 800, 2200, 5500] },
      swim: { mul: [1, 1.04, 1.08, 1.12, 1.15], cost: [0, 300, 900, 2500, 6000] },
      battery: { minutes: [8, 11, 14, 18, 24], cost: [0, 200, 700, 2000, 5000] },
      mask: { cost: [0, 400, 1000, 2800, 6500] },
      rope: { cost: [0, 300, 900, 2400, 6000] },
      lantern: { slots: [0, 2, 4, 6, 8, 10], cost: [400, 800, 1800, 3500, 7000] } // level 0 = not bought
    },
    rope: { pointSpacing: 1.0, retractDist: 0.6, maxPoints: 2400, radius: 0.011 }, // m
    waypoints: { max: 64, lights: 3, dropAhead: 0.5 },
    fx: {
      fogDensity: 0.052,     // base exp2 fog density underwater
      fogAir: 0.03,          // fog density when your head is in air
      fogDeep: 0x020a0b, fogMouth: 0x0d3c44, fogSilt: 0x1a140c, fogAir2: 0x040605,
      snowCount: 1800, snowBox: 14, bubbleCount: 360, siltCount: 1500,
      exposure: 1.15, pixelRatioMax: 1.5
    },
    debug: { enabled: true }
  };
  // A frozen copy of the defaults so "Reset feel" can restore them.
  TU.cfgDefaults = JSON.parse(JSON.stringify(TU.cfg));

  /* ------------------------------------------------------------------ */
  /* Game state machine                                                  */
  /* ------------------------------------------------------------------ */
  // boot -> title -> (loadout) -> dive <-> paused -> results | dead -> title or dive again.
  // 'tutorial' is reserved for the practice dive (not built yet).
  TU.STATES = ['boot', 'title', 'loadout', 'tutorial', 'dive', 'paused', 'results', 'dead'];
  TU.state = {
    current: 'boot', previous: null, data: null,
    is: function (name) { return TU.state.current === name; },
    // True when the simulation should run (a dive or the tutorial).
    simulating: function () { return TU.state.current === 'dive' || TU.state.current === 'tutorial'; }
  };
  TU.setState = function (to, data) {
    if (TU.STATES.indexOf(to) < 0) { console.error('[TU] unknown state ' + to); return; }
    var from = TU.state.current;
    TU.state.previous = from; TU.state.current = to; TU.state.data = data || null;
    TU.emit('state:change', { from: from, to: to, data: data || null });
  };

  /* ------------------------------------------------------------------ */
  /* Save data (localStorage, always wrapped in try/catch)               */
  /* ------------------------------------------------------------------ */
  function saveDefaults() {
    return {
      version: 1,
      progress: { runs: 0, bottoms: 0, deepestM: 0, zonesReached: [false, false, false, false, false], tutorialDone: false, timeInCaveS: 0 },
      money: { cash: 0, fins: 0 },
      upgrades: { tank: 1, stamina: 1, swim: 1, battery: 1, mask: 1, rope: 1, lantern: 0 },
      loadout: { tank: 'standard', tape: 3, flexTape: 0, lantern: false, measuringTape: true, camera: false, glowSticks: 0 },
      logbook: { entries: {} },
      leaderboards: { deepest: [], fastest: [], airLeft: [], explored: [], longest: [] },
      settings: { muted: false, fastDrain: false, tips: true, tune: {}, hudHidden: false }
    };
  }
  function deepMerge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    for (var k in extra) {
      if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k])) deepMerge(base[k], extra[k]);
      else base[k] = extra[k];
    }
    return base;
  }
  TU.save = {
    key: 'tiedUnder.save.v1',
    data: saveDefaults(),
    defaults: saveDefaults,
    load: function () {
      var d = saveDefaults();
      try { var raw = window.localStorage.getItem(TU.save.key); if (raw) deepMerge(d, JSON.parse(raw)); } catch (e) { /* private mode or blocked storage: play without saving */ }
      TU.save.data = d;
      return d;
    },
    write: function () {
      try { window.localStorage.setItem(TU.save.key, JSON.stringify(TU.save.data)); } catch (e) { /* ignore */ }
      TU.emit('save:changed', { data: TU.save.data });
    },
    // get('settings.muted'), set('money.cash', 100). set() writes to storage straight away.
    get: function (path) { var o = TU.save.data, p = path.split('.'); for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; },
    set: function (path, value) {
      var o = TU.save.data, p = path.split('.');
      for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null || typeof o[p[i]] !== 'object') o[p[i]] = {}; o = o[p[i]]; }
      o[p[p.length - 1]] = value; TU.save.write();
    },
    reset: function () { TU.save.data = saveDefaults(); TU.save.write(); }
  };

  /* ------------------------------------------------------------------ */
  /* Logbook and progression helpers (all state lives in TU.save.data)   */
  /* ------------------------------------------------------------------ */
  TU.logbook = {
    // entry: { speciesId, sizeM, zone, depthM, photo:boolean } -> returns { first, record }
    add: function (entry) {
      var book = TU.save.data.logbook.entries, id = entry.speciesId;
      var e = book[id], first = !e, record = false;
      if (!e) e = book[id] = { speciesId: id, count: 0, firstRun: TU.save.data.progress.runs, minSizeM: null, maxSizeM: null, photos: 0, lastDepthM: 0 };
      e.count++;
      if (entry.sizeM != null) {
        if (e.maxSizeM == null || entry.sizeM > e.maxSizeM) { e.maxSizeM = entry.sizeM; record = !first; }
        if (e.minSizeM == null || entry.sizeM < e.minSizeM) { e.minSizeM = entry.sizeM; record = record || !first; }
      }
      if (entry.photo) e.photos++;
      if (entry.depthM != null) e.lastDepthM = entry.depthM;
      TU.save.write();
      var out = { speciesId: id, sizeM: entry.sizeM == null ? null : entry.sizeM, first: first, record: record, entry: e };
      TU.emit('creature:logged', out);
      return out;
    },
    has: function (id) { return !!TU.save.data.logbook.entries[id]; },
    get: function (id) { return TU.save.data.logbook.entries[id] || null; },
    count: function () { return Object.keys(TU.save.data.logbook.entries).length; }
  };
  TU.progress = {
    // Level 1..5 of an upgrade track.
    level: function (track) { return TU.save.data.upgrades[track] || 0; },
    // Value from cfg.upgrades[track][field] for the current level.
    value: function (track, field) {
      var t = TU.cfg.upgrades[track]; if (!t || !t[field]) return undefined;
      var lv = TU.progress.level(track), arr = t[field];
      return track === 'lantern' ? arr[clamp(lv, 0, arr.length - 1)] : arr[clamp(lv - 1, 0, arr.length - 1)];
    },
    // Called by main.js when a run ends. Updates totals and the 5 leaderboards (top 10 each).
    recordRun: function (s) {
      var d = TU.save.data, p = d.progress, now = Date.now();
      p.runs++; p.timeInCaveS += s.timeS || 0;
      if (s.maxDepthM > p.deepestM) p.deepestM = s.maxDepthM;
      p.zonesReached[zoneOfDepth(s.maxDepthM || 0)] = true;
      if (s.won) p.bottoms++;
      function push(board, value, better) {
        var b = d.leaderboards[board]; b.push({ value: value, date: now, seed: s.seed, won: !!s.won });
        b.sort(function (a, c) { return better === 'high' ? c.value - a.value : a.value - c.value; });
        if (b.length > 10) b.length = 10;
      }
      push('deepest', +(s.maxDepthM || 0).toFixed(1), 'high');
      if (s.won) push('fastest', Math.round(s.timeS), 'low');
      if (s.won) push('airLeft', Math.round(s.airLeftBar), 'high');
      push('explored', Math.round(s.ropeM || 0), 'high');
      push('longest', Math.round(s.timeS || 0), 'high');
      TU.save.write();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Systems: per-step hooks each module registers                       */
  /* ------------------------------------------------------------------ */
  // TU.addSystem('player', { init(), reset(run), update(dt), idle(dt), frame(dt) })
  //   init():      once at boot, after the renderer exists (main.js calls these in INIT_ORDER)
  //   reset(run):  at the start of every dive (run = TU.run, see main.js)
  //   update(dt):  every fixed step while simulating (state 'dive' or 'tutorial')
  //   idle(dt):    every fixed step in menus ('title', 'loadout', 'results', 'dead') for ambient motion
  //   frame(dt):   once per rendered frame, any state except 'boot' (cheap visual-only work)
  TU.systems = {};
  TU.addSystem = function (name, hooks) { hooks.name = name; TU.systems[name] = hooks; return hooks; };

  /* ------------------------------------------------------------------ */
  /* Module APIs with safe stubs                                         */
  /* ------------------------------------------------------------------ */
  // Every module fills its API with TU.define('cave', { ... }). Anything it leaves out keeps the stub.
  TU.define = function (name, impl) {
    var target = TU[name] || (TU[name] = {});
    for (var k in impl) if (Object.prototype.hasOwnProperty.call(impl, k)) target[k] = impl[k];
    target.__defined = true;
    return target;
  };
  var v3 = TU.util.v3;
  function zoneInfo(depth) { var z = zoneOfDepth(Math.max(0, depth)); return { index: z, name: ZONE_NAMES[z], topM: ZONE_TOP_M[z] }; }

  // cave.js (agent A) replaces these.
  TU.cave = {
    source: 'none', layout: null,
    features: { entrance: null, bottom: null, airPockets: [], dryChambers: [], squeezes: [], currents: [], siltAreas: [], landmarks: [], treasure: [], spots: {} },
    areas: {},
    build: function (layout) { },
    nearestPoint: function (pos) {
      var depth = -pos.y;
      return { point: v3(pos.x, pos.y, pos.z), radius: 3, wallDist: 3, inside: true, normal: v3(0, 1, 0), t: 0, s: 0, pathId: 'none', pieceId: -1,
        pieceType: 'straight', area: null, zone: zoneOfDepth(Math.max(0, depth)), dry: false, siltiness: 0, current: v3(0, 0, 0),
        temperature: 20, daylight: 0, floorY: pos.y - 2, ceilY: pos.y + 2, surfaceY: null };
    },
    collide: function (pos, radius, opts) { return { pos: v3(pos.x, pos.y, pos.z), hit: false, normal: v3(0, 1, 0), depth: 0, impact: 0, vel: opts && opts.vel ? v3(opts.vel.x, opts.vel.y, opts.vel.z) : null, blocked: null }; },
    contains: function (pos, margin) { return true; },
    raycast: function (origin, dir, maxDist) { return maxDist; },
    isDry: function (pos) { return false; },
    waterSurfaceY: function (pos) { return null; },
    zoneAt: function (pos) { return zoneInfo(-pos.y); },
    areaAt: function (pos) { return null; },
    randomSpot: function (opts, rand) { return null; },
    spot: function (name) { return null; },
    spawnPoint: function () { return { pos: v3(0, -2, 0), yaw: 0, pitch: 0 }; }
  };

  // creatures.js (agent B) replaces these.
  TU.creatures = {
    species: {},
    list: function () { return []; },
    spawnForZone: function (zone, count, rand) { return []; },
    clear: function () { },
    nearestInView: function (maxDist, minDot) { return null; },
    nearCount: function (pos, radius) { return 0; },
    get: function (id) { return null; },
    catch: function (id) { return { ok: false, reason: 'missing' }; },
    measure: function (id) { return null; },
    seenCount: function () { return 0; },
    total: function () { return 0; }
  };

  // player.js (agent C) replaces these. The state object shape is the contract (see CONTRACT.md).
  TU.player = {
    state: {
      pos: v3(0, -2, 0), vel: v3(0, 0, 0), yaw: 0, pitch: 0, roll: 0, fwd: v3(0, 0, -1), right: v3(1, 0, 0), up: v3(0, 1, 0),
      air: 200, airMax: 200, tanks: [{ bar: 200, max: 200, dropped: false, pos: null }], activeTank: 0, airRate: 0,
      stamina: 100, staminaMax: 100, panic: 0, injuries: [], vestAir: 0.4, battery: 100, flashOn: true,
      depth: 0, maxDepth: 0, speed: 0, dist: 0, inWater: true, surfaced: false, surfaceY: null, mode: 'swim',
      maskFlooded: false, cold: 0, sprint: false, slow: false, narcosis: 0, silt: 0, drown: 0,
      breathPhase: 0, breathStage: 0, kickPhase: -1, wpCount: 0, siltOuts: 0, wallHits: 0, shake: 0, hitFlash: 0,
      env: null, zone: 0, area: null
    },
    lamp: { pos: v3(0, 0, 0), dir: v3(0, 0, -1), on: 0, color: null, cosOuter: Math.cos(0.42), cosInner: Math.cos(0.2), range: 14 },
    input: { keys: {}, touch: null },
    inventory: { tape: 0, flexTape: 0, lantern: null, measuringTape: false, camera: false, glowSticks: 0, items: [] },
    ropeLength: function () { return 0; },
    ropePoints: function () { return []; },
    waypoints: function () { return []; },
    dropWaypoint: function (name) { },
    toggleFlash: function () { },
    teleport: function (pos, yaw, pitch) { },
    look: function (yaw, pitch) { },
    enableTouch: function () { },
    setAir: function (bar, allTanks) { },
    cameraForward: function () { return v3(0, 0, -1); }
  };

  // fx.js (agent C) replaces these.
  TU.fx = {
    renderer: null,
    spawnSilt: function (n, opts) { },
    spawnBubbles: function (n, opts) { },
    siltDensity: function () { return 0; },
    shake: function (amount) { },
    particleMaterial: function (opts) { return null; },
    makePoints: function (count, material) { return null; },
    render: function () { },
    screenshotMode: function (on) { }
  };

  // audio.js (agent C) replaces these.
  TU.audio = {
    ready: false, muted: false,
    unlock: function () { },
    setMuted: function (m) { },
    play: function (name, params) { },
    suspend: function () { },
    resume: function () { }
  };

  // ui.js (agent D) replaces these.
  TU.ui = {
    msg: function (text, dur) { },
    zone: function (title, subtitle) { },
    hint: function (text, dur) { },
    hideHint: function () { },
    setHudVisible: function (on) { },
    show: function (screen) { }
  };

  // main.js replaces these (game flow). Other modules call them, never setState directly for flow.
  TU.game = {
    startDive: function (opts) { },
    pause: function () { },
    resume: function () { },
    restart: function () { },
    endRun: function (info) { },
    toTitle: function () { },
    openLoadout: function () { }
  };

  // The current run. main.js fills this on startDive (see CONTRACT.md "Run object").
  TU.run = null;

  /* ------------------------------------------------------------------ */
  /* DOM and CSS helpers (each module injects its own markup and style)  */
  /* ------------------------------------------------------------------ */
  // TU.css('ui', '...css...') adds or replaces a <style data-tu="ui"> block.
  TU.css = function (id, text) {
    var el = document.querySelector('style[data-tu="' + id + '"]');
    if (!el) { el = document.createElement('style'); el.setAttribute('data-tu', id); document.head.appendChild(el); }
    el.textContent = text;
    return el;
  };
  // TU.el('div', { id: 'ui-hud', className: 'ui-hud', html: '...' }, parent)
  TU.el = function (tag, props, parent) {
    var e = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === 'html') e.innerHTML = props[k];
      else if (k === 'text') e.textContent = props[k];
      else if (k === 'style') e.style.cssText = props[k];
      else if (k === 'attrs') { for (var a in props.attrs) e.setAttribute(a, props.attrs[a]); }
      else e[k] = props[k];
    }
    (parent || document.body).appendChild(e);
    return e;
  };
  TU.$ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ */
  /* Shared procedural textures (built on first use, need THREE)         */
  /* ------------------------------------------------------------------ */
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    return new THREE.CanvasTexture(c);
  }
  // Tileable normal map from a blended noise heightfield.
  function makeNormalTex(size, freq, strength, seedZ) {
    var Nz = TU.noise, S = size, h = new Float32Array(S * S);
    function sample(x, y) { return Nz.fbm(x * freq, y * freq, seedZ, 4) + 0.35 * Math.abs(Nz.n3(x * freq * 3.1, y * freq * 3.1, seedZ + 9)); }
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var fx = x / S, fy = y / S;
      h[y * S + x] = sample(x, y) * (1 - fx) * (1 - fy) + sample(x - S, y) * fx * (1 - fy) + sample(x, y - S) * (1 - fx) * fy + sample(x - S, y - S) * fx * fy;
    }
    return canvasTex(S, S, function (g) {
      var img = g.createImageData(S, S);
      for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
        var l = h[y * S + ((x - 1 + S) % S)], r = h[y * S + ((x + 1) % S)], u = h[((y - 1 + S) % S) * S + x], d = h[((y + 1) % S) * S + x];
        var nx = (l - r) * strength, ny = (u - d) * strength, nz = 1, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len; ny /= len; nz /= len;
        var i = (y * S + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
  }
  function radial(stops) {
    return function (g, w) { var r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); stops.forEach(function (s) { r.addColorStop(s[0], s[1]); }); g.fillStyle = r; g.fillRect(0, 0, w, w); };
  }
  var texMakers = {
    glow: function () { return canvasTex(128, 128, radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,.7)'], [0.5, 'rgba(255,255,255,.16)'], [1, 'rgba(255,255,255,0)']])); },
    dot: function () { return canvasTex(64, 64, radial([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']])); },
    bubble: function () {
      return canvasTex(64, 64, function (g, w) {
        var r = g.createRadialGradient(w / 2, w / 2, w * 0.2, w / 2, w / 2, w * 0.48);
        r.addColorStop(0, 'rgba(255,255,255,.08)'); r.addColorStop(0.75, 'rgba(255,255,255,.35)'); r.addColorStop(0.9, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, w);
        g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(w * 0.36, w * 0.34, w * 0.08, 0, Math.PI * 2); g.fill();
      });
    },
    silt: function () {
      return canvasTex(128, 128, function (g, w) {
        var img = g.createImageData(w, w);
        for (var y = 0; y < w; y++) for (var x = 0; x < w; x++) {
          var dx = (x - w / 2) / (w / 2), dy = (y - w / 2) / (w / 2), d = Math.sqrt(dx * dx + dy * dy);
          var n = TU.noise.fbm(x * 0.06, y * 0.06, 3.3, 4) * 0.5 + 0.5;
          var a = clamp((1 - d) * 1.4, 0, 1) * (0.45 + 0.75 * n);
          var i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = clamp(a * a, 0, 1) * 255;
        }
        g.putImageData(img, 0, 0);
      });
    },
    rockNormal: function () { var t = makeNormalTex(256, 0.03, 3.6, 1.7); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; },
    waterNormal: function () { var t = makeNormalTex(128, 0.05, 2.2, 8.2); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t; }
  };
  var texCache = {};
  TU.tex = {
    // TU.tex.get('glow' | 'dot' | 'bubble' | 'silt' | 'rockNormal' | 'waterNormal'). Shared, do not dispose.
    get: function (name) { if (!texCache[name]) texCache[name] = texMakers[name](); return texCache[name]; },
    // Register a new shared texture maker (for example cave.js adds 'glyph').
    register: function (name, maker) { texMakers[name] = maker; },
    canvas: canvasTex,
    normalMap: makeNormalTex,
    // A glowing text label texture (waypoints, markers). Not cached: caller owns it.
    label: function (text) {
      return canvasTex(256, 80, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        g.font = '600 38px "Share Tech Mono", ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = '#4FF2D0'; g.shadowBlur = 14; g.fillStyle = '#c9fff4'; g.fillText(text, w / 2, h / 2 + 2);
        g.shadowBlur = 0; g.strokeStyle = 'rgba(79,242,208,.6)'; g.lineWidth = 2; g.strokeRect(30, 8, w - 60, h - 16);
      });
    }
  };

  // Load saved data right away so every module's init can read settings.
  TU.save.load();
  // Apply saved swim tuning over the defaults.
  (function () { var t = TU.save.data.settings.tune || {}; for (var k in t) if (k in TU.cfg.swim && typeof t[k] === 'number') TU.cfg.swim[k] = t[k]; })();
})();
