/*
 * ui.js: the UI core. Everything on screen that is HTML starts here.
 *
 * What lives in this file:
 *   TU.uiKit (K)   small shared toolbox for the ui-*.js files: helpers, Marv's lines, the save
 *                  section for UI data (TU.save.data.ui), the screen router and "parts".
 *   Messages       #ui-msg (center), #ui-zone (big area banner), #ui-hint (top warning line).
 *   Title          "Tied Under" with Start, Continue, Settings, Controls.
 *   Story          the first-launch intro told by Marv Kessler, the grumpy dive instructor.
 *   Pause          resume, restart, back to camp, skip tutorial, plus the settings panel.
 *   Settings       feel (sensitivity, FOV, volume, reduce motion), HUD editor, controls list, game options.
 *   Results/Death  the dive slate: stats, funny awards, money, leaderboard places, END RUN or KEEP DIVING.
 *
 * Other UI files plug in as "parts" with K.part(name, { init, reset, update, idle, frame, state }):
 *   ui-hud.js (mask HUD, HUD editor, waypoint naming, toasts), ui-logbook.js (species book and the
 *   in-dive slate), ui-camp.js (Sump Camp hub, shop, economy), ui-locker.js (suit painter, 3D diver),
 *   ui-wrist.js (dive computer and hologram map), ui-tutorial.js (Marv's practice dive).
 *
 * Rules: ids start with #ui-, classes with .ui-. Game flow goes through TU.game.* (main.js).
 * Owner: agent D.
 */
(function () {
  'use strict';
  var TU = window.TU, U = TU.util, cfg = TU.cfg, clamp = U.clamp, fmtTime = U.fmtTime;
  var $ = TU.$;

  /* ------------------------------------------------------------------ */
  /* The UI kit shared by every ui-*.js file                             */
  /* ------------------------------------------------------------------ */
  var K = TU.uiKit = {
    parts: [],
    screens: { title: 'ui-title', paused: 'ui-pause', results: 'ui-results', dead: 'ui-dead' },
    run: null,          // what happened this dive (filled by the events below, read by results and the slate)
    bus: {}             // tiny private event list between ui parts (K.on / K.emit)
  };
  // Register a UI part. Hooks: init(), reset(run), update(dt), idle(dt), frame(dt), state(e).
  K.part = function (name, hooks) { hooks.name = name; K.parts.push(hooks); return hooks; };
  K.each = function (hook, arg) {
    for (var i = 0; i < K.parts.length; i++) {
      var p = K.parts[i];
      if (!p[hook]) continue;
      try { p[hook](arg); } catch (e) { console.error('[TU] ui part ' + p.name + '.' + hook + ' failed:', e); }
    }
  };
  K.on = function (n, fn) { (K.bus[n] = K.bus[n] || []).push(fn); };
  K.emit = function (n, p) { (K.bus[n] || []).slice().forEach(function (fn) { try { fn(p || {}); } catch (e) { console.error('[TU] ui bus ' + n, e); } }); };

  // Escape text before putting it into innerHTML.
  K.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  K.money = function (n) { n = Math.round(n || 0); return (n < 0 ? '-$' : '$') + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  K.cm = function (m) { return m == null ? '?' : (m < 1 ? (m * 100).toFixed(1) + ' cm' : m.toFixed(2) + ' m'); };
  K.sfx = function (name, params) { try { if (TU.audio && TU.audio.ready !== false) TU.audio.play(name, params || {}); } catch (e) { /* audio is optional */ } };
  K.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  K.simulating = function () { return TU.state.simulating(); };
  // Readable name of a KeyboardEvent.code.
  K.keyName = function (code) {
    var map = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', BracketLeft: '[', BracketRight: ']',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Mouse: 'Mouse', MouseLeft: 'Click', Wheel: 'Wheel', AltLeft: 'Alt', Backquote: '`' };
    if (map[code]) return map[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    return String(code);
  };

  // UI save section: TU.save.data.ui. Missing keys are filled with defaults (never overwritten).
  function uiDefaults() {
    return {
      storySeen: false, kevin: false, lifetimeCash: 0, tutorialPaid: false,
      settings: { volume: 0.8, reduceMotion: !!U.reducedMotion },
      hud: { layout: null },                 // filled by ui-hud.js
      locker: {
        suit: { zones: null, paint: null },  // filled by ui-locker.js
        mask: { frame: '#1f2a2e', strap: '#151a1c', style: 'oval' },
        fins: { preset: 'paddle', shape: 0.5, width: 0.5 }
      },
      stock: { tape: 3, flexTape: 0, glowSticks: 0 },
      haul: [], trophies: [],
      contracts: { offered: [], active: null, done: 0, round: -1 },
      camp: { station: 'dive', difficulty: 'standard', seedMode: 'random', seed: '' }
    };
  }
  function fill(target, defs) {
    for (var k in defs) {
      if (!Object.prototype.hasOwnProperty.call(defs, k)) continue;
      if (target[k] === undefined) target[k] = defs[k];
      else if (defs[k] && typeof defs[k] === 'object' && !Array.isArray(defs[k]) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) fill(target[k], defs[k]);
    }
    return target;
  }
  var filledFor = null;
  K.data = function () {
    var d = TU.save.data;
    if (!d.ui || filledFor !== d) { d.ui = fill(d.ui || {}, uiDefaults()); filledFor = d; }
    return d.ui;
  };
  K.write = function () { TU.save.write(); };
  K.cash = function () { return TU.save.data.money.cash || 0; };
  K.fins = function () { return TU.save.data.money.fins || 0; };
  // Change money. Positive cash also counts toward the camp's lifetime earnings.
  K.pay = function (cash, fins) {
    var m = TU.save.data.money;
    m.cash = Math.max(0, Math.round((m.cash || 0) + (cash || 0)));
    m.fins = Math.max(0, Math.round((m.fins || 0) + (fins || 0)));
    if (cash > 0) K.data().lifetimeCash += Math.round(cash);
    K.write(); K.emit('money', {});
  };

  /* ------------------------------------------------------------------ */
  /* Marv Kessler's lines (every insult hides a tip)                     */
  /* ------------------------------------------------------------------ */
  K.MARV = {
    story: [
      'So. You\'re the dive school dropouts.',
      'Failed buoyancy. Failed navigation. One of you failed "not panicking." Perfect. Nobody else will take this job.',
      'Some farmer found a cave under a sinkhole out here. Flooded. Deep. Nobody wants to map it.',
      'I\'m broke. You\'re broke. In the business we call that a partnership.',
      'You map it, you log what\'s down there, you bring me anything shiny. I pay you. Mostly.',
      'Before I let you anywhere near the real thing, you\'re doing the practice hole.'
    ],
    camp: [
      'Fire\'s not gonna dive for you.',
      'Oh, look who remembered they have a job.',
      'Every insult I give you is a tip. Write them down.',
      'Check your vest. Then check it again. Then dive.',
      'Slow breathing is free. Air is not.',
      'The rope is your mom now. You don\'t leave your mom.',
      'If it all goes brown, stop kicking. That\'s the whole lesson.'
    ],
    buy: ['Bigger tank. Good. Now you can be lost for longer.', 'Pleasure doing business. Mostly my pleasure.', 'Good choice. Don\'t tell anyone I said that.', 'That\'ll help. Not a lot. But some.'],
    lantern: 'You put glowing bugs in a cage and call it a flashlight. I did the same thing in \'89. Lost two fingers. Different story.',
    broke: ['You can\'t afford that. I can\'t afford that. Nobody here can afford anything.', 'Come back with money. Or a fossil. Preferably a fossil.'],
    sellJunk: ['A rock. You brought me a rock. Here\'s some money so you stop looking at me like that.', 'This is mostly mud. I\'ll take it. I like mud.'],
    sellGood: ['...Where did you find this. No, don\'t tell me. I\'ll just be jealous.', 'Now THAT is a find. Don\'t smile, it\'s unprofessional.'],
    contract: ['Oh, you\'re brave. Or stupid. In my experience, same thing.', 'Signed. No refunds. No take-backs. No crying.'],
    species: 'Never seen one of those. Which means it\'s either rare or you made it up.',
    end: {
      bottom: '...Huh. You actually did it. Don\'t tell anyone I said "huh."',
      drowned: 'So. You drowned. Did you at least log the thing that watched you do it?',
      bled: 'You bled out. In a cave. With tape in your pocket. The tape was for that.',
      crushed: 'Rocks one, you zero. The cave was here first.',
      quit: 'Called it early. Smartest thing you\'ve done all week.',
      endless: 'You went PAST the bottom. On purpose. I need to sit down.',
      other: 'Well. That happened. Paperwork for me, a lesson for you.'
    }
  };

  /* ------------------------------------------------------------------ */
  /* CSS                                                                 */
  /* ------------------------------------------------------------------ */
  // Handwriting font for the logbook and slates (Google Fonts only, as the artifact rules allow).
  TU.css('ui-fonts', "@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap');");
  TU.css('ui', [
    ':root{--ui-paper:#EDE6D3;--ui-pencil:#2B2B2B;--ui-slate:#ECEDE7;--ui-teal2:#2BB8C9;--ui-panel:#0A1014;--ui-hand:"Caveat","Segoe Print","Bradley Hand",cursive}',
    /* messages */
    '#ui-msgs{position:fixed;inset:0;pointer-events:none;z-index:2;font-family:var(--mono);color:var(--hud);text-shadow:0 0 8px rgba(79,242,208,.45)}',
    '#ui-msg{position:absolute;left:50%;bottom:calc(var(--gb) + 112px);transform:translateX(-50%);font-size:14px;letter-spacing:.12em;text-align:center;max-width:min(560px, calc(100% - 32px));opacity:0;transition:opacity .4s}',
    '#ui-zone{position:absolute;left:50%;top:24%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity 1.2s;width:min(640px, calc(100% - 32px))}',
    '#ui-zone .ui-z1{font-family:var(--display);font-weight:700;font-size:clamp(22px,4vw,40px);letter-spacing:.34em;color:#DFF;text-shadow:0 0 18px rgba(79,242,208,.35)}',
    '#ui-zone .ui-z2{font-size:13px;letter-spacing:.2em;color:var(--hud-dim);margin-top:6px}',
    '#ui-hint{position:fixed;top:calc(var(--gt) + 64px);left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--warn);text-align:center;max-width:min(520px, calc(100% - 32px));opacity:0;transition:opacity .4s;z-index:6;pointer-events:none}',
    /* screens */
    '.ui-screen{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:var(--gt) var(--gr) var(--gb) var(--gx);overflow-x:hidden;overflow-y:auto;z-index:5}',
    '.ui-screen.ui-on{display:flex}',
    '.ui-screen > *{margin:auto 0}',
    '.ui-overlay{z-index:7;background:rgba(1,5,6,.86);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
    '.ui-kicker{font-family:var(--mono);font-size:12px;letter-spacing:.32em;color:var(--hud-dim)}',
    '.ui-lead{font-size:15px;line-height:1.6;color:var(--ink-dim);max-width:52ch;margin:0 0 22px}',
    '.ui-lead b{color:var(--ink);font-weight:600}',
    '.ui-note{font-size:12.5px;color:var(--ink-dim);margin-top:14px;line-height:1.5}',
    /* buttons */
    '.ui-btn{font-family:var(--mono);font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#021412;background:var(--hud);border:0;padding:13px 22px;cursor:pointer;box-shadow:0 0 24px rgba(79,242,208,.3);border-radius:3px;pointer-events:auto;min-height:44px}',
    '.ui-btn:hover{filter:brightness(1.1)} .ui-btn:focus-visible,.ui-mbtn:focus-visible,.ui-chip:focus-visible{outline:2px solid #fff;outline-offset:3px}',
    '.ui-btn.ui-ghost{background:transparent;color:var(--hud);box-shadow:none;border:1px solid var(--line)}',
    '.ui-btn.ui-small{font-size:12px;padding:8px 12px;min-height:36px;letter-spacing:.12em}',
    '.ui-btn:disabled{opacity:.4;cursor:not-allowed;filter:none}',
    '.ui-btn.ui-danger{background:transparent;border:1px solid rgba(255,90,79,.5);color:var(--bad);box-shadow:none}',
    '.ui-btnrow{display:flex;gap:10px;flex-wrap:wrap;align-items:center}',
    '.ui-chip{font-family:var(--mono);font-size:12px;letter-spacing:.1em;padding:7px 11px;border:1px solid var(--line);background:rgba(4,14,16,.6);color:var(--ink-dim);border-radius:3px;cursor:pointer;min-height:34px}',
    '.ui-chip.ui-sel{border-color:var(--hud);color:var(--hud);box-shadow:inset 0 0 14px rgba(79,242,208,.15)}',
    '.ui-chip:disabled{opacity:.4;cursor:not-allowed}',
    'kbd,.ui-kbd{font-family:var(--mono);font-size:12px;color:var(--ink);border:1px solid rgba(217,239,234,.25);border-bottom-width:2px;padding:2px 6px;border-radius:3px;white-space:nowrap;background:rgba(255,255,255,.04)}',
    /* cards and panels (dark settings style per Art Direction: #0A1014 with teal) */
    '.ui-card{background:rgba(10,16,20,.94);border:1px solid var(--line);padding:20px 22px;position:relative;border-radius:4px}',
    '.ui-card h2{font-family:var(--mono);font-size:12px;font-weight:400;letter-spacing:.3em;color:var(--hud);margin:0 0 12px}',
    '.ui-panel{width:min(620px,100%)}',
    '.ui-panel h3{font-family:var(--display);font-size:clamp(26px,5vw,40px);letter-spacing:.12em;margin:4px 0 6px;color:#E8FFFA}',
    /* tabs */
    '.ui-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;border-bottom:1px solid var(--line);padding-bottom:10px}',
    '.ui-tab{font-family:var(--mono);font-size:12px;letter-spacing:.18em;background:none;border:1px solid transparent;color:var(--ink-dim);padding:8px 12px;cursor:pointer;border-radius:3px;min-height:36px}',
    '.ui-tab.ui-sel{color:var(--hud);border-color:var(--line);background:rgba(79,242,208,.06)}',
    /* settings */
    '.ui-set{display:grid;grid-template-columns:minmax(110px,auto) 1fr 56px;gap:10px 12px;align-items:center;font-size:13.5px;color:var(--ink-dim)}',
    '.ui-set input[type=range]{width:100%;accent-color:var(--hud);min-width:0}',
    '.ui-set output{font-family:var(--mono);color:var(--hud);text-align:right}',
    '.ui-checks{display:flex;flex-wrap:wrap;gap:10px 22px;margin:14px 0;font-size:13.5px;color:var(--ink-dim)}',
    '.ui-checks label{display:flex;gap:8px;align-items:center;cursor:pointer;min-height:32px}',
    '.ui-checks input{accent-color:var(--hud);width:17px;height:17px}',
    '.ui-set-adv{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}',
    '.ui-gfx{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:16px 0 4px;font-size:13.5px;color:var(--ink-dim)}',
    '.ui-gfx-l{min-width:110px} .ui-gfx-a{display:flex;gap:8px;align-items:center;cursor:pointer;min-height:32px} .ui-gfx-a input{accent-color:var(--hud);width:17px;height:17px}',
    '.ui-gfx-n{flex-basis:100%;font-size:12px;color:var(--ink-dim);opacity:.8}',
    '.ui-set-adv summary{cursor:pointer;font-family:var(--mono);font-size:12px;letter-spacing:.18em;color:var(--hud-dim);min-height:32px;display:flex;align-items:center}',
    '.ui-keys{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13.5px;color:var(--ink-dim);align-items:center}',
    '.ui-keys > span:nth-child(odd){display:flex;flex-wrap:wrap;gap:4px}',
    '.ui-keys h4{grid-column:1/-1;margin:10px 0 0;font-family:var(--mono);font-weight:400;font-size:11px;letter-spacing:.26em;color:var(--hud-dim)}',
    /* title */
    '#ui-title{background:linear-gradient(90deg, rgba(1,5,6,.92) 0%, rgba(1,5,6,.72) 42%, rgba(1,5,6,.18) 100%)}',
    '.ui-tt{width:min(1060px,100%);display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:40px;align-items:center}',
    '.ui-h1{font-family:var(--display);font-weight:700;font-size:clamp(54px,10vw,112px);line-height:.86;letter-spacing:.05em;margin:12px 0 8px;color:#E8FFFA;text-shadow:0 0 30px rgba(79,242,208,.2)}',
    '.ui-h1 em{font-style:normal;color:var(--hud);text-shadow:0 0 26px rgba(79,242,208,.55)}',
    '.ui-rope{display:block;width:min(420px,100%);height:26px;margin:-2px 0 16px}',
    '.ui-menu{display:flex;flex-direction:column;gap:8px;max-width:420px}',
    '.ui-mbtn{display:flex;align-items:baseline;gap:14px;text-align:left;background:rgba(4,14,16,.55);border:1px solid var(--line);color:var(--ink);padding:12px 16px;cursor:pointer;border-radius:3px;font:inherit;min-height:52px}',
    '.ui-mbtn b{font-family:var(--display);font-size:20px;letter-spacing:.14em;font-weight:700;min-width:118px;color:#E8FFFA}',
    '.ui-mbtn span{font-size:13px;color:var(--ink-dim)}',
    '.ui-mbtn:hover{border-color:var(--hud-dim);background:rgba(79,242,208,.06)}',
    '.ui-mbtn.ui-primary{border-color:var(--hud);background:linear-gradient(90deg, rgba(79,242,208,.18), rgba(79,242,208,.04));box-shadow:0 0 30px rgba(79,242,208,.12)}',
    '.ui-mbtn.ui-primary b{color:var(--hud)}',
    '#ui-mobile{display:none;border:1px solid rgba(255,180,92,.35);color:var(--warn);background:rgba(40,24,6,.4);padding:10px 12px;font-size:13px;line-height:1.5;margin-bottom:16px;max-width:420px}',
    '.ui-tt-side{display:flex;flex-direction:column;gap:14px}',
    '.ui-radio{display:grid;grid-template-columns:64px 1fr;gap:14px;align-items:start;background:rgba(10,16,20,.86);border:1px solid var(--line);padding:16px;border-radius:4px}',
    '.ui-radio q{display:block;font-size:15px;line-height:1.5;color:var(--ink);quotes:none}',
    '.ui-radio small{display:block;margin-top:8px;font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:var(--hud-dim)}',
    '.ui-marv{width:64px;height:64px;border-radius:50%;background:#16232a;border:1px solid var(--line);overflow:hidden;flex:none}',
    '.ui-marv svg{width:100%;height:100%;display:block}',
    /* story */
    '#ui-story{background:radial-gradient(120% 90% at 50% 100%, #10262a 0%, #050b0d 55%, #010304 100%);z-index:7}',
    '.ui-st{width:min(760px,100%);display:grid;grid-template-columns:180px 1fr;gap:28px;align-items:center}',
    '.ui-st-face{width:180px;height:180px;border-radius:50%;border:2px solid rgba(79,242,208,.35);box-shadow:0 0 50px rgba(79,242,208,.12);overflow:hidden;background:#13232a}',
    '.ui-st-face svg{width:100%;height:100%}',
    '.ui-st-name{font-family:var(--mono);font-size:12px;letter-spacing:.26em;color:var(--hud);margin-bottom:10px}',
    '.ui-st-name small{display:block;color:var(--ink-dim);letter-spacing:.14em;margin-top:4px}',
    '.ui-st-line{font-family:var(--display);font-size:clamp(20px,3.2vw,28px);line-height:1.35;color:#EAF7F4;min-height:5.6em}',
    '.ui-st-prog{display:flex;gap:6px;margin:14px 0 18px}',
    '.ui-st-prog i{width:22px;height:3px;background:var(--hud-faint)} .ui-st-prog i.ui-on{background:var(--hud)}',
    '.ui-st-scene{grid-column:1/-1;font-family:var(--mono);font-size:12px;letter-spacing:.2em;color:var(--hud-dim);text-align:center;opacity:.8}',
    /* pause */
    '#ui-pause{background:rgba(1,4,5,.78);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}',
    '.ui-pz{width:min(980px,100%);display:grid;grid-template-columns:260px 1fr;gap:18px;align-items:start}',
    '.ui-pz-side{display:flex;flex-direction:column;gap:10px}',
    '.ui-pz-side .ui-btn{width:100%}',
    '.ui-pz-stats{font-family:var(--mono);font-size:12px;color:var(--ink-dim);line-height:1.8;margin-top:6px}',
    '.ui-pz-stats b{color:var(--hud);font-weight:400}',
    /* end screens: the dive slate */
    '#ui-results,#ui-dead{background:rgba(1,4,5,.8);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}',
    '.ui-slate{width:min(860px,100%);background:linear-gradient(160deg,#F4F4EE,#DCDDD4);color:var(--ui-pencil);border-radius:14px;padding:26px 28px 22px;box-shadow:0 30px 80px rgba(0,0,0,.6), inset 0 0 0 6px #C9CBC0, inset 0 0 0 7px rgba(0,0,0,.12);position:relative}',
    '.ui-slate::before{content:"";position:absolute;top:12px;left:50%;width:44px;height:10px;margin-left:-22px;border-radius:6px;background:#9aa09a;box-shadow:inset 0 2px 3px rgba(0,0,0,.35)}',
    '.ui-slate .ui-kicker{color:#5d6660;margin-top:6px}',
    '.ui-slate h3{font-family:var(--display);font-size:clamp(30px,5.4vw,50px);letter-spacing:.08em;margin:6px 0 4px;color:#1d2522;line-height:1}',
    '.ui-slate.ui-dead h3{color:#7a1f1a}',
    '.ui-marvq{display:flex;gap:12px;align-items:center;margin:10px 0 14px;font-family:var(--ui-hand);font-size:22px;line-height:1.2;color:#2f3833}',
    '.ui-marvq .ui-marv{width:46px;height:46px;border-color:rgba(0,0,0,.2)}',
    '.ui-slate-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid rgba(0,0,0,.15);border-left:1px solid rgba(0,0,0,.15);margin:8px 0 16px}',
    '.ui-slate-grid div{padding:8px 10px;border-right:1px solid rgba(0,0,0,.15);border-bottom:1px solid rgba(0,0,0,.15);min-width:0}',
    '.ui-slate-grid span{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;color:#5d6660}',
    '.ui-slate-grid strong{font-family:var(--ui-hand);font-size:28px;font-weight:700;line-height:1.05;color:#1d2522;overflow-wrap:anywhere}',
    '.ui-slate-cols{display:grid;grid-template-columns:1.1fr 1fr;gap:18px}',
    '.ui-slate h4{font-family:var(--mono);font-weight:400;font-size:11px;letter-spacing:.24em;color:#5d6660;margin:0 0 8px}',
    '.ui-award{display:flex;gap:10px;align-items:flex-start;margin:0 0 10px}',
    '.ui-award i{flex:none;width:34px;height:34px;border-radius:50%;background:#1d2522;color:#F4F4EE;display:flex;align-items:center;justify-content:center;font-style:normal;font-family:var(--display);font-size:15px;transform:rotate(-8deg)}',
    '.ui-award b{display:block;font-family:var(--display);letter-spacing:.06em;font-size:15px}',
    '.ui-award small{font-family:var(--ui-hand);font-size:19px;line-height:1.1;color:#3a443e}',
    '.ui-earn{width:100%;border-collapse:collapse;font-size:13.5px}',
    '.ui-earn td{padding:4px 0;border-bottom:1px dashed rgba(0,0,0,.2)}',
    '.ui-earn td:last-child{text-align:right;font-family:var(--mono)}',
    '.ui-earn tr.ui-tot td{border-bottom:0;font-weight:700;font-size:15px;padding-top:8px}',
    '.ui-places{font-size:13px;color:#2f3833;margin:10px 0 0;line-height:1.6}',
    '.ui-places b{font-family:var(--display);letter-spacing:.06em}',
    '.ui-choice{display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:#1d2522;color:#EAF7F4;border-radius:8px;padding:12px 14px;margin:6px 0 14px}',
    '.ui-choice p{margin:0;flex:1 1 220px;font-size:14px;line-height:1.45}',
    '.ui-slate .ui-btn.ui-ghost{color:#1d2522;border-color:rgba(0,0,0,.3)}',
    '.ui-slate .ui-btn{box-shadow:none}',
    '.ui-slate-foot{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}',
    '@media (max-width: 860px){',
    '  .ui-tt{grid-template-columns:1fr;gap:22px}',
    '  #ui-title{background:linear-gradient(180deg, rgba(1,5,6,.9), rgba(1,5,6,.78))}',
    '  .ui-pz{grid-template-columns:1fr}',
    '  .ui-slate-grid{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '  .ui-slate-cols{grid-template-columns:1fr}',
    '}',
    '@media (max-width: 560px){',
    '  .ui-st{grid-template-columns:1fr;gap:14px;text-align:left}',
    '  .ui-st-face{width:110px;height:110px}',
    '  .ui-mbtn{flex-direction:column;gap:2px} .ui-mbtn b{min-width:0}',
    '  .ui-slate{padding:22px 16px 18px}',
    '  .ui-set{grid-template-columns:1fr 48px} .ui-set label{grid-column:1/-1;margin-bottom:-6px}',
    '}',
    '@media (prefers-reduced-motion: reduce){ #ui-zone,#ui-msg{transition:none} }'
  ].join('\n'));

  /* ------------------------------------------------------------------ */
  /* Marv's face (a small SVG, reused everywhere)                        */
  /* ------------------------------------------------------------------ */
  K.marvSVG = function () {
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<rect width="100" height="100" fill="#16262c"/>' +
      '<path d="M14 100c2-18 16-27 36-27s34 9 36 27z" fill="#5b4a36"/>' +                       // jacket
      '<path d="M40 74l10 12 10-12z" fill="#d9cdb7"/>' +                                        // shirt
      '<ellipse cx="50" cy="50" rx="21" ry="25" fill="#c99a78"/>' +                             // face
      '<path d="M29 56c2 16 10 24 21 24s19-8 21-24c-6 6-12 8-21 8s-15-2-21-8z" fill="#cfcac0"/>' + // beard
      '<path d="M38 62c4-3 8-3 12-1 4-2 8-2 12 1-4 1-8 2-12 1-4 1-8 0-12-1z" fill="#b8b2a6"/>' + // mustache
      '<path d="M35 44l11 2M54 46l11-2" stroke="#3b2c22" stroke-width="3" stroke-linecap="round"/>' + // grumpy brows
      '<circle cx="42" cy="50" r="2.4" fill="#1b1b1b"/><circle cx="58" cy="50" r="2.4" fill="#1b1b1b"/>' +
      '<path d="M26 36c2-14 12-20 24-20s22 6 24 20z" fill="#2c4a52"/>' +                         // cap
      '<path d="M22 37h34c-4 4-14 6-34 3z" fill="#22393f"/>' +                                    // brim
      '<rect x="40" y="22" width="20" height="7" rx="2" fill="#4FF2D0" opacity=".85"/>' +        // cap patch
      '<path d="M30 30h40" stroke="#16262c" stroke-width="2" opacity=".4"/>' +
      '</svg>';
  };

  /* ------------------------------------------------------------------ */
  /* Markup                                                              */
  /* ------------------------------------------------------------------ */
  function buildDom() {
    TU.el('div', { id: 'ui-msgs', html: '<div id="ui-zone"><div class="ui-z1" id="ui-z1"></div><div class="ui-z2" id="ui-z2"></div></div><div id="ui-msg"></div>' });
    TU.el('div', { id: 'ui-hint' });

    // Title screen
    var ropeSVG = '<svg class="ui-rope" viewBox="0 0 420 26" preserveAspectRatio="none" aria-hidden="true"><path d="M2 8 C 70 30, 120 -6, 190 12 S 320 26, 418 6" fill="none" stroke="#c9b48a" stroke-width="3" stroke-dasharray="7 3" stroke-linecap="round"/><path d="M2 8 C 70 30, 120 -6, 190 12 S 320 26, 418 6" fill="none" stroke="#4FF2D0" stroke-width="1" opacity=".5"/><circle cx="418" cy="6" r="3.5" fill="#4FF2D0"/></svg>';
    TU.el('section', { id: 'ui-title', className: 'ui-screen ui-on', attrs: { 'aria-label': 'Title' }, html: [
      '<div class="ui-tt"><div>',
      '<div class="ui-kicker">BAD BUOYANCY · BUILD ' + K.esc(TU.version) + '</div>',
      '<h1 class="ui-h1">TIED<br><em>UNDER</em></h1>', ropeSVG,
      '<p class="ui-lead">One flooded cave. One rope back to daylight. <b>Not enough air</b>, a dying flashlight, and a grumpy instructor who will not be coming in after you.</p>',
      '<div id="ui-mobile">This game needs a keyboard and mouse. Open it on a laptop or desktop for the real thing. You can still look around the camp, or try a rough touch dive.</div>',
      '<nav class="ui-menu" aria-label="Main menu">',
      '<button class="ui-mbtn" id="ui-btn-start"><b>Start</b><span id="ui-start-sub">Meet Marv. Learn the ropes.</span></button>',
      '<button class="ui-mbtn" id="ui-btn-loadout"><b>Continue</b><span id="ui-cont-sub">Back to Sump Camp</span></button>',
      '<button class="ui-mbtn" id="ui-btn-settings"><b>Settings</b><span>Feel, sound, HUD layout</span></button>',
      '<button class="ui-mbtn" id="ui-btn-controls"><b>Controls</b><span>Keyboard and mouse</span></button>',
      '<button class="ui-mbtn" id="ui-btn-touch" style="display:none"><b>Touch</b><span>Rough touch controls</span></button>',
      '</nav></div>',
      '<div class="ui-tt-side"><div class="ui-radio"><div class="ui-marv">' + K.marvSVG() + '</div><div><q id="ui-title-quip"></q><small>MARV KESSLER · YOUR INSTRUCTOR, ALLEGEDLY</small></div></div>',
      '<div class="ui-card" id="ui-title-card"></div></div>',
      '</div>'
    ].join('') });

    // Story (first launch): Marv's intro
    TU.el('section', { id: 'ui-story', className: 'ui-screen', attrs: { 'aria-label': 'Story' }, html: [
      '<div class="ui-st"><div class="ui-st-face">' + K.marvSVG() + '</div>',
      '<div><div class="ui-st-name">MARV KESSLER<small>Ex cave diver. Banned from most caves. Lives in his truck.</small></div>',
      '<div class="ui-st-line" id="ui-st-line" aria-live="polite"></div>',
      '<div class="ui-st-prog" id="ui-st-prog"></div>',
      '<div class="ui-btnrow" id="ui-st-btns"></div></div>',
      '<div class="ui-st-scene">THE BACK OF A RUSTY PICKUP · JUNGLE TRAIL · DUSK</div></div>'
    ].join('') });

    // Pause
    TU.el('section', { id: 'ui-pause', className: 'ui-screen', attrs: { 'aria-label': 'Paused' }, html: [
      '<div class="ui-pz"><div class="ui-card ui-pz-side"><div class="ui-kicker">PAUSED</div><h3 style="font-family:var(--display);font-size:30px;letter-spacing:.1em;margin:2px 0 8px;color:#E8FFFA">Hold your breath</h3>',
      '<button class="ui-btn" id="ui-btn-resume">Resume dive</button>',
      '<button class="ui-btn ui-ghost" id="ui-btn-restart1">Restart dive</button>',
      '<button class="ui-btn ui-ghost" id="ui-btn-skiptut" style="display:none">Skip tutorial</button>',
      '<button class="ui-btn ui-ghost" id="ui-btn-quit">Call the dive</button>',
      '<div class="ui-pz-stats" id="ui-pz-stats"></div></div>',
      '<div class="ui-card" id="ui-pz-set"></div></div>'
    ].join('') });

    // Settings and controls from the title screen
    TU.el('section', { id: 'ui-settings', className: 'ui-screen ui-overlay', attrs: { 'aria-label': 'Settings' }, html:
      '<div class="ui-card ui-panel" style="width:min(820px,100%)"><div class="ui-btnrow" style="justify-content:space-between;margin-bottom:6px"><div class="ui-kicker">SETTINGS</div><button class="ui-btn ui-ghost ui-small" id="ui-btn-set-close">Close</button></div><div id="ui-set-body"></div></div>' });

    ['results', 'dead'].forEach(function (k) {
      TU.el('section', { id: 'ui-' + k, className: 'ui-screen', attrs: { 'aria-label': k === 'dead' ? 'Dive over' : 'Results' }, html:
        '<div class="ui-slate' + (k === 'dead' ? ' ui-dead' : '') + '" id="ui-' + k + '-slate"></div>' });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Messages                                                            */
  /* ------------------------------------------------------------------ */
  var T = { msg: 0, zone: 0, hint: 0 };
  function msg(text, dur) { var m = $('ui-msg'); if (!m) return; m.textContent = text; m.style.opacity = 1; T.msg = dur || 3; }
  function zone(a, b) { $('ui-z1').textContent = a; $('ui-z2').textContent = b || ''; $('ui-zone').style.opacity = 1; T.zone = 4.5; }
  function hint(text, dur) { var h = $('ui-hint'); h.textContent = text; h.style.opacity = 1; T.hint = dur || 6; }
  function hideHint() { $('ui-hint').style.opacity = 0; T.hint = 0; }
  function tickTimers(dt) {
    if (T.msg > 0) { T.msg -= dt; if (T.msg <= 0) $('ui-msg').style.opacity = 0; }
    if (T.zone > 0) { T.zone -= dt; if (T.zone <= 0) $('ui-zone').style.opacity = 0; }
    if (T.hint > 0) { T.hint -= dt; if (T.hint <= 0) hideHint(); }
  }
  K.msg = msg; K.hint = hint;

  /* ------------------------------------------------------------------ */
  /* Screen router                                                       */
  /* ------------------------------------------------------------------ */
  var overlay = null;  // 'story' | 'settings' | null (sits on top of the state's screen)
  function show(state) {
    for (var k in K.screens) { var el = $(K.screens[k]); if (el) el.classList.toggle('ui-on', k === state && !overlay); }
    var st = $('ui-story'); if (st) st.classList.toggle('ui-on', overlay === 'story');
    var se = $('ui-settings'); if (se) se.classList.toggle('ui-on', overlay === 'settings');
  }
  K.overlay = function (name) { overlay = name || null; show(TU.state.current); };
  K.overlayOpen = function () { return overlay; };

  /* ------------------------------------------------------------------ */
  /* Title                                                               */
  /* ------------------------------------------------------------------ */
  function syncTitle() {
    var d = TU.save.data, ui = K.data(), returning = ui.storySeen || d.progress.runs > 0 || d.progress.tutorialDone;
    $('ui-btn-start').classList.toggle('ui-primary', !returning);
    $('ui-btn-loadout').classList.toggle('ui-primary', !!returning);
    $('ui-start-sub').textContent = returning ? 'Replay the intro and practice hole' : 'Meet Marv. Learn the ropes.';
    $('ui-cont-sub').textContent = returning ? 'Sump Camp · ' + K.money(K.cash()) + ' · deepest ' + d.progress.deepestM.toFixed(0) + ' m' : 'Skip straight to Sump Camp';
    $('ui-title-quip').textContent = returning ? K.pick(K.MARV.camp) : 'You\'re the dropouts? Great. Fantastic. The insurance company is gonna love this.';
    var p = d.progress, book = TU.logbook.count();
    $('ui-title-card').innerHTML = returning
      ? '<h2>YOUR DIVE RECORD</h2><div class="ui-keys"><span>Dives</span><span>' + p.runs + '</span><span>Bottoms reached</span><span>' + p.bottoms + '</span><span>Deepest</span><span>' + p.deepestM.toFixed(1) + ' m</span><span>Species logged</span><span>' + book + '</span><span>Time underwater</span><span>' + fmtTime(p.timeInCaveS) + '</span><span>Wallet</span><span>' + K.money(K.cash()) + ' · ' + K.fins() + ' FT</span></div>'
      : '<h2>THE JOB</h2><p class="ui-note" style="margin:0;font-size:14px">A flooded cave was found under a jungle sinkhole. Map it, log what lives down there, bring back anything that sells. Reach the bottom if you can. <b style="color:var(--ink)">The rope is the only way home.</b></p>';
  }

  /* ------------------------------------------------------------------ */
  /* Story                                                               */
  /* ------------------------------------------------------------------ */
  var story = { i: 0, shown: 0, full: '', done: false };
  function storyOpen() { story.i = 0; storyLine(); K.overlay('story'); }
  function storyLine() {
    var lines = K.MARV.story, n = lines.length;
    var last = story.i >= n;
    story.full = last ? 'You done this before?' : lines[story.i];
    story.shown = 0; story.done = false;
    $('ui-st-prog').innerHTML = lines.concat(['?']).map(function (_, i) { return '<i class="' + (i <= story.i ? 'ui-on' : '') + '"></i>'; }).join('');
    $('ui-st-btns').innerHTML = last
      ? '<button class="ui-btn" id="ui-st-no">No. Teach me.</button><button class="ui-btn ui-ghost" id="ui-st-yes">Yes. Obviously.</button>'
      : '<button class="ui-btn" id="ui-st-next">Next</button><button class="ui-btn ui-ghost" id="ui-st-skip">Skip intro</button>';
    if (last) {
      $('ui-st-no').onclick = function () { storyDone(false); };
      $('ui-st-yes').onclick = function () { storyDone(true); };
    } else {
      $('ui-st-next').onclick = storyNext;
      $('ui-st-skip').onclick = function () { story.i = n; storyLine(); };
    }
    if (U.reducedMotion || K.data().settings.reduceMotion) { story.shown = story.full.length; story.done = true; }
    $('ui-st-line').textContent = story.full.slice(0, story.shown);
  }
  function storyNext() {
    if (!story.done) { story.shown = story.full.length; story.done = true; $('ui-st-line').textContent = story.full; return; }
    if (story.i < K.MARV.story.length) { story.i++; storyLine(); }
  }
  // Typewriter effect (runs from the ui frame hook).
  function storyFrame(dt) {
    if (overlay !== 'story' || story.done) return;
    story.shown = Math.min(story.full.length, story.shown + dt * 46);
    if (story.shown >= story.full.length) story.done = true;
    $('ui-st-line').textContent = story.full.slice(0, Math.floor(story.shown));
  }
  function storyDone(skipTutorial) {
    var ui = K.data(); ui.storySeen = true; K.write();
    K.overlay(null);
    if (skipTutorial) {
      // Veterans still get the starter money and the Kevin sticker (Tutorial Design, section 6).
      if (K.tutorialReward) K.tutorialReward(true);
      openCamp('dive', 'Sure you have. Here\'s a hundred and fifty bucks anyway. Don\'t make me regret it.');
    } else if (K.startTutorial) K.startTutorial();
    else TU.game.startDive({ difficulty: 'easy' });
  }
  function openCamp(station, line) {
    if (K.camp && station) K.camp.select(station, line);
    TU.game.openLoadout();
  }
  K.openCamp = openCamp;

  /* ------------------------------------------------------------------ */
  /* Settings panel (used in pause and from the title)                   */
  /* ------------------------------------------------------------------ */
  // Simple tab strip. tabs: [{ id, label, render(el) }]
  K.tabs = function (root, tabs, active, onPick) {
    root.innerHTML = '<div class="ui-tabs" role="tablist"></div><div class="ui-tabbody"></div>';
    var bar = root.firstChild, body = root.lastChild;
    function pick(id) {
      Array.prototype.forEach.call(bar.children, function (b) { var on = b.getAttribute('data-id') === id; b.classList.toggle('ui-sel', on); b.setAttribute('aria-selected', on); });
      body.innerHTML = '';
      tabs.forEach(function (t) { if (t.id === id) t.render(body); });
      if (onPick) onPick(id);
    }
    tabs.forEach(function (t) {
      var b = TU.el('button', { className: 'ui-tab', text: t.label, attrs: { role: 'tab', 'data-id': t.id } }, bar);
      b.addEventListener('click', function () { pick(t.id); });
    });
    pick(active || tabs[0].id);
    return pick;
  };

  function saveTune() { var t = {}; cfg.tuneUI.forEach(function (row) { t[row[0]] = cfg.swim[row[0]]; }); TU.save.set('settings.tune', t); }
  function slider(grid, label, min, max, step, value, fmt, onInput) {
    var id = 'ui-s-' + Math.random().toString(36).slice(2, 8);
    var l = TU.el('label', { text: label, htmlFor: id }, grid);
    var r = TU.el('input', { type: 'range', min: min, max: max, step: step, value: value, id: id }, grid);
    var o = TU.el('output', { text: fmt(value) }, grid);
    r.addEventListener('input', function () { o.textContent = fmt(+r.value); onInput(+r.value); });
    return { label: l, input: r, out: o };
  }
  function applyVolume(v) {
    try {
      if (typeof TU.audio.setVolume === 'function') TU.audio.setVolume(v);
      else if (TU.audio.setMuted) TU.audio.setMuted(v <= 0.001 || !!TU.save.data.settings.muted);
    } catch (e) { /* audio optional */ }
  }
  function applyReduceMotion(on) {
    // Modules that read TU.util.reducedMotion live pick this up (see REQUESTS-D.md).
    U.reducedMotion = !!on;
    document.documentElement.classList.toggle('ui-reduce-motion', !!on);
  }
  function renderFeel(el) {
    var ui = K.data(), s = TU.save.data.settings;
    var g = TU.el('div', { className: 'ui-set' }, el);
    slider(g, 'Look sensitivity', 0.3, 2.5, 0.05, cfg.swim.sens, function (v) { return (+v).toFixed(2); }, function (v) { cfg.swim.sens = v; saveTune(); });
    slider(g, 'Field of view', 60, 95, 1, cfg.swim.fov, function (v) { return Math.round(v) + '°'; }, function (v) { cfg.swim.fov = v; saveTune(); });
    slider(g, 'Volume', 0, 100, 1, Math.round(ui.settings.volume * 100), function (v) { return Math.round(v) + '%'; }, function (v) { ui.settings.volume = v / 100; applyVolume(ui.settings.volume); K.write(); });
    // Graphics quality (fx.js): Low / Medium / High, plus the automatic resolution scaler.
    var gq = TU.fx.quality ? TU.fx.quality() : null;
    if (gq) {
      var gr = TU.el('div', { className: 'ui-gfx', html: '<span class="ui-gfx-l">Graphics</span><div class="ui-btnrow" role="radiogroup" aria-label="Graphics quality">' +
        ['low', 'medium', 'high'].map(function (q) { return '<button class="ui-chip' + (gq.name === q ? ' ui-sel' : '') + '" data-gfx="' + q + '" role="radio" aria-checked="' + (gq.name === q) + '">' + q.charAt(0).toUpperCase() + q.slice(1) + '</button>'; }).join('') +
        '</div><label class="ui-gfx-a"><input type="checkbox" id="ui-o-autoq"' + (gq.auto ? ' checked' : '') + '> Auto adjust resolution</label>' +
        '<small class="ui-gfx-n">' + (gq.software ? 'No GPU found: running the light version.' : 'Low turns off shadows and draws less far. Auto lowers the resolution if the game slows down.') + '</small>' }, el);
      Array.prototype.forEach.call(gr.querySelectorAll('[data-gfx]'), function (b) { b.addEventListener('click', function () { TU.fx.setQuality(b.getAttribute('data-gfx')); el.innerHTML = ''; renderFeel(el); }); });
      gr.querySelector('#ui-o-autoq').addEventListener('change', function (e) { TU.fx.setAutoQuality(e.target.checked); });
    }
    var c = TU.el('div', { className: 'ui-checks', html:
      '<label><input type="checkbox" id="ui-o-rm"> Reduce motion</label>' +
      '<label><input type="checkbox" id="ui-o-mute"> Mute audio</label>' +
      '<label><input type="checkbox" id="ui-o-tips"> Marv\'s tips</label>' +
      '<label><input type="checkbox" id="ui-o-fast"> Fast drain demo (air and light 3x)</label>' }, el);
    var rm = c.querySelector('#ui-o-rm'), mu = c.querySelector('#ui-o-mute'), ti = c.querySelector('#ui-o-tips'), fa = c.querySelector('#ui-o-fast');
    rm.checked = !!ui.settings.reduceMotion; mu.checked = !!s.muted; ti.checked = s.tips !== false; fa.checked = !!s.fastDrain;
    rm.addEventListener('change', function () { ui.settings.reduceMotion = rm.checked; applyReduceMotion(rm.checked); K.write(); });
    mu.addEventListener('change', function () { TU.audio.setMuted(mu.checked); TU.save.set('settings.muted', mu.checked); });
    ti.addEventListener('change', function () { TU.save.set('settings.tips', ti.checked); });
    fa.addEventListener('change', function () { TU.save.set('settings.fastDrain', fa.checked); });
    // Advanced swim feel (the original tuning sliders)
    var adv = TU.el('details', { className: 'ui-set-adv', html: '<summary>ADVANCED SWIM FEEL</summary>' }, el);
    var g2 = TU.el('div', { className: 'ui-set', style: 'margin-top:10px' }, adv);
    cfg.tuneUI.forEach(function (row) {
      var k = row[0]; if (k === 'sens' || k === 'fov') return;
      slider(g2, row[1], row[2], row[3], row[4], cfg.swim[k], function (v) { return (+v).toFixed(row[4] < 1 ? 2 : 0); }, function (v) { cfg.swim[k] = v; saveTune(); });
    });
    var rb = TU.el('button', { className: 'ui-btn ui-ghost ui-small', text: 'Reset feel', id: 'ui-btn-resettune', style: 'margin-top:12px' }, adv);
    rb.addEventListener('click', function () { cfg.tuneUI.forEach(function (row) { cfg.swim[row[0]] = TU.cfgDefaults.swim[row[0]]; }); saveTune(); el.innerHTML = ''; renderFeel(el); });
  }
  // Controls come from TU.player.bindings when agent C provides them; this list is the fallback.
  var FALLBACK_KEYS = [
    ['Swimming'], [['Mouse'], 'Look around'], [['KeyW', 'KeyA', 'KeyS', 'KeyD'], 'Kick and glide'], [['Space'], 'Kick upward'], [['KeyC', 'ControlLeft'], 'Kick downward'],
    [['ShiftLeft'], 'Sprint (2x air, stirs silt)'], [['KeyB'], 'Hold: breathe into vest, rise'], [['KeyV'], 'Hold: breathe vest air back, sink'], [['KeyR'], 'Hold: slow breathing, calms panic'],
    ['Gear'], [['KeyF'], 'Flashlight on / off'], [['KeyQ'], 'Drop a waypoint (then name it)'], [['KeyE'], 'Interact: catch, pick up'], [['KeyT'], 'Measure a creature'],
    [['KeyX'], 'Tape a cut'], [['KeyG'], 'Drop a tank'],
    ['Screens'], [['Tab'], 'Hold or tap: wrist computer and hologram map'], [['KeyJ'], 'Waterproof slate (logbook)'], [['KeyH'], 'Hide HUD'], [['Escape'], 'Pause and settings']
  ];
  K.controlsList = function () {
    var b = TU.player && TU.player.bindings, out = [];
    try {
      if (Array.isArray(b) && b.length) {
        b.forEach(function (x) {
          if (typeof x === 'string') { out.push([x]); return; }
          var keys = x.keys || x.codes || x.key || x.code || []; if (!Array.isArray(keys)) keys = [keys];
          out.push([keys, x.label || x.desc || x.action || x.name || '']);
        });
      } else if (b && typeof b === 'object' && Object.keys(b).length) {
        Object.keys(b).forEach(function (k) {
          var v = b[k], keys = Array.isArray(v) ? v : (v && (v.keys || v.codes || v.key || v.code)) || v;
          if (!Array.isArray(keys)) keys = [keys];
          out.push([keys, (v && v.label) || k.replace(/([A-Z])/g, ' $1').toLowerCase()]);
        });
      }
    } catch (e) { out = []; }
    if (!out.length) return FALLBACK_KEYS;
    // UI keys are owned here: list them if the bindings did not already.
    var has = {}; out.forEach(function (r) { if (r.length > 1) r[0].forEach(function (k) { has[k] = true; }); });
    var extra = [[['Tab'], 'Hold or tap: wrist computer and hologram map'], [['KeyJ'], 'Waterproof slate (logbook)'], [['Escape'], 'Pause and settings']].filter(function (r) { return !has[r[0][0]]; });
    if (extra.length) out.push(['Screens']); extra.forEach(function (r) { out.push(r); });
    return out;
  };
  function renderControls(el) {
    var rows = K.controlsList();
    el.innerHTML = '<div class="ui-keys">' + rows.map(function (r) {
      if (r.length === 1) return '<h4>' + K.esc(String(r[0]).toUpperCase()) + '</h4>';
      return '<span>' + r[0].map(function (c) { return '<kbd>' + K.esc(K.keyName(c)) + '</kbd>'; }).join('') + '</span><span>' + K.esc(r[1]) + '</span>';
    }).join('') + '</div><p class="ui-note">Click the view to lock the mouse. Typing a waypoint name never moves the diver.</p>';
  }
  var resetArm = 0;
  function renderGame(el) {
    el.innerHTML = '<p class="ui-note" style="margin-top:0">Your save lives in this browser only. Wallet: <b style="color:var(--hud)">' + K.money(K.cash()) + '</b> and <b style="color:var(--hud)">' + K.fins() + ' Fin Tokens</b>.</p>' +
      '<div class="ui-btnrow" style="margin-top:12px"><button class="ui-btn ui-ghost ui-small" id="ui-btn-replay-story">Replay Marv\'s intro</button><button class="ui-btn ui-danger ui-small" id="ui-btn-wipe">Erase save</button></div>';
    el.querySelector('#ui-btn-replay-story').onclick = function () { if (TU.state.is('title')) storyOpen(); else msg('Finish or call this dive first.'); };
    var w = el.querySelector('#ui-btn-wipe');
    w.onclick = function () {
      if (Date.now() - resetArm > 4000) { resetArm = Date.now(); w.textContent = 'Click again to erase everything'; return; }
      TU.save.reset(); K.data(); K.emit('money', {}); w.textContent = 'Save erased'; resetArm = 0; syncTitle();
    };
  }
  K.settingsPanel = function (root, first) {
    return K.tabs(root, [
      { id: 'feel', label: 'FEEL', render: renderFeel },
      { id: 'hud', label: 'HUD LAYOUT', render: function (el) { if (K.hudEditor) K.hudEditor(el); else el.textContent = 'HUD editor unavailable.'; } },
      { id: 'controls', label: 'CONTROLS', render: renderControls },
      { id: 'game', label: 'SAVE', render: renderGame }
    ], first || 'feel');
  };
  function openSettings(tab) { K.settingsPanel($('ui-set-body'), tab); K.overlay('settings'); }
  K.openSettings = openSettings;

  /* ------------------------------------------------------------------ */
  /* Pause                                                               */
  /* ------------------------------------------------------------------ */
  function fillPause() {
    var P = TU.player.state, run = TU.run || {};
    $('ui-btn-skiptut').style.display = K.tut && K.tut.active ? '' : 'none';
    $('ui-btn-quit').textContent = K.tut && K.tut.active ? 'Back to camp' : 'Call the dive';
    $('ui-pz-stats').innerHTML = 'SEED <b>' + (run.seed != null ? run.seed : '?') + '</b> · ' + K.esc((run.difficulty || '').toUpperCase()) +
      '<br>TIME <b>' + fmtTime(run.t || 0) + '</b> · DEPTH <b>' + (P.depth || 0).toFixed(1) + ' m</b><br>AIR <b>' + (P.airTotal || 0).toFixed(0) + ' bar</b> · ROPE <b>' + TU.player.ropeLength().toFixed(0) + ' m</b>';
    K.settingsPanel($('ui-pz-set'), 'feel');
  }

  /* ------------------------------------------------------------------ */
  /* Run log: what happened this dive                                    */
  /* ------------------------------------------------------------------ */
  function newRunLog(run) {
    var d = TU.save.data;
    return {
      id: (run && run.seed) + ':' + Date.now(), seed: run && run.seed, difficulty: run && run.difficulty,
      tutorial: !!(K.tut && K.tut.active),
      logged: [], newSpecies: [], treasure: [], waypoints: [], measured: 0,
      before: { zones: (d.progress.zonesReached || []).slice(), bottoms: d.progress.bottoms, book: TU.logbook.count(), runs: d.progress.runs },
      loadout: JSON.parse(JSON.stringify(d.loadout || {})), settled: null
    };
  }
  function bindRunLog() {
    TU.on('run:start', function (e) { K.run = newRunLog(e.run); });
    // KEEP DIVING: a fresh log for the next leg, so only what happens after the bottom pays again.
    TU.on('run:continue', function (e) {
      var prev = K.run, log = newRunLog(e.run), inv = TU.player.inventory || {};
      log.continued = true; log.leg = e.leg || 2;
      log.startZone = U.zoneOfDepth(TU.player.state.maxDepth || 0);
      log.loadout = { tape: inv.tape || 0, flexTape: inv.flexTape || 0, glowSticks: inv.glowSticks || 0 };
      if (prev) log.difficulty = prev.difficulty;
      K.run = log;
    });
    TU.on('creature:logged', function (e) {
      if (!K.run || !K.simulating()) return;
      K.run.logged.push({ speciesId: e.speciesId, sizeM: e.sizeM, first: e.first, record: e.record, t: TU.run ? TU.run.t : 0 });
      if (e.sizeM != null) K.run.measured++;
      if (e.first) K.run.newSpecies.push(e.speciesId);
    });
    TU.on('treasure:found', function (e) {
      if (!K.run) return;
      K.run.treasure.push({ id: e.id, kind: e.kind || 'treasure', name: e.name || 'Something shiny', value: e.value || 20, tier: e.tier || 1, shiny: !!e.shiny });
    });
    TU.on('waypoint:placed', function (e) { if (K.run) K.run.waypoints.push({ index: e.index, name: e.name, depth: e.depth }); });
  }

  /* ------------------------------------------------------------------ */
  /* Results and death: the dive slate                                   */
  /* ------------------------------------------------------------------ */
  function endKind(s) {
    var r = String(s.reason || '').toLowerCase();
    if (s.won && (s.endless || r === 'endless')) return 'endless';
    if (s.won) return 'bottom';
    if (r === 'drowned' || r === 'drown' || r === 'air') return 'drowned';
    if (/bled|bleed|blood|injur|cut/.test(r)) return 'bled';
    if (/crush|collapse|quake|rock|squash/.test(r)) return 'crushed';
    if (r === 'quit') return 'quit';
    return 'other';
  }
  var END_TEXT = {
    bottom: ['OBJECTIVE REACHED', 'It was waiting', 'Your glove touched the stone and the whole chamber lit up. Something down here is very, very old.'],
    drowned: ['DIVE LOG · LOST', 'You drowned', 'The tanks ran dry. Next time: slow breathing, fewer sprints, and remember where the air pockets were.'],
    bled: ['DIVE LOG · LOST', 'You bled out', 'A cut you never taped. Out here the water carries it away faster than you think.'],
    crushed: ['DIVE LOG · LOST', 'Crushed', 'The cave moved. You were in the way. Quakes come more often the deeper you go.'],
    quit: ['DIVE LOG · CALLED', 'You called the dive', 'You followed the rope home with something left in the tank. That counts.'],
    endless: ['DIVE LOG · PAST THE BOTTOM', 'Back from below the map', 'You touched the bottom, kept going, and still found the rope home.'],
    other: ['DIVE LOG', 'Dive over', 'The dive is over.']
  };
  // Funny awards picked from real stats (Hub Design, post-dive flow step 4).
  function awards(s, log) {
    var a = [], seen = s.creaturesSeen || 0, nNew = log ? log.newSpecies.length : 0;
    function add(icon, name, line) { a.push({ icon: icon, name: name, line: line }); }
    if (s.siltOuts >= 2) add('S', 'Silt Machine', s.siltOuts + ' silt-outs. The cave is browner because of you.');
    if (s.wallHits >= 6) add('R', 'Rock Hugger', s.wallHits + ' wall hits. The cave will remember your face.');
    if (nNew >= 3) add('B', 'Field Biologist', nNew + ' new species. Marv will pretend he knew them.');
    if (s.waypoints >= 5) add('W', 'Breadcrumb Baron', s.waypoints + ' waypoints. Hansel and Gretel would be proud.');
    if (s.won && s.airLeftBar >= 150) add('A', 'Air Miser', Math.round(s.airLeftBar) + ' bar left over. Were you even breathing?');
    if (s.won && s.airLeftBar < 25) add('F', 'Fumes Specialist', 'Reached the bottom on ' + Math.round(s.airLeftBar) + ' bar. Do not do that again.');
    if (s.ropeM > 300) add('K', 'Knitting Club', Math.round(s.ropeM) + ' m of rope. You weren\'t diving, you were knitting.');
    if (s.timeS > 1800) add('C', 'Cave Resident', 'Down there ' + fmtTime(s.timeS) + '. Start paying rent.');
    if (s.timeS < 240 && s.won) add('D', 'Speed Demon', fmtTime(s.timeS) + ' to the bottom. Reckless. Impressive. Reckless.');
    if (s.siltOuts === 0 && s.maxDepthM > 15) add('C', 'Clean Kicks', 'Zero silt-outs. Marv almost smiled.');
    if (seen > 0 && nNew === 0 && !(log && log.tutorial)) add('E', 'Saw It, Logged Nothing', seen + ' creatures seen, zero measured. The tape is for measuring.');
    if (s.waypoints === 0) add('?', 'Who Needs Waypoints', 'No waypoints. Bold. Wrong, but bold.');
    if (!a.length) add('!', 'Showed Up', 'Technically a dive.');
    return a.slice(0, 3);
  }
  var BOARDS = [['deepest', 'Deepest dive', function (v) { return v.toFixed ? v.toFixed(1) + ' m' : v + ' m'; }], ['fastest', 'Fastest to the bottom', fmtTime], ['airLeft', 'Most air left', function (v) { return v + ' bar'; }],
    ['explored', 'Most explored (rope)', function (v) { return v + ' m'; }], ['longest', 'Longest in the cave', fmtTime]];
  K.BOARDS = BOARDS;
  // Find where this run landed on each leaderboard (recordRun already ran in main.js).
  function placements(s) {
    var out = [], lb = TU.save.data.leaderboards || {};
    BOARDS.forEach(function (b) {
      var list = lb[b[0]] || [], best = -1, bestDate = 0;
      for (var i = 0; i < list.length; i++) if (list[i].seed === s.seed && list[i].date >= bestDate && Date.now() - list[i].date < 120000) { best = i; bestDate = list[i].date; }
      if (best >= 0) out.push({ board: b[1], rank: best + 1, value: b[2](list[best].value) });
    });
    return out;
  }
  function fillEnd(kind, s) {
    var k = endKind(s), txt = END_TEXT[k], log = K.run;
    var econ = K.econ && log ? K.econ.settle(s, log) : null;
    var stats = [['TIME', fmtTime(s.timeS)], ['MAX DEPTH', s.maxDepthM.toFixed(1) + ' m'], ['AIR LEFT', Math.max(0, s.airLeftBar).toFixed(0) + ' bar'], ['ROPE USED', s.ropeM.toFixed(0) + ' m'],
      ['SPECIES LOGGED', String(log ? log.logged.length : 0) + (log && log.newSpecies.length ? ' (' + log.newSpecies.length + ' new)' : '')], ['CREATURES SEEN', s.creaturesSeen + ' / ' + s.creaturesTotal],
      ['FINDS', String(log ? log.treasure.length : 0)], ['WAYPOINTS', String(s.waypoints)]];
    var aw = awards(s, log), pl = placements(s);
    var html = [];
    html.push('<div class="ui-kicker">' + txt[0] + ' · SEED ' + K.esc(s.seed) + (log && log.difficulty ? ' · ' + K.esc(log.difficulty.toUpperCase()) : '') + '</div>');
    html.push('<h3>' + txt[1] + '</h3>');
    html.push('<div class="ui-marvq"><div class="ui-marv">' + K.marvSVG() + '</div><div>"' + K.esc(K.MARV.end[k]) + '"</div></div>');
    if (k === 'bottom') {
      html.push('<div class="ui-choice" id="ui-choice"><p><b>You reached the bottom.</b> ' + K.esc(txt[2]) + ' The water keeps going down past it.</p>' +
        '<button class="ui-btn ui-small" id="ui-btn-endrun">End run</button><button class="ui-btn ui-ghost ui-small" id="ui-btn-keep" style="color:#EAF7F4;border-color:rgba(255,255,255,.3)">Keep diving</button></div>');
    } else html.push('<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#2f3833">' + K.esc(txt[2]) + '</p>');
    html.push('<div class="ui-slate-grid">' + stats.map(function (r) { return '<div><span>' + r[0] + '</span><strong>' + K.esc(r[1]) + '</strong></div>'; }).join('') + '</div>');
    html.push('<div class="ui-slate-cols"><div><h4>AWARDS</h4>' + aw.map(function (x) { return '<div class="ui-award"><i>' + K.esc(x.icon) + '</i><div><b>' + K.esc(x.name) + '</b><small>' + K.esc(x.line) + '</small></div></div>'; }).join('') + '</div>');
    html.push('<div><h4>PAY</h4>');
    if (econ) {
      html.push('<table class="ui-earn">' + econ.lines.map(function (l) { return '<tr><td>' + K.esc(l.label) + '</td><td>' + (l.cash ? K.money(l.cash) : '') + (l.fins ? (l.cash ? ' + ' : '') + l.fins + ' FT' : '') + (l.note ? K.esc(l.note) : '') + '</td></tr>'; }).join('') +
        '<tr class="ui-tot"><td>Earned</td><td>' + K.money(econ.cash) + (econ.fins ? ' + ' + econ.fins + ' FT' : '') + '</td></tr></table>');
      if (econ.haulCount) html.push('<p class="ui-places">' + econ.haulCount + ' find' + (econ.haulCount > 1 ? 's' : '') + ' in your haul bag. Sell them at the Sell Table in camp.</p>');
    } else html.push('<p class="ui-places">No pay for practice.</p>');
    if (pl.length) html.push('<p class="ui-places">' + pl.map(function (p) { return '<b>#' + p.rank + '</b> ' + K.esc(p.board) + ' (' + K.esc(p.value) + ')'; }).join('<br>') + '</p>');
    html.push('</div></div>');
    html.push('<div class="ui-slate-foot"><button class="ui-btn" id="ui-btn-camp-' + kind + '" style="background:#1d2522;color:#EAF7F4">Back to camp</button><button class="ui-btn ui-ghost" id="ui-btn-again-' + kind + '">Dive again</button><button class="ui-btn ui-ghost" id="ui-btn-title-' + kind + '">Title</button></div>');
    $('ui-' + kind + '-slate').innerHTML = html.join('');
    $('ui-btn-camp-' + kind).onclick = function () { openCamp(K.data().haul.length ? 'sell' : 'dive', K.MARV.end[k]); };
    $('ui-btn-again-' + kind).onclick = function () { TU.game.restart(); };
    $('ui-btn-title-' + kind).onclick = function () { TU.game.toTitle(); };
    if (k === 'bottom') {
      $('ui-btn-endrun').onclick = function () { var c = $('ui-choice'); if (c) c.innerHTML = '<p>Run ended at the bottom. Rope ascent complete. Marv is pretending not to be impressed.</p>'; };
      $('ui-btn-keep').onclick = keepDiving;
    }
  }
  // KEEP DIVING: endless mode past the bottom. Uses main.js keepDiving if the lead adds it (REQUESTS-D.md),
  // else starts a fresh, harder dive on a new seed marked as an endless continuation.
  function keepDiving() {
    if (typeof TU.game.keepDiving === 'function') { TU.game.keepDiving(); return; }
    var run = TU.run || {};
    TU.game.startDive({ seed: (TU.mix32((run.seed || 1) + 0x9E37) >>> 0), difficulty: 'hard', modifiers: ['endless'] });
    msg('KEEP DIVING. The water goes deeper than the map.', 4);
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard (menus)                                                    */
  /* ------------------------------------------------------------------ */
  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var s = TU.state.current, tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (overlay === 'story') {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (story.i < K.MARV.story.length) storyNext(); }
        if (e.code === 'Escape') { story.i = K.MARV.story.length; storyLine(); }
        return;
      }
      if (overlay === 'settings') { if (e.code === 'Escape') K.overlay(null); return; }
      if (e.code !== 'Enter') return;
      // Enter: the main action of each menu.
      if (s === 'title') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; $('ui-btn-loadout').classList.contains('ui-primary') ? openCamp('dive') : storyOpen(); }
      else if (s === 'paused') TU.game.resume();
      else if (s === 'results' || s === 'dead') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; TU.game.restart(); }
      else if (s === 'loadout' && K.camp) { if (document.activeElement && /BUTTON|CANVAS/.test(document.activeElement.tagName)) return; K.camp.dive(); }
    });
  }

  function bindDom() {
    $('ui-btn-start').addEventListener('click', storyOpen);
    $('ui-btn-loadout').addEventListener('click', function () { openCamp('loadout'); });
    $('ui-btn-settings').addEventListener('click', function () { openSettings('feel'); });
    $('ui-btn-controls').addEventListener('click', function () { openSettings('controls'); });
    $('ui-btn-set-close').addEventListener('click', function () { K.overlay(null); });
    $('ui-btn-touch').addEventListener('click', function () { TU.player.enableTouch(); TU.game.startDive({ touch: true }); });
    $('ui-btn-resume').addEventListener('click', function () { TU.game.resume(); });
    $('ui-btn-restart1').addEventListener('click', function () { if (K.tut && K.tut.active && K.startTutorial) K.startTutorial(); else TU.game.restart(); });
    $('ui-btn-skiptut').addEventListener('click', function () { if (K.tut) K.tut.finish(true); });
    $('ui-btn-quit').addEventListener('click', function () {
      if (K.tut && K.tut.active) { K.tut.finish(true); return; }
      TU.game.resume(); TU.game.endRun({ won: false, reason: 'quit' });
    });
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
    if (coarse) { $('ui-mobile').style.display = 'block'; $('ui-btn-touch').style.display = 'flex'; }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  function bindEvents() {
    TU.on('state:change', function (e) {
      if (e.to !== 'title' && overlay) overlay = null;
      show(e.to);
      if (e.to === 'paused') fillPause();
      if (e.to === 'title') syncTitle();
      if ((e.to === 'results' || e.to === 'dead') && e.data && e.data.summary) fillEnd(e.to, e.data.summary);
      if (!K.simulating()) hideHint();
      K.each('state', e);
    });
    TU.on('run:start', function () { T.msg = T.zone = 0; $('ui-msg').style.opacity = 0; $('ui-zone').style.opacity = 0; });
    TU.on('area:enter', function (e) { if (e.style === 'zone') zone(e.title, e.subtitle); else if (e.style === 'msg') msg(e.title, 4); });
    TU.on('player:surfaced', function () { msg('SURFACED. Breathing cave air. Tank refilling.', 4); });
    TU.on('player:siltout', function () { msg('SILT OUT. Stop. Let it settle.', 4); });
    TU.on('player:narcosis', function () { msg('Past 30 m. Thoughts feel slow and warm.', 4); });
    TU.on('player:lowBattery', function () { msg('LOW BATTERY', 2.5); });
    TU.on('player:light', function (e) { if (e.reason === 'dead') msg('LIGHT DEAD. Follow the rope or find the glow.', 4); else if (e.reason === 'empty') msg('LIGHT DEAD'); else msg(e.on ? 'LIGHT ON' : 'LIGHT OFF', 1.4); });
    TU.on('player:blocked', function (e) { if (e.kind === 'exit') msg('Open water behind you. The dive is the other way.', 3); });
    TU.on('player:tankSwitch', function (e) { msg('TANK ' + (e.from + 1) + ' EMPTY. SWITCHED TO TANK ' + (e.to + 1) + '.', 3); });
    TU.on('player:cut', function (e) { if (!(e && e.injury && /crayfish|lanternjaw|bite|pinch/.test(String(e.injury.source)))) msg('CUT. Tape it before it gets worse.', 3); });
    // Creature attacks (agent B): a short shout, the player module does the damage.
    var ATTACK_MSG = { pinch: 'PINCHED. Back off the crayfish.', bite: 'BITTEN. Tape it before it gets worse.', shock: 'SHOCKED. Your light is stuttering.', venom: 'VENOM. Your eyes are swimming.', sting: 'STUNG. The jelly did not like the jar.' };
    TU.on('creature:attack', function (e) { if (K.simulating() && ATTACK_MSG[e.kind]) msg(ATTACK_MSG[e.kind], 3); });
    TU.on('creature:warn', function (e) { if (K.simulating()) msg(e.kind === 'shock' ? 'Something crackles in the dark...' : 'Claws are up. Do not hover.', 2.2); });
    TU.on('player:crushed', function () { msg('CRUSHED', 3); });
    TU.on('cave:collapse', function () { if (K.simulating()) msg('Something collapsed behind you.', 3.5); });
    TU.on('treasure:found', function (e) { msg('FOUND: ' + (e.name || e.kind || 'something') + (e.value ? ' · ' + K.money(e.value) : ''), 3); });
    TU.on('quake', function () { msg('The cave shakes.', 2.5); });
    TU.on('ui:msg', function (e) { msg(e.text, e.dur); });
    TU.on('ui:zone', function (e) { zone(e.title, e.subtitle); });
    TU.on('ui:hint', function (e) { hint(e.text, e.dur); });
    TU.on('ui:hideHint', function () { hideHint(); });
  }

  TU.define('ui', {
    msg: msg, zone: zone, hint: hint, hideHint: hideHint, show: show,
    setHudVisible: function (on) { if (K.setHudVisible) K.setHudVisible(on); },
    // Extra API (agent D): open screens from tests or other modules.
    openCamp: function (station) { openCamp(station || 'dive'); },
    openSettings: openSettings,
    openStory: storyOpen,
    // The camp (state 'loadout') and the story are opaque full-screen pages: main.js skips the 3D render.
    coversScreen: function () { return overlay === 'story' || (TU.state.is('loadout') && !overlay); }
  });

  TU.addSystem('ui', {
    init: function () {
      K.data(); buildDom(); bindDom(); bindEvents(); bindKeys(); bindRunLog();
      applyReduceMotion(K.data().settings.reduceMotion);
      applyVolume(K.data().settings.volume);
      K.each('init'); syncTitle();
    },
    reset: function (run) { K.each('reset', run); },
    update: function (dt) { tickTimers(dt); K.each('update', dt); },
    idle: function (dt) { tickTimers(dt); K.each('idle', dt); },
    frame: function (dt) { storyFrame(dt); K.each('frame', dt); }
  });
})();
