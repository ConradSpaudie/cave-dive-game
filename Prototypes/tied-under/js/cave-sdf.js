/*
 * cave-sdf.js: the SHAPE of a generated cave (agent A, helper for cave.js).
 *
 * How it works, in plain words:
 *   1. The generator (TU.gen) gives a list of "pieces" on a 3D grid of 8 m boxes (cells).
 *   2. For every piece we build a skeleton: "ports" (the holes in the middle of the faces where two
 *      pieces join) and a "node" in the middle of the cell, then tubes (capsules with an oval
 *      cross-section) along curves from port to node to port. Rooms get big squashed spheres.
 *   3. A signed distance field (SDF) says, for any point, how far it is from the cave wall:
 *      negative = open water or air, positive = solid rock. Smooth unions blend tubes into
 *      junctions and rooms, and seeded noise makes the walls lumpy instead of tube-like.
 *   4. We sample that field on a lattice every 0.4 m inside the occupied cells (stored per cell),
 *      and build the wall mesh with "surface nets" (one vertex per lattice box the wall passes
 *      through, quads between them). Collision and raycasts read the same lattice, so what you
 *      see is what you bump into.
 *
 * Coordinates follow CONTRACT.md: grid x = world +X, grid y (north) = world -Z, grid d = depth layer.
 * This file only builds data. cave.js turns it into meshes, dressing and the public TU.cave API.
 * Exposed as TU.caveGeo (internal to agent A's files).
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, N = TU.noise, U = TU.util;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;

  var CELL = 8;              // m, generator cell size
  var RES = 16;              // lattice steps per cell
  var VOX = CELL / RES;      // m between lattice points (0.4 m)
  var ROCK = 3;              // field value used for cells with no piece (solid rock)
  var AIR = -3;              // field value above the entrance (open sky)
  var MARGIN = (TU.cfg.cave && TU.cfg.cave.margin) || 0.8; // m of rock kept on every closed cell face (walls between unrelated passages)
  var SKIP = 2.7;            // m, primitives farther than this from a point are ignored (speed)
  var DW = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]; // dir -> world vector
  var DX = [0, 1, 0, -1, 0, 0], DY = [1, 0, -1, 0, 0, 0], DD = [0, 0, 0, 0, -1, 1];

  // Cell key. Depth layers 0..239 use the original packing (so the first cave looks exactly as it
  // always did); deeper layers (endless mode keeps adding cave below) add a high part on top.
  var DHI = 268435456; // 2^28: room for (x, y, 256 depth layers) below it
  function key(x, y, d) { var dd = d + 16, hi = Math.floor(dd / 256); return hi * DHI + ((x + 512) * 1024 + (y + 512)) * 256 + (dd - hi * 256); }
  // Key back to [x, y, d].
  function decode(k) {
    var hi = Math.floor(k / DHI), r = k - hi * DHI, lo = r % 256, r2 = (r - lo) / 256, y = (r2 % 1024) - 512, x = (r2 - (y + 512)) / 1024 - 512;
    return [x, y, hi * 256 + lo - 16];
  }
  function cellCenter(x, y, d) { return [(x + 0.5) * CELL, -(d + 0.5) * CELL, -(y + 0.5) * CELL]; }

  // Seeded hash of integers -> [0, 1). Same inputs and cave seed, same number.
  var SEED = 0;
  // Same hash with an explicit seed value (each endless segment keeps its own, see extend()).
  function hfS(sv, a, b, c, s) {
    var z = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ Math.imul((s | 0) + 1, 0x27d4eb2d) ^ sv) >>> 0;
    return TU.mix32(z) / 4294967296;
  }
  function hf(a, b, c, s) {
    var z = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ Math.imul((s | 0) + 1, 0x27d4eb2d) ^ SEED) >>> 0;
    return TU.mix32(z) / 4294967296;
  }
  function hs(a, b, c, s) { return hf(a, b, c, s) * 2 - 1; } // -1..1

  /* ------------------------------------------------------------------ */
  /* Small vector helpers on [x,y,z] arrays                              */
  /* ------------------------------------------------------------------ */
  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vmul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function vnorm(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vlerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function bez3(a, b, c, d, t) {
    var u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    return [a[0] * w0 + b[0] * w1 + c[0] * w2 + d[0] * w3, a[1] * w0 + b[1] * w1 + c[1] * w2 + d[1] * w3, a[2] * w0 + b[2] * w1 + c[2] * w2 + d[2] * w3];
  }

  /* ------------------------------------------------------------------ */
  /* Primitives: oval capsules (tubes) and ellipsoids (rooms, domes)     */
  /* ------------------------------------------------------------------ */
  // Frame for a tube segment: side and up axes around the direction t. Near-vertical
  // segments use a fixed horizontal "up" (hz) so the oval does not spin.
  function frameFor(t, hz) {
    var wu = [0, 1, 0], ty = Math.abs(t[1]);
    var up = vsub(wu, vmul(t, t[1]));
    up = vlen(up) > 1e-4 ? vnorm(up) : hz;
    var bl = smooth(0.82, 0.97, ty);
    if (bl > 0) up = vnorm(vlerp(up, hz, bl));
    up = vnorm(vsub(up, vmul(t, vdot(up, t))));
    var side = vnorm(vcross(t, up));
    return { side: side, up: up };
  }
  // Oval capsule from a to b. ra/rb = [side, up, down] radii at each end. fl = floor flatten 0..1.
  function capsule(a, b, ra, rb, fl, flv, hz) {
    var d = vsub(b, a), L2 = Math.max(vdot(d, d), 1e-6), t = vnorm(d);
    var fr = frameFor(t, hz);
    var vert = Math.abs(t[1]);
    var flat = (fl || 0) * (1 - smooth(0.45, 0.8, vert));
    var maxR = Math.max(ra[0], ra[1], ra[2], rb[0], rb[1], rb[2]);
    var mid = vlerp(a, b, 0.5);
    return {
      k: 0, ax: a[0], ay: a[1], az: a[2], dx: d[0], dy: d[1], dz: d[2], l2: L2,
      tx: t[0], ty: t[1], tz: t[2], sx: fr.side[0], sy: fr.side[1], sz: fr.side[2], ux: fr.up[0], uy: fr.up[1], uz: fr.up[2],
      r0: ra[0], r1: ra[1], r2: ra[2], r3: rb[0], r4: rb[1], r5: rb[2], fl: flat, flv: flv || 0.8,
      bx: mid[0], by: mid[1], bz: mid[2], br: Math.sqrt(L2) * 0.5 + maxR
    };
  }
  function dCapsule(c, x, y, z) {
    var px = x - c.ax, py = y - c.ay, pz = z - c.az;
    var h = (px * c.dx + py * c.dy + pz * c.dz) / c.l2; if (h < 0) h = 0; else if (h > 1) h = 1;
    var vx = px - c.dx * h, vy = py - c.dy * h, vz = pz - c.dz * h;
    var vs = vx * c.sx + vy * c.sy + vz * c.sz, vu = vx * c.ux + vy * c.uy + vz * c.uz, va = vx * c.tx + vy * c.ty + vz * c.tz;
    var rs = c.r0 + (c.r3 - c.r0) * h, ru = c.r1 + (c.r4 - c.r1) * h, rd = c.r2 + (c.r5 - c.r2) * h;
    var rv = vu > 0 ? ru : rd, rm = rs < rv ? rs : rv;
    var a = vs / rs, b = vu / rv, e = va / rm;
    var k0 = Math.sqrt(a * a + b * b + e * e);
    var a2 = a / rs, b2 = b / rv, e2 = e / rm;
    var k1 = Math.sqrt(a2 * a2 + b2 * b2 + e2 * e2);
    var d = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -rm;
    if (c.fl > 0) { var fd = -rd * c.flv - vu; if (fd > d) d += (fd - d) * c.fl; }
    return d;
  }
  // Ellipsoid with separate up and down vertical radii and an optional flat floor at fy.
  function ellipsoid(c, rx, ryUp, ryDn, rz, fy) {
    return { k: 1, cx: c[0], cy: c[1], cz: c[2], rx: rx, ru: ryUp, rd: ryDn, rz: rz, fy: fy == null ? -1e9 : fy,
      bx: c[0], by: c[1], bz: c[2], br: Math.max(rx, ryUp, ryDn, rz) };
  }
  function dEllipsoid(e, x, y, z) {
    var px = x - e.cx, py = y - e.cy, pz = z - e.cz, ry = py > 0 ? e.ru : e.rd;
    var a = px / e.rx, b = py / ry, c = pz / e.rz;
    var k0 = Math.sqrt(a * a + b * b + c * c);
    var a2 = a / e.rx, b2 = b / ry, c2 = c / e.rz;
    var k1 = Math.sqrt(a2 * a2 + b2 * b2 + c2 * c2);
    var d = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(e.rx, ry, e.rz);
    var fd = e.fy - y; if (fd > d) d = fd;
    return d;
  }
  function dPrim(q, x, y, z) { return q.k === 0 ? dCapsule(q, x, y, z) : dEllipsoid(q, x, y, z); }
  // Polynomial smooth minimum: blends two shapes with a fillet of size k.
  var GK = 1.2; // rounding of the cell-face guards (m)
  function smax(a, b) { return -smin(-a, -b, GK); }
  function smin(a, b, k) { var h = k - Math.abs(a - b); if (h <= 0) return a < b ? a : b; h /= k; return (a < b ? a : b) - h * h * k * 0.25; }

  /* ------------------------------------------------------------------ */
  /* Wall noise                                                          */
  /* ------------------------------------------------------------------ */
  // Lumpy rock: big slow bulges plus medium knobs. About -0.7..0.7.
  function wallNoise(x, y, z) {
    return 0.42 * N.n3(x * 0.16, y * 0.21, z * 0.16) + 0.22 * N.n3(x * 0.33 + 4.1, y * 0.42, z * 0.33) + 0.36 * N.n3(x * 0.52 + 7.1, y * 0.6, z * 0.52 - 3.3);
  }
  // Base wall roughness (m) by depth: smoother tubes in the mouth, rougher deeper.
  function baseAmp(y) { var d = -y; return 0.64 + 0.14 * smooth(20, 120, d); }

  /* ------------------------------------------------------------------ */
  /* Building the skeleton from a layout                                 */
  /* ------------------------------------------------------------------ */
  // Profiles: [side, up, down] radii (m), floor flatten, floor level (fraction of down radius).
  function nodeProfile(P, h) {
    var j = function (v, s) { return v * (1 + 0.13 * hs(P.id, s, 3, 71)); };
    var t = P.type, v = P.variant % 5;
    if (t === 'squeeze') {
      if (P.variant % 2 === 0) return { r: [1.0, 0.8, 0.72], fl: 0.2, flv: 0.9, sq: 'bed' };   // low bedding plane
      return { r: [0.7, 1.1, 1.05], fl: 0.2, flv: 0.9, sq: 'crack' };                             // tall narrow crack
    }
    if (t === 'shaft_down' || t === 'shaft_up') { var r = j(2.0, 1); return { r: [r, r * 0.95, r * 0.95], fl: 0.2, flv: 0.8 }; }
    if (t === 'silt_floor') return { r: [j(2.4, 1), j(1.7, 2), j(1.15, 3)], fl: 1.0, flv: 0.78 };
    if (t === 'current') return { r: [j(1.65, 1), j(1.7, 2), j(1.5, 3)], fl: 0.15, flv: 0.85 };
    if (t === 'dead_end') return { r: [j(1.35, 1), j(1.2, 2), j(0.95, 3)], fl: 0.5, flv: 0.8 };
    if (t === 'junction_t' || t === 'junction_x') return { r: [j(2.1, 1), j(1.9, 2), j(1.45, 3)], fl: 0.6, flv: 0.78 };
    if (v === 0) return { r: [j(1.95, 1), j(1.95, 2), j(1.6, 3)], fl: 0.35, flv: 0.82 };                 // round phreatic tube
    if (v === 1) return { r: [j(1.7, 1), j(1.8, 2), j(1.2, 3)], fl: 0.3, flv: 0.8, keyhole: true };      // keyhole
    if (v === 2) return { r: [j(2.4, 1), j(1.45, 2), j(1.1, 3)], fl: 0.75, flv: 0.8 };                   // flat bedding passage
    if (v === 3) return { r: [j(1.4, 1), j(2.3, 2), j(1.9, 3)], fl: 0.6, flv: 0.8 };                    // tall canyon
    return { r: [j(2.1, 1), j(1.85, 2), j(1.4, 3)], fl: 0.6, flv: 0.78 };
  }

  // A cave piece from a generator piece. off = [dx, dy, dd] grid shift, idBase added to ids (endless segments).
  function makePiece(gp, i, off, idBase) {
    off = off || [0, 0, 0]; idBase = idBase || 0;
    return {
      id: gp.id + idBase, idx: i, gp: gp, type: gp.type, role: gp.role, branch: gp.branch, zone: gp.zone, variant: gp.variant || 0,
      room: gp.shape === 'room', x: gp.x + off[0], y: gp.y + off[1], d: gp.d + off[2], w: gp.w, l: gp.l, h: gp.h,
      start: !!gp.start, bottom: !!gp.bottom, dry: !!gp.dry, treasure: !!gp.treasure, collapse: !!gp.collapse,
      landmarkId: gp.landmarkId == null ? -1 : gp.landmarkId, sockets: gp.sockets, ports: [], cells: [],
      groups: [], post: [], rocks: [], floorH: null, waterY: null, amp: 1, ampRoom: 1, k: 1.3, node: null, segs: [],
      openFaces: new Set(), extendedUp: 0, seedV: SEED, seg: 0
    };
  }
  function occupy(G, P2, x, y, d) { var k = key(x, y, d); G.cellMap.set(k, P2.idx); P2.cells.push([x, y, d]); }
  // World box, center and the open faces between cells of the same piece.
  function finishPiece(G, P2) {
    P2.box = { x0: P2.x * CELL, x1: (P2.x + P2.w) * CELL, y0: -(P2.d + P2.h) * CELL, y1: -P2.d * CELL, z0: -(P2.y + P2.l) * CELL, z1: -P2.y * CELL };
    P2.center = [(P2.box.x0 + P2.box.x1) / 2, (P2.box.y0 + P2.box.y1) / 2, (P2.box.z0 + P2.box.z1) / 2];
    P2.cells.forEach(function (c) {
      for (var dir = 0; dir < 6; dir++) {
        var nk = key(c[0] + DX[dir], c[1] + DY[dir], c[2] + DD[dir]);
        if (G.cellMap.get(nk) === P2.idx) P2.openFaces.add(key(c[0], c[1], c[2]) * 8 + dir);
      }
      if (P2.sky && c[2] === P2.d) P2.openFaces.add(key(c[0], c[1], c[2]) * 8 + 4); // open to the sky
    });
  }
  // One port per generator edge (the hole between two pieces). e = [aId, bId, x, y, d, dir].
  function addEdge(G, e) {
    var byId = G.byId;
    var A = byId[e[0]], B = byId[e[1]], x = e[2], y = e[3], d = e[4], dir = e[5];
    var c = cellCenter(x, y, d), w = DW[dir];
    var face = [c[0] + w[0] * CELL / 2, c[1] + w[1] * CELL / 2, c[2] + w[2] * CELL / 2];
    // canonical face id so both sides agree on jitter and size
    var nx = x + DX[dir], ny = y + DY[dir], nd = d + DD[dir];
    var ca = key(x, y, d), cb = key(nx, ny, nd), fk = Math.min(ca, cb) * 8 + (dir < 4 ? dir & 1 : 4);
    var vertical = dir >= 4;
    var j1 = hs(fk, 1, 0, 11), j2 = hs(fk, 2, 0, 11), j3 = hf(fk, 3, 0, 11), j4 = hf(fk, 4, 0, 11), j5 = hf(fk, 5, 0, 11);
    var pos, hz, prof;
    if (vertical) {
      pos = [face[0] + j1 * 0.75, face[1], face[2] + j2 * 0.75];
      var ang = hf(fk, 6, 0, 11) * Math.PI;
      hz = [Math.cos(ang), 0, Math.sin(ang)];
      var rr = 1.75 + 0.45 * j3;
      prof = { r: [rr, rr * (0.92 + 0.08 * j4), rr * (0.92 + 0.08 * j4)], fl: 0, flv: 0.8 };
    } else {
      var lat = [-w[2], 0, w[0]]; // horizontal perpendicular to the face normal
      pos = [face[0] + lat[0] * j1 * 0.7, face[1] + j2 * 0.6, face[2] + lat[2] * j1 * 0.7];
      hz = [lat[0], 0, lat[2]];
      prof = { r: [1.6 + 0.55 * j3, 1.5 + 0.45 * j4, 1.15 + 0.4 * j5], fl: 0.45 + 0.35 * hf(fk, 7, 0, 11), flv: 0.8 };
    }
    var port = { idx: G.ports.length, fk: fk, a: A.idx, b: B.idx, pos: pos, t: w.slice(), vertical: vertical, hz: hz, prof: prof, cellA: [x, y, d], dir: dir };
    G.ports.push(port);
    A.ports.push(port); B.ports.push(port);
    A.openFaces.add(ca * 8 + dir); B.openFaces.add(cb * 8 + (dir < 4 ? (dir + 2) & 3 : (dir === 4 ? 5 : 4)));
    var ek = Math.min(A.idx, B.idx) + '|' + Math.max(A.idx, B.idx);
    if (!G.edgeMap.has(ek)) G.edgeMap.set(ek, port);
    return port;
  }

  function create(layout) {
    SEED = TU.mix32((layout.seed >>> 0) ^ 0x51AB3C) >>> 0;
    var G = {
      layout: layout, seed: layout.seed >>> 0, seedV: SEED, pieces: [], cellMap: new Map(), blocks: new Map(), ports: [], portMap: new Map(),
      edgeMap: new Map(), paths: [], pathById: {}, entrance: null, bottom: null, skyCells: new Set(), version: 0
    };
    var gpieces = layout.pieces, i;
    /* ---- pieces and occupancy ---- */
    for (i = 0; i < gpieces.length; i++) G.pieces.push(makePiece(gpieces[i], i));
    G.pieces.forEach(function (P2) { for (var dd = 0; dd < P2.h; dd++) for (var yy = 0; yy < P2.l; yy++) for (var xx = 0; xx < P2.w; xx++) occupy(G, P2, P2.x + xx, P2.y + yy, P2.d + dd); });
    // Dry chambers grow up into free rock above them (if every cell above is free), so there is
    // headroom for a ledge to fall from.
    G.pieces.forEach(function (P2) { growDry(G, P2); });
    // The entrance pool is open to the sky: add a layer of cells above it (d = -1).
    G.pieces.forEach(function (P2) {
      if (!P2.start) return;
      for (var yy = 0; yy < P2.l; yy++) for (var xx = 0; xx < P2.w; xx++) { occupy(G, P2, P2.x + xx, P2.y + yy, P2.d - 1); G.skyCells.add((P2.x + xx) + ',' + (P2.y + yy)); }
      P2.d -= 1; P2.h += 1; P2.sky = true; G.entrance = P2;
    });
    G.pieces.forEach(function (P2) { if (P2.bottom) G.bottom = P2; finishPiece(G, P2); });
    var byId = {}; G.pieces.forEach(function (P2) { byId[P2.id] = P2; }); G.byId = byId;

    /* ---- ports: one per generator edge (the hole between two pieces) ---- */
    layout.edges.forEach(function (e) { addEdge(G, e); });

    /* ---- per piece shapes ---- */
    G.pieces.forEach(function (P2) { if (P2.room) buildRoom(G, P2); else buildCellPiece(G, P2); });
    buildPaths(G);
    return G;
  }
  function growDry(G, P2) {
    if (!P2.dry || !P2.room || P2.d < 1) return;
    var free = true, xx, yy;
    for (yy = -1; yy <= P2.l && free; yy++) for (xx = -1; xx <= P2.w && free; xx++) {
      var inside = xx >= 0 && xx < P2.w && yy >= 0 && yy < P2.l;
      if (inside && G.cellMap.has(key(P2.x + xx, P2.y + yy, P2.d - 1))) free = false;
    }
    if (!free) return;
    for (yy = 0; yy < P2.l; yy++) for (xx = 0; xx < P2.w; xx++) occupy(G, P2, P2.x + xx, P2.y + yy, P2.d - 1);
    P2.d -= 1; P2.h += 1; P2.extendedUp = 1;
  }

  /* ------------------------------------------------------------------ */
  /* Endless mode: add a new generated segment below the bottom chamber  */
  /* ------------------------------------------------------------------ */
  // layout: a generator layout (its own seed). opts: { seg, off: [dx, dy, dd], idBase, branchBase,
  //   from: the bottom piece above (gets a hole in its floor), column: [cx, cy] (the shaft column),
  //   dTop, dStart (first and one-past-last connector layer) }.
  // The new pieces are added to G (cells, ports, shapes, paths); nothing is sampled yet, so the new
  // cells read as solid rock until cave.js samples them. Returns { pieces, connector, start, bottom,
  // hole (the new port in the old floor), from, cells } or throws if a cell is already taken.
  function extend(G, layout, opts) {
    var oldSeed = SEED, off = opts.off, idBase = opts.idBase, B0 = opts.from, cx = opts.column[0], cy = opts.column[1];
    SEED = TU.mix32((layout.seed >>> 0) ^ 0x51AB3C) >>> 0;
    var segSeed = SEED, added = [], conn = [], i, k;
    try {
      // occupancy check first (nothing is changed if this fails)
      var want = new Set();
      for (var dc = opts.dTop; dc < opts.dStart; dc++) want.add(key(cx, cy, dc));
      layout.pieces.forEach(function (gp) { for (var dd = 0; dd < gp.h; dd++) for (var yy = 0; yy < gp.l; yy++) for (var xx = 0; xx < gp.w; xx++) want.add(key(gp.x + off[0] + xx, gp.y + off[1] + yy, gp.d + off[2] + dd)); });
      want.forEach(function (kk) { if (G.cellMap.has(kk)) throw new Error('cell taken'); });
      var base = G.pieces.length;
      // the connector shaft: one shaft piece per layer from the old floor down to the new start room
      for (dc = opts.dTop, k = 0; dc < opts.dStart; dc++, k++) {
        var cgp = { id: 9000 + k, type: 'shaft_down', shape: 'vthrough', role: 'main', branch: -1, zone: 4, variant: k % 4, x: cx, y: cy, d: dc, w: 1, l: 1, h: 1, sockets: [] };
        var CP = makePiece(cgp, base + conn.length, [0, 0, 0], idBase); CP.connector = true; CP.seg = opts.seg; CP.seedV = segSeed;
        conn.push(CP); G.pieces.push(CP);
      }
      var startP = null, bottomP = null;
      layout.pieces.forEach(function (gp) {
        var P2 = makePiece(gp, G.pieces.length, off, idBase);
        P2.seg = opts.seg; P2.seedV = segSeed;
        if (P2.branch >= 0) P2.branch += opts.branchBase;
        if (P2.start) { P2.start = false; P2.segStart = true; startP = P2; }
        if (P2.bottom) bottomP = P2;
        added.push(P2); G.pieces.push(P2);
      });
      conn.concat(added).forEach(function (P2) { for (var dd = 0; dd < P2.h; dd++) for (var yy = 0; yy < P2.l; yy++) for (var xx = 0; xx < P2.w; xx++) occupy(G, P2, P2.x + xx, P2.y + yy, P2.d + dd); });
      added.forEach(function (P2) { growDry(G, P2); });
      conn.concat(added).forEach(function (P2) { finishPiece(G, P2); G.byId[P2.id] = P2; });
      // ports: the hole in the old floor, down the shaft, into the new start room's ceiling
      var hole = addEdge(G, [B0.id, conn[0].id, cx, cy, B0.d + B0.h - 1, 5]);
      for (k = 0; k < conn.length - 1; k++) addEdge(G, [conn[k].id, conn[k + 1].id, cx, cy, conn[k].d, 5]);
      addEdge(G, [conn[conn.length - 1].id, startP.id, cx, cy, opts.dStart - 1, 5]);
      layout.edges.forEach(function (e) { addEdge(G, [e[0] + idBase, e[1] + idBase, e[2] + off[0], e[3] + off[1], e[4] + off[2], e[5]]); });
      // shapes of the new pieces (this segment's seed)
      conn.concat(added).forEach(function (P2) { if (P2.room) buildRoom(G, P2); else buildCellPiece(G, P2); });
      // the old bottom chamber gets an arm down to the hole (rebuilt with ITS seed, so nothing else moves)
      SEED = B0.seedV;
      B0.groups = []; B0.post = []; B0.arms = null; B0.cellInfo = null;
      buildRoom(G, B0);
      SEED = segSeed;
      // (G.bottom stays the old chamber until cave.js opens the floor)
      // paths: the main line now runs on through the old bottom, down the shaft and through the new segment
      var spec = G.pathSpec || { mainPath: G.layout.mainPath.slice(), branches: G.layout.branches.slice() };
      spec.mainPath = spec.mainPath.concat(conn.map(function (P2) { return P2.id; }), layout.mainPath.map(function (id) { return id + idBase; }));
      spec.branches = spec.branches.concat(layout.branches.map(function (b) {
        return { id: b.id + opts.branchBase, kind: b.kind, from: b.from + idBase, to: b.to >= 0 ? b.to + idBase : b.to, pieces: b.pieces.map(function (id) { return id + idBase; }), treasure: b.treasure, seconds: b.seconds };
      }));
      G.pathSpec = spec;
      G.pieces.forEach(function (P2) { P2.segs = []; });
      G.paths = []; G.pathById = {};
      buildPaths(G);
      G.version++;
      var cells = [];
      conn.concat(added).forEach(function (P2) { P2.cells.forEach(function (c) { cells.push(c); }); });
      return { pieces: added, connector: conn, start: startP, bottom: bottomP, hole: hole, from: B0, cells: cells, seedV: segSeed };
    } finally { SEED = oldSeed; }
  }
  // Cells of piece P whose field can change because of the primitives in prims (plus the cell with the hole).
  function touchedCells(P, prims, extraCell) {
    var out = [];
    P.cells.forEach(function (c) {
      var x0 = c[0] * CELL, x1 = x0 + CELL, y1 = -c[2] * CELL, y0 = y1 - CELL, z1 = -c[1] * CELL, z0 = z1 - CELL, hit = false;
      if (extraCell && c[0] === extraCell[0] && c[1] === extraCell[1] && c[2] === extraCell[2]) hit = true;
      for (var i = 0; i < prims.length && !hit; i++) {
        var q = prims[i], dx = Math.max(x0 - q.bx, 0, q.bx - x1), dy = Math.max(y0 - q.by, 0, q.by - y1), dz = Math.max(z0 - q.bz, 0, q.bz - z1);
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < q.br + SKIP + 2.5) hit = true; // + wall noise and blending reach
      }
      if (hit) out.push(c);
    });
    return out;
  }
  // Put sampled blocks (from sampleCell with a target map) into the live field in one go.
  function swapBlocks(G, map) { map.forEach(function (blk, k) { G.blocks.set(k, blk); }); lastK = -1; lastB = null; G.version++; }
  // Forget cells (an old segment far behind): they read as solid rock from now on.
  function freeCells(G, cells) {
    cells.forEach(function (c) { var k = key(c[0], c[1], c[2]); G.cellMap.delete(k); G.blocks.delete(k); });
    lastK = -1; lastB = null; G.version++;
  }

  // Direction from a port into a piece (unit vector).
  // port.t points from piece a (port.cellA) into piece b, so piece a looks the other way.
  function inward(port, P) { return port.a === P.idx ? vmul(port.t, -1) : port.t; }
  // The short straight "stub" of tube that leaves each port at a right angle to the face.
  var STUB = 1.3;
  function stubPrims(port, P) {
    var n = inward(port, P), a = port.pos, b = vadd(a, vmul(n, STUB));
    return { end: b, n: n, cap: capsule(a, b, port.prof.r, port.prof.r, port.prof.fl, port.prof.flv, port.hz) };
  }
  // Chain of capsules along a cubic curve. rFn(u) -> radii, flFn(u) -> floor flatten.
  function chain(pts, rFn, fl, flv, hz, out) {
    for (var i = 0; i < pts.length - 1; i++) {
      var u0 = i / (pts.length - 1), u1 = (i + 1) / (pts.length - 1);
      out.push(capsule(pts[i], pts[i + 1], rFn(u0), rFn(u1), fl, flv, hz));
    }
  }
  function curvePts(a, b, c, d, n) { var out = []; for (var i = 0; i <= n; i++) out.push(bez3(a, b, c, d, i / n)); return out; }
  function mixR(ra, rb, t) { return [lerp(ra[0], rb[0], t), lerp(ra[1], rb[1], t), lerp(ra[2], rb[2], t)]; }

  // One-cell pieces: tubes, bends, junctions, shafts, squeezes, dead ends, air pockets.
  function buildCellPiece(G, P) {
    var c = cellCenter(P.x, P.y, P.d);
    var prof = nodeProfile(P);
    var jy = P.type === 'air_pocket' ? -0.6 : hs(P.id, 2, 0, 21) * 0.45;
    var node = [c[0] + hs(P.id, 1, 0, 21) * 0.55, c[1] + jy, c[2] + hs(P.id, 3, 0, 21) * 0.55];
    // shafts keep the node centered sideways so straight drops look like drops
    var vertOnly = P.ports.every(function (p) { return p.vertical; });
    if (vertOnly) node = [c[0] + hs(P.id, 1, 0, 21) * 0.4, c[1], c[2] + hs(P.id, 3, 0, 21) * 0.4];
    P.node = node; P.prof = prof;
    var hzNode = (function () { var a = hf(P.id, 9, 0, 21) * Math.PI; return [Math.cos(a), 0, Math.sin(a)]; })();
    var stubs = P.ports.map(function (p) { return stubPrims(p, P); });
    stubs.forEach(function (s) { P.groups.push([s.cap]); });
    var isSq = P.type === 'squeeze';
    function wob(u, s) { return 1 + 0.12 * Math.sin(Math.PI * u) * hs(P.id, s, Math.round(u * 8), 33); }
    P.curves = [];
    if (stubs.length === 2) {
      var A = stubs[0], B = stubs[1], pa = P.ports[0].prof.r, pb = P.ports[1].prof.r;
      var dist = vlen(vsub(A.end, B.end)), al = Math.max(1, dist * 0.38);
      var mid = vlerp(A.end, B.end, 0.5), off = vmul(vsub(node, mid), 0.75);
      var pts = curvePts(A.end, vadd(vadd(A.end, vmul(A.n, al)), off), vadd(vadd(B.end, vmul(B.n, al)), off), B.end, 8);
      var w = function (u) { return isSq ? smooth(0, 0.3, u) * smooth(1, 0.7, u) : Math.pow(Math.sin(Math.PI * u), 0.7); };
      var grp = [];
      chain(pts, function (u) { var base = mixR(pa, pb, u), r = mixR(base, prof.r, w(u)), k = isSq ? 1 : wob(u, 1); return [r[0] * k, r[1] * k, r[2] * k]; }, prof.fl, prof.flv, hzNode, grp);
      P.groups.push(grp);
      P.curves.push({ ports: [0, 1], pts: [P.ports[0].pos].concat(pts, [P.ports[1].pos]) });
      if (prof.keyhole) { // a narrow slot cut into the floor under the round tube
        var slot = [], dn = prof.r[2] + 0.45;
        var spts = pts.map(function (p, i) { var u = i / (pts.length - 1), s = Math.sin(Math.PI * u); return [p[0], p[1] - dn * s, p[2]]; });
        chain(spts, function (u) { var s = Math.pow(Math.sin(Math.PI * u), 1.5); return [0.08 + 0.5 * s, 0.08 + 0.7 * s, 0.08 + 0.75 * s]; }, 0, 0.8, hzNode, slot);
        P.groups.push(slot);
      }
    } else {
      // dead ends and junctions: an arm from every port to the node, plus a rounded node
      P.arms = [];
      stubs.forEach(function (S, k) {
        var pr = P.ports[k].prof.r, dist = vlen(vsub(node, S.end)), al = Math.max(0.8, dist * 0.45);
        var pts = curvePts(S.end, vadd(S.end, vmul(S.n, al)), vlerp(node, S.end, 0.3), node, 5);
        var grp = [];
        chain(pts, function (u) { var r = mixR(pr, prof.r, smooth(0, 1, u)), kk = wob(u, 10 + k); return [r[0] * kk, r[1] * kk, r[2] * kk]; }, prof.fl, prof.flv, hzNode, grp);
        P.groups.push(grp);
        P.arms.push([P.ports[k].pos].concat(pts));
      });
      var nr = prof.r;
      if (P.type === 'dead_end') {
        var big = P.treasure ? 1.35 : 1.1;
        P.groups.push([ellipsoid(node, nr[0] * big + 0.2, nr[1] * big + 0.15, nr[2] * big, nr[0] * big + 0.2, node[1] - nr[2] * 0.75)]);
      } else P.groups.push([ellipsoid(node, nr[0] * 1.08, nr[1] * 1.05, nr[2], nr[0] * 1.08, node[1] - nr[2] * 0.8)]);
    }
    // Air pocket: a dome of air over the passage with a water surface inside it.
    if (P.type === 'air_pocket') {
      P.waterY = node[1] + 0.9 + 0.25 * hf(P.id, 5, 0, 21);
      P.groups.push([ellipsoid([node[0], P.waterY + 0.05, node[2]], 2.4, 2.45, 1.4, 2.4)]);
      P.airBox = { x0: c[0] - 4, x1: c[0] + 4, y0: c[1] - 4, y1: c[1] + 4, z0: c[2] - 4, z1: c[2] + 4 };
    }
    // Wall roughness: squeezes are smooth near the narrowest point (otherwise noise would seal them).
    P.ampNode = isSq ? 0.18 : P.type === 'current' ? 0.75 : P.type === 'air_pocket' ? 0.6 : 1;
    P.k = 1.4;
  }

  // Rooms: chambers, landmarks, the bottom chamber, the entrance pool and dry chambers.
  function buildRoom(G, P) {
    var b = P.box, cx = P.center[0], cz = P.center[2];
    var ex = (b.x1 - b.x0) / 2, ez = (b.z1 - b.z0) / 2, hy = (b.y1 - b.y0) / 2;
    var jx = hs(P.id, 1, 0, 41) * Math.min(1.2, ex * 0.12), jz = hs(P.id, 2, 0, 41) * Math.min(1.2, ez * 0.12);
    var main = [];
    P.k = 2.6; P.ampRoom = P.bottom ? 1.1 : 1.25;
    if (P.start) {
      // The cenote: a round pool below a shaft open to the sky. Water surface at y = 0.
      var pc = [cx + jx * 0.5, -4.4, cz + jz * 0.5];
      P.groups.push([ellipsoid(pc, ex - 2.3, 4.0, 3.3, ez - 2.3, -7.0)]);
      P.groups.push([capsule([pc[0], -3.5, pc[2]], [pc[0] + 0.5, 10, pc[2] - 0.4], [4.0, 3.7, 3.7], [4.6, 4.3, 4.3], 0, 0.8, [1, 0, 0])]);
      P.groups.push([ellipsoid([pc[0] - 2.2, -3.2, pc[2] + 1.8], 3.2, 2.4, 2.3, 2.9, -6.6)]);
      P.waterY = 0; P.pool = pc; P.ampRoom = 1.3;
      P.airBox = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 + 40, z0: b.z0, z1: b.z1 };
    } else {
      var floorY = b.y0 + clamp(hy * 0.5, 1.25, 2.4) + (P.bottom ? 0.3 : 0);
      var rx = ex - 1.75, rz = ez - 1.75, ru = (hy * 2 - 1.25) - (hy - 1.0), rd = hy - 1.0;
      var c0 = [cx + jx, b.y0 + hy, cz + jz];
      // dome: the ceiling rises in the middle, the floor is flat
      main.push(ellipsoid(c0, rx, hy - 1.0, rd, rz, floorY));
      P.groups.push(main);
      var nl = P.bottom ? 4 : 2 + Math.floor(hf(P.id, 3, 0, 41) * 3);
      for (var i = 0; i < nl; i++) {
        var lx = hs(P.id, 10 + i, 0, 41) * (ex - 4.5), lz = hs(P.id, 20 + i, 0, 41) * (ez - 4.5);
        var lrx = Math.min(ex * (0.35 + 0.25 * hf(P.id, 30 + i, 0, 41)), ex - 1.6 - Math.abs(lx));
        var lrz = Math.min(ez * (0.35 + 0.25 * hf(P.id, 40 + i, 0, 41)), ez - 1.6 - Math.abs(lz));
        var lry = (hy - 1.2) * (0.5 + 0.35 * hf(P.id, 50 + i, 0, 41));
        if (lrx < 1.5 || lrz < 1.5) continue;
        P.groups.push([ellipsoid([cx + lx, b.y0 + 1.2 + lry * 0.9, cz + lz], lrx, lry, lry * 0.8, lrz, floorY + 0.1 * i)]);
      }
      P.floorY = floorY;
    }
    // arms from every port into the room: a tube that leaves the port and bends toward the middle
    // until it is well inside the room's main volume (ports in corner cells or under a raised dry
    // floor would otherwise end in rock and seal the room)
    P.arms = [];
    var mainE = P.start ? P.groups[0][0] : main[0];
    var wyDry = P.dry ? dryWaterY(P) : null;
    P.ports.forEach(function (port, k) {
      var S = stubPrims(port, P), pr = port.prof.r, n = S.n;
      var q0 = vadd(S.end, vmul(n, port.vertical ? 2.4 : 1.8));
      var fy = P.start ? -5.5 : P.floorY;
      var tgtY = Math.max(q0[1], fy + 1.9);
      if (port.vertical && n[1] < 0) tgtY = Math.min(q0[1], Math.max(fy + 2.4, q0[1] - 3)); // from the ceiling: come down
      if (wyDry != null) tgtY = port.vertical && n[1] > 0 ? Math.max(q0[1], wyDry - 2.0) : Math.min(tgtY, wyDry - 1.6);
      var goal = [cx, tgtY, cz], T = null;
      for (var f = 0.15; f <= 0.96 && !T; f += 0.1) {
        var c = [lerp(q0[0], cx, f), tgtY, lerp(q0[2], cz, f)];
        if (dEllipsoid(mainE, c[0], c[1], c[2]) < -1.7) T = c;
      }
      if (!T) T = [lerp(q0[0], cx, 0.95), tgtY, lerp(q0[2], cz, 0.95)];
      var pts = curvePts(S.end, q0, vlerp(q0, T, 0.6), T, 5);
      var grp = [S.cap];
      var big = [pr[0] * 1.25, pr[1] * 1.2, pr[2] * 1.1];
      chain(pts, function (u) { return mixR(pr, big, u); }, port.prof.fl, port.prof.flv, port.hz, grp);
      if (P.dry) P.post.push(grp); else P.groups.push(grp);
      P.arms.push({ port: port, pts: [port.pos].concat(pts), q: T });
    });
    if (P.dry) buildDryRoom(G, P);
  }

  // A dry chamber: a pool where the passages come in, and a rock floor above the water line.
  // If the room is tall enough, a raised ledge with a ramp up one side and a cliff to fall from.
  // Water line of a dry chamber: just above every side passage that comes in.
  function dryWaterY(P) {
    var wy = P.box.y0 + 2.6;
    P.ports.forEach(function (p) { if (!p.vertical) wy = Math.max(wy, p.pos[1] + p.prof.r[1] + 0.4); });
    return wy;
  }
  function buildDryRoom(G, P) {
    var b = P.box, cx = P.center[0], cz = P.center[2];
    var wy = dryWaterY(P);
    // A passage that comes in high up would put the water line (and the floor) near the ceiling
    // and seal the room. Then it becomes an "air chamber" instead: open water with a big dome of
    // air at the top where you can surface and breathe (still an air source for the generator).
    if (b.y1 - 1.0 - (wy + 0.38) < 3.2) {
      P.dry = false; P.airChamber = true;
      P.waterY = Math.min(wy - 0.1, b.y1 - 2.8);
      P.airBox = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1 };
      P.groups = P.groups.concat(P.post); P.post = [];
      P.warm = hf(P.id, 8, 0, 51) < 0.5;
      return;
    }
    P.waterY = wy;
    var floorBase = wy + 0.3;
    P.floorBase = floorBase;
    // pools: at each arm end, open water reaching the floor
    var pools = [], pc = [0, 0];
    P.arms.forEach(function (a) {
      // a pool shaft from the end of the passage up through the floor, with open water around it
      var q = a.q, pp = [q[0], wy - 1.0, q[2]];
      pools.push(ellipsoid(pp, 3.1, 2.2, 2.4, 3.1));
      if (q[1] < wy - 3.2) pools.push(capsule([q[0], q[1], q[2]], [q[0], wy - 1.6, q[2]], [2.0, 2.0, 2.0], [2.4, 2.4, 2.4], 0, 0.8, [1, 0, 0]));
      pc[0] += q[0]; pc[1] += q[2];
    });
    if (pools.length) { pc[0] /= pools.length; pc[1] /= pools.length; } else pc = [cx, cz];
    P.pools = pools.filter(function (q) { return q.k === 1; }); // the pool basins (shafts excluded)
    P.post.push(pools);
    // ledge axis: from the pools toward the far side of the room
    var ax = [cx - pc[0], cz - pc[1]], al = Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1]);
    if (al < 0.5) { var an = hf(P.id, 4, 0, 51) * Math.PI * 2; ax = [Math.cos(an), Math.sin(an)]; } else ax = [ax[0] / al, ax[1] / al];
    var bx = [-ax[1], ax[0]];
    var ex = (b.x1 - b.x0) / 2, ez = (b.z1 - b.z0) / 2;
    var extA = Math.abs(ax[0]) * ex + Math.abs(ax[1]) * ez, extB = Math.abs(bx[0]) * ex + Math.abs(bx[1]) * ez;
    var head = b.y1 - 1.0 - floorBase; // rough headroom in the middle of the room
    var H = 0;
    var spread = 0;
    P.arms.forEach(function (a) { P.arms.forEach(function (b2) { spread = Math.max(spread, Math.hypot(a.q[0] - b2.q[0], a.q[2] - b2.q[2])); }); });
    if (head >= 7.5 && spread < 7) H = clamp(head - 4.4, 3, 6); // a ledge only if it cannot wall off a pool
    P.ledge = null;
    var a0 = extA * 0.12, rampLen = 0, b1 = extB * 0.22;
    if (H > 0) {
      rampLen = Math.min(H * 1.55, extA * 0.75);
      P.ledge = { H: H, a0: a0, b1: b1, ax: ax, bx: bx, c: [cx, cz], top: floorBase + H, rampLen: rampLen };
    }
    P.floorH = function (x, z) {
      var dxp = x - cx, dzp = z - cz;
      var pa = dxp * ax[0] + dzp * ax[1], pb = dxp * bx[0] + dzp * bx[1];
      // rough breakdown floor: slabs, humps and small steps
      // (low and even next to the pools, so you can climb out of the water onto it)
      var dp = 1e9;
      for (var pi2 = 0; pi2 < P.pools.length; pi2++) { var pq = P.pools[pi2]; dp = Math.min(dp, Math.hypot(x - pq.cx, z - pq.cz)); }
      var rough = 0.2 + 0.8 * smooth(3.5, 7.0, dp);
      var h = floorBase + rough * (0.22 * N.n3(x * 0.3, 3.3, z * 0.3) + 0.12 * N.n3(x * 0.9, 1.7, z * 0.9) + 0.1 * Math.abs(N.n3(x * 0.55 + 9, 5.1, z * 0.55)));
      if (H > 0) {
        // never raise the ledge or its ramp over a pool (it would seal the water in)
        var keep = smooth(3.6, 6.0, dp);
        var ramp = H * clamp((pa - (a0 - rampLen)) / rampLen, 0, 1);
        var t = smooth(b1, b1 + 0.8, pb);
        var cliff = H * smooth(a0, a0 + 0.7, pa);
        h += keep * (lerp(cliff, ramp, t) + 0.08 * N.n3(x * 1.3, 7.7, z * 1.3) * smooth(0.2, 1, (cliff + ramp) / H));
      }
      return h;
    };
    P.airBox = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1 };
    P.warm = hf(P.id, 8, 0, 51) < 0.6;
  }

  /* ------------------------------------------------------------------ */
  /* Paths: center lines with distance "s" (main line, branches, loops)  */
  /* ------------------------------------------------------------------ */
  function portBetween(G, a, b) { return G.edgeMap.get(Math.min(a, b) + '|' + Math.max(a, b)) || null; }
  // Points through piece P from port pin to port pout (either may be null for path ends).
  function throughPiece(G, P, pin, pout, startPt, endPt) {
    var pts = [];
    function armOf(port) { if (!P.arms) return null; for (var i = 0; i < P.arms.length; i++) { var a = P.arms[i]; var pp = a.port || P.ports[i]; if (pp === port) return a.pts || a; } return null; }
    if (P.room) {
      var mid = P.start ? [P.pool[0], -1.6, P.pool[2]] : P.bottom ? [P.center[0], P.floorY + 5.2, P.center[2]] : [P.center[0], P.dry ? P.waterY - 1.2 : Math.max(P.floorY + 2.6, P.center[1] - 1.5), P.center[2]];
      if (pin) { var ai = armOf(pin); pts = pts.concat(ai); } else pts.push(startPt || mid);
      if (pin && pout) pts.push(P.dry ? [P.center[0], P.floorBase + 1.0, P.center[2]] : mid);
      if (!pin && !pout) pts.push(mid);
      if (pout) { var ao = armOf(pout).slice().reverse(); pts = pts.concat(ao); } else if (pin) pts.push(endPt || mid);
      return pts;
    }
    if (P.curves && P.curves.length && pin && pout) {
      var cv = P.curves[0].pts;
      return P.ports[0] === pin ? cv.slice() : cv.slice().reverse();
    }
    if (pin) { var a1 = armOf(pin); pts = pts.concat(a1); } else pts.push(P.node);
    if (pout) { var a2 = armOf(pout).slice().reverse(); pts = pts.concat(a2); }
    return pts;
  }
  function addPath(G, id, kind, branchId, pieceSeq, firstPort, lastPort) {
    var pts = [], owner = [];
    for (var i = 0; i < pieceSeq.length; i++) {
      var P = G.pieces[pieceSeq[i]];
      var pin = i === 0 ? firstPort : portBetween(G, pieceSeq[i - 1], pieceSeq[i]);
      var pout = i === pieceSeq.length - 1 ? lastPort : portBetween(G, pieceSeq[i], pieceSeq[i + 1]);
      var seg = throughPiece(G, P, pin, pout);
      for (var k = 0; k < seg.length; k++) {
        var p = seg[k];
        if (pts.length) { var q = pts[pts.length - 1]; if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 0.05) continue; }
        pts.push(p); owner.push(P.idx);
      }
    }
    var cum = [0];
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + vlen(vsub(pts[i], pts[i - 1])));
    var path = { id: id, kind: kind, branch: branchId, pts: pts, cum: cum, L: cum[cum.length - 1], owner: owner };
    // register segments with the pieces they pass through
    for (i = 0; i < pts.length - 1; i++) {
      var o1 = G.pieces[owner[i]], o2 = G.pieces[owner[i + 1]];
      o1.segs.push({ path: path, i: i });
      if (o2 !== o1) o2.segs.push({ path: path, i: i });
    }
    G.paths.push(path); G.pathById[id] = path;
    return path;
  }
  function buildPaths(G) {
    var L = G.pathSpec || G.layout, byId = G.byId;
    var mainSeq = L.mainPath.map(function (id) { return byId[id].idx; });
    G.main = addPath(G, 'main', 'main', -1, mainSeq, null, null);
    L.branches.forEach(function (b) {
      var seq = b.pieces.map(function (id) { return byId[id].idx; });
      var anchor = byId[b.from].idx, first = portBetween(G, anchor, seq[0]);
      var last = b.kind === 'loop' && b.to >= 0 ? portBetween(G, seq[seq.length - 1], byId[b.to].idx) : null;
      addPath(G, 'b' + b.id, b.kind === 'loop' ? 'loop' : 'branch', b.id, seq, first, last);
    });
  }

  /* ------------------------------------------------------------------ */
  /* The field                                                           */
  /* ------------------------------------------------------------------ */
  // Field value of piece P at a point inside cell (ccx, ccy, ccd). Negative = open.
  // Per cell: only the primitives that can reach this cell, and which faces are closed (bits).
  function cellInfo(P, ccx, ccy, ccd) {
    var ck = key(ccx, ccy, ccd);
    if (!P.cellInfo) P.cellInfo = new Map();
    var ci = P.cellInfo.get(ck);
    if (ci) return ci;
    var x0 = ccx * CELL, x1 = x0 + CELL, y1 = -ccd * CELL, y0 = y1 - CELL, z1 = -ccy * CELL, z0 = z1 - CELL;
    function near(q) {
      var dx = Math.max(x0 - q.bx, 0, q.bx - x1), dy = Math.max(y0 - q.by, 0, q.by - y1), dz = Math.max(z0 - q.bz, 0, q.bz - z1);
      return Math.sqrt(dx * dx + dy * dy + dz * dz) < q.br + SKIP + 0.5;
    }
    var groups = [];
    P.groups.forEach(function (g) { var kept = g.filter(near); if (kept.length) groups.push(kept); });
    var post = [];
    P.post.forEach(function (g) { var kept = g.filter(near); if (kept.length) post.push(kept); });
    var mask = 0, cb = ck * 8;
    for (var dir = 0; dir < 6; dir++) if (!P.openFaces.has(cb + dir)) mask |= 1 << dir;
    ci = { groups: groups, post: post, mask: mask };
    P.cellInfo.set(ck, ci);
    return ci;
  }
  function evalPiece(G, P, x, y, z, ccx, ccy, ccd) {
    var CI = cellInfo(P, ccx, ccy, ccd);
    var f = 1e9, groups = CI.groups, k = P.k, gi, i, q, d, ex, ey, ez, rr;
    for (gi = 0; gi < groups.length; gi++) {
      var grp = groups[gi], gm = 1e9;
      for (i = 0; i < grp.length; i++) {
        q = grp[i]; ex = x - q.bx; ey = y - q.by; ez = z - q.bz; rr = q.br + SKIP;
        if (ex * ex + ey * ey + ez * ez > rr * rr) { if (SKIP < gm) gm = SKIP; continue; }
        d = q.k === 0 ? dCapsule(q, x, y, z) : dEllipsoid(q, x, y, z); if (d < gm) gm = d;
      }
      f = smin(f, gm, k);
    }
    if (P.floorH && y < P.floorBase + (P.ledge ? P.ledge.H : 0) + 2.5) { var fh = P.floorH(x, z) - y; if (P.ledge && fh > -3) fh /= ledgeSlope(P, x, z); if (fh > f) f = fh; }
    for (gi = 0; gi < CI.post.length; gi++) {
      var g2 = CI.post[gi], gm2 = 1e9;
      for (i = 0; i < g2.length; i++) { d = dPrim(g2[i], x, y, z); if (d < gm2) gm2 = d; }
      f = smin(f, gm2, 1.4);
    }
    // wall noise (only near the wall, where it matters)
    if (f > -1.6 && f < 1.8) {
      var amp = baseAmp(y) * ampAt(P, x, y, z);
      if (f > -(amp + 0.7) && f < amp + 0.9) f += amp * wallNoise(x, y, z);
    }
    // keep rock on closed faces of this cell
    var x0 = ccx * CELL, z1 = -ccy * CELL, y1 = -ccd * CELL, m = CI.mask, g;
    // (smooth max, so a wall that reaches the margin bends away round instead of going flat)
    if (m) {
      if (m & 1) { g = MARGIN - (z - (z1 - CELL)); if (g > f - GK) f = smax(f, g); }
      if (m & 2) { g = MARGIN - (x0 + CELL - x); if (g > f - GK) f = smax(f, g); }
      if (m & 4) { g = MARGIN - (z1 - z); if (g > f - GK) f = smax(f, g); }
      if (m & 8) { g = MARGIN - (x - x0); if (g > f - GK) f = smax(f, g); }
      if (m & 16) { g = MARGIN - (y1 - y); if (g > f - GK) f = smax(f, g); }
      if (m & 32) { g = MARGIN - (y - (y1 - CELL)); if (g > f - GK) f = smax(f, g); }
    }
    // rubble and other rock added inside the open space
    for (i = 0; i < P.rocks.length; i++) {
      q = P.rocks[i]; ex = x - q[0]; ey = y - q[1]; ez = z - q[2];
      d = q[3] - Math.sqrt(ex * ex + ey * ey + ez * ez) + 0.25 * N.n3(x * 1.7, y * 1.7, z * 1.7);
      f = -smin(-f, -d, 0.5);
    }
    return f;
  }
  // Steep heightfield (the ledge cliff) -> convert vertical distance to an approximate true distance.
  function ledgeSlope(P, x, z) {
    var e = 0.15, hx = (P.floorH(x + e, z) - P.floorH(x - e, z)) / (2 * e), hz = (P.floorH(x, z + e) - P.floorH(x, z - e)) / (2 * e);
    return Math.sqrt(1 + hx * hx + hz * hz);
  }
  // Wall roughness multiplier for this piece at a point (fades to 1 at the ports so walls line up).
  function ampAt(P, x, y, z) {
    if (P.room) {
      var b = P.box, dm = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z, y - b.y0, b.y1 - y);
      return lerp(1, P.ampRoom, smooth(0.6, 3.5, dm));
    }
    if (P.ampNode !== 1) {
      var n = P.node, dx = x - n[0], dy = y - n[1], dz = z - n[2], dn = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return lerp(P.ampNode, 1, smooth(1.0, 3.7, dn));
    }
    return 1;
  }

  // Sample every lattice point of one cell into its block. Coarse to fine: first every second
  // point; boxes that are far from any wall (all corners clearly rock, or clearly open) are filled
  // by interpolation, and only boxes near a wall get the full (expensive) evaluation.
  var CR = RES / 2 + 1, FAR = 1.05;
  // target: optional Map to write the block into instead of G.blocks (endless: swap it in later).
  function sampleCell(G, cx, cy, cd, target) {
    var P = G.pieces[G.cellMap.get(key(cx, cy, cd))];
    var blk = new Float32Array(RES * RES * RES), coarse = new Float32Array(CR * CR * CR);
    var i, j, k, n = 0, x0 = cx * RES, j0 = cy * RES, k0 = cd * RES;
    for (k = 0; k < CR; k++) for (j = 0; j < CR; j++) for (i = 0; i < CR; i++)
      coarse[n++] = evalPiece(G, P, (x0 + i * 2) * VOX, -(k0 + k * 2) * VOX, -(j0 + j * 2) * VOX, cx, cy, cd);
    for (var ck = 0; ck < CR - 1; ck++) for (var cj = 0; cj < CR - 1; cj++) for (var ci = 0; ci < CR - 1; ci++) {
      var c000 = coarse[(ck * CR + cj) * CR + ci], c100 = coarse[(ck * CR + cj) * CR + ci + 1], c010 = coarse[(ck * CR + cj + 1) * CR + ci], c110 = coarse[(ck * CR + cj + 1) * CR + ci + 1];
      var c001 = coarse[((ck + 1) * CR + cj) * CR + ci], c101 = coarse[((ck + 1) * CR + cj) * CR + ci + 1], c011 = coarse[((ck + 1) * CR + cj + 1) * CR + ci], c111 = coarse[((ck + 1) * CR + cj + 1) * CR + ci + 1];
      var mn = Math.min(c000, c100, c010, c110, c001, c101, c011, c111), mx = Math.max(c000, c100, c010, c110, c001, c101, c011, c111);
      var far = mn > FAR || mx < -FAR;
      for (var dk = 0; dk < 2; dk++) for (var dj = 0; dj < 2; dj++) for (var di = 0; di < 2; di++) {
        var li = ci * 2 + di, lj = cj * 2 + dj, lk = ck * 2 + dk, v;
        if (far) {
          var u = di * 0.5, w = dj * 0.5, t = dk * 0.5;
          var a0 = c000 + (c100 - c000) * u, a1 = c010 + (c110 - c010) * u, a2 = c001 + (c101 - c001) * u, a3 = c011 + (c111 - c011) * u;
          var b0 = a0 + (a1 - a0) * w, b1 = a2 + (a3 - a2) * w;
          v = b0 + (b1 - b0) * t;
        } else if (di === 0 && dj === 0 && dk === 0) v = c000;
        else v = evalPiece(G, P, (x0 + li) * VOX, -(k0 + lk) * VOX, -(j0 + lj) * VOX, cx, cy, cd);
        blk[(lk * RES + lj) * RES + li] = v;
      }
    }
    (target || G.blocks).set(key(cx, cy, cd), blk);
    if (!target && lastK === key(cx, cy, cd)) { lastK = -1; lastB = null; }
    return blk;
  }
  function sampleAll(G) {
    G.cellMap.forEach(function (pi, k) { var c = decode(k); sampleCell(G, c[0], c[1], c[2]); });
    G.version++;
  }

  /* ------------------------------------------------------------------ */
  /* Reading the lattice: value, gradient, ray march                     */
  /* ------------------------------------------------------------------ */
  var lastK = -1, lastB = null, lastG = null;
  function missing(G, cx, cy, cd) { return cd <= -2 && G.skyCells.has(cx + ',' + cy) ? AIR : ROCK; }
  function lat(G, i, j, k) {
    var cx = Math.floor(i / RES), cy = Math.floor(j / RES), cd = Math.floor(k / RES);
    var kk = key(cx, cy, cd), b;
    if (kk === lastK && lastG === G) b = lastB; else { b = G.blocks.get(kk); lastK = kk; lastB = b; lastG = G; }
    if (!b) return missing(G, cx, cy, cd);
    return b[((k - cd * RES) * RES + (j - cy * RES)) * RES + (i - cx * RES)];
  }
  // Trilinear field value at a world point. If grad is given, fills it with the world gradient.
  function field(G, x, y, z, grad) {
    var fi = x / VOX, fj = -z / VOX, fk = -y / VOX;
    var i = Math.floor(fi), j = Math.floor(fj), k = Math.floor(fk);
    var u = fi - i, v = fj - j, w = fk - k;
    var c000 = lat(G, i, j, k), c100 = lat(G, i + 1, j, k), c010 = lat(G, i, j + 1, k), c110 = lat(G, i + 1, j + 1, k);
    var c001 = lat(G, i, j, k + 1), c101 = lat(G, i + 1, j, k + 1), c011 = lat(G, i, j + 1, k + 1), c111 = lat(G, i + 1, j + 1, k + 1);
    var x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u, x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    var y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    if (grad) {
      var gi = ((c100 - c000) * (1 - v) + (c110 - c010) * v) * (1 - w) + ((c101 - c001) * (1 - v) + (c111 - c011) * v) * w;
      var gj = (x10 - x00) * (1 - w) + (x11 - x01) * w;
      var gk = y1 - y0;
      grad[0] = gi / VOX; grad[1] = -gk / VOX; grad[2] = -gj / VOX;
    }
    return y0 + (y1 - y0) * w;
  }
  // Smoother gradient (central differences on the trilinear field). out = [gx, gy, gz].
  function gradient(G, x, y, z, out) {
    var e = VOX * 0.5;
    out[0] = (field(G, x + e, y, z) - field(G, x - e, y, z)) / (2 * e);
    out[1] = (field(G, x, y + e, z) - field(G, x, y - e, z)) / (2 * e);
    out[2] = (field(G, x, y, z + e) - field(G, x, y, z - e)) / (2 * e);
    return out;
  }
  // Distance along a unit direction to the first rock (sphere tracing), or max.
  function march(G, ox, oy, oz, dx, dy, dz, max) {
    var t = 0, f0 = field(G, ox, oy, oz);
    if (f0 > 0) return 0;
    for (var it = 0; it < 96 && t < max; it++) {
      var f = field(G, ox + dx * t, oy + dy * t, oz + dz * t);
      if (f > -0.015) {
        // refine between the last two steps
        return Math.max(0, t - 0.02);
      }
      t += Math.max(-f * 0.85, 0.05);
    }
    return Math.min(t, max);
  }

  /* ------------------------------------------------------------------ */
  /* Surface nets: the wall mesh of one cell                             */
  /* ------------------------------------------------------------------ */
  var S = RES + 4; // padded lattice: local -2 .. RES+1
  function padded(G, cx, cy, cd) {
    var blk = G.blocks.get(key(cx, cy, cd)), out = new Float32Array(S * S * S);
    var i0 = cx * RES, j0 = cy * RES, k0 = cd * RES, n = 0;
    for (var c = 0; c < S; c++) for (var b = 0; b < S; b++) for (var a = 0; a < S; a++) {
      var la = a - 2, lb = b - 2, lc = c - 2;
      out[n++] = (la >= 0 && la < RES && lb >= 0 && lb < RES && lc >= 0 && lc < RES) ? blk[(lc * RES + lb) * RES + la] : lat(G, i0 + la, j0 + lb, k0 + lc);
    }
    return out;
  }
  var CE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]; // cube edges by corner index
  // Returns { pos: [], nrm: [], idx: [] } in world space for the cell (cx,cy,cd).
  function meshCell(G, cx, cy, cd) {
    var Pd = padded(G, cx, cy, cd);
    var i0 = cx * RES, j0 = cy * RES, k0 = cd * RES;
    var VM = RES + 1, vmap = new Int32Array(VM * VM * VM).fill(-1);
    var pos = [], nrm = [], idx = [];
    function P_(a, b, c) { return Pd[((c + 2) * S + (b + 2)) * S + (a + 2)]; }
    var cv = new Float32Array(8), g = [0, 0, 0];
    function gradAt(a, b, c, w) { // central difference at padded lattice point, accumulate * w into g
      g[0] += (P_(a + 1, b, c) - P_(a - 1, b, c)) * w; g[1] += (P_(a, b + 1, c) - P_(a, b - 1, c)) * w; g[2] += (P_(a, b, c + 1) - P_(a, b, c - 1)) * w;
    }
    function vert(a, b, c) { // vertex of the lattice box with min corner (a,b,c), a in -1..RES-1
      var vi = ((c + 1) * VM + (b + 1)) * VM + (a + 1);
      if (vmap[vi] >= 0) return vmap[vi];
      for (var n = 0; n < 8; n++) cv[n] = P_(a + (n & 1), b + ((n >> 1) & 1), c + ((n >> 2) & 1));
      var sx = 0, sy = 0, sz = 0, cnt = 0;
      for (var e = 0; e < 12; e++) {
        var p0 = CE[e][0], p1 = CE[e][1], v0 = cv[p0], v1 = cv[p1];
        if ((v0 < 0) === (v1 < 0)) continue;
        var t = v0 / (v0 - v1);
        sx += (p0 & 1) + ((p1 & 1) - (p0 & 1)) * t;
        sy += ((p0 >> 1) & 1) + (((p1 >> 1) & 1) - ((p0 >> 1) & 1)) * t;
        sz += ((p0 >> 2) & 1) + (((p1 >> 2) & 1) - ((p0 >> 2) & 1)) * t;
        cnt++;
      }
      if (!cnt) { sx = sy = sz = 0.5; cnt = 1; }
      var fx = sx / cnt, fy = sy / cnt, fz = sz / cnt;
      g[0] = g[1] = g[2] = 0;
      for (n = 0; n < 8; n++) {
        var wx = (n & 1) ? fx : 1 - fx, wy = ((n >> 1) & 1) ? fy : 1 - fy, wz = ((n >> 2) & 1) ? fz : 1 - fz;
        gradAt(a + (n & 1), b + ((n >> 1) & 1), c + ((n >> 2) & 1), wx * wy * wz);
      }
      // lattice gradient -> world normal pointing into the open space (away from rock)
      var nx = -g[0], ny = g[2], nz = g[1], nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      var id = pos.length / 3;
      pos.push((i0 + a + fx) * VOX, -(k0 + c + fz) * VOX, -(j0 + b + fy) * VOX);
      nrm.push(nx / nl, ny / nl, nz / nl);
      vmap[vi] = id;
      return id;
    }
    function quad(v0, v1, v2, v3, ox, oy, oz) { // ox..: world direction the face should point to
      var ax = pos[v1 * 3] - pos[v0 * 3], ay = pos[v1 * 3 + 1] - pos[v0 * 3 + 1], az = pos[v1 * 3 + 2] - pos[v0 * 3 + 2];
      var bx = pos[v2 * 3] - pos[v0 * 3], by = pos[v2 * 3 + 1] - pos[v0 * 3 + 1], bz = pos[v2 * 3 + 2] - pos[v0 * 3 + 2];
      var fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
      var flip = fx * ox + fy * oy + fz * oz < 0;
      // split along the shorter diagonal
      var d02 = dist2(v0, v2), d13 = dist2(v1, v3);
      if (d02 <= d13) { if (!flip) idx.push(v0, v1, v2, v0, v2, v3); else idx.push(v0, v2, v1, v0, v3, v2); }
      else { if (!flip) idx.push(v0, v1, v3, v1, v2, v3); else idx.push(v0, v3, v1, v1, v3, v2); }
    }
    function dist2(p, q) { var dx = pos[p * 3] - pos[q * 3], dy = pos[p * 3 + 1] - pos[q * 3 + 1], dz = pos[p * 3 + 2] - pos[q * 3 + 2]; return dx * dx + dy * dy + dz * dz; }
    for (var c = 0; c < RES; c++) for (var b = 0; b < RES; b++) for (var a = 0; a < RES; a++) {
      var s0 = P_(a, b, c), in0 = s0 < 0;
      // x edge (lattice i): world +X
      if ((P_(a + 1, b, c) < 0) !== in0) {
        var sg = in0 ? -1 : 1; // face points toward the open end
        quad(vert(a, b - 1, c - 1), vert(a, b, c - 1), vert(a, b, c), vert(a, b - 1, c), sg, 0, 0);
      }
      // y edge (lattice j): world -Z
      if ((P_(a, b + 1, c) < 0) !== in0) {
        var sg2 = in0 ? 1 : -1;
        quad(vert(a - 1, b, c - 1), vert(a, b, c - 1), vert(a, b, c), vert(a - 1, b, c), 0, 0, sg2);
      }
      // z edge (lattice k): world -Y
      if ((P_(a, b, c + 1) < 0) !== in0) {
        var sg3 = in0 ? 1 : -1;
        quad(vert(a - 1, b - 1, c), vert(a, b - 1, c), vert(a, b, c), vert(a - 1, b, c), 0, sg3, 0);
      }
    }
    return { pos: pos, nrm: nrm, idx: idx };
  }

  // Re-sample the cells of a piece after its rock changed (collapse rubble).
  function resamplePiece(G, P) {
    P.cells.forEach(function (c) { sampleCell(G, c[0], c[1], c[2]); });
    lastK = -1; lastB = null;
    G.version++;
  }

  // Which piece owns the cell at a world point (index into G.pieces) or -1.
  function pieceAt(G, x, y, z) {
    var cx = Math.floor(x / CELL), cy = Math.floor(-z / CELL), cd = Math.floor(-y / CELL);
    var v = G.cellMap.get(key(cx, cy, cd));
    return v === undefined ? -1 : v;
  }

  TU.caveGeo = {
    CELL: CELL, RES: RES, VOX: VOX, key: key, decode: decode, cellCenter: cellCenter, DW: DW,
    create: create, extend: extend, touchedCells: touchedCells, freeCells: freeCells, swapBlocks: swapBlocks, hfS: hfS,
    sampleAll: sampleAll, sampleCell: sampleCell, resamplePiece: resamplePiece, meshCell: meshCell,
    field: field, gradient: gradient, march: march, pieceAt: pieceAt, evalPiece: evalPiece, hf: function (a, b, c, s) { return hf(a, b, c, s); },
    ampAt: ampAt, baseAmp: baseAmp, wallNoise: wallNoise, portBetween: portBetween,
    v: { add: vadd, sub: vsub, mul: vmul, len: vlen, norm: vnorm, dot: vdot, cross: vcross, lerp: vlerp }
  };
})();
