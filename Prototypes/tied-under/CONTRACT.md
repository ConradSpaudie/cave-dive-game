# Tied Under: module contract

This is the shared interface between the files in `js/`. Four agents built the modules in parallel; the integration pass (lead) now owns every file and merged their notes and requests into this document (CONTRACT-B-NOTES.md and CONTRACT-C-NOTES.md hold the long-form details).

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

`index.html` loads, in order: three.js r128 (cdnjs), `core.js`, `generator.js`, `fx.js`, `cave-sdf.js`, `cave-mat.js`, `cave-dress.js`, `cave.js`, `creatures-lib.js`, `creatures-models.js`, `creatures.js`, `creatures-finds.js`, `player.js`, `player-hands.js`, `audio.js`, `ui.js`, `ui-hud.js`, `ui-logbook.js`, `ui-camp.js`, `ui-locker.js`, `ui-wrist.js`, `ui-tutorial.js`, `main.js`. At load time a file may only define things and call `TU.define`, `TU.addSystem`, `TU.on`, `TU.css`, `TU.tex.register`. **Do not touch the scene or DOM of other modules at load time**: do it in `init()`.

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
| `run:continue` | `{run, leg}` | main (`keepDiving`) | ui (new run log for the next leg) |
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
| `player:surfaced` / `player:submerged` | `{pos, surfaceY}` / `{pos}` | player | ui |
| `player:siltout` / `player:siltclear` | `{silt}` / `{}` | player | ui |
| `player:light` | `{on, reason: 'toggle'\|'dead'\|'empty'}` | player | ui |
| `player:lowBattery` | `{battery}` | player | ui |
| `player:narcosis` | `{depth}` | player (once per run past `cfg.narcosis.msgDepth`) | ui |
| `player:blocked` | `{kind: 'exit'}` | player | ui |
| `player:tankSwitch` | `{from, to}` (tank indexes) | player | ui |
| `waypoint:placed` | `{index, name, pos, depth}` | player | audio, ui |
| `creature:seen` | `{id, speciesId, variant}` | creatures (first time in view) | |
| `creature:attack` | `{id, speciesId, kind: 'pinch'\|'bite'\|'shock'\|'venom'\|'sting', severity 0..1, injury, panic, lightFlicker s, blur s, gore, radius, pos, dir}` | creatures | player (panic, light flicker, blur, cuts, blood), ui (messages) |
| `creature:warn` | `{id, speciesId, kind: 'pinch'\|'shock', pos}` | creatures (once per approach) | audio, ui |
| `fossil:found` | as `treasure:found`, fossils only | creatures-finds | |
| `creature:fled` | `{id, speciesId}` | creatures | |
| `creature:caught` | `{id, speciesId, brightness, lantern}` | creatures | player |
| `creature:logged` | `{speciesId, sizeM, first, record, entry}` | core (`TU.logbook.add`) | ui |
| `treasure:found` | `{id, kind: 'fossil'\|'treasure', name, value ($), tier, pos, kg, shiny}` | creatures-finds (`pickup`, called by player on E) | cave (hides it), ui (haul bag) |
| `quake` | `{strength 0..2, duration (s), pos?}` | cave (`TU.cave.quake`, the `collapse_ahead` modifier) | fx, player, audio, ui |
| `cave:collapse` | `{pieceId, branchId, pathId, pos, cause: 'quake'\|'debug'}` | cave | ui |
| `cave:rockHit` | `{r (m), speed (m/s), pos}` | cave-dress (a falling rock touches the diver) | player (cut, break, or crushed) |
| `save:changed` | `{data}` | core | |
| `ui:msg` | `{text, dur?}` | anyone | ui |
| `ui:zone` | `{title, subtitle}` | anyone | ui |
| `ui:hint` / `ui:hideHint` | `{text, dur?}` / `{}` | anyone | ui |
| `ui:toggleHud` | `{}` | player (H key) | ui |
| `ui:wrist` / `ui:watch` | `{open}` | ui | player (raises the arm) |

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
// summary (run:end payload and state data):
{ seed, won, reason, timeS, maxDepthM, ropeM, airLeftBar, creaturesSeen, creaturesTotal,
  distM, waypoints, siltOuts, wallHits, loadout, difficulty, tutorial, endless, leg, bottomReached }
```

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
| `zoneAt(pos)` | `{ index, name, topM }` |
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
Extra fields (all created in the core.js stub; meaning in CONTRACT-C-NOTES.md): `health` 0..100, `bleed`, `bleedOut` (s spent bleeding at the lowest health), `bloodMask`, `maskWater` and `maskFlood` (the same 0..1 level), `maskSlosh`, `maskClearing`, `grab`, `caught`, `currentSpeed`, `tug`, `stuck`, `dry`, `rag`, `daze`, `lanternOut`, `lanternLevel`, `headlamp`, `wristRaised`, `carried`, `kickMul`, `maimed`, `warm`, `quake`, `shock`, `drownSeconds`, `measure`, `anim`.
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
| E (tap) | dive | use: pick up a dropped tank, a fossil or treasure, or catch a glowing creature | player |
| E (hold near rock) | dive | grab the rock (only when the tap did nothing); with A / D alternating: current tug of war | player |
| T (hold) | dive | measure a creature (`TU.creatures.measureStep`) | player |
| F / L / M (hold) | dive | flashlight / lantern / blow the mask clear | player |
| 1 or X / 2 | dive | duct tape / Flex Tape the worst open cut | player |
| G | dive | drop the spare tank, or pick a dropped one back up | player |
| Q | dive | drop a waypoint (a name box opens; typed keys never reach the diver) | player, ui |
| Tab (hold or tap) | dive | wrist computer and hologram; while up: `[` `]` pick a waypoint, N rename, arrows / drag spin, wheel zoom (captured, so they do not move the diver) | ui |
| J | dive | waterproof slate (logbook) | ui |
| H | dive | hide the HUD | player -> ui |
| Esc | dive | pause (in a text box it only closes the box) | player |
| 1 to 8 | camp (`'loadout'`) only | camp stations | ui |
| Enter / K | menus / finished tutorial | main action / keep exploring | ui |

---

## 9. Config (TU.cfg)

Sections: `loop, world, swim (8 slider keys listed in tuneUI), tuneUI, air, vest, stamina, light, panic (plus agent C's highFrom, staminaLoss, cut, cutScale, shock, bite, quake, fall, darkRadius), breath, silt, narcosis, loadouts, upgrades, rope, waypoints, fx, gfx (low / medium / high presets and the auto scaler), cave (margin, cullDist, daylightRange), creatures (agent B's tunables), crawl, squeeze, walk, fall, grab, current, injury (bleedOut), rocks (crush thresholds), mask, masks (mask types), flippers, depth, cold, tank, lantern, debug (enabled, freeLantern)`. Each value has its unit in a comment in core.js. Sliders write `cfg.swim[...]` and persist to `TU.save.data.settings.tune`.

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

---

## 12. FX and audio (owner C)

`TU.fx`: `spawnSilt(n, { pos, back?, vel?, burst?, floorY? })`, `spawnBubbles(n, { pos, right? })`, `siltDensity()` 0..1, `shake(amount)`, `particleMaterial({ map, color, base, additive, opacity, glow })`, `makePoints(count, material)` (attributes position, aSize, aAlpha, aCol), `clear()`, `render()`, `screenshotMode(on)`.

`TU.fx` also: `spawnBlood`, `spawnDebris`, `handScene`, `handCamera`, `lensActive()`, `hintCount()`, `hintInfo()`, and graphics quality: `gfx` (the active preset: `name, pixelRatio, msaa, shadows, shadowMap, particles, cullDist, lowRock, autoScale, auto`), `setQuality('low'|'medium'|'high')`, `setAutoQuality(bool)`, `quality()` (a summary). The auto scaler lowers the render scale (down to `cfg.gfx.scaleMin`) when the average frame takes longer than `autoSlowMs`, and raises it again when there is room.

Performance budget (60 fps at 1080p on Apple Silicon): dynamic lights in the cave scene are fixed in number so shaders never recompile mid-dive: ambient, the flashlight spot (the only shadow caster; off on Low), its bounce light, the lantern, `cfg.waypoints.lights` (2) waypoint lights, `cfg.creatures.lights` (2) creature lights, the entrance daylight and one light at the bottom core. The hands have their own small scene. The lens pass renders into one target at the preset resolution (MSAA 4 only on High); the screen buffer has no MSAA. Chunks past `gfx.cullDist` are hidden. Hot loops reuse scratch vectors (no allocations per creature or per particle).

`TU.audio`: `unlock()` (call inside a click), `setMuted(bool)`, `setVolume(0..1)`, `play(name, params)` (names in `sounds()`), `suspend()`, `resume()`, `ready`, `muted`, `volume`.

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

## 14. Debug hooks (window.__debug, main.js)

`getStats()` / `state()` (also `health, endless, tutorial, disabled`), `setState(s)`, `start(opts)`, `win()`, `disabled()`, `teleport(nameOrMeters, {dy, yaw, pitch, low})`, `look(yaw, pitch)`, `lookAt(pos)`, `lookAtCore()`, `set(key, value)` (player state; `'air'` sets the active tank), `setAir(bar, allTanks = true)`, `get(key)` (`'t'` = run time), `silt(n)`, `step(n)` (n fixed steps), `sim(seconds, ['KeyW', ...])` (hold keys and step), `render()`, `screenshotMode(on)`, `gen(seed, opts)`, `TU`.

## 15. Testing

Run one browser at a time (memory is tight), in this order: `python3 tests/test_cave.py quick`, `tests/test_creatures.py`, `tests/test_player.py`, `tests/test_ui.py`, `tests/run_test.py`, `tests/test_flow.py` (the whole game: title, camp, a purchase, loadout, an easy dive, the bottom, results, keep diving, back to camp, and a death, with zero console errors).

`python3 tests/run_test.py` must pass (exit 0, zero console errors) before any hand-off. It runs static artifact checks, a full scripted dive with screenshots in `tests/screens/`, the stalactite orientation check, and a boot with `creatures.js` and `audio.js` removed (`/?drop=creatures,audio`) to prove the stubs hold. If you add a feature, add a step and a screenshot to the test.
