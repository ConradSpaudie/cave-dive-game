> **Merged into CONTRACT.md (Appendix A) on Oct 19.** This file is kept for history only; CONTRACT.md is the source of truth and is kept up to date.

# Agent C notes: player, hands, fx, audio

What agent C added on top of CONTRACT.md. Files: `js/player.js`, `js/player-hands.js` (new, loaded right after player.js), `js/fx.js`, `js/audio.js`, `tests/test_player.py`.

## Keybindings

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

## Movement modes (`P.mode`)

Picked automatically from the cave (`TU.cave.nearestPoint`):
- `swim`: open water, the tuned kick and glide.
- `crawl`: underwater when the passage is tight (`env.radius < 1.3 m`) and you are near the floor: hands pull you along, slower rhythm, little silt. On dry land: a crouch under a low ceiling (or C held).
- `squeeze`: `env.pieceType === 'squeeze'`, or `env.radius < 0.82 m`, or Z held where `radius < 1.4 m`. Very slow, both hands pushing, you get stuck (`P.stuck` 0..1) and wiggle free with A / D.
- `walk`: dry land (`env.dry` and either no water surface here, the floor is above the water, or you are well above it). Gravity, walking, jumping, footsteps. Swim forward at a ledge while surfaced to climb out (`player:climb`). Walking into deep water drops you back in (`player:splash`).
- `ragdoll`: falling fast on dry land (`vel.y < -7.5 m/s`) or landing from more than 2.2 m. Camera tumbles, hits, slumps, gets up after about 3 s. Damage scales with height: 4.5 m sprain, 7.5 m break, 11 m maim (one side weaker for the run). Landing in water is safe up to 14 m.

## New state on `TU.player.state` (read only)

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

Depth: stamina max drops up to 35% from 20 m to 200 m, air use already grows with depth, you can hold your breath 40% less long at 200 m. Cold (`env.temperature` below 20 C) drains stamina and shakes your hands and light; warm areas (21 C or more, or near an air pocket / dry chamber marked `warm`) give stamina back. Panic above 60 drains stamina.

## Events emitted (new)

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

## Events listened to

- `creature:attack` (agent B): `kind` `shock` (light stutters for `lightFlicker` s, panic, stamina, may flood the mask), `bite` / `pinch` (a cut; `gore` puts blood all over the mask), `sting` / `venom` (panic, health, `blur` s of blurred vision). Also accepts `creature:shock`, `creature:bite`, `creature:pinch`.
- `creature:caught`: remembers the species in `inventory.lantern.creatures` (fallback brightness when `lanternLight` is missing).
- `quake` (agent A): shake, panic, debris rain, silt clouds, rumble, and a small chance of a cut from a falling rock above strength 1.2.
- `ui:wrist` / `ui:watch` `{ open }` (or `TU.player.setWristRaised(bool)`).

## API additions

`TU.player`: `setWristRaised(b)`, `toggleLantern(force?)`, `dropTank()`, `pickUpTank(quiet?)`, `applyTape('duct'|'flex')`, `addInjury(type, severity, source)`, `tugAssist(amount)` (co-op hook for later: a teammate on the rope adds to your tug of war), `bindings`, `debug`.

`TU.player.debug` (tests and filming): `resetPlayer()` (reset only the diver, not the cave), `setMode('swim'|'crawl'|'squeeze'|'walk'|'crawlDry'|null)`, `forceCut(sev)`, `forceInjury(type, sev)`, `forceCurrent(Vector3 or m/s, seconds)`, `clearCurrent()`, `forceFall(heightM)`, `forceMaskFlood(level)`, `forceQuake(strength, seconds)`, `forceShock(strength)`, `forceBite(sev)`, `setWristRaised(b)`, `setHeadlamp(b or null)`, `setPanic(v)`, `setBattery(v)`, `giveLantern(brightness)`, `giveTape(duct, flex)`, `press(code)`, `grabWall()`, `releaseWall()`, `tug(v)`, `state()`, `cfg`.

`TU.fx`: `spawnBlood(n, { pos, burst })`, `spawnDebris(n, { pos, radius })`, `handScene`, `handCamera`, `lensActive()`, `hintCount()`, `hintInfo()`. `particleMaterial` takes `rotate: true` (sprites spin slowly).

`TU.audio`: `sounds()` lists recipe names: `inhale, exhale, purge, thump, fall, kick, pull, footstep, splash, cut, tape, pat, flood, shock, bite, creak, quake, metalClank, grab, whoosh, glass, beep, heart, drip, chime`.

## Air hints

fx.js draws the glassy hints in its lens pass (real refraction of the picture behind them, a fresnel rim and a highlight). Sources: `TU.cave.features.airHints` entries `{ pos, dir? | to? | target? }` (any of `pos`/`position`, `dir`, `to`/`target`/`air`), or, if there are none, one under each `airPockets[i].hintPos`. They show only between about 8 m and 30 m from the hint, when not hidden behind rock, never when you are surfaced or on dry land. Three beads drift along `dir` with a chevron at the front.

## Tunables

All new numbers are in the `C` object at the top of player.js (`// TODO cfg`), readable as `TU.player.debug.cfg`.
