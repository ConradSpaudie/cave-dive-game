/*
 * creatures-finds.js: fossils and treasure lying half buried in the cave floor.
 *
 *   - Uses TU.cave.features.treasure when the cave provides it. If the list is empty (the handmade
 *     cave), it scatters its own finds on floor spots by depth zone, using TU.cave.randomSpot.
 *   - Every find has a procedural model (no files): a cave bear skull, vertebrae, a tooth, a saber fang,
 *     a sloth claw, a tusk, a trilobite plate, a fossil shell, an ammonite (gold when shiny), a clay pot,
 *     a gold idol and a lost diver's lamp. Each sits in a small silt mound with a glint that sparkles
 *     when your flashlight hits it.
 *   - Picking one up emits 'treasure:found' (and 'fossil:found' for fossils) with its value in $.
 *
 * API (added to TU.creatures): finds(), findNearest(maxDist, minDot), pickup(id), debugFindModels(),
 *   debugShowcaseFind(name | 'all').
 * This file works even if creatures.js is missing (it only adds functions).
 *
 * Owner: agent B.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, L = TU._cr;
  if (!L || !L.Kit) return;
  var clamp = U.clamp;
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };
  var PI = Math.PI;

  /* ------------------------------------------------------------------ */
  /* Find types: name, kind, tier, zones, model, sink (how deep it is buried, 0..1), weight (kg)    */
  /* ------------------------------------------------------------------ */
  var TYPES = {
    shell: { name: 'Fossil shell fragment', kind: 'fossil', tier: 1, zones: [0, 1, 2], model: 'shell', size: 0.12, sink: 0.25, kg: 0.3 },
    diver_lamp: { name: "Lost diver's lamp", kind: 'treasure', tier: 1, zones: [0, 1, 2, 3, 4], model: 'diver_lamp', size: 0.3, sink: 0.3, kg: 1.2 },
    trilobite_plate: { name: 'Trilobite plate', kind: 'fossil', tier: 2, zones: [2, 3, 4], model: 'trilobite_plate', size: 0.22, sink: 0.35, kg: 2.5 },
    bear_tooth: { name: 'Cave bear tooth', kind: 'fossil', tier: 2, zones: [1, 2], model: 'tooth', size: 0.1, sink: 0.35, kg: 0.4 },
    vertebrae: { name: 'Cave bear vertebrae', kind: 'fossil', tier: 2, zones: [1, 2, 3], model: 'vertebrae', size: 0.45, sink: 0.4, kg: 3 },
    bear_skull: { name: 'Cave bear skull', kind: 'fossil', tier: 3, zones: [2, 3], model: 'skull', size: 0.42, sink: 0.38, kg: 6 },
    sloth_claw: { name: 'Ground sloth claw', kind: 'fossil', tier: 3, zones: [2, 3], model: 'claw', size: 0.3, sink: 0.3, kg: 1.5 },
    clay_pot: { name: 'Ancient clay pot', kind: 'treasure', tier: 3, zones: [1, 2, 3], model: 'pot', size: 0.32, sink: 0.35, kg: 3 },
    saber_fang: { name: 'Saber-tooth fang', kind: 'fossil', tier: 4, zones: [3], model: 'fang', size: 0.26, sink: 0.3, kg: 0.6 },
    tusk: { name: 'Gomphothere tusk', kind: 'fossil', tier: 4, zones: [3, 4], model: 'tusk', size: 1.4, sink: 0.4, kg: 25 },
    gold_idol: { name: 'Gold idol', kind: 'treasure', tier: 4, zones: [2, 3, 4], model: 'idol', size: 0.2, sink: 0.35, kg: 2 },
    ammonite: { name: 'Gold ammonite', kind: 'fossil', tier: 5, zones: [4], model: 'ammonite', size: 0.3, sink: 0.3, kg: 4 }
  };
  // Sell price ranges per tier (Design/Economy and Progression.md). Shiny = 3x.
  var PRICE = { 1: [20, 40], 2: [60, 100], 3: [150, 250], 4: [400, 600], 5: [1000, 1500] };

  /* ------------------------------------------------------------------ */
  /* Models                                                              */
  /* ------------------------------------------------------------------ */
  var BONE = 0xD9CFB8, BONE2 = 0xA89878, STAIN = 0x6E5A3E;
  function boneCol(p, n) {
    var c = L.lin(BONE).lerp(L.lin(BONE2), 0.5 + 0.5 * L.vnoise(p.x * 9, p.y * 9, p.z * 9));
    var st = L.vnoise(p.x * 3 + 5, p.y * 3, p.z * 3); if (st > 0.25) c.lerp(L.lin(STAIN), (st - 0.25) * 1.2);
    return c.multiplyScalar(0.9 + 0.2 * Math.abs(L.vnoise(p.x * 40, p.y * 40, p.z * 40)));
  }
  var MODELS = {
    skull: function (k) {
      // cave bear skull, lower jaw missing: domed braincase, long snout, eye sockets, cheek arches, big canines
      // eye sockets and the nose opening are painted dark into the bone (holes in the skull)
      var skullCol = function (p, n) { var c = boneCol(p, n); var dx = Math.abs(p.x) - 0.12, dy = p.y - 0.06, dz = p.z - 0.12; var e = Math.sqrt(dx * dx + dy * dy * 1.4 + dz * dz); if (e < 0.06 && n.y > -0.2) c.multiplyScalar(0.12 + 0.88 * L.sstep(0.035, 0.06, e)); if (p.z > 0.44 && Math.abs(p.x) < 0.05 && p.y > -0.06) c.multiplyScalar(0.25); return c; };
      k.add(L.spine({ rings: 40, segs: 28, z0: -0.5, z1: 0.5, r: function (u) { return 0.22 * Math.pow(Math.sin(PI * (0.06 + 0.88 * u)), 0.5) * (u > 0.55 ? 1 - (u - 0.55) * 0.9 : 1); }, w: function (u) { return u < 0.45 ? 1.15 : 0.85; }, h: function (u) { return u < 0.4 ? 0.85 : 0.6; }, y: function (u) { return u < 0.45 ? 0.05 : -0.02; }, flatBelly: 0.45 }), { col: skullCol });
      k.add(L.spine({ rings: 10, segs: 10, z0: -0.35, z1: 0.1, r: function (u) { return 0.03 * Math.sin(PI * u) + 0.004; }, y: function () { return 0.2; } }), { col: boneCol }); // sagittal crest
      for (var s = -1; s <= 1; s += 2) {
        k.add(L.sweep(L.curvePts([V(s * 0.14, 0.0, -0.18), V(s * 0.26, 0.02, 0.0), V(s * 0.15, 0.0, 0.18)], 10), 0.03, 6), { col: boneCol }); // cheek arch
        k.add(new T.ConeGeometry(1, 1, 7), { m: L.matAlong(V(s * 0.06, -0.1, 0.38), V(0, -1, 0.25), 0.022, 0.13, 0.02), col: function (p) { return boneCol(p).multiplyScalar(1.1); } }); // canine
      }
      return 0.13;
    },
    vertebrae: function (k) {
      for (var i = 0; i < 5; i++) {
        var z = -0.4 + i * 0.2, tilt = (i - 2) * 0.12, y = -Math.abs(i - 2) * 0.02;
        k.add(new T.CylinderGeometry(1, 1, 1, 12), { m: L.mat(V(0, y, z), 0.07, 0.11, 0.07, PI / 2 + tilt, 0, 0), col: boneCol });
        k.add(new T.ConeGeometry(1, 1, 6), { m: L.matAlong(V(0, y + 0.08, z - 0.02), V(0, 1, -0.4), 0.03, 0.16, 0.015), col: boneCol });
        for (var s = -1; s <= 1; s += 2) k.add(new T.ConeGeometry(1, 1, 6), { m: L.matAlong(V(s * 0.08, y + 0.02, z), V(s, 0.2, 0), 0.025, 0.12, 0.015), col: boneCol });
      }
      return 0.06;
    },
    tooth: function (k) {
      k.add(L.sweep(L.curvePts([V(0, -0.35, 0), V(0.05, 0.0, 0), V(0.0, 0.35, 0.05)], 12), function (t) { return 0.15 * (t < 0.4 ? 0.8 + 0.5 * t : 1 - (t - 0.4) * 1.5) + 0.01; }, 10, true), { col: function (p) { return p.y > 0 ? L.lin(0xEDE6D2) : boneCol(p).multiplyScalar(0.8); } });
      return 0.14;
    },
    fang: function (k) {
      k.add(L.sweep(L.curvePts([V(0, 0, -0.5), V(0, 0.08, -0.1), V(0, 0.04, 0.25), V(0, -0.08, 0.5)], 18), function (t) { return 0.075 * (1 - Math.pow(t, 1.3)) + 0.004; }, 10, true), { m: new T.Matrix4().makeScale(0.6, 1, 1), col: function (p) { return p.z < -0.3 ? boneCol(p).multiplyScalar(0.75) : L.lin(0xF0E8D4).lerp(L.lin(0xC8B48A), 0.3 + 0.3 * L.vnoise(p.z * 8, 0, 0)); } });
      return 0.06;
    },
    claw: function (k) {
      k.add(L.sweep(L.curvePts([V(0, -0.05, -0.5), V(0, 0.18, -0.1), V(0, 0.15, 0.25), V(0, -0.1, 0.5)], 18), function (t) { return 0.09 * (1 - Math.pow(t, 1.5)) + 0.005; }, 10, true), { m: new T.Matrix4().makeScale(0.55, 1, 1), col: boneCol });
      k.add(L.blob(10, 8), { m: L.mat(V(0, -0.06, -0.48), 0.08, 0.07, 0.09), col: boneCol });
      return 0.08;
    },
    tusk: function (k) {
      k.add(L.sweep(L.curvePts([V(0, 0, -0.5), V(0.05, 0.08, -0.1), V(0.12, 0.12, 0.2), V(0.25, 0.22, 0.5)], 24), function (t) { return 0.08 * (1 - 0.65 * t) + 0.006; }, 12, true), { col: function (p) { return L.lin(0xE6DCC4).lerp(L.lin(STAIN), 0.2 + 0.4 * Math.max(0, L.vnoise(p.x * 6, p.y * 6, p.z * 6))).multiplyScalar(0.92 + 0.12 * Math.sin(p.z * 120)); } });
      return 0.05;
    },
    trilobite_plate: function (k) {
      // a stone slab with a trilobite fossil standing out of it
      var slab = new T.CylinderGeometry(0.5, 0.52, 0.12, 9, 1);
      k.add(slab, { m: L.mat(V(0, -0.02, 0), 1, 1, 0.8), col: function (p) { return L.lin(0x8A8070).multiplyScalar(0.8 + 0.3 * (0.5 + 0.5 * L.vnoise(p.x * 7, p.y * 7, p.z * 7))); } });
      var segs = 9;
      k.add(L.spine({ rings: 40, segs: 18, z0: -0.32, z1: 0.32, r: function (u) { return 0.16 * Math.pow(Math.sin(PI * (0.04 + 0.92 * u)), 0.5) * (1 - 0.06 * Math.pow(Math.cos(((u * segs) % 1) * PI), 8)); }, w: function () { return 1.3; }, h: function () { return 0.22; }, y: function () { return 0.04; }, sq: 2.4 }), { col: function (p, n, uv) { var g = ((uv[1] * segs) % 1) < 0.12 ? 0.6 : 1; return L.lin(0x5E5346).multiplyScalar(g * (0.85 + 0.2 * L.vnoise(p.x * 30, p.y * 30, p.z * 30))); } });
      k.add(L.spine({ rings: 20, segs: 10, z0: -0.25, z1: 0.2, r: function (u) { return 0.045 * Math.pow(Math.sin(PI * (0.05 + 0.9 * u)), 0.5); }, y: function () { return 0.07; }, h: function () { return 0.6; } }), { col: L.lin(0x4E4438) });
      return 0.0;
    },
    shell: function (k) {
      // a ribbed scallop fan, broken at one edge
      var g = L.fin([0, -0.04], [0, 0.04], L.outline(17, function (t) { var a = (t - 0.5) * 2.2; return [Math.cos(a) * 0.5 * (t > 0.85 ? 0.75 : 1), Math.sin(a) * 0.5]; }), function (a, b) { var rib = 0.025 * Math.abs(Math.sin(Math.atan2(b, a + 0.001) * 18)); return V(b, 0.12 * Math.sin(PI * Math.min(1, a / 0.5)) * 0.8 + rib, a - 0.25); }, 6);
      k.add(g, { col: function (p, n, uv) { return L.lin(0xCFC2A4).multiplyScalar(0.8 + 0.35 * Math.pow(Math.abs(Math.sin(uv[0] * PI * 9)), 3)).lerp(L.lin(STAIN), 0.15); } });
      return 0.04;
    },
    ammonite: function (k, shiny) {
      var pts = [], radii = [], N = 90;
      for (var i = 0; i <= N; i++) { var t = i / N, th = PI * 2 * 3.2 * t, rr = 0.03 * Math.exp(1.55 * t * 1.75); pts.push(V(0, Math.sin(th) * rr * 1.45, Math.cos(th) * rr * 1.45)); radii.push(rr * 0.7); }
      k.add(L.sweep(pts, function (t) { return radii[Math.round(t * N)] * (0.92 + 0.08 * Math.abs(Math.sin(t * 160))); }, 14), { m: new T.Matrix4().makeScale(0.7, 1, 1), col: function (p, n, uv) { var rib = 0.75 + 0.35 * Math.pow(Math.abs(Math.sin(uv[1] * 160)), 2); return (shiny ? L.lin(0xE8B84A) : L.lin(0xB09A78)).multiplyScalar(rib); } });
      return 0.0;
    },
    pot: function (k) {
      var prof = [V(0.001, -0.5, 0), V(0.22, -0.48, 0), V(0.38, -0.3, 0), V(0.42, -0.05, 0), V(0.33, 0.22, 0), V(0.18, 0.36, 0), V(0.2, 0.44, 0), V(0.24, 0.48, 0), V(0.21, 0.5, 0), V(0.16, 0.42, 0)].map(function (v) { return new T.Vector2(v.x, v.y); });
      k.add(new T.LatheGeometry(prof, 28), { col: function (p) { var band = Math.abs(p.y - 0.05) < 0.05 ? (Math.sin(Math.atan2(p.z, p.x) * 12) > 0 ? L.lin(0x2A1A12) : L.lin(0xC9A27A)) : L.lin(0xA8673E); return band.clone().multiplyScalar(0.8 + 0.3 * (0.5 + 0.5 * L.vnoise(p.x * 9, p.y * 9, p.z * 9))); } });
      return 0.1;
    },
    idol: function (k) {
      var gold = function (p) { return L.lin(0xE2B44C).multiplyScalar(0.85 + 0.25 * L.vnoise(p.x * 20, p.y * 20, p.z * 20)); };
      k.add(L.blob(16, 12), { m: L.mat(V(0, -0.12, 0), 0.22, 0.3, 0.18), col: gold });
      k.add(L.blob(16, 12), { m: L.mat(V(0, 0.28, 0), 0.17, 0.17, 0.15), col: gold });
      k.add(new T.CylinderGeometry(0.24, 0.26, 0.08, 16), { m: L.mat(V(0, 0.42, 0), 1, 1, 1), col: gold });
      for (var s = -1; s <= 1; s += 2) {
        k.add(L.blob(8, 6), { m: L.mat(V(s * 0.06, 0.3, 0.13), 0.035, 0.02, 0.02), col: L.lin(0x1A3A2A) }); // jade eyes
        k.add(L.sweep(L.curvePts([V(s * 0.2, 0.05, 0), V(s * 0.24, -0.08, 0.1), V(s * 0.1, -0.12, 0.17)], 8), 0.045, 6, true), { col: gold });
      }
      k.add(new T.CylinderGeometry(0.2, 0.24, 0.12, 14), { m: L.mat(V(0, -0.44, 0), 1, 1, 1), col: gold });
      return 0.0;
    },
    diver_lamp: function (k) {
      var yel = function (p) { var c = L.lin(0xC9A42E); var rust = L.vnoise(p.x * 14, p.y * 14, p.z * 14); if (rust > 0.2) c.lerp(L.lin(0x6A3A1E), (rust - 0.2) * 1.5); return c; };
      k.add(new T.CylinderGeometry(0.1, 0.1, 0.6, 16), { m: L.mat(V(0, 0, -0.05), 1, 1, 1, PI / 2, 0, 0), col: yel });
      k.add(new T.CylinderGeometry(0.17, 0.11, 0.18, 18), { m: L.mat(V(0, 0, 0.32), 1, 1, 1, PI / 2, 0, 0), col: yel });
      k.add(new T.CircleGeometry(0.15, 18), { m: L.mat(V(0, 0, 0.415), 1, 1, 1), col: L.lin(0xBFD8D8) });
      k.add(L.sweep(L.curvePts([V(0, 0.1, -0.3), V(0, 0.3, -0.05), V(0, 0.1, 0.2)], 10), 0.015, 5), { col: L.lin(0x222222) });
      return 0.1;
    }
  };
  var geoCache = {};
  function modelGeo(name, shiny) {
    var key = name + (shiny ? ':s' : '');
    if (geoCache[key]) return geoCache[key];
    var k = new L.Kit(), lift = MODELS[name](k, shiny);
    var g = k.geometry(); g.userData.lift = lift || 0;
    geoCache[key] = g; return g;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var list = [], group = null, glint = null, matBone = null, matGold = null, matMound = null, time = 0, mound = null;
  function mats() {
    if (matBone) return;
    matBone = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
    matGold = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 1.0, emissive: 0x1a1206 });
    matMound = new T.MeshStandardMaterial({ color: 0x4E463A, roughness: 0.95, normalMap: TU.tex.get('rockNormal'), normalScale: new T.Vector2(0.4, 0.4) });
    mound = new T.SphereGeometry(1, 20, 8, 0, PI * 2, 0, PI / 2);
  }
  function makeObj(type, shiny) {
    mats();
    var o = new T.Group(), gold = type.model === 'idol' || (type.model === 'ammonite' && shiny) || type.model === 'diver_lamp' && false;
    var mesh = new T.Mesh(modelGeo(type.model, shiny), gold ? matGold : matBone);
    var s = type.size; mesh.scale.setScalar(s);
    mesh.position.y = (mesh.geometry.userData.lift || 0) * s + 0.06 * s - type.sink * s * 0.12;
    mesh.rotation.set(0.15, 0.6, 0.1);
    o.add(mesh);
    var m = new T.Mesh(mound, matMound); m.scale.set(s * 0.6, s * 0.06 * (0.5 + type.sink), s * 0.45); m.position.y = -s * 0.015; o.add(m);
    o.userData.mesh = mesh;
    return o;
  }
  function priceOf(t, rand, shiny) { var r = PRICE[t.tier] || PRICE[1]; var v = Math.round(r[0] + (r[1] - r[0]) * rand()); return shiny ? v * 3 : v; }
  function typeFor(name, kind, tier) {
    var n = (name || '').toLowerCase();
    var keys = [['skull', 'bear_skull'], ['vertebra', 'vertebrae'], ['fang', 'saber_fang'], ['tooth', 'bear_tooth'], ['claw', 'sloth_claw'], ['tusk', 'tusk'], ['ammonite', 'ammonite'], ['trilobite', 'trilobite_plate'], ['shell', 'shell'], ['pot', 'clay_pot'], ['idol', 'gold_idol'], ['gold', 'gold_idol'], ['lamp', 'diver_lamp'], ['gear', 'diver_lamp']];
    for (var i = 0; i < keys.length; i++) if (n.indexOf(keys[i][0]) >= 0) return TYPES[keys[i][1]];
    var pool = Object.keys(TYPES).map(function (k) { return TYPES[k]; }).filter(function (t) { return t.kind === (kind || 'fossil') && t.tier === (tier || 1); });
    return pool[0] || TYPES.shell;
  }

  function clear() { list.length = 0; if (group) { while (group.children.length) group.remove(group.children[0]); } }
  function add(type, pos, normal, opts) {
    opts = opts || {};
    var shiny = !!opts.shiny, rand = opts.rand || Math.random;
    var f = { id: opts.id || ('find' + (list.length + 1)), kind: type.kind, name: (shiny ? 'Shiny ' : '') + (opts.name || type.name), tier: opts.tier || type.tier, value: opts.value != null ? opts.value : priceOf(type, rand, shiny), pos: pos.clone(), normal: (normal || V(0, 1, 0)).clone().normalize(), type: type, shiny: shiny, taken: false, kg: type.kg };
    var o = makeObj(type, shiny);
    o.position.copy(pos);
    o.quaternion.setFromUnitVectors(V(0, 1, 0), f.normal);
    o.rotateY(rand() * PI * 2);
    o.name = 'cr-find-' + f.id;
    f.obj = o; group.add(o);
    list.push(f);
    return f;
  }
  // Build the finds for a run.
  function build(seed) {
    if (!group) { group = new T.Group(); group.name = 'cr-finds'; TU.scene.add(group); }
    clear();
    var rand = TU.rng((seed || 1) >>> 0, 21).fn(), F = TU.cave.features || {}, src = F.treasure || [];
    if (src.length) {
      src.forEach(function (t) {
        var type = typeFor(t.name, t.kind, t.tier), n = V(0, 1, 0);
        add(type, t.pos, n, { id: t.id, name: t.name, tier: t.tier, value: t.value, rand: rand, shiny: /shiny/i.test(t.name || '') });
      });
    } else {
      var has = [], maxZ = 0;
      for (var z = 0; z < 5; z++) { has[z] = !!TU.cave.randomSpot({ zone: z }, rand); if (has[z]) maxZ = z; }
      for (z = 0; z < 5; z++) {
        if (!has[z] && z !== maxZ) continue;
        var n2 = has[z] ? 3 + z : 0;
        for (var i = 0; i < n2; i++) {
          // pick a type that lives in this zone (deeper types can spill into the deepest zone of a shallow cave)
          var cands = Object.keys(TYPES).map(function (k) { return TYPES[k]; }).filter(function (t) { return t.zones.indexOf(z) >= 0 || (z === maxZ && t.zones[0] > maxZ && t.tier <= 4); });
          if (!cands.length) continue;
          var type = cands[Math.floor(rand() * cands.length)];
          var spot = TU.cave.randomSpot({ zone: z, surface: 'floor' }, rand);
          if (!spot) continue;
          add(type, spot.pos, spot.normal, { rand: rand, shiny: rand() < 1 / 60 });
        }
      }
    }
    buildGlint();
  }
  function buildGlint() {
    if (!TU.fx.particleMaterial) return;
    if (!glint) { var mat = TU.fx.particleMaterial({ map: TU.tex.get('glow'), color: 0xfff6e0, base: 0.0, additive: true, opacity: 1.0 }); if (mat) { glint = TU.fx.makePoints(64, mat); glint.name = 'cr-glints'; } }
  }
  function frame() {
    if (!glint) return;
    var a = glint.geometry.attributes, n = Math.min(64, list.length);
    for (var i = 0; i < 64; i++) {
      var f = list[i];
      if (!f || f.taken || i >= n) { a.aAlpha.array[i] = 0; continue; }
      var p = f.obj.position;
      a.position.array[i * 3] = p.x; a.position.array[i * 3 + 1] = p.y + f.type.size * 0.25; a.position.array[i * 3 + 2] = p.z;
      var tw = Math.pow(Math.max(0, Math.sin(time * 2.3 + i * 1.7)), 12);
      a.aSize.array[i] = 0.18 + 0.25 * tw; a.aAlpha.array[i] = (f.type.kind === 'treasure' || f.shiny ? 0.9 : 0.5) * (0.3 + tw);
    }
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */
  function findNearest(maxDist, minDot) {
    maxDist = maxDist || 2.5; minDot = minDot == null ? 0.8 : minDot;
    var cam = TU.camera, f = V(0, 0, -1).applyQuaternion(cam.quaternion), best = null, bs = -1, tv = new T.Vector3();
    list.forEach(function (it) {
      if (it.taken) return;
      tv.subVectors(it.obj.position, cam.position); var d = tv.length(); if (d > maxDist + it.type.size * 0.5) return;
      var dot = tv.divideScalar(d || 1).dot(f); if (dot < minDot) return;
      var sc = dot - d * 0.05; if (sc > bs) { bs = sc; best = { id: it.id, kind: it.kind, name: it.name, value: it.value, tier: it.tier, dist: d, dot: dot, pos: it.obj.position.clone() }; }
    });
    return best;
  }
  // Pick up a find. Returns { ok, reason?: 'gone'|'too_far', id, kind, name, value, tier }.
  function pickup(id) {
    var f = null; for (var i = 0; i < list.length; i++) if (list[i].id === id) f = list[i];
    if (!f || f.taken) return { ok: false, reason: 'gone' };
    if (TU.camera && f.obj.position.distanceTo(TU.camera.position) > 3 + f.type.size) return { ok: false, reason: 'too_far', id: f.id };
    f.taken = true; f.obj.visible = false;
    if (TU.fx && TU.fx.spawnSilt) TU.fx.spawnSilt(40, { pos: f.obj.position.clone(), burst: true });
    var payload = { id: f.id, kind: f.kind, name: f.name, value: f.value, tier: f.tier, pos: f.obj.position.clone(), kg: f.kg, shiny: f.shiny };
    TU.emit('treasure:found', payload);
    if (f.kind === 'fossil') TU.emit('fossil:found', payload);
    if (TU.creatures.addFindEarnings) TU.creatures.addFindEarnings(f.value);
    return { ok: true, id: f.id, kind: f.kind, name: f.name, value: f.value, tier: f.tier };
  }
  function publicList() { return list.map(function (f) { return { id: f.id, kind: f.kind, name: f.name, tier: f.tier, value: f.value, pos: f.obj.position.clone(), taken: f.taken, shiny: f.shiny }; }); }

  // Debug: show find models in the creature showcase (needs creatures.js).
  var showObjs = [];
  function debugShowcaseFind(name, opts) {
    opts = opts || {};
    showObjs.forEach(function (o) { if (o.parent) o.parent.remove(o); }); showObjs.length = 0;
    if (name === false) return null;
    if (!TU.creatures.debugShowcase) return null;
    var names = name && name !== 'all' ? [name] : Object.keys(TYPES);
    var holder = new T.Group(), x = 0;
    names.forEach(function (k) {
      var t = TYPES[k]; if (!t) return;
      var o = makeObj(t, opts.shiny || k === 'ammonite');
      o.position.set(x, 0, 0); x += Math.max(0.5, t.size * 1.3) + 0.15;
      holder.add(o);
    });
    var span = x - 0.15, first = holder.children[0], last = holder.children[holder.children.length - 1];
    holder.children.forEach(function (o) { o.position.x -= (first.position.x + last.position.x) / 2; });
    showObjs.push(holder);
    var sz = names.length === 1 ? TYPES[names[0]].size : span;
    return TU.creatures.debugShowcase({ object: holder, ext: Math.max(0.45, sz * 2.6), floor: true });
  }

  TU.define('creatures', {
    finds: publicList,
    findNearest: findNearest,
    pickup: pickup,
    findTypes: TYPES,
    debugFindModels: function () { return Object.keys(TYPES); },
    debugShowcaseFind: debugShowcaseFind
  });
  TU.addSystem('finds', {
    init: function () { build(1); },
    reset: function (run) { build(run && run.seed != null ? run.seed : 1); },
    update: function (dt) { time += dt; },
    idle: function (dt) { time += dt; },
    frame: frame
  });
})();
