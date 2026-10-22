# Overnight Build (Oct 22, 2026)

Everything here was built, compiled on the M5 and tried in Play during the night unless it says otherwise. Code is on GitHub (cave-dive-game-unreal, main). Every new feature has its numbers exposed as tunables, so "feels wrong" is usually a slider, not a rewrite.

## Phase 1 status
All 12 Phase 1 prompts are now built. Prompt 4 (arms anim instance) became the procedural body instead. The only open piece is the audio low-pass of Prompt 7, which only matters once real recorded sounds exist.

## New tonight (in the order a dive meets them)
- **One complete dive:** swim in, reach the end, come back to the start. A dive slate shows your stats and a funny verdict. R dives again. Drowning shows the slate too.
- **Rock tunnel, route v2 (about 169 m):** entrance glow, a blind bend, a junction with a dead-end side passage, a low wide bedding plane, a tight round restriction, an 11 m chimney drop, the big chamber with the air pocket, a silt room and a dead-end slot. `dive.GoToMark <Name>` jumps to each moment.
- **Cave dressing:** stalactites (with soda straws and fused twins), wax-like stalagmites, ribbed columns, boulders, breakdown slabs, rubble and flowstone. Same seed, same cave. A clear swim line is always kept.
- **Water you can see:** marine snow in the beam, silt clouds, breath bubbles.
- **Eye adaptation:** big chambers open up slowly when your light reaches far.
- **Air pockets:** a real water surface (dark and glossy from above, lit from below), breaking the surface washes the mask, drips and ripples, and you bob at the surface.
- **Dive watch:** hold Tab to raise the left wrist and read depth, air, time and line. Double tap Tab for a hologram map of the rope and waypoints.
- **Injuries:** cuts and suit tears from hard hits, health, duct tape on X.
- **Z wheel:** hand signals and emotes.
- **Synthesized sound:** regulator breathing with bubbles, vest puffs and dumps, cave ambience, swim rush. No sound files.
- **Recording mode:** dive.Cinematic hides the HUD for devlog footage.
- **Tuning:** one data asset (DA_DiveTuning) plus dive.* test commands.
- **Player settings:** F10 (fn+F10) opens a panel: mouse sensitivity, invert Y, field of view, camera sway, steady camera, motion blur, volume, graphics quality. Saved between sessions. Also `dive.Set` and `dive.Settings`.
- **Devlog tools:** `dive.Shot` (clean high-res screenshot), `dive.Flythrough` (smooth first-person glide along the tunnel for B-roll), `dive.LookAround` (slow establishing pan). Shot list added to [[Recording Devlog 1]].
- **Halocline and thermocline:** in the chimney you sink through a shimmering fresh/salt water layer (blurry, wavy, you leave swirls in it) and then a cold layer (shiver, colder water, bluer tint). The watch shows which layer you are in.
- **First-dive hints:** one short card at a time teaches each key at the moment you need it, each shown once. Hold F1 for all controls.
- **Side passage seam:** the junction opening is a clean, sealed rock edge.
- **Shareable Mac build:** packaged and zipped at ~/Projects/CaveDive_Builds (see [[Playtest Kit]]). It is unsigned: friends right-click it and choose Open the first time.
- **Event sounds:** surfacing splash, plunge, drips with cave echo, low-air beeps, heartbeat with panic, glow stick crack, nail tink, tank clunk, silt rumble, rock scrapes.

## Fixes found by playing
- The deep tunnel went black (fog got thicker with depth). Fixed.
- About 10 ms per frame was lost to Lumen re-capturing moving meshes. Fixed, now about 12 ms GPU in the chamber.
- Under and above an air pocket the light blew out to white. Fixed with exposure and haze changes.
- Stuck keys after drowning, and a few other bugs from a full code review (see REVIEW-NIGHT.md in the code repo).

## Ready for Phase 2 (prep only, nothing networked yet)
Vest, panic and injuries now follow the "no component reaches into another" rule. REVIEW-NIGHT.md ends with a step-by-step Phase 2 networking prep plan.

## Your Mac vault
Your Obsidian copy at ~/Documents/cave-dive-game showed only 4 notes to the remote shell (the rest may be iCloud-only). New notes are on GitHub; pull or sync to see them.
