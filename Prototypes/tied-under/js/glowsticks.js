/*
 * glowsticks.js: glow sticks you crack and throw (key 3).
 *
 *   Throw    key 3 in a dive: crack a stick (a small snap sound) and throw it where you look.
 *            Uses one from TU.player.inventory.glowSticks; with none left a short message says so.
 *   Physics  the stick sinks slowly in water (falls fast in air), bounces off the rock with
 *            TU.cave.collide and comes to rest. It tumbles while it moves.
 *   Light    a small emissive tube with a soft halo. The 3 newest sticks also get a real point
 *            light (a pool of 3 lights, made on the first throw so shaders compile once); older
 *            sticks keep glowing without one. Colors cycle green, cyan, orange.
 *   Life     bright for about 3 minutes, then fades out over the last 40 s (about 4 minutes in all).
 *   Calm     near a lit stick (6 m) panic goes down a little, more when you are in the dark.
 *   Map      TU.glowsticks.list() gives positions and colors; TU.cave.mapData().glowSticks too.
 *
 * Public API (TU.glowsticks): throwStick(opts?), list(), count(), clear(), near(pos, r),
 *   calmAt(pos) 0..1, lights() (debug), cfg. Event: 'glowstick:throw' { pos, dir, color, left }.
 * Owner: the endless/glow stick agent. Config is local (GLOW below), not in core.js.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, clamp = U.clamp, smooth = U.smooth;

  // Every tunable number of the glow sticks.
  var GLOW = {
    throwSpeed: 5.5,     // m/s out of the hand (water slows it quickly)
    waterDrag: 2.6,      // 1/s velocity damping in water
    airDrag: 0.08,       // 1/s in air
    sinkAccel: 0.55,     // m/s^2 down in water (it is slightly heavier than water)
    sinkMax: 0.35,       // m/s, slowest it sinks in water (terminal speed)
    gravity: 9.8,        // m/s^2 in air
    bounce: 0.35,        // fraction of the speed into the wall that bounces back
    friction: 0.55,      // speed kept along the wall on a hit
    radius: 0.04,        // m, collision radius
    life: 240,           // s, total glow time
    fade: 40,            // s, the fade at the end of its life
    lightRange: 7.5,     // m, point light distance
    lightPower: 1.25,    // point light intensity at full glow
    maxLights: (TU.cfg.lights && TU.cfg.lights.glowSticks) || 3, // real point lights (the newest sticks get them), cfg.lights.glowSticks
    maxSticks: 24,       // sticks in the world at once (the oldest goes when you throw another)
    calmRadius: 6,       // m, panic calms near a lit stick
    calmRate: 0.8,       // panic per second calmed next to a stick (full glow)
    darkCalm: 3.2,       // extra per second when your own light is off (cancels the darkness panic)
    colors: [0x7CFF5A, 0x4FF2E8, 0xFFA03C] // green, cyan, orange
  };

  var sticks = [], lights = [], nextId = 1, colorIx = 0, shared = null, audioCtx = null;

  /* ------------------------------------------------------------------ */
  /* The mesh (shared shapes, one material per stick so it can fade)     */
  /* ------------------------------------------------------------------ */
  function getShared() {
    if (shared) return shared;
    shared = {
      tube: new T.CylinderGeometry(0.011, 0.011, 0.13, 8, 1),
      cap: new T.CylinderGeometry(0.013, 0.013, 0.018, 8, 1),
      capMat: new T.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.2 })
    };
    return shared;
  }
  function makeMesh(color) {
    var S = getShared(), g = new T.Group();
    var tubeMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95 });
    var tube = new T.Mesh(S.tube, tubeMat); g.add(tube);
    var c1 = new T.Mesh(S.cap, S.capMat); c1.position.y = 0.074; g.add(c1);
    var c2 = new T.Mesh(S.cap, S.capMat); c2.position.y = -0.074; g.add(c2);
    var halo = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: color, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(0.55); g.add(halo);
    g.name = 'glowstick';
    return { group: g, tubeMat: tubeMat, halo: halo };
  }
  function disposeStick(s) {
    if (s.group.parent) s.group.parent.remove(s.group);
    s.tubeMat.dispose(); s.halo.material.dispose();
    if (s.light) { s.light.userData.owner = null; s.light.intensity = 0; s.light = null; }
  }

  /* ------------------------------------------------------------------ */
  /* Light pool: made once at boot, never removed (no shader recompiles  */
  /* mid-dive, the light count stays inside cfg.lights.budget); unused   */
  /* lights sit at intensity 0.                                          */
  /* ------------------------------------------------------------------ */
  function ensureLights() {
    if (lights.length || !TU.scene) return;
    for (var i = 0; i < GLOW.maxLights; i++) {
      var L = new T.PointLight(0xffffff, 0, GLOW.lightRange, 2);
      L.name = 'glowstickLight'; L.userData.owner = null; L.position.set(0, -9999, 0);
      TU.scene.add(L); lights.push(L);
    }
  }
  // The newest bright sticks get the lights; the rest glow on their own.
  function assignLights() {
    if (!lights.length) return;
    var want = sticks.filter(function (s) { return s.bright > 0.02; }).slice(-GLOW.maxLights);
    sticks.forEach(function (s) { if (s.light && want.indexOf(s) < 0) { s.light.userData.owner = null; s.light.intensity = 0; s.light = null; } });
    want.forEach(function (s) {
      if (s.light) return;
      for (var i = 0; i < lights.length; i++) if (!lights[i].userData.owner) { s.light = lights[i]; lights[i].userData.owner = s; lights[i].color.setHex(s.color); break; }
    });
  }

  /* ------------------------------------------------------------------ */
  /* The crack: a tiny snap and a soft fizz (own WebAudio, the game's     */
  /* audio module has no glow stick sound)                               */
  /* ------------------------------------------------------------------ */
  function crackSound() {
    try {
      if (TU.audio && TU.audio.muted) return;
      // the game's AudioContext and master input (TU.audio.ctx / out): never a second context
      var ac = TU.audio && TU.audio.ctx, dest = TU.audio && TU.audio.out;
      if (!ac || !dest || ac.state !== 'running') return;
      var t = ac.currentTime, vol = 0.35;
      var n = Math.floor(ac.sampleRate * 0.25), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0), r = TU.rng(nextId * 31 + 7, 51);
      for (var i = 0; i < n; i++) {
        var u = i / ac.sampleRate;
        // two sharp clicks (the inner glass vial breaking), then a quiet crackle
        var click = (u < 0.004 ? 1 : 0) + (u > 0.03 && u < 0.034 ? 0.7 : 0);
        d[i] = (r.float() * 2 - 1) * (click + 0.12 * Math.exp(-u * 18));
      }
      var src = ac.createBufferSource(); src.buffer = buf;
      var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9;
      var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = TU.player.state.inWater && !TU.player.state.surfaced ? 1500 : 6000; // muffled under water
      var g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(dest);
      src.start(t); src.stop(t + 0.26);
    } catch (e) { /* no sound is fine */ }
  }

  /* ------------------------------------------------------------------ */
  /* Throw                                                               */
  /* ------------------------------------------------------------------ */
  function msg(text, dur) { TU.emit('ui:msg', { text: text, dur: dur || 2.5 }); }
  // opts: { free: true (tests: do not use one from the inventory), dir: Vector3, pos: Vector3, speed }
  function throwStick(opts) {
    opts = opts || {};
    if (!TU.scene || !TU.camera) return null;
    var inv = TU.player.inventory || {}, P = TU.player.state;
    if (!opts.free) {
      if (!(inv.glowSticks > 0)) { msg('No glow sticks left. Buy more at the Sump Camp.', 2.5); return null; }
      inv.glowSticks -= 1;
    }
    ensureLights();
    var dir = opts.dir ? opts.dir.clone().normalize() : new T.Vector3(0, 0, -1).applyQuaternion(TU.camera.quaternion);
    var from = opts.pos ? opts.pos.clone() : TU.camera.position.clone().addScaledVector(dir, 0.35).add(new T.Vector3(0, -0.12, 0));
    // do not start inside the rock (a wall right in front of you): drop it at your feet instead
    if (TU.cave.contains && !TU.cave.contains(from, 0.05)) from.copy(P.pos);
    var color = GLOW.colors[colorIx++ % GLOW.colors.length];
    var m = makeMesh(color);
    m.group.position.copy(from);
    m.group.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    TU.scene.add(m.group);
    var s = {
      id: nextId++, group: m.group, tubeMat: m.tubeMat, halo: m.halo, color: color,
      pos: m.group.position, vel: dir.clone().multiplyScalar(opts.speed != null ? opts.speed : GLOW.throwSpeed).add(P.vel ? P.vel.clone().multiplyScalar(0.5) : new T.Vector3()),
      age: 0, bright: 0, rest: false, still: 0, hits: 0, light: null, hint: {}, spin: new T.Vector3(4 + Math.random() * 4, 2 + Math.random() * 3, 3 + Math.random() * 3)
    };
    sticks.push(s);
    while (sticks.length > GLOW.maxSticks) disposeStick(sticks.shift());
    crackSound();
    TU.emit('glowstick:throw', { pos: from.clone(), dir: dir.clone(), color: color, left: inv.glowSticks || 0 });
    if (!opts.free && inv.glowSticks === 0) msg('That was your last glow stick.', 2);
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Per step: sink, bounce, settle, glow and fade                       */
  /* ------------------------------------------------------------------ */
  var tmp = new T.Vector3();
  function brightness(age) {
    var on = smooth(0, 0.35, age);                          // the chemicals mix as it cracks
    var end = 1 - smooth(GLOW.life - GLOW.fade, GLOW.life, age);
    var dim = 1 - 0.25 * smooth(30, GLOW.life - GLOW.fade, age); // slowly a bit dimmer
    return clamp(on * end * dim, 0, 1);
  }
  function stepStick(s, dt) {
    s.age += dt;
    s.bright = brightness(s.age);
    if (s.rest) return;
    var dry = TU.cave.isDry ? TU.cave.isDry(s.pos) : false;
    if (dry) { s.vel.y -= GLOW.gravity * dt; s.vel.multiplyScalar(1 / (1 + GLOW.airDrag * dt)); }
    else {
      s.vel.multiplyScalar(1 / (1 + GLOW.waterDrag * dt));
      if (s.vel.y > -GLOW.sinkMax) s.vel.y = Math.max(-GLOW.sinkMax, s.vel.y - GLOW.sinkAccel * dt);
    }
    tmp.copy(s.pos).addScaledVector(s.vel, dt);
    var r = TU.cave.collide(tmp, GLOW.radius, { vel: s.vel, hint: s.hint });
    s.pos.copy(r.pos);
    if (r.hit) {
      var n = r.normal, vn = s.vel.dot(n);
      if (vn < 0) { s.vel.addScaledVector(n, -vn * (1 + GLOW.bounce)); s.vel.multiplyScalar(GLOW.friction); s.hits++; }
      // resting on a floor-like surface and slow: stop (lie on the rock)
      if (n.y > 0.45 && s.vel.length() < 0.12) s.still += dt; else s.still = Math.max(0, s.still - dt);
    } else s.still = Math.max(0, s.still - dt * 0.5);
    if (s.still > 0.4) { s.rest = true; s.vel.set(0, 0, 0); s.group.rotation.x = Math.PI / 2 + (s.id % 3) * 0.2; s.group.rotation.z = 0; }
    var sp = Math.min(1, s.vel.length() * 2);
    s.group.rotation.x += s.spin.x * dt * sp; s.group.rotation.y += s.spin.y * dt * sp; s.group.rotation.z += s.spin.z * dt * sp;
  }
  function update(dt) {
    if (!sticks.length) return;
    for (var i = 0; i < sticks.length; i++) stepStick(sticks[i], dt);
    // burnt out sticks go
    for (i = sticks.length - 1; i >= 0; i--) if (sticks[i].age >= GLOW.life) { disposeStick(sticks[i]); sticks.splice(i, 1); }
    assignLights();
    calm(dt);
  }
  // Panic calms a little near a lit stick (more in the dark), through TU.player.calm (panic points).
  // player.js also counts a lit stick within 6 m as light for its darkness panic rule.
  function calmAt(pos) {
    var best = 0;
    for (var i = 0; i < sticks.length; i++) {
      var s = sticks[i], d = s.pos.distanceTo(pos);
      if (d < GLOW.calmRadius) best = Math.max(best, s.bright * (1 - d / GLOW.calmRadius));
    }
    return best;
  }
  function calm(dt) {
    if (!TU.state.simulating()) return;
    var P = TU.player.state, k = calmAt(P.pos);
    if (k <= 0 || !(P.panic > 0)) return;
    var dark = !P.flashOn && !(P.lanternLevel > 0.3);
    if (typeof TU.player.calm === 'function') TU.player.calm((GLOW.calmRate + (dark ? GLOW.darkCalm : 0)) * k * dt);
  }
  // Per frame: the glow follows the brightness, lights follow their stick.
  function frame() {
    for (var i = 0; i < sticks.length; i++) {
      var s = sticks[i], b = s.bright, flick = 1 - 0.04 * Math.sin(s.age * 9 + s.id);
      s.tubeMat.opacity = 0.25 + 0.7 * b;
      s.tubeMat.color.setHex(s.color).multiplyScalar(0.25 + 0.75 * b);
      s.halo.material.opacity = 0.65 * b * flick;
      s.halo.scale.setScalar(0.35 + 0.35 * b);
      if (s.light) { s.light.position.copy(s.pos); s.light.position.y += 0.05; s.light.intensity = GLOW.lightPower * b * flick; }
    }
  }

  function clear() { sticks.forEach(disposeStick); sticks.length = 0; lights.forEach(function (L) { L.userData.owner = null; L.intensity = 0; }); colorIx = 0; }

  /* ------------------------------------------------------------------ */
  /* Key 3 and the controls list                                         */
  /* ------------------------------------------------------------------ */
  // Register key 3 in the controls list (TU.player.bindings) next to the tapes, before the UI reads it.
  (function register() {
    var B = TU.player && TU.player.bindings;
    if (!B || !B.push) return;
    for (var i = 0; i < B.length; i++) if (B[i] && B[i].action === 'glowStick') return;
    var at = -1;
    for (i = 0; i < B.length; i++) if (B[i] && B[i].action === 'flexTape') at = i;
    var entry = { action: 'glowStick', keys: ['Digit3'], label: 'Crack and throw a glow stick (marks the way, lights the dark)', type: 'press', owner: 'glowsticks' };
    if (at >= 0) B.splice(at + 1, 0, entry); else B.push(entry);
  })();
  window.addEventListener('keydown', function (e) {
    if (e.code !== 'Digit3' || e.repeat || !TU.state.is('dive')) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return; // typing a waypoint name
    if (TU.player.state.mode === 'ragdoll') return;
    throwStick();
  });

  TU.define('glowsticks', {
    throwStick: throwStick,
    // [{ id, pos (copy), color (hex), brightness 0..1, age (s), rest (lying still) }]
    list: function () { return sticks.map(function (s) { return { id: s.id, pos: s.pos.clone(), color: s.color, brightness: +s.bright.toFixed(3), age: +s.age.toFixed(2), rest: s.rest, lit: !!s.light }; }); },
    count: function () { return sticks.length; },
    near: function (pos, r) { var n = 0; r = r || GLOW.calmRadius; sticks.forEach(function (s) { if (s.bright > 0.05 && s.pos.distanceTo(pos) < r) n++; }); return n; },
    calmAt: calmAt,
    clear: clear,
    lights: function () { return lights.map(function (L) { return { owner: L.userData.owner ? L.userData.owner.id : null, intensity: +L.intensity.toFixed(3) }; }); },
    // debug: age every stick by sec seconds (tests the fade without waiting 4 minutes)
    age: function (sec) { sticks.forEach(function (s) { s.age += sec; }); update(0); frame(); return sticks.length; },
    cfg: GLOW
  });
  TU.addSystem('glowsticks', {
    init: function () { getShared(); ensureLights(); },
    reset: function () { clear(); },
    update: update,
    frame: frame
  });
})();
