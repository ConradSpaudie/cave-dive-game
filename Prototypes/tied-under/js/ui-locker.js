/*
 * ui-locker.js: the Locker Shack. Customize how your diver looks (Gear and Customization.md).
 *
 *   Wetsuit editor  a flat 2D template of the suit (torso, arms, legs, hood, gloves and boots).
 *                   Color zones with patterns, stickers you stamp anywhere, and a freehand brush with
 *                   eraser and undo. The finished template is used as the texture of the 3D diver.
 *   3D preview      a small three.js scene with a procedural diver mannequin (suit, mask, tanks, fins)
 *                   that turns slowly. Drag it to spin it.
 *   Mask            frame color, strap color and frame style (the mask TYPE is picked on the Gear Tarp).
 *   Flippers        presets plus shape and width sliders. Changing the tuning costs Fin Tokens.
 *
 * Saved in TU.save.data.ui.locker (suit zones + painted layer as an image, mask, fins).
 * Owner: agent D. Part of the ui system (see ui.js, K.part).
 */
(function () {
  'use strict';
  var TU = window.TU, K = TU.uiKit, U = TU.util, clamp = U.clamp, $ = TU.$;
  if (!K) return;

  var TW = 512, TH = 256; // template size in pixels
  // Template regions [x, y, w, h]. Cylinders wrap around, so the torso is BACK | FRONT | BACK.
  var REG = { torso: [0, 0, 256, 128], armL: [256, 0, 128, 128], armR: [384, 0, 128, 128], legL: [0, 128, 128, 128], legR: [128, 128, 128, 128], hood: [256, 128, 128, 128], gloves: [384, 128, 128, 128] };
  var ZONES = [['torso', 'Torso', ['torso']], ['arms', 'Arms', ['armL', 'armR']], ['legs', 'Legs', ['legL', 'legR']], ['hood', 'Hood', ['hood']], ['gloves', 'Gloves + boots', ['gloves']]];
  var PALETTE = ['#0d1214', '#1b2a30', '#2f4f57', '#E8E4D8', '#4FF2D0', '#2BB8C9', '#1f4a6b', '#3b6e3a', '#d9b23c', '#FF8A3D', '#d8433c', '#8e3fb0', '#f06aa8', '#6b5236'];
  var PATTERNS = ['none', 'stripes', 'pinstripe', 'band', 'chevron', 'zigzag', 'dots', 'camo', 'scales', 'fade'];
  var STICKERS = [['kevin', 'Kevin'], ['skull', 'Skull'], ['fish', 'Fish'], ['paw', 'Cat paw'], ['star', 'Star'], ['bolt', 'Bolt'], ['wave', 'Wave'], ['bubbles', 'Bubbles'], ['num', '07'], ['badge', 'Bad Buoyancy']];
  var FIN_COLORS = { paddle: ['#d9b23c', '#151a1c'], split: ['#2BB8C9', '#0d1214'], jet: ['#181c1e', '#3a3f42'], blade: ['#1f4a6b', '#4FF2D0'] };
  function defaultZones() {
    return { torso: { c: '#1b2a30', p: 'band', pc: '#2BB8C9' }, arms: { c: '#1b2a30', p: 'stripes', pc: '#2f4f57' }, legs: { c: '#1b2a30', p: 'none', pc: '#4FF2D0' }, hood: { c: '#0d1214', p: 'none', pc: '#2BB8C9' }, gloves: { c: '#0d1214', p: 'none', pc: '#2f4f57' } };
  }
  function L() {
    var l = K.data().locker;
    if (!l.suit.zones) l.suit.zones = defaultZones();
    ZONES.forEach(function (z) { if (!l.suit.zones[z[0]]) l.suit.zones[z[0]] = defaultZones()[z[0]]; });
    return l;
  }

  TU.css('ui-locker', [
    '.ui-lk{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:12px;align-items:start}',
    '.ui-lk-ed{background:#151c1e;border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:8px;min-width:0}',
    '#ui-lk-tpl{width:100%;height:auto;display:block;border-radius:2px;touch-action:none;cursor:crosshair;image-rendering:auto;background:#0a0f10}',
    '.ui-lk-3d{position:relative;background:radial-gradient(ellipse at 50% 40%, #1d3236 0%, #0a1214 70%);border:1px solid rgba(255,255,255,.08);border-radius:4px;height:320px;overflow:hidden}',
    '.ui-lk-3d canvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none}',
    '.ui-lk-3d small{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-family:var(--mono);font-size:10px;letter-spacing:.18em;color:var(--ink-dim);pointer-events:none}',
    '.ui-lk-tools{margin-top:12px}',
    '.ui-sw{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 10px}',
    '.ui-sw button{width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.15);cursor:pointer;padding:0}',
    '.ui-sw button.ui-sel{border-color:#fff;box-shadow:0 0 0 2px #4FF2D0}',
    '.ui-sw input[type=color]{width:34px;height:28px;border:1px solid var(--line);background:none;padding:0;cursor:pointer}',
    '.ui-lk-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0 8px}',
    '.ui-lk-lbl{font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:var(--hud-dim);margin:10px 0 2px}',
    '.ui-lk-row input[type=range]{accent-color:var(--hud);flex:1;min-width:120px}',
    '.ui-stk{width:52px;height:52px;border:1px solid var(--line);border-radius:4px;background:#0e1517;cursor:pointer;padding:3px}',
    '.ui-stk canvas{width:100%;height:100%}',
    '.ui-stk.ui-sel{border-color:var(--hud);box-shadow:inset 0 0 10px rgba(79,242,208,.25)}',
    '.ui-stk:disabled{opacity:.35;cursor:not-allowed}',
    '.ui-fin-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}',
    '.ui-fin-stats div{border:1px solid var(--line);border-radius:4px;padding:8px;font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--hud-dim)}',
    '.ui-fin-stats b{display:block;font-size:18px;color:var(--hud);font-weight:400;letter-spacing:0}',
    '@media (max-width: 1100px){ .ui-lk{grid-template-columns:1fr} .ui-lk-3d{height:280px} }'
  ].join('\n'));

  /* ------------------------------------------------------------------ */
  /* Canvases: base (zones), neoprene grain, paint layer, composite      */
  /* ------------------------------------------------------------------ */
  function cnv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var base = null, grain = null, paint = null, comp = null, texture = null, paintLoadedFrom = null, undo = [];
  function ensureCanvases() {
    if (comp) return;
    base = cnv(TW, TH); paint = cnv(TW, TH); comp = cnv(TW, TH); grain = cnv(TW, TH);
    // neoprene grain: fine noise and a subtle knit
    var g = grain.getContext('2d'), img = g.createImageData(TW, TH), r = TU.rng(5, 66);
    for (var i = 0; i < TW * TH; i++) { var v = r.float(); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v < 0.5 ? 0 : 255; img.data[i * 4 + 3] = 10 + v * 10; }
    g.putImageData(img, 0, 0);
    loadPaint();
  }
  function loadPaint() {
    var src = L().suit.paint;
    if (src === paintLoadedFrom) return;
    paintLoadedFrom = src;
    var pg = paint.getContext('2d'); pg.clearRect(0, 0, TW, TH);
    if (!src) { composite(); return; }
    var im = new Image();
    im.onload = function () { pg.drawImage(im, 0, 0); composite(); };
    im.src = src;
  }
  function savePaint() {
    try { var d = paint.toDataURL('image/png'); L().suit.paint = d; paintLoadedFrom = d; K.write(); } catch (e) { /* ignore */ }
  }
  function drawPattern(g, x, y, w, h, type, col, seed) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = col; g.strokeStyle = col;
    var i, j, r = TU.rng(seed, 67);
    if (type === 'stripes') for (i = 0; i < h; i += 22) g.fillRect(x, y + i + 6, w, 8);
    else if (type === 'pinstripe') for (i = 0; i < w; i += 10) g.fillRect(x + i, y, 2, h);
    else if (type === 'band') g.fillRect(x, y + h * 0.36, w, h * 0.22);
    else if (type === 'chevron') { g.lineWidth = 6; for (i = -h; i < h * 2; i += 26) { g.beginPath(); for (j = 0; j <= w; j += 16) g.lineTo(x + j, y + i + ((j / 16) % 2 ? 10 : -10) + h * 0.0); g.stroke(); } }
    else if (type === 'zigzag') { g.lineWidth = 3; for (i = 8; i < h; i += 18) { g.beginPath(); for (j = 0; j <= w; j += 8) g.lineTo(x + j, y + i + ((j / 8) % 2 ? 5 : -5)); g.stroke(); } }
    else if (type === 'dots') for (i = 6; i < h; i += 16) for (j = (i / 16) % 2 ? 6 : 14; j < w; j += 16) { g.beginPath(); g.arc(x + j, y + i, 3.6, 0, Math.PI * 2); g.fill(); }
    else if (type === 'camo') { for (i = 0; i < 26; i++) { g.globalAlpha = 0.55 + r.float() * 0.45; g.beginPath(); g.ellipse(x + r.float() * w, y + r.float() * h, 8 + r.float() * 18, 5 + r.float() * 12, r.float() * 3, 0, Math.PI * 2); g.fill(); } }
    else if (type === 'scales') { g.lineWidth = 1.5; for (i = 0; i < h + 10; i += 10) for (j = (i / 10) % 2 ? 0 : 8; j < w + 16; j += 16) { g.beginPath(); g.arc(x + j, y + i, 8, 0, Math.PI); g.stroke(); } }
    else if (type === 'fade') { var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.globalAlpha = 0.9; g.fillRect(x, y, w, h); }
    g.restore();
  }
  function drawBase() {
    var g = base.getContext('2d'), Z = L().suit.zones;
    ZONES.forEach(function (z, zi) {
      var st = Z[z[0]];
      z[2].forEach(function (rk, ri) {
        var R = REG[rk];
        g.fillStyle = st.c; g.fillRect(R[0], R[1], R[2], R[3]);
        if (st.p && st.p !== 'none') drawPattern(g, R[0], R[1], R[2], R[3], st.p, st.pc, 100 + zi * 10 + ri);
      });
    });
    // seams and a back zipper
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    Object.keys(REG).forEach(function (k) { var R = REG[k]; g.strokeRect(R[0] + 1, R[1] + 1, R[2] - 2, R[3] - 2); });
    g.fillStyle = 'rgba(200,200,200,.35)'; for (var y = 4; y < 124; y += 6) { g.fillRect(1, y, 3, 2); g.fillRect(252, y, 3, 2); }
    // knee and elbow pads
    g.fillStyle = 'rgba(0,0,0,.28)'; [REG.legL, REG.legR].forEach(function (R) { g.fillRect(R[0] + R[2] * 0.25, R[1] + R[3] * 0.42, R[2] * 0.5, 16); });
  }
  function composite() {
    if (!comp) return;
    var g = comp.getContext('2d');
    g.clearRect(0, 0, TW, TH); g.drawImage(base, 0, 0); g.drawImage(grain, 0, 0); g.drawImage(paint, 0, 0);
    if (texture) texture.needsUpdate = true;
    drawEditor();
  }
  K.suitCanvas = function () { ensureCanvases(); drawBase(); composite(); return comp; };

  /* ------------------------------------------------------------------ */
  /* Stickers (drawn with canvas paths, no image files)                  */
  /* ------------------------------------------------------------------ */
  function sticker(g, id, x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s / 40, s / 40); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    var i;
    if (id === 'kevin') { // Kevin the training dummy: stitched face, X eyes
      g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 2.5;
      [[-7, -4], [7, -4]].forEach(function (p) { g.beginPath(); g.moveTo(p[0] - 4, p[1] - 4); g.lineTo(p[0] + 4, p[1] + 4); g.moveTo(p[0] + 4, p[1] - 4); g.lineTo(p[0] - 4, p[1] + 4); g.stroke(); });
      g.beginPath(); g.moveTo(-9, 8); g.lineTo(9, 8); g.stroke(); for (i = -7; i <= 7; i += 4.5) { g.beginPath(); g.moveTo(i, 5); g.lineTo(i, 11); g.stroke(); }
    } else if (id === 'skull') {
      g.beginPath(); g.arc(0, -4, 15, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(9, 12); g.lineTo(-9, 12); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(-6, -4, 4.5, 0, 7); g.arc(6, -4, 4.5, 0, 7); g.fill(); g.beginPath(); g.moveTo(0, 2); g.lineTo(-2.5, 7); g.lineTo(2.5, 7); g.fill();
    } else if (id === 'fish') {
      g.beginPath(); g.ellipse(-3, 0, 15, 9, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(10, 0); g.lineTo(20, -9); g.lineTo(20, 9); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(-10, -2, 2.4, 0, 7); g.fill();
    } else if (id === 'paw') {
      g.beginPath(); g.ellipse(0, 6, 10, 8, 0, 0, 7); g.fill();
      [[-11, -5], [-4, -11], [4, -11], [11, -5]].forEach(function (p) { g.beginPath(); g.ellipse(p[0], p[1], 4, 5, 0, 0, 7); g.fill(); });
    } else if (id === 'star') {
      g.beginPath(); for (i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 7.5 : 18; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill();
    } else if (id === 'bolt') {
      g.beginPath(); g.moveTo(4, -19); g.lineTo(-10, 3); g.lineTo(-1, 3); g.lineTo(-5, 19); g.lineTo(10, -4); g.lineTo(1, -4); g.closePath(); g.fill();
    } else if (id === 'wave') {
      g.lineWidth = 4; for (i = -8; i <= 8; i += 8) { g.beginPath(); for (var x = -18; x <= 18; x += 2) g.lineTo(x, i + Math.sin(x * 0.35) * 3.5); g.stroke(); }
    } else if (id === 'bubbles') {
      g.lineWidth = 2.5; [[-6, 6, 9], [8, -4, 6], [-2, -12, 4], [12, 10, 3.5]].forEach(function (b) { g.beginPath(); g.arc(b[0], b[1], b[2], 0, 7); g.stroke(); });
    } else if (id === 'num') {
      g.font = 'bold 30px "Chakra Petch", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('07', 0, 2);
    } else if (id === 'badge') {
      g.beginPath(); g.arc(0, 0, 19, 0, 7); g.lineWidth = 2.5; g.stroke(); g.font = 'bold 8px "Share Tech Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('BAD', 0, -6); g.fillText('BUOYANCY', 0, 4); g.beginPath(); g.arc(0, 12, 2, 0, 7); g.fill();
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Editor state and the visible template canvas                        */
  /* ------------------------------------------------------------------ */
  var ed = { tab: 'suit', zone: 'torso', mode: 'paint', color: '#4FF2D0', size: 10, sticker: 'star', stickerSize: 38, root: null, drawing: false, last: null };
  function drawEditor() {
    var c = $('ui-lk-tpl'); if (!c || !comp) return;
    var g = c.getContext('2d');
    g.clearRect(0, 0, TW, TH); g.drawImage(comp, 0, 0);
    // region labels and outlines (editor only, not on the suit)
    g.font = '10px "Share Tech Mono", monospace'; g.textAlign = 'left';
    var names = { torso: 'BACK | FRONT | BACK', armL: 'LEFT ARM', armR: 'RIGHT ARM', legL: 'LEFT LEG', legR: 'RIGHT LEG', hood: 'HOOD', gloves: 'GLOVES + BOOTS' };
    Object.keys(REG).forEach(function (k) {
      var R = REG[k]; g.strokeStyle = 'rgba(79,242,208,.35)'; g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeRect(R[0] + 0.5, R[1] + 0.5, R[2] - 1, R[3] - 1); g.setLineDash([]);
      var t = names[k], tw = g.measureText(t).width + 8; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(R[0] + 3, R[1] + R[3] - 15, tw, 13); g.fillStyle = 'rgba(200,255,245,.85)'; g.fillText(t, R[0] + 7, R[1] + R[3] - 5);
    });
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(192, 0); g.lineTo(192, 128); g.stroke();
  }
  function tplPos(e) { var c = $('ui-lk-tpl'), b = c.getBoundingClientRect(); return { x: (e.clientX - b.left) * TW / b.width, y: (e.clientY - b.top) * TH / b.height }; }
  function pushUndo() { try { undo.push(paint.getContext('2d').getImageData(0, 0, TW, TH)); if (undo.length > 12) undo.shift(); } catch (e) { /* ignore */ } }
  function stroke(a, b) {
    var g = paint.getContext('2d');
    g.save(); g.globalCompositeOperation = ed.mode === 'erase' ? 'destination-out' : 'source-over';
    g.strokeStyle = ed.color; g.lineWidth = ed.size; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x + 0.01, b.y); g.stroke(); g.restore();
    composite();
  }
  function bindTemplate() {
    var c = $('ui-lk-tpl'); if (!c) return;
    c.addEventListener('pointerdown', function (e) {
      e.preventDefault(); var p = tplPos(e);
      if (ed.tab === 'stickers') { pushUndo(); sticker(paint.getContext('2d'), ed.sticker, p.x, p.y, ed.stickerSize, ed.color); composite(); savePaint(); return; }
      if (ed.tab === 'suit') { // click a region to pick its zone
        ZONES.forEach(function (z) { z[2].forEach(function (rk) { var R = REG[rk]; if (p.x >= R[0] && p.x < R[0] + R[2] && p.y >= R[1] && p.y < R[1] + R[3]) ed.zone = z[0]; }); });
        renderTools(); return;
      }
      if (ed.tab !== 'paint') return;
      pushUndo(); ed.drawing = true; ed.last = p; stroke(p, p);
      try { c.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    });
    c.addEventListener('pointermove', function (e) { if (!ed.drawing) return; var p = tplPos(e); stroke(ed.last, p); ed.last = p; });
    function end() { if (!ed.drawing) return; ed.drawing = false; savePaint(); }
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }

  /* ------------------------------------------------------------------ */
  /* 3D mannequin preview                                                */
  /* ------------------------------------------------------------------ */
  var V = { renderer: null, scene: null, camera: null, rig: null, canvas: null, rot: 0.5, drag: null, visible: false, built: false, mats: {}, finGroup: null, tankGroup: null, maskGroup: null, failed: false };
  function remapUV(geo, rk) {
    var R = REG[rk], uv = geo.attributes.uv;
    var u0 = R[0] / TW, du = R[2] / TW, v0 = 1 - (R[1] + R[3]) / TH, dv = R[3] / TH;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
    uv.needsUpdate = true; return geo;
  }
  function build3D() {
    if (V.built || V.failed || !window.THREE) return;
    var T = THREE;
    try {
      V.canvas = document.createElement('canvas'); V.canvas.id = 'ui-lk-3dc'; V.canvas.setAttribute('aria-label', '3D preview of your diver. Drag to spin.');
      V.renderer = new T.WebGLRenderer({ canvas: V.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch (e) { V.failed = true; return; }
    V.renderer.setClearColor(0x000000, 0);
    if (V.renderer.outputEncoding !== undefined) V.renderer.outputEncoding = T.sRGBEncoding;
    V.scene = new T.Scene();
    V.camera = new T.PerspectiveCamera(28, 1, 0.1, 30); V.camera.position.set(0, 1.05, 4.6); V.camera.lookAt(0, 0.98, 0);
    V.scene.add(new T.HemisphereLight(0xbfeee8, 0x1a1410, 0.75));
    var key = new T.DirectionalLight(0xffe2c0, 1.15); key.position.set(-2, 3, 3); V.scene.add(key);
    var rim = new T.DirectionalLight(0x4FF2D0, 0.9); rim.position.set(2.5, 1.5, -3); V.scene.add(rim);
    ensureCanvases(); drawBase(); composite();
    texture = new T.CanvasTexture(comp); if (T.sRGBEncoding) texture.encoding = T.sRGBEncoding; texture.anisotropy = 4;
    var suit = V.mats.suit = new T.MeshStandardMaterial({ map: texture, roughness: 0.78, metalness: 0.02 });
    var rig = V.rig = new T.Group(); V.scene.add(rig);
    function part(geo, rk, x, y, z, rx, rz) { var m = new T.Mesh(remapUV(geo, rk), suit); m.position.set(x, y, z); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; rig.add(m); return m; }
    var PI = Math.PI;
    part(new T.CylinderGeometry(0.2, 0.165, 0.72, 28, 1, false, PI, PI * 2), 'torso', 0, 1.26, 0);
    var sh = new T.Mesh(remapUV(new T.SphereGeometry(0.2, 24, 12, 0, PI * 2, 0, PI / 2), 'torso'), suit); sh.position.set(0, 1.62, 0); sh.scale.set(1, 0.42, 0.9); rig.add(sh);
    var hood = part(new T.SphereGeometry(0.13, 24, 18), 'hood', 0, 1.82, 0); hood.scale.set(1, 1.15, 1.05);
    part(new T.CylinderGeometry(0.065, 0.075, 0.12, 16), 'hood', 0, 1.68, 0);
    part(new T.CylinderGeometry(0.068, 0.05, 0.66, 16), 'armL', -0.27, 1.27, 0, 0, -0.16);
    part(new T.CylinderGeometry(0.068, 0.05, 0.66, 16), 'armR', 0.27, 1.27, 0, 0, 0.16);
    part(new T.SphereGeometry(0.058, 14, 10), 'gloves', -0.33, 0.9, 0.01);
    part(new T.SphereGeometry(0.058, 14, 10), 'gloves', 0.33, 0.9, 0.01);
    part(new T.CylinderGeometry(0.17, 0.165, 0.16, 24, 1, false, PI, PI * 2), 'legL', 0, 0.86, 0);
    part(new T.CylinderGeometry(0.09, 0.066, 0.82, 18, 1, false, PI, PI * 2), 'legL', -0.095, 0.43, 0);
    part(new T.CylinderGeometry(0.09, 0.066, 0.82, 18, 1, false, PI, PI * 2), 'legR', 0.095, 0.43, 0);
    // harness straps
    var strapM = new T.MeshStandardMaterial({ color: 0x15191a, roughness: 0.9 });
    [-0.1, 0.1].forEach(function (x) { var b = new T.Mesh(new T.BoxGeometry(0.045, 0.62, 0.42), strapM); b.position.set(x, 1.3, 0); rig.add(b); });
    var belt = new T.Mesh(new T.TorusGeometry(0.175, 0.018, 6, 28), strapM); belt.rotation.x = PI / 2; belt.position.y = 0.98; rig.add(belt);
    V.tankGroup = new T.Group(); rig.add(V.tankGroup);
    V.maskGroup = new T.Group(); rig.add(V.maskGroup);
    V.finGroup = new T.Group(); rig.add(V.finGroup);
    // floor shadow
    var sg = new T.Mesh(new T.CircleGeometry(0.6, 32), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    sg.rotation.x = -PI / 2; sg.position.y = 0.0; V.scene.add(sg);
    V.built = true;
    refreshGear();
    // drag to spin
    V.canvas.addEventListener('pointerdown', function (e) { V.drag = { x: e.clientX, r: V.rot }; try { V.canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } V.canvas.style.cursor = 'grabbing'; });
    V.canvas.addEventListener('pointermove', function (e) { if (V.drag) V.rot = V.drag.r + (e.clientX - V.drag.x) * 0.012; });
    function up() { V.drag = null; V.canvas.style.cursor = 'grab'; }
    V.canvas.addEventListener('pointerup', up); V.canvas.addEventListener('pointercancel', up);
  }
  function clearGroup(gp) { while (gp.children.length) { var c = gp.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); } }
  // Tanks, mask and fins follow the loadout and locker choices.
  function refreshGear(pendingFin) {
    if (!V.built) return;
    var T = THREE, PI = Math.PI, lo = TU.save.data.loadout, lk = L();
    clearGroup(V.tankGroup);
    var n = (TU.cfg.loadouts[lo.tank] || { tanks: 2 }).tanks, tankM = new T.MeshStandardMaterial({ color: 0xd9b23c, roughness: 0.35, metalness: 0.5 }), valveM = new T.MeshStandardMaterial({ color: 0x8a8d89, roughness: 0.3, metalness: 0.8 });
    for (var i = 0; i < n; i++) {
      var x = (i - (n - 1) / 2) * 0.16, t = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.6, 18), tankM); t.position.set(x, 1.24, -0.27); V.tankGroup.add(t);
      var cap = new T.Mesh(new T.SphereGeometry(0.075, 16, 8, 0, PI * 2, 0, PI / 2), tankM); cap.position.set(x, 1.54, -0.27); V.tankGroup.add(cap);
      var v = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.08, 8), valveM); v.position.set(x, 1.63, -0.27); V.tankGroup.add(v);
    }
    clearGroup(V.maskGroup);
    var frameM = new T.MeshStandardMaterial({ color: new T.Color(lk.mask.frame), roughness: 0.5 }), strapM = new T.MeshStandardMaterial({ color: new T.Color(lk.mask.strap), roughness: 0.8 });
    var glassM = new T.MeshStandardMaterial({ color: 0x5fd8cf, roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.8, emissive: 0x0b3a36 });
    var style = lk.mask.style, wide = lo.mask === 'wide', fr;
    if (style === 'square') fr = new T.Mesh(new T.BoxGeometry(wide ? 0.25 : 0.21, 0.1, 0.05), frameM);
    else if (style === 'low') fr = new T.Mesh(new T.BoxGeometry(wide ? 0.24 : 0.2, 0.075, 0.04), frameM);
    else { fr = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.05, 24), frameM); fr.rotation.x = PI / 2; fr.scale.set(wide ? 2.0 : 1.7, 1, 0.95); }
    fr.position.set(0, 1.84, 0.13); V.maskGroup.add(fr);
    var gl = new T.Mesh(new T.PlaneGeometry(wide ? 0.21 : 0.18, style === 'low' ? 0.06 : 0.08), glassM); gl.position.set(0, 1.84, 0.158); V.maskGroup.add(gl);
    var st = new T.Mesh(new T.TorusGeometry(0.145, 0.012, 6, 30), strapM); st.position.set(0, 1.84, 0); st.rotation.x = PI / 2; V.maskGroup.add(st);
    if (lo.mask === 'headlamp') { var hl = new T.Mesh(new T.CylinderGeometry(0.025, 0.03, 0.05, 12), new T.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff2c0, emissiveIntensity: 1.2 })); hl.rotation.x = PI / 2; hl.position.set(0, 1.97, 0.11); V.maskGroup.add(hl); }
    // regulator
    var reg = new T.Mesh(new T.CylinderGeometry(0.03, 0.035, 0.05, 12), new T.MeshStandardMaterial({ color: 0x222628, roughness: 0.6 })); reg.rotation.x = PI / 2; reg.position.set(0, 1.74, 0.14); V.maskGroup.add(reg);
    clearGroup(V.finGroup);
    var f = pendingFin || lk.fins, col = FIN_COLORS[f.preset] || FIN_COLORS.paddle;
    var finM = new T.MeshStandardMaterial({ color: new T.Color(col[0]), roughness: 0.55, side: T.DoubleSide }), footM = new T.MeshStandardMaterial({ color: new T.Color(col[1]), roughness: 0.7 });
    var len = f.preset === 'blade' ? 0.62 : 0.42, wid = 0.13 + f.width * 0.12;
    [-0.095, 0.095].forEach(function (x) {
      var foot = new T.Mesh(new T.BoxGeometry(0.1, 0.07, 0.18), footM); foot.position.set(x, 0.035, 0.05); V.finGroup.add(foot);
      // fin blade: a flat shape that widens toward the tip; shape slider bends the tip
      var s = new T.Shape(); s.moveTo(-0.05, 0); s.lineTo(-wid / 2, len); s.quadraticCurveTo(0, len + 0.04 + f.shape * 0.06, wid / 2, len); s.lineTo(0.05, 0); s.closePath();
      var g = new T.ShapeGeometry(s); var m = new T.Mesh(g, finM); m.rotation.x = -PI / 2 + 0.12 + (1 - f.shape) * 0.18; m.position.set(x, 0.03, 0.12); V.finGroup.add(m);
      if (f.preset === 'split') { var cut = new T.Mesh(new T.PlaneGeometry(0.012, len * 0.55), new T.MeshBasicMaterial({ color: 0x0a1214 })); cut.rotation.x = -PI / 2 + 0.12; cut.position.set(x, 0.045, 0.12 + len * 0.72); V.finGroup.add(cut); }
    });
  }
  K.lockerRefresh = refreshGear;
  function render3D(dt) {
    if (!V.visible || !V.built) return;
    var host = V.canvas.parentElement; if (!host) return;
    var w = host.clientWidth, h = host.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (w < 2 || h < 2) return;
    if (V.canvas.width !== Math.round(w * dpr) || V.canvas.height !== Math.round(h * dpr)) { V.renderer.setPixelRatio(dpr); V.renderer.setSize(w, h, false); V.camera.aspect = w / h; V.camera.updateProjectionMatrix(); }
    if (!V.drag && !(K.data().settings.reduceMotion)) V.rot += dt * 0.45;
    V.rig.rotation.y = V.rot;
    V.renderer.render(V.scene, V.camera);
  }

  /* ------------------------------------------------------------------ */
  /* Tool panel                                                          */
  /* ------------------------------------------------------------------ */
  function swatches(cur, onPick, withCustom) {
    var wrap = TU.el('div', { className: 'ui-sw' });
    PALETTE.forEach(function (c) { var b = TU.el('button', { attrs: { 'aria-label': 'Color ' + c, title: c }, style: 'background:' + c }, wrap); if (c.toLowerCase() === String(cur).toLowerCase()) b.classList.add('ui-sel'); b.onclick = function () { onPick(c); }; });
    if (withCustom) { var inp = TU.el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#4ff2d0', attrs: { 'aria-label': 'Custom color' } }, wrap); inp.oninput = function () { onPick(inp.value, true); }; }
    return wrap;
  }
  function lbl(t, parent) { return TU.el('div', { className: 'ui-lk-lbl', text: t }, parent); }
  function chipRow(parent, items, cur, onPick) {
    var row = TU.el('div', { className: 'ui-lk-row' }, parent);
    items.forEach(function (it) { var b = TU.el('button', { className: 'ui-chip' + (it[0] === cur ? ' ui-sel' : ''), text: it[1] }, row); if (it[2]) b.disabled = true; b.onclick = function () { onPick(it[0]); }; });
    return row;
  }
  var finPending = null;
  function renderTools() {
    var host = $('ui-lk-toolbody'); if (!host) return;
    host.innerHTML = '';
    var lk = L(), Z = lk.suit.zones, c = $('ui-lk-tpl');
    if (c) c.style.cursor = ed.tab === 'paint' ? 'crosshair' : ed.tab === 'stickers' ? 'copy' : ed.tab === 'suit' ? 'pointer' : 'default';
    if (ed.tab === 'suit') {
      lbl('ZONE (or click the template)', host);
      chipRow(host, ZONES.map(function (z) { return [z[0], z[1]]; }), ed.zone, function (id) { ed.zone = id; renderTools(); });
      var zs = Z[ed.zone];
      lbl('BASE COLOR', host); host.appendChild(swatches(zs.c, function (col, live) { zs.c = col; drawBase(); composite(); K.write(); if (!live) renderTools(); }, true));
      lbl('PATTERN', host); chipRow(host, PATTERNS.map(function (p) { return [p, p]; }), zs.p, function (p) { zs.p = p; drawBase(); composite(); K.write(); renderTools(); });
      if (zs.p !== 'none') { lbl('PATTERN COLOR', host); host.appendChild(swatches(zs.pc, function (col, live) { zs.pc = col; drawBase(); composite(); K.write(); if (!live) renderTools(); }, true)); }
      var rr = TU.el('div', { className: 'ui-lk-row' }, host);
      TU.el('button', { className: 'ui-btn ui-ghost ui-small', text: 'Reset colors' }, rr).onclick = function () { lk.suit.zones = defaultZones(); drawBase(); composite(); K.write(); renderTools(); };
    } else if (ed.tab === 'stickers') {
      lbl('PICK A STICKER, THEN CLICK THE TEMPLATE', host);
      var row = TU.el('div', { className: 'ui-lk-row' }, host);
      STICKERS.forEach(function (s) {
        var locked = s[0] === 'kevin' && !K.data().kevin;
        var b = TU.el('button', { className: 'ui-stk' + (ed.sticker === s[0] ? ' ui-sel' : ''), attrs: { title: locked ? 'Kevin sticker: finish the practice hole' : s[1], 'aria-label': s[1] } }, row);
        b.disabled = locked;
        var cv = TU.el('canvas', { width: 46, height: 46 }, b); sticker(cv.getContext('2d'), s[0], 23, 23, 40, locked ? '#555' : '#E8E4D8');
        b.onclick = function () { ed.sticker = s[0]; renderTools(); };
      });
      lbl('STICKER COLOR', host); host.appendChild(swatches(ed.color, function (col) { ed.color = col; renderTools(); }, true));
      lbl('SIZE', host); var sr = TU.el('div', { className: 'ui-lk-row' }, host);
      var r = TU.el('input', { type: 'range', min: 16, max: 90, step: 1, value: ed.stickerSize, attrs: { 'aria-label': 'Sticker size' } }, sr); r.oninput = function () { ed.stickerSize = +r.value; };
      undoRow(host);
    } else if (ed.tab === 'paint') {
      lbl('BRUSH', host);
      chipRow(host, [['paint', 'Brush'], ['erase', 'Eraser']], ed.mode, function (m) { ed.mode = m; renderTools(); });
      lbl('COLOR', host); host.appendChild(swatches(ed.color, function (col) { ed.color = col; ed.mode = 'paint'; renderTools(); }, true));
      lbl('SIZE', host); var br = TU.el('div', { className: 'ui-lk-row' }, host);
      var r2 = TU.el('input', { type: 'range', min: 2, max: 40, step: 1, value: ed.size, attrs: { 'aria-label': 'Brush size' } }, br); r2.oninput = function () { ed.size = +r2.value; };
      undoRow(host);
    } else if (ed.tab === 'mask') {
      lbl('FRAME COLOR', host); host.appendChild(swatches(lk.mask.frame, function (col) { lk.mask.frame = col; K.write(); refreshGear(); renderTools(); }, true));
      lbl('STRAP COLOR', host); host.appendChild(swatches(lk.mask.strap, function (col) { lk.mask.strap = col; K.write(); refreshGear(); renderTools(); }, true));
      lbl('FRAME STYLE', host); chipRow(host, [['oval', 'Oval'], ['low', 'Low profile'], ['square', 'Square']], lk.mask.style, function (s) { lk.mask.style = s; K.write(); refreshGear(); renderTools(); });
      var lo = TU.save.data.loadout, mlv = TU.progress.level('mask');
      lbl('COMPONENTS', host);
      TU.el('p', { className: 'ui-note', style: 'margin-top:4px', html:
        'Glass: <b>' + (lo.mask === 'wide' ? 'Wide' : 'Clear') + '</b> · Seal: <b>' + (lo.mask === 'tight' ? 'Tight' : 'Normal') + '</b> · Lamp: <b>' + (lo.mask === 'headlamp' ? 'Headlamp' : 'None') + '</b> · HUD: <b>' + (mlv >= 5 ? 'Advanced' : 'Basic') + '</b><br>' +
        'Tinted glass is a found part: bring one back from the cave. Pick the mask type on the Gear Tarp.' }, host);
    } else if (ed.tab === 'fins') {
      var f = lk.fins; finPending = finPending || { preset: f.preset, shape: f.shape, width: f.width };
      lbl('PRESET (free to swap)', host);
      chipRow(host, K.FINS.map(function (x) { return [x.id, x.label]; }), f.preset, function (id) { K.setFin(id); finPending = null; refreshGear(); renderTools(); });
      var P = K.FINS.filter(function (x) { return x.id === f.preset; })[0] || K.FINS[0];
      TU.el('p', { className: 'ui-note', style: 'margin-top:0', text: P.desc }, host);
      function sl(key, label, lo2, hi2) {
        lbl(label, host); var row = TU.el('div', { className: 'ui-lk-row' }, host);
        TU.el('span', { className: 'ui-note', style: 'margin:0;min-width:56px', text: lo2 }, row);
        var r = TU.el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: finPending[key], attrs: { 'aria-label': label } }, row);
        TU.el('span', { className: 'ui-note', style: 'margin:0;min-width:56px;text-align:right', text: hi2 }, row);
        r.oninput = function () { finPending[key] = +r.value; finPending.preset = f.preset; refreshGear(finPending); stats(); };
      }
      sl('shape', 'SHAPE', 'Soft', 'Stiff'); sl('width', 'WIDTH', 'Narrow', 'Wide');
      var box = TU.el('div', {}, host);
      function stats() {
        var p = finPending, sp = P.speed * (1 + (p.width - 0.5) * 0.06 + (p.shape - 0.5) * 0.04), st = P.stamina * (1 - (p.width - 0.5) * 0.08 - (p.shape - 0.5) * 0.05);
        var cost = Math.ceil((Math.abs(p.shape - f.shape) + Math.abs(p.width - f.width)) * 10 - 1e-6);
        box.innerHTML = '<div class="ui-fin-stats"><div>SPEED<b>' + sp.toFixed(2) + 'x</b></div><div>STAMINA<b>' + st.toFixed(2) + 'x</b></div><div>COST<b>' + cost + ' FT</b></div></div>' +
          '<div class="ui-btnrow"><button class="ui-btn ui-small" id="ui-fin-apply"' + (cost <= 0 || K.fins() < cost ? ' disabled' : '') + '>Apply tuning</button><button class="ui-btn ui-ghost ui-small" id="ui-fin-revert">Revert</button></div>' +
          (cost > K.fins() ? '<p class="ui-note">You have ' + K.fins() + ' Fin Tokens. Earn them by reaching new zones, logging species and finishing contracts.</p>' : '');
        $('ui-fin-apply').onclick = function () { if (K.fins() < cost || cost <= 0) return; K.pay(0, -cost); f.shape = p.shape; f.width = p.width; K.setFin(f.preset); finPending = null; if (K.camp) K.camp.say('Fancy flippers. Still you inside them.'); refreshGear(); renderTools(); };
        $('ui-fin-revert').onclick = function () { finPending = null; refreshGear(); renderTools(); };
      }
      stats();
    }
  }
  function undoRow(host) {
    var r = TU.el('div', { className: 'ui-lk-row', style: 'margin-top:10px' }, host);
    TU.el('button', { className: 'ui-btn ui-ghost ui-small', text: 'Undo' }, r).onclick = function () { var im = undo.pop(); if (!im) return; paint.getContext('2d').putImageData(im, 0, 0); composite(); savePaint(); };
    TU.el('button', { className: 'ui-btn ui-danger ui-small', text: 'Clear paint and stickers' }, r).onclick = function () { pushUndo(); paint.getContext('2d').clearRect(0, 0, TW, TH); composite(); savePaint(); };
  }

  function render(root) {
    ensureCanvases(); loadPaint(); drawBase(); composite(); build3D();
    root.innerHTML = '<div class="ui-lk"><div class="ui-lk-ed"><canvas id="ui-lk-tpl" width="' + TW + '" height="' + TH + '" aria-label="Wetsuit template. Paint or stamp here."></canvas></div>' +
      '<div class="ui-lk-3d" id="ui-lk-3d"><small>DRAG TO SPIN</small></div></div><div class="ui-lk-tools" id="ui-lk-tabs"></div>';
    if (V.canvas) $('ui-lk-3d').insertBefore(V.canvas, $('ui-lk-3d').firstChild);
    else $('ui-lk-3d').innerHTML = '<small>3D preview unavailable</small>';
    drawEditor(); bindTemplate(); refreshGear();
    K.tabs($('ui-lk-tabs'), [
      { id: 'suit', label: 'SUIT COLORS', render: function (el) { ed.tab = 'suit'; el.id = 'ui-lk-toolbody'; renderTools(); } },
      { id: 'stickers', label: 'STICKERS', render: function (el) { ed.tab = 'stickers'; el.id = 'ui-lk-toolbody'; renderTools(); } },
      { id: 'paint', label: 'FREEHAND', render: function (el) { ed.tab = 'paint'; el.id = 'ui-lk-toolbody'; renderTools(); } },
      { id: 'mask', label: 'MASK', render: function (el) { ed.tab = 'mask'; el.id = 'ui-lk-toolbody'; renderTools(); } },
      { id: 'fins', label: 'FLIPPERS', render: function (el) { ed.tab = 'fins'; el.id = 'ui-lk-toolbody'; finPending = null; renderTools(); } }
    ], ed.tab);
    V.visible = true;
  }

  K.locker = {
    render: render,
    leave: function () { V.visible = false; if (finPending) { finPending = null; refreshGear(); } },
    tab: function (id) { ed.tab = id; var b = document.querySelector('#ui-lk-tabs .ui-tab[data-id="' + id + '"]'); if (b) b.click(); },
    stamp: function (id, x, y, size, color) { ensureCanvases(); pushUndo(); sticker(paint.getContext('2d'), id, x, y, size || 40, color || '#E8E4D8'); composite(); savePaint(); },
    stroke: function (pts, color, size) { ensureCanvases(); pushUndo(); var m = ed.mode, c = ed.color, s = ed.size; ed.mode = 'paint'; ed.color = color || '#FF8A3D'; ed.size = size || 8; for (var i = 1; i < pts.length; i++) stroke({ x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] }); ed.mode = m; ed.color = c; ed.size = s; savePaint(); },
    preview: function () { return V.built; }
  };
  K.part('locker', {
    frame: render3D,
    state: function (e) { if (e.to !== 'loadout') V.visible = false; }
  });
})();
