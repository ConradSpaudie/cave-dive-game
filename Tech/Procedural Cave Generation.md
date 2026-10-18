# Procedural Cave Generation

Technical plan for [[Cave Generation]] and Pillar 4 in [[Game Pillars]]. Researched October 2026 against Unreal Engine 5.8.

## Plain-language explanation

There are three common ways to make caves with code:

1. **Voxel / marching cubes.** The world is a 3D grid of tiny cubes; noise decides which are rock and which are empty, and a mesh is wrapped around the result. Great for diggable terrain. The catch: the surface tends to look smooth and blobby ("mushy"), it does not carry the crisp, scanned rock detail that makes caves look photoreal, and generating and colliding with these meshes at runtime takes real engineering. A free example plugin exists (Instant Organic Caves), and its own notes list missing pieces like async generation and LODs in the free version.
2. **Unreal's PCG framework.** A visual node graph tool that is now **production ready** (since UE 5.7). It is excellent at scattering things on surfaces: rocks, stalactites, moss, bones. It is not designed to be a branching-tunnel layout generator, and PCG graphs are binary editor assets, which means Claude Code cannot edit them (the same problem as Blueprints).
3. **Modular kit plus a generator.** Artists (or asset stores) make a library of high-detail cave pieces: tunnels, bends, junctions, chambers, squeezes, air pockets. A program picks pieces and snaps them together by their openings. **Deep Rock Galactic**, the most successful procedural co-op cave game, uses a version of this: over 100 hand-made room templates connected by tunnels, then varied with noise and biomes.

A **seed** is just a number that the generator uses to make its random choices. Same seed plus same generator code equals the same cave, on every computer.

## Recommended approach

**A grid-based modular kit, laid out by a C++ graph generator, then decorated with PCG.**

### Step 1: plan the cave as a graph (C++)

- The cave is a graph: nodes are spaces (tunnel, chamber, squeeze, air pocket, junction), edges are connections.
- Build a **main spine** from the entrance down to the bottom, split into depth zones.
- Add **branches** off the spine. Most are one-way choices, as the design requires.
- Add **cycles** to get "five routes, two merge and lead somewhere new." This is the "cyclic dungeon generation" idea from the game Unexplored: generate loops on purpose instead of only trees, then decorate them. Mark which branches reconnect and which dead-end into their own rewards.
- All choices use `FRandomStream` seeded from the run seed. Use only integers for decisions.

### Step 2: place the graph on a 3D grid

- Divide space into cells (start at about 16 to 20 m per cell). Each graph node occupies one or more cells; each module has openings ("sockets") only on cell faces, with a size class (squeeze, small, medium, large).
- Grid placement makes overlap checks trivial (a cell is either taken or free) and makes reconnecting branches easy (find a path of free cells between two open sockets). This is the hard problem in freeform module snapping; the grid removes it.
- Each cell has a depth, so depth zones, temperature and creature tables fall out naturally.
- **Endless feel:** generate the cave in segments. When the leader gets near the end of a segment, the server generates the next one from `seed + segmentIndex`. Old segments far behind can be unloaded except for what the rope passes through.

### Step 3: hide the grid (this is where it looks handcrafted)

- **Many variants per module type.** At least 3 to 5 versions of each piece, mirrored and rotated, plus random scale on non-socket axes.
- **Overlap dressing rocks.** After placing modules, scatter large Nanite rocks across every seam using PCG. Overlapping rock kitbashing is how environment artists hide modular joins.
- **Hero pieces.** Rare hand-built chambers (a giant flooded hall, a fossil wall, a glowworm grotto) placed at intervals. These are what players clip and share.
- **Biomes by depth zone** change materials, flora, silt, lighting and creatures on the same module shapes (the Deep Rock Galactic lesson: biomes are a cheap replayability lever).
- **PCG decoration only:** stalactites, small rocks, silt beds, moss, bones, bioluminescent fungi. Use PCG "From Component" seeds driven by the run seed, and keep anything PCG places **without gameplay collision**, so a tiny difference between machines can never matter.

### Step 4: assets that look photoreal

- **Nanite** on every rock mesh, so pieces can be millions of triangles without LOD work.
- **Megascans are no longer free in general.** They were free until the end of 2024; anything claimed then stays usable. Since 2025, most Megascans are paid on Fab, with some free content and regular free giveaways. Read each listing's license.
- Best free option for unique rock: scan real rocks with your phone using Epic's free RealityScan app, then use them as Nanite meshes.
- **Where spending is worth it:** one high-quality modular cave kit from Fab is probably the single best money-for-quality purchase in the project. Buy only after the grey-box generator works, so you know exactly which pieces you need.

### Step 5: Lumen in dark caves (generator rules)

- Every module must be a **closed shell with walls at least 10 cm thick**. Lumen leaks light through thin or open geometry, and caves are the worst case.
- Raise **Lumen Scene Detail** and **Max Trace Distance** if light leaks around corners.
- See [[Water, Light and Silt Visuals]] for the lighting setup.

### Seeds and multiplayer

- The host picks the seed and replicates it (plus the generator version) in the GameState.
- Every machine generates the cave locally from the seed. Because layout decisions use integers and `FRandomStream`, results match across Windows and Mac.
- Also replicate a **checksum** (a hash of the placed module list). If a client's checksum does not match, show "version mismatch" instead of letting players fall through different caves.
- A late joiner just needs the seed and the current segment index, then follows the rope (see [[Rope System]]).
- Show the seed on the end screen so players can share and replay great caves. Free marketing.

## Why this pick

- Matches the vault's own earlier conclusion in [[Engine, Hardware and Platforms]]: hand-made pieces stitched by a generator look better than pure noise.
- It is the approach proven in Deep Rock Galactic at huge scale.
- The layout code is plain C++ Claude Code can write, test and change. PCG is used only where it is strongest (scattering) and where small binary graphs are acceptable.
- The grid makes branching, reconnecting and overlap checks simple enough for a beginner.

## Risks and honest difficulty

- **Difficulty: hard.** The generator itself is a few weeks of focused work; making it look handcrafted is ongoing art work for the whole project.
- **Repetition is the failure condition.** A small kit will feel repetitive fast. Budget for many module variants and hero pieces over time.
- **Navigation bugs:** pieces that technically connect but are impossible to swim through. Write an automatic check that sweeps a diver-sized capsule through every connection after generation.
- **Visible grid:** if every chamber is the same size, players will notice. Use multi-cell modules and vary cell usage.
- **Memory and disk:** Nanite rock and mesh distance fields add up. Keep an eye on project size (the external SSD in [[Engine, Hardware and Platforms]] is required).

## First prototype step

1. Write a C++ actor `ACaveGenerator` that, from a seed, builds a spine of 10 cells with 2 branches and 1 reconnecting loop on a grid.
2. Spawn plain grey boxes for each cell type (different colors for tunnel, chamber, squeeze, air pocket) and draw the graph with debug lines.
3. Print the seed on screen and regenerate with a key press. Check that the same seed always gives the same cave.
4. Then replace boxes with 3 real rock modules (straight, bend, junction) and swim through it.

Related: [[Cave Generation]], [[Water, Light and Silt Visuals]], [[Rope System]], [[Performance and Mac]].

## Sources
- https://devtrackers.gg/deep-rock-galactic/p/8cd5ca9c-below-decks-at-ghost-ship-cave-generation-in-deep-rock-galactic
- https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/
- https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-
- https://www.guru3d.com/story/unreal-engine-57-released-with-new-procedural-content-generation-and-more-features/
- https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes
- https://bugnet.io/blog/fix-unreal-pcg-determinism-different-results
- https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/PCG/UPCGGenerateSeedSettings
- https://gregorigin.itch.io/instant-organic-caves
- https://80.lv/articles/megascans-no-longer-free-after-2024/
- https://80.lv/articles/epic-games-to-launch-tool-for-free-megascans-downloads-in-fab/
- https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine
