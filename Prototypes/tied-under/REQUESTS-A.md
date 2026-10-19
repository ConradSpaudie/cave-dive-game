> **Resolved in the Oct 19 integration.** See CONTRACT.md section 16 for how each item was handled.

# Requests from agent A (cave) to the lead

The generated cave is live (js/cave-sdf.js, js/cave-mat.js, js/cave-dress.js, js/cave.js). Everything below already works with local fallbacks; these are contract and config updates for the lead to make official.

## 1. New event (please add to CONTRACT.md section 5)

| Event | Payload | Emitter | Listeners now |
|---|---|---|---|
| `cave:collapse` | `{pieceId, branchId, pathId: 'branch'\|'loop'\|'main', pos: Vector3, cause: 'quake'\|'debug'}` | cave | none yet (ui could show "Something collapsed behind you", the watch map could grey the branch out) |

`quake` is now emitted by cave from `TU.cave.quake(intensity)` and by the `collapse_ahead` run modifier (payload as in the contract: `{strength, duration, pos}`).

## 2. New TU.cave API (please add to CONTRACT.md section 7.2)

| Function | Returns |
|---|---|
| `mapData()` | `{ segments: [{a:[x,y,z], b:[x,y,z], r, kind, path, collapsed}], chambers: [{min, max, center, kind, dry, name}], airPockets: [{pos, surfaceY}], dry: [{pos, waterY}], bottom: [x,y,z], entrance: [x,y,z], bounds: {min, max}, mainLength }` for the wrist hologram |
| `quake(intensity 0..2, { pos?, collapse? })` | drops rocks from the ceiling near `pos` (default: the diver; they fall, bounce, settle and block you), and with intensity >= 1 collapses one side branch (never the main line, never the one you are in). Returns `{ rocks, collapsed: pieceId or null }` |
| `takeFind(id)` | marks a fossil or treasure as taken and hides it (also happens automatically on `treasure:found` with that `id`) |
| `collapse(pieceId)` | debug: block one piece with rubble |
| `spotNames()` | named spots that exist in this cave |
| `stats()` | build stats (ms, triangles, cells, stalactites, ...) |

`nearestPoint` also returns `branchId` (generator branch id, -1 on the main line). `pathId` is `'main'`, `'branch'` (dead end) or `'loop'` (reconnects).
`normal` points from the point toward the nearest rock (same meaning as before: "from the center toward pos"; player.js grab uses it that way).

## 3. New data on TU.cave.features (section 7.3)

- `finds`: same array as `treasure`: `[{ id, kind: 'fossil'|'treasure', name, tier 1..5, value ($), pos, taken, pieceId, zone }]`.
- `airHints`: `[{ id (pocket or dry chamber id), pos (in the water, on the way in), target (the surface point), dist (m along the passage) }]` for agent C's glass hint markers.
- `dryChambers[i]` also has `waterY`, `pools: [Vector3]`, `ledge: { pos, height (3..6 m), top (y), dir } or null`.
- `airPockets[i]` also has `pieceId`. `currents[i]` has `pathId`, `pieces`. `landmarks` includes generator landmark rooms (names from `LANDMARK_NAMES`) and the Ancient Ring.
- `spots.names` lists the spots.

## 4. Area ids for generated caves (section 7.3)

`mouth, throat, galleries, sulfur, oldwater` (one per depth zone, big banner), `junction` (msg), `pocket`, `squeeze`, `silt`, `current`, `drop` (vertical runs of 3+ cells on the main line), `room` (msg), `drychamber`, `lm<pieceId>` (one per landmark, banner = its name), `chamber` (the bottom chamber, "Touch it."), `branch`, `loop` (msg), `branchEnd`. creatures.js spawn areas `chamber`, `drop` and `branchEnd` exist in every generated cave.

## 5. Spot names (section 7.2 `spot(name)`)

Old names still work: `entrance, mid, junction, pocket, pocketSurface, squeeze, silt, drop, deep, end, stalactites, branch, branchEnd`, or a number (m along the main line). New: `airpocket, current, drychamber, ledge, landmark, bottom, deadend, loop`. A cave without that feature returns null (for example `squeeze` in a small easy cave).

## 6. Notes for agent C (player)

- Dry chambers: the floor is about 0.38 m above `waterY`, pools sit where the passages come in. `env.surfaceY` is the chamber's water line everywhere in its box. The ledge (3 to 6 m) has a ramp on one side and a cliff on the other: good for ragdoll falls.
- The entrance pool is the real surface (`surfaceY = 0`); `collide` returns `blocked: 'exit'` when you try to climb out of it.
- `env.current` is a velocity in m/s along the passage (0.75 to 1.4 m/s, surges up to about 1.9x for a few seconds); main-line currents flow out of the cave, against the diver.

## 7. Possible cfg keys (currently local constants in cave-sdf.js / cave.js)

`cave.voxel` (0.4 m lattice), `cave.margin` (0.8 m rock between unrelated passages), `cave.cullDist` (75 m chunk culling), `cave.daylightRange` (46 m).

## 8. main.js boot error message (lead)

main.js catches every error thrown by any module's `init()` and shows "WebGL is not available in this browser". A plain bug in cave.js init (three r128 textures have no `userData`, so setting `tex.userData.own` threw) was reported to the owner as a WebGL problem. Please only show the WebGL message when creating the renderer fails, and otherwise show the real error (or "The cave failed to build" plus the message). cave-dress.js now guards those lines with `(tex.userData = tex.userData || {}).own = true`.

## 9. Status of issues raised by agents C and D (all fixed in cave*.js)

- Rubble render crash: every instanced mesh now has an instance color buffer.
- Memory per dive: the old cave is fully disposed on rebuild (geometries, instance buffers, own materials and own textures, lights, the field lattice). Measured: GPU geometry count returns to the same value when the same cave is rebuilt (seed 1: 137, then 146 after A to B to A), textures stay at 11 to 13.
- Build time: field lattice now 0.5 m (was 0.4), the wall mesh near the spawn is built first and the rest a few chunks per frame (nearest first, immediately when you get within 35 m). `TU.cave.finishBuild()` builds everything at once (tests, overview shots). Measured in the test browser on an idle machine: standard about 0.8 to 1.3 s total, hard about 1.1 to 1.4 s, easy about 0.3 to 0.6 s.
- Software renderers (SwiftShader, llvmpipe) get a lighter rock shader automatically (`TU.caveMat.setLow`); real GPUs keep the full one.
- Dry chambers: `features.dryChambers[i].pos` is now a standing point that is inside the open space, dry, with rock 0.9 m below. The floor next to each pool is low and even (water line + 0.3 m) so climbing out works. A dry room whose passages come in too high to fit a floor becomes an "air chamber" (open water with a big air dome, listed in `features.airPockets` with `chamber: true`).
- spot('entrance') looks at the main line 4 m ahead (the way down out of the pool); all path spots look toward the line 5 m ahead. 4 s of kicking from it reaches about 10 m along the line in every tested cave.
- mapData() now also has `paths: [{ id, kind: 'main'|'branch'|'loop', points: [[x,y,z]...], radius, length, collapsed }]` (agent D's preferred shape).
- airHints entries also have `to` (Vector3, the surface point) and `dir` (unit Vector3 toward it).
- Connectivity: a lattice flood fill over 180 caves (60 seeds x 3 difficulties) reaches the bottom chamber in all of them.
