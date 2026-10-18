# Prototypes

Working things you can play or run today, built overnight on Oct 18. Both are also published as private pages in your Claude account.

## 1. Swim Feel Test (play it)
- Page: https://claude.ai/artifact/YWugPxeZjUt6tCsZMu65Ps (title "Tied Under Feel Test")
- File: `Prototypes/swim-feel/index.html`, screenshots in `Prototypes/swim-feel/screens/`
- A browser version of Phase 1 "The Feel": one flooded cave about 245 m long, kick and glide swimming, flashlight with an 8 minute battery, a 10 minute tank, breath buoyancy (hold B to inflate, V to deflate), panic, silt-outs, an air pocket, a squeeze, a guideline rope back to the entrance, waypoints, depth narcosis, generated breathing audio, and a glowing ring at the bottom.
- Press Esc in-game for live tuning sliders (kick strength, rhythm, drag, buoyancy, look sensitivity, field of view). **Write down the slider values that feel best**: they become the starting numbers for the Unreal version.
- Use headphones. Press H to hide the HUD for filming. This is devlog footage.

### What to test (10 minutes, then tell Claude)
1. Does kick and glide feel like swimming, or like flying? Which slider fixed it?
2. Is the darkness scary in a good way, or just annoying?
3. Does the breathing sound make you feel underwater?
4. Silt-out: sprint over the brown floor. Funny, scary, or frustrating?
5. B/V buoyancy: fun or fiddly?
6. Did you ever want the rope to find your way back?

Known limits: no hands on screen, no collision with stalactites, the silt cloud reads as a haze, the water surface is flat. This prototype tests feel, not graphics; the Unreal version is where it becomes photoreal.

## 2. Cave Generator Lab (run it)
- Page: https://claude.ai/artifact/BVoFb377cVsproTNxVYuST
- Files: `Prototypes/cave-gen/` (generator, 1000-seed tests, visualizer). Spec: [[Cave Generator Algorithm]].
- Type a seed and see the whole cave from the side and from above, colored by depth zone. Same seed gives the same cave on every machine, which is how co-op players will all get the same cave.
- Measured: standard runs about 38 minutes, easy about 16, hard about 58. Never more than about 6 minutes of swimming between air sources.

## 3. Unreal starter code (build it after setup)
- Private repo: ConradSpaudie/cave-dive-game-unreal
- Contains the C++ for Phase 1: diver, swimming movement, air, buoyancy vest, panic, flashlight, silt, air pockets, rope, waypoints, a HUD that works with no editor setup.
- Not compiled yet (no engine here). An independent review puts first-try compile odds at about 75 to 85 percent. Read `REVIEW.md` in that repo before your first build; `README.md` walks through it.
- Once you finish the [[Setup Guide]], most of [[Phase 1 Prompts]] becomes "review and wire up" instead of "write from scratch."
