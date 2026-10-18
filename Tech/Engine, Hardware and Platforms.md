# Engine, Hardware and Platforms

## Decided
- Engine: Unreal Engine 5. Photorealistic target.
- Platform: Steam. Windows first; Mac too if it can handle it, dropped if not.
- No Roblox version.
- Development machine: one Mac.
- Programming: Claude Code in the terminal.
- Controls: keyboard and mouse only for now. No controller at launch.
- Source control: GitHub. Design docs: this Obsidian vault.

## Blockers to solve before writing any game code

### 1. Disk space (critical)
- The Mac has about 7 GB free. Unreal Engine 5 plus Xcode plus a photoreal project needs well over 100 GB. Expect the engine alone to take tens of GB, Xcode another 10 to 40 GB, and high-detail rock assets and build caches to grow fast.
- Fix: buy a fast external SSD (1 TB, USB-C, roughly $150 to $250 in 2026, see [[Setup Guide]]) and put the engine and project on it. This is the one purchase worth making.

### 2. You cannot build the Windows version on a Mac
- Unreal can't package a Windows build from macOS; packaging for Windows requires a Windows machine, and packaging for Mac requires a Mac.
- Most Steam players are on Windows, so the team needs access to a Windows PC at least for building and testing releases (a friend's or family PC, a school computer lab with permission, or a cloud Windows machine later).

### 3. Mac rendering limits
- Unreal's Mac requirements list Lumen (real-time lighting) as supported on Apple Silicon M1 and up, while Nanite (high-detail geometry) and Virtual Shadow Maps are only beta-supported on M2 and up. Epic recommends an M3.
- Need to confirm which chip and how much RAM the Mac has.

## Proposed target specs (Windows, to be tested)
| | Minimum (low settings, 1080p, 30 fps) | Recommended (high, 1080p, 60 fps) |
|---|---|---|
| OS | Windows 10/11 64-bit | Windows 11 64-bit |
| CPU | Intel i5-10400 / AMD Ryzen 5 3600 | Intel i5-12400 / AMD Ryzen 5 5600X |
| RAM | 16 GB | 16 to 32 GB |
| GPU | GTX 1660 Super / RX 5600 XT (6 GB) | RTX 3060 / RX 6700 XT |
| Storage | 40 GB SSD | 40 GB SSD |

Mac (if supported): Apple Silicon M2 or newer, 16 GB unified memory.

## Technical approach notes
- Procedural caves that look handmade: build a library of high-detail modular rock pieces (tunnels, chambers, squeezes, junctions) and have a generator stitch them together. Pure noise-generated caves tend to look mushy.
- Water: most of the game is "inside" water, so this is mainly post-processing (fog, light shafts, particles, caustics) plus a few real water surfaces at air pockets.
- Multiplayer: Unreal has built-in networking. Steam lobbies and voice through the Steam online subsystem; proximity voice can use Unreal's voice chat or a plugin.
- The rope: a physics cable connecting every player. This is technically one of the hardest systems in the game and should be prototyped early.
- Free assets: Fab (Epic's asset store) gives away free assets regularly. Check current licensing terms on Megascans before relying on them.
- Unreal Blueprints vs C++: Claude Code works with text files, so C++ is easier for Claude to write and edit. Blueprints are visual and need to be done by hand in the editor. Plan: core systems in C++, simple glue in Blueprints.
