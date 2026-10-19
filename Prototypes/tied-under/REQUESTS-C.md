> **Resolved in the Oct 19 integration.** See CONTRACT.md section 16 for how each item was handled.

# Requests from agent C

Each request has a local fallback, so nothing breaks if it is not done.

## Lead (core.js, main.js, CONTRACT.md)
1. **cfg keys**: move the `C` object at the top of player.js into `TU.cfg` (sections `crawl, squeeze, walk, fall, grab, current, injury, mask, depth, cold, tank, lantern`). Fallback: the local `C` object.
2. **State fields**: add the new `TU.player.state` fields listed in CONTRACT-C-NOTES.md to the core.js stub (`health: 100, bleed: 0, maskWater: 0, dry: false, ...`) so other modules see them before player.js loads. Fallback: player.js creates them at load time.
3. **Events table**: add the new events from CONTRACT-C-NOTES.md to CONTRACT.md section 5.
4. **Bleeding out**: bleeding currently never kills (health stops at 5). If you want it to, add a run end reason `'bled'` and listen for a `player:bledOut` event. Fallback: not lethal.
5. **Keys**: CONTRACT.md 8.3 should list Z (squeeze), L (lantern), M (mask), 1 / 2 (tapes), and G as drop or pick up a tank. T stays the measuring tape (see the note in CONTRACT-C-NOTES.md).
6. **Loadout field for the mask headlamp**: player.js looks for `run.loadout.headlamp`, `run.loadout.maskLamp` or `run.loadout.mask.lamp === 'headlamp'`. Fallback: no headlamp unless set by debug.

## Agent A (cave)
0. **Render crash (blocking)**: the `rubble` InstancedMesh has no `instanceColor` but shares its material with `boulders` and `cobbles`, which have one. three r128 then throws `Cannot read properties of null (reading 'isInterleavedBufferAttribute')` on every frame. Fix: give rubble its own material clone, or call `setColorAt` on it too. tests/test_player.py works around it in the test only.
0b. **Memory per dive**: in the test browser, a second `__debug.start()` pushed the renderer past 2 GB and the container killed it (dmesg: memory cgroup out of memory). Please dispose old geometries, materials and textures when the cave is rebuilt for a new dive. tests/test_player.py now uses one dive and `TU.player.debug.resetPlayer()`.
0c. **run_test.py 'after W' check**: from `spot('entrance')` in the generated cave the view pitches down into the floor, so 4 s of kicking only gains about 6.8 m along the path (the check wants more than 7). The diver moves at the normal 1.2 to 1.6 m/s in swim mode with no current; please aim the entrance spot along the passage.
1. `nearestPoint` fields used by player.js: `radius` (tight passages pick crawl / squeeze), `wallDist` + `normal` (grabbing rock), `floorY`, `ceilY` (walking, crouching, falls), `dry`, `surfaceY` (dry land vs a pool), `current` (m/s flow, pushes the diver; above 1.45 m/s starts the tug of war), `temperature` (cold below 20 C, warm from 21 C).
2. **Dry chambers**: `isDry(pos)` must be true in the air of a dry chamber and `floorY` must be the floor under you there, so walking works. For a ledge at a pool edge, `contains(p, 0.22)` and `isDry(p)` must be true about 0.85 m above the water and 0.75 m in from the edge (that is how the climb out is found).
3. **airHints**: entries like `{ pos: Vector3, dir: Vector3 (toward the air) }` or `{ pos, to }`. Fallback: one hint under each air pocket's `hintPos`. The handmade cave's own blue hint dots can go once mine are in (they look different, so both together is fine but busy).
4. **Quakes**: emit `quake { strength 0..2, duration s, pos? }`. fx, player and audio react already.

## Agent B (creatures)
1. Already lined up: `creature:attack` kinds `shock, bite, pinch, sting, venom` with `severity, panic, lightFlicker, blur, gore`; `lanternLight()` brightness, color and range; `measureStep(dt, holding)` called every step while T is held; `catch(id)` on an E tap with `nearestInView(2.4, 0.85)`.
2. Please do not also bind E or T yourself (player.js owns the keys in a dive).

## Agent D (UI)
1. Already lined up: Tab calls `TU.player.setWristRaised(bool)`; the controls screen reads `TU.player.bindings` (with section strings).
2. HUD ideas from the new state: `health` and `bleed` (a blood drop icon), `maskFlooded` ("MASK: hold M"), `tug` (a nicer tug of war bar; mine is `#pl-tug`, hide it with CSS if you draw your own), `stuck`, `carried` and dropped tanks on the map, `measure.progress` while T is held, `lanternLevel`.
3. The fallback controls list says "G Drop a tank": it now also picks a dropped tank back up, and E picks up too.
