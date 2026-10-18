/*
 * ui-tutorial.js: Marv's practice dive (Tutorial Design.md), narrated over a cheap radio.
 *
 * A fixed easy seed and a list of steps. Each step shows one Marv line and the keys to press, then
 * waits for the player to actually do it (events and player state), never for a "Next" button.
 * Every step also has a time limit: if you dawdle, Marv sighs and moves on, so nobody gets stuck.
 * No fail states: Marv quietly tops up your air. Skip it any time from the pause menu.
 * Finishing (or skipping) pays $150 once and unlocks the Kevin sticker.
 *
 * Owner: agent D. Part of the ui system (see ui.js, K.part).
 */
(function () {
  'use strict';
  var TU = window.TU, K = TU.uiKit, U = TU.util, cfg = TU.cfg, $ = TU.$;
  if (!K) return;
  var TUT_SEED = 2026; // the practice hole is the same every time

  // Each step: id, line (Marv), keys (codes to show), done(st, P) -> bool, max (s, then auto-advance), late (Marv's sigh)
  var STEPS = [
    { id: 'look', line: 'Radio check. Can you hear me? Good. Look around. That\'s a cave. It wants you dead.', keys: ['Mouse'], max: 25,
      done: function (st) { return st.look > 1.2; }, late: 'Your neck works. I assume.' },
    { id: 'swim', line: 'Kick, then glide. You\'re a diver, not a washing machine.', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], max: 40,
      done: function (st, P) { return P.dist - st.dist0 > 8 || st.kicks >= 6; }, late: 'Swimming. Sort of. Moving on.' },
    { id: 'buoy', line: 'Hold B to breathe into your vest and float up. Hold V to suck it back and sink. Yes it\'s gross. Yes it\'s real.', keys: ['KeyB', 'KeyV'], max: 45,
      done: function (st) { return st.b && st.v; }, late: 'Buoyancy launch or sinking stone. Both are classics.' },
    { id: 'light', line: 'F is your flashlight. Off, then on again. Battery is not forever, so don\'t admire the rocks.', keys: ['KeyF'], max: 30,
      done: function (st) { return st.lightToggles >= 2; }, late: 'Fine. Stay in the dark. Very moody.' },
    { id: 'air', line: 'Top right is your air. Hold R to slow your breathing. Uses less air and calms you down.', keys: ['KeyR'], max: 35,
      done: function (st) { return st.slow > 1.5; }, late: 'Breathe however you want. It\'s your air.' },
    { id: 'pocket', line: 'See glassy bubbles shimmering up ahead? Air pocket. Surface in one and your tank refills. Free air. Best kind of air.', keys: [], max: 14,
      done: function (st) { return st.surfaced; }, late: 'Remember the shimmer. You\'ll want it later.' },
    { id: 'silt', line: 'Swim slow near the floor. Kick hard over silt and you go blind. If it all goes brown: stop. Wait. Hum something.', keys: ['ShiftLeft'], max: 14,
      done: function (st) { return st.siltCleared; }, late: 'Brown water is bad water. That\'s the lesson.' },
    { id: 'squeeze', line: 'Tight holes: go slow, arms first. Do not get stuck. I am not coming in there.', keys: [], max: 12,
      done: function (st, P) { return P.mode === 'squeeze' || (P.env && P.env.pieceType === 'squeeze'); }, late: 'Kevin got stuck in one of those. His flipper is still down there.' },
    { id: 'wp', line: 'Press Q to drop a waypoint right where you are. Name it something useful.', keys: ['KeyQ'], max: 45,
      done: function (st) { return st.wpNamed; }, late: 'No waypoint. Bold. Wrong, but bold.' },
    { id: 'wrist', line: 'Raise your wrist: hold Tab. Your computer projects a map of everywhere you\'ve been. Tap Tab to keep it up.', keys: ['Tab'], max: 40,
      done: function (st) { return st.wrist; }, late: 'It\'s on your wrist when you want it.' },
    { id: 'log', line: 'Find something alive, aim the tape with T and hold still. J opens your slate with everything you logged.', keys: ['KeyT', 'KeyJ'], max: 45,
      done: function (st) { return st.logged || st.slate; }, late: 'Moss. Measure moss. Thrilling science. Later.' },
    { id: 'tape', line: 'Cut yourself on rock? Tape it with X before you bleed out. Everything in life can be fixed with tape.', keys: ['KeyX'], max: 12,
      done: function (st, P) { return (P.injuries || []).some(function (i) { return i.taped; }); }, late: 'You\'ll get cut eventually. Tape. Remember tape.' },
    { id: 'current', line: 'Strong current? Don\'t fight it head on. Swim across it, grab the wall, then pull yourself out.', keys: [], max: 11,
      done: function () { return false; }, late: 'That\'s everything. Allegedly.' }
  ];

  TU.css('ui-tut', [
    '#ui-tut{position:fixed;left:50%;top:calc(var(--gt) + 92px);transform:translateX(-50%);z-index:4;width:min(580px, calc(100% - 32px));display:none;pointer-events:none}',
    '#ui-tut.ui-on{display:block}',
    '.ui-tut-card{display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:start;background:rgba(6,14,15,.86);border:1px solid rgba(255,201,138,.35);border-radius:6px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.5);pointer-events:auto}',
    '.ui-tut-card .ui-marv{width:48px;height:48px;border-color:rgba(255,201,138,.4)}',
    '.ui-tut-who{font-family:var(--mono);font-size:10.5px;letter-spacing:.24em;color:#FFC98A;display:flex;justify-content:space-between;gap:8px}',
    '.ui-tut-line{font-size:15px;line-height:1.45;color:#F2E9D8;margin:4px 0 8px}',
    '.ui-tut-keys{display:flex;gap:5px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--ink-dim)}',
    '.ui-tut-dots{display:flex;gap:3px;margin-top:8px}',
    '.ui-tut-dots i{width:14px;height:3px;background:rgba(255,201,138,.18)} .ui-tut-dots i.ui-on{background:#FFC98A} .ui-tut-dots i.ui-now{background:#4FF2D0}',
    '.ui-tut-ok{color:#4FF2D0;font-family:var(--mono);font-size:12px;letter-spacing:.18em}',
    '.ui-tut-fin .ui-btnrow{margin-top:10px}'
  ].join('\n'));

  var tut = K.tut = { active: false, pending: false, i: 0, t: 0, st: null, finished: false, okT: 0, kevinNamed: false };

  function fresh() { var P = TU.player.state; return { look: 0, yaw: P.yaw, pitch: P.pitch, dist0: P.dist || 0, kicks: 0, b: false, v: false, lightToggles: 0, slow: 0, surfaced: false, siltOut: false, siltCleared: false, wpNamed: false, wrist: false, logged: false, slate: false }; }
  function show(on) { var el = $('ui-tut'); if (el) el.classList.toggle('ui-on', !!on); }
  function renderStep(late) {
    var s = STEPS[tut.i]; if (!s) return;
    var keys = s.keys.map(function (k) { return '<kbd>' + K.esc(K.keyName(k)) + '</kbd>'; }).join('');
    $('ui-tut').innerHTML = '<div class="ui-tut-card"><div class="ui-marv">' + K.marvSVG() + '</div><div><div class="ui-tut-who"><span>MARV · RADIO</span><span>' + (tut.i + 1) + ' / ' + STEPS.length + '</span></div>' +
      (late ? '<div class="ui-tut-line" style="color:#FFC98A">"' + K.esc(late) + '"</div>' : '') +
      '<div class="ui-tut-line">"' + K.esc(s.line) + '"</div><div class="ui-tut-keys">' + keys + '<span style="margin-left:auto">Esc: menu, skip tutorial</span></div>' +
      '<div class="ui-tut-dots">' + STEPS.map(function (_, j) { return '<i class="' + (j < tut.i ? 'ui-on' : j === tut.i ? 'ui-now' : '') + '"></i>'; }).join('') + '</div></div></div>';
  }
  function next(late) {
    tut.i++; tut.t = 0; tut.st = fresh();
    if (tut.i >= STEPS.length) { finish(false); return; }
    renderStep(late);
    K.sfx('beep', { strength: 0.3 });
  }
  function finish(skipped) {
    if (!tut.active) return;
    tut.active = false; tut.finished = !skipped;
    var paid = K.tutorialReward ? K.tutorialReward() : false;
    if (skipped) { show(false); K.openCamp('dive', 'Fine. Go drown on your own time.' + (paid ? ' Here\'s a hundred and fifty bucks anyway.' : '')); return; }
    $('ui-tut').innerHTML = '<div class="ui-tut-card ui-tut-fin"><div class="ui-marv">' + K.marvSVG() + '</div><div><div class="ui-tut-who"><span>MARV · RADIO</span><span class="ui-tut-ok">PRACTICE HOLE DONE</span></div>' +
      '<div class="ui-tut-line">"Fine. You\'re not completely useless. Real cave\'s next. Don\'t die on my insurance."</div>' +
      '<div class="ui-tut-keys">' + (paid ? '<b style="color:#FFC98A">+$150 · Kevin sticker unlocked</b>' : 'No pay the second time. Marv is not a charity.') + '</div>' +
      '<div class="ui-btnrow"><button class="ui-btn ui-small" id="ui-tut-camp">Back to camp <kbd>Enter</kbd></button><button class="ui-btn ui-ghost ui-small" id="ui-tut-stay">Keep exploring <kbd>K</kbd></button></div></div></div>';
    $('ui-tut-camp').onclick = toCamp; $('ui-tut-stay').onclick = function () { show(false); };
  }
  function toCamp() { show(false); K.openCamp('dive', 'Practice is over. The real cave doesn\'t have Kevin in it. Probably.'); }
  tut.finish = finish;

  K.startTutorial = function () {
    tut.pending = true; tut.kevinNamed = false;
    TU.game.startDive({ seed: TUT_SEED, difficulty: 'easy', tutorial: true });
  };

  K.part('tutorial', {
    init: function () {
      TU.el('div', { id: 'ui-tut', attrs: { 'aria-live': 'polite' } });
      TU.on('run:start', function () {
        tut.active = tut.pending; tut.pending = false; tut.finished = false;
        if (!tut.active) { show(false); return; }
        tut.i = 0; tut.t = 0; tut.st = fresh(); renderStep(); show(true);
      });
      TU.on('player:light', function (e) { if (tut.active && e.reason === 'toggle') tut.st.lightToggles++; });
      TU.on('player:surfaced', function () { if (tut.active) tut.st.surfaced = true; });
      TU.on('player:kick', function () { if (tut.active) tut.st.kicks++; });
      TU.on('player:siltout', function () { if (tut.active) tut.st.siltOut = true; });
      TU.on('player:siltclear', function () { if (tut.active && tut.st.siltOut) tut.st.siltCleared = true; });
      TU.on('creature:logged', function () { if (tut.active) tut.st.logged = true; });
      K.on('wpname', function () { if (tut.active) tut.st.wpNamed = true; });
      K.on('wrist', function (e) { if (tut.active && e.raised) tut.st.wrist = true; });
      K.on('slate', function (e) { if (tut.active && e.open) tut.st.slate = true; });
      window.addEventListener('keydown', function (e) {
        var tag = (e.target && e.target.tagName) || '';
        if (e.repeat || tag === 'INPUT' || !tut.finished || !K.simulating() || !$('ui-tut').classList.contains('ui-on')) return;
        if (e.code === 'Enter') toCamp();
        else if (e.code === 'KeyK') show(false);
      });
    },
    state: function (e) {
      var sim = e.to === 'dive' || e.to === 'tutorial';
      if (!sim && e.to !== 'paused') { if (tut.active && e.to !== 'paused') tut.active = false; show(false); }
      else if (sim && (tut.active || tut.finished) && e.from === 'paused') show(true);
      else if (e.to === 'paused') show(false);
    },
    update: function (dt) {
      if (!tut.active) return;
      var P = TU.player.state, st = tut.st, keys = (TU.player.input && TU.player.input.keys) || {};
      st.look += Math.abs((P.yaw || 0) - st.yaw) + Math.abs((P.pitch || 0) - st.pitch); st.yaw = P.yaw || 0; st.pitch = P.pitch || 0;
      if (keys.KeyB) st.b = true; if (keys.KeyV) st.v = true;
      if (P.slow) st.slow += dt;
      // No fail states in the practice hole: Marv keeps your tanks topped up.
      if ((P.airTotal || 0) < 80) { TU.player.setAir(cfg.air.tankBar, true); K.msg('MARV: "Air\'s on me. This time."', 3); }
      tut.t += dt;
      var s = STEPS[tut.i];
      if (!s) return;
      if (s.done(st, P)) { K.msg('NICE', 1.2); next(null); }
      else if (tut.t > s.max) next(s.late);
    }
  });
})();
