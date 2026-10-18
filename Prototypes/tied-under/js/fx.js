/*
 * fx.js: the renderer and everything that is "just visuals" around the diver.
 *
 *   - Creates the WebGL renderer, the canvas (#fx-canvas), TU.scene and TU.camera.
 *   - Creates the hands scene and camera (TU.fx.handScene, TU.fx.handCamera). player-hands.js
 *     fills it; it is drawn on top of the cave after clearing depth, so hands never clip into rock.
 *   - A full-screen "lens" pass (post-processing) that draws what the mask does to your eyes:
 *     narcosis (soft color fringes, gentle lens breathing, blurry edges, washed-out color),
 *     panic tunnel vision, water sloshing inside a flooded mask, blood on the glass,
 *     and the glassy air-pocket hints (little refracting beads and arrows).
 *   - Patches three.js fog so water "eats red" (red fades first with distance).
 *   - Fog color and thickness: daylight near the mouth, brown in silt, clear in air pockets.
 *   - Particle systems: marine snow, exhaled bubbles that pool on the ceiling and pop at a surface,
 *     layered silt clouds, blood wisps, falling rock debris in quakes. Particles are lit by the
 *     diver's flashlight in the shader (TU.player.lamp).
 *   - A faint volumetric beam cone for the flashlight.
 *   - Screen overlays (CSS): mask rim, scanlines, silt brown, drowning black, wall hit flash.
 *   - Measures how much silt is around the camera: TU.fx.siltDensity() (0..1). player.js reads it.
 *
 * Owner: agent C (with player.js and audio.js).
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE, U = TU.util, N = TU.noise, cfg = TU.cfg;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;

  TU.css('fx', [
    '#fx-canvas{position:fixed;inset:0;width:100%;height:100%;display:block;outline:none;z-index:0}',
    '.fx-layer{position:fixed;inset:0;pointer-events:none;z-index:1}',
    '#fx-mask{border-radius:56px;box-shadow:inset 0 0 0 1px rgba(79,242,208,.05),inset 0 0 180px 70px rgba(0,0,0,.78);}',
    '#fx-mask::after{content:"";position:absolute;inset:0;border-radius:56px;background:radial-gradient(120% 60% at 50% -10%, rgba(140,220,210,.05), transparent 60%),radial-gradient(60% 40% at 8% 100%, rgba(140,220,210,.035), transparent 70%);}',
    '#fx-scan{background:repeating-linear-gradient(to bottom, rgba(79,242,208,.025) 0 1px, transparent 1px 3px);mix-blend-mode:screen;opacity:.7}',
    '#fx-narc{opacity:0;display:none;background:radial-gradient(ellipse at center, transparent 42%, rgba(6,24,22,.6) 100%);-webkit-backdrop-filter:blur(3px) saturate(.6);backdrop-filter:blur(3px) saturate(.6);-webkit-mask-image:radial-gradient(ellipse at center, transparent 38%, #000 82%);mask-image:radial-gradient(ellipse at center, transparent 38%, #000 82%)}',
    '#fx-panic{opacity:0;background:radial-gradient(ellipse at center, transparent 35%, rgba(70,0,6,.75) 100%)}',
    '#fx-silt{opacity:0;background:radial-gradient(ellipse at center, rgba(60,46,30,.35), rgba(30,22,14,.85))}',
    '#fx-black{opacity:0;background:#000}',
    '#fx-hit{opacity:0;background:radial-gradient(ellipse at center, transparent 50%, rgba(255,255,255,.08) 100%)}'
  ].join('\n'));

  var renderer, scene, camera, canvas, handScene, handCamera;
  var FOG_DEEP, FOG_MOUTH, FOG_SILT, FOG_AIR;
  var overlay = {};
  var pUniformsShared;
  var snow, snowMat, snowVel, bubbles, bubMat, bub, silt, siltMat, sl, blood, bloodMat, bl, debris, debMat, db, ripples, ripMat, rp;
  var SNOW_N, SNOW_BOX, BUB_N, SILT_N, BLOOD_N = 520, DEB_N = 320, RIP_N = 48;
  var siltDensity = 0, frameNo = 0, time = 0, rand = Math.random;
  var post = null;          // { rt, scene, cam, mat } or null when the lens pass is unavailable
  var beam = null;          // flashlight beam cone
  var quakeFx = { t: 0, str: 0 };
  var hints = { list: [], key: '', frame: 0 };
  var HINT_MAX = 8;

  function initRenderer() {
    canvas = TU.el('canvas', { id: 'fx-canvas', tabIndex: 0, attrs: { 'aria-label': 'Cave diving view' } });
    document.body.insertBefore(canvas, document.body.firstChild);
    ['silt', 'narc', 'panic', 'hit', 'mask', 'scan', 'black'].forEach(function (k) { overlay[k] = TU.el('div', { id: 'fx-' + k, className: 'fx-layer' }); });
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.fx.pixelRatioMax));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.fx.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    // Water eats red: per channel fog, red is absorbed fastest.
    T.ShaderChunk.fog_fragment = [
      '#ifdef USE_FOG',
      '  #ifdef FOG_EXP2',
      '    vec3 fogF = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth * vec3( 2.3, 1.0, 0.82 ) );',
      '  #else',
      '    vec3 fogF = vec3( smoothstep( fogNear, fogFar, fogDepth ) );',
      '  #endif',
      '  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, clamp( fogF, 0.0, 1.0 ) );',
      '#endif'
    ].join('\n');

    scene = new T.Scene();
    FOG_DEEP = new T.Color(cfg.fx.fogDeep); FOG_MOUTH = new T.Color(cfg.fx.fogMouth); FOG_SILT = new T.Color(cfg.fx.fogSilt); FOG_AIR = new T.Color(cfg.fx.fogAir2);
    scene.fog = new T.FogExp2(FOG_DEEP.clone(), 0.055);
    scene.background = scene.fog.color;
    camera = new T.PerspectiveCamera(cfg.swim.fov, window.innerWidth / window.innerHeight, 0.04, 140);
    scene.add(camera);
    scene.add(new T.AmbientLight(0x16303a, 0.05));
    // Hands: their own scene in camera space, their own narrower camera.
    handScene = new T.Scene();
    handCamera = new T.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 5);
    TU.renderer = renderer; TU.scene = scene; TU.camera = camera; TU.canvas = canvas;
    initPost();

    window.addEventListener('resize', function () {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      handCamera.aspect = camera.aspect; handCamera.updateProjectionMatrix();
      if (post) { var s = drawSize(); post.rt.setSize(s.x, s.y); }
    });
  }
  function drawSize() { var v = new T.Vector2(); renderer.getDrawingBufferSize(v); return v; }

  /* ------------------------------------------------------------------ */
  /* The lens pass (post-processing)                                     */
  /* ------------------------------------------------------------------ */
  var POST_FRAG = [
    'uniform sampler2D tScene; uniform vec2 uRes; uniform float uTime, uNarc, uPanic, uFlood, uSlosh, uBlood, uCold, uRag, uShock, uHintN;',
    'uniform vec4 uHint[' + HINT_MAX + ']; uniform vec2 uHintDir[' + HINT_MAX + '];',
    'varying vec2 vUv;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }',
    'void main(){',
    '  float aspect = uRes.x / uRes.y;',
    '  vec2 asp = vec2(aspect, 1.0);',
    '  vec2 uv = vUv;',
    '  vec2 c = (uv - 0.5) * asp;',
    '  float r = length(c);',
    // narcosis: the lens slowly breathes and the image swims a little
    '  float breathe = sin(uTime * 0.6) * 0.5 + 0.5;',
    '  uv = 0.5 + (uv - 0.5) * (1.0 - uNarc * (0.004 + 0.012 * breathe * r));',
    '  uv += uNarc * 0.0018 * vec2(sin(uv.y * 11.0 + uTime * 0.8), cos(uv.x * 9.0 + uTime * 0.65));',
    // water inside the mask: a waterline that tilts and sloshes
    '  float line = -1.0; float under = 0.0;',
    '  if (uFlood > 0.001) {',
    '    float x = (vUv.x - 0.5) * aspect;',
    '    line = uFlood * 1.12 - 0.06 + tan(uSlosh) * x + 0.014 * sin(x * 9.0 + uTime * 3.1) + 0.007 * sin(x * 23.0 - uTime * 4.7);',
    '    under = smoothstep(line + 0.004, line - 0.004, vUv.y);',
    '    uv += under * 0.011 * vec2(sin(vUv.y * 34.0 + uTime * 4.0), cos(vUv.x * 27.0 + uTime * 3.3));',
    '  }',
    // glass air hints: refracting beads and chevrons
    '  vec3 glint = vec3(0.0);',
    '  for (int i = 0; i < ' + HINT_MAX + '; i++) {',
    '    if (float(i) >= uHintN) break;',
    '    vec4 h = uHint[i];',
    '    if (h.w < 0.003) continue;',
    '    vec2 d = (vUv - h.xy) * asp;',
    '    float rad = abs(h.z);',
    '    if (length(d) > rad * 1.6) continue;',
    '    if (h.z > 0.0) {',
    '      float q = length(d) / rad;',
    '      if (q < 1.0) {',
    '        float z = sqrt(1.0 - q * q);',
    '        vec2 n = d / rad;',
    '        uv -= n * (1.0 - z) * rad * 0.7 * h.w / asp;',
    '        float fres = pow(1.0 - z, 2.2);',
    '        float spec = smoothstep(0.3, 0.0, length(n - vec2(-0.38, 0.42)));',
    '        glint += (vec3(0.7, 0.93, 1.0) * fres * 0.42 + vec3(1.0) * spec * 0.55) * h.w;',
    '      }',
    '    } else {',
    '      vec2 dir = normalize(uHintDir[i] + vec2(1e-5)); vec2 nrm = vec2(-dir.y, dir.x);',
    '      vec2 p = vec2(dot(d, dir), dot(d, nrm)) / rad;',
    '      float sd = min(segDist(p, vec2(0.5, 0.0), vec2(-0.3, 0.55)), segDist(p, vec2(0.5, 0.0), vec2(-0.3, -0.55)));',
    '      float th = 0.17;',
    '      if (sd < th) {',
    '        float e = sd / th; float z = sqrt(1.0 - e * e);',
    '        uv -= dir * (1.0 - z) * rad * 0.45 * h.w / asp;',
    '        glint += (vec3(0.7, 0.93, 1.0) * pow(e, 2.0) * 0.5 + vec3(0.9, 1.0, 1.0) * (1.0 - e) * 0.14) * h.w;',
    '      }',
    '    }',
    '  }',
    // soft color fringes (narcosis, a little from panic and from mask water)
    '  vec2 cd = uv - 0.5;',
    '  float ca = 0.006 * uNarc * r + 0.002 * uPanic * r + under * 0.006;',
    '  vec3 col;',
    '  col.r = texture2D(tScene, uv + cd * ca).r;',
    '  col.g = texture2D(tScene, uv).g;',
    '  col.b = texture2D(tScene, uv - cd * ca).b;',
    // blur: narcosis depth-of-field feel at the edges, heavy under mask water, dazed after a fall
    '  float blur = under * 0.012 + uNarc * smoothstep(0.16, 0.75, r) * 0.007 + uRag * 0.007 + uShock * 0.003;',
    '  if (blur > 0.0004) {',
    '    vec2 o = vec2(blur / aspect, blur);',
    '    vec3 acc = texture2D(tScene, uv + o * vec2(1.0, 0.0)).rgb + texture2D(tScene, uv + o * vec2(-1.0, 0.0)).rgb;',
    '    acc += texture2D(tScene, uv + o * vec2(0.0, 1.0)).rgb + texture2D(tScene, uv + o * vec2(0.0, -1.0)).rgb;',
    '    acc += texture2D(tScene, uv + o * vec2(0.7, 0.7)).rgb + texture2D(tScene, uv + o * vec2(-0.7, 0.7)).rgb;',
    '    acc += texture2D(tScene, uv + o * vec2(0.7, -0.7)).rgb + texture2D(tScene, uv + o * vec2(-0.7, -0.7)).rgb;',
    '    acc += texture2D(tScene, uv + o * vec2(0.45, 0.2)).rgb + texture2D(tScene, uv + o * vec2(-0.2, 0.45)).rgb;',
    '    acc += texture2D(tScene, uv + o * vec2(-0.45, -0.2)).rgb + texture2D(tScene, uv + o * vec2(0.2, -0.45)).rgb;',
    '    col = mix(col, acc / 12.0, clamp(blur * 170.0, 0.0, 1.0));',
    '  }',
    // narcosis: highlights bloom softly and warm up
    '  col += max(col - 0.45, 0.0) * uNarc * vec3(0.55, 0.5, 0.42);',
    // the water in the mask: tint and murk below the line, a bright meniscus on it
    '  if (uFlood > 0.001) {',
    '    col = mix(col, col * vec3(0.6, 0.84, 0.88) + vec3(0.0, 0.03, 0.035), under * 0.8);',
    '    float men = exp(-pow((vUv.y - line) * 230.0, 2.0));',
    '    col += vec3(0.5, 0.72, 0.75) * men * 0.28;',
    '    float drops = step(0.985, hash(floor(vUv * vec2(70.0 * aspect, 70.0)))) * (1.0 - under) * smoothstep(0.25, 0.0, vUv.y - line);',
    '    col += vec3(0.4, 0.6, 0.62) * drops * 0.2;',
    '  }',
    // narcosis and cold wash the color out
    '  float l = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(col, vec3(l) * vec3(0.94, 1.0, 1.03), 0.5 * uNarc + 0.12 * uCold);',
    // vignette: the mask edge closes in with panic (tunnel vision) and narcosis
    '  float inner = 0.62 - 0.32 * uPanic - 0.12 * uNarc;',
    '  float vig = smoothstep(inner, inner + 0.55, r);',
    '  col *= 1.0 - vig * (0.3 + 0.55 * uPanic + 0.25 * uNarc);',
    '  col = mix(col, col * vec3(1.0, 0.72, 0.7), uPanic * vig * 0.6);',
    // blood smeared on the edge of the mask glass
    '  if (uBlood > 0.001) {',
    '    float n = vnoise(c * 5.0 + vec2(0.0, uTime * 0.03)) * 0.55 + vnoise(c * 13.0 + 3.1) * 0.3 + vnoise(c * 31.0 + 7.7) * 0.15;',
    '    float edge = smoothstep(0.58, 1.02, r + (n - 0.5) * 0.32);',
    '    float drip = smoothstep(0.55, 0.0, abs(fract(c.x * 7.0 + n * 0.6) - 0.5) * 9.0) * smoothstep(0.1, 0.5, -c.y) * smoothstep(0.75, 1.0, n + 0.35);',
    '    float a = clamp((edge + drip * 0.35) * uBlood * 0.8, 0.0, 0.62);',
    '    col = mix(col, vec3(0.26, 0.012, 0.018) * (0.35 + l * 1.4), a);',
    '  }',
    '  col += glint;',
    // shock: a cold electric flicker
    '  col += vec3(0.45, 0.68, 1.0) * uShock * 0.22 * step(0.55, hash(vec2(floor(uTime * 24.0), 1.0)));',
    // ragdoll: dark at the edges, the world spinning
    '  col *= 1.0 - uRag * 0.3 * smoothstep(0.15, 0.85, r);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // The GPU's name, to skip the heavy multisampled buffer on software renderers (tests, old machines).
  function gpuName() {
    try { var gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return ''; }
  }
  function initPost() {
    try {
      var s = drawSize();
      var opts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, encoding: T.sRGBEncoding, depthBuffer: true, stencilBuffer: false };
      var rt = (renderer.capabilities.isWebGL2 && T.WebGLMultisampleRenderTarget && !/swiftshader|llvmpipe/i.test(gpuName())) ? new T.WebGLMultisampleRenderTarget(s.x, s.y, opts) : new T.WebGLRenderTarget(s.x, s.y, opts);
      if (rt.isWebGLMultisampleRenderTarget) rt.samples = 4;
      var hintsU = [], dirsU = [];
      for (var i = 0; i < HINT_MAX; i++) { hintsU.push(new T.Vector4(0, 0, 0, 0)); dirsU.push(new T.Vector2(0, 1)); }
      var mat = new T.ShaderMaterial({
        uniforms: {
          tScene: { value: rt.texture }, uRes: { value: new T.Vector2(s.x, s.y) }, uTime: { value: 0 }, uNarc: { value: 0 }, uPanic: { value: 0 },
          uFlood: { value: 0 }, uSlosh: { value: 0 }, uBlood: { value: 0 }, uCold: { value: 0 }, uRag: { value: 0 }, uShock: { value: 0 },
          uHintN: { value: 0 }, uHint: { value: hintsU }, uHintDir: { value: dirsU }
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: POST_FRAG,
        depthTest: false, depthWrite: false, toneMapped: false
      });
      var quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
      var ps = new T.Scene(); ps.add(quad);
      post = { rt: rt, scene: ps, cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat: mat, u: mat.uniforms };
    } catch (e) { console.warn('[TU fx] lens pass unavailable, drawing straight to the screen', e); post = null; }
  }

  function render() {
    var hands = handScene && handScene.visible && handScene.children.length > 0;
    if (post) {
      renderer.setRenderTarget(post.rt);
      renderer.clear();
      renderer.render(scene, camera);
      if (hands) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(handScene, handCamera); renderer.autoClear = true; }
      renderer.setRenderTarget(null);
      renderer.render(post.scene, post.cam);
    } else {
      renderer.render(scene, camera);
      if (hands) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(handScene, handCamera); renderer.autoClear = true; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lit particle material: points lit by the flashlight cone in-shader  */
  /* ------------------------------------------------------------------ */
  // opts: { map, color, base (unlit brightness 0..1), additive, opacity, glow (ignore lighting), rotate (spin the sprite) }
  function particleMaterial(opts) {
    var u = Object.assign({}, pUniformsShared, { uTex: { value: opts.map }, uColor: { value: new T.Color(opts.color) }, uBase: { value: opts.base || 0 }, uDay: { value: 0 }, uOpacity: { value: opts.opacity == null ? 1 : opts.opacity }, uGlow: { value: opts.glow ? 1 : 0 } });
    var additive = !!opts.additive, rot = !!opts.rotate;
    return new T.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
      vertexShader: [
        'attribute float aSize; attribute float aAlpha; attribute vec3 aCol;',
        'uniform float uPx; uniform vec3 uLP; uniform vec3 uLD; uniform float uCosO; uniform float uCosI; uniform float uRange; uniform float uOn; uniform float uBase; uniform float uDay; uniform float uGlow; uniform float uNear; uniform vec3 uL2P; uniform float uL2;',
        'varying float vA; varying float vLit; varying float vD; varying vec3 vCol; varying float vRot;',
        'void main(){',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;',
        '  float d = -mv.z; gl_PointSize = clamp(aSize * uPx / max(d, 0.05), 0.0, 380.0);',
        '  vec3 L = position - uLP; float dl = length(L);',
        '  float cone = smoothstep(uCosO, uCosI, dot(L / max(dl, 0.001), uLD));',
        '  float fall = pow(clamp(1.0 - dl / uRange, 0.0, 1.0), 1.4);',
        '  float near = clamp(1.0 - dl / 1.4, 0.0, 1.0);',
        '  float lan = uL2 * pow(clamp(1.0 - length(position - uL2P) / 5.0, 0.0, 1.0), 2.0);',
        '  vLit = mix(uBase + uOn * (cone * fall * 1.7 + near * uNear) + uDay + lan, 1.0, uGlow);',
        '  vA = aAlpha; vD = d; vCol = aCol; vRot = position.x * 0.9 + position.z * 0.7 + position.y * 0.3;',
        '}'].join('\n'),
      fragmentShader: [
        'uniform sampler2D uTex; uniform vec3 uColor; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uOpacity; uniform float uGlow;',
        'varying float vA; varying float vLit; varying float vD; varying vec3 vCol; varying float vRot;',
        'void main(){',
        (rot ? '  vec2 pc = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); pc = vec2(cs * pc.x - sn * pc.y, sn * pc.x + cs * pc.y) + 0.5; vec4 t = texture2D(uTex, pc);' : '  vec4 t = texture2D(uTex, gl_PointCoord);'),
        '  float fd = uFogDensity * mix(1.0, 0.45, uGlow);',
        '  float f = 1.0 - exp(-fd * fd * vD * vD);',
        '  vec3 col = uColor * vCol * vLit;',
        (additive ? '  gl_FragColor = vec4(col, t.a * vA * uOpacity * (1.0 - f));' : '  col = mix(col, uFogColor, f); gl_FragColor = vec4(col, t.a * vA * uOpacity);'),
        '}'].join('\n')
    });
  }
  // A Points object with position, aSize, aAlpha and aCol attributes, added to the scene.
  function makePoints(count, mat) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aSize', new T.BufferAttribute(new Float32Array(count), 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aAlpha', new T.BufferAttribute(new Float32Array(count), 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aCol', new T.BufferAttribute(new Float32Array(count * 3).fill(1), 3).setUsage(T.DynamicDrawUsage));
    var p = new T.Points(g, mat); p.frustumCulled = false; scene.add(p);
    return p;
  }
  function pool(n, extra) {
    var o = { x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n), age: new Float32Array(n), life: new Float32Array(n), next: 0 };
    (extra || []).forEach(function (k) { o[k] = new Float32Array(n); });
    return o;
  }

  function initParticles() {
    rand = TU.rng(20261018, 30).fn();
    pUniformsShared = {
      uLP: { value: new T.Vector3() }, uLD: { value: new T.Vector3(0, 0, -1) }, uCosO: { value: Math.cos(0.42) }, uCosI: { value: Math.cos(0.2) },
      uRange: { value: 14 }, uOn: { value: 1 }, uFogColor: { value: scene.fog.color }, uFogDensity: { value: 0.055 }, uPx: { value: 600 },
      uNear: { value: 0.25 }, uL2P: { value: new T.Vector3() }, uL2: { value: 0 }
    };
    SNOW_N = cfg.fx.snowCount; SNOW_BOX = cfg.fx.snowBox; BUB_N = cfg.fx.bubbleCount; SILT_N = cfg.fx.siltCount;
    // marine snow: a box of drifting specks that wraps around the camera
    snowMat = particleMaterial({ map: TU.tex.get('dot'), color: 0xC9C2B0, base: 0.0, additive: true, opacity: 0.55 });
    snow = makePoints(SNOW_N, snowMat);
    snowVel = new Float32Array(SNOW_N * 3);
    var pa = snow.geometry.attributes.position.array, sa = snow.geometry.attributes.aSize.array, aa = snow.geometry.attributes.aAlpha.array;
    for (var i = 0; i < SNOW_N; i++) { pa[i * 3] = (rand() - 0.5) * SNOW_BOX; pa[i * 3 + 1] = (rand() - 0.5) * SNOW_BOX; pa[i * 3 + 2] = (rand() - 0.5) * SNOW_BOX; sa[i] = 0.012 + Math.pow(rand(), 3) * 0.05; aa[i] = 0.4 + rand() * 0.6; snowVel[i * 3] = (rand() - 0.5) * 0.03; snowVel[i * 3 + 1] = -0.01 - rand() * 0.02; snowVel[i * 3 + 2] = (rand() - 0.5) * 0.03; }
    // bubbles
    bubMat = particleMaterial({ map: TU.tex.get('bubble'), color: 0xd8f2f6, base: 0.12, additive: true, opacity: 0.9 });
    bubbles = makePoints(BUB_N, bubMat);
    bub = pool(BUB_N, ['size', 'nx', 'nz']); bub.stuck = new Uint8Array(BUB_N); bub.hint = [];
    for (i = 0; i < BUB_N; i++) bub.hint.push({});
    // silt: layered soft clouds that spin slowly
    siltMat = particleMaterial({ map: TU.tex.get('silt'), color: 0xc2a57c, base: 0.03, additive: false, opacity: 1.0, rotate: true });
    silt = makePoints(SILT_N, siltMat);
    sl = pool(SILT_N, ['s0', 's1', 'big']);
    // blood wisps (red only shows in your light: water eats red)
    bloodMat = particleMaterial({ map: TU.tex.get('silt'), color: 0x9a0c0c, base: 0.05, additive: false, opacity: 1.0, rotate: true });
    blood = makePoints(BLOOD_N, bloodMat);
    bl = pool(BLOOD_N, ['s0', 's1']);
    // falling rock chips (quakes)
    debMat = particleMaterial({ map: TU.tex.get('dot'), color: 0x6d6255, base: 0.05, additive: false, opacity: 1.0 });
    debris = makePoints(DEB_N, debMat);
    db = pool(DEB_N, ['size', 'floor', 'rest']);
    // ripple rings where bubbles break at a surface
    var ring = TU.tex.canvas(64, 64, function (g, w) { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, w * 0.38, 0, Math.PI * 2); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, w / 2, w * 0.38, 0, Math.PI * 2); g.stroke(); });
    ripMat = particleMaterial({ map: ring, color: 0xcfeff2, base: 0.18, additive: true, opacity: 0.8 });
    ripples = makePoints(RIP_N, ripMat);
    rp = pool(RIP_N);
    initBeam();
  }

  // A soft, faint cone that shows the flashlight beam in the water.
  function initBeam() {
    var g = new T.CylinderGeometry(0.0, 1, 1, 28, 6, true);
    g.translate(0, -0.5, 0); // apex at the origin, opening toward -Y
    var m = new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(0xfff1d6) }, uI: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying float vAlong; varying vec3 vN; varying vec3 vV; void main(){ vAlong = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; uniform float uTime; varying float vAlong; varying vec3 vN; varying vec3 vV; void main(){ float e = abs(dot(normalize(vN), normalize(vV))); float a = uI * pow(1.0 - vAlong, 2.2) * pow(e, 1.6) * smoothstep(0.0, 0.08, vAlong); a *= 0.85 + 0.15 * sin(vAlong * 40.0 - uTime * 1.3); gl_FragColor = vec4(uColor * a, a); }',
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false
    });
    beam = new T.Mesh(g, m); beam.frustumCulled = false; beam.renderOrder = 2;
    scene.add(beam);
  }

  // Kick up silt. opts: { pos (Vector3, required), back (Vector3 to offset behind you), vel (Vector3), burst (bool), floorY (m) }
  function spawnSilt(n, opts) {
    opts = opts || {};
    var p = opts.pos || TU.player.state.pos, back = opts.back, vel = opts.vel || { x: 0, y: 0, z: 0 };
    var floorY = opts.floorY != null ? opts.floorY : TU.cave.nearestPoint(p).floorY;
    var b = opts.burst ? 0 : 0.9;
    for (var k = 0; k < n; k++) {
      var i = sl.next; sl.next = (sl.next + 1) % SILT_N;
      sl.x[i] = p.x - (back ? back.x * b : 0) + (Math.random() - 0.5) * 1.2;
      sl.y[i] = Math.min(p.y - 0.6, floorY + 0.2 + Math.random() * 0.4);
      sl.z[i] = p.z - (back ? back.z * b : 0) + (Math.random() - 0.5) * 1.2;
      var a = Math.random() * Math.PI * 2, sp = 0.25 + Math.random() * (opts.burst ? 1.0 : 0.6);
      sl.vx[i] = Math.cos(a) * sp + vel.x * 0.3; sl.vz[i] = Math.sin(a) * sp + vel.z * 0.3; sl.vy[i] = 0.2 + Math.random() * 0.45;
      sl.age[i] = 0; sl.life[i] = 11 + Math.random() * 4;
      // every fourth puff is a big faint layer, the rest are smaller dense billows
      sl.big[i] = (k % 4 === 0) ? 1 : 0;
      sl.s0[i] = sl.big[i] ? 0.8 + Math.random() * 0.5 : 0.35 + Math.random() * 0.4;
      sl.s1[i] = sl.big[i] ? 3.2 + Math.random() * 1.8 : 1.6 + Math.random() * 1.6;
    }
  }
  // Release bubbles. opts: { pos (Vector3 mouth position, required), right (Vector3 drift direction) }
  function spawnBubbles(n, opts) {
    opts = opts || {};
    var c = opts.pos || camera.position, r = opts.right || { x: 0, y: 0, z: 0 };
    for (var k = 0; k < n; k++) {
      var i = bub.next; bub.next = (bub.next + 1) % BUB_N;
      bub.x[i] = c.x + (Math.random() - 0.5) * 0.06; bub.y[i] = c.y + (Math.random() - 0.5) * 0.06; bub.z[i] = c.z + (Math.random() - 0.5) * 0.06;
      bub.vx[i] = (Math.random() - 0.5) * 0.25 + r.x * 0.3; bub.vy[i] = 0.4 + Math.random() * 0.5; bub.vz[i] = (Math.random() - 0.5) * 0.25 + r.z * 0.3;
      bub.age[i] = 0; bub.life[i] = 7 + Math.random() * 4; bub.size[i] = 0.012 + Math.pow(Math.random(), 2) * 0.05; bub.stuck[i] = 0;
      bub.hint[i].m = undefined; bub.hint[i].b = undefined;
    }
  }
  // Blood in the water. opts: { pos (Vector3, required), burst (bool, a spray from a fresh cut) }
  function spawnBlood(n, opts) {
    opts = opts || {};
    var P = TU.player.state; if (P.dry) return;
    var p = opts.pos || camera.position;
    for (var k = 0; k < n; k++) {
      var i = bl.next; bl.next = (bl.next + 1) % BLOOD_N;
      bl.x[i] = p.x + (Math.random() - 0.5) * 0.08; bl.y[i] = p.y + (Math.random() - 0.5) * 0.08; bl.z[i] = p.z + (Math.random() - 0.5) * 0.08;
      var sp = opts.burst ? 0.15 + Math.random() * 0.35 : 0.03 + Math.random() * 0.06, a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2;
      bl.vx[i] = Math.cos(a) * sp + P.vel.x * 0.5; bl.vy[i] = e * sp * 0.6 + P.vel.y * 0.5; bl.vz[i] = Math.sin(a) * sp + P.vel.z * 0.5;
      bl.age[i] = 0; bl.life[i] = 5 + Math.random() * 5;
      bl.s0[i] = 0.02 + Math.random() * 0.03; bl.s1[i] = 0.18 + Math.random() * 0.35;
    }
  }
  // Rock chips falling from the ceiling. opts: { pos (center), radius (m) }
  function spawnDebris(n, opts) {
    opts = opts || {};
    var c = opts.pos || camera.position, R = opts.radius || 3.5, hint = {};
    for (var k = 0; k < n; k++) {
      var i = db.next; db.next = (db.next + 1) % DEB_N;
      var a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R;
      var x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
      var np = TU.cave.nearestPoint({ x: x, y: c.y, z: z }, hint);
      var top = np.ceilY != null ? np.ceilY - 0.15 : c.y + 2.5, fl = np.floorY != null ? np.floorY : c.y - 3;
      db.x[i] = x; db.y[i] = Math.min(top, c.y + 4) - Math.random() * 0.3; db.z[i] = z;
      db.vx[i] = (Math.random() - 0.5) * 0.3; db.vy[i] = -Math.random() * 0.5; db.vz[i] = (Math.random() - 0.5) * 0.3;
      db.age[i] = 0; db.life[i] = 5 + Math.random() * 3; db.size[i] = 0.02 + Math.pow(Math.random(), 3) * 0.08; db.floor[i] = fl + 0.03; db.rest[i] = 0;
    }
  }
  function spawnRipple(x, y, z) {
    var i = rp.next; rp.next = (rp.next + 1) % RIP_N;
    rp.x[i] = x; rp.y[i] = y + 0.01; rp.z[i] = z; rp.age[i] = 0; rp.life[i] = 0.7 + Math.random() * 0.4;
  }

  function clearParticles() {
    for (var i = 0; i < BUB_N; i++) bub.life[i] = 0;
    for (i = 0; i < SILT_N; i++) sl.life[i] = 0;
    for (i = 0; i < BLOOD_N; i++) bl.life[i] = 0;
    for (i = 0; i < DEB_N; i++) db.life[i] = 0;
    for (i = 0; i < RIP_N; i++) rp.life[i] = 0;
    siltDensity = 0; quakeFx.t = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Glass air hints: where to put them and how they look on screen      */
  /* ------------------------------------------------------------------ */
  var hv = new T.Vector3(), hv2 = new T.Vector3(), hv3 = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
  function vec(p) { if (!p) return null; if (p.isVector3) return p; if (p.x != null) return new T.Vector3(p.x, p.y, p.z); if (p.length === 3) return new T.Vector3(p[0], p[1], p[2]); return null; }
  // Sources: agent A's features.airHints if present, else a spot under each air pocket.
  function hintSources() {
    var F = TU.cave.features || {};
    var key = (F.airHints ? F.airHints.length : -1) + ':' + (F.airPockets ? F.airPockets.length : -1) + ':' + (TU.cave.layout ? TU.cave.layout.seed : 0);
    if (key === hints.key && hints.list.length) return hints.list;
    var out = [];
    if (F.airHints && F.airHints.length) {
      F.airHints.forEach(function (h) {
        var pos = vec(h.pos || h.position || h); if (!pos) return;
        var to = vec(h.to || h.target || h.air || h.pocketPos), dir;
        if (h.dir) dir = vec(h.dir).clone().normalize(); else if (to) dir = to.clone().sub(pos).normalize(); else dir = UP.clone();
        out.push({ pos: pos.clone(), dir: dir, vis: 0, occ: 1, ph: Math.random() });
      });
    } else (F.airPockets || []).forEach(function (p) {
      var c = vec(p.pos); if (!c) return;
      var hp = vec(p.hintPos) || new T.Vector3(c.x, (p.surfaceY != null ? p.surfaceY : c.y) - 3, c.z);
      var dir = new T.Vector3(c.x, p.surfaceY != null ? p.surfaceY : c.y, c.z).sub(hp); if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0); dir.normalize();
      out.push({ pos: hp.clone(), dir: dir, vis: 0, occ: 1, ph: Math.random() });
    });
    hints.list = out; hints.key = key;
    return out;
  }
  function updateHints(dt) {
    if (!post) return;
    var u = post.u, P = TU.player.state, list = hintSources(), cam = camera.position, n = 0;
    var tanH = Math.tan(T.MathUtils.degToRad(camera.fov) / 2);
    camera.updateMatrixWorld(); // project() needs this frame's camera, not the last drawn one
    var hide = P.surfaced || P.dry || !TU.state.simulating();
    // pick the two best sources by distance (medium range only)
    var best = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i], d = s.pos.distanceTo(cam);
      var target = hide ? 0 : smooth(4, 8, d) * smooth(34, 24, d);
      if (target > 0 && (hints.frame + i) % 12 === 0) {
        hv.copy(s.pos).sub(cam); var dd = hv.length(); hv.divideScalar(dd || 1);
        s.occ = TU.cave.raycast(cam, hv, dd) >= dd - 0.6 ? 1 : 0; // hidden behind rock
      }
      s.vis = U.damp(s.vis, target * s.occ, 2.2, dt);
      if (s.vis > 0.01) {
        // prefer hints you are looking at, then the closest
        hv2.copy(s.pos).project(camera);
        var onScreen = hv2.z < 1 && Math.abs(hv2.x) < 1 && Math.abs(hv2.y) < 1;
        s.score = s.vis * (onScreen ? 1 : 0.01) / (1 + d * 0.05);
        best.push(s);
      }
    }
    best.sort(function (a, b) { return b.score - a.score; });
    for (var b = 0; b < best.length && b < 2; b++) {
      var src = best[b];
      // three beads drifting up along the hint direction, then a chevron at the front
      for (var k = 0; k < 4 && n < HINT_MAX; k++) {
        var arrow = k === 3, ph = arrow ? 0.5 : ((time * 0.14 + src.ph + k / 3) % 1);
        hv.copy(src.pos).addScaledVector(src.dir, arrow ? 1.9 : ph * 1.6);
        hv.x += N.n3(time * 0.3, k * 3.1, src.ph * 9) * 0.1; hv.z += N.n3(time * 0.3, k * 5.7, src.ph * 7) * 0.1;
        hv2.copy(hv).project(camera);
        var a = src.vis * (arrow ? 0.85 : Math.sin(Math.PI * ph));
        var inView = hv2.z < 1 && hv2.z > -1 && Math.abs(hv2.x) < 1.05 && Math.abs(hv2.y) < 1.05;
        var dist = hv.distanceTo(cam);
        if (!inView || a < 0.01) continue;
        var size = arrow ? 0.26 : 0.11;
        var rad = clamp(size / (dist * 2 * tanH), 0.004, 0.06);
        u.uHint.value[n].set(hv2.x * 0.5 + 0.5, hv2.y * 0.5 + 0.5, arrow ? -rad : rad, a);
        if (arrow) {
          hv3.copy(hv).addScaledVector(src.dir, 0.6).project(camera);
          u.uHintDir.value[n].set((hv3.x - hv2.x) * camera.aspect, hv3.y - hv2.y);
          if (u.uHintDir.value[n].lengthSq() < 1e-8) u.uHintDir.value[n].set(0, 1);
        }
        n++;
      }
    }
    u.uHintN.value = n;
    hints.info = { sources: list.length, candidates: best.length, shapes: n, hide: hide, top: best.slice(0, 3).map(function (q) { return [+q.vis.toFixed(2), +(q.score || 0).toFixed(3), q.occ, +q.pos.distanceTo(cam).toFixed(1)]; }) };
    hints.frame++;
  }

  /* ------------------------------------------------------------------ */
  /* Per step                                                            */
  /* ------------------------------------------------------------------ */
  function step(dt) {
    time += dt; frameNo = (frameNo + 1) | 0;
    var P = TU.player.state, lamp = TU.player.lamp, env = P.env, t = time;
    var narc = P.narcosis || 0;
    // ---- fog ----
    var day = env ? env.daylight : 0;
    var fc = scene.fog.color;
    fc.copy(FOG_DEEP).lerp(FOG_MOUTH, day).lerp(FOG_SILT, clamp(siltDensity * 1.2, 0, 0.85));
    var dens = cfg.fx.fogDensity + siltDensity * 0.3 + narc * 0.012;
    var headInAir = P.dry || P.surfaced || (P.surfaceY != null && camera.position.y > P.surfaceY);
    if (headInAir) { fc.copy(FOG_AIR); dens = cfg.fx.fogAir; }
    scene.fog.density = dens;
    pUniformsShared.uFogDensity.value = dens;
    // ---- particle lighting from the flashlight (and the lantern) ----
    pUniformsShared.uLP.value.copy(lamp.pos); pUniformsShared.uLD.value.copy(lamp.dir); pUniformsShared.uOn.value = lamp.on;
    if (lamp.cosOuter) { pUniformsShared.uCosO.value = lamp.cosOuter; pUniformsShared.uCosI.value = lamp.cosInner; }
    pUniformsShared.uNear.value = lamp.headlamp ? 0.9 : 0.25; // a mask headlamp lights up the specks right in front of you
    var lv = P.lanternLevel || 0;
    pUniformsShared.uL2.value = lv * 0.22;
    pUniformsShared.uL2P.value.copy(camera.position).addScaledVector(P.right, 0.2).addScaledVector(P.fwd, 0.45);
    pUniformsShared.uPx.value = renderer.domElement.height / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
    snowMat.uniforms.uDay.value = day * 0.6; bubMat.uniforms.uDay.value = day * 0.5; siltMat.uniforms.uDay.value = day * 0.3; bloodMat.uniforms.uDay.value = day * 0.25; debMat.uniforms.uDay.value = day * 0.4;
    // ---- marine snow ----
    var pa = snow.geometry.attributes.position.array, c = camera.position, H = SNOW_BOX / 2, i;
    var cx = (P.currentSpeed || 0) > 0.05 && env && env.current ? env.current : null;
    for (i = 0; i < SNOW_N; i++) {
      var x = pa[i * 3] + snowVel[i * 3] * dt, y = pa[i * 3 + 1] + snowVel[i * 3 + 1] * dt, z = pa[i * 3 + 2] + snowVel[i * 3 + 2] * dt;
      if (cx) { x += cx.x * dt; y += cx.y * dt; z += cx.z * dt; } // currents carry the specks too
      if (x - c.x > H) x -= SNOW_BOX; else if (x - c.x < -H) x += SNOW_BOX;
      if (y - c.y > H) y -= SNOW_BOX; else if (y - c.y < -H) y += SNOW_BOX;
      if (z - c.z > H) z -= SNOW_BOX; else if (z - c.z < -H) z += SNOW_BOX;
      pa[i * 3] = x; pa[i * 3 + 1] = y; pa[i * 3 + 2] = z;
    }
    snow.geometry.attributes.position.needsUpdate = true;
    snow.visible = !headInAir;
    // ---- bubbles: rise, wobble, pool on the ceiling and creep uphill, pop at a water surface ----
    pa = bubbles.geometry.attributes.position.array;
    var sa = bubbles.geometry.attributes.aSize.array, aa = bubbles.geometry.attributes.aAlpha.array;
    var tmp = { x: 0, y: 0, z: 0 };
    for (i = 0; i < BUB_N; i++) {
      if (bub.life[i] <= 0) { aa[i] = 0; continue; }
      bub.age[i] += dt;
      if (bub.age[i] > bub.life[i]) { bub.life[i] = 0; aa[i] = 0; continue; }
      var sy = P.surfaceY;
      if (!bub.stuck[i]) {
        bub.vy[i] = Math.min(bub.vy[i] + dt * 0.9, 0.55 + bub.size[i] * 12);
        bub.vx[i] *= 1 - dt * 1.2; bub.vz[i] *= 1 - dt * 1.2;
        var wob = Math.sin(bub.age[i] * 18 + i) * 0.12;
        bub.x[i] += (bub.vx[i] + wob) * dt; bub.y[i] += bub.vy[i] * dt; bub.z[i] += (bub.vz[i] + Math.cos(bub.age[i] * 15 + i) * 0.12) * dt;
        if ((i + frameNo) % 2 === 0) {
          tmp.x = bub.x[i]; tmp.y = bub.y[i]; tmp.z = bub.z[i];
          var hit = TU.cave.collide(tmp, 0.06, { hint: bub.hint[i] });
          if (hit.hit) { bub.stuck[i] = 1; bub.x[i] = hit.pos.x; bub.y[i] = hit.pos.y; bub.z[i] = hit.pos.z; bub.nx[i] = hit.normal.x; bub.nz[i] = hit.normal.z; bub.life[i] = Math.min(bub.life[i], bub.age[i] + 4 + Math.random() * 5); }
          if (sy != null && bub.y[i] > sy && Math.abs(bub.x[i] - P.pos.x) < 14 && Math.abs(bub.z[i] - P.pos.z) < 14) { if (Math.random() < 0.35) spawnRipple(bub.x[i], sy, bub.z[i]); bub.life[i] = 0; aa[i] = 0; continue; }
        }
      } else {
        // a pooled bubble slides along the rock toward higher ground, slowly growing as others join it
        bub.x[i] += (bub.nx[i] * 0.06 + Math.sin(t + i) * 0.015) * dt; bub.z[i] += (bub.nz[i] * 0.06 + Math.cos(t * 0.7 + i) * 0.015) * dt; bub.y[i] += 0.03 * dt;
        if ((i + frameNo) % 6 === 0) { tmp.x = bub.x[i]; tmp.y = bub.y[i]; tmp.z = bub.z[i]; var h2 = TU.cave.collide(tmp, 0.06, { hint: bub.hint[i] }); bub.x[i] = h2.pos.x; bub.y[i] = h2.pos.y; bub.z[i] = h2.pos.z; if (h2.hit) { bub.nx[i] = h2.normal.x; bub.nz[i] = h2.normal.z; } }
        bub.size[i] = Math.min(bub.size[i] * (1 + dt * 0.04), 0.09);
      }
      pa[i * 3] = bub.x[i]; pa[i * 3 + 1] = bub.y[i]; pa[i * 3 + 2] = bub.z[i];
      sa[i] = bub.size[i] * (bub.stuck[i] ? 1.6 : 1) * 2.2;
      aa[i] = smooth(0, 0.05, bub.age[i]) * smooth(bub.life[i], bub.life[i] - 1.0, bub.age[i]);
    }
    bubbles.geometry.attributes.position.needsUpdate = true; bubbles.geometry.attributes.aSize.needsUpdate = true; bubbles.geometry.attributes.aAlpha.needsUpdate = true;
    // ---- silt: slow drift, settle, and measure how much is around the camera ----
    pa = silt.geometry.attributes.position.array; sa = silt.geometry.attributes.aSize.array; aa = silt.geometry.attributes.aAlpha.array;
    var local = 0;
    for (i = 0; i < SILT_N; i++) {
      if (sl.life[i] <= 0) { aa[i] = 0; continue; }
      sl.age[i] += dt; var a = sl.age[i], L = sl.life[i];
      if (a > L) { sl.life[i] = 0; aa[i] = 0; continue; }
      var dr = Math.exp(-dt * 0.9);
      sl.vx[i] *= dr; sl.vy[i] = sl.vy[i] * dr - dt * 0.03; sl.vz[i] *= dr;
      sl.x[i] += sl.vx[i] * dt + N.n3(sl.x[i] * 0.3, t * 0.1, i) * 0.04 * dt; sl.y[i] += sl.vy[i] * dt; sl.z[i] += sl.vz[i] * dt;
      if (cx) { sl.x[i] += cx.x * dt * 0.7; sl.y[i] += cx.y * dt * 0.7; sl.z[i] += cx.z * dt * 0.7; }
      pa[i * 3] = sl.x[i]; pa[i * 3 + 1] = sl.y[i]; pa[i * 3 + 2] = sl.z[i];
      var g = a / L;
      sa[i] = lerp(sl.s0[i], sl.s1[i], Math.sqrt(Math.min(1, a / (sl.big[i] ? 7 : 5))));
      var al = smooth(0, 0.7, a) * Math.pow(1 - g, 1.3) * (sl.big[i] ? 0.2 : 0.34);
      aa[i] = al;
      var dx = sl.x[i] - c.x, dy = sl.y[i] - c.y, dz = sl.z[i] - c.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 16) local += al * (1 - Math.sqrt(d2) / 4) * (sl.big[i] ? 1.3 : 1);
    }
    silt.geometry.attributes.position.needsUpdate = true; silt.geometry.attributes.aSize.needsUpdate = true; silt.geometry.attributes.aAlpha.needsUpdate = true;
    siltDensity += (clamp(local / 22, 0, 1) - siltDensity) * (1 - Math.exp(-dt * 2.5));
    // ---- blood wisps: spread, drift, fade ----
    pa = blood.geometry.attributes.position.array; sa = blood.geometry.attributes.aSize.array; aa = blood.geometry.attributes.aAlpha.array;
    for (i = 0; i < BLOOD_N; i++) {
      if (bl.life[i] <= 0) { aa[i] = 0; continue; }
      bl.age[i] += dt; var ba = bl.age[i], bL = bl.life[i];
      if (ba > bL) { bl.life[i] = 0; aa[i] = 0; continue; }
      var bd = Math.exp(-dt * 1.4);
      bl.vx[i] *= bd; bl.vy[i] = bl.vy[i] * bd + dt * 0.008; bl.vz[i] *= bd;
      bl.x[i] += bl.vx[i] * dt + N.n3(bl.x[i] * 2, t * 0.3, i) * 0.03 * dt; bl.y[i] += bl.vy[i] * dt; bl.z[i] += bl.vz[i] * dt + N.n3(bl.z[i] * 2, t * 0.3, i + 7) * 0.03 * dt;
      if (cx) { bl.x[i] += cx.x * dt; bl.y[i] += cx.y * dt; bl.z[i] += cx.z * dt; }
      pa[i * 3] = bl.x[i]; pa[i * 3 + 1] = bl.y[i]; pa[i * 3 + 2] = bl.z[i];
      sa[i] = lerp(bl.s0[i], bl.s1[i], Math.sqrt(Math.min(1, ba / 3)));
      aa[i] = smooth(0, 0.25, ba) * Math.pow(1 - ba / bL, 1.5) * 0.55;
    }
    blood.geometry.attributes.position.needsUpdate = true; blood.geometry.attributes.aSize.needsUpdate = true; blood.geometry.attributes.aAlpha.needsUpdate = true;
    // ---- quake: debris rain and silt clouds while it lasts ----
    if (quakeFx.t > 0) {
      quakeFx.t -= dt;
      var rate = (40 + 60 * quakeFx.str) * smooth(0, 0.8, quakeFx.t);
      var nd = Math.floor(rate * dt + Math.random());
      if (nd > 0) spawnDebris(nd, { pos: c, radius: 4 });
      if (!headInAir && Math.random() < dt * (2 + quakeFx.str * 3)) spawnSilt(6 + Math.floor(quakeFx.str * 8), { pos: tmpPt(c.x + (Math.random() - 0.5) * 6, c.y, c.z + (Math.random() - 0.5) * 6), burst: true });
    }
    pa = debris.geometry.attributes.position.array; sa = debris.geometry.attributes.aSize.array; aa = debris.geometry.attributes.aAlpha.array;
    var wet = !headInAir;
    for (i = 0; i < DEB_N; i++) {
      if (db.life[i] <= 0) { aa[i] = 0; continue; }
      db.age[i] += dt;
      if (db.age[i] > db.life[i]) { db.life[i] = 0; aa[i] = 0; continue; }
      if (!db.rest[i]) {
        if (wet) { db.vy[i] = Math.max(db.vy[i] - 3 * dt, -1.1 - db.size[i] * 10); db.vx[i] *= 1 - dt; db.vz[i] *= 1 - dt; }
        else db.vy[i] -= 9.8 * dt;
        db.x[i] += db.vx[i] * dt; db.y[i] += db.vy[i] * dt; db.z[i] += db.vz[i] * dt;
        if (db.y[i] <= db.floor[i]) { db.y[i] = db.floor[i]; db.rest[i] = 1; db.life[i] = Math.min(db.life[i], db.age[i] + 2.5); if (wet && Math.random() < 0.12) spawnSilt(2, { pos: tmpPt(db.x[i], db.y[i] + 0.7, db.z[i]), burst: true, floorY: db.floor[i] }); }
      }
      pa[i * 3] = db.x[i]; pa[i * 3 + 1] = db.y[i]; pa[i * 3 + 2] = db.z[i];
      sa[i] = db.size[i];
      aa[i] = smooth(0, 0.1, db.age[i]) * smooth(db.life[i], db.life[i] - 0.8, db.age[i]);
    }
    debris.geometry.attributes.position.needsUpdate = true; debris.geometry.attributes.aSize.needsUpdate = true; debris.geometry.attributes.aAlpha.needsUpdate = true;
    // ---- ripples ----
    pa = ripples.geometry.attributes.position.array; sa = ripples.geometry.attributes.aSize.array; aa = ripples.geometry.attributes.aAlpha.array;
    for (i = 0; i < RIP_N; i++) {
      if (rp.life[i] <= 0) { aa[i] = 0; continue; }
      rp.age[i] += dt; var rg = rp.age[i] / rp.life[i];
      if (rg >= 1) { rp.life[i] = 0; aa[i] = 0; continue; }
      pa[i * 3] = rp.x[i]; pa[i * 3 + 1] = rp.y[i]; pa[i * 3 + 2] = rp.z[i];
      sa[i] = 0.04 + rg * 0.35; aa[i] = (1 - rg) * 0.6;
    }
    ripples.geometry.attributes.position.needsUpdate = true; ripples.geometry.attributes.aSize.needsUpdate = true; ripples.geometry.attributes.aAlpha.needsUpdate = true;
  }
  var tmpP = { x: 0, y: 0, z: 0 };
  function tmpPt(x, y, z) { tmpP.x = x; tmpP.y = y; tmpP.z = z; return tmpP; }

  // CSS overlays, the lens pass uniforms, the beam and the hints (once per rendered frame).
  var lensT = 0;
  function overlays(dt) {
    var P = TU.player.state, narc = P.narcosis || 0;
    lensT += dt || 0.016;
    var panicV = smooth(35, 100, P.panic);
    overlay.silt.style.opacity = (siltDensity * 0.85).toFixed(3);
    overlay.black.style.opacity = clamp(P.drown / (P.drownSeconds || cfg.air.drownSeconds), 0, 1).toFixed(3);
    overlay.hit.style.opacity = (P.hitFlash || 0).toFixed(3);
    var inDive = TU.state.current !== 'title' && TU.state.current !== 'loadout';
    if (post) {
      // the lens pass does narcosis and tunnel vision; the CSS layers only add a faint pulse
      overlay.narc.style.display = 'none';
      overlay.panic.style.opacity = (panicV * 0.25 * (0.6 + 0.4 * Math.sin(lensT * 6))).toFixed(3);
      if (canvas.dataset.sat) { canvas.dataset.sat = ''; canvas.style.filter = ''; }
      var u = post.u;
      u.uTime.value = lensT;
      u.uNarc.value = inDive ? narc : 0;
      u.uPanic.value = inDive ? panicV : 0;
      u.uFlood.value = inDive ? (P.maskWater || 0) : 0;
      u.uSlosh.value = P.maskSlosh || 0;
      u.uBlood.value = inDive ? (P.bloodMask || 0) : 0;
      u.uCold.value = inDive ? (P.cold || 0) : 0;
      u.uRag.value = inDive ? Math.max(P.rag || 0, clamp((P.daze || 0) / 2, 0, 0.7)) : 0;
      u.uShock.value = inDive ? (P.shock || 0) : 0;
      var s = drawSize(); u.uRes.value.set(s.x, s.y);
      // fade the hints with simulation time when it moved further (tests step the game without drawing)
      var simDt = hints.lastT == null ? 0.5 : time - hints.lastT; hints.lastT = time;
      updateHints(Math.min(Math.max(dt || 0.016, simDt < 0 ? 0.5 : simDt), 0.5));
    } else {
      overlay.panic.style.opacity = (panicV * (0.75 + 0.25 * Math.sin(lensT * 6))).toFixed(3);
      var nf = overlay.narc;
      if (narc > 0.01) { nf.style.display = 'block'; nf.style.opacity = narc.toFixed(3); } else nf.style.display = 'none';
      var satF = (1 - 0.55 * narc).toFixed(3);
      if (canvas.dataset.sat !== satF) { canvas.dataset.sat = satF; canvas.style.filter = narc > 0.01 ? 'saturate(' + satF + ') contrast(' + (1 - 0.08 * narc).toFixed(3) + ')' : ''; }
    }
    // flashlight beam cone (only in water)
    var lamp = TU.player.lamp;
    if (beam) {
      var headInAir = P.dry || P.surfaced;
      var I = (lamp.on || 0) * (headInAir ? 0.0 : 1) * (0.035 + siltDensity * 0.06) * (lamp.headlamp ? 0.6 : 1);
      beam.visible = I > 0.001 && inDive;
      if (beam.visible) {
        var len = clamp((lamp.hitDist || 12) + 0.5, 1.5, 13);
        var ang = Math.acos(clamp(lamp.cosOuter || Math.cos(0.42), -1, 1)) * 0.85;
        beam.position.copy(lamp.pos);
        beam.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), lamp.dir);
        beam.scale.set(Math.tan(ang) * len, len, Math.tan(ang) * len);
        beam.material.uniforms.uI.value = I; beam.material.uniforms.uTime.value = lensT;
        beam.material.uniforms.uColor.value.copy(lamp.color || beam.material.uniforms.uColor.value);
      }
    }
  }

  TU.define('fx', {
    renderer: null,
    spawnSilt: spawnSilt,
    spawnBubbles: spawnBubbles,
    spawnBlood: spawnBlood,
    spawnDebris: spawnDebris,
    siltDensity: function () { return siltDensity; },
    setSiltDensity: function (v) { siltDensity = v; },
    shake: function (amount) { var P = TU.player.state; P.shake = Math.max(P.shake || 0, amount); },
    particleMaterial: particleMaterial,
    makePoints: makePoints,
    clear: clearParticles,
    render: render,
    // Hide the mask vignette and scanlines (for clean screenshots and filming).
    screenshotMode: function (on) { overlay.mask.style.display = overlay.scan.style.display = on ? 'none' : ''; },
    // true when the lens pass (post-processing) is running
    lensActive: function () { return !!post; },
    // For tests: how many glass hint shapes are on screen right now.
    hintCount: function () { return post ? post.u.uHintN.value : 0; },
    hintInfo: function () { return hints.info || null; }
  });

  TU.addSystem('fx', {
    init: function () { initRenderer(); initParticles(); TU.fx.renderer = renderer; TU.fx.handScene = handScene; TU.fx.handCamera = handCamera; },
    reset: function () { clearParticles(); overlay.black.style.opacity = 0; hints.key = ''; hints.list = []; },
    update: step,
    idle: step,
    frame: overlays
  });
  // Quakes shake the camera (player.js reads P.shake), drop rock chips and stir silt.
  TU.on('quake', function (e) { var s = e.strength == null ? 1 : e.strength; TU.fx.shake(1 + s); quakeFx.t = Math.max(quakeFx.t, e.duration || 2.5); quakeFx.str = s; if (TU.state.simulating()) spawnDebris(Math.round(20 + s * 30), { pos: camera.position, radius: 3 }); });
})();
