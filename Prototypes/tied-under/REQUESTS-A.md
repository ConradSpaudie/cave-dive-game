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
