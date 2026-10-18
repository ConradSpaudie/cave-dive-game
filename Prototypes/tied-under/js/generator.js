/*
 * generator.js: the tested, deterministic cave layout generator, copied unchanged from
 * prototypes/cave-gen/generator.js (spec: vault Tech/Cave Generator Algorithm.md).
 * It sets window.CaveGen. The footer at the bottom wraps it as TU.gen for the game.
 * Do not edit the generator part without re-running prototypes/cave-gen/test.js:
 * the C++ port must stay bit-identical (same checksum for the same seed).
 */
/*
 * Cave generator prototype (reference implementation for the UE5 C++ port).
 * Pure, deterministic, dependency free. Same (seed, options) gives identical output.
 * All layout decisions use 32-bit integer math only (Math.imul and >>> 0), so the
 * C++ port with uint32_t produces bit-identical caves and the same checksum.
 *
 * Grid: cubic cells of CELL_M metres. Coordinates (x, y, d):
 *   x = east, y = north, d = depth layer (0 at the surface, grows downward).
 * Directions: 0 N(+y) 1 E(+x) 2 S(-y) 3 W(-x) 4 UP(d-1) 5 DOWN(d+1).
 */
(function (root) {
  'use strict';

  var GEN_VERSION = 1;
  var CELL_M = 8;
  var BOUND_XY = 60;      // |x|,|y| <= BOUND_XY
  var MAX_D = 63;         // 0 <= d <= MAX_D
  var MAX_ATTEMPTS = 24;

  var ZONE_NAMES = ['The Mouth', 'Twilight Throat', 'The Black Galleries', 'The Sulfur Deep', 'The Old Water'];
  var ZONE_TOP_M = [0, 20, 60, 120, 200];
  var ZONE_LAYER = [0, 2, 7, 15, 25]; // first layer whose centre depth is inside each zone

  var TYPES = ['straight', 'bend', 'junction_t', 'junction_x', 'shaft_down', 'shaft_up', 'squeeze',
    'chamber_small', 'chamber_large', 'air_pocket', 'dead_end', 'silt_floor', 'current', 'landmark'];
  var SHAPES = ['cap', 'straight', 'bend', 'tee', 'cross', 'v_through', 'v_top_h', 'v_bot_h', 'room'];
  var ROLES = ['main', 'branch', 'loop'];
  var DIFFS = ['easy', 'standard', 'hard'];
  var ARCHETYPES = ['shaft', 'maze', 'river', 'chain', 'split'];
  var ARCH_W = [20, 20, 20, 25, 15];
  var LAYOUT_MODS = ['flood_surge', 'shifting_silt', 'collapse_ahead'];

  var F_START = 1, F_BOTTOM = 2, F_TREASURE = 4, F_DRY = 8, F_COLLAPSE = 16;

  var DX = [0, 1, 0, -1, 0, 0];
  var DY = [1, 0, -1, 0, 0, 0];
  var DD = [0, 0, 0, 0, -1, 1];
  var OPP = [2, 3, 0, 1, 5, 4];

  // Canonical socket masks of the 1-cell kit shapes (rotation 0). bit = 1 << dir.
  var CANON = { cap: 1, straight: 5, bend: 3, tee: 11, cross: 15, v_through: 48, v_top_h: 17, v_bot_h: 33 };

  // Room footprints [w (x), l (y), h (d)] in cells.
  var ROOM = {
    entrance: [2, 2, 1], chamber_small: [2, 2, 1], chamber_large: [3, 3, 2], landmark: [3, 3, 2], bottom: [4, 4, 2]
  };

  // Traversal cost in whole seconds for a team of up to 4 on the rope (includes logging and rope handling).
  var COST = {
    straight: 18, bend: 18, dead_end: 18, junction_t: 28, junction_x: 28,
    shaft_down: 9, shaft_up: 22, squeeze: 63, current: 40, silt_floor: 28, air_pocket: 18,
    chamber_small: 60, chamber_large: 110, landmark: 150, entrance: 30, bottom: 120
  };
  var AIR_REST = 30;           // seconds spent breathing in an air pocket (not counted in the air gap)
  var EXPLORE_PCT = 40;        // chance (%) a team explores a dead-end branch (there and back)
  var LOOP_PCT = 25;           // chance (%) a team takes a loop instead of the main path section

  var KIT_VARIANTS = {
    straight: 5, bend: 5, junction_t: 4, junction_x: 3, shaft_down: 4, shaft_up: 4, squeeze: 4,
    chamber_small: 5, chamber_large: 4, air_pocket: 4, dead_end: 4, silt_floor: 4, current: 4, landmark: 30
  };
  var LANDMARK_NAMES = ['The Drowned Truck', 'The Pipe Organ', 'The Wrong Way Room', 'The Bell Chamber', 'The Old Camp'];

  var DIFF = {
    easy: {
      idx: 0, budget: [540, 600], bottom: [25, 25], branches: [2, 3], loops: [1, 1], landmarks: [1, 1],
      maxGap: 300, sqPct: 4, curPct: 3, siltPct: 6, brLen: [2, 4], treasurePct: 35, band: [12, 18],
      shares: [80, 170, 230, 290, 230], roomGap: 300, roomPct: 12, fwdW: 50, turnW: 25, maxDrop: 7, shaftBias: 40
    },
    standard: {
      idx: 1, budget: [1360, 1500], bottom: [26, 29], branches: [4, 6], loops: [2, 3], landmarks: [1, 2],
      maxGap: 330, sqPct: 6, curPct: 4, siltPct: 8, brLen: [3, 9], treasurePct: 40, band: [30, 45],
      shares: [80, 180, 240, 260, 240], roomGap: 200, roomPct: 22, fwdW: 50, turnW: 25, maxDrop: 4, shaftBias: 15
    },
    hard: {
      idx: 2, budget: [1850, 2250], bottom: [29, 34], branches: [7, 10], loops: [3, 5], landmarks: [2, 3],
      maxGap: 390, sqPct: 9, curPct: 5, siltPct: 10, brLen: [3, 9], treasurePct: 45, band: [45, 75],
      shares: [70, 170, 240, 270, 250], roomGap: 220, roomPct: 24, fwdW: 50, turnW: 25, maxDrop: 4, shaftBias: 15
    }
  };

  // ---------------------------------------------------------------- PRNG
  function mix32(z) {
    z = z >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B);
    z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35);
    return (z ^ (z >>> 16)) >>> 0;
  }
  function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }

  // xoshiro128** seeded with SplitMix32 from (seed, stream).
  function Rng(seed, stream) {
    var sm = ((seed >>> 0) ^ Math.imul(stream >>> 0, 0x9E3779B9)) >>> 0;
    this.s = new Uint32Array(4);
    for (var i = 0; i < 4; i++) {
      sm = (sm + 0x9E3779B9) >>> 0;
      this.s[i] = mix32(sm);
    }
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) this.s[0] = 1;
  }
  Rng.prototype.next = function () {
    var s = this.s;
    var result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    var t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  };
  // Unbiased integer in [0, n). n >= 1 and < 2^32.
  Rng.prototype.below = function (n) {
    var threshold = (4294967296 - n) % n;
    for (;;) { var r = this.next(); if (r >= threshold) return r % n; }
  };
  Rng.prototype.range = function (lo, hi) { return lo + this.below(hi - lo + 1); };
  Rng.prototype.chance = function (pct) { return this.below(100) < pct; };
  // Index chosen by integer weights. Returns -1 if all weights are 0.
  Rng.prototype.weighted = function (w) {
    var total = 0, i;
    for (i = 0; i < w.length; i++) total += w[i];
    if (total <= 0) return -1;
    var r = this.below(total);
    for (i = 0; i < w.length; i++) { if (r < w[i]) return i; r -= w[i]; }
    return w.length - 1;
  };

  // ---------------------------------------------------------------- grid helpers
  function key(x, y, d) { return ((x + 1024) * 2048 + (y + 1024)) * 128 + d; }
  function inBounds(x, y, d) { return x >= -BOUND_XY && x <= BOUND_XY && y >= -BOUND_XY && y <= BOUND_XY && d >= 0 && d <= MAX_D; }
  function zoneOfDepthM(m) { return m < 20 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 200 ? 3 : 4; }
  function popcount4(h) { return (h & 1) + ((h >> 1) & 1) + ((h >> 2) & 1) + ((h >> 3) & 1); }
  function rotMask(mask, r) {
    var h = mask & 15;
    return ((((h << r) | (h >> (4 - r))) & 15) | (mask & 48)) >>> 0;
  }
  function shapeOfMask(mask) {
    var h = mask & 15, v = mask >> 4, hc = popcount4(h);
    if (v === 0) {
      if (hc === 1) return 'cap';
      if (hc === 2) return (h === 5 || h === 10) ? 'straight' : 'bend';
      if (hc === 3) return 'tee';
      if (hc === 4) return 'cross';
      return null;
    }
    if (v === 3) return hc === 0 ? 'v_through' : null;
    if (hc !== 1) return null;
    return v === 1 ? 'v_top_h' : 'v_bot_h';
  }
  function isFree(ctx, x, y, d) { return inBounds(x, y, d) && !ctx.occ.has(key(x, y, d)); }

  function makePiece(ctx, kind, x, y, d, w, l, h) {
    var p = {
      id: ctx.pieces.length, type: kind, shape: (w * l * h > 1 || kind !== 'cell') ? 'room' : null,
      x: x, y: y, d: d, w: w, l: l, h: h, rot: 0, variant: 0, zone: 0,
      role: 'main', branch: -1, flags: 0, mask: 0, sockets: [],
      inDir: -1, outDir: -1, entry: null, exit: null, banned: null, cost: 0, landmarkId: -1
    };
    if (kind === 'cell') p.shape = null;
    for (var dd = 0; dd < h; dd++) for (var yy = 0; yy < l; yy++) for (var xx = 0; xx < w; xx++) ctx.occ.set(key(x + xx, y + yy, d + dd), p.id);
    ctx.pieces.push(p);
    return p;
  }
  function removeLastPiece(ctx) {
    var p = ctx.pieces.pop();
    for (var dd = 0; dd < p.h; dd++) for (var yy = 0; yy < p.l; yy++) for (var xx = 0; xx < p.w; xx++) ctx.occ.delete(key(p.x + xx, p.y + yy, p.d + dd));
  }
  function isRoom(p) { return p.shape === 'room'; }
  function addSocket(p, x, y, d, dir) {
    if (p.shape === 'room') p.sockets.push([x, y, d, dir]);
    else { p.mask |= (1 << dir); p.sockets.push([x, y, d, dir]); }
  }
  function connect(ctx, a, x, y, d, dir) {
    var nx = x + DX[dir], ny = y + DY[dir], nd = d + DD[dir];
    var bId = ctx.occ.get(key(nx, ny, nd));
    if (bId === undefined) throw new Error('connect into rock');
    var pa = ctx.pieces[a.id !== undefined ? a.id : a], pb = ctx.pieces[bId];
    addSocket(pa, x, y, d, dir);
    addSocket(pb, nx, ny, nd, OPP[dir]);
    ctx.edges.push([pa.id, pb.id, x, y, d, dir]);
  }
  function roomBoundaryFaces(p, allowUp) {
    var out = [];
    for (var dd = 0; dd < p.h; dd++) for (var yy = 0; yy < p.l; yy++) for (var xx = 0; xx < p.w; xx++) {
      for (var dir = 0; dir < 6; dir++) {
        if (dir === 4 && !allowUp) continue;
        var ix = xx + DX[dir], iy = yy + DY[dir], id = dd + DD[dir];
        if (ix >= 0 && ix < p.w && iy >= 0 && iy < p.l && id >= 0 && id < p.h) continue;
        out.push([p.x + xx, p.y + yy, p.d + dd, dir]);
      }
    }
    return out;
  }
  function freeNeighbourCount(ctx, x, y, d, except) {
    var c = 0;
    for (var dir = 0; dir < 6; dir++) {
      if (dir === 4 || dir === except) continue;
      if (isFree(ctx, x + DX[dir], y + DY[dir], d + DD[dir])) c++;
    }
    return c;
  }

  // ---------------------------------------------------------------- params
  function buildParams(difficulty, archetype, mods) {
    var b = DIFF[difficulty], P = {}, k;
    for (k in b) P[k] = Array.isArray(b[k]) ? b[k].slice() : b[k];
    P.difficulty = difficulty; P.archetype = archetype; P.mods = mods;
    P.brLenAdj = 0; P.curMul = 1; P.siltMul = 1;
    if (archetype === 'shaft') { P.maxDrop += 3; P.shaftBias += 40; P.turnW = 30; }
    if (archetype === 'maze') { P.branches[0] += 2; P.branches[1] += 2; P.loops[0] += 1; P.loops[1] += 1; P.brLenAdj = -1; P.turnW = 35; P.fwdW = 40; }
    if (archetype === 'river') { P.fwdW = 80; P.turnW = 12; P.curMul = 3; P.maxDrop = Math.max(2, P.maxDrop - 1); }
    if (archetype === 'chain') { P.roomPct += 18; P.roomGap = (P.roomGap * 3) >> 2; }
    if (mods.indexOf('flood_surge') >= 0) P.curMul *= 2;
    if (mods.indexOf('shifting_silt') >= 0) P.siltMul = 2;
    P.collapse = mods.indexOf('collapse_ahead') >= 0;
    return P;
  }
  function rulesFor(difficulty, archetype, modifiers) {
    var P = buildParams(DIFF[difficulty] ? difficulty : 'standard', archetype || 'chain', normalizeMods(modifiers));
    return { branches: P.branches, loops: P.loops, landmarks: P.landmarks, maxGap: P.maxGap, band: P.band, bottom: P.bottom };
  }
  function normalizeMods(mods) {
    var out = [];
    if (!Array.isArray(mods)) return out;
    for (var i = 0; i < mods.length; i++) { var m = String(mods[i]); if (out.indexOf(m) < 0) out.push(m); }
    out.sort();
    return out;
  }

  // ---------------------------------------------------------------- main path
  function targetLayer(ctx, t) {
    var P = ctx.P;
    var p = Math.floor(t * 1000 / ctx.budget);
    if (p > 1000) p = 1000;
    var L = [0, ZONE_LAYER[1], ZONE_LAYER[2], ZONE_LAYER[3], ZONE_LAYER[4], ctx.bottomLayer];
    var cum = [0], s = 0, i;
    for (i = 0; i < 5; i++) { s += P.shares[i]; cum.push(s); }
    for (i = 0; i < 5; i++) {
      if (p <= cum[i + 1]) return L[i] + Math.floor((L[i + 1] - L[i]) * (p - cum[i]) / (cum[i + 1] - cum[i]));
    }
    return ctx.bottomLayer;
  }
  function downWeight(P, deficit) {
    if (deficit >= 3) return 300;
    if (deficit === 2) return 120;
    if (deficit === 1) return 45;
    if (deficit === 0) return 4;
    return 0;
  }
  function isBanned(p, x, y, d, dir) {
    if (!p.banned) return false;
    var code = key(x, y, d) * 8 + dir;
    return p.banned.indexOf(code) >= 0;
  }

  function exitOptions(ctx, stack, target) {
    var P = ctx.P, head = stack[stack.length - 1], opts = [], w = [], i, dir;
    var B = ctx.bottomLayer;
    function consider(x, y, d, dir, weight) {
      var nx = x + DX[dir], ny = y + DY[dir], nd = d + DD[dir];
      if (!isFree(ctx, nx, ny, nd)) return;
      if (isBanned(head, x, y, d, dir)) return;
      if (freeNeighbourCount(ctx, nx, ny, nd, OPP[dir]) === 0) return;
      if (Math.abs(nx) > P.radius || Math.abs(ny) > P.radius) weight = 0;
      opts.push([x, y, d, dir]); w.push(weight);
    }
    if (!isRoom(head)) {
      var m = head.inDir;
      var vrun = 0;
      for (i = stack.length - 1; i >= 0 && stack[i].inDir === 5 && !isRoom(stack[i]); i--) vrun++;
      var dirs = m === 5 ? [5, 0, 1, 2, 3] : [m, (m + 3) & 3, (m + 1) & 3, 5];
      for (i = 0; i < dirs.length; i++) {
        dir = dirs[i];
        var wt;
        if (dir === 5) {
          wt = head.d >= B + 2 ? 0 : downWeight(P, target - head.d);
          if (vrun >= P.maxDrop) wt = 0;
          else if (m === 5 && target - head.d > 0) wt += P.shaftBias;
        } else if (m === 5) wt = 25;
        else wt = dir === m ? P.fwdW : P.turnW;
        consider(head.x, head.y, head.d, dir, wt);
      }
    } else {
      var faces = roomBoundaryFaces(head, false);
      for (i = 0; i < faces.length; i++) {
        var f = faces[i];
        if (head.entry && f[0] === head.entry[0] && f[1] === head.entry[1] && f[2] === head.entry[2] && f[3] === OPP[head.entry[3]]) continue;
        var wt2 = f[3] === 5 ? (head.d + head.h - 1 >= B + 2 ? 0 : downWeight(P, target - (head.d + head.h - 1)) >> 1) : 10;
        consider(f[0], f[1], f[2], f[3], wt2);
      }
    }
    // Fallback: if every weight is zero but moves exist, allow them evenly.
    var tot = 0;
    for (i = 0; i < w.length; i++) tot += w[i];
    if (tot === 0) for (i = 0; i < w.length; i++) w[i] = 1;
    return { opts: opts, w: w };
  }

  function tryRoom(ctx, kind, R, x, y, d, m) {
    var sz = ROOM[kind], w = sz[0], l = sz[1], h = sz[2];
    for (var attempt = 0; attempt < 2; attempt++) {
      var x0, y0, d0;
      if (m === 5) { d0 = d; x0 = x - R.below(w); y0 = y - R.below(l); }
      else {
        d0 = kind === 'bottom' ? d : d - R.below(h); if (d0 < 0) d0 = 0;
        if (m === 1) { x0 = x; y0 = y - R.below(l); }
        else if (m === 3) { x0 = x - w + 1; y0 = y - R.below(l); }
        else if (m === 0) { y0 = y; x0 = x - R.below(w); }
        else { y0 = y - l + 1; x0 = x - R.below(w); }
      }
      var ok = true;
      for (var dd = 0; dd < h && ok; dd++) for (var yy = 0; yy < l && ok; yy++) for (var xx = 0; xx < w && ok; xx++) {
        if (!isFree(ctx, x0 + xx, y0 + yy, d0 + dd)) ok = false;
      }
      if (!ok) continue;
      var typeName = kind === 'bottom' ? 'chamber_large' : kind === 'entrance' ? 'chamber_small' : kind;
      var p = makePiece(ctx, typeName, x0, y0, d0, w, l, h);
      p.shape = 'room';
      p.inDir = m;
      p.entry = [x, y, d, m];
      if (kind === 'bottom') p.flags |= F_BOTTOM;
      p.cost = kind === 'bottom' ? COST.bottom : COST[typeName];
      return p;
    }
    return null;
  }

  function walkMain(ctx) {
    var P = ctx.P, R = ctx.rngL;
    ctx.budget = R.range(P.budget[0], P.budget[1]);
    ctx.bottomLayer = R.range(P.bottom[0], P.bottom[1]);
    var nLm = R.range(P.landmarks[0], P.landmarks[1]);
    var ent = makePiece(ctx, 'chamber_small', 0, 0, 0, 2, 2, 1);
    ent.shape = 'room'; ent.flags |= F_START; ent.cost = COST.entrance;
    var stack = [ent], tBefore = [0];
    var iter = 0, backtracks = 0;
    for (;;) {
      if (++iter > 8000 || backtracks > 600) return false;
      var top = stack.length - 1, head = stack[top];
      var headCostGuess = isRoom(head) ? head.cost : 15;
      var t = tBefore[top] + headCostGuess;
      var target = targetLayer(ctx, t + 60);
      var eo = exitOptions(ctx, stack, target);
      if (eo.opts.length === 0) {
        if (stack.length <= 1) return false;
        var dead = stack.pop(); tBefore.pop();
        removeLastPiece(ctx);
        var parent = stack[stack.length - 1];
        if (!parent.banned) parent.banned = [];
        parent.banned.push(key(parent.exit[0], parent.exit[1], parent.exit[2]) * 8 + parent.exit[3]);
        parent.exit = null;
        backtracks++;
        continue;
      }
      var o = eo.opts[R.weighted(eo.w)];
      head.exit = o; head.outDir = o[3];
      if (!isRoom(head)) head.cost = (head.inDir === 5 || o[3] === 5) ? COST.shaft_down : COST.straight;
      var tAfter = tBefore[top] + head.cost;
      var nx = o[0] + DX[o[3]], ny = o[1] + DY[o[3]], nd = o[2] + DD[o[3]], m = o[3];
      var placed = null;
      if (tAfter >= ctx.budget && nd >= ctx.bottomLayer) {
        placed = tryRoom(ctx, 'bottom', R, nx, ny, nd, m);
        if (placed) { stack.push(placed); tBefore.push(tAfter); break; }
      }
      if (!placed && stack.length > 2) {
        var lastRoomT = 0, lmCount = 0, lmZones = [0, 0, 0, 0, 0], i;
        for (i = stack.length - 1; i >= 1; i--) if (isRoom(stack[i])) { lastRoomT = tBefore[i]; break; }
        for (i = 1; i < stack.length; i++) if (stack[i].type === 'landmark') { lmCount++; lmZones[stack[i].zoneHint]++; }
        if (tAfter - lastRoomT >= P.roomGap) {
          var z = zoneOfDepthM(nd * CELL_M + 4);
          var wantLm = false;
          if (z >= 1 && lmCount < nLm && lmZones[z] === 0) {
            var zonesLeft = 5 - z;
            wantLm = (nLm - lmCount) >= zonesLeft ? true : R.chance(35);
          }
          if (wantLm) {
            placed = tryRoom(ctx, 'landmark', R, nx, ny, nd, m);
            if (placed) {
              var lz = zoneOfDepthM((2 * placed.d + placed.h) * (CELL_M >> 1));
              if (lmZones[lz] > 0) { removeLastPiece(ctx); placed = null; }
              else placed.zoneHint = lz;
            }
          }
          if (!placed && R.chance(P.roomPct)) {
            var large = R.chance(P.archetype === 'chain' || P.archetype === 'shaft' ? 50 : 35);
            placed = tryRoom(ctx, large ? 'chamber_large' : 'chamber_small', R, nx, ny, nd, m);
          }
        }
      }
      if (!placed) {
        placed = makePiece(ctx, 'cell', nx, ny, nd, 1, 1, 1);
        placed.inDir = m;
        placed.entry = [nx, ny, nd, m];
      }
      stack.push(placed); tBefore.push(tAfter);
    }
    // Landmark count must be inside the difficulty range.
    var lms = 0;
    for (var j = 0; j < stack.length; j++) if (stack[j].type === 'landmark') lms++;
    if (lms < P.landmarks[0] || lms > P.landmarks[1]) return false;
    ctx.main = [];
    for (j = 0; j < stack.length; j++) { stack[j].role = 'main'; stack[j].mainIndex = j; ctx.main.push(stack[j].id); }
    for (j = 0; j < stack.length - 1; j++) {
      var e = stack[j].exit;
      connect(ctx, stack[j], e[0], e[1], e[2], e[3]);
    }
    return true;
  }

  // ---------------------------------------------------------------- branches and loops
  function anchorFaces(ctx, p) {
    var out = [], dir;
    if (p.flags & (F_START | F_BOTTOM)) return out;
    if (!isRoom(p)) {
      if ((p.mask & 48) !== 0 || popcount4(p.mask & 15) >= 4 || popcount4(p.mask & 15) <= 1) return out;
      for (dir = 0; dir < 4; dir++) {
        if (p.mask & (1 << dir)) continue;
        if (isFree(ctx, p.x + DX[dir], p.y + DY[dir], p.d + DD[dir])) out.push([p.x, p.y, p.d, dir]);
      }
      return out;
    }
    var faces = roomBoundaryFaces(p, false);
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      if (f[3] >= 4) continue;
      if (isFree(ctx, f[0] + DX[f[3]], f[1] + DY[f[3]], f[2])) out.push(f);
    }
    return out;
  }

  // Binary min-heap on (f, order) for a deterministic A*.
  function Heap() { this.a = []; }
  Heap.prototype.less = function (i, j) { var A = this.a[i], B = this.a[j]; return A[0] < B[0] || (A[0] === B[0] && A[1] < B[1]); };
  Heap.prototype.push = function (item) {
    var a = this.a; a.push(item); var i = a.length - 1;
    while (i > 0) { var pnt = (i - 1) >> 1; if (this.less(i, pnt)) { var t = a[i]; a[i] = a[pnt]; a[pnt] = t; i = pnt; } else break; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length > 0) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, s = i;
        if (l < a.length && this.less(l, s)) s = l;
        if (r < a.length && this.less(r, s)) s = r;
        if (s === i) break;
        var t = a[i]; a[i] = a[s]; a[s] = t; i = s;
      }
    }
    return top;
  };

  function noise(x, y, d, salt) {
    return mix32((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(d, 83492791) ^ salt) >>> 0) % 9;
  }

  // Path of free cells from start to any goal cell. Returns array of [x,y,d] or null.
  function astar(ctx, s, goals, salt, maxLen, nodeLimit) {
    var gx = 0, gy = 0, gd = 0, n = goals.length, i;
    var goalSet = new Map();
    for (i = 0; i < n; i++) { goalSet.set(key(goals[i][0], goals[i][1], goals[i][2]), i); }
    function h(x, y, d) {
      var best = 1e9;
      for (var k = 0; k < n; k++) {
        var md = Math.abs(goals[k][0] - x) + Math.abs(goals[k][1] - y) + Math.abs(goals[k][2] - d);
        if (md < best) best = md;
      }
      return best * 10;
    }
    var heap = new Heap(), order = 0;
    var gScore = new Map(), parent = new Map(), steps = new Map();
    var sk = key(s[0], s[1], s[2]);
    gScore.set(sk, 0); steps.set(sk, 1);
    heap.push([h(s[0], s[1], s[2]), order++, s[0], s[1], s[2]]);
    var expanded = 0;
    while (heap.a.length) {
      var cur = heap.pop();
      var cx = cur[2], cy = cur[3], cd = cur[4], ck = key(cx, cy, cd);
      var g = gScore.get(ck);
      if (cur[0] - h(cx, cy, cd) > g) continue;
      if (goalSet.has(ck)) {
        var path = [], k2 = ck, px = cx, py = cy, pd = cd;
        path.push([px, py, pd]);
        while (parent.has(k2)) { var pr = parent.get(k2); path.push([pr[0], pr[1], pr[2]]); k2 = key(pr[0], pr[1], pr[2]); }
        path.reverse();
        return { path: path, goal: goalSet.get(ck) };
      }
      if (++expanded > nodeLimit) return null;
      var st = steps.get(ck);
      if (st >= maxLen) continue;
      for (var dir = 0; dir < 6; dir++) {
        var nx = cx + DX[dir], ny = cy + DY[dir], nd = cd + DD[dir];
        if (!isFree(ctx, nx, ny, nd)) continue;
        if (Math.abs(nx) > ctx.P.radius + 4 || Math.abs(ny) > ctx.P.radius + 4) continue;
        var nk = key(nx, ny, nd);
        var ng = g + 10 + noise(nx, ny, nd, salt) + (dir >= 4 ? 4 : 0);
        var old = gScore.get(nk);
        if (old !== undefined && old <= ng) continue;
        gScore.set(nk, ng); parent.set(nk, [cx, cy, cd]); steps.set(nk, st + 1);
        heap.push([ng + h(nx, ny, nd), order++, nx, ny, nd]);
      }
    }
    return null;
  }

  function newBranch(ctx, kind, from) {
    var b = { id: ctx.branches.length, kind: kind, from: from.id, to: -1, pieces: [], treasure: false, bypass: false };
    ctx.branches.push(b);
    return b;
  }

  function commitPath(ctx, b, role, anchor, aFace, path, endPiece, endFace) {
    // aFace: [x,y,d,dir] on anchor pointing into path[0]. endFace: face on path end pointing into endPiece.
    var cells = [], i, prevDir = aFace[3];
    for (i = 0; i < path.length; i++) {
      var c = path[i];
      var p = makePiece(ctx, 'cell', c[0], c[1], c[2], 1, 1, 1);
      p.role = role; p.branch = b.id; p.inDir = prevDir;
      b.pieces.push(p.id); cells.push(p);
      if (i + 1 < path.length) {
        var n = path[i + 1];
        for (var dir = 0; dir < 6; dir++) if (c[0] + DX[dir] === n[0] && c[1] + DY[dir] === n[1] && c[2] + DD[dir] === n[2]) { p.outDir = dir; prevDir = dir; break; }
      }
    }
    connect(ctx, anchor, aFace[0], aFace[1], aFace[2], aFace[3]);
    for (i = 0; i + 1 < cells.length; i++) connect(ctx, cells[i], cells[i].x, cells[i].y, cells[i].d, cells[i].outDir);
    if (endPiece) {
      var last = cells[cells.length - 1];
      last.outDir = endFace[3];
      connect(ctx, last, last.x, last.y, last.d, endFace[3]);
    }
    return cells;
  }

  function tryLoop(ctx, opt) {
    var R = ctx.rngB, P = ctx.P, main = ctx.main, n = main.length;
    var aIdx, ai, cand = [];
    for (ai = 2; ai < n - 6; ai++) {
      var pa = ctx.pieces[main[ai]];
      if (opt.aZoneMin !== undefined && (pa.zone < opt.aZoneMin || pa.zone > opt.aZoneMax)) continue;
      if (anchorFaces(ctx, pa).length) cand.push(ai);
    }
    if (!cand.length) return false;
    aIdx = cand[R.below(cand.length)];
    var A = ctx.pieces[main[aIdx]];
    var aFaces = anchorFaces(ctx, A);
    var aFace = aFaces[R.below(aFaces.length)];
    var s = [aFace[0] + DX[aFace[3]], aFace[1] + DY[aFace[3]], aFace[2]];
    var tcand = [];
    var lo = aIdx + (opt.minSpan || 5), hi = Math.min(n - 2, aIdx + (opt.maxSpan || 28));
    for (var j = lo; j <= hi; j++) {
      var pb = ctx.pieces[main[j]];
      if (opt.bZoneMin !== undefined && pb.zone < opt.bZoneMin) continue;
      if (opt.bZoneMax !== undefined && pb.zone > opt.bZoneMax) continue;
      if (anchorFaces(ctx, pb).length) tcand.push(j);
    }
    if (!tcand.length) return false;
    var bIdx = tcand[R.below(tcand.length)];
    var Bp = ctx.pieces[main[bIdx]];
    var bFaces = anchorFaces(ctx, Bp), goals = [];
    for (var k = 0; k < bFaces.length; k++) {
      var f = bFaces[k];
      var gxy = [f[0] + DX[f[3]], f[1] + DY[f[3]], f[2], OPP[f[3]]];
      var md = Math.abs(gxy[0] - s[0]) + Math.abs(gxy[1] - s[1]) + Math.abs(gxy[2] - s[2]);
      if (md >= 3) goals.push(gxy);
    }
    if (!goals.length) return false;
    // Do not let the search pass through the start cell's anchor side; s must stay free.
    var res = astar(ctx, s, goals, R.next(), opt.maxLen || 36, opt.nodeLimit || 6000);
    if (!res || res.path.length < 4) return false;
    var goal = goals[res.goal];
    var b = newBranch(ctx, 'loop', A);
    b.to = Bp.id;
    var last = res.path[res.path.length - 1];
    commitPath(ctx, b, 'loop', A, aFace, res.path, Bp, [last[0], last[1], last[2], goal[3]]);
    b.fromMain = aIdx; b.toMain = bIdx;
    return b;
  }

  function tryDeadEnd(ctx) {
    var R = ctx.rngB, P = ctx.P, i;
    var pool = [];
    var useSub = ctx.pieces.length > ctx.main.length && R.chance(20);
    if (useSub) { for (i = 0; i < ctx.pieces.length; i++) if (ctx.pieces[i].role !== 'main' && anchorFaces(ctx, ctx.pieces[i]).length) pool.push(i); }
    if (!pool.length) for (i = 2; i < ctx.main.length - 2; i++) if (anchorFaces(ctx, ctx.pieces[ctx.main[i]]).length) pool.push(ctx.main[i]);
    if (!pool.length) return false;
    var A = ctx.pieces[pool[R.below(pool.length)]];
    var faces = anchorFaces(ctx, A);
    var aFace = faces[R.below(faces.length)];
    var len = R.range(Math.max(2, P.brLen[0] + P.brLenAdj), Math.max(3, P.brLen[1] + P.brLenAdj));
    var path = [], occTemp = [];
    var cx = aFace[0] + DX[aFace[3]], cy = aFace[1] + DY[aFace[3]], cd = aFace[2], m = aFace[3];
    var moves = [];
    function freeT(x, y, d) {
      if (!isFree(ctx, x, y, d)) return false;
      for (var q = 0; q < path.length; q++) if (path[q][0] === x && path[q][1] === y && path[q][2] === d) return false;
      return true;
    }
    path.push([cx, cy, cd]); moves.push(m);
    var vrun = 0;
    while (path.length < len) {
      var dirs = [], w = [];
      if (m < 4) { dirs.push(m, (m + 3) & 3, (m + 1) & 3, 5, 4); w.push(50, 25, 25, 20, 4); }
      else { dirs.push(m, 0, 1, 2, 3); w.push(m === 5 ? 30 : 15, 25, 25, 25, 25); }
      for (var q = 0; q < dirs.length; q++) {
        var dd = dirs[q];
        if (dd >= 4 && vrun >= 3) w[q] = 0;
        if (m >= 4 && dd === OPP[m]) w[q] = 0;
        if (!freeT(cx + DX[dd], cy + DY[dd], cd + DD[dd])) w[q] = 0;
      }
      var pick = R.weighted(w);
      if (pick < 0) break;
      var dir = dirs[pick];
      cx += DX[dir]; cy += DY[dir]; cd += DD[dir];
      path.push([cx, cy, cd]); moves.push(dir);
      vrun = dir >= 4 ? vrun + 1 : 0;
      m = dir;
    }
    // The cap must be entered horizontally (dead-end kit pieces are horizontal caps).
    while (path.length > 1 && moves[moves.length - 1] >= 4) { path.pop(); moves.pop(); }
    if (path.length < 2 || moves[moves.length - 1] >= 4) return false;
    var b = newBranch(ctx, 'dead_end', A);
    var cells = commitPath(ctx, b, 'branch', A, aFace, path, null, null);
    var endCell = cells[cells.length - 1];
    if (R.chance(P.treasurePct)) { endCell.flags |= F_TREASURE; b.treasure = true; }
    return b;
  }

  function buildBranches(ctx) {
    var P = ctx.P, R = ctx.rngB;
    assignZones(ctx);
    var nLoops = R.range(P.loops[0], P.loops[1]);
    var nBranches = R.range(Math.max(P.branches[0], nLoops + 1), P.branches[1]);
    var loops = 0, tries = 0, b;
    if (P.collapse) {
      for (tries = 0; tries < 12 && !b; tries++) b = tryLoop(ctx, { aZoneMin: 2, aZoneMax: 2, bZoneMin: 2, bZoneMax: 3, minSpan: 4, maxSpan: 20 });
      if (!b) return false;
      b.bypass = true;
      ctx.pieces[ctx.main[b.fromMain + 1]].flags |= F_COLLAPSE;
      loops++;
    }
    if (P.archetype === 'split' && loops < nLoops) {
      b = null;
      for (tries = 0; tries < 4 && !b; tries++) b = tryLoop(ctx, { aZoneMin: 1, aZoneMax: 1, bZoneMin: 3, minSpan: 8, maxSpan: 200, maxLen: 80, nodeLimit: 40000 });
      if (b) { b.split = true; loops++; }
    }
    for (tries = 0; loops < nLoops && tries < nLoops * 10; tries++) if (tryLoop(ctx, {})) loops++;
    if (loops < P.loops[0]) return false;
    var dead = 0, need = nBranches - loops;
    if (need < 1) need = 1;
    for (tries = 0; dead < need && tries < need * 8; tries++) if (tryDeadEnd(ctx)) dead++;
    if (loops + dead < P.branches[0] || loops + dead > P.branches[1] || dead < 1) return false;
    return true;
  }

  // ---------------------------------------------------------------- types, features, air
  function assignZones(ctx) {
    for (var i = 0; i < ctx.pieces.length; i++) {
      var p = ctx.pieces[i];
      p.zone = zoneOfDepthM((2 * p.d + p.h) * (CELL_M >> 1));
    }
  }

  function assignTypes(ctx) {
    var R = ctx.rngF;
    for (var i = 0; i < ctx.pieces.length; i++) {
      var p = ctx.pieces[i];
      if (p.shape === 'room') { p.rot = R.below(4); continue; }
      var shape = shapeOfMask(p.mask);
      if (!shape) throw new Error('invalid shape mask ' + p.mask + ' on piece ' + p.id);
      p.shape = shape;
      var vertDown = p.inDir === 5 || p.outDir === 5;
      var vertUp = p.inDir === 4 || p.outDir === 4;
      if (shape === 'cap') p.type = 'dead_end';
      else if (shape === 'straight') p.type = 'straight';
      else if (shape === 'bend') p.type = 'bend';
      else if (shape === 'tee') p.type = 'junction_t';
      else if (shape === 'cross') p.type = 'junction_x';
      else p.type = (vertUp && !vertDown) ? 'shaft_up' : 'shaft_down';
      var rots = [];
      for (var r = 0; r < 4; r++) if (rotMask(CANON[shape], r) === p.mask) rots.push(r);
      p.rot = rots[R.below(rots.length)];
    }
  }

  function neighbourIds(ctx) {
    var nb = [];
    for (var i = 0; i < ctx.pieces.length; i++) nb.push([]);
    for (var e = 0; e < ctx.edges.length; e++) { nb[ctx.edges[e][0]].push(ctx.edges[e][1]); nb[ctx.edges[e][1]].push(ctx.edges[e][0]); }
    return nb;
  }

  function isPlain(p) { return p.type === 'straight' || p.type === 'bend'; }
  // Air pockets need a ceiling dome over a horizontal passage: straight, bend, or the top elbow of a shaft.
  function airCandidate(p) {
    if (p.flags & (F_START | F_BOTTOM)) return false;
    if (p.shape === 'straight' || p.shape === 'bend') return p.type === 'straight' || p.type === 'bend' || p.type === 'current' || p.type === 'silt_floor';
    return p.shape === 'v_bot_h' && p.type === 'shaft_down';
  }

  function assignFeatures(ctx) {
    var P = ctx.P, R = ctx.rngF, pieces = ctx.pieces, nb = neighbourIds(ctx), i, j;
    function nearSpecial(p) {
      for (var k = 0; k < nb[p.id].length; k++) { var q = pieces[nb[p.id][k]]; if (q.flags & (F_START | F_BOTTOM)) return true; }
      return false;
    }
    function squeezeOk(p) {
      if (!isPlain(p) || nearSpecial(p)) return false;
      for (var k = 0; k < nb[p.id].length; k++) if (pieces[nb[p.id][k]].type === 'squeeze') return false;
      return true;
    }
    // Paths in traversal order: main path, then each branch.
    var paths = [ctx.main];
    for (i = 0; i < ctx.branches.length; i++) paths.push(ctx.branches[i].pieces);
    // Chain archetype: squeeze right before each main-path room.
    if (P.archetype === 'chain') {
      for (i = 2; i < ctx.main.length - 1; i++) {
        var rp = pieces[ctx.main[i]];
        if (rp.shape === 'room' && !(rp.flags & F_BOTTOM)) { var pr = pieces[ctx.main[i - 1]]; if (squeezeOk(pr)) pr.type = 'squeeze'; }
      }
    }
    for (i = 0; i < paths.length; i++) {
      var path = paths[i];
      for (j = 0; j < path.length; j++) { var p = pieces[path[j]]; if (squeezeOk(p) && R.chance(P.sqPct)) p.type = 'squeeze'; }
    }
    // Currents and silt come in short runs along a path.
    function runs(typeName, pctFn, minRun, maxRun) {
      for (var a = 0; a < paths.length; a++) {
        var path = paths[a];
        for (var b = 0; b < path.length; b++) {
          var p = pieces[path[b]];
          if (!isPlain(p) || nearSpecial(p)) continue;
          if (!R.chance(pctFn(p))) continue;
          var len = R.range(minRun, maxRun);
          for (var c = b; c < path.length && c < b + len; c++) {
            var q = pieces[path[c]];
            if (!isPlain(q) || nearSpecial(q)) break;
            q.type = typeName;
          }
          b += len;
        }
      }
    }
    var SILT_ZONE = [30, 140, 110, 80, 100];
    runs('current', function () { return Math.min(40, P.curPct * P.curMul); }, 2, 4);
    runs('silt_floor', function (p) { return Math.min(40, (P.siltPct * P.siltMul * SILT_ZONE[p.zone] / 100) | 0); }, 1, 3);
    // Dry chambers (breathable). Never the bottom.
    for (i = 0; i < pieces.length; i++) {
      var pc = pieces[i];
      if ((pc.type === 'chamber_small' || pc.type === 'chamber_large') && !(pc.flags & (F_START | F_BOTTOM)) && R.chance(35)) pc.flags |= F_DRY;
    }
    // A few bonus air pockets in branches and loops.
    for (i = 1; i < paths.length; i++) for (j = 0; j < paths[i].length; j++) { var bp = pieces[paths[i][j]]; if (isPlain(bp) && R.chance(6)) bp.type = 'air_pocket'; }
  }

  function costOf(p) {
    if (p.flags & F_START) return COST.entrance;
    if (p.flags & F_BOTTOM) return COST.bottom;
    return COST[p.type] + (p.type === 'air_pocket' ? AIR_REST : 0);
  }
  function gapCostOf(p) { return p.type === 'air_pocket' ? COST.air_pocket : costOf(p); }
  function isAirSource(p) { return (p.flags & (F_START | F_DRY)) !== 0 || p.type === 'air_pocket'; }

  // Greedy: convert the latest suitable main-path piece so the time between air sources never exceeds maxGap.
  function placeAirPockets(ctx) {
    var P = ctx.P, R = ctx.rngF, pieces = ctx.pieces, main = ctx.main;
    var G = P.maxGap;
    var lastAir = 0;
    for (var guard = 0; guard < 400; guard++) {
      var t = 0, violated = -1, i;
      for (i = lastAir + 1; i < main.length; i++) {
        t += gapCostOf(pieces[main[i - 1]]);
        if (t > G) { violated = i; break; }
        if (isAirSource(pieces[main[i]])) { lastAir = i; t = -1; break; }
      }
      if (t === -1) continue;
      if (violated < 0) return true;
      // Candidates between lastAir and violated whose arrival time is <= G.
      var cands = [], ta = 0;
      for (i = lastAir + 1; i < violated; i++) {
        ta += gapCostOf(pieces[main[i - 1]]);
        var q = pieces[main[i]];
        if (ta <= G && airCandidate(q)) cands.push(i);
      }
      if (!cands.length) {
        // Fallback: make the latest chamber or landmark in the window a dry (breathable) room.
        var rooms = [];
        ta = 0;
        for (i = lastAir + 1; i < violated; i++) {
          ta += gapCostOf(pieces[main[i - 1]]);
          var rq = pieces[main[i]];
          if (ta <= G && rq.shape === 'room' && !(rq.flags & (F_START | F_BOTTOM))) rooms.push(i);
        }
        if (!rooms.length) return false;
        lastAir = rooms[rooms.length - 1];
        pieces[main[lastAir]].flags |= F_DRY;
        continue;
      }
      // Prefer plain pieces, then the latest ones.
      var plain = [];
      for (i = 0; i < cands.length; i++) { var cq = pieces[main[cands[i]]]; if (isPlain(cq) || cq.shape === 'v_bot_h') plain.push(cands[i]); }
      var use = plain.length ? plain : cands;
      var k = use.length >= 2 ? use[use.length - 1 - R.below(2)] : use[use.length - 1];
      pieces[main[k]].type = 'air_pocket';
      lastAir = k;
    }
    return false;
  }

  function finalise(ctx) {
    var R = ctx.rngF, pieces = ctx.pieces, i;
    var usedLm = [];
    for (i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      if (p.type === 'landmark') {
        var id;
        do { id = R.below(KIT_VARIANTS.landmark); } while (usedLm.indexOf(id) >= 0);
        usedLm.push(id); p.landmarkId = id; p.variant = id;
      } else p.variant = R.below(KIT_VARIANTS[p.type]);
      p.cost = costOf(p);
    }
  }

  // ---------------------------------------------------------------- stats and checksum
  function ropeMetres(p) {
    if (p.shape !== 'room') return CELL_M;
    var a = p.entry, b = p.exit;
    if (!a) a = [p.x, p.y, p.d];
    if (!b) b = [p.x + (p.w >> 1), p.y + (p.l >> 1), p.d + p.h - 1];
    return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + 1) * CELL_M;
  }

  function computeStats(ctx) {
    var P = ctx.P, pieces = ctx.pieces, main = ctx.main, i, j;
    var mainSec = 0, rope = 0;
    for (i = 0; i < main.length; i++) { mainSec += pieces[main[i]].cost; rope += ropeMetres(pieces[main[i]]); }
    var exploreSec = 0, nLoops = 0, nDead = 0, treasure = 0;
    for (i = 0; i < ctx.branches.length; i++) {
      var b = ctx.branches[i], bs = 0;
      for (j = 0; j < b.pieces.length; j++) bs += pieces[b.pieces[j]].cost;
      b.seconds = bs;
      if (b.kind === 'loop') { nLoops++; exploreSec += (bs * LOOP_PCT / 100) | 0; }
      else { nDead++; exploreSec += (2 * bs * EXPLORE_PCT / 100) | 0; if (b.treasure) treasure++; }
    }
    // Air gaps along the main path.
    var gaps = [], t = 0, airMain = 0;
    for (i = 1; i < main.length; i++) {
      t += gapCostOf(pieces[main[i - 1]]);
      if (isAirSource(pieces[main[i]]) || i === main.length - 1) { gaps.push(t); t = 0; }
      if (pieces[main[i]].type === 'air_pocket') airMain++;
    }
    var airAll = 0, sq = 0, lm = 0, chambers = 0, dry = 0, counts = {};
    for (i = 0; i < TYPES.length; i++) counts[TYPES[i]] = 0;
    for (i = 0; i < pieces.length; i++) {
      var p = pieces[i]; counts[p.type]++;
      if (p.type === 'air_pocket') airAll++;
      if (p.type === 'squeeze') sq++;
      if (p.type === 'landmark') lm++;
      if (p.type === 'chamber_small' || p.type === 'chamber_large') chambers++;
      if (p.flags & F_DRY) dry++;
    }
    var zoneSec = [0, 0, 0, 0, 0];
    for (i = 0; i < main.length; i++) zoneSec[pieces[main[i]].zone] += pieces[main[i]].cost;
    var maxGap = 0;
    for (i = 0; i < gaps.length; i++) if (gaps[i] > maxGap) maxGap = gaps[i];
    var cells = 0;
    for (i = 0; i < pieces.length; i++) cells += pieces[i].w * pieces[i].l * pieces[i].h;
    var bottom = pieces[main[main.length - 1]];
    return {
      swimSeconds: mainSec + exploreSec, swimMinutes: Math.round((mainSec + exploreSec) / 6) / 10,
      mainPathSeconds: mainSec, exploreSeconds: exploreSec,
      ropeMetres: rope, mainPathPieces: main.length,
      branches: ctx.branches.length, deadEnds: nDead, loops: nLoops, treasureDeadEnds: treasure,
      airPockets: airAll, airPocketsMain: airMain, dryChambers: dry, maxAirGapSeconds: maxGap, airGapsSeconds: gaps,
      squeezes: sq, landmarks: lm, chambers: chambers, pieces: pieces.length, cells: cells,
      bottomDepthM: bottom.d * CELL_M, zoneSeconds: zoneSec, typeCounts: counts
    };
  }

  function fnv1aWords(words) {
    var h = 0x811C9DC5;
    for (var i = 0; i < words.length; i++) {
      var w = words[i] >>> 0;
      for (var b = 0; b < 4; b++) {
        h ^= (w >>> (8 * b)) & 255;
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
    return h >>> 0;
  }
  function checksumWords(out) {
    var w = [GEN_VERSION, out.seed, DIFFS.indexOf(out.difficulty), ARCHETYPES.indexOf(out.archetype), out.pieces.length];
    for (var i = 0; i < out.pieces.length; i++) {
      var p = out.pieces[i];
      w.push(TYPES.indexOf(p.type), SHAPES.indexOf(p.shape), p.x, p.y, p.d, p.w, p.l, p.h, p.rot, p.variant, p.zone,
        ROLES.indexOf(p.role), p.branch + 1, p.flags, p.sockets.length);
      for (var s = 0; s < p.sockets.length; s++) w.push(p.sockets[s][0], p.sockets[s][1], p.sockets[s][2], p.sockets[s][3]);
    }
    w.push(out.edges.length);
    for (i = 0; i < out.edges.length; i++) w.push(out.edges[i][0], out.edges[i][1]);
    w.push(out.mainPath.length);
    for (i = 0; i < out.mainPath.length; i++) w.push(out.mainPath[i]);
    return w;
  }

  // ---------------------------------------------------------------- entry point
  function tryGenerate(seed, P, rngL, rngB, rngF) {
    var ctx = { seed: seed, P: P, rngL: rngL, rngB: rngB, rngF: rngF, occ: new Map(), pieces: [], edges: [], branches: [], main: [] };
    P.radius = 34;
    if (!walkMain(ctx)) return { ok: false, why: 'main' };
    if (!buildBranches(ctx)) return { ok: false, why: 'branches' };
    assignZones(ctx);
    assignTypes(ctx);
    assignFeatures(ctx);
    if (!placeAirPockets(ctx)) return { ok: false, why: 'air' };
    finalise(ctx);
    var stats = computeStats(ctx);
    if (stats.swimMinutes < P.band[0] || stats.swimMinutes > P.band[1]) return { ok: false, why: 'band', minutes: stats.swimMinutes };
    return { ok: true, ctx: ctx, stats: stats };
  }

  function generate(seed, options) {
    seed = seed >>> 0;
    options = options || {};
    var difficulty = DIFF[options.difficulty] ? options.difficulty : 'standard';
    var mods = normalizeMods(options.modifiers);
    var meta = new Rng(seed, 0);
    var archetype = ARCHETYPES.indexOf(options.archetype) >= 0 ? options.archetype : ARCHETYPES[meta.weighted(ARCH_W)];
    var P = buildParams(difficulty, archetype, mods);
    var rngL = new Rng(seed, 1), rngB = new Rng(seed, 2), rngF = new Rng(seed, 3);
    var res = null, attempts = 0, fails = {};
    for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
      res = tryGenerate(seed, P, rngL, rngB, rngF);
      if (res.ok) break;
      fails[res.why] = (fails[res.why] || 0) + 1;
    }
    if (!res.ok) return { version: GEN_VERSION, seed: seed, difficulty: difficulty, archetype: archetype, modifiers: mods, ok: false, attempts: MAX_ATTEMPTS, failures: fails };
    var ctx = res.ctx;
    var pieces = [];
    for (var i = 0; i < ctx.pieces.length; i++) {
      var p = ctx.pieces[i];
      var o = {
        id: p.id, type: p.type, shape: p.shape, x: p.x, y: p.y, d: p.d, w: p.w, l: p.l, h: p.h,
        rot: p.rot, variant: p.variant, zone: p.zone, role: p.role, branch: p.branch, flags: p.flags,
        sockets: p.sockets.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]; }),
        cost: p.cost
      };
      if (p.shape !== 'room') o.mask = p.mask;
      if (p.landmarkId >= 0) o.landmarkId = p.landmarkId;
      if (p.flags & F_START) o.start = true;
      if (p.flags & F_BOTTOM) o.bottom = true;
      if (p.flags & F_TREASURE) o.treasure = true;
      if (p.flags & F_DRY) o.dry = true;
      if (p.flags & F_COLLAPSE) o.collapse = true;
      pieces.push(o);
    }
    var branches = [], loops = [];
    for (i = 0; i < ctx.branches.length; i++) {
      var b = ctx.branches[i];
      var ob = { id: b.id, kind: b.kind, from: b.from, to: b.to, pieces: b.pieces.slice(), treasure: b.treasure, seconds: b.seconds };
      if (b.bypass) ob.bypass = true;
      if (b.split) ob.split = true;
      branches.push(ob);
      if (b.kind === 'loop') loops.push(b.id);
    }
    var out = {
      version: GEN_VERSION, ok: true, seed: seed, difficulty: difficulty, archetype: archetype, modifiers: mods,
      cellSizeM: CELL_M, bottomLayer: ctx.bottomLayer, budgetSeconds: ctx.budget, attempts: attempts,
      pieces: pieces, edges: ctx.edges.map(function (e) { return e.slice(); }),
      mainPath: ctx.main.slice(), branches: branches, loops: loops,
      estimatedSwimMinutes: res.stats.swimMinutes, ropeLengthM: res.stats.ropeMetres,
      stats: res.stats
    };
    out.checksum = fnv1aWords(checksumWords(out));
    out.checksumHex = ('00000000' + out.checksum.toString(16)).slice(-8);
    return out;
  }

  var api = {
    generate: generate, Rng: Rng, mix32: mix32, fnv1aWords: fnv1aWords, checksumWords: checksumWords,
    shapeOfMask: shapeOfMask, rotMask: rotMask, rulesFor: rulesFor, zoneOfDepthM: zoneOfDepthM,
    costOf: function (p) { return COST[p.start ? 'entrance' : p.bottom ? 'bottom' : p.type] + (p.type === 'air_pocket' ? AIR_REST : 0); },
    gapCostOf: function (p) { return COST[p.start ? 'entrance' : p.bottom ? 'bottom' : p.type]; },
    constants: {
      GEN_VERSION: GEN_VERSION, CELL_M: CELL_M, ZONE_NAMES: ZONE_NAMES, ZONE_TOP_M: ZONE_TOP_M, ZONE_LAYER: ZONE_LAYER,
      TYPES: TYPES, SHAPES: SHAPES, ROLES: ROLES, ARCHETYPES: ARCHETYPES, ARCH_W: ARCH_W, CANON: CANON, ROOM: ROOM,
      COST: COST, AIR_REST: AIR_REST, EXPLORE_PCT: EXPLORE_PCT, LOOP_PCT: LOOP_PCT, KIT_VARIANTS: KIT_VARIANTS,
      LANDMARK_NAMES: LANDMARK_NAMES, DIFF: DIFF, LAYOUT_MODS: LAYOUT_MODS, DX: DX, DY: DY, DD: DD, OPP: OPP,
      BOUND_XY: BOUND_XY, MAX_D: MAX_D, MAX_ATTEMPTS: MAX_ATTEMPTS
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CaveGen = api;
})(this);

/* ------------------------------------------------------------------ */
/* Game wrapper: TU.gen                                                */
/* ------------------------------------------------------------------ */
(function () {
  'use strict';
  var TU = window.TU = window.TU || {};
  var G = window.CaveGen;
  var CELL = G.constants.CELL_M;
  TU.gen = {
    api: G,
    constants: G.constants,
    // generate(seed, { difficulty: 'easy'|'standard'|'hard', archetype?, modifiers?: [] }) -> layout (see CONTRACT.md)
    generate: function (seed, opts) { return G.generate(seed >>> 0, opts || {}); },
    // Grid to world (meters, Y up). Grid x = east = world +X, grid y = north = world -Z,
    // grid d = depth layer: cell d spans world y from -d*8 down to -(d+1)*8.
    cellMin: function (x, y, d) { return { x: x * CELL, y: -(d + 1) * CELL, z: -(y + 1) * CELL }; },
    cellCenter: function (x, y, d) { return { x: (x + 0.5) * CELL, y: -(d + 0.5) * CELL, z: -(y + 0.5) * CELL }; },
    // Direction index (0 N, 1 E, 2 S, 3 W, 4 UP, 5 DOWN) to a world unit vector.
    dirVector: function (dir) { return [{ x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }][dir]; }
  };
})();
