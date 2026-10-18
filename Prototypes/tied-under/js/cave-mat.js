/*
 * cave-mat.js: the look of the cave rock, formations and water surfaces (agent A, helper for cave.js).
 *
 * The rock is a normal three.js MeshStandardMaterial with extra shader code added through
 * onBeforeCompile. Everything is computed from the WORLD position of each pixel (3D noise read
 * from a small random texture), so there is no stretching or seams anywhere in the cave:
 *   - albedo variation: big blotches, limestone bedding bands with thin dark partings,
 *     mineral streaks (iron red-brown, manganese black, calcite white running down the walls)
 *   - relief: scallops (spoon-shaped dents carved by flowing water), grain and knobs, turned into
 *     a bumped normal so a grazing flashlight shows real-looking texture
 *   - wet look: shiny only in air (air pockets, dry chambers), matte under water (Art Direction)
 *   - zone tint from depth: cream limestone and moss near the entrance, tan-grey, cool grey,
 *     sulfur stains and bacterial mats in the Sulfur Deep, dark basalt-like rock and fossil specks
 *     in the Old Water
 *   - daylight and moving caustics near the entrance (baked visibility per vertex, aInfo.y)
 *   - flowstone drapes and rimstone dams where the cave is "decorated" (aInfo.z)
 *
 * Per-vertex attribute aInfo = (wet 0..1, daylight 0..1, decoration 0..1, scallops 0..1).
 * Exposed as TU.caveMat (internal to agent A's files).
 */
(function () {
  'use strict';
  if (!window.THREE) return;
  var TU = window.TU, T = THREE;

  var noiseTex = null;
  // Quality: on a software rasterizer (SwiftShader, llvmpipe: headless tests, no GPU) the rock
  // shader skips its finer optional layers so the game stays usable. Real GPUs get everything.
  var Q = { low: false, mats: [] };
  function setLow(on) { on = !!on; if (Q.low === on) return; Q.low = on; Q.mats.forEach(function (m) { m.needsUpdate = true; }); }
  function isSoftwareGL(renderer) {
    try {
      var gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      var name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      return /swiftshader|llvmpipe|software|softpipe/i.test(name);
    } catch (e) { return false; }
  }
  // 256x256 random texture for fast 3D value noise in the shader (one fetch per octave).
  // Green holds the value for slice z, red the value for slice z+1 (offset by 37,17 texels).
  function getNoiseTex() {
    if (noiseTex) return noiseTex;
    var S = 256, data = new Uint8Array(S * S * 4), base = new Uint8Array(S * S), r = TU.rng(7741, 11);
    for (var i = 0; i < S * S; i++) base[i] = r.below(256);
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var k = (y * S + x) * 4;
      data[k + 1] = base[y * S + x];
      data[k] = base[((y + 17) & 255) * S + ((x + 37) & 255)];
      data[k + 2] = base[((y + 101) & 255) * S + ((x + 59) & 255)];
      data[k + 3] = 255;
    }
    noiseTex = new T.DataTexture(data, S, S, T.RGBAFormat);
    noiseTex.wrapS = noiseTex.wrapT = T.RepeatWrapping;
    noiseTex.magFilter = T.LinearFilter; noiseTex.minFilter = T.LinearFilter; noiseTex.generateMipmaps = false;
    noiseTex.needsUpdate = true;
    return noiseTex;
  }

  // Shared uniforms (time for caustics, the diver's lamp for the water mirror).
  var shared = {
    uTime: { value: 0 },
    uNoise: { value: null },
    uDayCol: { value: new T.Color(0x9FE3D6) },
    uLampPos: { value: new T.Vector3() },
    uLampOn: { value: 0 }
  };

  var NOISE_GLSL = [
    'uniform sampler2D uNoise; uniform float uTime; uniform vec3 uDayCol;',
    'varying vec3 vWPos; varying vec4 vInfo;',
    'float vn(vec3 x){ vec3 p=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);',
    '  vec2 uv=(p.xy+vec2(37.0,17.0)*p.z)+f.xy; vec2 rg=texture2D(uNoise,(uv+0.5)/256.0).yx; return mix(rg.x,rg.y,f.z); }',
    'float fbm3(vec3 p){ return 0.55*vn(p)+0.3*vn(p*2.07+vec3(3.1,7.7,1.3))+0.15*vn(p*4.13+vec3(9.2,1.1,5.5)); }',
    // Perturb a view-space normal by a height field h given in meters (screen-space derivatives).
    'vec3 caveBump(vec3 sp, vec3 n, float h, float fd){',
    '  vec3 sx=dFdx(sp), sy=dFdy(sp); vec2 dh=vec2(dFdx(h),dFdy(h));',
    '  vec3 r1=cross(sy,n), r2=cross(n,sx); float det=dot(sx,r1)*fd;',
    '  vec3 gr=sign(det)*(dh.x*r1+dh.y*r2); return normalize(abs(det)*n-gr); }'
  ].join('\n');

  // opts: { info: true if the geometry has aInfo, calcite: 0..1 base decoration, rough: base roughness }
  function rockMaterial(opts) {
    opts = opts || {};
    var useInfo = opts.info !== false;
    var m = new T.MeshStandardMaterial({ vertexColors: true, roughness: opts.rough || 0.86, metalness: 0 });
    m.extensions = { derivatives: true };
    shared.uNoise.value = getNoiseTex();
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uNoise = shared.uNoise; sh.uniforms.uTime = shared.uTime; sh.uniforms.uDayCol = shared.uDayCol;
      sh.uniforms.uCalc = { value: opts.calcite || 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + (useInfo ? 'attribute vec4 aInfo;\n' : '') + 'varying vec3 vWPos; varying vec4 vInfo;')
        .replace('#include <worldpos_vertex>', [
          '#include <worldpos_vertex>',
          'vec4 cvW = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING',
          '  cvW = instanceMatrix * cvW;',
          '#endif',
          'cvW = modelMatrix * cvW; vWPos = cvW.xyz;',
          useInfo ? 'vInfo = aInfo;' : 'vInfo = vec4(0.0, 0.0, 1.0, 0.0);'
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', (Q.low ? '#define CAVE_LOW\n' : '') + '#include <common>\nuniform float uCalc;\n' + NOISE_GLSL)
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'vec3 wp = vWPos; float dep = -wp.y; vec3 baseCol = diffuseColor.rgb;',
          'vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);',
          'float wet = vInfo.x, day = vInfo.y, deco = clamp(vInfo.z + uCalc, 0.0, 1.0), scal = vInfo.w;',
          'float camD = length(vViewPosition);',
          'float fineFade = 1.0 - smoothstep(6.0, 22.0, camD);',
          'float big = fbm3(wp * 0.23);',
          'float mid = vn(wp * 1.31 + 4.0);',
          'float fine = vn(wp * 4.7 + 11.0);',
          '#ifdef CAVE_LOW',
          'float grain = 0.5;',
          '#else',
          'float grain = vn(wp * 15.0 + 3.0);',
          '#endif',
          // limestone bedding: warped horizontal layers with thin dark partings
          'float lay = wp.y * 0.85 + big * 1.6 + mid * 0.15;',
          'float layF = fract(lay);',
          '#ifdef CAVE_LOW',
          'float bandTone = mix(0.86, 1.1, smoothstep(0.15, 0.85, layF)), parting = 0.0;',
          '#else',
          'float bandTone = mix(0.86, 1.1, smoothstep(0.15, 0.85, layF)) * mix(0.93, 1.06, vn(vec3(floor(lay) * 3.7, 1.0, 2.0)));',
          'float layR = vn(vec3(floor(lay) * 5.3, 7.0, 1.0));',
          'float wallP = smoothstep(0.35, 0.8, 1.0 - abs(inverseTransformDirection(normalize(vNormal), viewMatrix).y));',
          // bedding planes: soft darker seams between some layers (no thin lines: they alias)
          'float parting = smoothstep(0.1, 0.0, abs(layF - 0.93)) * step(0.55, layR) * smoothstep(0.3, 0.6, vn(wp * vec3(0.5, 0.15, 0.5))) * wallP;',
          '#endif',
          'vec3 alb = diffuseColor.rgb * (0.72 + 0.42 * big) * (0.9 + 0.2 * mid) * mix(1.0, 0.92 + 0.16 * fine, fineFade) * bandTone;',
          'alb *= 1.0 - 0.22 * parting;',
          // mineral streaks running down the walls
          'float wall = 1.0 - abs(wn.y);',
          'float sv = vn(vec3(wp.x * 2.3, wp.y * 0.16, wp.z * 2.3) + 21.0);',
          'float iron = smoothstep(0.66, 0.84, sv) * wall * (0.6 + 0.4 * smoothstep(10.0, 80.0, dep));',
          'alb = mix(alb, vec3(0.30, 0.13, 0.06) * (0.7 + 0.5 * fine), iron * 0.62);',
          '#ifdef CAVE_LOW',
          'float calc = 0.0;',
          '#else',
          'float sm = vn(vec3(wp.x * 1.7 + 40.0, wp.y * 0.28, wp.z * 1.7));',
          'float mang = smoothstep(0.74, 0.88, sm) * smoothstep(0.3, 0.8, wall);',
          'alb = mix(alb, vec3(0.025, 0.022, 0.02), mang * 0.75);',
          'float cv = vn(vec3(wp.x * 3.1 - 17.0, wp.y * 0.22, wp.z * 3.1));',
          'float calc = smoothstep(0.7, 0.86, cv) * wall;',
          '#endif',
          // flowstone drapes and rimstone dams, only where the cave is decorated
          'float fold = 0.0, drape = 0.0, rim = 0.0;',
          'float floorW = smoothstep(0.55, 0.85, wn.y);',
          '#ifndef CAVE_LOW',
          'if (deco > 0.02) {',
          '  fold = sin((wp.x * 0.7 + wp.z * 0.7) * 8.0 + fine * 3.0 + big * 6.0);',
          '  drape = deco * smoothstep(0.35, 0.75, fbm3(wp * vec3(0.5, 0.12, 0.5) + 7.0)) * smoothstep(0.1, 0.6, wall);',
          '  if (floorW > 0.0) {',
          '    float rimN = fbm3(wp * vec3(0.55, 0.0, 0.55) + vec3(0.0, wp.y * 0.1, 0.0)) * 7.0;',
          '    rim = smoothstep(0.86, 0.97, fract(rimN)) * deco * floorW;',
          '    alb *= 1.0 - 0.18 * deco * floorW * (1.0 - smoothstep(0.0, 0.5, fract(rimN)));',
          '  }',
          '}',
          '#endif',
          'calc = max(calc, drape);',
          'vec3 calCol = mix(vec3(0.86, 0.80, 0.69), baseCol * 1.15, step(0.5, uCalc)) * (0.85 + 0.25 * mid);',
          'alb = mix(alb, calCol, calc * 0.78);',
          'alb = mix(alb, vec3(0.84, 0.79, 0.68), rim * 0.8);',
          // zone life and stains (each layer only at the depths where it exists)
          'if (day > 0.01) {',
          '  float moss = smoothstep(0.05, 0.5, day) * smoothstep(0.48, 0.66, big + 0.25 * mid) * smoothstep(-0.4, 0.3, wn.y);',
          '  alb = mix(alb, vec3(0.11, 0.17, 0.045) * (0.7 + 0.6 * fine), moss * 0.85);',
          '}',
          'float bio = 0.0;',
          '#ifndef CAVE_LOW',
          'if (dep > 35.0 && dep < 160.0) { bio = smoothstep(0.52, 0.7, vn(wp * 0.45 + 33.0)) * smoothstep(35.0, 90.0, dep) * (1.0 - smoothstep(120.0, 160.0, dep)); alb *= 1.0 - 0.45 * bio; }',
          'if (dep > 115.0 && dep < 215.0) {',
          '  float sulf = smoothstep(115.0, 135.0, dep) * (1.0 - smoothstep(195.0, 215.0, dep));',
          '  float sst = smoothstep(0.62, 0.8, vn(wp * vec3(0.9, 0.35, 0.9) + 61.0)) * sulf;',
          '  alb = mix(alb, vec3(0.45, 0.38, 0.09) * (0.75 + 0.4 * fine), sst * 0.7);',
          '  float mat = smoothstep(0.58, 0.75, vn(wp * 0.7 + 90.0)) * sulf * floorW;',
          '  alb = mix(alb, vec3(0.78, 0.76, 0.69), mat * 0.85);',
          '}',
          '#endif',
          'float old = smoothstep(190.0, 215.0, dep);',
          '#ifndef CAVE_LOW',
          'if (dep > 60.0) {',
          '  float fos = smoothstep(0.86, 0.9, vn(wp * 3.3 + 70.0)) * smoothstep(0.55, 0.7, vn(wp * 0.9 + 12.0)) * smoothstep(60.0, 100.0, dep);',
          '  alb = mix(alb, vec3(0.71, 0.66, 0.55), fos * 0.85);',
          '}',
          '#endif',
          'alb = mix(alb, alb * vec3(0.92, 0.95, 1.08), old * 0.6);',
          'diffuseColor.rgb = alb;',
          // relief height (meters) for the bumped normal
          '#ifdef CAVE_LOW',
          'float scallop = 0.5;',
          '#else',
          'float sc = vn(wp * 2.1 + 5.0); float scallop = pow(1.0 - abs(2.0 * sc - 1.0), 2.0);',
          '#endif',
          'float hgt = 0.09 * big + 0.035 * mid + fineFade * (0.012 * fine + 0.0035 * grain);',
          'hgt += (0.025 + 0.05 * scal) * scallop * (0.4 + 0.6 * wall);',
          'hgt += 0.018 * smoothstep(0.82, 1.0, layF) * wall;',
          'hgt += drape * 0.02 * fold + rim * 0.02 + calc * 0.006 * fine;',
          'hgt *= 1.0 + 0.4 * old;'
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', [
          '#include <roughnessmap_fragment>',
          'roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * mid) - 0.12 * calc - 0.08 * bio, 0.3, 1.0);',
          'roughnessFactor = mix(roughnessFactor, 0.36 + 0.3 * fine, wet);'
        ].join('\n'))
        .replace('#include <normal_fragment_maps>', [
          '#include <normal_fragment_maps>',
          'normal = caveBump(-vViewPosition, normal, hgt * (1.0 + 0.6 * wet), faceDirection);'
        ].join('\n'))
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          // daylight through the entrance, with moving caustics on surfaces that face up
          'if (day > 0.001) {',
          '  vec3 cq = vec3(wp.x * 0.9, wp.z * 0.9, uTime * 0.35);',
          '  float c1 = vn(cq), c2 = vn(cq * 1.7 + vec3(5.0, 3.0, uTime * 0.21));',
          '  float caus = pow(1.0 - abs(c1 - c2) * 2.0, 7.0) * smoothstep(-0.2, 0.7, wn.y);',
          '  totalEmissiveRadiance += diffuseColor.rgb * uDayCol * day * day * (0.12 + 0.8 * caus);',
          '}'
        ].join('\n'));
    };
    m.customProgramCacheKey = function () { return 'caveRock' + (useInfo ? 1 : 0) + '_' + (opts.calcite || 0) + (Q.low ? '_low' : ''); };
    Q.mats.push(m);
    return m;
  }

  // Water surface for air pockets, dry chamber pools and the entrance. From below it looks like
  // a silver mirror near your light (total internal reflection), from above dark and glassy.
  function waterMaterial() {
    var wn = TU.tex.get('waterNormal').clone(); wn.needsUpdate = true; wn.wrapS = wn.wrapT = T.RepeatWrapping; wn.repeat.set(3, 3);
    var m = new T.MeshStandardMaterial({ color: 0x0b2328, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.9, side: T.DoubleSide, normalMap: wn, normalScale: new T.Vector2(0.45, 0.45), depthWrite: false });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uLampPos = shared.uLampPos; sh.uniforms.uLampOn = shared.uLampOn;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLampPos; uniform float uLampOn; varying vec3 vWPos;')
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          'float below = gl_FrontFacing ? 0.0 : 1.0;',
          'vec3 vdir = normalize(vViewPosition);',
          'float graze = pow(1.0 - abs(dot(vdir, normal)), 2.5);',
          'float lampNear = uLampOn * (1.0 - smoothstep(1.5, 11.0, distance(vWPos, uLampPos)));',
          'totalEmissiveRadiance += vec3(0.55, 0.66, 0.68) * below * (0.08 + 0.9 * graze) * lampNear;',
          'totalEmissiveRadiance += vec3(0.04, 0.09, 0.1) * (1.0 - below) * graze * lampNear;'
        ].join('\n'));
    };
    m.customProgramCacheKey = function () { return 'caveWater'; };
    m.userData.normalTex = wn;
    return m;
  }

  function update(dt) {
    shared.uTime.value += dt;
    var L = TU.player && TU.player.lamp;
    if (L && L.pos) { shared.uLampPos.value.copy(L.pos); shared.uLampOn.value = L.on || 0; }
  }

  TU.caveMat = { setLow: setLow, isLow: function () { return Q.low; }, isSoftwareGL: isSoftwareGL, rockMaterial: rockMaterial, waterMaterial: waterMaterial, noiseTex: getNoiseTex, shared: shared, update: update };
})();
