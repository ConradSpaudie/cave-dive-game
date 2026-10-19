> **Resolved in the Oct 19 integration.** See CONTRACT.md section 16 for how each item was handled.

# Requests from the predators agent (creatures*.js)

Fallbacks are in place for all of these, so nothing breaks if they are not done. Full API in CONTRACT-B-NOTES.md ("Combat and predators").

## Damage scale (for the weapons agent)
- `amount` in `TU.creatures.damage(id, amount, opts)` is in hit points where **one basic hit (a spear or bolt) is about 10**.
- Small fish and shrimp have 1 to 5 hp (one hit kills). The Cenote Bull Shark has 55 (5 to 6 basic hits). The Maw has 260.
- `kind` changes the damage: `pierce` x1, `cut` x1, `blunt` x0.6, `shock` x1.2 (a Volt Eel is immune and gets angry), `push` x0 (impulse only). Hits on the front third of a body (the head) do x1.4.
- Flora cannot be damaged: `damage()` returns `{ hp: 0, maxHp: 0, killed: false, immune: true }`. `raycastHit` skips flora (shots pass to the rock behind).
- `raycastHit` returns the nearest creature only. Compare its `dist` with `TU.cave.raycast(origin, dir, maxDist)` so you do not hit through rock.

## To whoever owns core.js (weapons agent now)
1. Please add stubs to `TU.creatures` in core.js so weapons work when creatures.js is dropped (`/?drop=creatures`):
   `raycastHit: function () { return null; }`, `damage: function () { return { hp: 0, maxHp: 0, killed: false }; }`, `impulse: function () {}`, `stunArea: function () { return 0; }`, `inRadius: function () { return []; }`, `grabbedBy: function () { return null; }`, `struggle: function () { return false; }`.
2. Please add `TU.cfg.creatures.predators` if you want the predator tunables shared; until then they live in `TU.creatures.predatorTuning` (local, marked TODO cfg).
3. Please add the new events to CONTRACT.md section 5: `creature:hurt`, `creature:killed`, `creature:grab`, `creature:release`, `creature:tell`, `creature:ink` (payloads in CONTRACT-B-NOTES.md), and the new attack kinds `slash`, `grab`, `ink`, `bump`.

## To the weapons agent
1. Emit `weapon:noise { pos, loudness 0..1 }` for every shot or bang (1 = a loud bang heard 30 m away). Prey flees, the shark, the Lurker and the Maw come to look.
2. A hit on a creature that is holding the diver (`TU.creatures.grabbedBy()`) counts double toward breaking the hold.
3. Stun weapons: `TU.creatures.stunArea(pos, radius, seconds)` returns how many creatures were stunned.

## To player.js (owner C) and ui (owner D)
1. **Being held.** When `TU.creatures.grabbedBy()` is not null (`{ id, species, strength 0..1, kind: 'drag'|'hold', anchor: Vector3, t }`), please slow the diver's own kicks (for example x0.25) and do not let a rock grab cancel it. Fallback now: creatures.js pulls the diver by adding to `TU.player.state.vel` each step (a documented exception to "never write other modules' state").
2. **Struggle mini game.** Alternating A / D taps already work as a fallback (creatures.js reads `TU.player.input.keys`, read only). If you prefer your own tug bar, call `TU.creatures.struggle(amount)` per alternating tap (0.08 per tap is the tuned value) and hide `#cr-grab` (creatures.js draws a small fallback bar).
3. **Attack kinds.** New `creature:attack` kinds: `slash` (injury `cut`), `grab` (no injury, panic), `ink` (`blur` seconds, use it like venom), `bump` (no injury, panic and shake). player.js already handles them through its sting and venom branch; a short ui message for each would be nice: slash "SLASHED", grab "GRABBED. Tap A D A D or stab it.", ink "INKED. You cannot see.", bump "Something big just bumped you."
4. **Warnings.** Predators emit `creature:tell { id, speciesId, kind: 'circle'|'hunch'|'hiss'|'click'|'rumble'|'flash'|'chatter', pos }` right before an attack. They do NOT emit `creature:warn` for these (ui.js shows a crayfish message for any non-shock warn). creatures-predators.js plays a sound for each tell through `TU.audio` (see the audio request below).
5. **Logbook.** Species now have `danger` (0..5) and `predator: true`. A killed specimen can still be measured: `measure()` returns `specimen: true` and the entry gets `specimens` (count). Please show a danger rating (for example skulls) in the logbook and the bounty.

## To audio.js (owner C)
1. Please expose the AudioContext and the master input on the API: `TU.audio.ctx` and `TU.audio.out` (a GainNode that goes through your master volume and mute). creatures-predators.js then plays its own synthesized tells (shark thrum, barracuda teeth chatter, eel "glorp", Lurker hiss, squid clicks, The Maw's 2.4 s rumble) with stereo panning. Until then it falls back to `TU.audio.play` with your sounds (whoosh, thump, bite, metalClank, cut, creak, grab, quake). It never opens a second AudioContext (that hung the headless test browser).
2. Optional: listen to `creature:tell` (kinds circle, hunch, chatter, hiss, flash, rumble) and `creature:grab` / `creature:release` for heartbeat or music stingers.
