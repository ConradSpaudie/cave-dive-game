> **Resolved in the Oct 19 integration.** See CONTRACT.md section 16 for how each item was handled.

# Requests from agent D (UI and meta game)

Everything below already has a local fallback in the ui files, so nothing breaks if it never lands.

## Lead (core.js, main.js, CONTRACT.md)
1. **Save defaults** (core.js `saveDefaults`): add
   - `ui: {}` (agent D fills it: story, HUD layout, locker, stock, haul, trophies, contracts, camp). Fallback: `TU.uiKit.data()` fills missing keys at boot.
   - `loadout.mask: 'standard'` ('standard' | 'tight' | 'wide' | 'headlamp') and `loadout.flippers: { preset: 'paddle', shape: 0.5, width: 0.5 }`. Fallback: the camp writes them when you pick.
2. **Keep diving** (main.js): `TU.game.keepDiving()` that resumes the current run in endless mode after the bottom (state back to `'dive'`, `run.ended = false`, `run.endless = true`, no second win trigger). Fallback: the KEEP DIVING button starts a new `hard` dive on a derived seed with `modifiers: ['endless']`.
3. **More death reasons** (main.js): end the run on `player:bledOut` (reason `'bled'`) and `player:crushed` (reason `'crushed'`) like `player:drown`. The death screen already maps `bled|bleed|blood|injur|cut` and `crush|collapse|quake|rock` reasons.
4. **Tutorial flag** (main.js): copy `opts.tutorial` into `TU.run.tutorial`. Please do NOT switch to state `'tutorial'` until player.js accepts input in that state (player keydown checks `TU.state.is('dive')`). The tutorial currently runs in `'dive'`.
5. **CONTRACT.md**: document the extra UI API and keys:
   - `TU.ui.openCamp(station)`, `TU.ui.openSettings(tab)`, `TU.ui.openStory()`, `TU.ui.setWrist(bool)`, `TU.ui.wristRaised()`.
   - `TU.uiKit` is agent D's internal toolbox shared between `js/ui*.js` (not for other modules).
   - UI keys: `Tab` wrist (hold or tap), `J` dive slate, `N` / `[` / `]` waypoint rename and pick (only while the wrist is up), digits `1`..`8` camp stations. While the wrist is up the UI captures arrow keys and mouse drag (capture phase) so they spin the hologram instead of the view.
   - The camp (Sump Camp hub) is shown in state `'loadout'`.
6. **Performance** (fx.js / main.js): in state `'loadout'` the camp canvas covers the whole screen, so the 3D cave render behind it is wasted. `TU.ui.coversScreen()` could be added if fx wants to skip the render.

## Agent A (cave.js)
1. `TU.cave.mapData()` for the hologram. Any of these shapes works (positions in world meters):
   - `{ paths: [{ points: [[x,y,z], ...], radius: m, kind: 'main'|'branch' }] }` (preferred), or
   - `{ segments: [{ a: {x,y,z}, b: {x,y,z}, r: m, explored?: bool }] }`, or `{ nodes: [...], edges: [[i, j, r?]] }`.
   Fallback: the UI samples `TU.cave.spot(meters)` along the main path plus `spot('branch')` to `spot('branchEnd')`.
2. Keep `env.temperature` and `env.s` in `nearestPoint` (the watch and HUD show them).

## Agent B (creatures.js)
1. Species ids as snake_case of the vault names (`blind_cavefish`, `goblins_gold`, `lamplighter`), so the logbook's 50-entry fallback catalog lines up with your database. Your fields override mine.
2. Mark shinies in the logbook entry (`entry.shiny = true` or `entry.shinies > 0`) for the gold badge.
3. `treasure:found` payload `{ id, kind: 'fossil'|'treasure', name, value ($), tier 1..5, shiny? }`. The UI puts finds in the haul bag (sold at camp) and pays 25% if you die.

## Agent C (player.js, fx.js, audio.js)
1. `TU.player.setWristRaised(bool)`: show the arm raised and (ideally) stop mouse look while it is up. The UI already blocks look while the mouse button is held over the hologram.
2. `TU.player.renameWaypoint(index, name)`: rebuild that waypoint's in-world label texture. Fallback: the new name shows on the HUD, slate and hologram only.
3. `TU.player.bindings`: a list like `[{ action, label, keys: ['KeyW', ...] }]` for the controls screen. Fallback list in ui.js.
4. `TU.audio.setVolume(0..1)`. Fallback: volume 0 mutes.
5. Read `TU.util.reducedMotion` live (the setting writes it), instead of caching it at load.
6. `P.maskFlood` as a number 0..1 (water level in the mask). Fallback: `P.maskFlooded` shows a fixed level.
7. Decrement `TU.player.inventory.tape / flexTape / glowSticks` when used, so the camp removes used consumables from stock.
8. Please do not bind `Tab`, `J`, `N`, `[`, `]` (UI keys).
