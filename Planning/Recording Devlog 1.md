# Recording Devlog 1

How to record great-looking footage of Tied Under for $0, which sizes to export for each app, and a 20 to 30 second shot list that shows every Phase 1 feature. Written Oct 22, 2026 for Phase 1 Prompt 12 in [[Phase 1 Prompts]]. Related: [[Personal Brand and Marketing]], [[Content Calendar]], [[Art Direction]], [[Performance and Mac]].

## The one-minute version
1. Press Play. Press Backtick (the key left of 1) to open the console.
2. Type `stat none`, Enter. Then type `dive.Cinematic`, Enter. Press Backtick again to close the console.
3. Press Cmd+Shift+5, pick "Record Selected Portion", drag the box over the game, click Record.
4. Swim the shot list below. Click the stop button in the menu bar.
5. Back in the console, type `dive.Cinematic` again to turn recording mode off.

## What `dive.Cinematic` does
- Hides the whole HUD (air, depth, battery, the F3 debug block and the mask water line) and all on-screen debug text.
- Turns off debug drawing (`dive.Debug 0`), so no silt boxes or rope debug lines.
- Locks the field of view to 80 degrees (the game normally uses 90). Slightly tighter looks more like a film camera and makes the tunnel feel closer.
- Smooths the camera a little, like a camera on a gimbal. Small mouse shakes disappear. Your arms and flashlight move with the smoothed view.
- Gentle motion blur and a 60 fps cap, so a screen recording gets evenly spaced frames.
- `dive.Cinematic hq` does all of that and also renders every pixel instead of upscaling. It is sharper but slower: only use it in a game window about 1920 x 1080 or smaller.
- Type `dive.Cinematic` again and every setting goes back to how it was. Stopping Play also puts everything back.
- To change the numbers (field of view, smoothing time, blur), ask Claude Code to change the defaults in `UDiveCinematicComponent`.

## Sizes and frame rates

| Where | Shape | Export size | Frame rate | Length |
|---|---|---|---|---|
| TikTok | Vertical 9:16 | 1080 x 1920 | 30 or 60 fps (60 is smoother) | 20 to 30 s |
| Instagram Reels | Vertical 9:16 | 1080 x 1920 | 30 fps (safest) | 20 to 30 s |
| YouTube Shorts | Vertical 9:16 | 1080 x 1920 | 30 or 60 fps | 20 to 30 s |
| YouTube, Steam page, X | Horizontal 16:9 | 1920 x 1080 (or 3840 x 2160 from Movie Render Queue) | 60 fps for gameplay, 30 for trailers | any |

Easy rule: **record at 60 fps, export vertical at 1080 x 1920, 30 fps for Instagram and 60 fps for TikTok and Shorts.**

Safe zone for vertical: the apps cover the bottom fifth of the screen (caption, buttons) and a strip on the right (like, comment, share). Keep the flashlight beam and the action in the middle. Put your own text in the upper middle.

## Option A: quick and free (macOS screen recording)
Best for most devlogs. What you see is what you get, including silt, breathing, panic and the mask.

**Set up a game window the right shape**
1. In Unreal: Edit menu > Editor Preferences > Level Editor > Play.
2. Under Game Viewport Settings, set New Viewport Resolution:
   - Horizontal: 1920 x 1080.
   - Vertical: 1080 x 1920. If the window is taller than your screen, use 720 x 1280. A Mac records the window at its full screen sharpness, so you still export at 1080 x 1920.
3. Next to the Play button, open the three dots menu and pick **New Editor Window (PIE)**. Press Play. The game opens in its own window at that size.

**Record**
1. In the game: Backtick, `stat none`, `dive.Cinematic`, Backtick to close the console. Click into the game window so the mouse is captured.
2. Press Cmd+Shift+5. Pick **Record Selected Portion** and fit the box exactly to the game window (or pick Record Entire Screen and crop later).
3. In Options: turn off Show Mouse Clicks. Microphone: None (unless you are talking over it).
4. Click Record. Do 3 or 4 takes of each shot, the editor is cheap and good takes are rare.
5. Stop with the stop button in the menu bar. The file lands on the Desktop as a .mov.

**Sound:** the macOS recorder does not capture game sound. Two free fixes:
- Use **OBS Studio** (free) instead of Cmd+Shift+5. Add a "macOS Screen Capture" source set to the Unreal window; it records the game's sound too. Set Output to 60 fps, 1080 x 1920 canvas for vertical.
- Or record silent and add breathing in the editor app. Real breathing audio up front is the hook, so record your own regulator-style breathing into your phone if the game sounds are not hooked up yet.

## Option B: highest quality (Take Recorder plus Movie Render Queue)
Best for a hero shot or a trailer. Unreal re-renders the moment offline, frame by frame, with perfect motion blur and anti-aliasing, at any size (even 4K vertical) no matter how slow your Mac is.

Both are built-in, free Epic plugins. CLAUDE.md says new plugins need your OK first: enabling them is your decision, so add a line to [[Decision Log]] if you do.

**Limits to know first:** Take Recorder records how things move (camera, arms, body, lights, objects). It does not re-run our C++ while rendering, so effects that are computed live may not appear in the render: the underwater color and silt murk on the camera, the mask water line, panic vignette, and possibly the flashlight flicker. Use Option B for the clean shots (swim in, flashlight around the corner, hover) and Option A for the silt-out and breathing moments.

**Enable the plugins (once)**
1. Edit > Plugins. Search **Take Recorder**, tick it. Search **Movie Render Queue**, tick it. Restart the editor.

**Record a take**
1. Window > Cinematics > **Take Recorder**.
2. Press Play (in the viewport is fine). In Take Recorder, click **+ Source** > **Player**. This records your diver, its camera, arms and lights.
3. Click the big red record button, wait for the countdown, swim the shot, then click stop. Stop Play.
4. The take is saved as a Level Sequence under `Content/Cinematics/Takes`. Double-click it to open it in Sequencer and scrub through to check it.
5. If the Sequencer view does not look through the diver's camera, add a **Camera Cuts** track (+ Track > Camera Cut Track) and bind it to the recorded diver.

**Render it**
1. Window > Cinematics > **Movie Render Queue**. Click **+ Render**, pick your take.
2. Click the settings (Unsaved Config):
   - **Output**: Output Resolution 1080 x 1920 (vertical) or 1920 x 1080 (horizontal). Frame rate: use the sequence frame rate, or override to 30 or 60.
   - **+ Setting > Anti-aliasing**: Temporal Sample Count 8. This also gives real, film-like motion blur.
   - Output format: add **Apple ProRes** (if listed) or keep the default **.png sequence**. A png sequence imports into CapCut or iMovie as frames; ProRes is one easy video file.
3. Click **Render (Local)**. Expect several minutes for 30 seconds. The files land in `Saved/MovieRenders`.
4. If the render shows only black or an empty level, the test tunnel may be the one the game mode builds at Play (it does not exist outside Play). Fix: build the handmade `L_TestTunnel` from the README and record there.

## The shot list (about 25 seconds)
Do each line as its own take, then cut them together. Swim slowly: slow looks expensive. Flashlight on (F) unless the line says otherwise.

| Time | Shot | How to do it | Feature shown | Text on screen |
|---|---|---|---|---|
| 0 to 3 s | **Hook: the beam in black.** Start in total dark, light off. Click the light on and the beam cuts the water. | F to switch on. Hold still for half a second first. | Flashlight, darkness | "Day X of making a cave diving game" |
| 3 to 7 s | **Swim in.** Slow frog kick down the tunnel, beam ahead, arms visible stroking. | W, small mouse moves only. Stroke K: frog kick. | First-person swimming, hands | "Tied Under" |
| 7 to 11 s | **Around the corner.** Swim up to a bend, let the beam reach around it first, then follow it in. | Turn slowly with the mouse as you pass the bend. | Flashlight and darkness | none, let it breathe |
| 11 to 14 s | **Hover.** Stop kicking. Puff air into the vest until you hang still, then let a little out and sink gently. | B a few taps, then V briefly. | Buoyancy (BCD) | "you breathe into your vest to float" |
| 14 to 17 s | **Breathing gets faster.** Sprint hard into the next stretch. The breathing and bubbles speed up. | Hold Left Shift. | Air, breathing, panic | "your air is your timer" |
| 17 to 21 s | **Silt-out.** Kick hard right above the silt floor. The cloud rises and swallows the beam until you see nothing. | Sprint low over a DiveSiltVolume. Hold on the white-out for a full second. | Silt-out | "one kick and you're blind" |
| 21 to 24 s | **The rope saves you.** In the silt, grab the rope and pull yourself along it, or tug it. | R and W along the rope, or T to tug. | The rope | "the rope is the only way out" |
| 24 to 27 s | **Glow stick.** Crack a glow stick and throw it ahead into the dark. It lands and glows. End on it. | G to take, G to crack, hold G to aim, release to throw. | Glow sticks | "follow for part 2" |

Tips:
- The first 2 seconds decide everything. If a shot is not gripping, cut it shorter.
- Hard cuts on a breath or a kick feel natural. No fancy transitions.
- Keep each clip short (3 to 4 seconds). Twenty-five seconds is plenty.
- Record the horizontal version at the same time if you can (same takes at 1920 x 1080) for YouTube and the Steam page later.

## B-roll shot list (the recording helpers)
Three console commands record shots for you, so your hands stay off the mouse and the moves are perfectly smooth. They are always first person (the diver's own eyes), never a camera outside the diver. Start each one with `stat none` and `dive.Cinematic` on, then start the screen recording, then type the command. Press W, A, S, D, Space or Shift (or type the command again) to stop early; you are put back exactly where you were.

| Shot | Command | Use it for |
|---|---|---|
| **Drift in.** The camera glides from the entrance into the dark, beam ahead. | `dive.GoTo 0`, then `dive.Flythrough 20` | Opening shot, "Tied Under" title over it |
| **The squeeze.** Slow glide through the narrow part, rock close on every side. | `dive.Flythrough 25 0.7 58 74` (the Restriction is at about 68 m) | Tension beat. Slower (0.7) feels tighter |
| **Into the chamber.** Glide from the squeeze into the big room and stop in the middle. | `dive.Flythrough 12 1 102 122` (the chamber is at about 110 to 137 m) | The "wow" moment |
| **Look around the chamber.** Hover in the middle and slowly look left, up at the air pocket, right, back. | `dive.GoToMark Chamber`, then `dive.LookAround 18` | Establishing shot, voiceover space |
| **Look around in the dark.** Same, light off (F), one cracked glow stick thrown ahead first. | `dive.LookAround 20` | Horror beat, "what's down there" |
| **The way back.** Glide from deep toward the entrance (the camera faces back up the tunnel). | `dive.Flythrough 40 1 120 20` | Ending shot, or the "can you make it back" hook |
| **Thumbnail and Steam stills.** Freeze the best moment as a big clean picture. | `dive.Shot` (or `dive.Shot 4` for a poster) | YouTube thumbnail, Steam screenshots, Instagram post |

Tips:
- Record each B-roll shot 2 or 3 times; the bob and roll are a little different every take.
- For a vertical video, the flythrough keeps the tunnel center in the middle of the frame, which is exactly the safe zone.
- Air keeps running during a long flythrough. Type `dive.RefillAir` between takes.
- Screenshots land in the project folder under `Saved/Screenshots`, named with the date and time.

## Edit and post
1. Edit for free in **CapCut** or **iMovie**. Put real breathing audio at the very start.
2. Export 1080 x 1920. Post the same video to TikTok and Reels the same day (see [[Content Calendar]]).
3. Write down what you posted and how it did in [[Decision Log]] or the content calendar, and mark Phase 1 done in [[Roadmap]].

## If something looks wrong
- **Game is choppy while recording:** in the console, `stat unit` (see the README "Performance check" section) and send the numbers to Claude Code. Try a smaller game window, or drop `hq`.
- **Stat numbers in the video:** you forgot `stat none`.
- **The HUD is back:** someone typed `dive.Cinematic` twice, or Play restarted. Type it again.
- **The mouse cursor shows:** click into the game window once before you start recording.
- **The picture is grey instead of black:** exposure. Check the Post Process Volume is set to Manual exposure (README, "Make the test level", step 5).
