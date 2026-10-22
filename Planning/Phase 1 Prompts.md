# Phase 1 Prompts

Copy-paste prompts for Claude Code to build the Phase 1 "The Feel" prototype from the [[Roadmap]]: one handmade dark tunnel, solo only, with first-person swimming and visible hands, a flashlight whose light dies fast, an air meter with breathing audio hooks, buoyancy by breathing into the BCD, and silt-outs.

Do [[Setup Guide]] first. Every prompt assumes Claude Code was started inside `$HOME/Projects/CaveDive` with the vault added (`claude --add-dir "<your vault path>"`).

Design sources: [[Game Pillars]], [[Movement and Swimming]], [[Diving Systems]], [[Audio]], [[HUD, Watch and Waypoints]], [[Engine, Hardware and Platforms]].

## How to use these
- Run them **in order, one per session or sitting**. Each one builds on the last.
- Paste the whole code block. Replace anything in `<angle brackets>` first.
- **Close the Unreal Editor before Claude Code builds C++.** On Mac the reliable loop is: close editor, Claude builds from the terminal, reopen editor. Live Coding (hot reloading C++ while the editor runs) is not something to rely on here.
- Claude Code writes the C++. **You** do the editor parts (Blueprints, input assets, levels, materials, Niagara effects) because those are binary files edited visually. Each prompt lists exactly what to click.
- After each prompt, test it. If it works, commit (`git add -A && git commit -m "..."` or ask Claude Code to commit). If not, paste the error or describe what feels wrong back into Claude Code.
- When a design decision changes while building, update the matching Design note and add a line to [[Decision Log]].
- Budget: roughly 1 to 2 weeks of your 10 hours per week for prompts 1 to 4, then about one prompt per week after that. That matches the 5-week Phase 1 window.

---

## Prompt 1: Write CLAUDE.md for the Unreal project
**Goal:** give every future Claude Code session the game summary, the rules, the build command, and where the vault is.

```text
Read these vault notes first: Home.md, Game Pillars.md, Planning/Roadmap.md, Tech/Engine, Hardware and Platforms.md, Design/Movement and Swimming.md, Design/Diving Systems.md, Design/Audio.md, Planning/Setup Guide.md.

Then look at this Unreal project (CaveDive.uproject, Source/, Config/) and create CLAUDE.md in the project root. Keep it under about 150 lines. Include:

1. What the game is: a photoreal first-person 1 to 4 player co-op cave diving game for Steam in Unreal Engine 5.8. One-line pitch from Home.md. The failure condition (repetition).
2. The five Game Pillars, one line each, and the tone guardrails (fully first person, 85% funny chaos / 15% tension).
3. Current phase: Phase 1 "The Feel", solo only, one handmade tunnel. List its five features. Say clearly: do not build multiplayer, procedural caves, creatures, or anything from later phases yet, but write code that will not block 2-player networking later (keep gameplay state in components on the character, avoid singletons and static state).
4. Machine facts: Apple Silicon Mac, chip <your chip>, <your RAM> GB RAM, macOS <version>, Xcode <version>, engine at "/Users/Shared/Epic Games/UE_5.8", project at $HOME/Projects/CaveDive, internal disk nearly full (never write caches or big files outside the SSD). If the chip is M1, note that Nanite is not supported on this Mac.
5. Vault location: <your vault path>. Treat it as the source of truth for design. Read the relevant Design note before building any feature. If code and the vault disagree, ask me.
6. Build and run commands for Mac. The editor build command is:
   "/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" CaveDiveEditor Mac Development -Project="$HOME/Projects/CaveDive/CaveDive.uproject" -WaitMutex
   Verify this command works by running it now and fix the path if needed. Note that the Unreal Editor must be closed before building, and that Live Coding is not part of our workflow.
7. Coding conventions:
   - Core logic in C++. Blueprints only for asset references, tuning values, and visual glue. Every tunable number is a UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="...") with a sensible default and a comment with units (cm, cm/s, seconds, liters).
   - Unreal naming: A for actors, U for components/objects, F for structs, E for enums, b for bools. Class prefix "Dive" or "CaveDive" for our classes.
   - Gameplay features are UActorComponents attached to the diver character (air, buoyancy, flashlight, silt), talking through dynamic multicast delegates rather than hard references.
   - Use Enhanced Input. Input Actions and the Mapping Context are editor assets that I create by hand; C++ exposes UPROPERTY slots for them.
   - Keep files small and focused. Add a short header comment to each class explaining what it does in plain English, because I am a beginner and read the code to learn.
   - Debug: every system has an on-screen debug readout toggled by one console variable (for example dive.Debug 1).
   - No new plugins or marketplace code without asking. $0 budget.
8. Working rules: before coding, say which vault notes you read and give a short plan. After coding, build, fix all compile errors, then give me a numbered list of exact editor steps I must do by hand, and a test checklist. Never run destructive git commands (reset --hard, force push, clean -fdx) and never delete files outside the project.
9. Writing style for anything you write for me or into the vault: plain language, no em dashes.

Then show me the file and wait for my OK before committing.
```

**Do by hand in the editor:** nothing.

**Test it worked:**
- `CLAUDE.md` exists in the project root and the build command ran without errors.
- Quit Claude Code, start it again in the project, and ask "What phase are we in and what are you not allowed to build yet?" It should answer from CLAUDE.md.

---

## Prompt 2: Diver character foundation
**Goal:** replace the template character with our own C++ diver, game mode, and empty feature components, so every later prompt has a home.

```text
Read CLAUDE.md, then from the vault: Design/Movement and Swimming.md, Design/Diving Systems.md, Game Pillars.md.

Look at the First Person template code in Source/ and create our own foundation (do not delete the template files yet, we may want to copy from them):

1. ADiveCharacter (C++, subclass of ACharacter): first-person camera, a first-person arms skeletal mesh slot (reuse the template's arms mesh for now), and empty components that later prompts will fill in: UDiveAirComponent, UDiveBuoyancyComponent, UDiveFlashlightComponent, UDiveSiltSensorComponent. Each component just logs that it started.
2. ADiveGameMode that uses a Blueprint child of ADiveCharacter as the default pawn (I will make the Blueprint; expose a TSubclassOf or use the project default pawn setting, whichever is cleaner, and tell me how).
3. Enhanced Input in C++: UPROPERTY slots for an Input Mapping Context and these Input Actions: IA_Look, IA_Swim (2D: forward/back, left/right), IA_Ascend, IA_Descend, IA_Kick (burst stroke), IA_Flashlight, IA_BCDInflate (hold), IA_BCDDeflate (hold), IA_ToggleDebug. Bind them with empty handler functions that log.
4. Console variable dive.Debug (0/1) and a simple on-screen debug readout (AHUD subclass drawing text is fine) that later systems add lines to.

Build it, fix errors, then give me exact editor steps: which Input Action assets to create (name, value type), the mapping context with keyboard and mouse keys (WASD swim, mouse look, Space ascend, Left Ctrl descend, Shift kick, F flashlight, Q hold inflate, E hold deflate, F3 debug), the Blueprint child to create, and what to set in World Settings or Project Settings.
```

**Do by hand in the editor:**
1. Content Browser: create a folder `Content/Dive/Input`. Right-click > Input > **Input Action** for each action Claude listed, set each one's Value Type as told.
2. Right-click > Input > **Input Mapping Context** `IMC_Diver`, add the key mappings Claude listed.
3. Create a folder `Content/Dive/Blueprints`. Right-click > Blueprint Class > search `DiveCharacter` > name it `BP_DiveCharacter`. Open it and fill in the Input slots and the arms mesh in the Details panel. Compile, Save.
4. Do the same for the game mode if Claude asks (`BP_DiveGameMode`), and set it in **Project Settings > Maps & Modes** or the level's **World Settings > GameMode Override**.

**Test it worked:** press Play. You still move and look around (or float, depending on defaults). Press each key and watch the Output Log (Window > Output Log) for the log lines. Press F3 and the debug text appears.

---

## Prompt 3: Underwater swimming movement
**Goal:** the single most important system. Swimming should feel heavy, smooth, and physical: momentum, drag, kick strokes, gentle drift.

```text
Read CLAUDE.md, then from the vault: Design/Movement and Swimming.md and Game Pillars.md (pillar 2, looks and feels real).

Implement underwater swimming for ADiveCharacter in C++:

1. Create UDiveMovementComponent (subclass of UCharacterMovementComponent) with a custom movement mode for diving (MOVE_Custom with our own enum) implemented in PhysCustom. Use proper sweeps (SafeMoveUpdatedComponent, SlideAlongSurface) so the diver slides along rock instead of sticking. Structure it so it can support client prediction later for multiplayer, but do not add networking now.
2. Feel targets:
   - Swim direction follows where the camera looks (looking up and pressing W swims up), with strafe on A/D, Space/Ctrl for straight up/down.
   - Strong water drag: the diver keeps gliding for a second or two after letting go, then slows. Separate drag for forward and sideways.
   - Fin kick rhythm: holding W produces gentle pulses of thrust in a stroke cycle (about one kick per second), not a constant push. Shift (IA_Kick) gives a stronger single burst with a short cooldown and costs a little stamina later (leave a hook).
   - Slow turn inertia on the body, but the camera stays responsive to the mouse.
   - Subtle camera bob and roll tied to the stroke cycle, small enough not to cause motion sickness, with a toggle.
   - A vertical force input from other components (AddVerticalForce or similar) that the buoyancy system will use later. For now, the diver is neutrally buoyant.
3. Expose every number as a tunable UPROPERTY with units and comments.
4. Start in diving mode when the game begins (the whole level is underwater for Phase 1).
5. Add debug lines: speed in cm/s and m/s, current stroke phase, movement mode.

Build, fix errors, and tell me exactly which values to tweak first if it feels too floaty or too stiff.
```

**Do by hand in the editor:**
1. Open the template level, or make a quick empty test level: **File > New Level > Basic**. Place a few large cubes (Quickly Add to the Project button > Shapes > Cube) and scale them into walls, floor, and ceiling.
2. In `BP_DiveCharacter`, select the movement component and play with the exposed values in the Details panel while testing.

**Test it worked:** press Play. You float instead of falling. Looking up and pressing W swims upward. Letting go glides then slows. Swimming into a wall at an angle slides along it. The camera bob feels like kicking, not walking. F3 shows speed and stroke phase.

---

## Prompt 4: Visible hands and swim strokes
**Goal:** your hands and arms are always just visible at the screen edges, moving with each stroke.

```text
Read CLAUDE.md, then from the vault: Design/Movement and Swimming.md (first person, visible hands section).

Make the first-person arms feel like a swimmer's, driven from C++:

1. Create UDiveArmsAnimInstance (C++ subclass of UAnimInstance) that exposes variables an Animation Blueprint can read: swim speed, stroke phase (0 to 1) from UDiveMovementComponent, look pitch, whether the flashlight is held, and whether the diver is touching a wall.
2. Implement procedural motion in C++ (in the anim instance or a small component that offsets the arms mesh): arms sway with water drag, follow the look direction with a slight lag, and do a gentle breaststroke-like pull timed to the stroke cycle. Idle treading motion when stopped. Keep hands mostly at the screen edges so they never block the view.
3. When the diver is close to a wall, do a simple sphere trace and expose the hit point so later we can place a hand on rock (just expose it and draw a debug sphere for now).
4. Give me the exact Animation Blueprint setup steps: which nodes to add in the AnimGraph to use these variables (for example Transform (Modify) Bone or Two Bone IK on the hand bones), with bone names from the template arms skeleton.

Build and fix errors. If a free swimming animation would help a lot, tell me where to get one for $0 (for example Mixamo) and how to retarget it, but make the procedural version work without it.
```

**Do by hand in the editor:**
1. Right-click in `Content/Dive/Blueprints` > Animation > **Animation Blueprint**, pick the template arms skeleton, and set its **Parent Class** to `DiveArmsAnimInstance` (Class Settings).
2. Build the AnimGraph nodes exactly as Claude describes. Compile, Save.
3. In `BP_DiveCharacter`, select the arms mesh and set **Anim Class** to your new Animation Blueprint.

**Test it worked:** press Play. Hands are visible at the edges, pull in rhythm when swimming forward, drift gently when stopped, and lag slightly behind fast mouse turns. Near a wall, a debug sphere marks where a hand could grab.

---

## Prompt 5: The handmade tunnel (spline tunnel builder)
**Goal:** a tool so you can "draw" one twisting cave tunnel by dragging points in the editor, with real collision, then dress it.

```text
Read CLAUDE.md, then from the vault: Design/Cave Generation.md, Game Pillars.md, and the Phase 1 section of Planning/Roadmap.md (one handmade tunnel).

Build a C++ editor-friendly tunnel tool:

1. ADiveTunnelActor with a USplineComponent and a UProceduralMeshComponent. It generates an inward-facing tube mesh along the spline (normals pointing inside, UVs for tiling rock materials) with collision, regenerating in OnConstruction so it updates live as I drag spline points.
2. Per-spline-point controls: radius (narrow squeezes vs wider sections), a flattened floor amount, and roughness. Add deterministic noise displacement (seeded) so the walls look rocky rather than like a pipe. Keep vertex count reasonable for my Mac and expose rings-per-meter and segments-around.
3. Mark a floor strip in vertex colors (or a separate mesh section) so later the silt system knows where silty floor is.
4. A material slot for walls and one for the floor.
5. Explain to me how to set up the level for darkness: no sky light, no directional light, no sky atmosphere, a Post Process Volume with Infinite Extent, auto exposure turned off (fixed manual exposure) so dark stays dark, and an Exponential Height Fog with Volumetric Fog on. Give exact setting names and starting values.

Build, fix errors, and give me step-by-step instructions to place it and shape a 60 to 100 meter tunnel with at least one squeeze, one turn that hides what is ahead, and one wider chamber.
```

**Do by hand in the editor:**
1. **File > New Level > Empty Level**, save as `Content/Dive/Maps/L_Tunnel01`.
2. Drag `DiveTunnelActor` from the Place Actors panel into the level. Select spline points (click the tunnel, then the white points), **Alt-drag** a point to add new ones, and shape the tunnel. Set radius per point.
3. Add a **Player Start** inside the tunnel entrance.
4. Set up darkness exactly as Claude described (Post Process Volume, fog). Delete any sky or sun lights.
5. Materials: for $0, search Fab's free section for a rock or cave material, add it to your project, and assign it to the wall and floor slots. Starter Content's rock materials also work as placeholders.
6. Set this map as the default: **Project Settings > Maps & Modes > Editor Startup Map and Game Default Map**.

**Test it worked:** press Play. You spawn in a tunnel that is completely black (you will light it next prompt). With F3 or by temporarily adding a point light, you can swim the full length, squeeze through the narrow bit, and never fall through a wall.

---

## Prompt 6: Flashlight with darkness that falls off fast
**Goal:** the flashlight is your whole world. Bright core, quick falloff, hard darkness around corners, light that scatters in the water.

```text
Read CLAUDE.md, then from the vault: Design/Diving Systems.md (gear failure: flashlights run out of battery), Design/Gear and Customization.md, Game Pillars.md (pillar 2).

Fill in UDiveFlashlightComponent in C++:

1. A spotlight attached to the left hand (a Goodman handle light, per Design/Art Direction.md), aimed with the camera but with a slight smoothed lag (springy follow), so fast turns sweep the beam a little behind your view.
2. Realistic falloff: inverse square falloff on, attenuation radius around 15 to 25 m, tight inner cone, soft outer cone, volumetric scattering intensity so the beam is visible in the water fog. Light shadows on so corners cut the light hard. Starting values tuned for Lumen on Mac; tell me which settings cost the most performance.
3. Toggle on F with a click sound hook (USoundBase slot).
4. Battery: drains over time (tunable, default about 8 minutes, the Level 1 battery in Design/Economy and Progression.md), flickers in the last 10 percent, dies at 0. Broadcast OnBatteryChanged and OnFlashlightDied delegates. Add a tiny dim "backup glow" option off by default.
5. A faint ambient falloff around the player: optional very weak, short-radius point light so your own hands are barely readable in total darkness, with a toggle so I can compare.
6. Debug lines: on/off, battery percent, light settings.

Build, fix errors, then tell me what to tweak in the Post Process Volume and fog so the beam looks great underwater but the darkness stays black.
```

**Do by hand in the editor:**
1. In `BP_DiveCharacter`, assign the click sound (any free click from Starter Content or Freesound CC0).
2. Tweak the exposed light values and the level's fog and Post Process Volume while playing (you can edit values during Play and copy them back after with right-click > Copy, then paste after stopping).

**Test it worked:** press Play in `L_Tunnel01`. Without the light it is black. With it, you see a bright cone that fades out within about 20 m, the beam is visible in the water, and turning a corner leaves the area behind the rock fully dark. Fast mouse turns make the beam trail slightly. Set the battery to 30 seconds for a test and watch it flicker and die.

---

## Prompt 7: Underwater atmosphere
**Goal:** make it read as water, not air: color absorption, particles floating in the beam, muffled feel.

```text
Read CLAUDE.md, then from the vault: Game Pillars.md (pillar 2), Design/Audio.md, Tech/Engine, Hardware and Platforms.md (water is mostly post-processing).

Create UDiveUnderwaterComponent in C++ on the character:

1. Drives the camera's post process settings at runtime: blue-green color grading that gets darker and less red with distance (use fog color and scene color tint), slight vignette, mild chromatic aberration at the screen edges like a mask lens, a little film grain, and a subtle mask-edge vignette. All values tunable, with an "intensity" master slider. Do this through FPostProcessSettings in C++ so I do not have to build a material graph yet.
2. A slot for a Niagara system of floating particulates (marine snow) that spawns attached to the camera in a box around the player, so particles drift through the flashlight beam. Expose spawn rate and box size. Tell me exactly how to build that Niagara system by hand, step by step, from a Niagara template.
3. An audio hook: a slot for a looping underwater ambience sound and a hook for a low-pass filter on all game audio while underwater (use a Sound Mix or Submix approach; tell me which assets I create).
4. Debug toggle to switch the whole underwater look on and off for comparison.

Build and fix errors.
```

**Do by hand in the editor:**
1. Create the Niagara system Claude describes (right-click > FX > **Niagara System** > from a template such as "Simple Sprite Burst" or "Fountain", then change it as told). Use a lit translucent material so particles only show in the flashlight beam.
2. Create the Sound Mix or Submix assets Claude names and assign them in `BP_DiveCharacter`.
3. Download a free CC0 underwater ambience loop from Freesound (check the license says CC0) and import it.

**Test it worked:** press Play. Toggle the debug switch: with it on, the scene looks wet and blue-green; specks drift through the beam; sounds are muffled. Take a screenshot of each for the devlog.

---

## Prompt 8: Air system and breathing audio hooks
**Goal:** a tank you can watch drain, breathing you can hear, and the hooks the rest of the game will use.

```text
Read CLAUDE.md, then from the vault: Design/Diving Systems.md (Air, Stamina, Panic), Design/Audio.md (breathing is the most important sound), Design/HUD, Watch and Waypoints.md.

Fill in UDiveAirComponent in C++:

1. Model: one tank for Phase 1 with tank air in liters at surface pressure (tunable, default sized so a calm dive lasts about 10 minutes of real time, matching one tank in Proposed Answers #34) and current lung volume (liters).
2. A breathing cycle state machine: Inhale, Hold, Exhale, Pause. Breath rate and depth rise with exertion (swim speed and kicks from UDiveMovementComponent). Each inhale draws from the tank. Leave hooks for depth and panic multipliers from Diving Systems but keep them at 1.0 for now.
3. Delegates: OnInhaleStarted, OnExhaleStarted, OnAirChanged(percent), OnLowAir (at 25 percent), OnCriticalAir (10 percent), OnOutOfAir. On exhale, also provide a hook to spawn a bubble burst effect at the regulator position.
4. Audio hooks: sound slots for inhale and exhale (arrays so it picks a random variation each breath, never the same twice in a row), played from the regulator position, with volume and pitch nudged by exertion. Breathing gets faster and harsher on low air.
5. Out of air: for now, screen fades and the level restarts after a few seconds. Keep it simple.
6. Debug readout: tank percent and liters, lung volume, breath state, breaths per minute. Also a minimal placeholder air bar drawn on the HUD (the real design is a mask HUD and watch, so keep this clearly temporary).
7. Make the breathing cycle readable by the buoyancy system next (lung volume affects buoyancy).

Build and fix errors. Then tell me how to record my own breathing sounds through a regulator-like sound for free (phone recording tips, how to clean them up in Audacity, how to import).
```

**Do by hand in the editor:**
1. Record your own breathing on your phone (breathe through a snorkel or a cupped hand for a regulator sound), or download CC0 regulator breathing from Freesound. Make 3 to 5 inhale and 3 to 5 exhale clips. Import them into `Content/Dive/Audio`.
2. Assign them to the inhale and exhale arrays in `BP_DiveCharacter`.
3. Optional: make a quick bubble Niagara burst and assign it to the exhale hook.

**Test it worked:** press Play. You hear breathing, calm when drifting and faster when kicking hard. F3 shows the tank draining faster when you swim hard. Set the tank to 30 seconds of air and confirm low-air breathing changes, then out-of-air restart works.

---

## Prompt 9: Buoyancy by breathing into the BCD
**Goal:** the signature mechanic. You control up and down partly by breathing air into your buoyancy device (BCD), at the cost of air.

```text
Read CLAUDE.md, then from the vault: Design/Movement and Swimming.md (Buoyancy section), Design/Diving Systems.md (Air).

Fill in UDiveBuoyancyComponent in C++:

1. State: BCD air volume in liters (0 to a tunable max), plus the lung volume from UDiveAirComponent. Net buoyancy = (BCD volume + lung volume - neutral volume) times a tunable force per liter. Feed it into UDiveMovementComponent's vertical force input every tick.
2. Hold Q (IA_BCDInflate): the diver puts their mouth on the BCD and exhales into it. While held, normal breathing pauses, BCD volume rises at a tunable rate, and that air comes out of the lungs and then the tank (spends air). Play a hiss/bubble sound hook.
3. Hold E (IA_BCDDeflate): mouth on the BCD and breathe the air back in. BCD volume falls, and part of it returns to the lungs (gives back some breath, as the design note says), with the rest vented as bubbles.
4. Normal breathing should already bob you slightly: inhale rises a tiny bit, exhale sinks a tiny bit (like real divers).
5. Depth matters a little: use the actor's height compared to a "surface" Z value as fake depth, and scale BCD air with a simple Boyle's law style factor so going deeper squeezes the BCD (you sink faster) and rising expands it (you rise faster). This makes buoyancy a skill. Expose a multiplier so I can turn the effect down if it is too hard.
6. Arms or camera reaction while the mouth is on the BCD (small camera dip, one hand moves toward the chest), using hooks in the arms anim instance.
7. Debug: BCD liters, lung liters, net buoyancy force, fake depth, vertical speed.

Build and fix errors. Tell me the 3 values that most change how hard buoyancy feels.
```

**Do by hand in the editor:**
1. Assign the inflate and deflate sounds (free CC0 air hiss and bubbles).
2. In the Animation Blueprint, add the "hand to chest" pose using the variable Claude exposed, if you want the visual now.
3. Tune the 3 values Claude names until hovering in the middle of the chamber takes a little practice but is not frustrating.

**Test it worked:** press Play, stop swimming, and watch: breathing alone bobs you slightly. Hold Q: you rise and F3 shows tank air dropping. Hold E: you sink and lung air goes up. Try to hover still in the chamber using only Q and E. That should be fun to master.

---

## Prompt 10: Silt-out
**Goal:** swim too fast near the floor and you kick up a cloud that blinds you; you must stop and wait 10 to 15 seconds for it to settle.

```text
Read CLAUDE.md, then from the vault: Design/Diving Systems.md (Silt-outs), Game Pillars.md, and look at how ADiveTunnelActor marks the silty floor strip.

Build the silt system in C++:

1. ADiveSiltManager (one per level, or a world subsystem if cleaner): keeps a list of silt puffs, each with position, radius, density, and age. Puffs grow, drift slightly, and fade with a settle time of about 10 to 15 seconds (tunable). Query function: GetSiltDensityAt(location).
2. UDiveSiltSensorComponent on the character: when the diver (or fin position, a bit behind and below the body) is within a tunable distance of the silty floor and moving faster than a threshold, or kicks hard (IA_Kick), it spawns puffs. Faster and closer means more silt. Gentle careful swimming makes none.
3. Visual effect at the camera: read silt density at the camera and drive post process (heavy brown-gray fog, lower contrast, slight blur via depth of field) so visibility drops to under a meter in a full silt-out. Also make the flashlight beam bounce back from silt (raise volumetric scattering, lower attenuation radius while in silt) because light reflecting off particles is what really blinds divers.
4. A slot for a Niagara silt cloud system spawned per puff, with parameters (radius, density, age) passed in so the visuals match the math. Give me exact steps to build that Niagara system by hand.
5. Debug: draw puffs as spheres, show density at the camera.

Build and fix errors.
```

**Do by hand in the editor:**
1. Place one `DiveSiltManager` in `L_Tunnel01` if Claude made it an actor.
2. Build the silt Niagara system Claude describes (lit translucent smoke sprites, slow drift, fade out over the puff's age) and assign it.
3. Make one section of your tunnel extra silty: a wider, flatter floor in the chamber works well.

**Test it worked:** press Play. Swim slowly over the floor: no silt. Kick hard near the floor: a cloud blooms, the flashlight bounces back off it, and you can barely see. Stop and count: within about 10 to 15 seconds it settles and the tunnel reappears. F3 shows the puffs.

---

## Prompt 11: Tuning pass and one settings file
**Goal:** gather every feel number into one place so you can tune the whole dive without hunting through Blueprints.

```text
Read CLAUDE.md, then from the vault: Game Pillars.md and Design/Movement and Swimming.md.

1. Create UDiveTuningData (a UPrimaryDataAsset) that holds all tunable values from movement, arms, flashlight, underwater look, air, buoyancy, and silt, grouped by category with comments and units. Each component reads its values from the data asset on BeginPlay (keep the per-component defaults as fallbacks).
2. Add a few console commands for fast testing: dive.RefillAir, dive.SetBattery <percent>, dive.ClearSilt, dive.TeleportStart.
3. Review all Phase 1 code for: tick costs (anything that can run less often), magic numbers that are not exposed, missing null checks, and anything that would block 2-player networking later. Fix small things; list bigger ones for me instead of rewriting.
4. Write a short "Phase 1 tuning cheat sheet" into the vault at Planning/Phase 1 Tuning.md: the 10 most important values, what each does in plain language, and the current numbers. No em dashes.

Build and fix errors.
```

**Do by hand in the editor:**
1. Right-click > Miscellaneous > **Data Asset** > pick `DiveTuningData` > name it `DA_DiveTuning`, assign it in `BP_DiveCharacter`.
2. Spend one full session only tuning: swim the tunnel 10 times, change one value at a time, and note what felt better in the tuning note.
3. Have Tyrus (or anyone) play it on your Mac without instructions and watch where they struggle.

**Test it worked:** changing a value in `DA_DiveTuning` changes the feel on the next Play. The console commands work (press the backtick key to open the console). The tuning note appears in the vault.

---

## Prompt 12: Performance check and devlog #1 capture
**Goal:** make sure it runs smoothly on your Mac, then record beautiful footage for the first post (see [[Personal Brand and Marketing]]).

```text
Read CLAUDE.md, then from the vault: Tech/Engine, Hardware and Platforms.md and Business/Personal Brand and Marketing.md.

1. Performance: tell me which stat commands to run (stat fps, stat unit, stat gpu) and what numbers to send you. Then suggest and implement settings in Config/DefaultEngine.ini and DefaultScalability.ini that keep 60 fps in the editor viewport on my Mac (chip <your chip>, <your RAM> GB) without making darkness or the flashlight look cheap. Explain each change in one line.
2. Make a "cinematic" mode: console command dive.Cinematic that hides all debug and placeholder HUD, locks a nice field of view, and slightly smooths the camera for recording.
3. Give me step-by-step instructions for recording footage for $0: in-editor capture with Take Recorder or Movie Render Queue for high-quality clips, and the quick option of macOS screen recording (Cmd+Shift+5). Include recommended resolution and frame rate for TikTok, Instagram Reels, and YouTube Shorts (vertical) plus a horizontal version.
4. Suggest a 20 to 30 second shot list showing the five Phase 1 features (swim in, flashlight around a corner, hover with the BCD, breathing getting faster, a silt-out that blinds the screen).

Do not build or change gameplay code in this prompt except the cinematic mode.
```

**Do by hand in the editor:**
1. Run the stat commands in the console during Play and paste the numbers back to Claude Code.
2. Record the shot list. Edit in a free editor (CapCut or iMovie) with real breathing audio up front.
3. Record the decision and results in [[Decision Log]] and mark Phase 1 done in [[Roadmap]].

**Test it worked:** the tunnel holds a steady frame rate while swimming with the flashlight on, `dive.Cinematic` hides everything, and you have a clip you would actually want to post. That is devlog #1.

---

## After Phase 1
When swimming through the tunnel feels incredible, move to Phase 2 (Friends) in the [[Roadmap]]: 2-player co-op, the rope, voice. Start that phase by asking Claude Code to read [[Rope and Multiplayer]] and update CLAUDE.md's "current phase" section.
