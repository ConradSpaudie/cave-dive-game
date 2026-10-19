# Tied Under: module contract

This is the shared interface between the files in `js/`. Several agents built the modules in parallel (cave, creatures, player, UI, then weapons, predators, endless depth and glow sticks); the integration lead now owns every file and merged all their notes and requests into this one document. The long-form notes that used to live in CONTRACT-B-NOTES.md, CONTRACT-C-NOTES.md and CONTRACT-ENDLESS-NOTES.md are now Appendices A to C at the end (those files are kept, marked merged, for history). All REQUESTS-*.md items are resolved (see section 16).

Four agents work in parallel, each on their own files. If you need something from a file you do not own, **do not edit it**: write the request in your hand-off ("needs from core.js: ...") and code against the stub, which already exists.

| Agent | Owns | Must not edit |
|---|---|---|
| A | `js/cave.js`, `js/generator.js` (footer only; the generator body is frozen, see below) | everything else |
| B | `js/creatures.js` | everything else |
| C | `js/player.js`, `js/fx.js`, `js/audio.js` | everything else |
| D | `js/ui.js` | everything else |
| Lead | `js/core.js`, `js/main.js`, `index.html`, `tests/`, this file | |

Golden rules
1. Plain scripts, no ES modules, no bundler. Everything shared hangs off `window.TU`.
2. Each file is one IIFE: `(function () { 'use strict'; ... })();`. Files that need three.js start with `if (!window.THREE) return;`.
3. Fill your public API with `TU.define('<name>', { ... })`. Anything you leave out keeps the stub from `core.js`, so the game never crashes on a missing function.
4. Register per-step work with `TU.addSystem('<name>', hooks)`. Never start your own `requestAnimationFrame` loop or timers for gameplay.
5. Talk to other modules through events (`TU.emit` / `TU.on`) and the read-only shared state (`TU.player.state`, `TU.run`, `TU.cave.features`). Read other modules' state, never write it.
6. Make your own DOM and CSS from JS (`TU.el`, `TU.css`) with your prefix. Never add markup to `index.html`.
7. Every tunable number goes in `TU.cfg` (request new keys from the lead; until then keep a local `var` with a `// TODO cfg` comment).
8. Artifact rules: no `alert/confirm/prompt`, no `fetch` or any network, no WebSocket/WebRTC, no download links, `localStorage` only through `TU.save` (it is wrapped in try/catch). No em dash characters anywhere (code, comments, UI text).
9. Short plain-English comments: the owner is a beginner who reads the code to learn.

---

## 1. Units and coordinates

| Quantity | Unit |
|---|---|
| Distance, position, size | meters |
| Time, dt | seconds |
| Speed | m/s |
| Air | bar (one level-1 tank = 200 bar = 10 min calm breathing) |
| Battery, stamina, panic | 0 to 100 (stamina max can be above 100 with upgrades) |
| Vest fill, silt, narcosis, daylight, siltiness, cold | 0 to 1 |
| Angles | radians (cfg.swim.fov is degrees, as three.js wants) |
| Temperature | degrees C |

- **Y is up.** The entrance water surface is `y = TU.cfg.world.surfaceY = 0`. **Depth = -y** (meters below the surface, never negative).
- Yaw 0 looks down **-Z**. Yaw and pitch use Euler order `'YXZ'`. `TU.util.yawPitchOf(dir)` converts a direction to `{yaw, pitch}`.
- Generator grid to world (in `TU.gen`): grid x (east) = world +X, grid y (north) = world **-Z**, grid d (depth layer) goes down. Cell `(x, y, d)` spans world `x*8 .. (x+1)*8`, `y` from `-d*8` down to `-(d+1)*8`, `z` from `-y*8` to `-(y+1)*8`. Helpers: `TU.gen.cellMin(x,y,d)`, `TU.gen.cellCenter(x,y,d)`, `TU.gen.dirVector(dir)` (dir 0 N, 1 E, 2 S, 3 W, 4 UP, 5 DOWN).
- Depth zones (0..4) come from depth: `TU.util.zoneOfDepth(m)`: 0 The Mouth (0 to 20 m), 1 Twilight Throat (20 to 60), 2 The Black Galleries (60 to 120), 3 The Sulfur Deep (120 to 200), 4 The Old Water (200+). Names in `TU.util.ZONE_NAMES`.

---

## 2. Load order and the loop

`index.html` loads, in order: three.js r128 (cdnjs), `core.js`, `generator.js`, `fx.js`, `cave-sdf.js`, `cave-mat.js`, `cave-dress.js`, `cave.js`, `creatures-lib.js`, `creatures-models.js`, `creatures-pred-models.js`, `creatures.js`, `creatures-predators.js`, `creatures-finds.js`, `player.js`, `player-hands.js`, `weapons.js`, `audio.js`, `glowsticks.js`, `ui.js`, `ui-hud.js`, `ui-logbook.js`, `ui-camp.js`, `ui-locker.js`, `ui-wrist.js`, `ui-tutorial.js`, `main.js`. At load time a file may only define things and call `TU.define`, `TU.addSystem`, `TU.on`, `TU.css`, `TU.tex.register`. **Do not touch the scene or DOM of other modules at load time**: do it in `init()`.

### System hooks
```js
TU.addSystem('cave', {
  init()      // once at boot. Renderer, TU.scene, TU.camera already exist (fx inits first).
  reset(run)  // at the start of every dive (and when returning to the title). run = TU.run (see 6).
  update(dt)  // every fixed step while simulating (state 'dive' or 'tutorial'). dt = 1/60 s.
  idle(dt)    // every fixed step in 'title', 'loadout', 'results', 'dead' (ambient motion only).
  frame(dt)   // once per rendered frame in every state after boot (cheap visual work: DOM, instanced meshes).
});
```
- **INIT_ORDER** (init and reset): `fx, cave, creatures, player, audio, ui`.
- **UPDATE_ORDER** (update, idle, frame): `player, cave, creatures, fx, audio, ui`, then the **run director** in main.js (area banners, win check).
- Paused: no update or idle, frames still render. Extra systems a module registered that are not listed (`finds`, `hands`) run after the listed ones.
- While a full-screen UI hides the view (`TU.ui.coversScreen()` is true: the camp in `'loadout'`, the story) main.js skips `TU.fx.render()`; frame hooks still run.
- The loop is fixed-step (`TU.cfg.loop.fixedDt = 1/60`, at most `maxSteps = 5` per frame). Never read wall-clock time for gameplay; accumulate `dt`.
- Boot errors: if WebGL cannot start (fx.js tags the error `tuWebGL`) the page says "WebGL is not available". Any other `init()` error shows "Something went wrong while loading: <message> (module: <name>)". Essential systems (`fx, cave, player, ui`) stop the boot; non-essential ones (`creatures, finds, hands, audio`) are switched off, their core.js stubs are put back (`TU._stubs`) and the game keeps running with a small notice.
- During play a hook that throws is logged (at most 3 times) and the other systems keep running; a non-essential system that fails 3 times is switched off. An error in one event handler never stops the others.

What this order means for you: player moves first using last step's creature, silt and cave data; fx reads the player's new camera and lamp; ui shows the final numbers.

---

## 3. Core services (core.js)

| API | What it does |
|---|---|
| `TU.util.clamp, lerp, smooth(a,b,v), mix3, damp(a,b,rate,dt), fmtTime(s), zoneOfDepth(m), v3(x,y,z), yawPitchOf(dir), reducedMotion` | math helpers |
| `TU.noise.n3(x,y,z)`, `TU.noise.fbm(x,y,z,octaves)` | seeded simplex noise, about -1..1 |
| `TU.rng(seed, stream)` returns an Rng with `next()` (uint32), `float()` [0,1), `below(n)`, `range(lo,hi)` float, `int(lo,hi)`, `chance(p)`, `pick(arr)`, `fn()` (a `() => float` function) | xoshiro128**, bit-identical to the generator. Streams in use: 0 run meta, 10 cave dressing, 20 creatures, 30 fx, 40 player. Pick a new stream number for new uses. |
| `TU.on(name, fn)`, `TU.off(name, fn)`, `TU.once(name, fn)`, `TU.emit(name, payload)` | synchronous event bus |
| `TU.cfg` | all tunables (section 9) and `TU.cfgDefaults` (frozen copy) |
| `TU.state.current`, `TU.state.is(s)`, `TU.state.simulating()`, `TU.setState(s, data)` | state machine (section 4) |
| `TU.save.data`, `TU.save.get('a.b')`, `TU.save.set('a.b', v)`, `TU.save.write()`, `TU.save.reset()` | persistent save (section 8) |
| `TU.logbook.add(entry)`, `has(id)`, `get(id)`, `count()` | logbook (section 8) |
| `TU.progress.level(track)`, `TU.progress.value(track, field)`, `TU.progress.recordRun(summary)` | upgrades and leaderboards |
| `TU.css(id, text)`, `TU.el(tag, props, parent)`, `TU.$(id)` | DOM helpers |
| `TU.tex.get(name)` names: `glow, dot, bubble, silt, rockNormal, waterNormal, glyph` (glyph from cave.js); `TU.tex.register(name, maker)`, `TU.tex.canvas(w,h,draw)`, `TU.tex.normalMap(size,freq,strength,seedZ)`, `TU.tex.label(text)` | shared textures (do not dispose shared ones) |
| `TU.scene`, `TU.camera`, `TU.renderer`, `TU.canvas` | set by fx.js in init |
| `TU.systems` | registered systems by name |

---

## 4. Game states and flow

States: `'boot' -> 'title' -> ('loadout') -> 'dive' <-> 'paused' -> 'results' | 'dead' -> 'dive' or 'title'`. `'tutorial'` is reserved for the practice dive (simulates like `'dive'`, no UI yet).

Only main.js changes state for game flow. Everyone else calls `TU.game.*`:

| Call | Effect |
|---|---|
| `TU.game.startDive({ seed?, difficulty?, modifiers?, touch? })` | unlocks audio (must run inside a click), builds `TU.run`, calls every `reset(run)`, state `'dive'`, emits `run:start` |
| `TU.game.pause()` / `resume()` | `'dive'` <-> `'paused'` |
| `TU.game.restart()` | startDive with the last options |
| `TU.game.endRun({ won, reason })` | records the run, emits `run:end`, state `'results'` (won) or `'dead'`. Reasons: `bottom, drowned, bled, crushed, quit, debug, endless` |
| `TU.game.keepDiving()` | after a won run: reopens the same run in endless mode (`run.endless = true`, `run.leg++`), state `'dive'`, emits `run:continue`. No second win; calling the dive later ends it as a win with reason `'endless'` |
| `TU.game.toTitle()`, `TU.game.openLoadout()` | menus (the Sump Camp hub is shown in state `'loadout'`) |

- `startDive({ tutorial: true })` sets `TU.run.tutorial`. The practice dive runs in state `'dive'` (player input only listens in `'dive'`); `'tutorial'` stays reserved. In a tutorial run deaths do not end the run (`TU.player.rescue()` instead), the bottom does not win and nothing is recorded.
- Deaths: main.js ends the run on `player:drown` (`'drowned'`), `player:bledOut` (`'bled'`) and `player:crushed` (`'crushed'`).

Full flow: title -> story -> (tutorial) -> camp (`'loadout'`) -> dive (easy / standard / hard) -> bottom -> results -> END RUN or KEEP DIVING -> ... -> camp. Deaths go to `'dead'` and back to camp, dive again or title.

`state:change` payload: `{ from, to, data }`. For `'results'` and `'dead'`, `data.summary` is the run summary (section 6).

---

## 5. Events

All payloads are plain objects. Vectors in payloads are copies (safe to keep). "Emitter" is the only module allowed to emit it.

| Event | Payload | Emitter | Listeners now |
|---|---|---|---|
| `state:change` | `{from, to, data}` | core (via main) | player (pointer lock), audio (suspend), ui (screens) |
| `run:start` | `{run}` | main | ui |
| `run:end` | `{won, reason: 'bottom'\|'drowned'\|'bled'\|'crushed'\|'debug'\|'quit'\|'endless', summary}` | main | audio, ui |
| `run:continue` | `{run, leg, segment}` (segment: the new goal segment) | main (`keepDiving`) | ui (new run log for the next leg) |
| `area:enter` | `{id, title, subtitle, style: 'zone'\|'msg'}` | main (director, first entry per run into a `TU.cave.areas` id) | ui |
| `player:kick` | `{strength, sprint}` | player | audio |
| `player:inhale` / `player:exhale` | `{dur (s), surfaced, panic (0..1)}` | player | audio |
| `player:hit` | `{strength 0..1, impact (m/s), normal, pos}` | player (wall hit above `cfg.swim.wallHitMin`) | audio |
| `player:cut` | `{severity 0..1, pos, injury}` | player | audio, ui |
| `player:injury` | `{type, severity, side, source}` | player | |
| `player:bledOut` | `{pos, depth}` | player (bleeding untreated at the lowest health for `cfg.injury.bleedOut` s; never in the tutorial) | main ends the run (`'bled'`) |
| `player:crushed` | `{pos, depth, severity}` | player (a falling rock with severity >= `cfg.rocks.crushSeverity`) | main ends the run (`'crushed'`), audio, ui |
| `player:tapeStart` / `player:tape` / `player:tapePeel` | `{kind}` / `{kind, injury, left}` / `{injury}` | player | audio |
| `player:fall`, `player:ragdoll`, `player:mode` | `{height, injury}`, `{on}`, `{from, to}` | player | audio |
| `player:grab`, `player:current`, `player:tug`, `player:currentEscape` | `{on, point?}`, `{caught, strength}`, `{active, value}`, `{ok, strength}` | player | audio |
| `player:maskFlood` / `player:maskClear` | `{level}` / `{}` | player | audio |
| `player:tankDrop` / `player:tankPickup` | `{index, pos, bar}` / `{index, bar}` | player | audio |
| `player:lantern`, `player:measure`, `player:catchFail` | `{out}`, `{state, progress, speciesId, result}`, `{reason, speciesId}` | player | audio |
| `player:climb`, `player:splash`, `player:jump`, `player:footstep`, `player:pull` | small payloads for sound | player | audio |
| `player:shocked`, `player:bitten`, `player:stung` | `{strength}`, `{severity, speciesId}`, `{kind, severity}` | player | audio |
| `player:drown` | `{pos, depth}` | player (once per run) | main ends the run |
| `player:held` | `{on, id?, kind?}` | player (a predator's hold starts or ends, see `setHeld`) | |
| `player:surfaced` / `player:submerged` | `{pos, surfaceY}` / `{pos}` | player | ui |
| `player:siltout` / `player:siltclear` | `{silt}` / `{}` | player | ui |
| `player:light` | `{on, reason: 'toggle'\|'dead'\|'empty'}` | player | ui |
| `player:lowBattery` | `{battery}` | player | ui |
| `player:narcosis` | `{depth}` | player (once per run past `cfg.narcosis.msgDepth`) | ui |
| `player:blocked` | `{kind: 'exit'}` | player | ui |
| `player:tankSwitch` | `{from, to}` (tank indexes) | player | ui |
| `waypoint:placed` | `{index, name, pos, depth}` | player | audio, ui |
| `creature:seen` | `{id, speciesId, variant}` | creatures (first time in view) | |
| `creature:attack` | `{id, speciesId, kind: 'pinch'\|'bite'\|'shock'\|'venom'\|'sting'\|'slash'\|'grab'\|'ink'\|'bump', severity 0..1, injury, panic, lightFlicker s, blur s, gore, radius, pos, dir}`. Predator kinds: `slash` (injury cut), `grab` (no injury, panic; a held diver gets one every 1.6 s), `ink` (`blur` s), `bump` (panic and a shove) | creatures | player (panic, light flicker, blur, cuts, blood), ui (messages: "SLASHED", "GRABBED. Tap A D A D or stab it.", "INKED. You cannot see.", "Something big just bumped you.") |
| `creature:tell` | `{id, species, speciesId, kind: 'circle'\|'hunch'\|'chatter'\|'hiss'\|'flash'\|'rumble', pos}`: the warning right before a predator strikes (at least 0.6 s before it). Not `creature:warn` | creatures-predators | ui (first tell per species per run explains it, later a short cue at most every 4 s; `circle` is silent), the predators play a synthesized sound for each |
| `creature:hurt` | `{id, species, speciesId, hp, maxHp, pos, point, amount, kind, weapon}` | creatures | |
| `creature:killed` | `{id, species, speciesId, pos, by, sizeM}` | creatures | |
| `creature:grab` / `creature:release` | `{id, species, speciesId, strength, kind: 'drag'\|'hold'\|'shake'}` / `{..., reason: 'struggle'\|'hit'\|'killed'\|'stunned'\|'timeout'\|'lost'\|'debug'}` | creatures-predators | ui ("You kicked free.", "It let go.") |
| `creature:ink` | `{id, species, speciesId, pos}` | creatures-predators | |
| `creature:warn` | `{id, speciesId, kind: 'pinch'\|'shock', pos}` | creatures (once per approach) | audio, ui |
| `fossil:found` | as `treasure:found`, fossils only | creatures-finds | |
| `creature:fled` | `{id, speciesId}` | creatures | |
| `creature:caught` | `{id, speciesId, brightness, lantern}` | creatures | player |
| `creature:logged` | `{speciesId, sizeM, first, record, entry}` | core (`TU.logbook.add`) | ui |
| `treasure:found` | `{id, kind: 'fossil'\|'treasure', name, value ($), tier, pos, kg, shiny}` | creatures-finds (`pickup`, called by player on E) | cave (hides it), ui (haul bag) |
| `quake` | `{strength 0..2, duration (s), pos?}` | cave (`TU.cave.quake`, the `collapse_ahead` modifier) | fx, player, audio, ui |
| `cave:collapse` | `{pieceId, branchId, pathId, pos, cause: 'quake'\|'debug'\|'endless'}` (`endless`: the shaft behind you when a new segment opens) | cave | ui |
| `cave:segment` | `{index, state: 'building'\|'open'\|'freed', seed?, zone?, zoneName?, topM?, bottom?, freed?}` | cave (endless depth) | creatures (spawn the new segment on `open`, remove the freed segment's creatures on `freed`), creatures-predators (via creatures' segment hook), ui-wrist (rebuilds the hologram) |
| `glowstick:throw` | `{pos, dir, color, left}` | glowsticks | |
| `cave:rockHit` | `{r (m), speed (m/s), pos}` | cave-dress (a falling rock touches the diver) | player (cut, break, or crushed) |
| `save:changed` | `{data}` | core | |
| `ui:msg` | `{text, dur?}` | anyone | ui |
| `ui:zone` | `{title, subtitle}` | anyone | ui |
| `ui:hint` / `ui:hideHint` | `{text, dur?}` / `{}` | anyone | ui |
| `ui:toggleHud` | `{}` | player (H key) | ui |
| `ui:wrist` / `ui:watch` | `{open}` | ui | player (raises the arm) |
| `weapon:fire` | `{weapon}` | weapons | |
| `weapon:hit` | `{weapon, target: 'creature'\|'target'\|'rock', id, species, point, damage, kind, hp, killed}` | weapons | |
| `weapon:noise` | `{pos, loudness 0..1, radius (m), weapon, scare: bool}` (every shot, the flare every 2 s) | weapons | creatures (predators can come to look, or flee when `scare`) |
| `weapon:flare` | `{pos, radius, on}` (a flare starts or stops burning) | weapons | |
| `weapon:reload` / `weapon:switch` | `{weapon}` / `{weapon, drawn}` | weapons | |

Adding an event: name it `module:thing`, document it here (ask the lead), and keep payloads small.

---

## 6. Run object and summary (main.js)

```js
TU.run = {
  seed: uint32, difficulty: 'easy'|'standard'|'hard', modifiers: [],
  layout: <generator output or null>,           // section 7.1
  loadout: { ...copy of TU.save.data.loadout }, upgrades: { ...copy },
  touch: bool, tutorial: bool, startedAt: ms, t: s (game time in the dive),
  area: current area id, areasSeen: { id: true }, ended, won, reason,
  endless: bool (KEEP DIVING), leg: 1.., legStartT: s, bottomReached: bool
}
// endless depth also has: endSeg (0 = the first ring is the goal, k = segment k's ring), maxZone
// summary (run:end payload and state data):
{ seed, won, reason, timeS, maxDepthM, ropeM, airLeftBar, creaturesSeen, creaturesTotal,
  distM, waypoints, siltOuts, wallHits, loadout, difficulty, tutorial, endless, leg, bottomReached,
  maxZone (0..4, or 5+ in the Beyond), maxZoneName, segment, beyond, sealedAbove, endlessNote, endlessRun }
```
How the UI uses the endless fields: the results slate prints `endlessNote` (two or more rings deep) and "Deepest zone: <maxZoneName>" for endless legs; the camp pays depth by `maxZone` (`depthBonus(z)`: 50, 150, 350, 700, 1200 for zones 0..4, then `1200 + 600 x (z - 4)` for the Beyond); a KEEP DIVING leg starts at `TU.cave.zoneAt(diver).index`, so "Deeper than the bottom" pays past zone 4. Fin Tokens for new zones still use the 5 `zonesReached` slots (the Beyond counts as the Old Water).

---

## 7. Cave (TU.cave, owner A)

### 7.1 Layout from the generator
`TU.gen.generate(seed, { difficulty, archetype?, modifiers? })` returns (full spec: vault `Tech/Cave Generator Algorithm.md`):
```js
{ ok, version, seed, difficulty, archetype, modifiers, cellSizeM: 8, bottomLayer, checksum, checksumHex,
  pieces: [{ id, type, shape, x, y, d, w, l, h, rot, variant, zone, role: 'main'|'branch'|'loop', branch,
             flags, sockets: [[x,y,d,dir]], cost, mask?, landmarkId?, start?, bottom?, treasure?, dry?, collapse? }],
  edges: [[aId, bId, x, y, d, dir]], mainPath: [pieceId...], branches: [{id, kind, from, to, pieces, treasure, seconds, bypass?, split?}],
  loops: [branchId], estimatedSwimMinutes, ropeLengthM, stats }
```
`type` is one of `TU.gen.constants.TYPES`: `straight, bend, junction_t, junction_x, shaft_down, shaft_up, squeeze, chamber_small, chamber_large, air_pocket, dead_end, silt_floor, current, landmark`. main.js already generates a layout for every run (`TU.run.layout`, about 4 ms). The handmade cave ignores it. **Agent A's job:** build the world from it in `build(layout)` / `reset(run)` and keep every query below working.

The generator body in `generator.js` is frozen (the C++ port must stay bit-identical). Only the `TU.gen` footer may change, and any generator change must pass `node prototypes/cave-gen/test.js`.

### 7.2 Queries
`hint` is an optional plain `{}` owned by the caller, one per moving thing; the cave caches lookup state in it to make repeat queries fast. Pass the same object every time for that thing.

| Function | Returns |
|---|---|
| `nearestPoint(pos, hint?)` | **new object** (safe to keep): `{ point: Vector3 (nearest center line point), radius (m, center to wall toward pos), wallDist (m, + inside water), inside: bool, normal: Vector3 (from center toward pos), t (0..1 along main path), s (m along this path), pathId: 'main'\|'branch'\|..., pieceId (-1 if handmade), pieceType (generator type), area (area id or null), zone (0..4), dry: bool (pos is in air), siltiness 0..1, current: Vector3 m/s, temperature C, daylight 0..1, floorY, ceilY, surfaceY (water surface above here or null) }` |
| `collide(pos, radius, { vel?, hint? })` | **shared scratch object, copy it at once**: `{ pos: Vector3 (corrected), hit: bool, normal: Vector3 (points out of the rock, into the water), depth (m pushed), impact (m/s into the wall, 0 if no vel), vel: Vector3 (reflected and damped, only if vel given), blocked: null\|'exit' }`. Never modifies its inputs. |
| `contains(pos, margin?)` | bool, inside the water space at least `margin` m from rock |
| `raycast(origin, dir, maxDist, hint?)` | distance (m) to the first rock along unit `dir`, or `maxDist` |
| `isDry(pos)` | bool, pos is in air (above an air pocket surface, in a dry chamber) |
| `waterSurfaceY(pos)` | y of the free water surface in this air space, or `null` if water meets rock above |
| `zoneAt(pos)` | `{ index, name, topM, beyond }`: index 0..4 in the first cave, 5+ (the Beyond) in endless segments. The HUD zone name uses it |
| `segmentAt(pos)` | which cave segment a point is in: 0 = the first cave, k = the k-th KEEP DIVING segment, -1 in rock or in a freed segment. creatures.js tags every record with it |
| `zoneName(i)`, `zoneInfo(i)`, `zoneOfDepth(m, beyond?)`, `endless.*` | Beyond zone names and the endless segments (Appendix C) |
| `areaAt(pos, hint?)` | area definition or null |
| `randomSpot({ area?, zone?, surface?: 'water'\|'ceiling'\|'floor'\|'wall', frac?: [min,max] }, rand)` | `{ pos, normal (into the water), area, zone, pieceType, s, pathId }` or null. `frac` = fraction from center line to wall, water only. |
| `spot(name, { dy?, yaw?, pitch?, low? })` | `{ pos, yaw, pitch, s, pathId }` or null. Names: `entrance, mid, junction, pocket, pocketSurface, squeeze, silt, drop, deep, end, stalactites, branch, branchEnd`, or a number (m along main). Used by debug teleports and filming; keep these names working on generated caves (map them to the matching piece types). |
| `spawnPoint()` | `{ pos, yaw, pitch }` where a dive starts |
| `build(layout)` | builds or rebuilds the world into `TU.scene` |
| `mapData()` | `{ paths: [{id, kind, points, radius, length, collapsed}], segments, chambers, airPockets, dry, bottom, entrance, bounds, mainLength }` for the wrist hologram |
| `quake(intensity 0..2, { pos?, collapse? })` | falling rocks near pos, and from 1 up a side branch collapses. Returns `{ rocks, collapsed }` |
| `takeFind(id)`, `collapse(pieceId)`, `spotNames()`, `stats()`, `finishBuild()` | finds, debug collapse, spot list, build stats, build every chunk now |

`nearestPoint` also returns `branchId`; `pathId` is `'main'`, `'branch'` or `'loop'`. Generated area ids: `mouth, throat, galleries, sulfur, oldwater, junction, pocket, squeeze, silt, current, drop, room, drychamber, lm<pieceId>, chamber, branch, loop, branchEnd`. Extra spot names: `airpocket, current, drychamber, ledge, landmark, bottom, deadend, loop`. `features` also has `finds` (= `treasure`), `airHints: [{id, pos, target, to, dir, dist}]`, and `dryChambers[i]` has `waterY, pools, ledge`. Details: REQUESTS-A.md.

### 7.3 Data on TU.cave
```js
TU.cave.source   // 'handmade' | 'generated'
TU.cave.layout   // the layout it was built from, or null
TU.cave.areas    // { id: { id, title, subtitle, style: 'zone'|'msg'|'none', pieceType } }
TU.cave.features = {
  entrance:    { pos, dir (into the cave), stake (rope anchor), surfaceY },
  bottom:      { pos, radius (touch to win, m), kind: 'ancient', name },
  airPockets:  [{ id, pos (center at the surface), surfaceY, radius, hintPos, warm }],
  dryChambers: [{ id, pos, floorY, size: Vector3, warm }],
  squeezes:    [{ id, pos, s, length, minRadius }],
  currents:    [{ id, pos, from, to, speed (m/s), dir: Vector3, pulse?: {period, duration} }],
  siltAreas:   [{ id, pos, sFrom, sTo, siltiness }],
  landmarks:   [{ id, name, subtitle, pos, radius }],
  treasure:    [{ id, kind: 'fossil'|'treasure', name, tier 1..5, value ($), pos, taken: false }],
  stalactites: [{ pos (tip), len, s }]
}
```
Area ids for the handmade cave: `mouth, throat, junction, passage, pocket, squeeze, silt, drop, chamber, branch, branchEnd`. Creatures spawn by area (`chamber`, `drop`, `branchEnd`), so a generated cave should provide equivalent area ids or creatures.js must switch to zones.

Formations: stalactites hang from the ceiling with the wide base in the rock and the tip pointing **down**; stalagmites stand on the floor tip **up** (shared cone geometry has base at local y = 0, tip at y = +1; stalactites use rotation.x = PI). The test checks every instance.

---

## 8. Player (TU.player, owner C)

### 8.1 State (read-only for everyone else)
Extra fields (all created in the core.js stub; meaning in Appendix A): `held` (null or `{id, kind, strength}` while a predator holds you), `health` 0..100, `bleed`, `bleedOut` (s spent bleeding at the lowest health), `bloodMask`, `maskWater` and `maskFlood` (the same 0..1 level), `maskSlosh`, `maskClearing`, `grab`, `caught`, `currentSpeed`, `tug`, `stuck`, `dry`, `rag`, `daze`, `lanternOut`, `lanternLevel`, `headlamp`, `wristRaised`, `carried`, `kickMul`, `maimed`, `warm`, `quake`, `shock`, `drownSeconds`, `measure`, `anim`.
```js
TU.player.state = {
  pos, vel: Vector3, yaw, pitch, roll, tYaw, tPitch, fwd, right, up: Vector3 (view basis),
  air,            // bar in the active tank
  airMax,         // capacity of the active tank
  airTotal, airTotalMax, // all tanks
  tanks: [{ bar, max, dropped: bool, pos: Vector3|null }], activeTank: index, airRate (bar/s, negative when refilling),
  stamina, staminaMax, panic, injuries: [{ type: 'cut'|'sprain'|'break'|'maim', severity 0..1, taped: bool, at: s }],
  vestAir,        // 0..1, cfg.vest.neutral = neither rise nor sink
  battery, flashOn,
  depth, maxDepth, speed, dist, inWater, surfaced, surfaceY (or null),
  mode: 'swim'|'crawl'|'squeeze'|'walk'|'ragdoll',  // swim and squeeze exist today
  maskFlooded: bool, cold 0..1, sprint, slow, narcosis 0..1, silt 0..1 (visibility, from fx), drown (s without air),
  breathPhase (0..1 through a breath), breathStage (0 idle, 1 inhale, 2 exhale), kickPhase (-1 or 0..1),
  wpCount, siltOuts, wallHits, shake, hitFlash,
  env,            // the latest TU.cave.nearestPoint result at pos
  zone, area
}
TU.player.lamp = { pos, dir (unit), on (0..1 effective intensity), color: THREE.Color, cosOuter, cosInner, range }
TU.player.input = { keys: { [KeyboardEvent.code]: bool }, touch: {...} }
TU.player.inventory = { tape, flexTape, lantern: null | { slots, creatures: [speciesId] }, measuringTape, camera, glowSticks, items: [] }
```
### 8.2 Functions
**Changing the diver from another module** (weapons, glow sticks, predators): always through these, never by writing `TU.player.state`. The core.js stubs do nothing, so a missing player.js is harmless.

| Function | What it does |
|---|---|
| `calm(amount)` | removes `amount` panic points (glow sticks: about 0.8 per second near a lit stick, 4 per second with your own light off) |
| `addPanic(n)` | adds `n` panic points (the jet, the bang stick) |
| `applyRecoil(vec)` | adds `vec` (m/s) to the diver's velocity (gun recoil, a pinned fish towing you, the shark's bump, The Maw's shove) |
| `addShake(n)` | camera shake at least `n` (the bang stick) |
| `useBattery(frac)` | spends `frac` (0..1) of a full flashlight battery; returns false and spends nothing if there is not enough (the shock baton: 0.06 per zap) |
| `setHeld(byId, pullVec, { kind, strength, label, shake })` | called every step by creatures-predators.js while a predator holds you. Your kicks are x`cfg.held.kick` (0.25), the pull follows `pullVec` (m/s), a rock grab is not possible (and is dropped), `kind: 'shake'` adds the death roll. Alternating A / D taps call `TU.creatures.struggle(cfg.held.struggle)` (0.08 grip per tap, 1.5 stamina per tap). The ONE struggle bar is `#pl-tug` (red while held, title from `label`, width = grip left from `grabbedBy().strength`); the current tug of war uses the same bar. A hold that is not refreshed for `cfg.held.timeout` (0.25 s) ends by itself. Returns false (tutorial, dry land, at the surface) and then the predator lets go |
| `release(byId?)` / `releaseHeld(byId?)`, `isHeld()` | end the hold (the predator calls it on release), and `{id, kind, strength}` or null |

`ropeLength()` m, `ropePoints()` array of Vector3 (stake first), `waypoints()` `[{index, name, pos, depth}]`, `dropWaypoint(name?)`, `renameWaypoint(index, name)` (rebuilds the in-cave label), `toggleFlash()`, `toggleLantern(force?)`, `teleport(pos, yaw?, pitch?)`, `look(yaw, pitch)`, `enableTouch()`, `isTouch()`, `setAir(bar, allTanks?)`, `cameraForward()`, `setWristRaised(b)`, `dropTank()`, `pickUpTank(quiet?)`, `applyTape('duct'|'flex')`, `addInjury(type, severity, source)`, `rescue()` (tutorial: air, health and breath back), `tugAssist(amount)`, `bindings` (the controls list), `debug` (see CONTRACT-C-NOTES.md).

How the loadout and upgrades change the dive (player.js `reset`): tank option -> number of tanks and weight (swim speed, stamina); `upgrades.tank` -> bar per tank; `stamina` -> max and regen; `swim` -> kick multiplier; `battery` -> minutes of light; `mask` level unlocks `loadout.mask` (`cfg.masks`: tight floods 50% less and narrows the view 4 degrees, wide adds 10 degrees and floods 25% more, headlamp is a hands-free mask light); `lantern` level 1+ is needed for the lantern and sets its slots; `loadout.flippers` (`cfg.flippers` preset plus shape and width tokens) multiply speed and stamina. Tape counts come from the loadout and go down when used (the camp removes used consumables from stock).

### 8.3 Inputs (keyboard and mouse): the final list
No key does two different things in the same state. The in-game Controls screen is built from `TU.player.bindings` (same list).

| Key | State | Action | Owner |
|---|---|---|---|
| Mouse | dive | look (click the view to lock the mouse) | player |
| W A S D (arrows too) | dive | kick and glide; walk on dry land | player |
| Space / C or Ctrl | dive | swim up / down (jump / crouch on land) | player |
| Shift | dive | sprint kick | player |
| B / V (hold) | dive | breathe into the vest (rise) / breathe it back (sink, some air back) | player |
| R (hold) | dive | slow breathing | player |
| Z (hold) | dive | tuck into a squeeze; tap A / D to wiggle when stuck | player |
| A / D alternating | dive, held by a predator | struggle free (`TU.creatures.struggle`); the same taps run the current tug of war while holding E | player |
| E (tap) | dive | use: pick up a dropped tank, a fossil or treasure, or catch a glowing creature | player |
| E (hold near rock) | dive | grab the rock (only when the tap did nothing); with A / D alternating: current tug of war | player |
| T (hold) | dive | measure a creature (`TU.creatures.measureStep`) | player |
| F / L / M (hold) | dive | flashlight / lantern / blow the mask clear | player |
| 1 or X / 2 | dive | duct tape / Flex Tape the worst open cut | player |
| 3 | dive | crack and throw a glow stick (not while typing a waypoint name) | glowsticks |
| G | dive | drop the spare tank, or pick a dropped one back up | player |
| Q | dive | drop a waypoint (a name box opens; typed keys never reach the diver) | player, ui |
| Tab (hold or tap) | dive | wrist computer and hologram; while up: `[` `]` pick a waypoint, N rename, arrows / drag spin, wheel zoom (captured, so they do not move the diver) | ui |
| J | dive | waterproof slate (logbook) | ui |
| H | dive | hide the HUD | player -> ui |
| Esc | dive | pause (in a text box it only closes the box) | player |
| Left click | dive, mouse locked, weapon drawn | fire or attack; speargun with a spear out: hold to reel the line in | weapons |
| Right mouse (hold) | dive, mouse locked | aim (camera zoom `cfg.weapons.aimZoom`, steadier hand, iron sights on pistol grips) | weapons |
| Y | dive | reload (speargun: reel the spear in first, then push it into the barrel) | weapons |
| 4 | dive | draw or put away the weapon | weapons |
| 5 or mouse wheel | dive (wheel not while the wrist is up) | swap between the primary weapon and the knife | weapons |
| 1 to 8 | camp (`'loadout'`) only | camp stations | ui |
| Enter / K | menus / finished tutorial | main action / keep exploring | ui |

---

## 9. Config (TU.cfg)

Sections: `loop, world, swim (8 slider keys listed in tuneUI), tuneUI, air (incl. depthMax), vest, stamina, light, panic (plus agent C's highFrom, staminaLoss, cut, cutScale, shock, bite, quake, fall, darkRadius), breath, silt, narcosis, loadouts, upgrades, rope, waypoints, fx, gfx (low / medium / high presets and the auto scaler), cave (margin, cullDist, daylightRange), creatures (agent B's tunables), crawl, squeeze, walk, fall, grab, current, injury (bleedOut), rocks (crush thresholds), mask, masks (mask types), flippers, depth, cold, tank, lantern, held (being grabbed: kick, follow, struggle, stamina, timeout), weapons, lights (budget 14, glowSticks 3, weapon 1), debug (enabled, freeLantern)`.

**Depth and air (balance):** air use is `1 + depth / air.depthPer` (100 m) times the base rate, capped at `air.depthMax = 2.5` (reached at 150 m). Without the cap a tank would last a sixth as long at 450 m (the second Beyond zone) as at the surface; with it, the deep endless segments use 2.5x surface air, the same as the bottom of the Sulfur Deep. Stamina and breath hold still get worse with depth up to 200 m (`cfg.depth`). Each value has its unit in a comment in core.js. Sliders write `cfg.swim[...]` and persist to `TU.save.data.settings.tune`.

Loadouts (`cfg.loadouts`): `light` (1 tank, swimMul 1.08, staminaMul 1.15), `standard` (2 tanks, 1.0, 1.0), `heavy` (3 tanks, 0.88, 0.8). Upgrade tables (`cfg.upgrades`, index 0 = level 1): `tank.airMinutes, stamina.max/regen, swim.mul, battery.minutes, mask, rope, lantern.slots (index = level, 0 = not bought)`, each with `cost`.

---

## 10. Save data (TU.save.data)

```js
{
  version: 1,
  progress: { runs, bottoms, deepestM, zonesReached: [bool x5], tutorialDone, timeInCaveS },
  money: { cash, fins },
  upgrades: { tank: 1..5, stamina: 1..5, swim: 1..5, battery: 1..5, mask: 1..5, rope: 1..5, lantern: 0..5 },
  loadout: { tank: 'light'|'standard'|'heavy', tape, flexTape, lantern: bool, measuringTape: bool, camera: bool, glowSticks },
  logbook: { entries: { [speciesId]: { speciesId, count, firstRun, minSizeM, maxSizeM, photos, lastDepthM } } },
  leaderboards: { deepest, fastest, airLeft, explored, longest: [{ value, date, seed, won }] (top 10 each) },
  loadout (also): { mask: 'standard'|'tight'|'wide'|'headlamp', flippers: { preset, shape 0..1, width 0..1 } },
  settings: { muted, fastDrain, tips, tune: { [swimKey]: number }, hudHidden, graphics: 'low'|'medium'|'high', autoQuality: bool },
  weapons: { owned: { knife: true, polespear: true, ... }, selected: 'polespear'|'speargun'|'jet'|'bangstick'|'flare'|'baton', ammo: { spears, bang, flares } },
  ui: { ... }   // agent D's section: story, settings.volume, settings.reduceMotion, hud layout, locker, stock, haul, trophies, contracts, camp
}
```
`TU.progress.recordRun(summary, { continued, prevTimeS }?)`: a KEEP DIVING leg does not count as a new dive (no runs++, no second bottom or fastest entry; only the extra time is added).

`TU.logbook.add({ speciesId, sizeM?, zone?, depthM?, photo? })` returns `{ speciesId, sizeM, first, record, entry }` and emits `creature:logged`. Only main.js calls `TU.progress.recordRun`. Add new save fields by asking the lead (defaults live in core.js `saveDefaults`).

---

## 11. Creatures (TU.creatures, owner B)

Species entry (in `TU.creatures.species`, keyed by id):
```js
{ id, name, type, zones: [0..4], behavior: 'harmless'|'skittish'|'territorial'|'dangerous', glows: bool,
  brightness: 0..5 (lantern light), rarity: 'common'|'uncommon'|'rare'|'very_rare'|'legendary',
  sizeM: [min, max], colors: [hex], shape, note }
```
Creature record (from `list()`, `get(id)`):
```js
{ id, speciesId, pos: Vector3, vel, home, sizeM, zone, area, seen, caught, measured, flee (s left), hint }
```
| Function | Returns |
|---|---|
| `spawnForZone(zone, count, rand, { area?, species?: id or [ids], frac?, pick?(rand) })` | new records (uses `TU.cave.randomSpot`) |
| `clear()` | removes all |
| `nearestInView(maxDist = 6, minDot = 0.9)` | `{ id, speciesId, pos, dist, dot, creature }` or null |
| `nearCount(pos, radius)` | number of live creatures within radius |
| `catch(id)` | `{ ok, reason?: 'gone'\|'not_glowing'\|'fleeing', speciesId, brightness }`, emits `creature:caught` |
| `measure(id)` | `{ id, speciesId, sizeM, first, record }` (logs via `TU.logbook.add`) |
| `seenCount()`, `total()` | numbers for the results screen |

Extra functions, the variant ids and the events are in CONTRACT-B-NOTES.md (`lanternLight, lanternRelease, measureStep, photo, earnings, speciesName, activeCount, finds, findNearest, pickup`, debug showcase helpers). `nearCount(pos, r, { glowing: true })` counts only creatures giving light (the darkness panic uses it). Catching needs a bought lantern (`cfg.debug.freeLantern` gives a 2-slot jar for testing). Glowworms (`place: 'ceilingDry'`) sit on dry ceilings: dry chamber ceilings first, then air pocket domes, preferring the right depth zone. At most `cfg.creatures.maxActive` are simulated and only `cfg.creatures.lights` real point lights are used.

Creatures draw with `TU.fx.particleMaterial` / `TU.fx.makePoints` for glow, and use `TU.cave.collide(pos, r, { hint })` to stay off the rock. They read `TU.player.state` (pos, speed) and `TU.camera`.


### 11b. Predators and combat: the balance pass (lead, Oct 19)

Full predator and damage details are in Appendix B. Decisions from the integration balance pass:

- **One damage scale.** Weapons (`cfg.weapons`) were tuned for "a medium predator has about 100 hp"; the predators were first written with "one basic hit is about 10". The predators' hit points were doubled to meet the weapons: Cenote Bull Shark 110, Pale Cave Barracuda 20, Gulper Ambush Eel 70, Cave Lurker 140, Spider Squid 44, The Maw 520 (each +-10% with body size). Small fauna and the old hazards (Volt Eel 30, Lanternjaw 25) are unchanged. What that means with the gear: the free pole spear (32, head x1.4) kills a shark in 3 to 4 thrusts, a barracuda in 1, a squid in 1 or 2; the knife (16) needs 5 to 7 cuts on a shark; a speargun spear (58) takes a shark in 2; one bang stick round (420) kills anything but The Maw (2 rounds), and you only carry 3. The Maw has armor and backs off every quarter of its health, so it is a fight you pick, not one you must win.
- **Weapons stay limited**: speargun 4 spears, bang stick 3 rounds, flares 4 per dive (`pack[2]`), the jet costs 7 bar per blast, the baton 6% battery per zap, every shot is a `weapon:noise` that draws the shark, the barracuda, the Lurker and The Maw.
- **Fair strikes** (unchanged from the predators agent): every strike follows a tell of at least 0.6 s, two strikes are at least 1.2 s apart, one grab at a time, no attacks in the tutorial, in dry chambers or at the surface, no spawns within 15 m of the entrance or 18 m of the dive start. The shark always bumps once before it can bite.
- **Rookie grace (the bull shark near the entrance).** No predators at all in the tutorial. Until the save has one finished dive (`progress.runs === 0`), easy and standard dives spawn no predators in the Mouth and the Throat (zones 0 and 1, the shark and the shallow barracuda packs), and the director does not add any there; deeper zones are stocked as usual. Hard dives have no grace. On easy the shark is also rarer after that: its spawn count uses `sharkDiff.easy = 0.35` (0.9 x 0.35, about one dive in three) instead of 0.5. Tunables: `TU.creatures.predatorTuning` (`rookie`, `sharkDiff`, `beyond`).
- **Endless depth.** On `cave:segment` `open`, creatures.js stocks the new segment's Beyond zones (5+) with the deepest species set (every species that lives in the Old Water, zone 4), places a giant around the new ring, and calls `L.segmentHooks`; creatures-predators.js then adds per Beyond zone a barracuda or squid pack, a Lurker and a Gulper (x difficulty) and, in the segment's first zone, The Maw with a 35% chance (x difficulty) if none is alive, all away from the ring chamber. The director uses `TU.cave.zoneAt` so it keeps spawning in the Beyond (its `want` table clamps the zone to 4). On `freed`, every creature whose `seg` is that segment is removed (lantern jar creatures stay). Each record has `seg` (from `TU.cave.segmentAt` when it is added). `TU.creatures.segmentStats()` gives the last `{ spawned, removed }`.

---

## 12. FX and audio (owner C)

`TU.fx`: `spawnSilt(n, { pos, back?, vel?, burst?, floorY? })`, `spawnBubbles(n, { pos, right? })`, `siltDensity()` 0..1, `shake(amount)`, `particleMaterial({ map, color, base, additive, opacity, glow })`, `makePoints(count, material)` (attributes position, aSize, aAlpha, aCol), `clear()`, `render()`, `screenshotMode(on)`.

`TU.fx` also: `spawnBlood`, `spawnDebris`, `handScene`, `handCamera`, `lensActive()`, `hintCount()`, `hintInfo()`, and graphics quality: `gfx` (the active preset: `name, pixelRatio, msaa, shadows, shadowMap, particles, cullDist, lowRock, autoScale, auto`), `setQuality('low'|'medium'|'high')`, `setAutoQuality(bool)`, `quality()` (a summary). The auto scaler lowers the render scale (down to `cfg.gfx.scaleMin`) when the average frame takes longer than `autoSlowMs`, and raises it again when there is room.

Performance budget (60 fps at 1080p on Apple Silicon): dynamic lights in the cave scene are fixed in number and all made at boot, so shaders never recompile mid-dive. The whole cave scene has at most `cfg.lights.budget` = **14** lights (counting the ambient light): ambient (1), the flashlight spot (1, the only shadow caster; off on Low), its bounce light (1), the lantern (1), `cfg.waypoints.lights` waypoint lights (2), `cfg.creatures.lights` creature lights (2, pooled for the brightest glowers; the predators use the same pool), the weapons light (1, a burning flare owns it, shots, booms and zaps borrow it for a flash), the glow stick pool (`cfg.lights.glowSticks` = 3, the 3 newest lit sticks; older sticks glow without a light), the entrance daylight (1) and the cave core light (1, shared by every endless ring: it follows the nearest ring, so endless segments add no lights). `tests/test_flow.py` checks the total after firing a flare and throwing a glow stick, and again in an endless segment. The hands have their own small scene. The lens pass renders into one target at the preset resolution (MSAA 4 only on High); the screen buffer has no MSAA. Chunks past `gfx.cullDist` are hidden. Hot loops reuse scratch vectors (no allocations per creature or per particle).

`TU.audio`: `unlock()` (call inside a click), `setMuted(bool)`, `setVolume(0..1)`, `play(name, params)` (names in `sounds()`), `suspend()`, `resume()`, `ready`, `muted`, `volume`, and **`ctx` / `out`**: the one AudioContext and a GainNode input that goes through narcosis, the master volume and mute (null until the first click). creatures-predators.js (the tells: shark thrum, barracuda teeth chatter, eel glorp, Lurker hiss, squid clicks, The Maw's 2.4 s rumble, with stereo panning), weapons.js (its muffled gun sounds with a short echo) and glowsticks.js (the crack) synthesize their sounds into `TU.audio.out`. **Nobody opens a second AudioContext** (two contexts hung the headless test browser); with no context yet there is simply no sound.

---

## 13. DOM ownership and CSS

| Owner | Ids | Classes | z-index |
|---|---|---|---|
| fx | `#fx-canvas`, `#fx-mask, #fx-scan, #fx-narc, #fx-panic, #fx-silt, #fx-black, #fx-hit` | `.fx-` | canvas 0, overlays 1 |
| ui | `#ui-*` (`#ui-hud, #ui-title, #ui-camp, #ui-pause, #ui-results, #ui-dead, #ui-hint, #ui-story, #ui-settings, #ui-wrist, #ui-slate, #ui-tut, #ui-wpname`, readouts) | `.ui-` | HUD 2, screens 5, hint 6, overlays 7 |
| player | `#pl-touch` and children `#pl-*` | `.pl-` | 3 |
| creatures | `#cr-*` if ever needed | `.cr-` | |
| cave | `#cv-*` if ever needed | `.cv-` | |
| lead | `#boot-err` (full screen, or a small bar when a non-essential module failed) | | 20 |

UI API (agent D): `TU.ui.openCamp(station)`, `openSettings(tab)`, `openStory()`, `setWrist(bool)`, `wristRaised()`, `coversScreen()`. `TU.uiKit` is agent D's internal toolbox shared between `js/ui*.js` (not for other modules).

Shared CSS variables (index.html `:root`): `--bg, --hud, --hud-dim, --hud-faint, --warn, --bad, --ink, --ink-dim, --card, --line, --mono, --display, --sans, --gx, --gr, --gt, --gb` (safe-area gutters, at least 16 px). Use them; do not redefine them. Layout must work at 390 px wide with no horizontal scroll.

---

## 13b. Weapons (TU.weapons, weapons.js)

One primary weapon (picked on the Loadout station, bought at the Gear Tent) plus the dive knife, always carried. Primaries: `polespear` (free starter), `speargun`, `jet`, `bangstick`, `flare`, `baton`. Tunables: `TU.cfg.weapons` (damage is in creature hit points; a medium predator should have about 100 hp, so the knife needs about 6 hits, the pole spear 3, a speargun spear 2, the bang stick 1). Save: `TU.save.data.weapons = { owned: {id: true}, selected: id, ammo: { spears, bang, flares } }` (stock; at most `pack[2]` go into a dive; used shells, flares and lost spears come out of the stock on `run:end`, not in the practice hole).

| API | What it does |
|---|---|
| `defs`, `primaries`, `list()` (cards: damage, range, reload, ammo, special, cost, owned), `stats(id)`, `owned(id)`, `selected()`, `stock()`, `ammoOf(id)`, `ammoName(key)` | data for the camp |
| `select(id)`, `buy(id)` -> `{ok, reason}`, `buyAmmo(id)` | camp actions (buy takes `money.cash` and writes the save) |
| `current()`, `drawn()`, `hudInfo()` -> `{id, name, short, drawn, raised, aim, hit, ammo (text), low, charge 0..1 or null, label, state}` | the HUD |
| `pose()` -> null or `{w, p, f, u, curl, thumb, steady, left}` (camera space) | player-hands.js moves the right hand there (and the left one while loading) |
| `fire()`, `reload()`, `holster(on?)`, `draw()`, `swap()`, `equip(id)` | actions (input calls them; tests too) |
| `debug.give(id)`, `debug.spawnTarget(dist, {hp, dx, dy})`, `debug.targets()`, `debug.shots()`, `debug.state()`, `debug.setAim(b)`, `debug.setFireHeld(b)`, `debug.settle()` | tests and filming |

- **Creature damage** (called with `typeof` checks; everything degrades to "no effect" when missing): `TU.creatures.raycastHit(origin, dir, maxDist)` -> null or `{id, species, point, dist}`; `damage(id, amount, {dir, point, weapon, kind: 'pierce'|'blunt'|'push'|'shock'|'cut'})` -> `{hp, maxHp, killed}`; `impulse(id, vec)` (adds m/s); `stunArea(pos, radius, seconds)`; `inRadius(pos, radius, {hostile})` -> `[{id, species, pos, dist}]`; `get(id).pos` (a pinned spear follows it). Creatures emit `creature:hurt` and `creature:killed`.
- **The diver** is changed only through the player API (section 8.2): `applyRecoil` (recoil of the jet, the speargun and the bang stick; a big pinned fish tows you), `addPanic` (+ `jet.panic` per jet blast, + `bangstick.panic` per boom), `useBattery(baton.battery / 100)` per zap, `addShake`. Tank air goes through `TU.player.setAir(P.air - jet.air)`. It reads `P.anim` to lower the weapon while the right hand is busy (grab, tape, lantern, measure, mask, climb) and in crawl, squeeze and ragdoll.
- **Hands**: models live in `TU.fx.handScene` (camera space) and sit in the fist using `TU.player.rig.rHandPos / rHandQuat` (player-hands.js writes them every frame, plus `lHandPos / lHandQuat`). While a weapon is drawn the right hand follows only 15% of the swim stroke; the left hand keeps the torch. One small point light in the hands scene (the torch lighting the weapon).
- **World**: spears, flares, the line, sparks and the jet cone are in `TU.scene`. One point light is added once at boot (no shader recompiles mid-dive): a burning flare owns it, and shots, booms and zaps borrow it for a flash. Rock hits use `TU.cave.raycast` and `TU.cave.collide`; the bang stick against rock may call `TU.cave.quake(0.35, {pos})`.
- **Camera**: aiming sets `TU.camera.zoom` (player.js only sets `fov`); it goes back to 1 outside a dive.
- **Sounds** are synthesized in weapons.js with its own small WebAudio graph (muffled, short echo) inside `TU.audio.ctx`, connected to `TU.audio.out` (master volume and mute apply there). If audio.js ever adds `weapon_<name>` recipes (`thunk, swish, thrust, hiss, boom, pop, zap, clank, splat, click, ratchet, reel, snap`), those are used instead.
- DOM: the HUD readout `weapon` (`#ui-wpn`, a normal HUD layout entry, default bottom right) and the crosshair `#ui-xh` live in ui-hud.js; the weapon cards (`.ui-wcard`) and the Gear Tent rows (`data-wbuy`, `data-wammo`) in ui-camp.js.

## 14. Debug hooks (window.__debug, main.js)

`getStats()` / `state()` (also `health, endless, tutorial, disabled`), `setState(s)`, `start(opts)`, `win()`, `disabled()`, `teleport(nameOrMeters, {dy, yaw, pitch, low})`, `look(yaw, pitch)`, `lookAt(pos)`, `lookAtCore()`, `set(key, value)` (player state; `'air'` sets the active tank), `setAir(bar, allTanks = true)`, `get(key)` (`'t'` = run time), `silt(n)`, `step(n)` (n fixed steps), `sim(seconds, ['KeyW', ...])` (hold keys and step), `render()`, `screenshotMode(on)`, `gen(seed, opts)`, `TU`.

## 15. Testing

Run one browser at a time (memory is tight, about 2 GB), in this order: `python3 tests/test_cave.py quick`, `tests/test_creatures.py`, `tests/test_predators.py api attack` (or all sections: `show attack death api`), `tests/test_weapons.py creatures` (screenshots `tests/screens/W_*.png`), `tests/test_endless.py`, `tests/test_player.py`, `tests/test_ui.py`, `tests/run_test.py`, `tests/test_flow.py` (the whole game: title, camp, a purchase, loadout, an easy dive, a speargun kill of a predator, a glow stick, the light budget, the bottom, results, keep diving into a new segment, back to camp, and a death, with zero console errors and page errors).

`python3 tests/run_test.py` must pass (exit 0, zero console errors) before any hand-off. It runs static artifact checks, a full scripted dive with screenshots in `tests/screens/`, the stalactite orientation check, and a boot with `creatures.js` and `audio.js` removed (`/?drop=creatures,audio`) to prove the stubs hold. If you add a feature, add a step and a screenshot to the test.

---

## 16. Requests status (all REQUESTS-*.md, Oct 19 integration)

| From | Request | Resolution |
|---|---|---|
| A 1 to 9 | cave events, API, features, area ids, spot names, cfg keys, boot errors | done earlier (sections 5, 7, 9, 2) |
| B lead 1 to 3 | `cfg.creatures`, events, test docs | done (sections 9, 5, 15) |
| C lead 1 to 6 | cfg keys, state fields, events, bleeding out, keys, mask loadout | done (`cfg` sections, 8.1, 5, `'bled'`, 8.3) |
| D lead 1 to 6 | save defaults, keep diving, death reasons, tutorial flag, UI API, `coversScreen` | done (sections 10, 4, 13) |
| PRED core 1 | creature combat stubs in core.js | done (`raycastHit, damage, impulse, stunArea, inRadius, inkAt, grabbedBy, struggle, releaseGrab`) |
| PRED core 2 | `cfg.creatures.predators` | kept in `TU.creatures.predatorTuning` (one place, documented in 11b) |
| PRED core 3 | events and attack kinds in the contract | done (section 5) |
| PRED weapons 1 to 3 | `weapon:noise`, hits on a grabber count double, `stunArea` | done by the weapons and predators code |
| PRED player 1 and 2 | being held, the struggle | `TU.player.setHeld / release`, one struggle bar `#pl-tug` (section 8.2); creatures-predators.js only falls back to its own pull and `#cr-grab` bar when the player API is missing |
| PRED ui 3 to 5 | attack messages, tells, logbook danger | ui.js messages for `slash, grab, ink, bump` and `creature:tell`; logbook cards show DANGER skulls (0..5), specimens and the bounty (rarity price x (1 + 0.5 x danger), also used for the dive pay) |
| PRED audio 1 and 2 | `TU.audio.ctx` / `out` | done (section 12); the tells now play their own synthesized sounds |
| ENDLESS 1 to 3 | predators and creatures in new segments, freed segments | done (11b) |
| ENDLESS 4 to 7 | depth pay by `maxZone`, `startZone`, Fin Tokens, HUD zone name, contract merge | done (sections 6, 7.2, this document) |
| ENDLESS 8 | glow stick lights and the test limit | the pool is made at boot (no recompile on the first throw); budget 14 (section 12) |
| ENDLESS 9 | throw animation | not done (optional): `glowstick:throw` is there for player-hands.js |
| ENDLESS 10 | panic near glow sticks | player.js counts a lit stick within 6 m as light; glowsticks.js calls `TU.player.calm` |
| ENDLESS 11 | depth air factor | capped at `cfg.air.depthMax = 2.5` (section 9) |
| ENDLESS 12 | `P.zone` in the Beyond | `P.zone` stays 0..4 (other code indexes the five zone names with it); use `TU.cave.zoneAt(P.pos).index` for 5+ |
| ENDLESS 13 | results slate | prints `endlessNote` and the deepest zone (section 6) |
| ENDLESS 14 | hologram | rebuilt on `cave:segment` open / freed (now if the wrist is up, else on the next raise, keeping your zoom), gold markers for every Ancient Ring, Beyond zone depth rings with their names, live glow stick markers in their color |

---

## Appendix A: Player, hands, fx and audio details (merged from CONTRACT-C-NOTES.md)

What agent C added on top of CONTRACT.md. Files: `js/player.js`, `js/player-hands.js` (new, loaded right after player.js), `js/fx.js`, `js/audio.js`, `tests/test_player.py`.

### Keybindings

`TU.player.bindings` is an array of section names (strings) and `{ action, keys: [KeyboardEvent.code], label, type: 'hold'|'press'|'alternate' }`. Agent D's controls screen reads it.

| Key | What it does |
|---|---|
| W A S D | Kick and glide. On dry land: walk |
| Space | Swim up. On dry land: jump |
| C or Ctrl | Swim down. On dry land: crouch |
| Shift | Sprint kick (2x air, kicks up silt) |
| B (hold) | Breathe into the vest: rise (left hand raises the inflator to your mouth) |
| V (hold) | Breathe vest air back: sink, get some air back |
| R (hold) | Slow breathing: calms panic, saves air |
| Z (hold) | Tuck into a squeeze. In a squeeze, tap A / D to wiggle when stuck |
| E (hold near rock) | Grab the rock: currents cannot push you |
| A / D alternating, while holding E | Strong current tug of war: pull yourself free |
| E (tap) | Catch a glowing creature in your light (agent B's `catch`), or pick up a dropped tank |
| T (hold) | Measure a creature (calls agent B's `TU.creatures.measureStep(dt, held)` every step) |
| F | Flashlight on / off |
| L | Hold the creature lantern out (comes out by itself when the flashlight dies) |
| M (hold) | Tilt your head back and blow a flooded mask clear (costs air) |
| 1 or X | Duct tape the worst open cut (may peel off later) |
| 2 | Flex Tape the worst open cut (never peels) |
| G | Drop your spare tank (lighter: more stamina, faster). Near a dropped tank: pick it up |
| Q | Drop a waypoint |
| H | Hide or show the HUD |
| Esc | Pause |
| Tab | Agent D's wrist view. It calls `TU.player.setWristRaised(bool)` and the left arm comes up |

Note on T and G: the brief said T drops a tank and G picks it up, but CONTRACT.md, agent D's controls list and agent B's logbook text all use T for the measuring tape and G for tanks, and agent B's `measureStep` expects T. So: **T measures, G drops or picks up**, and E also picks up.

### Movement modes (`P.mode`)

Picked automatically from the cave (`TU.cave.nearestPoint`):
- `swim`: open water, the tuned kick and glide.
- `crawl`: underwater when the passage is tight (`env.radius < 1.3 m`) and you are near the floor: hands pull you along, slower rhythm, little silt. On dry land: a crouch under a low ceiling (or C held).
- `squeeze`: `env.pieceType === 'squeeze'`, or `env.radius < 0.82 m`, or Z held where `radius < 1.4 m`. Very slow, both hands pushing, you get stuck (`P.stuck` 0..1) and wiggle free with A / D.
- `walk`: dry land (`env.dry` and either no water surface here, the floor is above the water, or you are well above it). Gravity, walking, jumping, footsteps. Swim forward at a ledge while surfaced to climb out (`player:climb`). Walking into deep water drops you back in (`player:splash`).
- `ragdoll`: falling fast on dry land (`vel.y < -7.5 m/s`) or landing from more than 2.2 m. Camera tumbles, hits, slumps, gets up after about 3 s. Damage scales with height: 4.5 m sprain, 7.5 m break, 11 m maim (one side weaker for the run). Landing in water is safe up to 14 m.

### New state on `TU.player.state` (read only)

| Field | Meaning |
|---|---|
| `health` | 0..100 (bleeding drains it, never below 5: bleeding alone does not kill) |
| `bleed` | sum of untaped cut severities (bleed rate) |
| `bloodMask` | 0..1 blood smeared on the mask glass (fx) |
| `maskWater` | 0..1 water level inside the mask; `maskFlooded` is `maskWater > 0.1` |
| `maskSlosh` | rad, tilt of the waterline (fx) |
| `maskClearing` | bool, M held with water in the mask |
| `grab` | bool, holding the rock |
| `caught` | bool, in a strong current (> 1.45 m/s) |
| `currentSpeed` | m/s of the water flow where you are |
| `tug` | null, or 0..1 tug of war bar |
| `stuck` | 0..1 stuck in a squeeze |
| `dry` | bool, dry land physics |
| `rag` | 0..1 ragdoll amount (fx) |
| `daze` | s of blurred vision left (venom) |
| `lanternOut`, `lanternLevel` | the lantern is held out, its brightness (agent B's `lanternLight().brightness`) |
| `headlamp` | bool, mask headlamp instead of the hand torch (loadout `headlamp`, `maskLamp` or `mask.lamp === 'headlamp'`) |
| `wristRaised` | bool |
| `carried` | tanks you carry (dropped ones do not count, and do not count in `airTotal`) |
| `kickMul` | injury factor on kicks and walking speed |
| `maimed` | null, `'left'` or `'right'` |
| `warm` | bool, in a warm pocket (stamina comes back) |
| `quake`, `shock` | 0..2 and 0..1.5, fading effect strengths |
| `drownSeconds` | how long you can go without air here (shorter when deep) |
| `measure` | last `measureStep` result while T is held, or null |
| `anim` | animation hints for the hands (see player-hands.js) |
| `injuries` | now filled: `{ type: 'cut'|'sprain'|'break'|'maim', severity, taped, tape: 'duct'|'flex'|null, side, at, source }` |

`TU.player.lamp` also has `hitDist` (m to the rock the beam hits) and `headlamp`. `TU.player.rig` (written by player-hands.js) has the torch and lantern positions in camera space.

Depth: stamina max drops up to 35% from 20 m to 200 m, air use grows with depth (capped at 2.5x, `cfg.air.depthMax`), you can hold your breath 40% less long at 200 m. Cold (`env.temperature` below 20 C) drains stamina and shakes your hands and light; warm areas (21 C or more, or near an air pocket / dry chamber marked `warm`) give stamina back. Panic above 60 drains stamina.

### Events emitted (new)

| Event | Payload |
|---|---|
| `player:cut` (now real) | `{ severity, pos, injury }` |
| `player:injury` | `{ type, severity, side, source }` |
| `player:tapeStart` / `player:tape` / `player:tapePeel` | `{ kind }` / `{ kind, injury, left }` / `{ injury }` |
| `player:fall` | `{ height, injury }` |
| `player:ragdoll` | `{ on }` |
| `player:mode` | `{ from, to }` |
| `player:grab` | `{ on, point? }` |
| `player:current` | `{ caught, strength }` |
| `player:tug` | `{ active, value }` (about 10 times a second while active) |
| `player:currentEscape` | `{ ok, strength }` |
| `player:maskFlood` / `player:maskClear` | `{ level }` / `{}` |
| `player:tankDrop` / `player:tankPickup` | `{ index, pos, bar }` / `{ index, bar }` |
| `player:lantern` | `{ out }` |
| `player:measure` | `{ state, progress, speciesId, result }` on each state change of measuring |
| `player:climb`, `player:splash`, `player:jump`, `player:footstep`, `player:pull` | small payloads for sound |
| `player:shocked`, `player:bitten`, `player:stung` | `{ strength }`, `{ severity, speciesId }`, `{ kind, severity }` |
| `player:hit` | now also `{ dry, fall }` |

### Events listened to

- `creature:attack` (agent B): `kind` `shock` (light stutters for `lightFlicker` s, panic, stamina, may flood the mask), `bite` / `pinch` (a cut; `gore` puts blood all over the mask), `sting` / `venom` (panic, health, `blur` s of blurred vision). Also accepts `creature:shock`, `creature:bite`, `creature:pinch`.
- `creature:caught`: remembers the species in `inventory.lantern.creatures` (fallback brightness when `lanternLight` is missing).
- `quake` (agent A): shake, panic, debris rain, silt clouds, rumble, and a small chance of a cut from a falling rock above strength 1.2.
- `ui:wrist` / `ui:watch` `{ open }` (or `TU.player.setWristRaised(bool)`).

### API additions

`TU.player`: `setWristRaised(b)`, `toggleLantern(force?)`, `dropTank()`, `pickUpTank(quiet?)`, `applyTape('duct'|'flex')`, `addInjury(type, severity, source)`, `tugAssist(amount)` (co-op hook for later: a teammate on the rope adds to your tug of war), `bindings`, `debug`.

`TU.player.debug` (tests and filming): `resetPlayer()` (reset only the diver, not the cave), `setMode('swim'|'crawl'|'squeeze'|'walk'|'crawlDry'|null)`, `forceCut(sev)`, `forceInjury(type, sev)`, `forceCurrent(Vector3 or m/s, seconds)`, `clearCurrent()`, `forceFall(heightM)`, `forceMaskFlood(level)`, `forceQuake(strength, seconds)`, `forceShock(strength)`, `forceBite(sev)`, `setWristRaised(b)`, `setHeadlamp(b or null)`, `setPanic(v)`, `setBattery(v)`, `giveLantern(brightness)`, `giveTape(duct, flex)`, `press(code)`, `grabWall()`, `releaseWall()`, `tug(v)`, `state()`, `cfg`.

`TU.fx`: `spawnBlood(n, { pos, burst })`, `spawnDebris(n, { pos, radius })`, `handScene`, `handCamera`, `lensActive()`, `hintCount()`, `hintInfo()`. `particleMaterial` takes `rotate: true` (sprites spin slowly).

`TU.audio`: `sounds()` lists recipe names: `inhale, exhale, purge, thump, fall, kick, pull, footstep, splash, cut, tape, pat, flood, shock, bite, creak, quake, metalClank, grab, whoosh, glass, beep, heart, drip, chime`.

### Air hints

fx.js draws the glassy hints in its lens pass (real refraction of the picture behind them, a fresnel rim and a highlight). Sources: `TU.cave.features.airHints` entries `{ pos, dir? | to? | target? }` (any of `pos`/`position`, `dir`, `to`/`target`/`air`), or, if there are none, one under each `airPockets[i].hintPos`. They show only between about 8 m and 30 m from the hint, when not hidden behind rock, never when you are surfaced or on dry land. Three beads drift along `dir` with a chevron at the front.

### Tunables

All numbers live in `TU.cfg` (core.js); the `C` object at the top of player.js is a short name for those sections, readable as `TU.player.debug.cfg`.

---

## Appendix B: Creatures, combat and predators (merged from CONTRACT-B-NOTES.md)

Additions to CONTRACT.md section 11. Everything in the original contract still works the same way.

### Files
`index.html` loads, in this order: `creatures-lib.js` (geometry kit and the animated creature material), `creatures-models.js` (procedural models for every species), `creatures.js` (species, census, behavior, drawing, API), `creatures-finds.js` (fossil and treasure finds). Only `creatures.js` is dropped in the stub test; the other three load harmlessly without it.

Internal helpers live on `TU._cr` (not for other modules).

### Species entry (extra fields)
`kind: 'fauna'|'flora'`, `catchable: bool`, `dangerous: bool`, `glow: hex` (bioluminescent color), `move`, `place`, `scaleK`.
Variant logbook lines use ids like `'olm:shiny'`, `'olm:juvenile'`, `'olm:giant'`. They are **not enumerable** (`Object.keys(TU.creatures.species)` lists only the 21 base species) but `TU.creatures.species['olm:shiny'].name` is `"Olm (golden)"` and has `variantOf`.

### Creature record (extra fields)
`sp` (species entry), `variant: null|'shiny'|'juvenile'|'giant'`, `shiny`, `active` (simulated and drawn now), `scale` (drawn size, m), `glow` (current glow multiplier), `photographed`, `normal` (rock normal for crawlers and plants).
`list()` returns the whole census (active and sleeping). `total()` = census size.

### Functions added to TU.creatures
| Function | Returns |
|---|---|
| `nearestInView(maxDist, minDot, opts?)` | `opts.catchable` only lantern catchables, `opts.kind` 'fauna' or 'flora'. Only active creatures. For a Lanternjaw the lure is the target. |
| `nearCount(pos, radius, opts?)` | `opts.glowing: true` counts only creatures giving light right now (use this for the darkness panic check). |
| `catch(id)` | as before; new reasons `'too_far'` (more than 3 m), `'no_lantern'`, `'full'`, `'bit'` (it was a Lanternjaw lure: it lunges and bites). Catching a Halo Jelly also emits a mild `'sting'` attack. Without a bought lantern, debug builds (`cfg.debug.enabled`) get a 2 slot jar. |
| `lanternLight()` | `{ brightness 0..10 (sum of species brightness, capped), intensity 0..1, range m, color THREE.Color (mix of caught glows), count, slots, items }`. Drive the lantern PointLight from this every frame. |
| `lanternRelease(id)` | puts a caught creature back in the water at the diver. |
| `measure(id)` | as before plus `variant`, `variantFirst`, `bounty ($)`. Size is a tape reading (true size plus about 1.5 percent error, rounded). |
| `measureStep(dt, holding)` | hold-to-measure helper. Call every step with `holding = T key down`. Returns `{ state: 'idle'|'aiming'|'measuring'|'done'|'lost', id, speciesId, progress 0..1, result (measure() result when done), reason: 'nothing'|'lost_sight'|'fled'|'no_tape' }`. Range 3 m, must be centered (dot 0.93), hold time 1.2 s and more for big or skittish animals. |
| `photo(id)` | photograph hook: logs with `photo: true`. Returns `{ id, speciesId, first, variant, bounty }` (+$50 the first photo of a dangerous species). |
| `earnings()` | `{ logbook $, finds $, total $ }` earned this run (bounty table from Design/Economy and Progression.md). |
| `speciesName(id)` | display name for a species or variant id. |
| `activeCount()` | creatures simulated right now. |
| `finds()` | `[{ id, kind: 'fossil'|'treasure', name, tier 1..5, value $, pos, taken, shiny }]` |
| `findNearest(maxDist = 2.5, minDot = 0.8)` | `{ id, kind, name, value, tier, dist, dot, pos }` or null |
| `pickup(id)` | `{ ok, reason?: 'gone'|'too_far', id, kind, name, value, tier }`. Emits `treasure:found` (and `fossil:found` for fossils). |
| `debugShowcase(id or 'all' or false, { variant, jaw 0..1, size 0..1 })` | shows one species large under neutral light far from the cave (camera layer 5 only), for tests and filming. |
| `debugShowcaseFind(name or 'all' or false)`, `debugFindModels()` | same for find models. |
| `debugAdvance(sec)` | advances the showcase animation, returns the phase. |
| `debugSpawnInFront(id, dist, { still, variant, sizeU, dy })` | a real creature in front of the diver. |
| `debugIds()` | base species ids. |
| `debugPlace(id, dist)` | moves a creature in front of the camera, side-on. |

### New events (emitter: creatures)
| Event | Payload |
|---|---|
| `creature:attack` | `{ id, speciesId, kind: 'pinch'|'bite'|'shock'|'venom'|'sting', severity 0..1, injury: 'cut'|'bite'|null, panic (points to add), lightFlicker (s the flashlight should flicker or drop), blur (s of blurred vision), gore: bool (show blood), radius (m, shock radius), pos, dir (from creature to diver) }` |
| `creature:warn` | `{ id, speciesId, kind: 'pinch'|'shock', pos }` once per approach (claws raised, eel crackling). Good for a sound. |
| `fossil:found` | same payload as `treasure:found`, only for fossils. |
| `treasure:found` | `{ id, kind, name, value $, tier, pos, kg, shiny }` (emitted by creatures-finds.js, not player). |
| `creature:seen` | now also carries `variant`. |
| `creature:caught` | now also carries `lantern` (the lanternLight() result). |

Who attacks: Entrance Crayfish pinch (hover within 1 m for more than 1.3 s), Remipede venom (hands within 0.5 m for 1 s), Volt Eel shock (warns inside 3.6 m, shocks inside 1.9 m), Lanternjaw bite (touch or try to catch the lure), Halo Jelly sting (when caught).

### Config
Tunables are in `TU.creatures.tuning` (local, marked TODO cfg) until the lead adds `TU.cfg.creatures`.

---

## Combat and predators (added Oct 19)

### Files
`index.html` now loads `creatures-lib.js`, `creatures-models.js`, **`creatures-pred-models.js`** (the six predator models), `creatures.js` (hit points, damage, death, gore, clouds), **`creatures-predators.js`** (predator species, brains, spawning, grabs, ink, tell sounds), `creatures-finds.js`. With `creatures.js` dropped, both new files do nothing.

### Damage contract (the weapons call these)
| Function | Returns |
|---|---|
| `raycastHit(origin, dir (unit), maxDist)` | `null` or `{ id, species, speciesId, point: Vector3, dist }`. Tests a capsule per creature sized to its model (schools are separate records; a Sea Firefly swarm is one sphere). Flora is skipped. Dead bodies can be hit. Compare `dist` with `TU.cave.raycast` yourself. |
| `damage(id, amount, { dir, point, weapon, kind: 'pierce'\|'blunt'\|'push'\|'shock'\|'cut' })` | `{ hp, maxHp, killed }`, plus `immune: true` for flora, `dead: true` if it was already dead, `gone: true` if it no longer exists. One basic spear hit is about **10**. Kind multipliers: pierce 1, cut 1, blunt 0.6, shock 1.2 (Volt Eel immune, it gets angry), push 0. Hits in the front third of the body (the head) x1.4. Species `armor` multiplies further (The Maw: pierce 0.85, cut 0.7, blunt 0.4). Every hit also shoves the body. |
| `impulse(id, vec)` | `true`. `vec` is the push in m/s given to a 1 m animal; it is divided by `clamp(size^2, 0.15, 40)`, so small fish fly and The Maw barely moves. |
| `stunArea(pos, radius, seconds)` | number stunned. Less time at the edge; species `stunK` scales it (The Maw 0.3). Stunned animals drift and twitch; a stunned grabber lets go. |
| `inRadius(pos, radius, { hostile })` | `[{ id, species, speciesId, pos, dist }]` nearest first, living fauna only. `hostile: true` = dangerous species and predators. |
| `inkAt(pos)` | 0 = clear water, 1 or more = you cannot see (squid ink). |
| `grabbedBy()` | `null` or `{ id, species, speciesId, strength 0..1, kind: 'drag'\|'hold'\|'shake', anchor: Vector3, t }` |
| `struggle(amount = 0.08)` | one alternating tap of the struggle mini game; `false` when nothing holds you. player.js calls it on every alternating A / D tap while held (creatures-predators.js only reads the keys itself in the no-player fallback). |
| `releaseGrab()`, `predatorIds()`, `predatorTuning` | |
| debug: `debugSpawnPredator(id, dist, { st, still, sizeU, facing, n, ext })`, `debugPose(id, { st, tell, act, roll, glow, ext, free })`, `predatorInfo(id)`, `debugGrab(id, kind)`, `debugInk(id)`, `debugKill(id, by)`, `debugDirector()`, `debugShowcase(id, { tell: 0..1, jaw: 0..1, dead: true })` | tests and filming |

Hit points: flora 0 (cannot be hurt). Small animals have `size m x 30` hp (1 to 40), so fish, shrimp, olms and crayfish die in one hit; jellies and swarms 2. Volt Eel 30, Lanternjaw 25, Deep Lobefin 40, The Old Blind One 400. Predators (after the balance pass, section 11b): shark 110, barracuda 20, gulper 70, Lurker 140, squid 44, The Maw 520 (each +-10% with body size).

### Hurt and death
- Hurt: prey flees (the whole school too); the Volt Eel comes at you crackling; the crayfish snaps; the Lanternjaw lunges if close. Predators: the shark gets angry (no more bump, bites sooner) and flees below 35% hp; the barracuda pack scatters; the eel lets go and hides; the Lurker charges, then flees below 30%; a squid inks and jets away; The Maw backs off into the dark every quarter of its health it loses.
- Killed: 1.5 s of twitching, then limp (jaw slack). Fish float up belly first, sharks and eels sink and end on their side, crawlers flip on their back, a dead Gulper slumps half out of its hole, swarms spread and fade. Blood (`TU.fx.spawnBlood`; squid blood is blue, crustacean fluid milky, through creatures' own cloud particles), 2 to 10 gore chunks that drift down and rest on the floor, a short blood trickle. Glow fades. The body stays about 150 s (The Maw 600 s) and is removed when you are not looking. Giant Isopods crawl to fresh carcasses.
- A killed animal can still be measured or photographed: `measure()` returns `specimen: true` and the logbook entry gets `specimens` (count).

### Species fields (new)
`hp`, `danger` (0..5, also on existing species: crayfish 1, remipede 1, Volt Eel 3, Lanternjaw 3), `predator: true`, `blood: 'red'|'blue'|'pale'|'none'`, `buoy` (m/s after death, + floats), `armor`, `stunK`, `hit: { r, len, off, lift }` (hit capsule in model units), `eyeCol`, `crawler`, `lift`. Bounties are multiplied by `1 + 0.5 x danger` (a danger 4 shark pays x3).
Records gained `hp, maxHp, dead, deadT, stun, imp, roll, tell (0..1 warning glow), hurtT, enrage, gone`. `TU._cr.addSpecies(o)` registers species from other creature files (with variant lines).

### The predators
| Species | Zones | Size | HP | Danger | How it hunts | The tell (your warning) | Strike |
|---|---|---|---|---|---|---|---|
| Cenote Bull Shark (real, *Carcharhinus leucas*) | 0 to 1 | 1.8 to 3.2 m | 110 | 4 | patrols open water near (never within 15 m of) the entrance; sees you at 16 m, smells blood at 45 m, hears weapons; circles tighter | the hunch: pectorals drop, back arches, stiff exaggerated swimming, eyes flare, a low thrum, 0.9 to 1 s | first a `bump` (panic, shove), then a `bite` (severity 0.55, gore). Dodge sideways: the charge only homes a little |
| Pale Cave Barracuda (pack of 3 to 7) | 1 to 2 | 0.6 to 1.3 m | 20 | 2 | the pack circles at 6.5 m | one goes stiff with its nose on you, eyes flash silver, teeth chatter, 0.6 s | darts through at 8.5 m/s, `slash` (cut 0.22); pack scatters when hurt, gives up after losing half |
| Gulper Ambush Eel | 2 | 1.4 to 2.6 m | 70 | 3 | lives in a dark hole in the wall (drawn as a burrow), breathes with its mouth open, watches you | pulls back into the hole, mouth wide open, eyes flare, a wet "glorp", 0.75 s | lunge `bite` (0.35) then `grab` kind `drag`: pulls you to its hole for up to 6.5 s, gnawing; a final bite if you do not break free |
| Cave Lurker | 2 to 3 | 2.4 to 4.2 m | 140 | 4 | crawls floors and walls; creeps toward you only while you look away, freezes when you look | your light on it (or getting within 3 m): head up, jaws open, long hiss, eyes flare, 0.85 s | charges along the rock, pounces from 3 m, `bite` (0.6) and a 2 s `shake` grab (death roll) |
| Spider Squid (pack of 2 to 3) | 3 | 1.2 to 2.4 m | 44 | 3 | circle you on a ring, arms toward you, photophores pulsing | the strobe: fast flashing, the arm crown opens, clicks, 0.9 s | darts in, `grab` kind `hold` on your mask for up to 5 s; misses and hurts end in an `ink` cloud (blinds you, `blur` 2.5 s) |
| The Maw (rare mini boss) | 4 | 9 to 14 m | 520 | 5 | shadows you at about 20 m: you see its blue lure lines in the dark; armor plates, bone blade jaws | the lights go out (its lure lines and point light die), a deep rumble with mask shake, then the eyes flare, 2.2 s | a straight charge at 9 m/s, `bite` (0.8, gore, shoves you aside). Swim sideways |

Fairness: every strike follows a tell of at least 0.6 s (in the test: at least 0.4 s between `creature:tell` and `creature:attack`), two strikes from any predators are at least 1.2 s apart, only one grab at a time, no predator attacks in the tutorial, in dry chambers or at the surface, and none spawn within 15 m of the entrance or 18 m of the dive start.

Spawning (per run, deterministic; rookie grace and the easy shark factor in section 11b): shark 0.9 (easy x0.35), barracuda packs 1, gulpers 2 (zone 2 walls), Lurker 1 (a floor with room), squid packs 1, The Maw 55% (zone 4 with at least 3.5 m of room); each count is multiplied by difficulty (easy 0.5, standard 1, hard 1.5). The director then keeps `want[zone]` predators within 70 m (easy [0,0,1,1,1], standard [0,1,1,1,1], hard [1,1,2,2,1]), one spawn at most every 45 s, 26 to 48 m away and out of sight. This keeps endless depth stocked.

Activation: predators wake 14 m farther than other creatures (The Maw 30 m) and keep their place under the `maxActive` cap, so a shark 40 m away can still smell you.

Tests: `python3 tests/test_predators.py [show] [attack] [death] [api] [only=shark,maw]` (screens `tests/screens/PRED_*.png`).

Senses: blood (`TU.player.state.bleed > 0`: shark 45 m, barracuda 32 m, Lurker 30 m, squid 25 m, The Maw 60 m), `weapon:noise { pos, loudness }` (range 30 m x loudness: prey flees, shark, barracuda, Lurker and The Maw come to look), sight with line of sight, your flashlight (Lurker, eyeshine).

### New events (emitter: creatures)
| Event | Payload |
|---|---|
| `creature:hurt` | `{ id, species, speciesId, hp, maxHp, pos, point, amount, kind, weapon }` |
| `creature:killed` | `{ id, species, speciesId, pos, by (weapon or kind), sizeM }` |
| `creature:grab` | `{ id, species, speciesId, strength, kind: 'drag'\|'hold'\|'shake' }` |
| `creature:release` | `{ id, species, speciesId, reason: 'struggle'\|'hit'\|'killed'\|'stunned'\|'timeout'\|'lost'\|'debug' }` |
| `creature:tell` | `{ id, species, speciesId, kind: 'circle'\|'hunch'\|'chatter'\|'hiss'\|'flash'\|'rumble', pos }` (a warning before a strike; not `creature:warn`, which ui.js shows as a crayfish message) |
| `creature:ink` | `{ id, species, speciesId, pos }` |
| `creature:attack` | new kinds `slash` (injury cut), `grab`, `ink` (blur), `bump` |

### Listens to
`weapon:noise { pos, loudness }`. Reads `TU.player.state.bleed`, `TU.player.input.keys` (A / D struggle), `TU.player.lamp`.

Sounds: the tells use `TU.audio.ctx` / `TU.audio.out` (audio.js exposes them after the first click): their own synthesized thrum, chatter, glorp, hiss, clicks and rumble with stereo panning. Before the audio is unlocked they fall back to `TU.audio.play` with the closest existing sounds. creatures never opens its own AudioContext (a second context hung the headless test browser).

### Writes outside creatures (none now)
While a predator holds you, creatures-predators.js calls `TU.player.setHeld(id, pullVec, opts)` every step and `TU.player.release(id)` when it lets go; the shark's bump and The Maw's shove go through `TU.player.applyRecoil`. Only if player.js lacks that API (never in the shipped game) does it fall back to steering `TU.player.state.vel` and its own `#cr-grab` bar.

### DOM
`#cr-grab` (the fallback struggle bar, z 3, hidden when player.js draws the one struggle bar `#pl-tug`) and `#cr-ink` (the ink blackout, z 1). Burrow holes are an InstancedMesh named `cr-burrow`; gore `cr-gore`; clouds `cr-clouds`.

---

## Appendix C: Endless depth and glow sticks (merged from CONTRACT-ENDLESS-NOTES.md)

Additions to CONTRACT.md from this round (owner: the endless and glow stick agent, files `js/cave*.js`, `js/main.js`, `js/glowsticks.js`). Nothing existing was removed or renamed.

### 1. Endless depth (KEEP DIVING opens new cave)

Flow: touch the Ancient Ring -> results -> KEEP DIVING -> `TU.game.keepDiving()` -> `TU.cave.endless.descend(run.endSeg + 1)`:

1. The ring wakes up (brighter, faster), the chamber rumbles (`quake` event, no falling rocks on you), messages.
2. A new cave **segment** is generated from a derived seed, `(run seed + k) >>> 0` for segment k (retries add `7919` per attempt, at most 8, deterministic). It is placed under the ring chamber and joined by a vertical shaft through the chamber floor. The seed is retried if the shaft plus the swim to the new segment's first air source breaks the generator's `maxGap` rule, or if there is no room.
3. A job builds it about 6 ms per frame (`TU.cave.endless.config.budgetMs`): sample the rock, mesh the walls near the hole, dress it (formations, a new Ancient Ring, finds, water). The old floor stays solid until it is done and at least 3.6 s of dive time have passed.
4. The floor breaks open: the hole is cut, boulders, stalagmites and standing stones over it fall in, rocks and silt fall down the shaft, a big shake, and the ring chamber's dome fills with air (`features.airPockets` entry with `dome: true`). `features.bottom` is now the new ring with `segment: k`.
5. The new ring ends the leg like the first one (reason `'bottom'`, results with END RUN / KEEP DIVING). Calling the dive from the pause menu stays reason `'endless'` (a good ending).
6. Memory: when segment k is made, segment k - 2 is **freed** (its cells, meshes, dressing and colliders) and the top of the shaft into segment k - 1 collapses (`cave:collapse` with cause `'endless'`). You can swim back up through the previous segment, not further. The rope (player.js) still runs to the entrance stake.

Segment 0 is the first cave. A new dive (or restart) always rebuilds a fresh single cave.

#### Zones past the first five (the Beyond)

| Index | Name | Depth |
|---|---|---|
| 0..4 | the classic zones | unchanged, the first cave only |
| 5 | The Hollow | from the top of segment 1 down to 350 m |
| 6 | The Root | 350 to 450 m |
| 7, 8, 9 | The Glass Dark, The Bone Choir, The Still Sea | 100 m each |
| 10+ | The Hollow II, The Root II, ... (cycling) | 100 m each |

In endless segments `zoneAt`, `nearestPoint().zone`, `randomSpot().zone` and the pieces' `P.zone` use these. Each Beyond zone has its own rock palette (vertex colors), a shader look (pale hollows, red root veins, black glass, bone flecks, a green tint) and faint glowing specks in a zone color. Area banners: `seg<k>` "THE WAY DOWN", `bz<zone>` (the zone name), `chamber<k>` "ANOTHER RING".

#### TU.cave additions

| Function | Returns |
|---|---|
| `zoneAt(pos)` | now `{ index, name, topM, beyond }`; index 5+ in endless segments |
| `zoneName(index)`, `zoneInfo(index)` | `'The Hollow'`, `{ index, name, topM, beyond }` |
| `zoneOfDepth(depthM, beyond?)` | zone index from depth alone (Beyond below the first segment's top, or when `beyond` is true) |
| `endless.descend(k?, { seed?, difficulty? })` | `{ ok, index, seed, attempts, freed, cells, pieces }` or `{ ok: false, reason }`; called by main.js |
| `endless.building()`, `endless.phase()` | a segment is being built; `'sample' \| 'chunks' \| 'dress' \| 'wait'` |
| `endless.finish()` | finish the build now (tests, debug) |
| `endless.segment()` | index of the segment whose ring is the goal |
| `endless.segments()` | `[{ index, seed, chunks, cells, opened, freed, difficulty }]` |
| `endless.lastBuild()` | `{ ms, workMs, maxStepMs, frames }` of the newest segment's build |
| `endless.beyondStartM()`, `endless.config`, `endless.zones` | depth where the Beyond starts, tunables, zone names and palettes |
| `stats()` | adds `liveCells, blocks, chunks, colliders, segments, building` |
| `spot(name)` | new names: `hole` (beside the hole in the old ring chamber), `shaft`, `segStart` (the new segment's start room), `segPocket` (its first air pocket), `dome` (under the air dome). `deep`, `bottom`, `end` follow the newest ring. Spots in a freed segment are removed. |

`features.bottom.segment` (new): the segment whose ring this is. `features.segment`: the goal segment. `features.landmarks` has one `'ancient'` / `'ancient<k>'` entry per live ring. `mapData()` only contains live segments, plus `segment, rings: [{ pos, segment }], zones: [{ index, name, topM }], glowSticks: [{ pos, color, light }], entranceReachable`, and `chambers[i].seg`, `segments[i].seg`.

#### Events

| Event | Payload | Emitter |
|---|---|---|
| `cave:segment` | `{ index, state: 'building' \| 'open' \| 'freed', seed?, zone?, zoneName?, topM?, bottom?, freed? }` | cave |
| `cave:collapse` | cause can now be `'endless'` (the shaft behind you) | cave |
| `run:continue` | adds `segment` (the new goal segment) | main |

#### Run and summary (main.js)

`TU.run.endSeg` (0 = the first ring is the goal, k = segment k's ring), `TU.run.maxZone`. Summary adds `maxZone, maxZoneName, segment, beyond, sealedAbove, endlessNote, endlessRun`. `summary.endless` is now false for a leg that ends at a new ring (reason `'bottom'`), so the results screen shows the END RUN / KEEP DIVING choice again; `endlessRun` is true for every leg after the first. `__debug.getStats()` adds `endSeg, maxZone, zoneAt, building`. The win check: `features.bottom.segment === run.endSeg` (in endless mode only once a new segment is open).

#### Internals (cave-sdf.js, cave-dress.js)

- Cell keys keep the old packing for depth layers 0..239 and add a high part for deeper ones (`TU.caveGeo.key`, `decode`). Each piece keeps its segment's hash seed (`P.seedV`, `P.seg`).
- `TU.caveGeo.extend(G, layout, opts)` merges a translated layout plus the connector shaft into the live geometry; `touchedCells`, `swapBlocks`, `freeCells`; `sampleCell(G, x, y, d, targetMap?)`.
- `TU.caveDress.start(W, G, ctx)` returns a job (`step(ms)`), `build()` runs it at once. Per-segment groups (`cave-seg<k>`), one shared core light, one shared rubble mesh.

### 2. Glow sticks (js/glowsticks.js, TU.glowsticks)

- **Key 3** (state `'dive'`, not while typing): crack and throw one in the look direction. Registered in `TU.player.bindings` as `{ action: 'glowStick', keys: ['Digit3'] }` right after Flex Tape.
- Uses `TU.player.inventory.glowSticks` (from the loadout; the camp already removes used ones from stock). None left: `ui:msg` "No glow sticks left. Buy more at the Sump Camp."
- Physics: sinks about 0.35 m/s in water, falls in air, bounces off rock (`TU.cave.collide`), comes to rest on floors.
- Light: green, cyan, orange in turn. Emissive tube and a halo; the 3 newest sticks get one of 3 pooled point lights (made at boot, never removed, intensity 0 when free). About 4 minutes (bright, then a 40 s fade). At most 24 in the world.
- Calms panic within 6 m through `TU.player.calm`, and player.js counts a lit stick within 6 m as light for the darkness panic.
- Sound: its own tiny synthesized snap in `TU.audio.ctx`, into `TU.audio.out` (volume and mute apply), muffled under water.

| Function | Returns |
|---|---|
| `throwStick({ free?, dir?, pos?, speed? })` | the stick or null (none left) |
| `list()` | `[{ id, pos, color, brightness 0..1, age s, rest, lit }]` |
| `count()`, `near(pos, r)`, `calmAt(pos)` | numbers |
| `clear()`, `lights()`, `age(sec)` (debug: skip time), `cfg` | |

Event `glowstick:throw` `{ pos, dir, color, left }`.

### 3. Tests

`python3 tests/test_endless.py`: keep diving twice, the build without long steps, zones, the hole and dome, mapData, bounded memory, the collapse behind you, glow sticks (throw, land, light pool, calm, fade, inventory, none left), zero console errors. Screenshots `tests/screens/END_*.png`, `GLOW_*.png`.
