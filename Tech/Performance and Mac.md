# Performance and Mac

Technical plan for frame-rate targets, scalability and whether to ship on Mac. Builds on [[Engine, Hardware and Platforms]]. Researched October 2026 against Unreal Engine 5.8.

## Plain-language explanation

- **Frame rate (fps)** is how many images per second the game draws. 60 fps means each frame must be finished in 16.6 milliseconds (ms); 30 fps gives 33.3 ms.
- **Nanite** lets you use extremely detailed rock meshes without hand-making simpler versions. **Lumen** is real-time bounce lighting. Both are what make UE5 look photoreal, and both cost GPU time.
- **Scalability settings** are the Low / Medium / High / Epic options in a game's menu. Unreal has these built in; your job is to decide what each level turns down.
- **Upscaling (TSR)** draws the game at a lower resolution and sharpens it up. It is the main way UE5 games hit 60 fps on mid-range PCs.
- On Mac, Unreal runs through Apple's **Metal** graphics system, and not every UE5 feature is fully finished there yet.

## Recommended approach

**Target Windows first with Nanite + Lumen (software) at 1080p, keep the Mac as the development machine, and do not promise a Mac release until after the free Steam Playtest.**

### Realistic Windows targets

| | Minimum (Low) | Recommended (High) |
|---|---|---|
| GPU | GTX 1660 Super / RX 5600 XT (6 GB) | RTX 3060 / RX 6700 XT |
| Target | 1080p output, 30 fps | 1080p output, 60 fps |
| Rendering | TSR from about 50 to 60% resolution, Lumen Lite or low Lumen, low volumetric fog | TSR from about 67%, Lumen software ray tracing, full volumetric fog |
| Extras | No MegaLights | MegaLights only at Epic on RTX 20 series and newer |

The RTX 3060 is reportedly one of the two most common GPUs on Steam (June 2026 survey), so "High at 60 fps on a 3060" is the right headline target. RAM: 32 GB is reportedly now the most common Steam configuration, but plan for 16 GB to work.

### Starting frame budget (60 fps on an RTX 3060, rough guide to tune against)

| Item | Budget |
|---|---|
| Nanite geometry and base pass | 3 ms |
| Lumen GI and reflections | 4 to 5 ms |
| Shadows (4 flashlights, Virtual Shadow Maps) | 2 ms |
| Volumetric fog and silt | 1.5 ms |
| Translucency, particles, water surfaces | 1.5 ms |
| Post-process, TSR, UI | 2 ms |
| Headroom | about 2 ms |

Measure with `stat unit`, `stat gpu`, `profilegpu` and Unreal Insights. Check the budget every few weeks, not at the end.

### Scalability plan

Use Unreal's built-in scalability groups through `GameUserSettings`, exposed in a settings menu:
- **Global Illumination:** Epic/High = Lumen; Medium/Low = Lumen Lite (new in 5.8, Beta, about twice as fast as high-quality Lumen and the default for handhelds).
- **Shadows:** controls Virtual Shadow Map resolution and the volumetric fog grid.
- **Effects:** silt sprite count, bubbles, plankton. Volume-domain silt stays on at all levels because it is gameplay.
- **Resolution scale:** TSR percentage slider.
- **Epic only:** MegaLights (needs hardware ray tracing).
- Also an FPS cap and a "reduce camera motion" option (see [[Swimming and Underwater Movement]]).

### What runs on Mac (UE 5.8 official table)

| Feature | Mac requirement | Status |
|---|---|---|
| Lumen, software ray tracing | Apple Silicon M1 or newer | Supported |
| Lumen hardware ray tracing and MegaLights | M2 or newer | Experimental |
| Nanite and Virtual Shadow Maps | M2 or newer | Beta |
| TSR upscaling | M1 or newer | Supported, but costs more on Apple Silicon |

- **Nanite does not work at all on M1.** Epic says M1 cannot meet their quality bar.
- Epic recommends an **M3 with 32 GB** for development; the minimum is 16 GB.
- **Xcode:** minimum 26.0, recommended 26.1.1, and **Xcode 26.4 is not compatible** with UE 5.8. Do not let the Mac auto-update Xcode.
- Mac is roughly 2% of Steam users (Windows 94.1%, Linux 3.7% in June 2026).
- Shipping a Mac build requires **Apple notarization**, which requires the **Apple Developer Program ($99 per year)**. That is the main extra cost of Mac support.
- Mac and Windows players can play together over Steam Sockets as long as they run the same version.

### Recommendation on keeping Mac support

**Keep Mac as the place you build the game; ship Windows only at launch; decide on a Mac release after the Playtest.** Concretely:

Note: this conflicts with Conrad's answer 11 in [[Answers Round 1]] ("Mac support: yes, if the Mac can handle it"). This is a proposal only; Conrad decides whether Mac ships at launch.
1. First, confirm the dev Mac's chip and RAM (still an open question in [[Engine, Hardware and Platforms]]). If it is an **M1**, Nanite will not render in the editor and the photoreal look cannot be judged on it; testing on a Windows PC becomes essential, not optional. If it has **8 GB RAM**, UE5 photoreal work on it is not realistic.
2. Store page lists Windows only at first.
3. After the free Playtest, ship Mac only if **all three** are true: an M2 or newer Mac runs Medium at 30 fps or better, players are actually asking for it, and the $99 per year Apple fee is worth it.
4. Steam Deck is a better cheap extra audience than Mac: it runs the Windows build through Proton, and Lumen Lite targets handhelds. Test it once the Playtest is live.

## Why this pick

- 94% of Steam is Windows, and the target GPUs are well understood.
- Software Lumen plus Nanite runs on the minimum spec, while MegaLights and hardware ray tracing stay optional extras.
- The Mac is good for building and editing, but its key features are still Beta or Experimental on Metal, and shipping there costs money every year for about 2% of players.

## Risks and honest difficulty

- **Difficulty: medium, but it is constant work.** Performance problems found late are the hardest to fix.
- Lumen in very dark scenes plus volumetric fog plus silt is a heavy combination; the silt-out is the moment frame rate is most at risk.
- **You cannot test Windows performance on a Mac.** You need regular access to a Windows PC with a target GPU (ideally an RTX 3060 class and a GTX 1660 class). Packaging the Windows build also needs Windows.
- Mac numbers from the editor do not represent players' Macs. Test packaged builds.
- Beta and Experimental Mac features can change or break between engine hotfixes.

## First prototype step

1. Find out the Mac's exact chip and RAM (Apple menu, About This Mac) and write it in [[Engine, Hardware and Platforms]].
2. In the "Feel" prototype tunnel ([[Roadmap]] phase 1), turn on `stat unit` and `stat gpu` and screenshot the numbers with one flashlight, volumetric fog and a silt burst.
3. When you have the borrowed Windows PC (planned for Phase 5 in [[Proposed Answers]] #3, sooner if the Mac turns out to be an M1), make the first Windows package and record the same numbers. These two screenshots become the performance baseline.

Related: [[Engine, Hardware and Platforms]], [[Water, Light and Silt Visuals]], [[Procedural Cave Generation]], [[Multiplayer, Steam and Voice]].

## Sources
- https://dev.epicgames.com/documentation/en-us/unreal-engine/macos-development-requirements-for-unreal-engine
- https://www.unrealengine.com/tech-blog/bringing-unreal-engine-on-macos-up-to-feature-parity-with-windowsprogress-report
- https://dev.epicgames.com/documentation/en-us/unreal-engine/hardware-and-software-specifications-for-unreal-engine
- https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes
- https://www.guru3d.com/story/unreal-engine-58-debuts-lumen-lite-and-productionready-megalights/
- https://dev.epicgames.com/documentation/en-us/unreal-engine/megalights-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine
- https://tech-insider.org/steam-hardware-survey-june-2026/
- https://ebitengine.org/en/documents/steam.html
- https://www.strayspark.studio/blog/apple-silicon-m5-unreal-engine-development-2026
- https://dev.epicgames.com/documentation/en-us/unreal-engine/using-steam-sockets-in-unreal-engine
