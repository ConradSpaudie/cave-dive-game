# Rope System

Technical plan for the rope described in [[Rope and Multiplayer]] and [[Game Pillars]] (Pillar 3). Researched October 2026 against Unreal Engine 5.8.

## Plain-language explanation

The obvious idea is "simulate a real physics rope from the surface stake to every player." That does not work for this game, for three reasons:

1. **Length.** A real-time physics rope is a chain of tiny points joined together. A rope hundreds of meters long through winding tunnels needs thousands of points, each checking collisions against rock every frame. That is far too slow.
2. **Networking.** Physics engines do not give identical results on different computers. If four players each simulate the rope, they each see a different rope. Sending every rope point over the internet every frame is too much data.
3. **Gameplay.** A floppy physics rope snags, stretches, explodes and drags players through walls. Bugs like that are funny once, then they ruin runs.

Unreal's built-in **Cable Component** is exactly this kind of point-chain rope. Its own docs mark its world collision as **Experimental** and say collision "greatly increases" cost. It is a good look for a short dangling cable, not a 300 m gameplay rope.

What real cave divers do is the answer: they lay a **guideline**. The line is tied off around rocks as they go, so it runs in straight, taut sections from tie-off to tie-off. The game's rope can work the same way.

## Recommended approach

**A two-layer rope: a simple, server-owned "bend point" rope for gameplay, plus a cheap local physics rope only for looks near each player.**

### Layer 1: the gameplay rope (server authoritative, replicated)

The rope is stored as a list of points. The chain is: Stake, then the last diver, then the third, the second, and the leader (in the order the team picks).

- **Stake span** (stake to last diver): a polyline of **bend points**. Every tick the server does a thin sphere sweep from the last bend point to the diver. If rock blocks it, a new bend point is added at the corner (the rope "wraps" around the rock). If the diver can see the bend point before the last one again, the last bend point is removed (the rope "unwraps"). This is the classic grappling-hook wrap algorithm, used in 3D.
- **Player spans** (diver to diver): the same wrapping logic, but each span has a **maximum length** (start at 8 m as in [[Proposed Answers]] #16, tune between 6 and 10 m in playtests).
- **Tension:** when a player span is longer than its maximum, both divers feel a **soft spring pull** along the rope toward each other. Soft spring, never a hard locked constraint. This is what makes being dragged by a current, or dragging a teammate, physical and funny.
- **Stored in one actor:** `ARopeManager` (C++), always relevant to all players. Bend points live in a replicated array (use `FFastArraySerializer` so adding a point only sends that point). A run with several hundred bend points is still only a few kilobytes.
- **Late joiners** automatically receive the whole array when they connect, so a player joining mid-dive spawns at the stake and literally follows the rope down (see [[Multiplayer, Steam and Voice]]).

### Layer 2: the visual rope (local only, never replicated)

- The **stake span** is drawn as straight, slightly sagging segments between bend points using Spline Mesh components (or instanced rope segments). Taut guideline does not need simulation. Cheap even at hundreds of meters.
- Each **player span** is drawn with a small custom **verlet rope** in C++ (about 16 to 24 points, a few sphere traces against rock). Each machine simulates it locally from the already-replicated diver positions and bend points. Players see slightly different wiggles, which nobody will ever notice.
- The verlet rope is cosmetic. It never pushes players; only Layer 1 does.
- For the very first prototype you can use the built-in Cable Component for player spans, then replace it with the custom verlet once it clips through rock.

### Rope pull and network prediction (the hard part)

The tension force has to be applied inside the diver's movement code (see [[Swimming and Underwater Movement]]) so it predicts correctly. Each machine calculates the pull from the rope state it knows. Because teammates' positions on your screen are slightly behind where they really are, your machine and the server will sometimes disagree a little, causing small corrections. Keep forces soft and smooth so corrections are invisible. Test with simulated lag from week one.

### Tangling detection

Tangles are a gameplay rule, not physics. The server checks a handful of segment pairs each tick (4 players means at most 4 spans, so this is trivial):

1. For every pair of spans that do not share a diver, find the closest points between their current straight segments.
2. If they come within about 20 cm, record which side one passes relative to the other (the sign of a cross product).
3. When that side **flips**, one rope passed over the other: increment a signed crossing counter for that pair.
4. Treat each diver's body as a short vertical segment too, so a rope wrapping around a teammate counts.
5. When the counter for a pair reaches plus or minus 2 (a full wrap), trigger a **tangle**: both spans get a tight maximum length until the 5 to 7 second untangle mini game is done. Swimming back the other way unwinds naturally because the counter goes back down.

### Rope length as a stat

- **Rope used** = total length of the stake span polyline plus all player spans. Calculated on the server from bend points, so it is cheap and cheat resistant.
- Track the **maximum** rope used per run for the "Most explored" leaderboard ([[Progression, Hub and Leaderboards]]).
- If you later want rope as an upgrade stat (longer player spans, a bigger spool), it is just the max length numbers above.

## Why this pick

- It matches how real cave divers use line, so it looks and behaves believably.
- The gameplay rope is a short list of points with simple math, which is easy for Claude Code to write and easy to debug.
- Cost is tiny regardless of rope length. Only the short player spans are simulated, and only for looks.
- Networking is simple: replicate a list of points, never physics.

## Risks and honest difficulty

- **Difficulty: hard. This is the riskiest system in the game.** Prototype it in phase 2 as planned in [[Roadmap]], before building content that depends on it.
- Wrap and unwrap edge cases: thin rock pillars, tight squeezes and moving players can make bend points flicker. Add small delays and tolerances.
- Prediction corrections when divers pull on each other. Mitigate with soft springs and clamps on maximum pull force.
- A commercial alternative exists: "Rope & Tether" (ArkForge) on Fab claims multiplayer rope wrapping with up to 12 bends and four-character co-op tethers, for UE 5.8, Windows only, C++ source included. It is paid and its price was not listed in the forum post. Worth studying only if the custom version stalls; the bend-point design above is the same idea.
- Chaos physics constraints (physics joints between bodies) look tempting but are a poor fit: they fight the character movement system and are not deterministic across machines.

## First prototype step

1. In a grey-box level with one pillar and two corners, create `ARopeManager` in C++.
2. Implement only the stake span: sphere sweep from the last bend point to one diver, add and remove bend points, draw them with debug lines.
3. Swim around the pillar and back. When bend points add and remove cleanly, add a second diver with a player span and the soft spring.
4. Only after that works with two players over Steam (or two PIE windows with lag), add the visual verlet rope.

Related: [[Rope and Multiplayer]], [[Swimming and Underwater Movement]], [[Multiplayer, Steam and Voice]], [[Procedural Cave Generation]].

## Sources
- https://dev.epicgames.com/documentation/en-us/unreal-engine/cable-components-in-unreal-engine
- https://www.unrealengine.com/blog/cable-component-plugin-for-ue4
- https://forums.unrealengine.com/t/arkforge-rope-tether-multiplayer-climbing-rope-anchors-co-op-tether-blueprint/2839968
- https://gamedev.net/blogs/entry/2260129-grappling-away
- https://www.kodeco.com/312-make-a-2d-grappling-hook-game-in-unity-part-2
- https://github.com/jbrettob/VerletIntegration
- https://www.strayspark.studio/blog/mover-2-0-vs-character-movement-component-ue5-7-2026
