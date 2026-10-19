/*
 * cave-dress.js: everything that sits ON the cave walls (agent A, helper for cave.js).
 *
 *   Speleothems  stalactites (hang from the ceiling, tip DOWN), stalagmites (stand on the floor,
 *                tip UP), columns where the two meet, soda straws. One shared cone shape:
 *                wide base at local y = 0, tip at y = +1. Stalactites use the rotation.x = PI flip.
 *   Breakdown    boulders and blocks on chamber floors, with simple sphere colliders.
 *   Water        flat water surfaces in air pockets, dry chamber pools and the entrance pool.
 *   Entrance     the sky opening, sun shafts, hanging roots, and the stake the rope is tied to.
 *   The bottom   the Ancient Ring: a glyph-carved ring on a stepped dais with a floating core,
 *                spinning inner rings, standing stones and the bones of something enormous.
 *   Landmarks    props for the generator's landmark rooms (truck, camp, old guideline, ...).
 *   Finds        fossils and treasure to dig up (TU.cave.features.finds).
 *   Quakes       falling rocks with simple physics, and rubble for collapsed passages.
 *
 * Exposed as TU.caveDress (internal to agent A's files). cave.js calls build() once per cave.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, N = TU.noise;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var GEO = TU.caveGeo, V = GEO.v;

  var MAX_STAL = 3200, MAX_STAG = 1600, MAX_STRAW = 3200, MAX_BOULDER = 1400, MAX_RUBBLE = 160;
  var FLIP = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI); // the stalactite rotation.x = PI

  function own(m) { m.userData.own = true; return m; }
  // An InstancedMesh that always has a color buffer (three r128 reuses one shader program per
  // material, so every instanced mesh sharing a material must have instance colors).
  var WHITE = new T.Color(1, 1, 1);
  function inst(geo, mat, n) { var m = new T.InstancedMesh(geo, mat, n); m.setColorAt(0, WHITE); return m; }
  function white(geo) { var n = geo.attributes.position.count, c = new Float32Array(n * 3).fill(1); geo.setAttribute('color', new T.BufferAttribute(c, 3)); return geo; }

  /* ------------------------------------------------------------------ */
  /* Shared shapes (built once)                                          */
  /* ------------------------------------------------------------------ */
  var shapes = null;
  function getShapes() {
    if (shapes) return shapes;
    shapes = {};
    // Speleothem cone. three.js ConeGeometry has its tip at +Y: shift it up by half its height so
    // the WIDE BASE sits at y = 0 and the TIP is at y = +1. Carrot profile and drip rings.
    var sg = new T.ConeGeometry(1, 1, 10, 9, true); sg.translate(0, 0.5, 0);
    var sp = sg.attributes.position, i;
    for (i = 0; i < sp.count; i++) {
      var x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), r0 = Math.max(1 - y, 1e-4);
      var prof = Math.pow(r0, 0.78) / r0;
      var lump = 1 + 0.3 * N.n3(x * 2.2, y * 7, z * 2.2) + 0.1 * Math.sin(y * 31);
      var off = 0.05 * (1 - y);
      sp.setXYZ(i, x * prof * lump + off * N.n3(0, y * 3, 1), y, z * prof * lump + off * N.n3(2, y * 3, 0));
    }
    sg.computeVertexNormals(); white(sg);
    shapes.cone = sg;
    // Soda straw: a thin hollow tube, base at y = 0, end at y = 1 (hung with the same flip).
    var st = new T.CylinderGeometry(1, 0.85, 1, 5, 1, true); st.translate(0, 0.5, 0); white(st);
    shapes.straw = st;
    // Breakdown block: a chunky, faceted rock.
    var bb = new T.BoxGeometry(1, 1, 1, 3, 3, 3), bp = bb.attributes.position;
    for (i = 0; i < bp.count; i++) {
      var bx = bp.getX(i), by = bp.getY(i), bz = bp.getZ(i), l = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      var k = 0.62 + 0.38 * (0.5 / l) * 1.2;
      var dn = 1 + 0.22 * N.fbm(bx * 1.6 + 3, by * 1.6, bz * 1.6, 2);
      bp.setXYZ(i, bx * k * dn, by * k * dn, bz * k * dn);
    }
    bb = bb.toNonIndexed(); bb.computeVertexNormals();
    var bc = new Float32Array(bb.attributes.position.count * 3);
    for (i = 0; i < bc.length / 3; i++) { var v = 0.82 + 0.3 * N.n3(bb.attributes.position.getX(i) * 3, bb.attributes.position.getY(i) * 3, bb.attributes.position.getZ(i) * 3); bc[i * 3] = v; bc[i * 3 + 1] = v * 0.98; bc[i * 3 + 2] = v * 0.94; }
    bb.setAttribute('color', new T.BufferAttribute(bc, 3));
    shapes.block = bb;
    // Rounded river cobble / old boulder.
    var rg = new T.IcosahedronGeometry(0.62, 2), rp = rg.attributes.position;
    for (i = 0; i < rp.count; i++) {
      var rx = rp.getX(i), ry = rp.getY(i), rz = rp.getZ(i), d = 1 + 0.25 * N.fbm(rx * 1.8 + 9, ry * 1.8, rz * 1.8, 3);
      rp.setXYZ(i, rx * d, ry * d * 0.75, rz * d);
    }
    rg.computeVertexNormals(); white(rg);
    shapes.round = rg;
    return shapes;
  }

  // Glowing glyph band for the ancient structure (shared texture 'glyph').
  TU.tex.register('glyph', function () {
    var t = TU.tex.canvas(1024, 128, function (g, w, h) {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      var r = TU.rng(5, 11).fn();
      g.strokeStyle = '#9ffff0'; g.lineWidth = 3; g.shadowColor = '#4FF2D0'; g.shadowBlur = 10; g.lineCap = 'round';
      for (var x = 20; x < w - 30; x += 46) {
        var cy = h / 2, k = Math.floor(r() * 6);
        g.beginPath();
        if (k === 0) { g.arc(x + 14, cy, 14, 0, Math.PI * 2); g.moveTo(x + 14, cy - 30); g.lineTo(x + 14, cy + 30); }
        else if (k === 1) { g.moveTo(x, cy - 28); g.lineTo(x + 28, cy); g.lineTo(x, cy + 28); g.moveTo(x + 14, cy - 10); g.lineTo(x + 14, cy + 10); }
        else if (k === 2) { g.moveTo(x, cy + 28); g.lineTo(x + 14, cy - 28); g.lineTo(x + 28, cy + 28); g.moveTo(x + 6, cy + 6); g.lineTo(x + 22, cy + 6); }
        else if (k === 3) { g.arc(x + 14, cy - 10, 10, Math.PI, 0); g.moveTo(x + 4, cy - 10); g.lineTo(x + 4, cy + 26); g.moveTo(x + 24, cy - 10); g.lineTo(x + 24, cy + 26); }
        else if (k === 4) { g.moveTo(x, cy); g.lineTo(x + 28, cy); g.moveTo(x + 14, cy - 28); g.lineTo(x + 14, cy + 28); g.arc(x + 14, cy, 6, 0, Math.PI * 2); }
        else { g.moveTo(x + 14, cy - 28); g.lineTo(x + 28, cy - 6); g.lineTo(x + 20, cy + 28); g.lineTo(x + 8, cy + 28); g.lineTo(x, cy - 6); g.closePath(); g.moveTo(x + 14, cy - 8); g.arc(x + 14, cy + 2, 4, 0, Math.PI * 2); }
        g.stroke();
      }
      g.globalAlpha = 0.35; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 12); g.lineTo(w, 12); g.moveTo(0, h - 12); g.lineTo(w, h - 12); g.stroke();
    });
    t.wrapS = T.RepeatWrapping;
    return t;
  });

  function rayTexture() {
    return TU.tex.canvas(64, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(234,246,242,.95)'); gr.addColorStop(0.5, 'rgba(234,246,242,.35)'); gr.addColorStop(1, 'rgba(234,246,242,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var hx = g.createLinearGradient(0, 0, w, 0); hx.addColorStop(0, 'rgba(0,0,0,1)'); hx.addColorStop(0.5, 'rgba(0,0,0,0)'); hx.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = hx; g.fillRect(0, 0, w, h);
    });
  }

  // Zone tint for calcite formations (linear-ish multipliers on the white calcite material).
  function calciteTint(depth, r, out) {
    var c;
    if (depth < 30) c = [0.95, 0.88, 0.74];
    else if (depth < 70) c = [0.86, 0.8, 0.7];
    else if (depth < 125) c = [0.74, 0.7, 0.64];
    else if (depth < 205) c = [0.72, 0.66, 0.42];
    else c = [0.55, 0.56, 0.6];
    var v = 0.6 + 0.25 * r;
    return out.setRGB(c[0] * v, c[1] * v, c[2] * v);
  }

  // Split one big InstancedMesh into regional ones (about 32 m boxes) so the renderer can skip
  // regions outside the view or far away. All parts keep the same name; the biggest comes first.
  var REGION = 40;
  function splitRegions(W, big, name, shadow, root, out) {
    var groups = new Map(), m4 = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(), col = new T.Color();
    for (var i = 0; i < big.count; i++) {
      big.getMatrixAt(i, m4); m4.decompose(p, q, s);
      var k = Math.floor(p.x / REGION) + ',' + Math.floor(p.y / REGION) + ',' + Math.floor(p.z / REGION);
      var g = groups.get(k); if (!g) groups.set(k, g = []);
      g.push(i);
    }
    var list = Array.from(groups.values()).sort(function (a, b) { return b.length - a.length; });
    list.forEach(function (idx) {
      var geo = big.geometry.clone(), mesh = new T.InstancedMesh(geo, big.material, idx.length);
      var lo = new T.Vector3(1e9, 1e9, 1e9), hi = new T.Vector3(-1e9, -1e9, -1e9), maxS = 0;
      idx.forEach(function (src, j) {
        big.getMatrixAt(src, m4); mesh.setMatrixAt(j, m4);
        if (big.instanceColor) { big.getColorAt(src, col); mesh.setColorAt(j, col); } else mesh.setColorAt(j, WHITE);
        m4.decompose(p, q, s); lo.min(p); hi.max(p); maxS = Math.max(maxS, s.x, s.y, s.z);
      });
      var c = lo.clone().add(hi).multiplyScalar(0.5);
      geo.boundingSphere = new T.Sphere(c, lo.distanceTo(hi) * 0.5 + maxS * 1.5 + 0.5);
      // formations cast shadows on the walls but do not receive them (thin cones show shadow acne)
      mesh.name = name; mesh.castShadow = shadow && !TU.caveMat.isLow(); mesh.receiveShadow = name === 'boulders' || name === 'cobbles';
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      (root || W.root).add(mesh); W.instRegions.push(mesh);
      if (out) { mesh.userData.seg = out.seg; out.regions.push(mesh); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Build                                                               */
  /* ------------------------------------------------------------------ */
  // Dressing as a job of small tasks, so an endless segment can be dressed a few ms per frame.
  // ctx (from cave.js) plus: pieces (default all), root (THREE.Group, default W.root), seg (index),
  // entrance (build the sky opening and the stake, default true), seed, findPrefix.
  // build(W, G, ctx) runs the whole job at once (the first cave). Returns the job: { step(ms), done, out }.
  function start(W, G, ctx) {
    var S = getShapes(), root = ctx.root || W.root, rand = ctx.rand, field = ctx.field, march = ctx.march;
    var M = ctx.mats, pieces = ctx.pieces || G.pieces, seg = ctx.seg || 0;
    var out = { stalactites: [], finds: [], stake: null, core: null, coreAxis: [1, 0, 0], stalSpot: null, seg: seg, regions: [] };
    if (!W.anim || ctx.fresh) {
      W.anim = { rays: [], ancient: null, ancients: [], gyros: [], motes: null, glints: [], waterTex: M.water.userData.normalTex, lights: [] };
      W.findMesh = {}; W.instRegions = [];
    }
    var tasks = [];
    var m4 = new T.Matrix4(), q = new T.Quaternion(), qy = new T.Quaternion(), sc = new T.Vector3(), p = new T.Vector3(), col = new T.Color(), e = new T.Euler(), yAxis = new T.Vector3(0, 1, 0);
    var gtmp = [0, 0, 0];
    function gradAt(x, y, z) { GEO.gradient(G, x, y, z, gtmp); var l = Math.sqrt(gtmp[0] * gtmp[0] + gtmp[1] * gtmp[1] + gtmp[2] * gtmp[2]) || 1; return [gtmp[0] / l, gtmp[1] / l, gtmp[2] / l]; }
    function pathDist(P, x, y, z) { var np = ctx.nearestOnPiece(P, x, y, z); if (!np) return { h: 99, d: 99, np: null }; var dx = x - np.p[0], dz = z - np.p[2]; return { h: Math.sqrt(dx * dx + dz * dz), d: Math.sqrt(np.d2), np: np }; }
    function randomInside(P) {
      if (P.room) {
        for (var t = 0; t < 6; t++) {
          var b = P.box, x = lerp(b.x0 + 1.5, b.x1 - 1.5, rand()), z = lerp(b.z0 + 1.5, b.z1 - 1.5, rand()), y = lerp(b.y0 + 2, b.y1 - 2, rand());
          if (field(x, y, z) < -0.8) return [x, y, z];
        }
        return null;
      }
      if (!P.segs.length) return null;
      var sg = P.segs[Math.floor(rand() * P.segs.length)], a = V.lerp(sg.path.pts[sg.i], sg.path.pts[sg.i + 1], rand());
      var r = P.prof ? P.prof.r[0] : 1.5;
      var ang = rand() * Math.PI * 2, pp = [a[0] + Math.cos(ang) * r * 0.5 * rand(), a[1], a[2] + Math.sin(ang) * r * 0.5 * rand()];
      return field(pp[0], pp[1], pp[2]) < -0.4 ? pp : (field(a[0], a[1], a[2]) < -0.4 ? a : null);
    }

    /* ---- speleothems ---- */
    var stal = inst(S.cone, M.calcite, MAX_STAL), stag = inst(S.cone, M.calcite, MAX_STAG), straw = inst(S.straw, M.calcite, MAX_STRAW);
    var nStal = 0, nStag = 0, nStraw = 0;
    var colGeo = { pos: [], nrm: [], col: [], idx: [] };
    function addStal(x, y, z, len, rad, P, s) {
      if (nStal >= MAX_STAL) return;
      var embed = 0.14 + rad * 0.7;
      p.set(x, y + embed, z); qy.setFromAxisAngle(yAxis, rand() * 6.283); q.copy(FLIP).multiply(qy);
      sc.set(rad, len + embed, rad * (0.85 + rand() * 0.3)); m4.compose(p, q, sc); stal.setMatrixAt(nStal, m4);
      stal.setColorAt(nStal, calciteTint(-y, rand(), col)); nStal++;
      out.stalactites.push({ pos: new T.Vector3(x, y - len, z), len: len, s: s, pieceId: P.id, main: P.role === 'main' && !P.bottom && !P.start });
    }
    function addStag(x, y, z, len, rad) {
      if (nStag >= MAX_STAG) return;
      var embed = 0.12 + rad * 0.5;
      p.set(x, y - embed, z); q.setFromAxisAngle(yAxis, rand() * 6.283);
      sc.set(rad, len + embed, rad * (0.85 + rand() * 0.3)); m4.compose(p, q, sc); stag.setMatrixAt(nStag, m4);
      stag.setColorAt(nStag, calciteTint(-y, rand(), col)); nStag++;
    }
    function addStraws(x, y, z, n) {
      for (var k = 0; k < n && nStraw < MAX_STRAW; k++) {
        var ox = x + (rand() - 0.5) * 1.2, oz = z + (rand() - 0.5) * 1.2, up = march([ox, y - 0.3, oz], [0, 1, 0], 1.2);
        if (up >= 1.19) continue;
        var cy = y - 0.3 + up, len = 0.08 + Math.pow(rand(), 1.5) * 0.55, r = 0.006 + rand() * 0.006;
        p.set(ox, cy + 0.05, oz); q.copy(FLIP); sc.set(r, len + 0.05, r); m4.compose(p, q, sc); straw.setMatrixAt(nStraw, m4);
        straw.setColorAt(nStraw, col.setRGB(0.95, 0.9, 0.8)); nStraw++;
      }
    }
    // A column (stalactite and stalagmite grown together), with a capsule collider.
    function addColumn(x, y0, y1, rw) {
      var H = y1 - y0, SEG = 12, RINGS = Math.max(6, Math.round(H / 0.35)), base = colGeo.pos.length / 3;
      var tint = calciteTint(-(y0 + y1) / 2, rand(), col);
      for (var rI = 0; rI <= RINGS; rI++) {
        var t = rI / RINGS, y = y0 - 0.3 + (H + 0.6) * t;
        var flare = 1 + 1.6 * Math.pow(Math.abs(t - 0.5) * 2, 3);
        for (var sI = 0; sI <= SEG; sI++) {
          var a = sI / SEG * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          var lump = 1 + 0.18 * N.n3(x + ca * 2, y * 2.4, z0 + sa * 2) + 0.07 * Math.sin(y * 18 + a * 3);
          var r = rw * flare * lump;
          colGeo.pos.push(x + ca * r, y, z0 + sa * r);
          colGeo.nrm.push(ca, 0, sa);
          colGeo.col.push(tint.r, tint.g, tint.b);
        }
      }
      for (rI = 0; rI < RINGS; rI++) for (var s2 = 0; s2 < SEG; s2++) {
        var a0 = base + rI * (SEG + 1) + s2, b0 = a0 + SEG + 1;
        colGeo.idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
      ctx.addCollider({ t: 1, a: [x, y0 + rw, z0], b: [x, y1 - rw, z0], r: rw * 1.05 + 0.05 });
    }
    var z0 = 0; // column z (set before addColumn)
    function decoPiece(P) {
      if (P.type === 'squeeze' || P.start) return;
      var deco = P.deco || 0; if (deco < 0.04) return;
      var tries = Math.round(deco * (P.room ? P.cells.length * 10 : 6) * (0.7 + 0.6 * rand()));
      var bell = P.lmName === 'The Bell Chamber', organ = P.lmName === 'The Pipe Organ';
      for (var a = 0; a < tries; a++) {
        var b = randomInside(P); if (!b) continue;
        var up = march(b, [0, 1, 0], 26); if (up > 25.5) continue;
        var c = [b[0], b[1] + up, b[2]];
        if (P.sky && c[1] > -0.5) continue;
        var g = gradAt(c[0], c[1] + 0.05, c[2]); if (g[1] < 0.55) continue; // only on ceilings that face down
        var down = march(b, [0, -1, 0], 30), gap = up + down;
        var r = rand();
        var len = (P.room ? 0.25 + Math.pow(r, 2.3) * 2.6 : 0.12 + Math.pow(r, 2.1) * 1.05) * (bell ? 1.8 : 1);
        len = Math.min(len, gap * 0.42);
        if (!P.room) { var pd = pathDist(P, c[0], c[1], c[2]); if (pd.np) len = Math.min(len, c[1] - (pd.np.p[1] + 0.7)); }
        if (len < 0.08) continue;
        var rad = len * (0.08 + rand() * 0.09) + 0.015;
        var s = (pathDist(P, b[0], b[1], b[2]).np || { s: 0 }).s;
        // columns where floor and ceiling nearly meet
        if (gap < 3.9 && deco > 0.5 && (rand() < 0.3 || organ) && down < 25) {
          var pdc = pathDist(P, b[0], b[1], b[2]);
          if (pdc.h > (P.room ? 2.2 : 1.6) + gap * 0.1) { z0 = b[2]; addColumn(b[0], b[1] - down, c[1], 0.18 + gap * 0.05 + rand() * 0.12); continue; }
        }
        addStal(c[0], c[1], c[2], len, rad, P, s);
        var cluster = rand() < 0.38 ? 1 + Math.floor(rand() * 4) : 0;
        for (var k = 0; k < cluster; k++) {
          var ox = c[0] + (rand() - 0.5) * 1.3, oz = c[2] + (rand() - 0.5) * 1.3, u2 = march([ox, b[1], oz], [0, 1, 0], 26);
          if (u2 > 25.5 || field(ox, b[1], oz) > -0.2) continue;
          var cy = b[1] + u2, g2 = gradAt(ox, cy + 0.05, oz); if (g2[1] < 0.5) continue;
          var l2 = len * (0.25 + rand() * 0.7); addStal(ox, cy, oz, l2, l2 * (0.08 + rand() * 0.08) + 0.012, P, s);
        }
        if (deco > 0.55 && rand() < 0.22) addStraws(c[0], c[1], c[2], 5 + Math.floor(rand() * 10));
        // a stalagmite grows under the drip
        if (down < 25 && rand() < (P.room ? 0.55 : 0.3)) {
          var f = [b[0] + (rand() - 0.5) * 0.3, b[1] - down, b[2] + (rand() - 0.5) * 0.3], gf = gradAt(f[0], f[1] - 0.05, f[2]);
          if (gf[1] > -0.6) continue; // floor must face up
          var pdd = pathDist(P, f[0], f[1], f[2]);
          var sl = (P.room ? 0.2 + Math.pow(rand(), 2) * 2.1 : 0.15 + Math.pow(rand(), 2) * 0.9);
          sl = Math.min(sl, gap * 0.35);
          if (P.dry) { if (f[1] < P.waterY) continue; }
          if (pdd.h < (P.room ? 1.8 : 1.0) + sl * 0.4) continue;
          var sr = sl * (0.16 + rand() * 0.14) + 0.03;
          addStag(f[0], f[1], f[2], sl, sr);
          if (sl > 0.9) ctx.addCollider({ t: 1, a: [f[0], f[1] + sr, f[2]], b: [f[0], f[1] + sl * 0.6, f[2]], r: sr * 0.7 });
        }
      }
    }
    pieces.forEach(function (P) { tasks.push(function () { decoPiece(P); }); });
    // giant stalactites in the Bell Chamber, organ pipes in the Pipe Organ
    tasks.push(function () { pieces.forEach(function (P) {
      if (P.lmName === 'The Bell Chamber') {
        for (var k = 0; k < 7; k++) {
          var x = P.center[0] + (rand() - 0.5) * 9, z = P.center[2] + (rand() - 0.5) * 9, b = [x, P.floorY + 3, z];
          if (field(b[0], b[1], b[2]) > -1) continue;
          var up = march(b, [0, 1, 0], 20); if (up > 19) continue;
          var len = Math.min(2.5 + rand() * 2.5, (up + 3) * 0.55); addStal(x, b[1] + up, z, len, len * 0.12, P, 0);
        }
      }
      if (P.lmName === 'The Pipe Organ') {
        var a0 = rand() * Math.PI * 2;
        for (var j = 0; j < 11; j++) {
          var ang = a0 + j * 0.16, rr = Math.min(P.box.x1 - P.box.x0, P.box.z1 - P.box.z0) * 0.3;
          var x2 = P.center[0] + Math.cos(ang) * rr, z2 = P.center[2] + Math.sin(ang) * rr, by = P.floorY + 2;
          if (field(x2, by, z2) > -0.8) continue;
          var u3 = march([x2, by, z2], [0, 1, 0], 20), d3 = march([x2, by, z2], [0, -1, 0], 10);
          if (u3 > 19 || d3 > 9) continue;
          z0 = z2; addColumn(x2, by - d3, by + u3, 0.22 + 0.1 * Math.sin(j * 1.7) + 0.06 * rand());
        }
      }
    }); });
    tasks.push(function () {
    stal.count = nStal; stag.count = nStag; straw.count = nStraw;
    splitRegions(W, stal, 'stalactites', true, root, out); splitRegions(W, stag, 'stalagmites', true, root, out); splitRegions(W, straw, 'sodastraws', false, root, out);
    if (colGeo.idx.length) {
      var cg = new T.BufferGeometry();
      cg.setAttribute('position', new T.Float32BufferAttribute(colGeo.pos, 3));
      cg.setAttribute('normal', new T.Float32BufferAttribute(colGeo.nrm, 3));
      cg.setAttribute('color', new T.Float32BufferAttribute(colGeo.col, 3));
      cg.setIndex(colGeo.pos.length / 3 > 65535 ? new T.Uint32BufferAttribute(colGeo.idx, 1) : new T.Uint16BufferAttribute(colGeo.idx, 1));
      cg.computeVertexNormals();
      var cm = new T.Mesh(cg, M.calcite); cm.name = 'columns'; cm.castShadow = true; cm.receiveShadow = true; cm.frustumCulled = false;
      root.add(cm);
    }
    });

    /* ---- the bottom: the Ancient Ring ---- */
    var B = ctx.bottom || G.bottom;
    var core = [B.center[0], B.floorY + 5.2, B.center[2]];
    for (var tr = 0; tr < 8 && field(core[0], core[1], core[2]) > -3; tr++) core[1] += 0.8;
    var entry = B.arms && B.arms[0] ? B.arms[0].q : [core[0] + 10, core[1], core[2]];
    var axis = [entry[0] - core[0], 0, entry[2] - core[2]], al = Math.sqrt(axis[0] * axis[0] + axis[2] * axis[2]);
    axis = al > 0.5 ? [axis[0] / al, 0, axis[2] / al] : [1, 0, 0];
    out.core = core; out.coreAxis = axis;
    tasks.push(function () { buildAncient(W, G, ctx, core, axis, B, root, seg); });

    /* ---- breakdown boulders ---- */
    var blocks = inst(S.block, M.boulder, MAX_BOULDER), rounds = inst(S.round, M.boulder, MAX_BOULDER);
    var nb = 0, nr = 0;
    function boulderPiece(P) {
      var t = P.type;
      if (t === 'squeeze' || t === 'current' || t === 'shaft_down' || t === 'shaft_up' || P.start) return;
      var n = P.room ? Math.round(P.cells.length * (4 + 4 * rand()) * (P.zone >= 2 ? 1.4 : 1)) : (rand() < 0.4 ? 1 + Math.floor(rand() * 3) : 0);
      for (var k = 0; k < n; k++) {
        var b = randomInside(P); if (!b) continue;
        var down = march(b, [0, -1, 0], 20); if (down > 19) continue;
        var f = [b[0], b[1] - down, b[2]], gf = gradAt(f[0], f[1] - 0.05, f[2]);
        if (gf[1] > -0.45) continue;
        if (P.dry && f[1] < P.waterY + 0.2) continue;
        var r = rand(), size = P.room ? 0.25 + Math.pow(r, 3) * 2.0 : 0.12 + Math.pow(r, 2) * 0.45;
        var pd = pathDist(P, f[0], f[1], f[2]);
        if (pd.h < size + (P.room ? 1.5 : 0.9)) continue;
        if (P.room && P.ports.some(function (pt) { return Math.hypot(pt.pos[0] - f[0], pt.pos[2] - f[2]) < size + 2.5; })) continue;
        if (P.bottom && Math.hypot(f[0] - core[0], f[2] - core[2]) < 12) continue;
        var blocky = rand() < (P.room ? 0.7 : 0.35);
        var sx = size * (0.8 + rand() * 0.5), sy = size * (0.5 + rand() * 0.4), sz = size * (0.8 + rand() * 0.5);
        p.set(f[0], f[1] + sy * 0.32, f[2]); e.set((rand() - 0.5) * 0.5, rand() * 6.283, (rand() - 0.5) * 0.5); q.setFromEuler(e); sc.set(sx, sy, sz);
        m4.compose(p, q, sc);
        var vv = 0.75 + rand() * 0.4, pc = ctx.palette(-f[1], [0, 0, 0]);
        col.setRGB(Math.pow(pc[0], 1 / 2.2) * vv, Math.pow(pc[1], 1 / 2.2) * vv, Math.pow(pc[2], 1 / 2.2) * vv);
        if (blocky && nb < MAX_BOULDER) { blocks.setMatrixAt(nb, m4); blocks.setColorAt(nb, col); nb++; }
        else if (!blocky && nr < MAX_BOULDER) { rounds.setMatrixAt(nr, m4); rounds.setColorAt(nr, col); nr++; }
        else continue;
        if (size > 0.28) ctx.addCollider({ t: 0, c: [p.x, p.y, p.z], r: (sx + sy + sz) / 3 * 0.48 });
      }
    }
    pieces.forEach(function (P) { tasks.push(function () { boulderPiece(P); }); });
    tasks.push(function () {
    blocks.count = nb; rounds.count = nr;
    splitRegions(W, blocks, 'boulders', true, root, out); splitRegions(W, rounds, 'cobbles', true, root, out);
    // rubble for collapses (filled later; one shared mesh on the cave root, it outlives segments)
    if (!W.rubble) {
      var rub = inst(S.block, M.boulder, MAX_RUBBLE); rub.count = 0; rub.frustumCulled = false; rub.castShadow = true; rub.name = 'rubble';
      W.root.add(rub); W.rubble = rub;
    }

    /* ---- water surfaces ---- */
    pieces.forEach(function (P) {
      if (P.type === 'air_pocket') waterPlane(root, M, P.node[0], P.waterY, P.node[2], 7.6, 7.6);
      if (P.dry || P.airChamber) waterPlane(root, M, P.center[0], P.waterY, P.center[2], P.box.x1 - P.box.x0, P.box.z1 - P.box.z0);
    });
    });
    if (ctx.entrance !== false) tasks.push(function () {
    var E = G.entrance;
    var ew = waterPlane(root, M, E.pool[0], 0, E.pool[2], 16, 16);
    // the entrance pool is lit by the sky: thinner, so the bright opening shows through
    ew.material = own(M.water.clone()); ew.material.opacity = 0.55; ew.material.color.set(0x2a6a70); ew.material.onBeforeCompile = M.water.onBeforeCompile; ew.material.customProgramCacheKey = M.water.customProgramCacheKey;

    /* ---- the entrance: sky, sun shafts, roots, the rope stake ---- */
    var sky = new T.Mesh(new T.CircleGeometry(18, 40), own(new T.MeshBasicMaterial({ color: 0xd6f1ea, fog: false })));
    sky.rotation.x = Math.PI / 2; sky.position.set(E.pool[0], 24, E.pool[2]); root.add(sky);
    var halo = new T.Sprite(own(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0xbff3e8, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, fog: false })));
    halo.scale.setScalar(26); halo.position.set(E.pool[0], 20, E.pool[2]); root.add(halo);
    var rt = rayTexture(); (rt.userData = rt.userData || {}).own = true;
    for (var k = 0; k < 8; k++) {
      var ray = new T.Mesh(new T.PlaneGeometry(1.0 + rand() * 1.8, 8), own(new T.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false, color: 0x9FE3D6 })));
      ray.geometry.translate(0, -4, 0); // from the opening down to the water surface (the pool hides the rest)
      ray.position.set(E.pool[0] + (rand() - 0.5) * 5, 7.5, E.pool[2] + (rand() - 0.5) * 5);
      ray.rotation.set((rand() - 0.5) * 0.35, rand() * 3, (rand() - 0.5) * 0.35);
      ray.userData.ph = rand() * 6; W.anim.rays.push(ray); root.add(ray);
    }
    var dayL = new T.PointLight(0x9FE3D6, 1.1, 15, 1.6); dayL.position.set(E.pool[0], -1.5, E.pool[2]); root.add(dayL); W.anim.dayLight = dayL;
    // hanging roots at the rim
    var rootsM = inst(white(new T.CylinderGeometry(0.6, 1, 1, 4, 1, true).translate(0, -0.5, 0)), own(new T.MeshStandardMaterial({ vertexColors: true, color: 0x2a1d12, roughness: 0.9 })), 40), nRoot = 0;
    for (k = 0; k < 40; k++) {
      var an = rand() * Math.PI * 2, hy = 3 + rand() * 4.5, dd = march([E.pool[0], hy, E.pool[2]], [Math.cos(an), 0, Math.sin(an)], 9);
      if (dd > 8.8) continue;
      var rp = [E.pool[0] + Math.cos(an) * (dd - 0.05), hy, E.pool[2] + Math.sin(an) * (dd - 0.05)];
      var rl = 0.8 + rand() * Math.min(3.5, hy - 0.3);
      p.set(rp[0], rp[1], rp[2]); e.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25); q.setFromEuler(e); var rw = 0.012 + rand() * 0.03; sc.set(rw, rl, rw);
      m4.compose(p, q, sc); rootsM.setMatrixAt(nRoot, m4); rootsM.setColorAt(nRoot, col.setRGB(0.8 + rand() * 0.3, 0.8, 0.75)); nRoot++;
    }
    rootsM.count = nRoot; rootsM.frustumCulled = false; root.add(rootsM);
    // the stake: a steel bolt in the wall just under the surface, where the rope is tied off
    var exitDir = ctx.pathAt(G.main, 6).p, away = [E.pool[0] - exitDir[0], 0, E.pool[2] - exitDir[2]], awl = Math.sqrt(away[0] * away[0] + away[2] * away[2]) || 1;
    away = [away[0] / awl, 0, away[2] / awl];
    var sy0 = -0.7, sd = march([E.pool[0], sy0, E.pool[2]], away, 12);
    var wallP = [E.pool[0] + away[0] * sd, sy0, E.pool[2] + away[2] * sd];
    var stakeMat = own(new T.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.35, metalness: 0.7 }));
    var stake = new T.Group();
    var rod = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.5, 8), stakeMat); rod.rotation.z = Math.PI / 2; rod.position.x = 0.12; stake.add(rod);
    var ringM = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 6, 16), stakeMat); ringM.position.x = 0.36; stake.add(ringM);
    var tag = new T.Mesh(new T.BoxGeometry(0.14, 0.09, 0.01), own(new T.MeshStandardMaterial({ color: 0xff7a22, emissive: 0x401400, roughness: 0.5 }))); tag.position.set(0.3, -0.1, 0); stake.add(tag);
    stake.position.set(wallP[0], wallP[1], wallP[2]);
    stake.rotation.y = Math.atan2(away[2], -away[0]); // local +x points out of the wall
    root.add(stake);
    out.stake = new T.Vector3(wallP[0] - away[0] * 0.38, sy0, wallP[2] - away[2] * 0.38);
    });

    /* ---- landmark props ---- */
    pieces.forEach(function (P) { if (P.type === 'landmark') tasks.push(function () { buildLandmark(W, G, ctx, P, rand, root); }); });

    /* ---- dry chamber glowworms ---- */
    pieces.forEach(function (P) {
      if (!P.dry) return;
      tasks.push(function () {
      var pts = [];
      for (var k2 = 0; k2 < 320; k2++) {
        var b = randomInside(P); if (!b || b[1] < P.waterY) continue;
        var up = march(b, [0, 1, 0], 20); if (up > 19) continue;
        pts.push(b[0] + (rand() - 0.5) * 0.2, b[1] + up - 0.04, b[2] + (rand() - 0.5) * 0.2);
      }
      if (!pts.length) return;
      var gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      var pm = own(new T.PointsMaterial({ color: 0x7FE8FF, size: 0.07, map: TU.tex.get('dot'), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
      var pp = new T.Points(gg, pm); pp.name = 'glowworms'; root.add(pp);
      });
    });

    /* ---- finds: fossils and treasure ---- */
    tasks.push(function () { buildFinds(W, G, ctx, out, rand, pieces, B, root); });

    /* ---- a good look at a big stalactite on the main line (filming and the test) ---- */
    tasks.push(function () {
    var bestS = null;
    out.stalactites.forEach(function (st) {
      if (!st.main || st.s < 15) return;
      if (Math.hypot(st.pos.x - core[0], st.pos.y - core[1], st.pos.z - core[2]) < 16) return;
      if (!bestS || st.len > bestS.len) {
        // need a clear viewpoint below and beside it
        for (var k3 = 0; k3 < 8; k3++) {
          var an2 = k3 / 8 * Math.PI * 2, vp = [st.pos.x + Math.cos(an2) * 2.6, st.pos.y - 1.1, st.pos.z + Math.sin(an2) * 2.6];
          if (field(vp[0], vp[1], vp[2]) > -0.6) continue;
          var mid = [st.pos.x, st.pos.y + st.len * 0.5, st.pos.z], dv = V.sub(mid, vp), dl = V.len(dv);
          if (march(vp, V.norm(dv), dl) < dl - 0.4) continue;
          bestS = st; bestS.view = vp; break;
        }
      }
    });
    if (bestS) {
      var vp2 = bestS.view, mid2 = [bestS.pos.x, bestS.pos.y + bestS.len * 0.5, bestS.pos.z];
      var yp = U.yawPitchOf({ x: mid2[0] - vp2[0], y: mid2[1] - vp2[1], z: mid2[2] - vp2[2] });
      out.stalSpot = { pos: new T.Vector3(vp2[0], vp2[1], vp2[2]), yaw: yp.yaw, pitch: clamp(yp.pitch, -1.3, 1.3), s: bestS.s, pathId: 'main' };
    }
    W.counts = { stalactites: nStal, stalagmites: nStag, straws: nStraw, boulders: nb + nr };
    });
    var ti = 0;
    var job = {
      out: out, done: false, tasks: tasks.length,
      // run tasks for up to ms milliseconds (at least one); true when everything is done
      step: function (ms) {
        var t0 = performance.now();
        while (ti < tasks.length) { tasks[ti++](); if (performance.now() - t0 > ms) break; }
        job.done = ti >= tasks.length;
        return job.done;
      }
    };
    return job;
  }
  function build(W, G, ctx) { var job = start(W, G, ctx); job.step(Infinity); return job.out; }
  function waterPlane(root, M, x, y, z, sx, sz) {
    var m = new T.Mesh(new T.PlaneGeometry(sx, sz), M.water);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 2; m.name = 'water';
    root.add(m); return m;
  }

  /* ------------------------------------------------------------------ */
  /* The Ancient Ring                                                    */
  /* ------------------------------------------------------------------ */
  function buildAncient(W, G, ctx, core, axis, B, root, seg) {
    root = root || W.root; var rand = ctx.rand, field = ctx.field, march = ctx.march;
    var group = new T.Group(); group.name = 'ancient';
    var texRockN = TU.tex.get('rockNormal');
    var glyph = TU.tex.get('glyph').clone(); (glyph.userData = glyph.userData || {}).own = true; glyph.needsUpdate = true; glyph.wrapS = T.RepeatWrapping; glyph.repeat.set(4, 1);
    var stone = own(new T.MeshStandardMaterial({ color: 0x22282a, roughness: 0.62, metalness: 0.18, normalMap: texRockN, normalScale: new T.Vector2(1.1, 1.1), emissive: 0x4FF2D0, emissiveMap: glyph, emissiveIntensity: 0.5 }));
    var dark = own(new T.MeshStandardMaterial({ color: 0x1a1f21, roughness: 0.5, metalness: 0.4, normalMap: texRockN, normalScale: new T.Vector2(0.6, 0.6) }));
    var glyph2 = TU.tex.get('glyph').clone(); (glyph2.userData = glyph2.userData || {}).own = true; glyph2.needsUpdate = true; glyph2.wrapS = T.RepeatWrapping; glyph2.repeat.set(10, 1);
    var daisM = own(new T.MeshStandardMaterial({ color: 0x262b2c, roughness: 0.7, metalness: 0.1, normalMap: texRockN, emissive: 0x29F0C8, emissiveMap: glyph2, emissiveIntensity: 0.35 }));
    // main ring, slightly weathered
    var tg = new T.TorusGeometry(4.3, 0.55, 22, 140), tp = tg.attributes.position, i;
    for (i = 0; i < tp.count; i++) { var x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i); var d = 1 + 0.035 * N.fbm(x * 1.4, y * 1.4, z * 1.4 + 4, 3); tp.setXYZ(i, x * d, y * d, z * (1 + 0.25 * N.n3(x * 0.8, y * 0.8, 3))); }
    tg.computeVertexNormals();
    var ring = new T.Mesh(tg, stone); ring.castShadow = true; ring.receiveShadow = true; group.add(ring);
    // notches around the ring (like a dial)
    for (i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2, nb = new T.Mesh(new T.BoxGeometry(0.34, 0.9, 0.9), dark);
      nb.position.set(Math.cos(a) * 4.95, Math.sin(a) * 4.95, 0); nb.rotation.z = a; group.add(nb);
    }
    // gyroscope rings that turn slowly around the core
    var gm = own(new T.MeshStandardMaterial({ color: 0x3b4446, roughness: 0.35, metalness: 0.7, emissive: 0x3D7BFF, emissiveIntensity: 0.25 }));
    var g1 = new T.Mesh(new T.TorusGeometry(3.05, 0.09, 10, 100), gm), g2 = new T.Mesh(new T.TorusGeometry(2.3, 0.07, 10, 90), gm);
    group.add(g1, g2); W.anim.gyros = [g1, g2]; var gyros = [g1, g2];
    // the core
    var coreG = new T.IcosahedronGeometry(0.62, 2), cp = coreG.attributes.position;
    for (i = 0; i < cp.count; i++) { var cx = cp.getX(i), cy = cp.getY(i), cz = cp.getZ(i), dd = 1 + 0.12 * N.n3(cx * 3, cy * 3, cz * 3); cp.setXYZ(i, cx * dd, cy * dd, cz * dd); }
    coreG.computeVertexNormals();
    var coreM = new T.Mesh(coreG, own(new T.MeshBasicMaterial({ color: 0x8ff6ff })));
    group.add(coreM);
    var halo = new T.Sprite(own(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0x4fe6ff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, fog: false })));
    halo.scale.setScalar(6); group.add(halo);
    var halo2 = new T.Sprite(own(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0x8E6BFF, transparent: true, opacity: 0.25, blending: T.AdditiveBlending, depthWrite: false, fog: true })));
    halo2.scale.setScalar(16); group.add(halo2);
    group.position.set(core[0], core[1], core[2]);
    group.lookAt(core[0] + axis[0], core[1], core[2] + axis[2]);
    root.add(group);
    // stepped dais under the ring
    var fy = core[1] - march(core, [0, -1, 0], 12);
    var dais = new T.Group(); dais.name = 'dais';
    [[7.2, 0.5], [5.6, 0.5], [4.1, 0.45]].forEach(function (s, k) {
      var c = new T.Mesh(new T.CylinderGeometry(s[0], s[0] * 1.03, s[1], 64, 1), daisM);
      c.position.set(core[0], fy - 0.2 + k * 0.48 + s[1] / 2, core[2]); c.receiveShadow = true; c.castShadow = true; dais.add(c);
    });
    root.add(dais);
    // standing stones in a circle, some fallen
    var rmax = 10.5;
    for (i = 0; i < 9; i++) {
      var an = i / 9 * Math.PI * 2 + 0.35, placed = false;
      for (var rr = rmax; rr >= 7.5 && !placed; rr -= 1.5) {
        var px = core[0] + Math.cos(an) * rr, pz = core[2] + Math.sin(an) * rr;
        if (field(px, core[1], pz) > -1.2) continue;
        var dn = march([px, core[1], pz], [0, -1, 0], 14), up = march([px, core[1], pz], [0, 1, 0], 14);
        if (dn > 13) continue;
        var py = core[1] - dn, h = Math.min(3 + rand() * 3.5, dn + up - 1.2);
        if (h < 1.6) continue;
        var fallen = rand() < 0.22, broken = !fallen && rand() < 0.3;
        if (broken) h *= 0.55;
        var bg = new T.BoxGeometry(1.15, h, 0.75, 2, 6, 2); bg.translate(0, h / 2, 0);
        var bp = bg.attributes.position;
        for (var j = 0; j < bp.count; j++) { var bx = bp.getX(j), by = bp.getY(j), bz = bp.getZ(j), w = 0.07 * N.n3(bx * 3 + i, by * 2, bz * 3); bp.setXYZ(j, bx + w, by, bz + w); }
        bg.computeVertexNormals();
        var mono = new T.Mesh(bg, dark); mono.castShadow = true; mono.receiveShadow = true; mono.name = 'monolith';
        var strip = new T.Mesh(new T.PlaneGeometry(0.32, h * 0.8), own(new T.MeshBasicMaterial({ map: glyph, color: 0x4FF2D0, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false })));
        strip.position.set(0, h * 0.5, 0.39); mono.add(strip);
        mono.position.set(px, py - 0.25, pz);
        mono.lookAt(core[0], py - 0.25, core[2]);
        if (fallen) { mono.rotateX(-1.35); mono.position.y += 0.3; }
        else mono.rotateZ((rand() - 0.5) * 0.12);
        root.add(mono);
        if (!fallen) { var mc = ctx.addCollider({ t: 1, a: [px, py + 0.4, pz], b: [px, py + h - 0.4, pz], r: 0.55 }); mono.userData.col = mc; }
        placed = true;
      }
    }
    // bones of something enormous, half buried beside the dais
    var side = [-axis[2], 0, axis[0]], bonePos = [core[0] + side[0] * 9.5 - axis[0] * 3, 0, core[2] + side[2] * 9.5 - axis[2] * 3];
    var bdn = march([bonePos[0], core[1], bonePos[2]], [0, -1, 0], 14);
    if (field(bonePos[0], core[1], bonePos[2]) < -1 && bdn < 13) {
      var by0 = core[1] - bdn, boneM = own(new T.MeshStandardMaterial({ color: 0xD9CFB8, roughness: 0.75 }));
      var spinePts = [];
      for (i = 0; i <= 12; i++) { var t = i / 12; spinePts.push(new T.Vector3(bonePos[0] + axis[0] * (t - 0.5) * 12, by0 + 0.35 + Math.sin(t * Math.PI) * 0.6, bonePos[2] + axis[2] * (t - 0.5) * 12)); }
      var spine = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(spinePts), 60, 0.22, 8, false), boneM); spine.castShadow = true; root.add(spine);
      for (i = 1; i < 10; i++) {
        var tt = i / 10, base = spinePts[Math.round(tt * 12)], ribL = 2.6 * Math.sin(tt * Math.PI) + 0.8;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var rp = [];
          for (var k = 0; k <= 8; k++) { var u = k / 8, ang = u * Math.PI * 0.95; rp.push(new T.Vector3(base.x + side[0] * sgn * Math.sin(ang) * ribL, base.y + Math.cos(ang) * ribL * 0.9 - ribL * 0.55 * u * u, base.z + side[2] * sgn * Math.sin(ang) * ribL)); }
          var rib = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rp), 16, 0.09 + 0.04 * (1 - u), 6, false), boneM); rib.castShadow = true; root.add(rib);
        }
      }
      var skull = new T.Mesh(new T.SphereGeometry(1, 16, 12), boneM); skull.scale.set(1.3, 0.9, 1.8);
      skull.position.copy(spinePts[12]).add(new T.Vector3(axis[0] * 1.6, 0.1, axis[2] * 1.6)); root.add(skull);
      ctx.addCollider({ t: 0, c: [skull.position.x, skull.position.y, skull.position.z], r: 1.0 });
    }
    // drifting motes around the core
    var mp = [], mrand = TU.rng(ctx.seed != null ? ctx.seed : G.seed, 15).fn();
    for (i = 0; i < 140; i++) { var r3 = 1.6 + mrand() * 8, th = mrand() * 6.283, ph = (mrand() - 0.5) * 2.2; mp.push(Math.cos(th) * Math.cos(ph) * r3, Math.sin(ph) * r3 * 0.6, Math.sin(th) * Math.cos(ph) * r3); }
    var mg = new T.BufferGeometry(); mg.setAttribute('position', new T.Float32BufferAttribute(mp, 3));
    var motes = new T.Points(mg, own(new T.PointsMaterial({ color: 0x6FFFE9, size: 0.09, map: TU.tex.get('dot'), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })));
    motes.position.set(core[0], core[1], core[2]); root.add(motes);
    // One light for the whole bottom chamber (every dynamic light costs on every lit pixel, so we keep few).
    // The ring's violet glow comes from its emissive material instead of a second light.
    // Endless mode adds more rings: they all share this one light, which follows the nearest ring.
    var lightPos = new T.Vector3(core[0], (core[1] + fy + 1.8) / 2, core[2]);
    if (!W.coreLight) { W.coreLight = new T.PointLight(0x4fc8ff, 1.2, 30, 1.6); W.root.add(W.coreLight); W.coreLight.position.copy(lightPos); }
    var an = { group: group, ring: stone, dais: daisM, core: coreM, halo: halo, halo2: halo2, motes: motes, light: W.coreLight, light2: null, gyro: gm, gyros: gyros,
      pos: new T.Vector3(core[0], core[1], core[2]), lightPos: lightPos, seg: seg || 0, power: 0 };
    W.anim.ancients.push(an); W.anim.ancient = an;
  }

  /* ------------------------------------------------------------------ */
  /* Landmark props                                                      */
  /* ------------------------------------------------------------------ */
  function buildLandmark(W, G, ctx, P, rand, root) {
    root = root || W.root; var field = ctx.field, march = ctx.march;
    var name = P.lmName, c = [P.center[0], P.floorY + 2.5, P.center[2]];
    if (field(c[0], c[1], c[2]) > -1) c[1] += 2;
    var fy = c[1] - march(c, [0, -1, 0], 12);
    var rust = own(new T.MeshStandardMaterial({ color: 0x5b3b24, roughness: 0.85, metalness: 0.35, normalMap: TU.tex.get('rockNormal'), normalScale: new T.Vector2(0.4, 0.4) }));
    var g = new T.Group(); g.name = 'landmark-' + name;
    var off = [(rand() - 0.5) * 3, 0, (rand() - 0.5) * 3];
    if (name === 'The Drowned Truck') {
      var chassis = new T.Mesh(new T.BoxGeometry(4.6, 0.45, 1.9), rust); chassis.position.y = 0.7; g.add(chassis);
      var cab = new T.Mesh(new T.BoxGeometry(1.6, 1.5, 1.85), rust); cab.position.set(1.4, 1.65, 0); g.add(cab);
      var hood = new T.Mesh(new T.BoxGeometry(0.9, 0.8, 1.7), rust); hood.position.set(2.55, 1.25, 0); g.add(hood);
      var glass = new T.Mesh(new T.PlaneGeometry(1.5, 0.7), own(new T.MeshStandardMaterial({ color: 0x0b1416, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.7 }))); glass.position.set(2.21, 2.0, 0); glass.rotation.y = Math.PI / 2; g.add(glass);
      [-1, 1].forEach(function (s) { var side = new T.Mesh(new T.BoxGeometry(2.6, 0.6, 0.06), rust); side.position.set(-0.95, 1.25, s * 0.92); g.add(side); });
      var wheelG = new T.CylinderGeometry(0.46, 0.46, 0.3, 18); var tyre = own(new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }));
      [[1.6, 0.92], [1.6, -0.92], [-1.5, 0.92], [-1.5, -0.92]].forEach(function (w) { var wh = new T.Mesh(wheelG, tyre); wh.rotation.x = Math.PI / 2; wh.position.set(w[0], 0.46, w[1]); g.add(wh); });
      g.rotation.set(0.08, rand() * 6, -0.14);
      g.position.set(c[0] + off[0], fy - 0.15, c[2] + off[2]);
      var dir = [Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y)];
      [-1.5, 0, 1.6].forEach(function (k) { ctx.addCollider({ t: 0, c: [g.position.x + dir[0] * k, fy + 1.1, g.position.z + dir[2] * k], r: 1.05 }); });
    } else if (name === 'The Old Camp') {
      var wood = own(new T.MeshStandardMaterial({ color: 0x4a3622, roughness: 0.9 }));
      for (var i = 0; i < 3; i++) { var cr = new T.Mesh(new T.BoxGeometry(0.7, 0.5, 0.5), wood); cr.position.set(i * 0.75 - 0.75, 0.25 + (i === 1 ? 0.5 : 0), 0); cr.rotation.y = (rand() - 0.5) * 0.4; g.add(cr); }
      var tank = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.65, 14), own(new T.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.6, metalness: 0.6 }))); tank.rotation.z = Math.PI / 2; tank.position.set(0.3, 0.1, 0.8); g.add(tank);
      var coil = new T.Mesh(new T.TorusGeometry(0.25, 0.04, 8, 24), own(new T.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.8 }))); coil.rotation.x = Math.PI / 2; coil.position.set(-0.6, 0.05, 0.85); g.add(coil);
      var lamp = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.3, 10), rust); lamp.position.set(0.1, 1.05, 0); g.add(lamp);
      var tarp = new T.Mesh(new T.PlaneGeometry(2.4, 1.6, 6, 4), own(new T.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.95, side: T.DoubleSide })));
      var tpz = tarp.geometry.attributes.position; for (i = 0; i < tpz.count; i++) tpz.setZ(i, 0.08 * N.n3(tpz.getX(i) * 2, tpz.getY(i) * 2, 1));
      tarp.geometry.computeVertexNormals(); tarp.rotation.x = -Math.PI / 2; tarp.position.set(0, 0.03, -1.2); g.add(tarp);
      g.position.set(c[0] + off[0], fy, c[2] + off[2]); g.rotation.y = rand() * 6;
      ctx.addCollider({ t: 0, c: [g.position.x, fy + 0.4, g.position.z], r: 0.8 });
    } else if (name === 'The Wrong Way Room') {
      // an old guideline across the room, its arrows pointing back to where you came in
      var a0 = P.arms[0] ? P.arms[0].q : [P.box.x0 + 2, fy + 1, P.center[2]], a1 = P.arms[1] ? P.arms[1].q : [P.box.x1 - 2, fy + 1, P.center[2]];
      var lineM = own(new T.MeshStandardMaterial({ color: 0xe8e4d6, roughness: 0.6 })), arrowM = own(new T.MeshStandardMaterial({ color: 0xff7a22, roughness: 0.5 }));
      var pts = [new T.Vector3(a0[0], a0[1], a0[2]), new T.Vector3(c[0], fy + 0.9, c[2]), new T.Vector3(a1[0], a1[1], a1[2])];
      var curve = new T.CatmullRomCurve3(pts);
      root.add(new T.Mesh(new T.TubeGeometry(curve, 40, 0.012, 5, false), lineM));
      for (i = 1; i < 7; i++) {
        var u = i / 7, pp = curve.getPointAt(u), tg = curve.getTangentAt(u).negate();
        var ar = new T.Mesh(new T.ConeGeometry(0.06, 0.16, 3), arrowM); ar.position.copy(pp);
        ar.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tg); root.add(ar);
      }
      var tank2 = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.65, 14), own(new T.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.7 }))); tank2.rotation.set(Math.PI / 2, 0, 0.4); tank2.position.set(c[0] + off[0], fy + 0.1, c[2] + off[2]); root.add(tank2);
    }
    if (g.children.length) root.add(g);
  }

  /* ------------------------------------------------------------------ */
  /* Finds: fossils and treasure                                         */
  /* ------------------------------------------------------------------ */
  var FOSSIL = [['Ammonite', 'Sea lily stem'], ['Trilobite', 'Fossil shark tooth'], ['Cave bear tooth', 'Nautilus shell'], ['Ichthyosaur vertebra', 'Giant ammonite'], ['Unknown skull', 'Bone of the Old Water']];
  var TREASURE = [['Corroded coin purse', 'Brass compass'], ['Old diving knife', 'Silver pocket watch'], ['Brass diving helmet', 'Silver ingot'], ['Gold idol', 'Jeweled dagger'], ['Crown of the deep', 'Glowing relic']];
  var VALUE = { fossil: [60, 160, 380, 800, 1800], treasure: [120, 300, 650, 1300, 2800] };
  function buildFinds(W, G, ctx, out, rand, pieces, bottomP, root) {
    root = root || W.root; pieces = pieces || G.pieces; bottomP = bottomP || G.bottom;
    var field = ctx.field, march = ctx.march, hard = G.layout.difficulty === 'hard' ? 1 : 0, n = 0, pre = ctx.findPrefix || '';
    var boneM = own(new T.MeshStandardMaterial({ color: 0xD9CFB8, roughness: 0.7 })), gold = own(new T.MeshStandardMaterial({ color: 0xd4a73a, roughness: 0.3, metalness: 1 })), woodM = own(new T.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 }));
    var glintM = own(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0xfff1c8, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    function place(P, kind, at) {
      var b = at || null;
      if (!b) { for (var t = 0; t < 8 && !b; t++) { var c = P.room ? [lerp(P.box.x0 + 2, P.box.x1 - 2, rand()), lerp(P.box.y0 + 2, P.box.y1 - 3, rand()), lerp(P.box.z0 + 2, P.box.z1 - 2, rand())] : P.node; if (field(c[0], c[1], c[2]) < -0.6) b = c; } }
      if (!b) return;
      var dn = march(b, [0, -1, 0], 14); if (dn > 13) return;
      var f = [b[0], b[1] - dn, b[2]];
      if (P.dry && f[1] < P.waterY) return;
      var tier = clamp(P.zone + 1 + hard, 1, 5), names = kind === 'fossil' ? FOSSIL : TREASURE;
      var name = names[tier - 1][Math.floor(rand() * 2)], id = pre + 'find' + n++;
      var g = new T.Group();
      if (kind === 'fossil') {
        var am = new T.Mesh(new T.TorusGeometry(0.1, 0.045, 8, 26), boneM); am.scale.set(1, 1, 0.55); g.add(am);
        var am2 = new T.Mesh(new T.TorusGeometry(0.045, 0.022, 6, 18), boneM); am2.position.set(0.03, 0.02, 0); am2.scale.set(1, 1, 0.6); g.add(am2);
        g.rotation.set(-1.2 + rand() * 0.4, rand() * 6, 0); g.position.set(f[0], f[1] + 0.04, f[2]);
      } else {
        var box = new T.Mesh(new T.BoxGeometry(0.42, 0.24, 0.3), woodM); box.position.y = 0.12; g.add(box);
        var lid = new T.Mesh(new T.BoxGeometry(0.42, 0.06, 0.3), woodM); lid.position.set(0, 0.27, -0.1); lid.rotation.x = -0.6; g.add(lid);
        [-0.15, 0.15].forEach(function (x) { var band = new T.Mesh(new T.BoxGeometry(0.03, 0.26, 0.32), gold); band.position.set(x, 0.13, 0); g.add(band); });
        for (var k = 0; k < 7; k++) { var coin = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.006, 10), gold); coin.position.set(0.25 + rand() * 0.2, 0.004, (rand() - 0.5) * 0.3); coin.rotation.set((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4); g.add(coin); }
        g.rotation.y = rand() * 6; g.position.set(f[0], f[1] - 0.03, f[2]);
      }
      var gl = new T.Sprite(glintM.clone()); own(gl.material); gl.scale.setScalar(0.35); gl.position.set(0, 0.25, 0); g.add(gl); W.anim.glints.push({ s: gl, ph: rand() * 9, id: id, seg: ctx.seg || 0 });
      root.add(g);
      W.findMesh[id] = g;
      out.finds.push({ id: id, kind: kind, name: name, tier: tier, value: VALUE[kind][tier - 1], pos: new T.Vector3(f[0], f[1] + 0.1, f[2]), taken: false, pieceId: P.id, zone: P.zone });
    }
    pieces.forEach(function (P) {
      if (P.start) return;
      if (P.treasure && P.node) place(P, 'treasure', P.node);
      else if (P.type === 'dead_end' && P.zone >= 2 && rand() < 0.4 && P.node) place(P, 'fossil', P.node);
      else if (P.room && !P.bottom && P.zone >= 1 && rand() < 0.5) place(P, 'fossil');
    });
    if (bottomP) place(bottomP, 'fossil');
  }

  /* ------------------------------------------------------------------ */
  /* Quakes: falling rocks and rubble                                    */
  /* ------------------------------------------------------------------ */
  function dropRock(W, p, r, rand, delay) {
    if (W.falling.length >= 30) return null;
    var S = getShapes(), m = new T.Mesh(rand() < 0.6 ? S.block : S.round, W.mats.boulder);
    m.scale.set(r * (0.9 + rand() * 0.3), r * (0.7 + rand() * 0.3), r * (0.9 + rand() * 0.3));
    m.position.set(p[0], p[1], p[2]); m.rotation.set(rand() * 6, rand() * 6, rand() * 6); m.castShadow = true;
    m.visible = delay <= 0;
    W.root.add(m);
    var rock = { mesh: m, r: r, vel: new T.Vector3((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3), delay: delay || 0, still: 0, settled: false, spin: new T.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3), col: { t: 0, c: [p[0], p[1], p[2]], r: r * 0.85 }, hitOnce: false };
    W.falling.push(rock);
    return rock;
  }
  function rubble(W, G, P, pts, rr) {
    var rub = W.rubble, m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(), p = new T.Vector3(), col = new T.Color();
    var rand = TU.rng(G.seed + P.id, 16).fn();
    pts.forEach(function (c) {
      for (var k = 0; k < 14 && rub.count < MAX_RUBBLE; k++) {
        var u = rand() * 2 - 1, th = rand() * 6.283, sq = Math.sqrt(1 - u * u), dir = [sq * Math.cos(th), u, sq * Math.sin(th)];
        var s = 0.35 + rand() * 0.8, d = rr * (0.85 + rand() * 0.2);
        p.set(c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d);
        if (GEO.field(G, p.x, p.y, p.z) > 0.6) continue;
        e.set(rand() * 6, rand() * 6, rand() * 6); q.setFromEuler(e); sc.set(s, s * 0.7, s * 0.9); m4.compose(p, q, sc);
        rub.setMatrixAt(rub.count, m4); var v = 0.6 + rand() * 0.3; rub.setColorAt(rub.count, col.setRGB(v, v * 0.96, v * 0.9)); rub.count++;
      }
    });
    rub.instanceMatrix.needsUpdate = true; if (rub.instanceColor) rub.instanceColor.needsUpdate = true;
    if (TU.fx && TU.fx.spawnSilt) { var c0 = pts[0]; TU.fx.spawnSilt(160, { pos: new T.Vector3(c0[0], c0[1], c0[2]), burst: true }); }
  }
  function resetDynamic(W) {
    W.falling.forEach(function (r) { W.root.remove(r.mesh); });
    W.falling.length = 0;
    if (W.rubble) W.rubble.count = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Animation                                                           */
  /* ------------------------------------------------------------------ */
  var gq = [0, 0, 0];
  function animate(W, G, dt) {
    var A = W.anim; if (!A) return;
    var t = W.t, P = TU.player.state, ppos = P.pos;
    for (var k = 0; k < A.rays.length; k++) { var r = A.rays[k]; r.material.opacity = 0.012 + 0.022 * (0.5 + 0.5 * Math.sin(t * 0.6 + r.userData.ph)); r.rotation.z = Math.sin(t * 0.2 + r.userData.ph) * 0.05; }
    if (A.dayLight) A.dayLight.intensity = 0.6 + Math.sin(t * 1.7) * 0.08 + Math.sin(t * 3.1) * 0.05;
    if (A.waterTex) A.waterTex.offset.set(Math.sin(t * 0.07) * 0.4, t * 0.025);
    // The Ancient Rings (one per segment end in endless mode). power 0..1: the ring "wakes up"
    // when you keep diving (brighter, faster, a bigger core). The shared light sits at the nearest ring.
    var ancs = A.ancients || (A.ancient ? [A.ancient] : []), best = null, bestD = 1e9;
    for (var ai = 0; ai < ancs.length; ai++) {
      var an = ancs[ai], dCore = ppos.distanceTo(an.pos), near = smooth(34, 4, dCore), pul = 0.5 + 0.5 * Math.sin(t * (0.9 + 2.2 * (an.power || 0)));
      var pw = an.power || 0;
      an.ring.emissiveIntensity = 0.22 + 0.22 * pul + near * 0.45 + pw * 1.2;
      an.dais.emissiveIntensity = 0.15 + 0.15 * (0.5 + 0.5 * Math.sin(t * 0.9 - 1.2)) + near * 0.3 + pw * 0.8;
      an.gyro.emissiveIntensity = 0.15 + 0.2 * pul + near * 0.25 + pw * 0.9;
      an.core.scale.setScalar(0.85 + 0.12 * pul + near * 0.15 + pw * 0.5);
      an.core.rotation.y = t * (0.2 + pw * 1.5); an.core.rotation.x = t * 0.13;
      an.halo.material.opacity = Math.min(1, 0.25 + 0.15 * pul + near * 0.2 + pw * 0.4);
      an.halo2.material.opacity = 0.1 + 0.08 * pul + near * 0.12 + pw * 0.2;
      an.lightI = 0.75 + 0.35 * pul + near * 0.9 + pw * 1.6;
      var gy = an.gyros || A.gyros, sp = 1 + pw * 5;
      if (gy && gy.length) { gy[0].rotation.x = t * 0.21 * sp; gy[0].rotation.y = t * 0.13 * sp; gy[1].rotation.y = -t * 0.3 * sp; gy[1].rotation.z = t * 0.17 * sp; }
      an.motes.rotation.y = t * (0.035 + pw * 0.3); an.motes.position.y = an.pos.y + Math.sin(t * 0.3) * 0.25;
      if (dCore < bestD) { bestD = dCore; best = an; }
    }
    if (best && best.light) {
      best.light.position.copy(best.lightPos || best.pos);
      best.light.intensity = best.lightI;
      if (best.light2) best.light2.intensity = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.5));
    }
    for (k = 0; k < A.glints.length; k++) {
      var gl = A.glints[k], ph = (t * 0.7 + gl.ph) % 5, dd = gl.s.parent ? ppos.distanceTo(gl.s.parent.position) : 99;
      gl.s.material.opacity = (ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) : 0) * smooth(14, 4, dd) * 0.9;
    }
    // falling rocks: sink (fast in air, slow in water), bounce, roll, settle
    for (k = 0; k < W.falling.length; k++) {
      var rk = W.falling[k];
      if (rk.settled) continue;
      if (rk.delay > 0) { rk.delay -= dt; if (rk.delay <= 0) rk.mesh.visible = true; continue; }
      var m = rk.mesh, pos = m.position;
      var inAir = TU.cave.isDry(pos);
      rk.vel.y -= (inAir ? 9.8 : 2.4) * dt;
      rk.vel.multiplyScalar(1 / (1 + (inAir ? 0.05 : 1.6) * dt));
      pos.addScaledVector(rk.vel, dt);
      var f = GEO.field(G, pos.x, pos.y, pos.z, gq), pen = f + rk.r * 0.8;
      if (pen > 0) {
        var gl2 = Math.sqrt(gq[0] * gq[0] + gq[1] * gq[1] + gq[2] * gq[2]) || 1, nx = -gq[0] / gl2, ny = -gq[1] / gl2, nz = -gq[2] / gl2;
        pos.x += nx * pen; pos.y += ny * pen; pos.z += nz * pen;
        var vn = rk.vel.x * nx + rk.vel.y * ny + rk.vel.z * nz;
        if (vn < 0) {
          rk.vel.x -= nx * vn * 1.3; rk.vel.y -= ny * vn * 1.3; rk.vel.z -= nz * vn * 1.3; rk.vel.multiplyScalar(0.8);
          if (!rk.hitOnce && -vn > 0.6) { rk.hitOnce = true; if (TU.fx && TU.fx.spawnSilt) TU.fx.spawnSilt(40, { pos: pos.clone(), burst: true }); }
        }
      }
      m.rotation.x += rk.spin.x * dt * Math.min(1, rk.vel.length()); m.rotation.z += rk.spin.z * dt * Math.min(1, rk.vel.length());
      rk.col.c[0] = pos.x; rk.col.c[1] = pos.y; rk.col.c[2] = pos.z;
      // a moving rock that reaches the diver hits them once (player.js turns it into an injury, or a crush)
      var rsp = rk.vel.length();
      if (!rk.hurt && rsp > 0.8 && TU.state.simulating()) {
        var hx = pos.x - ppos.x, hy = pos.y - ppos.y, hz = pos.z - ppos.z, reach = rk.r + 0.35;
        if (hx * hx + hy * hy + hz * hz < reach * reach) { rk.hurt = true; TU.emit('cave:rockHit', { r: rk.r, speed: rsp, pos: pos.clone() }); }
      }
      if (rsp < 0.12) rk.still += dt; else rk.still = 0;
      if (rk.still > 0.7) rk.settled = true;
    }
  }

  function frame(W) {
    if (!W.instRegions || W.noCull) return;
    var cam = TU.camera.position;
    var cull = (TU.fx.gfx && TU.fx.gfx.cullDist) || TU.cfg.cave.cullDist || 60;
    for (var i = 0; i < W.instRegions.length; i++) { var m = W.instRegions[i], bs = m.geometry.boundingSphere; m.visible = cam.distanceTo(bs.center) - bs.radius < cull; }
  }
  TU.caveDress = { build: build, start: start, waterPlane: waterPlane, frame: frame, animate: animate, dropRock: dropRock, rubble: rubble, resetDynamic: resetDynamic, shapes: getShapes };
})();
