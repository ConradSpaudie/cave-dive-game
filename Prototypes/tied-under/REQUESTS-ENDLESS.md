> **Resolved in the Oct 19 integration.** See CONTRACT.md section 16 for how each item was handled.

# Requests from the endless and glow stick agent

Files I own this round: `js/cave*.js`, `js/generator.js` (footer only, unchanged), `js/main.js`, `js/glowsticks.js` (new). API details are in CONTRACT-ENDLESS-NOTES.md. Everything below codes against what exists now and keeps working if nobody acts on it.

## For the predators agent (js/creatures*.js)

1. **Zones 5 and up now exist.** In an endless segment (after KEEP DIVING), `TU.cave.zoneAt(pos).index` returns 5+ ("the Beyond"): 5 The Hollow, 6 The Root, then one new zone every 100 m (7 The Glass Dark, 8 The Bone Choir, 9 The Still Sea, 10 The Hollow II, and so on). `nearestPoint(pos).zone` and `randomSpot(...).zone` use the same numbers, and the pieces of a new segment have `P.zone` 5+ (so `randomSpot({ zone: 6 })` finds spots in The Root). In the first cave nothing changes (0..4). Until you add Beyond species, please clamp: `Math.min(zone, 4)` picks the deepest species set.
2. **New segments appear during a run.** Listen to `cave:segment` with `state: 'open'` (payload `{ index, zone, zoneName, topM, bottom }`) and spawn creatures in the new segment then (for example `TU.cave.randomSpot({ zone: e.zone }, rand)`). On `state: 'freed'` (`{ index }`) the oldest segment's rock is gone: creatures there should be removed (their positions are now inside solid rock). `randomSpot` never returns spots in a segment that is still being built or was freed.
3. Area ids in new segments: `seg<k>` (the shaft and the start room), `chamber<k>` (the new ring chamber), `bz<zone>` (passages), plus the usual `pocket`, `squeeze`, `silt`, `current`, `drop`, `room`, `drychamber`, `branch`, `branchEnd`, `loop`, `lm<id>`. The first cave keeps `chamber` for its ring chamber.

## For the weapons agent (js/core.js, js/ui-hud.js, js/ui-camp.js, CONTRACT.md)

4. **Depth pay for the Beyond (ui-camp.js `settle`).** Each run summary now has `maxZone` (0..4, or 5+ in the Beyond), `maxZoneName`, `segment` (how many rings deep the leg ended), `beyond` (bool), `sealedAbove`, `endlessNote`. Please pay depth by `s.maxZone` when present instead of `U.zoneOfDepth(s.maxDepthM)` (which stops at 4), and extend the table, for example `DEPTH_BONUS[z] = 1200 + 600 * (z - 4)` for z >= 5, with names from `TU.cave.zoneName(z)`. A KEEP DIVING leg already pays "Reached the bottom" for every new ring (reason `'bottom'`), so with this the Beyond pays for depth too. `log.startZone` (set in ui.js on `run:continue`) should become `TU.cave.zoneAt(TU.player.state.pos).index` so "Deeper than the bottom" works past zone 4.
5. **Fin Tokens for new zones:** `progress.zonesReached` has 5 slots. Either keep it (Beyond zones count as zone 4) or grow it; `TU.progress.recordRun` writes `zonesReached[zoneOfDepth(maxDepthM)]`, which stays in range.
6. **HUD zone name (ui-hud.js):** it shows `U.ZONE_NAMES[U.zoneOfDepth(depth)]`, so the Beyond reads "THE OLD WATER". Please use `TU.cave.zoneAt(TU.player.state.pos).name` (or `TU.cave.zoneName(index)`).
7. **CONTRACT.md:** please merge CONTRACT-ENDLESS-NOTES.md (new `TU.cave` functions, `features.bottom.segment`, the `cave:segment` and `glowstick:throw` events, the `cave:collapse` cause `'endless'`, the new summary fields, `TU.glowsticks`, key 3, the glow stick light pool).
8. **Lights:** glow sticks add a pool of 3 point lights to `TU.scene`, created on the first throw (one shader compile then, never again). test_flow.py's light check (`n <= 11`) does not throw sticks so it still passes; if you add a throw there, allow 14. The endless rings share one core light (the light follows the nearest ring), so endless mode adds no lights.
9. **Hands (player-hands.js):** if you want a throw animation, `glowstick:throw` `{ pos, dir, color, left }` fires on every throw.

## For the owner of player.js

10. **Panic near glow sticks.** `TU.glowsticks.calmAt(pos)` returns 0..1 (how much a lit stick calms you there). The darkness check in the panic step (`nearGlow` / `run.glowNear`) should treat `TU.glowsticks.near(P.pos, 6) > 0` as light. Until then glowsticks.js lowers `TU.player.state.panic` a little by itself (only ever down, about 0.8 per second, 4 per second with your own light off). If you add `TU.player.calm(amount 0..1, dark bool)`, glowsticks.js calls that instead and stops touching the state.
11. **Depth effects past 250 m:** air use is `1 + depth / 100` times the base, so at 450 m (the second Beyond zone) a tank lasts a sixth of what it does at the surface. Air pockets in new segments follow the generator's max-gap rule (and every opened ring chamber gets an air dome), but you may want to cap the depth factor (for example at 300 m) so endless mode stays playable.
12. `P.zone` uses `U.zoneOfDepth`, so it stops at 4. `TU.cave.zoneAt(P.pos).index` gives the Beyond zone.

## For the owner of ui.js and ui-wrist.js

13. **Results slate:** when `summary.endlessNote` is set (two or more rings deep), please print it (it explains that the shafts above collapsed: "Every shaft above the last ring collapsed behind you. Marv had to send the long rope."). `summary.maxZoneName` is a nice line too ("Deepest zone: The Root"). The results screen for a Beyond ring uses reason `'bottom'` and `summary.endless: false` (`summary.endlessRun: true`), because `endKind()` in ui.js turns any won summary with `endless: true` into the "past the bottom" slate without the choice. So the END RUN / KEEP DIVING choice appears at every ring. If you prefer, switch `endKind()` to look at the reason and drop that trick.
14. **Hologram:** `mapData()` already includes every live segment (the wrist rebuilds the map when it opens, so new segments show). New fields you can draw: `rings` (`[{ pos, segment }]`), `zones` (`[{ index, name, topM }]` for depth rings past 200 m: `ui-wrist.js` labels rings with `U.zoneOfDepth`), `glowSticks` (`[{ pos, color, light }]`, small markers), `segment`, `chambers[i].seg`, `entranceReachable` (false once the first cave is freed). The map should be rebuilt on `cave:segment` (`state: 'open'` or `'freed'`) if the wrist is up at that moment.
