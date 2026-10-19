/*
 * creatures-predators.js: the six predators, their brains and everything that goes with them.
 *
 * How it works:
 *   1. The predators are added to the species list (logbook entries with a danger rating 0..5).
 *   2. At the start of a dive they are placed in their depth zones (fewer on easy, more on hard),
 *      never within 15 m of the entrance or near the diver. A small "director" tops them up later
 *      (one at a time, out of sight) so the endless deep is never empty.
 *   3. Each predator has a little state machine (patrol, notice, warn, strike, recover). EVERY strike
 *      starts with a warning you can see and hear (a "tell"): fins dropping, eyes flaring in your light,
 *      a hiss, clicks, a deep rumble. Two predators never strike within 1.2 s of each other.
 *   4. Some grab you (the eel drags you to its hole, the squid wraps your mask, the Lurker shakes you).
 *      TU.player.setHeld() does the pull and the struggle bar; break free by tapping A D A D or by hurting it.
 *      TU.creatures.grabbedBy() tells other modules.
 *   5. They smell blood (TU.player.state.bleed > 0) and hear weapons ('weapon:noise'). Prey flees from noise.
 *
 * The predators:
 *   Cenote Bull Shark (zones 0 to 1), Pale Cave Barracuda packs (1 to 2), Gulper Ambush Eel (2),
 *   Cave Lurker (2 to 3), Spider Squid packs (3), The Maw (4, rare mini boss).
 *
 * Owner: predators agent (creatures*.js). Hit points, death and the damage contract live in creatures.js.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, L = TU._cr;
  if (!L || !L.addSpecies || !L.h || !L.models || !L.models.bull_shark) return;
  var H = L.h, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var tA = new T.Vector3(), tB = new T.Vector3(), tC = new T.Vector3(), tD = new T.Vector3(), Y = new T.Vector3(0, 1, 0);

  /* ------------------------------------------------------------------ */
  /* Tunables (TODO cfg: TU.cfg.creatures.predators)                     */
  /* ------------------------------------------------------------------ */
  var PT = {
    entranceSafe: 15,       // m, no predator spawns closer than this to the cave entrance
    spawnSafe: 18,          // m, nor this close to where the dive starts
    strikeGap: 1.2,         // s, at least this long between two strikes by any predators (fair)
    diff: { easy: 0.5, standard: 1, hard: 1.5 },
    sharkDiff: { easy: 0.35, standard: 1, hard: 1.5 }, // the bull shark lives near the entrance: rarer on easy (balance pass)
    rookie: true,           // no predators in zones 0 and 1 (the shark, the barracuda) until you have finished one dive (not on hard)
    beyond: { packs: 1, lurkers: 1, gulpers: 1, maw: 0.35 }, // per Beyond zone of a new endless segment (x difficulty)
    director: { every: 12, gap: 45, near: 70, minD: 26, maxD: 48, startT: 25, // s, s, m, m, m, s
      want: { easy: [0, 0, 1, 1, 1], standard: [0, 1, 1, 1, 1], hard: [1, 1, 2, 2, 1] } }, // living predators wanted near you, by zone
    struggle: 0.08,         // grab strength removed per alternating A / D tap
    hitBreak: 0.5,          // grab strength removed per hit on the grabber
    noiseRange: 30          // m, how far a loudness 1 noise carries
  };

  /* ------------------------------------------------------------------ */
  /* Species (logbook entries)                                           */
  /* ------------------------------------------------------------------ */
  function reg(o) {
    o.predator = true; o.dangerous = true; o.behavior = 'dangerous'; o.kind = 'fauna'; o.catchable = false;
    o.glows = !!o.glows; o.brightness = o.brightness || 0; o.groups = 0;
    return L.addSpecies(o);
  }
  reg({ id: 'cenote_bull_shark', name: 'Cenote Bull Shark', type: 'Fish (shark)', zones: [0, 1], rarity: 'uncommon', sizeM: [1.8, 3.2], colors: [0x535E66, 0xEFEDE6], shape: 'bull_shark',
    danger: 4, hp: 110, blood: 'red', buoy: -0.1, move: 'shark', place: 'water', cap: 3, speed: 0.9, hit: { r: 0.13, len: 0.92 }, eyeCol: 0xB8FFA0, animK: 5.5, idleAct: 0.03, deadJaw: 0.55, show: { ext: 1.2 },
    note: 'Real bull sharks swim up rivers and into brackish caves. This one patrols the bright water near the entrance. It circles, drops its fins and arches its back, bumps you once to taste, then comes back to bite.' });
  reg({ id: 'pale_barracuda', name: 'Pale Cave Barracuda', type: 'Fish', zones: [1, 2], rarity: 'uncommon', sizeM: [0.6, 1.3], colors: [0xD0D9DC, 0x5D6A70], shape: 'pale_barracuda',
    danger: 2, hp: 20, blood: 'red', buoy: 0.04, move: 'barracuda', place: 'water', cap: 14, speed: 1.2, hit: { r: 0.07, len: 0.95 }, eyeCol: 0xE6F6FF, animK: 7, idleAct: 0.06, show: { ext: 1.15 },
    note: 'Silver pack hunters gone pale in the dark. The pack circles at the edge of your light. One goes stiff and its eyes flash, then it darts through and slashes. Hurt one and the pack scatters.' });
  reg({ id: 'gulper_eel', name: 'Gulper Ambush Eel', type: 'Fish (eel)', zones: [2], rarity: 'uncommon', sizeM: [1.4, 2.6], colors: [0x3B3A20, 0xCBC185], shape: 'gulper_eel',
    danger: 3, hp: 70, blood: 'red', buoy: -0.04, move: 'gulper', place: 'wall', cap: 6, hit: { r: 0.075, len: 0.95 }, eyeCol: 0xD8FF8A, animK: 5, idleAct: 0.15, deadJaw: 0.75, show: { ext: 1.05 },
    note: 'A moray with a gulper eel\'s mouth. It waits in a hole in the wall, breathing with its mouth open. Swim too close and it lunges, bites and drags you toward its hole. Stab it or kick free (tap A D A D).' });
  reg({ id: 'cave_lurker', name: 'Cave Lurker', type: 'Amphibian', zones: [2, 3], rarity: 'rare', sizeM: [2.4, 4.2], colors: [0xD9CDC1, 0xA65E58], shape: 'cave_lurker',
    danger: 4, hp: 140, blood: 'red', buoy: -0.15, move: 'lurker', place: 'floor', crawler: true, lift: 0.065, cap: 3, hit: { r: 0.12, len: 0.9 }, eyeCol: 0xD0FF90, animK: 3.5, idleAct: 0.05, deadJaw: 0.45, show: { ext: 1.12, floor: true, low: true },
    note: 'A huge pale salamander with a crocodile\'s head. It creeps along floors and walls while you look away and freezes when you look at it. Put your light on it and it hisses, then charges.' });
  reg({ id: 'spider_squid', name: 'Spider Squid', type: 'Cephalopod', zones: [3], rarity: 'rare', sizeM: [1.2, 2.4], colors: [0x5E1E2E, 0x4FD8FF], glow: 0x4FD8FF, glows: true, shape: 'spider_squid',
    danger: 3, hp: 44, blood: 'blue', buoy: -0.03, move: 'squid', place: 'water', cap: 8, hit: { r: 0.09, len: 0.75, off: -0.08 }, eyeCol: 0x7FE8FF, animK: 4, idleAct: 0.12, deadJaw: 0.0, show: { ext: 1.3 }, goreK: 0.7,
    note: 'Hunts in threes. They circle you with their arms toward you, flashing. When the flashing speeds up and the arms open, one darts in to wrap your mask. They ink when hurt. Their blood is blue.' });
  reg({ id: 'the_maw', name: 'The Maw', type: 'Fish (unknown)', zones: [4], rarity: 'legendary', sizeM: [9, 14], colors: [0x1E252A, 0x58B8FF], glow: 0x58B8FF, glows: true, brightness: 4, shape: 'the_maw',
    danger: 5, hp: 520, blood: 'red', buoy: -0.06, move: 'maw', place: 'water', cap: 1, hit: { r: 0.085, len: 0.92 }, eyeCol: 0x9FE0FF, animK: 2.6, idleAct: 0.14, deadJaw: 0.6, stunK: 0.3,
    armor: { blunt: 0.4, pierce: 0.85, cut: 0.7 }, despawn: 600, show: { ext: 1.08 },
    note: 'Something armored and enormous lives in the Old Water. You see its lure lines in the dark long before you see it. When the lights go out and the water rumbles, it is coming straight at you. Swim sideways.' });
  var PRED_IDS = ['cenote_bull_shark', 'pale_barracuda', 'gulper_eel', 'cave_lurker', 'spider_squid', 'the_maw'];

  /* ------------------------------------------------------------------ */
  /* Shared helpers                                                      */
  /* ------------------------------------------------------------------ */
  var packs = [], strikeT = -99, told = {}, lastSpawnT = -99, directorT = 0;
  function now() { return H.time(); }
  function simulating() { return TU.state && TU.state.simulating ? TU.state.simulating() : true; }
  // Is the diver fair game right now? (not in the tutorial, not standing in a dry chamber or at the surface)
  function preyOK(P) { return simulating() && !(TU.run && TU.run.tutorial) && P.inWater !== false && !P.dry && !P.surfaced; }
  function canStrike() { return now() - strikeT > PT.strikeGap && !grab.c; }
  function struck() { strikeT = now(); }
  function setSt(c, st) { c.st = st; c.stT = 0; }
  function camFwd(out) { return out.set(0, 0, -1).applyQuaternion(TU.camera.quaternion); }
  // Line of sight to the diver (cached, refreshed every 12 steps).
  function canSee(c, P, range) {
    if (c.dist > range) return false;
    if ((H.stepNo() + c.id) % 12 === 0 || c.los == null) { tA.subVectors(P.pos, c.pos); var d = tA.length(); c.los = TU.cave.raycast(c.pos, tA.divideScalar(d || 1), d) >= d - 0.5; }
    return !!c.los;
  }
  // How much the flashlight hits it (0..1).
  function lampHits(c, range, cosK) {
    var lamp = TU.player.lamp; if (!lamp || !lamp.pos || !(lamp.on > 0.3)) return 0;
    tA.subVectors(c.pos, lamp.pos); var dl = tA.length(); if (dl > range) return 0;
    var dot = tA.divideScalar(dl || 1).dot(lamp.dir); return dot > cosK ? (dot - cosK) / (1 - cosK) * clamp(1.4 - dl / range, 0, 1) : 0;
  }
  // Eyes reflect your light like a cat's: the first hint that something is there.
  function eyeShine(c) { return lampHits(c, 20, 0.88) * 1.2; }
  function smells(c, P, range) { return P.bleed > 0 && c.dist < range; }
  function face(c, v, rate, dt) { if (v.lengthSq() < 1e-6) return; c.dir.lerp(v, 1 - Math.exp(-dt * rate)).normalize(); }
  function headingFromVel(c, dt, rate) { var vl = c.vel.length(); if (vl > 0.05) { tD.copy(c.vel).divideScalar(vl); face(c, tD, rate * Math.min(1, vl), dt); } }
  // Keep a big swimmer out of the rock (every other step) and under the water surface.
  function keepOut(c, rad, i) {
    if ((i + H.stepNo()) % 2) return;
    var hit = TU.cave.collide(c.pos, rad, { vel: c.vel, hint: c.hint });
    if (hit.hit) { c.pos.copy(hit.pos); if (hit.vel) c.vel.copy(hit.vel).multiplyScalar(0.7); c.wtT = 0; }
    var sy = TU.cave.waterSurfaceY(c.pos); if (sy != null && c.pos.y > sy - rad - 0.15) { c.pos.y = sy - rad - 0.15; if (c.vel.y > 0) c.vel.y = 0; }
  }
  // Animation: body wave amplitude and speed, jaw or arms (act), warning glow (tell), base glow.
  function finish(c, dt, amp, rate, act, tell, glowBase) {
    c.amp = lerp(c.amp, amp, 1 - Math.exp(-dt * 3)); if (c.hurtT > 0) c.amp = Math.max(c.amp, 1.8);
    c.ph += dt * rate * c.sp.animK * (0.7 + 0.3 * c.amp);
    c.act = lerp(c.act, act, 1 - Math.exp(-dt * 9));
    c.tell = lerp(c.tell, tell, 1 - Math.exp(-dt * 7));
    c.glow = (glowBase || 0) + eyeShine(c) + (c.sp.move === 'maw' ? 0 : c.tell * 2.4); // The Maw's eyes flare through tellHalos while its lure lines stay dark
  }
  function tellEvent(c, kind) {
    TU.emit('creature:tell', { id: c.id, species: c.speciesId, speciesId: c.speciesId, kind: kind, pos: c.pos.clone() });
    var MSG = { cenote_bull_shark: 'A shark. When it drops its fins it is about to strike. Dodge sideways.', pale_barracuda: 'Barracuda pack. Watch for the one that goes still.',
      gulper_eel: 'Something in the wall just opened its mouth.', cave_lurker: 'It hissed at your light.', spider_squid: 'The flashing is speeding up...', the_maw: 'The lights went out. Something huge is coming. Swim sideways!' };
    // ui.js shows these itself on creature:tell (and a short cue later); this is only the fallback without the UI.
    if (!(TU.ui && TU.ui.__defined) && !told[c.speciesId] && MSG[c.speciesId] && simulating() && kind !== 'circle') { told[c.speciesId] = true; TU.emit('ui:msg', { text: MSG[c.speciesId], dur: 3.5 }); }
  }
  function entrancePos() { var F = TU.cave.features || {}; return F.entrance && F.entrance.pos ? F.entrance.pos : null; }
  function aliveCount(sid) { var n = 0; H.recs.forEach(function (c) { if (c.speciesId === sid && !c.dead && !c.gone) n++; }); return n; }

  /* ------------------------------------------------------------------ */
  /* Grabs: being held by a predator                                     */
  /* ------------------------------------------------------------------ */
  var grab = { c: null, kind: null, strength: 0, t: 0, max: 0, gnawT: 0, lastKey: null, anchor: new T.Vector3(), viaPlayer: false };
  // player.js has the being-held API (TU.player.setHeld): it slows your kicks, runs the A / D struggle and draws
  // the ONE struggle bar (#pl-tug). Without it (player missing) this file falls back to its own keys, pull and #cr-grab bar.
  function playerHolds() { return !!(TU.player && TU.player.__defined && typeof TU.player.setHeld === 'function'); }
  var GRAB_TXT = { gulper_eel: 'THE EEL HAS YOU', spider_squid: 'IT IS ON YOUR MASK', cave_lurker: 'DEATH ROLL' };
  function shove(vec) { if (TU.player && typeof TU.player.applyRecoil === 'function') TU.player.applyRecoil(vec); }
  function startGrab(c, kind, strength, maxT) {
    var P = TU.player.state;
    if (grab.c || !preyOK(P)) return false;
    grab.c = c; grab.kind = kind; grab.strength = strength; grab.t = 0; grab.max = maxT; grab.gnawT = 1.6; grab.lastKey = null;
    grab.viaPlayer = playerHolds();
    TU.emit('creature:grab', { id: c.id, species: c.speciesId, speciesId: c.speciesId, strength: strength, kind: kind });
    if (grab.viaPlayer) holdPlayer(c, new T.Vector3());
    else showGrab(true);
    return true;
  }
  function release(reason) {
    var c = grab.c; if (!c) return;
    grab.c = null; showGrab(false);
    if (TU.player && typeof TU.player.release === 'function') TU.player.release(c.id);
    TU.emit('creature:release', { id: c.id, species: c.speciesId, speciesId: c.speciesId, reason: reason || 'free' });
    if (c.dead || c.gone) return;
    var mv = c.sp.move;
    if (mv === 'gulper') { if (reason === 'timeout') H.attack(c, 'bite', { severity: 0.25, injury: 'bite', panic: 15, gore: true }); setSt(c, 'retract'); c.cool = 6; }
    else if (mv === 'squid') { squidInk(c); setSt(c, 'retreat'); c.cool = 4; }
    else if (mv === 'lurker') { c.surfaceUp = false; c.roll = 0; setSt(c, 'fall'); c.cool = 7; }
  }
  // Contract helper: one alternating tap of the struggle mini game (player.js or ui may call this).
  function struggle(amount) {
    if (!grab.c) return false;
    grab.strength = Math.max(0, grab.strength - (amount == null ? PT.struggle : amount));
    grab.c.hurtT = Math.max(grab.c.hurtT, 0.15);
    return true;
  }
  function anchorOf(c, out) {
    if (c.sp.move === 'gulper') return out.copy(c.home).addScaledVector(c.aim, c.ext);
    if (c.sp.move === 'lurker') return out.copy(c.pos).addScaledVector(c.dir, c.scale * 0.42);
    return out.copy(c.pos);
  }
  function grabStep(dt) {
    var c = grab.c; if (!c) return;
    var P = TU.player.state;
    if (c.dead || c.gone || c.stun > 0 || !preyOK(P)) { release(c.dead ? 'killed' : c.stun > 0 ? 'stunned' : 'lost'); return; }
    grab.t += dt;
    // fallback struggle (no player API): alternating A / D taps, read only from the player's input.
    // With the API, player.js calls struggle() on each tap itself.
    if (!grab.viaPlayer) {
      var keys = (TU.player.input && TU.player.input.keys) || {};
      var k = keys.KeyA && !keys.KeyD ? 'A' : keys.KeyD && !keys.KeyA ? 'D' : null;
      if (k && k !== grab.lastKey) { struggle(PT.struggle); grab.lastKey = k; }
    }
    if (grab.strength <= 0) { release('struggle'); return; }
    if (grab.t > grab.max) { release('timeout'); return; }
    // the pull: the velocity that drags the diver toward the jaws (handed to TU.player.setHeld)
    anchorOf(c, grab.anchor);
    tA.subVectors(grab.anchor, P.pos); var dl = tA.length();
    var hold = grab.kind === 'hold' ? 0.35 : grab.kind === 'drag' ? 0.3 + c.scale * 0.12 : 0.0;   // keep the diver just in front of the jaws (not inside the head)
    var want = Math.min(grab.kind === 'drag' ? 2.6 : 2.0, Math.max(0, dl - hold) * 4);
    if (dl > 1e-3) tA.multiplyScalar(want / dl); else tA.set(0, 0, 0);
    if (grab.viaPlayer) {
      // the player API applies the pull, the death roll shake, the weak kicks and the struggle bar
      if (!holdPlayer(c, tA)) { release('lost'); return; }
      if (grab.kind === 'shake' && TU.fx && TU.fx.shake) TU.fx.shake(0.25);
    } else {
      // fallback without player.js's API: the documented old exception, we steer the diver's velocity directly
      P.vel.lerp(tA, 1 - Math.exp(-dt * 7));
      if (grab.kind === 'shake') { P.vel.x += (Math.random() - 0.5) * 6 * dt * 10; P.vel.y += (Math.random() - 0.5) * 4 * dt * 10; if (TU.fx && TU.fx.shake) TU.fx.shake(0.25); }
    }
    grab.gnawT -= dt;
    if (grab.gnawT <= 0) { H.attack(c, 'grab', { severity: 0.06, panic: 7 }); grab.gnawT = 1.6; }
    if (!grab.viaPlayer) updateGrabBar();
  }
  function holdPlayer(c, pull) {
    return TU.player.setHeld(c.id, pull, { kind: grab.kind, strength: grab.strength, label: GRAB_TXT[c.speciesId] || 'GRABBED', shake: grab.kind === 'shake' ? 1 : 0 });
  }
  function grabbedBy() {
    var c = grab.c; if (!c) return null;
    return { id: c.id, species: c.speciesId, speciesId: c.speciesId, strength: +grab.strength.toFixed(2), kind: grab.kind, anchor: anchorOf(c, new T.Vector3()), t: +grab.t.toFixed(2) };
  }

  /* ------------------------------------------------------------------ */
  /* 1. Cenote Bull Shark: patrol, circle, hunch (tell), bump, then bite */
  /* ------------------------------------------------------------------ */
  L.movers.shark = function (c, i, dt, P, d) {
    var sc = c.scale, prey = preyOK(P);
    if (!c.st || c.st === 'idle') setSt(c, 'patrol');
    if (c.noiseT > 0) c.noiseT -= dt;
    var sense = prey && (canSee(c, P, 16 + (c.enrage > 0 ? 12 : 0)) || smells(c, P, 45) || (c.noiseT > 0 && c.noiseAt && c.noiseAt.distanceTo(c.pos) < 8 && canSee(c, P, 26)));
    var amp = 1, rate = 1, act = c.sp.idleAct, tell = 0;
    switch (c.st) {
      case 'patrol':
        if (c.wtT <= 0 || c.pos.distanceTo(c.wt) < 1.5) H.newWander(c, 9, 0.25);
        c.wtT -= dt;
        if (c.noiseT > 0 && c.noiseAt) c.wt.copy(c.noiseAt);
        H.seek(c, c.wt, c.noiseT > 0 ? 1.6 : 0.9, 0.6, dt, 2);
        if (sense && c.cool <= 0) { setSt(c, 'circle'); c.circR = 8; c.orbA = Math.atan2(c.pos.z - P.pos.z, c.pos.x - P.pos.x); c.orbDir = c.rnd > 0.5 ? 1 : -1; tellEvent(c, 'circle'); }
        break;
      case 'circle':
        if (!prey || d > (smells(c, P, 50) ? 50 : 34)) { setSt(c, 'patrol'); break; } // blood keeps it coming from farther
        c.circR = Math.max(c.enrage > 0 ? 3.6 : 4.6, c.circR - dt * 0.45);
        c.orbA += c.orbDir * 1.8 / c.circR * dt;
        tA.set(P.pos.x + Math.cos(c.orbA) * c.circR, P.pos.y + Math.sin(c.orbA * 0.7) * 0.5 - 0.3, P.pos.z + Math.sin(c.orbA) * c.circR);
        H.seek(c, tA, c.enrage > 0 ? 2.4 : 1.8, 1.5, dt);
        if (c.stT > (c.enrage > 0 ? 2.5 : 5.5) && c.cool <= 0 && canStrike() && d < c.circR + 2) { setSt(c, 'tell'); c.bite = !!c.bumped || c.enrage > 0; tellEvent(c, 'hunch'); snd('thrum', c); }
        break;
      case 'tell':
        // the hunch: pectorals drop, back arches, stiff exaggerated swimming, eyes catch your light
        tA.subVectors(P.pos, c.pos).normalize(); face(c, tA, 3, dt);
        c.vel.multiplyScalar(Math.exp(-dt * 1.5)); H.steer(c, tA.x * 0.7, tA.y * 0.7, tA.z * 0.7, 1, dt);
        act = 0.55; tell = smooth(0, 0.35, c.stT); amp = 2.0; rate = 1.7;
        if (c.stT > (c.bite ? (c.enrage > 0 ? 0.65 : 1.0) : 0.9)) { setSt(c, 'run'); c.runDir = (c.runDir || new T.Vector3()).copy(tA); c.hitDone = false; struck(); }
        break;
      case 'run':
        // the charge homes in only a little: a sideways kick dodges it
        tA.subVectors(P.pos, c.pos); var dl = tA.length(); tA.divideScalar(dl || 1);
        if (c.runDir.dot(tA) > 0.2) c.runDir.lerp(tA, 1 - Math.exp(-dt * 1.4)).normalize();
        H.steer(c, c.runDir.x * 5.4, c.runDir.y * 5.4, c.runDir.z * 5.4, 14, dt);
        act = c.bite ? smooth(3.5, 1.0, dl) * 1.0 + 0.15 : 0.2; tell = 1; amp = 1.5; rate = 2.2;
        tB.copy(c.pos).addScaledVector(c.dir, sc * 0.44);
        if (!c.hitDone && prey && tB.distanceTo(P.pos) < (c.bite ? 0.6 : 0.9) + sc * 0.1) {
          c.hitDone = true;
          if (c.bite) { H.attack(c, 'bite', { severity: 0.55, injury: 'bite', panic: 40, gore: true }); snd('chomp', c); c.act = 0.2; }
          else { H.attack(c, 'bump', { severity: 0.06, panic: 18 }); shove(tC.copy(c.runDir).multiplyScalar(1.6)); snd('thump', c); }
          c.bumped = true; c.cool = c.bite ? 7 : 4;
        }
        if (c.stT > 1.8 || (c.hitDone && c.stT > 0.4) || (c.stT > 0.6 && c.runDir.dot(tA) < -0.2)) setSt(c, 'pass');
        break;
      case 'pass':
        // peel away: carry on forward and turn away from the diver
        tA.subVectors(c.pos, P.pos); tA.y *= 0.3; tA.normalize().add(tB.copy(c.dir).multiplyScalar(0.8)).normalize();
        H.steer(c, tA.x * 3.4, tA.y * 3.4, tA.z * 3.4, 5, dt); amp = 1.3;
        if (c.stT > 1.6) { setSt(c, prey && d < 30 ? 'circle' : 'patrol'); c.circR = 9; c.orbA = Math.atan2(c.pos.z - P.pos.z, c.pos.x - P.pos.x); }
        break;
      case 'flee':
        tA.subVectors(c.pos, P.pos); tA.y *= 0.3; tA.normalize(); H.steer(c, tA.x * 3.3, tA.y * 3.3, tA.z * 3.3, 3, dt); amp = 1.6; rate = 1.4;
        if (c.stT > (c.fleeLong ? 30 : 8)) { setSt(c, 'patrol'); c.cool = 8; }
        break;
    }
    c.vel.multiplyScalar(Math.exp(-dt * 0.35));
    c.pos.addScaledVector(c.vel, dt);
    if (c.st !== 'tell') headingFromVel(c, dt, 2.6);
    keepOut(c, clamp(sc * 0.13, 0.15, 0.6), i);
    finish(c, dt, amp, rate, act, tell, 0);
  };

  /* ------------------------------------------------------------------ */
  /* 2. Pale Cave Barracuda packs: circle, one goes stiff, dart, slash   */
  /* ------------------------------------------------------------------ */
  function makePack(kind, home) {
    var pk = { kind: kind, members: [], center: home.clone(), home: home.clone(), target: home.clone(), vel: new T.Vector3(), st: 'roam', stT: 0, cool: 2, flee: 0, tT: 0, orbA: Math.random() * 6, hint: {}, n0: 0, broken: false, stepNo: -1 };
    packs.push(pk); return pk;
  }
  function packAlive(pk) { var a = []; for (var k = 0; k < pk.members.length; k++) { var m = pk.members[k]; if (!m.dead && !m.gone) a.push(m); } return a; }
  function stepPack(pk, dt, P) {
    var alive = packAlive(pk); if (!alive.length) return alive;
    alive.forEach(function (m) { if (m.noiseT > 0) m.noiseT -= dt; });
    pk.stT += dt; pk.cool -= dt; pk.flee -= dt; pk.tT -= dt;
    var d = pk.center.distanceTo(P.pos), prey = preyOK(P), lead = alive[0];
    if (!pk.broken && alive.length < pk.n0 * 0.5) { pk.broken = true; pk.flee = 25; } // lost half the pack: they give up
    var sense = prey && ((d < 15 && canSee(lead, P, 18)) || smells(lead, P, pk.kind === 'squid' ? 25 : 32) || (lead.noiseT > 0));
    var spd = pk.kind === 'squid' ? 0.4 : 1.2;
    if (pk.flee > 0) { tA.subVectors(pk.center, P.pos).normalize(); pk.target.copy(pk.center).addScaledVector(tA, 6); spd = 3.5; pk.st = 'roam'; }
    else if (pk.st === 'roam') {
      if (pk.tT <= 0 || pk.center.distanceTo(pk.target) < 0.8) { pk.target.set(pk.home.x + (Math.random() - 0.5) * 12, pk.home.y + (Math.random() - 0.5) * 3, pk.home.z + (Math.random() - 0.5) * 12); pk.tT = 6 + Math.random() * 5; }
      if (sense) { pk.st = 'hunt'; pk.stT = 0; pk.cool = 2.5; }
    } else {
      if (!prey || d > (P.bleed > 0 ? 36 : 28)) { pk.st = 'roam'; pk.home.copy(pk.center); }
      pk.orbA += dt * (pk.kind === 'squid' ? 0.3 : 0.45);
      var R = pk.kind === 'squid' ? 0 : 6.5;
      pk.target.set(P.pos.x + Math.cos(pk.orbA) * R, P.pos.y + 0.4, P.pos.z + Math.sin(pk.orbA) * R);
      spd = pk.kind === 'squid' ? 1.6 : 2.6;
      if (pk.cool <= 0 && canStrike() && pk.stT > 2.5) {
        // pick the hunter: the closest member that is free
        var best = null, bd = 1e9;
        alive.forEach(function (m) { if ((m.st === 'school' || m.st === 'circle') && m.stun <= 0 && m.dist < bd) { bd = m.dist; best = m; } });
        if (best && bd < (pk.kind === 'squid' ? 9 : 12)) { setSt(best, 'tell'); tellEvent(best, pk.kind === 'squid' ? 'flash' : 'chatter'); snd(pk.kind === 'squid' ? 'clicks' : 'chatter', best); pk.cool = pk.kind === 'squid' ? 4 + Math.random() * 2 : 2.4 + Math.random() * 1.6; }
      }
    }
    tA.subVectors(pk.target, pk.center); var l = tA.length();
    if (l > 0.01) pk.vel.lerp(tA.multiplyScalar(Math.min(spd, l * 1.5) / l), 1 - Math.exp(-dt * 1.5)); else pk.vel.multiplyScalar(0.9);
    pk.center.addScaledVector(pk.vel, dt);
    if ((H.stepNo() & 3) === 0) { var hit = TU.cave.collide(pk.center, 1.0, { hint: pk.hint }); if (hit.hit) { pk.center.copy(hit.pos); pk.tT = 0; } var sy = TU.cave.waterSurfaceY(pk.center); if (sy != null && pk.center.y > sy - 1) pk.center.y = sy - 1; }
    return alive;
  }
  function packTick(c, dt, P) { var pk = c.pack; if (!pk) return null; if (pk.stepNo !== H.stepNo()) { pk.stepNo = H.stepNo(); stepPack(pk, dt, P); } return pk; }

  L.movers.barracuda = function (c, i, dt, P, d) {
    var sc = c.scale, pk = packTick(c, dt, P), prey = preyOK(P);
    if (!c.st || c.st === 'idle') setSt(c, 'school');
    var amp = 1, rate = 1, act = c.sp.idleAct, tell = 0;
    if (pk && pk.flee > 0 && c.st !== 'dart') c.st = 'school';
    switch (c.st) {
      case 'school':
        tA.copy(pk ? pk.center : c.home).add(c.off || Y);
        tA.x += Math.sin(now() * 0.7 + c.rnd * 9) * 0.4; tA.y += Math.sin(now() * 0.5 + c.rnd * 5) * 0.2; tA.z += Math.cos(now() * 0.6 + c.rnd * 7) * 0.4;
        H.seek(c, tA, pk && pk.flee > 0 ? 4.2 : 2.8, 3, dt, 1.2);
        amp = 0.6 + Math.min(1.4, c.vel.length() / 1.5); rate = 0.8 + c.vel.length() * 0.4;
        break;
      case 'tell':
        // stiff, nose on you, eyes flashing silver, teeth chattering
        c.vel.multiplyScalar(Math.exp(-dt * 4));
        tA.subVectors(P.pos, c.pos).normalize(); face(c, tA, 7, dt);
        amp = 0.15; rate = 0.4; act = 0.4; tell = 1;
        if (c.stT > 0.6) { setSt(c, 'dart'); c.runDir = (c.runDir || new T.Vector3()).subVectors(tB.copy(P.pos).addScaledVector(P.vel, 0.25), c.pos).normalize(); c.hitDone = false; struck(); }
        break;
      case 'dart':
        H.steer(c, c.runDir.x * 8.5, c.runDir.y * 8.5, c.runDir.z * 8.5, 45, dt);
        act = 0.7; tell = 1; amp = 1.4; rate = 3;
        tB.copy(c.pos).addScaledVector(c.dir, sc * 0.3);
        if (!c.hitDone && prey && tB.distanceTo(P.pos) < 0.7 + sc * 0.2) { c.hitDone = true; H.attack(c, 'slash', { severity: 0.22, injury: 'cut', panic: 14, gore: true }); snd('slash', c); }
        tA.subVectors(P.pos, c.pos);
        if (c.stT > 0.9 || tA.dot(c.runDir) < -2.2) setSt(c, 'retreat');
        break;
      case 'retreat':
        H.seek(c, pk ? pk.center : c.home, 3.6, 4, dt, 1); amp = 1.2; rate = 1.6;
        if (c.stT > 1.6) setSt(c, 'school');
        break;
    }
    c.vel.multiplyScalar(Math.exp(-dt * 0.6));
    c.pos.addScaledVector(c.vel, dt);
    if (c.st !== 'tell') headingFromVel(c, dt, c.st === 'dart' ? 10 : 4);
    keepOut(c, clamp(sc * 0.08, 0.06, 0.2), i);
    finish(c, dt, amp, rate, act, tell, 0);
  };

  /* ------------------------------------------------------------------ */
  /* 3. Gulper Ambush Eel: hides in a wall hole, lunges, drags you in    */
  /* ------------------------------------------------------------------ */
  // c.home = the hole mouth on the rock, c.normal = out of the rock, c.aim = where the head points, c.ext = how far the head is out (m)
  L.movers.gulper = function (c, i, dt, P, d) {
    var sc = c.scale, n = c.normal, prey = preyOK(P);
    if (!c.aim) c.aim = n.clone();
    if (c.ext == null) c.ext = sc * 0.3;
    if (!c.st || c.st === 'idle') setSt(c, 'hide');
    var head = tB.copy(c.home).addScaledVector(c.aim, c.ext), hd = head.distanceTo(P.pos);
    var extT = sc * 0.3, extV = 1.2, amp = 0.25, rate = 0.6, act = 0.1 + 0.12 * Math.max(0, Math.sin(now() * 1.3 + c.ph * 0.1)), tell = 0, aimCone = 0.6;
    var toP = tA.subVectors(P.pos, head).normalize();
    switch (c.st) {
      case 'hide':
        tC.copy(n); tC.x += Math.sin(now() * 0.4 + c.rnd * 6) * 0.15; tC.y += Math.sin(now() * 0.3 + c.rnd * 3) * 0.1; aimAt(c, tC.normalize(), 0.8, dt, 1.0);
        if (prey && hd < 5.5 && c.cool <= 0) setSt(c, 'watch');
        break;
      case 'watch':
        extT = sc * 0.38; aimAt(c, toP, 3, dt, aimCone); act = 0.15 + 0.2 * Math.max(0, Math.sin(now() * 2.2)); amp = 0.4;
        if (!prey || hd > 7) setSt(c, 'hide');
        else if (hd < sc * 0.62 + 0.7 && c.cool <= 0 && canStrike()) { setSt(c, 'tell'); tellEvent(c, 'hiss'); snd('glorp', c); }
        break;
      case 'tell':
        // it pulls back into the hole and opens the huge mouth: you have about 0.75 s
        extT = sc * 0.16; extV = 2; aimAt(c, toP, 5, dt, aimCone); act = 1; tell = 1; amp = 0.5; rate = 1.5;
        if (c.stT > 0.75) { setSt(c, 'lunge'); c.hitDone = false; struck(); }
        break;
      case 'lunge':
        extT = sc * 0.92; extV = 7.5; aimAt(c, toP, 6, dt, 1.0); act = c.stT < 0.14 ? 1 : 0.15; tell = 1; amp = 1.3; rate = 2.5;
        if (!c.hitDone && prey && hd < 0.5 + sc * 0.12) {
          c.hitDone = true;
          H.attack(c, 'bite', { severity: 0.35, injury: 'bite', panic: 35, gore: true }); snd('chomp', c);
          if (startGrab(c, 'drag', 1.0, 6.5)) { setSt(c, 'grab'); break; }
        }
        if (c.stT > 0.38) { setSt(c, 'retract'); c.cool = 3; }
        break;
      case 'grab':
        // mouth clamped on, thrashing, slowly backing into the hole and pulling you with it
        if (grab.c !== c) { setSt(c, 'retract'); break; }
        extT = sc * 0.3; extV = 0.32; aimAt(c, toP, 2, dt, 1.0); act = 0.22; tell = 0.6; amp = 1.6; rate = 2.6;
        break;
      case 'retract':
        extT = sc * 0.2; extV = 1.6; act = 0.1; aimAt(c, n, 1.5, dt, 1.0);
        if (c.stT > 1.4) setSt(c, 'hide');
        break;
    }
    c.ext += clamp(extT - c.ext, -extV * dt, extV * dt);
    c.dir.copy(c.aim);
    c.pos.copy(c.home).addScaledVector(c.aim, c.ext - sc * 0.5);
    c.vel.set(0, 0, 0);
    finish(c, dt, amp, rate, act, tell, 0);
  };
  // Turn the head toward v, but never more than `cone` radians away from straight out of the hole.
  function aimAt(c, v, rate, dt, cone) {
    tC.copy(v); var dot = tC.dot(c.normal), cc = Math.cos(cone);
    if (dot < cc) { tD.copy(tC).addScaledVector(c.normal, -dot); if (tD.lengthSq() < 1e-6) tD.set(1, 0, 0).addScaledVector(c.normal, -c.normal.x); tD.normalize(); tC.copy(c.normal).multiplyScalar(cc).addScaledVector(tD, Math.sin(cone)); }
    c.aim.lerp(tC, 1 - Math.exp(-dt * rate)).normalize();
  }
  // Dead eels slump half out of their hole.
  L.deadMovers.gulper = function (c, i, dt) {
    if (!c.aim) return;
    c.ext = lerp(c.ext, c.scale * 0.55, 1 - Math.exp(-dt * 0.5));
    tC.copy(c.normal).add(tD.set(0, -0.9, 0)).normalize(); c.aim.lerp(tC, 1 - Math.exp(-dt * 0.4)).normalize();
    c.dir.copy(c.aim); c.pos.copy(c.home).addScaledVector(c.aim, c.ext - c.scale * 0.5);
    c.roll = lerp(c.roll, 1.4, 1 - Math.exp(-dt * 0.6));
  };

  /* ------------------------------------------------------------------ */
  /* 4. Cave Lurker: creeps when you look away, charges your light       */
  /* ------------------------------------------------------------------ */
  // Crawl along the rock toward target at speed (m/s). The body stays on the rock: c.up is the rock normal.
  function crawlMove(c, target, speed, dt, i) {
    tA.subVectors(target, c.pos); tA.addScaledVector(c.up, -tA.dot(c.up)); var l = tA.length();
    if (l > 0.05 && speed > 0) { tA.divideScalar(l); c.dir.lerp(tA, 1 - Math.exp(-dt * 3.5)).normalize(); c.pos.addScaledVector(c.dir, speed * dt); }
    rockHug(c, i);
  }
  function rockHug(c, i) {
    var sc = c.scale, lift = sc * (c.sp.lift || 0.08), sn = H.stepNo() + i;
    if (sn % 3 === 0) {
      tC.copy(c.pos).addScaledVector(c.up, 0.5);
      var L2 = 0.5 + lift + 1.2, dd = TU.cave.raycast(tC, tD.copy(c.up).negate(), L2);
      if (dd < L2) c.pos.copy(tC).addScaledVector(c.up, -dd + lift);
      var hit = TU.cave.collide(c.pos, Math.max(0.1, lift * 0.8), { hint: c.hint });
      if (hit.hit) { c.pos.copy(hit.pos); c.up.lerp(hit.normal, 0.25).normalize(); }
    }
    if (sn % 10 === 0) { var np = TU.cave.nearestPoint(c.pos, c.hint2 || (c.hint2 = {})); if (np && np.normal) { tC.copy(np.normal).negate(); if (tC.dot(c.up) > -0.2) c.up.lerp(tC, 0.2).normalize(); } }
  }
  L.movers.lurker = function (c, i, dt, P, d) {
    var sc = c.scale, prey = preyOK(P);
    if (!c.st || c.st === 'idle') { setSt(c, 'lurk'); c.surfaceUp = true; }
    if (c.noiseT > 0) c.noiseT -= dt;
    var amp = 0.3, rate = 0.3, act = c.sp.idleAct, tell = 0;
    var see = prey && canSee(c, P, 26), lit = see && lampHits(c, 14, 0.9) > 0;
    tA.subVectors(c.pos, TU.camera.position); var dc = tA.length(), looked = see && tA.dot(camFwd(tB)) / (dc || 1) > 0.62;
    switch (c.st) {
      case 'lurk':
        rockHug(c, i);
        if (prey && (see && d < 24 || smells(c, P, 30) || c.noiseT > 0)) setSt(c, 'stalk');
        break;
      case 'stalk':
        if (!prey || d > (smells(c, P, 34) ? 40 : 34)) { setSt(c, 'lurk'); break; }
        if ((lit || d < 3.2) && c.cool <= 0 && canStrike()) { setSt(c, 'tell'); tellEvent(c, 'hiss'); snd('hiss', c); break; }
        if (looked && d < 22) { rockHug(c, i); amp = 0.02; rate = 0; c.frozen = true; } // it freezes while you look at it
        else { c.frozen = false; crawlMove(c, P.pos, d > 4 ? 0.8 : 0, dt, i); amp = 1; rate = 1; }
        break;
      case 'tell':
        // head up, jaws open, a long hiss, eyes flaring in your light
        tB.subVectors(P.pos, c.pos); tB.addScaledVector(c.up, -tB.dot(c.up)); if (tB.lengthSq() > 1e-4) face(c, tB.normalize(), 6, dt);
        rockHug(c, i); act = 0.8; tell = 1; amp = 0.6; rate = 3;
        if (c.stT > (c.enrage > 0 ? 0.45 : 0.85)) setSt(c, 'charge');
        break;
      case 'charge':
        crawlMove(c, P.pos, 4.4, dt, i); act = 0.5; tell = 1; amp = 1.7; rate = 3.2;
        if (prey && d < 3.0 && see) { setSt(c, 'pounce'); c.surfaceUp = false; c.vel.subVectors(P.pos, c.pos).normalize().multiplyScalar(6.5); c.hitDone = false; struck(); }
        else if (c.stT > 4 || !prey) { setSt(c, 'retreat'); c.cool = 5; }
        break;
      case 'pounce':
        tA.subVectors(P.pos, c.pos).normalize(); H.steer(c, tA.x * 6.5, tA.y * 6.5, tA.z * 6.5, 6, dt);
        c.pos.addScaledVector(c.vel, dt); face(c, tA, 8, dt);
        act = c.stT < 0.25 ? 1 : 0.2; tell = 1; amp = 1.4; rate = 2.5;
        tB.copy(c.pos).addScaledVector(c.dir, sc * 0.42);
        if (!c.hitDone && prey && tB.distanceTo(P.pos) < 0.55 + sc * 0.1) {
          c.hitDone = true; H.attack(c, 'bite', { severity: 0.6, injury: 'bite', panic: 45, gore: true }); snd('chomp', c);
          if (startGrab(c, 'shake', 0.7, 2.2)) { setSt(c, 'hold'); break; }
        }
        if (c.stT > 0.7) { setSt(c, 'fall'); c.cool = 7; }
        keepOut(c, sc * 0.1, i);
        break;
      case 'hold':
        // the death roll: jaws locked, it twists you around
        if (grab.c !== c) { setSt(c, 'fall'); break; }
        tA.subVectors(P.pos, c.pos).normalize(); face(c, tA, 6, dt);
        c.pos.copy(P.pos).addScaledVector(c.dir, -sc * 0.44); c.roll = Math.sin(c.stT * 9) * 0.8;
        act = 0.25; tell = 0.6; amp = 1.8; rate = 3;
        break;
      case 'fall':
        // drop back to the rock (it is heavy), then land on whatever it hits
        c.roll = lerp(c.roll, 0, 1 - Math.exp(-dt * 4));
        c.vel.multiplyScalar(Math.exp(-dt * 1.2)); c.vel.y -= 3.5 * dt; c.pos.addScaledVector(c.vel, dt);
        var hit = TU.cave.collide(c.pos, Math.max(0.12, sc * 0.08), { vel: c.vel, hint: c.hint });
        if (hit.hit || c.stT > 3) { if (hit.hit) { c.pos.copy(hit.pos); c.up.copy(hit.normal); } c.surfaceUp = true; c.vel.set(0, 0, 0); c.roll = 0; setSt(c, 'retreat'); }
        amp = 1; rate = 1.2;
        break;
      case 'retreat':
        tB.subVectors(c.pos, P.pos).add(c.pos); crawlMove(c, tB, 1.4, dt, i); amp = 1; rate = 1;
        if (c.stT > 4) setSt(c, 'stalk');
        break;
      case 'flee':
        tB.subVectors(c.pos, P.pos).add(c.pos); crawlMove(c, tB, 3, dt, i); amp = 1.6; rate = 2.5;
        if (c.stT > 10) { setSt(c, 'lurk'); c.cool = 12; }
        break;
    }
    finish(c, dt, amp, rate, act, tell, 0);
  };

  /* ------------------------------------------------------------------ */
  /* 5. Spider Squid packs: circle and flash, the strobe means a grab    */
  /* ------------------------------------------------------------------ */
  function squidInk(c) {
    H.cloud(80, { pos: c.pos, col: 0x070409, alpha: 0.9, size: [0.3, 1.8], speed: 1.3, spread: 0.4, life: [7, 11], ink: true });
    TU.emit('creature:ink', { id: c.id, species: c.speciesId, speciesId: c.speciesId, pos: c.pos.clone() });
    var P = TU.player.state;
    if (preyOK(P) && c.pos.distanceTo(P.pos) < 3.5) H.attack(c, 'ink', { severity: 0.05, panic: 10, blur: 2.5 });
    snd('squirt', c);
  }
  L.movers.squid = function (c, i, dt, P, d) {
    var sc = c.scale, pk = packTick(c, dt, P), prey = preyOK(P);
    if (!c.st || c.st === 'idle') setSt(c, 'school');
    var amp = 0.6, rate = 0.6, act = c.sp.idleAct, tell = 0, glow = 0.7 + 0.3 * Math.sin(now() * 1.2 + c.rnd * 6), back = false;
    if (pk && pk.flee > 0 && (c.st === 'school' || c.st === 'circle')) setSt(c, 'retreat');
    if (pk && pk.st === 'hunt' && c.st === 'school') setSt(c, 'circle');
    if (pk && pk.st !== 'hunt' && c.st === 'circle') setSt(c, 'school');
    switch (c.st) {
      case 'school':
        tA.copy(pk ? pk.center : c.home).add(c.off || Y);
        var jet = Math.pow(Math.max(0, Math.sin(now() * 1.1 + c.rnd * 6)), 6);
        H.seek(c, tA, 0.3 + jet * 1.2, 0.8, dt, 1);
        back = true;
        break;
      case 'circle':
        // each squid keeps its own place on a ring around you, arms toward you
        var idx = pk ? pk.members.indexOf(c) : 0, ang = (pk ? pk.orbA : now() * 0.3) + idx * 2.094;
        tA.set(P.pos.x + Math.cos(ang) * 4.6, P.pos.y + Math.sin(ang * 1.7) * 0.8, P.pos.z + Math.sin(ang) * 4.6);
        H.seek(c, tA, 2.0, 2, dt, 1.2);
        tB.subVectors(P.pos, c.pos).normalize(); face(c, tB, 3, dt);
        glow = 0.6 + 0.6 * Math.max(0, Math.sin(now() * 2.4 + idx * 2)); amp = 0.8; act = 0.18;
        break;
      case 'tell':
        // the strobe: photophores flash fast, the arm crown opens
        c.vel.multiplyScalar(Math.exp(-dt * 3));
        tB.subVectors(P.pos, c.pos).normalize(); face(c, tB, 5, dt);
        glow = Math.sin(now() * 44) > 0 ? 2.6 : 0.2; act = 1; tell = 1; amp = 1.2; rate = 1.4;
        if (c.stT > 0.9) { setSt(c, 'dart'); c.hitDone = false; struck(); }
        break;
      case 'dart':
        tB.subVectors(P.pos, c.pos).normalize(); H.steer(c, tB.x * 5.5, tB.y * 5.5, tB.z * 5.5, 14, dt); face(c, tB, 6, dt);
        act = 1; tell = 1; amp = 1.4; rate = 2; glow = 2;
        if (!c.hitDone && prey && c.pos.distanceTo(P.pos) < 0.55 + sc * 0.22) {
          c.hitDone = true;
          H.attack(c, 'grab', { severity: 0.12, panic: 25 }); snd('slap', c);
          if (startGrab(c, 'hold', 0.8, 5)) { setSt(c, 'hold'); break; }
        }
        if (c.stT > 1.1) { squidInk(c); setSt(c, 'retreat'); }
        break;
      case 'hold':
        // wrapped around your mask: it sits right in front of your face
        if (grab.c !== c) { setSt(c, 'retreat'); break; }
        camFwd(tB); c.pos.copy(TU.camera.position).addScaledVector(tB, sc * 0.3 + 0.12).add(tC.set(0, -0.08, 0));
        c.dir.copy(tB).negate(); c.vel.set(0, 0, 0);
        act = 0.15; tell = 0.5; amp = 1.5; rate = 2.4; glow = Math.sin(now() * 20) > 0 ? 2.2 : 0.6;
        break;
      case 'retreat':
        // jet away mantle first
        tB.subVectors(c.pos, P.pos).normalize(); H.steer(c, tB.x * 5, tB.y * 5, tB.z * 5, 10, dt);
        back = true; amp = 0.5; act = 0.05; glow = 0.3;
        if (c.stT > 2.2) setSt(c, pk && pk.st === 'hunt' ? 'circle' : 'school');
        break;
    }
    c.vel.multiplyScalar(Math.exp(-dt * 0.9));
    if (c.st !== 'hold') c.pos.addScaledVector(c.vel, dt);
    if (back) { var vl = c.vel.length(); if (vl > 0.1) { tD.copy(c.vel).divideScalar(-vl); face(c, tD, 3, dt); } }
    if (c.st !== 'hold') keepOut(c, clamp(sc * 0.08, 0.08, 0.25), i);
    finish(c, dt, amp, rate, act, tell, glow);
  };

  /* ------------------------------------------------------------------ */
  /* 6. The Maw: shadows you in the dark, lights out, rumble, charge     */
  /* ------------------------------------------------------------------ */
  L.movers.maw = function (c, i, dt, P, d) {
    var sc = c.scale, prey = preyOK(P);
    if (!c.st || c.st === 'idle') setSt(c, 'roam');
    if (c.noiseT > 0) c.noiseT -= dt;
    var amp = 0.8, rate = 0.8, act = c.sp.idleAct, tell = 0, glow = 0.85 + 0.25 * Math.sin(now() * 1.4 + c.rnd * 4);
    var sense = prey && (canSee(c, P, 45) || smells(c, P, 60) || c.noiseT > 0);
    switch (c.st) {
      case 'roam':
        if (c.wtT <= 0 || c.pos.distanceTo(c.wt) < 3) H.newWander(c, 22, 0.2);
        c.wtT -= dt; H.seek(c, c.wt, 1.4, 0.4, dt, 4);
        if (sense) { setSt(c, 'shadow'); c.orbA = Math.atan2(c.pos.z - P.pos.z, c.pos.x - P.pos.x); c.orbDir = c.rnd > 0.5 ? 1 : -1; }
        break;
      case 'shadow':
        // keeps to the edge of your light: you see its lure lines move in the dark
        if (!prey || d > 75) { setSt(c, 'roam'); break; }
        c.orbA += c.orbDir * 2.2 / 20 * dt;
        var R = 19 + 4 * Math.sin(c.stT * 0.3);
        tA.set(P.pos.x + Math.cos(c.orbA) * R, P.pos.y + Math.sin(c.stT * 0.2) * 1.5, P.pos.z + Math.sin(c.orbA) * R);
        H.seek(c, tA, 2.4, 0.8, dt, 3);
        if (c.stT > 9 && c.cool <= 0) setSt(c, 'approach');
        break;
      case 'approach':
        tA.subVectors(c.pos, P.pos).normalize().multiplyScalar(11).add(P.pos);
        H.seek(c, tA, 3, 1, dt, 2);
        if ((d < 14 || c.stT > 8) && canStrike()) { setSt(c, 'tell'); tellEvent(c, 'rumble'); snd('rumble', c); }
        if (!prey) setSt(c, 'roam');
        break;
      case 'tell':
        // lights out, a deep rumble that shakes your mask, then the eyes flare: 2.2 s to get out of the way
        c.vel.multiplyScalar(Math.exp(-dt * 2));
        tA.subVectors(P.pos, c.pos).normalize(); face(c, tA, 1.5, dt);
        glow = 0.9 * (1 - smooth(0, 1.0, c.stT)); tell = smooth(1.5, 2.0, c.stT); act = smooth(1.4, 2.1, c.stT) * 0.6; amp = 0.5;
        if (TU.fx && TU.fx.shake && (H.stepNo() % 8) === 0 && simulating()) TU.fx.shake(0.05 + 0.15 * c.stT / 2.2);
        if (c.stT > 2.2) { setSt(c, 'charge'); c.runDir = (c.runDir || new T.Vector3()).copy(tA); c.hitDone = false; struck(); }
        break;
      case 'charge':
        tA.subVectors(P.pos, c.pos); var dl = tA.length(); tA.divideScalar(dl || 1);
        if (c.runDir.dot(tA) > 0.3) c.runDir.lerp(tA, 1 - Math.exp(-dt * 0.55)).normalize();
        H.steer(c, c.runDir.x * 9, c.runDir.y * 9, c.runDir.z * 9, 10, dt);
        glow = 0.1; tell = 1; act = dl < 7 ? 1 : 0.6; amp = 1.3; rate = 1.8;
        tB.copy(c.pos).addScaledVector(c.dir, sc * 0.46);
        if (!c.hitDone && prey && tB.distanceTo(P.pos) < 1.0 + sc * 0.05) {
          c.hitDone = true; H.attack(c, 'bite', { severity: 0.8, injury: 'bite', panic: 55, gore: true }); snd('chomp', c);
          tC.crossVectors(c.runDir, Y); if (tC.lengthSq() < 1e-4) tC.set(1, 0, 0); shove(tC.normalize().multiplyScalar(2.5).addScaledVector(c.runDir, 1.5));
          c.cool = 12;
        }
        if (c.stT > 3 || (c.hitDone && c.stT > 0.6) || (c.stT > 1 && c.runDir.dot(tA) < -0.3)) setSt(c, 'pass');
        break;
      case 'pass':
        tA.subVectors(c.pos, P.pos); tA.y *= 0.3; tA.normalize().add(tB.copy(c.dir).multiplyScalar(0.8)).normalize();
        H.steer(c, tA.x * 4, tA.y * 4, tA.z * 4, 4, dt); act = 0.2; glow = 0.3; amp = 1.1;
        if (c.stT > 2) { setSt(c, 'retreat'); c.cool = Math.max(c.cool, 10); }
        break;
      case 'retreat':
        tA.subVectors(c.pos, P.pos); tA.y *= 0.2; tA.normalize(); H.steer(c, tA.x * 3.2, tA.y * 3.2, tA.z * 3.2, 1.5, dt); glow = 0.4; amp = 1;
        if (c.stT > (c.retreatT || 6) && (d > 30 || c.stT > 20)) { setSt(c, prey ? 'shadow' : 'roam'); c.retreatT = 6; c.orbA = Math.atan2(c.pos.z - P.pos.z, c.pos.x - P.pos.x); }
        break;
    }
    c.vel.multiplyScalar(Math.exp(-dt * 0.3));
    c.pos.addScaledVector(c.vel, dt);
    if (c.st !== 'tell') headingFromVel(c, dt, c.st === 'charge' ? 2.5 : 0.9);
    keepOut(c, clamp(sc * 0.07, 0.4, 1.1), i);
    finish(c, dt, amp, rate, act, tell, glow);
  };

  /* ------------------------------------------------------------------ */
  /* Hurt reactions (flee or enrage) and deaths                          */
  /* ------------------------------------------------------------------ */
  L.hurtHooks.push(function (c, dmg, o, kind) {
    var s = c.sp; if (!s.predator) return false;
    if (grab.c === c) { grab.strength -= kind === 'stun' ? 1 : PT.hitBreak; if (grab.strength <= 0 || kind === 'stun') release(kind === 'stun' ? 'stunned' : 'hit'); }
    if (kind === 'stun') { if (c.st === 'run' || c.st === 'dart' || c.st === 'charge' || c.st === 'lunge' || c.st === 'pounce' || c.st === 'tell') setSt(c, s.move === 'gulper' ? 'retract' : s.move === 'lurker' ? 'fall' : s.move === 'squid' || s.move === 'barracuda' ? 'retreat' : 'pass'); if (s.move === 'lurker') c.surfaceUp = c.st !== 'fall'; return true; }
    var frac = c.hp / c.maxHp;
    snd('hurt', c);
    switch (s.move) {
      case 'shark':
        if (frac < 0.35) { setSt(c, 'flee'); c.fleeLong = true; }
        else { c.enrage = 12; c.bumped = true; if (c.st === 'patrol') { setSt(c, 'circle'); c.circR = 6; c.orbA = Math.atan2(c.pos.z - TU.player.state.pos.z, c.pos.x - TU.player.state.pos.x); c.orbDir = 1; } c.cool = Math.min(c.cool, 1); }
        break;
      case 'barracuda':
        if (c.pack) c.pack.flee = 5;
        break;
      case 'gulper':
        if (c.st !== 'grab' || !grab.c) { setSt(c, 'retract'); c.cool = 6; }
        break;
      case 'lurker':
        if (frac < 0.3) { setSt(c, 'flee'); c.surfaceUp = true; }
        else if (c.st === 'lurk' || c.st === 'stalk' || c.st === 'retreat') { c.enrage = 8; c.cool = 0; setSt(c, 'tell'); tellEvent(c, 'hiss'); snd('hiss', c); }
        break;
      case 'squid':
        if (c.st !== 'hold') { squidInk(c); setSt(c, 'retreat'); }
        if (c.pack) c.pack.cool = Math.max(c.pack.cool, 3);
        break;
      case 'maw':
        var mark = Math.floor(frac * 4);  // every quarter of its health lost, it backs off into the dark
        if (c.hpMark == null) c.hpMark = 3;
        if (mark < c.hpMark) { c.hpMark = mark; setSt(c, 'retreat'); c.retreatT = frac < 0.15 ? 60 : 14; snd('rumble', c); }
        break;
    }
    return true;
  });
  L.killHooks.push(function (c) {
    if (grab.c === c) release('killed');
    if (c.sp.move === 'squid') squidInk(c);
    if (c.sp.predator) snd('death', c);
  });

  /* ------------------------------------------------------------------ */
  /* Spawning                                                            */
  /* ------------------------------------------------------------------ */
  function spotOK(p, minPlayer) {
    var ent = entrancePos(), P = TU.player.state;
    if (ent && p.distanceTo(ent) < PT.entranceSafe) return false;
    if (minPlayer && P && P.pos && p.distanceTo(P.pos) < minPlayer) return false;
    return true;
  }
  // A spot in a zone. o: { surface, frac, minPlayer, test(spot) }
  function findSpot(zone, rand, o) {
    o = o || {};
    for (var k = 0; k < (o.tries || 14); k++) {
      var q = { zone: zone }; if (o.surface) q.surface = o.surface; else q.frac = o.frac || [0.1, 0.55];
      var spt = TU.cave.randomSpot(q, rand); if (!spt) continue;
      var p = spt.pos;
      if (o.surface !== 'wall' && o.surface !== 'floor' && TU.cave.isDry(p)) continue;
      if (o.surface && TU.cave.isDry(tA.copy(p).addScaledVector(spt.normal, 0.4))) continue;
      if (!spotOK(p, o.minPlayer)) continue;
      if (o.test && !o.test(spt)) continue;
      return spt;
    }
    return null;
  }
  function room(p) { var R = 40; for (var k = 0; k < 8; k++) { var a = k / 8 * Math.PI * 2; R = Math.min(R, TU.cave.raycast(p, tA.set(Math.cos(a), 0, Math.sin(a)), 40)); } return Math.min(R, TU.cave.raycast(p, Y, 40) + TU.cave.raycast(p, tB.set(0, -1, 0), 40)); }
  function spawn(sid, pos, rand, opts) {
    opts = opts || {};
    var s = H.SPECIES[sid]; if (!s || aliveCount(sid) >= s.cap) return null;
    var c = H.makeRec(sid, pos, rand, { zone: zoneHere(pos), normal: opts.normal, sizeU: opts.sizeU, variant: opts.variant });
    c.st = opts.st || null; c.stT = 0; c.cool = opts.cool == null ? 2 : opts.cool; c.home.copy(pos);
    H.addRec(c);
    if (opts.active) { c.active = true; c.dist = c.pos.distanceTo(TU.player.state.pos); }
    return c;
  }
  var SP = {
    shark: function (pos, rand, o) { return spawn('cenote_bull_shark', pos, rand, o); },
    barracuda: function (pos, rand, n, o) {
      var pk = makePack('barracuda', pos), su = (rand() + rand()) / 2;
      for (var k = 0; k < n; k++) {
        var p = pos.clone().add(new T.Vector3((rand() - 0.5) * 2, (rand() - 0.5) * 0.8, (rand() - 0.5) * 2));
        var c = spawn('pale_barracuda', p, rand, Object.assign({ sizeU: clamp(su + (rand() - 0.5) * 0.3, 0, 1) }, o || {}));
        if (!c) break; c.pack = pk; c.off = new T.Vector3((rand() - 0.5) * 2.4, (rand() - 0.5) * 0.9, (rand() - 0.5) * 2.4); pk.members.push(c);
      }
      pk.n0 = pk.members.length; return pk;
    },
    gulper: function (spt, rand, o) {
      var c = spawn('gulper_eel', spt.pos, rand, Object.assign({ normal: spt.normal }, o || {})); if (!c) return null;
      c.home.copy(spt.pos); c.normal.copy(spt.normal).normalize(); c.aim = c.normal.clone(); c.ext = c.scale * 0.3; c.dir.copy(c.normal);
      c.pos.copy(c.home).addScaledVector(c.aim, c.ext - c.scale * 0.5);
      return c;
    },
    lurker: function (spt, rand, o) {
      var c = spawn('cave_lurker', spt.pos, rand, Object.assign({ normal: spt.normal }, o || {})); if (!c) return null;
      c.up.copy(spt.normal).normalize(); c.surfaceUp = true; c.pos.copy(spt.pos).addScaledVector(c.up, c.scale * c.sp.lift);
      tA.set(rand() - 0.5, 0, rand() - 0.5); tA.addScaledVector(c.up, -tA.dot(c.up)); if (tA.lengthSq() < 1e-4) tA.set(1, 0, 0); c.dir.copy(tA.normalize());
      return c;
    },
    squid: function (pos, rand, n, o) {
      var pk = makePack('squid', pos);
      for (var k = 0; k < n; k++) {
        var p = pos.clone().add(new T.Vector3((rand() - 0.5) * 2, (rand() - 0.5) * 1, (rand() - 0.5) * 2));
        var c = spawn('spider_squid', p, rand, o); if (!c) break;
        c.pack = pk; c.off = new T.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 1.2, (rand() - 0.5) * 3); pk.members.push(c);
      }
      pk.n0 = pk.members.length; return pk;
    },
    maw: function (pos, rand, o) {
      var R = room(pos), su = clamp((R - 3) / 6, 0, 1);
      return spawn('the_maw', pos, rand, Object.assign({ sizeU: su }, o || {}));
    }
  };
  function nOf(base, rand, dm) { var n = base * dm, k = Math.floor(n); if (rand() < n - k) k++; return k; }
  // Rookie grace (balance pass): a brand new diver's first real dive has no predators near the entrance.
  function rookie(run) { var pr = TU.save && TU.save.data && TU.save.data.progress; return PT.rookie && run && run.difficulty !== 'hard' && !!pr && (pr.runs || 0) === 0; }
  function zoneHere(pos) { var zi = TU.cave.zoneAt ? TU.cave.zoneAt(pos) : null; return zi && typeof zi.index === 'number' ? zi.index : U.zoneOfDepth(Math.max(0, -pos.y)); }
  // At the start of every dive (after the census of the other creatures).
  L.censusHooks.push(function (rand, has) {
    packs.length = 0; told = {}; strikeT = -99; lastSpawnT = -99; directorT = 0;
    if (grab.c) { grab.c = null; showGrab(false); if (TU.player && TU.player.release) TU.player.release(); }
    var run = TU.run || {}; if (run.tutorial) return;
    var dm = PT.diff[run.difficulty] || 1, sp0 = TU.cave.spawnPoint ? TU.cave.spawnPoint() : null, s0 = sp0 && sp0.pos;
    var safe = function (spt) { return !s0 || spt.pos.distanceTo(s0) >= PT.spawnSafe; };
    var k, spt, rk = rookie(run);
    if (rk) has = has.slice(), has[0] = has[1] = false; // rookie grace: nothing in the Mouth and the Throat
    // shark: open water of the Mouth (or the Throat if the Mouth is tiny); rarer on easy
    for (k = nOf(0.9, rand, PT.sharkDiff[run.difficulty] || dm); k > 0; k--) { spt = (has[0] && findSpot(0, rand, { frac: [0, 0.35], test: safe })) || (has[1] && findSpot(1, rand, { frac: [0, 0.35], test: safe })); if (spt) SP.shark(spt.pos, rand); }
    for (k = nOf(1, rand, dm); k > 0; k--) { var z = has[1] && (!has[2] || rand() < 0.5) ? 1 : 2; spt = has[z] && findSpot(z, rand, { frac: [0.05, 0.45], test: safe }); if (spt) SP.barracuda(spt.pos, rand, Math.round((3 + rand() * 2) * Math.sqrt(dm) + 0.5)); }
    if (has[2]) for (k = nOf(2, rand, dm); k > 0; k--) { spt = findSpot(2, rand, { surface: 'wall', test: safe }); if (spt) SP.gulper(spt, rand); }
    for (k = nOf(1, rand, dm); k > 0; k--) { var zl = has[3] && (!has[2] || rand() < 0.5) ? 3 : 2; spt = has[zl] && findSpot(zl, rand, { surface: 'floor', test: function (q) { return safe(q) && q.normal.y > 0.6 && room(q.pos.clone().add(Y)) > 2; } }); if (spt) SP.lurker(spt, rand); }
    if (has[3]) for (k = nOf(1, rand, dm); k > 0; k--) { spt = findSpot(3, rand, { frac: [0.05, 0.45], test: safe }); if (spt) SP.squid(spt.pos, rand, dm < 1 ? 2 : 3); }
    if (has[4] && rand() < 0.55 * dm) { spt = findSpot(4, rand, { frac: [0, 0.3], test: function (q) { return safe(q) && room(q.pos) > 3.5; } }); if (spt) SP.maw(spt.pos, rand); }
  });
  // Endless mode: a new segment opened (creatures.js calls this after the deep species). Each Beyond zone in it gets
  // a barracuda or squid pack, a Lurker, a Gulper in the wall and sometimes The Maw, scaled by difficulty.
  L.segmentHooks.push(function (rand, e, zones) {
    var run = TU.run || {}; if (run.tutorial) return;
    var dm = PT.diff[run.difficulty] || 1, B = PT.beyond;
    var inSeg = function (q) { return TU.cave.segmentAt(q.pos) === e.index; };
    var core = e.bottom ? new T.Vector3(e.bottom.x, e.bottom.y, e.bottom.z) : null;
    var awayFromRing = function (q) { return inSeg(q) && (!core || q.pos.distanceTo(core) > 14); }; // leave the ring chamber calm
    zones.forEach(function (z, zi) {
      var k, spt;
      for (k = nOf(B.packs, rand, dm); k > 0; k--) { spt = findSpot(z, rand, { frac: [0.05, 0.45], test: awayFromRing }); if (spt) { if (rand() < 0.5) SP.squid(spt.pos, rand, dm < 1 ? 2 : 3); else SP.barracuda(spt.pos, rand, Math.round(3 + rand() * 2)); } }
      for (k = nOf(B.lurkers, rand, dm); k > 0; k--) { spt = findSpot(z, rand, { surface: 'floor', test: function (q) { return awayFromRing(q) && q.normal.y > 0.6 && room(q.pos.clone().add(Y)) > 2; } }); if (spt) SP.lurker(spt, rand); }
      for (k = nOf(B.gulpers, rand, dm); k > 0; k--) { spt = findSpot(z, rand, { surface: 'wall', test: awayFromRing }); if (spt) SP.gulper(spt, rand); }
      if (zi === 0 && rand() < B.maw * dm && !aliveCount('the_maw')) { spt = findSpot(z, rand, { frac: [0, 0.3], test: function (q) { return awayFromRing(q) && room(q.pos) > 3.5; } }); if (spt) SP.maw(spt.pos, rand); }
    });
  });
  // The director: keeps a few predators around you as you go deeper (one at a time, out of sight).
  function director(dt) {
    var run = TU.run; if (!run || run.tutorial || !simulating() || (run.t || 0) < PT.director.startT) return;
    directorT -= dt; if (directorT > 0) return; directorT = PT.director.every;
    if (now() - lastSpawnT < PT.director.gap) return;
    var P = TU.player.state, zr = zoneHere(P.pos), z = clamp(zr, 0, 4), want = (PT.director.want[run.difficulty] || PT.director.want.standard)[z];
    if (z <= 1 && rookie(run)) return;
    var seen = [], n = 0;
    H.recs.forEach(function (c) { if (!c.sp.predator || c.dead || c.gone || c.pos.distanceTo(P.pos) > PT.director.near) return; var key = c.pack || c; if (seen.indexOf(key) < 0) { seen.push(key); n++; } });
    if (n >= want) return;
    var pick = z === 0 ? 'shark' : z === 1 ? (Math.random() < 0.5 ? 'shark' : 'barracuda') : z === 2 ? (Math.random() < 0.6 ? 'barracuda' : 'lurker') : z === 3 ? (Math.random() < 0.6 ? 'squid' : 'lurker') : (aliveCount('the_maw') ? 'squid' : (Math.random() < 0.4 ? 'maw' : 'squid'));
    var rnd = Math.random, cam = TU.camera, fw = camFwd(tC);
    var spt = findSpot(zr, rnd, { surface: pick === 'lurker' ? 'floor' : null, frac: [0.05, 0.5], minPlayer: PT.director.minD, tries: 12, test: function (q) {
      var dd = q.pos.distanceTo(P.pos); if (dd > PT.director.maxD) return false;
      tA.subVectors(q.pos, cam.position); var l = tA.length(); if (tA.dot(fw) / l < 0.3) return true;     // behind you
      return TU.cave.raycast(cam.position, tA.divideScalar(l), l) < l - 1;                                     // or behind rock
    } });
    if (!spt) return;
    lastSpawnT = now();
    if (pick === 'shark') SP.shark(spt.pos, rnd, { active: true });
    else if (pick === 'barracuda') SP.barracuda(spt.pos, rnd, 4, { active: true });
    else if (pick === 'lurker') SP.lurker(spt, rnd, { active: true });
    else if (pick === 'squid') SP.squid(spt.pos, rnd, 3, { active: true });
    else if (pick === 'maw' && room(spt.pos) > 3.5) SP.maw(spt.pos, rnd, { active: true });
  }

  /* ------------------------------------------------------------------ */
  /* Weapons are loud: prey flees, some predators come to look           */
  /* ------------------------------------------------------------------ */
  TU.on('weapon:noise', function (e) {
    if (!e || !e.pos) return;
    var pos = new T.Vector3(e.pos.x, e.pos.y, e.pos.z), R = PT.noiseRange * clamp(e.loudness == null ? 0.5 : e.loudness, 0, 2);
    H.recs.forEach(function (c) {
      if (c.dead || c.gone || c.caught || c.sp.kind === 'flora') return;
      var d = c.pos.distanceTo(pos); if (d > R) return;
      if (c.sp.predator) { if (c.sp.move === 'shark' || c.sp.move === 'lurker' || c.sp.move === 'maw' || c.sp.move === 'barracuda') { c.noiseT = 8; c.noiseAt = pos.clone(); } }
      else if (c.sp.move !== 'giant' && c.sp.move !== 'still' && c.sp.move !== 'crawl') { H.startFlee(c, 2.5 + 2.5 * (1 - d / R)); if (c.group) c.group.flee = 3; }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Sounds for the tells (own small WebAudio graph, follows TU.audio)   */
  /* ------------------------------------------------------------------ */
  // We do NOT open a second AudioContext (a second context hangs some browsers). If TU.audio exposes its
  // context (TU.audio.ctx, and TU.audio.out as the destination) the tells get their own synthesized sounds;
  // otherwise they fall back to the closest existing TU.audio sounds.
  var AU = { noise: null, nctx: null }, _iq = new T.Quaternion();
  var FALLBACK = { thrum: ['whoosh'], thump: ['thump', { strength: 0.5 }], chomp: ['bite', { severity: 0.6 }], chatter: ['metalClank', { vol: 0.02 }], slash: ['cut', { severity: 0.2 }],
    glorp: ['creak', { strength: 0.4 }], hiss: ['whoosh'], clicks: ['metalClank', { vol: 0.015 }], slap: ['grab'], squirt: ['whoosh'], rumble: ['quake', { strength: 0.5, duration: 2.2 }], death: ['thump', { strength: 0.3 }] };
  function actx() {
    var ctx = TU.audio && TU.audio.ctx; if (!ctx || !ctx.createBuffer) return null;
    if (AU.nctx !== ctx) {
      try { var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), dd = buf.getChannelData(0); for (var k = 0; k < len; k++) dd[k] = Math.random() * 2 - 1; AU.noise = buf; AU.nctx = ctx; } catch (e) { return null; }
    }
    return ctx;
  }
  function snd(name, c) {
    if (!TU.audio || !TU.audio.ready || TU.audio.muted || !simulating()) return;
    var ctx = actx();
    if (!ctx) { var fb = FALLBACK[name]; if (fb && TU.audio.play) TU.audio.play(fb[0], fb[1] || {}); return; }
    try {
      var cam = TU.camera, out = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null, t = ctx.currentTime, dest = TU.audio.out || ctx.destination;
      var d = c ? c.pos.distanceTo(cam.position) : 2;
      out.gain.value = 0.75 / (1 + d * 0.12);
      if (pan && c) { tA.subVectors(c.pos, cam.position).applyQuaternion(_iq.copy(cam.quaternion).invert()); pan.pan.value = clamp(tA.x / (Math.abs(tA.z) + Math.abs(tA.x) + 0.5), -0.9, 0.9); out.connect(pan); pan.connect(dest); } else out.connect(dest);
      var SN = SOUNDS[name]; if (SN) SN(ctx, out, t);
    } catch (e) { /* sound is optional */ }
  }
  function nz(ctx, dst, t, type, f, q, a, dur, att) {
    var src = ctx.createBufferSource(); src.buffer = AU.noise; src.loop = true;
    var fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + (att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(dst); src.start(t, Math.random()); src.stop(t + dur + 0.05);
    return fl;
  }
  function osc(ctx, dst, t, type, f, a, dur, att, f2) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + (att || 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  var SOUNDS = {
    thrum: function (x, d, t) { osc(x, d, t, 'sine', 52, 0.35, 1.0, 0.25, 44); nz(x, d, t, 'lowpass', 260, 0.7, 0.25, 1.0, 0.3); },        // a pressure wave as it hunches
    thump: function (x, d, t) { osc(x, d, t, 'sine', 70, 0.5, 0.35, 0.005, 38); nz(x, d, t, 'lowpass', 400, 0.8, 0.3, 0.25, 0.005); },
    chomp: function (x, d, t) { nz(x, d, t, 'bandpass', 900, 1.2, 0.5, 0.18, 0.003); osc(x, d, t, 'square', 120, 0.12, 0.12, 0.003, 60); nz(x, d, t + 0.06, 'lowpass', 600, 0.7, 0.3, 0.3, 0.01); },
    chatter: function (x, d, t) { for (var k = 0; k < 9; k++) nz(x, d, t + k * 0.055, 'bandpass', 2600 + Math.random() * 600, 6, 0.22, 0.03, 0.002); },
    slash: function (x, d, t) { var f = nz(x, d, t, 'bandpass', 1200, 1.5, 0.35, 0.3, 0.02); f.frequency.exponentialRampToValueAtTime(3500, t + 0.25); },
    glorp: function (x, d, t) { var f = nz(x, d, t, 'bandpass', 180, 6, 0.5, 0.7, 0.08); f.frequency.exponentialRampToValueAtTime(700, t + 0.6); osc(x, d, t, 'sawtooth', 48, 0.08, 0.7, 0.1, 36); },
    hiss: function (x, d, t) { nz(x, d, t, 'highpass', 2800, 0.7, 0.35, 0.95, 0.06); var o = osc(x, d, t, 'sawtooth', 68, 0.12, 0.9, 0.08, 52); o.detune.value = -20; nz(x, d, t, 'lowpass', 300, 1, 0.18, 0.9, 0.1); },
    clicks: function (x, d, t) { for (var k = 0; k < 12; k++) nz(x, d, t + k * 0.07, 'bandpass', 4200 + k * 120, 8, 0.2, 0.02, 0.001); osc(x, d, t, 'sine', 1800, 0.03, 0.9, 0.2, 2600); },
    slap: function (x, d, t) { nz(x, d, t, 'lowpass', 1500, 0.8, 0.5, 0.2, 0.004); },
    squirt: function (x, d, t) { var f = nz(x, d, t, 'lowpass', 900, 2, 0.3, 0.5, 0.01); f.frequency.exponentialRampToValueAtTime(200, t + 0.45); },
    rumble: function (x, d, t) { d.gain.value = Math.max(d.gain.value, 0.6); osc(x, d, t, 'sine', 31, 0.6, 2.4, 0.9); osc(x, d, t, 'sine', 44, 0.35, 2.4, 1.2, 40); nz(x, d, t, 'lowpass', 120, 0.8, 0.5, 2.4, 1.0); },
    hurt: function (x, d, t) { nz(x, d, t, 'bandpass', 500, 3, 0.15, 0.2, 0.01); },
    death: function (x, d, t) { osc(x, d, t, 'sine', 90, 0.15, 0.8, 0.02, 40); nz(x, d, t, 'lowpass', 500, 1, 0.2, 0.8, 0.02); }
  };

  /* ------------------------------------------------------------------ */
  /* DOM: the grab bar and the ink blackout (own #cr- elements)          */
  /* ------------------------------------------------------------------ */
  TU.css('cr-pred', [
    '#cr-grab{position:fixed;left:50%;bottom:calc(var(--gb) + 30%);transform:translateX(-50%);width:min(340px,calc(100vw - 32px));z-index:3;pointer-events:none;display:none;font-family:var(--mono);color:var(--bad);text-align:center;text-shadow:0 0 8px rgba(255,90,79,.5)}',
    '#cr-grab.cr-on{display:block}',
    '#cr-grab .cr-t{font-size:13px;letter-spacing:.08em;margin-bottom:8px}',
    '#cr-grab .cr-bar{height:10px;border:1px solid var(--bad);border-radius:6px;background:rgba(10,2,2,.55);overflow:hidden;position:relative}',
    '#cr-grab .cr-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--hud),var(--warn) 55%,var(--bad))}',
    '#cr-grab .cr-k{font-size:11px;color:var(--ink-dim);margin-top:6px}',
    '#cr-ink{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 50%,rgba(8,5,10,.78) 0%,rgba(3,2,4,.97) 72%)}'
  ].join('\n'));
  var grabEl = null, grabFill = null, inkEl = null, inkV = 0;
  function showGrab(on) {
    if (!grabEl) return;
    grabEl.classList.toggle('cr-on', !!on);
    if (on && grab.c) grabEl.querySelector('.cr-t').textContent = GRAB_TXT[grab.c.speciesId] || 'GRABBED';
  }
  function updateGrabBar() { if (grabFill) grabFill.style.width = Math.round(clamp(grab.strength, 0, 1) * 100) + '%'; }

  /* ------------------------------------------------------------------ */
  /* Burrows: the dark holes the Gulper eels live in                     */
  /* ------------------------------------------------------------------ */
  var burrow = null;
  function burrowInit() {
    var hole = new T.InstancedMesh(new T.CircleGeometry(1, 22), new T.MeshBasicMaterial({ color: 0x010101 }), 10);
    var lip = new T.InstancedMesh(new T.TorusGeometry(1, 0.3, 7, 22), new T.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.95, metalness: 0 }), 10);
    [hole, lip].forEach(function (m) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.name = 'cr-burrow'; TU.scene.add(m); });
    burrow = { hole: hole, lip: lip, m: new T.Matrix4(), q: new T.Quaternion(), s: new T.Vector3(), z: new T.Vector3(0, 0, 1), p: new T.Vector3() };
  }
  function burrowDraw() {
    if (!burrow) return;
    var n = 0, B = burrow;
    for (var k = 0; k < H.recs.length && n < 10; k++) {
      var c = H.recs[k]; if (c.speciesId !== 'gulper_eel' || c.gone || !c.active || !c.aim) continue;
      var r = c.scale * 0.1;
      B.q.setFromUnitVectors(B.z, c.normal);
      B.m.compose(B.p.copy(c.home).addScaledVector(c.normal, 0.01), B.q, B.s.set(r, r, r)); B.hole.setMatrixAt(n, B.m);
      B.m.compose(B.p.copy(c.home).addScaledVector(c.normal, 0.02), B.q, B.s.set(r * 1.05, r * 1.05, r * 0.8)); B.lip.setMatrixAt(n, B.m);
      n++;
    }
    B.hole.count = B.lip.count = n; B.hole.visible = B.lip.visible = n > 0;
    if (n) B.hole.instanceMatrix.needsUpdate = B.lip.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Debug helpers (tests and filming)                                   */
  /* ------------------------------------------------------------------ */
  // Spawn a predator in front of the camera. opts: { st, still (no brain: a statue for screenshots), sizeU, facing, cool, n (pack size) }
  // Gulper: the hole goes on the rock straight ahead (or a fake wall dist m ahead). Lurker: on the floor under that point.
  function debugSpawnPredator(sid, dist, opts) {
    opts = opts || {}; dist = dist || 4;
    var cam = TU.camera, fw = camFwd(new T.Vector3()), p = cam.position.clone().addScaledVector(fw, dist), rnd = Math.random, c = null, pk = null;
    var base = { active: true, sizeU: opts.sizeU, st: opts.st, cool: opts.cool == null ? 0 : opts.cool, variant: opts.variant === undefined ? null : opts.variant };
    if (sid === 'gulper_eel') {
      var dw = TU.cave.raycast(cam.position, fw, 14), wp = dw < 14 ? cam.position.clone().addScaledVector(fw, dw - 0.02) : p;
      c = SP.gulper({ pos: wp, normal: fw.clone().negate() }, rnd, base);
      if (c && opts.ext != null) { c.ext = opts.ext * c.scale; c.pos.copy(c.home).addScaledVector(c.aim, c.ext - c.scale * 0.5); }
    } else if (sid === 'cave_lurker') {
      var dn = TU.cave.raycast(p, tA.set(0, -1, 0), 12), fp = dn < 12 ? p.clone().add(tA.set(0, -dn, 0)) : p.clone().add(tA.set(0, -1, 0));
      c = SP.lurker({ pos: fp, normal: Y.clone() }, rnd, base);
    } else if (sid === 'pale_barracuda') { pk = SP.barracuda(p, rnd, opts.n || 5, base); c = pk.members[0]; }
    else if (sid === 'spider_squid') { pk = SP.squid(p, rnd, opts.n || 3, base); c = pk.members[0]; }
    else if (sid === 'the_maw') c = SP.maw(p, rnd, base);
    else c = SP.shark(p, rnd, base);
    if (!c) return null;
    if (opts.facing) c.dir.copy(opts.facing).normalize();
    else if (sid !== 'gulper_eel') { tA.set(fw.z, 0, -fw.x).normalize(); if (c.surfaceUp) tA.addScaledVector(c.up, -tA.dot(c.up)).normalize(); c.dir.copy(tA); }
    if (opts.still) { c.still = true; c.st = opts.st || c.st; }
    if (pk) pk.members.forEach(function (m) { m.active = true; m.dist = m.pos.distanceTo(TU.player.state.pos); });
    return { id: c.id, speciesId: sid, pos: c.pos.clone(), sizeM: c.sizeM, hp: c.hp, maxHp: c.maxHp, pack: pk ? pk.members.map(function (m) { return m.id; }) : null };
  }
  function predatorInfo(id) {
    var c = H.get(id); if (!c) return null;
    return { id: c.id, speciesId: c.speciesId, st: c.st, stT: +c.stT.toFixed(2), hp: +c.hp.toFixed(1), maxHp: c.maxHp, dead: c.dead, gone: c.gone, stun: +c.stun.toFixed(2), tell: +c.tell.toFixed(2), act: +c.act.toFixed(2), glow: +c.glow.toFixed(2), roll: +c.roll.toFixed(2),
      pos: c.pos.clone(), dist: +c.dist.toFixed(2), ext: c.ext != null ? +c.ext.toFixed(2) : null, surfaceUp: !!c.surfaceUp, pack: c.pack ? { st: c.pack.st, flee: +c.pack.flee.toFixed(1), alive: packAlive(c.pack).length } : null };
  }
  // A frozen pose for screenshots: { st, tell, act, roll, glow }. Statues (still: true) keep it.
  function debugPose(id, o) {
    var c = H.get(id); if (!c) return null; o = o || {};
    c.still = true; if (o.st) setSt(c, o.st);
    if (o.tell != null) c.tell = o.tell; if (o.act != null) c.act = o.act; if (o.roll != null) c.roll = o.roll; if (o.glow != null) c.glow = o.glow;
    if (o.ext != null && c.aim) { c.ext = o.ext * c.scale; c.pos.copy(c.home).addScaledVector(c.aim, c.ext - c.scale * 0.5); }
    if (o.free) c.still = false;
    return predatorInfo(id);
  }
  // Statues: wrap every mover so a debug "still" predator only animates in place (tests and filming).
  ['shark', 'barracuda', 'gulper', 'lurker', 'squid', 'maw'].forEach(function (mv) {
    var real = L.movers[mv];
    L.movers[mv] = function (c, i, dt, P, d) {
      if (!c.still) return real(c, i, dt, P, d);
      c.ph += dt * c.sp.animK * 0.5; c.amp = lerp(c.amp, 0.6, 0.1);
      if (c.sp.glows) c.glow = c.sp.move === 'maw' && c.tell > 0.5 ? 0.05 : 0.9 + 0.1 * Math.sin(now() * 1.3); else c.glow = c.tell * 2.4 + 0.15;
    };
  });

  /* ------------------------------------------------------------------ */
  /* Public API and the system                                           */
  /* ------------------------------------------------------------------ */
  TU.define('creatures', {
    grabbedBy: grabbedBy,
    struggle: struggle,
    releaseGrab: function () { release('debug'); return true; },
    predatorIds: function () { return PRED_IDS.slice(); },
    predatorTuning: PT,
    debugSpawnPredator: debugSpawnPredator,
    debugPose: debugPose,
    predatorInfo: predatorInfo,
    debugGrab: function (id, kind) { var c = H.get(id); if (!c) return false; var ok = startGrab(c, kind || 'hold', 0.8, 5); if (ok) setSt(c, c.sp.move === 'gulper' ? 'grab' : c.sp.move === 'lurker' ? 'hold' : 'hold'); return ok; },
    debugInk: function (id) { var c = H.get(id); if (!c) return false; squidInk(c); return true; },
    debugDirector: function () { directorT = 0; lastSpawnT = -99; director(1 / 60); return H.recs.filter(function (c) { return c.sp.predator && !c.dead; }).length; }
  });

  TU.addSystem('predators', {
    init: function () {
      grabEl = TU.el('div', { id: 'cr-grab', html: '<div class="cr-t">GRABBED</div><div class="cr-bar"><i id="cr-grab-fill" style="width:100%"></i></div><div class="cr-k">Tap A D A D to kick free, or hit it.</div>' }, document.body);
      grabFill = TU.$('cr-grab-fill');
      inkEl = TU.el('div', { id: 'cr-ink' }, document.body);
      burrowInit();
    },
    reset: function () { if (grab.c) { grab.c = null; showGrab(false); if (TU.player && TU.player.release) TU.player.release(); } inkV = 0; if (inkEl) inkEl.style.opacity = '0'; },
    update: function (dt) {
      grabStep(dt);
      director(dt);
      // the ink overlay follows how much ink is around the camera
      var target = clamp(H.inkAt(TU.camera.position) * 0.8, 0, 0.93);
      inkV = lerp(inkV, target, 1 - Math.exp(-dt * (target > inkV ? 8 : 1.5)));
    },
    idle: function () { if (grab.c) { grab.c = null; showGrab(false); if (TU.player && TU.player.release) TU.player.release(); } inkV = 0; },
    frame: function () {
      burrowDraw();
      if (inkEl) { var o = H.show() ? 0 : inkV; inkEl.style.opacity = o > 0.01 ? o.toFixed(3) : '0'; }
    }
  });
})();
