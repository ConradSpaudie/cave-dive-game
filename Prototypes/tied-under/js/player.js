/*
 * player.js: the diver. Input, movement modes, breathing, air tanks, the vest (BCD), stamina,
 * panic, injuries, the mask, the flashlight and lantern, the guideline rope and waypoint beacons.
 * It also places the first-person camera every step.
 *
 * Movement modes (P.mode), picked automatically from the cave around you:
 *   swim     open water: kick and glide (the tuned feel from the prototype)
 *   crawl    low, tight passages near the floor: your hands pull you along the rock.
 *            On dry land, crawl is a crouch under a low ceiling.
 *   squeeze  very tight holes (or hold Z): slow, both hands pushing, you get stuck and wiggle free with A / D
 *   walk     dry chambers: gravity, WASD, Space jumps, climb out of the water at a ledge
 *   ragdoll  a bad fall on dry land: the camera tumbles, hits, slumps, then you get back up
 *
 * How a step works (update):
 *   1. look: smooth the mouse target into yaw and pitch
 *   2. intent: which way the keys say to go, then pick the mode
 *   3. move: water physics (kicks, pulls, drag relative to the current, vest buoyancy)
 *      or dry physics (gravity, walking, falls), then ask the cave to push us out of the rock
 *   4. air and tanks, stamina, battery, injuries and bleeding, panic, the mask, breathing, silt, drowning
 *   5. rope breadcrumb, camera and flashlight placement
 * Everything other modules may read is in TU.player.state (shape in CONTRACT.md and CONTRACT-C-NOTES.md).
 * The visible hands live in player-hands.js and read TU.player.state.anim.
 *
 * Owner: agent C (with fx.js and audio.js).
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, N = TU.noise, cfg = TU.cfg;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  // Reduce motion is read live (the settings screen changes TU.util.reducedMotion while you play).
  function reduced() { return !!U.reducedMotion; }

  // Tunables for the player systems. They live in TU.cfg (core.js, units in comments there);
  // C is just a short name for those sections.
  var C = {
    crawl: cfg.crawl, squeeze: cfg.squeeze, walk: cfg.walk, fall: cfg.fall, grab: cfg.grab, current: cfg.current,
    injury: cfg.injury, mask: cfg.mask, depth: cfg.depth, cold: cfg.cold, panic: cfg.panic, tank: cfg.tank, lantern: cfg.lantern, rocks: cfg.rocks
  };

  var P = TU.player.state;          // the shared state object (created in core.js, filled here)
  var keys = TU.player.input.keys;  // keyboard state by KeyboardEvent.code
  var touch = { on: false, mx: 0, my: 0, up: false, down: false, lookId: null, lx: 0, ly: 0, stickId: null, sx: 0, sy: 0 };
  TU.player.input.touch = touch;
  var lamp = TU.player.lamp;
  lamp.hitDist = 14; lamp.headlamp = false;
  var run = { t: 0, lowLightWarned: false, narcWarned: false, exitWarned: false, siltWas: false, kickTimer: 0, pullTimer: 0, sprintLock: false, breath: { ph: 0, t: 0, period: 4.8 }, drownSent: false, demo: 1, swimMul: 1, staminaMul: 1, regenMul: 1, batteryDrain: 100 / 480, baseStaminaMax: 100, darkHinted: false, lanternHinted: false, caughtHinted: false,
    mask: cfg.masks.standard, finSpeed: 1, finStamina: 1, finSqueeze: 1, dark: false, darkT: 0, bledSent: false, bleedHinted: false };
  var hint = {};                     // cave lookup cache for the player
  var spot, bounce, lampRig, lampDir = new T.Vector3(0, 0, -1), lampPos = new T.Vector3(), lanternLight;
  var rope = { pts: [], reel: new T.Vector3(), mesh: null, anchor: null };
  var waypoints = [], wpLights = [];
  var tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), tmpV3 = new T.Vector3(), wish = new T.Vector3(), acc = new T.Vector3(), before = new T.Vector3(), cur = new T.Vector3(), rel = new T.Vector3();
  var m4 = new T.Matrix4(), qq = new T.Quaternion(), sc3 = new T.Vector3(), yAxis = new T.Vector3(0, 1, 0), camEuler = new T.Euler(0, 0, 0, 'YXZ');
  var idleT = 0;
  var rand = Math.random;            // replaced by a seeded stream each dive

  // State for the systems below (kept here, not on P, unless other modules need to read it).
  var land = { on: false, eye: C.walk.eye, grounded: false, peakY: 0, stepAcc: 0, airT: 0 };
  var rag = { active: false, phase: 'none', t: 0, p: 0, r: 0, y: 0, vp: 0, vr: 0, vy: 0, slump: 0, h: 0 };
  var climb = { active: false, t: 0, from: new T.Vector3(), to: new T.Vector3() };
  var grab = { on: false, point: new T.Vector3(), normal: new T.Vector3(), cooldown: 0 };
  var tug = { active: false, value: 0.5, last: null, t: 0 };
  var flow = { shelter: 0, forced: null, forcedT: 0, caughtWas: false };
  var squeezeS = { stuck: 0, last: null, wiggle: 0 };
  var mask = { slosh: 0, sloshV: 0, lastYaw: 0, lastRoll: 0, clearing: false, wasFlooded: false };
  var tape = { t: -1, kind: null, cut: null };
  var shock = { t: 0, lightOff: 0 };
  var quake = { t: 0, str: 0 };
  var dbg = { mode: null, headlamp: null };
  var droppedMeshes = [];

  // Fill the fields player.js owns that core.js did not create.
  P.tYaw = 0; P.tPitch = 0; P.airTotal = 200; P.airTotalMax = 200; P.siltWas = false;
  P.health = 100; P.bleed = 0; P.bloodMask = 0; P.maskWater = 0; P.maskSlosh = 0; P.maskClearing = false;
  P.grab = false; P.stuck = 0; P.dry = false; P.lanternOut = false; P.lanternLevel = 0; P.headlamp = false;
  P.wristRaised = false; P.tug = null; P.currentSpeed = 0; P.caught = false; P.quake = 0; P.shock = 0; P.rag = 0;
  P.carried = 1; P.kickMul = 1; P.maimed = null; P.warm = false; P.daze = 0; P.measure = null;
  P.anim = { intent: 0, kickInterval: 0.82, kickCount: 0, pullCount: 0, crawlInterval: 1, squeezePush: 0, wiggle: 0, grab: null, grabNormal: null, inflate: false, deflate: false, wrist: false, tape: -1, tapeKind: null, lantern: false, maskClear: false, climb: -1, ragdoll: false, walkPhase: 0, moveSpeed: 0, shock: 0, jolt: 0, tug: false };

  /* ------------------------------------------------------------------ */
  /* Flashlight rig, rope mesh, waypoint lights, lantern light           */
  /* ------------------------------------------------------------------ */
  function buildRig() {
    var scene = TU.scene, L = cfg.light;
    spot = new T.SpotLight(0xFFF1D6, L.intensity, L.range, L.angle, L.penumbra, L.decay);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.15; spot.shadow.camera.far = 16;
    spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.03;
    scene.add(spot, spot.target);
    bounce = new T.PointLight(0xffd8b0, 0.0, 7, 1.8); scene.add(bounce);
    lampRig = new T.Object3D(); scene.add(lampRig);
    lamp.color = spot.color;
    lanternLight = new T.PointLight(0x7FE8FF, 0, C.lantern.range, 1.6); scene.add(lanternLight);
    rope.mesh = new T.InstancedMesh(new T.CylinderGeometry(cfg.rope.radius, cfg.rope.radius, 1, 5, 1, true), new T.MeshStandardMaterial({ color: 0xf4f0e4, emissive: 0x2a2a26, roughness: 0.55 }), cfg.rope.maxPoints);
    rope.mesh.count = 0; rope.mesh.frustumCulled = false; rope.mesh.castShadow = false;
    scene.add(rope.mesh);
    for (var i = 0; i < cfg.waypoints.lights; i++) { var l = new T.PointLight(0x4FF2D0, 0, 6, 2); scene.add(l); wpLights.push(l); }
  }

  // A spare tank lying on the cave floor (a checkpoint you can come back to).
  var tankGeo = null, tankMat = null, valveMat = null;
  function makeTankMesh() {
    if (!tankGeo) {
      tankGeo = new T.CylinderGeometry(0.085, 0.085, 0.62, 18, 1, false);
      tankMat = new T.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.38, metalness: 0.75 });
      valveMat = new T.MeshStandardMaterial({ color: 0x2b2e30, roughness: 0.5, metalness: 0.6 });
    }
    var g = new T.Group();
    var body = new T.Mesh(tankGeo, tankMat); body.castShadow = true; g.add(body);
    var cap = new T.Mesh(new T.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), tankMat); cap.position.y = 0.31; g.add(cap);
    var valve = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, 0.09, 10), valveMat); valve.position.y = 0.42; g.add(valve);
    var knob = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.015, 12), valveMat); knob.position.y = 0.47; g.add(knob);
    var band = new T.Mesh(new T.CylinderGeometry(0.088, 0.088, 0.05, 18, 1, true), new T.MeshStandardMaterial({ color: 0xd9a400, roughness: 0.6 })); band.position.y = 0.12; g.add(band);
    // a small glowing tag so you can find it again in the dark
    var tag = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0x4FF2D0, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    tag.scale.setScalar(0.35); tag.position.y = 0.36; g.add(tag);
    g.userData.tag = tag;
    g.rotation.z = Math.PI / 2 - 0.12; // lying on its side
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* Reset at the start of a dive                                        */
  /* ------------------------------------------------------------------ */
  function loadoutFor(n) { return n >= 3 ? cfg.loadouts.heavy : n === 2 ? cfg.loadouts.standard : cfg.loadouts.light; }
  function hasHeadlamp(r) {
    if (dbg.headlamp !== null) return dbg.headlamp;
    var ld = (r && r.loadout) || {};
    return !!(ld.headlamp || ld.maskLamp || maskId(ld) === 'headlamp' || (ld.mask && typeof ld.mask === 'object' && (ld.mask.lamp === 'headlamp' || ld.mask.headlamp)));
  }
  // The mask picked in the camp loadout ('standard' | 'tight' | 'wide' | 'headlamp'), if its upgrade level is owned.
  var MASK_NEED = { standard: 1, tight: 2, wide: 3, headlamp: 4 };
  function maskId(ld) {
    var id = ld && ld.mask;
    if (id && typeof id === 'object') id = id.lamp === 'headlamp' || id.headlamp ? 'headlamp' : id.type || 'standard';
    if (!cfg.masks[id]) return 'standard';
    return TU.progress.level('mask') >= (MASK_NEED[id] || 1) ? id : 'standard';
  }
  // Flippers from the loadout: a preset plus the locker's shape and width tokens (each 0..1, about +-3% in total).
  function applyFlippers(ld) {
    var f = (ld && ld.flippers) || {}, pr = cfg.flippers[f.preset] || cfg.flippers.paddle;
    var shape = clamp(f.shape == null ? 0.5 : f.shape, 0, 1) - 0.5, width = clamp(f.width == null ? 0.5 : f.width, 0, 1) - 0.5;
    run.finSpeed = pr.speed * (1 + shape * 0.04 + width * 0.02);
    run.finStamina = pr.stamina * (1 - shape * 0.04 - width * 0.02);
    run.finSqueeze = (pr.squeeze || 1) * (1 - width * 0.1);
  }
  function reset(r) {
    var lo = cfg.loadouts[(r && r.loadout && r.loadout.tank) || 'standard'] || cfg.loadouts.standard;
    run.mask = cfg.masks[maskId(r && r.loadout)] || cfg.masks.standard;
    applyFlippers(r && r.loadout);
    var tankBar = cfg.air.tankBar * (TU.progress.value('tank', 'airMinutes') || 10) / 10;
    rand = TU.rng((r && r.seed) || 1, 40).fn();
    P.tanks = []; for (var i = 0; i < lo.tanks; i++) P.tanks.push({ bar: tankBar, max: tankBar, dropped: false, pos: null });
    P.activeTank = 0; P.airMax = tankBar; P.air = tankBar; P.airTotal = tankBar * lo.tanks; P.airTotalMax = P.airTotal; P.airRate = 0;
    run.swimUpgrade = TU.progress.value('swim', 'mul') || 1;
    run.regenMul = TU.progress.value('stamina', 'regen') || 1;
    run.baseStaminaMax = TU.progress.value('stamina', 'max') || 100;
    applyWeight();
    P.stamina = P.staminaMax;
    run.batteryDrain = 100 / ((TU.progress.value('battery', 'minutes') || cfg.light.batteryMinutes) * 60);
    P.panic = 0; P.injuries = []; P.vestAir = cfg.vest.neutral; P.battery = 100; P.flashOn = true;
    P.depth = 0; P.maxDepth = 0; P.speed = 0; P.dist = 0; P.inWater = true; P.surfaced = false; P.surfaceY = null; P.mode = 'swim';
    P.maskFlooded = false; P.cold = 0; P.sprint = false; P.slow = false; P.narcosis = 0; P.silt = 0; P.drown = 0;
    P.breathPhase = 0; P.breathStage = 0; P.kickPhase = -1; P.wpCount = 0; P.siltOuts = 0; P.wallHits = 0; P.shake = 0; P.hitFlash = 0; P.roll = 0;
    P.health = 100; P.bleed = 0; P.bloodMask = 0; P.maskWater = 0; P.maskSlosh = 0; P.maskClearing = false;
    P.grab = false; P.stuck = 0; P.dry = false; P.lanternOut = false; P.lanternLevel = 0; P.wristRaised = false; P.tug = null;
    P.currentSpeed = 0; P.caught = false; P.quake = 0; P.shock = 0; P.rag = 0; P.maimed = null; P.kickMul = 1; P.warm = false; P.daze = 0; P.measure = null;
    P.bleedOut = 0; P.maskFlood = 0; run.bledSent = false; run.bleedHinted = false; run.dark = false; run.darkT = 0;
    P.headlamp = lamp.headlamp = hasHeadlamp(r);
    var inv = TU.player.inventory, ld = (r && r.loadout) || {};
    // The lantern comes only if it was bought (upgrade level 1+); its slots grow with the upgrade level.
    var lanLv = TU.progress.level('lantern');
    inv.tape = ld.tape || 0; inv.flexTape = ld.flexTape || 0; inv.lantern = ld.lantern && lanLv > 0 ? { slots: TU.progress.value('lantern', 'slots') || 2, creatures: [] } : null;
    inv.measuringTape = !!ld.measuringTape; inv.camera = !!ld.camera; inv.glowSticks = ld.glowSticks || 0; inv.items = [];
    run.t = 0; run.lowLightWarned = false; run.narcWarned = false; run.exitWarned = false; run.siltWas = false; run.kickTimer = 0; run.pullTimer = 0; run.sprintLock = false; run.drownSent = false;
    run.darkHinted = false; run.lanternHinted = false; run.caughtHinted = false; run.cutHinted = false; run.maskHinted = false; run.droppedHinted = false; run.tilt = 0;
    run.breath = { ph: 0, t: 0, period: cfg.breath.period };
    land.on = false; land.eye = C.walk.eye; land.grounded = false; land.airT = 0;
    rag.active = false; rag.phase = 'none'; rag.p = rag.r = rag.y = rag.vp = rag.vr = rag.vy = rag.slump = 0;
    climb.active = false; grab.on = false; grab.cooldown = 0; tug.active = false; tug.value = 0.5;
    flow.shelter = 0; flow.forced = null; flow.forcedT = 0; flow.caughtWas = false;
    squeezeS.stuck = 0; squeezeS.wiggle = 0; mask.slosh = mask.sloshV = 0; mask.clearing = false; mask.wasFlooded = false;
    tape.t = -1; tape.kind = null; tape.cut = null; shock.t = 0; shock.lightOff = 0; quake.t = 0; quake.str = 0;
    var A = P.anim; A.grab = null; A.tape = -1; A.climb = -1; A.ragdoll = false; A.wrist = false; A.lantern = false; A.maskClear = false; A.tug = false; A.kickCount = 0; A.pullCount = 0;
    droppedMeshes.forEach(function (m) { if (m) TU.scene.remove(m); }); droppedMeshes = [];
    hideTug();
    hint = {};
    var sp = TU.cave.spawnPoint();
    P.pos.copy(sp.pos); P.pos.y += 0.2; P.vel.set(0, 0, 0);
    P.yaw = P.tYaw = sp.yaw; P.pitch = P.tPitch = sp.pitch - 0.05;
    rope.anchor = TU.cave.features.entrance ? TU.cave.features.entrance.stake.clone() : P.pos.clone();
    rope.pts = [rope.anchor.clone()]; rope.mesh.count = 0;
    waypoints.forEach(function (w) { TU.scene.remove(w.group); w.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && o === w.label) o.material.map.dispose(); o.material.dispose(); } }); });
    waypoints.length = 0; wpLights.forEach(function (l) { l.intensity = 0; });
    lampDir.set(0, 0, -1).applyEuler(new T.Euler(P.pitch, P.yaw, 0, 'YXZ'));
    P.env = TU.cave.nearestPoint(P.pos, hint);
    computeBasis();
    placeCamera(0);
  }
  // Tanks are heavy: the number you carry picks the light / standard / heavy feel.
  function applyWeight() {
    var n = 0; for (var i = 0; i < P.tanks.length; i++) if (!P.tanks[i].dropped) n++;
    P.carried = n;
    var lo = loadoutFor(Math.max(1, n));
    run.swimMul = lo.swimMul * (run.swimUpgrade || 1) * (run.finSpeed || 1);
    run.staminaMul = lo.staminaMul;
    run.weightStaminaMax = run.baseStaminaMax * lo.staminaMul * (run.finStamina || 1);
    P.staminaMax = run.weightStaminaMax;
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  var lockOK = true, locked = false, dragging = false, ignoreUnlock = false;
  function canvas() { return TU.canvas; }
  function requestLock() {
    var c = canvas();
    if (!c || !c.requestPointerLock) { lockOK = false; TU.emit('ui:hint', { text: 'Mouse lock is not available here. Hold the mouse button and drag to look.' }); return; }
    try {
      var r = c.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(function () { lockOK = false; TU.emit('ui:hint', { text: 'Mouse lock was blocked. Hold the mouse button and drag to look.' }); });
    } catch (e) { lockOK = false; TU.emit('ui:hint', { text: 'Mouse lock was blocked. Hold the mouse button and drag to look.' }); }
  }
  function releaseLock() { if (document.pointerLockElement) { ignoreUnlock = true; try { document.exitPointerLock(); } catch (e) { } } }
  var GAME_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, Space: 1, KeyC: 1, ControlLeft: 1, ControlRight: 1, ShiftLeft: 1, ShiftRight: 1, KeyB: 1, KeyV: 1, KeyR: 1, KeyF: 1, KeyQ: 1, KeyH: 1, KeyE: 1, KeyT: 1, KeyG: 1, KeyL: 1, KeyM: 1, KeyZ: 1, KeyX: 1, Digit1: 1, Digit2: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

  // Every key in the game, for the controls screen (agent D's ui.js reads TU.player.bindings).
  // One key never does two different things in the same state: E tap is "use", E hold is "grab";
  // digits 1 and 2 are tape in a dive and only pick camp stations in the camp.
  var BINDINGS = [
    'Swimming',
    { action: 'look', keys: ['Mouse'], label: 'Look around (click the view to lock the mouse)', type: 'hold' },
    { action: 'swim', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], label: 'Kick and glide (walk on dry land)', type: 'hold' },
    { action: 'up', keys: ['Space'], label: 'Swim up (jump on dry land)', type: 'hold' },
    { action: 'down', keys: ['KeyC', 'ControlLeft'], label: 'Swim down (crouch on dry land)', type: 'hold' },
    { action: 'sprint', keys: ['ShiftLeft'], label: 'Sprint kick (burns air, kicks up silt)', type: 'hold' },
    { action: 'inflate', keys: ['KeyB'], label: 'Hold: breathe into the vest, rise', type: 'hold' },
    { action: 'deflate', keys: ['KeyV'], label: 'Hold: breathe vest air back, sink (gets some air back)', type: 'hold' },
    { action: 'slowBreath', keys: ['KeyR'], label: 'Hold: slow breathing (calms panic, saves air)', type: 'hold' },
    { action: 'squeeze', keys: ['KeyZ'], label: 'Hold: tuck into a squeeze, then wiggle with A / D', type: 'hold' },
    'Rock and currents',
    { action: 'grab', keys: ['KeyE'], label: 'Hold near rock: grab and anchor (currents cannot push you)', type: 'hold' },
    { action: 'tug', keys: ['KeyA', 'KeyD'], label: 'Strong current: hold E and tap A D A D to pull free', type: 'alternate' },
    'Body and gear',
    { action: 'interact', keys: ['KeyE'], label: 'Tap: pick up a tank, fossil or treasure, or catch a glowing creature', type: 'press' },
    { action: 'measure', keys: ['KeyT'], label: 'Hold: measure a creature with the tape', type: 'hold' },
    { action: 'flashlight', keys: ['KeyF'], label: 'Flashlight on / off', type: 'press' },
    { action: 'lantern', keys: ['KeyL'], label: 'Hold the creature lantern out', type: 'press' },
    { action: 'clearMask', keys: ['KeyM'], label: 'Hold: tilt your head and blow out a flooded mask (costs air)', type: 'hold' },
    { action: 'ductTape', keys: ['Digit1', 'KeyX'], label: 'Duct tape a cut', type: 'press' },
    { action: 'flexTape', keys: ['Digit2'], label: 'Flex Tape a cut (stronger, never peels)', type: 'press' },
    { action: 'tank', keys: ['KeyG'], label: 'Drop your spare tank (lighter, more stamina), or pick a dropped one back up', type: 'press' },
    { action: 'waypoint', keys: ['KeyQ'], label: 'Drop a waypoint (then type its name, Enter saves)', type: 'press' },
    'Screens',
    { action: 'wrist', keys: ['Tab'], label: 'Hold or tap: wrist computer and hologram map', type: 'hold', owner: 'ui' },
    { action: 'wristPick', keys: ['BracketLeft', 'BracketRight'], label: 'Wrist up: pick a waypoint', type: 'press', owner: 'ui' },
    { action: 'wristRename', keys: ['KeyN'], label: 'Wrist up: rename the picked waypoint', type: 'press', owner: 'ui' },
    { action: 'wristSpin', keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], label: 'Wrist up: spin the hologram (or drag, wheel zooms)', type: 'hold', owner: 'ui' },
    { action: 'slate', keys: ['KeyJ'], label: 'Waterproof slate (logbook)', type: 'press', owner: 'ui' },
    { action: 'hud', keys: ['KeyH'], label: 'Hide or show the HUD', type: 'press' },
    { action: 'pause', keys: ['Escape'], label: 'Pause and settings', type: 'press' },
    'Camp',
    { action: 'station', keys: ['Digit1', 'Digit8'], label: '1 to 8: jump to a camp station (only in the camp)', type: 'press', owner: 'ui' },
    { action: 'confirm', keys: ['Enter'], label: 'Menus: the main action (dive, resume, dive again)', type: 'press', owner: 'ui' }
  ];

  function bindInput() {
    document.addEventListener('pointerlockchange', function () {
      locked = document.pointerLockElement === canvas();
      if (locked) { lockOK = true; TU.emit('ui:hideHint', {}); }
      if (!locked && TU.state.is('dive') && !ignoreUnlock) TU.game.pause();
      ignoreUnlock = false;
    });
    document.addEventListener('pointerlockerror', function () { lockOK = false; TU.emit('ui:hint', { text: 'Mouse lock was blocked. Hold the mouse button and drag to look.' }); });
    canvas().addEventListener('mousedown', function () { if (!TU.state.is('dive')) return; if (!locked) { dragging = true; if (lockOK) requestLock(); } });
    window.addEventListener('mouseup', function () { dragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!TU.state.is('dive')) return;
      if (locked || dragging) {
        var k = 0.0022 * cfg.swim.sens;
        P.tYaw -= (e.movementX || 0) * k; P.tPitch -= (e.movementY || 0) * k;
        P.tPitch = clamp(P.tPitch, -cfg.swim.lookLimit, cfg.swim.lookLimit);
      }
    });
    window.addEventListener('keydown', function (e) {
      var inDive = TU.state.is('dive');
      if (inDive && GAME_KEYS[e.code]) e.preventDefault();
      keys[e.code] = true;
      if (e.repeat || !inDive) return;
      press(e.code);
      // Esc pauses. If the mouse is locked the browser also releases it; the state change
      // handler below marks that unlock as expected so it does not pause twice.
      if (e.code === 'Escape') TU.game.pause();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; if (e.code === 'KeyE') eUsed = false; });
    window.addEventListener('blur', function () { for (var k in keys) keys[k] = false; });
    document.addEventListener('visibilitychange', function () { if (document.hidden && TU.state.is('dive')) TU.game.pause(); });
    TU.on('state:change', function (e) {
      if (e.to === 'dive') { if (!touch.on) requestLock(); if (canvas()) canvas().focus(); }
      else { releaseLock(); for (var k in keys) keys[k] = false; }
    });
  }
  // One key press (not a hold). Also used by tests through TU.player.debug.press(code).
  function press(code) {
    if (P.mode === 'ragdoll') return;
    if (code === 'KeyF') toggleFlash();
    else if (code === 'KeyQ') dropWaypoint();
    else if (code === 'KeyH') TU.emit('ui:toggleHud', {});
    else if (code === 'KeyL') toggleLantern();
    else if (code === 'Digit1' || code === 'KeyX') applyTape('duct');
    else if (code === 'Digit2') applyTape('flex');
    else if (code === 'KeyG') { if (!pickUpTank(true)) dropTank(); }
    else if (code === 'KeyE') interact();
    if (code === 'KeyA' || code === 'KeyD') alternate(code);
  }
  // Alternating A / D: the current tug of war and wiggling out of a squeeze.
  function alternate(code) {
    if (tug.active) {
      if (tug.last !== code) { tug.value = clamp(tug.value + C.current.tugGain * (0.6 + 0.4 * clamp(P.stamina / 40, 0, 1)), 0, 1); P.anim.jolt = 1; }
      tug.last = code;
    } else if (P.mode === 'squeeze') {
      if (squeezeS.last !== code) { squeezeS.stuck = Math.max(0, squeezeS.stuck - C.squeeze.wiggle); squeezeS.wiggle = code === 'KeyA' ? -1 : 1; tmpV.copy(P.fwd).multiplyScalar(C.squeeze.pop * (keys.KeyW ? 1 : 0.4)); P.vel.add(tmpV); }
      squeezeS.last = code;
    }
  }

  // E tap: pick up a dropped tank, a fossil or treasure, or catch a glowing creature in your light.
  // Holding E on rock grabs it (only if the tap did nothing, so the two never fight).
  var eUsed = false;
  var CATCH_WHY = { not_glowing: 'It does not glow. Measure it instead (hold T).', fleeing: 'Too fast. It got away.', full: 'The lantern is full.', no_lantern: 'You need a lantern to catch it. Buy one at camp.', too_far: 'Too far. Get closer.', bit: 'That was not a light. That was a mouth.', gone: '' };
  function interact() {
    eUsed = false;
    var CR = TU.creatures;
    if (pickUpTank(true) != null) { eUsed = true; return; }
    var lit = typeof CR.nearestInView === 'function' ? CR.nearestInView(2.4, 0.85, { catchable: true }) : null;
    if (lit && lit.id != null) {
      var res = CR.catch(lit.id) || {};
      eUsed = true;
      if (!res.ok) { var why = CATCH_WHY[res.reason]; if (why) msg(why, 2); TU.emit('player:catchFail', { reason: res.reason || null, speciesId: res.speciesId || null }); }
      else { P.anim.jolt = 1; if (!P.lanternOut && TU.player.inventory.lantern) toggleLantern(true); }
      return;
    }
    var f = typeof CR.findNearest === 'function' ? CR.findNearest(2.5, 0.75) : null;
    if (f && f.id != null && typeof CR.pickup === 'function') {
      var pr = CR.pickup(f.id) || {};
      eUsed = true;
      if (pr.ok) { P.anim.jolt = 1; TU.player.inventory.items.push({ id: pr.id, kind: pr.kind, name: pr.name, value: pr.value }); }
      else if (pr.reason === 'too_far') msg('Too far. Get closer.', 1.6);
      return;
    }
    var other = typeof CR.nearestInView === 'function' ? CR.nearestInView(2.4, 0.9) : null;
    if (other && other.id != null) { eUsed = true; msg(CATCH_WHY.not_glowing, 2); }
  }

  // Rough touch controls (a bonus; the game is built for keyboard and mouse).
  TU.css('player', [
    '#pl-touch{position:fixed;inset:0;display:none;z-index:3;pointer-events:none}',
    '#pl-touch.pl-on{display:block}',
    '#pl-touch .pl-stick{position:absolute;left:calc(var(--gx) + 10px);bottom:calc(var(--gb) + 120px);width:120px;height:120px;border:1px solid var(--line);border-radius:50%;pointer-events:auto}',
    '#pl-touch .pl-stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(79,242,208,.2);border:1px solid var(--hud-dim)}',
    '#pl-touch .pl-tb{position:absolute;right:calc(var(--gr) + 10px);width:56px;height:56px;border:1px solid var(--line);border-radius:50%;pointer-events:auto;font-family:var(--mono);font-size:11px;color:var(--hud);display:flex;align-items:center;justify-content:center;background:rgba(2,10,12,.5)}',
    // The current tug of war bar (a small fallback; agent D can draw a nicer one from the player:tug event).
    '#pl-tug{position:fixed;left:50%;bottom:calc(var(--gb) + 22%);transform:translateX(-50%);width:min(360px,calc(100vw - 32px));z-index:3;pointer-events:none;display:none;font-family:var(--mono);color:var(--hud);text-align:center;text-shadow:0 0 8px rgba(79,242,208,.5)}',
    '#pl-tug.pl-on{display:block}',
    '#pl-tug .pl-tug-t{font-size:13px;letter-spacing:.08em;margin-bottom:8px}',
    '#pl-tug .pl-tug-k{font-size:11px;color:var(--ink-dim);margin-top:6px}',
    '#pl-tug .pl-tug-bar{height:10px;border:1px solid var(--hud-dim);border-radius:6px;background:rgba(2,10,12,.55);overflow:hidden;position:relative}',
    '#pl-tug .pl-tug-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--bad),var(--warn) 40%,var(--hud));transition:width .08s linear}'
  ].join('\n'));
  function enableTouch() {
    if (touch.on) return;
    touch.on = true;
    var root = TU.el('div', { id: 'pl-touch', className: 'pl-on', html: '<div class="pl-stick" id="pl-stick"><i id="pl-knob"></i></div><div class="pl-tb" id="pl-up" style="bottom:calc(var(--gb) + 250px)">UP</div><div class="pl-tb" id="pl-down" style="bottom:calc(var(--gb) + 180px)">DOWN</div><div class="pl-tb" id="pl-light" style="bottom:calc(var(--gb) + 110px)">LIGHT</div><div class="pl-tb" id="pl-wp" style="bottom:calc(var(--gb) + 40px)">WP</div>' });
    var st = TU.$('pl-stick'), knob = TU.$('pl-knob');
    st.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; touch.stickId = t.identifier; var r = st.getBoundingClientRect(); touch.sx = r.left + r.width / 2; touch.sy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === touch.stickId) { var dx = clamp((t.clientX - touch.sx) / 50, -1, 1), dy = clamp((t.clientY - touch.sy) / 50, -1, 1); touch.mx = dx; touch.my = -dy; knob.style.transform = 'translate(' + dx * 36 + 'px,' + dy * 36 + 'px)'; }
        else if (t.identifier === touch.lookId) { P.tYaw -= (t.clientX - touch.lx) * 0.005; P.tPitch = clamp(P.tPitch - (t.clientY - touch.ly) * 0.005, -cfg.swim.lookLimit, cfg.swim.lookLimit); touch.lx = t.clientX; touch.ly = t.clientY; }
      }
    }, { passive: false });
    window.addEventListener('touchend', function (e) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; if (t.identifier === touch.stickId) { touch.stickId = null; touch.mx = touch.my = 0; knob.style.transform = ''; } if (t.identifier === touch.lookId) touch.lookId = null; } });
    canvas().addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; } e.preventDefault(); }, { passive: false });
    function hold(id, key) { var el = TU.$(id); el.addEventListener('touchstart', function (e) { touch[key] = true; e.preventDefault(); }, { passive: false }); el.addEventListener('touchend', function () { touch[key] = false; }); }
    hold('pl-up', 'up'); hold('pl-down', 'down');
    TU.$('pl-light').addEventListener('touchstart', function (e) { toggleFlash(); e.preventDefault(); }, { passive: false });
    TU.$('pl-wp').addEventListener('touchstart', function (e) { dropWaypoint(); e.preventDefault(); }, { passive: false });
    return root;
  }

  // Tug of war bar (fallback DOM, owned by the player: #pl-tug).
  var tugEl = null, tugFill = null;
  function showTug(v) {
    if (!tugEl) {
      tugEl = TU.el('div', { id: 'pl-tug', html: '<div class="pl-tug-t">STRONG CURRENT. HOLD ON.</div><div class="pl-tug-bar"><i id="pl-tug-fill"></i></div><div class="pl-tug-k">Hold E on the rock. Tap A D A D to pull yourself out.</div>' });
      tugFill = TU.$('pl-tug-fill');
    }
    tugEl.classList.add('pl-on'); tugFill.style.width = (v * 100).toFixed(1) + '%';
  }
  function hideTug() { if (tugEl) tugEl.classList.remove('pl-on'); }

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */
  function msg(text, dur) { TU.emit('ui:msg', { text: text, dur: dur || 2.5 }); }
  function toggleFlash() {
    if (P.battery <= 0) { P.flashOn = false; TU.emit('player:light', { on: false, reason: 'empty' }); return; }
    P.flashOn = !P.flashOn; TU.emit('player:light', { on: P.flashOn, reason: 'toggle' });
  }
  function toggleLantern(force) {
    var inv = TU.player.inventory;
    if (!inv.lantern && !lanternApiLevel()) { if (force !== false) msg('No lantern. Buy one at camp.', 2); P.lanternOut = false; return; }
    P.lanternOut = force != null ? !!force : !P.lanternOut;
    TU.emit('player:lantern', { out: P.lanternOut });
  }
  // How bright the creature lantern is (0..~5). Uses agent B's TU.creatures.lanternLight() when it exists.
  function lanternApiLevel() {
    if (typeof TU.creatures.lanternLight !== 'function') return 0;
    try {
      var v = TU.creatures.lanternLight();
      if (typeof v === 'number') return v;
      if (v && (typeof v.brightness === 'number' || typeof v.intensity === 'number')) {
        if (v.color != null && lanternLight && (v.brightness || 0) > 0) { lanternLight.color.set(v.color); P.lanternColor = lanternLight.color; }
        run.lanternRange = v.range || null;
        return typeof v.brightness === 'number' ? v.brightness : v.intensity * 5;
      }
    } catch (e) { }
    return 0;
  }
  function lanternLevel() {
    var api = lanternApiLevel(); if (api > 0) return api;
    var inv = TU.player.inventory; if (!inv.lantern) return 0;
    var sum = 0, sp = TU.creatures.species || {};
    inv.lantern.creatures.forEach(function (id) { sum += (sp[id] && sp[id].brightness) || 1; });
    return sum;
  }
  function dropWaypoint(name) {
    if (waypoints.length >= cfg.waypoints.max) return null;
    P.wpCount++;
    name = name || ('WP ' + P.wpCount);
    var grp = new T.Group();
    var orb = new T.Mesh(new T.SphereGeometry(0.07, 12, 10), new T.MeshBasicMaterial({ color: 0x9ffff0, toneMapped: false }));
    var halo = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0x4FF2D0, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.setScalar(1.1);
    var lbl = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.label(name), transparent: true, depthWrite: false, fog: false }));
    lbl.scale.set(0.9, 0.28, 1); lbl.position.y = 0.42;
    grp.add(orb, halo, lbl);
    var fwd = new T.Vector3(0, 0, -1).applyQuaternion(TU.camera.quaternion);
    grp.position.copy(P.pos).addScaledVector(fwd, cfg.waypoints.dropAhead);
    TU.scene.add(grp);
    var light = wpLights[(P.wpCount - 1) % wpLights.length]; light.position.copy(grp.position); light.intensity = 0.9;
    var wp = { index: P.wpCount, name: name, pos: grp.position.clone(), group: grp, halo: halo, label: lbl, ph: Math.random() * 6, light: light, depth: Math.max(0, -grp.position.y) };
    waypoints.push(wp);
    TU.emit('waypoint:placed', { index: wp.index, name: name, pos: wp.pos.clone(), depth: wp.depth });
    return wp;
  }
  // Give a waypoint a new name: rebuilds its glowing label in the cave (the HUD, slate and hologram read wp.name).
  function renameWaypoint(index, name) {
    for (var i = 0; i < waypoints.length; i++) {
      var w = waypoints[i]; if (w.index !== index) continue;
      name = String(name == null ? '' : name).slice(0, 24) || w.name;
      w.name = name;
      if (w.label) { var old = w.label.material.map; w.label.material.map = TU.tex.label(name); w.label.material.needsUpdate = true; if (old) old.dispose(); }
      return true;
    }
    return false;
  }
  function ropeLength() {
    var L = 0, p = rope.pts;
    for (var i = 1; i < p.length; i++) L += p[i].distanceTo(p[i - 1]);
    if (p.length) L += rope.reel.distanceTo(p[p.length - 1]);
    return L;
  }
  function teleport(pos, yaw, pitch) {
    P.pos.copy(pos); P.vel.set(0, 0, 0);
    if (yaw != null) P.yaw = P.tYaw = yaw;
    if (pitch != null) P.pitch = P.tPitch = pitch;
    lampDir.set(0, 0, -1).applyEuler(new T.Euler(P.pitch, P.yaw, 0, 'YXZ'));
    hint = {};
    P.env = TU.cave.nearestPoint(P.pos, hint);
    land.on = false; land.grounded = false; climb.active = false; grab.on = false; tug.active = false; hideTug();
    if (rag.active) endRagdoll();
    computeBasis();
    // Keep the rope from stretching through rock: add a point at the reel on your hip
    // (not at your eyes, or the line would pass straight through the camera).
    rope.reel.copy(P.pos).addScaledVector(P.up, -0.3).addScaledVector(P.fwd, -0.3).addScaledVector(P.right, -0.1);
    rope.pts.push(rope.reel.clone());
    placeCamera(0);
  }
  function look(yaw, pitch) { P.yaw = P.tYaw = yaw; P.pitch = P.tPitch = pitch; lampDir.set(0, 0, -1).applyEuler(new T.Euler(pitch, yaw, 0, 'YXZ')); computeBasis(); placeCamera(0); }
  // Debug and tests: set the active tank to bar. allTanks also empties every other tank.
  function setAir(bar, allTanks) {
    var tk = P.tanks[P.activeTank]; tk.bar = clamp(bar, 0, tk.max);
    if (allTanks) for (var i = 0; i < P.tanks.length; i++) if (i !== P.activeTank) P.tanks[i].bar = 0;
    syncAir();
  }
  function syncAir() {
    var tot = 0; for (var i = 0; i < P.tanks.length; i++) if (!P.tanks[i].dropped) tot += P.tanks[i].bar;
    P.airTotal = tot; P.air = P.tanks[P.activeTank].bar; P.airMax = P.tanks[P.activeTank].max;
  }

  // T: put your spare tank down on the floor. You get lighter (more stamina, faster kicks).
  function dropTank() {
    var idx = -1;
    for (var i = 0; i < P.tanks.length; i++) if (i !== P.activeTank && !P.tanks[i].dropped) { idx = i; break; }
    if (idx < 0) { msg('No spare tank to drop.', 2); return null; }
    var tk = P.tanks[idx], m = makeTankMesh();
    tk.dropped = true;
    tk.pos = P.pos.clone().addScaledVector(P.fwd, 0.5).addScaledVector(P.up, -0.35);
    m.position.copy(tk.pos); m.rotation.y = P.yaw + 0.4; TU.scene.add(m);
    m.userData.vy = 0; m.userData.rest = false; m.userData.hint = {};
    droppedMeshes[idx] = m;
    applyWeight();
    P.stamina = clamp(P.stamina + C.tank.dropStamina, 0, P.staminaMax);
    syncAir();
    TU.emit('player:tankDrop', { index: idx, pos: tk.pos.clone(), bar: tk.bar });
    msg('TANK ' + (idx + 1) + ' DROPPED. Lighter now. Come back for it.', 3);
    return idx;
  }
  // G: pick up the nearest dropped tank within reach.
  function pickUpTank(quiet) {
    var best = -1, bd = C.tank.pickupDist;
    for (var i = 0; i < P.tanks.length; i++) {
      var tk = P.tanks[i]; if (!tk.dropped || !tk.pos) continue;
      var d = tk.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { if (!quiet && P.tanks.some(function (t) { return t.dropped; })) msg('Too far from your tank.', 1.6); return null; }
    var t2 = P.tanks[best]; t2.dropped = false; t2.pos = null;
    if (droppedMeshes[best]) { TU.scene.remove(droppedMeshes[best]); droppedMeshes[best] = null; }
    applyWeight();
    P.stamina = Math.min(P.stamina, P.staminaMax);
    if (P.tanks[P.activeTank].bar <= 0 && t2.bar > 0) { var from = P.activeTank; P.activeTank = best; TU.emit('player:tankSwitch', { from: from, to: best }); }
    syncAir();
    TU.emit('player:tankPickup', { index: best, bar: t2.bar });
    msg('TANK ' + (best + 1) + ' PICKED UP. ' + Math.round(t2.bar) + ' BAR.', 2.5);
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Injuries                                                            */
  /* ------------------------------------------------------------------ */
  function cutPos(out) { return out.copy(TU.camera.position).addScaledVector(P.fwd, 0.38).addScaledVector(P.up, -0.24).addScaledVector(P.right, -0.16); }
  // type: 'cut' | 'sprain' | 'break' | 'maim'. Returns the injury record.
  function addInjury(type, sev, source) {
    sev = clamp(sev == null ? 0.5 : sev, 0.05, 1);
    var inj = { type: type, severity: sev, taped: false, at: run.t, source: source || null };
    if (type === 'cut') {
      inj.tape = null; inj.side = rand() < 0.6 ? 'left' : 'right';
      P.injuries.push(inj);
      P.panic = clamp(P.panic + C.panic.cut + sev * C.panic.cutScale, 0, 100);
      P.bloodMask = Math.max(P.bloodMask, 0.45 + sev * 0.55);
      P.health = Math.max(C.injury.minHealth, P.health - (4 + sev * 10));
      P.hitFlash = Math.max(P.hitFlash, 0.5 + sev * 0.5);
      TU.emit('player:cut', { severity: sev, pos: cutPos(new T.Vector3()), injury: inj });
      if (TU.fx.spawnBlood) TU.fx.spawnBlood(Math.round(14 + sev * 30), { pos: cutPos(tmpV3), burst: true });
      if (!run.cutHinted && (TU.player.inventory.tape > 0 || TU.player.inventory.flexTape > 0)) { run.cutHinted = true; TU.emit('ui:hint', { text: 'You are bleeding. Press 1 for duct tape' + (TU.player.inventory.flexTape > 0 ? ', 2 for Flex Tape.' : '.'), dur: 5 }); }
    } else {
      if (type === 'maim') { inj.side = rand() < 0.5 ? 'left' : 'right'; P.maimed = P.maimed || inj.side; }
      if (type === 'sprain' && P.injuries.some(function (j) { return j.type === 'sprain' && !j.healed; })) { inj = null; }
      if (inj) P.injuries.push(inj);
      P.health = Math.max(C.injury.minHealth, P.health - ({ sprain: 8, break: 18, maim: 28 }[type] || 5) * (0.5 + sev));
      P.panic = clamp(P.panic + 10 + sev * 20, 0, 100);
    }
    if (inj) TU.emit('player:injury', { type: type, severity: sev, side: inj.side || null, source: source || null });
    return inj;
  }
  // 1 / 2: tape the worst open cut. Starts a hand animation; the tape goes on when it finishes.
  function applyTape(kind) {
    if (tape.t >= 0) return false;
    var inv = TU.player.inventory, have = kind === 'flex' ? inv.flexTape : inv.tape;
    var worst = null;
    P.injuries.forEach(function (j) { if (j.type === 'cut' && !j.taped && (!worst || j.severity > worst.severity)) worst = j; });
    if (!worst) { msg('No open cuts to tape.', 1.8); return false; }
    if (!(have > 0)) { msg(kind === 'flex' ? 'No Flex Tape left.' : 'No duct tape left.', 1.8); return false; }
    tape.t = 0; tape.kind = kind; tape.cut = worst;
    TU.emit('player:tapeStart', { kind: kind });
    return true;
  }
  function finishTape() {
    var inv = TU.player.inventory, j = tape.cut;
    if (j && !j.taped) {
      j.taped = true; j.tape = tape.kind;
      j.peelAt = tape.kind === 'duct' ? run.t + C.injury.ductPeel[0] + rand() * (C.injury.ductPeel[1] - C.injury.ductPeel[0]) : null;
      if (tape.kind === 'flex') inv.flexTape--; else inv.tape--;
      P.panic = clamp(P.panic - 8, 0, 100);
      TU.emit('player:tape', { kind: tape.kind, injury: j, left: tape.kind === 'flex' ? inv.flexTape : inv.tape });
      msg(tape.kind === 'flex' ? 'FLEX TAPE ON. Bleeding stopped.' : 'DUCT TAPE ON. It might not hold in the water.', 2.5);
    }
    tape.t = -1; tape.kind = null; tape.cut = null;
  }
  function injuryEffects(dt) {
    var bleed = 0, kick = 1, regen = 1, sprainOn = false;
    for (var i = 0; i < P.injuries.length; i++) {
      var j = P.injuries[i];
      if (j.type === 'cut') {
        if (j.taped && j.peelAt != null && run.t > j.peelAt) { j.taped = false; j.tape = null; j.peelAt = null; j.severity *= 0.5; msg('The duct tape peeled off. Bleeding again.', 3); TU.emit('player:tapePeel', { injury: j }); }
        if (!j.taped) bleed += j.severity;
      } else if (j.type === 'sprain' && !j.healed) { if (run.t - j.at > C.injury.sprainHeal) j.healed = true; else { kick *= 0.78; sprainOn = true; } }
      else if (j.type === 'break') { kick *= 0.65; regen *= 0.6; }
      else if (j.type === 'maim') { kick *= 0.78; }
    }
    P.bleed = bleed;
    P.kickMul = kick; run.injRegen = regen; run.sprained = sprainOn;
    // Bleeding out: health stops at minHealth, but if the bleeding stays untreated there for
    // injury.bleedOut seconds the run ends. Tape stops it (1 / X duct tape, 2 Flex Tape).
    var tut = TU.run && TU.run.tutorial;
    if (bleed > 0 && P.health <= C.injury.minHealth + 0.01 && !tut) {
      P.bleedOut += dt;
      if (!run.bleedHinted) { run.bleedHinted = true; TU.emit('ui:hint', { text: 'You are bleeding out. Tape the cut NOW: 1 or X duct tape, 2 Flex Tape.', dur: 6 }); }
      if (P.bleedOut >= C.injury.bleedOut && !run.bledSent) { run.bledSent = true; TU.emit('player:bledOut', { pos: P.pos.clone(), depth: P.depth }); }
    } else P.bleedOut = Math.max(0, P.bleedOut - dt * 2);
    if (bleed > 0) {
      P.health = Math.max(C.injury.minHealth, P.health - bleed * C.injury.bleedHealth * dt);
      P.panic = clamp(P.panic + bleed * C.injury.bleedPanic * dt, 0, 100);
      if (TU.fx.spawnBlood && rand() < dt * (2 + bleed * 6) && P.inWater) TU.fx.spawnBlood(1 + Math.floor(bleed * 2), { pos: cutPos(tmpV3) });
      P.bloodMask = Math.max(P.bloodMask, Math.min(0.55, bleed * 0.4));
    }
    P.bloodMask = Math.max(0, P.bloodMask - dt * (bleed > 0 ? 0.02 : 0.06));
    if (tape.t >= 0) { tape.t += dt / C.injury.tapeTime; if (tape.t >= 1) finishTape(); }
    P.anim.tape = tape.t; P.anim.tapeKind = tape.kind;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation step                                                     */
  /* ------------------------------------------------------------------ */
  function computeBasis() {
    P.fwd.set(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
    P.right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    P.up.crossVectors(P.right, P.fwd);
  }
  function k(code) { return !!keys[code]; }
  function setMode(m) { if (P.mode !== m) { var from = P.mode; P.mode = m; TU.emit('player:mode', { from: from, to: m }); } }

  // Is this a place where you stand on dry rock (not just your head out of a pool)?
  function landHere(env, pos) {
    if (!env.dry) return false;
    if (env.surfaceY == null) return true;
    return env.floorY > env.surfaceY - 0.05 || pos.y > env.surfaceY + 0.75;
  }

  function step(dt) {
    run.t += dt;
    var A = cfg.air, SW = cfg.swim, PN = cfg.panic, BR = cfg.breath;
    run.demo = TU.save.data.settings.fastDrain ? A.fastDrainMul : 1;
    var demo = run.demo;
    // ---- look ----
    var ls = 1 - Math.exp(-dt * SW.smooth);
    P.yaw += (P.tYaw - P.yaw) * ls; P.pitch += (P.tPitch - P.pitch) * ls;
    computeBasis();
    var fwdV = P.fwd, rightV = P.right, upV = P.up;
    var env = P.env;
    // ---- intent ----
    var control = P.mode !== 'ragdoll' && !climb.active;
    var fb = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + (touch.on ? touch.my : 0);
    var lr = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + (touch.on ? touch.mx : 0);
    var ud = (k('Space') || touch.up ? 1 : 0) - (k('KeyC') || k('ControlLeft') || k('ControlRight') || touch.down ? 1 : 0);
    if (!control) fb = lr = ud = 0;
    if (tug.active) lr = 0;                         // A / D are busy with the tug of war
    if (P.maimed && (fb || lr)) lr += P.maimed === 'left' ? -0.12 : 0.12; // a weak side pulls you off line
    P.slow = k('KeyR') && control;
    P.maskClearing = k('KeyM') && P.maskWater > 0.01 && control;
    var moving = Math.abs(fb) + Math.abs(lr) + Math.abs(ud) > 0.05;
    var wantSprint = (k('ShiftLeft') || k('ShiftRight')) && moving && !P.slow;
    if (P.stamina < cfg.stamina.lockBelow) run.sprintLock = true; if (P.stamina > cfg.stamina.unlockAbove) run.sprintLock = false;
    var sprint = wantSprint && !run.sprintLock;
    P.sprint = sprint;
    // ---- mode ----
    if (rag.active) setMode('ragdoll');
    else if (dbg.mode === 'walk' || dbg.mode === 'crawlDry') land.on = true;
    else if (!land.on && !climb.active && landHere(env, P.pos)) { land.on = true; land.grounded = false; land.peakY = P.pos.y; land.eye = C.walk.eye; }
    P.dry = land.on || climb.active;
    var squeeze = false;
    if (!P.dry && !rag.active) {
      var tight = env.radius != null ? env.radius : 3;
      var tuck = k('KeyZ') && control;
      if (dbg.mode === 'squeeze' || env.pieceType === 'squeeze' || tight < C.squeeze.radius || (tuck && tight < C.squeeze.tuckRadius)) { setMode('squeeze'); squeeze = true; }
      else if (dbg.mode === 'crawl' || (dbg.mode == null && tight < C.crawl.radius && P.pos.y - env.floorY < C.crawl.floorDist && !P.surfaced)) setMode('crawl');
      else setMode('swim');
    }
    if (P.mode !== 'squeeze') { squeezeS.stuck = Math.max(0, squeezeS.stuck - dt); }
    squeezeS.wiggle *= Math.exp(-dt * 4);
    P.stuck = squeezeS.stuck;

    // ---- the current at your position (water flow, plus a debug override) ----
    cur.set(0, 0, 0);
    if (env.current) cur.copy(env.current);
    if (flow.forced && flow.forcedT > 0) { cur.add(flow.forced); flow.forcedT -= dt; if (flow.forcedT <= 0) flow.forced = null; }
    if (flow.shelter > 0) { flow.shelter -= dt; cur.multiplyScalar(0.12); }
    if (P.dry || P.surfaced) cur.multiplyScalar(P.surfaced ? 0.5 : 0);
    var curSpeed = cur.length();
    P.currentSpeed = curSpeed;

    // ---- grab the rock (hold E near a wall) ----
    grab.cooldown = Math.max(0, grab.cooldown - dt);
    var wantGrab = k('KeyE') && !eUsed && control && !P.dry && grab.cooldown <= 0;
    if (wantGrab && !grab.on) {
      var wd = env.wallDist != null ? env.wallDist : 9;
      if (wd < C.grab.reach && env.normal) {
        grab.on = true; grab.normal.copy(env.normal).multiplyScalar(-1).normalize(); // into the water, away from the rock
        grab.point.copy(P.pos).addScaledVector(env.normal, Math.max(0.05, wd));
        TU.emit('player:grab', { on: true, point: grab.point.clone() });
      }
    } else if (!wantGrab && grab.on) { grab.on = false; TU.emit('player:grab', { on: false }); }
    P.grab = grab.on;

    // ---- strong current: panic, the tug of war ----
    var caught = curSpeed > C.current.caught && !P.dry;
    P.caught = caught;
    if (caught !== flow.caughtWas) { flow.caughtWas = caught; TU.emit('player:current', { caught: caught, strength: curSpeed }); if (caught && !run.caughtHinted && !grab.on) { run.caughtHinted = true; TU.emit('ui:hint', { text: 'Caught in a current! Hold E on the rock.', dur: 4 }); } }
    if (caught && grab.on) {
      if (!tug.active) { tug.active = true; tug.value = 0.5; tug.last = null; tug.t = 0; TU.emit('player:tug', { active: true, value: tug.value }); }
      tug.t += dt;
      var won = tug.value >= 1; // check before the current pulls the bar back down
      tug.value -= C.current.tugDecay * (curSpeed / C.current.caught) * dt;
      P.stamina = Math.max(0, P.stamina - C.grab.drain * dt);
      if (won) endTug(true, cur, curSpeed);
      else if (tug.value <= 0 || P.stamina <= 0) endTug(false, cur, curSpeed);
      else { showTug(tug.value); if ((tug.t * 10 | 0) !== ((tug.t - dt) * 10 | 0)) TU.emit('player:tug', { active: true, value: tug.value }); }
    } else if (tug.active) { tug.active = false; hideTug(); TU.emit('player:tug', { active: false, value: tug.value }); }
    P.tug = tug.active ? tug.value : null;
    P.anim.tug = tug.active;

    acc.set(0, 0, 0);
    before.copy(P.pos);
    var hit = null;
    if (rag.active && rag.dry) hit = stepDry(dt, 0, 0, false, false);
    else if (P.dry) hit = stepDry(dt, fb, lr, sprint, ud > 0);
    else hit = stepWater(dt, fb, lr, ud, moving, sprint, squeeze, curSpeed);
    env = P.env;
    var moved = before.distanceTo(P.pos);
    P.dist += moved; P.speed = moved / Math.max(dt, 1e-4);
    if (hit && hit.blocked === 'exit' && run.t > 2 && !run.exitWarned) { run.exitWarned = true; TU.emit('player:blocked', { kind: 'exit' }); }

    // ---- surface and depth ----
    var wasSurfaced = P.surfaced;
    P.surfaceY = env.surfaceY;
    P.surfaced = !P.dry && P.surfaceY != null && P.pos.y > P.surfaceY + 0.02;
    if (P.surfaced && !wasSurfaced) TU.emit('player:surfaced', { pos: P.pos.clone(), surfaceY: P.surfaceY });
    if (!P.surfaced && wasSurfaced && !P.dry) TU.emit('player:submerged', { pos: P.pos.clone() });
    P.inWater = !P.dry && (!env.dry || P.surfaced);
    var breathingAir = P.surfaced || P.dry;
    P.depth = Math.max(0, cfg.world.surfaceY - P.pos.y);
    if (P.surfaced) P.depth = Math.max(0, cfg.world.surfaceY - P.surfaceY);
    if (P.dry) P.depth = Math.max(0, cfg.world.surfaceY - (env.floorY != null ? env.floorY : P.pos.y));
    P.maxDepth = Math.max(P.maxDepth, P.depth);
    P.zone = U.zoneOfDepth(P.depth); P.area = env.area;
    var temp = env.temperature != null ? env.temperature : 15;
    P.cold = U.damp(P.cold, clamp((20 - temp) / 10, 0, 1), 0.5, dt);
    P.warm = temp >= C.cold.warmAt || nearWarm();
    var narc = P.narcosis = smooth(cfg.narcosis.start, cfg.narcosis.full, P.depth);
    if (P.depth > cfg.narcosis.msgDepth && !run.narcWarned) { run.narcWarned = true; TU.emit('player:narcosis', { depth: P.depth }); }
    // ---- air ----
    var inflating = k('KeyB') && control && !P.dry, deflating = k('KeyV') && control && !P.dry;
    var rate = A.baseRate * (sprint ? A.sprintMul : 1) * (1 + P.panic / 100 * A.panicMul) * (P.slow ? A.slowMul : 1) * (1 + P.depth / A.depthPer) * demo;
    if (inflating && !P.surfaced) rate += A.inflateCost * demo;
    if (deflating && !P.surfaced && P.vestAir > 0) rate -= A.deflateRefund;
    if (P.maskClearing && P.inWater && !P.surfaced) rate += C.mask.clearAir * demo;
    if (breathingAir) rate = -A.refillRate;
    P.airRate = rate;
    breatheFromTanks(rate * dt);
    // ---- stamina (depth, weight, cold, warmth, panic, injuries) ----
    var depthLoss = 1 - C.depth.staminaLoss * smooth(C.depth.from, C.depth.to, P.depth);
    P.staminaMax = run.weightStaminaMax * depthLoss * (P.maimed ? 0.9 : 1);
    var regen = (breathingAir ? cfg.stamina.regenSurfaced : cfg.stamina.regen) * run.regenMul * (run.injRegen || 1) * (1 - P.panic / 200);
    if (sprint) P.stamina -= cfg.stamina.sprintDrain * dt;
    else if (P.mode === 'squeeze' && moving) P.stamina -= 3 * dt;
    else P.stamina += regen * dt;
    if (P.cold > 0.05 && !P.warm) P.stamina -= P.cold * C.cold.drain * dt;
    if (P.warm) P.stamina += C.cold.warmRegen * dt;
    if (P.panic > C.panic.highFrom) P.stamina -= (P.panic - C.panic.highFrom) * C.panic.staminaLoss * dt;
    P.stamina = clamp(P.stamina, 0, P.staminaMax);
    // ---- battery ----
    if (P.flashOn) { P.battery = clamp(P.battery - run.batteryDrain * dt * demo, 0, 100); if (P.battery <= 0) { P.flashOn = false; TU.emit('player:light', { on: false, reason: 'dead' }); onLightDied(); } }
    if (P.battery < cfg.light.lowAt && !run.lowLightWarned) { run.lowLightWarned = true; TU.emit('player:lowBattery', { battery: P.battery }); }
    if (shock.lightOff > 0) shock.lightOff -= dt;
    // ---- lantern ----
    P.lanternLevel = P.lanternOut ? lanternLevel() : 0;
    // ---- measuring tape (hold T): agent B's creatures.measureStep does the logbook part ----
    var measuring = k('KeyT') && control;
    if (typeof TU.creatures.measureStep === 'function' && (measuring || run.measuring)) {
      var mres = null; try { mres = TU.creatures.measureStep(dt, measuring); } catch (e) { mres = null; }
      P.measure = mres; run.measuring = measuring;
      if (mres && mres.state !== run.measureState) { run.measureState = mres.state; TU.emit('player:measure', { state: mres.state, progress: mres.progress || 0, speciesId: mres.speciesId || null, result: mres.result || null }); }
    } else if (!measuring) { P.measure = null; run.measureState = null; }
    P.anim.measure = measuring && TU.player.inventory.measuringTape !== false;
    P.daze = Math.max(0, (P.daze || 0) - dt);
    // ---- injuries and bleeding ----
    injuryEffects(dt);
    // ---- silt (visibility measured by fx.js last step) ----
    P.silt = TU.fx.siltDensity();
    // ---- quake and shock timers ----
    if (quake.t > 0) { quake.t -= dt; P.quake = quake.str * smooth(0, 0.6, quake.t); P.shake = Math.max(P.shake, 0.4 + quake.str * 0.8 * smooth(0, 0.5, quake.t)); P.panic = clamp(P.panic + quake.str * 3 * dt, 0, 100); } else P.quake = 0;
    if (shock.t > 0) shock.t = Math.max(0, shock.t - dt * 1.3);
    P.shock = shock.t;
    // ---- panic ----
    var bottom = TU.cave.features.bottom;
    var nearGlow = bottom ? P.pos.distanceTo(bottom.pos) < 14 : false;
    var lit = (P.flashOn && shock.lightOff <= 0) || P.lanternLevel > 0.3;
    run.darkT -= dt;
    if (run.darkT <= 0) { run.darkT = 0.25; run.glowNear = TU.creatures.nearCount(P.pos, cfg.panic.darkRadius || 8, { glowing: true }) > 0; }
    var dark = !lit && env.daylight < 0.02 && !run.glowNear && !breathingAir && !nearGlow;
    run.dark = dark;
    var dp = PN.calm;
    if (sprint) dp += PN.sprint;
    if (dark) dp += PN.dark;
    if (P.airTotal < A.lowAir) dp += PN.lowAir;
    if (P.silt > PN.siltPanicAt) dp += PN.silt;
    if (P.mode === 'squeeze') dp += PN.squeeze + squeezeS.stuck * 2;
    if (caught) dp += C.current.panic * (grab.on ? 0.5 : 1);
    else if (curSpeed > C.current.strong) dp += C.current.panic * 0.3;
    if (P.maskFlooded) dp += C.mask.panic;
    if (P.slow) dp += PN.slow;
    if (breathingAir) dp += PN.surfaced;
    P.panic = clamp(P.panic + dp * dt, 0, 100);
    if (dark && !run.darkHinted && TU.player.inventory.lantern && !P.lanternOut) { run.darkHinted = true; TU.emit('ui:hint', { text: 'It is dark. Press L to hold out your lantern.', dur: 4 }); }
    // ---- mask ----
    maskStep(dt, caught, cur, curSpeed);
    // ---- breathing cycle (sound events and bubbles) ----
    var br = run.breath;
    br.period = P.slow ? BR.slowPeriod : (breathingAir ? BR.surfacedPeriod : BR.period / (1 + P.panic / 100 * BR.panicSpeed)) * (sprint ? BR.sprintMul : 1);
    br.t += dt;
    var phase = br.t / br.period;
    var hasAir = P.airTotal > 0;
    if (br.ph === 0 && phase >= 0) { br.ph = 1; if (hasAir || breathingAir) TU.emit('player:inhale', { dur: br.period * BR.inhale, surfaced: breathingAir, panic: P.panic / 100 }); }
    if (br.ph === 1 && phase >= BR.inhale) {
      br.ph = 2;
      if (hasAir || breathingAir) {
        TU.emit('player:exhale', { dur: br.period * BR.exhale, surfaced: breathingAir, panic: P.panic / 100 });
        if (!breathingAir) TU.fx.spawnBubbles(10 + Math.floor(Math.random() * 8) + (sprint ? 8 : 0), { pos: mouthPos(tmpV2), right: rightV });
      }
    }
    if (br.ph === 2 && phase >= 1) { br.ph = 0; br.t = 0; }
    P.breathPhase = phase; P.breathStage = br.ph;
    if (inflating && !P.surfaced && Math.random() < dt * 6) TU.fx.spawnBubbles(1, { pos: mouthPos(tmpV2), right: rightV });
    if (P.maskClearing && P.inWater && Math.random() < dt * 30) TU.fx.spawnBubbles(2, { pos: tmpV2.copy(TU.camera.position).addScaledVector(upV, 0.08).addScaledVector(fwdV, 0.1), right: rightV });
    // ---- kick up silt near a silty floor ----
    if (env.siltiness > cfg.silt.minSiltiness && !P.surfaced && !P.dry) {
      var fd = P.pos.y - env.floorY, thr = cfg.silt.speedThreshold;
      if (fd < cfg.silt.floorRange && (P.speed > thr || sprint)) {
        var n = Math.ceil(((P.speed - thr * 0.8) * 70 + (sprint ? 90 : 0)) * dt * (cfg.silt.floorRange - fd) * (P.mode === 'crawl' ? C.crawl.silt : 1));
        if (n > 0) TU.fx.spawnSilt(n, { pos: P.pos, back: fwdV, vel: P.vel, floorY: env.floorY });
      }
    }
    if (P.silt > cfg.silt.outAt && !run.siltWas) { run.siltWas = true; P.siltOuts++; TU.emit('player:siltout', { silt: P.silt }); }
    if (P.silt < cfg.silt.clearAt && run.siltWas) { run.siltWas = false; TU.emit('player:siltclear', {}); }
    // ---- drowning (you hold less breath when deep) ----
    var drownS = A.drownSeconds * (1 - C.depth.breathLoss * smooth(30, 200, P.depth));
    if (!hasAir && !breathingAir) P.drown += dt; else P.drown = Math.max(0, P.drown - dt * 2);
    P.drownSeconds = drownS;
    if (P.drown > drownS && !run.drownSent) { run.drownSent = true; TU.emit('player:drown', { pos: P.pos.clone(), depth: P.depth }); }
    // ---- dropped tanks sink to the floor ----
    settleTanks(dt);
    // ---- rope breadcrumb ----
    var reel = rope.reel;
    // the reel sits on your hip: behind and below your eyes, so the line never cuts across your view
    if (P.dry) reel.set(P.pos.x - fwdV.x * 0.15, P.pos.y - Math.max(0.3, land.eye - 0.6), P.pos.z - fwdV.z * 0.15);
    else reel.copy(P.pos).addScaledVector(upV, -0.3).addScaledVector(fwdV, -0.3).addScaledVector(rightV, -0.1);
    var pts = rope.pts;
    if (pts.length >= 2 && reel.distanceTo(pts[pts.length - 2]) < cfg.rope.retractDist) pts.pop();
    else if (reel.distanceTo(pts[pts.length - 1]) >= cfg.rope.pointSpacing && pts.length < cfg.rope.maxPoints - 1) pts.push(reel.clone());
    // ---- animation hints for the hands ----
    var AN = P.anim;
    AN.intent = moving ? 1 : 0; AN.moveSpeed = P.speed;
    AN.inflate = inflating; AN.deflate = deflating; AN.wrist = P.wristRaised; AN.lantern = P.lanternOut; AN.maskClear = P.maskClearing;
    AN.grab = grab.on ? grab.point : null; AN.grabNormal = grab.on ? grab.normal : null;
    AN.squeezePush = P.mode === 'squeeze' && fb > 0 ? 1 : 0; AN.wiggle = squeezeS.wiggle;
    AN.ragdoll = rag.active; AN.shock = shock.t; AN.jolt = Math.max(0, AN.jolt - dt * 4);
    AN.climb = climb.active ? climb.t : -1;
    // ---- shake decay, camera and light ----
    P.shake = Math.max(0, P.shake - dt * 1.6); P.hitFlash = Math.max(0, P.hitFlash - dt * 2.2);
    placeCamera(dt);
  }

  // Water physics: kicks (or hand pulls), drag relative to the moving water, the vest, collisions.
  function stepWater(dt, fb, lr, ud, moving, sprint, squeeze, curSpeed) {
    var SW = cfg.swim, env = P.env;
    wish.set(0, 0, 0).addScaledVector(P.fwd, fb);
    if (!squeeze) wish.addScaledVector(P.right, lr * SW.strafe);
    wish.y += ud * SW.vertical;
    if (wish.lengthSq() > 0.01) wish.normalize(); else wish.set(0, 0, 0);
    if (P.surfaced && wish.y > 0) wish.y = 0;
    var crawl = P.mode === 'crawl';
    var interval = SW.interval * (sprint ? SW.sprintInterval : 1) * (P.slow ? SW.slowInterval : 1) / Math.max(0.6, P.kickMul);
    P.anim.kickInterval = interval;
    var staF = 0.55 + 0.45 * clamp(P.stamina / 35, 0, 1);
    if (crawl) {
      // Pulling with your hands: slower rhythm, strong grip, little silt.
      run.kickTimer = 0;
      var pint = C.crawl.interval * (sprint ? 0.75 : 1);
      P.anim.crawlInterval = pint;
      if (moving && wish.lengthSq() > 0) {
        run.pullTimer -= dt;
        if (run.pullTimer <= 0) { run.pullTimer = pint; P.kickPhase = 0; P.anim.pullCount++; TU.emit('player:pull', { strength: sprint ? 1.2 : 0.8 }); }
      } else run.pullTimer = 0;
      if (P.kickPhase >= 0) {
        P.kickPhase += dt / C.crawl.pullTime;
        acc.addScaledVector(wish, C.crawl.pull * run.swimMul * staF * Math.sin(Math.PI * clamp(P.kickPhase, 0, 1)) * (P.maimed ? 0.85 : 1));
        if (P.kickPhase >= 1) P.kickPhase = -1;
      }
      // stay close to the floor you are pulling on
      acc.y -= clamp(P.pos.y - env.floorY - 0.55, 0, 1) * 0.6;
    } else {
      run.pullTimer = 0;
      if (moving) {
        run.kickTimer -= dt;
        if (run.kickTimer <= 0) { P.kickPhase = 0; run.kickTimer = interval; P.anim.kickCount++; TU.emit('player:kick', { strength: sprint ? 1.3 : 0.8, sprint: sprint }); }
      } else run.kickTimer = 0;
      var squeezeF = squeeze ? SW.squeezeThrust * (1 - 0.8 * squeezeS.stuck) * (run.finSqueeze || 1) : 1;
      if (squeeze && fb > 0) { squeezeS.stuck = clamp(squeezeS.stuck + C.squeeze.stuckRate * dt * (0.6 + rand() * 0.8), 0, 1); }
      if (P.kickPhase >= 0) {
        P.kickPhase += dt / SW.kickTime;
        var f = Math.sin(Math.PI * clamp(P.kickPhase, 0, 1));
        acc.addScaledVector(wish, SW.kick * run.swimMul * P.kickMul * (sprint ? SW.sprintKick : 1) * staF * squeezeF * f);
        if (P.kickPhase >= 1) P.kickPhase = -1;
      }
      if (moving) acc.addScaledVector(wish, SW.hold * squeezeF);
    }
    // ---- buoyancy (vest) ----
    var inflating = k('KeyB') && !rag.active, deflating = k('KeyV') && !rag.active;
    if (inflating) P.vestAir = clamp(P.vestAir + cfg.vest.inflateRate * dt, 0, 1);
    if (deflating) P.vestAir = clamp(P.vestAir - cfg.vest.deflateRate * dt, 0, 1);
    if (P.surfaced) {
      acc.y += (P.surfaceY + SW.floatHeight - P.pos.y) * 4 - P.vel.y * 2.2; if (ud < 0) acc.y -= 2.5;
      tryClimbOut(fb);
    } else {
      acc.y += (P.vestAir - cfg.vest.neutral) * SW.buoy * 2.0;
      acc.x += N.n3(run.t * 0.05, 1, 0) * 0.04; acc.y += N.n3(run.t * 0.05, 4, 0) * 0.03; acc.z += N.n3(run.t * 0.05, 9, 0) * 0.04; // gentle drift
    }
    // ---- integrate: drag acts on your speed relative to the water, so a current carries you ----
    P.vel.addScaledVector(acc, dt);
    var anchored = grab.on;
    if (anchored) {
      // holding the rock: the water slides past, you stay put
      P.vel.multiplyScalar(Math.exp(-dt * C.grab.damp));
      tmpV.copy(grab.point).addScaledVector(grab.normal, 0.55).sub(P.pos);
      if (tmpV.length() > 0.25) P.vel.addScaledVector(tmpV, dt * 2.5);
    } else {
      rel.copy(P.vel).sub(cur);
      var sp = rel.length();
      var dragMul = (P.mode === 'squeeze' ? SW.squeezeDrag : 1) * (P.mode === 'crawl' ? C.crawl.drag : 1);
      rel.multiplyScalar(1 / (1 + (SW.drag1 + SW.drag2 * sp) * dt * dragMul));
      P.vel.copy(cur).add(rel);
    }
    P.pos.addScaledVector(P.vel, dt);
    // ---- collide with the cave ----
    var hit = TU.cave.collide(P.pos, cfg.world.playerRadius, { vel: P.vel, hint: hint });
    P.pos.copy(hit.pos); if (hit.vel) P.vel.copy(hit.vel);
    var blocked = hit.blocked, impact = hit.impact, hn = tmpV3.copy(hit.normal);
    var env2 = P.env = TU.cave.nearestPoint(P.pos, hint);
    // head can poke out of an air pocket by a little, not more
    if (env2.surfaceY != null && P.pos.y > env2.surfaceY + SW.headroom && !landHere(env2, P.pos)) { P.pos.y = env2.surfaceY + SW.headroom; if (P.vel.y > 0) P.vel.y = 0; }
    if (impact > SW.wallHitMin) wallHit(impact, hn, curSpeed);
    return { blocked: blocked };
  }

  // Climb out of the water: swim forward at a ledge while surfaced.
  function tryClimbOut(fb) {
    if (fb <= 0 || climb.active || !TU.cave.isDry) return;
    tmpV.set(P.fwd.x, 0, P.fwd.z); if (tmpV.lengthSq() < 0.01) return; tmpV.normalize();
    var probe = tmpV2.copy(P.pos).addScaledVector(tmpV, 0.75); probe.y += 0.85;
    if (!TU.cave.isDry(probe) || !TU.cave.contains(probe, 0.22)) return;
    var n = TU.cave.nearestPoint(probe);
    if (n.floorY == null || n.floorY < P.surfaceY - 0.15 || n.floorY > P.pos.y + 1.1) return;
    climb.active = true; climb.t = 0; climb.from.copy(P.pos);
    climb.to.set(probe.x, n.floorY + C.walk.eye, probe.z);
    TU.emit('player:climb', { pos: climb.to.clone() });
  }

  // Dry land: gravity, walking, jumping, falling. Also runs the ragdoll on dry land.
  function stepDry(dt, fb, lr, sprint, jump) {
    var W = C.walk, env = P.env, hit = null;
    if (climb.active) {
      climb.t += dt / 0.75;
      var e = smooth(0, 1, climb.t);
      P.pos.lerpVectors(climb.from, climb.to, e); P.pos.y += Math.sin(Math.PI * e) * 0.25;
      P.vel.set(0, 0, 0);
      if (climb.t >= 1) { climb.active = false; land.on = true; land.grounded = true; land.peakY = P.pos.y; land.eye = W.eye; P.pos.copy(climb.to); }
      P.env = TU.cave.nearestPoint(P.pos, hint);
      setMode('walk');
      return null;
    }
    var floorY = env.floorY != null ? env.floorY : P.pos.y - W.eye;
    var ceilY = env.ceilY != null ? env.ceilY : floorY + 4;
    var room = ceilY - floorY;
    var crouch = !rag.active && ((k('KeyC') || k('ControlLeft') || k('ControlRight')) || room < 1.9 || dbg.mode === 'crawlDry');
    var eyeT = rag.active ? lerp(Math.min(W.eye, room - 0.25), 0.3, rag.slump) : crouch ? clamp(room - 0.35, 0.42, W.crouchEye) : Math.min(W.eye, room - 0.25);
    land.eye = U.damp(land.eye, eyeT, rag.active ? 5 : 7, dt);
    if (!rag.active) setMode(crouch ? 'crawl' : 'walk');
    // walking: approach the wished speed along the floor
    tmpV.set(P.fwd.x, 0, P.fwd.z); if (tmpV.lengthSq() < 1e-4) tmpV.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); tmpV.normalize();
    wish.set(0, 0, 0).addScaledVector(tmpV, fb).addScaledVector(P.right, lr);
    if (wish.lengthSq() > 1) wish.normalize();
    var spd = (crouch ? W.crouchSpeed : sprint ? W.run : W.speed) * P.kickMul * (run.sprained ? 0.8 : 1) * (0.7 + 0.3 * run.swimMul);
    var ar = land.grounded ? W.accel : W.airAccel;
    if (rag.active) ar = land.grounded ? 6 : 0.2;
    P.vel.x = U.damp(P.vel.x, wish.x * spd, ar, dt);
    P.vel.z = U.damp(P.vel.z, wish.z * spd, ar, dt);
    if (jump && land.grounded && !crouch && !rag.active) { P.vel.y = W.jump; land.grounded = false; TU.emit('player:jump', {}); }
    P.vel.y -= W.gravity * dt;
    P.vel.y = Math.max(P.vel.y, -30);
    P.pos.addScaledVector(P.vel, dt);
    // walls (and ceiling) from the cave
    hit = TU.cave.collide(P.pos, cfg.world.playerRadius, { vel: P.vel, hint: hint });
    P.pos.copy(hit.pos); if (hit.vel) { P.vel.x = hit.vel.x; P.vel.z = hit.vel.z; if (hit.normal.y < -0.5 && P.vel.y > 0) P.vel.y = 0; }
    env = P.env = TU.cave.nearestPoint(P.pos, hint);
    floorY = env.floorY != null ? env.floorY : floorY;
    // feet on the floor?
    var stand = floorY + land.eye;
    var wasGrounded = land.grounded;
    if (wasGrounded && P.vel.y <= 0.01 && P.pos.y - stand < 0.5) {
      // stay on the ground: follow small steps up and down (and the eye height when crouching or slumping)
      P.pos.y = P.pos.y < stand ? U.damp(P.pos.y, stand, 16, dt) : U.damp(P.pos.y, stand, 22, dt);
      if (P.pos.y < stand - 0.6) P.pos.y = stand - 0.6;
      P.vel.y = 0; land.peakY = P.pos.y;
    } else if (P.pos.y <= stand && P.vel.y <= 0.01) {
      var fallH = land.peakY - stand;
      var vy = P.vel.y;
      P.pos.y = stand; P.vel.y = 0; land.grounded = true;
      landed(fallH, -vy);
      land.peakY = P.pos.y;
    } else {
      land.grounded = false;
      land.peakY = Math.max(land.peakY, P.pos.y); land.airT += dt;
    }
    if (land.grounded) land.airT = 0;
    // a long fall starts the tumble before you hit the ground
    if (!rag.active && !land.grounded && P.vel.y < C.fall.tumbleV && dbg.mode == null) startRagdoll(false);
    // footsteps
    if (land.grounded && !rag.active) {
      var hs = Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z);
      land.stepAcc += hs * dt;
      P.anim.walkPhase = (land.stepAcc / (W.stepLen * 2)) % 1;
      if (land.stepAcc >= W.stepLen) { land.stepAcc -= W.stepLen; TU.emit('player:footstep', { strength: clamp(hs / W.run, 0.2, 1), crouch: crouch }); }
    }
    // back into the water: feet below the surface over deep water, or no longer in air at all
    if (dbg.mode == null && !rag.active) {
      var sy = env.surfaceY;
      var feet = P.pos.y - land.eye;
      if ((sy != null && feet < sy - 0.2 && floorY < sy - 0.5) || (!env.dry && sy == null && TU.cave.isDry && !TU.cave.isDry(P.pos))) {
        var fallInto = land.peakY - P.pos.y;
        land.on = false; land.grounded = false; P.dry = false; setMode('swim');
        P.vel.y = Math.max(P.vel.y, -2.5);
        TU.emit('player:splash', { strength: clamp(fallInto / 6, 0.2, 1) });
        if (fallInto > C.fall.waterSafeH) landed(fallInto - C.fall.waterSafeH + C.fall.minH, 10);
      }
    }
    P.dry = land.on;
    return hit;
  }

  // Hitting the floor after a fall. Height in m above where your eyes ended up.
  function landed(h, impactV) {
    if (h > C.fall.minH) {
      if (!rag.active) startRagdoll(true); else rag.phase = 'down', rag.t = 0;
      fallDamage(h);
    } else if (h > 0.6) {
      TU.emit('player:footstep', { strength: 1, land: true });
      P.shake = Math.max(P.shake, h * 0.3);
    }
    if (rag.active && rag.phase === 'fall') { rag.phase = 'down'; rag.t = 0; }
    if (rag.active && h > 0.5) impactJolt(clamp(h / 6, 0.4, 1.6));
  }
  function fallDamage(h) {
    var F = C.fall, injury = null;
    P.health = Math.max(C.injury.minHealth, P.health - (h - F.minH) * F.dmgPerM);
    P.panic = clamp(P.panic + C.panic.fall + h * 3, 0, 100);
    if (h > F.maimH) { addInjury('break', 0.9, 'fall'); injury = addInjury('maim', 1, 'fall'); }
    else if (h > F.breakH) injury = addInjury('break', clamp((h - F.breakH) / 4, 0.4, 1), 'fall');
    else if (h > F.sprainH) injury = addInjury('sprain', clamp((h - F.sprainH) / 3, 0.3, 1), 'fall');
    if (h > F.sprainH && rand() < 0.5) addInjury('cut', 0.25 + rand() * 0.3, 'fall');
    P.hitFlash = 1; P.shake = Math.max(P.shake, 1.2 + h * 0.15);
    TU.emit('player:fall', { height: h, injury: injury ? injury.type : null });
    TU.emit('player:hit', { strength: clamp(h / 8, 0.3, 1), impact: Math.sqrt(2 * C.walk.gravity * h), normal: new T.Vector3(0, 1, 0), pos: P.pos.clone(), dry: true, fall: true });
    msg(injury ? (injury.type === 'maim' ? 'BAD FALL. Something is wrong with your ' + (injury.side || 'left') + ' side.' : injury.type === 'break' ? 'BAD FALL. Something broke.' : 'HARD FALL. Ankle sprained.') : 'HARD FALL.', 3);
  }
  function startRagdoll(impactNow) {
    rag.active = true; rag.dry = true; rag.t = 0; rag.phase = impactNow ? 'down' : 'fall';
    rag.vp = (rand() - 0.3) * 3.5; rag.vr = (rand() < 0.5 ? -1 : 1) * (3 + rand() * 3); rag.vy = (rand() - 0.5) * 2.5;
    rag.slump = 0; land.on = true; P.dry = true; grab.on = false; tug.active = false; hideTug();
    setMode('ragdoll');
    TU.emit('player:ragdoll', { on: true });
  }
  function impactJolt(s) { rag.vp += (rand() - 0.5) * 6 * s; rag.vr += (rand() < 0.5 ? -1 : 1) * 5 * s; rag.vy += (rand() - 0.5) * 3 * s; P.shake = Math.max(P.shake, 1 + s); }
  function endRagdoll() { rag.active = false; rag.phase = 'none'; rag.p = rag.r = rag.y = 0; rag.vp = rag.vr = rag.vy = 0; rag.slump = 0; P.rag = 0; setMode(land.on ? 'walk' : 'swim'); TU.emit('player:ragdoll', { on: false }); }
  // The ragdoll camera: a damped spring that tumbles, hits, slumps onto its side, then gets back up.
  function ragdollStep(dt) {
    if (!rag.active) return;
    rag.t += dt;
    var tp = 0, tr = 0, ks = 0, dmp = 1.2;
    if (rag.phase === 'fall') { ks = 0; dmp = 0.3; }
    else if (rag.phase === 'down') {
      rag.slump = Math.min(1, rag.slump + dt * 3);
      tr = rag.r >= 0 ? 1.25 : -1.25; tp = -0.35; ks = 18; dmp = 5.5;
      if (rag.t > C.fall.downTime) { rag.phase = 'getup'; rag.t = 0; }
    } else if (rag.phase === 'getup') {
      rag.slump = Math.max(0, 1 - rag.t / C.fall.getUp);
      tp = 0; tr = 0; ks = 22; dmp = 7;
      if (rag.t > C.fall.getUp) { endRagdoll(); return; }
    }
    rag.vp += ((tp - rag.p) * ks - rag.vp * dmp) * dt; rag.vr += ((tr - rag.r) * ks - rag.vr * dmp) * dt; rag.vy += (-rag.y * ks * 0.5 - rag.vy * dmp) * dt;
    rag.p += rag.vp * dt; rag.r += rag.vr * dt; rag.y += rag.vy * dt;
    if (rag.phase === 'fall') { rag.r = clamp(rag.r, -2.4, 2.4); rag.p = clamp(rag.p, -1.3, 1.3); }
    P.rag = rag.phase === 'getup' ? rag.slump : 1;
  }

  // Ending the current tug of war: pulled free into the shelter of the rock, or swept away.
  function endTug(ok, curV, curSpeed) {
    tug.active = false; hideTug();
    if (ok) {
      flow.shelter = C.current.shelter;
      P.vel.addScaledVector(grab.normal, -0.4); // tuck in against the rock, out of the flow
      P.panic = clamp(P.panic - 10, 0, 100);
      msg('You pulled yourself out of the current.', 2.5);
    } else {
      grab.on = false; grab.cooldown = 2; P.grab = false;
      P.vel.addScaledVector(curV, C.current.failKick);
      P.panic = clamp(P.panic + 18, 0, 100);
      P.shake = Math.max(P.shake, 1.4);
      msg('LOST YOUR GRIP. The current has you.', 2.5);
      TU.emit('player:grab', { on: false });
    }
    TU.emit('player:currentEscape', { ok: ok, strength: curSpeed });
    TU.emit('player:tug', { active: false, value: ok ? 1 : 0 });
  }

  // Mask water: rises on hits and in strong currents, sloshes as you turn, hold M to blow it out.
  function maskStep(dt, caught, curV, curSpeed) {
    if (caught && P.inWater && !grab.on) {
      // facing into the flow forces water past the seal
      var into = -(P.fwd.x * curV.x + P.fwd.y * curV.y + P.fwd.z * curV.z) / Math.max(curSpeed, 0.01);
      if (into > 0.3) P.maskWater = clamp(P.maskWater + C.current.floodRate * into * dt * (curSpeed / C.current.caught) * run.mask.flood, 0, 1);
    }
    if (P.maskClearing && P.inWater) P.maskWater = Math.max(0, P.maskWater - C.mask.clearRate * dt);
    if (!P.inWater || P.surfaced) P.maskWater = Math.max(0, P.maskWater - C.mask.drain * dt * (P.surfaced ? 0.5 : 1));
    var flooded = P.maskWater > 0.1;
    if (flooded && !mask.wasFlooded) { TU.emit('player:maskFlood', { level: P.maskWater }); if (!run.maskHinted) { run.maskHinted = true; TU.emit('ui:hint', { text: 'Mask flooded! Hold M to tilt your head and blow it clear.', dur: 4.5 }); } }
    if (!flooded && mask.wasFlooded) TU.emit('player:maskClear', {});
    mask.wasFlooded = flooded; P.maskFlooded = flooded; P.maskFlood = P.maskWater; // maskFlood: the same 0..1 level, for the HUD
    // slosh: the waterline lags behind your head turning (a damped spring)
    var dYaw = (P.yaw - mask.lastYaw) / Math.max(dt, 1e-4), dRoll = (P.roll - mask.lastRoll) / Math.max(dt, 1e-4);
    mask.lastYaw = P.yaw; mask.lastRoll = P.roll;
    var target = -P.roll - (P.maskClearing ? 0.25 : 0) + clamp(dYaw * 0.18, -0.6, 0.6) + clamp(dRoll * 0.1, -0.3, 0.3);
    mask.sloshV += ((target - mask.slosh) * 30 - mask.sloshV * 3.2) * dt;
    mask.slosh = clamp(mask.slosh + mask.sloshV * dt, -0.9, 0.9);
    P.maskSlosh = mask.slosh;
  }
  function floodMask(amount) { P.maskWater = clamp(P.maskWater + amount * run.mask.flood, 0, 1); }

  // Take (or with a negative amount, refill) air from the tanks you carry. Auto-switches to the next tank.
  function breatheFromTanks(amount) {
    var tk = P.tanks[P.activeTank];
    if (amount > 0) {
      var take = Math.min(amount, tk.bar); tk.bar -= take; amount -= take;
      if (tk.bar <= 0) {
        var switched = false;
        for (var i = 0; i < P.tanks.length; i++) if (P.tanks[i].bar > 0 && !P.tanks[i].dropped) { var from = P.activeTank; P.activeTank = i; P.tanks[i].bar = Math.max(0, P.tanks[i].bar - amount); TU.emit('player:tankSwitch', { from: from, to: i }); switched = true; break; }
        if (!switched && !run.droppedHinted && P.tanks.some(function (t) { return t.dropped && t.bar > 0; })) { run.droppedHinted = true; TU.emit('ui:hint', { text: 'Out of air! Your dropped tank still has air.', dur: 4 }); }
      }
    } else if (amount < 0) {
      var add = -amount;
      for (var j = 0; j < P.tanks.length && add > 0; j++) { var t2 = P.tanks[(P.activeTank + j) % P.tanks.length]; if (t2.dropped) continue; var room = t2.max - t2.bar, put = Math.min(room, add); t2.bar += put; add -= put; }
    }
    syncAir();
  }
  function settleTanks(dt) {
    for (var i = 0; i < droppedMeshes.length; i++) {
      var m = droppedMeshes[i]; if (!m || m.userData.rest) continue;
      var tk = P.tanks[i];
      var e = TU.cave.nearestPoint(m.position, m.userData.hint);
      var dryT = e.dry && (e.surfaceY == null || m.position.y > e.surfaceY);
      m.userData.vy = dryT ? m.userData.vy - 9.8 * dt : -C.tank.sink;
      m.position.y += m.userData.vy * dt;
      var fl = (e.floorY != null ? e.floorY : m.position.y - 1) + 0.09;
      if (m.position.y <= fl) { m.position.y = fl; m.userData.rest = true; if (dryT) TU.emit('player:footstep', { strength: 0.8, land: true, metal: true }); }
      var h = TU.cave.collide(m.position, 0.09, { hint: m.userData.hint }); m.position.copy(h.pos);
      if (tk && tk.pos) tk.pos.copy(m.position);
    }
  }
  function mouthPos(out) {
    var c = TU.camera.position;
    return out.copy(c).addScaledVector(P.right, 0.14).addScaledVector(P.up, -0.12).addScaledVector(P.fwd, 0.12);
  }
  function wallHit(imp, normal, curSpeed) {
    P.wallHits++;
    var str = clamp((imp - 0.6) / 1.6, 0.1, 1);
    P.panic = clamp(P.panic + cfg.panic.hitBase + str * cfg.panic.hitScale, 0, 100);
    P.shake = Math.max(P.shake, 0.5 + str);
    P.hitFlash = 0.4 + str * 0.6;
    TU.emit('player:hit', { strength: str, impact: imp, normal: normal.clone(), pos: P.pos.clone(), dry: P.dry });
    if (P.env && P.env.siltiness > 0.3) TU.fx.spawnSilt(Math.round(18 + str * 40), { pos: P.pos, burst: true, vel: P.vel, floorY: P.env.floorY });
    // sharp rock: fast impacts (often a current slamming you) can cut you and knock water into the mask
    var slam = curSpeed > C.current.strong ? 1.5 : 1;
    if (imp > C.injury.cutImpact && rand() < C.injury.cutChance * slam * clamp((imp - C.injury.cutImpact) / 1.2 + 0.4, 0, 1)) addInjury('cut', clamp((imp - 1) / 2.5, 0.2, 1), 'rock');
    if (imp > C.mask.floodImpact && P.inWater && rand() < C.mask.floodChance * slam) floodMask(0.35 + rand() * 0.45);
    if (imp > 3.2 && curSpeed > C.current.strong && rand() < 0.35) addInjury('sprain', 0.5, 'current');
  }
  function nearWarm() {
    var F = TU.cave.features, i;
    var ap = F.airPockets || [];
    for (i = 0; i < ap.length; i++) if (ap[i].warm && ap[i].pos && P.pos.distanceTo(ap[i].pos) < (ap[i].radius || 4) + 1) return true;
    var dc = F.dryChambers || [];
    for (i = 0; i < dc.length; i++) { var c = dc[i]; if (!c.warm || !c.pos) continue; var r = c.size ? Math.max(c.size.x, c.size.z) * 0.6 : 5; if (P.pos.distanceTo(c.pos) < r) return true; }
    return false;
  }
  function onLightDied() {
    if (TU.player.inventory.lantern && !P.lanternOut && lanternLevel() > 0) { toggleLantern(true); msg('Light dead. You hold up the lantern.', 3); }
    else if (TU.player.inventory.lantern && !run.lanternHinted) { run.lanternHinted = true; TU.emit('ui:hint', { text: 'Your light died. Catch glowing creatures for the lantern (L to hold it out).', dur: 5 }); }
  }

  /* ------------------------------------------------------------------ */
  /* Camera and flashlight placement                                     */
  /* ------------------------------------------------------------------ */
  var camUp = new T.Vector3(), ROCK_TINT = new T.Color(0x9a8f80);
  function placeCamera(dt) {
    var camera = TU.camera, t = run.t + idleT, narc = P.narcosis || 0;
    ragdollStep(dt);
    var motion = reduced() ? 0.25 : 1;
    var bob = P.kickPhase >= 0 && !P.dry ? Math.sin(Math.PI * P.kickPhase) * 0.006 * motion : 0;
    if (P.dry && land.grounded && !rag.active) bob = Math.sin(P.anim.walkPhase * Math.PI * 4) * 0.012 * motion * clamp(P.speed / 2, 0, 1);
    var lrKey = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    var lr = (P.mode === 'squeeze' ? 0 : lrKey) * (reduced() ? 0.01 : 0.035);
    var wig = P.mode === 'squeeze' ? squeezeS.wiggle * 0.06 * motion : 0;
    P.roll += (-lr - P.roll) * (1 - Math.exp(-dt * 4));
    var shk = (smooth(45, 100, P.panic) * 0.012 + P.shake * 0.02 + P.cold * 0.003 + (P.quake || 0) * 0.012) * (reduced() ? 0.2 : 1);
    var sx = N.n3(t * 9, 0, 0) * shk, sy = N.n3(0, t * 9, 3) * shk;
    // blowing out the mask: tilt your head back
    run.tilt = U.damp(run.tilt || 0, P.maskClearing ? 0.38 : 0, 5, dt || 1);
    camEuler.set(P.pitch - bob + sy + run.tilt + rag.p, P.yaw + sx + rag.y, P.roll + wig + rag.r - run.tilt * 0.15);
    camera.quaternion.setFromEuler(camEuler);
    camera.position.copy(P.pos);
    if (P.dry && rag.active) camera.position.y += 0; // the eye height already slumps in stepDry
    var fovT = cfg.swim.fov + (run.mask.fov || 0) + (reduced() ? 0 : Math.sin(t * 0.7) * 1.5 * narc) + (P.sprint ? 2 : 0);
    if (dt === 0) { camera.fov = fovT; camera.updateProjectionMatrix(); }
    else if (Math.abs(camera.fov - fovT) > 0.02) { camera.fov += (fovT - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
    // ---- flashlight: held in the left hand (or a mask headlamp), with lag and sway ----
    var cf = tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion);
    var cr = tmpV2.set(1, 0, 0).applyQuaternion(camera.quaternion);
    var cu = camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    var head = P.headlamp = lamp.headlamp = hasHeadlamp(TU.run);
    var rig = TU.player.rig;
    var aimT = tmpV3;
    if (!head && rig && rig.lampDir && rig.lampPos) {
      // the visible torch on the left hand says where the beam comes from (camera space)
      aimT.copy(rig.lampDir).applyQuaternion(camera.quaternion);
      lampPos.copy(rig.lampPos).applyQuaternion(camera.quaternion).add(camera.position);
    } else {
      aimT.copy(cf);
      if (head) lampPos.copy(camera.position).addScaledVector(cu, 0.09).addScaledVector(cf, 0.05);
      else lampPos.copy(camera.position).addScaledVector(cr, -0.2).addScaledVector(cu, -0.17).addScaledVector(cf, 0.32);
    }
    var lag = head ? cfg.light.lag * 3 : cfg.light.lag;
    if (dt === 0) lampDir.copy(aimT); else lampDir.lerp(aimT, 1 - Math.exp(-dt * lag)).normalize();
    var sway = (cfg.light.sway + smooth(50, 100, P.panic) * 0.03 + P.cold * 0.012 + P.shock * 0.05) * (head ? 0.3 : 1);
    lampDir.x += N.n3(t * 0.6, 7, 1) * sway; lampDir.y += N.n3(t * 0.6, 2, 8) * sway; lampDir.normalize();
    spot.position.copy(lampPos); spot.target.position.copy(lampPos).addScaledVector(lampDir, 10);
    lampRig.position.copy(lampPos); lampRig.lookAt(spot.target.position);
    var bat = P.battery / 100, I = P.flashOn ? 1 : 0;
    if (P.flashOn && bat < cfg.light.flickerBelow) { var fl = N.n3(t * 14, 3, 3); I *= lerp(0.45, 1, bat / cfg.light.flickerBelow) * (fl < -0.35 ? 0.25 : 1); }
    if (shock.lightOff > 0) I *= N.n3(t * 30, 1, 1) > 0.3 ? 0.6 : 0.02; // an eel shock makes the light stutter
    var warm = smooth(0.25, 0.0, bat);
    spot.color.setRGB(1, lerp(0.945, 0.72, warm), lerp(0.84, 0.48, warm));
    spot.intensity = cfg.light.intensity * I * (head ? 0.75 : 1);
    spot.angle = head ? 0.62 : cfg.light.angle; spot.penumbra = head ? 0.8 : cfg.light.penumbra;
    // soft bounce light where the beam hits the rock
    var hitD = 14;
    if (I > 0.01) {
      hitD = TU.cave.raycast(lampPos, lampDir, 14, hint);
      bounce.position.copy(lampPos).addScaledVector(lampDir, Math.max(0.3, hitD * 0.82));
      bounce.intensity = cfg.light.bounce * I * clamp(1 - hitD / 15, 0, 1);
      bounce.color.copy(spot.color).lerp(ROCK_TINT, 0.4);
    } else bounce.intensity = 0;
    lamp.pos.copy(lampPos); lamp.dir.copy(lampDir); lamp.on = I; lamp.hitDist = hitD;
    lamp.cosOuter = Math.cos(spot.angle + 0.02); lamp.cosInner = Math.cos(spot.angle * (1 - spot.penumbra * 0.8));
    // ---- the creature lantern, held out in the right hand ----
    var lv = P.lanternLevel || 0;
    if (lv > 0) {
      if (rig && rig.lanternPos) lanternLight.position.copy(rig.lanternPos).applyQuaternion(camera.quaternion).add(camera.position);
      else lanternLight.position.copy(camera.position).addScaledVector(cr, 0.22).addScaledVector(cu, -0.25).addScaledVector(cf, 0.45);
      lanternLight.intensity = lv * C.lantern.perBright * (0.9 + 0.1 * Math.sin(t * 3.1) + 0.05 * N.n3(t * 2, 5, 5));
      lanternLight.distance = run.lanternRange ? run.lanternRange * 1.4 : C.lantern.range * (0.7 + 0.1 * Math.min(lv, 3));
    } else lanternLight.intensity = 0;
  }

  // Menu attract mode: slow look around near the mouth.
  function idle(dt) {
    idleT += dt;
    if (!(TU.state.is('title') || TU.state.is('loadout'))) return; // results screens keep the last view
    var sp = TU.cave.spawnPoint();
    if (sp) { P.tYaw = P.yaw = sp.yaw + Math.sin(idleT * 0.12) * 0.25; }
    P.pitch = P.tPitch = -0.05 + Math.sin(idleT * 0.17) * 0.05;
    computeBasis(); P.env = TU.cave.nearestPoint(P.pos, hint); placeCamera(dt);
  }

  // Graphics quality (fx.js picks the preset): flashlight shadows on or off and the shadow map size.
  function applyGfx() {
    var g = TU.fx.gfx; if (!g || !spot) return;
    var want = !!g.shadows;
    if (spot.castShadow !== want) spot.castShadow = want;
    var ms = g.shadowMap || 1024;
    if (spot.shadow.mapSize.x !== ms) { spot.shadow.mapSize.set(ms, ms); if (spot.shadow.map) { spot.shadow.map.dispose(); spot.shadow.map = null; } }
  }
  // Once per rendered frame: rope segments, waypoint pulses, dropped tank tags.
  function frame() {
    applyGfx();
    var pts = rope.pts, n = 0, t = run.t + idleT, mesh = rope.mesh;
    function seg(a, b) { var len = a.distanceTo(b); if (len < 1e-3 || n >= cfg.rope.maxPoints) return; tmpV.subVectors(b, a).divideScalar(len); qq.setFromUnitVectors(yAxis, tmpV); sc3.set(1, len, 1); tmpV.addVectors(a, b).multiplyScalar(0.5); m4.compose(tmpV, qq, sc3); mesh.setMatrixAt(n++, m4); }
    for (var i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
    if (pts.length && TU.state.current !== 'title') seg(pts[pts.length - 1], rope.reel);
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    waypoints.forEach(function (w) { var p = 0.75 + 0.25 * Math.sin(t * 2.2 + w.ph); w.halo.material.opacity = 0.6 * p; w.halo.scale.setScalar(0.9 + 0.3 * p); w.light.intensity = 0.35 * p; });
    droppedMeshes.forEach(function (m) { if (m && m.userData.tag) m.userData.tag.material.opacity = 0.3 + 0.2 * Math.sin(t * 2.5); });
  }

  /* ------------------------------------------------------------------ */
  /* Events from other modules                                           */
  /* ------------------------------------------------------------------ */
  // Quakes (agent A emits 'quake'): shaking, panic, and sometimes a falling rock.
  TU.on('quake', function (e) {
    var s = e.strength == null ? 1 : e.strength;
    quake.t = Math.max(quake.t, e.duration || 2.5); quake.str = Math.max(s, quake.t > 0 ? quake.str : 0);
    P.shake = Math.max(P.shake, 1 + s); P.panic = clamp(P.panic + C.panic.quake * s, 0, 100);
    if (TU.state.simulating() && s > 1.2 && rand() < 0.3) addInjury('cut', 0.2 + rand() * 0.25, 'debris');
  });
  // A falling rock from a quake hit the diver (cave-dress.js emits cave:rockHit). Severity = radius (m) x speed (m/s).
  TU.on('cave:rockHit', function (e) {
    if (!TU.state.simulating()) return;
    var sev = (e.r || 0.2) * (e.speed || 1), R = C.rocks;
    P.shake = Math.max(P.shake, 0.8 + Math.min(1.5, sev)); P.hitFlash = Math.max(P.hitFlash, 0.6);
    TU.emit('player:hit', { strength: clamp(sev, 0.2, 1), impact: e.speed || 1, normal: new T.Vector3(0, 1, 0), pos: P.pos.clone(), dry: P.dry, rock: true });
    if (sev >= R.crushSeverity && !(TU.run && TU.run.tutorial)) { P.health = 0; TU.emit('player:crushed', { pos: P.pos.clone(), depth: P.depth, severity: sev }); return; }
    if (sev >= R.crushBreak) { addInjury('break', clamp(sev / R.crushSeverity, 0.3, 1), 'rock'); addInjury('cut', 0.4, 'rock'); msg('A ROCK HIT YOU. Something broke.', 3); }
    else if (sev >= R.crushCut) { addInjury('cut', clamp(sev, 0.15, 0.6), 'rock'); }
  });
  // Marv pulls you out (the practice hole has no fail states): air, health and breath back.
  function rescue() {
    P.health = Math.max(P.health, 60); P.bleedOut = 0; P.drown = 0; run.drownSent = false; run.bledSent = false;
    P.injuries.forEach(function (j) { if (j.type === 'cut' && !j.taped) { j.taped = true; j.tape = 'flex'; } });
    for (var i = 0; i < P.tanks.length; i++) if (!P.tanks[i].dropped) P.tanks[i].bar = P.tanks[i].max;
    syncAir();
  }
  // Creature attacks (agent B). Several names are accepted so either naming works.
  function onShock(e) {
    var s = clamp(e.strength == null ? 1 : e.strength, 0.2, 2);
    shock.t = Math.min(1.5, 0.8 + s * 0.4); shock.lightOff = e.lightFlicker || (1.5 + s);
    P.panic = clamp(P.panic + (e.panic != null ? e.panic : C.panic.shock * s), 0, 100); P.shake = Math.max(P.shake, 1.2 * s); P.hitFlash = Math.max(P.hitFlash, 0.8);
    P.stamina = Math.max(0, P.stamina - 12 * s);
    if (P.inWater && rand() < 0.4) floodMask(0.3);
    TU.emit('player:shocked', { strength: s });
  }
  function onBite(e) {
    var sev = e.severity != null ? e.severity : e.strength != null ? e.strength : 0.7;
    if (e.kind === 'pinch' || e.type === 'pinch') sev = Math.min(sev, 0.25);
    addInjury('cut', sev, e.speciesId || e.kind || 'bite');
    P.panic = clamp(P.panic + (e.panic != null ? e.panic : sev > 0.4 ? C.panic.bite : 6), 0, 100); P.shake = Math.max(P.shake, 0.6 + sev);
    if (e.gore) { P.bloodMask = 1; if (TU.fx.spawnBlood) TU.fx.spawnBlood(40, { pos: cutPos(tmpV3), burst: true }); }
    TU.emit('player:bitten', { severity: sev, speciesId: e.speciesId || null });
  }
  TU.on('creature:shock', onShock);
  TU.on('creature:bite', onBite);
  TU.on('creature:pinch', function (e) { onBite({ severity: e.severity != null ? e.severity : 0.15, kind: 'pinch', speciesId: e.speciesId }); });
  // Agent B's real event: creature:attack { kind: 'shock'|'bite'|'pinch'|'sting'|'venom', severity, panic, lightFlicker, blur, gore }.
  TU.on('creature:attack', function (e) {
    if (!TU.state.simulating()) return;
    var kind = e.kind || e.type;
    if (kind === 'shock') onShock({ strength: (e.severity == null ? 0.8 : e.severity) * 1.4, lightFlicker: e.lightFlicker, panic: e.panic });
    else if (kind === 'bite' || kind === 'pinch' || e.injury === 'cut' || e.injury === 'bite') onBite(e);
    else {
      // stings and venom: no cut, but they hurt, scare you and blur your eyes
      P.panic = clamp(P.panic + (e.panic || 8), 0, 100);
      P.health = Math.max(C.injury.minHealth, P.health - (e.severity || 0.1) * 12);
      if (e.blur) P.daze = Math.max(P.daze || 0, e.blur);
      TU.emit('player:stung', { kind: kind, severity: e.severity || 0.1 });
    }
  });
  // A creature caught for the lantern: remember it so the lantern glows (unless agent B reports brightness itself).
  TU.on('creature:caught', function (e) {
    var inv = TU.player.inventory; if (!inv.lantern) return;
    if (inv.lantern.creatures.length < inv.lantern.slots) inv.lantern.creatures.push(e.speciesId);
  });
  // The wrist computer view (agent D): raise the left arm while it is open.
  function onWrist(e) { P.wristRaised = !!(e && (e.open != null ? e.open : e.on != null ? e.on : true)); }
  TU.on('ui:wrist', onWrist); TU.on('ui:watch', onWrist);

  /* ------------------------------------------------------------------ */
  /* Debug hooks (tests and filming)                                     */
  /* ------------------------------------------------------------------ */
  var debug = {
    // 'swim' | 'crawl' | 'squeeze' | 'walk' | 'crawlDry' | null (automatic). 'walk' runs dry physics anywhere.
    setMode: function (m) {
      dbg.mode = m || null;
      if (m === 'walk' || m === 'crawlDry') { land.on = true; land.grounded = false; land.peakY = P.pos.y; }
      else if (land.on && !landHere(P.env, P.pos)) { land.on = false; }
      return P.mode;
    },
    // Reset only the diver (not the cave): for tests that try many situations in one dive.
    resetPlayer: function () { dbg.mode = null; for (var kk in keys) keys[kk] = false; reset(TU.run); if (TU.fx.clear) TU.fx.clear(); return P.mode; },
    forceCut: function (sev) { return addInjury('cut', sev == null ? 0.6 : sev, 'debug'); },
    forceInjury: function (type, sev) { return addInjury(type || 'sprain', sev == null ? 0.6 : sev, 'debug'); },
    // forceCurrent(Vector3 m/s or number, seconds = 6). A number pushes along your view's backward direction.
    forceCurrent: function (v, sec) {
      flow.forced = typeof v === 'number' ? P.fwd.clone().multiplyScalar(-v) : new T.Vector3(v.x, v.y, v.z);
      flow.forcedT = sec == null ? 6 : sec; return flow.forced.length();
    },
    clearCurrent: function () { flow.forced = null; flow.forcedT = 0; },
    // Fall from height h (m) right here: tumble, impact, damage. Runs on dry-land physics.
    forceFall: function (h) {
      h = h == null ? 6 : h;
      land.on = true; P.dry = true; land.grounded = true; land.peakY = P.pos.y;
      startRagdoll(true); fallDamage(h); impactJolt(clamp(h / 6, 0.4, 1.6));
      return P.health;
    },
    forceMaskFlood: function (level) { P.maskWater = clamp(level == null ? 0.6 : level, 0, 1); return P.maskWater; },
    forceQuake: function (s, d) { TU.emit('quake', { strength: s == null ? 1.2 : s, duration: d || 3 }); },
    forceShock: function (s) { onShock({ strength: s == null ? 1 : s }); },
    forceBite: function (sev) { onBite({ severity: sev == null ? 0.7 : sev, speciesId: 'debug' }); },
    setWristRaised: function (b) { P.wristRaised = !!b; },
    setHeadlamp: function (b) { dbg.headlamp = b == null ? null : !!b; P.headlamp = hasHeadlamp(TU.run); return P.headlamp; },
    setPanic: function (v) { P.panic = clamp(v, 0, 100); },
    setBattery: function (v) { P.battery = clamp(v, 0, 100); if (P.battery <= 0 && P.flashOn) { P.flashOn = false; TU.emit('player:light', { on: false, reason: 'dead' }); onLightDied(); } },
    giveLantern: function (brightness) { var inv = TU.player.inventory; inv.lantern = inv.lantern || { slots: 4, creatures: [] }; inv.lantern.debugBright = brightness; if (brightness) inv.lantern.creatures = ['debug', 'debug', 'debug'].slice(0, Math.max(1, Math.round(brightness))); return inv.lantern; },
    giveTape: function (duct, flex) { var inv = TU.player.inventory; inv.tape = duct == null ? 3 : duct; inv.flexTape = flex == null ? 1 : flex; },
    press: function (code) { press(code); },
    // Hold E at the nearest wall right now (for tests): moves you close to the rock first.
    grabWall: function () {
      var e = P.env; if (!e || !e.normal) return false;
      for (var i = 0; i < 8; i++) {
        e = P.env = TU.cave.nearestPoint(P.pos, hint);
        var wd = e.wallDist != null ? e.wallDist : 1;
        if (wd < C.grab.reach * 0.7) break;
        P.pos.addScaledVector(e.normal, Math.max(0.1, (wd - 0.5) * 0.7));
      }
      P.vel.set(0, 0, 0); keys.KeyE = true;
      return +(P.env.wallDist || 0).toFixed(2);
    },
    releaseWall: function () { keys.KeyE = false; },
    tug: function (v) { if (tug.active) tug.value = clamp(v, 0, 1); return tug.active; },
    state: function () {
      return { mode: P.mode, dry: P.dry, grounded: land.grounded, eye: +land.eye.toFixed(2), rag: rag.active ? rag.phase : null, health: +P.health.toFixed(1), bleed: +P.bleed.toFixed(2), panic: +P.panic.toFixed(1),
        injuries: P.injuries.map(function (j) { return j.type + (j.taped ? '(' + j.tape + ')' : ''); }), maskWater: +P.maskWater.toFixed(2), grab: grab.on, tug: tug.active ? +tug.value.toFixed(2) : null,
        caught: P.caught, current: +P.currentSpeed.toFixed(2), carried: P.carried, tanks: P.tanks.map(function (t) { return { bar: +t.bar.toFixed(1), dropped: t.dropped }; }), active: P.activeTank,
        staminaMax: +P.staminaMax.toFixed(1), stamina: +P.stamina.toFixed(1), lantern: P.lanternOut, lanternLevel: +P.lanternLevel.toFixed(2), headlamp: P.headlamp, stuck: +P.stuck.toFixed(2),
        narcosis: +P.narcosis.toFixed(2), cold: +P.cold.toFixed(2), tape: tape.t, inv: { tape: TU.player.inventory.tape, flex: TU.player.inventory.flexTape }, kickMul: +P.kickMul.toFixed(2), maimed: P.maimed };
    },
    cfg: C
  };

  TU.define('player', {
    ropeLength: ropeLength,
    ropePoints: function () { return rope.pts; },
    waypoints: function () { return waypoints; },
    dropWaypoint: dropWaypoint,
    toggleFlash: toggleFlash,
    toggleLantern: toggleLantern,
    teleport: teleport,
    look: look,
    enableTouch: enableTouch,
    setAir: setAir,
    cameraForward: function () { return new T.Vector3(0, 0, -1).applyQuaternion(TU.camera.quaternion); },
    isTouch: function () { return touch.on; },
    // Agent D: call this while the wrist computer view is open (or emit 'ui:wrist' {open}).
    setWristRaised: function (b) { P.wristRaised = !!b; },
    dropTank: dropTank,
    pickUpTank: pickUpTank,
    applyTape: applyTape,
    addInjury: addInjury,
    renameWaypoint: renameWaypoint,
    rescue: rescue,
    // Co-op hook for later (Unreal): a teammate pulling on the rope adds to your tug of war.
    tugAssist: function (amount) { if (tug.active) tug.value = clamp(tug.value + (amount || 0.05), 0, 1); return tug.active; },
    bindings: BINDINGS,
    debug: debug
  });

  TU.addSystem('player', {
    init: function () { buildRig(); bindInput(); reset(TU.run); },
    reset: reset,
    update: step,
    idle: idle,
    frame: frame
  });
})();
