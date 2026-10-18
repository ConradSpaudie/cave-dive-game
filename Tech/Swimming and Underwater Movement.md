# Swimming and Underwater Movement

Technical plan for the movement described in [[Movement and Swimming]] and [[Diving Systems]]. Researched October 2026 against Unreal Engine 5.8.

## Plain-language explanation

In Unreal, the thing that moves a player around is called a **movement component**. It reads your keys and mouse, works out a new position every frame, and handles bumping into walls. The standard one is the **Character Movement Component** (people call it CMC). It already has a built-in **Swimming** mode: if your character enters a box in the level marked as water (a **Physics Volume** with "Water Volume" ticked), the character starts swimming automatically, with its own speed, friction and buoyancy settings.

Epic is building a replacement called **Mover**. It is nicer to extend, but in the official 5.8 release notes it is still labelled **Experimental**, meaning its code can change under you between engine versions. For a beginner shipping a multiplayer game, that is a trap.

The reason this matters so much for an online game: in multiplayer, your own computer predicts your movement instantly (so it feels responsive), while the host checks it and corrects you if you disagree. CMC has this prediction and correction built in and battle tested. If you write movement from scratch you have to build all of that yourself, which is one of the hardest things in game networking.

"First person with visible hands" is now a built-in engine feature: since UE 5.5 there is **First Person Rendering**, which draws your arms with their own field of view so they never clip into rock, while other players see a separate full body.

## Recommended approach

**Subclass the Character Movement Component in C++ (`UDiverMovementComponent`) and build every mode on top of it.** Keep CMC's built-in Swimming mode for open water, override how swimming velocity is calculated, and add a small number of custom modes for the special cases.

### Modes and how each one is built

| Mode | Built as | Notes |
|---|---|---|
| Swim | CMC `MOVE_Swimming`, overridden velocity math | Entered automatically inside water volumes |
| Wall grab / pull | Custom mode `CUSTOM_WallGrab` | Hand anchors to a rock point; used to brace for rescues |
| Push off | One-shot impulse from Swim or WallGrab | Velocity along the rock's surface normal |
| Crawl (dry) | CMC Walking + built-in crouch with a very low capsule | Dry chambers and low ceilings |
| Squeeze | Custom mode `CUSTOM_Squeeze`, follows a spline | Only inside authored squeeze pieces |
| Ragdoll | Physics on the body mesh, capsule frozen | Falls in dry sections only |

### Swimming that feels smooth: "kick and glide"

Default CMC swimming feels like a flying camera. Real diving feels like **momentum**: each fin kick pushes you, then water drag slowly bleeds the speed off. Override `CalcVelocity` (or `PhysSwimming`) for the swim mode and do this:

1. While the player holds forward, apply a kick impulse on a rhythm (about one kick every 0.7 to 0.9 seconds), not a constant force. The arms and fins animation is synced to that rhythm.
2. Every frame, apply drag that grows with speed (quadratic drag), so you coast and settle instead of stopping dead.
3. Move in the direction the camera faces (swimming is fully 3D: look down and kick to descend).
4. Keep speeds slow. Real cave divers move well under 1 m/s. Start with a cruise around 1.2 to 1.5 m/s and a hard "sprint kick" around 2.5 m/s, then tune by feel. Stamina and tank count scale the kick strength.
5. Turning is never instant: smooth the camera slightly, add a tiny roll when strafing, and a very small head bob tied to the kick rhythm. Small amounts only; first-person motion sickness is real.

### Buoyancy by breath

- Store a `BCDAir` value (0 to 1). Holding the inflate key adds air and spends tank air; holding deflate breathes it back in and returns a little breath (matches the design in [[Movement and Swimming]]).
- Net vertical force each frame = buoyancy from `BCDAir` minus the diver's weight (tanks make you heavier). Neutral buoyancy is a sweet spot the player has to find, which is the fun.
- Optional realism that fits Pillar 5: air in the device compresses with depth, so going deeper makes you sink faster unless you add air. One line of math, big "every meter costs" feeling.

### Currents

Make a C++ `ACurrentVolume` (a subclass of Physics Volume) with a flow direction and strength. Inside the swim math, add the flow to the diver's velocity. Because volumes are part of the level and identical on every machine, this predicts cleanly online. Wall grab sets the flow effect to zero, which is how anchoring during rescues works.

### Squeezes and crawling

- **Crawl** uses CMC's built-in crouch with a much lower capsule. Cheap and reliable.
- **Squeeze is not free movement.** Free movement through a body-sized hole causes the capsule to snag and jitter, especially online. Instead, every squeeze piece in the cave kit (see [[Procedural Cave Generation]]) contains a spline running through it. Entering the squeeze locks the diver onto that spline; forward and back input moves along it, the camera is pulled in close, and the arms play pull animations. Online, the only thing that has to stay in sync is one number (distance along the spline). This also gives a natural hook for "getting stuck" moments and panic.

### Networking the custom movement

- Each custom button (inflate, deflate, grab, sprint kick) is sent through CMC's **saved move** system: subclass `FSavedMove_Character`, pack the buttons into compressed flags, and read them in `UpdateFromCompressedFlags`. There is room for roughly eight custom on/off flags, which is enough.
- Values that change over time (like `BCDAir`) are not automatically corrected by CMC. Make them server-authoritative, replicate them to the owning player, and let the client predict. Small mismatches cause small corrections, which is acceptable in a co-op game.
- Turn on `p.NetShowCorrections 1` from day one to see when prediction goes wrong.
- Rope pulls between players are the hard part and are covered in [[Rope System]].

### First-person arms and body

Use the engine's **First Person Rendering** feature (production ready as of 5.8):
- Arms mesh set to **First Person Primitive Type: First Person**, attached under the camera. Turn on "Enable First Person Field of View" and "Enable First Person Scale" on the camera so the hands never clip into rock.
- A full-body diver mesh set to **World Space Representation**. You never see it yourself, but it casts your shadow and is what teammates see.
- Self-shadowing on the arms is a console variable (`r.FirstPerson.SelfShadow 1`).

### Animation

- **Arms:** a small set of looping clips (idle tread, kick-glide stroke, pull, push, grab, tape a cut, check watch), blended by speed and mode in an Animation Blueprint. Hands reach real rock using IK (Control Rig or Two Bone IK) when grabbing, which sells the "pull yourself along rock" feeling far more than any canned clip.
- **Body seen by teammates:** a simple blend space of swim idle, swim forward and grab poses. Teammates mostly see each other as a silhouette in a flashlight beam, so this can be modest.
- **Motion Matching: not for swimming.** It is production ready and excellent for walking, but it needs a large library of motion capture of the exact movement. No free swimming mocap library exists at that scale. Use it later, if at all, only for dry-land walking, using clips from Epic's free **Game Animation Sample** (500+ animations, updated for 5.8).
- Free sources: Mixamo is still free and royalty-free for commercial games (check for usable swim and crawl clips), and the Game Animation Sample. Animation is a place where spending money later can be worth it.

### Ragdoll falls (dry sections)

1. In `Landed()`, the server checks fall speed. Above a threshold it applies damage and sets a replicated `bRagdolled` flag.
2. Every machine switches the body mesh to simulate physics locally. The ragdoll itself is cosmetic and is not synced bone by bone; small differences between screens do not matter.
3. The first-person camera follows the head bone with heavy smoothing, plus a darkened vignette, for 1.5 to 3 seconds. Keep it short to avoid nausea.
4. The server then moves the capsule to where the pelvis landed and plays a get-up animation (the 5.8 Game Animation Sample includes ragdoll get-up clips you can borrow).

## Why this pick

- CMC already does water detection, swimming, crouching, collision and, most importantly, **network prediction and correction**. That is months of work you do not have to write.
- Everything lives in C++ text files that Claude Code can read and edit.
- Mover is the future, but it is still Experimental in 5.8 and 5.8 is expected to be the last UE5 release. Revisit Mover when moving to UE6, not before.

## Risks and honest difficulty

- **Difficulty: medium to get swimming working, very hard to make it the best-feeling system in the game.** Expect "feel" tuning to take many weeks across the whole project.
- Water surfaces at air pockets: CMC can bob or jitter at the boundary between swimming and walking. Plan time to tune the exit-water behavior.
- Saved move bugs are the most common beginner mistake: storing a button state in a normal variable instead of the saved move breaks online. Test with simulated lag (`Net PktLag=150`) early.
- First-person camera motion (bob, roll, ragdoll) can cause motion sickness. Add an option to reduce camera motion.
- Animation quality is the biggest visual risk; placeholder arms will look rough for a long time.

## First prototype step

1. Create a new **C++ First Person** project in UE 5.8.
2. Add `UDiverMovementComponent` (C++), and make the character use it from the start, even before multiplayer.
3. Place one big Physics Volume with Water Volume ticked in a grey-box tunnel.
4. Implement kick-glide (impulse on rhythm plus quadratic drag) and `BCDAir` buoyancy. Show speed, depth and `BCDAir` on screen with debug text.
5. Tune until coasting through the tunnel feels good with the template arms. Only then add real arm animations.

Related: [[Movement and Swimming]], [[Diving Systems]], [[Rope System]], [[Multiplayer, Steam and Voice]], [[Roadmap]].

## Sources
- https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes
- https://gamefromscratch.com/unreal-engine-5-8-released/
- https://dev.epicgames.com/documentation/en-us/unreal-engine/mover-in-unreal-engine
- https://www.strayspark.studio/learn/courses/modern-locomotion-ue5/the-end-of-cmc
- https://www.strayspark.studio/blog/mover-2-0-vs-character-movement-component-ue5-7-2026
- https://dev.epicgames.com/documentation/unreal-engine/python-api/class/MovementMode
- https://dev.epicgames.com/documentation/en-us/unreal-engine/first-person-rendering
- https://80.lv/articles/unreal-engine-5-5-received-native-first-person-rendering-support/
- https://www.unrealengine.com/tech-blog/download-the-latest-game-animation-sample-project-now-updated-for-ue-5-8
- https://www.unrealengine.com/en-US/blog/game-animation-sample
- https://app.cinevva.com/guides/free-character-animations-rigging
- https://unrealcommunity.wiki/authoritative-networked-character-movement-ss8pvvmn
