/*
 * cave.js: builds the cave world from the procedural generator and answers every
 * "where is the rock / water / air / silt" question the other modules ask.
 *
 * Every dive gets a new cave: main.js generates a layout (TU.run.layout, from the seed and the
 * difficulty), and build(layout) turns it into a world:
 *   cave-sdf.js   the shape: skeleton of tubes and rooms -> distance field -> wall mesh
 *   cave-mat.js   the look: procedural rock shader, water surfaces
 *   cave-dress.js the details: stalactites, stalagmites, columns, boulders, the entrance,
 *                 water surfaces, the ancient ring, landmark props, fossils and treasure
 *   cave.js       (this file) ties it together: painting the wall mesh, features, areas,
 *                 named spots, all queries, earthquakes and collapses, the map for the watch.
 *
 * Public API (TU.cave, see CONTRACT.md for exact shapes):
 *   build(layout), nearestPoint(pos, hint), collide(pos, radius, opts), contains(pos, margin),
 *   raycast(origin, dir, maxDist, hint), isDry(pos), waterSurfaceY(pos), zoneAt(pos), areaAt(pos),
 *   randomSpot(opts, rand), spot(name, opts), spawnPoint(), features, areas,
 *   plus (new, agent A): mapData(), quake(intensity, opts), takeFind(id), spotNames(), stats().
 *
 * Owner: agent A.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, N = TU.noise;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var GEO = TU.caveGeo, V = GEO.v;
  var CELL = GEO.CELL;

  var W = { built: false, t: 0, G: null, root: null, chunks: [], mats: null, buildKey: null, colliders: [], colHash: new Map(), falling: [], buildMs: 0,
    segs: [], job: null, beyondStartM: 1e9, buildingSeg: 0, fallbackPi: null };
  var G = null; // the current cave geometry (TU.caveGeo.create)

  /* ------------------------------------------------------------------ */
  /* Areas: named kinds of places (zone banners and hint messages)       */
  /* ------------------------------------------------------------------ */
  // style 'zone' shows a big banner, 'msg' a short line, 'none' nothing (still tracked).
  var AREAS = {
    mouth: { id: 'mouth', title: 'THE MOUTH', subtitle: 'Follow the passage down. The rope leads home.', style: 'zone', pieceType: 'chamber_small' },
    throat: { id: 'throat', title: 'TWILIGHT THROAT', subtitle: 'The daylight stays behind.', style: 'zone', pieceType: 'straight' },
    galleries: { id: 'galleries', title: 'THE BLACK GALLERIES', subtitle: 'Your light is all there is now.', style: 'zone', pieceType: 'straight' },
    sulfur: { id: 'sulfur', title: 'THE SULFUR DEEP', subtitle: 'The water tastes wrong down here.', style: 'zone', pieceType: 'straight' },
    oldwater: { id: 'oldwater', title: 'THE OLD WATER', subtitle: 'Nothing has moved here in a very long time.', style: 'zone', pieceType: 'straight' },
    junction: { id: 'junction', title: 'The passage splits here. Drop a waypoint? (Q)', subtitle: '', style: 'msg', pieceType: 'junction_t' },
    passage: { id: 'passage', title: '', subtitle: '', style: 'none', pieceType: 'straight' },
    pocket: { id: 'pocket', title: 'AIR POCKET', subtitle: 'Look up. Kick up with Space to surface and breathe.', style: 'zone', pieceType: 'air_pocket' },
    squeeze: { id: 'squeeze', title: 'THE SQUEEZE', subtitle: 'Tight. Slow. Do not panic.', style: 'zone', pieceType: 'squeeze' },
    silt: { id: 'silt', title: 'SILT GALLERY', subtitle: 'Fine silt on the floor. Keep off it, keep it slow.', style: 'zone', pieceType: 'silt_floor' },
    current: { id: 'current', title: 'THE CURRENT', subtitle: 'The water is pulling. Stay close to the wall.', style: 'zone', pieceType: 'current' },
    drop: { id: 'drop', title: 'THE DROP', subtitle: 'Deeper now. Watch your air.', style: 'zone', pieceType: 'shaft_down' },
    room: { id: 'room', title: 'The passage opens into a chamber.', subtitle: '', style: 'msg', pieceType: 'chamber_small' },
    drychamber: { id: 'drychamber', title: 'DRY CHAMBER', subtitle: 'Air. Climb out and breathe.', style: 'zone', pieceType: 'chamber_small' },
    landmark: { id: 'landmark', title: 'LANDMARK', subtitle: '', style: 'zone', pieceType: 'landmark' },
    chamber: { id: 'chamber', title: 'THE DEEP CHAMBER', subtitle: 'Touch it.', style: 'zone', pieceType: 'chamber_large' },
    branch: { id: 'branch', title: 'SIDE PASSAGE', subtitle: 'Narrow. Is it going anywhere?', style: 'zone', pieceType: 'straight' },
    loop: { id: 'loop', title: 'A side passage. It might rejoin the main line.', subtitle: '', style: 'msg', pieceType: 'straight' },
    branchEnd: { id: 'branchEnd', title: 'DEAD END', subtitle: 'Follow your rope back to the main line.', style: 'zone', pieceType: 'dead_end' }
  };
  var ZONE_AREA = ['mouth', 'throat', 'galleries', 'sulfur', 'oldwater'];
  var LANDMARKS = {
    'The Drowned Truck': 'How did it get down here?',
    'The Pipe Organ': 'Columns like organ pipes. Listen to the water.',
    'The Wrong Way Room': 'An old guideline points back the way you came.',
    'The Bell Chamber': 'A great dome. Your bubbles ring on the ceiling.',
    'The Old Camp': 'Someone was here before you.'
  };

  /* ------------------------------------------------------------------ */
  /* Endless mode: the Beyond zones below the first bottom               */
  /* ------------------------------------------------------------------ */
  // Every KEEP DIVING opens a new generated segment under the last Ancient Ring. Inside those
  // segments the depth zones go on past the five of the first cave: zone index 5 "The Hollow"
  // (down to 350 m), 6 "The Root" (350 m and deeper), then a new zone every 100 m, cycling
  // through the variants below with a number (The Hollow II, ...). The first cave keeps 0..4.
  var ENDLESS = {
    beyondTopM: 250,     // m, where zone 6 ("The Hollow", index 5) starts by name
    stepM: 100,          // m of depth per Beyond zone
    budgetMs: 6,         // ms per frame spent building a new segment (sampling, meshing, dressing)
    minOpenS: 3.6,       // s of rumbling before the floor can break open (the dramatic part)
    holeClear: 3.4,      // m around the hole where boulders and stalagmites fall away
    maxAttempts: 8       // derived seeds tried until the air rule and the space below both work
  };
  var BEYOND = [
    { name: 'The Hollow', subtitle: 'The rock opens up. Nothing should be this big down here.', col: 0x8C8790 },
    { name: 'The Root', subtitle: 'Something grew down through the stone. It is still growing.', col: 0x5F3B2D },
    { name: 'The Glass Dark', subtitle: 'Black glass walls. Your light goes in and does not come back.', col: 0x2A2A31 },
    { name: 'The Bone Choir', subtitle: 'The walls are full of bones. The water hums.', col: 0xA39A84 },
    { name: 'The Still Sea', subtitle: 'Green water, perfectly still. Something is listening.', col: 0x34514A }
  ];
  var ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  function beyondZone(depth) { return 5 + Math.max(0, Math.floor((depth - ENDLESS.beyondTopM) / ENDLESS.stepM)); }
  function zoneName(z) {
    if (z < 5) return U.ZONE_NAMES[z];
    var i = z - 5, cyc = Math.floor(i / BEYOND.length);
    return BEYOND[i % BEYOND.length].name + (ROMAN[cyc] != null ? ROMAN[cyc] : ' ' + (cyc + 1));
  }
  function zoneTopM(z) { return z < 5 ? U.ZONE_TOP_M[z] : z === 5 ? Math.min(ENDLESS.beyondTopM, W.beyondStartM || ENDLESS.beyondTopM) : ENDLESS.beyondTopM + (z - 5) * ENDLESS.stepM; }
  // Zone index at a point: the first cave uses the classic five zones, endless segments the Beyond zones.
  function zoneIndexAt(x, y, z, P) {
    var depth = Math.max(0, TU.cfg.world.surfaceY - y), seg;
    if (P) seg = P.seg || 0;
    else { var pi = G ? GEO.pieceAt(G, x, y, z) : -1; seg = pi >= 0 ? (G.pieces[pi].seg || 0) : (depth >= (W.beyondStartM || 1e9) ? 1 : 0); }
    return seg > 0 ? beyondZone(depth) : U.zoneOfDepth(depth);
  }
  // Area (banner) for a Beyond zone, made on first use.
  function beyondArea(z) {
    var id = 'bz' + z, A = TU.cave.areas;
    if (!A[id]) A[id] = { id: id, title: zoneName(z).toUpperCase(), subtitle: BEYOND[(z - 5) % BEYOND.length].subtitle, style: 'zone', pieceType: 'straight', zone: z };
    return id;
  }

  /* ------------------------------------------------------------------ */
  /* Colors (linear) for painting the wall mesh                          */
  /* ------------------------------------------------------------------ */
  function lin(h) { var c = new T.Color(h); return [Math.pow(c.r, 2.2), Math.pow(c.g, 2.2), Math.pow(c.b, 2.2)]; }
  // Art Direction palette by depth (m): cream limestone, tan-grey, cool grey-brown, khaki, basalt.
  var PAL = [[0, lin(0xC9B99A)], [14, lin(0xBDAD8E)], [28, lin(0x8C7F6A)], [62, lin(0x726A5E)], [112, lin(0x625C52)], [132, lin(0x4E4A3C)], [188, lin(0x4A463C)], [212, lin(0x3A3A40)], [400, lin(0x323237)]];
  var C_SILT = [lin(0xA89A7E), lin(0xA89A7E), lin(0x9A8F78), lin(0x8B8468), lin(0x5C5B5E)];
  var C_WETAIR = lin(0x5C5248);
  var BEY_LIN = BEYOND.map(function (b) { return lin(b.col); });
  // seg > 0: the Beyond palettes (one per zone, blending into the next near each boundary).
  function palette(depth, out, seg) {
    if (seg > 0) {
      var zf = (depth - ENDLESS.beyondTopM) / ENDLESS.stepM, bi = Math.max(0, Math.floor(zf)), fr = zf - bi;
      var c0 = BEY_LIN[bi % BEY_LIN.length], c1 = BEY_LIN[(bi + 1) % BEY_LIN.length], tb = smooth(0.85, 1.0, fr);
      if (zf < 0) { c1 = c0; c0 = PAL[PAL.length - 1][1]; tb = smooth(-0.35, 0, zf); }
      out[0] = lerp(c0[0], c1[0], tb); out[1] = lerp(c0[1], c1[1], tb); out[2] = lerp(c0[2], c1[2], tb);
      return out;
    }
    for (var i = 0; i < PAL.length - 1; i++) {
      if (depth <= PAL[i + 1][0]) { var a = PAL[i], b = PAL[i + 1], t = smooth(a[0], b[0], depth); out[0] = lerp(a[1][0], b[1][0], t); out[1] = lerp(a[1][1], b[1][1], t); out[2] = lerp(a[1][2], b[1][2], t); return out; }
    }
    var l = PAL[PAL.length - 1][1]; out[0] = l[0]; out[1] = l[1]; out[2] = l[2]; return out;
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function v3(a) { return new T.Vector3(a[0], a[1], a[2]); }
  function arr(v) { return [v.x, v.y, v.z]; }
  function field(x, y, z, g) { return GEO.field(G, x, y, z, g); }
  function march(o, d, max) { return GEO.march(G, o[0], o[1], o[2], d[0], d[1], d[2], max); }
  var gScratch = [0, 0, 0];
  // Point on a path at distance s: { p: [x,y,z], tan: [x,y,z], i }
  function pathAt(path, s) {
    s = clamp(s, 0, path.L);
    var c = path.cum, lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    var seg = c[hi] - c[lo] || 1e-6, t = (s - c[lo]) / seg;
    var a = path.pts[lo], b = path.pts[hi];
    return { p: V.lerp(a, b, t), tan: V.norm(V.sub(b, a)), i: lo };
  }
  // Closest point to (x,y,z) on the path segments registered with piece P.
  function nearestOnPiece(P, x, y, z) {
    var best = null, bd = 1e18;
    var segs = P.segs.length ? P.segs : G.main.pts.length > 1 ? null : [];
    if (!segs) { segs = []; for (var q = 0; q < G.main.pts.length - 1; q++) segs.push({ path: G.main, i: q }); }
    for (var k = 0; k < segs.length; k++) {
      var sg = segs[k], pts = sg.path.pts, a = pts[sg.i], b = pts[sg.i + 1];
      var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz || 1e-9;
      var u = ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      var px = a[0] + dx * u, py = a[1] + dy * u, pz = a[2] + dz * u;
      var d = (x - px) * (x - px) + (y - py) * (y - py) + (z - pz) * (z - pz);
      if (d < bd) { bd = d; best = { path: sg.path, i: sg.i, u: u, p: [px, py, pz], s: sg.path.cum[sg.i] + Math.sqrt(l2) * u, tan: [dx / Math.sqrt(l2), dy / Math.sqrt(l2), dz / Math.sqrt(l2)], d2: d }; }
    }
    return best;
  }
  // Which piece a point belongs to (index), using the hint for points pushed into rock.
  function locate(x, y, z, hint) {
    var pi = GEO.pieceAt(G, x, y, z);
    if (pi >= 0) { if (hint) hint.pi = pi; return pi; }
    if (hint && hint.pi != null && G.pieces[hint.pi]) return hint.pi;
    var cx = Math.floor(x / CELL), cy = Math.floor(-z / CELL), cd = Math.floor(-y / CELL), best = -1, bd = 1e9;
    for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) for (var c = -1; c <= 1; c++) {
      var v = G.cellMap.get(GEO.key(cx + a, cy + b, cd + c));
      if (v === undefined) continue;
      var P = G.pieces[v], dd = Math.abs(P.center[0] - x) + Math.abs(P.center[1] - y) + Math.abs(P.center[2] - z);
      if (dd < bd) { bd = dd; best = v; }
    }
    if (best < 0) best = W.fallbackPi != null && G.pieces[W.fallbackPi] && !G.pieces[W.fallbackPi].freed ? W.fallbackPi : G.entrance.idx;
    if (hint) hint.pi = best;
    return best;
  }
  function inBox(b, x, y, z) { return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1; }

  /* ------------------------------------------------------------------ */
  /* Piece properties: area, silt, current, temperature, decoration      */
  /* ------------------------------------------------------------------ */
  // pieces: the pieces to classify (a whole cave, or one endless segment); mainIds: their main line
  // (piece ids, in order); rnd: a seeded Rng; seg: segment index (0 = the first cave).
  function classifyPieces(pieces, mainIds, rnd, seg) {
    var L = { mainPath: mainIds };
    pieces = pieces || G.pieces; rnd = rnd || TU.rng(G.seed, 12); seg = seg || 0;
    if (!mainIds) L = G.layout;
    pieces.forEach(function (P) {
      var t = P.type, z = Math.min(4, P.zone);
      P.silt = t === 'silt_floor' ? 1 : P.room ? (P.dry ? 0.1 : 0.45) : t === 'dead_end' ? 0.55 : (t === 'shaft_down' || t === 'shaft_up') ? 0.08 : 0.12 + 0.2 * rnd.float();
      if (P.start) P.silt = 0.05;
      P.scallop = t === 'current' ? 1 : 0.25 + 0.2 * rnd.float();
      var zf = seg ? 0.5 : [1.0, 0.9, 0.75, 0.32, 0.22][z]; // the Beyond is strangely decorated
      var tf = P.room ? 1.0 : t === 'junction_t' || t === 'junction_x' ? 0.55 : t === 'squeeze' ? 0.05 : t === 'current' ? 0.08 : t === 'dead_end' ? 0.6 : t === 'air_pocket' ? 0.65 : t === 'silt_floor' ? 0.25 : (t === 'shaft_down' || t === 'shaft_up') ? 0.22 : 0.38;
      if (P.dry) tf = 1.25;
      if (P.start) tf = 0.15;
      var dec = zf * tf * (rnd.chance(0.16) ? 2.2 : 1);
      if (P.lmName === 'The Pipe Organ' || P.lmName === 'The Bell Chamber') dec = Math.max(dec, 1.2);
      P.deco = clamp(dec, 0, 1.3);
      P.warm = !!P.warm;
      if (t === 'air_pocket') P.warm = rnd.chance(0.5);
      if (z === 3 && rnd.chance(0.12)) P.vent = true; // a warm sulfur spring
    });
    // Make sure there is a silty gallery somewhere (old saves and tests expect one).
    var anySilt = pieces.some(function (P) { return P.type === 'silt_floor'; });
    if (!seg) G.siltFix = null;
    if (!anySilt && !seg) {
      var main = L.mainPath.map(function (id) { return G.byId[id]; });
      for (var i = 2; i < main.length - 2; i++) {
        var P = main[i], Q = main[i + 1];
        if ((P.type === 'straight' || P.type === 'bend') && P.zone >= 1 && (Q.type === 'straight' || Q.type === 'bend' || Q.room)) { P.silt = 1; P.siltFixed = true; if (!Q.room) { Q.silt = 1; Q.siltFixed = true; } G.siltFix = P; break; }
      }
    }
    pieces.forEach(function (P) {
      if (P.silt >= 0.9) return;
      // silt spreads a little into the neighbours of silty pieces
      P.ports.forEach(function (pt) { var o = G.pieces[pt.a === P.idx ? pt.b : pt.a]; if (o.silt >= 0.9 && !P.room) P.silt = Math.max(P.silt, 0.5); });
    });
    // areas
    var mainSet = {}; L.mainPath.forEach(function (id, k) { mainSet[id] = k; });
    var mainSeq = L.mainPath.map(function (id) { return G.byId[id]; });
    // runs of vertical drops on the main line (3 or more cells) are "The Drop"
    for (var k = 0; k < mainSeq.length; k++) {
      var run = 0; while (k + run < mainSeq.length && (mainSeq[k + run].type === 'shaft_down')) run++;
      if (run >= 3) for (var r = 0; r < run; r++) mainSeq[k + r].dropRun = true;
      k += run;
    }
    pieces.forEach(function (P) {
      var t = P.type, a;
      if (P.start) a = 'mouth';
      else if (seg && (P.segStart || P.connector)) a = 'seg' + seg;
      else if (P.bottom) a = seg ? 'chamber' + seg : 'chamber';
      else if (P.dry) a = 'drychamber';
      else if (t === 'landmark') a = 'lm' + P.id;
      else if (t === 'air_pocket' || P.airChamber) a = 'pocket';
      else if (t === 'squeeze') a = 'squeeze';
      else if (t === 'silt_floor' || P.siltFixed) a = 'silt';
      else if (t === 'current') a = 'current';
      else if (P.role === 'branch') a = t === 'dead_end' ? 'branchEnd' : 'branch';
      else if (P.role === 'loop') a = 'loop';
      else if (P.room) a = 'room';
      else if (P.dropRun) a = 'drop';
      else if ((t === 'junction_t' || t === 'junction_x') && P.role === 'main') a = 'junction';
      else a = seg ? beyondArea(P.zone) : ZONE_AREA[P.zone];
      P.area = a;
    });
    // landmark areas get their own entry (their name is the banner)
    var areas = seg ? TU.cave.areas : {};
    if (!seg) for (var id in AREAS) areas[id] = AREAS[id];
    if (seg) {
      areas['seg' + seg] = { id: 'seg' + seg, title: 'THE WAY DOWN', subtitle: 'Below the Ancient Ring. Nobody has ever been this deep.', style: 'zone', pieceType: 'shaft_down' };
      areas['chamber' + seg] = { id: 'chamber' + seg, title: 'ANOTHER RING', subtitle: 'It has been waiting for you. Touch it.', style: 'zone', pieceType: 'chamber_large' };
    }
    pieces.forEach(function (P) {
      if (P.type !== 'landmark') return;
      areas[P.area] = { id: P.area, title: P.lmName.toUpperCase(), subtitle: LANDMARKS[P.lmName] || '', style: 'zone', pieceType: 'landmark' };
    });
    TU.cave.areas = areas;
  }

  // Water flow at a point (m/s), written into out. Currents flow out of the cave (against you).
  function currentAt(P, x, y, z, np, out) {
    out.set(0, 0, 0);
    if (!P.flow || !np) return out;
    var f = P.flow, tan = np.tan, sgn = f.sign;
    var axisD = Math.sqrt(np.d2), rr = clamp(axisD / 2.2, 0, 1);
    var pulse = 1;
    if (f.pulse) { var ph = (W.t + f.phase) % f.pulse.period; if (ph < f.pulse.duration) pulse = 1 + 0.9 * Math.sin(Math.PI * ph / f.pulse.duration); }
    var sp = f.speed * (1 - 0.55 * rr * rr) * pulse * f.fade(np.s);
    out.set(tan[0] * sp * sgn, tan[1] * sp * sgn, tan[2] * sp * sgn);
    return out;
  }
  // Flow strength 0..1 along a run of current pieces (fades in and out at its ends).
  function makeFade(a0, a1) { return function (s) { return smooth(a0 - 3, a0 + 2, s) * smooth(a1 + 3, a1 - 2, s); }; }
  function setupCurrents(rnd, prefix) {
    rnd = rnd || TU.rng(G.seed, 13); prefix = prefix || ''; var list = [];
    G.paths.forEach(function (path) {
      // walk the path's pieces in order and group consecutive current pieces
      var seen = [], order = [];
      path.owner.forEach(function (pi) { if (seen.indexOf(pi) < 0) { seen.push(pi); order.push(pi); } });
      for (var i = 0; i < order.length; i++) {
        var P = G.pieces[order[i]];
        if (P.type !== 'current' || P.flow) continue;
        var run = [];
        while (i < order.length && G.pieces[order[i]].type === 'current') { run.push(G.pieces[order[i]]); i++; }
        // s range covered by the run
        var s0 = 1e9, s1 = -1e9;
        for (var k = 0; k < path.owner.length; k++) if (run.indexOf(G.pieces[path.owner[k]]) >= 0) { s0 = Math.min(s0, path.cum[k]); s1 = Math.max(s1, path.cum[k]); }
        var speed = 0.75 + rnd.float() * 0.65;
        var sign = path.kind === 'main' ? -1 : (rnd.chance(0.5) ? -1 : 1);
        var pulse = rnd.chance(0.6) ? { period: 9 + rnd.float() * 7, duration: 2.5 + rnd.float() * 1.5 } : null;
        var id = prefix + 'current' + list.length;
        var flow = { speed: speed, sign: sign, pulse: pulse, phase: rnd.float() * 20, fade: makeFade(s0, s1), id: id };
        run.forEach(function (Q) { Q.flow = flow; });
        var mid = pathAt(path, (s0 + s1) / 2), dir = V.mul(mid.tan, sign);
        list.push({ id: id, pos: v3(mid.p), from: s0, to: s1, speed: speed, dir: v3(dir), pulse: pulse, pathId: path.kind, pieces: run.map(function (Q) { return Q.id; }) });
      }
    });
    return list;
  }

  /* ------------------------------------------------------------------ */
  /* Daylight: how much of the sky opening a point can see               */
  /* ------------------------------------------------------------------ */
  var SKY = [0, 0.5, 0];
  function daylightAt(x, y, z) {
    var E = G.entrance; if (!E) return 0;
    var tx = SKY[0], ty = SKY[1], tz = SKY[2];
    var dx = tx - x, dy = ty - y, dz = tz - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var DR = TU.cfg.cave.daylightRange || 46; // m, how far daylight reaches into the cave
    if (d > DR) return 0;
    if (y > -0.2 && inBox(E.box, x, y, z)) return 1;
    var hit = GEO.march(G, x, y, z, dx / d, dy / d, dz / d, d);
    if (hit < d - 0.6) return 0;
    return Math.pow(clamp(1 - d / DR, 0, 1), 1.5);
  }

  /* ------------------------------------------------------------------ */
  /* Wall mesh: build one chunk (up to 2x2x2 cells), displace and paint  */
  /* ------------------------------------------------------------------ */
  function dispAt(x, y, z, k) {
    var bed = (y * 0.95 + 0.6 * N.n3(x * 0.15, y * 0.05, z * 0.15)); bed = bed - Math.floor(bed);
    return k * (0.09 * N.n3(x * 0.62 + 5, y * 0.7, z * 0.62) + 0.1 * N.n3(x * 1.1, y * 1.25, z * 1.1) + 0.06 * (bed - 0.5));
  }
  function buildChunk(ch) {
    var pos = [], nrm = [], idx = [], i, c;
    for (c = 0; c < ch.cells.length; c++) {
      var cc = ch.cells[c], m = GEO.meshCell(G, cc[0], cc[1], cc[2]), base = pos.length / 3;
      for (i = 0; i < m.pos.length; i++) { pos.push(m.pos[i]); nrm.push(m.nrm[i]); }
      for (i = 0; i < m.idx.length; i++) idx.push(m.idx[i] + base);
    }
    var nv = pos.length / 3;
    var P32 = new Float32Array(pos), N32 = new Float32Array(nrm), C32 = new Float32Array(nv * 3), I32 = new Float32Array(nv * 4);
    var col = [0, 0, 0], g = [0, 0, 0];
    for (i = 0; i < nv; i++) {
      var x = P32[i * 3], y = P32[i * 3 + 1], z = P32[i * 3 + 2], nx = N32[i * 3], ny = N32[i * 3 + 1], nz = N32[i * 3 + 2];
      var pi = GEO.pieceAt(G, x - nx * 0.1, y - ny * 0.1, z - nz * 0.1);
      if (pi < 0) pi = GEO.pieceAt(G, x + nx * 0.3, y + ny * 0.3, z + nz * 0.3);
      if (pi < 0) pi = ch.pi;
      var P = G.pieces[pi], depth = -y;
      // fine relief: small knobs and bedding ledges, with the normal tilted to match
      var ka = GEO.ampAt(P, x, y, z); if (ka > 1) ka = 1 + (ka - 1) * 0.5;
      var wall = 1 - Math.abs(ny);
      var k = ka * (0.6 + 0.4 * wall);
      if (y > 7.5) k = 0;
      var d0 = dispAt(x, y, z, k);
      // tangent frame
      var tx = -nz, ty = 0, tz = nx; var tl = Math.sqrt(tx * tx + tz * tz);
      if (tl < 0.2) { tx = 1; ty = 0; tz = 0; tl = 1; }
      tx /= tl; tz /= tl;
      var bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      var e = 0.11;
      var d1 = dispAt(x + tx * e, y + ty * e, z + tz * e, k), d2 = dispAt(x + bx * e, y + by * e, z + bz * e, k);
      var g1 = (d1 - d0) / e, g2 = (d2 - d0) / e;
      var mx = nx - tx * g1 - bx * g2, my = ny - ty * g1 - by * g2, mz = nz - tz * g1 - bz * g2, ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      x += nx * d0; y += ny * d0; z += nz * d0;
      P32[i * 3] = x; P32[i * 3 + 1] = y; P32[i * 3 + 2] = z;
      nx = mx / ml; ny = my / ml; nz = mz / ml;
      N32[i * 3] = nx; N32[i * 3 + 1] = ny; N32[i * 3 + 2] = nz;
      // base color from depth, silt on floors, darker ceilings, occlusion in crevices
      palette(depth, col, P.seg || 0);
      var r = col[0], gg = col[1], b = col[2];
      var fl = smooth(0.5, 0.9, ny) * (0.25 + 0.75 * P.silt);
      var sc = C_SILT[Math.min(4, U.zoneOfDepth(depth))];
      r = lerp(r, sc[0], fl); gg = lerp(gg, sc[1], fl); b = lerp(b, sc[2], fl);
      if (ny < -0.4) { r *= 0.88; gg *= 0.88; b *= 0.9; }
      var f1 = field(x + nx * 0.5, y + ny * 0.5, z + nz * 0.5), f2 = field(x + nx * 1.5, y + ny * 1.5, z + nz * 1.5);
      var ao = 0.3 + 0.7 * (0.5 * clamp(-f1 / 0.5, 0, 1) + 0.5 * clamp(-f2 / 1.5, 0, 1));
      var wet = 0;
      if (P.waterY != null && P.airBox && inBox(P.airBox, x, y, z) && y > P.waterY - 0.08) {
        wet = 1 - 0.55 * smooth(P.waterY + 0.4, P.waterY + 5, y);
        r = lerp(r, C_WETAIR[0], 0.35); gg = lerp(gg, C_WETAIR[1], 0.35); b = lerp(b, C_WETAIR[2], 0.35);
        ao *= 0.92;
      }
      var tint = 0.92 + 0.16 * GEO.hfS(P.seedV != null ? P.seedV : G.seedV, pi, 1, 0, 91);
      C32[i * 3] = r * ao * tint; C32[i * 3 + 1] = gg * ao * tint; C32[i * 3 + 2] = b * ao * tint;
      var day = depth < 60 ? daylightAt(x + nx * 0.25, y + ny * 0.25, z + nz * 0.25) : 0;
      // Beyond rock: the shader reads a negative daylight as "which Beyond look" (1 + variant)
      if (P.seg > 0) day = -(1 + (beyondZone(depth) - 5) % BEYOND.length);
      I32[i * 4] = wet; I32[i * 4 + 1] = day; I32[i * 4 + 2] = P.deco || 0; I32[i * 4 + 3] = P.scallop || 0.3;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(P32, 3));
    geo.setAttribute('normal', new T.BufferAttribute(N32, 3));
    geo.setAttribute('color', new T.BufferAttribute(C32, 3));
    geo.setAttribute('aInfo', new T.BufferAttribute(I32, 4));
    geo.setIndex(nv > 65535 ? new T.BufferAttribute(new Uint32Array(idx), 1) : new T.BufferAttribute(new Uint16Array(idx), 1));
    geo.computeBoundingSphere();
    var root = ch.root || W.root;
    if (ch.mesh) { root.remove(ch.mesh); ch.mesh.geometry.dispose(); }
    var mesh = new T.Mesh(geo, W.mats.rock);
    mesh.receiveShadow = true; mesh.castShadow = true; mesh.name = 'rock';
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    ch.mesh = mesh; ch.tris = idx.length / 3; ch.verts = nv;
    ch.center = geo.boundingSphere.center.clone(); ch.radius = geo.boundingSphere.radius;
    root.add(mesh);
  }
  function buildAllChunks() {
    var cells = [];
    G.cellMap.forEach(function (pi, k) { cells.push(GEO.decode(k)); });
    W.chunks = []; W.chunkByCell = new Map(); W.pending = [];
    makeChunks(cells, W.segs[0], spawnPoint().pos, 40);
  }
  // Group cells into chunks (up to 2x2x2 cells, never mixing segments) and register them.
  // Chunks within nearM of nearPos are meshed now, the rest wait in W.pending.
  function makeChunks(cells, seg, nearPos, nearM) {
    var map = new Map();
    cells.forEach(function (c) {
      var x = c[0], y = c[1], d = c[2], pi = G.cellMap.get(GEO.key(x, y, d));
      if (pi === undefined) return;
      var ck = 's' + seg.index + ':' + Math.floor(x / 2) + ',' + Math.floor(y / 2) + ',' + Math.floor(d / 2);
      var ch = map.get(ck); if (!ch) { ch = { key: ck, cells: [], pi: pi, mesh: null, root: seg.root, seg: seg.index }; map.set(ck, ch); }
      ch.cells.push([x, y, d]);
    });
    // Progressive build: the wall mesh near the spawn is built now, the rest a few chunks per
    // frame (nearest to the camera first, and immediately if you get close to one).
    var sp = nearPos, out = [];
    map.forEach(function (ch) {
      var c = [0, 0, 0];
      ch.cells.forEach(function (cc) { var w = GEO.cellCenter(cc[0], cc[1], cc[2]); c[0] += w[0]; c[1] += w[1]; c[2] += w[2]; });
      ch.center = new T.Vector3(c[0] / ch.cells.length, c[1] / ch.cells.length, c[2] / ch.cells.length);
      ch.radius = 0; ch.cells.forEach(function (cc) { var w = GEO.cellCenter(cc[0], cc[1], cc[2]); ch.radius = Math.max(ch.radius, ch.center.distanceTo(v3(w)) + 7); });
      W.chunks.push(ch); seg.chunks.push(ch); out.push(ch); ch.cells.forEach(function (cc) { W.chunkByCell.set(GEO.key(cc[0], cc[1], cc[2]), ch); });
      if (sp && sp.distanceTo(ch.center) - ch.radius < nearM) buildChunk(ch); else W.pending.push(ch);
    });
    return out;
  }
  // Build pending wall chunks: forced for chunks near pos, then nearest first within a time budget (ms).
  function pumpChunks(pos, budgetMs) {
    if (!W.pending || !W.pending.length) return 0;
    var t0 = performance.now(), built = 0;
    W.pending.sort(function (a, b) { return (pos.distanceTo(a.center) - a.radius) - (pos.distanceTo(b.center) - b.radius); });
    while (W.pending.length) {
      var ch = W.pending[0], near = pos.distanceTo(ch.center) - ch.radius < 35;
      if (!near && performance.now() - t0 > budgetMs) break;
      W.pending.shift(); buildChunk(ch); built++;
    }
    return built;
  }
  function finishBuild() { while (W.pending && W.pending.length) buildChunk(W.pending.shift()); updateStats(); return W.stats; }

  /* ------------------------------------------------------------------ */
  /* Colliders: boulders, columns, monoliths, fallen rocks                */
  /* ------------------------------------------------------------------ */
  // sphere: { t: 0, c: [x,y,z], r } ; capsule: { t: 1, a, b, r }
  function addCollider(c) {
    var lo, hi;
    if (c.seg == null) c.seg = W.buildingSeg || 0;
    if (c.t === 0) { lo = [c.c[0] - c.r, c.c[1] - c.r, c.c[2] - c.r]; hi = [c.c[0] + c.r, c.c[1] + c.r, c.c[2] + c.r]; }
    else { lo = [Math.min(c.a[0], c.b[0]) - c.r, Math.min(c.a[1], c.b[1]) - c.r, Math.min(c.a[2], c.b[2]) - c.r]; hi = [Math.max(c.a[0], c.b[0]) + c.r, Math.max(c.a[1], c.b[1]) + c.r, Math.max(c.a[2], c.b[2]) + c.r]; }
    W.colliders.push(c);
    for (var x = Math.floor(lo[0] / CELL); x <= Math.floor(hi[0] / CELL); x++)
      for (var y = Math.floor(-hi[2] / CELL); y <= Math.floor(-lo[2] / CELL); y++)
        for (var d = Math.floor(-hi[1] / CELL); d <= Math.floor(-lo[1] / CELL); d++) {
          var k = GEO.key(x, y, d), a = W.colHash.get(k); if (!a) W.colHash.set(k, a = []); a.push(c);
        }
    return c;
  }
  // Signed distance from p to a collider surface, and the push direction in n.
  function colDist(c, x, y, z, n) {
    var px, py, pz;
    if (c.t === 0) { px = c.c[0]; py = c.c[1]; pz = c.c[2]; }
    else {
      var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], dz = c.b[2] - c.a[2], l2 = dx * dx + dy * dy + dz * dz || 1e-9;
      var u = clamp(((x - c.a[0]) * dx + (y - c.a[1]) * dy + (z - c.a[2]) * dz) / l2, 0, 1);
      px = c.a[0] + dx * u; py = c.a[1] + dy * u; pz = c.a[2] + dz * u;
    }
    var ex = x - px, ey = y - py, ez = z - pz, l = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (l < 1e-6) { n[0] = 0; n[1] = 1; n[2] = 0; } else { n[0] = ex / l; n[1] = ey / l; n[2] = ez / l; }
    return l - c.r;
  }

  /* ------------------------------------------------------------------ */
  /* Queries                                                             */
  /* ------------------------------------------------------------------ */
  var tmpCur = new T.Vector3();
  function surfaceOf(P, x, y, z) {
    if (P.waterY == null || !P.airBox) return null;
    return inBox(P.airBox, x, y, z) ? P.waterY : null;
  }
  function tempAt(P, depth, surf) {
    var t = 21 - 0.065 * depth;
    if (P.warm) t += 7;
    else if (surf != null) t += 2.5;
    if (P.vent) t += 6;
    return t;
  }

  // Full description of the cave around a point. Returns a NEW object each call (safe to keep).
  function nearestPoint(pos, hint) {
    var x = pos.x, y = pos.y, z = pos.z;
    var pi = locate(x, y, z, hint), P = G.pieces[pi];
    var np = nearestOnPiece(P, x, y, z);
    var f = field(x, y, z), g = GEO.gradient(G, x, y, z, [0, 0, 0]), gl = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) || 1;
    var depth = Math.max(0, TU.cfg.world.surfaceY - y);
    var surf = surfaceOf(P, x, y, z);
    var point = np ? v3(np.p) : new T.Vector3(x, y, z);
    var dl = np ? Math.sqrt(np.d2) : 0;
    var path = np ? np.path : G.main;
    // floor and ceiling right below and above (if we are in the rock, measure from the center line)
    var ox = x, oy = y, oz = z;
    if (f > -0.02 && np) { ox = np.p[0]; oy = np.p[1]; oz = np.p[2]; }
    var dDown = GEO.march(G, ox, oy, oz, 0, -1, 0, 40), dUp = GEO.march(G, ox, oy, oz, 0, 1, 0, 40);
    return {
      point: point,                                   // nearest center line point
      radius: Math.max(0.05, dl - f),                 // m, center to wall in the direction of pos
      wallDist: -f,                                   // m, positive = inside the water (or air) space
      inside: f < 0,
      normal: new T.Vector3(g[0] / gl, g[1] / gl, g[2] / gl), // toward the nearest rock (the wall's inward normal is -normal)
      t: path === G.main && np ? np.s / G.main.L : 0, // 0..1 along the main path
      s: np ? np.s : 0,                               // m along this path from its start
      pathId: path.kind,                              // 'main' | 'branch' | 'loop'
      branchId: path.branch,
      pieceId: P.id,                                  // generator piece id
      pieceType: P.type,                              // generator TYPES name
      area: P.area,
      zone: zoneIndexAt(x, y, z, P),                 // 0..4 in the first cave, 5+ in the Beyond
      dry: surf !== null && y > surf,
      siltiness: P.silt,                              // 0..1 how silty the floor is here
      current: currentAt(P, x, y, z, np, new T.Vector3()), // m/s water flow
      temperature: tempAt(P, depth, surf),            // degrees C
      daylight: depth < 50 ? daylightAt(x, y, z) : 0, // 0..1 how much entrance light reaches here
      floorY: oy - dDown,
      ceilY: oy + dUp,
      surfaceY: surf                                  // water surface above, or null if water meets rock
    };
  }

  var CR = { pos: new T.Vector3(), vel: new T.Vector3(), normal: new T.Vector3(0, 1, 0), hit: false, depth: 0, impact: 0, blocked: null, hasVel: false };
  var cn = [0, 0, 0], cg = [0, 0, 0];
  // Push a sphere out of the rock. Does not change its inputs. Returns a SHARED result object:
  // read or copy it straight away. opts: { vel: Vector3 (reflected into result.vel), hint: {} }.
  function collide(pos, radius, opts) {
    opts = opts || {};
    var p = CR.pos.copy(pos), v = CR.vel, hasVel = !!opts.vel;
    if (hasVel) v.copy(opts.vel); else v.set(0, 0, 0);
    CR.hit = false; CR.depth = 0; CR.impact = 0; CR.blocked = null; CR.hasVel = hasVel; CR.normal.set(0, 1, 0);
    if (!G) return CR;
    var nx = 0, ny = 0, nz = 0;
    for (var it = 0; it < 3; it++) {
      var f = field(p.x, p.y, p.z, cg), pen = f + radius;
      if (pen <= 0) break;
      var gl = Math.sqrt(cg[0] * cg[0] + cg[1] * cg[1] + cg[2] * cg[2]);
      if (gl < 0.05 || f > 2.4) {
        // deep inside rock (teleport or a big push): go back to the center line
        var pi = locate(p.x, p.y, p.z, opts.hint), np = nearestOnPiece(G.pieces[pi], p.x, p.y, p.z);
        if (np) { var dx = np.p[0] - p.x, dy = np.p[1] - p.y, dz = np.p[2] - p.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; p.set(np.p[0], np.p[1], np.p[2]); nx += dx / l; ny += dy / l; nz += dz / l; CR.depth += l; CR.hit = true; }
        break;
      }
      var ux = -cg[0] / gl, uy = -cg[1] / gl, uz = -cg[2] / gl, push = pen / clamp(gl, 0.7, 1.3);
      p.x += ux * push; p.y += uy * push; p.z += uz * push;
      nx += ux; ny += uy; nz += uz; CR.depth += push; CR.hit = true;
    }
    // boulders, columns, fallen rocks
    var list = W.colHash.get(GEO.key(Math.floor(p.x / CELL), Math.floor(-p.z / CELL), Math.floor(-p.y / CELL)));
    if (list) for (var k = 0; k < list.length; k++) {
      var d = colDist(list[k], p.x, p.y, p.z, cn) - radius;
      if (d < 0) { p.x -= cn[0] * d; p.y -= cn[1] * d; p.z -= cn[2] * d; nx += cn[0]; ny += cn[1]; nz += cn[2]; CR.depth -= d; CR.hit = true; }
    }
    for (k = 0; k < W.falling.length; k++) {
      var fr = W.falling[k]; var ddd = colDist(fr.col, p.x, p.y, p.z, cn) - radius;
      if (ddd < 0) { p.x -= cn[0] * ddd; p.y -= cn[1] * ddd; p.z -= cn[2] * ddd; nx += cn[0]; ny += cn[1]; nz += cn[2]; CR.depth -= ddd; CR.hit = true; }
    }
    if (CR.hit) {
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      CR.normal.set(nx, ny, nz);
      var vn = -(v.x * nx + v.y * ny + v.z * nz);
      if (vn > 0) { CR.impact = vn; v.x += nx * vn * 1.15; v.y += ny * vn * 1.15; v.z += nz * vn * 1.15; v.multiplyScalar(1 - Math.min(0.5, vn * 0.25)); }
    }
    // The entrance pool is the surface: you cannot climb out of the cave from here.
    var E = G.entrance;
    if (E && p.y > 0.2 && inBox(E.box, p.x, p.y, p.z)) {
      p.y = 0.2; if (v.y > 0) v.y = 0; CR.blocked = 'exit';
    }
    return CR;
  }
  function contains(pos, margin) { return !!G && field(pos.x, pos.y, pos.z) < -(margin || 0); }
  // Distance from origin along dir (unit) to the first rock, or maxDist.
  function raycast(origin, dir, maxDist, hint) {
    maxDist = maxDist || 14;
    if (!G) return maxDist;
    return GEO.march(G, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
  }
  function waterSurfaceY(pos) { if (!G) return null; var P = G.pieces[locate(pos.x, pos.y, pos.z)]; return surfaceOf(P, pos.x, pos.y, pos.z); }
  function isDry(pos) { var y = waterSurfaceY(pos); return y !== null && pos.y > y; }
  // { index, name, topM, beyond }: index 0..4 in the first cave, 5+ in endless segments (the Beyond).
  function zoneAt(pos) { var z = zoneIndexAt(pos.x, pos.y, pos.z); return { index: z, name: zoneName(z), topM: zoneTopM(z), beyond: z >= 5 }; }
  // Which cave segment a point is in (0 = the first cave, k = the k-th KEEP DIVING segment), -1 in solid rock or outside.
  function segmentAt(pos) { if (!G || !pos) return -1; var pi = GEO.pieceAt(G, pos.x, pos.y, pos.z); if (pi < 0 || !G.pieces[pi] || G.pieces[pi].freed) return -1; return G.pieces[pi].seg || 0; }
  function areaAt(pos, hint) { if (!G) return null; var P = G.pieces[locate(pos.x, pos.y, pos.z, hint)]; return TU.cave.areas[P.area] || null; }

  // A random point in the cave. opts: { area, zone, surface: 'water'|'ceiling'|'floor'|'wall', frac: [min, max] }
  function randomSpot(opts, rand) {
    opts = opts || {}; rand = rand || Math.random;
    if (!G) return null;
    var cands = G.pieces.filter(function (P) {
      if (opts.area && P.area !== opts.area) return false;
      if (opts.zone !== undefined && opts.zone !== null && P.zone !== opts.zone) return false;
      return P.segs.length > 0 && !P.start && !P.freed && !(P.seg > 0 && !segOpen(P.seg));
    });
    if (!cands.length && opts.area === 'chamber' && G.bottom) cands = [G.bottom];
    if (!cands.length && opts.area) cands = G.pieces.filter(function (P) { return P.segs.length && !P.start && P.zone >= 1 && !P.freed && !(P.seg > 0 && !segOpen(P.seg)); });
    if (!cands.length) return null;
    var tot = 0, wts = cands.map(function (P) { var w = P.cells.length; tot += w; return w; });
    for (var tries = 0; tries < 50; tries++) {
      var r = rand() * tot, ci = 0; while (r > wts[ci] && ci < cands.length - 1) { r -= wts[ci]; ci++; }
      var P = cands[ci], base;
      if (P.room) { base = [lerp(P.box.x0 + 2, P.box.x1 - 2, rand()), lerp(P.box.y0 + 2, P.box.y1 - 2, rand()), lerp(P.box.z0 + 2, P.box.z1 - 2, rand())]; if (field(base[0], base[1], base[2]) > -0.8) { var sg = P.segs[Math.floor(rand() * P.segs.length)]; base = V.lerp(sg.path.pts[sg.i], sg.path.pts[sg.i + 1], rand()); } }
      else { var sg2 = P.segs[Math.floor(rand() * P.segs.length)]; base = V.lerp(sg2.path.pts[sg2.i], sg2.path.pts[sg2.i + 1], rand()); }
      if (field(base[0], base[1], base[2]) > -0.3) continue;
      var surf = opts.surface || 'water', dir;
      if (surf === 'ceiling') dir = V.norm([(rand() - 0.5) * 0.8, 1, (rand() - 0.5) * 0.8]);
      else if (surf === 'floor') dir = V.norm([(rand() - 0.5) * 0.8, -1, (rand() - 0.5) * 0.8]);
      else if (surf === 'wall') { var a = rand() * Math.PI * 2; dir = [Math.cos(a), (rand() - 0.5) * 0.4, Math.sin(a)]; dir = V.norm(dir); }
      else { var u = rand() * 2 - 1, th = rand() * Math.PI * 2, sq = Math.sqrt(1 - u * u); dir = [sq * Math.cos(th), u, sq * Math.sin(th)]; }
      var d = march(base, dir, 14);
      var fr = surf === 'water' ? (opts.frac || [0.2, 0.7]) : [1, 1];
      var k = fr[0] + rand() * (fr[1] - fr[0]);
      var p = V.add(base, V.mul(dir, d * k));
      if (surf === 'water') {
        if (field(p[0], p[1], p[2]) > -0.25) continue;
        var sy = surfaceOf(P, p[0], p[1], p[2]); if (sy != null && p[1] > sy - 0.3) continue;
      }
      var gg = GEO.gradient(G, p[0], p[1], p[2], [0, 0, 0]), gl = V.len(gg) || 1;
      var np = nearestOnPiece(P, p[0], p[1], p[2]);
      var zn = zoneIndexAt(p[0], p[1], p[2], P);
      if (opts.zone !== undefined && opts.zone !== null && zn !== opts.zone && tries < 40) continue;
      return { pos: v3(p), normal: new T.Vector3(-gg[0] / gl, -gg[1] / gl, -gg[2] / gl), area: P.area, zone: zn, pieceType: P.type, s: np ? np.s : 0, pathId: np ? np.path.kind : 'main', pieceId: P.id };
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Named spots (debug teleports, filming, tests)                       */
  /* ------------------------------------------------------------------ */
  var SPOT_NAMES = ['entrance', 'mid', 'junction', 'pocket', 'airpocket', 'pocketSurface', 'squeeze', 'silt', 'drop', 'current', 'drychamber', 'ledge', 'landmark', 'deep', 'bottom', 'end', 'stalactites', 'branch', 'branchEnd', 'deadend', 'loop',
    'hole', 'shaft', 'segStart', 'segPocket', 'dome']; // the last five: endless mode (the newest segment)
  function look(from, to) { return U.yawPitchOf({ x: to[0] - from[0], y: to[1] - from[1], z: to[2] - from[2] }); }
  function mk(p, yp, s, pathId) { return { pos: v3(p), yaw: yp.yaw, pitch: clamp(yp.pitch, -1.35, 1.35), s: s, pathId: pathId || 'main' }; }
  // A spot on a path, looking along the passage: toward the center line 5 m ahead (not the local
  // tangent, which can point into a wall or the floor at a bend), with the pitch kept moderate.
  function onPath(path, s, back) {
    var a = pathAt(path, s), b = pathAt(path, back ? s - 5 : s + 5);
    var d = V.sub(b.p, a.p); if (V.len(d) < 0.5) d = back ? V.mul(a.tan, -1) : a.tan;
    var yp = U.yawPitchOf({ x: d[0], y: d[1], z: d[2] });
    yp.pitch = clamp(yp.pitch, -1.0, 0.9);
    return mk(a.p, yp, s, path.kind);
  }
  function firstMain(fn) { var L = G.layout; for (var i = 0; i < L.mainPath.length; i++) { var P = G.byId[L.mainPath[i]]; if (fn(P)) return P; } return null; }
  function sOnMain(P, pt) { var np = nearestOnPiece(P, pt[0], pt[1], pt[2]); return np ? np : null; }
  function computeSpots() {
    var S = {}, main = G.main, L = G.layout;
    S.entrance = onPath(main, Math.min(5, main.L)); // 5 m in, like the handmade cave
    // aim straight at the line a few meters ahead (the way down out of the pool)
    (function () { var a = pathAt(main, 5), b = pathAt(main, 9); var yp = look(a.p, b.p); S.entrance.yaw = yp.yaw; S.entrance.pitch = clamp(yp.pitch, -1.4, 0.6); })();
    S.mid = onPath(main, Math.min(main.L * 0.12 + 18, main.L - 5));
    var J = firstMain(function (P) { return P.type === 'junction_t' || P.type === 'junction_x'; }) || firstMain(function (P) { return P.role === 'main' && P.idx > 3; });
    if (J) { var nj = sOnMain(J, J.node || J.center); S.junction = onPath(nj.path, nj.s); }
    // air pocket (main line first)
    var AP = firstMain(function (P) { return P.type === 'air_pocket'; }) || G.pieces.filter(function (P) { return P.type === 'air_pocket'; })[0];
    if (AP) {
      var na = sOnMain(AP, AP.node), sp = onPath(na.path, na.s);
      sp.pos.set(AP.node[0], AP.waterY - 1.7, AP.node[2]);
      S.pocket = sp; S.airpocket = sp;
      S.pocketSurface = mk([AP.node[0], AP.waterY + 0.15, AP.node[2]], { yaw: sp.yaw, pitch: 0 }, na.s, na.path.kind);
    } else {
      var DCp = G.pieces.filter(function (P) { return P.dry; })[0];
      if (DCp && DCp.pools && DCp.pools.length) {
        var pl = DCp.pools[0]; S.pocket = S.airpocket = mk([pl.cx, DCp.waterY - 1.6, pl.cz], { yaw: 0, pitch: 0.6 }, 0, 'main');
        S.pocketSurface = mk([pl.cx, DCp.waterY + 0.15, pl.cz], { yaw: 0, pitch: 0 }, 0, 'main');
      }
    }
    var SQ = firstMain(function (P) { return P.type === 'squeeze'; }) || G.pieces.filter(function (P) { return P.type === 'squeeze'; })[0];
    if (SQ) { var nq = sOnMain(SQ, SQ.node); S.squeeze = onPath(nq.path, Math.max(0, nq.s - 3.2)); }
    // silt: the start of the longest silty run, low over the floor, facing along it
    var SL = firstMain(function (P) { return P.silt >= 0.9 && !P.room; }) || G.pieces.filter(function (P) { return P.silt >= 0.9 && !P.room; })[0];
    if (SL) {
      var ns = sOnMain(SL, SL.node), path = ns.path, sIn = ns.s - 2.5;
      // pick the direction where silt continues the longest (forward or back)
      var fwdLen = 0, backLen = 0;
      for (var q = 1; q <= 14; q++) { var pf = pathAt(path, ns.s + q), Pf = G.pieces[GEO.pieceAt(G, pf.p[0], pf.p[1], pf.p[2])]; if (Pf && Pf.silt >= 0.9) fwdLen = q; else break; }
      for (q = 1; q <= 14; q++) { var pb = pathAt(path, ns.s - q), Pb = G.pieces[GEO.pieceAt(G, pb.p[0], pb.p[1], pb.p[2])]; if (Pb && Pb.silt >= 0.9) backLen = q; else break; }
      var back = backLen > fwdLen;
      var s0 = back ? ns.s + Math.min(fwdLen, 2.5) : ns.s - Math.min(backLen, 2.5);
      var spS = onPath(path, s0, back);
      var fy = spS.pos.y - GEO.march(G, spS.pos.x, spS.pos.y, spS.pos.z, 0, -1, 0, 10);
      spS.pos.y = fy + 0.9; spS.pitch = 0;
      S.silt = spS;
    }
    // the drop: two meters into the first vertical run on the main line
    var DR = firstMain(function (P) { return P.dropRun; }) || firstMain(function (P) { return P.type === 'shaft_down' && P.ports.every(function (p) { return p.vertical; }); });
    if (DR) { var nd = sOnMain(DR, DR.node); S.drop = onPath(nd.path, nd.s); }
    var CU = G.currents[0];
    if (CU) { var cp = G.pathById[CU.pathId === 'main' ? 'main' : null]; var pc = G.pieces.filter(function (P) { return P.flow && P.flow.id === CU.id; })[0]; var nc = sOnMain(pc, pc.node); S.current = onPath(nc.path, nc.s - 1); }
    // dry chambers: a standing point on the floor of each, away from the pools
    function standOn(DC) {
      var best = null, bs = -1e9;
      for (var gx = 0; gx <= 8; gx++) for (var gz = 0; gz <= 8; gz++) {
        var px = lerp(DC.box.x0 + 2, DC.box.x1 - 2, gx / 8), pz = lerp(DC.box.z0 + 2, DC.box.z1 - 2, gz / 8);
        var fh = DC.floorH(px, pz); if (fh > DC.floorBase + 0.6) continue; // not on the ledge
        var py = fh + 0.9, ff = field(px, py, pz); if (ff > -0.45) continue;
        var dd = GEO.march(G, px, py, pz, 0, -1, 0, 4); if (dd > 1.3) continue; // floor right below
        var fy2 = py - dd; if (fy2 < DC.waterY + 0.1) continue;
        if (field(px, fy2 + 0.9, pz) > -0.45) continue;
        var poolD = 1e9; DC.pools.forEach(function (pl) { poolD = Math.min(poolD, Math.hypot(pl.cx - px, pl.cz - pz)); });
        var score = -ff * 2 + Math.min(poolD, 6);
        if (score > bs) { bs = score; best = [px, fy2 + 0.9, pz]; } // stand 0.9 m above the rock you are on
      }
      return best;
    }
    G.pieces.forEach(function (P) { if (P.dry) P.standSpot = standOn(P); });
    var DC = G.pieces.filter(function (P) { return P.dry && P.standSpot; })[0];
    if (DC) {
      var best = DC.standSpot;
      if (best) S.drychamber = mk(best, look(best, [DC.center[0], best[1], DC.center[2]]), 0, 'main');
      if (DC.ledge) {
        // stand on the ledge top near the cliff edge (search for a spot with headroom and rock below)
        var Lg = DC.ledge, lp = null, lbest = -1e9;
        for (var ia = 0; ia < 6; ia++) for (var ib = 0; ib < 9; ib++) {
          var aa = Lg.a0 + 0.9 + ia * 0.6, bb = Lg.b1 - 0.9 - ib * 0.7;
          var cx2 = Lg.c[0] + Lg.ax[0] * aa + Lg.bx[0] * bb, cz2 = Lg.c[1] + Lg.ax[1] * aa + Lg.bx[1] * bb;
          var top = DC.floorH(cx2, cz2); if (top < Lg.top - 0.3) continue;
          var cy2 = top + 0.9, f2 = field(cx2, cy2, cz2); if (f2 > -0.4) continue;
          var dd2 = GEO.march(G, cx2, cy2, cz2, 0, -1, 0, 3); if (Math.abs(dd2 - 0.9) > 0.25) continue;
          var sc2 = -f2 - ia * 0.35;
          if (sc2 > lbest) { lbest = sc2; lp = [cx2, cy2, cz2]; }
        }
        if (lp) {
          var ahead = [lp[0] - Lg.ax[0] * 3, lp[1] - 1.4, lp[2] - Lg.ax[1] * 3];
          S.ledge = mk([lp[0], lp[1], lp[2]], look(lp, ahead), 0, 'main');
          DC.ledgeSpot = lp;
        }
      }
    }
    var LM = G.pieces.filter(function (P) { return P.type === 'landmark'; })[0];
    if (LM && LM.arms && LM.arms.length) { var q0 = LM.arms[0].q; S.landmark = mk(q0, look(q0, [LM.center[0], LM.floorY + 3, LM.center[2]]), 0, LM.role); }
    // the bottom chamber and the ancient thing
    ringSpots(S);
    S.stalactites = W.stalSpot || null;
    // side branches
    var DE = G.paths.filter(function (p) { return p.kind === 'branch'; }).sort(function (a, b) { return b.L - a.L; })[0];
    if (DE) { S.branch = onPath(DE, Math.min(10, DE.L * 0.4)); S.branchEnd = onPath(DE, Math.max(0, DE.L - 3)); S.deadend = S.branchEnd; }
    var LP = G.paths.filter(function (p) { return p.kind === 'loop'; })[0];
    if (LP) S.loop = onPath(LP, Math.min(8, LP.L * 0.3));
    W.spots = S;
  }
  // deep / bottom / end: the way into the goal chamber, and right in front of its ring.
  function ringSpots(S) {
    var B = G.bottom, main = G.main;
    if (B && W.core) {
      var entry = B.arms[0] ? B.arms[0].q : B.center, core = W.core;
      S.deep = mk(entry, look(entry, core), main.L - 10, 'main');
      S.bottom = S.deep;
      var ax = W.coreAxis, ep = [core[0] + ax[0] * 6.5, core[1], core[2] + ax[2] * 6.5];
      S.end = mk(ep, look(ep, core), main.L - 4, 'main');
    }
  }
  // Named places. opts: { dy, yaw, pitch, low } offsets added on top.
  function spot(name, opts) {
    opts = opts || {};
    if (!G) return null;
    var sp;
    if (typeof name === 'number') sp = onPath(G.main, name);
    else { var s0 = W.spots && W.spots[name]; if (!s0) return null; sp = { pos: s0.pos.clone(), yaw: s0.yaw, pitch: s0.pitch, s: s0.s, pathId: s0.pathId }; }
    if (opts.low) { var d = GEO.march(G, sp.pos.x, sp.pos.y, sp.pos.z, 0, -1, 0, 12); sp.pos.y = sp.pos.y - d + 0.9; }
    sp.pos.y += opts.dy || 0;
    sp.yaw += opts.yaw || 0; sp.pitch += opts.pitch || 0;
    return sp;
  }
  function spawnPoint() {
    if (!G || !G.entrance) return { pos: new T.Vector3(0, -2, 0), yaw: 0, pitch: 0 };
    var E = G.entrance, a = pathAt(G.main, 6), from = [E.pool[0], -1.7, E.pool[2]];
    var yp = look(from, a.p);
    return { pos: v3(from), yaw: yp.yaw, pitch: clamp(yp.pitch * 0.6, -0.6, 0.2), s: 0, pathId: 'main' };
  }

  /* ------------------------------------------------------------------ */
  /* Features (TU.cave.features)                                         */
  /* ------------------------------------------------------------------ */
  function hintsAround(P, target, waterY, id, list) {
    P.segs.slice(0, 1).forEach(function () { });
    var np = nearestOnPiece(P, target[0], waterY - 1, target[2]); if (!np) return;
    [-11, -7.5, -4.5, 4.5, 7.5, 11].forEach(function (ds) {
      var a = pathAt(np.path, np.s + ds);
      if (Math.abs(ds) > np.path.L) return;
      var p = a.p.slice();
      if (field(p[0], p[1], p[2]) > -0.6) return;
      if (p[1] > waterY - 0.8) p[1] = waterY - 0.8;
      if (field(p[0], p[1], p[2]) > -0.4) return;
      var to = new T.Vector3(target[0], waterY, target[2]);
      list.push({ id: id, pos: v3(p), target: to, to: to.clone(), dir: to.clone().sub(v3(p)).normalize(), dist: Math.abs(ds) });
    });
  }
  // A piece that is part of the cave you can swim in right now (not freed, not still being built).
  function live(P) { return !P.freed && !(P.seg > 0 && !segOpen(P.seg)); }
  function segOpen(k) { var sg = W.segs[k]; return !!(sg && sg.opened && !sg.freed); }
  function pathSealed(p) { for (var i = 0; i < p.owner.length; i++) if (!live(G.pieces[p.owner[i]])) return true; return false; }
  // The newest segment whose floor is open (its Ancient Ring is the goal).
  function topSeg() { for (var i = W.segs.length - 1; i >= 0; i--) if (W.segs[i] && W.segs[i].opened && !W.segs[i].freed) return W.segs[i]; return W.segs[0]; }

  function buildFeatures() {
    var E = G.entrance, main = G.main, F = {}, top = topSeg(), segs = W.segs.filter(function (sg) { return sg && sg.opened && !sg.freed; });
    if (!W.entranceF) { var a0 = pathAt(main, 4); W.entranceF = { pos: new T.Vector3(E.pool[0], -1.5, E.pool[2]), dir: v3(a0.tan), stake: W.segs[0].dress.stake.clone(), surfaceY: TU.cfg.world.surfaceY }; }
    F.entrance = W.entranceF;
    // the goal: the newest open Ancient Ring (segment tells main.js which leg it ends)
    F.bottom = { pos: v3(top.core), radius: 2.4, kind: 'ancient', name: 'The Ancient Ring', segment: top.index };
    F.airPockets = []; F.airHints = [];
    var pieces = G.pieces.filter(live);
    pieces.forEach(function (P) {
      if (P.type !== 'air_pocket') return;
      var c = [P.node[0], P.waterY, P.node[2]];
      F.airPockets.push({ id: 'pocket' + P.id, pieceId: P.id, pos: v3(c), surfaceY: P.waterY, radius: 2.3, hintPos: new T.Vector3(c[0], P.waterY - 3.2, c[2]), warm: !!P.warm });
      hintsAround(P, c, P.waterY, 'pocket' + P.id, F.airHints);
    });
    // big chambers with an air dome at the top (dry chambers whose passages come in too high,
    // and in endless mode every Ancient Ring chamber you have broken open)
    pieces.forEach(function (P) {
      if (!P.airChamber) return;
      var c = [P.center[0], P.waterY, P.center[2]];
      F.airPockets.push({ id: 'pocket' + P.id, pieceId: P.id, pos: v3(c), surfaceY: P.waterY, radius: P.airDome ? 4 : (P.box.x1 - P.box.x0) / 2 - 1, hintPos: new T.Vector3(c[0], P.waterY - 3.2, c[2]), warm: !!P.warm, chamber: true, dome: !!P.airDome });
      if (!P.airDome) hintsAround(P, c, P.waterY, 'pocket' + P.id, F.airHints);
    });
    F.dryChambers = [];
    pieces.forEach(function (P) {
      if (!P.dry) return;
      var b = P.box;
      F.dryChambers.push({ id: 'dry' + P.id, pieceId: P.id, pos: P.standSpot ? v3(P.standSpot) : new T.Vector3(P.center[0], P.floorBase + 1, P.center[2]), floorY: P.floorBase, waterY: P.waterY, size: new T.Vector3(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), warm: !!P.warm,
        ledge: P.ledge ? { pos: P.ledgeSpot ? v3(P.ledgeSpot) : null, height: P.ledge.H, top: P.ledge.top, dir: new T.Vector3(-P.ledge.ax[0], 0, -P.ledge.ax[1]) } : null,
        pools: P.pools.map(function (pl) { return new T.Vector3(pl.cx, P.waterY, pl.cz); }) });
      P.pools.forEach(function (pl) { hintsAround(P, [pl.cx, 0, pl.cz], P.waterY, 'dry' + P.id, F.airHints); });
    });
    F.squeezes = pieces.filter(function (P) { return P.type === 'squeeze'; }).map(function (P) {
      var np = nearestOnPiece(P, P.node[0], P.node[1], P.node[2]);
      return { id: 'squeeze' + P.id, pieceId: P.id, pos: v3(P.node), s: np ? np.s : 0, pathId: np ? np.path.kind : 'main', length: 4, minRadius: Math.min(P.prof.r[0], P.prof.r[1] + P.prof.r[2] * 0.85) * 0.5 + 0.0 };
    });
    F.currents = (G.currents || []).filter(function (cu) { return cu.pieces.every(function (id) { return G.byId[id] && live(G.byId[id]); }); });
    F.siltAreas = pieces.filter(function (P) { return P.silt >= 0.9 && !P.room; }).map(function (P) {
      var np = nearestOnPiece(P, P.node[0], P.node[1], P.node[2]);
      return { id: 'silt' + P.id, pieceId: P.id, pos: v3(P.node), sFrom: np ? np.s - 4 : 0, sTo: np ? np.s + 4 : 0, siltiness: P.silt, pathId: np ? np.path.kind : 'main' };
    });
    F.landmarks = pieces.filter(function (P) { return P.type === 'landmark'; }).map(function (P) {
      return { id: P.area, pieceId: P.id, name: P.lmName, subtitle: LANDMARKS[P.lmName] || '', pos: new T.Vector3(P.center[0], P.floorY + 3, P.center[2]), radius: (P.box.x1 - P.box.x0) / 2 };
    });
    F.finds = []; F.stalactites = [];
    segs.forEach(function (sg) {
      F.landmarks.push({ id: sg.index ? 'ancient' + sg.index : 'ancient', pieceId: sg.bottomP.id, name: 'The Ancient Ring', subtitle: 'Something down here is very, very old.', pos: v3(sg.core), radius: 12, segment: sg.index });
      if (!sg.dress) return;
      sg.dress.finds.forEach(function (f) { var P = G.byId[f.pieceId]; if (!P || live(P)) F.finds.push(f); });
      sg.dress.stalactites.forEach(function (st) { F.stalactites.push(st); });
    });
    F.treasure = F.finds;
    F.spots = { names: SPOT_NAMES.filter(function (n) { return !!W.spots[n]; }) };
    F.segment = top.index;
    return F;
  }

  // Compact map for the wrist hologram (plain arrays, cheap to draw as lines). Only the cave you
  // can still reach is on it: in endless mode the current and the previous segment.
  function mapData() {
    if (!G) return null;
    var segs = [], pieces = G.pieces.filter(live);
    pieces.forEach(function (P) {
      var kind = P.type, r = P.prof ? (P.prof.r[0] + P.prof.r[1]) / 2 : 2;
      P.segs.forEach(function (sg) {
        var a = sg.path.pts[sg.i], b = sg.path.pts[sg.i + 1];
        if (G.pieces[sg.path.owner[sg.i]] !== P) return; // each segment once
        segs.push({ a: a.slice(), b: b.slice(), r: +r.toFixed(2), kind: kind, path: sg.path.kind, collapsed: !!P.collapsed, seg: P.seg || 0 });
      });
    });
    var top = topSeg(), rings = W.segs.filter(function (sg) { return sg && sg.opened && !sg.freed && sg.core; }).map(function (sg) { return { pos: sg.core.slice(), segment: sg.index }; });
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    pieces.forEach(function (P) { var b = P.box; lo[0] = Math.min(lo[0], b.x0); lo[1] = Math.min(lo[1], b.y0); lo[2] = Math.min(lo[2], b.z0); hi[0] = Math.max(hi[0], b.x1); hi[1] = Math.max(hi[1], b.y1); hi[2] = Math.max(hi[2], b.z1); });
    var zones = [], zSeen = {};
    pieces.forEach(function (P) { var z = P.seg > 0 ? P.zone : Math.min(4, P.zone); if (!zSeen[z]) { zSeen[z] = 1; zones.push({ index: z, name: zoneName(z), topM: zoneTopM(z) }); } });
    zones.sort(function (a, b) { return a.index - b.index; });
    var sticks = (TU.glowsticks && typeof TU.glowsticks.list === 'function') ? TU.glowsticks.list().map(function (g) { return { pos: [g.pos.x, g.pos.y, g.pos.z], color: g.color, light: g.brightness }; }) : [];
    return {
      // preferred by the watch hologram: one polyline per path (main line first), live parts only
      paths: G.paths.map(function (p) {
        var pts = [], last = null;
        p.pts.forEach(function (q, i) {
          if (!live(G.pieces[p.owner[i]])) { last = null; return; }
          if (!last || i === p.pts.length - 1 || Math.abs(q[0] - last[0]) + Math.abs(q[1] - last[1]) + Math.abs(q[2] - last[2]) > 2) { pts.push([+q[0].toFixed(2), +q[1].toFixed(2), +q[2].toFixed(2)]); last = q; }
        });
        return { id: p.id, kind: p.kind, points: pts, radius: 1.8, length: Math.round(p.L), collapsed: !!p.collapsed };
      }).filter(function (p) { return p.points.length > 1; }),
      segments: segs,
      chambers: pieces.filter(function (P) { return P.room; }).map(function (P) { var b = P.box; return { min: [b.x0, b.y0, b.z0], max: [b.x1, b.y1, b.z1], center: P.center.slice(), kind: P.start ? 'entrance' : P.bottom ? 'bottom' : P.type, dry: !!P.dry, name: P.lmName || null, seg: P.seg || 0 }; }),
      airPockets: pieces.filter(function (P) { return P.type === 'air_pocket' || P.airChamber; }).map(function (P) { var c = P.node || P.center; return { pos: [c[0], P.waterY, c[2]], surfaceY: P.waterY }; }),
      dry: pieces.filter(function (P) { return P.dry; }).map(function (P) { return { pos: [P.center[0], P.floorBase, P.center[2]], waterY: P.waterY }; }),
      bottom: top.core ? top.core.slice() : (W.core ? W.core.slice() : null),
      entrance: [G.entrance.pool[0], 0, G.entrance.pool[2]],
      entranceReachable: !G.entrance.freed,
      bounds: { min: lo, max: hi },
      mainLength: G.main.L,
      // endless mode (new): which segment is the goal, every ring you can still reach, the zones
      // on the map (index, name, topM: for depth rings), and your glow sticks (small markers)
      segment: top.index, rings: rings, zones: zones, glowSticks: sticks
    };
  }

  /* ------------------------------------------------------------------ */
  /* Earthquakes and collapses                                           */
  /* ------------------------------------------------------------------ */
  function remeshPiece(P) {
    var done = new Set();
    P.cells.forEach(function (c) { var ch = W.chunkByCell.get(GEO.key(c[0], c[1], c[2])); if (ch && ch.mesh && !done.has(ch)) { done.add(ch); buildChunk(ch); } });
    // neighbours see the new lattice at their borders too
    P.ports.forEach(function (pt) {
      var o = G.pieces[pt.a === P.idx ? pt.b : pt.a];
      o.cells.forEach(function (c) { var ch = W.chunkByCell.get(GEO.key(c[0], c[1], c[2])); if (ch && ch.mesh && !done.has(ch)) { done.add(ch); buildChunk(ch); } });
    });
  }
  // Block a piece with rubble (rock is added to the field, the mesh is rebuilt, colliders follow).
  function collapsePiece(P, cause) {
    if (!P || P.collapsed || P.freed) return false;
    var pts = [];
    if (P.room) pts = P.arms.map(function (a) { return a.q; });
    else {
      pts.push(P.node);
      (P.curves && P.curves[0] ? P.curves[0].pts : []).forEach(function (p, i) { if (i % 2 === 0) pts.push(p); });
      (P.arms || []).forEach(function (a) { a.forEach(function (p, i) { if (i % 2 === 1) pts.push(p); }); });
    }
    var rr = P.prof ? Math.max(P.prof.r[0], P.prof.r[1], P.prof.r[2]) + 0.9 : 3.2;
    pts.forEach(function (p) { P.rocks.push([p[0], p[1], p[2], rr]); });
    P.collapsed = true;
    GEO.resamplePiece(G, P);
    remeshPiece(P);
    if (TU.caveDress && TU.caveDress.rubble) TU.caveDress.rubble(W, G, P, pts, rr);
    var np = nearestOnPiece(P, (P.node || P.center)[0], (P.node || P.center)[1], (P.node || P.center)[2]);
    TU.emit('cave:collapse', { pieceId: P.id, branchId: P.branch, pathId: np ? np.path.kind : P.role, pos: v3(P.node || P.center), cause: cause || 'quake' });
    return true;
  }
  // An earthquake: shakes everyone (event), drops rocks from the ceiling near pos, and with
  // intensity >= 1 collapses one side branch (never the main line, never where you are).
  // opts: { pos (Vector3, default the diver), collapse: true|false|piece }
  function quake(intensity, opts) {
    if (!G) return null;
    opts = opts || {};
    intensity = clamp(intensity == null ? 1 : intensity, 0, 2);
    var pos = opts.pos || (TU.player && TU.player.state && TU.player.state.pos) || v3(G.entrance.pool);
    TU.emit('quake', { strength: intensity, duration: 2 + intensity * 2.5, pos: pos.clone ? pos.clone() : v3(pos) });
    var n = Math.round(2 + intensity * 4), rnd = TU.rng((G.seed + (W.quakes = (W.quakes || 0) + 1) * 7919) >>> 0, 14).fn();
    for (var i = 0; i < n; i++) {
      var base = [pos.x + (rnd() - 0.5) * 9, pos.y, pos.z + (rnd() - 0.5) * 9];
      if (field(base[0], base[1], base[2]) > -0.3) base = [pos.x, pos.y, pos.z];
      var up = GEO.march(G, base[0], base[1], base[2], 0, 1, 0, 16);
      var r = 0.18 + Math.pow(rnd(), 2) * 0.45 * (0.6 + intensity * 0.4);
      var p = [base[0], base[1] + Math.max(0, up - r - 0.1), base[2]];
      if (TU.caveDress && TU.caveDress.dropRock) TU.caveDress.dropRock(W, p, r, rnd, i * 0.18);
    }
    var collapsed = null;
    if (opts.collapse !== false && (intensity >= 1 || opts.collapse)) {
      var target = opts.collapse && opts.collapse.cells ? opts.collapse : null;
      if (!target) {
        var here = GEO.pieceAt(G, pos.x, pos.y, pos.z), herePath = here >= 0 ? (G.pieces[here].segs[0] || {}).path : null;
        var cands = G.paths.filter(function (p) { return p.kind !== 'main' && p !== herePath && !p.collapsed && !p.freed && !pathSealed(p); });
        if (cands.length) {
          var path = cands[Math.floor(rnd() * cands.length)];
          // the second piece of the branch (so the rubble shows from the junction)
          var seq = []; path.owner.forEach(function (o) { if (seq.indexOf(o) < 0) seq.push(o); });
          var pick = G.pieces[seq[Math.min(1, seq.length - 1)]];
          if (pick && !pick.room && pick.idx !== here) { target = pick; path.collapsed = true; }
        }
      }
      if (target && collapsePiece(target, 'quake')) collapsed = target.id;
    }
    return { rocks: n, collapsed: collapsed };
  }

  /* ------------------------------------------------------------------ */
  /* Endless mode: KEEP DIVING opens new cave below the Ancient Ring     */
  /* ------------------------------------------------------------------ */
  // How it works, in plain words:
  //   1. descend(k): the generator makes a new cave from a derived seed (run seed + k, the same
  //      every time), and cave-sdf.js glues it under the bottom chamber with a short vertical shaft
  //      (one more "segment"). The seed is retried a few times if the shaft would make the swim to
  //      the first air pocket too long (the same max-gap rule the generator uses) or if there is no room.
  //   2. A job builds it a few milliseconds per frame (no freeze): sample the new rock, mesh the
  //      walls near the hole, dress it (formations, a new ring, finds). Meanwhile the chamber rumbles
  //      and the old ring powers up.
  //   3. The floor breaks open: the hole is cut into the old chamber, boulders over it fall in, and
  //      the chamber's dome fills with air (an air source between the two caves). The new ring is now
  //      the goal (features.bottom.segment = k). Touching it ends the leg with the same choice again.
  //   4. Memory stays bounded: when segment k starts, segment k - 2 is freed and the shaft into
  //      segment k - 1 collapses behind you. You can still swim back up through the previous one.
  function holeCandidates(B, sg) {
    var core = sg.core || B.center, ax = sg.coreAxis || [1, 0, 0], side = [-ax[2], 0, ax[0]];
    var bones = [core[0] + side[0] * 9.5 - ax[0] * 3, core[2] + side[2] * 9.5 - ax[2] * 3];
    var dl = B.d + B.h - 1, portCells = {};
    B.ports.forEach(function (pt) {
      var c = pt.cellA; if (pt.b === B.idx) c = [c[0] + [0, 1, 0, -1, 0, 0][pt.dir], c[1] + [1, 0, -1, 0, 0, 0][pt.dir], c[2] + [0, 0, 0, 0, -1, 1][pt.dir]];
      portCells[c[0] + ',' + c[1]] = true;
    });
    var out = [];
    for (var yy = 0; yy < B.l; yy++) for (var xx = 0; xx < B.w; xx++) {
      var cx = B.x + xx, cy = B.y + yy;
      if (portCells[cx + ',' + cy]) continue;
      var cc = GEO.cellCenter(cx, cy, dl), r = Math.hypot(cc[0] - core[0], cc[2] - core[2]);
      var score = Math.abs(r - 12.8) + (Math.hypot(cc[0] - bones[0], cc[2] - bones[1]) < 6 ? 8 : 0) + (r < 9 ? 20 : 0);
      out.push({ col: [cx, cy], score: score });
    }
    out.sort(function (a, b) { return a.score - b.score; });
    return out.map(function (o) { return o.col; });
  }
  // The generator's air rule for the new segment: the shaft plus the swim from its start room to
  // the first air source must fit in maxGap seconds (the old chamber's air dome is the air before it).
  function airGapOK(lay, nConn, diff) {
    var C = TU.gen.constants, api = TU.gen.api, maxGap = (C.DIFF[diff] || C.DIFF.standard).maxGap, byId = {};
    lay.pieces.forEach(function (p) { byId[p.id] = p; });
    var gap = nConn * C.COST.shaft_down;
    for (var i = 1; i < lay.mainPath.length; i++) { var p = byId[lay.mainPath[i]]; if (p.type === 'air_pocket' || p.dry) break; gap += api.gapCostOf(p); }
    return gap <= maxGap;
  }
  // Which cell of the new start room the shaft comes down into: the one farthest from its way out.
  function startCellFor(st) {
    var so = (st.sockets && st.sockets[0]) || [st.x, st.y, st.d], best = [st.x, st.y], bd = -1;
    for (var yy = 0; yy < st.l; yy++) for (var xx = 0; xx < st.w; xx++) { var d = Math.abs(st.x + xx - so[0]) + Math.abs(st.y + yy - so[1]); if (d > bd) { bd = d; best = [st.x + xx, st.y + yy]; } }
    return best;
  }
  function inBounds(lay, off) { return lay.pieces.every(function (p) { return Math.abs(p.x + off[0]) < 480 && Math.abs(p.x + p.w + off[0]) < 480 && Math.abs(p.y + off[1]) < 480 && Math.abs(p.y + p.l + off[1]) < 480 && p.d + p.h + off[2] < 1000; }); }

  function descend(k, opts) {
    opts = opts || {};
    if (!G) return { ok: false, reason: 'no cave' };
    if (W.job) return { ok: false, reason: 'busy' };
    var prev = W.segs[W.segs.length - 1];
    if (k == null) k = prev.index + 1;
    if (!prev || prev.index !== k - 1 || !prev.opened || prev.freed) return { ok: false, reason: 'order' };
    var B0 = prev.bottomP, run = TU.run || {};
    var baseSeed = (opts.seed != null ? opts.seed : run.seed != null ? run.seed : W.segs[0].seed) >>> 0;
    var diff = opts.difficulty || (W.segs[0].layout && W.segs[0].layout.difficulty) || 'standard';
    // keep memory bounded: the segment before the previous one goes, and the shaft behind you caves in
    var freedNow = null;
    if (k >= 2 && W.segs[k - 2] && !W.segs[k - 2].freed) { freedNow = k - 2; freeSegment(k - 2); }
    var maxD = -1e9; G.cellMap.forEach(function (pi, kk) { var c = GEO.decode(kk); if (c[2] > maxD) maxD = c[2]; });
    var cols = holeCandidates(B0, prev);
    var dTop = B0.d + B0.h, dStart = Math.max(maxD + 1, dTop + 2);
    var res = null, lay = null, seedK = 0, at;
    for (at = 0; at < ENDLESS.maxAttempts && !res; at++) {
      seedK = (baseSeed + k + at * 7919) >>> 0;      // derived seed: run seed + segment index (+ retries)
      lay = TU.gen.generate(seedK, { difficulty: diff });
      if (!lay || !lay.ok || !airGapOK(lay, dStart - dTop, diff)) continue;
      var st = lay.pieces.filter(function (p) { return p.start; })[0], pick = startCellFor(st);
      for (var ci = 0; ci < cols.length && !res; ci++) {
        var col = cols[ci], off = [col[0] - pick[0], col[1] - pick[1], dStart - st.d];
        if (!inBounds(lay, off)) continue;
        try { res = GEO.extend(G, lay, { seg: k, off: off, idBase: k * 10000, branchBase: k * 1000, from: B0, column: col, dTop: dTop, dStart: dStart }); }
        catch (e) { if (!/cell taken/.test(e && e.message)) throw e; res = null; }
      }
    }
    if (!res) { TU.emit('ui:msg', { text: 'The Ring flickers, but the floor holds. The way down stays shut.', dur: 4 }); return { ok: false, reason: 'no room' }; }
    var newP = res.connector.concat(res.pieces);
    var seg = { index: k, seed: seedK, layout: lay, root: new T.Group(), chunks: [], opened: false, freed: false, pieces: newP.map(function (P) { return P.idx; }),
      bottomP: res.bottom, startP: res.start, connector: res.connector, hole: res.hole, from: B0, cells: res.cells, cellCount: res.cells.length, dress: null,
      attempts: at, freedPrev: freedNow, topM: dTop * CELL, startM: dStart * CELL };
    seg.root.name = 'cave-seg' + k; W.root.add(seg.root);
    W.segs[k] = seg;
    if (k === 1 || dTop * CELL < W.beyondStartM) W.beyondStartM = dTop * CELL;
    var names = TU.gen.constants.LANDMARK_NAMES;
    newP.forEach(function (P) {
      if (P.type === 'landmark') P.lmName = names[(P.landmarkId >= 0 ? P.landmarkId : P.id) % names.length];
      P.zone = beyondZone(Math.max(0, -P.center[1]));
    });
    classifyPieces(newP, res.connector.map(function (P) { return P.id; }).concat(lay.mainPath.map(function (id) { return id + k * 10000; })), TU.rng(seedK, 12), k);
    G.currents = (G.currents || []).concat(setupCurrents(TU.rng(seedK, 13), 's' + k));
    // the cells of the old chamber that the hole changes: sampled now into a side map, swapped in when it opens
    seg.touched = GEO.touchedCells(B0, B0.groups[B0.groups.length - 1], res.hole.cellA);
    seg.temp = new Map();
    W.job = { seg: seg, phase: 'sample', i: 0, j: 0, t: 0, meshList: null, mi: 0, dressJob: null, startMs: performance.now(), workMs: 0, maxStepMs: 0, frames: 0 };
    // the moment: the ring wakes up and the chamber shakes
    var an = ancientOf(prev.index); if (an) an.powerT = 1;
    TU.emit('quake', { strength: 0.7, duration: ENDLESS.minOpenS + 1.2, pos: v3(prev.core) });
    say('The Ancient Ring wakes up. The whole chamber is shaking.', 4, 0);
    if (freedNow != null) say('Far above you, rock grinds on rock. The shaft you came down by is caving in.', 4, 1.6);
    TU.emit('cave:segment', { index: k, state: 'building', seed: seedK, zone: beyondZone(dStart * CELL), zoneName: zoneName(beyondZone(dStart * CELL)), topM: dTop * CELL, freed: freedNow });
    updateStats();
    return { ok: true, index: k, seed: seedK, attempts: at, freed: freedNow, cells: res.cells.length, pieces: newP.length };
  }
  function ancientOf(segIndex) { var list = (W.anim && W.anim.ancients) || []; for (var i = 0; i < list.length; i++) if (list[i].seg === segIndex) return list[i]; return null; }

  // One slice of the build job. budget in ms; force = run to the end now (tests, debug).
  function jobStep(budget, force) {
    var J = W.job; if (!J) return true;
    var seg = J.seg, t0 = performance.now(), B0 = seg.from;
    function left() { return force || performance.now() - t0 < budget; }
    while (W.job === J && left()) {
      if (J.phase === 'sample') {
        if (J.i < seg.cells.length) { var c = seg.cells[J.i++]; GEO.sampleCell(G, c[0], c[1], c[2]); }
        else if (J.j < seg.touched.length) { var c2 = seg.touched[J.j++]; GEO.sampleCell(G, c2[0], c2[1], c2[2], seg.temp); }
        else J.phase = 'chunks';
      } else if (J.phase === 'chunks') {
        if (!J.meshList) {
          var hp = v3(seg.hole.pos);
          makeChunks(seg.cells, seg, null, 0);
          W.pending = W.pending.filter(function (ch) { return ch.seg !== seg.index; }); // meshed by the job until the floor opens
          J.meshList = seg.chunks.slice().sort(function (a, b) { return (hp.distanceTo(a.center) - a.radius) - (hp.distanceTo(b.center) - b.radius); })
            .filter(function (ch) { return hp.distanceTo(ch.center) - ch.radius < 45; });
        } else if (J.mi < J.meshList.length) buildChunk(J.meshList[J.mi++]);
        else J.phase = 'dress';
      } else if (J.phase === 'dress') {
        if (!J.dressJob) {
          J.dressJob = TU.caveDress.start(W, G, {
            field: field, march: march, addCollider: addCollider, nearestOnPiece: nearestOnPiece, pathAt: pathAt, lin: lin,
            palette: function (d, o) { return palette(d, o, seg.index); },
            rand: TU.rng(seg.seed, 10).fn(), mats: W.mats, daylightAt: daylightAt, root: seg.root, seg: seg.index, seed: seg.seed,
            pieces: seg.pieces.map(function (pi) { return G.pieces[pi]; }), bottom: seg.bottomP, entrance: false, findPrefix: 's' + seg.index
          });
        }
        W.buildingSeg = seg.index;
        var rest = force ? Infinity : Math.max(0.5, budget - (performance.now() - t0));
        var done = J.dressJob.step(rest);
        W.buildingSeg = 0;
        if (done) { seg.dress = J.dressJob.out; seg.core = seg.dress.core; seg.coreAxis = seg.dress.coreAxis; J.phase = 'wait'; }
      } else if (J.phase === 'wait') {
        if (force || J.t >= ENDLESS.minOpenS) openSegment(seg);
        break;
      }
    }
    var ms = performance.now() - t0; J.workMs += ms; J.maxStepMs = Math.max(J.maxStepMs, ms); J.frames++;
    return !W.job;
  }

  // The floor breaks open.
  function openSegment(seg) {
    var J = W.job, B0 = seg.from, prev = W.segs[seg.index - 1], hp = seg.hole.pos;
    GEO.swapBlocks(G, seg.temp); seg.temp = null;
    var done = new Set();
    function remesh(c) { var ch = W.chunkByCell.get(GEO.key(c[0], c[1], c[2])); if (ch && !done.has(ch)) { done.add(ch); buildChunk(ch); } }
    seg.touched.forEach(remesh);
    seg.connector[0].cells.forEach(remesh);
    clearAroundHole(prev, B0, hp);
    // rocks fall away into the shaft, with a burst of silt
    var rnd = TU.rng(seg.seed, 17).fn();
    for (var i = 0; i < 9; i++) {
      var p = [hp[0] + (rnd() - 0.5) * 3.6, B0.floorY + 0.5 + rnd() * 1.6, hp[2] + (rnd() - 0.5) * 3.6];
      if (field(p[0], p[1], p[2]) < -0.35 && TU.caveDress.dropRock) TU.caveDress.dropRock(W, p, 0.16 + rnd() * 0.3, rnd, 0.1 + i * 0.12);
    }
    if (TU.fx && TU.fx.spawnSilt) TU.fx.spawnSilt(260, { pos: new T.Vector3(hp[0], B0.floorY + 0.8, hp[2]), burst: true });
    airDome(B0, prev);
    // the new ring is the goal now
    G.bottom = seg.bottomP; W.core = seg.core; W.coreAxis = seg.coreAxis;
    seg.opened = true; W.fallbackPi = seg.startP.idx;
    if (W.spots) { ringSpots(W.spots); segSpots(seg); }
    TU.cave.features = buildFeatures();
    TU.cave.lengths = { main: G.main.L };
    // the rest of the new walls are meshed as you get near (nearest first, a few per frame)
    seg.chunks.forEach(function (ch) { if (!ch.mesh) W.pending.push(ch); });
    var an = ancientOf(prev.index); if (an) an.powerT = 0.35;
    TU.emit('quake', { strength: 1.3, duration: 2.6, pos: new T.Vector3(hp[0], hp[1], hp[2]) });
    say('The floor breaks open. A shaft drops away into the dark under the Ring.', 4.5, 0);
    if (B0.airDome) say('Air bubbles up into the dome above the Ring. Breathe up there before you go.', 4.5, 4.8);
    if (seg.freedPrev != null) say('There is no way back up past the last ring now. Only down.', 4, 9.6);
    var zi = beyondZone(seg.startM);
    TU.emit('cave:segment', { index: seg.index, state: 'open', seed: seg.seed, zone: zi, zoneName: zoneName(zi), topM: seg.topM, bottom: v3(seg.core), freed: seg.freedPrev });
    if (J) { seg.buildStats = { ms: Math.round(performance.now() - J.startMs), workMs: Math.round(J.workMs), maxStepMs: +J.maxStepMs.toFixed(1), frames: J.frames }; }
    W.job = null;
    updateStats();
  }
  // Boulders, stalagmites and standing stones over the hole fall in (and lose their colliders).
  function clearAroundHole(prev, B0, hp) {
    var R = ENDLESS.holeClear, m4 = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(), zero = new T.Vector3(0, 0, 0);
    var rnd = TU.rng(prev.seed + 99, 18).fn();
    (prev.dress ? prev.dress.regions : []).forEach(function (mesh) {
      if (mesh.name !== 'boulders' && mesh.name !== 'cobbles' && mesh.name !== 'stalagmites') return;
      var changed = false;
      for (var i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4); m4.decompose(p, q, sc);
        if (sc.x < 1e-4 || Math.hypot(p.x - hp[0], p.z - hp[2]) > R + sc.x || p.y > B0.floorY + 4) continue;
        if (mesh.name !== 'stalagmites' && TU.caveDress.dropRock && W.falling.length < 24) TU.caveDress.dropRock(W, [p.x, p.y + 0.2, p.z], Math.max(0.15, Math.min(0.6, sc.x * 0.5)), rnd, 0.15 + rnd() * 0.4);
        m4.compose(p, q, zero); mesh.setMatrixAt(i, m4); changed = true;
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    });
    prev.root.traverse(function (o) {
      if (o.name !== 'monolith' || !o.visible) return;
      if (Math.hypot(o.position.x - hp[0], o.position.z - hp[2]) < R + 1.2) { o.visible = false; if (o.userData.col) o.userData.col.gone = true; }
    });
    var before = W.colliders.length;
    W.colliders = W.colliders.filter(function (c) {
      if (c.gone) return false;
      var cp = c.t === 0 ? c.c : c.a;
      return !(c.seg === prev.index && Math.hypot(cp[0] - hp[0], cp[2] - hp[2]) < R + c.r && cp[1] < B0.floorY + 4);
    });
    if (W.colliders.length !== before) rehashColliders();
  }
  function rehashColliders() { var list = W.colliders; W.colliders = []; W.colHash = new Map(); list.forEach(function (c) { addCollider(c); }); }
  // The Ancient Ring chamber fills its dome with air when it opens (an air source between two caves).
  function airDome(B0, sg) {
    if (B0.waterY != null || !sg.core) return;
    var core = sg.core, up = GEO.march(G, core[0], core[1], core[2], 0, 1, 0, 30), topY = core[1] + up;
    var wy = Math.max(topY - 1.9, Math.min(topY - 0.9, core[1] + 5.4));
    if (topY - wy < 0.8) return;
    B0.waterY = wy; B0.airBox = { x0: B0.box.x0, x1: B0.box.x1, y0: B0.box.y0, y1: B0.box.y1, z0: B0.box.z0, z1: B0.box.z1 };
    B0.airChamber = true; B0.airDome = true;
    if (TU.caveDress.waterPlane) TU.caveDress.waterPlane(sg.root, W.mats, core[0], wy, core[2], B0.box.x1 - B0.box.x0, B0.box.z1 - B0.box.z0);
  }
  // Named spots in the newest segment (debug teleports and the tests).
  function segSpots(seg) {
    var S = W.spots, hp = seg.hole.pos, B0 = seg.from, st = seg.startP;
    S.hole = mk([hp[0] + 2.2, B0.floorY + 2.2, hp[2] + 2.2], look([hp[0] + 2.2, B0.floorY + 2.2, hp[2] + 2.2], [hp[0], hp[1] - 4, hp[2]]), 0, 'main');
    var c0 = seg.connector[seg.connector.length - 1].node;
    S.shaft = mk(c0, { yaw: 0, pitch: -1.3 }, 0, 'main');
    var sp = [st.center[0], Math.max(st.floorY + 2.4, st.center[1] - 1), st.center[2]];
    var np = nearestOnPiece(st, sp[0], sp[1], sp[2]);
    if (np) { var a = pathAt(np.path, np.s), b = pathAt(np.path, np.s + 6); S.segStart = mk(a.p, look(a.p, b.p), np.s, 'main'); } else S.segStart = mk(sp, { yaw: 0, pitch: 0 }, 0, 'main');
    var AP = seg.pieces.map(function (pi) { return G.pieces[pi]; }).filter(function (P) { return P.type === 'air_pocket'; })[0];
    if (AP) S.segPocket = mk([AP.node[0], AP.waterY - 1.7, AP.node[2]], { yaw: 0, pitch: 0.5 }, 0, 'main');
    if (B0.airDome) S.dome = mk([sg0(seg).core[0] + 1.5, B0.waterY - 1.2, sg0(seg).core[2] + 1.5], { yaw: 0, pitch: 0.6 }, 0, 'main');
    function sg0(sg) { return W.segs[sg.index - 1]; }
  }
  // Forget an old segment (far behind you): its rock, meshes, dressing and colliders go.
  function freeSegment(j) {
    var sg = W.segs[j]; if (!sg || sg.freed) return;
    var cells = [];
    sg.pieces.forEach(function (pi) { var P = G.pieces[pi]; P.freed = true; P.cells.forEach(function (c) { cells.push(c); }); });
    GEO.freeCells(G, cells);
    sg.chunks.forEach(function (ch) { if (ch.mesh) { ch.root.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; } ch.cells.forEach(function (c) { W.chunkByCell.delete(GEO.key(c[0], c[1], c[2])); }); });
    W.chunks = W.chunks.filter(function (ch) { return ch.seg !== j; });
    W.pending = W.pending.filter(function (ch) { return ch.seg !== j; });
    disposeGroup(sg.root); W.root.remove(sg.root);
    W.instRegions = (W.instRegions || []).filter(function (m) { return m.userData.seg !== j; });
    if (W.anim) {
      W.anim.glints = W.anim.glints.filter(function (g) { return (g.seg || 0) !== j; });
      W.anim.ancients = W.anim.ancients.filter(function (a) { return a.seg !== j; });
      if (j === 0) { W.anim.rays = []; W.anim.dayLight = null; }
    }
    W.colliders = W.colliders.filter(function (c) { return c.seg !== j; }); rehashColliders();
    W.falling = W.falling.filter(function (r) { if (G.cellMap.has(GEO.key(Math.floor(r.mesh.position.x / CELL), Math.floor(-r.mesh.position.z / CELL), Math.floor(-r.mesh.position.y / CELL)))) return true; W.root.remove(r.mesh); return false; });
    G.paths.forEach(function (p) { if (p.owner.every(function (pi) { return G.pieces[pi].freed; })) p.freed = true; });
    sg.freed = true; sg.dress = null; sg.chunks = [];
    // the way back up caves in: rubble fills the top of the shaft into the next segment
    var nx = W.segs[j + 1];
    if (nx && nx.connector && nx.connector[0]) { collapsePiece(nx.connector[0], 'endless'); nx.sealedAbove = true; }
    if (W.spots) Object.keys(W.spots).forEach(function (n) { var s0 = W.spots[n]; if (s0 && s0.pos && !G.cellMap.has(GEO.key(Math.floor(s0.pos.x / CELL), Math.floor(-s0.pos.z / CELL), Math.floor(-s0.pos.y / CELL)))) delete W.spots[n]; });
    TU.cave.features = buildFeatures();
    TU.emit('cave:segment', { index: j, state: 'freed' });
  }
  function disposeGroup(root) {
    root.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh && o.dispose) o.dispose();
      var m = o.material;
      if (m && m.userData && m.userData.own) {
        ['map', 'emissiveMap', 'normalMap', 'alphaMap'].forEach(function (k) { if (m[k] && m[k].userData && m[k].userData.own) m[k].dispose(); });
        m.dispose();
      }
    });
    root.clear && root.clear();
  }
  // Short messages in a row (main.js shows them through ui:msg). delay in s of frame time.
  function say(text, dur, delay) { (W.msgs = W.msgs || []).push({ at: (W.msgT || 0) + (delay || 0), text: text, dur: dur }); }
  function pumpMsgs(dt) {
    W.msgT = (W.msgT || 0) + dt;
    if (!W.msgs || !W.msgs.length) return;
    for (var i = 0; i < W.msgs.length; i++) if (W.msgs[i].at <= W.msgT) { var m = W.msgs.splice(i--, 1)[0]; TU.emit('ui:msg', { text: m.text, dur: m.dur }); }
  }
  // Debug and tests: finish the build job right now.
  function finishSegment() { var n = 0; while (W.job && n++ < 100000) jobStep(Infinity, true); updateStats(); return W.stats; }

  /* ------------------------------------------------------------------ */
  /* Build                                                               */
  /* ------------------------------------------------------------------ */
  function disposeWorld() {
    if (!W.root) return;
    TU.scene.remove(W.root);
    // free everything on the GPU this cave created: geometries, instance buffers, its own materials
    // and their own textures (shared materials and the shared TU.tex textures are kept)
    W.root.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh && o.dispose) o.dispose();
      var m = o.material;
      if (m && m.userData && m.userData.own) {
        ['map', 'emissiveMap', 'normalMap', 'alphaMap'].forEach(function (k) { if (m[k] && m[k].userData && m[k].userData.own) m[k].dispose(); });
        m.dispose();
      }
    });
    W.root.clear && W.root.clear();
    W.root = null; W.chunks = []; W.pending = []; W.chunkByCell = new Map(); W.colliders = []; W.colHash = new Map(); W.falling = [];
    W.dress = null; W.anim = null; W.findMesh = {}; W.instRegions = []; W.rubble = null; W.spots = null;
    W.segs = []; W.job = null; W.coreLight = null; W.beyondStartM = 1e9; W.buildingSeg = 0; W.fallbackPi = null;
    G = null; W.G = null;
  }
  function makeMaterials() {
    if (W.mats) return W.mats;
    var M = TU.caveMat;
    if (TU.renderer && M.isSoftwareGL(TU.renderer)) M.setLow(true); // tests and machines without a GPU
    W.mats = {
      rock: M.rockMaterial({ info: true }),
      calcite: M.rockMaterial({ info: false, calcite: 0.85, rough: 0.78 }),
      boulder: M.rockMaterial({ info: false, calcite: 0.0, rough: 0.9 }),
      water: M.waterMaterial()
    };
    W.mats.rock.shadowSide = T.BackSide;
    W.mats.calcite.shadowSide = T.BackSide; W.mats.boulder.shadowSide = T.BackSide;
    return W.mats;
  }
  function build(layout) {
    var t0 = performance.now();
    if (!layout || !layout.ok) layout = TU.gen.generate(1, { difficulty: 'standard' });
    var bk = layout.seed + ':' + layout.difficulty + ':' + layout.checksum + ':' + (layout.modifiers || []).join(',');
    // the same cave again: just put back what quakes changed (unless endless mode added segments)
    if (W.built && W.buildKey === bk && W.segs.length === 1 && !W.job) { resetDynamic(); return; }
    disposeWorld();
    makeMaterials();
    G = GEO.create(layout); W.G = G;
    // landmark names
    var names = TU.gen.constants.LANDMARK_NAMES;
    G.pieces.forEach(function (P) { if (P.type === 'landmark') P.lmName = names[(P.landmarkId >= 0 ? P.landmarkId : P.id) % names.length]; });
    GEO.sampleAll(G);
    var tS = performance.now();
    classifyPieces();
    G.currents = setupCurrents();
    W.root = new T.Group(); W.root.name = 'cave';
    TU.scene.add(W.root);
    // segment 0 is the first cave; endless mode adds more below it (see "Endless mode")
    var seg0 = { index: 0, seed: layout.seed >>> 0, layout: layout, root: new T.Group(), chunks: [], opened: true, freed: false, pieces: G.pieces.map(function (P) { return P.idx; }), bottomP: G.bottom, startP: G.entrance, connector: [], dress: null };
    seg0.root.name = 'cave-seg0'; W.root.add(seg0.root);
    W.segs = [seg0]; W.buildingSeg = 0;
    SKY = [G.entrance.pool[0], 1.0, G.entrance.pool[2]];
    buildAllChunks();
    var tM = performance.now();
    var dress = TU.caveDress.build(W, G, {
      field: field, march: march, addCollider: addCollider, nearestOnPiece: nearestOnPiece, pathAt: pathAt, palette: palette, lin: lin,
      rand: TU.rng(layout.seed, 10).fn(), mats: W.mats, daylightAt: daylightAt, root: seg0.root, seg: 0, fresh: true
    });
    W.dress = dress; seg0.dress = dress; seg0.core = dress.core; seg0.coreAxis = dress.coreAxis;
    W.core = dress.core; W.coreAxis = dress.coreAxis; W.stalSpot = dress.stalSpot;
    W.entranceF = null;
    computeSpots();
    TU.cave.source = 'generated';
    TU.cave.layout = layout;
    TU.cave.features = buildFeatures();
    TU.cave.lengths = { main: G.main.L };
    W.built = true; W.buildKey = bk; W.t = 0; W.quakes = 0;
    W.stats = { ms: Math.round(performance.now() - t0), sampleMs: Math.round(tS - t0), meshMs: Math.round(tM - tS), dressMs: Math.round(performance.now() - tM), chunks: W.chunks.length, cells: G.cellMap.size, pieces: G.pieces.length, seed: layout.seed, difficulty: layout.difficulty, mainLength: Math.round(G.main.L), stalactites: dress.stalactites.length, colliders: W.colliders.length };
    W.fallbackPi = G.entrance.idx;
    updateStats();
  }
  function updateStats() {
    if (!W.stats) return null;
    var tris = 0, verts = 0, built = 0; W.chunks.forEach(function (c) { if (c.mesh) { tris += c.tris; verts += c.verts; built++; } });
    W.stats.rockTris = tris; W.stats.rockVerts = verts; W.stats.chunksBuilt = built; W.stats.chunksPending = W.pending ? W.pending.length : 0;
    W.stats.chunks = W.chunks.length; W.stats.liveCells = G ? G.cellMap.size : 0; W.stats.blocks = G ? G.blocks.size : 0; W.stats.colliders = W.colliders.length;
    W.stats.segments = W.segs.map(function (sg) { return { index: sg.index, seed: sg.seed, chunks: sg.chunks.length, cells: sg.cellCount || (sg.index === 0 ? null : 0), opened: !!sg.opened, freed: !!sg.freed, difficulty: sg.layout && sg.layout.difficulty }; });
    W.stats.building = !!W.job;
    return W.stats;
  }
  // Same cave again (restart with the same seed): put back what quakes changed.
  function resetDynamic() {
    W.t = 0;
    if (TU.caveDress && TU.caveDress.resetDynamic) TU.caveDress.resetDynamic(W, G);
    G.pieces.forEach(function (P) { if (P.collapsed) { P.rocks.length = 0; P.collapsed = false; GEO.resamplePiece(G, P); remeshPiece(P); } });
    G.paths.forEach(function (p) { p.collapsed = false; });
    (TU.cave.features.finds || []).forEach(function (f) { f.taken = false; if (f.mesh) f.mesh.visible = true; });
    W.collapseFired = false;
  }

  function takeFind(id) {
    var list = TU.cave.features.finds || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { list[i].taken = true; if (list[i].mesh) list[i].mesh.visible = false; return list[i]; }
    return null;
  }
  TU.on('treasure:found', function (e) { if (e && e.id != null) takeFind(e.id); });

  /* ------------------------------------------------------------------ */
  /* Per-step and per-frame                                              */
  /* ------------------------------------------------------------------ */
  function animate(dt) {
    if (!W.built) return;
    W.t += dt;
    // rings waking up (endless mode): power eases toward its target
    var ancs = (W.anim && W.anim.ancients) || [];
    for (var ai = 0; ai < ancs.length; ai++) { var an = ancs[ai]; if (an.powerT != null) an.power = U.damp(an.power || 0, an.powerT, 1.6, dt); }
    if (TU.caveDress && TU.caveDress.animate) TU.caveDress.animate(W, G, dt);
    // run modifier "collapse ahead": the flagged main-line piece caves in as you approach it
    if (!W.collapseFired && TU.state.simulating()) {
      var P = TU.player.state, C = W.collapseTarget;
      if (C === undefined) { C = W.collapseTarget = G.pieces.filter(function (Q) { return Q.collapse; })[0] || null; }
      if (C && P.pos.distanceTo(v3(C.node || C.center)) < 26) { W.collapseFired = true; quake(1.3, { collapse: C }); }
    }
  }
  function frame(dt) {
    if (!W.built) return;
    TU.caveMat.update(dt);
    pumpMsgs(dt);
    // a new endless segment is built a few ms per frame (the clock only runs while you dive)
    if (W.job) { if (TU.state.simulating()) W.job.t += dt; jobStep(ENDLESS.budgetMs, false); }
    var cam = TU.camera.position;
    if (W.pending && W.pending.length) pumpChunks(cam, 5);
    // chunks farther than the cull distance are hidden (the fog has eaten them anyway); graphics quality sets it
    var cull = (TU.fx.gfx && TU.fx.gfx.cullDist) || TU.cfg.cave.cullDist || 60;
    if (!W.noCull) for (var i = 0; i < W.chunks.length; i++) { var ch = W.chunks[i]; if (ch.mesh) ch.mesh.visible = cam.distanceTo(ch.center) - ch.radius < cull; }
    if (TU.caveDress && TU.caveDress.frame) TU.caveDress.frame(W, G, dt);
  }

  TU.define('cave', {
    build: build, nearestPoint: nearestPoint, collide: collide, contains: contains, raycast: raycast,
    isDry: isDry, waterSurfaceY: waterSurfaceY, zoneAt: zoneAt, segmentAt: segmentAt, areaAt: areaAt, randomSpot: randomSpot,
    spot: spot, spawnPoint: spawnPoint, areas: AREAS,
    mapData: mapData, quake: quake, takeFind: takeFind, collapse: function (pieceId) { return G ? collapsePiece(G.byId[pieceId], 'debug') : false; },
    spotNames: function () { return SPOT_NAMES.filter(function (n) { return W.spots && !!W.spots[n]; }); },
    stats: function () { return updateStats(); },
    finishBuild: finishBuild,
    // Endless mode (new): zone names past the five classic ones, and the KEEP DIVING segments.
    zoneName: zoneName,
    zoneInfo: function (index) { return { index: index, name: zoneName(index), topM: zoneTopM(index), beyond: index >= 5 }; },
    zoneOfDepth: function (depthM, beyond) { return beyond || depthM >= (W.beyondStartM || 1e9) ? beyondZone(depthM) : U.zoneOfDepth(depthM); },
    endless: {
      descend: descend,                                  // (k?, { seed?, difficulty? }) -> { ok, index, seed, attempts, freed } ; builds over the next frames
      building: function () { return !!W.job; },
      phase: function () { return W.job ? W.job.phase : null; },
      finish: finishSegment,                             // finish the build now (tests, debug)
      segment: function () { return topSeg().index; },   // the segment whose ring is the goal
      segments: function () { return updateStats() ? W.stats.segments : []; },
      beyondStartM: function () { return W.beyondStartM < 1e9 ? W.beyondStartM : null; },
      config: ENDLESS, zones: BEYOND,
      lastBuild: function () { var sg = topSeg(); return sg.buildStats || null; }
    },
    _W: W
  });

  TU.addSystem('cave', {
    init: function () { build(TU.gen.generate(1, { difficulty: 'standard' })); },
    // run.layout is the generator output for run.seed (main.js), so every dive is a new cave.
    reset: function (run) { build(run && run.layout); W.t = 0; W.collapseFired = false; W.collapseTarget = undefined; },
    update: animate,
    idle: animate,
    frame: frame
  });
})();
