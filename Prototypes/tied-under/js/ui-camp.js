/*
 * ui-camp.js: Sump Camp, the hub between dives (Hub Design.md), as an illustrated 2.5D menu scene.
 *
 *   Scene      a hand-drawn style canvas of the camp at dusk: jungle, sinkhole with the rope stake,
 *              Marv's gear tent, the locker shack, campfire, sell table, leaderboard rock ...
 *              Click a place in the scene (or the station buttons, or keys 1 to 8) to open it.
 *   Stations   Dive (difficulty and seed), Loadout (tanks, mask, tools, flippers), Locker (ui-locker.js),
 *              Gear Tent shop (upgrades and consumables), Sell Table, Logbook, Leaderboard Rock,
 *              Contract Board (Marv's run objectives and tips).
 *   Economy    K.econ.settle(summary, runLog) pays out at the end of a dive (Economy and Progression.md):
 *              depth bonus, new species bounties, contract rewards, Fin Tokens; treasure goes to the haul bag.
 *
 * Game state: the camp is shown in the 'loadout' state (TU.game.openLoadout()).
 * Owner: agent D. Part of the ui system (see ui.js, K.part).
 */
(function () {
  'use strict';
  var TU = window.TU, K = TU.uiKit, U = TU.util, cfg = TU.cfg, clamp = U.clamp, fmtTime = U.fmtTime, $ = TU.$;
  if (!K) return;
  K.screens.loadout = 'ui-camp';

  var STATIONS = [
    { id: 'dive', label: 'Dive', place: 'THE DIVE PLATFORM', at: [565, 610] },
    { id: 'loadout', label: 'Loadout', place: 'THE GEAR TARP', at: [330, 640] },
    { id: 'locker', label: 'Locker', place: 'THE LOCKER SHACK', at: [145, 395] },
    { id: 'shop', label: 'Gear Tent', place: 'MARV\'S GEAR TENT', at: [700, 385] },
    { id: 'sell', label: 'Sell', place: 'THE SELL TABLE', at: [725, 520] },
    { id: 'logbook', label: 'Logbook', place: 'THE RESEARCH TABLE', at: [232, 520] },
    { id: 'boards', label: 'Leaderboards', place: 'LEADERBOARD ROCK', at: [860, 600] },
    { id: 'contracts', label: 'Contracts', place: 'THE CONTRACT BOARD', at: [330, 345] }
  ];
  var ST = {}; STATIONS.forEach(function (s, i) { s.key = i + 1; ST[s.id] = s; });
  var DIFF = {
    easy: { label: 'Easy', time: 'about 15 min', zones: 'Zones 1 to 3', mul: 0.6, line: 'Easy. Sure. Even Kevin could do Easy.' },
    standard: { label: 'Standard', time: '30 to 45 min', zones: 'All 5 zones', mul: 1.0, line: 'Standard. The way the cave intended.' },
    hard: { label: 'Hard', time: '45 to 60+ min', zones: 'More surprises', mul: 1.4, line: 'Oh, you\'re brave. Or stupid. In my experience, same thing.' }
  };
  var SOLO_MUL = 1.5; // solo payout multiplier (Economy, section 1)
  var MASKS = [
    { id: 'standard', label: 'Standard', need: 1, desc: 'Basic HUD. Floods now and then. Fine.' },
    { id: 'tight', label: 'Tight Seal', need: 2, desc: 'Floods 50% less in currents. Narrower view.' },
    { id: 'wide', label: 'Wide View', need: 3, desc: '+10° field of view. Floods a bit easier.' },
    { id: 'headlamp', label: 'Headlamp', need: 4, desc: 'Hands-free second light. Fogs up when you breathe hard.' }
  ];
  var FINS = [
    { id: 'paddle', label: 'Rental Paddles', desc: 'Heavy, honest, smells like the last renter.', speed: 1.0, stamina: 1.0 },
    { id: 'split', label: 'Split Fins', desc: 'Easy on the legs, less push.', speed: 0.96, stamina: 1.1 },
    { id: 'jet', label: 'Jet Fins', desc: 'Stiff and strong. Great frog kick.', speed: 1.04, stamina: 0.93 },
    { id: 'blade', label: 'Long Blades', desc: 'Fast in open water, awful in squeezes.', speed: 1.07, stamina: 0.9 }
  ];
  K.FINS = FINS; K.MASKS = MASKS;

  /* ------------------------------------------------------------------ */
  /* CSS                                                                 */
  /* ------------------------------------------------------------------ */
  TU.css('ui-camp', [
    '#ui-camp{padding:0;background:#05090a;display:none}',
    '#ui-camp.ui-on{display:block}',
    '.ui-cp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,min(720px,58vw));min-height:100%}',
    '.ui-cp-scene{position:sticky;top:0;height:100vh;height:100dvh;overflow:hidden;background:#071318}',
    '#ui-cp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:default;touch-action:manipulation}',
    '.ui-cp-head{position:absolute;left:var(--gx);top:var(--gt);right:var(--gr);display:flex;justify-content:space-between;gap:10px;align-items:flex-start;pointer-events:none}',
    '.ui-cp-head h2{margin:0;font-family:var(--display);font-size:clamp(22px,3vw,34px);letter-spacing:.16em;color:#F2E9D8;text-shadow:0 2px 14px rgba(0,0,0,.8)}',
    '.ui-cp-head small{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.24em;color:#FFC98A;margin-top:2px}',
    '.ui-wallet{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.ui-wallet span{font-family:var(--mono);font-size:13px;color:#F2E9D8;background:rgba(5,10,12,.7);border:1px solid rgba(255,201,138,.3);padding:5px 9px;border-radius:3px}',
    '.ui-wallet b{color:#FFC98A;font-weight:400}',
    '.ui-cp-say{position:absolute;left:var(--gx);right:var(--gr);bottom:calc(var(--gb) + 92px);display:flex;gap:10px;align-items:flex-end;pointer-events:none}',
    '.ui-cp-say .ui-marv{width:46px;height:46px;flex:none;border-color:rgba(255,201,138,.35)}',
    '.ui-cp-say q{quotes:none;background:#F2E9D8;color:#24201a;font-family:var(--ui-hand);font-size:21px;line-height:1.15;padding:8px 12px;border-radius:12px 12px 12px 2px;max-width:440px;box-shadow:0 6px 20px rgba(0,0,0,.5)}',
    '.ui-cp-nav{position:absolute;left:var(--gx);right:var(--gr);bottom:var(--gb);display:flex;flex-wrap:wrap;gap:6px}',
    '.ui-cp-nav button{font-family:var(--mono);font-size:12px;letter-spacing:.1em;background:rgba(5,10,12,.78);color:#E9DFCB;border:1px solid rgba(255,201,138,.22);padding:7px 10px;border-radius:3px;cursor:pointer;min-height:36px}',
    '.ui-cp-nav button i{font-style:normal;color:#FFC98A;opacity:.7;margin-right:6px;font-size:10px}',
    '.ui-cp-nav button.ui-sel{background:#F2E9D8;color:#1b1914;border-color:#F2E9D8}',
    '.ui-cp-nav button.ui-sel i{color:#7a5a2a}',
    '.ui-cp-nav button:focus-visible{outline:2px solid #fff;outline-offset:2px}',
    '.ui-cp-panel{background:linear-gradient(180deg,#0b1114,#080d0f);border-left:1px solid rgba(255,201,138,.14);padding:calc(var(--gt) + 6px) var(--gr) calc(var(--gb) + 16px) 22px;min-width:0}',
    '.ui-cp-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}',
    '.ui-cp-top .ui-kicker{color:#FFC98A}',
    '.ui-cp-h{font-family:var(--display);font-size:clamp(26px,3.4vw,36px);letter-spacing:.08em;color:#F2E9D8;margin:2px 0 4px;line-height:1.05}',
    '.ui-cp-lead{color:var(--ink-dim);font-size:14px;line-height:1.55;margin:0 0 16px}',
    /* physical objects */
    '.ui-chalk{background:#1d2925;background-image:radial-gradient(120% 80% at 30% 20%, rgba(255,255,255,.05), transparent 60%);border:10px solid #5a4632;border-radius:4px;padding:16px;color:#ECEFE8;box-shadow:0 14px 40px rgba(0,0,0,.5), inset 0 0 30px rgba(0,0,0,.4)}',
    '.ui-chalk h4{font-family:var(--ui-hand);font-weight:700;font-size:28px;margin:0 0 8px;color:#F4F6EF;opacity:.95}',
    '.ui-diffs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    '.ui-diff{background:transparent;border:2px dashed rgba(236,239,232,.25);color:#ECEFE8;border-radius:6px;padding:10px;text-align:left;cursor:pointer;font:inherit;min-height:44px}',
    '.ui-diff b{display:block;font-family:var(--ui-hand);font-size:28px;line-height:1}',
    '.ui-diff small{display:block;font-size:12px;opacity:.75;line-height:1.4}',
    '.ui-diff.ui-sel{border-style:solid;border-color:#F4F6EF;background:rgba(255,255,255,.07)}',
    '.ui-seed{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}',
    '.ui-seed .ui-seedv{font-family:var(--ui-hand);font-size:32px;line-height:1;min-width:150px}',
    '.ui-seed input{background:rgba(255,255,255,.06);border:1px solid rgba(236,239,232,.3);color:#F4F6EF;font:15px var(--mono);padding:8px 10px;border-radius:3px;width:170px;max-width:100%}',
    '.ui-chalk .ui-chip{background:transparent;color:#ECEFE8;border-color:rgba(236,239,232,.3)}',
    '.ui-chalk .ui-chip.ui-sel{border-color:#F4F6EF;color:#fff;background:rgba(255,255,255,.08);box-shadow:none}',
    '.ui-sumrow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}',
    '.ui-sumbox{border:1px solid var(--line);border-radius:4px;padding:10px 12px;background:rgba(79,242,208,.03);font-size:13px;color:var(--ink-dim);line-height:1.5;min-width:0}',
    '.ui-sumbox h5{margin:0 0 4px;font-family:var(--mono);font-weight:400;font-size:11px;letter-spacing:.2em;color:var(--hud)}',
    '.ui-sumbox b{color:var(--ink);font-weight:600}',
    '.ui-go{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px}',
    '.ui-go .ui-btn:first-child{font-size:16px;padding:15px 28px}',
    /* tarp (loadout) */
    '.ui-tarp{background:#1f4a6b;background-image:radial-gradient(circle at 14px 14px, #c9c3b4 0 4px, #7d796f 5px, transparent 6px), radial-gradient(circle at calc(100% - 14px) 14px, #c9c3b4 0 4px, #7d796f 5px, transparent 6px), repeating-linear-gradient(45deg, rgba(255,255,255,.025) 0 2px, transparent 2px 6px);',
    '  background-repeat:no-repeat,no-repeat,repeat;border-radius:6px;padding:22px 16px 16px;box-shadow:0 16px 40px rgba(0,0,0,.5), inset 0 0 40px rgba(0,0,0,.25);color:#E6EEF4}',
    '.ui-tarp h4{font-family:var(--mono);font-weight:400;font-size:11px;letter-spacing:.24em;color:#BFD6E6;margin:14px 0 8px}',
    '.ui-tarp h4:first-child{margin-top:0}',
    '.ui-tanks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    '.ui-tank{position:relative;background:#E9E4D6;color:#1d2522;border-radius:6px;padding:10px;cursor:pointer;box-shadow:0 4px 0 rgba(0,0,0,.25);border:2px solid transparent;font-size:12.5px;line-height:1.35;min-width:0}',
    '.ui-tank input{position:absolute;opacity:0;pointer-events:none}',
    '.ui-tank strong{display:block;font-family:var(--display);font-size:17px;letter-spacing:.08em}',
    '.ui-tank .ui-cyl{display:flex;gap:3px;margin:6px 0;height:34px;align-items:flex-end}',
    '.ui-tank .ui-cyl i{width:13px;height:34px;border-radius:6px 6px 3px 3px;background:linear-gradient(90deg,#c7a12e,#f1cf55 45%,#a8841c)}',
    '.ui-tank.ui-sel{border-color:#4FF2D0;box-shadow:0 4px 0 rgba(0,0,0,.25), 0 0 0 3px rgba(79,242,208,.35)}',
    '.ui-meter{display:grid;grid-template-columns:52px 1fr;gap:4px 6px;align-items:center;font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:#4d5650;margin-top:4px}',
    '.ui-meter s{display:block;height:5px;background:rgba(0,0,0,.12);border-radius:3px;position:relative;text-decoration:none}',
    '.ui-meter s u{position:absolute;left:0;top:0;bottom:0;background:#1d2522;border-radius:3px}',
    '.ui-masks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.ui-mask{background:#0f2433;border:1px solid rgba(191,214,230,.25);color:#E6EEF4;border-radius:5px;padding:8px;cursor:pointer;text-align:left;font:inherit;font-size:12px;line-height:1.35;min-width:0}',
    '.ui-mask b{display:block;font-family:var(--display);letter-spacing:.06em;font-size:14px}',
    '.ui-mask.ui-sel{border-color:#4FF2D0;box-shadow:inset 0 0 0 1px #4FF2D0}',
    '.ui-mask:disabled{opacity:.5;cursor:not-allowed}',
    '.ui-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '.ui-tool{display:flex;align-items:center;gap:8px;background:rgba(10,30,44,.6);border:1px solid rgba(191,214,230,.2);border-radius:5px;padding:7px 9px;min-width:0}',
    '.ui-tool span{flex:1;font-size:13px;min-width:0}',
    '.ui-tool small{display:block;font-size:11px;color:#9fb8c8}',
    '.ui-step{display:flex;align-items:center;gap:4px}',
    '.ui-step button{width:30px;height:30px;border-radius:3px;border:1px solid rgba(191,214,230,.35);background:#0f2433;color:#E6EEF4;cursor:pointer;font:15px var(--mono)}',
    '.ui-step output{font-family:var(--mono);min-width:22px;text-align:center}',
    '.ui-tool input[type=checkbox]{accent-color:#4FF2D0;width:18px;height:18px}',
    '.ui-fins{display:flex;flex-wrap:wrap;gap:6px}',
    '.ui-tarp .ui-chip{background:#0f2433;color:#E6EEF4;border-color:rgba(191,214,230,.3)}',
    '.ui-tarp .ui-chip.ui-sel{border-color:#4FF2D0;color:#4FF2D0}',
    '#ui-kit{font-size:13px;color:#cfe0ea;margin:14px 0 0;line-height:1.5}',
    /* shop: price tags */
    '.ui-shop{display:grid;gap:8px}',
    '.ui-up{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;background:#13191b;border:1px solid rgba(255,201,138,.14);border-radius:4px;padding:10px 12px}',
    '.ui-up h5{margin:0;font-family:var(--display);font-size:16px;letter-spacing:.06em;color:#F2E9D8}',
    '.ui-up p{margin:2px 0 0;font-size:12.5px;color:var(--ink-dim);line-height:1.4}',
    '.ui-pips{display:flex;gap:3px;margin-top:5px}',
    '.ui-pips i{width:16px;height:5px;background:rgba(255,201,138,.15);border-radius:1px}',
    '.ui-pips i.ui-on{background:#FFC98A;box-shadow:0 0 6px rgba(255,201,138,.5)}',
    '.ui-tag{font-family:var(--mono);font-size:13px;background:#E8DCC0;color:#2a2116;border:0;border-radius:3px 12px 12px 3px;padding:9px 22px 9px 12px;cursor:pointer;position:relative;white-space:nowrap;min-height:38px}',
    '.ui-tag::before{content:"";position:absolute;right:8px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:#13191b}',
    '.ui-tag:disabled{opacity:.45;cursor:not-allowed}',
    '.ui-tag.ui-max{background:#2a3436;color:#9fb0ad}',
    '.ui-cons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}',
    '.ui-con{background:#13191b;border:1px solid rgba(255,201,138,.14);border-radius:4px;padding:10px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--ink-dim);min-width:0}',
    '.ui-con b{color:#F2E9D8;font-family:var(--display);letter-spacing:.05em;font-size:14px}',
    /* sell: folding table */
    '.ui-table{background:#5b4630;background-image:repeating-linear-gradient(90deg, rgba(0,0,0,.08) 0 2px, transparent 2px 60px), linear-gradient(180deg, rgba(255,255,255,.06), transparent);border-radius:4px;padding:14px;box-shadow:0 16px 40px rgba(0,0,0,.5)}',
    '.ui-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;background:#EFE6D2;color:#2a2116;border-radius:3px;padding:8px 10px;margin-bottom:8px;box-shadow:0 3px 0 rgba(0,0,0,.25)}',
    '.ui-item svg{width:42px;height:30px}',
    '.ui-item b{font-family:var(--ui-hand);font-size:22px;line-height:1}',
    '.ui-item small{display:block;font-size:11.5px;color:#6b5d48}',
    '.ui-item .ui-btnrow{gap:6px}',
    '.ui-item .ui-btn{box-shadow:none;background:#2a2116;color:#EFE6D2;font-size:11px;padding:7px 10px;min-height:32px}',
    '.ui-item .ui-btn.ui-ghost{background:transparent;color:#2a2116;border-color:rgba(0,0,0,.3)}',
    '.ui-empty{font-family:var(--ui-hand);font-size:24px;color:#EFE6D2;opacity:.85;padding:8px 4px}',
    '.ui-shelf{margin-top:14px;border-top:8px solid #3f2f1f;padding-top:8px;display:flex;flex-wrap:wrap;gap:6px;min-height:30px}',
    '.ui-shelf span{font-family:var(--ui-hand);font-size:18px;background:#EFE6D2;color:#2a2116;padding:2px 8px;border-radius:2px;transform:rotate(-2deg)}',
    /* cork board */
    '.ui-cork{background:#9b6b3e;background-image:radial-gradient(rgba(60,30,10,.35) 1px, transparent 1.5px), radial-gradient(rgba(255,230,200,.18) 1px, transparent 1.5px);background-size:7px 7px, 11px 11px;border:10px solid #4d3420;border-radius:4px;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;box-shadow:0 16px 40px rgba(0,0,0,.5)}',
    '.ui-pin{background:linear-gradient(160deg,#F4F4EE,#DCDDD4);color:#1d2522;border-radius:8px;padding:12px 12px 10px;position:relative;box-shadow:0 6px 14px rgba(0,0,0,.35);min-width:0}',
    '.ui-pin::before{content:"";position:absolute;top:-5px;left:50%;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #ff8b7a, #b3261e);box-shadow:0 2px 3px rgba(0,0,0,.4)}',
    '.ui-pin:nth-child(odd){transform:rotate(-1.4deg)} .ui-pin:nth-child(even){transform:rotate(1.1deg)}',
    '.ui-pin h5{margin:2px 0 6px;font-family:var(--mono);font-weight:400;font-size:10.5px;letter-spacing:.18em;color:#5d6660}',
    '.ui-pin ol{margin:0;padding:0 0 0 22px;font-family:var(--ui-hand);font-size:21px;line-height:1.2}',
    '.ui-pin ol small{font-family:var(--sans);font-size:10.5px;color:#6b726c;margin-left:4px}',
    '.ui-pin .ui-none{font-family:var(--ui-hand);font-size:19px;color:#6b726c}',
    '.ui-note2{font-family:var(--ui-hand);font-size:22px;line-height:1.15}',
    /* contracts */
    '.ui-plank{background:#6b5236;background-image:repeating-linear-gradient(180deg, rgba(0,0,0,.12) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 3px, transparent 3px 9px);border-radius:4px;padding:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;box-shadow:0 16px 40px rgba(0,0,0,.5)}',
    '.ui-ct{background:#F3EAD3;color:#2a2116;padding:12px;position:relative;box-shadow:0 5px 12px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.ui-ct::before{content:"";position:absolute;top:6px;left:50%;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:#6b6b6b;box-shadow:0 1px 1px rgba(0,0,0,.5)}',
    '.ui-ct h5{margin:8px 0 0;font-family:var(--ui-hand);font-size:26px;line-height:1}',
    '.ui-ct p{margin:0;font-size:12.5px;line-height:1.4;color:#5a4c37}',
    '.ui-ct .ui-rew{font-family:var(--mono);font-size:12px;color:#2a2116}',
    '.ui-ct .ui-btn{box-shadow:none;background:#2a2116;color:#F3EAD3;font-size:11px;padding:8px 10px;min-height:34px;margin-top:auto}',
    '.ui-ct.ui-act{outline:3px solid #4FF2D0;padding-top:30px}',
    '.ui-ct .ui-stamp{position:absolute;right:8px;top:6px;transform:rotate(6deg);background:#F3EAD3;border:2px solid #b3261e;color:#b3261e;font-family:var(--mono);font-size:11px;letter-spacing:.2em;padding:2px 6px}',
    '.ui-tipbox{margin-top:14px;display:flex;gap:12px;align-items:center;background:#13191b;border:1px solid rgba(255,201,138,.18);border-radius:4px;padding:12px}',
    '.ui-tipbox .ui-marv{width:48px;height:48px}',
    '.ui-tipbox q{quotes:none;font-family:var(--ui-hand);font-size:22px;line-height:1.15;color:#F2E9D8}',
    '@media (max-width: 900px){',
    '  .ui-cp{grid-template-columns:1fr}',
    '  .ui-cp-scene{position:relative;height:min(46vh,340px)}',
    '  .ui-cp-panel{border-left:0;border-top:1px solid rgba(255,201,138,.14);padding:16px var(--gr) calc(var(--gb) + 16px) var(--gx)}',
    '  .ui-cp-say{bottom:calc(var(--gb) + 90px)} .ui-cp-say q{font-size:18px}',
    '}',
    '@media (max-width: 560px){',
    '  .ui-cp-scene{height:min(52vh,380px)}',
    '  .ui-cp-nav button{padding:6px 8px;font-size:11px} .ui-cp-nav button i{display:none}',
    '  .ui-cp-say{bottom:calc(var(--gb) + 116px)} .ui-cp-say .ui-marv{display:none}',
    '  .ui-diffs,.ui-tanks,.ui-cons,.ui-plank{grid-template-columns:1fr}',
    '  .ui-masks,.ui-tools,.ui-sumrow{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '  .ui-tools{grid-template-columns:1fr}',
    '  .ui-item{grid-template-columns:minmax(0,1fr)} .ui-item svg{display:none}',
    '}'
  ].join('\n'));

  /* ------------------------------------------------------------------ */
  /* Economy                                                             */
  /* ------------------------------------------------------------------ */
  var DEPTH_BONUS = [50, 150, 350, 700, 1200];
  function prevDeepZone(zones) { var z = -1; (zones || []).forEach(function (v, i) { if (v) z = i; }); return z; }
  function settle(s, log) {
    if (log.settled) return log.settled;
    var lines = [], cash = 0, fins = 0, d = TU.save.data, ui = K.data();
    function add(label, c, f, note) { c = Math.round(c || 0); f = f || 0; lines.push({ label: label, cash: c, fins: f, note: note }); cash += c; fins += f; }
    if (log.tutorial) {
      add('Practice hole', 0, 0, 'no pay, just pride');
      log.settled = { lines: lines, cash: 0, fins: 0, haulCount: 0 }; return log.settled;
    }
    var mul = (DIFF[log.difficulty] ? DIFF[log.difficulty].mul : 1) * SOLO_MUL;
    var dead = !s.won && s.reason !== 'quit';
    var z = U.zoneOfDepth(s.maxDepthM || 0);
    add('Depth bonus: ' + U.ZONE_NAMES[z], DEPTH_BONUS[z] * mul);
    if (s.won && (s.reason === 'bottom' || s.reason === 'debug')) add('Reached the bottom', 1000 * mul);
    // Logbook bounties for species new this dive (records pay a little too).
    var bounty = 0, recs = 0;
    log.newSpecies.forEach(function (id) { var sp = K.species(id); bounty += K.BOUNTY[(sp && sp.rarity) || 'common'] || 25; });
    log.logged.forEach(function (x) { if (x.record) recs += 5; });
    if (log.newSpecies.length) add(log.newSpecies.length + ' new species', bounty * mul);
    if (recs) add('Size records', recs * mul);
    // Treasure: alive, it goes into the haul bag to sell. Dead, insurance pays 25%.
    var haulCount = 0;
    if (log.treasure.length) {
      if (dead) add('Haul lost (25% insurance)', log.treasure.reduce(function (a, t) { return a + t.value; }, 0) * 0.25 * mul);
      else log.treasure.forEach(function (t) { ui.haul.push({ id: t.id, name: t.name, kind: t.kind, tier: t.tier, shiny: t.shiny, value: Math.round(t.value * mul * (t.shiny ? 3 : 1)) }); haulCount++; });
    }
    // Contract
    var c = ui.contracts.active;
    if (c) {
      var ok = false; try { ok = !!CONTRACT_DEFS[c.type].check(s, log); } catch (e) { ok = false; }
      if (ok) { add('Contract: ' + c.title, c.cash, c.fins); ui.contracts.done++; }
      else add('Contract failed: ' + c.title, 0, 0, 'no pay');
      ui.contracts.active = null;
    }
    // Fin Tokens: new zones, first bottom, every 5 species.
    var pz = prevDeepZone(log.before.zones);
    if (z > pz) add('First time in ' + (z - pz > 1 ? (z - pz) + ' new zones' : U.ZONE_NAMES[z]), 0, 2 * (z - pz));
    if (s.won && log.before.bottoms === 0 && (s.reason === 'bottom' || s.reason === 'debug')) add('First bottom ever', 0, 5);
    var bookNow = TU.logbook.count(), five = Math.floor(bookNow / 5) - Math.floor(log.before.book / 5);
    if (five > 0) add('Logbook milestone', 0, five);
    // Consumables used this dive are gone.
    var inv = TU.player.inventory || {}, st = ui.stock, lo = log.loadout || {};
    ['tape', 'flexTape', 'glowSticks'].forEach(function (k) {
      if (typeof inv[k] === 'number' && typeof lo[k] === 'number') st[k] = Math.max(0, st[k] - Math.max(0, lo[k] - inv[k]));
      if (d.loadout[k] > st[k]) d.loadout[k] = st[k];
    });
    K.pay(cash, fins);
    rollSeed();
    log.settled = { lines: lines, cash: cash, fins: fins, haulCount: haulCount };
    return log.settled;
  }
  // Tutorial reward: $150 and the Kevin sticker (once).
  K.tutorialReward = function () {
    var ui = K.data();
    TU.save.data.progress.tutorialDone = true;
    if (!ui.tutorialPaid) { ui.tutorialPaid = true; ui.kevin = true; K.pay(150, 0); return true; }
    K.write(); return false;
  };
  K.econ = { settle: settle, DEPTH_BONUS: DEPTH_BONUS, SOLO_MUL: SOLO_MUL };

  /* ------------------------------------------------------------------ */
  /* Contracts                                                           */
  /* ------------------------------------------------------------------ */
  var CONTRACT_DEFS = {
    log3: { title: 'Log 3 new species', blurb: 'The university wants new entries. I want the money they pay me for them.', cash: 250, fins: 1, check: function (s, l) { return l.newSpecies.length >= 3; } },
    fossil: { title: 'Bring back a fossil', blurb: 'Anything old. Not you. Something older than you.', cash: 200, fins: 1, check: function (s, l) { return s.reason !== 'drowned' && l.treasure.some(function (t) { return t.kind === 'fossil'; }); } },
    depth60: { title: 'Reach 60 m', blurb: 'Get to the Black Galleries and look around. Then leave.', cash: 350, fins: 1, check: function (s) { return s.maxDepthM >= 60; } },
    depth20: { title: 'Reach 20 m', blurb: 'Past the Mouth. Into the Throat. Baby steps.', cash: 120, fins: 1, check: function (s) { return s.maxDepthM >= 20; } },
    air50: { title: 'Bottom with 50 bar left', blurb: 'Reach the bottom without sucking the tanks dry. Breathe slow.', cash: 400, fins: 2, check: function (s) { return s.won && s.airLeftBar >= 50; } },
    wp4: { title: 'Mark the way: 4 waypoints', blurb: 'Leave a trail so the next idiot can follow it. The next idiot is you.', cash: 150, fins: 1, check: function (s) { return s.waypoints >= 4; } },
    nosilt: { title: 'Zero silt-outs past 20 m', blurb: 'Swim like an adult. Gentle kicks. No brown clouds.', cash: 200, fins: 1, check: function (s) { return s.siltOuts === 0 && s.maxDepthM >= 20; } },
    fast: { title: 'Bottom in under 20 min', blurb: 'Insurance bills by the hour. Hurry.', cash: 500, fins: 3, check: function (s) { return s.won && s.timeS < 1200; } },
    measure2: { title: 'Measure 2 creatures', blurb: 'Tape on the critter, hold still, write it down. Science.', cash: 180, fins: 1, check: function (s, l) { return l.measured >= 2; } },
    bottom: { title: 'Touch the thing at the bottom', blurb: 'People keep talking about a glow down there. Go touch it. Carefully.', cash: 400, fins: 2, check: function (s) { return s.won; } }
  };
  function contractsFresh() {
    var ui = K.data(), c = ui.contracts, round = TU.save.data.progress.runs;
    if (c.round === round && c.offered.length) return c;
    var r = TU.rng(round * 7919 + c.done * 31 + 5, 77), keys = Object.keys(CONTRACT_DEFS), pick = [];
    while (pick.length < 3) { var k = r.pick(keys); if (pick.indexOf(k) < 0) pick.push(k); }
    c.offered = pick.map(function (k) { var d = CONTRACT_DEFS[k]; return { type: k, title: d.title, blurb: d.blurb, cash: d.cash, fins: d.fins }; });
    c.round = round; K.write();
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Seeds                                                               */
  /* ------------------------------------------------------------------ */
  var nextSeed = (TU.mix32((Date.now() & 0xffffffff) >>> 0) >>> 0);
  function rollSeed() { nextSeed = TU.mix32((nextSeed + 0x6D2B79F5 + (Date.now() & 0xffff)) >>> 0) >>> 0; }
  function parseSeed(text) {
    text = String(text || '').trim(); if (!text) return null;
    if (/^\d+$/.test(text)) return (+text >>> 0);
    var h = 2166136261; for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } // words become a seed too
    return h >>> 0;
  }
  function diveSeed() { var c = K.data().camp; if (c.seedMode === 'typed') { var s = parseSeed(c.seed); if (s != null) return s; } return nextSeed; }
  function dive() {
    var c = K.data().camp;
    TU.game.startDive({ seed: diveSeed(), difficulty: c.difficulty || 'standard' });
  }

  /* ------------------------------------------------------------------ */
  /* Camp stage (grows with lifetime earnings and the logbook)           */
  /* ------------------------------------------------------------------ */
  function stage() {
    var ui = K.data(), cash = ui.lifetimeCash || 0, book = TU.logbook.count(), bottoms = TU.save.data.progress.bottoms;
    var s = cash >= 100000 || book >= 40 ? 5 : cash >= 50000 || bottoms > 0 ? 4 : cash >= 20000 || book >= 25 ? 3 : cash >= 5000 ? 2 : 1;
    return { n: s, name: ['Broke Camp', 'Getting By', 'Real Outfit', 'Famous Divers', 'Legends of the Sump'][s - 1] };
  }

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */
  var cur = 'dive', sayLine = '';
  function buildDom() {
    TU.el('section', { id: 'ui-camp', className: 'ui-screen', attrs: { 'aria-label': 'Sump Camp' }, html: [
      '<div class="ui-cp"><div class="ui-cp-scene" id="ui-cp-scene"><canvas id="ui-cp-canvas" aria-label="Sump Camp scene. Click a place to open it."></canvas>',
      '<div class="ui-cp-head"><div><h2>SUMP CAMP</h2><small id="ui-cp-stage"></small></div><div class="ui-wallet" id="ui-wallet"></div></div>',
      '<div class="ui-cp-say"><div class="ui-marv">' + K.marvSVG() + '</div><q id="ui-cp-say"></q></div>',
      '<nav class="ui-cp-nav" id="ui-cp-nav" aria-label="Camp stations">' + STATIONS.map(function (s) { return '<button data-st="' + s.id + '" id="ui-st-' + s.id + '"><i>' + s.key + '</i>' + s.label + '</button>'; }).join('') + '</nav></div>',
      '<div class="ui-cp-panel" id="ui-cp-panel"></div></div>'
    ].join('') });
    Array.prototype.forEach.call($('ui-cp-nav').children, function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-st')); }); });
    bindScene();
  }
  function wallet() {
    var w = $('ui-wallet'); if (!w) return;
    w.innerHTML = '<span><b>' + K.money(K.cash()) + '</b></span><span><b>' + K.fins() + '</b> FT</span>';
    var st = stage(); $('ui-cp-stage').textContent = 'STAGE ' + st.n + ' · ' + st.name.toUpperCase();
  }
  function say(line) { sayLine = line || K.pick(K.MARV.camp); var q = $('ui-cp-say'); if (q) q.textContent = sayLine; }
  function select(id, line) {
    if (!ST[id]) id = 'dive';
    cur = id; K.data().camp.station = id;
    Array.prototype.forEach.call($('ui-cp-nav').children, function (b) { b.classList.toggle('ui-sel', b.getAttribute('data-st') === id); });
    if (line) say(line);
    renderPanel();
    if (TU.state.is('loadout')) { var sc = $('ui-camp'); if (sc && window.innerWidth > 900) sc.scrollTop = 0; }
  }
  function head(st, title, lead) {
    return '<div class="ui-cp-top"><div class="ui-kicker">' + K.esc(ST[st].place) + '</div><button class="ui-btn ui-ghost ui-small" id="ui-btn-lo-back">Title</button></div>' +
      '<h3 class="ui-cp-h">' + K.esc(title) + '</h3>' + (lead ? '<p class="ui-cp-lead">' + lead + '</p>' : '');
  }
  function renderPanel() {
    var el = $('ui-cp-panel'); if (!el) return;
    if (K.locker && K.locker.leave && cur !== 'locker') K.locker.leave();
    PANELS[cur](el);
    var back = $('ui-btn-lo-back'); if (back) back.onclick = function () { TU.game.toTitle(); };
    wallet();
  }

  /* ------------------------------------------------------------------ */
  /* Panels                                                              */
  /* ------------------------------------------------------------------ */
  function loadoutSummary() {
    var L = TU.save.data.loadout, lo = cfg.loadouts[L.tank] || cfg.loadouts.standard, mins = (TU.progress.value('tank', 'airMinutes') || 10) * lo.tanks;
    var mask = MASKS.filter(function (m) { return m.id === (L.mask || 'standard'); })[0] || MASKS[0];
    var fin = FINS.filter(function (f) { return f.id === K.data().locker.fins.preset; })[0] || FINS[0];
    var tools = [L.tape + ' duct tape'];
    if (L.flexTape) tools.push(L.flexTape + ' Flex Tape');
    if (L.glowSticks) tools.push(L.glowSticks + ' glow sticks');
    if (L.lantern && TU.progress.level('lantern') > 0) tools.push('lantern');
    if (L.measuringTape) tools.push('measuring tape');
    if (L.camera) tools.push('camera');
    return { mins: mins, text: '<b>' + lo.label + '</b> (' + lo.tanks + ' tank' + (lo.tanks > 1 ? 's' : '') + ', about ' + mins + ' min of calm air) · ' + mask.label + ' mask · ' + fin.label + '<br>' + tools.join(', ') };
  }
  var PANELS = {
    dive: function (el) {
      var c = K.data().camp, act = contractsFresh() && K.data().contracts.active, sum = loadoutSummary();
      var seedTxt = c.seedMode === 'typed' ? (parseSeed(c.seed) != null ? String(parseSeed(c.seed)) : 'type one') : String(nextSeed);
      el.innerHTML = head('dive', 'Clip in', 'The rope stake is hammered in, the water is black and very still. Pick how deep you are feeling.') +
        '<div class="ui-chalk"><h4>How bad do you want it?</h4><div class="ui-diffs" role="radiogroup" aria-label="Difficulty">' +
        Object.keys(DIFF).map(function (k) { var d = DIFF[k]; return '<button class="ui-diff' + (c.difficulty === k ? ' ui-sel' : '') + '" data-diff="' + k + '" role="radio" aria-checked="' + (c.difficulty === k) + '"><b>' + d.label + '</b><small>' + d.time + '</small><small>' + d.zones + ' · ' + d.mul + 'x cash</small></button>'; }).join('') +
        '</div><div class="ui-seed"><span class="ui-chip' + (c.seedMode !== 'typed' ? ' ui-sel' : '') + '" role="button" tabindex="0" data-seedmode="random">Random cave</span><span class="ui-chip' + (c.seedMode === 'typed' ? ' ui-sel' : '') + '" role="button" tabindex="0" data-seedmode="typed">Type a seed</span></div>' +
        '<div class="ui-seed"><span style="font-family:var(--mono);font-size:11px;letter-spacing:.2em;opacity:.7">SEED</span><span class="ui-seedv" id="ui-seedv">' + K.esc(seedTxt) + '</span>' +
        (c.seedMode === 'typed' ? '<input id="ui-seed-in" placeholder="number or words" maxlength="24" value="' + K.esc(c.seed || '') + '" aria-label="Seed">' : '<button class="ui-chip" id="ui-seed-roll">Reroll</button>') + '</div></div>' +
        '<div class="ui-sumrow"><div class="ui-sumbox"><h5>LOADOUT</h5>' + sum.text + '</div><div class="ui-sumbox"><h5>CONTRACT</h5>' + (act ? '<b>' + K.esc(act.title) + '</b><br>' + K.money(act.cash) + ' + ' + act.fins + ' FT if you pull it off' : 'None. Marv has work on the Contract Board.') + '</div></div>' +
        '<div class="ui-go"><button class="ui-btn" id="ui-btn-dive">Clip in and dive</button><button class="ui-btn ui-ghost" id="ui-btn-gear">Change gear</button><button class="ui-btn ui-ghost" id="ui-btn-practice">Practice hole</button></div>';
      Array.prototype.forEach.call(el.querySelectorAll('.ui-diff'), function (b) { b.onclick = function () { c.difficulty = b.getAttribute('data-diff'); K.write(); say(DIFF[c.difficulty].line); renderPanel(); }; });
      Array.prototype.forEach.call(el.querySelectorAll('[data-seedmode]'), function (b) {
        function go() { c.seedMode = b.getAttribute('data-seedmode'); K.write(); renderPanel(); if (c.seedMode === 'typed' && $('ui-seed-in')) $('ui-seed-in').focus(); }
        b.onclick = go; b.onkeydown = function (e) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); go(); } };
      });
      var roll = $('ui-seed-roll'); if (roll) roll.onclick = function () { rollSeed(); $('ui-seedv').textContent = String(nextSeed); };
      var inp = $('ui-seed-in');
      if (inp) {
        inp.oninput = function () { c.seed = inp.value; K.write(); var s = parseSeed(inp.value); $('ui-seedv').textContent = s != null ? String(s) : 'type one'; };
        inp.onkeydown = function (e) { e.stopPropagation(); if (e.code === 'Enter') dive(); };
      }
      $('ui-btn-dive').onclick = dive;
      $('ui-btn-gear').onclick = function () { select('loadout'); };
      $('ui-btn-practice').onclick = function () { if (K.startTutorial) K.startTutorial(); };
    },
    loadout: function (el) {
      var L = TU.save.data.loadout, ui = K.data(), st = ui.stock, maskLv = TU.progress.level('mask'), lanLv = TU.progress.level('lantern');
      var airPer = TU.progress.value('tank', 'airMinutes') || 10;
      if (!L.mask) L.mask = 'standard';
      var tanks = Object.keys(cfg.loadouts).map(function (k) {
        var lo = cfg.loadouts[k], cyl = ''; for (var i = 0; i < lo.tanks; i++) cyl += '<i></i>';
        function m(lbl, v) { return '<span>' + lbl + '</span><s><u style="width:' + Math.round(clamp(v, 0, 1) * 100) + '%"></u></s>'; }
        return '<label class="ui-tank" data-tank="' + k + '"><input type="radio" name="ui-tank" value="' + k + '"><strong>' + lo.label.toUpperCase() + '</strong><div class="ui-cyl">' + cyl + '</div>' +
          '<div class="ui-meter">' + m('AIR ' + Math.round(airPer * lo.tanks) + 'm', lo.tanks / 3) + m('SPEED', (lo.swimMul - 0.8) / 0.3) + m('STAMINA', (lo.staminaMul - 0.7) / 0.5) + '</div><div style="margin-top:6px">' + K.esc(lo.desc) + '</div></label>';
      }).join('');
      var masks = MASKS.map(function (m) {
        var locked = maskLv < m.need;
        return '<button class="ui-mask' + (L.mask === m.id ? ' ui-sel' : '') + '" data-mask="' + m.id + '"' + (locked ? ' disabled' : '') + '><b>' + m.label + '</b>' + (locked ? 'Mask L' + m.need + ' at the Gear Tent' : K.esc(m.desc)) + '</button>';
      }).join('');
      function stepper(key, label, sub) { return '<div class="ui-tool"><span>' + label + '<small>' + sub + '</small></span><div class="ui-step"><button data-dec="' + key + '" aria-label="Fewer ' + label + '">-</button><output id="ui-n-' + key + '">' + (L[key] || 0) + '</output><button data-inc="' + key + '" aria-label="More ' + label + '">+</button></div></div>'; }
      function toggle(key, label, sub, disabled) { return '<label class="ui-tool"><span>' + label + '<small>' + sub + '</small></span><input type="checkbox" data-tog="' + key + '"' + (L[key] && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '></label>'; }
      el.innerHTML = head('loadout', 'Gear up', 'Everything laid out on the tarp. More tanks means more air, but you swim like a fridge.') +
        '<div class="ui-tarp"><h4>TANKS</h4><div class="ui-tanks" role="radiogroup" aria-label="Tanks">' + tanks + '</div>' +
        '<h4>MASK</h4><div class="ui-masks">' + masks + '</div>' +
        '<h4>TOOLS</h4><div class="ui-tools">' +
        stepper('tape', 'Duct tape', st.tape + ' in stock · patches a cut') + stepper('flexTape', 'Flex Tape', st.flexTape + ' in stock · seals a bad one') +
        stepper('glowSticks', 'Glow sticks', st.glowSticks + ' in stock · cheap light') +
        toggle('lantern', 'Lantern', lanLv ? lanLv * 2 + ' creature slots' : 'Buy it at the Gear Tent', !lanLv) +
        toggle('measuringTape', 'Measuring tape', 'Measure and log creatures') + toggle('camera', 'Camera', 'Photos for the logbook') + '</div>' +
        '<h4>FLIPPERS</h4><div class="ui-fins">' + FINS.map(function (f) { return '<button class="ui-chip' + (ui.locker.fins.preset === f.id ? ' ui-sel' : '') + '" data-fin="' + f.id + '" title="' + K.esc(f.desc) + '">' + f.label + '</button>'; }).join('') + '</div>' +
        '<p id="ui-kit"></p></div>' +
        '<div class="ui-go" style="margin-top:14px"><button class="ui-btn" id="ui-btn-lo-start">Dive</button><button class="ui-btn ui-ghost" id="ui-btn-tolocker">Tune flippers in the Locker</button></div>';
      function syncTanks() {
        Array.prototype.forEach.call(el.querySelectorAll('.ui-tank'), function (t) { var on = t.getAttribute('data-tank') === L.tank; t.classList.toggle('ui-sel', on); t.querySelector('input').checked = on; });
        $('ui-kit').innerHTML = loadoutSummary().text;
      }
      Array.prototype.forEach.call(el.querySelectorAll('.ui-tank'), function (t) { t.addEventListener('click', function () { TU.save.set('loadout.tank', t.getAttribute('data-tank')); syncTanks(); }); });
      Array.prototype.forEach.call(el.querySelectorAll('[data-mask]'), function (b) { b.onclick = function () { TU.save.set('loadout.mask', b.getAttribute('data-mask')); renderPanel(); }; });
      Array.prototype.forEach.call(el.querySelectorAll('[data-inc],[data-dec]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-inc') || b.getAttribute('data-dec'), v = (L[k] || 0) + (b.getAttribute('data-inc') ? 1 : -1);
          v = clamp(v, 0, st[k] || 0); if (b.getAttribute('data-inc') && v === (L[k] || 0)) say('You have ' + (st[k] || 0) + '. Buy more at the tent.');
          TU.save.set('loadout.' + k, v); $('ui-n-' + k).textContent = v; syncTanks();
        };
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-tog]'), function (c) { c.onchange = function () { TU.save.set('loadout.' + c.getAttribute('data-tog'), c.checked); syncTanks(); }; });
      Array.prototype.forEach.call(el.querySelectorAll('[data-fin]'), function (b) { b.onclick = function () { setFin(b.getAttribute('data-fin')); renderPanel(); }; });
      $('ui-btn-lo-start').onclick = dive;
      $('ui-btn-tolocker').onclick = function () { select('locker'); };
      syncTanks();
    },
    locker: function (el) {
      el.innerHTML = head('locker', 'The locker shack', 'A tin shed with a cracked mirror. Paint your suit, pick a mask frame, tune your flippers.') + '<div id="ui-locker-root"></div>';
      if (K.locker) K.locker.render($('ui-locker-root')); else $('ui-locker-root').textContent = 'Locker unavailable.';
    },
    shop: function (el) {
      var cash = K.cash();
      var TR = [
        { id: 'tank', name: 'Tank capacity', eff: function (lv) { return cfg.upgrades.tank.airMinutes[lv - 1] + ' min per tank'; } },
        { id: 'stamina', name: 'Stamina', eff: function (lv) { return cfg.upgrades.stamina.max[lv - 1] + ' max, ' + cfg.upgrades.stamina.regen[lv - 1] + 'x regen'; } },
        { id: 'swim', name: 'Swim speed', eff: function (lv) { return lv === 1 ? 'Base speed' : '+' + Math.round((cfg.upgrades.swim.mul[lv - 1] - 1) * 100) + '% speed'; } },
        { id: 'battery', name: 'Flashlight battery', eff: function (lv) { return cfg.upgrades.battery.minutes[lv - 1] + ' min of light'; } },
        { id: 'mask', name: 'Mask modules', eff: function (lv) { return ['Basic HUD', 'Tight Seal mask', 'Wide View mask', 'Headlamp mask', 'Advanced HUD'][lv - 1]; } },
        { id: 'rope', name: 'Rope tools', eff: function (lv) { return ['Basic Clip', 'Quick Clip', 'Rope Tags', 'Tension Sense', 'Hand Winch'][lv - 1]; } },
        { id: 'lantern', name: 'Lantern', eff: function (lv) { return lv ? cfg.upgrades.lantern.slots[lv] + ' creature slots' : 'Not owned'; } }
      ];
      var rows = TR.map(function (t) {
        var lv = TU.progress.level(t.id), isL = t.id === 'lantern', max = 5, next = lv + 1;
        var cost = lv >= max ? null : cfg.upgrades[t.id].cost[isL ? lv : lv];
        var pips = ''; for (var i = 1; i <= 5; i++) pips += '<i class="' + (i <= lv ? 'ui-on' : '') + '"></i>';
        var txt = t.eff(lv) + (cost != null ? ' <span style="color:#FFC98A">then ' + t.eff(next) + '</span>' : '');
        return '<div class="ui-up"><div><h5>' + t.name + (isL && !lv ? '' : ' · L' + lv) + '</h5><p>' + txt + '</p><div class="ui-pips">' + pips + '</div></div>' +
          (cost == null ? '<button class="ui-tag ui-max" disabled>MAXED</button>' : '<button class="ui-tag" data-buy="' + t.id + '"' + (cash < cost ? ' disabled' : '') + '>' + (isL && !lv ? 'Buy ' : 'L' + next + ' ') + K.money(cost) + '</button>') + '</div>';
      }).join('');
      var CON = [['tape', 'Duct tape roll', '+3 patches', 20, 3], ['flexTape', 'Flex Tape', '+1 big seal', 45, 1], ['glowSticks', 'Glow sticks', '+4 sticks', 15, 4]];
      el.innerHTML = head('shop', 'Marv\'s gear tent', 'Tanks, hoses, a cooler that is definitely not for bait. Upgrades are yours forever. Consumables get used up.') +
        '<div class="ui-shop">' + rows + '</div><h4 style="font-family:var(--mono);font-weight:400;font-size:11px;letter-spacing:.24em;color:#FFC98A;margin:16px 0 6px">CONSUMABLES</h4><div class="ui-cons">' +
        CON.map(function (c) { return '<div class="ui-con"><b>' + c[1] + '</b>' + c[2] + ' · have ' + K.data().stock[c[0]] + '<button class="ui-tag" data-con="' + c[0] + '" data-cost="' + c[3] + '" data-n="' + c[4] + '"' + (cash < c[3] ? ' disabled' : '') + '>' + K.money(c[3]) + '</button></div>'; }).join('') + '</div>';
      Array.prototype.forEach.call(el.querySelectorAll('[data-buy]'), function (b) { b.onclick = function () { buyUpgrade(b.getAttribute('data-buy')); }; });
      Array.prototype.forEach.call(el.querySelectorAll('[data-con]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-con'), cost = +b.getAttribute('data-cost'), n = +b.getAttribute('data-n');
          if (K.cash() < cost) { say(K.pick(K.MARV.broke)); return; }
          K.pay(-cost, 0); K.data().stock[k] += n; TU.save.data.loadout[k] = (TU.save.data.loadout[k] || 0) + n; K.write();
          say(k === 'tape' ? 'Tape. Everything in life can be fixed with tape.' : K.pick(K.MARV.buy)); renderPanel();
        };
      });
    },
    sell: function (el) {
      var ui = K.data(), haul = ui.haul, total = haul.reduce(function (a, t) { return a + t.value; }, 0);
      el.innerHTML = head('sell', 'The sell table', 'A folding table and a rusty scale. Marv picks each thing up like it personally offended him.') +
        '<div class="ui-table">' + (haul.length ? haul.map(function (t, i) {
          return '<div class="ui-item"><svg viewBox="0 0 64 40" aria-hidden="true"><path d="' + (t.kind === 'fossil' ? 'M32 6A14 14 0 1 0 32 34A14 14 0 1 0 32 6ZM32 12A8 8 0 1 1 32 28A5 5 0 1 1 32 18' : 'M14 30L22 10L42 10L50 30Z') + '" fill="none" stroke="#2a2116" stroke-width="1.6"/></svg>' +
            '<div><b>' + K.esc(t.name) + (t.shiny ? ' ★' : '') + '</b><small>' + K.esc(t.kind) + ' · tier ' + (t.tier || 1) + ' · worth ' + K.money(t.value) + '</small></div>' +
            '<div class="ui-btnrow"><button class="ui-btn" data-sell="' + i + '">Sell ' + K.money(t.value) + '</button><button class="ui-btn ui-ghost" data-keep="' + i + '">Keep</button></div></div>';
        }).join('') + '<div class="ui-btnrow" style="margin-top:6px"><button class="ui-btn" id="ui-btn-sellall" style="background:#EFE6D2;color:#2a2116;box-shadow:none">Sell everything · ' + K.money(total) + '</button></div>'
          : '<div class="ui-empty">Haul bag is empty. Bring back fossils and treasure from the cave.</div>') +
        '<div class="ui-shelf" aria-label="Trophy shelf">' + (ui.trophies.length ? ui.trophies.map(function (t) { return '<span>' + K.esc(t.name) + '</span>'; }).join('') : '<span style="opacity:.6">Trophy shelf: empty</span>') + '</div></div>';
      function sell(i) {
        var t = haul[i]; if (!t) return;
        haul.splice(i, 1); K.pay(t.value, t.shiny ? 2 : 0);
        say(t.value >= 150 ? K.pick(K.MARV.sellGood) : K.pick(K.MARV.sellJunk)); renderPanel();
      }
      Array.prototype.forEach.call(el.querySelectorAll('[data-sell]'), function (b) { b.onclick = function () { sell(+b.getAttribute('data-sell')); }; });
      Array.prototype.forEach.call(el.querySelectorAll('[data-keep]'), function (b) { b.onclick = function () { var t = haul.splice(+b.getAttribute('data-keep'), 1)[0]; if (t) ui.trophies.push(t); K.write(); say('On the shelf it goes. Very sentimental. Very broke.'); renderPanel(); }; });
      var all = $('ui-btn-sellall'); if (all) all.onclick = function () { var n = haul.length, v = total; ui.haul = []; K.pay(v, haul.filter(function (t) { return t.shiny; }).length * 2); haul = ui.haul; say(n + ' things. ' + K.money(v) + '. Don\'t spend it all at once.'); renderPanel(); };
    },
    logbook: function (el) {
      el.innerHTML = head('logbook', 'Research table', 'Coffee rings, a microscope, and the logbook. Every new species pays a bounty when you get back.') + '<div id="ui-book-root"></div>';
      if (K.logbook) K.logbook.renderBook($('ui-book-root'));
    },
    boards: function (el) {
      var lb = TU.save.data.leaderboards || {};
      el.innerHTML = head('boards', 'Leaderboard rock', 'Chalk marks on a boulder and a few dive slates pinned to cork. Local records, this computer only.') +
        '<div class="ui-cork">' + K.BOARDS.map(function (b) {
          var list = (lb[b[0]] || []).slice(0, 5);
          return '<div class="ui-pin"><h5>' + b[1].toUpperCase() + '</h5>' + (list.length ? '<ol>' + list.map(function (e) {
            var d = new Date(e.date); return '<li>' + K.esc(b[2](e.value)) + '<small>' + (d.getMonth() + 1) + '/' + d.getDate() + (e.won ? ' · bottom' : '') + ' · #' + e.seed + '</small></li>';
          }).join('') + '</ol>' : '<div class="ui-none">' + (b[0] === 'fastest' || b[0] === 'airLeft' ? 'Reach the bottom to get chalked up here.' : 'No dives yet. The chalk is waiting.') + '</div>') + '</div>';
        }).join('') + '<div class="ui-pin"><h5>CAMP TOTALS</h5><div class="ui-note2">' + TU.save.data.progress.runs + ' dives<br>' + TU.save.data.progress.bottoms + ' bottoms<br>' + fmtTime(TU.save.data.progress.timeInCaveS) + ' underwater</div></div></div>';
    },
    contracts: function (el) {
      var c = contractsFresh(), act = c.active;
      el.innerHTML = head('contracts', 'Contract board', 'A plank nailed to a tree. Marv pins jobs here. One contract per dive. Pay on success, shame on failure.') +
        '<div class="ui-plank">' + c.offered.map(function (o, i) {
          var on = act && act.type === o.type;
          return '<div class="ui-ct' + (on ? ' ui-act' : '') + '">' + (on ? '<span class="ui-stamp">ACTIVE</span>' : '') + '<h5>' + K.esc(o.title) + '</h5><p>"' + K.esc(o.blurb) + '"</p><div class="ui-rew">' + K.money(o.cash) + ' + ' + o.fins + ' FT</div>' +
            '<button class="ui-btn" data-ct="' + i + '">' + (on ? 'Drop it' : 'Take it') + '</button></div>';
        }).join('') + '</div><p class="ui-cp-lead" style="margin-top:12px">Contracts done: ' + c.done + '. New jobs go up after every dive.</p>' +
        '<div class="ui-tipbox"><div class="ui-marv">' + K.marvSVG() + '</div><q>' + K.esc(K.pick(K.MARV.camp)) + '</q></div>';
      Array.prototype.forEach.call(el.querySelectorAll('[data-ct]'), function (b) {
        b.onclick = function () {
          var o = c.offered[+b.getAttribute('data-ct')];
          if (c.active && c.active.type === o.type) { c.active = null; say('Fine. I\'ll find another dropout.'); }
          else { c.active = JSON.parse(JSON.stringify(o)); say(K.pick(K.MARV.contract)); }
          K.write(); renderPanel();
        };
      });
    }
  };
  function setFin(id) {
    var f = K.data().locker.fins; f.preset = id;
    TU.save.data.loadout.flippers = { preset: f.preset, shape: f.shape, width: f.width };
    K.write();
  }
  K.setFin = setFin;
  function buyUpgrade(track) {
    var lv = TU.progress.level(track), cost = cfg.upgrades[track].cost[lv];
    if (lv >= 5 || cost == null) return;
    if (K.cash() < cost) { say(K.pick(K.MARV.broke)); return; }
    K.pay(-cost, 0);
    TU.save.data.upgrades[track] = lv + 1;
    if (track === 'lantern' && lv === 0) TU.save.data.loadout.lantern = true;
    TU.save.write();
    say(track === 'lantern' && lv === 0 ? K.MARV.lantern : track === 'tank' ? K.MARV.buy[0] : K.pick(K.MARV.buy));
    K.sfx('chime');
    renderPanel();
  }
  K.buyUpgrade = buyUpgrade;

  /* ------------------------------------------------------------------ */
  /* The illustrated scene                                               */
  /* ------------------------------------------------------------------ */
  var WW = 1000, WH = 800, HORIZON = 330;
  var sc = { cv: null, g: null, w: 0, h: 0, dpr: 1, s: 1, ox: 0, oy: 0, bg: null, stageN: 0, book: -1, t: 0, hover: null, flies: [] };
  function bindScene() {
    sc.cv = $('ui-cp-canvas'); sc.g = sc.cv.getContext('2d');
    var r = TU.rng(99, 63);
    for (var i = 0; i < 26; i++) sc.flies.push({ x: r.range(60, 940), y: r.range(380, 720), ph: r.range(0, 6.28), sp: r.range(0.3, 0.9) });
    function at(e) {
      var b = sc.cv.getBoundingClientRect(), x = (e.clientX - b.left) * sc.dpr, y = (e.clientY - b.top) * sc.dpr, best = null, bd = 1e9;
      STATIONS.forEach(function (s) { var dx = sc.ox + s.at[0] * sc.s - x, dy = sc.oy + s.at[1] * sc.s - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } });
      var lim = Math.max(46 * sc.s, 24 * sc.dpr);
      return bd < lim * lim * 2.2 ? best : null;
    }
    sc.cv.addEventListener('mousemove', function (e) { var s = at(e); sc.hover = s ? s.id : null; sc.cv.style.cursor = s ? 'pointer' : 'default'; });
    sc.cv.addEventListener('mouseleave', function () { sc.hover = null; });
    sc.cv.addEventListener('click', function (e) { var s = at(e); if (s) select(s.id, s.id === 'shop' ? 'Welcome to the tent. Don\'t touch anything you can\'t afford.' : null); });
  }
  function X(x) { return sc.ox + x * sc.s; }
  function Y(y) { return sc.oy + y * sc.s; }
  function resize() {
    var r = sc.cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    var st = stage().n, book = TU.logbook.count();
    if (w === sc.w && h === sc.h && sc.bg && st === sc.stageN && book === sc.book) return;
    sc.w = sc.cv.width = w; sc.h = sc.cv.height = h; sc.dpr = dpr; sc.stageN = st; sc.book = book;
    sc.s = Math.min(w / WW, h / WH) * 1.08; sc.ox = (w - WW * sc.s) / 2; sc.oy = (h - WH * sc.s) / 2 + Math.max(0, (h - WH * sc.s)) * 0.12;
    sc.bg = document.createElement('canvas'); sc.bg.width = w; sc.bg.height = h;
    drawStatic(sc.bg.getContext('2d'));
  }
  function poly(g, pts, fill) { g.beginPath(); g.moveTo(X(pts[0]), Y(pts[1])); for (var i = 2; i < pts.length; i += 2) g.lineTo(X(pts[i]), Y(pts[i + 1])); g.closePath(); g.fillStyle = fill; g.fill(); }
  function rect(g, x, y, w, h, fill) { g.fillStyle = fill; g.fillRect(X(x), Y(y), w * sc.s, h * sc.s); }
  function ell(g, x, y, rx, ry, fill) { g.beginPath(); g.ellipse(X(x), Y(y), rx * sc.s, ry * sc.s, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }
  function drawStatic(g) {
    var w = sc.w, h = sc.h, hz = Y(HORIZON), N = TU.noise, i;
    // sky at dusk
    var sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#061820'); sky.addColorStop(0.55, '#123238'); sky.addColorStop(0.85, '#3c4a40'); sky.addColorStop(1, '#a7643c');
    g.fillStyle = sky; g.fillRect(0, 0, w, hz + 2);
    var glow = g.createRadialGradient(X(260), hz, 0, X(260), hz, 420 * sc.s);
    glow.addColorStop(0, 'rgba(255,170,100,.45)'); glow.addColorStop(1, 'rgba(255,170,100,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, hz + 2);
    var r = TU.rng(7, 64); g.fillStyle = 'rgba(230,240,235,.7)';
    for (i = 0; i < 60; i++) { var sx = r.float() * w, sy = r.float() * hz * 0.55; g.fillRect(sx, sy, r.float() < 0.15 ? 2 : 1, 1); }
    // ground
    var gr = g.createLinearGradient(0, hz, 0, h);
    gr.addColorStop(0, '#13231b'); gr.addColorStop(0.5, '#0c1612'); gr.addColorStop(1, '#060b09');
    g.fillStyle = gr; g.fillRect(0, hz, w, h - hz);
    // jungle layers (noise silhouettes with tree crowns)
    [['#0f2424', 0, 70], ['#0b1c1c', 1, 95], ['#081413', 2, 60]].forEach(function (L) {
      g.beginPath(); g.moveTo(0, h);
      var base = HORIZON + L[1] * 14;
      for (var x = 0; x <= w + 8; x += 6) {
        var wx = (x - sc.ox) / sc.s, n = N.fbm(wx * 0.006 + L[1] * 13.1, L[1] * 3.7, 0.5, 3);
        var crown = Math.abs(Math.sin(wx * 0.045 + L[1])) * 18;
        g.lineTo(x, Y(base - (60 + n * L[2] + crown) * (L[1] === 2 ? 0.35 : 1)));
      }
      g.lineTo(w, h); g.closePath(); g.fillStyle = L[0]; g.fill();
    });
    // a couple of palm-ish trees in front
    function tree(x, y, hgt, lean) {
      g.strokeStyle = '#0a1311'; g.lineWidth = 7 * sc.s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(x), Y(y)); g.quadraticCurveTo(X(x + lean * 0.5), Y(y - hgt * 0.6), X(x + lean), Y(y - hgt)); g.stroke();
      g.fillStyle = '#0a1311';
      for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2; g.beginPath(); g.ellipse(X(x + lean + Math.cos(a) * 26), Y(y - hgt + Math.sin(a) * 9), 34 * sc.s, 8 * sc.s, a, 0, Math.PI * 2); g.fill(); }
    }
    tree(40, 520, 260, 20); tree(960, 500, 240, -25); tree(470, 340, 130, 10);
    // ground clearing (lighter dirt where people walk)
    ell(g, 500, 560, 430, 170, 'rgba(70,58,40,.22)');
    // string lights (stage 2+)
    if (sc.stageN >= 2) {
      g.strokeStyle = 'rgba(30,25,20,.9)'; g.lineWidth = 1.2 * sc.s; g.beginPath(); g.moveTo(X(190), Y(365)); g.quadraticCurveTo(X(430), Y(420), X(650), Y(360)); g.stroke();
      for (i = 0; i <= 12; i++) { var t = i / 12, bx = (1 - t) * (1 - t) * 190 + 2 * (1 - t) * t * 430 + t * t * 650, by = (1 - t) * (1 - t) * 365 + 2 * (1 - t) * t * 420 + t * t * 360; ell(g, bx, by + 4, 3, 3, i % 3 ? '#ffd28a' : '#9fffe8'); }
    }
    // contract board tree
    rect(g, 320, 230, 22, 200, '#121a15'); ell(g, 331, 230, 70, 46, '#0c1714');
    rect(g, 298, 322, 66, 40, '#6b5236'); rect(g, 304, 327, 16, 20, '#e9dcc0'); rect(g, 324, 330, 14, 18, '#efe6d2'); rect(g, 342, 326, 16, 22, '#e3d4b2');
    // locker shack
    poly(g, [80, 365, 210, 350, 214, 365, 76, 380], '#3d4a47');
    rect(g, 86, 372, 120, 82, '#27312f'); rect(g, 100, 392, 30, 62, '#161d1c'); rect(g, 150, 392, 34, 22, '#e7b36b');
    for (i = 0; i < 8; i++) rect(g, 86 + i * 15, 372, 1.5, 82, 'rgba(0,0,0,.25)');
    // truck
    rect(g, 820, 340, 120, 34, '#1c2725'); poly(g, [830, 340, 845, 314, 892, 314, 896, 340], '#1c2725'); rect(g, 852, 319, 32, 16, '#36484a');
    ell(g, 846, 376, 13, 13, '#0b1011'); ell(g, 918, 376, 13, 13, '#0b1011');
    // gear tent (Marv)
    poly(g, [615, 440, 700, 335, 788, 440], '#3d3424'); poly(g, [672, 440, 700, 372, 728, 440], '#ffb45c');
    poly(g, [672, 440, 700, 372, 690, 440], 'rgba(120,70,20,.55)');
    rect(g, 650, 330, 66, 18, '#d9c9a6'); g.fillStyle = '#2a2116'; g.font = (12 * sc.s) + 'px "Share Tech Mono", monospace'; g.textAlign = 'center'; g.fillText('GEAR', X(683), Y(343));
    // research table + species corkboard (sketches pinned = logbook count)
    rect(g, 186, 470, 96, 54, '#8a5a32'); rect(g, 183, 467, 102, 4, '#4d3420');
    for (i = 0; i < Math.min(sc.book, 24); i++) rect(g, 190 + (i % 8) * 11.5, 474 + Math.floor(i / 8) * 16, 9, 11, '#efe6d2');
    rect(g, 176, 524, 116, 7, '#4d3c2a'); rect(g, 182, 531, 5, 30, '#3a2c1f'); rect(g, 282, 531, 5, 30, '#3a2c1f');
    ell(g, 210, 522, 6, 3, '#2a3a40'); // microscope-ish
    // sell table with a scale
    rect(g, 676, 522, 100, 7, '#5b4630'); rect(g, 684, 529, 4, 30, '#3a2c1f'); rect(g, 764, 529, 4, 30, '#3a2c1f');
    rect(g, 712, 504, 4, 18, '#7a6a52'); poly(g, [700, 506, 728, 506, 724, 510, 704, 510], '#8f7d5f');
    // leaderboard rock with chalk tallies
    ell(g, 860, 612, 72, 44, '#2c312d'); ell(g, 846, 600, 50, 26, '#363c37');
    g.strokeStyle = 'rgba(235,240,232,.6)'; g.lineWidth = 1.4 * sc.s;
    for (i = 0; i < Math.min(TU.save.data.progress.runs, 18); i++) { var tx = 818 + (i % 9) * 8, ty = 596 + Math.floor(i / 9) * 16; g.beginPath(); g.moveTo(X(tx), Y(ty)); g.lineTo(X(tx + 2), Y(ty + 11)); g.stroke(); }
    // campfire stones and logs
    for (i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2; ell(g, 500 + Math.cos(a) * 30, 482 + Math.sin(a) * 11, 8, 5, '#2a2d29'); }
    poly(g, [470, 478, 528, 470, 530, 476, 472, 484], '#3b2b1d'); poly(g, [474, 470, 530, 482, 526, 487, 470, 476], '#46331f');
    // log benches
    poly(g, [410, 520, 470, 512, 472, 524, 412, 532], '#3b2b1d'); poly(g, [540, 515, 600, 522, 598, 534, 538, 527], '#3b2b1d');
    // sinkhole: rock rim, black water
    ell(g, 545, 705, 245, 92, '#1a2321'); ell(g, 545, 712, 222, 76, '#0e1615');
    var wg = g.createRadialGradient(X(545), Y(715), 4, X(545), Y(715), 210 * sc.s);
    wg.addColorStop(0, '#0d4f53'); wg.addColorStop(0.5, '#062a2d'); wg.addColorStop(1, '#020c0d');
    g.beginPath(); g.ellipse(X(545), Y(716), 206 * sc.s, 66 * sc.s, 0, 0, Math.PI * 2); g.fillStyle = wg; g.fill();
    // dive platform with the rope stake
    poly(g, [500, 612, 640, 612, 650, 668, 492, 668], '#5a4630');
    for (i = 1; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(X(496 + i * 26), Y(612), 1.5 * sc.s, 56 * sc.s); }
    rect(g, 606, 572, 8, 44, '#6c6f6c'); ell(g, 610, 572, 7, 3, '#8a8d89');
    g.strokeStyle = '#c9b48a'; g.lineWidth = 2.2 * sc.s; g.beginPath(); g.moveTo(X(610), Y(580)); g.bezierCurveTo(X(600), Y(640), X(570), Y(690), X(545), Y(720)); g.stroke();
    // gear tarp with tanks and fins (Loadout)
    poly(g, [246, 618, 410, 612, 432, 676, 230, 684], '#1f4a6b');
    [[270, 628], [290, 628]].forEach(function (p) { rect(g, p[0], p[1], 13, 40, '#d9b23c'); ell(g, p[0] + 6.5, p[1], 6.5, 4, '#d9b23c'); rect(g, p[0] + 4, p[1] - 8, 5, 6, '#444'); });
    poly(g, [330, 640, 360, 630, 372, 664, 340, 668], '#121a1c'); poly(g, [372, 640, 398, 632, 410, 664, 382, 668], '#121a1c');
    ell(g, 330, 625, 12, 8, '#0f1517'); // mask
  }
  function drawScene(dt) {
    if (!sc.cv || !TU.state.is('loadout')) return;
    resize(); sc.t += dt;
    var g = sc.g, t = sc.t, i;
    g.drawImage(sc.bg, 0, 0);
    // fire light on the ground
    var fl = 0.85 + 0.1 * Math.sin(t * 9.3) + 0.06 * Math.sin(t * 23.1);
    g.globalCompositeOperation = 'lighter';
    var fg = g.createRadialGradient(X(500), Y(470), 0, X(500), Y(470), 230 * sc.s * fl);
    fg.addColorStop(0, 'rgba(255,150,60,.32)'); fg.addColorStop(0.4, 'rgba(255,120,40,.10)'); fg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = fg; g.fillRect(0, 0, sc.w, sc.h);
    // flames
    for (i = 0; i < 5; i++) {
      var fx = 486 + i * 7, fh = (26 + 14 * Math.sin(t * (7 + i) + i * 1.7)) * fl;
      g.beginPath(); g.moveTo(X(fx - 7), Y(474)); g.quadraticCurveTo(X(fx + Math.sin(t * 5 + i) * 4), Y(474 - fh * 1.2), X(fx + 7), Y(474)); g.closePath();
      g.fillStyle = i % 2 ? 'rgba(255,190,80,.75)' : 'rgba(255,120,40,.7)'; g.fill();
    }
    // tent lantern glow
    var tg = g.createRadialGradient(X(700), Y(420), 0, X(700), Y(420), 90 * sc.s);
    tg.addColorStop(0, 'rgba(255,180,92,' + (0.22 + 0.04 * Math.sin(t * 2.1)).toFixed(3) + ')'); tg.addColorStop(1, 'rgba(255,180,92,0)');
    g.fillStyle = tg; g.fillRect(0, 0, sc.w, sc.h);
    // water shimmer in the sinkhole
    for (i = 0; i < 7; i++) {
      var ph = t * 0.4 + i * 0.9, a = 0.05 + 0.04 * Math.sin(ph * 2);
      g.strokeStyle = 'rgba(79,242,208,' + a.toFixed(3) + ')'; g.lineWidth = 1.2 * sc.s;
      g.beginPath(); g.ellipse(X(545 + Math.sin(ph) * 30), Y(716 + Math.cos(ph * 0.7) * 8), (60 + i * 18) * sc.s, (14 + i * 5) * sc.s, 0, 0.2 + i, 1.6 + i); g.stroke();
    }
    // fireflies
    sc.flies.forEach(function (f) {
      var x = f.x + Math.sin(t * f.sp + f.ph) * 22, y = f.y + Math.cos(t * f.sp * 0.7 + f.ph) * 12, b = 0.5 + 0.5 * Math.sin(t * 2.4 + f.ph * 3);
      g.fillStyle = 'rgba(200,255,150,' + (0.15 + 0.55 * b).toFixed(3) + ')'; g.beginPath(); g.arc(X(x), Y(y), (1.3 + b) * sc.s * 1.4, 0, Math.PI * 2); g.fill();
    });
    g.globalCompositeOperation = 'source-over';
    // station markers and labels
    var narrow = sc.w / sc.dpr < 560, fs = Math.max(10, 12 * sc.s / 0.6) * (narrow ? 0.8 : 1);
    g.font = '600 ' + Math.round(fs * sc.dpr / (sc.dpr > 1 ? 1.2 : 1)) + 'px "Share Tech Mono", monospace'; g.textAlign = 'center';
    STATIONS.forEach(function (s) {
      var sel = s.id === cur, hov = s.id === sc.hover, x = X(s.at[0]), y = Y(s.at[1]) - 30 * sc.s, pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.key);
      var rr = (sel ? 7 : 5) * Math.max(sc.s, 0.45) * (sc.dpr > 1 ? 1.2 : 1);
      g.beginPath(); g.arc(x, y, rr + (sel ? pulse * 5 : 0), 0, Math.PI * 2); g.fillStyle = sel ? 'rgba(79,242,208,.25)' : 'rgba(255,201,138,.18)'; g.fill();
      g.beginPath(); g.arc(x, y, rr * 0.6, 0, Math.PI * 2); g.fillStyle = sel ? '#4FF2D0' : hov ? '#fff' : '#FFC98A'; g.fill();
      if (sel || hov || !narrow) {
        var txt = s.label.toUpperCase(), tw = g.measureText(txt).width + 10 * sc.dpr;
        g.fillStyle = sel ? 'rgba(242,233,216,.95)' : 'rgba(5,10,12,.65)'; g.fillRect(x - tw / 2, y - rr - fs * 1.9, tw, fs * 1.45);
        g.fillStyle = sel ? '#1b1914' : hov ? '#fff' : '#E9DFCB'; g.fillText(txt, x, y - rr - fs * 0.85);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Part hooks                                                          */
  /* ------------------------------------------------------------------ */
  K.camp = { select: function (id, line) { select(id, line); }, dive: dive, say: say, current: function () { return cur; }, seed: function () { return diveSeed(); }, stage: stage };
  K.part('camp', {
    init: function () {
      buildDom();
      cur = K.data().camp.station || 'dive';
      K.on('money', wallet);
      // Number keys 1 to 8 jump between stations.
      window.addEventListener('keydown', function (e) {
        if (!TU.state.is('loadout') || e.repeat || K.overlayOpen()) return;
        var tag = (e.target && e.target.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        var m = /^Digit([1-8])$/.exec(e.code); if (m) select(STATIONS[+m[1] - 1].id);
      });
    },
    state: function (e) {
      if (e.to === 'loadout') { select(cur, sayLine || K.pick(K.MARV.camp)); sc.w = 0; }
      if (e.from === 'loadout' && K.locker && K.locker.leave) K.locker.leave();
    },
    frame: drawScene
  });
})();
