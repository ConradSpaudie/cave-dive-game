# Tied Under: module contract

This is the shared interface between the files in `js/`. Four agents work in parallel, each on their own files. If you need something from a file you do not own, **do not edit it**: write the request in your hand-off ("needs from core.js: ...") and code against the stub, which already exists.

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

`index.html` loads, in order: three.js r128 (cdnjs), `core.js`, `generator.js`, `fx.js`, `cave.js`, `creatures.js`, `player.js`, `audio.js`, `ui.js`, `main.js`. At load time a file may only define things and call `TU.define`, `TU.addSystem`, `TU.on`, `TU.css`, `TU.tex.register`. **Do not touch the scene or DOM of other modules at load time**: do it in `init()`.

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
- Paused: no update or idle, frames still render. Extra systems a module registers run after the listed ones.
- The loop is fixed-step (`TU.cfg.loop.fixedDt = 1/60`, at most `maxSteps = 5` per frame). Never read wall-clock time for gameplay; accumulate `dt`.
- A hook that throws is logged and rethrown during boot; during play an error in one handler of an event does not stop the others.

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
| `TU.game.endRun({ won, reason })` | records the run, emits `run:end`, state `'results'` (won) or `'dead'` |
| `TU.game.toTitle()`, `TU.game.openLoadout()` | menus |

`state:change` payload: `{ from, to, data }`. For `'results'` and `'dead'`, `data.summary` is the run summary (section 6).

---

## 5. Events

All payloads are plain objects. Vectors in payloads are copies (safe to keep). "Emitter" is the only module allowed to emit it.

| Event | Payload | Emitter | Listeners now |
|---|---|---|---|
| `state:change` | `{from, to, data}` | core (via main) | player (pointer lock), audio (suspend), ui (screens) |
| `run:start` | `{run}` | main | ui |
| `run:end` | `{won, reason: 'bottom'\|'drowned'\|'debug'\|'quit', summary}` | main | audio |
| `area:enter` | `{id, title, subtitle, style: 'zone'\|'msg'}` | main (director, first entry per run into a `TU.cave.areas` id) | ui |
| `player:kick` | `{strength, sprint}` | player | audio |
| `player:inhale` / `player:exhale` | `{dur (s), surfaced, panic (0..1)}` | player | audio |
| `player:hit` | `{strength 0..1, impact (m/s), normal, pos}` | player (wall hit above `cfg.swim.wallHitMin`) | audio |
| `player:cut` | `{severity 0..1, pos, injury}` | player (reserved: injuries not built) | |
| `player:drown` | `{pos, depth}` | player (once per run) | main ends the run |
| `player:surfaced` / `player:submerged` | `{pos, surfaceY}` / `{pos}` | player | ui |
| `player:siltout` / `player:siltclear` | `{silt}` / `{}` | player | ui |
| `player:light` | `{on, reason: 'toggle'\|'dead'\|'empty'}` | player | ui |
| `player:lowBattery` | `{battery}` | player | ui |
| `player:narcosis` | `{depth}` | player (once per run past `cfg.narcosis.msgDepth`) | ui |
| `player:blocked` | `{kind: 'exit'}` | player | ui |
| `player:tankSwitch` | `{from, to}` (tank indexes) | player | ui |
| `waypoint:placed` | `{index, name, pos, depth}` | player | audio, ui |
| `creature:seen` | `{id, speciesId}` | creatures (first time in view) | |
| `creature:fled` | `{id, speciesId}` | creatures | |
| `creature:caught` | `{id, speciesId, brightness}` | creatures | |
| `creature:logged` | `{speciesId, sizeM, first, record, entry}` | core (`TU.logbook.add`) | ui |
| `treasure:found` | `{id, kind: 'fossil'\|'treasure', name, value ($), pos}` | player (reserved) | ui |
| `quake` | `{strength 0..2, duration (s), pos?}` | cave (reserved, run modifier) | fx, player, audio, ui |
| `save:changed` | `{data}` | core | |
| `ui:msg` | `{text, dur?}` | anyone | ui |
| `ui:zone` | `{title, subtitle}` | anyone | ui |
| `ui:hint` / `ui:hideHint` | `{text, dur?}` / `{}` | anyone | ui |
| `ui:toggleHud` | `{}` | player (H key) | ui |

Adding an event: name it `module:thing`, document it here (ask the lead), and keep payloads small.

---

## 6. Run object and summary (main.js)

```js
TU.run = {
  seed: uint32, difficulty: 'easy'|'standard'|'hard', modifiers: [],
  layout: <generator output or null>,           // section 7.1
  loadout: { ...copy of TU.save.data.loadout }, upgrades: { ...copy },
  touch: bool, startedAt: ms, t: s (game time in the dive),
  area: current area id, areasSeen: { id: true }, ended, won, reason
}
// summary (run:end payload and state data):
{ seed, won, reason, timeS, maxDepthM, ropeM, airLeftBar, creaturesSeen, creaturesTotal,
  distM, waypoints, siltOuts, wallHits, loadout }
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
`ropeLength()` m, `ropePoints()` array of Vector3 (stake first), `waypoints()` `[{index, name, pos, depth}]`, `dropWaypoint(name?)`, `toggleFlash()`, `teleport(pos, yaw?, pitch?)`, `look(yaw, pitch)`, `enableTouch()`, `isTouch()`, `setAir(bar, allTanks?)`, `cameraForward()`.

### 8.3 Inputs (keyboard and mouse)
W A S D kick, Space up, C or Ctrl down, Shift sprint, B inflate vest, V deflate, R slow breathing, F flashlight, Q waypoint, H hide HUD, Esc pause, Enter (menus: start, resume, dive again). Player owns keyboard handling during `'dive'`; ui owns Enter in menus. Free keys for new actions: E (interact: catch, pick up), T (measure), G (drop tank), X (tape a cut), Tab (watch map).

---

## 9. Config (TU.cfg)

Sections: `loop, world, swim (8 slider keys listed in tuneUI), tuneUI, air, vest, stamina, light, panic, breath, silt, narcosis, loadouts, upgrades, rope, waypoints, fx, debug`. Each value has its unit in a comment in core.js. Sliders write `cfg.swim[...]` and persist to `TU.save.data.settings.tune`.

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
  settings: { muted, fastDrain, tips, tune: { [swimKey]: number }, hudHidden }
}
```
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

Creatures draw with `TU.fx.particleMaterial` / `TU.fx.makePoints` for glow, and use `TU.cave.collide(pos, r, { hint })` to stay off the rock. They read `TU.player.state` (pos, speed) and `TU.camera`.

---

## 12. FX and audio (owner C)

`TU.fx`: `spawnSilt(n, { pos, back?, vel?, burst?, floorY? })`, `spawnBubbles(n, { pos, right? })`, `siltDensity()` 0..1, `shake(amount)`, `particleMaterial({ map, color, base, additive, opacity, glow })`, `makePoints(count, material)` (attributes position, aSize, aAlpha, aCol), `clear()`, `render()`, `screenshotMode(on)`.

`TU.audio`: `unlock()` (call inside a click), `setMuted(bool)`, `play(name, params)` with names `inhale, exhale, thump, kick, beep, heart, drip, chime`, `suspend()`, `resume()`, `ready`, `muted`.

---

## 13. DOM ownership and CSS

| Owner | Ids | Classes | z-index |
|---|---|---|---|
| fx | `#fx-canvas`, `#fx-mask, #fx-scan, #fx-narc, #fx-panic, #fx-silt, #fx-black, #fx-hit` | `.fx-` | canvas 0, overlays 1 |
| ui | `#ui-*` (`#ui-hud, #ui-title, #ui-loadout, #ui-pause, #ui-results, #ui-dead, #ui-hint`, readouts) | `.ui-` | HUD 2, screens 5, hint 6 |
| player | `#pl-touch` and children `#pl-*` | `.pl-` | 3 |
| creatures | `#cr-*` if ever needed | `.cr-` | |
| cave | `#cv-*` if ever needed | `.cv-` | |
| lead | `#boot-err` | | 20 |

Shared CSS variables (index.html `:root`): `--bg, --hud, --hud-dim, --hud-faint, --warn, --bad, --ink, --ink-dim, --card, --line, --mono, --display, --sans, --gx, --gr, --gt, --gb` (safe-area gutters, at least 16 px). Use them; do not redefine them. Layout must work at 390 px wide with no horizontal scroll.

---

## 14. Debug hooks (window.__debug, main.js)

`getStats()` / `state()`, `setState(s)`, `start(opts)`, `win()`, `teleport(nameOrMeters, {dy, yaw, pitch, low})`, `look(yaw, pitch)`, `lookAt(pos)`, `lookAtCore()`, `set(key, value)` (player state; `'air'` sets the active tank), `setAir(bar, allTanks = true)`, `get(key)` (`'t'` = run time), `silt(n)`, `step(n)` (n fixed steps), `sim(seconds, ['KeyW', ...])` (hold keys and step), `render()`, `screenshotMode(on)`, `gen(seed, opts)`, `TU`.

## 15. Testing

`python3 tests/run_test.py` must pass (exit 0, zero console errors) before any hand-off. It runs static artifact checks, a full scripted dive with screenshots in `tests/screens/`, the stalactite orientation check, and a boot with `creatures.js` and `audio.js` removed (`/?drop=creatures,audio`) to prove the stubs hold. If you add a feature, add a step and a screenshot to the test.
