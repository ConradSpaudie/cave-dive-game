> **Merged into CONTRACT.md (Appendix B) on Oct 19.** This file is kept for history only; CONTRACT.md is the source of truth and is kept up to date.

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

---

# Combat and predators (added Oct 19)

## Files
`index.html` now loads `creatures-lib.js`, `creatures-models.js`, **`creatures-pred-models.js`** (the six predator models), `creatures.js` (hit points, damage, death, gore, clouds), **`creatures-predators.js`** (predator species, brains, spawning, grabs, ink, tell sounds), `creatures-finds.js`. With `creatures.js` dropped, both new files do nothing.

## Damage contract (the weapons call these)
| Function | Returns |
|---|---|
| `raycastHit(origin, dir (unit), maxDist)` | `null` or `{ id, species, speciesId, point: Vector3, dist }`. Tests a capsule per creature sized to its model (schools are separate records; a Sea Firefly swarm is one sphere). Flora is skipped. Dead bodies can be hit. Compare `dist` with `TU.cave.raycast` yourself. |
| `damage(id, amount, { dir, point, weapon, kind: 'pierce'\|'blunt'\|'push'\|'shock'\|'cut' })` | `{ hp, maxHp, killed }`, plus `immune: true` for flora, `dead: true` if it was already dead, `gone: true` if it no longer exists. One basic spear hit is about **10**. Kind multipliers: pierce 1, cut 1, blunt 0.6, shock 1.2 (Volt Eel immune, it gets angry), push 0. Hits in the front third of the body (the head) x1.4. Species `armor` multiplies further (The Maw: pierce 0.85, cut 0.7, blunt 0.4). Every hit also shoves the body. |
| `impulse(id, vec)` | `true`. `vec` is the push in m/s given to a 1 m animal; it is divided by `clamp(size^2, 0.15, 40)`, so small fish fly and The Maw barely moves. |
| `stunArea(pos, radius, seconds)` | number stunned. Less time at the edge; species `stunK` scales it (The Maw 0.3). Stunned animals drift and twitch; a stunned grabber lets go. |
| `inRadius(pos, radius, { hostile })` | `[{ id, species, speciesId, pos, dist }]` nearest first, living fauna only. `hostile: true` = dangerous species and predators. |
| `inkAt(pos)` | 0 = clear water, 1 or more = you cannot see (squid ink). |
| `grabbedBy()` | `null` or `{ id, species, speciesId, strength 0..1, kind: 'drag'\|'hold'\|'shake', anchor: Vector3, t }` |
| `struggle(amount = 0.08)` | one alternating tap of the struggle mini game; `false` when nothing holds you. creatures-predators.js already reads A / D taps from `TU.player.input.keys` (read only) as a fallback. |
| `releaseGrab()`, `predatorIds()`, `predatorTuning` | |
| debug: `debugSpawnPredator(id, dist, { st, still, sizeU, facing, n, ext })`, `debugPose(id, { st, tell, act, roll, glow, ext, free })`, `predatorInfo(id)`, `debugGrab(id, kind)`, `debugInk(id)`, `debugKill(id, by)`, `debugDirector()`, `debugShowcase(id, { tell: 0..1, jaw: 0..1, dead: true })` | tests and filming |

Hit points: flora 0 (cannot be hurt). Small animals have `size m x 30` hp (1 to 40), so fish, shrimp, olms and crayfish die in one hit; jellies and swarms 2. Volt Eel 30, Lanternjaw 25, Deep Lobefin 40, The Old Blind One 400. Predators: shark 55, barracuda 10, gulper 35, Lurker 70, squid 22, The Maw 260 (each +-10% with body size).

## Hurt and death
- Hurt: prey flees (the whole school too); the Volt Eel comes at you crackling; the crayfish snaps; the Lanternjaw lunges if close. Predators: the shark gets angry (no more bump, bites sooner) and flees below 35% hp; the barracuda pack scatters; the eel lets go and hides; the Lurker charges, then flees below 30%; a squid inks and jets away; The Maw backs off into the dark every quarter of its health it loses.
- Killed: 1.5 s of twitching, then limp (jaw slack). Fish float up belly first, sharks and eels sink and end on their side, crawlers flip on their back, a dead Gulper slumps half out of its hole, swarms spread and fade. Blood (`TU.fx.spawnBlood`; squid blood is blue, crustacean fluid milky, through creatures' own cloud particles), 2 to 10 gore chunks that drift down and rest on the floor, a short blood trickle. Glow fades. The body stays about 150 s (The Maw 600 s) and is removed when you are not looking. Giant Isopods crawl to fresh carcasses.
- A killed animal can still be measured or photographed: `measure()` returns `specimen: true` and the logbook entry gets `specimens` (count).

## Species fields (new)
`hp`, `danger` (0..5, also on existing species: crayfish 1, remipede 1, Volt Eel 3, Lanternjaw 3), `predator: true`, `blood: 'red'|'blue'|'pale'|'none'`, `buoy` (m/s after death, + floats), `armor`, `stunK`, `hit: { r, len, off, lift }` (hit capsule in model units), `eyeCol`, `crawler`, `lift`. Bounties are multiplied by `1 + 0.5 x danger` (a danger 4 shark pays x3).
Records gained `hp, maxHp, dead, deadT, stun, imp, roll, tell (0..1 warning glow), hurtT, enrage, gone`. `TU._cr.addSpecies(o)` registers species from other creature files (with variant lines).

## The predators
| Species | Zones | Size | HP | Danger | How it hunts | The tell (your warning) | Strike |
|---|---|---|---|---|---|---|---|
| Cenote Bull Shark (real, *Carcharhinus leucas*) | 0 to 1 | 1.8 to 3.2 m | 55 | 4 | patrols open water near (never within 15 m of) the entrance; sees you at 16 m, smells blood at 45 m, hears weapons; circles tighter | the hunch: pectorals drop, back arches, stiff exaggerated swimming, eyes flare, a low thrum, 0.9 to 1 s | first a `bump` (panic, shove), then a `bite` (severity 0.55, gore). Dodge sideways: the charge only homes a little |
| Pale Cave Barracuda (pack of 3 to 7) | 1 to 2 | 0.6 to 1.3 m | 10 | 2 | the pack circles at 6.5 m | one goes stiff with its nose on you, eyes flash silver, teeth chatter, 0.6 s | darts through at 8.5 m/s, `slash` (cut 0.22); pack scatters when hurt, gives up after losing half |
| Gulper Ambush Eel | 2 | 1.4 to 2.6 m | 35 | 3 | lives in a dark hole in the wall (drawn as a burrow), breathes with its mouth open, watches you | pulls back into the hole, mouth wide open, eyes flare, a wet "glorp", 0.75 s | lunge `bite` (0.35) then `grab` kind `drag`: pulls you to its hole for up to 6.5 s, gnawing; a final bite if you do not break free |
| Cave Lurker | 2 to 3 | 2.4 to 4.2 m | 70 | 4 | crawls floors and walls; creeps toward you only while you look away, freezes when you look | your light on it (or getting within 3 m): head up, jaws open, long hiss, eyes flare, 0.85 s | charges along the rock, pounces from 3 m, `bite` (0.6) and a 2 s `shake` grab (death roll) |
| Spider Squid (pack of 2 to 3) | 3 | 1.2 to 2.4 m | 22 | 3 | circle you on a ring, arms toward you, photophores pulsing | the strobe: fast flashing, the arm crown opens, clicks, 0.9 s | darts in, `grab` kind `hold` on your mask for up to 5 s; misses and hurts end in an `ink` cloud (blinds you, `blur` 2.5 s) |
| The Maw (rare mini boss) | 4 | 9 to 14 m | 260 | 5 | shadows you at about 20 m: you see its blue lure lines in the dark; armor plates, bone blade jaws | the lights go out (its lure lines and point light die), a deep rumble with mask shake, then the eyes flare, 2.2 s | a straight charge at 9 m/s, `bite` (0.8, gore, shoves you aside). Swim sideways |

Fairness: every strike follows a tell of at least 0.6 s (in the test: at least 0.4 s between `creature:tell` and `creature:attack`), two strikes from any predators are at least 1.2 s apart, only one grab at a time, no predator attacks in the tutorial, in dry chambers or at the surface, and none spawn within 15 m of the entrance or 18 m of the dive start.

Spawning (per run, deterministic): shark 0.9, barracuda packs 1, gulpers 2 (zone 2 walls), Lurker 1 (a floor with room), squid packs 1, The Maw 55% (zone 4 with at least 3.5 m of room); each count is multiplied by difficulty (easy 0.5, standard 1, hard 1.5). The director then keeps `want[zone]` predators within 70 m (easy [0,0,1,1,1], standard [0,1,1,1,1], hard [1,1,2,2,1]), one spawn at most every 45 s, 26 to 48 m away and out of sight. This keeps endless depth stocked.

Activation: predators wake 14 m farther than other creatures (The Maw 30 m) and keep their place under the `maxActive` cap, so a shark 40 m away can still smell you.

Tests: `python3 tests/test_predators.py [show] [attack] [death] [api] [only=shark,maw]` (screens `tests/screens/PRED_*.png`).

Senses: blood (`TU.player.state.bleed > 0`: shark 45 m, barracuda 32 m, Lurker 30 m, squid 25 m, The Maw 60 m), `weapon:noise { pos, loudness }` (range 30 m x loudness: prey flees, shark, barracuda, Lurker and The Maw come to look), sight with line of sight, your flashlight (Lurker, eyeshine).

## New events (emitter: creatures)
| Event | Payload |
|---|---|
| `creature:hurt` | `{ id, species, speciesId, hp, maxHp, pos, point, amount, kind, weapon }` |
| `creature:killed` | `{ id, species, speciesId, pos, by (weapon or kind), sizeM }` |
| `creature:grab` | `{ id, species, speciesId, strength, kind: 'drag'\|'hold'\|'shake' }` |
| `creature:release` | `{ id, species, speciesId, reason: 'struggle'\|'hit'\|'killed'\|'stunned'\|'timeout'\|'lost'\|'debug' }` |
| `creature:tell` | `{ id, species, speciesId, kind: 'circle'\|'hunch'\|'chatter'\|'hiss'\|'flash'\|'rumble', pos }` (a warning before a strike; not `creature:warn`, which ui.js shows as a crayfish message) |
| `creature:ink` | `{ id, species, speciesId, pos }` |
| `creature:attack` | new kinds `slash` (injury cut), `grab`, `ink` (blur), `bump` |

## Listens to
`weapon:noise { pos, loudness }`. Reads `TU.player.state.bleed`, `TU.player.input.keys` (A / D struggle), `TU.player.lamp`.

Sounds: the tells use `TU.audio.ctx` / `TU.audio.out` if audio.js exposes them (own synthesized thrum, chatter, glorp, hiss, clicks, rumble with stereo panning), otherwise `TU.audio.play` with the closest existing sounds. creatures never opens its own AudioContext (a second context hung the headless test browser).

## Writes outside creatures (documented exception)
While a predator holds you, creatures-predators.js steers `TU.player.state.vel` toward the predator's mouth (and the shark's bump and The Maw's bite shove it once). See REQUESTS-PRED.md for the proper player API request.

## DOM
`#cr-grab` (the struggle bar, z 3) and `#cr-ink` (the ink blackout, z 1). Burrow holes are an InstancedMesh named `cr-burrow`; gore `cr-gore`; clouds `cr-clouds`.
