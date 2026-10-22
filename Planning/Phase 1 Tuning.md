# Phase 1 Tuning Cheat Sheet

The 10 numbers that change how a dive feels the most, what each one does, and where it is. Written Oct 22, 2026 for [[Phase 1 Prompts]] Prompt 11. Numbers are the current defaults in the code.

## How to change a value

**For keeps: the tuning file.**
1. In the Content Browser: right-click > Miscellaneous > **Data Asset** > pick `DiveTuningData`, name it `DA_DiveTuning` (once).
2. Open `BP_DiveCharacter`, find **Tuning Data** (category Dive|Tuning) and pick `DA_DiveTuning`. Compile, Save.
3. Open `DA_DiveTuning`. Every value has a small checkbox next to it. **Tick the box** to use that value, then change the number. Unticked values are ignored, so the game keeps its normal default.
4. Press Play. The ticked values are copied into the diver when the dive starts.
5. Changed it while playing? Type `dive.ApplyTuning` in the console (Backtick) to copy it in again. Most values change at once. Battery sizes and tank sizes only change on the next Play.

**For quick experiments: the Details panel during Play.**
Press Play, press F8 to get the mouse back, click the diver in the Outliner, pick the component (for example `CharMoveComp` for swimming or `Buoyancy` for the vest) and change the number. It works instantly, but it is **thrown away when you stop Play**. When you find a number you like, write it down and put it in `DA_DiveTuning`.

Rule for every session: change one value at a time, swim the same stretch of tunnel, write down what felt better in the log at the bottom.

## The 10 values

| # | Value | Where (tuning file group / component) | Now | What it does | Turn it up | Turn it down |
|---|---|---|---|---|---|---|
| 1 | **Kick Impulse** | Movement / `CharMoveComp` | 95 cm/s | How much speed one fin kick gives you. The main "how strong am I" number. | Punchier, faster | Heavier, more effort |
| 2 | **Kick Period** | Movement / `CharMoveComp` | 0.8 s | Time between kicks while you hold W. Sets the rhythm of swimming (and of the camera bob and arms). | Slower, calmer rhythm | Busier, faster kicking |
| 3 | **Forward Quadratic Drag** | Movement / `CharMoveComp` | 0.003 per cm | How fast high speed bleeds away. Decides how long you glide after a kick. (Its partner Forward Linear Drag, 0.5, controls the last slow coast to a stop.) | Stops sooner, thick water | Longer glides, slippery |
| 4 | **Max Dive Speed** | Movement / `CharMoveComp` | 140 cm/s | Normal top speed (1.4 m/s). Kicks fade out as you get close to it. Sprint has its own cap (250). | Faster cruising | Slower, more careful |
| 5 | **Acceleration Per Liter** | Buoyancy / `Buoyancy` | 18 cm/s² per liter | How hard each liter of air in your vest (above or below neutral) pushes you up or down. Decides how twitchy hovering is. | Twitchy, every puff matters | Lazy, forgiving |
| 6 | **Depth Compression Strength** | Buoyancy / `Buoyancy` | 1 | How much depth squeezes the vest. 1 is real physics: go deeper and you sink faster, rise and you shoot up. 0 turns it off. | Harder, more realistic | Easier hovering |
| 7 | **Camera Sway** | Camera / the diver itself | 0.6 | Master slider for all head movement: kick bob, breath bob, stop drift and strafe roll (not panic shake). 0 is rock steady, 1 is full. | More alive, more motion | Steadier, less motion sickness |
| 8 | **Flashlight Intensity** | Flashlight / `Flashlight` | 8000 cd | Brightness of the beam at full battery. Always tune it together with the Exposure Compensation in the level's Post Process Volume. | Brighter beam | Darker, scarier |
| 9 | **Medium Tank Seconds** | Tanks / `Tanks` | 600 s (10 min) | Air in the default tank, in seconds of calm breathing. Sprinting uses 2x, panic up to 2x more. For testing, try 30. | Longer dives | More pressure |
| 10 | **Silt Speed Threshold** | Silt / every `DiveSiltVolume` | 90 cm/s | Swim slower than this near a silty floor and you stir up nothing. Faster, and the water clouds up (Stir Rate 0.004 says how fast). | Silt-outs are rarer | Silt-outs are easier to cause |

## Also worth a look

- **Darkness Panic Per Second** (Panic group, 0.05): how scary it is with the light off. 0.05 = full panic after 20 seconds of darkness.
- **Main Light Seconds** (Flashlight group, 900 = 15 min) and **Backup Light Seconds** (300 = 5 min each). For testing a dying light, `dive.SetBattery 8` is faster.
- **Look Sensitivity** (Camera group, 1) and **Field Of View** (Camera group, 90 degrees).
- **Swim Variation** (Body group, 1): 0 makes the arms robotic, 1 makes every stroke a little different.

## Test commands (Backtick opens the console during Play)

| Command | What it does |
|---|---|
| `dive.RefillAir` | Fills every tank (and stops a drowning fade) |
| `dive.SetBattery 8` | Sets the light you are using to 8 percent (0 to 100) |
| `dive.ClearSilt` | Clears all silt at once |
| `dive.TeleportStart` | Back to where the dive began |
| `dive.ApplyTuning` | Copies `DA_DiveTuning` into the diver again |
| `dive.Debug 1` | Debug numbers on screen (same as F3) |

## Tuning log

| Date | Value | From | To | What felt better or worse |
|---|---|---|---|---|
| | | | | |
