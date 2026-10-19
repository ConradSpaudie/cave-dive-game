/*
 * creatures-models.js: procedural 3D models for every species (no image or model files).
 *
 * Each builder returns a "model":
 *   { body: Kit (opaque parts), fin: Kit (translucent parts), bodyMat: {...}, finMat: {...},
 *     halos: [[x, y, z, size, alpha]] (glow sprites in model space), lure: [x, y, z] (bright light spot),
 *     up: 'surface' for things that sit on rock (their +Y follows the rock normal) }
 * Model space: forward +Z, up +Y, body length 1 (z -0.5 tail to +0.5 nose). Plants grow up +Y.
 * creatures.js scales each instance to the creature's real size in meters.
 *
 * The animation weights (aA, aB, see creatures-lib.js) are set per piece:
 *   wave  = how much the piece follows the swimming body wave (1 for anything attached to the body)
 *   flut  = flutter amount and direction (fins, antennae, gills, threads)
 *   leg   = leg swing weight and phase (crawlers), jaw weight (fish), bell weight (jellyfish)
 *   glow  = emissive mask for bioluminescent spots
 *
 * Owner: agent B.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, L = TU._cr = TU._cr || {};
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };
  var PI = Math.PI;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Animation attribute helpers.
  function A(wave, flut, leg, ph) { return [wave, flut || 0, leg || 0, ph || 0]; }
  function B(dx, dy, dz, glow) { return [dx || 0, dy || 0, dz || 0, glow || 0]; }
  var STILL = A(1, 0, 0, 0), NOB = B(0, 0, 0, 0);

  /* ------------------------------------------------------------------ */
  /* Shared fish parts                                                   */
  /* ------------------------------------------------------------------ */
  // Standard fish outline radius: u 0 = tail tip, 1 = nose. R = max radius, peak = where it is fattest.
  function fishR(R, peak, ped, nose) {
    ped = ped == null ? 0.16 : ped; nose = nose == null ? 0.55 : nose;
    return function (u) {
      if (u < 0.03) return R * ped * (u / 0.03) * 0.9 + R * 0.02;
      var a = u < peak ? Math.pow((u - 0.03) / (peak - 0.03), 1.1) : 1;
      var body = u < peak ? (ped + (1 - ped) * Math.sin(a * PI / 2)) : Math.pow(Math.max(0, 1 - Math.pow((u - peak) / (1 - peak), 2.2)), nose);
      return R * Math.max(body, 0.002);
    };
  }

  // A complete fish body with eyes, mouth, gills and fins. o = options (see species below).
  function fish(o) {
    var body = new L.Kit(), finK = new L.Kit(), r = o.r, w = o.w || function () { return 0.6; }, h = o.h || function () { return 1; }, yo = o.y || function () { return 0; };
    var cBack = L.lin(o.back), cBelly = L.lin(o.belly), cSide = L.lin(o.side || o.belly), cGill = L.lin(o.gill || o.belly);
    var top = function (u) { return yo(u) + r(u) * h(u); }, bot = function (u) { return yo(u) - r(u) * h(u); };
    var uOf = function (z) { return clamp(z + 0.5, 0, 1); };
    var mott = o.mottle || 0, scale = o.scales == null ? 0.05 : o.scales;
    var g = L.spine({ rings: o.rings || 40, segs: o.segs || 22, r: r, w: w, h: h, y: yo, sq: o.sq, flatBelly: o.flatBelly });
    body.add(g, {
      col: function (p, n, uv) {
        var u = uv[1], ang = uv[0] * PI * 2, sy = Math.sin(ang);
        var c = L.mixC(cBelly, cSide, L.sstep(-0.7, -0.05, sy)).lerp(cBack, L.sstep(0.0, 0.85, sy));
        // gill slit band behind the head
        if (o.gill && Math.abs(u - (o.gillU || 0.76)) < 0.012 && sy < 0.5 && sy > -0.8) c = L.mixC(c, cGill, 0.8);
        // lateral line
        if (o.lateral && Math.abs(sy) < 0.05 && u > 0.12 && u < 0.78) c = L.mixC(c, L.lin(o.lateral), 0.55);
        // scales: tiny lattice brightness changes
        var s = Math.sin(u * 160) * Math.sin(ang * 26 + u * 80); c.multiplyScalar(1 + scale * s);
        if (mott) { var nz = L.vnoise(p.x * o.mottF, p.y * o.mottF, p.z * o.mottF); var mt = o.mottT || 0.25; c = L.mixC(c, L.lin(o.mottC), mott * L.sstep(mt - 0.12, mt + 0.12, nz)); }
        if (o.colFn) c = o.colFn(c, p, u, sy);
        return c;
      },
      a: function (p) { return [1, 0, 0, 0]; },
      b: function (p, uv) { return o.glowFn ? [0, 0, 0, o.glowFn(p, uv[1], Math.sin(uv[0] * PI * 2))] : NOB; }
    });
    // eyes
    if (o.eye) {
      var eu = o.eye.u, ez = eu - 0.5, ey = yo(eu) + r(eu) * h(eu) * (o.eye.y == null ? 0.35 : o.eye.y), ex = r(eu) * w(eu) * (o.eye.x == null ? 0.82 : o.eye.x), er = o.eye.r;
      for (var s = -1; s <= 1; s += 2) {
        if (o.eye.type === 'eye') {
          body.add(L.blob(14, 10), { m: L.mat(V(s * ex, ey, ez), er * 0.55, er, er), col: L.lin(o.eye.ring || 0xb8b8a8) });
          body.add(L.blob(12, 8), { m: L.mat(V(s * (ex + er * 0.42), ey, ez), er * 0.3, er * 0.72, er * 0.72), col: L.lin(o.eye.pupil || 0x050505) });
        } else if (o.eye.type === 'bump') {
          body.add(L.blob(10, 8), { m: L.mat(V(s * ex * 0.97, ey, ez), er * 0.35, er * 0.8, er), col: L.mixC(cBack, L.lin(0xffffff), 0.15) });
        } else if (o.eye.type === 'milk') {
          body.add(L.blob(12, 8), { m: L.mat(V(s * ex * 0.98, ey, ez), er * 0.4, er * 0.85, er), col: L.lin(o.eye.ring || 0xcfd8dc) });
        }
      }
    }
    // mouth: a dark slit across the nose
    if (o.mouth !== false) {
      var mu = o.mouthU || 0.975, mz = mu - 0.5, my = yo(mu) + r(mu) * h(mu) * (o.mouthY == null ? -0.15 : o.mouthY);
      body.add(L.blob(10, 6), { m: L.mat(V(0, my, mz), r(mu) * w(mu) * 1.05, r(0.97) * 0.18 + 0.002, 0.012, o.mouthTilt || 0.25, 0, 0), col: L.lin(o.mouthC || 0x3a2626) });
    }
    // fins
    (o.fins || []).forEach(function (f) { addFin(f); });
    function addFin(f) {
      var cf = L.lin(f.col || o.finCol || o.belly), ce = L.lin(f.edge || f.col || o.finCol || o.belly), rays = f.rays == null ? 0.18 : f.rays;
      var colF = function (p, n, uv) { var c = L.mixC(cf, ce, L.sstep(0.55, 1, uv[1])); var ray = Math.abs(Math.sin(uv[0] * PI * (f.nRays || 9))); return c.multiplyScalar(1 - rays + rays * 2 * Math.pow(ray, 6) + 0.12 * uv[1]); };
      var g, z0, z1, fl = f.flut == null ? 0.8 : f.flut;
      if (f.t === 'caudal') {
        z0 = -0.5 + (f.at || 0.035); var ty = yo(0.035), hh = f.h || 0.2, ln = f.l || 0.2, fork = f.fork == null ? 0.45 : f.fork;
        var outl = L.outline(15, function (t) {
          var ang = (t - 0.5) * 2; // -1 bottom .. 1 top
          var lobe = f.shape === 'round' ? (1 - 0.25 * ang * ang) : f.shape === 'hetero' ? (1 - fork * Math.exp(-Math.pow((ang - 0.15) / 0.28, 2)) + (ang > 0 ? 0.55 * ang : 0)) : (1 - fork * Math.exp(-ang * ang / 0.12));
          var a = ln * lobe, b = ang * hh * (f.shape === 'hetero' && ang > 0 ? 1.25 : 1);
          return [a, b];
        });
        g = L.fin([0, -hh * 0.3], [0, hh * 0.3], outl.slice().reverse().reverse(), function (a, b) { return V(0, ty + b, z0 - a); }, 5);
        finK.add(g, { col: colF, a: function (p, uv) { return [1, fl * uv[1], 0, 0]; }, b: function () { return [1, 0, 0, 0]; } });
        return;
      }
      if (f.t === 'dorsal' || f.t === 'anal') {
        var up = f.t === 'dorsal' ? 1 : -1, u0 = f.u0, u1 = f.u1, hgt = f.h;
        var edge = f.top || function (t) { return Math.sin(PI * Math.pow(t, 0.7)); };
        var outl2 = L.outline(f.n || 9, function (t) { var u = u0 + (u1 - u0) * t; return [u, (up > 0 ? top(u) : bot(u)) + up * hgt * edge(t) + up * 0.0]; });
        var base0 = [u0, up > 0 ? top(u0) - 0.004 : bot(u0) + 0.004], base1 = [u1, up > 0 ? top(u1) - 0.004 : bot(u1) + 0.004];
        g = L.fin(base0, base1, outl2, function (a, b) { var bb = b; var uu = clamp(a, 0, 1); var t0 = up > 0 ? top(uu) - 0.004 : bot(uu) + 0.004; return V(0, bb, a - 0.5 + (f.sweep || 0) * (bb - t0) * -up); }, 4);
        finK.add(g, { col: colF, a: function (p, uv) { return [1, fl * 0.4 * uv[1], 0, uv[0] * 3]; }, b: function () { return [1, 0, 0, 0]; } });
        return;
      }
      if (f.t === 'pectoral' || f.t === 'pelvic') {
        var uu = f.u, z = uu - 0.5, yy = yo(uu) + r(uu) * h(uu) * (f.y == null ? (f.t === 'pectoral' ? -0.35 : -0.85) : f.y), xx = r(uu) * w(uu) * (f.x == null ? 0.85 : f.x);
        var ln2 = f.l, wd = f.wd || ln2 * 0.45, droop = f.droop == null ? 0.35 : f.droop, spread = f.spread == null ? 0.7 : f.spread;
        for (var s2 = -1; s2 <= 1; s2 += 2) {
          (function (s) {
            var outl3 = L.outline(9, function (t) { var ang = (t - 0.5) * PI * 0.9; return [Math.cos(ang) * ln2 * (f.round ? 1 : 1 - 0.2 * Math.abs(t - 0.5)), Math.sin(ang) * wd]; });
            var gg = L.fin([0, -wd * 0.25], [0, wd * 0.25], outl3, function (a, b) {
              // a: out from the body (back and sideways), b: across the fin
              var out = a * spread, back = a * Math.sqrt(1 - spread * spread);
              return V(s * (xx + out), yy - a * droop + b * 0.15, z - back + b);
            }, 4);
            finK.add(gg, { col: colF, a: function (p, uv) { return [1, fl * uv[1], 0, s > 0 ? 0 : 1.2]; }, b: function () { return [s * 0.3, 1, 0, 0]; } });
            if (f.lobe) { // fleshy lobe at the base (coelacanth)
              var lp = L.curvePts([V(s * xx * 0.8, yy, z + 0.01), V(s * (xx + ln2 * 0.25 * spread), yy - ln2 * 0.2 * droop, z - ln2 * 0.15), V(s * (xx + ln2 * 0.5 * spread), yy - ln2 * 0.4 * droop, z - ln2 * 0.35)], 8);
              body.add(L.sweep(lp, function (t) { return f.lobe * (1 - 0.6 * t); }, 8, true), { col: L.mixC(cBack, cBelly, 0.4), a: function (p, uv) { return [1, fl * 0.5 * uv[1], 0, s > 0 ? 0 : 1.2]; }, b: function () { return [s * 0.3, 1, 0, 0]; } });
            }
          })(s2);
        }
      }
    }
    return { body: body, fin: finK, top: top, bot: bot };
  }

  // Barbel or whisker hanging from the head.
  function barbel(kit, from, dir, len, rad, col, flut) {
    var pts = L.curvePts([from, from.clone().addScaledVector(dir, len * 0.5).add(V(0, -len * 0.25, 0)), from.clone().addScaledVector(dir, len).add(V(0, -len * 0.5, 0))], 9);
    kit.add(L.sweep(pts, function (t) { return rad * (1 - 0.8 * t); }, 5, true), { col: col, a: function (p, uv) { return [1, flut * uv[1], 0, 1.5]; }, b: function () { return [0.6, 0.6, 0, 0]; } });
  }
  // Cones on a list of positions (teeth, scutes, spines).
  function cones(kit, list, col, a) {
    list.forEach(function (c) { kit.add(new T.ConeGeometry(1, 1, 5, 1), { m: L.matAlong(c.pos.clone().addScaledVector(c.dir, c.len * 0.5), c.dir, c.r, c.len, c.r), col: col, a: a || STILL }); });
  }

  /* ------------------------------------------------------------------ */
  /* Fish species                                                        */
  /* ------------------------------------------------------------------ */
  var M = {};

  M.blind_cavefish = function () {
    var r = fishR(0.14, 0.58, 0.2, 0.5);
    var f = fish({ r: r, w: function (u) { return 0.55 + 0.1 * u; }, y: function (u) { return 0.012 * Math.sin(u * Math.PI); }, back: 0xC98E86, side: 0xDDB0A6, belly: 0xEED6CC, gill: 0xD08C88, gillU: 0.74, finCol: 0xE2BCB2, mouthC: 0x9a5a5a,
      eye: { type: 'bump', u: 0.88, r: 0.028 }, scales: 0.07, lateral: 0xE2B5AE,
      fins: [{ t: 'caudal', h: 0.15, l: 0.18, fork: 0.5 }, { t: 'dorsal', u0: 0.42, u1: 0.56, h: 0.11, sweep: 0.5 }, { t: 'dorsal', u0: 0.15, u1: 0.19, h: 0.03 },
        { t: 'anal', u0: 0.2, u1: 0.37, h: 0.07, sweep: 0.4 }, { t: 'pectoral', u: 0.72, l: 0.14, spread: 0.6 }, { t: 'pelvic', u: 0.5, l: 0.08 }] });
    return { body: f.body, fin: f.fin, bodyMat: { mode: 'fish', wave: [0.045, 0.85, 2.0, 0.06], head: 0.32, flut: [1.6, 0.02, 0, 0], sss: 0xff8c80, sssK: 0.55, rough: 0.32 }, finMat: { opacity: 0.45, sss: 0xffb0a0, sssK: 0.5 } };
  };

  M.cenote_molly = function () {
    var r = fishR(0.15, 0.5, 0.25, 0.5);
    var f = fish({ r: r, w: function (u) { return 0.5; }, h: function (u) { return 1.05; }, y: function (u) { return 0.01 * Math.sin(u * PI); }, back: 0x5E6A4C, side: 0xA9AE98, belly: 0xE3E0CF, gill: 0x8b7a6a, gillU: 0.76, finCol: 0x8A8C6E, mouthY: 0.25, mouthTilt: -0.3,
      eye: { type: 'eye', u: 0.87, r: 0.034, ring: 0xd8d0b0, pupil: 0x020202 }, scales: 0.16, mottle: 0.55, mottC: 0x2E3324, mottF: 34, mottT: 0.45,
      fins: [{ t: 'caudal', h: 0.16, l: 0.19, shape: 'round', col: 0x7f8466, edge: 0xC9B45A }, { t: 'dorsal', u0: 0.33, u1: 0.62, h: 0.12, top: function (t) { return Math.pow(Math.sin(PI * Math.pow(t, 0.6)), 0.7); }, col: 0x707456, edge: 0xD4BC54, rays: 0.25 },
        { t: 'anal', u0: 0.24, u1: 0.36, h: 0.06 }, { t: 'pectoral', u: 0.72, l: 0.13, col: 0xb8b8a0 }, { t: 'pelvic', u: 0.52, l: 0.07 }] });
    return { body: f.body, fin: f.fin, bodyMat: { mode: 'fish', wave: [0.05, 0.85, 2.0, 0.06], head: 0.32, flut: [1.8, 0.02, 0, 0], sss: 0xd0ffd8, sssK: 0.15, rough: 0.3 }, finMat: { opacity: 0.6, sss: 0xffffc0, sssK: 0.3 } };
  };

  M.deep_lobefin = function () {
    var r = fishR(0.15, 0.55, 0.3, 0.45);
    var f = fish({ r: r, w: function (u) { return 0.62; }, y: function (u) { return 0; }, back: 0x23324A, side: 0x34485F, belly: 0x4A5B6E, finCol: 0x2c3c52, mouthC: 0x14161a, gill: 0x1a2230, gillU: 0.79,
      eye: { type: 'eye', u: 0.9, r: 0.04, ring: 0x9fd8b0, pupil: 0x060a08 }, scales: 0.22, mottle: 0.85, mottC: 0xC6D0D8, mottF: 19, mottT: 0.5, mouthU: 0.985, rings: 90, segs: 40,
      fins: [{ t: 'caudal', h: 0.22, l: 0.16, shape: 'round', col: 0x2a3a50, edge: 0x6f8296, rays: 0.3 },
        { t: 'dorsal', u0: 0.55, u1: 0.65, h: 0.14, col: 0x2a3a50, edge: 0x8899aa, rays: 0.45, nRays: 8, top: function (t) { return Math.pow(Math.sin(PI * t), 0.6); } },
        { t: 'dorsal', u0: 0.24, u1: 0.3, h: 0.08, col: 0x33465c, sweep: 0.8 }, { t: 'anal', u0: 0.22, u1: 0.29, h: 0.08, col: 0x33465c, sweep: 0.8 },
        { t: 'pectoral', u: 0.72, l: 0.17, spread: 0.75, droop: 0.4, lobe: 0.022, col: 0x2f4058, edge: 0x7f93a6 },
        { t: 'pelvic', u: 0.45, l: 0.12, spread: 0.6, droop: 0.6, lobe: 0.018, col: 0x2f4058 }] });
    // the coelacanth's extra middle tail lobe (a small fin on a stalk past the tail)
    var lob = L.curvePts([V(0, 0, -0.5), V(0, 0, -0.56), V(0, 0, -0.62)], 6);
    f.body.add(L.sweep(lob, function (t) { return 0.016 * (1 - 0.7 * t); }, 6, true), { col: L.lin(0x2a3a50) });
    var tf = L.fin([0, -0.02], [0, 0.02], L.outline(9, function (t) { var a = (t - 0.5) * PI; return [0.05 * Math.cos(a), 0.04 * Math.sin(a)]; }), function (a, b) { return V(0, b, -0.6 - a); }, 3);
    f.fin.add(tf, { col: L.lin(0x5d7086), a: function (p, uv) { return [1, 0.5 * uv[1], 0, 0]; }, b: function () { return [1, 0, 0, 0]; } });
    return { body: f.body, fin: f.fin, bodyMat: { mode: 'fish', wave: [0.03, 0.7, 2.4, 0.04], head: 0.3, flut: [1.1, 0.035, 0, 0], sss: 0x88aacc, sssK: 0.18, rough: 0.45 }, finMat: { opacity: 0.7, sss: 0x9ab0c8, sssK: 0.2 } };
  };

  M.ancient_blindfish = function () {
    var r = fishR(0.1, 0.5, 0.22, 0.4);
    var f = fish({ r: r, w: function (u) { return 0.85; }, h: function (u) { return u > 0.86 ? 0.75 - (u - 0.86) * 1.5 : 1; }, flatBelly: 0.75, back: 0x76726A, side: 0xA29C90, belly: 0xCFC9BC, finCol: 0x8E887E, gill: 0x8a7f78, gillU: 0.8,
      eye: { type: 'milk', u: 0.9, r: 0.022, y: 0.25, ring: 0xd9e4e6 }, scales: 0.1, mottle: 0.6, mottC: 0x6F6A64, mottF: 14, mottT: 0.38, mouthU: 0.93, mouthY: -0.85, mouthTilt: 0.6,
      colFn: function (c, p, u) { // pale scars
        var sc = Math.abs(Math.sin(p.z * 37 + Math.sin(p.y * 40) * 1.5)); if (sc > 0.985 && u > 0.3 && u < 0.85) return L.mixC(c, L.lin(0xF2EEE6), 0.7); return c;
      },
      fins: [{ t: 'caudal', h: 0.13, l: 0.2, shape: 'hetero', fork: 0.5 }, { t: 'dorsal', u0: 0.22, u1: 0.33, h: 0.07, sweep: 0.6 }, { t: 'anal', u0: 0.2, u1: 0.28, h: 0.05, sweep: 0.6 },
        { t: 'pectoral', u: 0.76, l: 0.14, spread: 0.85, droop: 0.15, round: true }, { t: 'pelvic', u: 0.45, l: 0.08, spread: 0.8 }] });
    // bony scutes: a row along the back and two along the sides
    var sc = [], cB = L.lin(0xE7E0D0);
    for (var i = 0; i < 16; i++) {
      var u = 0.25 + i * 0.038, z = u - 0.5, tp = f.top(u), rr = r(u);
      sc.push({ pos: V(0, tp - 0.004, z), dir: V(0, 1, -0.5).normalize(), len: 0.022, r: 0.009 });
      sc.push({ pos: V(rr * 0.82, 0.0, z), dir: V(1, 0.3, -0.4).normalize(), len: 0.012, r: 0.007 });
      sc.push({ pos: V(-rr * 0.82, 0.0, z), dir: V(-1, 0.3, -0.4).normalize(), len: 0.012, r: 0.007 });
    }
    cones(f.body, sc, cB);
    // four barbels under the shovel snout
    var cb = L.lin(0xD6CFC2);
    [-0.025, -0.009, 0.009, 0.025].forEach(function (x) { barbel(f.body, V(x, -0.035, 0.45), V(x * 6, -0.6, 0.8).normalize(), 0.05, 0.003, cb, 0.6); });
    return { body: f.body, fin: f.fin, bodyMat: { mode: 'fish', wave: [0.03, 0.75, 2.2, 0.05], head: 0.3, flut: [0.8, 0.02, 0, 0], sss: 0xffe0d0, sssK: 0.25, rough: 0.55 }, finMat: { opacity: 0.6, sss: 0xffe8d8, sssK: 0.3 } };
  };

  M.lanternjaw = function () {
    // anglerfish: big rounded head, small tapering tail, hinged lower jaw full of needle teeth, glowing lure
    var r = function (u) { if (u < 0.03) return 0.03 * u / 0.03 + 0.004; if (u < 0.55) return 0.035 + 0.2 * Math.pow((u - 0.03) / 0.52, 1.5); return 0.235 * Math.pow(Math.max(0, 1 - Math.pow((u - 0.55) / 0.45, 2.4)), 0.5); };
    var hF = function (u) { return 1; }, wF = function (u) { return 0.8; };
    var f = fish({ r: r, w: wF, h: hF, y: function (u) { return 0.04 * Math.max(0, u - 0.5); }, back: 0x2E2C24, side: 0x47433A, belly: 0x6E6656, finCol: 0x3a372e, mouth: false,
      eye: { type: 'eye', u: 0.85, r: 0.022, y: 0.55, x: 0.72, ring: 0x6a6a5a, pupil: 0x000000 }, scales: 0, mottle: 0.5, mottC: 0x1B1A15, mottF: 30, mottT: 0.3,
      colFn: function (c, p, u, sy) { // cut away look of the mouth line: darker lips along the gape
        if (u > 0.82 && Math.abs(sy + 0.15) < 0.08) return L.mixC(c, L.lin(0x1a1410), 0.7); return c;
      },
      fins: [{ t: 'caudal', h: 0.09, l: 0.14, shape: 'round' }, { t: 'dorsal', u0: 0.2, u1: 0.3, h: 0.06 }, { t: 'anal', u0: 0.2, u1: 0.28, h: 0.05 }, { t: 'pectoral', u: 0.6, l: 0.1, y: -0.2 }] });
    // lower jaw: a separate scoop hinged at the back of the gape, opens with the action value
    var hinge = [0, -0.03, 0.2];
    var jaw = L.spine({ rings: 14, segs: 16, z0: 0.18, z1: 0.52, r: function (u) { return 0.16 * Math.pow(Math.max(0, 1 - Math.pow(u, 3)), 0.5) + 0.01; }, w: function () { return 1.2; }, h: function () { return 0.45; }, y: function (u) { return -0.075 + 0.06 * u; } });
    f.body.add(jaw, { col: function (p, n) { return n.y > 0.3 ? L.lin(0x120806) : L.lin(0x5f594a); }, a: function () { return [1, 0, 1, 0]; } });
    // mouth cavity (dark) so the open jaw shows a throat
    f.body.add(L.blob(12, 8), { m: L.mat(V(0, -0.02, 0.38), 0.12, 0.05, 0.12), col: L.lin(0x0a0404) });
    // teeth: needles along the upper and lower jaw rims, pointing inward
    var tU = [], tL = [];
    for (var i = 0; i < 13; i++) {
      var a = (i / 12 - 0.5) * 2.4, x = Math.sin(a) * 0.17, z = 0.24 + Math.cos(a) * 0.25;
      if (z < 0.24) continue;
      tU.push({ pos: V(x, 0.0, z), dir: V(-x * 2, -1, -0.3).normalize(), len: 0.05 + 0.03 * Math.cos(a), r: 0.005 });
      tL.push({ pos: V(x * 1.1, -0.045 + 0.04 * Math.cos(a), z + 0.02), dir: V(-x * 2, 1, -0.4).normalize(), len: 0.06 + 0.04 * Math.cos(a), r: 0.006 });
    }
    var cT = L.lin(0xE9E4D4);
    cones(f.body, tU, cT);
    cones(f.body, tL, cT, [1, 0, 1, 0]);
    // the lure: a thin rod from the forehead curving forward, ending in a glowing bulb with filaments
    var rod = L.curvePts([V(0, 0.19, 0.34), V(0, 0.34, 0.42), V(0, 0.4, 0.58), V(0, 0.34, 0.7)], 14);
    f.body.add(L.sweep(rod, function (t) { return 0.008 * (1 - 0.5 * t); }, 5), { col: L.lin(0x5a5444), a: function (p, uv) { return [1, 1.0 * uv[1], 0, 0]; }, b: function () { return [0.3, 1, 0.2, 0]; } });
    f.body.add(L.blob(14, 10), { m: L.mat(V(0, 0.33, 0.72), 0.03, 0.035, 0.03), col: L.lin(0xCFFFF6), a: [1, 1, 0, 0], b: [0.3, 1, 0.2, 1] });
    for (var k = 0; k < 5; k++) {
      var ang = k / 5 * PI * 2, st = V(Math.cos(ang) * 0.01, 0.305, 0.72 + Math.sin(ang) * 0.01);
      var pts = L.curvePts([st, st.clone().add(V(Math.cos(ang) * 0.02, -0.04, Math.sin(ang) * 0.02)), st.clone().add(V(Math.cos(ang) * 0.03, -0.09, Math.sin(ang) * 0.03))], 6);
      f.body.add(L.sweep(pts, 0.0025, 4, true), { col: L.lin(0x9FFFF0), a: [1, 1, 0, k], b: [0.3, 1, 0.2, 0.6] });
    }
    return { body: f.body, fin: f.fin, bodyMat: { mode: 'fish', wave: [0.035, 0.6, 2.5, 0.0], head: 0.15, flut: [1.2, 0.012, 0, 0], hinge: [hinge[0], hinge[1], hinge[2], 0.95], glow: 0x6FFFE9, glowK: 3.0, sss: 0x806040, sssK: 0.15, rough: 0.6 },
      finMat: { opacity: 0.6, sss: 0x806040, sssK: 0.2 }, halos: [[0, 0.33, 0.72, 0.5, 1]], lure: [0, 0.33, 0.72] };
  };

  /* ------------------------------------------------------------------ */
  /* Eels                                                                */
  /* ------------------------------------------------------------------ */
  function eel(o) {
    var body = new L.Kit(), finK = new L.Kit();
    var R = o.R, r = function (u) { if (u < 0.02) return R * 0.15; if (u > 0.94) return R * Math.pow(Math.max(0, 1 - (u - 0.94) / 0.06), 0.6) * (0.9) + R * 0.02; return R * (0.25 + 0.75 * L.sstep(0.0, 0.55, u)) * (u > 0.85 ? 1 - (u - 0.85) * 0.6 : 1); };
    var w = function (u) { return u > 0.88 ? 1.15 : u < 0.4 ? 0.7 + 0.3 * u / 0.4 : 1; }, h = function (u) { return u > 0.88 ? 0.85 : 1; };
    var cB = L.lin(o.back), cS = L.lin(o.belly), cT = L.lin(o.throat || o.belly);
    body.add(L.spine({ rings: 200, segs: 14, r: r, w: w, h: h }), {
      col: function (p, n, uv) {
        var u = uv[1], sy = Math.sin(uv[0] * PI * 2);
        var c = L.mixC(L.mixC(cS, cT, L.sstep(0.6, 0.85, u)), cB, L.sstep(-0.35, 0.4, sy));
        c.multiplyScalar(1 + 0.06 * Math.sin(u * 300) * Math.sin(uv[0] * 40));
        if (o.mottle) { var nz = L.vnoise(p.x * 60, p.y * 60, p.z * 60); if (nz > 0.35) c = L.mixC(c, L.lin(o.mottle), 0.35); }
        return c;
      },
      b: function (p, uv) {
        if (!o.organ) return NOB;
        var u = uv[1], sy = Math.sin(uv[0] * PI * 2);
        // electric organ: thin bright rings along the lower flanks
        var band = Math.abs(sy + 0.3) < 0.18 && u > 0.08 && u < 0.8 ? Math.pow(Math.abs(Math.sin(u * 140)), 6) * (1 - Math.abs(sy + 0.3) / 0.18) * 0.7 : 0;
        return [0, 0, 0, band];
      }
    });
    if (o.eyes) for (var s = -1; s <= 1; s += 2) body.add(L.blob(10, 8), { m: L.mat(V(s * R * 0.92, R * 0.3, 0.465), R * 0.12, R * 0.22, R * 0.22), col: L.lin(0x0a0a08) });
    // mouth
    body.add(L.blob(10, 6), { m: L.mat(V(0, -R * 0.2, 0.497), R * 0.8, R * 0.08, 0.004), col: L.lin(0x2a1a14) });
    // the long anal fin ribbon under the belly (knifefish style) or a small tail fold
    var u0 = o.ribbon ? 0.03 : 0.0, u1 = o.ribbon ? 0.78 : 0.12, hgt = o.ribbon ? R * 0.9 : R * 0.6;
    var outl = L.outline(40, function (t) { var u = u0 + (u1 - u0) * t; return [u, -r(u) * h(u) - hgt * Math.sin(PI * Math.pow(t, o.ribbon ? 0.25 : 0.6)) * (o.ribbon ? 1 - 0.2 * t : 1)]; });
    var gF = L.fin([u0, -r(u0) * 0.95], [u1, -r(u1) * 0.95], outl, function (a, b) { return V(0, b, a - 0.5); }, 3);
    var cF = L.lin(o.fin || o.belly);
    finK.add(gF, { col: function (p, n, uv) { return cF.clone().multiplyScalar(0.85 + 0.3 * Math.pow(Math.abs(Math.sin(uv[0] * 140)), 4)); }, a: function (p, uv) { return [1, 1.0 * uv[1], 0, uv[0] * 30]; }, b: function () { return [1, 0, 0, 0]; } });
    if (!o.ribbon) { // matching top fold near the tail
      var outl2 = L.outline(12, function (t) { var u = u0 + (u1 - u0) * t; return [u, r(u) * h(u) + hgt * Math.sin(PI * Math.pow(t, 0.6))]; });
      finK.add(L.fin([u0, r(u0) * 0.95], [u1, r(u1) * 0.95], outl2, function (a, b) { return V(0, b, a - 0.5); }, 3), { col: cF, a: function (p, uv) { return [1, 0.6 * uv[1], 0, 0]; }, b: function () { return [1, 0, 0, 0]; } });
    }
    if (o.pecs) for (var s2 = -1; s2 <= 1; s2 += 2) {
      (function (s) {
        var gp = L.fin([0, -0.006], [0, 0.006], L.outline(7, function (t) { var a = (t - 0.5) * PI; return [Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.5]; }), function (a, b) { return V(s * (R * 0.95 + a * 0.7), -R * 0.3 - a * 0.2, 0.42 - a * 0.6 + b); }, 3);
        finK.add(gp, { col: cF, a: function (p, uv) { return [1, 1.5 * uv[1], 0, s]; }, b: function () { return [0, 1, 0, 0]; } });
      })(s2);
    }
    return { body: body, fin: finK };
  }
  M.volt_eel = function () {
    var e = eel({ R: 0.042, back: 0x2B2F26, belly: 0x6E5F3E, throat: 0xA06E34, fin: 0x4a4636, organ: true, eyes: true, ribbon: true, pecs: true, mottle: 0x1d201a });
    var halos = []; for (var i = 0; i < 6; i++) halos.push([0, -0.01, -0.3 + i * 0.12, 0.25, 0.5]);
    return { body: e.body, fin: e.fin, bodyMat: { mode: 'fish', wave: [0.07, 1.9, 1.0, 0.35], head: 0.42, flut: [3.0, 0.012, 0, 0], glow: 0xBFE8FF, glowK: 1.3, sss: 0x907050, sssK: 0.12, rough: 0.35 }, finMat: { opacity: 0.55, sss: 0xa08060, sssK: 0.3 }, halos: halos, halosOnAction: true };
  };
  M.blind_swamp_eel = function () {
    var e = eel({ R: 0.036, back: 0xD9B9AE, belly: 0xF0DED6, throat: 0xEBCFC5, fin: 0xEBD3CA, eyes: false, ribbon: false, mottle: 0xC7A296 });
    return { body: e.body, fin: e.fin, bodyMat: { mode: 'fish', wave: [0.08, 2.1, 1.0, 0.4], head: 0.42, flut: [2, 0.006, 0, 0], sss: 0xff9a8a, sssK: 0.55, rough: 0.28 }, finMat: { opacity: 0.45, sss: 0xffb0a0, sssK: 0.5 } };
  };

  /* ------------------------------------------------------------------ */
  /* Olm (blind cave salamander)                                         */
  /* ------------------------------------------------------------------ */
  M.olm = function () {
    var body = new L.Kit(), finK = new L.Kit();
    var R = 0.05;
    var r = function (u) { if (u < 0.02) return 0.004; if (u < 0.3) return R * (0.25 + 0.75 * L.sstep(0, 0.3, u)); if (u > 0.93) return R * 0.85 * Math.pow(Math.max(0, 1 - (u - 0.93) / 0.07), 0.6) + 0.002; if (u > 0.8) return R * (1 - (u - 0.8) * 1.1); return R; };
    var w = function (u) { return u > 0.86 ? 1.25 : u < 0.3 ? 0.55 + 0.45 * u / 0.3 : 1; }, h = function (u) { return u > 0.86 ? 0.62 : u < 0.3 ? 1.25 : 0.95; };
    var cSkin = L.lin(0xE2C2B4), cPink = L.lin(0xD99C8C), cBelly = L.lin(0xEDD8CC);
    body.add(L.spine({ rings: 64, segs: 16, r: r, w: w, h: h }), {
      col: function (p, n, uv) { var sy = Math.sin(uv[0] * PI * 2), u = uv[1]; var c = L.mixC(cBelly, cSkin, L.sstep(-0.4, 0.3, sy)); c.lerp(cPink, 0.25 + 0.2 * Math.sin(u * 50) * Math.sin(uv[0] * 18)); if (u > 0.93 && Math.abs(sy + 0.1) < 0.12) c = L.mixC(c, L.lin(0xC08a80), 0.6); return c; }
    });
    // eye spots under the skin (tiny grey smudges)
    for (var s = -1; s <= 1; s += 2) body.add(L.blob(8, 6), { m: L.mat(V(s * R * 1.05, R * 0.25, 0.43), 0.003, 0.004, 0.004), col: L.lin(0xb59e98) });
    // tail fin folds (top and bottom)
    var cF = L.lin(0xF2DDD2);
    [1, -1].forEach(function (up) {
      var outl = L.outline(14, function (t) { var u = 0.02 + 0.3 * t; return [u, up * (r(u) * h(u) + 0.03 * Math.sin(PI * Math.pow(t, 0.5)))]; });
      finK.add(L.fin([0.02, up * r(0.02) * 0.9], [0.32, up * r(0.32) * h(0.32) * 0.9], outl, function (a, b) { return V(0, b, a - 0.5); }, 3), { col: cF, a: function (p, uv) { return [1, 0.4 * uv[1], 0, 0]; }, b: function () { return [1, 0, 0, 0]; } });
    });
    // external gills: three feathery tufts on each side behind the head (red from blood)
    var cG = L.lin(0xE2706E), cG2 = L.lin(0xF39A90);
    for (s = -1; s <= 1; s += 2) for (var gi = 0; gi < 3; gi++) {
      var base = V(s * R * 0.8, R * 0.25 - gi * R * 0.35, 0.3 + 0.0), dir = V(s * 1, 0.6 - gi * 0.6, -0.7).normalize();
      var tip = base.clone().addScaledVector(dir, 0.075);
      var stalk = L.curvePts([base, base.clone().addScaledVector(dir, 0.03).add(V(0, 0.005, 0)), tip], 6);
      body.add(L.sweep(stalk, function (t) { return 0.0055 * (1 - 0.6 * t); }, 5, true), { col: cG, a: function (p, uv) { return [1, 0.8 * uv[1], 0, gi + s]; }, b: function () { return [0.3, 1, 0.2, 0]; } });
      for (var fi = 0; fi < 7; fi++) {
        var tt = 0.25 + fi * 0.1, at = base.clone().lerp(tip, tt);
        for (var side = -1; side <= 1; side += 2) {
          var fd = new T.Vector3().crossVectors(dir, V(0, 0, 1)).normalize().multiplyScalar(side).add(dir.clone().multiplyScalar(0.4)).normalize();
          var fp = L.curvePts([at, at.clone().addScaledVector(fd, 0.012), at.clone().addScaledVector(fd, 0.02).add(V(0, 0, -0.006))], 4);
          body.add(L.sweep(fp, 0.0018, 3, true), { col: cG2, a: function (p, uv) { return [1, 1.0, 0, gi + s + fi]; }, b: function () { return [0.3, 1, 0.3, 0]; } });
        }
      }
    }
    // thin legs: front with three toes, rear with two
    function leg(uAt, s, ph, toes) {
      var hip = V(s * R * 0.7, -R * 0.45, uAt - 0.5), knee = hip.clone().add(V(s * 0.04, -0.012, 0.012)), foot = knee.clone().add(V(s * 0.018, -0.03, 0.01));
      var pts = L.curvePts([hip, knee, foot], 8);
      body.add(L.sweep(pts, function (t) { return 0.0055 * (1 - 0.45 * t); }, 5, true), { col: cSkin, a: function (p, uv) { return [1, 0, uv[1], ph]; } });
      for (var k = 0; k < toes; k++) {
        var ta = (k - (toes - 1) / 2) * 0.5, td = V(s * Math.cos(ta) * 0.5, -0.2, Math.sin(ta) + 0.3).normalize();
        body.add(L.sweep(L.curvePts([foot, foot.clone().addScaledVector(td, 0.008), foot.clone().addScaledVector(td, 0.014)], 4), 0.0018, 4, true), { col: cSkin, a: [1, 0, 1, ph] });
      }
    }
    leg(0.74, 1, 0, 3); leg(0.74, -1, PI, 3); leg(0.36, 1, PI, 2); leg(0.36, -1, 0, 2);
    return { body: body, fin: finK, bodyMat: { mode: 'crawl', wave: [0.05, 1.0, 1.2, 0.25], head: 0.4, flut: [1.0, 0.006, 1.0, 0.02], sss: 0xff8f80, sssK: 0.35, rough: 0.3 }, finMat: { opacity: 0.5, sss: 0xffa090, sssK: 0.55 } };
  };

  /* ------------------------------------------------------------------ */
  /* Crustaceans and arthropods                                          */
  /* ------------------------------------------------------------------ */
  M.remipede = function () {
    var body = new L.Kit(), finK = new L.Kit(), NS = 24;
    var cB = L.lin(0xDCD0BC), cG = L.lin(0xC9A85A), cJ = L.lin(0xC4B49A);
    var r = function (u) { var base = 0.062 * (u < 0.1 ? 0.35 + 0.65 * u / 0.1 : u > 0.92 ? 1 - (u - 0.92) * 6 : 1); var seg = (u * NS) % 1; return base * (0.86 + 0.14 * Math.sin(seg * PI)); };
    body.add(L.spine({ rings: NS * 5, segs: 14, r: r, w: function () { return 1.0; }, h: function () { return 0.38; }, sq: 2.6, z0: -0.5, z1: 0.42 }), {
      col: function (p, n, uv) { var u = uv[1], seg = (u * NS) % 1; var c = cB.clone(); if (seg < 0.12) c.lerp(cJ, 0.8); var sy = Math.sin(uv[0] * PI * 2); if (Math.abs(Math.cos(uv[0] * PI * 2)) < 0.25 && sy > 0) c.lerp(cG, 0.45); return c; }
    });
    // head shield and antennae
    body.add(L.blob(12, 8), { m: L.mat(V(0, 0, 0.44), 0.045, 0.02, 0.05), col: cB });
    for (var s = -1; s <= 1; s += 2) {
      var an = L.curvePts([V(s * 0.02, 0, 0.48), V(s * 0.08, 0.01, 0.6), V(s * 0.16, 0.0, 0.72)], 10);
      body.add(L.sweep(an, function (t) { return 0.004 * (1 - 0.7 * t); }, 4, true), { col: cJ, a: function (p, uv) { return [1, 0.8 * uv[1], 0, s]; }, b: function () { return [0.2, 1, 0, 0]; } });
      // raptorial front limbs (curled hooks)
      var rp = L.curvePts([V(s * 0.02, -0.01, 0.44), V(s * 0.06, -0.03, 0.52), V(s * 0.05, -0.04, 0.58), V(s * 0.03, -0.035, 0.6)], 8);
      body.add(L.sweep(rp, function (t) { return 0.006 * (1 - 0.5 * t); }, 5, true), { col: cJ, a: function (p, uv) { return [1, 0, 0.5 * uv[1], 0]; } });
    }
    // a pair of paddle legs on every trunk segment, rowing in a wave from back to front
    for (var i = 2; i < NS - 1; i++) {
      var u = (i + 0.5) / NS, z = -0.5 + 0.92 * u, rr = r(u), ph = -i * 0.55;
      for (s = -1; s <= 1; s += 2) {
        var hip = V(s * rr * 0.95, -0.005, z), tip = V(s * (rr + 0.09), -0.02, z - 0.012);
        body.add(L.sweep(L.curvePts([hip, hip.clone().lerp(tip, 0.5).add(V(0, -0.006, 0)), tip], 5), function (t) { return 0.0045 * (1 - 0.4 * t); }, 4, true), { col: cJ, a: function (p, uv) { return [1, 0, uv[1], ph]; } });
        var pad = L.fin([0, -0.006], [0, 0.006], L.outline(7, function (t) { var a = (t - 0.5) * PI; return [Math.cos(a) * 0.045, Math.sin(a) * 0.02]; }), (function (tp) { return function (a, b) { return V(tp.x + s * a, tp.y - 0.002, tp.z + b); }; })(tip), 2);
        finK.add(pad, { col: cB, a: [1, 0, 1, ph] });
      }
    }
    // tail prongs
    for (s = -1; s <= 1; s += 2) body.add(L.sweep(L.curvePts([V(s * 0.008, 0, -0.49), V(s * 0.02, 0, -0.53), V(s * 0.03, 0, -0.56)], 5), 0.004, 4, true), { col: cJ });
    return { body: body, fin: finK, bodyMat: { mode: 'crawl', wave: [0.02, 1.2, 1, 0.5], head: 0.4, flut: [1.5, 0.01, 2.2, 0.018], sss: 0xfff0c0, sssK: 0.55, rough: 0.35 }, finMat: { opacity: 0.55, sss: 0xffffff, sssK: 0.5 } };
  };

  // Shared decapod (crayfish / shrimp) builder.
  function decapod(o) {
    var body = new L.Kit(), finK = new L.Kit(), shell = o.glass ? finK : body;
    var cS = L.lin(o.shell), cS2 = L.lin(o.shell2 || o.shell), cJ = L.lin(o.joint || o.shell);
    // carapace (head and thorax)
    var car = L.spine({ rings: 22, segs: 18, z0: 0.02, z1: 0.42, r: function (u) { return 0.12 * Math.pow(Math.sin(PI * (0.1 + 0.85 * u)), 0.55) * (o.carR || 1); }, w: function () { return o.carW || 1.0; }, h: function () { return 0.9; }, y: function (u) { return 0.0 + 0.02 * u; } });
    shell.add(car, { col: function (p, n, uv) { var c = L.mixC(cS2, cS, L.sstep(-0.3, 0.6, Math.sin(uv[0] * PI * 2))); var gr = Math.abs(uv[1] - 0.55) < 0.015 ? 0.8 : 1; c.multiplyScalar(gr * (1 + 0.08 * L.vnoise(p.x * 80, p.y * 80, p.z * 80))); return c; } });
    // rostrum spike
    shell.add(new T.ConeGeometry(1, 1, 6), { m: L.matAlong(V(0, 0.03, 0.47), V(0, 0.08, 1), 0.016, 0.12, 0.012), col: cS });
    // abdomen: six overlapping segments curling down
    var nSeg = 6, prev = V(0, 0, 0.04);
    for (var i = 0; i < nSeg; i++) {
      var t = i / (nSeg - 1), z = 0.02 - (i + 0.5) * 0.08, y = -o.curl * t * t, rr = 0.1 * (1 - 0.35 * t) * (o.abdR || 1);
      shell.add(L.blob(16, 10), { m: L.mat(V(0, y, z), rr * (o.carW || 1) * 1.05, rr * 0.85, 0.055), col: function (p, n) { return L.mixC(cS2, cS, L.sstep(-0.3, 0.5, n.y)).multiplyScalar(n.z > 0.6 ? 0.85 : 1); } });
      // swimmerets under each segment
      if (i < 5) for (var s = -1; s <= 1; s += 2) {
        var at = V(s * rr * 0.5, y - rr * 0.6, z);
        finK.add(L.fin([0, -0.008], [0, 0.008], L.outline(5, function (q) { var a = (q - 0.5) * PI; return [Math.cos(a) * 0.05, Math.sin(a) * 0.015]; }), (function (b0) { return function (a, b) { return V(b0.x + s * 0.01 * a / 0.05, b0.y - a, b0.z + b); }; })(at), 2), { col: cS2, a: function (p, uv) { return [1, 1, 0, i * 0.8]; }, b: function () { return [0, 0, 1, 0]; } });
      }
      prev.set(0, y, z);
    }
    // tail fan: telson and four uropods
    var tz = 0.02 - nSeg * 0.08 + 0.01, ty = -o.curl;
    [-0.5, -0.2, 0, 0.2, 0.5].forEach(function (ang, k) {
      var big = k === 2 ? 0.75 : 1;
      var fan = L.fin([0, -0.012], [0, 0.012], L.outline(7, function (q) { var a = (q - 0.5) * 1.6; return [Math.cos(a) * 0.12 * big, Math.sin(a) * 0.04]; }), function (a, b) { var dz = Math.cos(ang) * a, dx = Math.sin(ang) * a; return V(dx + b * Math.cos(ang), ty - a * 0.15, tz - dz + b * Math.sin(ang) * -1); }, 3);
      (o.glass ? finK : body).add(fan, { col: function (p, n, uv) { return L.mixC(cS, cJ, uv[1] * 0.4); }, a: function (p, uv) { return [1, 0.3 * uv[1], 0, k]; }, b: function () { return [0, 1, 0, 0]; } });
    });
    // walking legs (4 pairs), knees up, feet on the floor
    for (var li = 0; li < 4; li++) for (var s3 = -1; s3 <= 1; s3 += 2) {
      var z0 = 0.3 - li * 0.075, hip = V(s3 * 0.07, -0.06, z0), knee = V(s3 * 0.17, 0.0, z0 + 0.01 - li * 0.02), foot = V(s3 * 0.24, -0.13, z0 - 0.03 - li * 0.03);
      var ph = (li % 2 ? PI : 0) + (s3 > 0 ? 0 : PI);
      body.add(L.sweep(L.curvePts([hip, knee, foot], 9), function (t) { return (o.legR || 0.011) * (1 - 0.6 * t); }, 5, true), { col: function (p, n, uv) { return Math.abs(uv[1] - 0.5) < 0.05 ? cJ : cS2; }, a: function (p, uv) { return [1, 0, uv[1], ph]; } });
    }
    // antennae: two long whips and two short pairs
    for (var s4 = -1; s4 <= 1; s4 += 2) {
      var aL = o.antL || 1.1;
      var whip = L.curvePts([V(s4 * 0.04, 0.02, 0.44), V(s4 * 0.2, 0.08, 0.6), V(s4 * 0.38, 0.06, 0.3 + 0.1 * aL), V(s4 * 0.5, 0.02, 0.0 - 0.3 * (aL - 1))], 22);
      body.add(L.sweep(whip, function (t) { return 0.006 * (1 - 0.8 * t); }, 4, true), { col: cJ, a: function (p, uv) { return [1, 0.9 * uv[1] * uv[1], 0, s4]; }, b: function () { return [0.4, 1, 0, 0]; } });
      var shortA = L.curvePts([V(s4 * 0.02, 0.03, 0.45), V(s4 * 0.05, 0.06, 0.55), V(s4 * 0.08, 0.06, 0.62)], 8);
      body.add(L.sweep(shortA, function (t) { return 0.004 * (1 - 0.6 * t); }, 4, true), { col: cJ, a: function (p, uv) { return [1, 0.5 * uv[1], 0, s4 * 2]; }, b: function () { return [0.3, 1, 0, 0]; } });
      // pale eyeless eye stalk bumps
      body.add(L.blob(8, 6), { m: L.mat(V(s4 * 0.035, 0.05, 0.42), 0.012, 0.01, 0.014), col: L.mixC(cS, L.lin(0xffffff), 0.4) });
    }
    return { body: body, fin: finK };
  }

  M.cave_crayfish = function () {
    var d = decapod({ shell: 0xC9CFD0, shell2: 0xB0B8BC, joint: 0xD2A898, curl: 0.04, antL: 1.0 });
    var cS = L.lin(0xC9CFD0), cJ = L.lin(0xD2A898), cT = L.lin(0xE2CDBA);
    // claws: arm segments forward, then a broad claw (propodus) and a movable finger (dactyl) that opens with the action value
    for (var s = -1; s <= 1; s += 2) {
      var sh = V(s * 0.08, -0.04, 0.36), el = V(s * 0.17, 0.0, 0.48), wr = V(s * 0.16, 0.0, 0.62);
      d.body.add(L.sweep(L.curvePts([sh, el, wr], 10), function (t) { return 0.022 * (1 - 0.2 * t); }, 6, true), { col: function (p, n, uv) { return Math.abs(uv[1] - 0.5) < 0.06 ? cJ : cS; }, a: [1, 0, 0, 0] });
      d.body.add(L.blob(14, 10), { m: L.mat(V(s * 0.165, 0.0, 0.7), 0.038, 0.022, 0.09, 0, s * 0.12, 0), col: function (p, n) { return L.mixC(cS, cT, 0.3 + 0.3 * n.y); } });
      // fixed finger
      d.body.add(new T.ConeGeometry(1, 1, 6), { m: L.matAlong(V(s * 0.155, -0.004, 0.83), V(-s * 0.08, 0, 1), 0.013, 0.12, 0.009), col: cT });
      // movable finger: opens outward and up when attacking (negative flutter weight = action driven)
      var mf = L.curvePts([V(s * 0.19, 0.01, 0.76), V(s * 0.2, 0.012, 0.83), V(s * 0.18, 0.006, 0.89)], 7);
      d.body.add(L.sweep(mf, function (t) { return 0.012 * (1 - 0.7 * t); }, 5, true), { col: cT, a: function (p, uv) { return [1, -1 * uv[1], 0, 0]; }, b: function () { return [s * 0.06, 0.03, 0, 0]; } });
    }
    return { body: d.body, fin: d.fin, bodyMat: { mode: 'crawl', wave: [0, 1, 1, 0], head: 0.4, flut: [1.4, 0.03, 2.4, 0.03], sss: 0xd0e8ff, sssK: 0.25, rough: 0.28 }, finMat: { opacity: 0.6, sss: 0xffffff, sssK: 0.5 } };
  };

  M.glass_shrimp = function () {
    var d = decapod({ glass: true, shell: 0xE4F2F4, shell2: 0xCFE6EA, joint: 0xF2E6DC, curl: 0.12, carR: 0.85, carW: 0.8, abdR: 0.9, antL: 1.5, legR: 0.007 });
    // internal organs that show through the clear shell (gut line and a faint yellow ovary)
    d.body.add(L.sweep(L.curvePts([V(0, 0.03, 0.35), V(0, 0.02, 0.05), V(0, -0.06, -0.3)], 12), function (t) { return 0.018 * (1 - 0.6 * t); }, 6, true), { col: L.lin(0xC8A86A) });
    d.body.add(L.blob(10, 8), { m: L.mat(V(0, 0.04, 0.22), 0.04, 0.03, 0.08), col: L.lin(0xE8D27A) });
    return { body: d.body, fin: d.fin, bodyMat: { mode: 'crawl', wave: [0.02, 0.8, 2, 0], head: 0.4, flut: [3.2, 0.02, 3, 0.02], sss: 0xffffff, sssK: 0.5, rough: 0.2 }, finMat: { opacity: 0.32, sss: 0xe8ffff, sssK: 0.8, rough: 0.12 } };
  };

  M.giant_isopod = function () {
    var body = new L.Kit(), finK = new L.Kit(), NS = 7;
    var cA = L.lin(0xA89890), cB = L.lin(0x8A7C88), cG = L.lin(0x4E4248), cU = L.lin(0xC8BCB0);
    var r = function (u) { var b = 0.26 * Math.pow(Math.sin(PI * (0.04 + 0.92 * u)), 0.45); var seg = u > 0.18 && u < 0.86 ? ((u - 0.18) / 0.68 * NS) % 1 : 0.5; return b * (1 - 0.05 * Math.pow(Math.cos(seg * PI), 8)); };
    body.add(L.spine({ rings: 70, segs: 26, r: r, w: function () { return 1.45; }, h: function () { return 0.48; }, sq: 2.8, flatBelly: 0.35 }), {
      col: function (p, n, uv) { var u = uv[1], sy = Math.sin(uv[0] * PI * 2); var c = L.mixC(cU, L.mixC(cB, cA, L.sstep(0.3, 1, sy)), L.sstep(-0.3, 0.1, sy)); var seg = u > 0.18 && u < 0.86 ? ((u - 0.18) / 0.68 * NS) % 1 : 0.5; if (seg < 0.08 && sy > 0) c = L.mixC(c, cG, 0.7); if (u < 0.18 && sy > 0 && Math.abs(((u / 0.18) * 5) % 1) < 0.1) c = L.mixC(c, cG, 0.5); c.multiplyScalar(1 + 0.08 * L.vnoise(p.x * 40, p.y * 40, p.z * 40)); return c; }
    });
    // big compound eyes and antennae
    for (var s = -1; s <= 1; s += 2) {
      body.add(L.blob(12, 8), { m: L.mat(V(s * 0.16, 0.035, 0.4), 0.035, 0.025, 0.05, 0, s * 0.3, 0), col: function (p, n) { return L.lin(0x2a2430).multiplyScalar(1 + 0.6 * Math.pow(Math.abs(Math.sin(p.x * 900) * Math.sin(p.z * 900)), 4)); } });
      body.add(L.sweep(L.curvePts([V(s * 0.06, 0.0, 0.48), V(s * 0.2, 0.02, 0.6), V(s * 0.34, -0.02, 0.58)], 10), function (t) { return 0.012 * (1 - 0.7 * t); }, 5, true), { col: cA, a: function (p, uv) { return [1, 0.6 * uv[1], 0, s]; }, b: function () { return [0, 1, 0.3, 0]; } });
      body.add(L.sweep(L.curvePts([V(s * 0.03, 0.01, 0.49), V(s * 0.07, 0.02, 0.56), V(s * 0.1, 0.01, 0.6)], 6), 0.007, 4, true), { col: cA, a: function (p, uv) { return [1, 0.4 * uv[1], 0, s * 2]; }, b: function () { return [0, 1, 0, 0]; } });
    }
    // seven pairs of walking legs underneath, plus tail uropods
    for (var i = 0; i < NS; i++) for (s = -1; s <= 1; s += 2) {
      var z = 0.28 - i * 0.09, hip = V(s * 0.17, -0.07, z), knee = V(s * 0.3, -0.06, z + 0.02), foot = V(s * 0.33, -0.15, z - 0.01), ph = i * 0.7 + (s > 0 ? 0 : PI);
      body.add(L.sweep(L.curvePts([hip, knee, foot], 8), function (t) { return 0.016 * (1 - 0.5 * t); }, 5, true), { col: cU, a: function (p, uv) { return [1, 0, uv[1], ph]; } });
    }
    for (s = -1; s <= 1; s += 2) body.add(L.blob(10, 6), { m: L.mat(V(s * 0.12, -0.02, -0.5), 0.06, 0.012, 0.07, 0, s * 0.4, 0), col: cA });
    return { body: body, fin: finK, bodyMat: { mode: 'crawl', wave: [0, 1, 1, 0], head: 0.4, flut: [1.2, 0.02, 2.6, 0.03], sss: 0xd8c8ff, sssK: 0.15, rough: 0.45 }, finMat: {} };
  };

  M.rockcrawler = function () {
    var body = new L.Kit(), finK = new L.Kit(), NS = 11;
    var cA = L.lin(0x7E705F), cB = L.lin(0x5A4F44), cG = L.lin(0x3A322B), cU = L.lin(0xB8A890);
    var segOf = function (u) { return u > 0.22 && u < 0.7 ? ((u - 0.22) / 0.48 * NS) % 1 : 0.5; };
    var r = function (u) { var b = 0.3 * Math.pow(Math.sin(PI * (0.03 + 0.94 * u)), 0.5); return b * (1 - 0.04 * Math.pow(Math.cos(segOf(u) * PI), 10)); };
    var colF = function (p, n, uv) { var u = uv[1], sy = Math.sin(uv[0] * PI * 2), cx = Math.cos(uv[0] * PI * 2); var c = L.mixC(cU, L.mixC(cB, cA, L.sstep(0.2, 1, sy)), L.sstep(-0.3, 0.1, sy)); if (segOf(u) < 0.1 && sy > 0) c = L.mixC(c, cG, 0.75); if (Math.abs(Math.abs(cx) - 0.38) < 0.04 && sy > 0 && u > 0.22) c = L.mixC(c, cG, 0.6); if (u > 0.7 && Math.abs(u - 0.72) < 0.012 && sy > 0) c = L.mixC(c, cG, 0.8); c.multiplyScalar(1 + 0.12 * L.vnoise(p.x * 50, p.y * 50, p.z * 50)); return c; };
    body.add(L.spine({ rings: 80, segs: 28, r: r, w: function () { return 1.25; }, h: function () { return 0.32; }, sq: 2.4, flatBelly: 0.3 }), { col: colF });
    // raised middle lobe (the "tri" in trilobite)
    body.add(L.spine({ rings: 60, segs: 12, z0: -0.42, z1: 0.32, r: function (u) { return 0.075 * Math.pow(Math.sin(PI * (0.05 + 0.9 * u)), 0.5) * (1 - 0.1 * Math.pow(Math.cos(segOf(0.08 + u * 0.75) * PI), 10)); }, w: function () { return 1.0; }, h: function () { return 0.75; }, y: function () { return 0.06; } }), { col: colF });
    // head shield crescent eyes and backward genal spines
    for (var s = -1; s <= 1; s += 2) {
      body.add(L.blob(10, 6), { m: L.mat(V(s * 0.14, 0.075, 0.33), 0.03, 0.022, 0.05, 0, s * 0.5, 0), col: function (p, n) { return L.lin(0x2a2622).multiplyScalar(1 + 0.8 * Math.pow(Math.abs(Math.sin(p.x * 700)), 6)); } });
      body.add(new T.ConeGeometry(1, 1, 6), { m: L.matAlong(V(s * 0.32, 0.0, 0.08), V(s * 0.25, -0.03, -1), 0.03, 0.34, 0.015), col: cA });
      body.add(L.sweep(L.curvePts([V(s * 0.06, -0.02, 0.48), V(s * 0.16, 0.0, 0.62), V(s * 0.28, -0.02, 0.68)], 8), function (t) { return 0.008 * (1 - 0.7 * t); }, 4, true), { col: cU, a: function (p, uv) { return [1, 0.6 * uv[1], 0, s]; }, b: function () { return [0, 1, 0.3, 0]; } });
    }
    for (var i = 0; i < 9; i++) for (s = -1; s <= 1; s += 2) {
      var z = 0.3 - i * 0.075, hip = V(s * 0.12, -0.05, z), tip = V(s * 0.3, -0.1, z - 0.02), ph = -i * 0.8 + (s > 0 ? 0 : PI);
      body.add(L.sweep(L.curvePts([hip, V(s * 0.24, -0.04, z), tip], 6), function (t) { return 0.012 * (1 - 0.5 * t); }, 4, true), { col: cU, a: function (p, uv) { return [1, 0, uv[1], ph]; } });
    }
    return { body: body, fin: finK, bodyMat: { mode: 'crawl', wave: [0, 1, 1, 0], head: 0.4, flut: [1.2, 0.02, 3.2, 0.025], sss: 0xffe0b0, sssK: 0.08, rough: 0.6 }, finMat: {} };
  };

  M.sea_firefly = function () {
    // an ostracod: a bean-shaped clear double shell with a glowing body inside, two swimming antennae
    var body = new L.Kit(), finK = new L.Kit();
    finK.add(L.blob(18, 12), { m: L.mat(V(0, 0, 0), 0.3, 0.36, 0.5), col: function (p, n) { var seam = Math.abs(p.x) < 0.02 ? 0.7 : 1; return L.lin(0xD8F0FF).multiplyScalar(seam); } });
    body.add(L.blob(12, 8), { m: L.mat(V(0, -0.02, 0.0), 0.16, 0.22, 0.32), col: L.lin(0x9FD8FF), b: [0, 0, 0, 1] });
    body.add(L.blob(8, 6), { m: L.mat(V(0, 0.12, 0.32), 0.05, 0.05, 0.05), col: L.lin(0x101820) });
    for (var s = -1; s <= 1; s += 2) {
      var an = L.curvePts([V(s * 0.05, -0.05, 0.42), V(s * 0.28, -0.12, 0.62), V(s * 0.5, -0.3, 0.55)], 8);
      body.add(L.sweep(an, function (t) { return 0.03 * (1 - 0.7 * t); }, 4, true), { col: L.lin(0xCFE8F8), a: function (p, uv) { return [1, 3 * uv[1], 0, s]; }, b: function () { return [0, 1, -0.3, 0.2]; } });
    }
    return { body: body, fin: finK, bodyMat: { mode: 'still', flut: [9, 0.05, 0, 0], glow: 0x2FA8FF, glowK: 2.4, sss: 0xc0e8ff, sssK: 0.5, rough: 0.2 }, finMat: { opacity: 0.4, sss: 0xc8f0ff, sssK: 0.6, rough: 0.1 }, halos: [[0, 0, 0, 3.0, 0.9]] };
  };

  /* ------------------------------------------------------------------ */
  /* Jellyfish and nautilus                                              */
  /* ------------------------------------------------------------------ */
  M.halo_jelly = function () {
    var body = new L.Kit(), finK = new L.Kit();
    // bell: outer dome then the inner surface back to the middle (gives the jelly thickness)
    var prof = [];
    for (var i = 0; i <= 16; i++) { var t = i / 16, a = t * PI / 2; prof.push(new T.Vector2(Math.sin(a) * 0.5 * (1 + 0.04 * Math.sin(t * PI)), 0.34 * Math.cos(a))); }
    prof.push(new T.Vector2(0.49, -0.02)); prof.push(new T.Vector2(0.46, -0.01));
    for (i = 16; i >= 0; i--) { var t2 = i / 16, a2 = t2 * PI / 2; prof.push(new T.Vector2(Math.sin(a2) * 0.44, 0.24 * Math.cos(a2) - 0.0)); }
    var bell = new T.LatheGeometry(prof, 48);
    var cBell = L.lin(0xCFF6FF), cRim = L.lin(0xE8FFFF);
    finK.add(bell, {
      col: function (p) { var rr = Math.sqrt(p.x * p.x + p.z * p.z); return L.mixC(cBell, cRim, L.sstep(0.38, 0.5, rr)); },
      a: function (p) { var rr = Math.sqrt(p.x * p.x + p.z * p.z); return [0, 0, L.sstep(0.05, 0.5, rr), 0]; },
      b: function (p) { var rr = Math.sqrt(p.x * p.x + p.z * p.z), ang = Math.atan2(p.z, p.x); var ring = rr > 0.43 && p.y < 0.06 ? 1 : 0; var canal = Math.pow(Math.abs(Math.cos(ang * 2)), 60) * L.sstep(0.05, 0.4, rr) * 0.6; return [0, 0, 0, Math.max(ring, canal)]; }
    });
    // four gonads hanging inside the bell, a mouth stalk in the middle
    for (var k = 0; k < 4; k++) {
      var ga = k * PI / 2 + PI / 4, gp = V(Math.cos(ga) * 0.2, 0.1, Math.sin(ga) * 0.2);
      body.add(L.sweep(L.curvePts([V(Math.cos(ga - 0.5) * 0.17, 0.13, Math.sin(ga - 0.5) * 0.17), V(Math.cos(ga) * 0.26, 0.1, Math.sin(ga) * 0.26), V(Math.cos(ga + 0.5) * 0.17, 0.13, Math.sin(ga + 0.5) * 0.17)], 8), function (t) { return 0.025 * Math.sin(Math.PI * (0.15 + 0.7 * t)); }, 6, true), { col: L.lin(0x9CCFB8), a: [0, 0, 0.4, 0], b: [0, 0, 0, 0.15] });
    }
    var man = new T.LatheGeometry([new T.Vector2(0.001, 0.2), new T.Vector2(0.05, 0.16), new T.Vector2(0.06, 0.02), new T.Vector2(0.08, -0.06), new T.Vector2(0.001, -0.05)], 12);
    body.add(man, { m: new T.Matrix4().makeScale(0.7, 0.8, 0.7), col: L.lin(0xB8DCD0), a: [0, 0.2, 0.2, 0], b: [0, 0, 0, 0.08] });
    // many thin tentacles from the rim, longer every other one
    for (k = 0; k < 28; k++) {
      var ta = k / 28 * PI * 2, len = (k % 2 ? 0.9 : 1.6) * (0.85 + 0.3 * ((k * 37) % 7) / 7);
      var st = V(Math.cos(ta) * 0.47, -0.01, Math.sin(ta) * 0.47);
      var pts = []; for (var j = 0; j <= 14; j++) { var q = j / 14; pts.push(V(st.x * (1 - 0.25 * q), st.y - q * len, st.z * (1 - 0.25 * q))); }
      finK.add(L.sweep(pts, function (q) { return 0.008 * (1 - 0.7 * q); }, 4, true), { col: L.lin(0xE6FFFF), a: function (p, uv) { return [0, uv[1], 0.6 * (1 - uv[1]), k * 0.9]; }, b: function (p, uv) { return [0, 0, 0, uv[1] > 0.92 ? 0.8 : 0.1]; } });
    }
    return { body: body, fin: finK, bodyMat: { mode: 'jelly', glow: 0x7FE8FF, glowK: 1.4, sss: 0xc0ffff, sssK: 0.5, rough: 0.2 }, finMat: { mode: 'jelly', opacity: 0.32, glow: 0x7FE8FF, glowK: 1.8, sss: 0xd0ffff, sssK: 0.9, rough: 0.08 }, halos: [[0, 0.02, 0, 2.2, 0.55]] };
  };

  M.spiral_drifter = function () {
    var body = new L.Kit(), finK = new L.Kit();
    // shell: a tube swept along a growing spiral (coils around the X axis), aperture faces forward (+Z)
    var pts = [], radii = [], N = 90, turns = 2.2, a0 = 0.0155;
    for (var i = 0; i <= N; i++) { var t = i / N, T2 = t * turns, th = -PI * 2 * turns * (1 - t) + 0.4, rad = a0 * Math.exp(1.163 * T2); pts.push(V(0, Math.sin(th) * rad * 1.55, Math.cos(th) * rad * 1.55)); radii.push(rad); }
    var cS = L.lin(0xD8CCB4), cF = L.lin(0x8A5530);
    body.add(L.sweep(pts, function (t) { return radii[Math.min(N, Math.round(t * N))] * (t > 0.995 ? 0.98 : 1); }, 18), {
      col: function (p, n, uv) { var t = uv[1]; var c = cS.clone(); var flame = Math.sin(t * 70 + Math.sin(uv[0] * 12) * 1.5); if (flame > 0.55 && uv[0] > 0.1 && uv[0] < 0.9) c = L.mixC(c, cF, 0.65); return c; },
      a: [0, 0, 0, 0],
      b: function (p, uv) { var t = uv[1]; var ring = Math.pow(Math.abs(Math.sin(t * 30)), 24) * L.sstep(0.3, 0.7, t); return [0, 0, 0, ring]; }
    });
    // soft body in the aperture: hood, eyes, and a crown of short tentacles, all pointing out of the opening
    var ap = pts[N], apR = radii[N], tan = pts[N].clone().sub(pts[N - 4]).normalize(), side = V(1, 0, 0), upv = new T.Vector3().crossVectors(tan, side).normalize();
    var inner = ap.clone().addScaledVector(tan, -apR * 0.15);
    body.add(L.blob(14, 10), { m: new T.Matrix4().makeBasis(side, upv, tan).scale(V(apR * 0.8, apR * 0.75, apR * 0.45)).setPosition(inner), col: L.lin(0xB89A80) });
    body.add(L.blob(12, 8), { m: new T.Matrix4().makeBasis(side, upv, tan).scale(V(apR * 0.85, apR * 0.35, apR * 0.5)).setPosition(inner.clone().addScaledVector(upv, apR * 0.55)), col: L.lin(0x8C6A52) }); // the hood
    for (var s = -1; s <= 1; s += 2) body.add(L.blob(10, 8), { m: L.mat(inner.clone().addScaledVector(side, s * apR * 0.72).addScaledVector(upv, apR * 0.15).addScaledVector(tan, apR * 0.15), apR * 0.12, apR * 0.16, apR * 0.16), col: L.lin(0x0c0c0c) });
    for (var k = 0; k < 26; k++) {
      var ang = k / 26 * PI * 2, rr2 = apR * (0.25 + 0.3 * ((k * 7) % 3) / 2);
      var st = inner.clone().addScaledVector(side, Math.cos(ang) * rr2).addScaledVector(upv, Math.sin(ang) * rr2 * 0.6 - apR * 0.15).addScaledVector(tan, apR * 0.3);
      var len = apR * (0.45 + 0.35 * ((k * 13) % 5) / 5), dir = tan.clone().addScaledVector(side, Math.cos(ang) * 0.4).addScaledVector(upv, Math.sin(ang) * 0.3 - 0.2).normalize();
      body.add(L.sweep(L.curvePts([st, st.clone().addScaledVector(dir, len * 0.5), st.clone().addScaledVector(dir, len).addScaledVector(upv, -len * 0.3)], 7), function (t) { return apR * 0.045 * (1 - 0.6 * t); }, 4, true), { col: L.lin(0xD2B89E), a: function (p, uv) { return [0, 1.2 * uv[1], 0, k]; }, b: function () { return [0.3, 1, 0.3, 0]; } });
    }
    return { body: body, fin: finK, bodyMat: { mode: 'fish', wave: [0, 1, 1, 0], head: 0.4, flut: [1.6, 0.02, 0, 0], glow: 0x8E6BFF, glowK: 2.2, sss: 0xffe8c8, sssK: 0.1, rough: 0.3 }, finMat: {}, halos: [[0, 0, -0.02, 1.6, 0.45]] };
  };

  /* ------------------------------------------------------------------ */
  /* Flora and patches (grow along +Y from y = 0)                        */
  /* ------------------------------------------------------------------ */
  M.ghost_fire_fungus = function () {
    var body = new L.Kit(), rand = rnd(11);
    var cSt = L.lin(0xA8B898), cCap = L.lin(0x8CA874), cGill = L.lin(0xC8F0A0);
    body.add(L.sweep(L.curvePts([V(-0.45, 0.0, -0.1), V(0, 0.03, 0), V(0.45, 0.0, 0.12)], 10), function (t) { return 0.07 * (1 - 0.3 * Math.abs(t - 0.5)); }, 9, true), { col: function (p) { return L.lin(0x5B4A38).multiplyScalar(0.7 + 0.5 * Math.abs(Math.sin(p.x * 60 + L.vnoise(p.x * 9, p.y * 9, p.z * 9) * 3))); } }); // a rotten branch
    for (var i = 0; i < 9; i++) {
      var a = rand() * PI * 2, d = 0.05 + rand() * 0.24, h = 0.1 + rand() * 0.24, cr = 0.07 + rand() * 0.07, lean = (rand() - 0.5) * 0.5;
      var b0 = V(Math.cos(a) * d, 0.02, Math.sin(a) * d), tip = b0.clone().add(V(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h));
      var ph = rand() * 6;
      body.add(L.sweep(L.curvePts([b0, b0.clone().lerp(tip, 0.5).add(V(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03)), tip], 7), function (t) { return 0.011 * (1 - 0.3 * t); }, 5), { col: cSt, a: function (p, uv) { return [1, uv[1], 0, ph]; }, b: [1, 0, 0.5, 0.25] });
      var cap = new T.LatheGeometry([new T.Vector2(0.001, 0.5), new T.Vector2(0.4, 0.42), new T.Vector2(0.75, 0.22), new T.Vector2(1.0, 0.0), new T.Vector2(0.9, -0.05), new T.Vector2(0.5, -0.02), new T.Vector2(0.001, -0.02)], 14);
      body.add(cap, { m: L.mat(tip, cr, cr * 0.9, cr), col: function (p, n) { return n.y < -0.2 ? cGill : cCap; }, a: [1, 1, 0, ph], b: function (p, uv, lp) { return [1, 0, 0.5, lp.y < 0.05 ? 1.0 : 0.35]; } });
    }
    return { body: body, fin: new L.Kit(), bodyMat: { mode: 'still', flut: [0.7, 0.01, 0, 0], glow: 0x9BFF6A, glowK: 1.3, sss: 0xd8ffc8, sssK: 0.15, rough: 0.55 }, finMat: {}, halos: [[0, 0.35, 0, 1.4, 0.5]], up: 'surface' };
  };

  function mossPatch(o) {
    var body = new L.Kit(), rand = rnd(o.seed || 5);
    var cBase = L.lin(o.base), cTip = L.lin(o.tip);
    var mound = new T.SphereGeometry(1, 20, 10, 0, PI * 2, 0, PI / 2);
    body.add(mound, { m: L.mat(V(0, -0.02, 0), 0.5, 0.12, 0.5), col: function (p) { return cBase.clone().multiplyScalar(0.7 + 0.5 * (0.5 + 0.5 * L.vnoise(p.x * 9, p.y * 9, p.z * 9))); } });
    for (var i = 0; i < o.n; i++) {
      var a = rand() * PI * 2, d = Math.sqrt(rand()) * 0.48, y0 = 0.12 * Math.sqrt(Math.max(0, 1 - (d / 0.5) * (d / 0.5))) - 0.03;
      var h = o.h * (0.5 + rand() * 0.8), lean = (rand() - 0.5) * 0.6, glow = o.glow && rand() < 0.55 ? 1 : 0;
      var b0 = V(Math.cos(a) * d, y0, Math.sin(a) * d), tp = b0.clone().add(V(lean * h, h, (rand() - 0.5) * 0.6 * h)), ph = rand() * 6;
      body.add(L.sweep(L.curvePts([b0, b0.clone().lerp(tp, 0.6).add(V(0, 0, 0)), tp], 4), function (t) { return o.r * (1 - 0.7 * t); }, 4, true), { col: function (p, n, uv) { return L.mixC(cBase, cTip, uv[1]); }, a: function (p, uv) { return [1, uv[1], 0, ph]; }, b: function (p, uv) { return [1, 0, 0.6, glow * L.sstep(0.6, 1, uv[1])]; } });
      if (glow) body.add(L.blob(6, 4), { m: L.mat(tp, o.r * 1.3), col: cTip, a: [1, 1, 0, ph], b: [1, 0, 0.6, 1] });
    }
    return body;
  }
  M.glimmer_moss = function () {
    return { body: mossPatch({ base: 0x203A2E, tip: 0x8FE8D0, n: 320, h: 0.05, r: 0.006, glow: true, seed: 7 }), fin: new L.Kit(), bodyMat: { mode: 'still', flut: [0.6, 0.01, 0, 0], glow: 0x29F0C8, glowK: 1.6, sss: 0xa0ffe0, sssK: 0.35, rough: 0.7 }, finMat: {}, halos: [[0, 0.1, 0, 1.4, 0.4]], up: 'surface' };
  };
  M.stalag_moss = function () {
    return { body: mossPatch({ base: 0x34461F, tip: 0x7C9448, n: 420, h: 0.045, r: 0.007, glow: false, seed: 3 }), fin: new L.Kit(), bodyMat: { mode: 'still', flut: [0.6, 0.008, 0, 0], sss: 0xc8ff90, sssK: 0.3, rough: 0.8 }, finMat: {}, up: 'surface' };
  };

  M.sulfur_mat = function () {
    // a ragged slimy sheet on the floor with streaming white filaments
    var body = new L.Kit(), finK = new L.Kit(), rand = rnd(17);
    var disc = new T.CircleGeometry(0.5, 64, 0, PI * 2);
    // add rings so the sheet can ripple
    var rings = new T.RingGeometry(0.0, 0.5, 64, 10);
    var pos = rings.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), rr = Math.sqrt(x * x + y * y), ang = Math.atan2(y, x);
      var edge = 0.5 * (0.72 + 0.28 * (0.5 + 0.5 * L.vnoise(Math.cos(ang) * 2, Math.sin(ang) * 2, 4.1)));
      var k = rr / 0.5; pos.setXYZ(i, Math.cos(ang) * k * edge, Math.sin(ang) * k * edge, 0.03 + 0.02 * L.vnoise(x * 12, y * 12, 1) + 0.03 * (1 - k * k));
    }
    disc.dispose();
    rings.computeVertexNormals();
    var cM = L.lin(0xB2AB96), cY = L.lin(0xA49A66), cD = L.lin(0x6E6652);
    body.add(rings, { m: new T.Matrix4().makeRotationX(-PI / 2), col: function (p) { var n = L.vnoise(p.x * 14, p.z * 14, 2); return n > 0.3 ? L.mixC(cM, cY, 0.5) : n < -0.4 ? L.mixC(cM, cD, 0.4) : cM; }, a: function (p) { var rr = Math.sqrt(p.x * p.x + p.z * p.z); return [1, rr * 2, 0, rr * 9]; }, b: [0, 1, 0, 0] });
    for (i = 0; i < 46; i++) {
      var a = rand() * PI * 2, d = 0.15 + rand() * 0.3, b0 = V(Math.cos(a) * d, 0.02, Math.sin(a) * d), len = 0.05 + rand() * 0.12;
      body.add(L.sweep(L.curvePts([b0, b0.clone().add(V(Math.cos(a) * len * 0.4, len * 0.6, Math.sin(a) * len * 0.4)), b0.clone().add(V(Math.cos(a) * len, len * 0.8, Math.sin(a) * len))], 5), function (t) { return 0.006 * (1 - 0.8 * t); }, 3, true), { col: cM, a: function (p, uv) { return [1, uv[1], 0, a * 3]; }, b: [1, 0.3, 0.5, 0] });
    }
    return { body: body, fin: finK, bodyMat: { mode: 'still', flut: [0.8, 0.02, 0, 0], sss: 0xffffff, sssK: 0.2, rough: 0.25 }, finMat: { opacity: 0.88, sss: 0xffffff, sssK: 0.45, rough: 0.15 }, up: 'surface' };
  };

  M.glowworm = function () {
    // a ceiling patch: mucus hammocks with glowing larvae, each letting down sticky silk threads beaded with droplets.
    // Placed on a ceiling, local +Y points down into the room, so the threads hang along +Y.
    var body = new L.Kit(), finK = new L.Kit(), rand = rnd(23), halos = [];
    var cL = L.lin(0xCFEFE8), cS = L.lin(0xE8F4F4);
    for (var i = 0; i < 11; i++) {
      var a = rand() * PI * 2, d = Math.sqrt(rand()) * 0.42, x = Math.cos(a) * d, z = Math.sin(a) * d;
      // hammock tube and larva (glowing tail end)
      var hamm = L.curvePts([V(x - 0.04, 0.01, z), V(x, 0.025, z + 0.01), V(x + 0.04, 0.01, z)], 6);
      finK.add(L.sweep(hamm, 0.008, 5, true), { col: cS });
      body.add(L.sweep(L.curvePts([V(x - 0.03, 0.02, z), V(x, 0.028, z + 0.008), V(x + 0.03, 0.022, z)], 6), function (t) { return 0.004 * (0.6 + 0.4 * Math.sin(PI * t)); }, 4, true), { col: cL, b: function (p, uv) { return [0, 0, 0, uv[1] > 0.7 ? 1 : 0.15]; } });
      halos.push([x + 0.03, 0.025, z, 0.7, 0.9]);
      // snares
      var nT = 2 + Math.floor(rand() * 3);
      for (var k = 0; k < nT; k++) {
        var tx = x + (rand() - 0.5) * 0.05, tz = z + (rand() - 0.5) * 0.05, len = 0.25 + rand() * 0.6, ph = rand() * 6;
        var pts = []; for (var j = 0; j <= 10; j++) pts.push(V(tx, 0.02 + len * j / 10, tz));
        finK.add(L.sweep(pts, 0.0022, 3, false), { col: cS, a: function (p, uv) { return [1, uv[1], 0, ph]; }, b: [1, 0, 0.7, 0.05] });
        for (var dIdx = 0; dIdx < 7; dIdx++) {
          var q = 0.15 + dIdx / 7 * 0.85;
          finK.add(L.blob(6, 4), { m: L.mat(V(tx, 0.02 + len * q, tz), 0.006 + 0.004 * (dIdx % 2)), col: L.lin(0xF4FFFF), a: [1, q, 0, ph], b: [1, 0, 0.7, 0.35] });
        }
      }
    }
    return { body: body, fin: finK, bodyMat: { mode: 'still', flut: [0.5, 0.025, 0, 0], glow: 0x7FE8FF, glowK: 2.0, sss: 0xc0ffff, sssK: 0.4, rough: 0.3 }, finMat: { opacity: 0.55, glow: 0x7FE8FF, glowK: 1.2, sss: 0xe0ffff, sssK: 0.8, rough: 0.05 }, halos: halos, up: 'surface' };
  };

  L.models = M;
  L.rnd = rnd;
  // The fish builders, shared with creatures-pred-models.js (the predators).
  L.kit2 = { fish: fish, fishR: fishR, barbel: barbel, cones: cones, eel: eel, A: A, B: B };
})();
