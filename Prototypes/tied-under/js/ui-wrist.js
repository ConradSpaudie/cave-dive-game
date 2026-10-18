/*
 * ui-wrist.js: the wrist dive computer and its holographic 3D cave map (HUD, Watch and Waypoints.md).
 *
 *   Tab           hold to raise the wrist (let go to lower it), or tap to keep it up (tap again to lower).
 *                 Calls TU.player.setWristRaised(bool) when agent C provides it.
 *   Watch face    depth, dive time, max depth, ascent rate (with a SLOW warning), compass, water
 *                 temperature and tank pressure.
 *   Hologram      a second small three.js renderer that draws the cave as translucent cyan lines from
 *                 TU.cave.mapData() (agent A). Only the parts you have been near are revealed. Also the
 *                 rope (warm line), you (pulsing dot), named waypoints with labels and depth rings.
 *                 Drag (mouse held) or arrow keys to spin it, scroll to zoom.
 *                 Fallback when mapData() is missing: the main path sampled from TU.cave.spot(meters).
 *   Waypoints     list beside the map. [ and ] pick one, N renames it (only where you placed it).
 *
 * Owner: agent D. Part of the ui system (see ui.js, K.part).
 */
(function () {
  'use strict';
  var TU = window.TU, K = TU.uiKit, U = TU.util, clamp = U.clamp, fmtTime = U.fmtTime, $ = TU.$;
  if (!K) return;
  var REVEAL_M = 12;       // m, map within this distance of anywhere you have been gets revealed // TODO cfg
  var VISIT_STEP_M = 2.5;  // m, how far you move before a new "visited" sample is stored // TODO cfg

  TU.css('ui-wrist', [
    '#ui-wrist{position:fixed;inset:0;z-index:4;pointer-events:none;display:none}',
    '#ui-wrist.ui-on{display:block}',
    '#ui-holo-wrap{position:absolute;left:50%;bottom:calc(var(--gb) + 196px);transform:translateX(-50%);width:min(680px, calc(100% - 24px));height:min(44vh, 380px);pointer-events:auto}',
    '#ui-holo{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '#ui-holo-wrap::before{content:"";position:absolute;inset:-4% -2%;background:radial-gradient(ellipse at 50% 60%, rgba(1,16,18,.82) 0%, rgba(1,16,18,.6) 45%, rgba(1,16,18,0) 72%), radial-gradient(ellipse at 50% 70%, rgba(79,242,208,.14), transparent 65%);pointer-events:none;border-radius:50%}',
    '#ui-holo-wrap::after{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(180deg, rgba(79,242,208,.05) 0 1px, transparent 1px 4px);mix-blend-mode:screen;animation:ui-holo-flick 3.3s steps(1) infinite}',
    '@keyframes ui-holo-flick{0%,100%{opacity:.9}47%{opacity:.6}48%{opacity:1}}',
    '.ui-reduce-motion #ui-holo-wrap::after{animation:none}',
    '#ui-holo-labels{position:absolute;inset:0;pointer-events:none;font-family:var(--mono);overflow:hidden}',
    '#ui-holo-labels span{position:absolute;transform:translate(-50%,-140%);font-size:11px;letter-spacing:.08em;color:#d9fff7;text-shadow:0 0 6px rgba(79,242,208,.9);white-space:nowrap}',
    '#ui-holo-labels span.ui-ring{color:rgba(79,242,208,.6);font-size:10px;transform:translate(4px,-50%)}',
    '#ui-holo-labels span.ui-you{color:#fff;font-size:10px}',
    '#ui-holo-labels span.ui-wsel{color:#FFC98A;text-shadow:0 0 6px rgba(255,201,138,.9)}',
    '#ui-holo-info{position:absolute;left:8px;top:6px;max-width:calc(58% - 16px);font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;color:var(--hud-dim);line-height:1.6;text-shadow:0 0 6px rgba(79,242,208,.4)}',
    '#ui-holo-info b{color:var(--hud);font-weight:400}',
    '#ui-wplist{position:absolute;right:6px;top:6px;width:min(190px,40%);max-height:calc(100% - 12px);overflow:auto;font-family:var(--mono);font-size:11px;color:var(--hud);background:rgba(2,16,16,.45);border:1px solid rgba(79,242,208,.2);padding:6px}',
    '#ui-wplist h5{margin:0 0 4px;font-weight:400;font-size:10px;letter-spacing:.2em;color:var(--hud-dim)}',
    '#ui-wplist button{display:flex;width:100%;gap:6px;justify-content:space-between;background:none;border:0;border-left:2px solid transparent;color:var(--hud);font:inherit;text-align:left;padding:3px 4px;cursor:pointer}',
    '#ui-wplist button.ui-sel{border-left-color:#FFC98A;color:#FFC98A;background:rgba(255,201,138,.06)}',
    '#ui-wplist button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#ui-wplist p{margin:4px 0 0;font-size:10px;color:var(--hud-dim);line-height:1.4}',
    /* projection beam from the watch to the map */
    '#ui-beam{position:absolute;left:50%;bottom:calc(var(--gb) + 150px);width:min(640px, calc(100% - 40px));height:60px;transform:translateX(-50%);background:linear-gradient(0deg, rgba(79,242,208,.22), rgba(79,242,208,0));clip-path:polygon(44% 100%, 56% 100%, 100% 0, 0 0)}',
    /* the watch */
    '#ui-watch{position:absolute;left:50%;bottom:calc(var(--gb) - 6px);transform:translateX(-50%);width:250px;pointer-events:auto}',
    '.ui-wf-strap{height:22px;margin:0 38px;background:repeating-linear-gradient(180deg,#121516 0 5px,#1b1f20 5px 7px);border-radius:4px 4px 0 0}',
    '.ui-wf-case{position:relative;background:linear-gradient(145deg,#3a4144,#14181a 55%,#262c2f);border-radius:22px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.15)}',
    '.ui-wf-case::before,.ui-wf-case::after{content:"";position:absolute;top:34%;width:7px;height:26px;border-radius:2px;background:linear-gradient(90deg,#555c5f,#2a2f31)}',
    '.ui-wf-case::before{left:-6px} .ui-wf-case::after{right:-6px}',
    '.ui-wf-scr{background:radial-gradient(ellipse at 40% 30%, #0d2423, #031010 75%);border-radius:12px;padding:9px 11px;font-family:var(--mono);color:#bdfff1;box-shadow:inset 0 0 18px rgba(0,0,0,.9), inset 0 0 0 1px rgba(79,242,208,.15);display:grid;grid-template-columns:1fr auto;gap:2px 10px;text-shadow:0 0 6px rgba(79,242,208,.55)}',
    '.ui-wf-scr small{font-size:9px;letter-spacing:.2em;color:#5fbfae;display:block}',
    '.ui-wf-big{font-size:34px;line-height:1;font-variant-numeric:tabular-nums}',
    '.ui-wf-big i{font-style:normal;font-size:12px;color:#5fbfae;margin-left:2px}',
    '.ui-wf-r{text-align:right;font-size:15px;font-variant-numeric:tabular-nums}',
    '.ui-wf-row{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;font-size:12px;border-top:1px solid rgba(79,242,208,.15);padding-top:4px;margin-top:2px;font-variant-numeric:tabular-nums}',
    '.ui-wf-cmp{width:40px;height:40px}',
    '.ui-wf-asc{display:flex;align-items:center;gap:5px}',
    '.ui-wf-asc s{display:block;width:6px;height:28px;background:rgba(79,242,208,.15);position:relative;text-decoration:none}',
    '.ui-wf-asc s u{position:absolute;left:0;right:0;bottom:0;background:#4FF2D0}',
    '.ui-wf-slow{color:var(--bad)!important;animation:ui-blink .8s steps(2,start) infinite}',
    '.ui-wf-brand{text-align:center;font-family:var(--mono);font-size:8px;letter-spacing:.32em;color:#8a9396;margin-top:6px}',
    '@media (max-width: 560px){ #ui-holo-wrap{bottom:calc(var(--gb) + 186px);height:min(40vh,330px)} #ui-watch{width:220px} .ui-wf-big{font-size:28px} #ui-wplist{width:44%;font-size:10px} }'
  ].join('\n'));

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var W = {
    raised: false, sticky: false, tabAt: 0,
    renderer: null, scene: null, camera: null, failed: false,
    mapObj: null, mapSegs: [], exploredAttr: null, segExplored: null, mapCenter: null, mapRadius: 40, mapBuilt: false,
    ropeLine: null, you: null, wpSprites: [], ringObjs: [], rings: [],
    yaw: 0, pitch: 0.75, dist: 60, target: null, drag: false, keys: {}, sel: 0,
    visited: [], visitT: 0, lastDepth: 0, ascent: 0, ropeT: 0, labelT: 0
  };

  /* ------------------------------------------------------------------ */
  /* Map data: TU.cave.mapData() in any of a few shapes, or a fallback   */
  /* ------------------------------------------------------------------ */
  function P3(p) { if (!p) return null; if (Array.isArray(p)) return { x: +p[0], y: +p[1], z: +p[2] }; if (p.pos) return P3(p.pos); return { x: +p.x, y: +p.y, z: +p.z }; }
  function ok(p) { return p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z); }
  function normalize(m) {
    var out = [];
    if (!m) return out;
    if (Array.isArray(m)) m = { segments: m };
    (m.segments || m.segs || []).forEach(function (s) {
      if (Array.isArray(s) && s.length >= 6) out.push({ a: { x: s[0], y: s[1], z: s[2] }, b: { x: s[3], y: s[4], z: s[5] }, r: s[6] || 2 });
      else if (s && s.a && s.b) out.push({ a: P3(s.a), b: P3(s.b), r: s.r || s.radius || 2, explored: !!s.explored });
    });
    (m.paths || m.polylines || m.lines || []).forEach(function (pl) {
      var pts = pl.points || pl.pts || pl, radii = pl.radii || null;
      if (!Array.isArray(pts)) return;
      for (var i = 1; i < pts.length; i++) out.push({ a: P3(pts[i - 1]), b: P3(pts[i]), r: (radii && radii[i]) || pl.radius || pl.r || 2, explored: !!pl.explored });
    });
    if (m.nodes && m.edges) m.edges.forEach(function (e) {
      var a = m.nodes[e[0] != null ? e[0] : e.a], b = m.nodes[e[1] != null ? e[1] : e.b];
      if (a && b) out.push({ a: P3(a), b: P3(b), r: (e[2] || e.r || a.r || a.radius || 2) });
    });
    return out.filter(function (s) { return ok(s.a) && ok(s.b); });
  }
  // Fallback: walk the main path with TU.cave.spot(meters) and use the passage radius at each point.
  function sampleSpots() {
    var out = [], last = null, same = 0;
    if (typeof TU.cave.spot !== 'function') return out;
    for (var s = 0; s <= 4000; s += 3) {
      var sp = null; try { sp = TU.cave.spot(s); } catch (e) { sp = null; }
      if (!sp || !sp.pos) break;
      var p = { x: sp.pos.x, y: sp.pos.y, z: sp.pos.z };
      if (last && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < 0.05) { if (++same > 3) break; continue; }
      same = 0;
      var r = 2; try { var np = TU.cave.nearestPoint(sp.pos); if (np && np.radius) r = np.radius; } catch (e2) { /* ignore */ }
      if (last) out.push({ a: last, b: p, r: r });
      last = p;
    }
    // the side branch, if the cave names one
    try {
      var b0 = TU.cave.spot('branch'), b1 = TU.cave.spot('branchEnd');
      if (b0 && b1) out.push({ a: { x: b0.pos.x, y: b0.pos.y, z: b0.pos.z }, b: { x: b1.pos.x, y: b1.pos.y, z: b1.pos.z }, r: 2 });
    } catch (e3) { /* ignore */ }
    return out;
  }
  function readMap() {
    var segs = [];
    if (typeof TU.cave.mapData === 'function') { try { segs = normalize(TU.cave.mapData()); } catch (e) { console.error('[TU] cave.mapData failed', e); segs = []; } }
    if (!segs.length) segs = sampleSpots();
    return segs;
  }

  /* ------------------------------------------------------------------ */
  /* Hologram scene                                                      */
  /* ------------------------------------------------------------------ */
  var VS = 'attribute float aE; attribute float aK; varying float vA; void main(){ vA = aE * aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  var FS = 'uniform vec3 uCol; uniform float uOp; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uCol * vA * uOp, 1.0); }';
  function ensureRenderer() {
    if (W.renderer || W.failed || !window.THREE) return !!W.renderer;
    var T = THREE;
    try { W.renderer = new T.WebGLRenderer({ canvas: $('ui-holo'), alpha: true, antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { W.failed = true; $('ui-holo-info').textContent = 'HOLOGRAM OFFLINE'; return false; }
    W.renderer.setClearColor(0x000000, 0);
    W.scene = new T.Scene();
    W.camera = new T.PerspectiveCamera(40, 1, 0.5, 2000);
    W.target = new T.Vector3();
    var youMat = new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false });
    W.you = new T.Sprite(youMat); W.you.scale.setScalar(4); W.scene.add(W.you);
    var ropeGeo = new T.BufferGeometry(); ropeGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(3 * 2600), 3)); ropeGeo.setDrawRange(0, 0);
    W.ropeLine = new T.Line(ropeGeo, new T.LineBasicMaterial({ color: 0xFFC98A, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }));
    W.ropeLine.frustumCulled = false; W.scene.add(W.ropeLine);
    return true;
  }
  function disposeObj(o) { if (!o) return; W.scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }
  function buildMap() {
    if (!ensureRenderer()) return;
    var T = THREE;
    disposeObj(W.mapObj); W.mapObj = null;
    W.ringObjs.forEach(disposeObj); W.ringObjs = []; W.rings = [];
    var segs = W.mapSegs = readMap();
    W.segExplored = new Uint8Array(segs.length);
    var pos = [], aE = [], aK = [], owner = [];
    function line(a, b, k, si) { pos.push(a.x, a.y, a.z, b.x, b.y, b.z); aK.push(k, k); aE.push(0, 0); owner.push(si, si); }
    var mn = { x: 1e9, y: 1e9, z: 1e9 }, mx = { x: -1e9, y: -1e9, z: -1e9 }, ringAcc = 0;
    segs.forEach(function (s, si) {
      [s.a, s.b].forEach(function (p) { mn.x = Math.min(mn.x, p.x); mn.y = Math.min(mn.y, p.y); mn.z = Math.min(mn.z, p.z); mx.x = Math.max(mx.x, p.x); mx.y = Math.max(mx.y, p.y); mx.z = Math.max(mx.z, p.z); });
      var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, dz = s.b.z - s.a.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      // side vector (horizontal, perpendicular) and up vector, both scaled by the passage radius
      var sx = -dz / len, sz = dx / len, sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      var r = Math.max(0.6, s.r);
      line(s.a, s.b, 0.35, si);
      line({ x: s.a.x + sx * r, y: s.a.y, z: s.a.z + sz * r }, { x: s.b.x + sx * r, y: s.b.y, z: s.b.z + sz * r }, 0.85, si);
      line({ x: s.a.x - sx * r, y: s.a.y, z: s.a.z - sz * r }, { x: s.b.x - sx * r, y: s.b.y, z: s.b.z - sz * r }, 0.85, si);
      line({ x: s.a.x, y: s.a.y + r * 0.8, z: s.a.z }, { x: s.b.x, y: s.b.y + r * 0.8, z: s.b.z }, 0.45, si);
      line({ x: s.a.x, y: s.a.y - r * 0.8, z: s.a.z }, { x: s.b.x, y: s.b.y - r * 0.8, z: s.b.z }, 0.55, si);
      // a cross-section ring every few meters (the "wireframe tube" look)
      ringAcc += len;
      if (ringAcc > 5 || si === 0) {
        ringAcc = 0; var ux = dx / len, uy = dy / len, uz = dz / len;
        var v1 = { x: sx, y: 0, z: sz }, v2 = { x: uy * sz - uz * 0, y: uz * sx - ux * sz, z: ux * 0 - uy * sx };
        var vl = Math.hypot(v2.x, v2.y, v2.z) || 1; v2.x /= vl; v2.y /= vl; v2.z /= vl;
        var prev = null;
        for (var k = 0; k <= 12; k++) {
          var a = k / 12 * Math.PI * 2, c = Math.cos(a) * r, sn = Math.sin(a) * r * 0.8;
          var p = { x: s.a.x + v1.x * c + v2.x * sn, y: s.a.y + v1.y * c + v2.y * sn, z: s.a.z + v1.z * c + v2.z * sn };
          if (prev) line(prev, p, 0.4, si); prev = p;
        }
      }
    });
    if (!segs.length) { mn = { x: -20, y: -40, z: -60 }; mx = { x: 20, y: 0, z: 0 }; }
    W.mapCenter = { x: (mn.x + mx.x) / 2, y: (mn.y + mx.y) / 2, z: (mn.z + mx.z) / 2 };
    W.mapRadius = Math.max(15, Math.hypot(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z) / 2);
    W.dist = clamp(W.mapRadius * 0.45, 18, 90); // start close: the explored part is around you
    if (pos.length) {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      W.exploredAttr = new T.Float32BufferAttribute(aE, 1); g.setAttribute('aE', W.exploredAttr);
      g.setAttribute('aK', new T.Float32BufferAttribute(aK, 1));
      W.owner = owner;
      var mat = new T.ShaderMaterial({ uniforms: { uCol: { value: new T.Color(0x4FF2D0) }, uOp: { value: 0.9 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      W.mapObj = new T.LineSegments(g, mat); W.mapObj.frustumCulled = false; W.scene.add(W.mapObj);
    }
    // depth rings at the zone boundaries inside the map's depth range
    [20, 60, 120, 200].forEach(function (d) {
      if (-d > mx.y + 5 || -d < mn.y - 5) return;
      var pts = []; for (var i = 0; i <= 64; i++) { var a = i / 64 * Math.PI * 2; pts.push(new T.Vector3(W.mapCenter.x + Math.cos(a) * W.mapRadius * 0.9, -d, W.mapCenter.z + Math.sin(a) * W.mapRadius * 0.9)); }
      var ring = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: 0x2BB8C9, transparent: true, opacity: 0.45, dashSize: 2, gapSize: 2, blending: T.AdditiveBlending, depthWrite: false }));
      ring.computeLineDistances(); W.scene.add(ring); W.ringObjs.push(ring);
      W.rings.push({ d: d, pos: new T.Vector3(W.mapCenter.x + W.mapRadius * 0.9, -d, W.mapCenter.z), name: U.ZONE_NAMES[U.zoneOfDepth(d)] });
    });
    W.mapBuilt = true;
    W.visited.forEach(reveal);
  }
  // Mark map segments near a visited point as explored.
  function reveal(p) {
    if (!W.mapBuilt || !W.segExplored) return;
    var changed = false, R2 = REVEAL_M * REVEAL_M;
    function d2(q) { var dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z; return dx * dx + dy * dy + dz * dz; }
    for (var i = 0; i < W.mapSegs.length; i++) {
      if (W.segExplored[i]) continue;
      var s = W.mapSegs[i];
      if (s.explored) { W.segExplored[i] = 1; changed = true; continue; }
      var mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2, mz = (s.a.z + s.b.z) / 2;
      if (d2(s.a) < R2 || d2(s.b) < R2 || d2({ x: mx, y: my, z: mz }) < R2) { W.segExplored[i] = 1; changed = true; }
    }
    if (changed && W.exploredAttr) {
      var arr = W.exploredAttr.array;
      for (var v = 0; v < arr.length; v++) arr[v] = W.segExplored[W.owner[v]] ? 1 : 0;
      W.exploredAttr.needsUpdate = true;
    }
  }
  function explorePct() { if (!W.segExplored || !W.segExplored.length) return 0; var n = 0; for (var i = 0; i < W.segExplored.length; i++) n += W.segExplored[i]; return n / W.segExplored.length; }

  function wpList() { return (TU.player.waypoints() || []).map(function (w) { return { index: w.index, name: K.wpName(w.index, w.name), pos: w.pos, depth: w.depth }; }); }
  function syncWaypoints() {
    if (!W.scene) return;
    var T = THREE, list = wpList();
    while (W.wpSprites.length > list.length) disposeObj(W.wpSprites.pop());
    while (W.wpSprites.length < list.length) {
      var s = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0x9ffff0, transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false }));
      s.scale.setScalar(3); W.scene.add(s); W.wpSprites.push(s);
    }
    list.forEach(function (w, i) { if (w.pos) W.wpSprites[i].position.set(w.pos.x, w.pos.y, w.pos.z); W.wpSprites[i].material.color.setHex(i === W.sel ? 0xFFC98A : 0x9ffff0); });
    renderList(list);
  }
  function renderList(list) {
    var el = $('ui-wplist'); if (!el) return;
    list = list || wpList();
    if (W.sel >= list.length) W.sel = Math.max(0, list.length - 1);
    var key = list.map(function (w) { return w.index + w.name; }).join('|') + '#' + W.sel;
    if (el.getAttribute('data-k') === key) return; el.setAttribute('data-k', key);
    el.innerHTML = '<h5>WAYPOINTS</h5>' + (list.length ? list.map(function (w, i) { return '<button class="' + (i === W.sel ? 'ui-sel' : '') + '" data-i="' + i + '"><span>' + K.esc(w.name) + '</span><span>' + (w.depth || 0).toFixed(0) + 'm</span></button>'; }).join('') +
      '<p>[ ] pick · N rename</p>' : '<p>None yet. ' + K.keyName('KeyQ') + ' drops one where you are.</p>');
    Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) { b.onclick = function () { W.sel = +b.getAttribute('data-i'); syncWaypoints(); var w = wpList()[W.sel]; if (w) K.renameWaypoint(w.index); }; });
  }

  /* ------------------------------------------------------------------ */
  /* Raise and lower                                                     */
  /* ------------------------------------------------------------------ */
  function setRaised(on) {
    on = !!on && K.simulating();
    if (on === W.raised) return;
    W.raised = on;
    if (!on) W.sticky = false;
    $('ui-wrist').classList.toggle('ui-on', on);
    if (typeof TU.player.setWristRaised === 'function') { try { TU.player.setWristRaised(on); } catch (e) { console.error('[TU] setWristRaised failed', e); } }
    if (on) {
      if (!W.mapBuilt) buildMap();
      var P = TU.player.state; W.yaw = (P.yaw || 0); W.target && W.target.set(P.pos.x, P.pos.y, P.pos.z);
      W.ropeT = 0; W.labelT = 0; syncWaypoints(); updateWatch(0);
    }
    K.emit('wrist', { raised: on });
  }
  K.wrist = { set: function (on, sticky) { setRaised(on); W.sticky = !!(on && sticky); }, raised: function () { return W.raised; }, rebuild: function () { W.mapBuilt = false; if (W.raised) buildMap(); }, explored: explorePct, view: function (yaw, pitch, dist) { if (yaw != null) W.yaw = yaw; if (pitch != null) W.pitch = pitch; if (dist != null) W.dist = dist; } };

  function bindInput() {
    // Capture phase so these keys do not also turn the view (player.js listens later, on window bubble).
    window.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Tab' && K.simulating()) {
        e.preventDefault(); e.stopPropagation();
        if (e.repeat) return;
        if (W.raised && W.sticky) { setRaised(false); return; }
        if (!W.raised) { setRaised(true); W.tabAt = e.timeStamp; W.tabFrames = 0; }
        return;
      }
      if (!W.raised) return;
      if (/^Arrow/.test(e.code)) { W.keys[e.code] = true; e.preventDefault(); e.stopPropagation(); return; }
      if (e.repeat) return;
      var list = wpList();
      if (e.code === 'BracketRight' && list.length) { W.sel = (W.sel + 1) % list.length; syncWaypoints(); e.stopPropagation(); }
      else if (e.code === 'BracketLeft' && list.length) { W.sel = (W.sel - 1 + list.length) % list.length; syncWaypoints(); e.stopPropagation(); }
      else if (e.code === 'KeyN' && list[W.sel]) { e.preventDefault(); e.stopPropagation(); K.renameWaypoint(list[W.sel].index); }
    }, true);
    window.addEventListener('keyup', function (e) {
      if (/^Arrow/.test(e.code)) W.keys[e.code] = false;
      if (e.code !== 'Tab' || !W.raised) return;
      e.preventDefault();
      if (e.timeStamp - W.tabAt > 350 && W.tabFrames >= 8) setRaised(false); // held: lower on release (the frame count stops a stalled page from turning a tap into a hold)
      else W.sticky = true;                                   // tapped: stay up until the next tap
    }, true);
    window.addEventListener('mousedown', function () { if (W.raised) W.drag = true; }, true);
    window.addEventListener('mouseup', function () { W.drag = false; }, true);
    window.addEventListener('mousemove', function (e) {
      if (!W.raised || !W.drag) return;
      W.yaw -= (e.movementX || 0) * 0.008; W.pitch = clamp(W.pitch + (e.movementY || 0) * 0.006, 0.05, 1.5);
      e.stopPropagation();
    }, true);
    window.addEventListener('wheel', function (e) {
      if (!W.raised) return;
      W.dist = clamp(W.dist * Math.exp(e.deltaY * 0.0012), 6, 400); e.preventDefault();
    }, { capture: true, passive: false });
  }

  /* ------------------------------------------------------------------ */
  /* Watch face                                                          */
  /* ------------------------------------------------------------------ */
  function buildDom() {
    TU.el('div', { id: 'ui-wrist', attrs: { 'aria-label': 'Wrist computer' }, html: [
      '<div id="ui-holo-wrap"><canvas id="ui-holo"></canvas><div id="ui-holo-labels"></div><div id="ui-holo-info"></div><div id="ui-wplist"></div></div>',
      '<div id="ui-beam"></div>',
      '<div id="ui-watch"><div class="ui-wf-strap"></div><div class="ui-wf-case"><div class="ui-wf-scr">',
      '<div><small>DEPTH</small><div class="ui-wf-big" id="ui-wf-depth">0.0<i>m</i></div></div>',
      '<div class="ui-wf-r"><small>DIVE TIME</small><span id="ui-wf-time">0:00</span><small style="margin-top:4px">MAX</small><span id="ui-wf-max">0.0</span></div>',
      '<div class="ui-wf-row"><div class="ui-wf-asc"><s><u id="ui-wf-ascbar"></u></s><span><small>ASCENT</small><span id="ui-wf-asc">0 m/min</span></span></div>',
      '<svg class="ui-wf-cmp" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="rgba(79,242,208,.35)"/><g id="ui-wf-rose"><path d="M20 4 L23 20 L20 17 L17 20 Z" fill="#FF6A5C"/><path d="M20 36 L23 20 L20 23 L17 20 Z" fill="rgba(189,255,241,.6)"/><text x="20" y="11" text-anchor="middle" font-size="6" fill="#bdfff1" font-family="monospace">N</text></g></svg>',
      '<div style="text-align:right"><small>HDG</small><span id="ui-wf-hdg">000</span></div></div>',
      '<div class="ui-wf-row"><span><small>WATER</small><span id="ui-wf-temp">--</span></span><span style="text-align:right"><small>TANK</small><span id="ui-wf-tank">200 bar</span></span></div>',
      '</div><div class="ui-wf-brand">SUMPTEC DC-2 · HOLO</div></div></div>'
    ].join('') });
  }
  function setT(id, t) { var e = $(id); if (e && e.textContent !== t) e.textContent = t; }
  function updateWatch(dt) {
    var P = TU.player.state, env = P.env || {}, run = TU.run || {};
    var d = $('ui-wf-depth'); if (d) d.innerHTML = (P.depth || 0).toFixed(1) + '<i>m</i>';
    setT('ui-wf-time', fmtTime(run.t || 0)); setT('ui-wf-max', (P.maxDepth || 0).toFixed(1) + ' m');
    var rate = W.ascent, up = rate > 0.5, slow = rate > 10;
    setT('ui-wf-asc', (up ? 'UP ' : rate < -0.5 ? 'DN ' : '') + Math.abs(rate).toFixed(0) + ' m/min' + (slow ? ' SLOW' : ''));
    $('ui-wf-asc').classList.toggle('ui-wf-slow', slow);
    $('ui-wf-ascbar').style.height = clamp(Math.abs(rate) / 18, 0, 1) * 100 + '%';
    $('ui-wf-ascbar').style.background = slow ? 'var(--bad)' : '#4FF2D0';
    var hd = K.heading ? K.heading(P) : 0;
    $('ui-wf-rose').setAttribute('transform', 'rotate(' + (-hd).toFixed(1) + ' 20 20)');
    setT('ui-wf-hdg', ('00' + Math.round(hd) % 360).slice(-3) + '°');
    setT('ui-wf-temp', env.temperature != null ? env.temperature.toFixed(1) + '°C' : '--');
    var tanks = P.tanks || [];
    setT('ui-wf-tank', tanks.length > 1 ? tanks.map(function (t, i) { return (i === P.activeTank ? '>' : '') + Math.round(t.bar); }).join(' ') + ' bar' : Math.round(P.air || 0) + ' bar');
  }

  /* ------------------------------------------------------------------ */
  /* Per-step and per-frame work                                         */
  /* ------------------------------------------------------------------ */
  function update(dt) {
    var P = TU.player.state;
    // ascent rate in m/min (positive = going up), smoothed
    var rate = dt > 0 ? (W.lastDepth - (P.depth || 0)) / dt * 60 : 0; W.lastDepth = P.depth || 0;
    W.ascent = U.damp(W.ascent, clamp(rate, -60, 60), 2.5, dt);
    // remember where you have been (reveals the map)
    W.visitT -= dt;
    if (W.visitT <= 0) {
      W.visitT = 0.5;
      var last = W.visited[W.visited.length - 1], p = { x: P.pos.x, y: P.pos.y, z: P.pos.z };
      if (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > VISIT_STEP_M) { W.visited.push(p); reveal(p); }
    }
    if (W.raised) updateWatch(dt);
  }
  var tmpV = null;
  function frame(dt) {
    W.tabFrames = (W.tabFrames || 0) + 1;
    if (!W.raised || !W.renderer) return;
    var T = THREE, P = TU.player.state, wrap = $('ui-holo-wrap'), w = wrap.clientWidth, h = wrap.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (w < 2 || h < 2) return;
    var cv = W.renderer.domElement;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { W.renderer.setPixelRatio(dpr); W.renderer.setSize(w, h, false); W.camera.aspect = w / h; W.camera.updateProjectionMatrix(); }
    // spin from arrow keys, slow drift when idle
    var k = W.keys;
    if (k.ArrowLeft) W.yaw += dt * 1.6; if (k.ArrowRight) W.yaw -= dt * 1.6;
    if (k.ArrowUp) W.pitch = clamp(W.pitch + dt, 0.05, 1.5); if (k.ArrowDown) W.pitch = clamp(W.pitch - dt, 0.05, 1.5);
    if (!W.drag && !k.ArrowLeft && !k.ArrowRight && !K.data().settings.reduceMotion) W.yaw += dt * 0.08;
    W.target.lerp(tmpV || (tmpV = new T.Vector3()).set(P.pos.x, P.pos.y, P.pos.z), 1 - Math.exp(-dt * 4));
    var cp = Math.cos(W.pitch), sp = Math.sin(W.pitch);
    W.camera.position.set(W.target.x + Math.sin(W.yaw) * cp * W.dist, W.target.y + sp * W.dist, W.target.z + Math.cos(W.yaw) * cp * W.dist);
    W.camera.lookAt(W.target);
    // you, the rope
    W.you.position.set(P.pos.x, P.pos.y, P.pos.z);
    W.you.scale.setScalar((2.2 + Math.sin(performance.now() * 0.006) * 0.6) * Math.max(0.6, W.dist / 60));
    W.wpSprites.forEach(function (s) { s.scale.setScalar(2.2 * Math.max(0.6, W.dist / 60)); });
    W.ropeT -= dt;
    if (W.ropeT <= 0) {
      W.ropeT = 0.25;
      var pts = TU.player.ropePoints() || [], arr = W.ropeLine.geometry.attributes.position.array, n = Math.min(pts.length, 2598);
      for (var i = 0; i < n; i++) { arr[i * 3] = pts[i].x; arr[i * 3 + 1] = pts[i].y; arr[i * 3 + 2] = pts[i].z; }
      arr[n * 3] = P.pos.x; arr[n * 3 + 1] = P.pos.y; arr[n * 3 + 2] = P.pos.z;
      W.ropeLine.geometry.setDrawRange(0, n + 1); W.ropeLine.geometry.attributes.position.needsUpdate = true;
      syncWaypoints();
    }
    W.renderer.render(W.scene, W.camera);
    labels(w, h);
  }
  function project(p, w, h) {
    var v = (tmpV || (tmpV = new THREE.Vector3())).set(p.x, p.y, p.z).project(W.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }
  function labels(w, h) {
    var el = $('ui-holo-labels'), html = '', P = TU.player.state, s;
    W.rings.forEach(function (r) { s = project(r.pos, w, h); if (s) html += '<span class="ui-ring" style="left:' + s.x.toFixed(0) + 'px;top:' + s.y.toFixed(0) + 'px">' + r.d + ' m</span>'; });
    wpList().forEach(function (wp, i) { if (!wp.pos) return; s = project(wp.pos, w, h); if (s) html += '<span class="' + (i === W.sel ? 'ui-wsel' : '') + '" style="left:' + s.x.toFixed(0) + 'px;top:' + s.y.toFixed(0) + 'px">' + K.esc(wp.name) + '</span>'; });
    s = project(P.pos, w, h); if (s) html += '<span class="ui-you" style="left:' + s.x.toFixed(0) + 'px;top:' + s.y.toFixed(0) + 'px">YOU</span>';
    el.innerHTML = html;
    var info = 'CAVE MAP <b>' + Math.round(explorePct() * 100) + '%</b> MAPPED<br>DEPTH <b>' + (P.depth || 0).toFixed(1) + ' m</b> · ROPE <b>' + TU.player.ropeLength().toFixed(0) + ' m</b><br>' + (W.mapSegs.length ? 'DRAG / ARROWS SPIN · WHEEL ZOOM' : 'NO SURVEY DATA YET');
    var ie = $('ui-holo-info'); if (ie.innerHTML !== info) ie.innerHTML = info;
  }

  TU.define('ui', { setWrist: function (on) { K.wrist.set(on, true); }, wristRaised: function () { return W.raised; } });

  K.part('wrist', {
    init: function () { buildDom(); bindInput(); },
    reset: function () {
      setRaised(false); W.visited = []; W.mapBuilt = false; W.sel = 0; W.ascent = 0; W.lastDepth = 0; W.visitT = 0;
      if (W.scene) { W.wpSprites.forEach(disposeObj); W.wpSprites = []; }
    },
    state: function (e) { if (e.to !== 'dive' && e.to !== 'tutorial' && e.to !== 'paused') setRaised(false); if (e.to === 'paused' && W.raised) { $('ui-wrist').classList.remove('ui-on'); } if (e.to === 'dive' && W.raised) $('ui-wrist').classList.add('ui-on'); },
    update: update,
    frame: frame
  });
})();
