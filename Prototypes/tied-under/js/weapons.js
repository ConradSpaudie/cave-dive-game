/*
 * weapons.js: things you can fight back with. One primary weapon (picked at the camp) plus the
 * dive knife, which you always carry.
 *
 *   knife      dive knife: short reach, fast, cuts. Always on your belt.
 *   polespear  pole spear with a rubber band (Hawaiian sling): a fast thrust, reusable, free.
 *   speargun   pneumatic speargun: the spear flies on a line you can see. It slows down in the
 *              water and sinks a little. It pins what it hits (hold the mouse to reel it in) or
 *              sticks in rock. Y reels the line in and pushes the spear back into the barrel (slow).
 *   jet        water jet gun: a blast of pressurized water from your TANK AIR. Knocks predators
 *              back and stuns them, blows silt around, and pushes you backward.
 *   bangstick  powerhead on a pole: one shotgun shell that fires only on contact. Huge boom.
 *   flare      flare gun: a burning red flare that lights the cave for a minute and scares predators.
 *   baton      shock baton: an electric pulse that stuns everything close. Runs on your flashlight battery.
 *
 * Controls (only in a dive with the mouse locked and no menu open): left click fire or attack,
 * hold right mouse to aim, Y reload, 4 holster or draw, 5 or the mouse wheel swaps primary and knife.
 *
 * How it fits together:
 *   - Models are built from simple shapes and live in the hands scene (TU.fx.handScene, camera space).
 *     This file decides where the weapon should be (TU.weapons.pose()); player-hands.js moves the right
 *     hand there and tells us where the hand really is (TU.player.rig.rHandPos / rHandQuat), and the
 *     weapon is drawn in that fist.
 *   - Spears, flares, the jet cone, sparks and the line live in the cave scene (world space).
 *   - Creatures are hurt through TU.creatures.raycastHit / damage / impulse / stunArea / inRadius
 *     (each checked with typeof, so everything still works when creatures.js is missing). A small
 *     practice target (debug.spawnTarget) stands in for tests.
 *   - Sounds are synthesized here inside the game's AudioContext (TU.audio.ctx, into TU.audio.out).
 *   - The diver is changed only through the player API: applyRecoil, addPanic, addShake, useBattery.
 * Tunables: TU.cfg.weapons (core.js). Save: TU.save.data.weapons (owned, selected, ammo stock).
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, N = TU.noise, cfg = TU.cfg;
  var clamp = U.clamp, lerp = U.lerp, damp = U.damp, smooth = U.smooth;
  var WC = cfg.weapons;
  function V(x, y, z) { return new T.Vector3(x || 0, y || 0, z || 0); }

  /* ------------------------------------------------------------------ */
  /* Definitions (names, card stats, ammo)                               */
  /* ------------------------------------------------------------------ */
  // grip: 'pistol' (a pistol grip) or 'pole' (a handle or shaft running forward through the fist).
  // ammo: which stock in TU.save.data.weapons.ammo it uses (null = none).
  var DEFS = {
    knife: { id: 'knife', name: 'Dive knife', short: 'KNIFE', grip: 'pole', primary: false, ammo: null,
      blurb: 'Titanium, blunt tip, serrated spine. Always on your belt.', special: 'Always carried. Fast.' },
    polespear: { id: 'polespear', name: 'Pole spear', short: 'POLE SPEAR', grip: 'pole', primary: true, ammo: null,
      blurb: 'A long stick with a rubber band and three sharp prongs. Reusable, honest, slightly embarrassing.', special: 'Never runs out' },
    speargun: { id: 'speargun', name: 'Pneumatic speargun', short: 'SPEARGUN', grip: 'pistol', primary: true, ammo: 'spears',
      blurb: 'Fires a steel spear on a line. Pins what it hits. You have to reel it back in.', special: 'Pins and reels in' },
    jet: { id: 'jet', name: 'Water jet gun', short: 'JET GUN', grip: 'pistol', primary: true, ammo: null,
      blurb: 'Hooks into your tank. A blast of water that shoves predators away and you backward.', special: 'Knockback. Costs tank air' },
    bangstick: { id: 'bangstick', name: 'Bang stick', short: 'BANG STICK', grip: 'pole', primary: true, ammo: 'bang',
      blurb: 'A shotgun shell on a pole. Fires on contact. Ends arguments with very large fish.', special: 'One shot kills. Contact only' },
    flare: { id: 'flare', name: 'Flare gun', short: 'FLARE GUN', grip: 'pistol', primary: true, ammo: 'flares',
      blurb: 'A burning red flare. Lights the cave for a minute. Most things that bite hate it.', special: 'Light and scare' },
    baton: { id: 'baton', name: 'Shock baton', short: 'SHOCK BATON', grip: 'pole', primary: true, ammo: null,
      blurb: 'An electric pulse that stuns everything close. Drinks your flashlight battery.', special: 'Area stun. Costs battery' }
  };
  var PRIMARIES = ['polespear', 'speargun', 'jet', 'bangstick', 'flare', 'baton'];
  var AMMO_OF = { speargun: 'spears', bangstick: 'bang', flare: 'flares' };
  var AMMO_NAME = { spears: 'spears', bang: 'shells', flares: 'flares' };
  // Ammo that comes with a weapon when you buy it.
  var STARTER_AMMO = { speargun: 3, bangstick: 2, flare: 3 };

  // Card numbers for the camp (computed from the config so they never lie).
  function stats(id) {
    var c = WC[id] || {};
    var s = {
      knife: { damage: c.damage, range: c.reach, reload: c.cooldown, ammo: 'Unlimited' },
      polespear: { damage: c.damage, range: c.reach, reload: c.cooldown, ammo: 'Unlimited' },
      speargun: { damage: c.damage, range: c.line, reload: c.reload, ammo: 'Spears (up to ' + (c.pack ? c.pack[2] : 4) + ')' },
      jet: { damage: c.damage, range: c.range, reload: c.cooldown, ammo: c.air + ' bar of tank air' },
      bangstick: { damage: c.damage, range: c.reach, reload: c.reload, ammo: 'Shells (up to ' + (c.pack ? c.pack[2] : 3) + ')' },
      flare: { damage: c.damage, range: 12, reload: c.reload, ammo: 'Flares (up to ' + (c.pack ? c.pack[2] : 4) + ')' },
      baton: { damage: c.damage, range: c.radius, reload: c.cooldown, ammo: c.battery + '% battery' }
    }[id] || {};
    s.special = DEFS[id] ? DEFS[id].special : '';
    s.cost = c.cost || 0;
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Save helpers                                                        */
  /* ------------------------------------------------------------------ */
  function sw() {
    var d = TU.save.data;
    if (!d.weapons || typeof d.weapons !== 'object') d.weapons = TU.save.defaults().weapons;
    var w = d.weapons;
    if (!w.owned || typeof w.owned !== 'object') w.owned = {};
    w.owned.knife = true; w.owned.polespear = true;
    if (!w.ammo || typeof w.ammo !== 'object') w.ammo = { spears: 0, bang: 0, flares: 0 };
    ['spears', 'bang', 'flares'].forEach(function (k) { if (typeof w.ammo[k] !== 'number') w.ammo[k] = 0; });
    if (!DEFS[w.selected] || !DEFS[w.selected].primary || !w.owned[w.selected]) w.selected = 'polespear';
    return w;
  }
  function owned(id) { return !!sw().owned[id]; }
  function buy(id) {
    var c = WC[id]; if (!c || !DEFS[id] || !DEFS[id].primary) return { ok: false, reason: 'unknown' };
    var w = sw(); if (w.owned[id]) return { ok: false, reason: 'owned' };
    var m = TU.save.data.money; if ((m.cash || 0) < c.cost) return { ok: false, reason: 'broke' };
    m.cash -= c.cost; w.owned[id] = true;
    if (STARTER_AMMO[id]) w.ammo[AMMO_OF[id]] += STARTER_AMMO[id];
    TU.save.write();
    return { ok: true, id: id };
  }
  function buyAmmo(id) {
    var c = WC[id], key = AMMO_OF[id]; if (!c || !key || !c.pack) return { ok: false, reason: 'no_ammo' };
    var m = TU.save.data.money; if ((m.cash || 0) < c.pack[0]) return { ok: false, reason: 'broke' };
    m.cash -= c.pack[0]; sw().ammo[key] += c.pack[1]; TU.save.write();
    return { ok: true, id: id, key: key, stock: sw().ammo[key] };
  }
  function select(id) {
    if (!DEFS[id] || !DEFS[id].primary || !owned(id)) return false;
    sw().selected = id; TU.save.write(); return true;
  }

  /* ------------------------------------------------------------------ */
  /* State for the current dive                                          */
  /* ------------------------------------------------------------------ */
  var S = {
    primary: 'polespear', active: 'primary', drawn: false, swapTo: null,
    draw: 0, aim: 0, aimHeld: false, fireHeld: false, fireDownT: -1, fireQueued: false, reloadQueued: false,
    cool: 0, act: null, kick: 0, swingSide: 1, t: 0, busy: false, autoReel: false, hitT: 0, lastMsg: 0,
    gun: { loaded: false, spare: 0 }, bang: { loaded: false, spare: 0 }, flare: { loaded: false, spare: 0 },
    spearOut: null, start: { spears: 0, bang: 0, flares: 0 }, flareLightOwner: null
  };
  var P = TU.player.state;
  function cur() { return S.active === 'knife' ? 'knife' : S.primary; }
  function msg(text, dur) { if (S.t - S.lastMsg < 0.15) return; S.lastMsg = S.t; TU.emit('ui:msg', { text: text, dur: dur || 2.2 }); }

  /* ------------------------------------------------------------------ */
  /* Sounds (WebAudio, synthesized, muffled like underwater)             */
  /* ------------------------------------------------------------------ */
  var AU = { ctx: null, out: null, noise: null };
  function audioOK() {
    if (TU.audio && TU.audio.muted) return false;
    if (!AU.ctx) {
      // Use the game's AudioContext (TU.audio.ctx, ready after the first click). Never open a second one:
      // two contexts hung the headless test browser. No context yet: no sound (that is fine).
      var c = TU.audio && TU.audio.ctx, dest = TU.audio && TU.audio.out;
      if (!c || !c.createGain || !dest) return false;
      try {
        AU.ctx = c; AU.shared = true;
        var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; // water muffles the highs
        var g = c.createGain(); g.gain.value = 0.7; lp.connect(g); g.connect(dest);
        // a short echo, like the sound bouncing around the cave
        var dl = c.createDelay(0.5); dl.delayTime.value = 0.13; var fb = c.createGain(); fb.gain.value = 0.32;
        lp.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(g);
        AU.out = lp; AU.gain = g;
        var nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0);
        for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        AU.noise = nb;
      } catch (e) { AU.ctx = null; return false; }
    }
    if (AU.ctx.state !== 'running') return false;    // audio.js suspends it while paused
    AU.gain.gain.value = 0.7;                         // TU.audio.out already applies the master volume and mute
    return true;
  }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(type, f0, f1, a, d, vol, delay) {
    var c = AU.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + a + d);
    env(g, t, a, vol, d); o.connect(g); g.connect(AU.out); o.start(t); o.stop(t + a + d + 0.05);
  }
  function hiss(ftype, f0, f1, q, a, d, vol, delay) {
    var c = AU.ctx, t = c.currentTime + (delay || 0), s = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain();
    s.buffer = AU.noise; s.loop = true; b.type = ftype; b.Q.value = q;
    b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + a + d);
    env(g, t, a, vol, d); s.connect(b); b.connect(g); g.connect(AU.out); s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.05);
  }
  var SFX = {
    thunk: function () { hiss('bandpass', 700, 180, 1.2, 0.005, 0.28, 0.9); tone('sine', 140, 45, 0.004, 0.32, 0.8); hiss('highpass', 3000, 1800, 0.7, 0.01, 0.45, 0.12, 0.02); },
    swish: function () { hiss('bandpass', 500, 1600, 2.5, 0.04, 0.16, 0.45); },
    thrust: function () { hiss('bandpass', 1400, 400, 3, 0.003, 0.12, 0.5); tone('triangle', 220, 90, 0.003, 0.14, 0.35); },
    hiss: function () { hiss('bandpass', 1900, 900, 0.9, 0.02, 0.6, 0.85); hiss('lowpass', 300, 120, 0.7, 0.02, 0.55, 0.6); tone('sine', 60, 40, 0.02, 0.5, 0.4); },
    boom: function () { tone('sine', 62, 24, 0.006, 1.5, 1.4); hiss('lowpass', 500, 60, 0.8, 0.005, 1.6, 1.3); tone('square', 40, 20, 0.004, 0.25, 0.25); hiss('bandpass', 900, 200, 1, 0.3, 1.2, 0.2, 0.25); },
    pop: function () { hiss('bandpass', 1000, 300, 1.5, 0.003, 0.18, 0.7); tone('sine', 180, 70, 0.003, 0.18, 0.45); hiss('highpass', 2500, 2500, 0.5, 0.05, 0.9, 0.08, 0.12); },
    zap: function () {
      for (var i = 0; i < 6; i++) tone('sawtooth', 90 + Math.random() * 160, 60 + Math.random() * 90, 0.002, 0.05 + Math.random() * 0.05, 0.22, i * 0.05);
      hiss('highpass', 2200, 1200, 0.8, 0.005, 0.45, 0.35);
    },
    clank: function () { tone('sine', 1900, 1700, 0.002, 0.18, 0.28); tone('sine', 2750, 2500, 0.002, 0.12, 0.16); hiss('bandpass', 2400, 1200, 2, 0.002, 0.06, 0.3); },
    splat: function () { hiss('lowpass', 600, 120, 1, 0.004, 0.2, 0.9); tone('sine', 110, 50, 0.004, 0.16, 0.5); },
    click: function () { tone('square', 2200, 1800, 0.001, 0.025, 0.15); },
    ratchet: function () { for (var i = 0; i < 4; i++) { tone('square', 1500, 1200, 0.001, 0.018, 0.1, i * 0.09); hiss('bandpass', 2600, 2000, 4, 0.001, 0.03, 0.15, i * 0.09); } },
    reel: function () { for (var i = 0; i < 3; i++) tone('square', 900 + i * 40, 800, 0.001, 0.02, 0.07, i * 0.05); },
    snap: function () { hiss('highpass', 3200, 1500, 1, 0.002, 0.08, 0.5); tone('triangle', 600, 120, 0.002, 0.1, 0.3); }
  };
  function sound(name) {
    try {
      // the audio owner can add 'weapon_<name>' recipes later; ours are the fallback
      if (TU.audio && typeof TU.audio.sounds === 'function' && TU.audio.sounds().indexOf('weapon_' + name) >= 0) { TU.audio.play('weapon_' + name, {}); return; }
      if (audioOK() && SFX[name]) SFX[name]();
    } catch (e) { /* sound is optional */ }
  }

  /* ------------------------------------------------------------------ */
  /* Materials and model helpers                                         */
  /* ------------------------------------------------------------------ */
  var M = {};
  function buildMaterials() {
    var knurl = TU.tex.normalMap(64, 0.6, 2.2, 6.1); knurl.wrapS = knurl.wrapT = T.RepeatWrapping; knurl.repeat.set(2, 6);
    M.alu = new T.MeshStandardMaterial({ color: 0x5d6a72, roughness: 0.3, metalness: 0.6 });
    M.dark = new T.MeshStandardMaterial({ color: 0x272c30, roughness: 0.5, metalness: 0.25 });
    M.rubber = new T.MeshStandardMaterial({ color: 0x101112, roughness: 0.85, metalness: 0.0, normalMap: knurl, normalScale: new T.Vector2(1.2, 1.2) });
    // (no environment map in the hands scene, so fully metallic parts would look black: keep metalness moderate)
    M.steel = new T.MeshStandardMaterial({ color: 0xb8c0c5, roughness: 0.25, metalness: 0.55 });
    M.blade = new T.MeshStandardMaterial({ color: 0xd2d8dc, roughness: 0.2, metalness: 0.5 });
    M.orange = new T.MeshStandardMaterial({ color: 0xe0601a, roughness: 0.45, metalness: 0.05 });
    M.yellow = new T.MeshStandardMaterial({ color: 0xd8a51c, roughness: 0.42, metalness: 0.1 });
    M.brass = new T.MeshStandardMaterial({ color: 0xb58a42, roughness: 0.3, metalness: 0.55 });
    M.band = new T.MeshStandardMaterial({ color: 0xb8401a, roughness: 0.55, metalness: 0.0 });
    M.red = new T.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5, metalness: 0.0 });
    M.carbon = new T.MeshStandardMaterial({ color: 0x30353a, roughness: 0.28, metalness: 0.4 });
    M.hose = new T.MeshStandardMaterial({ color: 0x0d0f10, roughness: 0.5 });
    M.white = new T.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 });
    M.glowBlue = new T.MeshBasicMaterial({ color: 0x7fd8ff, toneMapped: false });
    M.glowRed = new T.MeshBasicMaterial({ color: 0xff5a3a, toneMapped: false });
    M.gauge = new T.MeshBasicMaterial({ map: gaugeTex(), toneMapped: false });
    M.line = new T.LineBasicMaterial({ color: 0xd9d3c0, transparent: true, opacity: 0.85 });
    M.arcHand = new T.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    M.arcWorld = new T.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    M.target = new T.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.7, map: targetTex() });
    M.targetFin = new T.MeshStandardMaterial({ color: 0xffb05c, roughness: 0.7, side: T.DoubleSide });
  }
  function gaugeTex() {
    return TU.tex.canvas(64, 64, function (g, w) {
      g.fillStyle = '#e9e6dc'; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 2; for (var i = 0; i <= 8; i++) { var a = Math.PI * 0.75 + i / 8 * Math.PI * 1.5; g.beginPath(); g.moveTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22); g.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28); g.stroke(); }
      g.strokeStyle = '#c0261e'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 25, Math.PI * 0.75, Math.PI * 1.05); g.stroke();
      g.strokeStyle = '#111'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(-0.6) * 22, 32 + Math.sin(-0.6) * 22); g.stroke();
    });
  }
  function targetTex() {
    return TU.tex.canvas(128, 64, function (g, w, h) {
      g.fillStyle = '#ff8a2a'; g.fillRect(0, 0, w, h);
      ['#ffffff', '#d1281e', '#ffffff', '#d1281e'].forEach(function (c, i) { g.fillStyle = c; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, 26 - i * 6, 26 - i * 6, 0, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = 'rgba(0,0,0,.55)'; g.font = 'bold 9px monospace'; g.fillText('MARV', 4, 10);
    });
  }
  // A cylinder along -Z: radius rf at the front (toward -Z), rb at the back, centered at z = zc.
  function zc(rf, rb, len, z, seg, open) { var g = new T.CylinderGeometry(rf, rb, len, seg || 14, 1, !!open); g.rotateX(-Math.PI / 2); g.translate(0, 0, z || 0); return g; }
  function box(w, h, d, r) {
    var g = new T.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, v = V(), c = V();
    r = Math.min(r || 0, w / 2, h / 2, d / 2);
    if (r > 0) {
      var hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
      for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz)); v.sub(c); if (v.lengthSq() > 1e-12) v.normalize().multiplyScalar(r); v.add(c); p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals();
    }
    return g;
  }
  function mesh(geo, mat, parent, x, y, z, rx, ry, rz) {
    var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (parent) parent.add(m); return m;
  }

  /* ------------------------------------------------------------------ */
  /* Hand models (camera space, -Z forward, +Y up, origin in the fist)   */
  /* ------------------------------------------------------------------ */
  var models = {}, handScene = null, built = false, wLight = null;
  function newModel(id) { var root = new T.Group(); root.name = 'wp-' + id; var kick = new T.Group(); root.add(kick); root.visible = false; handScene.add(root); return { id: id, root: root, kick: kick, muzzle: V(0, 0, -0.5), parts: {} }; }

  // A spear: tip at the origin pointing -Z, shaft back along +Z (len m). Shared by the gun and the projectile.
  function spearGeo(len) {
    var g = new T.Group();
    mesh(zc(0.0036, 0.0036, len - 0.05, 0.05 + (len - 0.05) / 2, 8), M.steel, g);
    mesh(zc(0.0004, 0.0042, 0.05, 0.025, 8), M.steel, g);                          // the point
    var flop = mesh(box(0.002, 0.004, 0.06, 0), M.steel, g, 0, 0.004, 0.085, 0.12); // the flopper barb
    flop.name = 'flopper';
    for (var i = 0; i < 2; i++) mesh(box(0.0016, 0.006, 0.012, 0), M.steel, g, 0, 0.004, 0.32 + i * 0.03); // shark fins for the line
    return g;
  }

  function buildKnife() {
    var m = newModel('knife'), k = m.kick;
    // rubber handle through the fist, a finger guard, the blade forward
    mesh(zc(0.0135, 0.0145, 0.115, 0.005, 14), M.rubber, k);
    mesh(zc(0.016, 0.016, 0.012, 0.068, 14), M.steel, k);                           // butt cap (hammer)
    mesh(box(0.05, 0.012, 0.008, 0.003), M.dark, k, 0, 0, -0.056);                  // guard
    var blade = new T.Group(); blade.position.z = -0.06; k.add(blade);
    var bs = new T.Shape(); bs.moveTo(-0.013, 0); bs.lineTo(0.013, 0); bs.lineTo(0.012, -0.135); bs.quadraticCurveTo(0.009, -0.158, 0.0, -0.162); bs.lineTo(-0.013, -0.15); bs.closePath();
    var bg = new T.ExtrudeGeometry(bs, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0012, bevelSegments: 1 });
    bg.rotateX(Math.PI / 2); bg.translate(0, 0.0015, 0); bg.rotateZ(Math.PI / 2);
    mesh(bg, M.blade, blade);
    for (var i = 0; i < 8; i++) mesh(box(0.004, 0.005, 0.004, 0), M.blade, blade, 0, 0.0135, -0.012 - i * 0.011, Math.PI / 4); // serrated spine
    m.parts.blade = blade;
    m.muzzle.set(0, 0, -0.22);
    models.knife = m;
  }
  function buildPolespear() {
    var m = newModel('polespear'), k = m.kick;
    var shaft = new T.Group(); k.add(shaft); m.parts.shaft = shaft;
    // a 1.8 m carbon pole: it starts behind your hand and runs far ahead
    mesh(zc(0.0075, 0.0085, 1.8, -0.62, 10), M.carbon, shaft);
    mesh(zc(0.009, 0.009, 0.14, 0.04, 10), M.rubber, shaft);                         // grip wrap
    // three-prong paralyzer tip
    var tip = new T.Group(); tip.position.z = -1.52; shaft.add(tip);
    mesh(zc(0.008, 0.009, 0.05, 0, 10), M.steel, tip);
    for (var i = 0; i < 3; i++) {
      var a = i / 3 * Math.PI * 2, pr = mesh(zc(0.0009, 0.0024, 0.16, -0.1, 6), M.steel, tip, Math.cos(a) * 0.009, Math.sin(a) * 0.009, 0);
      pr.rotation.set(Math.sin(a) * 0.08, -Math.cos(a) * 0.08, 0);
      mesh(zc(0.0003, 0.002, 0.012, -0.18, 5), M.steel, tip, Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0);
    }
    // the rubber band: a loop from the back of the pole, stretched forward to the hand
    var band = new T.Group(); shaft.add(band); band.position.z = 0.28;
    var bandA = mesh(zc(0.0045, 0.0045, 1, -0.5, 8), M.band, band, 0.012, 0, 0); var bandB = mesh(zc(0.0045, 0.0045, 1, -0.5, 8), M.band, band, -0.012, 0, 0);
    mesh(box(0.034, 0.012, 0.018, 0.004), M.dark, shaft, 0, 0, 0.28);                // end cap
    m.parts.bandA = bandA; m.parts.bandB = bandB; m.parts.band = band;
    m.muzzle.set(0, 0, -1.7);
    models.polespear = m;
  }
  function buildSpeargun() {
    var m = newModel('speargun'), k = m.kick;
    // pistol grip (origin is in the fist), trigger, the long aluminium barrel above
    mesh(box(0.032, 0.11, 0.04, 0.01), M.rubber, k, 0, -0.005, 0.004, -0.22);
    mesh(box(0.036, 0.03, 0.12, 0.008), M.dark, k, 0, 0.05, -0.02);                // the handle body under the barrel
    mesh(box(0.006, 0.026, 0.006, 0.002), M.steel, k, 0, 0.027, -0.045, 0.3);      // trigger
    var guard = new T.Mesh(new T.TorusGeometry(0.02, 0.0028, 6, 14, Math.PI), M.dark); guard.rotation.set(0, Math.PI / 2, Math.PI); guard.position.set(0, 0.035, -0.045); k.add(guard);
    mesh(zc(0.018, 0.018, 0.78, -0.33, 18), M.alu, k, 0, 0.07, 0);                 // barrel (the air chamber)
    mesh(zc(0.021, 0.021, 0.05, 0.07, 18), M.dark, k, 0, 0.07, 0);                  // rear cap with the valve
    mesh(zc(0.02, 0.021, 0.07, -0.71, 18), M.dark, k, 0, 0.07, 0);                  // muzzle head
    mesh(box(0.004, 0.012, 0.008, 0.001), M.orange, k, 0, 0.094, -0.7);             // front sight
    mesh(box(0.016, 0.012, 0.006, 0.001), M.dark, k, 0, 0.093, 0.02);               // rear sight
    mesh(box(0.004, 0.008, 0.008, 0), M.rubber, k, 0, 0.096, 0.02);                 // the notch (dark gap look)
    // line release and a small reel under the barrel
    var reel = new T.Group(); reel.position.set(0, 0.025, -0.25); k.add(reel);
    mesh(zc(0.024, 0.024, 0.02, 0, 16), M.dark, reel).rotation.y = Math.PI / 2;
    var spool = mesh(zc(0.018, 0.018, 0.016, 0, 10), M.white, reel); spool.rotation.y = Math.PI / 2;
    mesh(box(0.004, 0.03, 0.004, 0), M.steel, reel, 0.014, 0.012, 0);             // crank
    m.parts.reel = reel;
    // the spear: when loaded only the front sticks out of the muzzle
    var sp = spearGeo(0.85); sp.position.set(0, 0.07, -0.95); k.add(sp); m.parts.spear = sp; // shorter than a real spear: the rest is hidden in the barrel
    m.muzzle.set(0, 0.07, -0.75);
    models.speargun = m;
  }
  function buildJet() {
    var m = newModel('jet'), k = m.kick;
    mesh(box(0.034, 0.105, 0.042, 0.01), M.rubber, k, 0, -0.005, 0.006, -0.2);       // grip
    mesh(box(0.05, 0.06, 0.2, 0.014), M.yellow, k, 0, 0.055, -0.05);                // body (valve block)
    mesh(zc(0.03, 0.03, 0.17, -0.06, 18), M.steel, k, 0, 0.105, 0);                  // pressure chamber on top
    mesh(zc(0.031, 0.031, 0.012, 0.03, 18), M.dark, k, 0, 0.105, 0);
    mesh(zc(0.031, 0.031, 0.012, -0.14, 18), M.dark, k, 0, 0.105, 0);
    mesh(zc(0.016, 0.022, 0.05, -0.17, 16), M.brass, k, 0, 0.06, 0);                 // valve collar
    mesh(zc(0.011, 0.011, 0.26, -0.32, 14), M.steel, k, 0, 0.06, 0);                 // the lance
    mesh(zc(0.009, 0.016, 0.06, -0.48, 14), M.brass, k, 0, 0.06, 0);                 // nozzle
    mesh(zc(0.005, 0.009, 0.02, -0.52, 12), M.brass, k, 0, 0.06, 0);
    mesh(box(0.007, 0.03, 0.007, 0.002), M.steel, k, 0, 0.022, -0.05, 0.35);         // trigger lever
    var gauge = new T.Group(); gauge.position.set(0.032, 0.1, 0.0); k.add(gauge);
    mesh(zc(0.018, 0.018, 0.012, 0, 16), M.steel, gauge).rotation.y = Math.PI / 2;
    var face = mesh(new T.CircleGeometry(0.015, 16), M.gauge, gauge, 0.0065, 0, 0); face.rotation.y = Math.PI / 2;
    // the high pressure hose from the gun down to your tank
    var hose = new T.Group(); k.add(hose); m.parts.hose = hose;
    var a = V(0, 0.05, 0.06), c = V(0.03, -0.1, 0.16), b = V(0.07, -0.35, 0.22), prev = a.clone();
    for (var i = 1; i <= 8; i++) {
      var s = i / 8, u = 1 - s, p = V(u * u * a.x + 2 * u * s * c.x + s * s * b.x, u * u * a.y + 2 * u * s * c.y + s * s * b.y, u * u * a.z + 2 * u * s * c.z + s * s * b.z);
      var len = p.distanceTo(prev), seg = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, len * 1.08, 8), M.hose);
      seg.position.copy(prev).add(p).multiplyScalar(0.5); seg.quaternion.setFromUnitVectors(V(0, 1, 0), V().subVectors(p, prev).normalize()); hose.add(seg); prev = p;
    }
    m.muzzle.set(0, 0.06, -0.54);
    models.jet = m;
  }
  function buildBangstick() {
    var m = newModel('bangstick'), k = m.kick;
    var pole = new T.Group(); k.add(pole); m.parts.pole = pole;
    mesh(zc(0.011, 0.012, 1.15, -0.45, 12), M.alu, pole);                            // aluminium pole
    mesh(zc(0.013, 0.013, 0.16, 0.05, 12), M.rubber, pole);                           // grip
    mesh(zc(0.014, 0.014, 0.02, 0.14, 12), M.dark, pole);
    var head = new T.Group(); head.position.z = -1.03; pole.add(head); m.parts.head = head;
    mesh(zc(0.028, 0.025, 0.14, 0, 16), M.steel, head);                               // the chamber (holds one shell)
    mesh(zc(0.03, 0.03, 0.025, 0.065, 16), M.red, head);                               // red band: live round end
    mesh(zc(0.012, 0.018, 0.035, -0.08, 14), M.brass, head);                          // firing sleeve
    var plunger = mesh(zc(0.006, 0.008, 0.03, -0.11, 10), M.steel, head); m.parts.plunger = plunger;
    // safety pin with a red tag
    mesh(zc(0.0015, 0.0015, 0.05, 0, 6), M.steel, head, 0, 0, 0.02).rotation.y = Math.PI / 2;
    var tag = mesh(box(0.014, 0.03, 0.002, 0.001), M.red, head, 0.03, -0.018, 0.02); m.parts.tag = tag;
    m.muzzle.set(0, 0, -1.15);
    models.bangstick = m;
  }
  function buildFlare() {
    var m = newModel('flare'), k = m.kick;
    mesh(box(0.032, 0.1, 0.042, 0.012), M.orange, k, 0, -0.008, 0.008, -0.25);       // grip
    mesh(box(0.038, 0.04, 0.09, 0.01), M.orange, k, 0, 0.045, 0.0);                  // frame
    mesh(box(0.008, 0.028, 0.008, 0.002), M.dark, k, 0, 0.02, -0.03, 0.3);           // trigger
    mesh(box(0.012, 0.02, 0.018, 0.003), M.dark, k, 0, 0.074, 0.04, -0.3);           // hammer
    // the barrel breaks open (pivot under the front of the frame)
    var hinge = new T.Group(); hinge.position.set(0, 0.035, -0.04); k.add(hinge); m.parts.hinge = hinge;
    mesh(zc(0.022, 0.022, 0.17, -0.07, 18), M.orange, hinge, 0, 0.026, 0);
    mesh(zc(0.016, 0.016, 0.172, -0.07, 18, true), M.dark, hinge, 0, 0.026, 0);      // the bore
    mesh(zc(0.024, 0.024, 0.016, -0.15, 18), M.orange, hinge, 0, 0.026, 0);
    var shell = new T.Group(); shell.position.set(0, 0.026, 0.0); hinge.add(shell); m.parts.shell = shell;
    mesh(zc(0.0155, 0.0155, 0.11, -0.05, 14), M.red, shell);
    mesh(zc(0.0185, 0.0185, 0.006, 0.006, 14), M.brass, shell);                       // shell rim
    m.muzzle.set(0, 0.061, -0.2);
    models.flare = m;
  }
  function buildBaton() {
    var m = newModel('baton'), k = m.kick;
    mesh(zc(0.016, 0.018, 0.15, 0.03, 14), M.rubber, k);                              // handle
    mesh(zc(0.02, 0.02, 0.02, -0.055, 14), M.dark, k);
    var ring = mesh(zc(0.0205, 0.0205, 0.006, -0.068, 16), M.glowBlue, k); m.parts.ring = ring;
    mesh(zc(0.011, 0.014, 0.32, -0.23, 12), M.dark, k);                               // insulated shaft
    mesh(zc(0.012, 0.012, 0.02, -0.4, 12), M.steel, k);
    var tipG = new T.Group(); tipG.position.z = -0.42; k.add(tipG); m.parts.tip = tipG;
    for (var i = -1; i <= 1; i += 2) mesh(zc(0.0025, 0.0035, 0.04, -0.02, 8), M.steel, tipG, i * 0.009, 0, 0);
    // arcs between the prongs (lines, flickering while it fires)
    var arcs = [];
    for (var j = 0; j < 4; j++) { var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(8 * 3), 3)); var ln = new T.Line(geo, M.arcHand); ln.frustumCulled = false; tipG.add(ln); arcs.push(ln); }
    m.parts.arcs = arcs;
    m.muzzle.set(0, 0, -0.46);
    models.baton = m;
  }

  // How the right hand holds each kind of grip, in the weapon's own frame (the frame the model is built in).
  // f: where the fingers point, u: where the back of the hand faces, grip: the point in the hand (hand
  // space) that sits on the weapon's origin.
  var HOLD = {
    pistol: { f: V(-0.1, 0.2, -1), u: V(0.96, 0.22, 0.05), grip: V(0.0, -0.032, -0.072), curl: 0.95, thumb: 0.75 },
    pole: { f: V(-0.3, 0.42, -0.86), u: V(0.82, 0.55, 0.1), grip: V(0.0, -0.03, -0.076), curl: 0.95, thumb: 0.85 }
  };
  var mB = new T.Matrix4(), bX = V(), bY = V(), bZ = V();
  // Same math as player-hands.js orientHand: local -Z = f, local +Y = u.
  function quatFrom(out, f, u) {
    bZ.copy(f).multiplyScalar(-1).normalize();
    bY.copy(u).addScaledVector(bZ, -u.dot(bZ)).normalize();
    bX.crossVectors(bY, bZ);
    mB.makeBasis(bX, bY, bZ);
    return out.setFromRotationMatrix(mB);
  }
  // hand rotation relative to the weapon, and its inverse (weapon relative to the hand)
  Object.keys(HOLD).forEach(function (k) { var h = HOLD[k]; h.q = quatFrom(new T.Quaternion(), h.f, h.u); h.qInv = h.q.clone().invert(); });

  /* ------------------------------------------------------------------ */
  /* World things: projectiles, line, sparks, jet cone, lights, targets  */
  /* ------------------------------------------------------------------ */
  var W = { scene: null, shots: [], targets: [], line: null, linePts: null, sparks: null, jet: null, jetT: 0, flash: null, flashT: 0, flashI: 0, flareLight: null, arcs: [], arcT: 0, nextTarget: 1 };
  var SPARK_N = 160;
  var sp = { pos: null, col: null, vel: [], life: [], max: [], next: 0, rgb: [] };
  function buildWorld() {
    W.scene = TU.scene;
    // the spear line: a polyline from the muzzle to the spear
    var lg = new T.BufferGeometry(); W.linePts = new Float32Array(24 * 3); lg.setAttribute('position', new T.BufferAttribute(W.linePts, 3));
    W.line = new T.Line(lg, M.line); W.line.frustumCulled = false; W.line.visible = false; W.scene.add(W.line);
    // sparks, blood flecks and embers: one small pool of glowing points
    var g = new T.BufferGeometry(); sp.pos = new Float32Array(SPARK_N * 3); sp.col = new Float32Array(SPARK_N * 3);
    for (var i = 0; i < SPARK_N; i++) { sp.vel.push(V()); sp.life.push(0); sp.max.push(1); sp.rgb.push([1, 1, 1]); sp.pos[i * 3 + 1] = -9999; }
    g.setAttribute('position', new T.BufferAttribute(sp.pos, 3)); g.setAttribute('color', new T.BufferAttribute(sp.col, 3));
    W.sparks = new T.Points(g, new T.PointsMaterial({ size: 0.045, map: TU.tex.get('dot'), vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
    W.sparks.frustumCulled = false; W.scene.add(W.sparks);
    // the water jet: a see-through cone that flashes when you fire
    var cg = new T.ConeGeometry(1, 1, 18, 1, true); cg.translate(0, -0.5, 0); cg.rotateX(Math.PI / 2); // tip at the origin, opening toward -Z (length 1, radius 1)
    W.jet = new T.Mesh(cg, new T.MeshBasicMaterial({ color: 0xa8ecff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    W.jet.visible = false; W.scene.add(W.jet);
    // ONE fixed light, added once at boot (no shader recompiles mid-dive, and the light budget stays small):
    // a burning flare owns it, and a muzzle flash, a boom or a zap borrows it for a moment
    W.flash = W.flareLight = new T.PointLight(0xff3a24, 0, 14, 1.6); W.scene.add(W.flash);
    // world arcs from the baton to what it stunned
    for (var j = 0; j < 4; j++) { var ag = new T.BufferGeometry(); ag.setAttribute('position', new T.BufferAttribute(new Float32Array(10 * 3), 3)); var al = new T.Line(ag, M.arcWorld); al.frustumCulled = false; al.visible = false; W.scene.add(al); W.arcs.push(al); }
  }
  function spark(pos, n, rgb, speed, life) {
    for (var k = 0; k < n; k++) {
      var i = sp.next; sp.next = (sp.next + 1) % SPARK_N;
      sp.pos[i * 3] = pos.x; sp.pos[i * 3 + 1] = pos.y; sp.pos[i * 3 + 2] = pos.z;
      sp.vel[i].set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      sp.life[i] = sp.max[i] = life * (0.5 + Math.random() * 0.7); sp.rgb[i] = rgb;
    }
  }
  function sparksStep(dt) {
    for (var i = 0; i < SPARK_N; i++) {
      if (sp.life[i] <= 0) continue;
      sp.life[i] -= dt; var v = sp.vel[i]; v.multiplyScalar(Math.exp(-4 * dt)); // water stops them fast
      sp.pos[i * 3] += v.x * dt; sp.pos[i * 3 + 1] += v.y * dt; sp.pos[i * 3 + 2] += v.z * dt;
      var a = Math.max(0, sp.life[i] / sp.max[i]), c = sp.rgb[i];
      sp.col[i * 3] = c[0] * a; sp.col[i * 3 + 1] = c[1] * a; sp.col[i * 3 + 2] = c[2] * a;
      if (sp.life[i] <= 0) sp.pos[i * 3 + 1] = -9999;
    }
    W.sparks.geometry.attributes.position.needsUpdate = true; W.sparks.geometry.attributes.color.needsUpdate = true;
  }
  var RGB = { spark: [1, 0.75, 0.4], blue: [0.6, 0.85, 1], red: [1, 0.25, 0.12], blood: [0.5, 0.02, 0.02] };
  function flash(pos, intensity, color, dur) {
    W.flashPos = (W.flashPos || V()).copy(pos); W.flashCol = color || 0xffd9a8; W.flashI = intensity; W.flashT = dur || 0.12; W.flashDur = W.flashT;
  }

  /* ------------------------------------------------------------------ */
  /* Practice targets (stand-ins for creatures in tests, and for fun)    */
  /* ------------------------------------------------------------------ */
  function spawnTarget(dist, opts) {
    opts = opts || {};
    var cam = TU.camera, f = V(0, 0, -1).applyQuaternion(cam.quaternion), r = V(1, 0, 0).applyQuaternion(cam.quaternion);
    var pos = cam.position.clone().addScaledVector(f, dist || 4).addScaledVector(r, opts.dx || 0); pos.y += opts.dy || 0;
    var g = new T.Group(); g.position.copy(pos);
    var body = mesh(new T.SphereGeometry(1, 20, 14), M.target, g); body.scale.set(0.42, 0.24, 0.12); body.rotation.y = Math.PI / 2;
    var tail = mesh(new T.ConeGeometry(0.16, 0.22, 4), M.targetFin, g, 0, 0, 0); tail.rotation.z = Math.PI / 2; tail.position.x = 0.5; tail.scale.set(1, 1, 0.25);
    var eyeW = mesh(new T.SphereGeometry(0.05, 12, 10), M.white, g, -0.27, 0.07, 0.085);
    mesh(new T.SphereGeometry(0.022, 10, 8), M.rubber, eyeW, -0.01, -0.01, 0.035);
    g.lookAt(cam.position); g.rotateY(Math.PI / 2); // side-on to you
    W.scene.add(g);
    var t = { id: 't' + (W.nextTarget++), species: 'practice_target', pos: g.position, vel: V(), r: 0.36, hp: opts.hp || 100, maxHp: opts.hp || 100, stun: 0, dead: false, group: g, body: body, hurtT: 0, hits: 0 };
    W.targets.push(t);
    return { id: t.id, pos: pos.clone(), hp: t.hp };
  }
  function targetById(id) { for (var i = 0; i < W.targets.length; i++) if (W.targets[i].id === id) return W.targets[i]; return null; }
  function targetsStep(dt) {
    W.targets.forEach(function (t) {
      t.vel.multiplyScalar(Math.exp(-1.6 * dt));
      if (t.dead) t.vel.y += 0.25 * dt; // floats up belly first
      t.pos.addScaledVector(t.vel, dt);
      var c = TU.cave.collide(t.pos, t.r * 0.8, { vel: t.vel }); if (c && c.hit) { t.pos.copy(c.pos); if (c.vel) t.vel.copy(c.vel); }
      t.stun = Math.max(0, t.stun - dt); t.hurtT = Math.max(0, t.hurtT - dt);
      var wob = t.stun > 0 ? Math.sin(S.t * 18) * 0.25 * Math.min(1, t.stun) : Math.sin(S.t * 1.3 + t.r) * 0.04;
      t.body.rotation.x = wob + (t.dead ? Math.min(Math.PI, (t.deadT = (t.deadT || 0) + dt) * 2) : 0);
      t.body.material = t.hurtT > 0 ? (t._hm || (t._hm = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0x661010, roughness: 0.6, map: M.target.map }))) : M.target;
    });
  }
  function clearTargets() { W.targets.forEach(function (t) { W.scene.remove(t.group); }); W.targets.length = 0; }

  /* ------------------------------------------------------------------ */
  /* Hitting things                                                      */
  /* ------------------------------------------------------------------ */
  var rockHint = {}, tv = V(), tv2 = V(), tv3 = V();
  function CR() { return TU.creatures || {}; }
  // Nearest thing along a ray: a creature, a practice target or rock. Returns null or
  // { type: 'creature'|'target'|'rock', id, species, point: Vector3, dist }.
  function scan(origin, dir, maxDist, skipRock) {
    var best = null, C = CR();
    if (typeof C.raycastHit === 'function') {
      try {
        var h = C.raycastHit(origin, dir, maxDist);
        if (h && h.id != null && h.dist <= maxDist) best = { type: 'creature', id: h.id, species: h.species || h.speciesId || null, point: h.point ? V().copy(h.point) : origin.clone().addScaledVector(dir, h.dist), dist: h.dist };
      } catch (e) { /* creatures may be mid-change: ignore */ }
    }
    for (var i = 0; i < W.targets.length; i++) {
      var t = W.targets[i]; tv.subVectors(t.pos, origin);
      var along = tv.dot(dir); if (along < 0 || along > maxDist + t.r) continue;
      var d2 = tv.lengthSq() - along * along; if (d2 > t.r * t.r) continue;
      var hitD = along - Math.sqrt(t.r * t.r - d2); if (hitD < 0) hitD = 0;
      if (hitD <= maxDist && (!best || hitD < best.dist)) best = { type: 'target', id: t.id, species: t.species, point: origin.clone().addScaledVector(dir, hitD), dist: hitD };
    }
    if (!skipRock) {
      var rd = TU.cave.raycast(origin, dir, maxDist, rockHint);
      if (rd < maxDist - 1e-3 && (!best || rd < best.dist)) best = { type: 'rock', id: null, species: null, point: origin.clone().addScaledVector(dir, rd), dist: rd };
    }
    return best;
  }
  // Everything alive within radius (creatures and targets): [{type, id, species, pos, dist}]
  function around(pos, radius, hostile) {
    var out = [], C = CR();
    if (typeof C.inRadius === 'function') {
      try { (C.inRadius(pos, radius, hostile ? { hostile: true } : {}) || []).forEach(function (e) { out.push({ type: 'creature', id: e.id, species: e.species || e.speciesId, pos: V().copy(e.pos), dist: e.dist != null ? e.dist : pos.distanceTo(e.pos) }); }); } catch (e) { /* ignore */ }
    }
    W.targets.forEach(function (t) { var d = t.pos.distanceTo(pos); if (!t.dead && d <= radius + t.r) out.push({ type: 'target', id: t.id, species: t.species, pos: t.pos.clone(), dist: d }); });
    return out;
  }
  // Hurt a creature or target. kind: 'pierce'|'blunt'|'push'|'shock'|'cut'. Returns { hp, maxHp, killed } or null.
  function hurt(e, amount, kind, dir, point, weapon) {
    var res = null;
    if (e.type === 'creature') {
      var C = CR();
      if (typeof C.damage === 'function') { try { res = C.damage(e.id, amount, { dir: dir.clone(), point: point.clone(), weapon: weapon, kind: kind }) || null; } catch (err) { res = null; } }
    } else if (e.type === 'target') {
      var t = targetById(e.id);
      if (t && !t.dead) { t.hp = Math.max(0, t.hp - amount); t.hurtT = 0.18; t.hits++; t.vel.addScaledVector(dir, kind === 'blunt' || kind === 'push' ? 0.6 : 0.25); if (t.hp <= 0) t.dead = true; res = { hp: t.hp, maxHp: t.maxHp, killed: t.dead }; }
      else if (t) res = { hp: 0, maxHp: t.maxHp, killed: false, already: true };
    }
    // blood for sharp hits, a puff of flecks for blunt ones (it is a game about fish, some gore is fine)
    var gore = kind === 'pierce' || kind === 'cut' ? 1 : kind === 'blunt' ? 0.35 : 0.1;
    if (gore > 0.2) {
      if (typeof TU.fx.spawnBlood === 'function') TU.fx.spawnBlood(Math.round(24 * gore + (res && res.killed ? 30 : 0)), { pos: point, burst: true });
      spark(point, Math.round(5 * gore), RGB.blood, 0.6, 0.6);
    }
    if (amount > 0) sound('splat');
    S.hitT = 0.25;
    TU.emit('weapon:hit', { weapon: weapon, target: e.type, id: e.id, species: e.species || null, point: point.clone(), damage: amount, kind: kind, hp: res ? res.hp : null, killed: !!(res && res.killed) });
    if (res && res.killed && !res.already) TU.emit('ui:msg', { text: e.type === 'target' ? 'Practice fish: deceased. Marv will invoice you.' : killLine(), dur: 2.4 });
    return res;
  }
  var KILL = ['Got it. It is not getting back up.', 'That one is done biting.', 'Down it goes. Slowly. Leaking.', 'Dinner? No. Do not eat cave things.'];
  function killLine() { return KILL[Math.floor(Math.random() * KILL.length)]; }
  function push(e, vec) {
    if (e.type === 'creature') { var C = CR(); if (typeof C.impulse === 'function') { try { C.impulse(e.id, vec.clone()); } catch (err) { /* ignore */ } } }
    else { var t = targetById(e.id); if (t) t.vel.add(vec); }
  }
  function stun(pos, radius, sec) {
    var C = CR(); if (typeof C.stunArea === 'function') { try { C.stunArea(pos.clone(), radius, sec); } catch (err) { /* ignore */ } }
    W.targets.forEach(function (t) { if (t.pos.distanceTo(pos) <= radius + t.r) t.stun = Math.max(t.stun, sec); });
  }
  function rockHit(point, dir, strength) {
    spark(point, Math.round(8 + 10 * strength), RGB.spark, 1.6 * strength + 0.4, 0.35);
    if (typeof TU.fx.spawnSilt === 'function') TU.fx.spawnSilt(Math.round(14 + 30 * strength), { pos: point.clone().addScaledVector(dir, -0.1), burst: true });
    sound('clank');
    TU.emit('weapon:hit', { weapon: cur(), target: 'rock', id: null, point: point.clone(), damage: 0, kind: 'rock', killed: false });
  }
  function noise(pos, loudness, weapon, scare) {
    TU.emit('weapon:noise', { pos: pos.clone(), loudness: loudness, radius: loudness * WC.noiseRadius, weapon: weapon, scare: !!scare });
  }
  // The diver is changed through the player API (TU.player.addPanic / applyRecoil / addShake / useBattery).
  // If player.js is missing the core.js stubs do nothing, which is a harmless fallback.
  function addPanic(v) { if (typeof TU.player.addPanic === 'function') TU.player.addPanic(v); }
  function recoil(dir, amount) { if (typeof TU.player.applyRecoil === 'function') TU.player.applyRecoil(V().copy(dir).multiplyScalar(amount)); }

  /* ------------------------------------------------------------------ */
  /* Aim, muzzle and the hand to world mapping                           */
  /* ------------------------------------------------------------------ */
  var camF = V(), camR = V(), camU = V(), aimPoint = V(), muzzleW = V(), muzzleC = V(), qTmp = new T.Quaternion();
  function camBasis() {
    var q = TU.camera.quaternion;
    camF.set(0, 0, -1).applyQuaternion(q); camR.set(1, 0, 0).applyQuaternion(q); camU.set(0, 1, 0).applyQuaternion(q);
  }
  // A point in the hands scene (camera space, drawn with its own camera) to the world point that shows
  // at the same spot on screen (the two cameras have different fields of view).
  function handToWorld(out, c) {
    var hc = TU.fx.handCamera, wc = TU.camera;
    var th = Math.tan(hc.fov * Math.PI / 360) / (hc.zoom || 1), tw = Math.tan(wc.fov * Math.PI / 360) / (wc.zoom || 1), k = tw / th;
    out.set(c.x * k, c.y * k, c.z).applyQuaternion(wc.quaternion).add(wc.position);
    return out;
  }
  // Where the muzzle is in the world (the model's last placement, or a guess before the first frame).
  function muzzleWorld(out) {
    var m = models[cur()];
    if (m && m.placed) { muzzleC.copy(m.muzzle).applyQuaternion(m.root.quaternion).add(m.root.position); return handToWorld(out, muzzleC); }
    camBasis(); return out.copy(TU.camera.position).addScaledVector(camR, 0.12).addScaledVector(camU, -0.1).addScaledVector(camF, 0.5);
  }
  // Where the crosshair points: the first thing hit along the view (up to 40 m).
  function aimAt(out, spread) {
    camBasis();
    var d = tv3.copy(camF);
    if (spread) { d.addScaledVector(camR, (Math.random() - 0.5) * spread).addScaledVector(camU, (Math.random() - 0.5) * spread).normalize(); }
    var h = scan(TU.camera.position, d, 40);
    return out.copy(TU.camera.position).addScaledVector(d, h ? h.dist : 30);
  }

  /* ------------------------------------------------------------------ */
  /* Ammo, reset and ownership                                           */
  /* ------------------------------------------------------------------ */
  function carryLimit(id) { return WC[id] && WC[id].pack ? WC[id].pack[2] : 0; }
  function resetAmmo(id) {
    var a = sw().ammo;
    if (id === 'speargun') { var n = Math.min(a.spears, carryLimit('speargun')); S.gun.loaded = n > 0; S.gun.spare = Math.max(0, n - 1); S.start.spears = n; }
    if (id === 'bangstick') { var b = Math.min(a.bang, carryLimit('bangstick')); S.bang.loaded = b > 0; S.bang.spare = Math.max(0, b - 1); S.start.bang = b; }
    if (id === 'flare') { var f = Math.min(a.flares, carryLimit('flare')); S.flare.loaded = f > 0; S.flare.spare = Math.max(0, f - 1); S.start.flares = f; }
  }
  function spearsInHand() { return (S.gun.loaded ? 1 : 0) + S.gun.spare + (S.spearOut && S.spearOut.line ? 1 : 0); }
  // At the end of a dive: used shells and flares and lost spears come out of the stock.
  function settleAmmo() {
    if (!TU.run || TU.run.tutorial) return;
    var a = sw().ammo;
    if (S.primary === 'speargun') { var lost = Math.max(0, S.start.spears - spearsInHand()); a.spears = Math.max(0, a.spears - lost); S.start.spears = spearsInHand(); }
    if (S.primary === 'bangstick') { var ub = Math.max(0, S.start.bang - ((S.bang.loaded ? 1 : 0) + S.bang.spare)); a.bang = Math.max(0, a.bang - ub); S.start.bang -= ub; }
    if (S.primary === 'flare') { var uf = Math.max(0, S.start.flares - ((S.flare.loaded ? 1 : 0) + S.flare.spare)); a.flares = Math.max(0, a.flares - uf); S.start.flares -= uf; }
    TU.save.write();
  }
  function clearShots() {
    W.shots.forEach(function (s) { if (s.mesh) W.scene.remove(s.mesh); if (s.glow) W.scene.remove(s.glow); });
    W.shots.length = 0; S.spearOut = null; W.line.visible = false; W.flareLight.intensity = 0; S.flareLightOwner = null;
  }
  function reset(run) {
    var w = sw();
    S.primary = w.owned[w.selected] ? w.selected : 'polespear';
    S.active = 'primary'; S.drawn = false; S.swapTo = null; S.draw = 0; S.aim = 0; S.aimHeld = false; S.fireHeld = false; S.fireQueued = false; S.reloadQueued = false;
    S.cool = 0; S.act = null; S.kick = 0; S.t = 0; S.autoReel = false; S.hitT = 0; S.lastMsg = -9;
    S.gun = { loaded: false, spare: 0 }; S.bang = { loaded: false, spare: 0 }; S.flare = { loaded: false, spare: 0 }; S.start = { spears: 0, bang: 0, flares: 0 };
    resetAmmo(S.primary);
    clearShots(); clearTargets();
    if (TU.camera) { TU.camera.zoom = 1; TU.camera.updateProjectionMatrix(); }
    if (run && !run.tutorial && TU.save.data.progress.runs < 4) {
      TU.emit('ui:hint', { text: '4 draws your ' + DEFS[S.primary].name.toLowerCase() + '. Click attacks, hold right mouse to aim, Y reloads, 5 swaps to the knife.', dur: 6 });
    }
    if (S.primary === 'speargun' && !S.gun.loaded && run && !run.tutorial) TU.emit('ui:msg', { text: 'No spears for the speargun. Buy some at the Gear Tent.', dur: 3 });
  }
  // Tests and the camp: pick the primary for this dive right now (ammo comes from the stock).
  function equip(id) {
    if (!DEFS[id]) return false;
    if (id === 'knife') { S.active = 'knife'; return true; }
    if (!owned(id)) return false;
    if (S.spearOut) detachSpear();
    S.primary = id; S.active = 'primary'; S.act = null; S.cool = 0; resetAmmo(id);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */
  // Can the weapon be used right now? (drawn, raised, not busy with something else)
  function ready() { return S.drawn && !S.busy && !S.swapTo && S.draw > 0.85 && TU.state.simulating(); }
  function startAct(kind, dur, extra) { S.act = { kind: kind, t: 0, dur: dur, done: false }; if (extra) for (var k in extra) S.act[k] = extra[k]; return S.act; }
  function fire() {
    if (!TU.state.simulating()) return false;
    if (!S.drawn) { setDrawn(true); return false; }
    if (!ready()) return false;
    var ok = attack();
    if (ok) TU.emit('weapon:fire', { weapon: cur() });
    return ok;
  }
  function attack() {
    var id = cur(), c = WC[id];
    if (S.act && S.act.kind === 'reload') return false;
    if (S.cool > 0 && id !== 'speargun') return false;
    if (id === 'knife') { if (S.act) return false; S.swingSide = -S.swingSide; startAct('swing', 0.42); S.cool = c.cooldown; sound('swish'); noise(P.pos, 0.1, id); return true; }
    if (id === 'polespear') { if (S.act) return false; startAct('thrust', c.windup + c.thrust + 0.55); S.cool = c.cooldown; return true; }
    if (id === 'bangstick') {
      if (S.act) return false;
      if (!S.bang.loaded) { sound('click'); msg(S.bang.spare > 0 ? 'Empty. Y loads a shell (' + S.bang.spare + ' left).' : 'Out of shells. The stick is just a stick now.'); return false; }
      startAct('jab', 0.5); S.cool = 0.5; return true;
    }
    if (id === 'speargun') return fireSpear();
    if (id === 'jet') return fireJet();
    if (id === 'flare') return fireFlare();
    if (id === 'baton') return fireBaton();
    return false;
  }
  function reload() {
    if (!TU.state.simulating() || !S.drawn) return false;
    var id = cur(), c = WC[id];
    if (S.act && (S.act.kind === 'reload' || S.act.kind === 'swing' || S.act.kind === 'thrust' || S.act.kind === 'jab')) return false;
    if (id === 'speargun') {
      if (S.spearOut && S.spearOut.line) { S.autoReel = true; msg('Reeling the line in...', 1.4); return true; }
      if (S.gun.loaded) { msg('Already loaded.', 1.2); return false; }
      if (S.gun.spare <= 0) { sound('click'); msg('No spears left. Find the ones you shot.'); return false; }
      startAct('reload', c.reload, { kindOf: 'speargun' }); sound('ratchet'); TU.emit('weapon:reload', { weapon: id }); return true;
    }
    if (id === 'bangstick') {
      if (S.bang.loaded) { msg('A shell is already in.', 1.2); return false; }
      if (S.bang.spare <= 0) { sound('click'); msg('No shells left.'); return false; }
      startAct('reload', c.reload, { kindOf: 'bangstick' }); sound('ratchet'); TU.emit('weapon:reload', { weapon: id }); return true;
    }
    if (id === 'flare') {
      if (S.flare.loaded) { msg('Already loaded.', 1.2); return false; }
      if (S.flare.spare <= 0) { sound('click'); msg('No flares left.'); return false; }
      startAct('reload', c.reload, { kindOf: 'flare' }); sound('click'); TU.emit('weapon:reload', { weapon: id }); return true;
    }
    if (id === 'polespear') { msg('Pole spears reload themselves. Just wait for the band.', 1.6); return false; }
    return false;
  }
  function setDrawn(on) {
    if (on === S.drawn) return S.drawn;
    if (!on && S.spearOut && S.spearOut.line && S.spearOut.state !== 'reel') detachSpear(true);
    S.drawn = !!on; S.act = null;
    TU.emit('weapon:switch', { weapon: cur(), drawn: S.drawn });
    return S.drawn;
  }
  function swap() {
    if (!TU.state.simulating()) return false;
    var to = S.active === 'knife' ? 'primary' : 'knife';
    if (!S.drawn) { S.active = to; setDrawn(true); TU.emit('weapon:switch', { weapon: cur(), drawn: true }); return true; }
    if (S.spearOut && S.spearOut.line && S.spearOut.state !== 'reel') detachSpear(true);
    S.swapTo = to; S.act = null; return true;
  }

  // ---- melee: the knife, the pole spear thrust, the bang stick jab ----
  function meleeTarget(reach) {
    camBasis();
    var o = TU.camera.position, h = scan(o, camF, reach);
    if (h && h.type !== 'rock') return h;
    // a little forgiveness: anything alive close to the line of the blade
    var best = null, bestScore = 0, list = around(tv2.copy(o).addScaledVector(camF, reach * 0.55), reach * 0.65);
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; tv.subVectors(e.pos, o); var d = tv.length(); if (d > reach + 0.4) continue;
      var dot = tv.dot(camF) / (d || 1); if (dot < 0.8) continue;
      var score = dot - d * 0.05; if (score > bestScore) { bestScore = score; best = e; }
    }
    if (best) return { type: best.type, id: best.id, species: best.species, point: best.pos.clone(), dist: best.pos.distanceTo(o) };
    return h; // rock or nothing
  }
  function meleeStrike(id, reach, dmg, kind) {
    var h = meleeTarget(reach);
    if (!h) return null;
    if (h.type === 'rock') { rockHit(h.point, camF, id === 'knife' ? 0.4 : 0.7); recoil(camF, -0.4); return h; }
    hurt(h, dmg, kind, camF, h.point, id);
    push(h, tv.copy(camF).multiplyScalar(id === 'polespear' ? 1.2 : 0.5));
    return h;
  }
  function detonate(point, onRock) {
    var c = WC.bangstick, id = 'bangstick';
    S.bang.loaded = false;
    camBasis();
    // the shell goes off: a direct hit for whatever the tip touches, a shockwave for everything around
    var direct = onRock ? null : meleeTarget(c.reach + 0.3);
    if (direct && direct.type !== 'rock') hurt(direct, c.damage, 'pierce', camF, direct.point, id);
    around(point, c.radius).forEach(function (e) {
      if (direct && e.id === direct.id) return;
      var f = 1 - clamp(e.dist / c.radius, 0, 1);
      hurt(e, Math.round(140 * f * f), 'blunt', tv.subVectors(e.pos, point).normalize(), e.pos, id);
      push(e, tv.multiplyScalar(7 * f));
    });
    stun(point, c.radius, c.stun);
    // you feel it too
    addPanic(c.panic); if (typeof TU.fx.shake === 'function') TU.fx.shake(c.shake); if (typeof TU.player.addShake === 'function') TU.player.addShake(c.shake);
    recoil(camF, -1.4);
    spark(point, 40, RGB.spark, 3.5, 0.5);
    if (typeof TU.fx.spawnSilt === 'function') TU.fx.spawnSilt(onRock ? 320 : 160, { pos: point, burst: true });
    if (typeof TU.fx.spawnBubbles === 'function') TU.fx.spawnBubbles(70, { pos: point });
    if (onRock && typeof TU.fx.spawnDebris === 'function') TU.fx.spawnDebris(24, { pos: point, radius: 1.2 });
    flash(point, 9, 0xffe2b0, 0.2);
    sound('boom'); S.kick = 1.4;
    noise(point, 1, id, true);
    // blowing up the cave wall is a choice: sometimes the ceiling answers
    if (onRock && TU.cave && typeof TU.cave.quake === 'function' && Math.random() < 0.5) { try { TU.cave.quake(0.35, { pos: point.clone() }); } catch (e) { /* ignore */ } }
    msg(onRock ? 'You blew up a rock. The rock is fine. Your ears are not.' : 'BOOM.', 2);
  }
  // ---- speargun ----
  function makeShotMesh(type) {
    if (type === 'spear') { var g = spearGeo(1.15); W.scene.add(g); return g; }
    var f = new T.Group();
    mesh(zc(0.012, 0.012, 0.14, 0.07, 10), M.red, f);
    mesh(zc(0.009, 0.012, 0.02, 0.0, 10), M.dark, f);
    W.scene.add(f); return f;
  }
  function fireSpear() {
    var c = WC.speargun;
    if (S.spearOut) { if (S.spearOut.line) { sound('click'); msg('Your spear is still out. Hold click to reel, or Y.', 1.6); } return false; }
    if (S.act && S.act.kind === 'reload') return false;
    if (!S.gun.loaded) { sound('click'); msg(S.gun.spare > 0 ? 'Not loaded. Y pushes a spear in.' : 'No spears left. Pick up the ones you shot.'); return false; }
    muzzleWorld(muzzleW); aimAt(aimPoint, S.aim > 0.6 ? 0.0 : 0.012);
    var dir = V().subVectors(aimPoint, muzzleW); if (dir.lengthSq() < 0.01) dir.copy(camF); dir.normalize();
    var shot = { type: 'spear', pos: muzzleW.clone().addScaledVector(dir, 0.15), vel: dir.clone().multiplyScalar(c.speed).addScaledVector(P.vel, 0.5), dir: dir.clone(),
      state: 'fly', line: true, t: 0, t0: S.t, mesh: makeShotMesh('spear'), pinId: null, pinType: null, off: V(), tension: 0, pullT: 0 };
    shot.mesh.position.copy(shot.pos); shot.mesh.quaternion.setFromUnitVectors(V(0, 0, -1), dir);
    W.shots.push(shot); S.spearOut = shot; S.gun.loaded = false; S.autoReel = false;
    S.kick = 1; recoil(dir, -0.35);
    if (typeof TU.fx.spawnBubbles === 'function') TU.fx.spawnBubbles(14, { pos: muzzleW });
    sound('thunk'); noise(muzzleW, 0.45, 'speargun');
    return true;
  }
  function detachSpear(quiet) {
    var s = S.spearOut; if (!s) return;
    s.line = false; S.spearOut = null; W.line.visible = false;
    if (s.state === 'pinned' || s.state === 'fly') { s.state = s.state === 'fly' ? 'fly' : 'pinned'; }
    if (!quiet) msg('You unclip the line. The spear stays where it is.', 1.8);
  }
  function returnSpear(s) {
    W.scene.remove(s.mesh); var i = W.shots.indexOf(s); if (i >= 0) W.shots.splice(i, 1);
    if (S.spearOut === s) S.spearOut = null;
    S.gun.spare++; W.line.visible = false;
    sound('reel');
    if (S.autoReel && !S.gun.loaded && cur() === 'speargun') { S.autoReel = false; S.gun.spare--; startAct('reload', WC.speargun.reload, { kindOf: 'speargun', took: true }); sound('ratchet'); }
  }
  function entityPos(type, id) {
    if (type === 'target') { var t = targetById(id); return t ? t.pos : null; }
    var C = CR(); if (typeof C.get === 'function') { try { var r = C.get(id); return r && r.pos ? r.pos : null; } catch (e) { return null; } }
    return null;
  }
  function spearStep(s, dt) {
    var c = WC.speargun, reeling = s.line && (S.autoReel || (S.fireHeld && S.fireDownT > s.t0 + 0.05)) && cur() === 'speargun' && S.drawn;
    s.t += dt;
    var muzzle = s.line ? muzzleWorld(muzzleW) : null;
    if (s.state === 'fly') {
      var spd = s.vel.length();
      s.vel.multiplyScalar(Math.exp(-c.drag * dt)); s.vel.y -= c.sink * dt;
      var step = s.vel.length() * dt; s.dir.copy(s.vel).normalize();
      var h = scan(s.pos, s.dir, step + 0.02);
      if (h && h.type !== 'rock') {
        var dmg = Math.round(c.damage * clamp(spd / c.speed, 0.35, 1));
        s.pos.copy(h.point);
        var res = hurt(h, dmg, 'pierce', s.dir, h.point, 'speargun');
        var ep = entityPos(h.type, h.id);
        if (ep) { s.state = 'pinned'; s.pinType = h.type; s.pinId = h.id; s.off.subVectors(s.pos, ep).addScaledVector(s.dir, 0.12); }
        else s.state = 'drift';
        push(h, tv.copy(s.dir).multiplyScalar(1.2));
        if (res && res.killed) msg('Pinned it. It has stopped arguing.', 1.8);
      } else if (h && h.type === 'rock') {
        s.pos.copy(h.point).addScaledVector(s.dir, 0.07); s.state = 'stuck'; s.vel.set(0, 0, 0);
        rockHit(h.point, s.dir, 0.8);
      } else {
        s.pos.addScaledVector(s.vel, dt);
        if (s.t < 0.6 && typeof TU.fx.spawnBubbles === 'function' && (Math.random() < 0.6)) TU.fx.spawnBubbles(1, { pos: tv.copy(s.pos).addScaledVector(s.dir, 0.5) });
        if (s.vel.length() < 0.5) s.state = 'drift';
      }
      // the line stops it at full length
      if (s.line && muzzle) {
        tv.subVectors(s.pos, muzzle); var L = tv.length();
        if (L > c.line) { s.pos.copy(muzzle).addScaledVector(tv.normalize(), c.line); s.vel.multiplyScalar(0.15); s.vel.addScaledVector(tv, -0.3); if (s.state === 'fly') sound('snap'); s.state = 'drift'; }
      }
    } else if (s.state === 'drift') {
      // slowly sinks to the floor
      s.vel.multiplyScalar(Math.exp(-2.5 * dt)); s.vel.y -= 0.6 * dt; s.vel.y = Math.max(s.vel.y, -0.35);
      s.pos.addScaledVector(s.vel, dt);
      var col = TU.cave.collide(s.pos, 0.02, { vel: s.vel, hint: s.hint || (s.hint = {}) });
      if (col && col.hit) { s.pos.copy(col.pos); s.state = 'rest'; s.vel.set(0, 0, 0); s.dir.set(s.dir.x, 0, s.dir.z).normalize(); if (s.dir.lengthSq() < 0.1) s.dir.set(0, 0, -1); }
    } else if (s.state === 'pinned') {
      var ep2 = entityPos(s.pinType, s.pinId);
      if (!ep2) { s.state = 'drift'; }
      else {
        s.pos.copy(ep2).add(s.off);
        if (s.line && muzzle) {
          tv.subVectors(muzzle, s.pos); var L2 = tv.length(); tv.normalize();
          if (L2 > c.line) {
            // the fish is pulling: it drags you a little, and the line can snap
            s.tension += dt; push({ type: s.pinType, id: s.pinId }, tv2.copy(tv).multiplyScalar(3 * dt));
            recoil(tv, -0.9 * dt);
            if (s.tension > c.snapAfter) { sound('snap'); detachSpear(true); msg('SNAP. The line broke. Your spear swims off inside it.', 2.6); return; }
          } else s.tension = Math.max(0, s.tension - dt);
          if (reeling) {
            push({ type: s.pinType, id: s.pinId }, tv2.copy(tv).multiplyScalar(c.pull * dt * 2.5));
            if (L2 < 1.4) { hurt({ type: s.pinType, id: s.pinId, species: null }, 6, 'cut', tv, s.pos, 'speargun'); s.state = 'reel'; msg('The spear tears free.', 1.4); }
          }
        }
      }
    } else if (s.state === 'stuck' || s.state === 'rest') {
      if (reeling && s.line) {
        s.pullT += dt; s.pos.addScaledVector(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.01);
        if (s.pullT > (s.state === 'stuck' ? 0.6 : 0.1)) { s.state = 'reel'; if (typeof TU.fx.spawnSilt === 'function') TU.fx.spawnSilt(16, { pos: s.pos, burst: true }); }
      }
      // a loose spear (no line) is picked up by swimming close to it
      if (!s.line && s.pos.distanceTo(P.pos) < c.pickup) {
        W.scene.remove(s.mesh); W.shots.splice(W.shots.indexOf(s), 1);
        if (S.primary === 'speargun') { S.gun.spare++; msg('Got a spear back (' + spearsInHand() + ' now).', 1.8); sound('reel'); }
        else { msg('A lost spear. Useless without the gun.', 1.6); }
        return;
      }
    }
    if (s.state === 'reel' && s.line && muzzle) {
      tv.subVectors(muzzle, s.pos); var L3 = tv.length();
      if (L3 < 0.45) { returnSpear(s); return; }
      s.pos.addScaledVector(tv.normalize(), Math.min(L3, c.reel * dt * (reeling ? 1.4 : 1)));
      s.dir.lerp(tv.multiplyScalar(-1), 0.2).normalize();
    }
    if (!s.line && s.state === 'reel') s.state = 'drift';
    s.mesh.position.copy(s.pos);
    s.mesh.quaternion.setFromUnitVectors(V(0, 0, -1), s.dir);
  }
  // The line: from the muzzle to the back of the spear, sagging when slack.
  function drawLine() {
    var s = S.spearOut;
    if (!s || !s.line || !S.drawn) { W.line.visible = false; return; }
    muzzleWorld(muzzleW);
    var tail = tv2.copy(s.pos).addScaledVector(s.dir, 0.36); // the line is tied near the back
    var L = muzzleW.distanceTo(tail), slack = clamp(WC.speargun.line - L, 0, WC.speargun.line);
    var sag = Math.min(0.9, slack * 0.12) * (s.state === 'fly' ? 0.4 : 1), n = W.linePts.length / 3;
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1);
      tv.lerpVectors(muzzleW, tail, u);
      tv.y -= Math.sin(Math.PI * u) * sag;
      tv.x += Math.sin(u * 9 + S.t * 2) * 0.02 * sag; tv.z += Math.cos(u * 7 + S.t * 1.7) * 0.02 * sag;
      W.linePts[i * 3] = tv.x; W.linePts[i * 3 + 1] = tv.y; W.linePts[i * 3 + 2] = tv.z;
    }
    W.line.geometry.attributes.position.needsUpdate = true; W.line.geometry.computeBoundingSphere(); W.line.visible = true;
  }
  // ---- jet gun ----
  function fireJet() {
    var c = WC.jet;
    if (S.act) return false;
    if ((P.air || 0) < c.air + 2) { sound('click'); msg('Not enough air in this tank for the jet. Breathing comes first.'); return false; }
    if (typeof TU.player.setAir === 'function') TU.player.setAir((P.air || 0) - c.air, false);
    muzzleWorld(muzzleW); camBasis();
    var dir = V().subVectors(aimAt(aimPoint, 0), muzzleW).normalize();
    var hits = 0;
    around(muzzleW, c.range).forEach(function (e) {
      tv.subVectors(e.pos, muzzleW); var d = tv.length() || 0.01; var ang = Math.acos(clamp(tv.dot(dir) / d, -1, 1));
      if (ang > c.cone + 0.35 / d) return;
      // free path to it? (the jet does not go through rock)
      if (TU.cave.raycast(muzzleW, tv.normalize(), d, rockHint) < d - 0.2) return;
      var f = Math.pow(1 - clamp(d / c.range, 0, 1), 0.7);
      push(e, tv2.copy(dir).multiplyScalar(c.push * f).addScaledVector(camU, 0.6 * f));
      stun(e.pos, 0.5, c.stun * f + 0.3);
      hurt(e, Math.max(1, Math.round(c.damage * f)), 'push', dir, e.pos, 'jet'); hits++;
    });
    // silt where the jet hits the floor or a wall
    var rd = TU.cave.raycast(muzzleW, dir, c.range, rockHint);
    if (rd < c.range && typeof TU.fx.spawnSilt === 'function') TU.fx.spawnSilt(c.silt, { pos: tv.copy(muzzleW).addScaledVector(dir, rd * 0.95), vel: tv2.copy(dir).multiplyScalar(-0.6), burst: true });
    if (P.env && P.env.floorY != null && P.pos.y - P.env.floorY < 2.2 && typeof TU.fx.spawnSilt === 'function') TU.fx.spawnSilt(Math.round(c.silt * 0.4), { pos: tv.set(P.pos.x, P.env.floorY + 0.2, P.pos.z), burst: true });
    // bubbles all along the jet
    if (typeof TU.fx.spawnBubbles === 'function') for (var i = 0; i < 6; i++) TU.fx.spawnBubbles(4, { pos: tv.copy(muzzleW).addScaledVector(dir, (i + 0.5) * Math.min(rd, c.range) / 6), right: dir });
    // the cone flash
    W.jet.position.copy(muzzleW); W.jet.quaternion.setFromUnitVectors(V(0, 0, -1), dir);
    W.jetLen = Math.min(rd, c.range); W.jetT = 0.4; W.jet.visible = true;
    // recoil: the jet pushes you backward (it is a lot of water)
    recoil(dir, -c.recoil); addPanic(c.panic);
    S.kick = 1.2; S.cool = c.cooldown;
    sound('hiss'); noise(muzzleW, 0.6, 'jet');
    startAct('fire', 0.3);
    return true;
  }
  // ---- flare gun ----
  function fireFlare() {
    var c = WC.flare;
    if (S.act) return false;
    if (!S.flare.loaded) { sound('click'); msg(S.flare.spare > 0 ? 'Empty. Y breaks it open and loads a flare.' : 'No flares left.'); return false; }
    muzzleWorld(muzzleW); aimAt(aimPoint, S.aim > 0.6 ? 0 : 0.02);
    var dir = V().subVectors(aimPoint, muzzleW).normalize();
    var s = { type: 'flare', pos: muzzleW.clone().addScaledVector(dir, 0.1), vel: dir.clone().multiplyScalar(c.speed), dir: dir.clone(), state: 'fly', t: 0, burn: c.burn, mesh: makeShotMesh('flare'), hint: {}, scareT: 0, hitSet: {} };
    s.glow = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0xff4a2a, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.glow.scale.setScalar(0.9); W.scene.add(s.glow);
    W.shots.push(s); S.flare.loaded = false; S.flareLightOwner = s;
    S.kick = 1.1; flash(muzzleW, 4, 0xff6a3a, 0.1);
    sound('pop'); noise(muzzleW, 0.35, 'flare', true);
    TU.emit('weapon:flare', { pos: s.pos.clone(), radius: c.scare, on: true });
    startAct('fire', 0.3);
    return true;
  }
  function flareStep(s, dt) {
    var c = WC.flare;
    s.t += dt; s.burn -= dt;
    if (s.state === 'fly') {
      s.vel.multiplyScalar(Math.exp(-c.drag * dt)); s.vel.y -= c.sink * dt;
      var step = s.vel.length() * dt; if (step > 1e-4) s.dir.copy(s.vel).normalize();
      var h = scan(s.pos, s.dir, step + 0.02, true);
      if (h && !s.hitSet[h.id]) { s.hitSet[h.id] = true; hurt(h, c.damage, 'blunt', s.dir, h.point, 'flare'); s.vel.multiplyScalar(-0.2); }
      s.pos.addScaledVector(s.vel, dt);
      var col = TU.cave.collide(s.pos, 0.03, { vel: s.vel, hint: s.hint });
      if (col && col.hit) { s.pos.copy(col.pos); if (col.vel) s.vel.copy(col.vel).multiplyScalar(0.4); spark(s.pos, 8, RGB.red, 1.2, 0.4); if (s.vel.length() < 0.4) { s.state = 'rest'; s.vel.set(0, 0, 0); } }
      if (s.vel.length() < 0.25 && s.t > 0.5) s.state = 'sink';
    } else if (s.state === 'sink') {
      s.vel.y = Math.max(s.vel.y - 0.3 * dt, -0.2); s.pos.addScaledVector(s.vel, dt);
      var col2 = TU.cave.collide(s.pos, 0.03, { vel: s.vel, hint: s.hint }); if (col2 && col2.hit) { s.pos.copy(col2.pos); s.state = 'rest'; s.vel.set(0, 0, 0); }
    }
    // burning: smoke bubbles, embers, and scaring things that bite
    if (s.burn > 0) {
      if (Math.random() < 0.25 && typeof TU.fx.spawnBubbles === 'function') TU.fx.spawnBubbles(1, { pos: s.pos });
      if (Math.random() < 0.3) spark(s.pos, 1, RGB.red, 0.25, 0.7);
      s.scareT -= dt;
      if (s.scareT <= 0) {
        s.scareT = 0.5;
        around(s.pos, c.scare, true).forEach(function (e) { push(e, tv.subVectors(e.pos, s.pos).normalize().multiplyScalar(1.6)); });
        // schools of small fish panic at the light
        around(s.pos, c.scare * 0.5, false).forEach(function (e) { if (Math.random() < 0.3) push(e, tv.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(1.2)); });
        if (Math.floor(s.t) % 2 === 0) noise(s.pos, 0.2, 'flare', true);
      }
    } else if (!s.out) { s.out = true; TU.emit('weapon:flare', { pos: s.pos.clone(), radius: c.scare, on: false }); }
    s.mesh.position.copy(s.pos); s.mesh.quaternion.setFromUnitVectors(V(0, 0, -1), s.dir);
    if (s.burn < -20) { W.scene.remove(s.mesh); W.scene.remove(s.glow); W.shots.splice(W.shots.indexOf(s), 1); if (S.flareLightOwner === s) S.flareLightOwner = null; }
  }
  // ---- shock baton ----
  function fireBaton() {
    var c = WC.baton;
    if (S.act) return false;
    if ((P.battery || 0) < c.battery + 1 || typeof TU.player.useBattery !== 'function' || !TU.player.useBattery(c.battery / 100)) { sound('click'); msg('Battery too low to zap. (It also runs your light.)'); return false; }
    camBasis();
    var center = V().copy(TU.camera.position).addScaledVector(camF, 1.0);
    stun(center, c.radius, c.stun);
    var list = around(center, c.radius);
    list.forEach(function (e) { hurt(e, c.damage, 'shock', tv.subVectors(e.pos, center).normalize(), e.pos, 'baton'); push(e, tv.multiplyScalar(1.4)); });
    W.arcList = list.slice(0, 4).map(function (e) { return e.pos.clone(); });
    W.arcT = 0.45; flash(center, 3, 0x9fdcff, 0.2);
    spark(center, 18, RGB.blue, 2.2, 0.3);
    S.kick = 0.5; S.cool = c.cooldown;
    sound('zap'); noise(center, 0.5, 'baton');
    startAct('zap', 0.45);
    if (list.length === 0) msg('Bzzt. Nothing close enough. You lit up the water for no one.', 1.8);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  function locked() { return !!(TU.canvas && document.pointerLockElement === TU.canvas); }
  // True when a key or click should not reach the weapon (menus, the wrist computer, a text box).
  function blocked() {
    if (!TU.state.is('dive')) return true;
    if (P.wristRaised || P.mode === 'ragdoll') return true;
    try { if (TU.ui.coversScreen()) return true; } catch (e) { /* ignore */ }
    var sl = TU.$('ui-slate'), wp = TU.$('ui-wpname');
    if ((sl && sl.classList.contains('ui-on')) || (wp && wp.classList.contains('ui-on'))) return true;
    return false;
  }
  var lastWheel = 0;
  function bindInput() {
    window.addEventListener('mousedown', function (e) {
      if (blocked() || !locked()) return;
      if (e.button === 0) { S.fireHeld = true; S.fireDownT = S.t; S.fireQueued = true; }
      else if (e.button === 2) { S.aimHeld = true; }
    });
    window.addEventListener('mouseup', function (e) { if (e.button === 0) S.fireHeld = false; else if (e.button === 2) S.aimHeld = false; });
    window.addEventListener('contextmenu', function (e) { if (TU.state.is('dive')) e.preventDefault(); });
    window.addEventListener('keydown', function (e) {
      if (e.repeat || blocked()) return;
      var tag = (e.target && e.target.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'KeyY') S.reloadQueued = true;
      else if (e.code === 'Digit4') setDrawn(!S.drawn);
      else if (e.code === 'Digit5') swap();
    });
    window.addEventListener('wheel', function (e) {
      if (blocked() || !locked()) return;
      var now = performance.now(); if (now - lastWheel < 300) return; lastWheel = now; swap();
    }, { passive: true });
    window.addEventListener('blur', function () { S.fireHeld = false; S.aimHeld = false; });
    TU.on('state:change', function (e) { if (e.to !== 'dive') { S.fireHeld = false; S.aimHeld = false; } });
  }
  // The weapon keys on the Controls screen (TU.player.bindings is the list ui.js shows).
  function addBindings() {
    var b = TU.player.bindings; if (!Array.isArray(b) || b.some(function (x) { return x && x.owner === 'weapons'; })) return;
    var at = b.indexOf('Screens'); if (at < 0) at = b.length;
    b.splice(at, 0, 'Weapons',
      { action: 'fire', keys: ['MouseLeft'], label: 'Fire or attack (weapon drawn, mouse locked). Speargun: hold to reel the line in', type: 'press', owner: 'weapons' },
      { action: 'aim', keys: ['MouseRight'], label: 'Hold: aim (zooms a little, steadier)', type: 'hold', owner: 'weapons' },
      { action: 'reload', keys: ['KeyY'], label: 'Reload (speargun: reel in, then push the spear in)', type: 'press', owner: 'weapons' },
      { action: 'holster', keys: ['Digit4'], label: 'Draw or put away your weapon', type: 'press', owner: 'weapons' },
      { action: 'swapWeapon', keys: ['Digit5', 'Wheel'], label: 'Swap between your primary weapon and the knife', type: 'press', owner: 'weapons' });
  }

  /* ------------------------------------------------------------------ */
  /* Fixed step                                                          */
  /* ------------------------------------------------------------------ */
  function busyNow() {
    var A = P.anim || {};
    return !!(A.grab || A.tape >= 0 || A.lantern || A.measure || A.maskClear || A.climb >= 0 || A.ragdoll || P.mode === 'squeeze' || P.mode === 'crawl' || P.mode === 'ragdoll');
  }
  function update(dt) {
    S.t += dt;
    S.busy = busyNow();
    // effect timers run on game time (frames only draw them)
    W.flashT = Math.max(0, W.flashT - dt); W.jetT = Math.max(0, W.jetT - dt); W.arcT = Math.max(0, W.arcT - dt);
    S.cool = Math.max(0, S.cool - dt); S.kick = damp(S.kick, 0, 9, dt); S.hitT = Math.max(0, S.hitT - dt);
    // draw / holster / swap
    var want = S.drawn && !S.busy && !S.swapTo ? 1 : 0;
    S.draw = clamp(S.draw + (want ? dt * 3.2 : -dt * 4.5), 0, 1);
    if (S.swapTo && S.draw < 0.08) { S.active = S.swapTo; S.swapTo = null; TU.emit('weapon:switch', { weapon: cur(), drawn: S.drawn }); }
    S.aim = damp(S.aim, S.aimHeld && S.draw > 0.5 ? 1 : 0, 9, dt);
    if (S.fireQueued) { S.fireQueued = false; fire(); }
    if (S.reloadQueued) { S.reloadQueued = false; reload(); }
    // actions in progress
    var a = S.act, id = cur();
    if (a) {
      a.t += dt;
      if (a.kind === 'swing' && !a.done && a.t >= WC.knife.hitAt) { a.done = true; meleeStrike('knife', WC.knife.reach, WC.knife.damage, 'cut'); }
      if (a.kind === 'thrust') {
        var c = WC.polespear;
        if (!a.snd && a.t >= c.windup) { a.snd = true; sound('thrust'); noise(P.pos, 0.15, 'polespear'); }
        if (!a.done && a.t >= c.windup + c.thrust * 0.7) { a.done = true; meleeStrike('polespear', c.reach, c.damage, 'pierce'); }
      }
      if (a.kind === 'jab' && !a.done && a.t >= 0.14) {
        a.done = true; var bc = WC.bangstick, h = meleeTarget(bc.reach);
        if (h && h.type !== 'rock') detonate(h.point, false);
        else if (h && h.type === 'rock') detonate(h.point, true);
        else msg('The bang stick only fires on contact. Jab it INTO something.', 2);
      }
      if (a.kind === 'reload' && a.t >= a.dur) {
        if (a.kindOf === 'speargun') { if (!a.took) S.gun.spare--; S.gun.loaded = true; }
        if (a.kindOf === 'bangstick') { S.bang.spare--; S.bang.loaded = true; }
        if (a.kindOf === 'flare') { S.flare.spare--; S.flare.loaded = true; }
        sound('click');
      }
      if (a.t >= a.dur || (a.kind === 'reload' && cur() !== a.kindOf)) S.act = null;
      if (S.draw < 0.5 && S.act && S.act.kind === 'reload') S.act = null; // put away mid-reload: start over later
    }
    // projectiles
    for (var i = W.shots.length - 1; i >= 0; i--) { var s = W.shots[i]; if (!s) continue; if (s.type === 'spear') spearStep(s, dt); else flareStep(s, dt); }
    targetsStep(dt);
  }
  function idle(dt) { /* menus: nothing moves */ }

  /* ------------------------------------------------------------------ */
  /* Per frame: hold pose, model placement, effects                      */
  /* ------------------------------------------------------------------ */
  var pose = { w: 0, p: V(), f: V(0, 0, -1), u: V(0, 1, 0), curl: 0.95, spread: 0, thumb: 0.8, steady: 0, left: null };
  var leftPose = { w: 0, p: V(), f: V(), u: V(), curl: 0.6, thumb: 0.5 };
  var gunPos = V(), gunQ = new T.Quaternion(), qa = new T.Quaternion(), qb = new T.Quaternion(), eu = new T.Euler(0, 0, 0, 'YXZ'), aimDir = V(), upV = V(0, 1, 0);
  var HIP = { pistol: V(0.15, -0.2, -0.43), pole: V(0.15, -0.2, -0.4) };
  var AIMP = { pistol: V(0.0, -0.098, -0.4), pole: V(0.075, -0.13, -0.37) };
  var LOW = V(0.24, -0.5, -0.22);
  // keyframes: [[t, value], ...] smoothed between
  function kf(t, keys) { if (t <= keys[0][0]) return keys[0][1]; for (var i = 0; i < keys.length - 1; i++) { var a = keys[i], b = keys[i + 1]; if (t <= b[0]) return lerp(a[1], b[1], smooth(a[0], b[0], t)); } return keys[keys.length - 1][1]; }
  function computePose(dt) {
    var id = cur(), def = DEFS[id], hold = HOLD[def.grip], m = models[id];
    var dw = S.draw;
    pose.w = smooth(0, 0.35, dw); pose.steady = S.aim;
    if (pose.w <= 0.001) { pose.left = null; return; }
    // where the weapon sits: low (being drawn) -> hip -> aimed
    gunPos.lerpVectors(HIP[def.grip], AIMP[def.grip], smooth(0, 1, S.aim));
    gunPos.lerp(LOW, 1 - smooth(0.0, 0.7, dw));
    // which way it points: at the crosshair, a few meters out (hip) or straight ahead (aimed)
    aimDir.set(-gunPos.x * (1 - S.aim) * 0.9, -gunPos.y * (1 - S.aim) * 0.9, -8).normalize();
    var sway = (0.012 + smooth(30, 100, P.panic || 0) * 0.03) * (1 - 0.75 * S.aim);
    var yaw = N.n3(S.t * 0.5, 11, 1) * sway, pitch = N.n3(S.t * 0.45, 3, 7) * sway, roll = 0;
    var dx = 0, dy = 0, dz = 0;
    // action animations
    var a = S.act;
    if (a && a.kind === 'swing') {
      var t = a.t, sd = S.swingSide;
      dx = kf(t, [[0, 0], [0.09, 0.07 * sd], [0.2, -0.1 * sd], [0.42, 0]]); dy = kf(t, [[0, 0], [0.09, 0.05], [0.2, -0.04], [0.42, 0]]); dz = kf(t, [[0, 0], [0.09, 0.06], [0.2, -0.16], [0.42, 0]]);
      yaw += kf(t, [[0, 0], [0.09, 0.7 * sd], [0.2, -0.6 * sd], [0.42, 0]]); roll += kf(t, [[0, 0], [0.09, -0.5 * sd], [0.2, 0.4 * sd], [0.42, 0]]);
    }
    if (a && a.kind === 'thrust') { var c = WC.polespear; dz = kf(a.t, [[0, 0], [c.windup, 0.05], [c.windup + c.thrust, -0.12], [c.windup + c.thrust + 0.55, 0]]); }
    if (a && a.kind === 'jab') { dz = kf(a.t, [[0, 0], [0.07, 0.04], [0.15, -0.2], [0.5, 0]]); }
    if (a && a.kind === 'zap') { dz = kf(a.t, [[0, 0], [0.08, -0.06], [0.45, 0]]); }
    if (a && a.kind === 'reload') {
      var r = a.t / a.dur, up = kf(r, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
      if (a.kindOf === 'speargun') { pitch += up * 0.95; dy += up * 0.04; dz += up * 0.1; dx -= up * 0.06; }
      else if (a.kindOf === 'bangstick') { pitch += up * 0.5; dz += up * 0.12; roll += up * 0.6; }
      else { pitch -= up * 0.35; dx -= up * 0.05; dz += up * 0.06; roll -= up * 0.3; }
    }
    // reeling: the gun jerks back with each crank
    if (S.spearOut && S.spearOut.line && id === 'speargun' && (S.autoReel || S.fireHeld)) { dz += 0.03 + Math.sin(S.t * 20) * 0.01; pitch += 0.08; }
    // recoil kick (the hand catches it with some lag, the model also kicks instantly)
    pitch += S.kick * 0.12; dz += S.kick * 0.03;
    gunPos.x += dx; gunPos.y += dy; gunPos.z += dz;
    // gun rotation in camera space
    qa.setFromUnitVectors(V(0, 0, -1), aimDir);
    eu.set(pitch, yaw, roll + (1 - S.aim) * -0.06); qb.setFromEuler(eu);
    gunQ.copy(qa).multiply(qb);
    // the hand that would hold the weapon there
    qa.copy(gunQ).multiply(hold.q);
    pose.f.set(0, 0, -1).applyQuaternion(qa); pose.u.set(0, 1, 0).applyQuaternion(qa);
    pose.p.copy(hold.grip).applyQuaternion(qa).multiplyScalar(-1).add(gunPos);
    pose.curl = hold.curl; pose.thumb = hold.thumb; pose.spread = 0;
    // the left hand helps load the speargun and the flare gun (the torch swings around while it does)
    pose.left = null;
    if (a && a.kind === 'reload' && (a.kindOf === 'speargun' || a.kindOf === 'flare') && m) {
      var rr = a.t / a.dur, lw = kf(rr, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
      var tip = a.kindOf === 'speargun' ? tv.set(0.0, 0.1, lerp(-0.85, -0.7, smooth(0.25, 0.8, rr))) : tv.set(0.0, 0.08, -0.12);
      tip.applyQuaternion(gunQ).add(gunPos);
      leftPose.w = lw; leftPose.p.copy(tip); leftPose.p.x -= 0.03;
      leftPose.f.set(0.6, -0.4, -0.6).normalize(); leftPose.u.set(-0.2, 0.3, 0.93).normalize(); leftPose.curl = 0.75; leftPose.thumb = 0.6;
      pose.left = leftPose;
    }
  }
  function placeModels(dt) {
    var id = cur(), rig = TU.player.rig, show = TU.state.current;
    var vis = (show === 'dive' || show === 'paused' || show === 'tutorial' || show === 'dead' || show === 'results') && S.draw > 0.03 && rig && rig.rHandPos;
    Object.keys(models).forEach(function (k) { models[k].root.visible = !!vis && k === id; if (k !== id) models[k].placed = false; });
    if (!vis) { if (wLight) wLight.intensity = 0; return; }
    var m = models[id], hold = HOLD[DEFS[id].grip];
    // in the fist: hand position + hand rotation x the hold offset
    m.root.quaternion.copy(rig.rHandQuat).multiply(hold.qInv);
    m.root.position.copy(hold.grip).applyQuaternion(rig.rHandQuat).add(rig.rHandPos);
    m.placed = true;
    var lamp = TU.player.lamp || {};
    if (wLight) { if (rig.lampPos) wLight.position.copy(rig.lampPos); wLight.intensity = (lamp.on || 0) * (P.headlamp ? 0.25 : 0.7) + 0.04; }
    // instant recoil on the model
    m.kick.rotation.x = S.kick * 0.22; m.kick.position.z = S.kick * 0.025;
    var a = S.act;
    // per weapon details
    if (id === 'polespear') {
      var c = WC.polespear, off = 0;
      if (a && a.kind === 'thrust') off = kf(a.t, [[0, 0], [c.windup, 0.1], [c.windup + c.thrust, -0.7], [c.windup + c.thrust + 0.15, -0.68], [c.windup + c.thrust + 0.55, 0]]);
      m.parts.shaft.position.z = off;
      // the band runs from the end cap (z = 0.28 on the shaft) forward to your hand (z = 0 in the model),
      // so it is stretched while you hold the spear and snaps short when the shaft shoots forward
      var bl = Math.max(0.02, 0.28 + off);
      m.parts.bandA.scale.z = m.parts.bandB.scale.z = bl;
    }
    if (id === 'speargun') {
      var loaded = S.gun.loaded, rl = a && a.kind === 'reload' ? a.t / a.dur : -1;
      m.parts.spear.visible = loaded || rl >= 0;
      m.parts.spear.position.z = rl >= 0 ? lerp(-1.6, -0.95, smooth(0.25, 0.85, rl)) : -0.95;
      if (S.spearOut && S.spearOut.line && (S.autoReel || S.fireHeld)) m.parts.reel.rotation.x += dt * 14;
    }
    if (id === 'flare') {
      var fr = a && a.kind === 'reload' ? a.t / a.dur : -1;
      m.parts.hinge.rotation.x = fr >= 0 ? -kf(fr, [[0, 0], [0.2, 0.75], [0.8, 0.75], [1, 0]]) : 0;
      m.parts.shell.visible = S.flare.loaded || fr >= 0;
      m.parts.shell.position.z = fr >= 0 ? lerp(0.12, 0.0, smooth(0.3, 0.7, fr)) : 0;
    }
    if (id === 'bangstick') {
      var br = a && a.kind === 'reload' ? a.t / a.dur : -1;
      m.parts.head.rotation.z = br >= 0 ? br * Math.PI * 6 : 0;
      m.parts.tag.visible = !S.bang.loaded;
      m.parts.plunger.position.z = S.bang.loaded ? -0.11 : -0.095;
    }
    if (id === 'baton') {
      var ch = S.cool > 0 ? 1 - S.cool / WC.baton.cooldown : 1;
      m.parts.ring.material.color.setRGB(0.15 + 0.35 * ch, 0.35 + 0.5 * ch, 0.5 + 0.5 * ch);
      var on = W.arcT > 0 ? W.arcT / 0.45 : 0;
      M.arcHand.opacity = on;
      m.parts.arcs.forEach(function (ln, j) {
        var p = ln.geometry.attributes.position, n = p.count;
        for (var i = 0; i < n; i++) { var u = i / (n - 1); p.setXYZ(i, lerp(-0.009, 0.009, u) * (j % 2 ? -1 : 1) + (Math.random() - 0.5) * 0.012 * Math.sin(Math.PI * u) * 2, (Math.random() - 0.5) * 0.02 * Math.sin(Math.PI * u), -0.045 - Math.random() * 0.012); }
        p.needsUpdate = true; ln.visible = on > 0.01 || (ch >= 1 && Math.random() < 0.04);
      });
      if (on <= 0.01) M.arcHand.opacity = 0.35;
    }
  }
  function effectsFrame(dt) {
    // a short flash borrows the light; otherwise it belongs to the burning flare (below)
    if (W.flashT > 0) {
      W.flash.position.copy(W.flashPos); W.flash.color.setHex(W.flashCol); W.flash.distance = 9; W.flash.decay = 2;
      W.flash.intensity = W.flashI * Math.max(0, W.flashT / (W.flashDur || 0.1));
      return effectsRest(dt);
    }
    W.flash.color.setHex(0xff3a24); W.flash.distance = 14; W.flash.decay = 1.6;
    // the flare light follows the newest burning flare
    var fl = S.flareLightOwner;
    if (fl && fl.burn > 0) {
      var fade = clamp(fl.burn / 5, 0, 1) * clamp(fl.t / 0.3, 0, 1);
      W.flareLight.position.copy(fl.pos); W.flareLight.intensity = WC.flare.light * fade * (0.85 + 0.15 * N.n3(S.t * 9, 1, 2) + 0.08 * Math.sin(S.t * 31));
    } else W.flareLight.intensity = 0;
    effectsRest(dt);
  }
  function effectsRest(dt) {
    // jet cone fade
    if (W.jetT > 0) {
      var k = Math.max(0, W.jetT / 0.4), L = (W.jetLen || 4) * (1.1 - k * 0.3);
      W.jet.scale.set(0.12 + (1 - k) * 0.7, 0.12 + (1 - k) * 0.7, L); W.jet.material.opacity = 0.22 * k; W.jet.visible = k > 0.01;
    } else W.jet.visible = false;
    W.shots.forEach(function (s) { if (s.glow) { s.glow.position.copy(s.pos); var b = s.burn > 0 ? clamp(s.burn / 5, 0, 1) : 0; s.glow.material.opacity = 0.9 * b * (0.8 + 0.2 * Math.random()); s.glow.scale.setScalar(0.5 + 0.5 * b); s.glow.visible = b > 0.01; } });
    // baton arcs to the things it hit
    if (W.arcT > 0) {
      M.arcWorld.opacity = Math.max(0, W.arcT / 0.45);
      var m = models.baton, from = V();
      if (m && m.placed) { handToWorld(from, tv.copy(m.muzzle).applyQuaternion(m.root.quaternion).add(m.root.position)); } else from.copy(TU.camera.position);
      W.arcs.forEach(function (ln, j) {
        var to = W.arcList && W.arcList[j]; if (!to) { ln.visible = false; return; }
        var p = ln.geometry.attributes.position, n = p.count, d = from.distanceTo(to);
        for (var i = 0; i < n; i++) { var u = i / (n - 1); tv.lerpVectors(from, to, u); var j2 = Math.sin(Math.PI * u) * d * 0.08; p.setXYZ(i, tv.x + (Math.random() - 0.5) * j2, tv.y + (Math.random() - 0.5) * j2, tv.z + (Math.random() - 0.5) * j2); }
        p.needsUpdate = true; ln.geometry.computeBoundingSphere(); ln.visible = true;
      });
    } else W.arcs.forEach(function (ln) { ln.visible = false; });
    // aim zoom (camera.zoom; player.js only sets the field of view)
    var cam = TU.camera, zt = TU.state.is('dive') || TU.state.is('paused') ? lerp(1, WC.aimZoom, S.aim * (DEFS[cur()].grip === 'pistol' ? 1 : 0.5)) : 1;
    if (Math.abs(cam.zoom - zt) > 0.002) { cam.zoom = zt; cam.updateProjectionMatrix(); }
  }
  function frame(dt) {
    if (!built) return;
    dt = clamp(dt || 1 / 60, 0, 0.1);
    computePose(dt);
    placeModels(dt);
    drawLine();
    sparksStep(dt);
    effectsFrame(dt);
  }

  /* ------------------------------------------------------------------ */
  /* HUD info (ui-hud.js reads this)                                     */
  /* ------------------------------------------------------------------ */
  function hudInfo() {
    var id = cur(), d = DEFS[id], a = S.act, info = { id: id, name: d.name, short: d.short, drawn: S.drawn, raised: S.draw > 0.85 && !S.busy, aim: S.aim, hit: S.hitT > 0, ammo: '', low: false, charge: null, label: '', state: 'ready' };
    if (!S.drawn) info.state = 'holstered';
    else if (S.busy) info.state = 'busy';
    if (id === 'speargun') {
      var out = S.spearOut && S.spearOut.line;
      info.ammo = (S.gun.loaded ? 'LOADED' : out ? 'ON LINE' : 'EMPTY') + ' · ' + S.gun.spare + ' SPARE';
      info.low = !S.gun.loaded && S.gun.spare === 0 && !out;
      if (out) { info.label = S.autoReel || S.fireHeld ? 'REELING' : 'LINE ' + S.spearOut.pos.distanceTo(P.pos).toFixed(1) + ' m'; info.charge = clamp(1 - S.spearOut.pos.distanceTo(P.pos) / WC.speargun.line, 0, 1); }
    } else if (id === 'bangstick') { info.ammo = (S.bang.loaded ? 'ARMED' : 'EMPTY') + ' · ' + S.bang.spare + ' SHELLS'; info.low = !S.bang.loaded; }
    else if (id === 'flare') { info.ammo = (S.flare.loaded ? 'LOADED' : 'EMPTY') + ' · ' + S.flare.spare + ' FLARES'; info.low = !S.flare.loaded && S.flare.spare === 0; }
    else if (id === 'jet') { info.ammo = WC.jet.air + ' BAR / SHOT'; info.low = (P.air || 0) < WC.jet.air + 2; }
    else if (id === 'baton') { info.ammo = WC.baton.battery + '% BATTERY / ZAP'; info.low = (P.battery || 0) < WC.baton.battery + 1; }
    else info.ammo = 'NO AMMO NEEDED';
    if (a && a.kind === 'reload') { info.state = 'reloading'; info.charge = clamp(a.t / a.dur, 0, 1); info.label = 'RELOADING'; }
    else if (S.cool > 0 && (id === 'jet' || id === 'baton' || id === 'polespear')) { var cd = id === 'jet' ? WC.jet.cooldown : id === 'baton' ? WC.baton.cooldown : WC.polespear.cooldown; info.charge = 1 - S.cool / cd; info.label = id === 'baton' ? 'CHARGING' : id === 'polespear' ? 'BAND' : 'PRESSURE'; }
    return info;
  }

  /* ------------------------------------------------------------------ */
  /* Public API and system hooks                                         */
  /* ------------------------------------------------------------------ */
  var debug = {
    // give(id): own it, stock some ammo, equip it and draw it (tests and filming)
    give: function (id, n) {
      if (!DEFS[id]) return false;
      var w = sw(); if (DEFS[id].primary) w.owned[id] = true;
      if (AMMO_OF[id]) w.ammo[AMMO_OF[id]] = Math.max(w.ammo[AMMO_OF[id]], n == null ? carryLimit(id) : n);
      if (id === 'knife') { S.active = 'knife'; } else equip(id);
      S.drawn = true; S.draw = 1; S.swapTo = null; S.busy = false; return true;
    },
    spawnTarget: spawnTarget,
    targets: function () { return W.targets.map(function (t) { return { id: t.id, hp: t.hp, maxHp: t.maxHp, dead: t.dead, stun: +t.stun.toFixed(2), hits: t.hits, pos: [t.pos.x, t.pos.y, t.pos.z], speed: +t.vel.length().toFixed(2) }; }); },
    clearTargets: clearTargets,
    shots: function () { return W.shots.map(function (s) { return { type: s.type, state: s.state, line: !!s.line, dist: +s.pos.distanceTo(P.pos).toFixed(2), burn: s.burn != null ? +s.burn.toFixed(1) : null, pos: [s.pos.x, s.pos.y, s.pos.z] }; }); },
    setAim: function (b) { S.aimHeld = !!b; },
    setFireHeld: function (b) { S.fireHeld = !!b; if (b) S.fireDownT = S.t; },
    state: function () {
      return { primary: S.primary, active: S.active, current: cur(), drawn: S.drawn, draw: +S.draw.toFixed(2), aim: +S.aim.toFixed(2), busy: S.busy, act: S.act ? S.act.kind : null, cool: +S.cool.toFixed(2),
        gun: { loaded: S.gun.loaded, spare: S.gun.spare }, bang: { loaded: S.bang.loaded, spare: S.bang.spare }, flare: { loaded: S.flare.loaded, spare: S.flare.spare },
        spearOut: S.spearOut ? S.spearOut.state : null, shots: W.shots.length, zoom: +TU.camera.zoom.toFixed(3), save: JSON.parse(JSON.stringify(sw())) };
    },
    muzzle: function () { return muzzleWorld(V()); },
    settle: settleAmmo,
    hold: HOLD, hip: HIP, aimPos: AIMP
  };
  TU.define('weapons', {
    defs: DEFS,
    primaries: PRIMARIES.slice(),
    ammoOf: function (id) { return AMMO_OF[id] || null; },
    ammoName: function (key) { return AMMO_NAME[key] || key; },
    list: function () { return ['knife'].concat(PRIMARIES).map(function (id) { var s = stats(id); s.id = id; s.name = DEFS[id].name; s.blurb = DEFS[id].blurb; s.owned = owned(id); s.primary = DEFS[id].primary; s.ammoKey = AMMO_OF[id] || null; s.pack = WC[id].pack || null; return s; }); },
    stats: stats,
    owned: owned,
    selected: function () { return sw().selected; },
    stock: function () { return JSON.parse(JSON.stringify(sw().ammo)); },
    current: cur,
    drawn: function () { return S.drawn; },
    hudInfo: hudInfo,
    pose: function () { return pose.w > 0.001 ? pose : null; },
    select: select,
    equip: equip,
    buy: buy,
    buyAmmo: buyAmmo,
    fire: fire,
    reload: reload,
    holster: function (on) { return setDrawn(on == null ? !S.drawn : !on); },
    draw: function () { return setDrawn(true); },
    swap: swap,
    debug: debug
  });
  TU.addSystem('weapons', {
    init: function () {
      handScene = TU.fx.handScene;
      if (!handScene || !TU.scene) return;
      buildMaterials();
      // your torch lights up the weapon a little (the hand scene has its own lights)
      wLight = new T.PointLight(0xfff0d8, 0, 1.3, 1.5); handScene.add(wLight);
      buildKnife(); buildPolespear(); buildSpeargun(); buildJet(); buildBangstick(); buildFlare(); buildBaton();
      buildWorld(); bindInput(); addBindings();
      built = true;
      sw();
    },
    reset: function (run) { if (built) reset(run); },
    update: function (dt) { if (built) update(dt); },
    idle: idle,
    frame: frame
  });
  TU.on('run:end', function () { settleAmmo(); });
  TU.on('state:change', function (e) { if (built && (e.to === 'title' || e.to === 'loadout')) { clearShots(); clearTargets(); S.drawn = false; S.draw = 0; } });
})();
