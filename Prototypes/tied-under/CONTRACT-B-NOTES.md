# Contract notes from agent B (creatures)

Additions to CONTRACT.md section 11. Everything in the original contract still works the same way.

## Files
`index.html` loads, in this order: `creatures-lib.js` (geometry kit and the animated creature material), `creatures-models.js` (procedural models for every species), `creatures.js` (species, census, behavior, drawing, API), `creatures-finds.js` (fossil and treasure finds). Only `creatures.js` is dropped in the stub test; the other three load harmlessly without it.

Internal helpers live on `TU._cr` (not for other modules).

## Species entry (extra fields)
`kind: 'fauna'|'flora'`, `catchable: bool`, `dangerous: bool`, `glow: hex` (bioluminescent color), `move`, `place`, `scaleK`.
Variant logbook lines use ids like `'olm:shiny'`, `'olm:juvenile'`, `'olm:giant'`. They are **not enumerable** (`Object.keys(TU.creatures.species)` lists only the 21 base species) but `TU.creatures.species['olm:shiny'].name` is `"Olm (golden)"` and has `variantOf`.

## Creature record (extra fields)
`sp` (species entry), `variant: null|'shiny'|'juvenile'|'giant'`, `shiny`, `active` (simulated and drawn now), `scale` (drawn size, m), `glow` (current glow multiplier), `photographed`, `normal` (rock normal for crawlers and plants).
`list()` returns the whole census (active and sleeping). `total()` = census size.

## Functions added to TU.creatures
| Function | Returns |
|---|---|
| `nearestInView(maxDist, minDot, opts?)` | `opts.catchable` only lantern catchables, `opts.kind` 'fauna' or 'flora'. Only active creatures. For a Lanternjaw the lure is the target. |
| `nearCount(pos, radius, opts?)` | `opts.glowing: true` counts only creatures giving light right now (use this for the darkness panic check). |
| `catch(id)` | as before; new reasons `'too_far'` (more than 3 m), `'no_lantern'`, `'full'`, `'bit'` (it was a Lanternjaw lure: it lunges and bites). Catching a Halo Jelly also emits a mild `'sting'` attack. Without a bought lantern, debug builds (`cfg.debug.enabled`) get a 2 slot jar. |
| `lanternLight()` | `{ brightness 0..10 (sum of species brightness, capped), intensity 0..1, range m, color THREE.Color (mix of caught glows), count, slots, items }`. Drive the lantern PointLight from this every frame. |
| `lanternRelease(id)` | puts a caught creature back in the water at the diver. |
| `measure(id)` | as before plus `variant`, `variantFirst`, `bounty ($)`. Size is a tape reading (true size plus about 1.5 percent error, rounded). |
| `measureStep(dt, holding)` | hold-to-measure helper. Call every step with `holding = T key down`. Returns `{ state: 'idle'|'aiming'|'measuring'|'done'|'lost', id, speciesId, progress 0..1, result (measure() result when done), reason: 'nothing'|'lost_sight'|'fled'|'no_tape' }`. Range 3 m, must be centered (dot 0.93), hold time 1.2 s and more for big or skittish animals. |
| `photo(id)` | photograph hook: logs with `photo: true`. Returns `{ id, speciesId, first, variant, bounty }` (+$50 the first photo of a dangerous species). |
| `earnings()` | `{ logbook $, finds $, total $ }` earned this run (bounty table from Design/Economy and Progression.md). |
| `speciesName(id)` | display name for a species or variant id. |
| `activeCount()` | creatures simulated right now. |
| `finds()` | `[{ id, kind: 'fossil'|'treasure', name, tier 1..5, value $, pos, taken, shiny }]` |
| `findNearest(maxDist = 2.5, minDot = 0.8)` | `{ id, kind, name, value, tier, dist, dot, pos }` or null |
| `pickup(id)` | `{ ok, reason?: 'gone'|'too_far', id, kind, name, value, tier }`. Emits `treasure:found` (and `fossil:found` for fossils). |
| `debugShowcase(id or 'all' or false, { variant, jaw 0..1, size 0..1 })` | shows one species large under neutral light far from the cave (camera layer 5 only), for tests and filming. |
| `debugShowcaseFind(name or 'all' or false)`, `debugFindModels()` | same for find models. |
| `debugAdvance(sec)` | advances the showcase animation, returns the phase. |
| `debugSpawnInFront(id, dist, { still, variant, sizeU, dy })` | a real creature in front of the diver. |
| `debugIds()` | base species ids. |
| `debugPlace(id, dist)` | moves a creature in front of the camera, side-on. |

## New events (emitter: creatures)
| Event | Payload |
|---|---|
| `creature:attack` | `{ id, speciesId, kind: 'pinch'|'bite'|'shock'|'venom'|'sting', severity 0..1, injury: 'cut'|'bite'|null, panic (points to add), lightFlicker (s the flashlight should flicker or drop), blur (s of blurred vision), gore: bool (show blood), radius (m, shock radius), pos, dir (from creature to diver) }` |
| `creature:warn` | `{ id, speciesId, kind: 'pinch'|'shock', pos }` once per approach (claws raised, eel crackling). Good for a sound. |
| `fossil:found` | same payload as `treasure:found`, only for fossils. |
| `treasure:found` | `{ id, kind, name, value $, tier, pos, kg, shiny }` (emitted by creatures-finds.js, not player). |
| `creature:seen` | now also carries `variant`. |
| `creature:caught` | now also carries `lantern` (the lanternLight() result). |

Who attacks: Entrance Crayfish pinch (hover within 1 m for more than 1.3 s), Remipede venom (hands within 0.5 m for 1 s), Volt Eel shock (warns inside 3.6 m, shocks inside 1.9 m), Lanternjaw bite (touch or try to catch the lure), Halo Jelly sting (when caught).

## Config
Tunables are in `TU.creatures.tuning` (local, marked TODO cfg) until the lead adds `TU.cfg.creatures`.
