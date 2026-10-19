/*
 * creatures-lib.js: the toolbox creatures-models.js uses to build animals out of code.
 *
 * Nothing here is a creature yet. It has:
 *   - a geometry "kit" (Kit) that merges many small pieces (body, fins, legs, eyes) into one mesh,
 *     and stores per-vertex animation weights so the GPU can bend the animal while it swims;
 *   - shape builders: spine bodies (a tube that tapers like a fish), fins (fans with rays),
 *     tubes along a path (legs, antennae, barbels, tentacles), lathes and blobs;
 *   - ONE shared animated material recipe (MeshStandardMaterial plus onBeforeCompile) that
 *     moves vertices in the vertex shader: traveling body waves, fin flutter, leg cycles,
 *     jaw hinges and jellyfish bell pulses. It also adds a fresnel rim, a fake "light through
 *     the skin" glow when the flashlight hits it, and emissive bioluminescent spots.
 *
 * Local model space for every creature: forward is +Z, up is +Y, body length 1 from z = -0.5
 * (tail) to z = +0.5 (nose). Plants and patches grow along +Y from y = 0.
 *
 * Per-vertex animation attributes (all vec4):
 *   aA = (wave weight, flutter weight, leg or jaw or bell weight, phase offset)
 *        flutter weight < 0 means "driven by the action value" (claws opening) instead of time.
 *   aB = (flutter direction x, y, z, glow mask 0..1)
 * Per-instance attribute (vec4):
 *   aInst = (animation phase in radians, amplitude multiplier, glow multiplier, action 0..1)
 *
 * Owner: agent B.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE;
  var L = (TU._cr = TU._cr || {});

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function lin(hex) { return new T.Color(hex).convertSRGBToLinear(); }
  function mixC(a, b, t) { return a.clone().lerp(b, t < 0 ? 0 : t > 1 ? 1 : t); }
  function sstep(a, b, v) { var t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  // Small deterministic hash noise for skin mottling (no allocation).
  function hash3(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y, z) { return TU.noise ? TU.noise.n3(x, y, z) : (hash3(x, y, z) * 2 - 1); }
  L.lin = lin; L.mixC = mixC; L.sstep = sstep; L.hash3 = hash3; L.vnoise = vnoise;

  /* ------------------------------------------------------------------ */
  /* Kit: collects pieces into one BufferGeometry                        */
  /* ------------------------------------------------------------------ */
  function Kit() { this.p = []; this.n = []; this.c = []; this.a = []; this.b = []; this.i = []; }
  var _v = new T.Vector3(), _n = new T.Vector3(), _nm = new T.Matrix3(), _I = new T.Matrix4();
  // Add a three.js geometry. o: { m: Matrix4, col: Color | fn(p, n, uv, lp), a: [4] | fn(p, uv, lp), b: [4] | fn(p, uv, lp) }
  // p is the transformed position, lp the position before the matrix, uv = [u, v] (or [0,0]).
  Kit.prototype.add = function (g, o) {
    o = o || {};
    if (!g.attributes.normal) g.computeVertexNormals();
    var m = o.m || _I; _nm.getNormalMatrix(m);
    var pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    var base = this.p.length / 3, n = pos.count, uvA = [0, 0];
    var lp = new T.Vector3();
    for (var k = 0; k < n; k++) {
      lp.fromBufferAttribute(pos, k); _v.copy(lp).applyMatrix4(m);
      _n.fromBufferAttribute(nor, k).applyMatrix3(_nm).normalize();
      if (uv) { uvA[0] = uv.getX(k); uvA[1] = uv.getY(k); } else { uvA[0] = 0; uvA[1] = 0; }
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
      var c = typeof o.col === 'function' ? o.col(_v, _n, uvA, lp) : (o.col || WHITE);
      this.c.push(c.r, c.g, c.b);
      var a = typeof o.a === 'function' ? o.a(_v, uvA, lp) : (o.a || A0);
      var b = typeof o.b === 'function' ? o.b(_v, uvA, lp) : (o.b || B0);
      this.a.push(a[0], a[1], a[2], a[3]); this.b.push(b[0], b[1], b[2], b[3]);
    }
    if (g.index) { var ix = g.index.array; for (k = 0; k < ix.length; k++) this.i.push(ix[k] + base); }
    else for (k = 0; k < n; k++) this.i.push(base + k);
    g.dispose();
    return this;
  };
  Kit.prototype.empty = function () { return this.p.length === 0; };
  Kit.prototype.geometry = function () {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aA', new T.Float32BufferAttribute(this.a, 4));
    g.setAttribute('aB', new T.Float32BufferAttribute(this.b, 4));
    g.setIndex(this.p.length / 3 > 65535 ? new T.Uint32BufferAttribute(this.i, 1) : new T.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  };
  var WHITE = new T.Color(1, 1, 1), A0 = [1, 0, 0, 0], B0 = [0, 0, 0, 0];
  L.Kit = Kit; L.A0 = A0; L.B0 = B0;

  /* ------------------------------------------------------------------ */
  /* Shape builders (each returns a fresh BufferGeometry)                */
  /* ------------------------------------------------------------------ */
  // A body built from rings along Z. o: { rings, segs, z0, z1, r(u), w(u), h(u), y(u), x(u), sq (superellipse power, 2 = ellipse), flatBelly }
  // u = 0 at z0 (tail) to 1 at z1 (nose). uv = [around 0..1 (0 = right side, 0.25 = top), u].
  function spine(o) {
    var R = o.rings || 28, S = o.segs || 18, z0 = o.z0 == null ? -0.5 : o.z0, z1 = o.z1 == null ? 0.5 : o.z1, sq = o.sq || 2;
    var pos = [], uvs = [], idx = [];
    for (var i = 0; i <= R; i++) {
      var u = i / R, z = z0 + (z1 - z0) * u, r = Math.max(o.r(u), 0.0004);
      var w = o.w ? o.w(u) : 1, h = o.h ? o.h(u) : 1, yo = o.y ? o.y(u) : 0, xo = o.x ? o.x(u) : 0;
      // flatBelly / flatTop squash the lower / upper half (a number or a function of u). Used for skulls and jaws.
      var fb = typeof o.flatBelly === 'function' ? o.flatBelly(u) : o.flatBelly, ft = typeof o.flatTop === 'function' ? o.flatTop(u) : o.flatTop;
      for (var j = 0; j <= S; j++) {
        var th = j / S * Math.PI * 2, cx = Math.cos(th), sy = Math.sin(th);
        var ex = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / sq), ey = Math.sign(sy) * Math.pow(Math.abs(sy), 2 / sq);
        var yy = ey * r * h; if (fb && yy < 0) yy *= fb; if (ft && yy > 0) yy *= ft;
        pos.push(xo + ex * r * w, yo + yy, z); uvs.push(j / S, u);
      }
    }
    for (i = 0; i < R; i++) for (j = 0; j < S; j++) {
      var a = i * (S + 1) + j, b = a + S + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  L.spine = spine;

  // A tube swept along points (array of Vector3) with radius r(t). radial = sides. Ends are capped by tapering.
  // uv = [around, t along].
  function sweep(pts, r, radial, closeEnds) {
    radial = radial || 6;
    var n = pts.length, pos = [], uvs = [], idx = [];
    var tan = new T.Vector3(), nrm = new T.Vector3(), bin = new T.Vector3(), prevN = null, tmp = new T.Vector3();
    for (var i = 0; i < n; i++) {
      if (i === 0) tan.subVectors(pts[1], pts[0]); else if (i === n - 1) tan.subVectors(pts[n - 1], pts[n - 2]); else tan.subVectors(pts[i + 1], pts[i - 1]);
      tan.normalize();
      if (!prevN) { tmp.set(0, 1, 0); if (Math.abs(tan.y) > 0.9) tmp.set(1, 0, 0); nrm.crossVectors(tan, tmp).normalize(); prevN = nrm.clone(); }
      else { bin.crossVectors(tan, prevN); nrm.crossVectors(bin, tan).normalize(); prevN.copy(nrm); }
      bin.crossVectors(tan, nrm).normalize();
      var t = i / (n - 1), rr = typeof r === 'function' ? r(t) : r;
      if (closeEnds && (i === 0 || i === n - 1)) rr *= 0.05;
      for (var j = 0; j <= radial; j++) {
        var th = j / radial * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        pos.push(pts[i].x + (nrm.x * c + bin.x * s) * rr, pts[i].y + (nrm.y * c + bin.y * s) * rr, pts[i].z + (nrm.z * c + bin.z * s) * rr);
        uvs.push(j / radial, t);
      }
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < radial; j++) {
      var a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  L.sweep = sweep;
  // Points along a quadratic or cubic curve: curve(a, b, c[, d], n)
  function curvePts(ctrl, n) {
    var c = ctrl.length === 3 ? new T.QuadraticBezierCurve3(ctrl[0], ctrl[1], ctrl[2]) : ctrl.length === 4 ? new T.CubicBezierCurve3(ctrl[0], ctrl[1], ctrl[2], ctrl[3]) : new T.CatmullRomCurve3(ctrl);
    return c.getPoints(n || 10);
  }
  L.curvePts = curvePts;
  L.v = function (x, y, z) { return new T.Vector3(x, y, z); };

  // A fin: a fan of rays from a base line to an outline, in a 2D (a, b) plane.
  // base0/base1: [a, b] ends of the attach line. outline: [[a, b], ...] from the base0 side to the base1 side.
  // map(a, b) -> Vector3 places the 2D point in model space. radial = subdivisions from base to edge.
  // uv = [ray index 0..1, fraction from base 0..1] so colors can draw rays and the edge.
  function fin(base0, base1, outline, map, radial) {
    radial = radial || 4;
    var K = outline.length, pos = [], uvs = [], idx = [];
    for (var k = 0; k < K; k++) {
      var f = K > 1 ? k / (K - 1) : 0, ba = base0[0] + (base1[0] - base0[0]) * f, bb = base0[1] + (base1[1] - base0[1]) * f;
      for (var r = 0; r <= radial; r++) {
        var q = r / radial, a = ba + (outline[k][0] - ba) * q, b = bb + (outline[k][1] - bb) * q, p = map(a, b);
        pos.push(p.x, p.y, p.z); uvs.push(f, q);
      }
    }
    for (k = 0; k < K - 1; k++) for (r = 0; r < radial; r++) {
      var i0 = k * (radial + 1) + r, i1 = i0 + radial + 1;
      idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  L.fin = fin;
  // Outline helper: points around an arc-ish shape from a function f(t) -> [a, b], t = 0..1.
  L.outline = function (n, f) { var o = []; for (var i = 0; i < n; i++) o.push(f(i / (n - 1))); return o; };

  // Ellipsoid blob. center Vector3, radii [x, y, z], detail = segments.
  L.blob = function (seg, ring) { return new T.SphereGeometry(1, seg || 12, ring || 8); };
  L.mat = function (pos, rx, ry, rz, rotX, rotY, rotZ) {
    var m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(rotX || 0, rotY || 0, rotZ || 0, 'XYZ'));
    return m.compose(pos, q, new T.Vector3(rx, ry == null ? rx : ry, rz == null ? rx : rz));
  };
  // A matrix that points local +Y along dir (for cones and cylinders) at pos.
  L.matAlong = function (pos, dir, sx, sy, sz) {
    var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
    return new T.Matrix4().compose(pos, q, new T.Vector3(sx, sy, sz == null ? sx : sz));
  };

  /* ------------------------------------------------------------------ */
  /* The shared animated material                                        */
  /* ------------------------------------------------------------------ */
  // Uniforms shared by every creature material (one update per frame moves them all).
  var SH = L.shared = {
    uLampV: { value: new T.Vector3() },       // flashlight position in view space
    uLampDirV: { value: new T.Vector3(0, 0, -1) }, // flashlight direction in view space
    uLampCos: { value: new T.Vector2(Math.cos(0.42), Math.cos(0.2)) }, // cone outer, inner cos
    uLampRange: { value: 14 },                 // m
    uLampOn: { value: 1 },                     // 0..1
    uRimBase: { value: 0 }                     // always-on rim light (0 in the game, more in the showcase)
  };
  var MODES = { fish: 0, crawl: 1, jelly: 2, still: 3 };
  L.MODES = MODES;

  var VERT_HEAD = [
    'attribute vec4 aA; attribute vec4 aB; attribute vec4 aInst;',
    'uniform float uMode; uniform vec4 uWave; uniform float uHead; uniform vec4 uFlut; uniform vec4 uHinge;',
    'varying float vCrGlow; varying float vCrInst;',
    // Rotate p and n around the X axis through the hinge (jaws, claws).
    'void crHinge(inout vec3 p, inout vec3 n, float ang){ vec3 q = p - uHinge.xyz; float c = cos(ang), s = sin(ang);',
    '  p = uHinge.xyz + vec3(q.x, c*q.y - s*q.z, s*q.y + c*q.z); n = vec3(n.x, c*n.y - s*n.z, s*n.y + c*n.z); }',
    'void crAnim(inout vec3 p, inout vec3 n){',
    '  float ph = aInst.x; float am = aInst.y; float act = aInst.w;',
    '  if (uMode > 1.5 && uMode < 2.5) {',
    // jellyfish: bell squeezes in a pulse, tentacles trail in slow waves
    '    float pulse = pow(0.5 + 0.5 * sin(ph), 2.0);',
    '    p.xz *= 1.0 - aA.z * 0.24 * pulse; p.y += aA.z * 0.07 * pulse;',
    '    float tw = aA.y;',
    '    p.x += tw * 0.07 * sin(position.y * 6.0 + ph * 0.9 + aA.w);',
    '    p.z += tw * 0.07 * cos(position.y * 5.0 + ph * 0.7 + aA.w * 1.7);',
    '    p.xz *= 1.0 - tw * 0.12 * pulse;',
    '    return;',
    '  }',
    // flutter: fins, antennae, gills, barbels, threads. Negative weight follows the action value.
    '  if (aA.y > 0.0) p += aB.xyz * aA.y * uFlut.y * sin(ph * uFlut.x + aA.w + position.z * 5.0);',
    '  else if (aA.y < 0.0) p += aB.xyz * (-aA.y) * act;',
    '  if (uMode < 0.5) {',
    // fish: hinged jaw opens with the action value (a negative weight swings the other way: squid arms spreading down)
    '    if (aA.z != 0.0) crHinge(p, n, aA.z * act * uHinge.w);',
    '  } else if (uMode < 1.5) {',
    // crawlers: legs swing forward and back and lift on the return stroke (metachronal wave by phase offset).
    // A negative weight is a jaw instead of a leg (the Cave Lurker opens its mouth while it walks).
    '    if (aA.z > 0.0) { float lp = ph * uFlut.z + aA.w; p.z += aA.z * sin(lp) * uFlut.w; p.y += aA.z * max(0.0, cos(lp)) * uFlut.w * 0.6; }',
    '    else if (aA.z < 0.0) crHinge(p, n, -aA.z * act * uHinge.w);',
    '  }',
    '  if (uMode < 1.5) {',
    // traveling body wave: amplitude grows toward the tail (carangiform) or is even (anguilliform)
    '    float z = position.z;',
    '    float e = mix(uWave.w, 1.0, pow(clamp((uHead - z) / (uHead + 0.5), 0.0, 1.0), uWave.z));',
    '    float k = uWave.y * 6.2831853;',
    '    float A = aA.x * uWave.x * am * e;',
    '    p.x += A * sin(k * z + ph);',
    '    float slope = A * k * cos(k * z + ph);',
    '    n = normalize(vec3(n.x - slope * n.z, n.y, n.z + slope * n.x));',
    '  }',
    '}'
  ].join('\n');

  var FRAG_HEAD = [
    'uniform vec3 uGlowCol; uniform vec3 uSSS; uniform vec3 uLampV; uniform vec3 uLampDirV; uniform vec2 uLampCos;',
    'uniform float uLampRange; uniform float uLampOn; uniform float uRimBase;',
    'varying float vCrGlow; varying float vCrInst;'
  ].join('\n');

  var FRAG_EMIT = [
    '#include <emissivemap_fragment>',
    '{',
    '  vec3 crV = normalize(vViewPosition);',
    '  float crRim = pow(1.0 - clamp(abs(dot(normal, crV)), 0.0, 1.0), 3.0);',
    '  vec3 crL = uLampV + vViewPosition; float crDl = length(crL); vec3 crLd = crL / max(crDl, 1e-3);',
    '  float crCone = smoothstep(uLampCos.x, uLampCos.y, dot(-crLd, uLampDirV));',
    '  float crFall = pow(clamp(1.0 - crDl / uLampRange, 0.0, 1.0), 1.5);',
    '  float crNear = clamp(1.0 - crDl / 1.6, 0.0, 1.0);',
    '  float crLit = uLampOn * (crCone * crFall + crNear * 0.3);',
    // light passing through thin skin (wrap and back light), plus a rim. Only where the lamp reaches.
    '  float crBack = clamp(dot(normal, crLd) * 0.5 + 0.5, 0.0, 1.0);',
    '  totalEmissiveRadiance += uSSS * diffuseColor.rgb * crLit * (0.45 * crBack + 0.9 * crRim);',
    '  totalEmissiveRadiance += uRimBase * crRim * diffuseColor.rgb;',
    // bioluminescent spots and lines
    '  totalEmissiveRadiance += uGlowCol * vCrGlow * vCrInst;',
    '}'
  ].join('\n');

  // The one onBeforeCompile used by every creature material (same function = shared GPU program).
  function crCompile(shader) {
    var u = this.userData.crU;
    for (var k in u) shader.uniforms[k] = u[k];
    for (k in SH) shader.uniforms[k] = SH[k];
    shader.vertexShader = VERT_HEAD + '\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal ); vec3 crP = vec3( position ); crAnim( crP, objectNormal ); vCrGlow = aB.w; vCrInst = aInst.z;')
      .replace('#include <begin_vertex>', 'vec3 transformed = crP;');
    shader.fragmentShader = FRAG_HEAD + '\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', FRAG_EMIT);
  }

  // Make a creature material. kind: 'body' (opaque) or 'fin' (translucent, double sided).
  // o: { mode, wave: [amp, wavesPerLength, envPow, envMin], head, flut: [freq, amp, legFreq, legAmp],
  //      hinge: [x, y, z, maxAngle], glow: hex, sss: hex, sssK, rough, opacity, emissive: hex, metal }
  L.makeMaterial = function (kind, o) {
    o = o || {};
    var fin = kind === 'fin', see = fin && !(o.opacity >= 1); // fins with opacity 1 are solid but still two sided (shark fins)
    var m = new T.MeshStandardMaterial({
      vertexColors: true, roughness: o.rough == null ? (fin ? 0.4 : 0.5) : o.rough, metalness: o.metal || 0,
      transparent: see, opacity: see ? (o.opacity == null ? 0.55 : o.opacity) : 1, side: fin ? T.DoubleSide : T.FrontSide,
      depthWrite: !see, emissive: new T.Color(o.emissive || 0x000000)
    });
    var w = o.wave || [0, 1, 2, 0], f = o.flut || [0, 0, 0, 0], h = o.hinge || [0, 0, 0, 0];
    var sss = lin(o.sss == null ? 0xffffff : o.sss).multiplyScalar(o.sssK == null ? 0.35 : o.sssK);
    m.userData.crU = {
      uMode: { value: MODES[o.mode || 'fish'] },
      uWave: { value: new T.Vector4(w[0], w[1], w[2], w[3]) },
      uHead: { value: o.head == null ? 0.3 : o.head },
      uFlut: { value: new T.Vector4(f[0], f[1], f[2], f[3]) },
      uHinge: { value: new T.Vector4(h[0], h[1], h[2], h[3]) },
      uGlowCol: { value: lin(o.glow || 0x000000).multiplyScalar(o.glowK == null ? 1 : o.glowK) },
      uSSS: { value: sss }
    };
    m.onBeforeCompile = crCompile;
    return m;
  };

  // Update the shared lamp uniforms from TU.player.lamp (call once per frame before rendering).
  var _lp = new T.Vector3(), _ld = new T.Vector3();
  L.updateShared = function (cam, lamp, rimBase) {
    if (!cam) return;
    cam.updateMatrixWorld();
    var vm = cam.matrixWorldInverse;
    if (lamp && lamp.pos) {
      _lp.copy(lamp.pos).applyMatrix4(vm); SH.uLampV.value.copy(_lp);
      _ld.copy(lamp.dir).transformDirection(vm); SH.uLampDirV.value.copy(_ld);
      SH.uLampCos.value.set(lamp.cosOuter || Math.cos(0.42), lamp.cosInner || Math.cos(0.2));
      SH.uLampRange.value = lamp.range || 14; SH.uLampOn.value = lamp.on == null ? 1 : lamp.on;
    }
    SH.uRimBase.value = rimBase || 0;
  };
})();
