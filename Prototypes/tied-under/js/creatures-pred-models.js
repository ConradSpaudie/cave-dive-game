/*
 * creatures-pred-models.js: procedural 3D models for the six predators (no image or model files).
 *
 * Same rules as creatures-models.js (read that file first):
 *   model space: forward +Z, up +Y, body length 1 (z -0.5 tail to +0.5 nose), scaled to real size later.
 *   Each builder returns { body: Kit, fin: Kit, bodyMat, finMat, halos?, tellHalos?, lure? }.
 *   tellHalos are glow sprites that only light up while the predator is warning you (eyes flaring).
 *
 * The predators:
 *   bull_shark      Cenote Bull Shark (real animal). Stocky grey body, blunt snout, underslung jaw.
 *   pale_barracuda  Pale Cave Barracuda. Long silver pike shape, jutting lower jaw full of fangs.
 *   gulper_eel      Gulper Ambush Eel. A moray with an enormous hinged mouth that lives in wall holes.
 *   cave_lurker     Cave Lurker. A huge pale salamander with a crocodile's head and teeth.
 *   spider_squid    Spider Squid. Wine-red squid with long glowing arms that spread to grab.
 *   the_maw         The Maw. An armored lobe-finned giant with glowing lure lines and bone blade jaws.
 *
 * Owner: predators agent (creatures*.js).
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, L = TU._cr = TU._cr || {};
  if (!L.Kit || !L.kit2 || !L.models) return;
  var K2 = L.kit2, M = L.models, PI = Math.PI;
  var lin = L.lin, mixC = L.mixC, sstep = L.sstep, vn = L.vnoise;
  function V(x, y, z) { return new T.Vector3(x, y, z); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) { return a + (b - a) * t; }
  // Animation attributes: A(wave, flutter, leg or jaw, phase), B(flutter direction x, y, z, glow mask)
  function A(w, f, l, ph) { return [w, f || 0, l || 0, ph || 0]; }
  function B(x, y, z, g) { return [x || 0, y || 0, z || 0, g || 0]; }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  // A tooth (or spike, or claw): a cone from base along dir. flat < 1 flattens it like a blade.
  function tooth(kit, base, dir, len, rad, col, a, flat) {
    var d = dir.clone().normalize();
    kit.add(new T.ConeGeometry(1, 1, 5, 1), { m: L.matAlong(base.clone().addScaledVector(d, len * 0.5), d, rad, len, rad * (flat || 1)), col: col, a: a || A(1) });
  }
  // An eye with eyeshine: a dark ball and a reflective layer behind the pupil (the tapetum) that
  // glows with the material glow color. side = +1 right eye, -1 left eye. look = direction it faces.
  function eye(kit, pos, rad, side, ball, shine, a, look) {
    var lk = look || V(side, 0, 0);
    kit.add(L.blob(14, 10), { m: L.mat(pos, rad * 0.62, rad, rad * 1.05), col: lin(ball), a: a || A(1) });
    kit.add(L.blob(12, 8), { m: L.mat(pos.clone().addScaledVector(lk, rad * 0.36), rad * 0.3, rad * 0.62, rad * 0.62), col: lin(shine), a: a || A(1), b: B(0, 0, 0, 1) });
  }
  // Split a head into a skull and a hinged lower jaw that close on a flat mouth line.
  // o: { r, w, h, y (functions of u = z + 0.5), uA (where the mouth starts), jawFrac (share of the head
  //      height that is jaw), fbS / ftJ (how flat the skull bottom / jaw top are), blend }
  // Returns { h, y, fb } for the body spine, jaw (a ready spine geometry), seam(u), top(u), bot(u), hinge [x,y,z].
  function headSplit(o) {
    var r = o.r, w = o.w, h = o.h, y = o.y, uA = o.uA, jf = o.jawFrac, fbS = o.fbS == null ? 0.12 : o.fbS, ftJ = o.ftJ == null ? 0.12 : o.ftJ, bl = o.blend || 0.025;
    function k(u) { return sstep(uA, uA + bl, u); }
    function top(u) { return y(u) + r(u) * h(u); }
    function bot(u) { return y(u) - r(u) * h(u); }
    function seam(u) { return bot(u) + jf * 2 * r(u) * h(u); }
    function Hs(u) { return (top(u) - seam(u)) / (1 + fbS); }
    var S = {
      h: function (u) { var kk = k(u); return kk ? mix(h(u), Hs(u) / Math.max(r(u), 1e-4), kk) : h(u); },
      y: function (u) { var kk = k(u); return kk ? mix(y(u), top(u) - Hs(u), kk) : y(u); },
      fb: function (u) { return mix(1, fbS, k(u)); },
      seam: seam, top: top, bot: bot,
      hinge: [0, seam(uA + 0.01), uA - 0.5 + 0.004]
    };
    // the jaw: from the mouth corner to the nose
    var g = function (lu) { return uA + (1 - uA) * lu; };
    S.jaw = function (rings, segs) {
      return L.spine({ rings: rings || 22, segs: segs || 16, z0: uA - 0.5, z1: 0.5 + (o.jawOver || 0),
        r: function (lu) { return Math.max(r(Math.min(1, g(lu))) * (o.jawR || 0.97), 0.003); },
        w: function (lu) { return w(Math.min(1, g(lu))) * (o.jawW || 0.95); },
        h: function (lu) { var u = Math.min(1, g(lu)), Hj = (seam(u) - bot(u)) / (1 + ftJ); return Hj / Math.max(r(u) * (o.jawR || 0.97), 1e-4); },
        y: function (lu) { var u = Math.min(1, g(lu)), Hj = (seam(u) - bot(u)) / (1 + ftJ); return bot(u) + Hj; },
        flatTop: ftJ });
    };
    return S;
  }
  // Teeth along a mouth rim from u0 to u1 (pairs, left and right). o: { n, x(u) (rim half width), y(u), up: +1 points up (lower jaw) or -1 down,
  //   len(t), rad(t), back (lean backward), inward, col, a, flat }
  function teethRow(kit, o) {
    for (var i = 0; i < o.n; i++) {
      var t = o.n > 1 ? i / (o.n - 1) : 0, u = mix(o.u0, o.u1, t), z = u - 0.5, x = o.x(u), yy = o.y(u);
      for (var s = -1; s <= 1; s += 2) {
        if (x < 0.002 && s > 0) continue;
        tooth(kit, V(s * x, yy, z), V(-s * (o.inward || 0.15), o.up, -(o.back || 0.2)), o.len(t), o.rad(t), o.col, o.a, o.flat);
      }
    }
  }
  // A thin fin fold running along the top or bottom of a body between u0 and u1.
  function fold(kit, o) {
    var outl = L.outline(o.n || 30, function (t) { var u = mix(o.u0, o.u1, t); return [u, o.edge(u) + o.side * o.hgt * o.prof(t)]; });
    var g = L.fin([o.u0, o.edge(o.u0) - o.side * 0.003], [o.u1, o.edge(o.u1) - o.side * 0.003], outl, function (a, b) { return V(0, b, a - 0.5 - (o.sweep || 0) * Math.abs(b - o.edge(clamp(a, 0, 1)))); }, 3);
    kit.add(g, { col: o.col, a: function (p, uv) { return A(1, (o.flut || 0.6) * uv[1], 0, uv[0] * (o.waves || 12)); }, b: function () { return B(1, 0, 0, 0); } });
  }

  /* ------------------------------------------------------------------ */
  /* 1. Cenote Bull Shark                                                */
  /* ------------------------------------------------------------------ */
  M.bull_shark = function () {
    var rr = function (u) {
      if (u < 0.04) return 0.02 + 0.006 * u / 0.04;
      if (u < 0.6) return 0.026 + 0.128 * Math.pow(Math.sin((u - 0.04) / 0.56 * PI / 2), 1.3);
      var t = (u - 0.6) / 0.4; return 0.154 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 0.45) + 0.004;
    };
    var ww = function (u) { return u < 0.2 ? 0.68 + 0.14 * u / 0.2 : u > 0.85 ? 0.82 + 0.12 * (u - 0.85) / 0.15 : 0.82; };
    var hh = function (u) { return u > 0.82 ? 1.02 - 0.24 * sstep(0.82, 1, u) : 1.02; };
    var yy = function (u) { return -0.012 * sstep(0.6, 1, u) + 0.006 * sstep(0, 0.3, u); };
    var bot = function (u) { return yy(u) - rr(u) * hh(u) * 0.9; };
    var cBack = lin(0x535E66), cSide = lin(0x7A868C), cBelly = lin(0xEFEDE6), cDark = lin(0x22282C), cScar = lin(0xC4CAC8);
    var sharkCol = function (c, p, u, sy) {
      // countershading: a sharp, slightly wavy line just below the middle of the flank
      var line = -0.2 + 0.04 * Math.sin(u * 23);
      var col = mixC(cBelly, cSide, sstep(line - 0.08, line + 0.08, sy)).lerp(cBack, sstep(0.2, 0.95, sy));
      // five gill slits in front of the pectoral fins
      for (var g = 0; g < 5; g++) { var gu = 0.715 + g * 0.0165; if (Math.abs(u - gu) < 0.0026 && sy > -0.6 + 0.04 * g && sy < 0.34 - 0.03 * g) col = mixC(col, cDark, 0.7); }
      // darker snout top, fine skin texture, a few faint healed scars (bull sharks are scarred)
      if (u > 0.9 && sy > 0.2) col.multiplyScalar(0.88);
      col.multiplyScalar(1 + 0.035 * vn(p.x * 60, p.y * 60, p.z * 60));
      var sc = Math.abs(Math.sin(p.z * 57 + p.y * 33 + Math.sin(p.x * 21) * 2.2));
      if (sc > 0.9985 && u > 0.4 && u < 0.8 && sy > 0.1) col = mixC(col, cScar, 0.3);
      return col;
    };
    var f = K2.fish({ r: rr, w: ww, h: hh, y: yy, back: 0x535E66, side: 0x7A868C, belly: 0xEFEDE6, mouth: false, scales: 0, rings: 150, segs: 36, flatBelly: 0.9, colFn: sharkCol,
      finCol: 0x56616A,
      fins: [{ t: 'dorsal', u0: 0.49, u1: 0.645, h: 0.175, sweep: 0.75, col: 0x56616A, edge: 0x30383D, rays: 0.04, top: function (t) { return t < 0.6 ? Math.pow(t / 0.6, 0.75) : Math.pow((1 - t) / 0.4, 1.5); }, flut: 0.15 },
        { t: 'dorsal', u0: 0.19, u1: 0.235, h: 0.042, sweep: 0.6, col: 0x56616A, edge: 0x30383D, rays: 0.04, flut: 0.2 },
        { t: 'anal', u0: 0.17, u1: 0.215, h: 0.036, sweep: 0.6, col: 0x9AA2A4, rays: 0.04, flut: 0.2 },
        { t: 'pelvic', u: 0.36, l: 0.075, spread: 0.55, droop: 0.55, col: 0xB8BEBE, rays: 0.04, flut: 0.3 }] });
    var body = f.body, finK = f.fin;
    // heterocercal tail: the long upper lobe carries on the line of the spine, a shorter lower lobe below
    var ty = yy(0.03), cT = lin(0x4F5960), cTe = lin(0x262C30);
    var cOut = [[0.01, -0.032], [0.04, -0.072], [0.075, -0.112], [0.106, -0.142], [0.1, -0.1], [0.094, -0.058], [0.1, -0.016], [0.13, 0.03], [0.165, 0.08], [0.2, 0.135], [0.235, 0.188], [0.258, 0.216], [0.248, 0.2], [0.2, 0.162], [0.14, 0.108], [0.085, 0.068], [0.035, 0.042]];
    var cg = L.fin([0, -0.02], [0, 0.026], cOut, function (a, b) { return V(0, ty + b, -0.475 - a); }, 5);
    finK.add(cg, { col: function (p, n, uv) { return mixC(cT, cTe, sstep(0.6, 1, uv[1])); }, a: function (p, uv) { return A(1, 0.25 * uv[1], 0, 0); }, b: function () { return B(1, 0, 0, 0); } });
    // big stiff pectoral fins. They drop (the "hunch" warning display) with the action value.
    var xb = rr(0.66) * ww(0.66) * 0.8, yb = yy(0.66) - rr(0.66) * hh(0.66) * 0.5;
    var pOut = [[0.3, -0.006], [0.6, -0.032], [0.85, -0.072], [1.0, -0.098], [0.78, -0.04], [0.52, 0.0], [0.26, 0.04], [0.02, 0.072]];
    for (var s = -1; s <= 1; s += 2) {
      (function (s) {
        var g = L.fin([0, 0], [0, 0.072], pOut, function (a, b) { return V(s * (xb + a * 0.21), yb - a * 0.07 + b * 0.12, 0.115 + b); }, 4);
        finK.add(g, { col: function (p, n, uv) { return mixC(lin(0x5A656C), cTe, sstep(0.75, 1, uv[1])); },
          a: function (p) { var sp = clamp((Math.abs(p.x) - xb) / 0.21, 0, 1); return A(1, -sp, 0, 0); }, b: function () { return B(s * -0.015, -0.075, -0.01, 0); } });
      })(s);
    }
    // the underslung mouth: a crescent behind the snout, a hinged lower jaw, rows of broad triangular teeth
    var hingeY = bot(0.79) + 0.012;
    var jaw = L.spine({ rings: 18, segs: 18, z0: 0.29, z1: 0.418, r: function (lu) { return 0.066 * Math.sqrt(Math.max(0, 1 - Math.pow(lu, 3))) + 0.006; }, w: function () { return 1.42; }, h: function () { return 0.32; },
      y: function (lu) { var u = 0.79 + 0.128 * lu; return bot(u) - 0.017; }, flatTop: 0.4 });
    body.add(jaw, { col: function (p, n) { return n.y > 0.3 && Math.abs(p.x) < 0.07 ? lin(0x7A3A3E) : cBelly.clone().multiplyScalar(0.95); }, a: A(1, 0, 1, 0) });
    body.add(L.blob(14, 8), { m: L.mat(V(0, bot(0.86) + 0.008, 0.36), 0.082, 0.022, 0.052), col: lin(0x2A0C10) }); // mouth cavity
    var cTooth = lin(0xF0ECE0);
    for (var i = 0; i < 15; i++) {
      var ang = (i / 14 - 0.5) * 2.3, x = Math.sin(ang) * 0.088, z = 0.305 + Math.cos(ang) * 0.1, big = 1 - 0.45 * Math.abs(i / 14 - 0.5) * 2;
      tooth(body, V(x, bot(z + 0.5) + 0.004, z), V(-x * 1.5, -1, 0.12), 0.026 * big + 0.008, 0.0075 * big + 0.002, cTooth, A(1), 0.4);
      tooth(body, V(x * 0.92, bot(z + 0.5) - 0.006, z - 0.006), V(-x * 1.5, 1, -0.08), 0.022 * big + 0.006, 0.006 * big + 0.002, cTooth, A(1, 0, 1, 0), 0.5);
    }
    for (s = -1; s <= 1; s += 2) body.add(L.blob(8, 6), { m: L.mat(V(s * 0.04, bot(0.955) + 0.006, 0.452), 0.006, 0.0015, 0.004, 0, s * 0.5, 0), col: lin(0x3a4246) }); // nostrils (small slits under the snout)
    // small, cold eyes with a green eyeshine
    var eu = 0.885, ex = rr(eu) * ww(eu) * 0.9, ey = yy(eu) + rr(eu) * hh(eu) * 0.26, ez = eu - 0.5, eyes = [];
    for (s = -1; s <= 1; s += 2) { eye(body, V(s * ex, ey, ez), 0.0125, s, 0x0b0d0c, 0x203020); eyes.push([s * (ex + 0.006), ey, ez, 0.07, 0.85]); }
    return { body: body, fin: finK,
      bodyMat: { mode: 'fish', wave: [0.06, 0.82, 2.3, 0.0], head: 0.12, flut: [1.3, 0.01, 0, 0], hinge: [0, hingeY, 0.29, 0.85], glow: 0xB8FFA0, glowK: 2.4, sss: 0x9aa8b0, sssK: 0.08, rough: 0.48 },
      finMat: { opacity: 1, rough: 0.55, sss: 0x9aa8b0, sssK: 0.08 }, tellHalos: eyes };
  };

  /* ------------------------------------------------------------------ */
  /* 2. Pale Cave Barracuda                                              */
  /* ------------------------------------------------------------------ */
  M.pale_barracuda = function () {
    var rr = K2.fishR(0.08, 0.46, 0.2, 0.9);
    var cBar = lin(0x47535A), cMouth = lin(0x23282B), cSpot = lin(0x1C2226);
    var f = K2.fish({ r: rr, w: function () { return 0.7; }, h: function () { return 1.02; }, y: function () { return 0; }, back: 0x76858C, side: 0xD0D9DC, belly: 0xF3F5F3, lateral: 0x9AA7AC, mouth: false, scales: 0.09, rings: 70, segs: 24,
      colFn: function (c, p, u, sy) {
        // faint chevron bars on the upper flank, a few black spots near the tail, a dark mouth line and gill edge
        if (sy > -0.05 && u > 0.18 && u < 0.8) { var band = Math.sin(u * 64 - Math.abs(sy) * 2.6); if (band > 0.45) c = mixC(c, cBar, 0.5 * sstep(-0.1, 0.4, sy)); }
        if (sy < -0.05 && sy > -0.55 && u > 0.12 && u < 0.4 && vn(p.x * 70, p.y * 70, p.z * 70) > 0.55) c = mixC(c, cSpot, 0.7);
        if (u > 0.865 && Math.abs(sy + 0.1) < 0.032) c = mixC(c, cMouth, 0.85);
        if (Math.abs(u - 0.8) < 0.0045 && sy < 0.55) c = mixC(c, cBar, 0.6);
        return c;
      },
      fins: [{ t: 'caudal', h: 0.135, l: 0.155, fork: 0.78, col: 0x8A969B, edge: 0x262B2F, rays: 0.25, flut: 0.6 },
        { t: 'dorsal', u0: 0.5, u1: 0.575, h: 0.06, sweep: 0.55, col: 0x7A868B, edge: 0x2C3236, rays: 0.5, nRays: 5 },
        { t: 'dorsal', u0: 0.215, u1: 0.27, h: 0.046, sweep: 0.5, col: 0x7A868B, edge: 0x2C3236, rays: 0.3 },
        { t: 'anal', u0: 0.205, u1: 0.26, h: 0.042, sweep: 0.5, col: 0xB4BEC2, edge: 0x3a4044, rays: 0.3 },
        { t: 'pectoral', u: 0.72, l: 0.075, y: -0.45, spread: 0.55, droop: 0.3, col: 0xC9D1D4 },
        { t: 'pelvic', u: 0.48, l: 0.05, col: 0xC9D1D4 }] });
    var body = f.body;
    // the jutting lower jaw, longer than the snout, with a hinge just behind the eye
    var jaw = L.spine({ rings: 18, segs: 14, z0: 0.35, z1: 0.522, r: function (lu) { return 0.025 * Math.sqrt(Math.max(0, 1 - Math.pow(lu, 2.2))) + 0.0025; }, w: function () { return 0.95; }, h: function () { return 0.55; },
      y: function (lu) { return -0.016 + 0.004 * lu; }, flatTop: 0.5 });
    body.add(jaw, { col: function (p, n) { return n.y > 0.4 ? lin(0x3a2a2c) : lin(0xE8ECEC); }, a: A(1, 0, 1, 0) });
    body.add(L.blob(10, 6), { m: L.mat(V(0, -0.01, 0.43), 0.014, 0.007, 0.06), col: lin(0x1a1012) });
    var cT = lin(0xF2F0E8);
    // fangs: a few long canines at the front, a row of small knives behind them
    teethRow(body, { n: 6, u0: 0.885, u1: 0.965, x: function (u) { return rr(u) * 0.62; }, y: function () { return -0.007; }, up: -1, back: 0.25, len: function (t) { return 0.007 + 0.006 * t; }, rad: function () { return 0.0022; }, col: cT, flat: 0.5 });
    for (var s = -1; s <= 1; s += 2) tooth(body, V(s * 0.005, -0.006, 0.48), V(0, -1, -0.3), 0.02, 0.0032, cT, A(1), 0.6);
    teethRow(body, { n: 6, u0: 0.885, u1: 0.99, x: function (u) { return 0.0155 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.855) / 0.18, 2))); }, y: function () { return -0.005; }, up: 1, back: -0.15, len: function (t) { return 0.006 + 0.005 * t; }, rad: function () { return 0.002; }, col: cT, a: A(1, 0, 1, 0), flat: 0.5 });
    for (s = -1; s <= 1; s += 2) tooth(body, V(s * 0.0045, -0.007, 0.508), V(0, 1, 0.15), 0.018, 0.0032, cT, A(1, 0, 1, 0), 0.6);
    // big silver eyes (they flash white when the pack locks on)
    var eu = 0.83, ex = rr(eu) * 0.7 * 0.86, ey = rr(eu) * 0.3, ez = eu - 0.5, eyes = [];
    for (s = -1; s <= 1; s += 2) {
      body.add(L.blob(14, 10), { m: L.mat(V(s * ex, ey, ez), 0.008, 0.016, 0.017), col: lin(0xC8D4DA) });
      body.add(L.blob(12, 8), { m: L.mat(V(s * (ex + 0.004), ey, ez), 0.0045, 0.0105, 0.011), col: lin(0x202a2c), b: B(0, 0, 0, 1) });
      eyes.push([s * (ex + 0.006), ey, ez, 0.09, 0.8]);
    }
    return { body: body, fin: f.fin,
      bodyMat: { mode: 'fish', wave: [0.045, 0.95, 2.3, 0.02], head: 0.25, flut: [1.8, 0.015, 0, 0], hinge: [0, -0.008, 0.362, 0.6], glow: 0xE6F6FF, glowK: 2.2, sss: 0xd0e0e8, sssK: 0.12, rough: 0.22, metal: 0.35 },
      finMat: { opacity: 0.78, sss: 0xd8e4e8, sssK: 0.3, rough: 0.3 }, tellHalos: eyes };
  };

  /* ------------------------------------------------------------------ */
  /* 3. Gulper Ambush Eel                                                */
  /* ------------------------------------------------------------------ */
  M.gulper_eel = function () {
    var body = new L.Kit(), finK = new L.Kit(), R = 0.056;
    var rr = function (u) {
      if (u < 0.015) return 0.004;
      if (u < 0.4) return 0.004 + (R - 0.004) * Math.pow(sstep(0.0, 0.4, u), 0.7);
      if (u < 0.74) return R;
      if (u < 0.86) return R + 0.014 * sstep(0.7, 0.86, u);     // the swollen head full of jaw muscle
      var t = (u - 0.86) / 0.14; return (R + 0.014) * Math.pow(Math.max(0, 1 - Math.pow(t, 2.0)), 0.55) + 0.007;
    };
    var ww = function (u) { return 0.62 + 0.2 * sstep(0.25, 0.8, u); };
    var hh = function (u) { return 1.0 + 0.16 * sstep(0.7, 0.85, u); };
    var yy = function () { return 0; };
    var HS = headSplit({ r: rr, w: ww, h: hh, y: yy, uA: 0.8, jawFrac: 0.4, fbS: 0.1, ftJ: 0.14, jawW: 0.92 });
    var cBase = lin(0x3B3A20), cNet = lin(0xCBC185), cBelly = lin(0x9A9262), cHead = lin(0x56522A), cFlesh = lin(0x6E2A28), cDark = lin(0x120c08);
    function skin(p, u, sy) {
      var c = mixC(cBelly, mixC(cBase, cHead, sstep(0.75, 0.9, u)), sstep(-0.6, 0.2, sy));
      var nz = vn(p.x * 36, p.y * 36, p.z * 36), nz2 = vn(p.x * 80 + 4, p.y * 80, p.z * 80);
      if (Math.abs(nz) < 0.075) c = mixC(c, cNet, 0.75 - 0.3 * Math.abs(nz2));   // the pale net pattern of a moray
      return c.multiplyScalar(0.92 + 0.12 * nz2);
    }
    body.add(L.spine({ rings: 170, segs: 24, r: rr, w: ww, h: HS.h, y: HS.y, flatBelly: HS.fb }), {
      col: function (p, n, uv) {
        var u = uv[1], sy = Math.sin(uv[0] * PI * 2);
        if (u > 0.83 && n.y < -0.55 && sy < -0.2) return cFlesh.clone();            // roof of the mouth
        if (Math.abs(u - 0.785) < 0.007 && Math.abs(sy + 0.05) < 0.08) return cDark.clone(); // small round gill opening
        return skin(p, u, sy);
      }
    });
    body.add(HS.jaw(26, 18), { col: function (p, n) { return n.y > 0.35 ? cFlesh.clone() : skin(p, 0.9, n.y < -0.7 ? -0.3 : 0.1); }, a: A(1, 0, 1, 0) });
    body.add(L.blob(14, 8), { m: L.mat(V(0, HS.seam(0.86) - 0.004, 0.37), 0.05, 0.022, 0.085), col: lin(0x260808) }); // the throat
    var cT = lin(0xEDE6D2);
    teethRow(body, { n: 10, u0: 0.85, u1: 0.985, x: function (u) { return rr(u) * ww(u) * 0.8 * (1 - 0.6 * sstep(0.95, 1, u)); }, y: function (u) { return HS.seam(u) + 0.003; }, up: -1, back: 0.35, inward: 0.25,
      len: function (t) { return 0.016 + 0.016 * t; }, rad: function () { return 0.0042; }, col: cT });
    teethRow(body, { n: 10, u0: 0.85, u1: 0.99, x: function (u) { return rr(u) * ww(u) * 0.78 * (1 - 0.6 * sstep(0.95, 1, u)); }, y: function (u) { return HS.seam(u) - 0.003; }, up: 1, back: 0.3, inward: 0.25,
      len: function (t) { return 0.016 + 0.014 * t; }, rad: function () { return 0.004; }, col: cT, a: A(1, 0, 1, 0) });
    for (var s = -1; s <= 1; s += 2) {
      tooth(body, V(s * 0.008, HS.seam(0.96) + 0.004, 0.46), V(0, -1, -0.35), 0.04, 0.005, cT);                // two long fangs in the roof of the mouth
      tooth(body, V(s * 0.01, HS.seam(0.98) - 0.004, 0.475), V(0, 1, 0.1), 0.03, 0.0045, cT, A(1, 0, 1, 0)); // and two in front of the lower jaw
      // tube nostrils at the snout tip
      var nb = V(s * 0.014, HS.top(0.985) - 0.01, 0.484);
      body.add(L.sweep(L.curvePts([nb, nb.clone().add(V(s * 0.004, 0.006, 0.008)), nb.clone().add(V(s * 0.006, 0.01, 0.016))], 5), 0.0035, 5, true), { col: cHead });
    }
    // small eyes high on the head
    var eu = 0.925, eyes = [];
    for (s = -1; s <= 1; s += 2) {
      var ep = V(s * rr(eu) * ww(eu) * 0.6, HS.top(eu) - 0.017, eu - 0.5);
      eye(body, ep, 0.0105, s, 0x0d0c08, 0x2c3010, null, V(s * 0.8, 0.5, 0.2).normalize());
      eyes.push([ep.x + s * 0.005, ep.y + 0.004, ep.z, 0.08, 0.85]);
    }
    // the dorsal fin starts behind the head and runs to the tail; the anal fin runs under the tail
    var cF = lin(0x34331C);
    fold(finK, { u0: 0.04, u1: 0.8, edge: function (u) { return HS.y(u) + rr(u) * HS.h(u); }, side: 1, hgt: 0.034, prof: function (t) { return Math.sin(PI * Math.pow(t, 0.35)) * (0.6 + 0.4 * t); }, col: cF, flut: 0.5, n: 44 });
    fold(finK, { u0: 0.02, u1: 0.46, edge: function (u) { return HS.y(u) - rr(u) * HS.h(u); }, side: -1, hgt: 0.026, prof: function (t) { return Math.sin(PI * Math.pow(t, 0.4)); }, col: cF, flut: 0.5, n: 28 });
    return { body: body, fin: finK,
      bodyMat: { mode: 'fish', wave: [0.075, 1.5, 1.0, 0.3], head: 0.42, flut: [2.0, 0.008, 0, 0], hinge: [0, HS.hinge[1], HS.hinge[2], 1.15], glow: 0xD8FF8A, glowK: 2.6, sss: 0xa09050, sssK: 0.12, rough: 0.28 },
      finMat: { opacity: 1, rough: 0.3, sss: 0xa09050, sssK: 0.15 }, tellHalos: eyes };
  };

  /* ------------------------------------------------------------------ */
  /* 4. Cave Lurker (crawls: forward +Z, up +Y, feet at y about -0.08)   */
  /* ------------------------------------------------------------------ */
  M.cave_lurker = function () {
    var body = new L.Kit(), finK = new L.Kit();
    var rr = function (u) {
      if (u < 0.02) return 0.006;
      if (u < 0.45) return 0.006 + 0.074 * Math.pow(sstep(0.0, 0.45, u), 0.8);          // thick tail
      if (u < 0.78) return 0.08 + 0.006 * Math.sin((u - 0.45) / 0.33 * PI);              // trunk
      if (u < 0.82) return 0.08 - 0.007 * Math.sin((u - 0.78) / 0.04 * PI);              // neck
      var t = (u - 0.8) / 0.2; return 0.084 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.42) + 0.008; // long flat head, tapering snout
    };
    var ww = function (u) { return u < 0.45 ? 0.48 + 0.87 * sstep(0.08, 0.45, u) : u < 0.82 ? 1.35 : 1.5 - 0.3 * sstep(0.86, 1, u); };
    var hh = function (u) { return u < 0.45 ? 1.18 - 0.58 * sstep(0.2, 0.45, u) : u < 0.82 ? 0.6 : 0.6 - 0.16 * sstep(0.82, 0.88, u); };
    var yy = function (u) { return u < 0.3 ? -0.012 * (1 - u / 0.3) : 0; };
    var HS = headSplit({ r: rr, w: ww, h: hh, y: yy, uA: 0.83, jawFrac: 0.46, fbS: 0.14, ftJ: 0.18, jawW: 0.96 });
    var cSkin = lin(0xD9CDC1), cBack = lin(0xA8988C), cMott = lin(0x6F625A), cBelly = lin(0xEEE5DB), cPink = lin(0xCD9C92), cGroove = lin(0x8E7468), cFlesh = lin(0x8A3E3A), cLip = lin(0xB07C74);
    function skin(p, n, u, sy) {
      var c = mixC(cBelly, mixC(cSkin, cBack, sstep(0.3, 1, sy)), sstep(-0.55, -0.05, sy));
      // costal grooves on the flanks (salamander folds), mottling, warty bumps
      if (u > 0.47 && u < 0.79 && sy > -0.5 && sy < 0.65) { var gv = Math.pow(Math.abs(Math.sin(u * 240)), 14); c = mixC(c, cGroove, 0.35 * gv); }
      var m = vn(p.x * 14, p.y * 14, p.z * 14); if (m > 0.25) c = mixC(c, cPink, 0.4 * sstep(0.25, 0.6, m));
      var m2 = vn(p.x * 9 + 7, p.y * 9, p.z * 9); if (m2 > 0.2 && sy > -0.1) c = mixC(c, cMott, 0.55 * sstep(0.2, 0.5, m2) * sstep(-0.1, 0.5, sy)); // grey-brown blotches on the back
      var wart = vn(p.x * 110, p.y * 110, p.z * 110); if (wart > 0.55 && sy > 0) c.multiplyScalar(0.82);
      return c.multiplyScalar(0.94 + 0.1 * vn(p.x * 50, p.y * 50, p.z * 50));
    }
    body.add(L.spine({ rings: 120, segs: 26, r: rr, w: ww, h: HS.h, y: HS.y, flatBelly: function (u) { return HS.fb(u) * (u > 0.45 && u < 0.83 ? 0.7 : 1); } }), {
      col: function (p, n, uv) {
        var u = uv[1], sy = Math.sin(uv[0] * PI * 2);
        if (u > 0.85 && n.y < -0.6 && Math.abs(p.x) < rr(u) * ww(u) * 0.8) return cFlesh.clone();
        if (u > 0.84 && sy < 0.05 && sy > -0.35) return mixC(skin(p, n, u, sy), cLip, 0.5);
        return skin(p, n, u, sy);
      }
    });
    body.add(HS.jaw(26, 22), { col: function (p, n) { return n.y > 0.4 ? cFlesh.clone() : n.y > 0.0 ? mixC(cLip, cBelly, 0.4) : cBelly.clone().multiplyScalar(0.96); }, a: A(1, 0, -1, 0) });
    body.add(L.blob(16, 8), { m: L.mat(V(0, HS.seam(0.88) - 0.002, 0.39), 0.09, 0.018, 0.08), col: lin(0x2A0A0A) });
    // crocodile teeth: uneven cones along both jaws, a few big ones show even when the mouth is shut
    var cT = lin(0xE6DDC8), seed = 0;
    function rimX(u) { return rr(u) * ww(u) * 0.86 * (1 - 0.55 * sstep(0.95, 1, u)); }
    for (var i = 0; i < 13; i++) {
      var u = mix(0.85, 0.985, i / 12), z = u - 0.5, big = (i === 3 || i === 8) ? 1.7 : 0.8 + 0.4 * Math.abs(Math.sin(i * 7.3));
      for (var s = -1; s <= 1; s += 2) {
        tooth(body, V(s * rimX(u), HS.seam(u) + 0.002, z), V(s * 0.12, -1, -0.15), 0.017 * big, 0.0048 * Math.sqrt(big), cT, A(1));
        tooth(body, V(s * rimX(u) * 1.02, HS.seam(u) - 0.002, z - 0.006), V(s * 0.18, 1, -0.1), 0.016 * big, 0.0046 * Math.sqrt(big), cT, A(1, 0, -1, 0));
      }
    }
    // eyes on top of the flat head (milky, with eyeshine), nostrils at the tip
    var eyes = [];
    for (s = -1; s <= 1; s += 2) {
      var eu = 0.905, ep = V(s * rr(eu) * ww(eu) * 0.52, HS.top(eu) - 0.006, eu - 0.5);
      body.add(L.blob(12, 8), { m: L.mat(ep.clone().add(V(0, -0.002, -0.004)), 0.016, 0.01, 0.017), col: cBack }); // a bony brow bump
      eye(body, ep.clone().add(V(s * 0.003, 0.004, 0.004)), 0.0095, s, 0xB9C2BA, 0x506048, null, V(s * 0.7, 0.7, 0.2).normalize());
      eyes.push([ep.x + s * 0.005, ep.y + 0.008, ep.z + 0.004, 0.09, 0.9]);
      body.add(L.blob(8, 6), { m: L.mat(V(s * 0.014, HS.top(0.985) - 0.002, 0.484), 0.005, 0.0025, 0.004), col: lin(0x2a1a18) });
    }
    // dull red feathery gills behind the head (it is a giant, horrible olm cousin)
    var cG = lin(0xA65E58), cG2 = lin(0xC27A70);
    for (s = -1; s <= 1; s += 2) for (var gi = 0; gi < 3; gi++) {
      var gb = V(s * rr(0.8) * ww(0.8) * 0.9, 0.016 - gi * 0.018, 0.3), gd = V(s, 0.6 - gi * 0.6, -0.75).normalize(), gt = gb.clone().addScaledVector(gd, 0.095);
      body.add(L.sweep(L.curvePts([gb, gb.clone().addScaledVector(gd, 0.04).add(V(0, 0.008, 0)), gt], 6), function (t) { return 0.008 * (1 - 0.55 * t); }, 5, true), { col: cG, a: A(1, 0.8, 0, gi + s) , b: B(0.3, 1, 0.2, 0) });
      for (var fi = 0; fi < 8; fi++) {
        var at = gb.clone().lerp(gt, 0.2 + fi * 0.1);
        for (var sd = -1; sd <= 1; sd += 2) {
          var fd = new T.Vector3().crossVectors(gd, V(0, 0, 1)).normalize().multiplyScalar(sd).add(gd.clone().multiplyScalar(0.4)).normalize();
          body.add(L.sweep(L.curvePts([at, at.clone().addScaledVector(fd, 0.015), at.clone().addScaledVector(fd, 0.026).add(V(0, 0, -0.008))], 4), 0.0026, 3, true), { col: cG2, a: A(1, 1, 0, gi + s + fi), b: B(0.3, 1, 0.3, 0) });
        }
      }
    }
    // bony bumps (osteoderms) in two rows down the back
    var cO = lin(0xCDBFB2);
    for (u = 0.46; u < 0.8; u += 0.024) for (s = -1; s <= 1; s += 2) tooth(body, V(s * rr(u) * ww(u) * 0.36, HS.top(u) - 0.006, u - 0.5), V(s * 0.2, 1, -0.4), 0.016, 0.009, cO, A(1));
    // tail crest (top) and a low keel (bottom) that ripple when it swims
    var cC = lin(0xC9B9AE);
    fold(finK, { u0: 0.03, u1: 0.47, edge: function (u) { return HS.y(u) + rr(u) * HS.h(u); }, side: 1, hgt: 0.04, prof: function (t) { return Math.pow(Math.sin(PI * Math.pow(t, 0.55)), 0.8) * (0.55 + 0.45 * Math.abs(Math.sin(t * 40))); }, col: cC, flut: 0.6, n: 60, sweep: 0.3 });
    fold(finK, { u0: 0.03, u1: 0.3, edge: function (u) { return HS.y(u) - rr(u) * HS.h(u); }, side: -1, hgt: 0.02, prof: function (t) { return Math.sin(PI * Math.pow(t, 0.5)); }, col: cC, flut: 0.6, n: 24 });
    // four sprawling legs with clawed toes. Diagonal gait: front left moves with rear right.
    var cClaw = lin(0x2E2420);
    function leg(uAt, s, ph, nToes, front) {
      // sprawled like a crocodile: the upper limb goes out sideways, the elbow sits high, the forearm drops to a wide foot
      var z = uAt - 0.5, hip = V(s * rr(uAt) * ww(uAt) * 0.72, -0.018, z), elbow = V(s * 0.165, 0.004, z + (front ? 0.012 : -0.018)), wrist = V(s * 0.19, -0.048, z + (front ? 0.04 : 0.012)), foot = V(s * 0.2, -0.058, z + (front ? 0.05 : 0.022));
      body.add(L.sweep(L.curvePts([hip, elbow, wrist, foot], 14), function (t) { return 0.028 * (1 - 0.5 * t) * (t < 0.15 ? 0.85 + t : 1); }, 8, true), { col: function (p, n, uv) { return skin(p, n, 0.6, n.y); }, a: function (p, uv) { return A(0.5, 0, uv[1], ph); } });
      body.add(L.blob(10, 6), { m: L.mat(foot, 0.026, 0.008, 0.024), col: cSkin, a: A(0.5, 0, 1, ph) });
      for (var k = 0; k < nToes; k++) {
        var ta = (k - (nToes - 1) / 2) * 0.42 + (front ? 0 : 0.15 * s), td = V(s * Math.sin(Math.abs(ta) + 0.3) * 0.6 + Math.sin(ta) * 0.3, -0.12, Math.cos(ta)).normalize();
        var t0 = foot.clone().addScaledVector(td, 0.012), t1 = foot.clone().addScaledVector(td, 0.036).add(V(0, -0.004, 0));
        body.add(L.sweep(L.curvePts([t0, t0.clone().lerp(t1, 0.5).add(V(0, 0.003, 0)), t1], 5), function (t) { return 0.0055 * (1 - 0.4 * t); }, 5, true), { col: cSkin, a: A(0.5, 0, 1, ph) });
        tooth(body, t1, td.clone().add(V(0, -0.5, 0)), 0.018, 0.0045, cClaw, A(0.5, 0, 1, ph));
      }
    }
    leg(0.755, 1, 0, 4, true); leg(0.755, -1, PI, 4, true); leg(0.49, 1, PI, 5, false); leg(0.49, -1, 0, 5, false);
    return { body: body, fin: finK,
      bodyMat: { mode: 'crawl', wave: [0.05, 0.9, 1.3, 0.25], head: 0.33, flut: [1.1, 0.008, 1.0, 0.05], hinge: [0, HS.hinge[1], HS.hinge[2], 0.85], glow: 0xD0FF90, glowK: 2.6, sss: 0xff9a8a, sssK: 0.32, rough: 0.42 },
      finMat: { opacity: 0.82, sss: 0xffb0a0, sssK: 0.5, rough: 0.4 }, tellHalos: eyes };
  };

  /* ------------------------------------------------------------------ */
  /* 5. Spider Squid (forward +Z is the arm crown, the mantle trails)    */
  /* ------------------------------------------------------------------ */
  M.spider_squid = function () {
    var body = new L.Kit(), finK = new L.Kit(), halos = [], tell = [];
    var cM = lin(0x5E1E2E), cM2 = lin(0x8C3A4A), cDark = lin(0x2C0A16), cArm = lin(0x9A4E5E), cIn = lin(0xD9AEB0), cSuck = lin(0xEED6D2);
    // mantle: z from -0.5 (pointed tip) to -0.05 (collar)
    var mr = function (u) { var b = 0.072 * Math.pow(sstep(0, 0.62, u), 0.65); return Math.max(0.003, u > 0.9 ? b * (1 - (u - 0.9) * 1.1) : b); };
    body.add(L.spine({ rings: 44, segs: 22, z0: -0.5, z1: -0.05, r: mr, w: function () { return 1.0; }, h: function () { return 1.04; } }), {
      col: function (p, n, uv) {
        var sy = Math.sin(uv[0] * PI * 2), c = mixC(cM2, cM, sstep(-0.6, 0.45, sy));
        var ch = vn(p.x * 60, p.y * 60, p.z * 60); if (ch > 0.3) c = mixC(c, cDark, 0.65 * sstep(0.3, 0.6, ch)); // chromatophores
        return c;
      },
      a: function () { return A(0.25); }
    });
    // photophores: small glowing beads scattered over the mantle
    var prand = L.rnd(41), cPh = lin(0xBFF4FF);
    for (var pi = 0; pi < 26; pi++) {
      var pu = 0.15 + prand() * 0.8, pa = prand() * PI * 2, pz = -0.5 + 0.45 * pu, pr2 = mr(pu) * 1.0;
      body.add(L.blob(6, 4), { m: L.mat(V(Math.cos(pa) * pr2, Math.sin(pa) * pr2 * 1.04, pz), 0.004 + prand() * 0.003), col: cPh, a: A(0.25), b: B(0, 0, 0, 1) });
    }
    // big rounded fins at the back of the mantle, rippling
    var fOut = L.outline(14, function (t) { return [-0.49 + 0.27 * t + 0.02 * Math.sin(PI * t), 0.13 * Math.pow(Math.sin(PI * t), 0.75)]; });
    for (var s = -1; s <= 1; s += 2) {
      (function (s) {
        var g = L.fin([-0.49, 0], [-0.22, 0], fOut, function (a, b) { var u = clamp((a + 0.5) / 0.45, 0, 1); return V(s * (mr(u) * 0.9 + b), 0.004, a); }, 4);
        finK.add(g, { col: function (p, n, uv) { return mixC(cM2, cM, 0.4 + 0.3 * uv[1]); }, a: function (p, uv) { return A(0.25, 1.1 * uv[1], 0, uv[0] * 7); }, b: function () { return B(0, 1, 0, 0); } });
      })(s);
    }
    // head with huge eyes, each ringed with photophores; a siphon funnel underneath
    body.add(L.blob(16, 12), { m: L.mat(V(0, 0, 0.0), 0.058, 0.052, 0.07), col: function (p) { return mixC(cM2, cM, 0.5).multiplyScalar(0.9 + 0.2 * vn(p.x * 50, p.y * 50, p.z * 50)); } });
    for (s = -1; s <= 1; s += 2) {
      var ep = V(s * 0.05, 0.012, 0.004);
      body.add(L.blob(16, 12), { m: L.mat(ep, 0.016, 0.03, 0.03), col: lin(0x07040a) });
      body.add(L.blob(10, 8), { m: L.mat(ep.clone().add(V(s * 0.012, 0, 0)), 0.004, 0.017, 0.017), col: lin(0x10202a), b: B(0, 0, 0, 0.7) });
      body.add(new T.TorusGeometry(1, 0.14, 6, 22), { m: new T.Matrix4().compose(ep.clone().add(V(s * 0.012, 0, 0)), new T.Quaternion().setFromEuler(new T.Euler(0, PI / 2, 0)), V(0.032, 0.032, 0.032)), col: lin(0x7FD8E8), b: B(0, 0, 0, 1) });
      tell.push([ep.x + s * 0.02, ep.y, ep.z, 0.14, 0.9]);
    }
    tooth(body, V(0, -0.045, -0.03), V(0, 0.15, 1), 0.06, 0.016, cM2, A(0.3));
    // eight arms around the beak, long and bending; photophores along each one, pale suckers inside
    var cBeak = lin(0x1c1410);
    tooth(body, V(0, 0, 0.055), V(0, 0, 1), 0.02, 0.01, cBeak, A(0.2));
    for (var i = 0; i < 8; i++) {
      (function (i) {
        var ang = (i + 0.5) / 8 * PI * 2, ca = Math.cos(ang), sa = Math.sin(ang), len = 1 + 0.12 * Math.sin(i * 2.1);
        var pts = L.curvePts([V(ca * 0.036, sa * 0.032, 0.045), V(ca * 0.09, sa * 0.08, 0.17 * len), V(ca * 0.135, sa * 0.115 - 0.015, 0.31 * len), V(ca * 0.12 + sa * 0.03, sa * 0.1 - 0.04, 0.47 * len)], 26);
        var hw = sa > 0.3 ? -0.9 : sa < -0.3 ? 0.9 : 0;   // upper arms swing up, lower arms down: the crown opens
        var tg = V(-sa, ca, 0);
        body.add(L.sweep(pts, function (t) { return 0.0125 * (1 - 0.86 * t) + 0.0012; }, 7, true), {
          col: function (p, n, uv) { var inward = -(n.x * ca + n.y * sa); return inward > 0.35 ? mixC(cIn, cSuck, 0.3) : mixC(cArm, cM, 0.3 + 0.3 * vn(p.x * 70, p.y * 70, p.z * 70)); },
          a: function (p, uv) { return A(0.15, 0.95 * uv[1], hw * uv[1], i * 0.8); },
          b: function () { return B(tg.x * 0.6 + ca * 0.4, tg.y * 0.6 + sa * 0.4, 0.2, 0); }
        });
        // a row of glowing beads down the outside of each arm (they move with the arm)
        for (var k2 = 1; k2 < 8; k2++) {
          var q2 = 0.2 + k2 * 0.1, pp2 = pts[Math.round(q2 * (pts.length - 1))], rr2 = (0.0125 * (1 - 0.86 * q2) + 0.0012) * 1.05;
          body.add(L.blob(6, 4), { m: L.mat(pp2.clone().add(V(ca * rr2, sa * rr2, 0)), 0.0035 * (1 - 0.5 * q2) + 0.0015), col: cPh, a: A(0.15, 0.95 * q2, hw * q2, i * 0.8), b: B(tg.x * 0.6 + ca * 0.4, tg.y * 0.6 + sa * 0.4, 0.2, 1) });
        }
        for (var k = 2; k < 10; k++) {
          var q = k / 11, pp = pts[Math.round(q * (pts.length - 1))], sr = 0.0045 * (1 - 0.7 * q) + 0.001;
          body.add(L.blob(6, 4), { m: L.mat(pp.clone().add(V(-ca * 0.008 * (1 - q), -sa * 0.008 * (1 - q), 0)), sr, sr, sr), col: cSuck, a: A(0.15, 0.95 * q, hw * q, i * 0.8), b: B(tg.x * 0.6 + ca * 0.4, tg.y * 0.6 + sa * 0.4, 0.2, 0) });
        }
      })(i);
    }
    // two long feeding tentacles with glowing clubs (the lure)
    for (s = -1; s <= 1; s += 2) {
      (function (s) {
        var tp = L.curvePts([V(s * 0.016, -0.03, 0.045), V(s * 0.05, -0.06, 0.25), V(s * 0.09, -0.04, 0.45), V(s * 0.07, -0.08, 0.66)], 30);
        body.add(L.sweep(tp, function (t) { return 0.0055 * (1 - 0.5 * t) + 0.0015; }, 6, false), { col: cArm, a: function (p, uv) { return A(0.15, 1.2 * uv[1], 0.5 * uv[1], s * 2); }, b: function () { return B(0.5, 0.8, 0, 0); } });
        var club = tp[29];
        body.add(L.blob(10, 8), { m: L.mat(club, 0.012, 0.009, 0.04), col: lin(0x9FE8F0), a: A(0.15, 1.2, 0.5, s * 2), b: B(0.5, 0.8, 0, 1) });
      })(s);
    }
    halos.push([0, 0.02, -0.28, 0.3, 0.28]);
    return { body: body, fin: finK,
      bodyMat: { mode: 'fish', wave: [0.012, 0.6, 2, 0.6], head: -0.06, flut: [2.4, 0.03, 0, 0], hinge: [0, 0, 0.045, 0.75], glow: 0x4FD8FF, glowK: 3.0, sss: 0xff8090, sssK: 0.45, rough: 0.25 },
      finMat: { opacity: 0.68, sss: 0xff9aa8, sssK: 0.6, rough: 0.2 }, halos: halos, tellHalos: tell, lure: [0, -0.06, 0.62] };
  };

  /* ------------------------------------------------------------------ */
  /* 6. The Maw                                                          */
  /* ------------------------------------------------------------------ */
  M.the_maw = function () {
    var rr = function (u) {
      if (u < 0.02) return 0.004;
      if (u < 0.5) return 0.004 + 0.068 * Math.pow(sstep(0, 0.5, u), 0.85);
      if (u < 0.72) return 0.072 + 0.008 * sstep(0.5, 0.72, u);
      if (u < 0.82) return 0.08 + 0.012 * sstep(0.72, 0.82, u);
      var t = (u - 0.82) / 0.18; return 0.092 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.8)), 0.62) + 0.012;
    };
    var ww = function (u) { return u > 0.72 ? 0.8 - 0.05 * sstep(0.72, 0.82, u) : 0.78; };
    var hh = function (u) { return u > 0.72 ? 1.0 + 0.24 * sstep(0.72, 0.84, u) : 1.0; };
    var yy = function () { return 0; };
    var HS = headSplit({ r: rr, w: ww, h: hh, y: yy, uA: 0.83, jawFrac: 0.4, fbS: 0.12, ftJ: 0.14, jawW: 0.96 });
    var cBody = lin(0x1E252A), cBody2 = lin(0x33414B), cScale = lin(0x0F1418), cPlate = lin(0x6E685C), cPlate2 = lin(0x3E3A33), cSut = lin(0x14120f), cFlesh = lin(0x240808);
    function armor(p, u, sy, ang) {
      var c = mixC(cPlate2, cPlate, sstep(-0.4, 0.6, sy) * 0.7 + 0.3 * (0.5 + 0.5 * vn(p.x * 30, p.y * 30, p.z * 30)));
      var pit = vn(p.x * 140, p.y * 140, p.z * 140); if (pit > 0.5) c.multiplyScalar(0.7);         // pitted bone
      var su = [0.745, 0.79, 0.835, 0.905, 0.95];
      for (var k = 0; k < su.length; k++) if (Math.abs(u - su[k] - 0.008 * Math.sin(ang * 5)) < 0.0035) c = mixC(c, cSut, 0.85);
      if (Math.abs(Math.cos(ang * 3 + u * 6)) < 0.05 && u > 0.74 && u < 0.86) c = mixC(c, cSut, 0.8);
      return c;
    }
    var f = K2.fish({ r: rr, w: ww, h: HS.h, y: HS.y, flatBelly: HS.fb, back: 0x1E252A, side: 0x2A343C, belly: 0x3E4A52, mouth: false, scales: 0, rings: 130, segs: 34,
      colFn: function (c, p, u, sy) {
        var ang = Math.atan2(sy, Math.sqrt(Math.max(0, 1 - sy * sy)) * (p.x < 0 ? -1 : 1));
        if (u > 0.725) {
          if (u > 0.87 && sy < -0.25 && Math.abs(p.x) < rr(u) * ww(u) * 0.75) return cFlesh.clone();
          return armor(p, u, sy, ang);
        }
        // big rhombic ganoid scales, each with a dark edge
        var s1 = Math.sin(u * 230 + ang * 11), s2 = Math.sin(u * 230 - ang * 11);
        var col = mixC(cBody, cBody2, 0.5 + 0.5 * sy);
        if (Math.min(Math.abs(s1), Math.abs(s2)) < 0.18) col = mixC(col, cScale, 0.7);
        return col.multiplyScalar(0.9 + 0.15 * vn(p.x * 40, p.y * 40, p.z * 40));
      },
      // two lines of photophores along each side and a row along the belly: the "lure lines"
      glowFn: function (p, u, sy) {
        if (u < 0.06 || u > 0.83) return 0;
        var dots = Math.pow(Math.abs(Math.sin(u * 150)), 14);
        if (Math.abs(sy - 0.1) < 0.045) return dots;
        if (Math.abs(sy + 0.5) < 0.04) return dots * 0.8;
        if (sy < -0.97) return Math.pow(Math.abs(Math.sin(u * 90)), 10) * 0.7;
        return 0;
      },
      fins: [{ t: 'caudal', h: 0.09, l: 0.11, shape: 'round', col: 0x222B32, edge: 0x4A5A66, rays: 0.4, flut: 0.5 },
        { t: 'dorsal', u0: 0.06, u1: 0.6, h: 0.05, n: 30, sweep: 0.3, col: 0x222B32, edge: 0x3C4A55, rays: 0.5, nRays: 30, top: function (t) { return Math.pow(Math.sin(PI * Math.pow(t, 0.5)), 0.5) * (0.6 + 0.4 * Math.abs(Math.sin(t * 9))); } },
        { t: 'anal', u0: 0.05, u1: 0.42, h: 0.04, n: 22, sweep: 0.3, col: 0x222B32, edge: 0x3C4A55, rays: 0.5, nRays: 20 },
        { t: 'pectoral', u: 0.7, l: 0.15, spread: 0.78, droop: 0.4, lobe: 0.022, col: 0x2A343C, edge: 0x56687A, rays: 0.35 },
        { t: 'pelvic', u: 0.47, l: 0.1, spread: 0.6, droop: 0.6, lobe: 0.016, col: 0x2A343C, edge: 0x56687A, rays: 0.35 }] });
    var body = f.body, finK = f.fin;
    // lower jaw: a heavy bone plate
    body.add(HS.jaw(26, 22), { col: function (p, n) { return n.y > 0.4 ? cFlesh.clone() : mixC(cPlate2, cPlate, 0.5 + 0.4 * vn(p.x * 30, p.y * 30, p.z * 30)); }, a: A(1, 0, 1, 0),
      b: function (p, uv) { return B(0, 0, 0, uv[1] > 0.15 && Math.abs(Math.sin(uv[0] * PI * 2) + 0.2) < 0.08 ? Math.pow(Math.abs(Math.sin(uv[1] * 40)), 10) : 0); } });
    body.add(L.blob(16, 8), { m: L.mat(V(0, HS.seam(0.9) - 0.004, 0.4), 0.075, 0.032, 0.08), col: lin(0x1a0405) });
    // bone blades instead of teeth: serrated edges on both jaws and two pairs of huge front fangs
    var cB = lin(0xD6CCB8);
    function rimX(u) { return rr(u) * ww(u) * 0.86 * (1 - 0.6 * sstep(0.95, 1, u)); }
    teethRow(body, { n: 14, u0: 0.845, u1: 0.975, x: rimX, y: function (u) { return HS.seam(u) + 0.002; }, up: -1, back: 0.1, len: function (t) { return 0.014 + 0.008 * t; }, rad: function () { return 0.0075; }, col: cB, flat: 0.3 });
    teethRow(body, { n: 14, u0: 0.845, u1: 0.98, x: rimX, y: function (u) { return HS.seam(u) - 0.002; }, up: 1, back: 0.05, len: function (t) { return 0.014 + 0.008 * t; }, rad: function () { return 0.0075; }, col: cB, a: A(1, 0, 1, 0), flat: 0.3 });
    for (var s = -1; s <= 1; s += 2) {
      tooth(body, V(s * 0.018, HS.seam(0.97) + 0.004, 0.47), V(s * 0.1, -1, 0.25), 0.05, 0.009, cB, A(1), 0.55);
      tooth(body, V(s * 0.012, HS.seam(0.985) - 0.004, 0.484), V(s * 0.05, 1, 0.3), 0.055, 0.009, cB, A(1, 0, 1, 0), 0.55);
      // a heavy brow over a small sunken eye, cheek spikes swept back
      var eu = 0.915, ep = V(s * rr(eu) * ww(eu) * 0.8, HS.y(eu) + rr(eu) * HS.h(eu) * 0.32, eu - 0.5);
      body.add(L.blob(12, 8), { m: L.mat(ep.clone().add(V(-s * 0.003, 0.012, -0.002)), 0.022, 0.009, 0.026, 0, 0, s * 0.3), col: cPlate });
      eye(body, ep, 0.011, s, 0x050708, 0x0c2a40);
      for (var k = 0; k < 3; k++) tooth(body, V(s * rr(0.8 - k * 0.03) * ww(0.8) * 0.9, 0.02 - k * 0.025, 0.3 - k * 0.03), V(s * 0.5, 0.1, -1), 0.05 - k * 0.01, 0.01, cPlate, A(1));
    }
    // a crest of bony spikes along the top of the head plates
    for (var u = 0.74; u < 0.93; u += 0.025) tooth(body, V(0, HS.top(u) - 0.004, u - 0.5), V(0, 1, -0.7), 0.03 * (1 - (u - 0.74) * 2.5), 0.009, cPlate, A(1));
    // four long chin barbels with glowing tips: the lure that swings in front of the mouth
    var halos = [], cBar = lin(0x2A343C);
    [-0.04, -0.014, 0.014, 0.04].forEach(function (x, k) {
      var b0 = V(x, HS.bot(0.95) + 0.006, 0.44), len = 0.16 + 0.05 * (k % 2);
      var pts = L.curvePts([b0, b0.clone().add(V(x * 0.8, -len * 0.4, 0.02)), b0.clone().add(V(x * 1.5, -len * 0.8, -0.04)), b0.clone().add(V(x * 1.8, -len, -0.09))], 16);
      body.add(L.sweep(pts, function (t) { return 0.004 * (1 - 0.6 * t) + 0.0012; }, 5, true), { col: cBar, a: function (p, uv) { return A(1, 0.9 * uv[1], 1, k * 1.3); }, b: function (p, uv) { return B(0.4, 0.3, 1, uv[1] > 0.6 ? 0.4 : 0); } });
      var tip = pts[16];
      body.add(L.blob(10, 8), { m: L.mat(tip, 0.009), col: lin(0xBFEFFF), a: A(1, 0.9, 1, k * 1.3), b: B(0.4, 0.3, 1, 1) });
    });
    for (var h = 0; h < 5; h++) { halos.push([0.07, 0.008, -0.25 + h * 0.15, 0.06, 0.25]); halos.push([-0.07, 0.008, -0.25 + h * 0.15, 0.06, 0.25]); }
    var tell = [];
    for (s = -1; s <= 1; s += 2) tell.push([s * rr(0.915) * ww(0.915) * 0.86, HS.y(0.915) + rr(0.915) * HS.h(0.915) * 0.32, 0.415, 0.08, 1]);
    return { body: body, fin: finK,
      bodyMat: { mode: 'fish', wave: [0.05, 1.05, 1.3, 0.12], head: 0.3, flut: [0.8, 0.02, 0, 0], hinge: [0, HS.hinge[1], HS.hinge[2], 0.75], glow: 0x58B8FF, glowK: 3.2, sss: 0x506070, sssK: 0.08, rough: 0.6, metal: 0.05 },
      finMat: { opacity: 0.85, sss: 0x6080a0, sssK: 0.2, rough: 0.4 }, halos: halos, tellHalos: tell, lure: [0, -0.18, 0.4] };
  };
})();
