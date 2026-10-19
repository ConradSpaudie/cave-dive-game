/*
 * creatures.js: everything alive in the cave, plus the species database for the logbook.
 *
 * How it works:
 *   1. SPECIES below is the logbook database (21 species: fish, crustaceans, an olm, eels,
 *      jellyfish, glowing fungi and moss, glowworms, bacterial mats and a giant at the bottom).
 *   2. At the start of a dive we make a "census": every creature in the whole cave gets a record
 *      with a home spot, picked through the cave query API (TU.cave.randomSpot, raycast, features),
 *      so it works for the handmade cave and for generated caves. Species live in their depth
 *      zones; if the cave is not deep enough, deep species show up in the deepest part instead.
 *   3. Only records near the diver are "active" (simulated and drawn). Far ones freeze. This keeps
 *      the game fast with hundreds of creatures in a cave.
 *   4. Each species is drawn with InstancedMesh pools built from procedural models
 *      (creatures-models.js) and animated on the GPU (creatures-lib.js): one draw call per species part.
 *   5. Behaviors are simple steering: wander, schools, flee, curiosity, territorial claws,
 *      floor crawling, jellyfish pulses, ambush lures, electric warnings and shocks.
 *   6. Glowing species add halo sprites and, for the brightest few near you, real point lights.
 *
 * Owner: agent B. Public API in TU.creatures (see CONTRACT.md section 11 and CONTRACT-B-NOTES.md).
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, L = TU._cr;
  if (!L || !L.models) { console.error('[TU] creatures.js needs creatures-lib.js and creatures-models.js loaded first'); return; }
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;

  /* ------------------------------------------------------------------ */
  /* Tunables. The shared ones live in TU.cfg.creatures (core.js) and   */
  /* are copied over these defaults at load time.                        */
  /* ------------------------------------------------------------------ */
  var C = {
    activeRadius: 34,      // m, creatures closer than this are simulated and drawn
    sleepRadius: 44,       // m, active creatures farther than this freeze again
    maxActive: 220,        // most creatures active at once
    seenDist: 10,          // m, "seen" when this close and near the middle of the view
    seenDot: 0.72,         // view cone for "seen" (cos of the angle)
    fleeSpeed: 1.15,       // m/s, the diver moving faster than this scares skittish animals
    fleeDist: 6,           // m
    catchDist: 3.0,        // m, how close you must be to catch something
    measureDist: 3.0,      // m, measuring tape reach
    measureDot: 0.93,      // must be this centered in view to measure
    measureTime: 1.2,      // s, base time to hold the tape still
    lights: 3,             // pooled point lights for the brightest glowers
    halos: 1200,           // glow sprite budget
    lanternCap: 10,        // lantern brightness cap (sum of species brightness)
    shinyChance: 1 / 200   // chance a spawn is a shiny variant
  };
  (function () { var cc = TU.cfg.creatures || {}; for (var k in cc) if (typeof cc[k] === 'number') C[k] = cc[k]; })();

  /* ------------------------------------------------------------------ */
  /* Species database (logbook entries). Sizes in meters.                */
  /* ------------------------------------------------------------------ */
  // Contract fields: id, name, type, zones (0..4), behavior, glows, brightness (0..5), rarity, sizeM [min, max],
  // colors (hex), shape, note. Extra fields: kind ('fauna'|'flora'), catchable, dangerous, glow (hex),
  // move, place, groups (spawn groups per zone), group [min, max] per group, scaleK (model size per measured meter),
  // speed (m/s), sight (flees bright light), cap (max drawn at once), show (showcase framing).
  function sp(o) { o.kind = o.kind || 'fauna'; o.catchable = !!o.catchable; o.scaleK = o.scaleK || 1; o.cap = o.cap || 24; o.show = o.show || {}; o.groups = o.groups || 2; o.group = o.group || [1, 1]; return o; }
  var SPECIES = {
    cenote_molly: sp({ id: 'cenote_molly', name: 'Cenote Molly', type: 'Fish', zones: [0], behavior: 'skittish', glows: false, brightness: 0, rarity: 'common', sizeM: [0.04, 0.09], colors: [0x5E6A4C, 0xE3E0CF], shape: 'cenote_molly',
      note: 'Livebearing fish of sunlit cenotes. The whole school bolts at once when your light or fins come too close.', move: 'school', place: 'water', groups: 3, group: [7, 11], speed: 0.45, sight: true, cap: 64 }),
    stalag_moss: sp({ id: 'stalag_moss', name: 'Stalag Moss', type: 'Moss', kind: 'flora', zones: [0], behavior: 'harmless', glows: false, brightness: 0, rarity: 'common', sizeM: [0.05, 0.4], colors: [0x3F5428, 0x8FA858], shape: 'stalag_moss',
      note: 'Moss that colonizes lit rock near the entrance. The first thing everyone logs.', move: 'still', place: 'wall', groups: 9, cap: 30 }),
    entrance_crayfish: sp({ id: 'entrance_crayfish', name: 'Entrance Crayfish', type: 'Crustacean', zones: [0, 1, 2], behavior: 'territorial', dangerous: true, glows: false, brightness: 0, rarity: 'common', sizeM: [0.05, 0.12], colors: [0xEEF0EC, 0xE7C9BC], shape: 'cave_crayfish',
      note: 'A pale crayfish that wanders in from the entrance. Raises its claws when you hover close, then pinches a glove if you stay.', move: 'crawl', place: 'floor', groups: 4, cap: 16, show: { ext: 1.9, floor: true } }),
    blind_cavefish: sp({ id: 'blind_cavefish', name: 'Blind Cavefish', type: 'Fish', zones: [1, 2], behavior: 'harmless', glows: false, brightness: 0, rarity: 'common', sizeM: [0.06, 0.12], colors: [0xE6C3BC, 0xF8EDE6], shape: 'blind_cavefish',
      note: 'Eyeless and pink, it finds food by feel. Curious: it nibbles at fingers and is easy to measure.', move: 'school', place: 'water', groups: 3, group: [6, 10], speed: 0.35, curious: true, cap: 64 }),
    glass_shrimp: sp({ id: 'glass_shrimp', name: 'Glass Shrimp', type: 'Crustacean', zones: [1, 2], behavior: 'skittish', glows: false, brightness: 0, rarity: 'common', sizeM: [0.01, 0.03], colors: [0xE4F2F4, 0xE8D27A], shape: 'glass_shrimp',
      note: 'Tiny see-through cave shrimp. You only notice them when your light catches them at the right angle.', move: 'shrimp', place: 'water', groups: 3, group: [8, 14], speed: 0.18, cap: 64, show: { ext: 1.9 } }),
    starlight_glowworm: sp({ id: 'starlight_glowworm', name: 'Starlight Glowworm', type: 'Insect larva', zones: [1, 2, 3], behavior: 'harmless', glows: true, brightness: 2, catchable: true, rarity: 'common', sizeM: [0.01, 0.04], colors: [0x7FE8FF, 0xE8F4F4], glow: 0x7FE8FF, shape: 'glowworm', scaleK: 14,
      note: 'Larvae that hang sticky silk lines from dry ceilings. A chamber of them looks like a night sky. They dim when disturbed.', move: 'still', place: 'ceilingDry', groups: 7, cap: 40, show: { ext: 1.1, ceiling: true } }),
    ghost_fire_fungus: sp({ id: 'ghost_fire_fungus', name: 'Ghost Fire Fungus', type: 'Fungus', kind: 'flora', zones: [1, 2, 3], behavior: 'harmless', glows: true, brightness: 2, catchable: true, rarity: 'uncommon', sizeM: [0.01, 0.03], colors: [0xB8D8A0, 0x9BFF6A], glow: 0x9BFF6A, shape: 'ghost_fire_fungus', scaleK: 7,
      note: 'Small mushrooms that glow green on drowned wood. The first good light for the lantern.', move: 'still', place: 'wall', groups: 5, cap: 30, show: { ext: 1.0, floor: true, dy: 0.12, low: true } }),
    blind_swamp_eel: sp({ id: 'blind_swamp_eel', name: 'Blind Swamp Eel', type: 'Fish', zones: [1], behavior: 'skittish', glows: false, brightness: 0, rarity: 'rare', sizeM: [0.15, 0.35], colors: [0xD9B9AE, 0xF0DED6], shape: 'blind_swamp_eel',
      note: 'An eyeless pink eel. Divers panic and think it is the electric one. It is not.', move: 'eel', place: 'water', groups: 2, speed: 0.25, cap: 6, show: { ext: 1.0 } }),
    olm: sp({ id: 'olm', name: 'Olm', type: 'Amphibian', zones: [2], behavior: 'harmless', glows: false, brightness: 0, rarity: 'rare', sizeM: [0.2, 0.4], colors: [0xF1DCCF, 0xE2706E], shape: 'olm',
      note: 'The "human fish": blind, pale, with red feathery gills. Lives about 100 years and barely moves.', move: 'crawl', place: 'floor', groups: 2, speed: 0.03, cap: 6, show: { ext: 1.15, floor: true } }),
    remipede: sp({ id: 'remipede', name: 'Remipede', type: 'Crustacean', zones: [2], behavior: 'dangerous', dangerous: true, glows: false, brightness: 0, rarity: 'uncommon', sizeM: [0.01, 0.045], colors: [0xEFE6D6, 0xD9C27A], shape: 'remipede',
      note: 'An ancient venomous cave crustacean that swims upside down. Bites the hand holding the tape.', move: 'swim', place: 'water', groups: 3, speed: 0.08, upsideDown: true, cap: 10, show: { ext: 1.2 } }),
    giant_isopod: sp({ id: 'giant_isopod', name: 'Giant Isopod', type: 'Crustacean', zones: [2, 3], behavior: 'harmless', glows: false, brightness: 0, rarity: 'uncommon', sizeM: [0.2, 0.5], colors: [0xC9BBB4, 0xA89AA4], shape: 'giant_isopod',
      note: 'A scavenger the size of a dinner plate. It slowly crawls toward injured divers. Not dangerous, just unsettling.', move: 'crawl', place: 'floor', groups: 2, speed: 0.04, cap: 8, show: { ext: 1.45, floor: true } }),
    sea_firefly: sp({ id: 'sea_firefly', name: 'Sea Firefly', type: 'Crustacean', zones: [2, 3], behavior: 'skittish', glows: true, brightness: 3, catchable: true, rarity: 'uncommon', sizeM: [0.001, 0.003], colors: [0x2FA8FF, 0x4FF2D0], glow: 0x2FA8FF, shape: 'sea_firefly', scaleK: 2.2,
      note: 'Tiny ostracods that spit blue light when disturbed. Caught as a swarm, they light the lantern well.', move: 'swarm', place: 'water', groups: 3, speed: 0.1, swarmN: 48, cap: 6, show: { swarm: true } }),
    sulfur_bloom_mat: sp({ id: 'sulfur_bloom_mat', name: 'Sulfur Bloom Mat', type: 'Bacteria', kind: 'flora', zones: [2, 3], behavior: 'harmless', glows: false, brightness: 0, rarity: 'common', sizeM: [0.2, 2.0], colors: [0xEAE6D8, 0xD8CF9A], shape: 'sulfur_mat',
      note: 'White bacterial mats like wet cloth. Brush it with a fin and the passage turns into a white cloud.', move: 'still', place: 'floor', groups: 5, cap: 20, show: { ext: 1.1, floor: true } }),
    volt_eel: sp({ id: 'volt_eel', name: 'Volt Eel', type: 'Fish', zones: [2, 3], behavior: 'dangerous', dangerous: true, glows: true, brightness: 0, rarity: 'uncommon', sizeM: [1.0, 2.5], colors: [0x2B2F26, 0xA06E34], glow: 0xBFE8FF, shape: 'volt_eel',
      note: 'Holds the animal voltage record. It crackles with light as a warning, then shocks everything nearby.', move: 'eel', place: 'water', groups: 2, speed: 0.35, cap: 4, show: { ext: 1.0 } }),
    halo_jelly: sp({ id: 'halo_jelly', name: 'Halo Jelly', type: 'Jellyfish', zones: [3], behavior: 'harmless', glows: true, brightness: 3, catchable: true, rarity: 'uncommon', sizeM: [0.05, 0.3], colors: [0x7FE8FF, 0xCFF6FF], glow: 0x7FE8FF, shape: 'halo_jelly',
      note: 'Drifts in groups with a ring of light around its bell. Mild sting if grabbed.', move: 'jelly', place: 'water', groups: 2, group: [3, 5], speed: 0.06, cap: 18, show: { ext: 1.75, jelly: true, dy: -0.12 } }),
    lanternjaw: sp({ id: 'lanternjaw', name: 'Lanternjaw', type: 'Fish', zones: [3], behavior: 'dangerous', dangerous: true, glows: true, brightness: 4, rarity: 'rare', sizeM: [0.5, 1.5], colors: [0x2E2C24, 0x6FFFE9], glow: 0x6FFFE9, shape: 'lanternjaw',
      note: 'Its lure looks exactly like a lantern creature. Swim up to catch the glow and the glow has teeth.', move: 'ambush', place: 'wallWater', groups: 2, cap: 4, show: { ext: 1.6, dz: 0.12, dy: 0.08 } }),
    glimmer_moss: sp({ id: 'glimmer_moss', name: 'Glimmer Moss', type: 'Moss', kind: 'flora', zones: [3], behavior: 'harmless', glows: true, brightness: 2, catchable: true, rarity: 'rare', sizeM: [0.05, 0.5], colors: [0x2E4A3A, 0x29F0C8], glow: 0x29F0C8, shape: 'glimmer_moss',
      note: 'The rare glowing moss. Scraping it into the lantern leaves a bare dark spot.', move: 'still', place: 'wall', groups: 3, cap: 12, show: { ext: 1.1, floor: true } }),
    deep_lobefin: sp({ id: 'deep_lobefin', name: 'Deep Lobefin', type: 'Fish', zones: [4], behavior: 'harmless', glows: false, brightness: 0, rarity: 'rare', sizeM: [1.0, 2.0], colors: [0x23324A, 0xC9D3DA], shape: 'deep_lobefin',
      note: 'A living fossil with fleshy lobed fins. Drifts slowly and sometimes hangs head down. Everyone goes quiet.', move: 'swim', place: 'water', groups: 2, speed: 0.18, curious: true, cap: 4 }),
    spiral_drifter: sp({ id: 'spiral_drifter', name: 'Spiral Drifter', type: 'Mollusk', zones: [4], behavior: 'harmless', glows: true, brightness: 4, catchable: true, rarity: 'rare', sizeM: [0.15, 0.6], colors: [0xEDE3CF, 0x8E6BFF], glow: 0x8E6BFF, shape: 'spiral_drifter',
      note: 'A shelled drifter whose spiral glows in rings. A shiny one is solid gold.', move: 'drift', place: 'water', groups: 2, speed: 0.08, cap: 6, show: { ext: 1.25 } }),
    rockcrawler: sp({ id: 'rockcrawler', name: 'Rockcrawler', type: 'Arthropod', zones: [4], behavior: 'harmless', glows: false, brightness: 0, rarity: 'common', sizeM: [0.03, 0.7], colors: [0x7E705F, 0x3A322B], shape: 'rockcrawler',
      note: 'A living trilobite. Sizes vary hugely, so finding the biggest one becomes a competition.', move: 'crawl', place: 'floor', groups: 4, speed: 0.06, cap: 12, show: { ext: 1.45, floor: true } }),
    ancient_blindfish: sp({ id: 'ancient_blindfish', name: 'The Old Blind One', type: 'Fish', zones: [4], behavior: 'harmless', glows: false, brightness: 0, rarity: 'legendary', sizeM: [6, 12], colors: [0xC6C1B6, 0x6F6A64], shape: 'ancient_blindfish',
      note: 'A blind fish older than the cave map. It circles the bottom in total darkness and never notices you.', move: 'giant', place: 'bottom', groups: 1, speed: 0.55, cap: 1 })
  };
  var RARITY_CHANCE = { common: 1, uncommon: 0.85, rare: 0.55, very_rare: 0.35, legendary: 1 };
  var BOUNTY = { // Design/Economy and Progression.md, logbook bounties ($)
    species: { common: 25, uncommon: 60, rare: 150, very_rare: 400, legendary: 1000 },
    variant: { common: 10, uncommon: 25, rare: 60, very_rare: 150, legendary: 150 },
    record: { common: 5, uncommon: 10, rare: 25, very_rare: 60, legendary: 60 },
    dangerPhoto: 50, shinyMul: 5
  };
  // Variant logbook lines ('olm:shiny'). They are hidden from Object.keys(SPECIES) but SPECIES['olm:shiny'].name works.
  var VARIANT_NAMES = { shiny: 'golden', juvenile: 'juvenile', giant: 'giant' };
  Object.keys(SPECIES).forEach(function (id) {
    Object.keys(VARIANT_NAMES).forEach(function (v) {
      var base = SPECIES[id];
      Object.defineProperty(SPECIES, id + ':' + v, { enumerable: false, value: { id: id + ':' + v, variantOf: id, variant: v, name: base.name + ' (' + VARIANT_NAMES[v] + ')', type: base.type, zones: base.zones, behavior: base.behavior, glows: base.glows, brightness: base.brightness, rarity: base.rarity, sizeM: base.sizeM, colors: base.colors, shape: base.shape, note: base.note } });
    });
  });
  var IDS = Object.keys(SPECIES);

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var recs = [];            // every creature record this run (the census)
  var groups = [];          // schools and swarms
  var pools = {};           // speciesId -> render pool
  var lantern = { items: [] }, earnings = { logbook: 0, finds: 0 };
  var nextId = 1, time = 0, stepNo = 0, actCount = 0;
  var halo = null, haloN = 0, lights = [];
  var tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), tmpV3 = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
  var m4 = new T.Matrix4(), bx = new T.Vector3(), by = new T.Vector3(), bz = new T.Vector3(), sc3 = new T.Vector3();
  var measureState = { id: null, t: 0, need: 1 };
  var show = null;           // showcase (debug) state

  /* ------------------------------------------------------------------ */
  /* Render pools: one InstancedMesh per species part                    */
  /* ------------------------------------------------------------------ */
  function pool(sid) {
    if (pools[sid]) return pools[sid];
    var s = SPECIES[sid], model = L.models[s.shape]();
    var cap = s.move === 'swarm' ? (s.cap + 1) * s.swarmN : s.cap + 2; // +2 spare slots for debug showcases
    var P = { sid: sid, sp: s, model: model, cap: cap, items: [], meshes: [], count: 0 };
    P.aInst = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4); P.aInst.setUsage(T.DynamicDrawUsage);
    P.iCol = new T.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); P.iCol.setUsage(T.DynamicDrawUsage);
    var bodyMat = L.makeMaterial('body', model.bodyMat), finOpts = Object.assign({ mode: model.bodyMat.mode, wave: model.bodyMat.wave, head: model.bodyMat.head, flut: model.bodyMat.flut, hinge: model.bodyMat.hinge }, model.finMat || {});
    var parts = [[model.body, bodyMat]];
    if (model.fin && !model.fin.empty()) parts.push([model.fin, L.makeMaterial('fin', finOpts)]);
    parts.forEach(function (pt, k) {
      if (pt[0].empty()) return;
      var g = pt[0].geometry(); g.setAttribute('aInst', P.aInst);
      var mesh = new T.InstancedMesh(g, pt[1], cap);
      if (P.meshes.length) mesh.instanceMatrix = P.meshes[0].instanceMatrix; else mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.instanceColor = P.iCol;
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.visible = false;
      mesh.name = 'cr-' + sid + (k ? '-fin' : '');
      mesh.renderOrder = k ? 2 : 0; mesh.layers.enable(SHOW_LAYER);
      TU.scene.add(mesh); P.meshes.push(mesh);
    });
    pools[sid] = P;
    return P;
  }

  /* ------------------------------------------------------------------ */
  /* Records                                                             */
  /* ------------------------------------------------------------------ */
  // Make a creature record. opts: { zone, area, normal, sizeU (0..1), rand, group, debug }
  function makeRec(sid, pos, rand, opts) {
    opts = opts || {}; rand = rand || Math.random;
    var s = SPECIES[sid], su = opts.sizeU != null ? opts.sizeU : (rand() + rand()) / 2;
    var size = s.sizeM[0] + (s.sizeM[1] - s.sizeM[0]) * su;
    var variant = rand() < C.shinyChance ? 'shiny' : su < 0.15 && s.kind === 'fauna' ? 'juvenile' : su > 0.9 && s.kind === 'fauna' ? 'giant' : null;
    if (opts.variant !== undefined) variant = opts.variant;
    var n = opts.normal ? opts.normal.clone().normalize() : Y.clone();
    var c = {
      id: nextId++, speciesId: sid, sp: s, pos: pos.clone(), vel: new T.Vector3(), home: pos.clone(), normal: n,
      dir: new T.Vector3(rand() - 0.5, (rand() - 0.5) * 0.2, rand() - 0.5).normalize(), up: n.clone(),
      sizeM: +size.toFixed(4), scale: size * s.scaleK, zone: opts.zone != null ? opts.zone : U.zoneOfDepth(Math.max(0, -pos.y)), area: opts.area || null,
      variant: variant, shiny: variant === 'shiny',
      seen: false, caught: false, measured: false, photographed: false, flee: 0, hint: {}, active: false,
      ph: rand() * 20, amp: 1, glow: 1, act: 0, spin: rand() * Math.PI * 2, wt: pos.clone(), wtT: 0, cool: 0, warn: 0, warned: false, timer: rand() * 5, st: 'idle', stT: 0,
      group: opts.group || null, rnd: rand(), debug: !!opts.debug, dist: 1e9
    };
    if (s.move === 'swarm') initSwarm(c, rand);
    return c;
  }
  function addRec(c) { recs.push(c); if (c.group) c.group.members.push(c); return c; }

  function initSwarm(c, rand) {
    var n = c.sp.swarmN, off = new Float32Array(n * 3), seed = new Float32Array(n);
    c.swarmR = 0.25 + rand() * 0.45;
    for (var i = 0; i < n; i++) { var a = rand() * Math.PI * 2, b = Math.acos(2 * rand() - 1), r = Math.cbrt(rand()); off[i * 3] = Math.sin(b) * Math.cos(a) * r; off[i * 3 + 1] = Math.cos(b) * r * 0.6; off[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r; seed[i] = rand() * 100; }
    c.swarmOff = off; c.swarmSeed = seed; c.spread = 1;
  }

  /* ------------------------------------------------------------------ */
  /* Spawning (the census)                                               */
  /* ------------------------------------------------------------------ */
  function clear() {
    recs.length = 0; groups.length = 0; actCount = 0;
    for (var k in pools) { pools[k].items.length = 0; pools[k].meshes.forEach(function (m) { m.count = 0; m.visible = false; }); }
    measureState.id = null;
  }
  function zonesPresent(rand) {
    var has = [false, false, false, false, false], any = false;
    for (var z = 0; z < 5; z++) { var s = null; for (var k = 0; k < 2 && !s; k++) s = TU.cave.randomSpot({ zone: z }, rand); has[z] = !!s; any = any || has[z]; }
    if (!any) has[0] = true;
    return has;
  }
  // A spot for a species in a zone. place: water, floor, wall, wallWater (hovering off a wall), ceilingDry, bottom.
  function findSpot(s, zone, rand, deepest) {
    var place = s.place, best = null, tries = deepest ? 3 : 1;
    for (var k = 0; k < tries; k++) {
      var o = { zone: zone };
      if (place === 'floor') o.surface = 'floor'; else if (place === 'wall' || place === 'wallWater') o.surface = rand() < 0.8 ? 'wall' : 'floor'; else o.frac = s.move === 'giant' ? [0, 0.2] : [0.15, 0.65];
      var sp2 = TU.cave.randomSpot(o, rand);
      if (!sp2) continue;
      if (!best || sp2.pos.y < best.pos.y) best = sp2;
    }
    if (!best) return null;
    // Hovering predators sit a little off the wall, facing out.
    if (place === 'wallWater') best.pos.addScaledVector(best.normal, 0.35 + rand() * 0.3);
    // Water creatures must be in water.
    if ((place === 'water' || place === 'wallWater') && TU.cave.isDry(best.pos)) return null;
    return best;
  }
  // Ceiling spots in dry air (air pockets and dry chambers), found with raycasts from the cave features.
  // Dry chambers come first (big dry ceilings, the "night sky"), then air pocket domes. Sources in the
  // asked depth zone are preferred; if there are none, any dry ceiling will do.
  function dryCeilingSpots(rand, n, zone) {
    var out = [], F = TU.cave.features || {}, all = [];
    (F.dryChambers || []).forEach(function (d) { all.push({ pos: d.pos, r: d.size ? Math.max(d.size.x, d.size.z) * 0.45 : 5, y: d.floorY != null ? d.floorY + 1 : d.pos.y, dry: true }); });
    (F.airPockets || []).forEach(function (a) { all.push({ pos: a.pos, r: a.radius || 6, y: (a.surfaceY != null ? a.surfaceY : a.pos.y) + 0.3 }); });
    var srcs = zone == null ? all : all.filter(function (q) { return U.zoneOfDepth(Math.max(0, -q.y)) === zone; });
    if (!srcs.length) srcs = all;
    for (var i = 0; i < n * 6 && out.length < n && srcs.length; i++) {
      var s = srcs[i % srcs.length], a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * s.r * 0.8;
      var o = new T.Vector3(s.pos.x + Math.cos(a) * d, s.y, s.pos.z + Math.sin(a) * d);
      if (!TU.cave.contains(o, 0.1) && !TU.cave.isDry(o)) continue;
      var up = TU.cave.raycast(o, Y, 25);
      if (up >= 25 || up < 0.4) continue;
      var p = o.clone().addScaledVector(Y, up - 0.02);
      if (!TU.cave.isDry(p.clone().addScaledVector(Y, -0.15))) continue;
      out.push({ pos: p, normal: new T.Vector3(0, -1, 0), zone: U.zoneOfDepth(Math.max(0, -p.y)), area: null });
    }
    return out;
  }

  // Build the census for a run. Deterministic per seed (rng stream 20).
  function census(seed) {
    clear();
    var rand = TU.rng((seed || 1) >>> 0, 20).fn();
    var has = zonesPresent(rand), maxZ = 0; for (var z = 0; z < 5; z++) if (has[z]) maxZ = z;
    var diff = TU.run && TU.run.difficulty === 'easy' ? 1.2 : 1;
    IDS.forEach(function (sid) {
      var s = SPECIES[sid];
      if (s.place === 'bottom') return; // the giant is placed below
      var zones = [];
      s.zones.forEach(function (zz) { if (has[zz]) zones.push([zz, 1]); else if (zz > maxZ && zones.every(function (q) { return q[0] !== maxZ; })) zones.push([maxZ, 0.5]); });
      zones.forEach(function (zq) {
        var zone = zq[0], spill = zq[0] !== s.zones[0] && !has[s.zones[0]], nG = Math.max(1, Math.round(s.groups * zq[1] * diff));
        if (s.place === 'ceilingDry') {
          dryCeilingSpots(rand, nG, zone).forEach(function (spt) { if (rand() < RARITY_CHANCE[s.rarity]) addRec(makeRec(sid, spt.pos, rand, { zone: spt.zone, normal: spt.normal })); });
          return;
        }
        for (var g = 0; g < nG; g++) {
          if (rand() > RARITY_CHANCE[s.rarity]) continue;
          var spot = findSpot(s, zone, rand, spill);
          if (!spot) continue;
          spawnGroup(sid, spot, rand);
        }
      });
    });
    placeGiant(rand);
  }
  // One spawn group at a spot: schools get a shared group object, others spawn singles around the spot.
  function spawnGroup(sid, spot, rand) {
    var s = SPECIES[sid], n = s.group[0] + Math.floor(rand() * (s.group[1] - s.group[0] + 1)), out = [];
    var grp = null;
    if (s.move === 'school' || s.move === 'shrimp' || s.move === 'jelly') { grp = { id: groups.length, sid: sid, center: spot.pos.clone(), home: spot.pos.clone(), vel: new T.Vector3(), target: spot.pos.clone(), tT: 0, flee: 0, members: [], hint: {} }; groups.push(grp); }
    var su = (rand() + rand()) / 2; // a school shares a size class
    for (var i = 0; i < n; i++) {
      var p = spot.pos.clone();
      if (n > 1) p.add(new T.Vector3((rand() - 0.5) * 1.2, (rand() - 0.5) * 0.6, (rand() - 0.5) * 1.2));
      var c = makeRec(sid, p, rand, { zone: spot.zone, area: spot.area, normal: spot.normal, group: grp, sizeU: grp ? clamp(su + (rand() - 0.5) * 0.3, 0, 1) : undefined });
      if (grp) c.off = new T.Vector3((rand() - 0.5) * 1.4, (rand() - 0.5) * 0.6, (rand() - 0.5) * 1.4);
      if (s.place === 'wall' || s.place === 'floor') c.spin = rand() * Math.PI * 2;
      out.push(addRec(c));
    }
    return out;
  }
  // The giant circles the bottom landmark (or the deepest open water if there is none).
  function placeGiant(rand) {
    var F = TU.cave.features || {}, b = F.bottom, center = b ? b.pos.clone() : null;
    if (!center) { var sp2 = findSpot(SPECIES.ancient_blindfish, 4, rand, true) || TU.cave.randomSpot({ frac: [0, 0.2] }, rand); if (!sp2) return; center = sp2.pos.clone(); }
    // how much room: the shortest horizontal ray around the center
    var R = 30;
    for (var k = 0; k < 12; k++) { var a = k / 12 * Math.PI * 2; R = Math.min(R, TU.cave.raycast(center, tmpV.set(Math.cos(a), 0, Math.sin(a)), 30)); }
    var orbit = clamp(R * 0.62, 2.0, 16), up = TU.cave.raycast(center, Y, 20), down = TU.cave.raycast(center, tmpV.set(0, -1, 0), 20);
    var size = clamp(orbit * 1.35, 5.5, 12);
    var c = makeRec('ancient_blindfish', center.clone().add(new T.Vector3(orbit, (up - down) * 0.25 + 0.6, 0)), rand, { zone: 4, sizeU: (size - 6) / 6 });
    c.sizeM = +clamp(size, 6, 12).toFixed(2); c.scale = size; c.orbit = { c: center, r: orbit, y: center.y + (up - down) * 0.25 + 0.6 + Math.min(1.5, up * 0.2), a: 0 };
    c.zone = U.zoneOfDepth(Math.max(0, -center.y));
    addRec(c);
  }

  // Contract: spawn count creatures in a zone (or area). opts: { area, species: id or [ids], frac, pick(rand) }.
  function spawnForZone(zone, count, rand, opts) {
    opts = opts || {}; rand = rand || Math.random;
    var out = [], pool2 = opts.species ? [].concat(opts.species) : IDS.filter(function (k) { return zone == null || SPECIES[k].zones.indexOf(zone) >= 0; });
    if (!pool2.length) pool2 = IDS;
    for (var k = 0; k < count; k++) {
      var sid = opts.pick ? opts.pick(rand) : pool2[Math.floor(rand() * pool2.length)], s = SPECIES[sid];
      if (!s) continue;
      var o = { area: opts.area, zone: opts.area ? undefined : zone, frac: opts.frac || [0.25, 0.8] };
      if (s.place === 'floor') o.surface = 'floor'; else if (s.place === 'wall') o.surface = 'wall';
      var spot = TU.cave.randomSpot(o, rand);
      if (!spot) continue;
      out.push(addRec(makeRec(sid, spot.pos, rand, { zone: spot.zone, area: spot.area, normal: spot.normal })));
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Activation (only nearby creatures are simulated and drawn)          */
  /* ------------------------------------------------------------------ */
  function activation(ppos) {
    var n = 0;
    for (var i = 0; i < recs.length; i++) {
      var c = recs[i]; if (c.caught) { c.active = false; continue; }
      c.dist = c.pos.distanceTo(ppos);
      var big = c.sp.move === 'giant' ? 30 : 0;
      if (c.active) { if (c.dist > C.sleepRadius + big) c.active = false; }
      else if (c.dist < C.activeRadius + big) c.active = true;
      if (c.active) n++;
    }
    // too many: put the farthest to sleep
    if (n > C.maxActive) {
      var act = recs.filter(function (c) { return c.active; }).sort(function (a, b) { return a.dist - b.dist; });
      for (i = C.maxActive; i < act.length; i++) act[i].active = false;
      n = C.maxActive;
    }
    actCount = n;
  }

  /* ------------------------------------------------------------------ */
  /* Behavior                                                            */
  /* ------------------------------------------------------------------ */
  var EV = { attack: 'creature:attack', warn: 'creature:warn' };
  function attack(c, kind, o) {
    var P = TU.player.state;
    var payload = { id: c.id, speciesId: c.speciesId, kind: kind, severity: o.severity, injury: o.injury || null, panic: o.panic || 0, lightFlicker: o.lightFlicker || 0, blur: o.blur || 0, gore: !!o.gore, radius: o.radius || 0, pos: c.pos.clone(), dir: tmpV.subVectors(P.pos, c.pos).normalize().clone() };
    TU.emit(EV.attack, payload);
    if (TU.fx && TU.fx.shake) TU.fx.shake(0.4 + o.severity);
    return payload;
  }
  function warn(c, kind) { if (c.warned) return; c.warned = true; TU.emit(EV.warn, { id: c.id, speciesId: c.speciesId, kind: kind, pos: c.pos.clone() }); }
  function startFlee(c, dur) { if (c.flee <= 0) TU.emit('creature:fled', { id: c.id, speciesId: c.speciesId }); c.flee = dur; }

  function lampOn(c, d) {
    var lamp = TU.player.lamp; if (!lamp || !lamp.pos || !(lamp.on > 0.3)) return false;
    tmpV2.subVectors(c.pos, lamp.pos); var dl = tmpV2.length(); if (dl > 5) return false;
    return tmpV2.divideScalar(dl || 1).dot(lamp.dir) > 0.94;
  }
  // Steer velocity toward a desired velocity with a max acceleration (m/s^2).
  function steer(c, dx, dy, dz, accel, dt) {
    var ex = dx - c.vel.x, ey = dy - c.vel.y, ez = dz - c.vel.z, l = Math.sqrt(ex * ex + ey * ey + ez * ez), m = accel * dt;
    if (l > m) { ex *= m / l; ey *= m / l; ez *= m / l; }
    c.vel.x += ex; c.vel.y += ey; c.vel.z += ez;
  }
  function seek(c, target, speed, accel, dt, slowR) {
    tmpV.subVectors(target, c.pos); var d = tmpV.length(); if (d < 1e-4) { steer(c, 0, 0, 0, accel, dt); return d; }
    var sp2 = speed * (slowR ? Math.min(1, d / slowR) : 1);
    steer(c, tmpV.x / d * sp2, tmpV.y / d * sp2, tmpV.z / d * sp2, accel, dt); return d;
  }
  function newWander(c, range, flat, rand) {
    rand = rand || Math.random;
    c.wt.set(c.home.x + (rand() - 0.5) * 2 * range, c.home.y + (rand() - 0.5) * 2 * range * (flat == null ? 0.35 : flat), c.home.z + (rand() - 0.5) * 2 * range);
    c.wtT = 4 + rand() * 6;
  }
  // Keep a swimmer in the water and off the rock (checked every few steps to save time).
  function keepInWater(c, rad, i) {
    if ((i + stepNo) % 3 !== 0) return;
    var hit = TU.cave.collide(c.pos, rad, { vel: c.vel, hint: c.hint });
    if (hit.hit) { c.pos.copy(hit.pos); if (hit.vel) c.vel.copy(hit.vel).multiplyScalar(0.6); c.wtT = 0; }
    if ((i + stepNo) % 6 === 0) { var sy = TU.cave.waterSurfaceY(c.pos); if (sy != null && c.pos.y > sy - rad - 0.1) { c.pos.y = sy - rad - 0.1; if (c.vel.y > 0) c.vel.y = 0; } }
  }
  // Re-snap a crawler to the rock under it (along its surface normal).
  function snapToRock(c, i) {
    if ((i + stepNo) % 5 !== 0) return;
    var n = c.up, lift = c.scale * (c.sp.lift || 0.13);
    tmpV.copy(c.pos).addScaledVector(n, 0.3 + lift);
    var d = TU.cave.raycast(tmpV, tmpV2.copy(n).negate(), 1.6 + lift);
    if (d < 1.6 + lift) c.pos.copy(tmpV).addScaledVector(n, -d + lift);
  }

  // One school or shrimp cloud: the group center wanders; members swim to center + their offset.
  function stepGroup(g, dt, P) {
    var s = SPECIES[g.sid], d = g.center.distanceTo(P.pos);
    g.tT -= dt;
    if (g.flee > 0) g.flee -= dt;
    var scared = (P.speed > C.fleeSpeed && d < C.fleeDist) || (s.sight && d < 4.5 && TU.player.lamp && TU.player.lamp.on > 0.3 && (function () { tmpV2.subVectors(g.center, TU.player.lamp.pos).normalize(); return tmpV2.dot(TU.player.lamp.dir) > 0.93; })());
    if (scared && s.behavior !== 'harmless') { if (g.flee <= 0) g.members.forEach(function (c) { if (c.active) startFlee(c, 2.5); }); g.flee = 2.5 + Math.random(); }
    var spd = s.speed;
    if (g.flee > 0) { tmpV.subVectors(g.center, P.pos).normalize(); g.target.copy(g.center).addScaledVector(tmpV, 4); spd = s.speed * 3.2; g.tT = 1; }
    else if (s.curious && d < 6 && P.speed < 0.7) { tmpV.subVectors(g.center, P.pos).normalize(); g.target.copy(P.pos).addScaledVector(tmpV, 1.1); spd = s.speed * 0.8; }
    else if (g.tT <= 0 || g.center.distanceTo(g.target) < 0.5) { g.target.set(g.home.x + (Math.random() - 0.5) * 7, g.home.y + (Math.random() - 0.5) * 2, g.home.z + (Math.random() - 0.5) * 7); g.tT = 5 + Math.random() * 6; }
    tmpV.subVectors(g.target, g.center); var l = tmpV.length();
    if (l > 0.01) g.vel.lerp(tmpV.multiplyScalar(spd / l), 1 - Math.exp(-dt * 1.5)); else g.vel.multiplyScalar(0.9);
    g.center.addScaledVector(g.vel, dt);
    if (stepNo % 4 === 0) { var hit = TU.cave.collide(g.center, 0.8, { hint: g.hint }); if (hit.hit) { g.center.copy(hit.pos); g.tT = 0; } var sy = TU.cave.waterSurfaceY(g.center); if (sy != null && g.center.y > sy - 0.8) g.center.y = sy - 0.8; }
  }

  function stepCreature(c, i, dt, P) {
    var s = c.sp, d = c.dist = c.pos.distanceTo(P.pos);
    c.cool -= dt; c.timer -= dt; c.stT += dt;
    if (c.flee > 0) c.flee -= dt;
    var baseGlow = 0.8 + 0.2 * Math.sin(time * (Math.PI * 2 / (3 + c.rnd * 3)) + c.ph);
    var animRate = 1, amp = 1, act = 0;
    switch (s.move) {
      case 'school': case 'shrimp': {
        var g = c.group;
        if (g) {
          var drift = tmpV3.set(Math.sin(time * 0.5 + c.rnd * 9) * 0.25, Math.sin(time * 0.37 + c.rnd * 5) * 0.12, Math.cos(time * 0.43 + c.rnd * 7) * 0.25);
          var tgt = tmpV2.copy(g.center).add(c.off).add(drift).multiplyScalar(1);
          if (s.move === 'shrimp' && c.timer <= 0) { c.vel.add(new T.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).multiplyScalar(0.35)); c.timer = 1 + Math.random() * 3; }
          seek(c, tgt, s.speed * (g.flee > 0 ? 4 : 1.6), g.flee > 0 ? 6 : 1.5, dt, 0.6);
          c.vel.addScaledVector(g.vel, dt * 0.8);
        }
        if (d < 0.5) { tmpV.subVectors(c.pos, P.pos).normalize(); c.vel.addScaledVector(tmpV, dt * 2); }
        amp = 0.6 + Math.min(1.6, c.vel.length() / (s.speed + 0.01)); animRate = 1 + c.vel.length() * 6 / (s.scaleK * c.scale * 10 + 0.3);
        c.vel.multiplyScalar(Math.exp(-dt * 0.8));
        keepInWater(c, Math.max(0.05, c.scale * 0.3), i);
        break;
      }
      case 'swim': {
        if (s.curious && d < 7 && P.speed < 0.7 && c.flee <= 0) { tmpV.subVectors(c.pos, P.pos).normalize(); seek(c, tmpV2.copy(P.pos).addScaledVector(tmpV, 1.2 + c.scale), s.speed, 0.3, dt, 1); }
        else {
          if (c.wtT <= 0 || c.pos.distanceTo(c.wt) < 0.3) newWander(c, s.speedRange || (1 + c.scale * 2), 0.3);
          c.wtT -= dt;
          seek(c, c.wt, s.speed, 0.3, dt, 0.5);
        }
        if (s.id === 'remipede') { // venom bite if you hover your hands right on it
          if (d < 0.5) { c.warn += dt; if (c.warn > 1.0 && c.cool <= 0) { attack(c, 'venom', { severity: 0.2, panic: 20, blur: 2.0 }); c.cool = 8; c.warn = 0; startFlee(c, 2); } } else c.warn = Math.max(0, c.warn - dt);
        }
        if (P.speed > C.fleeSpeed && d < 3 && s.behavior !== 'harmless') startFlee(c, 2);
        if (c.flee > 0) { tmpV.subVectors(c.pos, P.pos).normalize(); steer(c, tmpV.x * s.speed * 4, tmpV.y * s.speed * 4, tmpV.z * s.speed * 4, 2, dt); }
        // lobefin "headstand": now and then it hangs still, nose down
        if (s.id === 'deep_lobefin') { if (c.st === 'idle' && c.timer <= 0) { c.st = 'stand'; c.stT = 0; c.timer = 12 + Math.random() * 10; } if (c.st === 'stand') { c.vel.multiplyScalar(Math.exp(-dt * 2)); if (c.stT > 7) c.st = 'idle'; } }
        amp = 0.5 + Math.min(1.5, c.vel.length() / (s.speed + 0.01));
        c.vel.multiplyScalar(Math.exp(-dt * 0.5));
        keepInWater(c, clamp(c.scale * 0.22, 0.03, 0.5), i);
        break;
      }
      case 'eel': {
        if (c.wtT <= 0 || c.pos.distanceTo(c.wt) < 0.5) newWander(c, 5, 0.25);
        c.wtT -= dt;
        var spd = s.speed;
        if (s.id === 'volt_eel') {
          // warning crackle when you come close, then a shock that also flickers your light
          if (d < 3.6 && c.cool <= 0) { c.warn += dt; warn(c, 'shock'); }
          else { c.warn = Math.max(0, c.warn - dt * 0.5); if (d > 5) c.warned = false; }
          if (c.cool <= 0 && ((d < 1.9 && c.warn > 0.9) || d < 1.0)) {
            attack(c, 'shock', { severity: clamp(1.25 - d / 2.4, 0.3, 1), panic: 35, lightFlicker: 2.5, radius: 3 });
            c.cool = 7; c.warn = 0; c.shockT = 0.45; startFlee(c, 3);
          }
          if (c.shockT > 0) c.shockT -= dt;
        } else if (P.speed > C.fleeSpeed && d < 4) startFlee(c, 2.5);
        if (c.flee > 0) { tmpV.subVectors(c.pos, P.pos).normalize(); c.wt.copy(c.pos).addScaledVector(tmpV, 3); spd *= 3; }
        seek(c, c.wt, spd, 0.5, dt, 0.8);
        amp = 0.7 + Math.min(1.2, c.vel.length() / (s.speed + 0.01)); animRate = 0.8 + c.vel.length() * 1.5;
        c.vel.multiplyScalar(Math.exp(-dt * 0.6));
        keepInWater(c, clamp(c.scale * 0.06, 0.04, 0.2), i);
        break;
      }
      case 'crawl': {
        var sp3 = s.speed || 0.04;
        if (s.id === 'entrance_crayfish') {
          // territorial: claws up and snapping when you hover close, a pinch if you stay
          if (d < 1.5) { c.warn += dt; warn(c, 'pinch'); act = 0.45 + 0.35 * Math.sin(time * 9 + c.ph) * Math.sin(time * 3.1); }
          else { c.warn = Math.max(0, c.warn - dt); if (d > 2.5) c.warned = false; }
          if (c.warn > 1.3 && d < 1.05 && c.cool <= 0) { attack(c, 'pinch', { severity: 0.25, injury: 'cut', panic: 12 }); c.cool = 4; c.snapT = 0.25; }
          if (c.snapT > 0) { c.snapT -= dt; act = 1; }
          sp3 = d < 1.5 ? 0 : 0.04;
        }
        var wantPlayer = s.id === 'giant_isopod' && P.injuries && P.injuries.length > 0 && d < 12;
        if (c.st === 'pause') { if (c.stT > 3 + c.rnd * 4) { c.st = 'idle'; c.stT = 0; } sp3 = 0; }
        else if (c.stT > 5 + c.rnd * 6 && !wantPlayer) { c.st = 'pause'; c.stT = 0; }
        if (wantPlayer) c.wt.copy(P.pos);
        else if (c.wtT <= 0 || c.pos.distanceTo(c.wt) < 0.1) newWander(c, Math.max(0.5, c.scale * 6), 1);
        c.wtT -= dt;
        // move in the plane of the rock
        tmpV.subVectors(c.wt, c.pos); tmpV.addScaledVector(c.up, -tmpV.dot(c.up)); var l2 = tmpV.length();
        if (l2 > 0.02 && sp3 > 0) { tmpV.multiplyScalar(1 / l2); c.dir.lerp(tmpV, 1 - Math.exp(-dt * 1.5)).normalize(); c.pos.addScaledVector(c.dir, sp3 * dt * (wantPlayer ? 2 : 1)); animRate = 1; amp = 1; }
        else { animRate = 0.05; amp = 0.3; }
        if (d < 1.3 && s.id === 'entrance_crayfish') { tmpV.subVectors(P.pos, c.pos); tmpV.addScaledVector(c.up, -tmpV.dot(c.up)); if (tmpV.lengthSq() > 1e-4) c.dir.lerp(tmpV.normalize(), 1 - Math.exp(-dt * 3)).normalize(); }
        if (c.pos.distanceTo(c.home) > Math.max(1.2, c.scale * 8) && !wantPlayer) c.wt.copy(c.home);
        snapToRock(c, i);
        break;
      }
      case 'jelly': {
        // drift with bell pulses: each squeeze pushes up a little, then it sinks slowly
        var pulsePh = (c.ph % (Math.PI * 2));
        var push = Math.max(0, Math.sin(c.ph)) * 0.06;
        var g2 = c.group;
        var home = g2 ? tmpV2.copy(g2.center).add(c.off) : c.home;
        tmpV.subVectors(home, c.pos);
        c.vel.x += tmpV.x * 0.02 * dt; c.vel.z += tmpV.z * 0.02 * dt; c.vel.y += (push - 0.012 + tmpV.y * 0.02) * dt;
        c.vel.multiplyScalar(Math.exp(-dt * 0.7));
        if (d < 0.8) { tmpV.subVectors(c.pos, P.pos).normalize(); c.vel.addScaledVector(tmpV, dt * 0.3); }
        animRate = 1; amp = 1;
        keepInWater(c, clamp(c.scale * 0.5, 0.05, 0.3), i);
        break;
      }
      case 'swarm': {
        if ((P.speed > 0.9 && d < 4) || d < 0.9) { if (c.flee <= 0) startFlee(c, 1.6); c.flash = 1.6; }
        if (c.flash > 0) c.flash -= dt;
        if (c.wtT <= 0 || c.pos.distanceTo(c.wt) < 0.4) newWander(c, 2.5, 0.4);
        c.wtT -= dt;
        if (c.flee > 0) { tmpV.subVectors(c.pos, P.pos).normalize(); steer(c, tmpV.x * 0.8, tmpV.y * 0.8, tmpV.z * 0.8, 2, dt); } else seek(c, c.wt, s.speed, 0.2, dt, 1);
        c.spread = lerp(c.spread, c.flash > 0 ? 1.7 : 1, 1 - Math.exp(-dt * 2));
        c.vel.multiplyScalar(Math.exp(-dt * 0.6));
        keepInWater(c, 0.3, i);
        baseGlow = c.flash > 0 ? 2.6 : 0.7 + 0.3 * Math.sin(time * 1.3 + c.ph);
        break;
      }
      case 'drift': {
        // nautilus style: hovers, bobs, small backward jet pulses
        if (c.wtT <= 0) newWander(c, 2, 0.5);
        c.wtT -= dt;
        var jet = Math.pow(Math.max(0, Math.sin(time * 1.1 + c.ph)), 6);
        seek(c, c.wt, s.speed * (0.4 + jet * 2), 0.25, dt, 1);
        c.vel.y += Math.sin(time * 0.6 + c.ph) * 0.01 * dt;
        c.vel.multiplyScalar(Math.exp(-dt * 0.8));
        if (d < 1.5 && P.speed > 0.9) startFlee(c, 2);
        keepInWater(c, clamp(c.scale * 0.4, 0.05, 0.3), i);
        animRate = 1; amp = 1;
        break;
      }
      case 'ambush': {
        // lure predator: hangs still by a wall; if you swim right up to the lure it lunges and bites
        var lure = lurePos(c, tmpV3);
        var dl = lure.distanceTo(P.pos);
        if (c.st === 'idle') {
          c.vel.multiplyScalar(Math.exp(-dt * 2)); seek(c, c.home, 0.05, 0.1, dt, 0.5);
          if (dl < 0.45 + c.scale * 0.35 && c.cool <= 0) { c.st = 'lunge'; c.stT = 0; c.lungeFrom = c.pos.clone(); }
        } else if (c.st === 'lunge') {
          act = smooth(0, 0.12, c.stT);
          tmpV.subVectors(P.pos, c.pos).normalize(); c.dir.lerp(tmpV, 1 - Math.exp(-dt * 12)).normalize();
          c.pos.addScaledVector(c.dir, dt * 3.5 * (c.stT < 0.18 ? 1 : 0));
          if (c.stT > 0.18 && !c.bit) {
            c.bit = true;
            var mouth = tmpV2.copy(c.pos).addScaledVector(c.dir, c.scale * 0.45);
            if (mouth.distanceTo(P.pos) < c.scale * 0.55 + 0.55) attack(c, 'bite', { severity: 0.7, injury: 'bite', panic: 45, gore: true });
          }
          if (c.stT > 0.35) { c.st = 'back'; c.stT = 0; c.bit = false; }
        } else if (c.st === 'back') {
          act = 1 - smooth(0, 0.6, c.stT);
          seek(c, c.home, 0.3, 1, dt, 0.4); c.vel.multiplyScalar(Math.exp(-dt * 1.5));
          if (c.stT > 1.8) { c.st = 'idle'; c.cool = 5; c.dir.lerp(c.normal, 0.5).normalize(); }
        }
        if (c.st === 'idle') { c.dir.lerp(c.normal, 1 - Math.exp(-dt * 0.5)).normalize(); act = 0.05 + 0.05 * Math.sin(time * 0.7 + c.ph); }
        keepInWater(c, clamp(c.scale * 0.2, 0.1, 0.4), i);
        amp = c.st === 'idle' ? 0.25 : 1.2; animRate = c.st === 'idle' ? 0.4 : 2;
        baseGlow = 0.85 + 0.15 * Math.sin(time * 1.2 + c.ph);
        break;
      }
      case 'giant': {
        var o = c.orbit; if (!o) break;
        o.a += dt * s.speed / Math.max(1, o.r);
        var tx = o.c.x + Math.cos(o.a) * o.r, tz = o.c.z + Math.sin(o.a) * o.r, ty = o.y + Math.sin(o.a * 2.3) * 0.5;
        seek(c, tmpV2.set(tx, ty, tz), s.speed * 1.4, 0.4, dt, 2);
        c.pos.addScaledVector(c.vel, 0); // position integrated below
        amp = 0.8; animRate = 0.45;
        if (c.seen && !c.awe) { c.awe = true; TU.emit('ui:msg', { text: 'Something enormous circles in the dark.', dur: 4 }); }
        break;
      }
      case 'still': default: {
        // plants and patches: react to touch (flash then dim), glowworms dim when disturbed
        if (d < 0.8 && P.speed > 0.4) c.flash = 1.2;
        if (c.flash > 0) c.flash -= dt;
        if (s.id === 'starlight_glowworm') { var dis = (d < 3 && P.speed > 0.6) || d < 0.6; c.dim = lerp(c.dim || 1, dis ? 0.15 : 1, 1 - Math.exp(-dt * (dis ? 3 : 0.25))); baseGlow *= c.dim; }
        else if (c.flash > 0) baseGlow = 1 + c.flash * 1.4;
        if (s.id === 'sulfur_bloom_mat' && d < c.scale * 0.6 + 0.4 && P.speed > 0.6 && c.cool <= 0 && TU.fx && TU.fx.spawnSilt) { TU.fx.spawnSilt(70, { pos: c.pos.clone(), burst: true }); c.cool = 3; }
        animRate = 1; amp = 1;
        break;
      }
    }
    if (s.move !== 'crawl' && s.move !== 'still') c.pos.addScaledVector(c.vel, dt);
    if (s.move === 'ambush' || s.move === 'giant') c.pos.addScaledVector(c.vel, 0); // already moved above
    // heading follows velocity for swimmers
    var vl = c.vel.length();
    if (s.move !== 'crawl' && s.move !== 'still' && s.move !== 'ambush' && vl > 0.01) {
      tmpV.copy(c.vel).divideScalar(vl);
      if (s.move === 'jelly' || s.move === 'swarm') tmpV.y = 0;
      if (s.id === 'glass_shrimp' && c.flee > 0) tmpV.negate(); // shrimp flick away tail first
      if (tmpV.lengthSq() > 1e-4) c.dir.lerp(tmpV.normalize(), 1 - Math.exp(-dt * (s.move === 'giant' ? 0.6 : 3))).normalize();
    }
    if (s.id === 'deep_lobefin' && c.st === 'stand') c.dir.lerp(tmpV.set(c.dir.x * 0.3, -1, c.dir.z * 0.3).normalize(), 1 - Math.exp(-dt * 0.6)).normalize();
    c.amp = lerp(c.amp, amp, 1 - Math.exp(-dt * 3));
    c.ph += dt * animRate * animSpeed(s) * (0.7 + 0.3 * c.amp);
    if (s.id === 'volt_eel') { var cr = smooth(0, 1.2, c.warn); baseGlow = (c.shockT > 0 ? 6 : 0) + cr * (Math.random() < 0.35 ? 2.2 : 0.3) + 0.04; }
    if (s.move !== 'ambush' && s.id !== 'entrance_crayfish') act = c.act * Math.exp(-dt * 4);
    c.act = act;
    c.glow = baseGlow * (c.shiny ? 1.5 : 1);
    // "seen": close and near the middle of the view (first time only)
    if (!c.seen && d < C.seenDist + c.scale) {
      var cam = TU.camera; tmpV.subVectors(c.pos, cam.position).normalize(); tmpV2.set(0, 0, -1).applyQuaternion(cam.quaternion);
      if (tmpV.dot(tmpV2) > C.seenDot) { c.seen = true; TU.emit('creature:seen', { id: c.id, speciesId: c.speciesId, variant: c.variant }); }
    }
  }
  // Animation speed (radians of body wave per second) per kind of movement.
  function animSpeed(s) { return s.move === 'jelly' ? 1.6 : s.move === 'crawl' ? 3.5 : s.move === 'still' ? 1 : s.move === 'swarm' ? 1 : s.move === 'giant' ? 3 : s.move === 'eel' ? 5 : s.move === 'drift' ? 1.2 : 7; }

  // World position of the lure (for the Lanternjaw) or the creature center.
  function lurePos(c, out) {
    var lm = pool(c.speciesId).model.lure;
    if (!lm) return out.copy(c.pos);
    basis(c);
    return out.set(lm[0], lm[1], lm[2]).multiplyScalar(c.scale).applyMatrix4(m4);
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */
  // Build m4 (position, orientation, scale) for a record. Models face +Z with +Y up.
  function basis(c) {
    var s = c.sp, sc = c.drawScale || c.scale;
    if (s.move === 'still' || (s.place === 'floor' && s.move === 'crawl') || s.move === 'crawl') {
      by.copy(c.up);
      if (s.move === 'still') { tmpV.set(Math.cos(c.spin), 0, Math.sin(c.spin)); if (Math.abs(tmpV.dot(by)) > 0.9) tmpV.set(1, 0, 0); bz.copy(tmpV).addScaledVector(by, -tmpV.dot(by)).normalize(); }
      else { bz.copy(c.dir).addScaledVector(by, -c.dir.dot(by)); if (bz.lengthSq() < 1e-5) bz.set(1, 0, 0).addScaledVector(by, -by.x); bz.normalize(); }
    } else if (s.move === 'jelly') {
      by.set(c.vel.x * 2, 1, c.vel.z * 2).normalize(); bz.set(Math.cos(c.spin + time * 0.05), 0, Math.sin(c.spin + time * 0.05)); bz.addScaledVector(by, -bz.dot(by)).normalize();
    } else {
      bz.copy(c.dir); by.copy(Y).addScaledVector(bz, -bz.dot(Y)); if (by.lengthSq() < 1e-5) by.set(0, 0, 1); by.normalize();
      // bank a little into turns
      if (s.upsideDown) by.negate();
    }
    bx.crossVectors(by, bz).normalize(); by.crossVectors(bz, bx);
    m4.makeBasis(bx, by, bz); m4.scale(sc3.set(sc, sc, sc)); m4.setPosition(c.pos);
    return m4;
  }
  var _hm = new T.Matrix4(), _hv = new T.Vector3(), _col = new T.Color();
  function draw() {
    var lists = {}, k;
    for (k in pools) pools[k].items.length = 0;
    if (show) show.recs.forEach(function (c) { pool(c.speciesId).items.push(c); });
    for (var i = 0; i < recs.length; i++) { var c = recs[i]; if (c.active && !c.caught) pool(c.speciesId).items.push(c); }
    haloN = 0;
    for (k in pools) {
      var P = pools[k], s = P.sp, items = P.items, n = 0, ai = P.aInst.array, ci = P.iCol.array, im = P.meshes[0] && P.meshes[0].instanceMatrix.array;
      if (!im) continue;
      for (i = 0; i < items.length && n < P.cap; i++) {
        var c2 = items[i];
        var tint = c2.shiny ? (s.shinyTint || (luminance(s.colors[0]) < 0.25 ? [2.4, 2.0, 1.2] : [1.25, 1.0, 0.42])) : null;
        if (s.move === 'swarm') { n = drawSwarm(P, c2, n, ai, ci, im, tint); continue; }
        basis(c2);
        m4.toArray(im, n * 16);
        ai[n * 4] = c2.ph; ai[n * 4 + 1] = c2.amp; ai[n * 4 + 2] = c2.glow; ai[n * 4 + 3] = c2.act;
        ci[n * 3] = tint ? tint[0] : 1; ci[n * 3 + 1] = tint ? tint[1] : 1; ci[n * 3 + 2] = tint ? tint[2] : 1;
        n++;
        if (s.glows && P.model.halos && halo) addHalos(P, c2, s);
      }
      P.count = n;
      P.meshes.forEach(function (m) { m.count = n; m.visible = n > 0; });
      if (n) { P.meshes[0].instanceMatrix.needsUpdate = true; P.aInst.needsUpdate = true; P.iCol.needsUpdate = true; }
    }
    if (halo) {
      var ha = halo.geometry.attributes;
      for (i = haloN; i < C.halos; i++) ha.aAlpha.array[i] = 0;
      ha.position.needsUpdate = ha.aSize.needsUpdate = ha.aAlpha.needsUpdate = ha.aCol.needsUpdate = true;
    }
  }
  function luminance(hex) { _col.setHex(hex); return 0.3 * _col.r + 0.59 * _col.g + 0.11 * _col.b; }
  var _swCol = new T.Color();
  function drawSwarm(P, c, n, ai, ci, im, tint) {
    var s = c.sp, N = s.swarmN, R = c.swarmR * c.spread * (c.showSpread || 1), sc = c.drawScale || c.scale, gl = _swCol.setHex(s.glow);
    for (var j = 0; j < N && n < P.cap; j++) {
      var sd = c.swarmSeed[j], ox = c.swarmOff[j * 3], oy = c.swarmOff[j * 3 + 1], oz = c.swarmOff[j * 3 + 2];
      var t = time * (0.6 + (sd % 1) * 0.6) + sd;
      _hv.set(c.pos.x + (ox + Math.sin(t) * 0.25) * R, c.pos.y + (oy + Math.sin(t * 1.3) * 0.2) * R, c.pos.z + (oz + Math.cos(t * 0.9) * 0.25) * R);
      bz.set(Math.cos(t * 0.9) * 0.9, 0.2 * Math.sin(t), -Math.sin(t) * 0.9).normalize(); by.copy(Y).addScaledVector(bz, -bz.dot(Y)).normalize(); bx.crossVectors(by, bz);
      m4.makeBasis(bx, by, bz); m4.scale(sc3.set(sc, sc, sc)); m4.setPosition(_hv);
      m4.toArray(im, n * 16);
      var flick = 0.6 + 0.4 * Math.sin(time * (2 + (sd % 3)) + sd * 7);
      ai[n * 4] = c.ph + sd; ai[n * 4 + 1] = 1; ai[n * 4 + 2] = c.glow * flick; ai[n * 4 + 3] = 0;
      ci[n * 3] = tint ? tint[0] : 1; ci[n * 3 + 1] = tint ? tint[1] : 1; ci[n * 3 + 2] = tint ? tint[2] : 1;
      n++;
      if (halo && haloN < C.halos) putHalo(_hv, Math.max(sc * 8, 0.035) * (c.halo || 1), 0.55 * c.glow * flick, gl);
    }
    return n;
  }
  function addHalos(P, c, s) {
    var hl = P.model.halos, gl = _col.setHex(s.glow || 0xffffff);
    if (P.model.halosOnAction && c.glow < 0.3) return;
    for (var j = 0; j < hl.length && haloN < C.halos; j++) {
      _hv.set(hl[j][0], hl[j][1], hl[j][2]).applyMatrix4(m4);
      putHalo(_hv, hl[j][3] * c.scale * (c.halo || 1), hl[j][4] * Math.min(2, c.glow), gl);
    }
  }
  function putHalo(p, size, alpha, col) {
    var ha = halo.geometry.attributes, i = haloN++;
    ha.position.array[i * 3] = p.x; ha.position.array[i * 3 + 1] = p.y; ha.position.array[i * 3 + 2] = p.z;
    ha.aSize.array[i] = size; ha.aAlpha.array[i] = alpha;
    ha.aCol.array[i * 3] = col.r; ha.aCol.array[i * 3 + 1] = col.g; ha.aCol.array[i * 3 + 2] = col.b;
  }

  // Pooled point lights for the brightest glowers near the diver (no shader recompiles: always 3 lights).
  function updateLights() {
    if (!lights.length) return;
    var P = TU.player.state, cand = [];
    for (var i = 0; i < recs.length; i++) {
      var c = recs[i]; if (!c.active || c.caught) continue;
      var b = c.sp.brightness; if (c.speciesId === 'volt_eel') b = c.shockT > 0 ? 6 : c.warn > 0.3 ? 1.5 : 0;
      if (b < 3) continue;
      cand.push({ c: c, score: b * c.glow / (1 + c.dist * c.dist * 0.05) });
    }
    if (show) show.recs.forEach(function (c) { if (c.sp.brightness >= 3) cand.push({ c: c, score: 100 }); });
    cand.sort(function (a, b) { return b.score - a.score; });
    for (i = 0; i < lights.length; i++) {
      var Lt = lights[i], e = cand[i];
      if (!e) { Lt.intensity = 0; continue; }
      var cc = e.c, br = cc.speciesId === 'volt_eel' ? (cc.shockT > 0 ? 6 : 1.2) : cc.sp.brightness;
      lurePos(cc, Lt.position);
      Lt.color.setHex(cc.sp.glow || 0xffffff);
      Lt.intensity = 0.18 * br * Math.min(2.5, cc.glow) * (cc.shiny ? 1.4 : 1);
      Lt.distance = 1.5 + br * 1.2 * (cc.sp.move === 'swarm' ? 1.3 : 1);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per step                                                            */
  /* ------------------------------------------------------------------ */
  function anyActive(list) { for (var i = 0; i < list.length; i++) if (list[i].active) return true; return false; }
  function step(dt) {
    time += dt; stepNo = (stepNo + 1) | 0;
    var P = TU.player.state;
    if (stepNo % 20 === 1) activation(P.pos);
    for (var g = 0; g < groups.length; g++) { var gg = groups[g]; if (anyActive(gg.members)) stepGroup(gg, dt, P); }
    for (var i = 0; i < recs.length; i++) { var c = recs[i]; if (c.active && !c.caught) stepCreature(c, i, dt, P); }
    if (show) show.recs.forEach(function (c) { animOnly(c, dt); });
  }
  // Animation only (showcase): advance the wave phase and glow without moving.
  function animOnly(c, dt) {
    c.ph += dt * animSpeed(c.sp) * (c.sp.move === 'giant' ? 0.5 : 1);
    if (c.sp.move === 'jelly') c.spin += 0;
    c.glow = (c.sp.id === 'volt_eel' ? 0.35 + 0.25 * Math.sin(c.ph * 3) : 0.85 + 0.15 * Math.sin(time * 1.3 + c.rnd * 5)) * (c.shiny ? 1.5 : 1);
    if (c.sp.move === 'ambush') c.act = show && show.jaw != null ? show.jaw : 0.15;
    if (c.sp.id === 'entrance_crayfish') c.act = show && show.jaw != null ? show.jaw : 0.5;
  }
  function frame() {
    if (!TU.scene || !TU.camera) return;
    if (show) showcaseFrame();
    draw();
    updateLights();
    L.updateShared(TU.camera, show ? show.lamp : TU.player.lamp, show ? 0.06 : 0);
  }

  /* ------------------------------------------------------------------ */
  /* Queries and actions                                                 */
  /* ------------------------------------------------------------------ */
  function get(id) { for (var i = 0; i < recs.length; i++) if (recs[i].id === id) return recs[i]; return null; }
  // The creature closest to the center of the view within maxDist (m), with view dot >= minDot.
  // opts: { catchable: true } only glowing catchables, { kind: 'flora'|'fauna' }
  var _fwd = new T.Vector3();
  function nearestInView(maxDist, minDot, opts) {
    maxDist = maxDist || 6; minDot = minDot == null ? 0.9 : minDot; opts = opts || {};
    var cam = TU.camera, f = _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion), best = null, bestScore = -1, bestDot = 0, bestD = 0;
    for (var i = 0; i < recs.length; i++) {
      var c = recs[i]; if (!c.active || c.caught) continue;
      if (opts.catchable && !c.sp.catchable) continue;
      if (opts.kind && c.sp.kind !== opts.kind) continue;
      var tp = c.sp.move === 'ambush' ? lurePos(c, tmpV3) : c.pos;
      tmpV.subVectors(tp, cam.position); var d = tmpV.length(); if (d > maxDist + c.scale * 0.5) continue;
      var dot = tmpV.divideScalar(d || 1).dot(f);
      // big things count as centered if any part is in the middle of the view
      var dotAdj = Math.min(1, dot + Math.min(0.08, c.scale * 0.5 / Math.max(d, 0.1) * 0.15));
      if (dotAdj < minDot) continue;
      var score = dotAdj - d * 0.01;
      if (score > bestScore) { bestScore = score; best = c; bestDot = dot; bestD = d; }
    }
    return best ? { id: best.id, speciesId: best.speciesId, pos: best.pos, dist: bestD, dot: bestDot, creature: best } : null;
  }
  function nearCount(pos, radius, opts) {
    var r2 = radius * radius, n = 0; opts = opts || {};
    for (var i = 0; i < recs.length; i++) { var c = recs[i]; if (c.caught) continue; if (opts.glowing && !(c.sp.glows && c.glow > 0.3 && c.sp.brightness > 0)) continue; if (c.pos.distanceToSquared(pos) < r2) n++; }
    return n;
  }

  // Lantern: catch a glowing creature. Returns { ok, reason?, speciesId, brightness }.
  // reasons: gone, not_glowing, fleeing, too_far, no_lantern, full, bit (it was a Lanternjaw lure).
  function lanternSlots() {
    var inv = TU.player.inventory, lt = inv && inv.lantern;
    if (lt && lt.slots) return lt.slots;
    return TU.cfg.debug && TU.cfg.debug.freeLantern ? 2 : 0; // cfg.debug.freeLantern: a 2-slot jar to try the feature without buying it
  }
  function catchCreature(id) {
    var c = get(id); if (!c || c.caught || !c.active) return { ok: false, reason: 'gone' };
    var s = c.sp, cam = TU.camera, d = (s.move === 'ambush' ? lurePos(c, tmpV3) : c.pos).distanceTo(cam.position);
    if (d > C.catchDist + c.scale * 0.3) return { ok: false, reason: 'too_far', speciesId: c.speciesId };
    if (s.move === 'ambush') { c.st = 'lunge'; c.stT = 0; c.cool = 0; return { ok: false, reason: 'bit', speciesId: c.speciesId }; }
    if (!s.catchable || !s.glows) return { ok: false, reason: 'not_glowing', speciesId: c.speciesId };
    if (c.flee > 0) return { ok: false, reason: 'fleeing', speciesId: c.speciesId };
    var slots = lanternSlots(); if (!slots) return { ok: false, reason: 'no_lantern', speciesId: c.speciesId };
    if (lantern.items.length >= slots) return { ok: false, reason: 'full', speciesId: c.speciesId };
    c.caught = true; c.active = false;
    var br = s.brightness * (c.shiny ? 1.5 : 1);
    lantern.items.push({ id: c.id, speciesId: c.speciesId, brightness: br, color: s.glow || 0xffffff, at: TU.run ? TU.run.t : 0 });
    if (s.move === 'jelly') attack(c, 'sting', { severity: 0.05, panic: 4 });
    TU.emit('creature:caught', { id: c.id, speciesId: c.speciesId, brightness: br, lantern: lanternLight() });
    return { ok: true, speciesId: c.speciesId, brightness: br };
  }
  // Light the lantern gives: { brightness (0..cap), intensity (0..1), range (m), color (THREE.Color), count, slots }.
  var _lc = new T.Color(), _lc2 = new T.Color();
  function lanternLight() {
    var sum = 0, r = 0, g = 0, b = 0;
    lantern.items.forEach(function (it) { sum += it.brightness; _lc.setHex(it.color); r += _lc.r * it.brightness; g += _lc.g * it.brightness; b += _lc.b * it.brightness; });
    var br = Math.min(C.lanternCap, sum), col = sum > 0 ? _lc2.setRGB(r / sum, g / sum, b / sum).clone() : _lc2.setRGB(0, 0, 0).clone();
    var flick = 0.92 + 0.08 * Math.sin(time * 1.7) * Math.sin(time * 0.53);
    return { brightness: br, intensity: br / C.lanternCap * flick, range: br > 0 ? 1.5 + br * 1.1 : 0, color: col, count: lantern.items.length, slots: lanternSlots(), items: lantern.items.slice() };
  }
  function release(id) {
    var k = lantern.items.findIndex(function (it) { return it.id === id; }); if (k < 0) return false;
    var it = lantern.items.splice(k, 1)[0], c = get(it.id);
    if (c) { c.caught = false; c.pos.copy(TU.player.state.pos).add(tmpV.set(0, 0.2, 0)); c.home.copy(c.pos); c.flee = 0; }
    return true;
  }

  // Mark shinies in the logbook entries (the UI shows a gold badge): entry.shiny = true, entry.shinies = count.
  function markShiny(c, res, vres) {
    if (!c.shiny) return;
    [res, vres].forEach(function (r) { if (r && r.entry) { r.entry.shiny = true; r.entry.shinies = (r.entry.shinies || 0) + 1; } });
    TU.save.write();
  }
  // Logbook bounty for one log result.
  function bountyFor(c, res, variantRes, photo) {
    var r = c.sp.rarity, $ = 0;
    if (res.first) $ += BOUNTY.species[r]; else if (res.record) $ += BOUNTY.record[r];
    if (variantRes && variantRes.first) $ += c.shiny ? BOUNTY.species[r] * BOUNTY.shinyMul : BOUNTY.variant[r];
    if (photo && c.sp.dangerous && res.entry && res.entry.photos === 1) $ += BOUNTY.dangerPhoto;
    return $;
  }
  // What the tape reads: the true size plus a small reading error, rounded like a real tape.
  function tapeRead(c) {
    var err = 1 + (Math.random() - 0.5) * 0.03, v = c.sizeM * err;
    return v < 0.1 ? Math.round(v * 1000) / 1000 : v < 2 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
  }
  // Contract: measure a creature now (logs via TU.logbook.add). Returns { id, speciesId, sizeM, first, record, variant, variantFirst, bounty }.
  function measure(id) {
    var c = get(id); if (!c) return null;
    c.measured = true;
    var size = tapeRead(c), depth = Math.max(0, -c.pos.y);
    var res = TU.logbook.add({ speciesId: c.speciesId, sizeM: size, zone: c.zone, depthM: depth });
    var vres = c.variant ? TU.logbook.add({ speciesId: c.speciesId + ':' + c.variant, sizeM: size, zone: c.zone, depthM: depth }) : null;
    markShiny(c, res, vres);
    var $ = bountyFor(c, res, vres, false); earnings.logbook += $;
    return { id: c.id, speciesId: c.speciesId, sizeM: size, first: res.first, record: res.record, variant: c.variant, variantFirst: !!(vres && vres.first), bounty: $ };
  }
  // Hold-to-measure helper for player.js: call every step with holding = T key down.
  // Returns { state: 'idle'|'aiming'|'measuring'|'done'|'lost', id, speciesId, progress 0..1, result, reason }.
  function measureStep(dt, holding) {
    var inv = TU.player.inventory;
    if (!holding) { measureState.id = null; measureState.t = 0; return { state: 'idle', progress: 0 }; }
    if (inv && inv.measuringTape === false) return { state: 'lost', reason: 'no_tape', progress: 0 };
    var hit = nearestInView(C.measureDist, C.measureDot);
    if (!hit) { var was = measureState.id; measureState.id = null; measureState.t = 0; return { state: was ? 'lost' : 'aiming', reason: was ? 'lost_sight' : 'nothing', progress: 0 }; }
    var c = hit.creature;
    if (measureState.id !== c.id) { measureState.id = c.id; measureState.t = 0; measureState.need = C.measureTime * (c.sp.behavior === 'skittish' ? 1.6 : 1) * (1 + Math.min(1.5, c.scale * 0.4)); measureState.done = false; }
    if (measureState.done) return { state: 'done', id: c.id, speciesId: c.speciesId, progress: 1, result: measureState.result };
    if (c.flee > 0) { measureState.t = 0; return { state: 'lost', id: c.id, speciesId: c.speciesId, reason: 'fled', progress: 0 }; }
    measureState.t += dt;
    var p = clamp(measureState.t / measureState.need, 0, 1);
    if (p >= 1) { measureState.done = true; measureState.result = measure(c.id); return { state: 'done', id: c.id, speciesId: c.speciesId, progress: 1, result: measureState.result }; }
    return { state: 'measuring', id: c.id, speciesId: c.speciesId, progress: p };
  }
  // Photograph hook: logs a photo (no size). Dangerous species pay a photo bonus once.
  function photo(id) {
    var c = get(id); if (!c) return null;
    c.photographed = true;
    var res = TU.logbook.add({ speciesId: c.speciesId, zone: c.zone, depthM: Math.max(0, -c.pos.y), photo: true });
    var vres = c.variant ? TU.logbook.add({ speciesId: c.speciesId + ':' + c.variant, zone: c.zone, photo: true }) : null;
    markShiny(c, res, vres);
    var $ = bountyFor(c, res, vres, true); earnings.logbook += $;
    return { id: c.id, speciesId: c.speciesId, first: res.first, variant: c.variant, bounty: $ };
  }
  function seenCount() { var n = 0; for (var i = 0; i < recs.length; i++) if (recs[i].seen) n++; return n; }

  /* ------------------------------------------------------------------ */
  /* Debug: showcase every species under neutral light (tests, filming)  */
  /* ------------------------------------------------------------------ */
  var SHOW_O = new T.Vector3(0, -3000, 3000), SHOW_LAYER = 5; // the showcase camera only sees layer 5 (hides other modules' objects)
  function onShowLayer(o) { o.traverse(function (x) { x.layers.enable(SHOW_LAYER); }); }
  function showcaseBuild() {
    var g = new T.Group(); g.name = 'cr-showcase';
    var hemi = new T.HemisphereLight(0xcfe6ee, 0x1c2024, 0.26), key = new T.DirectionalLight(0xfff4e6, 0.58), rim = new T.DirectionalLight(0x9fd8ff, 0.4);
    key.position.set(-3, 5, 4); rim.position.set(4, 2, -5); key.target.position.set(0, 0, 0); rim.target.position.set(0, 0, 0);
    g.add(hemi, key, rim, key.target, rim.target);
    var bg = new T.SphereGeometry(80, 24, 16), cols = [], pa = bg.attributes.position, top = new T.Color(0x1d3a44).convertSRGBToLinear(), bot = new T.Color(0x030607);
    for (var i = 0; i < pa.count; i++) { var t = clamp(pa.getY(i) / 80 * 0.5 + 0.5, 0, 1); var c = bot.clone().lerp(top, Math.pow(t, 1.4)); cols.push(c.r, c.g, c.b); }
    bg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    var back = new T.Mesh(bg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    back.renderOrder = -10; g.add(back);
    var rockMat = new T.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85, normalMap: TU.tex.get('rockNormal') });
    var floor = new T.Mesh(new T.CircleGeometry(1, 48), rockMat); floor.rotation.x = -Math.PI / 2; floor.name = 'cr-show-floor'; g.add(floor);
    var ceil = new T.Mesh(new T.CircleGeometry(1, 48), rockMat); ceil.rotation.x = Math.PI / 2; ceil.name = 'cr-show-ceil'; g.add(ceil);
    g.position.copy(SHOW_O);
    onShowLayer(g);
    TU.scene.add(g);
    return { group: g, floor: floor, ceil: ceil, recs: [], lamp: { pos: new T.Vector3(), dir: new T.Vector3(0, 0, -1), on: 0.35, cosOuter: Math.cos(0.6), cosInner: Math.cos(0.3), range: 30 } };
  }
  // debugShowcase(id) shows one species big in frame; debugShowcase('all') lines them all up; debugShowcase(false) ends it.
  // opts: { variant: 'shiny', jaw: 0..1 (open jaws and claws), size: 0..1 (where in the size range) }
  function debugShowcase(arg, opts) {
    opts = opts || {};
    if (arg === false || arg === 'off') {
      if (show) { show.group.visible = false; show.recs.length = 0; if (show.custom && show.custom.object.parent) show.custom.object.parent.remove(show.custom.object); show.custom = null; if (show.camMask != null) TU.camera.layers.mask = show.camMask; if (show.handCam) show.handCam.layers.mask = show.handMask; show.camMask = null; show.handCam = null; show = null; }
      return null;
    }
    if (!show || !show.group) { var keep = showcaseStore || showcaseBuild(); showcaseStore = keep; show = keep; }
    show.group.visible = true; show.recs.length = 0; show.jaw = opts.jaw;
    if (show.camMask == null) { show.camMask = TU.camera.layers.mask; show.handCam = TU.fx.handCamera || null; show.handMask = show.handCam ? show.handCam.layers.mask : null; }
    TU.camera.layers.set(SHOW_LAYER);
    if (show.handCam) show.handCam.layers.set(SHOW_LAYER); // hide the diver's hands overlay too
    if (show.custom && show.custom.object.parent) show.custom.object.parent.remove(show.custom.object);
    show.custom = null;
    if (arg && typeof arg === 'object' && arg.object) { // any Object3D (used for the fossil and treasure models)
      show.custom = arg; show.group.add(arg.object); onShowLayer(arg.object); arg.object.position.y += 0; show.multi = false;
      return { custom: true };
    }
    var list = arg && arg !== 'all' ? [arg] : IDS.slice();
    var x = 0, out = [];
    list.forEach(function (sid, k) {
      var s = SPECIES[sid]; if (!s) return;
      var c = makeRec(sid, SHOW_O.clone(), L.rnd(k + 3), { sizeU: opts.size == null ? 0.6 : opts.size, variant: opts.variant || null, debug: true, normal: s.show.ceiling ? new T.Vector3(0, -1, 0) : Y });
      c.id = -(k + 1);
      // tiny animals are drawn bigger so the screenshot shows their shape (the logbook size stays real)
      var minS = s.move === 'swarm' ? 0.05 : 0.42;
      c.drawScale = Math.max(c.scale, list.length > 1 ? 0.7 : minS);
      if (list.length > 1 && s.move === 'giant') c.drawScale = 2.2;
      if (s.move === 'swarm') { c.swarmR = list.length > 1 ? 0.4 : 0.2; c.halo = 0.5; }
      c.dir.set(0.95, 0, 0.3).normalize(); c.up.copy(c.normal); c.spin = 0.4;
      if (s.move === 'jelly') c.vel.set(0, 0, 0);
      if (s.move === 'swim' && s.upsideDown) c.dir.set(0.9, 0.0, 0.42).normalize();
      if (list.length > 1) { var col = k % 6, row = Math.floor(k / 6); c.pos.x += (col - 2.5) * 1.35; c.pos.y += (1.5 - row) * 0.95; c.drawScale = Math.min(c.drawScale, 0.95); x = 8.1; }
      show.recs.push(c); out.push({ id: c.id, speciesId: sid, drawScale: c.drawScale });
    });
    show.list = list; show.multi = list.length > 1;
    animOnly(show.recs[0], 0);
    return { species: out, phase: show.recs[0] ? show.recs[0].ph : 0 };
  }
  var showcaseStore = null;
  // Place the camera and the lights for the current showcase (runs in frame(), after the player placed the camera).
  function showcaseFrame() {
    var cam = TU.camera, c = show.recs[0];
    if (show.custom) {
      var ex = show.custom.ext || 1, vf0 = Math.tan(cam.fov * Math.PI / 360), hf0 = vf0 * (cam.aspect || 1.6), d0 = ex / (2 * hf0) * 1.1;
      var tg = SHOW_O.clone().add(new T.Vector3(0, ex * 0.02, 0)), cp = tg.clone().add(new T.Vector3(0, d0 * 0.7, d0 * 0.75));
      cam.position.copy(cp); cam.lookAt(tg); cam.updateMatrixWorld();
      show.floor.visible = true; show.ceil.visible = false; show.floor.scale.setScalar(ex * 2); show.floor.position.set(0, -0.004, 0);
      show.lamp.pos.copy(cp); show.lamp.dir.subVectors(tg, cp).normalize(); show.lamp.range = d0 * 3;
      if (TU.scene.fog) TU.scene.fog.density = 0.004;
      return;
    }
    if (!c) return;
    var s = c.sp, ext = (s.show.ext || 1.25) * c.drawScale, aspect = cam.aspect || 1.6;
    var vf = Math.tan(cam.fov * Math.PI / 360), hf = vf * aspect;
    var dist = Math.max(ext / (2 * hf), ext * 0.55 / (2 * vf)) * 1.45;
    var target = c.pos.clone().add(new T.Vector3((s.show.dz || 0) * c.drawScale * c.dir.x, (s.show.dy || 0) * c.drawScale, (s.show.dz || 0) * c.drawScale * c.dir.z)), camPos;
    if (show.multi) {
      var w = 8.6;
      dist = w / (2 * hf) * 1.05; target.set(SHOW_O.x, SHOW_O.y, SHOW_O.z);
      camPos = target.clone().add(new T.Vector3(0, dist * 0.08, dist));
    } else if (s.show.floor) { target.y += c.drawScale * 0.04; camPos = target.clone().add(new T.Vector3(0, dist * (s.show.low ? 0.22 : 0.5), dist * 0.97)); }
    else if (s.show.ceiling) { target.y -= c.drawScale * 0.35; camPos = target.clone().add(new T.Vector3(0, -dist * 0.12, dist)); }
    else if (s.show.swarm) { dist = c.swarmR * 3.2; camPos = target.clone().add(new T.Vector3(0, 0.02, dist)); }
    else camPos = target.clone().add(new T.Vector3(0, dist * 0.12, dist));
    cam.position.copy(camPos); cam.lookAt(target); cam.updateMatrixWorld();
    // floor or ceiling slab for things that sit on rock
    var fl = show.floor, ce = show.ceil, needF = !show.multi && !!(s.show.floor || s.move === 'crawl'), needC = !show.multi && !!s.show.ceiling;
    fl.visible = needF; ce.visible = needC;
    if (needF) { fl.scale.setScalar(ext * 3); fl.position.set(c.pos.x - SHOW_O.x, c.pos.y - SHOW_O.y - (s.move === 'crawl' ? c.drawScale * 0.14 : 0.002), c.pos.z - SHOW_O.z); }
    if (needC) { ce.scale.setScalar(ext * 3); ce.position.set(c.pos.x - SHOW_O.x, c.pos.y - SHOW_O.y + 0.004, c.pos.z - SHOW_O.z); }
    // a fake flashlight from the camera so the skin glow and translucency show
    show.lamp.pos.copy(camPos).add(new T.Vector3(0.3, 0.2, 0).multiplyScalar(dist * 0.2)); show.lamp.dir.subVectors(target, show.lamp.pos).normalize(); show.lamp.range = dist * 3;
    if (TU.scene.fog) TU.scene.fog.density = 0.004;
  }
  // Advance only the showcase animation (seconds). Returns the first creature's phase.
  function debugAdvance(sec) { var n = Math.max(1, Math.round(sec * 60)); for (var i = 0; i < n; i++) { time += 1 / 60; if (show) show.recs.forEach(function (c) { animOnly(c, 1 / 60); }); } return show && show.recs[0] ? show.recs[0].ph : 0; }
  // Spawn a real creature in front of the diver (tests and filming). Returns the record.
  function debugSpawnInFront(sid, dist, opts) {
    opts = opts || {};
    var P = TU.player.state, cam = TU.camera, f = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    var p = cam.position.clone().addScaledVector(f, dist || 1.5);
    if (opts.dy) p.y += opts.dy;
    var c = makeRec(sid, p, Math.random, { normal: opts.normal || Y, variant: opts.variant, sizeU: opts.sizeU });
    c.dir.copy(opts.facing || new T.Vector3(f.z, 0, -f.x)).normalize();
    if (opts.still) c.home.copy(p);
    addRec(c); c.active = true; c.dist = c.pos.distanceTo(P.pos);
    if (c.sp.move === 'school' || c.sp.move === 'shrimp' || c.sp.move === 'jelly') { var g = { id: groups.length, sid: sid, center: p.clone(), home: p.clone(), vel: new T.Vector3(), target: p.clone(), tT: 5, flee: 0, members: [c], hint: {} }; groups.push(g); c.group = g; c.off = new T.Vector3(); }
    return { id: c.id, speciesId: sid, pos: c.pos.clone(), sizeM: c.sizeM };
  }

  // Move an existing creature to dist meters in front of the camera, side-on (filming and tests).
  function debugPlace(id, dist) {
    var c = get(id); if (!c) return null;
    var cam = TU.camera, f = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    c.pos.copy(cam.position).addScaledVector(f, dist || 1); c.home.copy(c.pos); c.vel.set(0, 0, 0);
    c.dir.set(f.z, 0, -f.x).normalize(); c.up.set(0, 1, 0); c.active = true;
    if (c.group) { c.group.center.copy(c.pos); c.group.target.copy(c.pos); c.group.vel.set(0, 0, 0); if (c.off) c.off.set(0, 0, 0); }
    return c.pos.clone();
  }

  /* ------------------------------------------------------------------ */
  /* Public API and system hooks                                         */
  /* ------------------------------------------------------------------ */
  TU.define('creatures', {
    species: SPECIES,
    list: function () { return recs; },
    spawnForZone: spawnForZone,
    clear: clear,
    get: get,
    nearestInView: nearestInView,
    nearCount: nearCount,
    catch: catchCreature,
    measure: measure,
    seenCount: seenCount,
    total: function () { return recs.length; },
    // additions (see CONTRACT-B-NOTES.md)
    measureStep: measureStep,
    photo: photo,
    lanternLight: lanternLight,
    lanternRelease: release,
    activeCount: function () { return actCount; },
    speciesName: function (id) { var s = SPECIES[id]; return s ? s.name : id; },
    earnings: function () { return { logbook: earnings.logbook, finds: earnings.finds, total: earnings.logbook + earnings.finds }; },
    addFindEarnings: function (v) { earnings.finds += v || 0; },
    debugShowcase: debugShowcase,
    debugAdvance: debugAdvance,
    debugSpawnInFront: debugSpawnInFront,
    debugPlace: debugPlace,
    debugIds: function () { return IDS.slice(); },
    tuning: C
  });

  TU.addSystem('creatures', {
    init: function () {
      if (TU.fx.particleMaterial && TU.tex) {
        var mat = TU.fx.particleMaterial({ map: TU.tex.get('glow'), color: 0xffffff, base: 1.0, additive: true, opacity: 1.0, glow: true });
        if (mat) halo = TU.fx.makePoints(C.halos, mat);
        if (halo) { halo.name = 'cr-halos'; halo.layers.enable(SHOW_LAYER); }
      }
      for (var i = 0; i < C.lights; i++) { var l = new T.PointLight(0x7FE8FF, 0, 4, 2); l.name = 'cr-light'; l.layers.enable(SHOW_LAYER); TU.scene.add(l); lights.push(l); }
      census(1);
    },
    reset: function (run) {
      lantern.items.length = 0; earnings.logbook = 0; earnings.finds = 0;
      census(run && run.seed != null ? run.seed : 1);
      activation(TU.player.state.pos);
    },
    update: step,
    idle: step,
    frame: frame
  });
})();
