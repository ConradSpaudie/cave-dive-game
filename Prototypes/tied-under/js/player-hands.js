/*
 * player-hands.js: your own gloved hands and arms in first person.
 *
 * Everything here is built from simple shapes in code (no model files): neoprene gloves with
 * jointed fingers and a thumb, wetsuit forearm sleeves, the dive computer on the left wrist,
 * the primary light on a strap on the back of the left hand (or a mask headlamp), the BCD
 * inflator hose, the creature lantern, tape rolls, and the side-mount tanks you see when you
 * look down.
 *
 * The arms live in their own small scene (TU.fx.handScene) drawn by fx.js after the cave with
 * its own camera, so they never poke into the rock.
 *
 * How it animates (once per rendered frame):
 *   1. Pick a target pose for each hand (where the wrist is, which way the fingers point, which
 *      way the back of the hand faces, how curled the fingers are) from the movement mode:
 *      breaststroke sweeps synced to kicks, pulling along rock, pushing in a squeeze, walking.
 *   2. Blend in actions on top: grab the rock, inflator to the mouth, raise the wrist, tape a
 *      cut, blow out the mask, hold the lantern, climb a ledge, ragdoll.
 *   3. Smooth toward the target (hands lag a little, like real arms in water), add shaking from
 *      panic and cold, then solve a simple two-bone arm (shoulder, elbow, wrist) and place the meshes.
 * It writes TU.player.rig (camera space) so player.js can shine the flashlight from the visible torch.
 *
 * Owner: agent C.
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, N = TU.noise;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth, damp = U.damp;

  var scene, cam, built = false, time = 0;
  var hands = {}, body = {}, lights = {}, mats = {};
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };
  var tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), tmp3 = V(0, 0, 0), qInv = new T.Quaternion(), qYaw = new T.Quaternion(), mBasis = new T.Matrix4();
  var Y_AXIS = V(0, 1, 0);

  // Arm sizes (m) and shoulder spots in camera space (camera looks down -Z, +X right, +Y up).
  var L1 = 0.30, L2 = 0.29;
  var SHOULDER = { R: V(0.19, -0.3, 0.12), L: V(-0.19, -0.3, 0.12) };
  var POLE = { R: V(0.9, -0.7, 0.3).normalize(), L: V(-0.9, -0.7, 0.3).normalize() };

  /* ------------------------------------------------------------------ */
  /* Geometry helpers                                                    */
  /* ------------------------------------------------------------------ */
  // A capsule along -Z from z = 0 to z = -len (radius r0 at the start, r1 at the end).
  function capsule(r0, r1, len, radial) {
    var pts = [], i, n = 5;
    for (i = 0; i <= n; i++) { var a = -Math.PI / 2 + (i / n) * Math.PI / 2; pts.push(new T.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }
    for (i = 0; i <= n; i++) { var b = (i / n) * Math.PI / 2; pts.push(new T.Vector2(Math.max(1e-4, Math.cos(b) * r1), len + Math.sin(b) * r1)); }
    var g = new T.LatheGeometry(pts, radial || 10);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  // A limb along +Y from 0 to len with a radius profile [[t, r], ...] (t 0..1).
  function limb(profile, len, radial) {
    var pts = profile.map(function (p) { return new T.Vector2(p[1], p[0] * len); });
    return new T.LatheGeometry(pts, radial || 14);
  }
  // A box with rounded edges (corner radius r).
  function roundedBox(w, h, d, r, seg) {
    var g = new T.BoxGeometry(w, h, d, seg || 4, seg || 3, seg || 4), p = g.attributes.position, v = new T.Vector3(), c = new T.Vector3();
    var hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
      v.sub(c); if (v.lengthSq() > 1e-9) v.normalize().multiplyScalar(r);
      v.add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

 // The palm: a rounded block, narrower at the wrist, thinner at the knuckles, domed on the back.
  function palmGeo() {
    var g = roundedBox(0.084, 0.03, 0.09, 0.0125, 6), p = g.attributes.position, v = new T.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var k = clamp((0.045 - v.z) / 0.09, 0, 1); // 0 at the wrist, 1 at the knuckles
      v.x *= lerp(0.8, 1.0, k); v.y *= lerp(1.15, 0.85, k);
      if (v.y > 0) v.y += 0.005 * Math.max(0, 1 - Math.pow(v.x / 0.042, 2));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* Materials                                                           */
  /* ------------------------------------------------------------------ */
  function buildMaterials() {
    var neo = TU.tex.normalMap(128, 0.32, 1.3, 4.4); neo.wrapS = neo.wrapT = T.RepeatWrapping; neo.repeat.set(3, 3);
    // ribbed texture for the corrugated inflator hose
    var rib = TU.tex.canvas(16, 64, function (g, w, h) { for (var y = 0; y < h; y++) { var s = Math.sin(y / h * Math.PI * 16); var c = Math.round(128 + s * 90); g.fillStyle = 'rgb(128,' + c + ',255)'; g.fillRect(0, y, w, 1); } });
    rib.wrapS = rib.wrapT = T.RepeatWrapping; rib.repeat.set(1, 6);
    mats.glove = new T.MeshStandardMaterial({ color: 0x262b2f, roughness: 0.42, metalness: 0.0, normalMap: neo, normalScale: new T.Vector2(0.7, 0.7) });
    mats.palm = new T.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.75, metalness: 0.0, normalMap: neo, normalScale: new T.Vector2(1.2, 1.2) });
    mats.sleeve = new T.MeshStandardMaterial({ color: 0x14181b, roughness: 0.58, metalness: 0.0, normalMap: neo, normalScale: new T.Vector2(0.5, 0.5) });
    mats.stripe = new T.MeshStandardMaterial({ color: 0x1f6f69, roughness: 0.5, metalness: 0.0 });
    mats.seal = new T.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 0.35, metalness: 0.0 });
    mats.metal = new T.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.32, metalness: 0.75 });
    mats.steel = new T.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.28, metalness: 0.9 });
    mats.watch = new T.MeshStandardMaterial({ color: 0x0d1011, roughness: 0.4, metalness: 0.3 });
    mats.hose = new T.MeshStandardMaterial({ color: 0x111314, roughness: 0.45, metalness: 0.0, normalMap: rib, normalScale: new T.Vector2(1.4, 1.4) });
    mats.duct = new T.MeshStandardMaterial({ color: 0x8e9397, roughness: 0.68, metalness: 0.25 });
    mats.flex = new T.MeshStandardMaterial({ color: 0x151515, roughness: 0.3, metalness: 0.0 });
    mats.gash = new T.MeshStandardMaterial({ color: 0x5c0505, roughness: 0.25, metalness: 0.0, emissive: 0x1a0000 });
    mats.lens = new T.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
    mats.brass = new T.MeshStandardMaterial({ color: 0x8c7240, roughness: 0.38, metalness: 0.85 });
    mats.glass = new T.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false });
    mats.core = new T.MeshBasicMaterial({ color: 0x7fe8ff, toneMapped: false });
    mats.tank = new T.MeshStandardMaterial({ color: 0xa9aeb2, roughness: 0.4, metalness: 0.7 });
    mats.band = new T.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.7 });
  }

  /* ------------------------------------------------------------------ */
  /* Building one arm                                                    */
  /* ------------------------------------------------------------------ */
  var FINGERS = [ // x across the knuckles, segment lengths, radius (right hand; thumb is on -X)
    { x: -0.0285, l: [0.041, 0.026, 0.021], r: 0.0114, spread: -0.07 },
    { x: -0.0095, l: [0.045, 0.029, 0.022], r: 0.0117, spread: -0.02 },
    { x: 0.0098, l: [0.042, 0.027, 0.021], r: 0.0112, spread: 0.035 },
    { x: 0.0285, l: [0.034, 0.022, 0.019], r: 0.0102, spread: 0.09 }
  ];
  function buildHand(side) {
    var g = new T.Group();
    var palm = new T.Mesh(palmGeo(), mats.glove); palm.position.set(0, 0, -0.047); g.add(palm);
    var grip = new T.Mesh(roundedBox(0.07, 0.006, 0.06, 0.0025, 2), mats.palm); grip.position.set(0, -0.0155, -0.052); g.add(grip);
    FINGERS.forEach(function (F) { var kb = new T.Mesh(new T.SphereGeometry(F.r * 1.05, 10, 8), mats.glove); kb.scale.set(1, 0.8, 1.1); kb.position.set(F.x, 0.006, -0.088); g.add(kb); });
    // glove cuff over the sleeve
    var cuff = new T.Mesh(limb([[0, 0.034], [0.5, 0.037], [1, 0.039]], 0.05, 14), mats.glove); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.002; g.add(cuff);
    var strapCuff = new T.Mesh(new T.TorusGeometry(0.038, 0.004, 6, 18), mats.seal); strapCuff.position.z = 0.03; g.add(strapCuff);
    var fingers = [];
    FINGERS.forEach(function (F) {
      var piv = new T.Group(); piv.position.set(F.x, 0.002, -0.088); piv.rotation.y = F.spread; g.add(piv);
      var segs = [], parent = piv;
      for (var i = 0; i < 3; i++) {
        var j = new T.Group(); if (i > 0) j.position.z = -F.l[i - 1]; parent.add(j);
        var r0 = F.r * (1 - i * 0.08), r1 = F.r * (1 - (i + 1) * 0.08);
        var m = new T.Mesh(capsule(r0, r1, F.l[i], 9), mats.glove); j.add(m);
        segs.push(j); parent = j;
      }
      fingers.push({ segs: segs, base: piv });
    });
    // thumb: two segments from the side of the palm
    var tp = new T.Group(); tp.position.set(-0.04, -0.008, -0.03); tp.rotation.set(-0.25, 0.75, -0.5); g.add(tp);
    var t0 = new T.Mesh(capsule(0.0125, 0.0118, 0.034, 9), mats.glove); tp.add(t0);
    var tj = new T.Group(); tj.position.z = -0.034; tp.add(tj);
    var t1 = new T.Mesh(capsule(0.0118, 0.011, 0.028, 9), mats.glove); tj.add(t1);
    var thumbBase = new T.Mesh(new T.SphereGeometry(0.019, 10, 8), mats.glove); thumbBase.scale.set(1, 0.75, 1.3); thumbBase.position.set(-0.033, -0.006, -0.022); g.add(thumbBase);
    if (side === 'L') g.scale.x = -1; // mirror for the left hand
    return { group: g, fingers: fingers, thumb: [tp, tj] };
  }
  function buildArm(side) {
    var A = { side: side, sx: side === 'R' ? 1 : -1 };
    A.hand = buildHand(side);
    scene.add(A.hand.group);
    // forearm: +Y from the wrist (0) to the elbow (L2)
    A.fore = new T.Group(); scene.add(A.fore);
    A.foreMesh = new T.Mesh(limb([[0, 0.032], [0.12, 0.035], [0.5, 0.043], [0.85, 0.047], [1, 0.046]], L2, 18), mats.sleeve); A.fore.add(A.foreMesh);
    var seal = new T.Mesh(new T.TorusGeometry(0.034, 0.005, 6, 20), mats.seal); seal.rotation.x = Math.PI / 2; seal.position.y = 0.045; A.fore.add(seal);
    var stripe = new T.Mesh(limb([[0, 0.0475], [1, 0.0478]], 0.028, 18), mats.stripe); stripe.position.y = L2 * 0.72; A.fore.add(stripe);
    // a seam line along the top of the sleeve
    var seam = new T.Mesh(new T.BoxGeometry(0.004, L2 * 0.8, 0.003), mats.seal); seam.position.set(0, L2 * 0.5, 0.043); A.fore.add(seam);
    A.upper = new T.Group(); scene.add(A.upper);
    A.upperMesh = new T.Mesh(limb([[0, 0.046], [0.5, 0.052], [1, 0.055]], L1, 14), mats.sleeve); A.upper.add(A.upperMesh);
    var elbow = new T.Mesh(new T.SphereGeometry(0.048, 12, 10), mats.sleeve); A.upper.add(elbow);
    // cuts and tape patches on this forearm (shown when injured)
    A.marks = [];
    for (var i = 0; i < 3; i++) {
      var mk = new T.Group(); mk.visible = false; A.fore.add(mk);
      var gash = new T.Mesh(new T.SphereGeometry(1, 10, 6), mats.gash); gash.scale.set(0.006, 0.026, 0.004); gash.position.z = 0.04; gash.rotation.z = 0.35; mk.add(gash);
      var drip = new T.Mesh(new T.SphereGeometry(1, 8, 6), mats.gash); drip.scale.set(0.003, 0.012, 0.003); drip.position.set(0.012, -0.012, 0.041); mk.add(drip);
      var tapeBand = new T.Mesh(limb([[0, 0.0445], [0.5, 0.0455], [1, 0.0445]], 0.045, 18), mats.duct); tapeBand.position.y = -0.022; mk.add(tapeBand);
      A.marks.push({ g: mk, gash: gash, drip: drip, tape: tapeBand });
    }
    A.pose = { p: V(0, 0, 0), f: V(0, 0, -1), u: V(0, 1, 0), curl: 0.3, spread: 0, thumb: 0.3 };
    A.target = { p: V(0, 0, 0), f: V(0, 0, -1), u: V(0, 1, 0), curl: 0.3, spread: 0, thumb: 0.3 };
    A.elbow = V(0, 0, 0);
    A.crawl = { state: 'ready', t: 0, contact: V(0, 0, 0), from: V(0, 0, 0) };
    return A;
  }

  function buildProps() {
    var L = hands.L, R = hands.R;
    // primary light on a Goodman strap on the back of the left hand
    var torch = new T.Group();
    var head = new T.Mesh(new T.CylinderGeometry(0.023, 0.021, 0.085, 18), mats.metal); head.rotation.x = Math.PI / 2; torch.add(head);
    var bezel = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.014, 18), mats.steel); bezel.rotation.x = Math.PI / 2; bezel.position.z = -0.046; torch.add(bezel);
    var fins = new T.Mesh(new T.CylinderGeometry(0.0235, 0.0235, 0.022, 8), mats.metal); fins.rotation.x = Math.PI / 2; fins.position.z = 0.03; torch.add(fins);
    var lens = new T.Mesh(new T.CircleGeometry(0.02, 18), mats.lens); lens.position.z = -0.0535; lens.rotation.y = Math.PI; torch.add(lens);
    var glow = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0xfff0d0, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.setScalar(0.08); glow.position.z = -0.06; torch.add(glow);
    var mount = new T.Mesh(roundedBox(0.03, 0.012, 0.05, 0.004, 2), mats.seal); mount.position.set(0, -0.022, 0.0); torch.add(mount);
    torch.position.set(0, 0.04, -0.062);
    L.hand.group.add(torch);
    // the Goodman strap around the palm
    var strap = new T.Mesh(new T.TorusGeometry(0.046, 0.0045, 6, 24), mats.seal); strap.scale.set(1, 0.42, 1); strap.position.set(0, 0.0, -0.05); L.hand.group.add(strap);
    L.torch = torch; L.lens = lens; L.glow = glow;
    // dive computer on the left wrist, on the back of the forearm
    var watch = new T.Group();
    var wbody = new T.Mesh(roundedBox(0.05, 0.05, 0.016, 0.008, 3), mats.watch); watch.add(wbody);
    var bez = new T.Mesh(new T.TorusGeometry(0.022, 0.0035, 6, 24), mats.steel); bez.position.z = 0.008; watch.add(bez);
    var wc = document.createElement('canvas'); wc.width = 128; wc.height = 128;
    var wtex = new T.CanvasTexture(wc);
    var screen = new T.Mesh(new T.CircleGeometry(0.019, 24), new T.MeshBasicMaterial({ map: wtex, toneMapped: false }));
    screen.position.z = 0.0085; screen.rotation.z = -Math.PI / 2; watch.add(screen);
    var wstrap = new T.Mesh(limb([[0, 0.0405], [1, 0.0405]], 0.024, 18), mats.seal); wstrap.rotation.x = -Math.PI / 2; wstrap.position.set(0, 0.012, -0.044); watch.add(wstrap);
    watch.position.set(0, 0.075, 0.046);
    L.fore.add(watch);
    L.watch = watch; L.watchCanvas = wc; L.watchTex = wtex; L.watchT = 0;
    lights.watch = new T.PointLight(0x4ff2d0, 0.0, 0.28, 2); scene.add(lights.watch);
    // BCD inflator hose: segments from the left shoulder up to the hand
    var hose = []; for (var i = 0; i < 9; i++) { var s = new T.Mesh(new T.CylinderGeometry(0.0105, 0.0105, 1, 8, 1, true), mats.hose); s.visible = false; scene.add(s); hose.push(s); }
    var inflHead = new T.Group();
    var ih = new T.Mesh(roundedBox(0.026, 0.05, 0.026, 0.006, 2), mats.metal); inflHead.add(ih);
    var btn = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.008, 10), mats.stripe); btn.position.set(0, 0.02, 0.012); btn.rotation.x = Math.PI / 2; inflHead.add(btn);
    var mouthPc = new T.Mesh(new T.CylinderGeometry(0.009, 0.011, 0.02, 10), mats.seal); mouthPc.position.y = 0.033; inflHead.add(mouthPc);
    inflHead.visible = false; scene.add(inflHead);
    body.hose = hose; body.inflHead = inflHead;
    // creature lantern (right hand)
    var lan = new T.Group();
    var bail = new T.Mesh(new T.TorusGeometry(0.03, 0.0025, 6, 16, Math.PI), mats.brass); bail.position.y = 0.0; lan.add(bail);
    var top = new T.Mesh(new T.CylinderGeometry(0.018, 0.036, 0.02, 14), mats.brass); top.position.y = -0.035; lan.add(top);
    var bottom = new T.Mesh(new T.CylinderGeometry(0.038, 0.034, 0.014, 14), mats.brass); bottom.position.y = -0.135; lan.add(bottom);
    for (var r = 0; r < 4; r++) { var rod = new T.Mesh(new T.CylinderGeometry(0.0022, 0.0022, 0.1, 5), mats.brass); var a = r / 4 * Math.PI * 2 + 0.4; rod.position.set(Math.cos(a) * 0.034, -0.085, Math.sin(a) * 0.034); lan.add(rod); }
    var glass = new T.Mesh(new T.CylinderGeometry(0.031, 0.031, 0.095, 16, 1, true), mats.glass); glass.position.y = -0.085; lan.add(glass);
    var core = new T.Mesh(new T.SphereGeometry(0.016, 12, 10), mats.core); core.position.y = -0.085; lan.add(core);
    var cglow = new T.Sprite(new T.SpriteMaterial({ map: TU.tex.get('glow'), color: 0x7fe8ff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    cglow.scale.setScalar(0.16); cglow.position.y = -0.085; lan.add(cglow);
    lan.visible = false; scene.add(lan);
    body.lantern = lan; body.lanternCore = core; body.lanternGlow = cglow;
    lights.lantern = new T.PointLight(0x7fe8ff, 0, 1.2, 1.6); scene.add(lights.lantern);
    // tape roll in the right hand while taping, and the strip going onto the arm
    var roll = new T.Mesh(new T.TorusGeometry(0.022, 0.009, 8, 18), mats.duct); roll.visible = false; scene.add(roll);
    var strip = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: 0x8e9397, roughness: 0.6, side: T.DoubleSide })); strip.visible = false; scene.add(strip);
    body.roll = roll; body.strip = strip;
    // measuring tape: a yellow case in the right hand, the blade sticking out ahead
    var mt = new T.Group();
    var mcase = new T.Mesh(roundedBox(0.05, 0.05, 0.028, 0.008, 2), new T.MeshStandardMaterial({ color: 0xd9a400, roughness: 0.5 })); mt.add(mcase);
    var blade = new T.Mesh(new T.BoxGeometry(0.016, 0.002, 1), new T.MeshStandardMaterial({ color: 0xe8d36a, roughness: 0.4, metalness: 0.3 })); blade.position.set(0, -0.018, -0.5); mt.add(blade);
    mt.visible = false; scene.add(mt); body.mtape = mt; body.blade = blade;
    // torso frame with side-mount tanks (you see them when you look down)
    var torso = new T.Group(); scene.add(torso);
    var trim = new T.Group(); torso.add(trim);
    body.tanks = [];
    [[0.25, 1], [-0.25, -1], [0.0, 0]].forEach(function (s, i) {
      var tk = new T.Group();
      var cyl = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 0.62, 18), mats.tank); tk.add(cyl);
      var dome = new T.Mesh(new T.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.tank); dome.position.y = 0.31; tk.add(dome);
      var valve = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, 0.08, 10), mats.metal); valve.position.y = 0.39; tk.add(valve);
      var band = new T.Mesh(new T.CylinderGeometry(0.089, 0.089, 0.04, 18, 1, true), mats.band); band.position.y = -0.1; tk.add(band);
      if (i === 2) tk.position.set(0, -0.32, 0.2); else tk.position.set(s[0], -0.5, 0.03);
      tk.rotation.z = -s[1] * 0.06;
      trim.add(tk); body.tanks.push(tk);
    });
    body.torso = torso; body.trim = trim;
  }

  function build() {
    scene = TU.fx.handScene; cam = TU.fx.handCamera;
    if (!scene || !cam) return;
    buildMaterials();
    hands.R = buildArm('R'); hands.L = buildArm('L');
    buildProps();
    lights.hemi = new T.HemisphereLight(0x9cc8cc, 0x1a1410, 0.2); scene.add(lights.hemi);
    lights.fill = new T.DirectionalLight(0xffe2c0, 0.0); lights.fill.position.set(0.1, 0.2, -1); scene.add(lights.fill, lights.fill.target);
    lights.spill = new T.PointLight(0xfff0d8, 0.0, 0.45, 2); scene.add(lights.spill);
    lights.shock = new T.PointLight(0xbfe6ff, 0.0, 1.5, 2); lights.shock.position.set(0, 0, -0.4); scene.add(lights.shock);
    built = true;
  }

  /* ------------------------------------------------------------------ */
  /* Poses                                                               */
  /* ------------------------------------------------------------------ */
  function setP(o, px, py, pz, fx, fy, fz, ux, uy, uz, curl, spread, thumb) {
    o.p.set(px, py, pz); o.f.set(fx, fy, fz).normalize(); o.u.set(ux, uy, uz).normalize();
    o.curl = curl; o.spread = spread || 0; o.thumb = thumb == null ? curl : thumb; return o;
  }
  function newPose() { return { p: V(0, 0, 0), f: V(0, 0, -1), u: V(0, 1, 0), curl: 0.3, spread: 0, thumb: 0.3 }; }
  function copyPose(o, a) { o.p.copy(a.p); o.f.copy(a.f); o.u.copy(a.u); o.curl = a.curl; o.spread = a.spread; o.thumb = a.thumb; return o; }
  function blendPose(o, b, w) {
    if (w <= 0.001) return o;
    o.p.lerp(b.p, w); o.f.lerp(b.f, w).normalize(); o.u.lerp(b.u, w).normalize();
    o.curl = lerp(o.curl, b.curl, w); o.spread = lerp(o.spread, b.spread, w); o.thumb = lerp(o.thumb, b.thumb, w); return o;
  }
  function mirror(o) { o.p.x = -o.p.x; o.f.x = -o.f.x; o.u.x = -o.u.x; return o; }

  // Breaststroke sweep keyframes for the right hand (the left one is mirrored).
  var STROKE = [
    { t: 0.00, p: [0.12, -0.17, -0.56], f: [0.08, 0.06, -1], u: [0, 1, 0.1], c: 0.15 },
    { t: 0.30, p: [0.37, -0.2, -0.45], f: [0.55, 0.0, -0.83], u: [-0.75, 0.62, 0], c: 0.2 },
    { t: 0.55, p: [0.33, -0.33, -0.24], f: [0.2, -0.75, -0.6], u: [-0.2, 0.55, -0.8], c: 0.32 },
    { t: 0.80, p: [0.15, -0.26, -0.32], f: [0.05, -0.15, -1], u: [0, 1, 0], c: 0.35 },
    { t: 1.00, p: [0.12, -0.17, -0.56], f: [0.08, 0.06, -1], u: [0, 1, 0.1], c: 0.15 }
  ];
  var kA = newPose(), kB = newPose();
  function strokePose(o, ph) {
    ph = ((ph % 1) + 1) % 1;
    var i = 0; while (i < STROKE.length - 2 && ph > STROKE[i + 1].t) i++;
    var a = STROKE[i], b = STROKE[i + 1], w = smooth(a.t, b.t, ph);
    setP(kA, a.p[0], a.p[1], a.p[2], a.f[0], a.f[1], a.f[2], a.u[0], a.u[1], a.u[2], a.c, 0.05);
    setP(kB, b.p[0], b.p[1], b.p[2], b.f[0], b.f[1], b.f[2], b.u[0], b.u[1], b.u[2], b.c, 0.05);
    copyPose(o, kA); return blendPose(o, kB, w);
  }

  // World point -> hand camera space (the hand scene uses camera space directly).
  function toCam(out, world) { qInv.copy(TU.camera.quaternion).invert(); return out.copy(world).sub(TU.camera.position).applyQuaternion(qInv); }
  function toWorld(out, camPt) { return out.copy(camPt).applyQuaternion(TU.camera.quaternion).add(TU.camera.position); }

  var W = { measure: 0, stroke: 0, crawl: 0, squeeze: 0, walk: 0, rag: 0, grab: 0, inflate: 0, wrist: 0, tape: 0, mask: 0, lantern: 0, climb: 0, aim: 1 };
  // Arm stroke tempo: normal seconds per stroke, and the most sprinting may speed it up.
  var STROKE_BASE_PERIOD = 0.82, STROKE_MAX_SPEEDUP = 1.25;
  var strokeRate = 1 / STROKE_BASE_PERIOD, strokePhaseFix = 0;
  var strokeT = 0, lastKick = 0, lastPull = 0, pullSide = 0, ragSeed = 0, lastRunT = null, lastRunTWasNull = true;
  var pBase = { R: newPose(), L: newPose() }, pTmp = newPose(), pOv = newPose();
  var wpn = null; // this frame's weapon hold from TU.weapons.pose() (null when no weapon is out)

  function poseFor(A, dt) {
    var P = TU.player.state, AN = P.anim, sx = A.sx, side = A.side, o = A.target, t = time;
    var head = P.headlamp, leftLight = !head && side === 'L';
    // ---- base: idle tread ----
    var br = Math.sin((P.breathPhase || 0) * Math.PI * 2) * 0.006;
    if (side === 'R') setP(o, 0.24, -0.25 + br, -0.44, 0.1, 0.02, -1, -0.28, 0.96, 0.05, 0.26, 0.25, 0.2);
    else if (leftLight) setP(o, 0.22, -0.215 + br, -0.46, 0.04, 0.09, -1, -0.04, 1, 0.08, 0.86, 0.0, 0.7);
    else setP(o, 0.24, -0.26 + br, -0.43, 0.06, 0.04, -1, 0.05, 1, 0.05, 0.38, 0.08);
    if (side === 'L') mirror(o);
    // idle drift
    o.p.x += N.n3(t * 0.3, side === 'R' ? 1 : 7, 0) * 0.012; o.p.y += N.n3(t * 0.25, side === 'R' ? 3 : 9, 1) * 0.01;
    // ---- swim strokes, synced to kicks ----
    if (W.stroke > 0.01) {
      strokePose(pTmp, strokeT + (side === 'L' ? 0.0 : 0.0));
      if (side === 'L') mirror(pTmp);
      // a hand holding a weapon only follows a little of the stroke (it keeps the weapon pointed ahead)
      var holdW = side === 'R' && wpn ? 1 - 0.85 * wpn.w : 1;
      blendPose(o, pTmp, W.stroke * (leftLight ? 0.4 : 0.85) * holdW);
      if (leftLight) { o.f.lerp(V(0.02, 0.08, -1), 0.6).normalize(); o.curl = lerp(o.curl, 0.86, 0.8); }
    }
    // ---- crawl: pull along the rock, hands planted in the world ----
    if (W.crawl > 0.01) {
      var C = A.crawl, interval = AN.crawlInterval || 1;
      var front = setP(pTmp, sx * 0.17, -0.235, -0.55, sx * 0.08, -0.35, -0.93, 0, 0.93, -0.35, 0.35, 0.12);
      if (C.state === 'grip') {
        C.t += dt;
        toCam(pOv.p, C.contact);
        setP(pOv, pOv.p.x, pOv.p.y, pOv.p.z, sx * 0.05, -0.5, -0.86, 0, 0.86, -0.5, 0.95, 0.05);
        if (pOv.p.z > -0.18 || C.t > interval * 0.7) { C.state = 'return'; C.t = 0; C.from.copy(pOv.p); }
        blendPose(o, pOv, W.crawl);
      } else if (C.state === 'return') {
        C.t += dt;
        var rw = smooth(0, interval * 0.45, C.t);
        copyPose(pOv, front); pOv.p.lerpVectors(C.from, front.p, rw); pOv.p.y += Math.sin(Math.PI * rw) * 0.05; pOv.curl = lerp(0.9, 0.3, rw);
        if (rw >= 1) C.state = 'ready';
        blendPose(o, pOv, W.crawl);
      } else blendPose(o, front, W.crawl);
      if (leftLight && C.state !== 'grip') o.f.lerp(V(-0.03, 0.0, -1), 0.5).normalize();
    }
    // ---- squeeze: both hands pressed on the rock ahead, pushing and wiggling ----
    if (W.squeeze > 0.01) {
      var push = AN.squeezePush ? Math.sin(t * 6.5 + (side === 'L' ? 1.6 : 0)) : 0;
      setP(pTmp, sx * 0.15 + (AN.wiggle || 0) * 0.04, -0.12 + (side === 'L' ? 0.015 : 0) + (AN.wiggle || 0) * sx * 0.012, -0.47 + push * 0.045, sx * 0.25, 0.6, -0.76, sx * 0.08, 0.22, 0.97, 0.18, 0.18, 0.1);
      blendPose(o, pTmp, W.squeeze);
    }
    // ---- walking on dry rock ----
    if (W.walk > 0.01) {
      var wp = (AN.walkPhase || 0) * Math.PI * 2 * 2, sw = Math.sin(wp + (side === 'L' ? Math.PI : 0)) * clamp((AN.moveSpeed || 0) / 2, 0, 1);
      if (leftLight) setP(pTmp, -0.2, -0.2 + Math.abs(sw) * 0.01, -0.46, 0.0, 0.0, -1, 0, 1, 0, 0.86, 0, 0.7);
      else { setP(pTmp, 0.25, -0.28 + Math.abs(sw) * 0.015, -0.4 + sw * 0.06, 0.1, -0.55, -0.83, 0.95, 0.25, 0.05, 0.45); if (side === 'L') mirror(pTmp); }
      blendPose(o, pTmp, W.walk);
    }
    // ---- weapon held in the right hand (weapons.js says where: hip, aimed, firing, reloading) ----
    // The left hand keeps the torch, except when weapons.js asks for help (loading a speargun).
    if (wpn && wpn.w > 0.01) {
      var wp = side === 'R' ? wpn : wpn.left;
      if (wp && (wp.w == null || wp.w > 0.01)) {
        setP(pOv, wp.p.x, wp.p.y, wp.p.z, wp.f.x, wp.f.y, wp.f.z, wp.u.x, wp.u.y, wp.u.z, wp.curl, wp.spread || 0, wp.thumb == null ? wp.curl : wp.thumb);
        // the swim rhythm still rocks the weapon a little (kicks move the whole body)
        var bobW = W.stroke * (1 - 0.7 * (wpn.steady || 0));
        pOv.p.y += Math.sin(strokeT * Math.PI * 2) * 0.012 * bobW; pOv.p.x += Math.sin(strokeT * Math.PI * 2 + 1.2) * 0.008 * bobW;
        blendPose(o, pOv, wpn.w * (wp.w == null ? 1 : wp.w));
      }
    }
    // ---- action overlays ----
    if (side === 'R') {
      if (W.measure > 0.01) { setP(pOv, 0.13, -0.14, -0.5, 0.0, 0.06, -1, 0, 1, 0, 0.82, 0, 0.6); blendPose(o, pOv, W.measure); }
      if (W.lantern > 0.01) { setP(pOv, 0.19, -0.15, -0.5, 0.04, -0.18, -1, 0, 1, -0.16, 1.0, 0, 0.9); blendPose(o, pOv, W.lantern); }
      if (W.grab > 0.01 && AN.grab) {
        toCam(pOv.p, AN.grab);
        tmp.copy(pOv.p).sub(SHOULDER.R); var d = tmp.length(); if (d > (L1 + L2) * 0.97) pOv.p.copy(SHOULDER.R).addScaledVector(tmp.normalize(), (L1 + L2) * 0.97);
        if (pOv.p.z > -0.25) pOv.p.z = -0.25;
        tmp2.copy(AN.grabNormal || Y_AXIS).applyQuaternion(qInv.copy(TU.camera.quaternion).invert());
        var fx = tmp.copy(pOv.p).normalize();
        setP(pOv, pOv.p.x, pOv.p.y, pOv.p.z, fx.x, fx.y, fx.z, tmp2.x, tmp2.y, tmp2.z, 0.95, 0.15, 0.9);
        if (AN.tug) { pOv.p.x += N.n3(t * 12, 3, 3) * 0.012; pOv.p.z += (AN.jolt || 0) * 0.04; }
        blendPose(o, pOv, W.grab);
      }
      if (W.mask > 0.01) { setP(pOv, 0.15, 0.13, -0.32, -0.3, 0.92, -0.2, 0.05, 0.25, -0.97, 0.12, 0.2, 0.2); blendPose(o, pOv, W.mask); }
      if (W.tape > 0.01) {
        var tp = clamp(AN.tape, 0, 1), ang = tp * Math.PI * 4;
        var cx = -0.1 + tp * 0.03, cy = -0.215, cz = -0.34;
        setP(pOv, cx + 0.03, cy + Math.cos(ang) * 0.06, cz + Math.sin(ang) * 0.06, -1, 0.05, -0.1, 0, Math.cos(ang), Math.sin(ang), 0.62, 0, 0.7);
        blendPose(o, pOv, W.tape);
      }
    } else {
      if (W.inflate > 0.01) { setP(pOv, -0.1, -0.15, -0.26, 0.75, 0.55, -0.3, -0.5, 0.55, -0.65, 0.82, 0, 0.5); blendPose(o, pOv, W.inflate); }
      if (W.wrist > 0.01) { setP(pOv, 0.035, -0.12, -0.36, 1, 0.12, 0.14, 0, 0.62, 0.79, 0.5, 0.05, 0.4); blendPose(o, pOv, W.wrist); }
      if (W.tape > 0.01) { setP(pOv, 0.0, -0.2, -0.37, 1, 0.02, 0.18, 0, 0.78, 0.63, 0.6, 0.05, 0.5); blendPose(o, pOv, W.tape); }
    }
    // ---- climbing out onto a ledge: both hands planted, then pressing down ----
    if (W.climb > 0.01) {
      var ct = AN.climb >= 0 ? AN.climb : 1;
      setP(pOv, sx * 0.19, -0.2 - ct * 0.14, -0.44 + ct * 0.1, sx * 0.1, -0.35, -0.93, 0, 0.93, -0.35, 0.3, 0.2);
      blendPose(o, pOv, W.climb);
    }
    // ---- ragdoll: flailing, then slumped low ----
    if (W.rag > 0.01) {
      var fl = P.rag || 1;
      setP(pOv, sx * (0.28 + N.n3(t * 3, ragSeed, side === 'R' ? 1 : 2) * 0.15), -0.3 + N.n3(t * 3.4, ragSeed + 4, side === 'R' ? 5 : 6) * 0.18, -0.35 + N.n3(t * 2.6, ragSeed + 8, 1) * 0.12, sx * 0.4, -0.3, -0.8, sx * -0.4, 0.8, 0.2, 0.5 + N.n3(t * 5, 1, ragSeed) * 0.4, 0.3);
      if (fl > 0.9 && P.anim.ragdoll) pOv.p.y -= 0.12;
      blendPose(o, pOv, W.rag);
    }
    // ---- maimed side: weaker, droops ----
    if (P.maimed === (side === 'R' ? 'right' : 'left')) { o.p.y -= 0.04; o.curl *= 0.6; }
  }

  /* ------------------------------------------------------------------ */
  /* Solving and placing an arm                                          */
  /* ------------------------------------------------------------------ */
  var basisX = V(0, 0, 0), basisY = V(0, 0, 0), basisZ = V(0, 0, 0);
  // Orient a group so local -Z = f (fingers) and local +Y = u (back of the hand).
  function orientHand(g, f, u) {
    basisZ.copy(f).multiplyScalar(-1).normalize();
    basisY.copy(u).addScaledVector(basisZ, -u.dot(basisZ)).normalize();
    basisX.crossVectors(basisY, basisZ);
    mBasis.makeBasis(basisX, basisY, basisZ);
    g.quaternion.setFromRotationMatrix(mBasis);
  }
  // Orient a limb group so local +Y runs from a to b, with local +Z toward 'side' (roll).
  function orientLimb(g, a, b, sideDir) {
    basisY.subVectors(b, a); var len = basisY.length(); basisY.divideScalar(len || 1);
    basisZ.copy(sideDir).addScaledVector(basisY, -sideDir.dot(basisY));
    if (basisZ.lengthSq() < 1e-6) basisZ.set(0, 0, 1); basisZ.normalize();
    basisX.crossVectors(basisY, basisZ);
    mBasis.makeBasis(basisX, basisY, basisZ);
    g.quaternion.setFromRotationMatrix(mBasis);
    g.position.copy(a);
    return len;
  }
  function solveElbow(A, wrist) {
    var S = SHOULDER[A.side];
    tmp.subVectors(wrist, S); var d = tmp.length();
    var dmax = (L1 + L2) * 0.995;
    if (d > dmax) { wrist.copy(S).addScaledVector(tmp, dmax / d); d = dmax; tmp.subVectors(wrist, S); }
    d = Math.max(d, 0.08);
    var axis = tmp2.copy(tmp).normalize();
    var cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    var perp = tmp3.copy(POLE[A.side]).addScaledVector(axis, -POLE[A.side].dot(axis)).normalize();
    A.elbow.copy(S).addScaledVector(axis, L1 * cosA).addScaledVector(perp, L1 * sinA);
  }
  function placeArm(A, dt) {
    var P = TU.player.state, o = A.pose, t = A.target, rate = 13;
    if (P.maimed === (A.side === 'R' ? 'right' : 'left')) rate = 7;
    o.p.x = damp(o.p.x, t.p.x, rate, dt); o.p.y = damp(o.p.y, t.p.y, rate, dt); o.p.z = damp(o.p.z, t.p.z, rate, dt);
    o.f.lerp(t.f, 1 - Math.exp(-rate * dt)).normalize(); o.u.lerp(t.u, 1 - Math.exp(-rate * dt)).normalize();
    o.curl = damp(o.curl, t.curl, 10, dt); o.spread = damp(o.spread, t.spread, 10, dt); o.thumb = damp(o.thumb, t.thumb, 10, dt);
    // shaky hands: panic, cold, shocks, quakes
    var sh = 0.0012 + smooth(40, 100, P.panic) * 0.006 + (P.cold || 0) * 0.004 + (P.shock || 0) * 0.02 + (P.quake || 0) * 0.006;
    if (A.side === 'R' && wpn) sh *= 1 - 0.6 * (wpn.steady || 0) * wpn.w; // aiming (right mouse) steadies the weapon hand
    var wr = tmp3.copy(o.p);
    wr.x += N.n3(time * 11, A.sx * 3, 1) * sh; wr.y += N.n3(time * 12, A.sx * 5, 2) * sh; wr.z += N.n3(time * 10, A.sx * 7, 3) * sh * 0.6;
    var wrist = A.wristPos || (A.wristPos = V(0, 0, 0)); wrist.copy(wr);
    solveElbow(A, wrist);
    // hand
    var hg = A.hand.group;
    hg.position.copy(wrist);
    orientHand(hg, o.f, o.u);
    if (A.side === 'L') hg.scale.set(-1, 1, 1);
    // fingers
    var c = clamp(o.curl, 0, 1);
    for (var i = 0; i < A.hand.fingers.length; i++) {
      var F = A.hand.fingers[i], ci = clamp(c + (i - 1.5) * 0.04, 0, 1);
      F.segs[0].rotation.x = -ci * 1.45; F.segs[1].rotation.x = -ci * 1.6; F.segs[2].rotation.x = -ci * 1.1;
      F.base.rotation.y = FINGERS[i].spread * (1 + o.spread * 3);
    }
    A.hand.thumb[0].rotation.set(-0.25 - o.thumb * 0.35, 0.75 - o.thumb * 0.55, -0.5 - o.thumb * 0.4);
    A.hand.thumb[1].rotation.x = -o.thumb * 0.9;
    // forearm (wrist to elbow), rolled so its top side matches the back of the hand
    orientLimb(A.fore, wrist, A.elbow, o.u);
    orientLimb(A.upper, A.elbow, SHOULDER[A.side], o.u);
  }

  /* ------------------------------------------------------------------ */
  /* Props and per-frame details                                         */
  /* ------------------------------------------------------------------ */
  function drawWatch(P) {
    var L = hands.L, g = L.watchCanvas.getContext('2d'), w = 128;
    g.clearRect(0, 0, w, w);
    var bg = g.createRadialGradient(64, 64, 10, 64, 64, 64); bg.addColorStop(0, '#05221f'); bg.addColorStop(1, '#010807');
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(79,242,208,.55)'; g.lineWidth = 3;
    var airF = P.airTotalMax > 0 ? P.airTotal / P.airTotalMax : 0;
    g.beginPath(); g.arc(64, 64, 56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * airF); g.stroke();
    g.fillStyle = '#9ffff0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 34px "Share Tech Mono", ui-monospace, monospace'; g.fillText((P.depth || 0).toFixed(1), 64, 58);
    g.font = '600 15px "Share Tech Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(159,255,240,.75)'; g.fillText('M', 64, 82);
    g.fillText(Math.round(P.air || 0) + ' BAR', 64, 100);
    g.fillText(TU.util.fmtTime(TU.run ? TU.run.t : 0), 64, 30);
    if (P.airTotal < TU.cfg.air.lowAir && (time * 2 | 0) % 2) { g.fillStyle = '#FF5A4F'; g.beginPath(); g.arc(64, 112, 4, 0, Math.PI * 2); g.fill(); }
    L.watchTex.needsUpdate = true;
  }
  function hoseUpdate(on) {
    var segs = body.hose, head = body.inflHead;
    if (!on) { segs.forEach(function (s) { s.visible = false; }); head.visible = false; return; }
    var L = hands.L, hg = L.hand.group;
    // inflator head sits in the left palm
    tmp.set(0, -0.022, -0.05); hg.localToWorld(tmp);
    head.position.copy(tmp); head.quaternion.copy(hg.quaternion); head.rotateX(Math.PI / 2); head.visible = true;
    var a = V(-0.2, -0.24, 0.05), b = tmp.clone(), ctrl = V(-0.24, -0.08, -0.08);
    var prev = a.clone(), n = segs.length;
    for (var i = 1; i <= n; i++) {
      var s = i / n, u = 1 - s;
      var p = V(u * u * a.x + 2 * u * s * ctrl.x + s * s * b.x, u * u * a.y + 2 * u * s * ctrl.y + s * s * b.y, u * u * a.z + 2 * u * s * ctrl.z + s * s * b.z);
      var m = segs[i - 1], len = p.distanceTo(prev);
      m.position.copy(prev).add(p).multiplyScalar(0.5);
      tmp2.subVectors(p, prev).normalize(); m.quaternion.setFromUnitVectors(Y_AXIS, tmp2);
      m.scale.set(1, len * 1.05, 1); m.visible = true;
      prev.copy(p);
    }
  }
  function marksUpdate(P) {
    var bySide = { left: [], right: [] };
    (P.injuries || []).forEach(function (j) { if (j.type === 'cut' && bySide[j.side]) bySide[j.side].push(j); });
    ['R', 'L'].forEach(function (s) {
      var A = hands[s], list = bySide[s === 'R' ? 'right' : 'left'];
      for (var i = 0; i < A.marks.length; i++) {
        var mk = A.marks[i], j = list[i];
        if (!j) { mk.g.visible = false; continue; }
        mk.g.visible = true; mk.g.position.y = L2 * (0.32 + i * 0.17);
        // the back of the sleeve is +Z; cuts wrap around a bit
        mk.g.rotation.y = (i - 1) * 0.5;
        var sc = 0.6 + j.severity * 0.8; mk.gash.scale.set(0.006 * sc, 0.026 * sc, 0.004);
        mk.drip.visible = !j.taped && P.inWater !== false;
        mk.drip.position.y = -0.012 - ((time * 0.02 + i * 0.3) % 0.02);
        mk.tape.visible = !!j.taped; mk.tape.material = j.tape === 'flex' ? mats.flex : mats.duct;
      }
    });
  }

  var FILL_DEF = new T.Color(0xffe2c0), ROCK_TINT = new T.Color(0x9a8f80); // reused every frame (no allocations)
  function frame(dt) {
    if (!built) { build(); if (!built) return; }
    var st = TU.state.current;
    var show = st === 'dive' || st === 'paused' || st === 'tutorial' || st === 'dead' || st === 'results';
    scene.visible = show;
    if (!show) return;
    // Use simulation time when it moved further than this frame (tests step the game without drawing),
    // so one drawn frame always shows a settled pose.
    var rt = TU.run ? TU.run.t : null;
    var simDt = rt != null && lastRunT != null ? rt - lastRunT : 0; lastRunT = rt;
    if (simDt < 0 || (rt != null && lastRunTWasNull)) simDt = 0.5; // a new dive started: snap to the new pose
    lastRunTWasNull = rt == null;
    dt = clamp(Math.max(dt || 1 / 60, simDt), 0, 0.5);
    time += dt;
    var P = TU.player.state, AN = P.anim, mode = P.mode;
    if (TU.state.is('paused')) dt = 0.0001;
    // ---- stroke clock: a steady rhythm that follows the kicks without snapping ----
    // The arms keep their own smooth tempo. Sprinting speeds it up a little (at most
    // STROKE_MAX_SPEEDUP times the normal pace), and each kick only nudges the phase
    // toward the start of a stroke instead of restarting it, so nothing jerks.
    var period = Math.max(STROKE_BASE_PERIOD / STROKE_MAX_SPEEDUP, AN.kickInterval || STROKE_BASE_PERIOD);
    strokeRate = damp(strokeRate, 1 / period, 1.5, dt);
    if (AN.kickCount !== lastKick) {
      lastKick = AN.kickCount;
      var ph = strokeT % 1, err = ph > 0.5 ? 1 - ph : -ph; // how far the arms are from a stroke start
      strokePhaseFix = err * 0.6;                        // close most of the gap over the next moment
    }
    var fix = strokePhaseFix * Math.min(1, dt * 3); strokePhaseFix -= fix;
    strokeT += dt * strokeRate + fix;
    if (strokeT < 0) strokeT += 1;
    if (strokeT > 1) strokeT = AN.intent ? strokeT % 1 : 1;
    // ---- crawl pulls: alternate hands each pull ----
    if (AN.pullCount !== lastPull) {
      lastPull = AN.pullCount; pullSide = 1 - pullSide;
      var A = pullSide ? hands.R : hands.L, other = pullSide ? hands.L : hands.R;
      A.crawl.state = 'grip'; A.crawl.t = 0; toWorld(A.crawl.contact, A.pose.p);
      if (other.crawl.state === 'grip') { other.crawl.state = 'return'; other.crawl.t = 0; other.crawl.from.copy(other.pose.p); }
    }
    // ---- weights ----
    var dry = P.dry, water = !dry;
    var tg = {
      stroke: mode === 'swim' && AN.intent ? 1 : 0,
      crawl: mode === 'crawl' && water ? 1 : 0,
      squeeze: mode === 'squeeze' ? 1 : 0,
      walk: dry && (mode === 'walk' || mode === 'crawl') ? 1 : 0,
      rag: mode === 'ragdoll' ? 1 : 0,
      grab: AN.grab ? 1 : 0,
      inflate: (AN.inflate || AN.deflate) ? 1 : 0,
      wrist: AN.wrist ? 1 : 0,
      tape: AN.tape >= 0 ? 1 : 0,
      mask: AN.maskClear ? 1 : 0,
      lantern: AN.lantern ? 1 : 0,
      climb: AN.climb >= 0 ? 1 : 0,
      measure: AN.measure ? 1 : 0
    };
    if (tg.measure) tg.lantern = 0;
    if (tg.tape) { tg.wrist = 0; tg.inflate = 0; tg.mask = 0; }
    if (tg.rag) { tg.grab = tg.inflate = tg.wrist = tg.tape = tg.mask = tg.climb = tg.measure = 0; }
    for (var k in tg) W[k] = damp(W[k], tg[k], k === 'rag' ? 10 : k === 'stroke' ? 4 : 7, dt);
    if (tg.rag && !ragSeed) ragSeed = 1 + Math.random() * 50; if (!tg.rag) ragSeed = 0;
    wpn = null;
    try { wpn = TU.weapons && typeof TU.weapons.pose === 'function' ? TU.weapons.pose() : null; } catch (e) { wpn = null; }
    if (wpn && !(wpn.w > 0.001)) wpn = null;
    poseFor(hands.R, dt); poseFor(hands.L, dt);
    placeArm(hands.R, dt); placeArm(hands.L, dt);
    // where each hand is (camera space) so weapons.js can put the weapon in the right fist
    var rg = TU.player.rig || (TU.player.rig = { lampPos: V(0, 0, 0), lampDir: V(0, 0, -1), lanternPos: null });
    if (!rg.rHandPos) { rg.rHandPos = V(0, 0, 0); rg.rHandQuat = new T.Quaternion(); rg.lHandPos = V(0, 0, 0); rg.lHandQuat = new T.Quaternion(); }
    rg.rHandPos.copy(hands.R.hand.group.position); rg.rHandQuat.copy(hands.R.hand.group.quaternion);
    rg.lHandPos.copy(hands.L.hand.group.position); rg.lHandQuat.copy(hands.L.hand.group.quaternion);
    // ---- props ----
    var L = hands.L, R = hands.R, lamp = TU.player.lamp;
    L.torch.visible = !P.headlamp;
    var on = lamp.on || 0;
    L.lens.material.color.setRGB(0.12 + on * 0.88, 0.11 + on * 0.84, 0.1 + on * 0.74);
    L.glow.material.opacity = on * 0.85; L.glow.visible = on > 0.02;
    // where the beam comes from, for player.js (camera space)
    var rig = TU.player.rig || (TU.player.rig = { lampPos: V(0, 0, 0), lampDir: V(0, 0, -1), lanternPos: null });
    L.hand.group.updateMatrixWorld(true);
    rig.lampPos.set(0, 0.04, -0.12); L.hand.group.localToWorld(rig.lampPos); // lens of the torch
    rig.lampDir.set(0, 0, -1).transformDirection(L.hand.group.matrixWorld);
    rig.lampDir.y += 0.04; rig.lampDir.normalize();
    // watch
    L.watchT -= dt; if (L.watchT <= 0) { L.watchT = 0.25; drawWatch(P); }
    L.fore.updateMatrixWorld(true);
    tmp.set(0, 0, 0.02); L.watch.localToWorld(tmp); lights.watch.position.copy(tmp);
    lights.watch.intensity = 0.05 + W.wrist * 0.25;
    // inflator hose
    hoseUpdate(W.inflate > 0.25);
    // lantern in the right hand
    var lv = P.lanternLevel || 0;
    body.lantern.visible = W.lantern > 0.3;
    if (body.lantern.visible) {
      R.hand.group.updateMatrixWorld(true);
      tmp.set(0, -0.03, -0.045); R.hand.group.localToWorld(tmp);
      body.lantern.position.copy(tmp);
      // hang down toward the real floor, swinging a little
      qInv.copy(TU.camera.quaternion).invert();
      tmp2.set(0, -1, 0).applyQuaternion(qInv);
      body.lantern.quaternion.setFromUnitVectors(V(0, -1, 0), tmp2.lerp(V(N.n3(time, 2, 2) * 0.2, -1, 0), 0.15).normalize());
      var glowF = clamp(lv / 3, 0.15, 1.2);
      body.lanternCore.material.color.setRGB(0.5 * glowF, 0.9 * glowF, 1.0 * glowF);
      body.lanternGlow.material.opacity = clamp(lv / 2.5, 0.15, 1);
      tmp3.set(0, -0.085, 0); body.lantern.localToWorld(tmp3);
      lights.lantern.position.copy(tmp3); lights.lantern.intensity = lv * 0.35;
      rig.lanternPos = rig.lanternPos || V(0, 0, 0); rig.lanternPos.copy(tmp3);
    } else { lights.lantern.intensity = 0; rig.lanternPos = null; }
    // tape roll and strip
    var taping = W.tape > 0.3 && AN.tape >= 0;
    body.roll.visible = body.strip.visible = taping;
    if (taping) {
      R.hand.group.updateMatrixWorld(true);
      tmp.set(0, -0.02, -0.06); R.hand.group.localToWorld(tmp);
      body.roll.position.copy(tmp); body.roll.quaternion.copy(R.hand.group.quaternion);
      body.roll.material = AN.tapeKind === 'flex' ? mats.flex : mats.duct;
      body.strip.material.color.set(AN.tapeKind === 'flex' ? 0x151515 : 0x8e9397);
      tmp2.lerpVectors(L.wristPos, L.elbow, 0.33);
      var mid = tmp3.copy(tmp).add(tmp2).multiplyScalar(0.5), len = tmp.distanceTo(tmp2);
      body.strip.position.copy(mid); body.strip.lookAt(tmp2); body.strip.rotateY(Math.PI / 2); body.strip.scale.set(len, 0.035, 1);
    }
    marksUpdate(P);
    body.mtape.visible = W.measure > 0.3;
    if (body.mtape.visible) {
      R.hand.group.updateMatrixWorld(true);
      tmp.set(0, -0.025, -0.05); R.hand.group.localToWorld(tmp);
      body.mtape.position.copy(tmp); body.mtape.quaternion.copy(R.hand.group.quaternion);
      var ext = 0.05 + ((P.measure && P.measure.progress) || 0) * 0.3 + 0.02 * Math.sin(time * 3);
      body.blade.scale.z = ext; body.blade.position.z = -0.02 - ext / 2;
    }
    // tanks you carry (look down to see them)
    var carried = 0; (P.tanks || []).forEach(function (tk) { if (!tk.dropped) carried++; });
    body.tanks[0].visible = carried >= 1; body.tanks[1].visible = carried >= 2; body.tanks[2].visible = carried >= 3;
    qInv.copy(TU.camera.quaternion).invert(); qYaw.setFromAxisAngle(Y_AXIS, P.yaw);
    body.torso.quaternion.copy(qInv).multiply(qYaw);
    body.torso.position.set(0, -0.05, 0.06).applyQuaternion(body.torso.quaternion);
    // swimming: lie flat (trim), walking: stand up
    body.trimX = damp(body.trimX == null ? -1.45 : body.trimX, dry ? 0 : -1.45, 3, dt);
    body.trim.rotation.x = body.trimX;
    // ---- lights for the hands ----
    var day = P.env ? P.env.daylight || 0 : 0;
    lights.hemi.intensity = 0.05 + day * 0.9 + (P.surfaced || dry ? 0.06 : 0);
    var hitD = lamp.hitDist == null ? 14 : lamp.hitDist;
    // light bouncing back off the rock your beam hits (strong in tight spots)
    lights.fill.intensity = on * (0.12 + 1.3 * clamp(1 - hitD / 7, 0, 1)) + lv * 0.08;
    lights.fill.color.copy(lamp.color || FILL_DEF).lerp(ROCK_TINT, 0.35);
    lights.fill.position.set(rig.lampDir.x * 0.6, 0.3, -1); lights.fill.target.position.set(0, -0.2, 0);
    lights.spill.position.copy(rig.lampPos).add(V(0, 0.02, 0.02)); lights.spill.intensity = P.headlamp ? 0 : on * 0.35;
    lights.shock.intensity = (P.shock || 0) * (0.5 + Math.random() * 2.5);
  }

  TU.addSystem('hands', {
    init: function () { build(); },
    frame: frame
  });
})();
