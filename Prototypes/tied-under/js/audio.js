/*
 * audio.js: all sound, made live with the Web Audio API (no sound files yet).
 *
 * Signal chain: sounds -> 'env' bus (muffled low pass + cave reverb) or 'head' bus (your own breathing,
 * close and dry) -> narcosis low pass -> master gain -> compressor -> speakers.
 * Underwater the env bus is muffled hard (water carries low sounds, eats highs). With your head in an
 * air pocket or on dry land it opens up and becomes clear, like popping out of the water.
 *
 * Breathing (the most important sound in the game), built like a real regulator:
 *   inhale:  the demand valve clicks open, then air hisses through it (with a little flutter of the
 *            diaphragm and a thin first-stage whistle).
 *   exhale:  the exhaust valve burbles (a low rumble that pulses), then a burst of bubbles rolls up past
 *            your ears from right to left.
 *   In air you hear plain breaths instead. Panic makes it all louder, faster and more ragged.
 *
 * Continuous layers: low cave drone (deeper = louder), a soft chord near the ancient thing, current roar,
 * water gurgling in a flooded mask, wind while falling. Timed cues: low air beeps, heartbeat, drips,
 * rock creaks deep in the cave. Event sounds: kicks, hand pulls on rock, wall hits and dry-land thuds,
 * footsteps, splashes, cuts, tape rips, quakes, creature shocks and bites, tanks.
 *
 * The AudioContext can only start after a click, so main.js calls TU.audio.unlock() from the
 * "Begin dive" click. Owner: agent C.
 */
(function () {
  'use strict';
  var TU = window.TU, U = TU.util, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var Au = { ctx: null, on: false, muted: !!TU.save.data.settings.muted, loops: {}, volume: 1 };
  // Saved volume (agent D's settings slider, 0..1).
  try { var sv = TU.save.data.ui && TU.save.data.ui.settings && TU.save.data.ui.settings.volume; if (typeof sv === 'number') Au.volume = clamp(sv, 0, 1); } catch (e) { /* defaults */ }
  function masterGain() { return Au.muted ? 0 : 0.9 * Au.volume; }
  var timers = { beep: 0, heart: 0, drip: 0, creak: 6 };
  var quakeA = { t: 0 };

  function init() {
    if (Au.ctx) { if (Au.ctx.state === 'suspended') Au.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    var ctx = new AC(); Au.ctx = ctx;
    var master = ctx.createGain(); master.gain.value = masterGain();
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination); Au.master = master;
    // narcosis low pass on everything
    var narcLP = ctx.createBiquadFilter(); narcLP.type = 'lowpass'; narcLP.frequency.value = 18000; narcLP.connect(master); Au.narcLP = narcLP;
    // shared input for other modules' own synthesized sounds (predator tells, weapons, glow sticks):
    // TU.audio.ctx and TU.audio.out. It goes through narcosis, master volume and mute. Nobody opens a second context.
    var out = ctx.createGain(); out.gain.value = 1; out.connect(narcLP); Au.out = out;
    TU.audio.ctx = ctx; TU.audio.out = out;
    // environment bus: muffled plus reverb
    var env = ctx.createBiquadFilter(); env.type = 'lowpass'; env.frequency.value = 900; Au.env = env;
    var dry = ctx.createGain(); dry.gain.value = 0.8; env.connect(dry); dry.connect(narcLP);
    var conv = ctx.createConvolver(), len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    conv.buffer = ir; var wet = ctx.createGain(); wet.gain.value = 0.35; env.connect(conv); conv.connect(wet); wet.connect(narcLP); Au.wet = wet; Au.conv = conv;
    // head bus (your own breathing): a gentle low pass that closes a little underwater
    var headLP = ctx.createBiquadFilter(); headLP.type = 'lowpass'; headLP.frequency.value = 9000; headLP.connect(narcLP);
    var head = ctx.createGain(); head.gain.value = 1; head.connect(headLP); var hs = ctx.createGain(); hs.gain.value = 0.25; head.connect(hs); hs.connect(conv); Au.head = head; Au.headLP = headLP;
    // noise buffers: white and brown
    var nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; Au.noise = nb;
    var bb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), bd = bb.getChannelData(0), last = 0; for (i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; } Au.brown = bb;
    // crackle buffer: sparse random clicks (gravel, tape, electric crackle)
    var cb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), cd = cb.getChannelData(0); for (i = 0; i < cd.length; i++) cd[i] = Math.random() < 0.012 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.04; Au.crackle = cb;
    // drone
    var dg = ctx.createGain(); dg.gain.value = 0.0; dg.connect(env); Au.drone = dg;
    var br = ctx.createBufferSource(); br.buffer = bb; br.loop = true; var bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 160; br.connect(bl); bl.connect(dg); br.start();
    var o1 = ctx.createOscillator(); o1.frequency.value = 41; var g1 = ctx.createGain(); g1.gain.value = 0.22; o1.connect(g1); g1.connect(dg); o1.start();
    var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 61.5; var g2 = ctx.createGain(); g2.gain.value = 0.06; o2.connect(g2); g2.connect(dg); o2.start();
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; var lg = ctx.createGain(); lg.gain.value = 0.08; lfo.connect(lg); lg.connect(g1.gain); lfo.start();
    // ancient pad
    var pad = ctx.createGain(); pad.gain.value = 0; pad.connect(env); Au.pad = pad;
    [110, 164.8, 220.4, 329.6].forEach(function (f, k) { var o = ctx.createOscillator(); o.type = k === 3 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (k - 1.5) * 6; var g = ctx.createGain(); g.gain.value = [0.22, 0.14, 0.08, 0.05][k]; o.connect(g); g.connect(pad); o.start(); });
    buildLoops();
    Au.on = true;
    TU.audio.ready = true;
  }
  function nsrc(buf) { var s = Au.ctx.createBufferSource(); s.buffer = buf || Au.noise; s.loop = true; s.loopStart = Math.random(); return s; }
  function filt(type, f, q) { var b = Au.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function gainNode(v) { var g = Au.ctx.createGain(); g.gain.value = v || 0; return g; }
  function panner(v) { if (!Au.ctx.createStereoPanner) return gainNode(1); var p = Au.ctx.createStereoPanner(); p.pan.value = v || 0; return p; }

  // Continuous layers whose volume follows the game every step.
  function buildLoops() {
    var c = Au.ctx, L = Au.loops;
    // current roar: rushing water (band-passed noise with slow turbulence)
    L.roar = gainNode(0); L.roar.connect(Au.env);
    var rn = nsrc(Au.brown), rb = filt('bandpass', 420, 0.7), rh = nsrc(), rhb = filt('bandpass', 1300, 1.2), rhg = gainNode(0.25);
    rn.connect(rb); rb.connect(L.roar); rh.connect(rhb); rhb.connect(rhg); rhg.connect(L.roar); rn.start(); rh.start();
    var rl = c.createOscillator(); rl.frequency.value = 0.31; var rlg = gainNode(160); rl.connect(rlg); rlg.connect(rb.frequency); rl.start();
    L.roarBP = rb;
    // flooded mask gurgle: bubbly water right against your face
    L.gurgle = gainNode(0); L.gurgle.connect(Au.head);
    var gn = nsrc(), gb = filt('bandpass', 620, 3.5), gam = gainNode(0.5);
    gn.connect(gb); gb.connect(gam); gam.connect(L.gurgle); gn.start();
    var gl = c.createOscillator(); gl.type = 'square'; gl.frequency.value = 9; var glg = gainNode(0.45); gl.connect(glg); glg.connect(gam.gain); gl.start();
    var gl2 = c.createOscillator(); gl2.frequency.value = 0.8; var gl2g = gainNode(260); gl2.connect(gl2g); gl2g.connect(gb.frequency); gl2.start();
    L.gurgleLFO = gl;
    // purge hiss while blowing out the mask
    L.purge = gainNode(0); L.purge.connect(Au.head);
    var pn = nsrc(), pb = filt('bandpass', 2400, 0.9); pn.connect(pb); pb.connect(L.purge); pn.start();
    // wind while falling on dry land
    L.wind = gainNode(0); L.wind.connect(Au.narcLP);
    var wn = nsrc(), wb = filt('bandpass', 700, 0.5); wn.connect(wb); wb.connect(L.wind); wn.start();
    L.windBP = wb;
    // quake rumble bed
    L.rumble = gainNode(0); L.rumble.connect(Au.narcLP);
    var qn = nsrc(Au.brown), qb = filt('lowpass', 110, 0.8); qn.connect(qb); qb.connect(L.rumble); qn.start();
    var qo = c.createOscillator(); qo.frequency.value = 27; var qog = gainNode(0.35); qo.connect(qog); qog.connect(L.rumble); qo.start();
  }

  /* ------------------------------------------------------------------ */
  /* Sound recipes                                                       */
  /* ------------------------------------------------------------------ */
  // An envelope helper: attack, hold, release on a gain param.
  function env3(g, t, peak, a, h, r) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + h); g.gain.linearRampToValueAtTime(0, t + a + h + r); return t + a + h + r; }
  function blip(t, f, vol, out, rise) {
    var c = Au.ctx, o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (rise || 2.4), t + 0.045);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(vol, t + 0.005); og.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.09);
  }
  function noiseHit(t, type, f, q, vol, dur, out, buf) {
    var c = Au.ctx, s = nsrc(buf), b = filt(type, f, q), g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(b); b.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return b;
  }
  var SND = {
    // params: { dur (s), surfaced (bool, breathing air), panic (0..1) }
    inhale: function (p) {
      var c = Au.ctx, t = c.currentTime, dur = p.dur || 1.5, air = !!p.surfaced, panic = p.panic || 0;
      if (air) {
        // a plain breath in through the mouth
        var s0 = nsrc(), b0 = filt('bandpass', 900, 0.7), g0 = gainNode(0);
        b0.frequency.setValueAtTime(800, t); b0.frequency.linearRampToValueAtTime(1500 + panic * 600, t + dur);
        env3(g0, t, 0.06 * (1 + panic * 0.8), dur * 0.35, dur * 0.3, dur * 0.35);
        s0.connect(b0); b0.connect(g0); g0.connect(Au.head); s0.start(t, Math.random()); s0.stop(t + dur + 0.05);
        if (panic > 0.5) { var vo = c.createOscillator(); vo.type = 'triangle'; vo.frequency.value = 180 + panic * 60; var vg = gainNode(0); env3(vg, t, 0.012 * panic, 0.05, dur * 0.5, 0.2); vo.connect(vg); vg.connect(Au.head); vo.start(t); vo.stop(t + dur); }
        return;
      }
      // 1. demand valve cracks open: a click and a tiny metallic tick
      noiseHit(t, 'highpass', 3200, 0.7, 0.13 + panic * 0.05, 0.03, Au.head);
      var tk = c.createOscillator(); tk.frequency.value = 2400 + Math.random() * 300; var tkg = gainNode(0); tkg.gain.setValueAtTime(0.03, t); tkg.gain.exponentialRampToValueAtTime(0.0005, t + 0.04); tk.connect(tkg); tkg.connect(Au.head); tk.start(t); tk.stop(t + 0.05);
      // 2. the hiss of air through the valve, with diaphragm flutter
      var s = nsrc(), bp = filt('bandpass', 2400, 1.1), hsf = filt('highshelf', 4000); hsf.gain.value = 4;
      bp.frequency.setValueAtTime(1900, t); bp.frequency.linearRampToValueAtTime(2900 + panic * 500, t + dur * 0.6); bp.frequency.linearRampToValueAtTime(2300, t + dur);
      var g = gainNode(0), peak = 0.15 * (1 + panic * 0.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.06 + 0.08 * (1 - panic)); g.gain.setValueAtTime(peak * 0.92, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
      var fl = c.createOscillator(); fl.frequency.value = 17 + Math.random() * 8 + panic * 10; var flg = gainNode(peak * (0.12 + panic * 0.25)); fl.connect(flg); flg.connect(g.gain); fl.start(t); fl.stop(t + dur);
      s.connect(bp); bp.connect(hsf); hsf.connect(g); g.connect(Au.head); s.start(t, Math.random()); s.stop(t + dur + 0.05);
      // panic: the breath catches in the middle (a ragged gasp)
      if (panic > 0.6 && Math.random() < panic) { var tc = t + dur * (0.35 + Math.random() * 0.2); g.gain.setValueAtTime(peak, tc); g.gain.linearRampToValueAtTime(peak * 0.25, tc + 0.05); g.gain.linearRampToValueAtTime(peak, tc + 0.12); }
      // 3. the first stage's thin whistle
      var w = nsrc(), wb = filt('bandpass', 6800 + Math.random() * 900, 6), wg = gainNode(0);
      env3(wg, t, 0.018 + panic * 0.012, dur * 0.3, dur * 0.4, dur * 0.3);
      w.connect(wb); wb.connect(wg); wg.connect(Au.head); w.start(t, Math.random()); w.stop(t + dur + 0.05);
    },
    exhale: function (p) {
      var c = Au.ctx, t = c.currentTime, dur = p.dur || 2, air = !!p.surfaced, panic = p.panic || 0;
      if (air) {
        var s0 = nsrc(), b0 = filt('bandpass', 620, 0.7), g0 = gainNode(0);
        b0.frequency.setValueAtTime(700, t); b0.frequency.linearRampToValueAtTime(450, t + dur);
        g0.gain.setValueAtTime(0, t); g0.gain.linearRampToValueAtTime(0.055 * (1 + panic * 0.6), t + dur * 0.12); g0.gain.linearRampToValueAtTime(0, t + dur * 0.9);
        s0.connect(b0); b0.connect(g0); g0.connect(Au.head); s0.start(t, Math.random()); s0.stop(t + dur + 0.05);
        return;
      }
      // 1. exhaust valve burble: a low rumble that pulses as the valve flutters
      var r = nsrc(Au.brown), rl = filt('lowpass', 420 + panic * 200, 0.9), rg = gainNode(0), am = gainNode(0.5);
      rg.gain.setValueAtTime(0, t); rg.gain.linearRampToValueAtTime(0.55 * (1 + panic * 0.4), t + 0.08); rg.gain.setValueAtTime(0.5, t + dur * 0.55); rg.gain.linearRampToValueAtTime(0, t + dur * 0.9);
      var bo = c.createOscillator(); bo.type = 'square'; bo.frequency.value = 26 + Math.random() * 14 + panic * 10; var bog = gainNode(0.45); bo.connect(bog); bog.connect(am.gain); bo.start(t); bo.stop(t + dur);
      r.connect(rl); rl.connect(am); am.connect(rg); rg.connect(Au.head); r.start(t); r.stop(t + dur);
      // also heard through the water, deeper
      var r2 = nsrc(Au.brown), rl2 = filt('lowpass', 220), rg2 = gainNode(0);
      rg2.gain.setValueAtTime(0, t); rg2.gain.linearRampToValueAtTime(0.45, t + 0.1); rg2.gain.linearRampToValueAtTime(0, t + dur * 0.9);
      r2.connect(rl2); rl2.connect(rg2); rg2.connect(Au.env); r2.start(t); r2.stop(t + dur);
      // 2. the bubble cloud rolling up past your ears (right to left)
      var bub = nsrc(), bb = filt('bandpass', 500, 1.4), bg = gainNode(0), pan = panner(0.7);
      bb.frequency.setValueAtTime(420, t + 0.1); bb.frequency.linearRampToValueAtTime(1100, t + dur);
      bg.gain.setValueAtTime(0, t + 0.05); bg.gain.linearRampToValueAtTime(0.09 * (1 + panic * 0.3), t + dur * 0.35); bg.gain.linearRampToValueAtTime(0, t + dur);
      if (pan.pan) { pan.pan.setValueAtTime(0.75, t); pan.pan.linearRampToValueAtTime(-0.5, t + dur); }
      bub.connect(bb); bb.connect(bg); bg.connect(pan); pan.connect(Au.head); bub.start(t, Math.random()); bub.stop(t + dur + 0.05);
      var nB = 18 + Math.floor(Math.random() * 10) + Math.floor(panic * 10);
      for (var k = 0; k < nB; k++) {
        var tt = t + 0.05 + Math.pow(Math.random(), 0.8) * dur * 0.9, f = 240 + Math.random() * 700;
        blip(tt, f, 0.04 + Math.random() * 0.05, Math.random() < 0.6 ? Au.env : Au.head, 2 + Math.random());
      }
    },
    // A quick purge of the regulator / mask: a burst of hiss and bubbles.
    purge: function () {
      var c = Au.ctx, t = c.currentTime;
      noiseHit(t, 'bandpass', 2600, 0.8, 0.18, 0.5, Au.head);
      for (var k = 0; k < 14; k++) blip(t + Math.random() * 0.5, 300 + Math.random() * 500, 0.05, Au.env);
    },
    // params: { strength 0..1, dry (bool, on land or in air) }
    thump: function (p) {
      var c = Au.ctx, t = c.currentTime, str = clamp(p.strength || 0.5, 0.1, 1), out = p.dry ? Au.narcLP : Au.env;
      var s = nsrc(), lp = filt('lowpass', p.dry ? 900 : 220), g = gainNode(0);
      g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(str * (p.dry ? 0.7 : 1.1), t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      s.connect(lp); lp.connect(g); g.connect(out); s.start(t); s.stop(t + 0.5);
      var o = c.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.3); var og = gainNode(0);
      og.gain.setValueAtTime(str * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.4);
      if (p.dry) noiseHit(t, 'bandpass', 2200, 0.8, str * 0.25, 0.2, Au.narcLP, Au.crackle); // gravel
      else if (str > 0.4) noiseHit(t, 'bandpass', 900, 1.5, str * 0.1, 0.25, Au.head); // gear clatter on rock
    },
    // A body hitting rock after a fall (dry land).
    fall: function (p) {
      var c = Au.ctx, t = c.currentTime, str = clamp(p.strength || 0.8, 0.2, 1.5);
      SND.thump({ strength: Math.min(1, str), dry: true });
      noiseHit(t + 0.02, 'lowpass', 400, 0.7, 0.6 * str, 0.6, Au.narcLP, Au.brown);
      noiseHit(t + 0.03, 'bandpass', 1500, 0.6, 0.35 * str, 0.35, Au.narcLP, Au.crackle);
      // tanks clanking against the rock
      [0.06, 0.19].forEach(function (d, k) { metal(t + d, 0.06 * str / (k + 1)); });
    },
    // params: { strength } (0.8 normal, 1.3 sprint)
    kick: function (p) {
      var c = Au.ctx, t = c.currentTime, str = p.strength || 0.8;
      var s = nsrc(Au.brown), bp = filt('bandpass', 300, 0.8), g = gainNode(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * str, t + 0.12); g.gain.linearRampToValueAtTime(0, t + 0.45);
      s.connect(bp); bp.connect(g); g.connect(Au.env); s.start(t); s.stop(t + 0.5);
    },
    // A gloved hand pulling on rock (crawl mode).
    pull: function (p) {
      var t = Au.ctx.currentTime, str = p.strength || 0.8;
      noiseHit(t, 'bandpass', 1400, 1.2, 0.08 * str, 0.25, Au.env, Au.crackle);
      noiseHit(t + 0.05, 'bandpass', 500, 1, 0.12 * str, 0.3, Au.env, Au.brown);
    },
    // params: { strength, crouch, land, metal }
    footstep: function (p) {
      var t = Au.ctx.currentTime, str = p.strength || 0.5;
      if (p.metal) { metal(t, 0.07); return; }
      noiseHit(t, 'bandpass', 1800 + Math.random() * 800, 0.9, (p.land ? 0.18 : 0.07) * (0.6 + str), p.land ? 0.25 : 0.13, Au.narcLP, Au.crackle);
      noiseHit(t, 'lowpass', 300, 0.7, (p.land ? 0.3 : 0.08) * str, 0.12, Au.narcLP, Au.brown);
    },
    splash: function (p) {
      var c = Au.ctx, t = c.currentTime, str = clamp(p.strength || 0.5, 0.2, 1);
      var b = noiseHit(t, 'bandpass', 1800, 0.6, 0.35 * str, 0.6, Au.narcLP);
      b.frequency.setValueAtTime(2400, t); b.frequency.exponentialRampToValueAtTime(500, t + 0.5);
      for (var k = 0; k < 20; k++) blip(t + 0.05 + Math.random() * 0.7, 300 + Math.random() * 800, 0.04, Au.env);
    },
    // A fresh cut: a scrape and a sting.
    cut: function (p) {
      var t = Au.ctx.currentTime, sev = p.severity || 0.5;
      noiseHit(t, 'highpass', 2500, 0.8, 0.2 + sev * 0.15, 0.18, Au.head, Au.crackle);
      noiseHit(t, 'bandpass', 700, 2, 0.15 + sev * 0.2, 0.3, Au.env);
      var o = Au.ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2); var g = gainNode(0); g.gain.setValueAtTime(0.4 * sev, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(Au.env); o.start(t); o.stop(t + 0.3);
    },
    // Tape ripping off the roll (crackly tearing), twice.
    tape: function () {
      var c = Au.ctx, t = c.currentTime;
      [[0, 0.55], [0.75, 0.3]].forEach(function (seg) {
        var s = nsrc(Au.crackle), b = filt('bandpass', 2600, 0.8), g = gainNode(0), am = gainNode(0.5);
        var t0 = t + seg[0], d = seg[1];
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.6, t0 + 0.03); g.gain.setValueAtTime(0.6, t0 + d * 0.8); g.gain.linearRampToValueAtTime(0, t0 + d);
        var lf = c.createOscillator(); lf.type = 'square'; lf.frequency.value = 35 + Math.random() * 25; var lfg = gainNode(0.5); lf.connect(lfg); lfg.connect(am.gain); lf.start(t0); lf.stop(t0 + d);
        s.connect(b); b.connect(am); am.connect(g); g.connect(Au.head); s.start(t0, Math.random()); s.stop(t0 + d + 0.05);
        noiseHit(t0, 'bandpass', 5000, 1, 0.08, d, Au.head);
      });
    },
    pat: function () { var t = Au.ctx.currentTime; noiseHit(t, 'lowpass', 500, 0.7, 0.2, 0.1, Au.head, Au.brown); noiseHit(t + 0.15, 'lowpass', 500, 0.7, 0.15, 0.1, Au.head, Au.brown); },
    // Water rushing into the mask.
    flood: function () {
      var t = Au.ctx.currentTime;
      var b = noiseHit(t, 'bandpass', 900, 1.2, 0.35, 0.7, Au.head);
      b.frequency.setValueAtTime(1500, t); b.frequency.exponentialRampToValueAtTime(350, t + 0.6);
      for (var k = 0; k < 12; k++) blip(t + Math.random() * 0.6, 200 + Math.random() * 400, 0.06, Au.head, 1.6);
    },
    // Electric eel shock: harsh crackle and mains-like buzz.
    shock: function (p) {
      var c = Au.ctx, t = c.currentTime, str = clamp(p.strength || 1, 0.3, 2), d = 0.6 + str * 0.4;
      var s = nsrc(Au.crackle), b = filt('highpass', 1500, 0.7), g = gainNode(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7, t + 0.01); g.gain.setValueAtTime(0.6, t + d * 0.6); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(b); b.connect(g); g.connect(Au.head); s.start(t, Math.random()); s.stop(t + d + 0.05);
      var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58; var og = gainNode(0); env3(og, t, 0.12 * str, 0.01, d * 0.6, d * 0.4); var ob = filt('bandpass', 400, 1); o.connect(ob); ob.connect(og); og.connect(Au.head); o.start(t); o.stop(t + d + 0.05);
      // gating: the buzz stutters
      var gt = c.createOscillator(); gt.type = 'square'; gt.frequency.value = 13; var gtg = gainNode(0.5); gt.connect(gtg); gtg.connect(og.gain); gt.start(t); gt.stop(t + d);
    },
    // A bite: crunch and thud.
    bite: function (p) {
      var c = Au.ctx, t = c.currentTime, sev = p.severity || 0.7;
      noiseHit(t, 'bandpass', 1200, 0.9, 0.5 * sev, 0.2, Au.env, Au.crackle);
      noiseHit(t, 'lowpass', 250, 0.7, 0.7 * sev, 0.35, Au.env, Au.brown);
      var o = c.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25); var g = gainNode(0); g.gain.setValueAtTime(0.5 * sev, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(Au.env); o.start(t); o.stop(t + 0.35);
    },
    // Rock creaking somewhere in the cave (long, low, resonant groan).
    creak: function (p) {
      var c = Au.ctx, t = c.currentTime, d = 0.7 + Math.random() * 1.2, f = 55 + Math.random() * 90;
      var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.85 + Math.random() * 0.3), t + d);
      var fm = c.createOscillator(); fm.frequency.value = 6 + Math.random() * 14; var fmg = gainNode(f * 0.08); fm.connect(fmg); fmg.connect(o.frequency); fm.start(t); fm.stop(t + d);
      var b1 = filt('bandpass', 300 + Math.random() * 500, 8), g = gainNode(0);
      env3(g, t, (p && p.vol) || 0.18, d * 0.25, d * 0.4, d * 0.35);
      o.connect(b1); b1.connect(g); g.connect(Au.env); o.start(t); o.stop(t + d + 0.05);
      noiseHit(t + d * 0.3, 'bandpass', 1800, 2, 0.04, d * 0.5, Au.env, Au.crackle);
    },
    // A quake: crack, then the rumble bed swells (driven in step).
    quake: function (p) {
      var t = Au.ctx.currentTime, s = clamp(p.strength || 1, 0.3, 2);
      noiseHit(t, 'lowpass', 600, 0.7, 0.7 * s, 1.2, Au.narcLP, Au.brown);
      for (var k = 0; k < 5; k++) noiseHit(t + Math.random() * (p.duration || 2), 'bandpass', 900 + Math.random() * 1500, 1.5, 0.15 * s, 0.25, Au.env, Au.crackle);
    },
    metalClank: function (p) { metal(Au.ctx.currentTime, (p && p.vol) || 0.08); },
    grab: function () { var t = Au.ctx.currentTime; noiseHit(t, 'bandpass', 1100, 1.1, 0.1, 0.18, Au.env, Au.crackle); },
    whoosh: function () { var t = Au.ctx.currentTime; var b = noiseHit(t, 'bandpass', 500, 0.7, 0.25, 0.8, Au.env, Au.brown); b.frequency.setValueAtTime(300, t); b.frequency.linearRampToValueAtTime(900, t + 0.7); },
    glass: function () { var c = Au.ctx, t = c.currentTime; [1760, 2637, 3520].forEach(function (f, k) { var o = c.createOscillator(); o.frequency.value = f * (1 + Math.random() * 0.01); var g = gainNode(0); g.gain.setValueAtTime(0, t + k * 0.04); g.gain.linearRampToValueAtTime(0.02, t + k * 0.04 + 0.005); g.gain.exponentialRampToValueAtTime(0.0005, t + k * 0.04 + 0.6); o.connect(g); g.connect(Au.head); o.start(t + k * 0.04); o.stop(t + 0.8); }); },
    beep: function () {
      var c = Au.ctx, t = c.currentTime;
      for (var k = 0; k < 2; k++) { var o = c.createOscillator(); o.type = 'square'; o.frequency.value = 2100; var g = c.createGain(), tt = t + k * 0.16; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.025, tt + 0.005); g.gain.setValueAtTime(0.025, tt + 0.07); g.gain.linearRampToValueAtTime(0, tt + 0.08); o.connect(g); g.connect(Au.head); o.start(tt); o.stop(tt + 0.1); }
    },
    // params: { strength 0..1 }
    heart: function (p) {
      var c = Au.ctx, t = c.currentTime, str = p.strength || 0.5;
      [0, 0.17].forEach(function (d, k) { var o = c.createOscillator(); o.frequency.setValueAtTime(58, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.12); var g = c.createGain(); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(str * (k ? 0.25 : 0.4), t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.16); o.connect(g); g.connect(Au.head); o.start(t + d); o.stop(t + d + 0.2); });
    },
    drip: function () {
      var c = Au.ctx, t = c.currentTime, o = c.createOscillator(), f = 1200 + Math.random() * 1400;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.08); var g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g); g.connect(Au.env); o.start(t); o.stop(t + 0.14);
    },
    chime: function () {
      var c = Au.ctx, t = c.currentTime;
      [523.3, 784, 1046.5].forEach(function (f, k) { var o = c.createOscillator(); o.frequency.value = f; var g = c.createGain(), tt = t + k * 0.09; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.05, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.001, tt + 1.2); o.connect(g); g.connect(Au.env); o.start(tt); o.stop(tt + 1.3); });
    }
  };
  // Inharmonic ringing (a metal tank knocking on rock).
  function metal(t, vol) {
    var c = Au.ctx;
    [523, 1310, 2210, 3020].forEach(function (f, k) { var o = c.createOscillator(); o.frequency.value = f * (0.97 + Math.random() * 0.06); var g = gainNode(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol / (k + 1), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0004, t + 0.5 / (k * 0.5 + 1)); o.connect(g); g.connect(Au.env); o.start(t); o.stop(t + 0.6); });
  }
  function play(name, params) { if (!Au.on || !SND[name]) return; try { SND[name](params || {}); } catch (e) { console.error('[TU audio] ' + name, e); } }
  function setMuted(m) {
    Au.muted = !!m; TU.audio.muted = Au.muted;
    if (Au.master) Au.master.gain.value = masterGain();
    TU.save.set('settings.muted', Au.muted);
  }
  // Master volume 0..1 (the mute switch stays separate).
  function setVolume(v) {
    Au.volume = clamp(+v || 0, 0, 1); TU.audio.volume = Au.volume;
    if (Au.master) Au.master.gain.value = masterGain();
  }

  /* ------------------------------------------------------------------ */
  /* Per step: timed cues and continuous mix                             */
  /* ------------------------------------------------------------------ */
  var wasClearing = false;
  function step(dt) {
    if (!Au.on) return;
    var P = TU.player.state, A = TU.cfg.air;
    timers.beep -= dt; if (P.airTotal < A.lowAir && timers.beep <= 0) { play('beep'); timers.beep = P.airTotal < A.criticalAir ? 1.2 : 3.5; }
    var heartP = Math.max(smooth(55, 100, P.panic), smooth(40, 10, P.health == null ? 100 : P.health));
    timers.heart -= dt; if (heartP > 0 && timers.heart <= 0) { play('heart', { strength: heartP }); timers.heart = lerp(1.0, 0.45, heartP); }
    timers.drip -= dt; if ((P.surfaceY != null || P.dry) && timers.drip <= 0) { play('drip'); timers.drip = 0.6 + Math.random() * 2.5; }
    // rock creaks: more often deeper down
    timers.creak -= dt; if (timers.creak <= 0) { var z = P.zone || 0; if (z >= 1 || Math.random() < 0.3) play('creak', { vol: 0.08 + z * 0.04 }); timers.creak = lerp(26, 7, clamp(z / 4, 0, 1)) * (0.6 + Math.random() * 0.8); }
    if (P.maskClearing && !wasClearing) play('purge');
    wasClearing = P.maskClearing;
    if (quakeA.t > 0) quakeA.t -= dt;
    mix(dt);
  }
  function mix(dt) {
    if (!Au.on) return;
    var P = TU.player.state, env = P.env, air = P.surfaced || P.dry, bottom = TU.cave.features.bottom, L = Au.loops;
    Au.env.frequency.value = lerp(Au.env.frequency.value, air ? 6000 : 850, 0.1);
    Au.headLP.frequency.value = lerp(Au.headLP.frequency.value, air ? 12000 : 6500, 0.1);
    Au.wet.gain.value = lerp(Au.wet.gain.value, P.dry ? 0.5 : 0.35, 0.05);
    Au.drone.gain.value = lerp(Au.drone.gain.value, (air ? 0.25 : 0.55) + smooth(40, 200, env ? env.s : 0) * 0.3, 0.05);
    Au.narcLP.frequency.value = lerp(18000, 1400, (P.narcosis || 0) * 0.85);
    if (bottom) { var d = P.pos.distanceTo(bottom.pos); Au.pad.gain.value = smooth(30, 4, d) * 0.12 + smooth(60, 20, d) * 0.03; }
    if (L.roar) {
      var cs = P.currentSpeed || 0;
      L.roar.gain.value = lerp(L.roar.gain.value, smooth(0.3, 2.6, cs) * (air ? 0.3 : 0.9), 0.08);
      L.gurgle.gain.value = lerp(L.gurgle.gain.value, P.inWater ? clamp(P.maskWater || 0, 0, 1) * 0.35 : 0, 0.15);
      L.gurgleLFO.frequency.value = 6 + Math.random() * 8;
      L.purge.gain.value = lerp(L.purge.gain.value, P.maskClearing && P.inWater ? 0.12 : 0, 0.25);
      var falling = P.dry && P.vel ? clamp(-P.vel.y / 12, 0, 1) : 0;
      L.wind.gain.value = lerp(L.wind.gain.value, falling * 0.25, 0.2);
      L.windBP.frequency.value = 500 + falling * 900;
      L.rumble.gain.value = lerp(L.rumble.gain.value, (P.quake || 0) * 0.6 + (quakeA.t > 0 ? 0.15 : 0), 0.08);
    }
  }

  TU.define('audio', {
    ready: false,
    muted: Au.muted,
    unlock: init,
    setMuted: setMuted,
    setVolume: setVolume,
    volume: Au.volume,
    play: play,
    suspend: function () { if (Au.ctx && Au.ctx.state === 'running') Au.ctx.suspend(); },
    resume: function () { if (Au.ctx && Au.ctx.state === 'suspended') Au.ctx.resume(); },
    sounds: function () { return Object.keys(SND); }
  });

  // Event-driven sounds.
  TU.on('player:inhale', function (e) { play('inhale', e); });
  TU.on('player:exhale', function (e) { play('exhale', e); });
  TU.on('player:kick', function (e) { play('kick', e); });
  TU.on('player:pull', function (e) { play('pull', e); });
  TU.on('player:hit', function (e) { if (!e.fall) play('thump', e); });
  TU.on('player:fall', function (e) { play('fall', { strength: clamp(e.height / 8, 0.3, 1.5) }); });
  TU.on('player:footstep', function (e) { play('footstep', e); });
  TU.on('player:jump', function () { play('footstep', { strength: 0.4 }); });
  TU.on('player:splash', function (e) { play('splash', e); });
  TU.on('player:climb', function () { play('splash', { strength: 0.3 }); play('pull', { strength: 1 }); });
  TU.on('player:cut', function (e) { play('cut', e); });
  TU.on('player:tapeStart', function () { play('tape'); });
  TU.on('player:tape', function () { play('pat'); });
  TU.on('player:maskFlood', function () { play('flood'); });
  TU.on('player:shocked', function (e) { play('shock', e); });
  TU.on('player:bitten', function (e) { play('bite', e); });
  TU.on('player:stung', function (e) { play('cut', { severity: Math.min(0.35, (e.severity || 0.1) + 0.1) }); });
  TU.on('player:crushed', function () { play('fall', { strength: 1.5 }); play('quake', { strength: 0.6, duration: 1 }); });
  // Creature warnings (agent B): claws clicking before a pinch, an electric crackle before a shock.
  TU.on('creature:warn', function (e) {
    if (e.kind === 'pinch') { play('metalClank', { vol: 0.02 }); play('metalClank', { vol: 0.015 }); }
    else if (e.kind === 'shock') play('shock', { strength: 0.18 });
  });
  TU.on('player:grab', function (e) { if (e.on) play('grab'); });
  TU.on('player:currentEscape', function (e) { play(e.ok ? 'whoosh' : 'thump', { strength: 0.6 }); });
  TU.on('player:tankDrop', function () { play('metalClank', { vol: 0.06 }); });
  TU.on('player:tankPickup', function () { play('metalClank', { vol: 0.05 }); });
  TU.on('player:lantern', function (e) { if (e.out) play('glass'); });
  TU.on('waypoint:placed', function () { play('chime'); });
  TU.on('run:end', function (e) { if (e.won) play('chime'); });
  TU.on('quake', function (e) { quakeA.t = e.duration || 2.5; play('quake', e); });
  TU.on('state:change', function (e) {
    if (e.to === 'paused') TU.audio.suspend();
    else if (e.to === 'dive') TU.audio.resume();
  });

  TU.addSystem('audio', {
    init: function () { },
    reset: function () { timers.beep = timers.heart = timers.drip = 0; timers.creak = 8; quakeA.t = 0; },
    update: step,
    idle: function (dt) { mix(dt); }
  });
})();
