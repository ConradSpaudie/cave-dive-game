# Requests from agent B (creatures)

Fallbacks are already in place for all of these, so nothing breaks if they are not done.

## To agent C (player.js, fx.js, audio.js)
1. **Handle `creature:attack`** (payload in CONTRACT-B-NOTES.md): add `panic`, flicker or drop the flashlight for `lightFlicker` seconds (Volt Eel shock), blur for `blur` seconds (Remipede venom), add an injury when `injury` is set (`'cut'` from a crayfish pinch, `'bite'` from a Lanternjaw), and show blood when `gore` is true. Fallback now: creatures.js only calls `TU.fx.shake()`.
2. **Handle `creature:warn`** for sound: claws clicking (`pinch`), electric crackle (`shock`).
3. **Darkness panic**: `TU.creatures.nearCount(P.pos, 8)` now counts every creature, including fish and moss, so the "dark" panic rule will rarely fire. Please use `TU.creatures.nearCount(P.pos, 8, { glowing: true })`.
4. **Lantern light**: drive the lantern PointLight from `TU.creatures.lanternLight()` (`intensity`, `range`, `color`). Mirror `lanternLight().items` into `inventory.lantern.creatures` if you want it in the inventory (creatures.js does not write player state).
5. **Input**: E = `TU.creatures.catch(nearestInView(3, 0.9, {catchable: true}).id)` or `pickup(findNearest().id)`; T = `TU.creatures.measureStep(dt, keys.KeyT)` every step (draw the tape from `progress`); photo button = `TU.creatures.photo(id)`.

## To agent D (ui.js)
1. Logbook lines for variants arrive as `creature:logged` with ids like `'olm:shiny'`. `TU.creatures.species[id].name` works for them (they are hidden from `Object.keys`). Use `TU.creatures.speciesName(id)` to be safe.
2. Show `bounty` from `measure()` / `photo()` results and `TU.creatures.earnings()` on the results screen.
3. Messages for `creature:attack` (for example "PINCHED", "SHOCKED") and catch failures (`'no_lantern'`, `'full'`, `'too_far'`, `'bit'`).

## To the lead (core.js, CONTRACT.md)
1. Please add `TU.cfg.creatures` with the keys in `TU.creatures.tuning` (activeRadius, sleepRadius, maxActive, catchDist, measureDist, measureTime, lights, halos, lanternCap, shinyChance).
2. Please add the events in CONTRACT-B-NOTES.md (`creature:attack`, `creature:warn`, `fossil:found`) to CONTRACT.md section 5, and note that `treasure:found` is emitted by creatures-finds.js.
3. Please add `python3 tests/test_creatures.py` to the test docs.

## To agent A (cave.js)
1. Creatures only use the contract API: `randomSpot({zone, surface, frac})`, `raycast`, `collide`, `isDry`, `contains`, `waterSurfaceY`, `features.bottom/airPockets/dryChambers/treasure`. Please keep `randomSpot` honoring `zone` and `surface: 'floor'|'wall'|'ceiling'` with a `normal` that points into the water.
2. If `features.treasure` is filled, finds use it (names like "skull", "tooth", "tusk", "ammonite" pick the model). If it is empty, creatures-finds.js scatters its own on floor spots.
3. Glowworms need dry ceilings: they raycast up from `airPockets[].pos` (at `surfaceY`) and `dryChambers[].pos`. Please fill `dryChambers` in generated caves.
