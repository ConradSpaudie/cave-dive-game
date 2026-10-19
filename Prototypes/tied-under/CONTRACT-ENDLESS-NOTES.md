> **Merged into CONTRACT.md (Appendix C) on Oct 19.** This file is kept for history only; CONTRACT.md is the source of truth and is kept up to date.

# Contract notes: endless depth and glow sticks

Additions to CONTRACT.md from this round (owner: the endless and glow stick agent, files `js/cave*.js`, `js/main.js`, `js/glowsticks.js`). Nothing existing was removed or renamed.

## 1. Endless depth (KEEP DIVING opens new cave)

Flow: touch the Ancient Ring -> results -> KEEP DIVING -> `TU.game.keepDiving()` -> `TU.cave.endless.descend(run.endSeg + 1)`:

1. The ring wakes up (brighter, faster), the chamber rumbles (`quake` event, no falling rocks on you), messages.
2. A new cave **segment** is generated from a derived seed, `(run seed + k) >>> 0` for segment k (retries add `7919` per attempt, at most 8, deterministic). It is placed under the ring chamber and joined by a vertical shaft through the chamber floor. The seed is retried if the shaft plus the swim to the new segment's first air source breaks the generator's `maxGap` rule, or if there is no room.
3. A job builds it about 6 ms per frame (`TU.cave.endless.config.budgetMs`): sample the rock, mesh the walls near the hole, dress it (formations, a new Ancient Ring, finds, water). The old floor stays solid until it is done and at least 3.6 s of dive time have passed.
4. The floor breaks open: the hole is cut, boulders, stalagmites and standing stones over it fall in, rocks and silt fall down the shaft, a big shake, and the ring chamber's dome fills with air (`features.airPockets` entry with `dome: true`). `features.bottom` is now the new ring with `segment: k`.
5. The new ring ends the leg like the first one (reason `'bottom'`, results with END RUN / KEEP DIVING). Calling the dive from the pause menu stays reason `'endless'` (a good ending).
6. Memory: when segment k is made, segment k - 2 is **freed** (its cells, meshes, dressing and colliders) and the top of the shaft into segment k - 1 collapses (`cave:collapse` with cause `'endless'`). You can swim back up through the previous segment, not further. The rope (player.js) still runs to the entrance stake.

Segment 0 is the first cave. A new dive (or restart) always rebuilds a fresh single cave.

### Zones past the first five (the Beyond)

| Index | Name | Depth |
|---|---|---|
| 0..4 | the classic zones | unchanged, the first cave only |
| 5 | The Hollow | from the top of segment 1 down to 350 m |
| 6 | The Root | 350 to 450 m |
| 7, 8, 9 | The Glass Dark, The Bone Choir, The Still Sea | 100 m each |
| 10+ | The Hollow II, The Root II, ... (cycling) | 100 m each |

In endless segments `zoneAt`, `nearestPoint().zone`, `randomSpot().zone` and the pieces' `P.zone` use these. Each Beyond zone has its own rock palette (vertex colors), a shader look (pale hollows, red root veins, black glass, bone flecks, a green tint) and faint glowing specks in a zone color. Area banners: `seg<k>` "THE WAY DOWN", `bz<zone>` (the zone name), `chamber<k>` "ANOTHER RING".

### TU.cave additions

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

### Events

| Event | Payload | Emitter |
|---|---|---|
| `cave:segment` | `{ index, state: 'building' \| 'open' \| 'freed', seed?, zone?, zoneName?, topM?, bottom?, freed? }` | cave |
| `cave:collapse` | cause can now be `'endless'` (the shaft behind you) | cave |
| `run:continue` | adds `segment` (the new goal segment) | main |

### Run and summary (main.js)

`TU.run.endSeg` (0 = the first ring is the goal, k = segment k's ring), `TU.run.maxZone`. Summary adds `maxZone, maxZoneName, segment, beyond, sealedAbove, endlessNote, endlessRun`. `summary.endless` is now false for a leg that ends at a new ring (reason `'bottom'`), so the results screen shows the END RUN / KEEP DIVING choice again; `endlessRun` is true for every leg after the first. `__debug.getStats()` adds `endSeg, maxZone, zoneAt, building`. The win check: `features.bottom.segment === run.endSeg` (in endless mode only once a new segment is open).

### Internals (cave-sdf.js, cave-dress.js)

- Cell keys keep the old packing for depth layers 0..239 and add a high part for deeper ones (`TU.caveGeo.key`, `decode`). Each piece keeps its segment's hash seed (`P.seedV`, `P.seg`).
- `TU.caveGeo.extend(G, layout, opts)` merges a translated layout plus the connector shaft into the live geometry; `touchedCells`, `swapBlocks`, `freeCells`; `sampleCell(G, x, y, d, targetMap?)`.
- `TU.caveDress.start(W, G, ctx)` returns a job (`step(ms)`), `build()` runs it at once. Per-segment groups (`cave-seg<k>`), one shared core light, one shared rubble mesh.

## 2. Glow sticks (js/glowsticks.js, TU.glowsticks)

- **Key 3** (state `'dive'`, not while typing): crack and throw one in the look direction. Registered in `TU.player.bindings` as `{ action: 'glowStick', keys: ['Digit3'] }` right after Flex Tape.
- Uses `TU.player.inventory.glowSticks` (from the loadout; the camp already removes used ones from stock). None left: `ui:msg` "No glow sticks left. Buy more at the Sump Camp."
- Physics: sinks about 0.35 m/s in water, falls in air, bounces off rock (`TU.cave.collide`), comes to rest on floors.
- Light: green, cyan, orange in turn. Emissive tube and a halo; the 3 newest sticks get one of 3 pooled point lights (made on the first throw, never removed, intensity 0 when free). About 4 minutes (bright, then a 40 s fade). At most 24 in the world.
- Calms panic within 6 m (see REQUESTS-ENDLESS.md item 10).
- Sound: its own tiny WebAudio snap (respects `TU.audio.muted` and `volume`), muffled under water.

| Function | Returns |
|---|---|
| `throwStick({ free?, dir?, pos?, speed? })` | the stick or null (none left) |
| `list()` | `[{ id, pos, color, brightness 0..1, age s, rest, lit }]` |
| `count()`, `near(pos, r)`, `calmAt(pos)` | numbers |
| `clear()`, `lights()`, `age(sec)` (debug: skip time), `cfg` | |

Event `glowstick:throw` `{ pos, dir, color, left }`.

## 3. Tests

`python3 tests/test_endless.py`: keep diving twice, the build without long steps, zones, the hole and dome, mapData, bounded memory, the collapse behind you, glow sticks (throw, land, light pool, calm, fade, inventory, none left), zero console errors. Screenshots `tests/screens/END_*.png`, `GLOW_*.png`.
