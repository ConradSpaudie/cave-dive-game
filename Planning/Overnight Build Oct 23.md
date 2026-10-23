# Overnight Build (Oct 23, 2026)

Conrad's ask before bed: make the hands and body move with you when you turn and move (visually intuitive), make swimming smoother using real swim animation as the standard, then keep building through the night.

Everything below was compiled on the M5 and tried in Play unless it says otherwise. Code is on GitHub (cave-dive-game-unreal, main).

## Your body steers (the main ask)
- **Research first:** how real divers turn, strafe, rise and back up (helicopter turn, back kick, sculling), and how first-person games show it. Written up in `Docs/SwimAnimationResearch.md` in the code repo.
- **Turning:** the body leads the view a little and rolls into the turn. Hovering, the outside hand reaches forward and sweeps out to pull you around, the light hand tucks in. Swimming, the outside arm strokes bigger and the inside one smaller.
- **Strafing, rising, sinking, backing up:** sideways sculls, palms pressing down or sweeping up, back sculls, with matching fin kicks.
- **In view:** the first version did all of this at chest height, so only fingertips showed at the bottom of the screen. The strokes are now lifted into view (`SteerHandLift` 0.4, tune live with `DiveSteerLift`).
- **Smooth:** every weight eases with springs that cannot overshoot or pop, and every limb trails a follow spring. `DiveBodyMotion 0/1` compares old and new.
- **Your hands touch the rock:** short feeler rays find rock around you. A close wall or a low ceiling gets a palm laid flat on it, and in a squeeze the free hand pulls you through in time with the kick. A soft scrape plays when a palm lands. It shows best on low ceilings (the bedding plane); a side wall right beside you is just outside the view, like in real life. `DiveWallTouch 0/1` compares.

## Rewards look and feel better
- Big, sharp reward cards (the engine's "large" font was the small one stretched, so text was blurry).
- Pickup cards pop in, count up their dollars and fly them to the haul counter. Rare and Legendary cards get a colored screen edge glow; Legendary gets gold rays.
- Skill callouts slam in like a stamp. Diver's slates look like pencil notes. The end slot pull ring is bigger, shakes near the end and bursts.
- `DiveJuice` previews each effect without playing to it.

## Silt
- Silt is tan when thin and murky brown when thick.
- The white disc in a silt-out is gone: it was the dive light lighting up the fog right in front of the lens (proved by switching volumetric fog off). The beam's glow now fades out as soon as there is real silt around you or in the first 3 m ahead. `DiveSiltScatter` tunes it live.

## Testing tools
- **Autopilot:** `dive.AutoDive full` plays a whole dive on its own (finds, slates, air bell, end slot, the swim out) and prints a pacing report. Use it as a smoke test after every build.
- **Practice dives:** teleports, `dive.RefillAir`, `dive.MarkEnd` and the autopilot now keep a dive out of your saved progress (no bests, stars or collection). The slate says "Practice dive: nothing saved." Before this, test runs had set a best time of 0:15. Your old save is backed up as `Saved/SaveGames/DiveProgress_backup_Oct23_night.sav`.

## What the autopilot measured
| Run | Time | Beats | Longest gap | Finds | Result |
|---|---|---|---|---|---|
| Full speed | 5:54 | 33 (one every 11 s) | 34 s (162 to 140 m, right after the end slot) | 14 of 15, $1774 | Back out with 11% air, 3 stars |
| 70% speed | 7:43 | 35 (one every 14 s) | 39 s (165 to 140 m) | 12 of 13 | Bled out on the way back with 54% air left (it never taped a cut; the autopilot tapes now) |
| Full speed, final build | 5:58 | 32 (one every 11 s) | 33 s (160 to 140 m) | 13 of 13, $1040 | Back out with 14% air, 3 stars |
| Full speed, final build again | 6:11 | 35 (one every 11 s) | 31 s (136 to 155 m) | 14 of 14, $1960 | Back out with only 3% air after a free-flow, 2 cuts, 3 stars |

The longest gap was always the same place: leaving the end slot through the silt room, where you have to swim slowly. Two changes for it:
- **Return-only finds:** finds on "coming back" spots (a crack you only see on the ascent, the silt room corner once the silt settles) now stay hidden until you touch the End, then appear. Before, a thorough diver grabbed them on the way in and the swim back had nothing.
- **Silt room gap rule:** 15 m instead of 26 m, because you swim slowly there.
The next autopilot run picked up the silt room find on the way out (gap there about 33 s). The run after the ledge fix below had its longest gap at 29 s, under the 30 s target for the first time, with the air bell taken, 10% air left and 2 stars.
- **Review pass:** a second look found that the stalactites are part of the same kind of mesh as the rock, so the first ledge and water fixes only half worked. Fixed properly; the next autopilot run took the air bell, collected all 14 finds and came back with 33% air and 3 stars.
- **Air bell ledge fix:** set pieces treated a stalactite tip hanging into the chamber pool as "the wall", so on some seeds the ledge sat in the middle of the water right above where you come up, and you could not surface past it. Set pieces now only sit on real cave rock.

## Decisions for Conrad
1. **Air is too tight for a first dive.** The fast autopilot, which never wastes a kick, came back with 14%, 11% and once only 3% (after a free-flow). A first-time player who stops to look around will drown on the way out. The simplest fix is a bigger starting tank (or a slightly lower breathing rate). The air bell top-up helps but is not enough on its own.
2. **Cuts kill.** An untaped cut took the slow run from 100% to 0 health in about 3 minutes on the way back. The hint card teaches X, but this may be harsher than the 85% fun / 15% tension split.
3. **Phase order** (still open from last night): Roadmap says Phase 2 is co-op, the Unreal Build Plan says cave generator first.

## Fixes found tonight
- In the chamber, the air pocket's water showed hard straight edges from below. Stalactite tips hanging below the water line made the water get fitted far too small. It now measures only the cave rock.
- The autopilot could loop forever surfacing at the air bell, or retry a stuck spot for 20 minutes. Both capped.
- A review pass fixed the autopilot letting go of keys when the game window loses focus, and its report mixing two clocks.
