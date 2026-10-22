# Devlog 1 Script

> **DRAFT for Conrad to rewrite in his own words.** Written by Claude on Oct 22, 2026 while nobody could answer questions. Every voiceover line is a starting point: say it out loud, then change anything that does not sound like you. The commands and keys are real (checked against the README and the code tonight).

Related: [[Recording Devlog 1]] (how to record, sizes, OBS), [[Overnight Build Oct 22]] (what exists), [[Content Calendar]], [[Launch Plan]], [[Game Pillars]].

---

## 1. Hook and angle

**One-line hook:** "Six days ago this game did not exist."
(Count the days on posting day. The vault started Oct 17, so on Oct 23 it is 6 days. Update the number, it must be true.)

**The angle:** a high schooler building a scary-funny cave diving game with his friends, in public.
- **What makes it different:** you are tied to your friends by one rope. PEAK, but underwater and going down.
- **The proof:** everything in the clip was built in days, not years. A rock cave, a dive watch with a hologram map, water that goes wobbly when salt and fresh water meet, and sounds made from math.
- **The honesty part:** Claude Code writes the code, you design it, test it and decide. Say it up front (see [[Content Calendar]], "AI honesty"). It is part of the story, not a secret.
- **Tone:** 85% funny, 15% creepy. The dive slate roasting you is the funny. The black water is the creepy.

---

## 2. Vertical short (about 35 seconds)

**Before you record (every take):** Play in a vertical window (1080 x 1920, or 720 x 1280 if it does not fit). Backtick, `stat none`, `dive.Cinematic`, Backtick. Record with **OBS**, not Cmd+Shift+5, because the macOS recorder drops game sound and the breathing is half the hook. Type `dive.RefillAir` between takes.

**Mixing rule:** keep the game sound (breathing, bubbles, rumble) under your voice the whole time. No music for the first 2 seconds.

| # | Time | On screen | How to capture it | On-screen text | Voiceover |
|---|---|---|---|---|---|
| 1 | 0 to 2 s | **HOOK.** Total black for half a second, regulator breath, the light clicks on and the beam cuts down the tunnel. | `dive.GoToMark Bend`, light off (F). Start recording, wait half a second, press F. Never more than 0.5 s of black. | "6 days ago this game did not exist" | "Six days ago, this game didn't exist." |
| 2 | 2 to 6 s | Smooth glide down the tunnel, arms and beam ahead. | `dive.Flythrough 12 1 3 22` (starts at the entrance glow). Use 4 s of it. | "Tied Under" | "I'm making a co-op cave diving game. Basically PEAK, but underwater." |
| 3 | 6 to 10 s | Grab the yellow cave line, slide along it, tug it so a wave runs down it. | Swim a few meters so rope lays out, hold R and press W, then T. Bonus: N to nail it so a line arrow pops on. | "1 rope. Up to 4 friends." | "You and your friends are tied to one rope. It's your lifeline, and it's how you all die together." |
| 4 | 10 to 14 s | Left wrist comes up, then the hologram map of the rope floats above the watch. | Hold Tab, then double tap Tab. Check that the watch shows with `dive.Cinematic` on (it is part of the diver, not the HUD). | "your watch is a hologram map" | "My watch shows a hologram of the rope so you can find your way back." |
| 5 | 14 to 19 s | Sinking slowly into the halocline: the view goes blurry and wobbly like oil in water. | `dive.GoToMark Halocline 3`, then hold V and sink slowly. **Swim this one by hand**: a flythrough does not show the blur. | "real thing: salt water under fresh water" | "Halfway down, salt water and fresh water meet, and everything goes wobbly. That's real, it happens in caves in Mexico." |
| 6 | 19 to 23 s | **The reveal.** Glide out of the low tunnel into the big chamber, then the beam swings up to the air pocket. | `dive.Flythrough 12 1 102 122`, or `dive.GoToMark Chamber` then `dive.LookAround 18`. Use the moment the walls open up. | none, let it breathe | (silence, or one word:) "Then this." |
| 7 | 23 to 27 s | Silt-out: kick hard over the floor, the brown cloud rises and eats the beam. Hold on the white-out for a full second. | `dive.GoToMark SiltRoom 2`, hold Left Shift low over the floor. | "one kick and you're blind" | "One bad kick and you're blind." |
| 8 | 27 to 31 s | The dive slate fades in with a funny verdict. | See "Getting a good verdict" below. The slate shows in recording mode. | (the verdict is already on screen, no extra text) | "And when you mess up, the game roasts you." |
| 9 | 31 to 35 s | **The question.** Dark chamber, light off, one cracked glow stick thrown ahead into the black. It lands and glows. Hold on it. | `dive.GoToMark Chamber`, F to turn off the light, G, G, hold G to aim, let go. | "what lives down here?" | "Next I'm adding what lives at the bottom. What should it be? Tell me in the comments." |

**Getting a good verdict (shot 8).** The slate picks a line from what really happened, so set it up:
- **Easiest:** press Play, then `DiveEndRun 0` right away. You get "Bold strategy: drowning right by the entrance." or "You could almost see the start from here. Almost."
- **Funniest:** silt out twice in the silt room, then `DiveEndRun 0`: "You turned the cave into chocolate milk, then got lost in it."
- **Also good:** swim past 10 m, throw 4 glow sticks, then `DiveEndRun 0`: "Beautifully lit tunnel. Shame about the diver."
- Each rule has 2 or 3 lines picked at random. Press R for a new dive and try again until you get the one you want. After R, recording mode is off: type `dive.Cinematic` again.

**Optional face-cam version of shot 9:** cut to you on camera for 2 seconds asking the question. It makes the account about you, not a faceless studio. Check the background first (no school logo, no street).

---

## 3. YouTube devlog (3 to 4 minutes, horizontal)

Record the same shots in a 1920 x 1080 window too (same commands). Face cam parts are marked **FACE**.

| Time | Section | Talking points | Shots that illustrate it |
|---|---|---|---|
| 0:00 to 0:15 | **Cold open** | No intro. Start on the best moment, then the hook line. "Six days ago this game didn't exist. This is Tied Under." | Chamber reveal (shot 6), cut to a slate verdict, then the title over the entrance glide. |
| 0:15 to 0:45 | **What it is (FACE)** | PEAK, but cave diving. 1 to 4 friends tied to one rope. The deeper you go, the stranger it gets. Made by TyLoCon: you, Tyrus and Loenn. How it gets built: you design and test, Claude Code writes the code. Free game, aiming for Steam in 2027. | You on camera, cut to the rope tug (shot 3). |
| 0:45 to 1:15 | **The dive** | One full dive: swim to the end of the cave and come back with air left. Quick tour: daylight glow at the entrance, the blind bend where it goes black, the junction where the obvious path is a dead end, the squeeze. | `dive.Flythrough 12 1 3 22`, `dive.GoToMark Junction` (look into the side passage), `dive.Flythrough 10 1 60 72` (the squeeze). |
| 1:15 to 1:40 | **The dive watch** | Real cave divers wear a dive computer. Yours shows depth, air, time and how much rope you laid. Double tap for a hologram map of the rope. Nails put little arrows on the line that point the way out, like real cave line arrows. | Hold Tab, double tap Tab. Press N on a wall and show the metal arrow on the rope. |
| 1:40 to 2:10 | **Depth changes the rules** | The halocline: fresh water floating on salt water, it bends light, you leave swirls in it. Then the thermocline: suddenly cold water, you gasp on your next breath and shiver. Both are real things cave divers meet. | `dive.GoToMark Halocline 3`, sink slowly with V, then swim back up and look down at your swirls. Keep sinking to the thermocline: watch says THERMOCLINE. |
| 2:10 to 2:30 | **Mask fog and air pockets** | Pop up into an air pocket and your mask fogs like a bathroom mirror. There is no "clear" button. You do what real divers do: let a little water in to rinse it. | `DiveGoPocket`, then Space. Wait for the fog to creep in, go under, hold H for a second, let go: it washes off. For a sure take: `DiveMaskFog 1 1`. |
| 2:30 to 2:55 | **Sounds made from math** | There are zero sound files in the game. Every breath, bubble, drip and heartbeat is made from math while you play. Show it: turn it all off, then on. Play a few one by one. | `DiveSound 0` then `DiveSound 1` (show the console on screen for this part, it is the proof). Then `DiveSoundEvent 1` (splash), `11` (heartbeat), `15` (thermocline gasp), `16` (ear squeeze and pop). |
| 2:55 to 3:15 | **The roast** | Silt-outs and the dive slate. The game watches what you did and roasts you for it. Read 3 verdicts out loud. | Silt-out (shot 7), then a montage of 3 slates (recipes above). |
| 3:15 to 3:45 | **What's broken / what's next (FACE)** | Be honest, people like it. **Broken:** it's solo only right now, so the rope chaos with friends does not exist yet. The cave is one handmade route, not random yet. Your body is Epic's free mannequin posed by code. Taking your regulator out in an air pocket still floods your mask. **Next:** caves that are different every dive (if it gets repetitive, the game has failed), then the things that live down there, then co-op with Tyrus. | You on camera. Cut to a funny bug if you have one (a glow stick flying off, the body clipping into rock in the squeeze). |
| 3:45 to 4:00 | **Outro question** | "What should live at the bottom of this cave? Best comment gets built into the game." Follow for devlog 2. | The glow stick in the dark (shot 9). End card. |

Keep the honest part short and upbeat. "Here's what's broken" builds trust; a long list of excuses does not.

---

## 4. Captions, hashtags, posting order, thumbnail

**Caption options (pick one, same caption everywhere):**
1. "6 days ago this didn't exist. Building a co-op cave diving game where you and your friends are tied to one rope. What lives at the bottom?"
2. "PEAK, but underwater. Devlog 1 of Tied Under. I design it, AI helps me write the code, my friends help me break it. What should we add?"
3. "The game roasts you when you drown. Day 6 of building a cave diving game with my friends. Comment what lives down here."

**Hashtags (5):** #gamedev #indiedev #unrealengine5 #coopgames #cavediving
(Swap one for #devlog on YouTube Shorts.)

**Posting order:**
1. **Instagram Reels first** (it is the brand's home), evening 6 to 8 pm Pacific. Export at 30 fps.
2. **TikTok** the same evening, same video, 60 fps export.
3. **YouTube Shorts** the same day, 60 fps.
4. **YouTube devlog** 2 to 3 days later. Then reply to the best comment on the Short with "full devlog is up."
5. Instagram story the next day: a `dive.Shot` still with a poll ("creature or monster?").

Call to action is "follow" everywhere until the Steam page exists (see [[Launch Plan]]).

**Thumbnail (from `dive.Shot`):** the chamber, looking up at the air pocket, with the beam hitting the glowing water ceiling from below.
- How: horizontal 1920 x 1080 window, `dive.GoToMark Chamber`, look up at the air pocket with the light on, then `dive.Shot` (saves a 3840 x 2160 picture in `Saved/Screenshots`).
- Edit: crop to 1280 x 720, push the contrast, big white text on the dark side: "I MADE THIS IN 6 DAYS". Keep the text to 5 words or fewer.
- Backup idea if the chamber looks flat: the hologram map above your wrist in the dark, same text.
- For the Reels cover, take the same shot in the vertical window.

---

## 5. Recording checklist

**You record yourself (face cam or voice):**
- [ ] Voiceover lines for the short (shots 1 to 9). Record 3 takes of the hook line, keep the best.
- [ ] Optional face-cam question for the end of the short (2 seconds).
- [ ] YouTube: "What it is" on camera (0:15 to 0:45).
- [ ] YouTube: "What's broken / what's next" on camera (3:15 to 3:45).
- [ ] YouTube: outro question on camera.
- [ ] YouTube: voiceover for the tour, watch, depth, mask fog, sound and roast sections.
- [ ] Before every face shot: check the background (no school name or logo, no street, nothing that shows your city).

**Pure gameplay capture (no face, no voice while recording):**
- [ ] Light clicks on at the bend (shot 1).
- [ ] Entrance glide: `dive.Flythrough 12 1 3 22`.
- [ ] Rope: hold R and slide, T tug, N nail with the arrow.
- [ ] Watch: hold Tab, then double tap Tab for the hologram.
- [ ] Halocline by hand (V to sink), plus swirls from above, plus the thermocline.
- [ ] Chamber reveal: `dive.Flythrough 12 1 102 122` and `dive.LookAround 18` in the chamber.
- [ ] Squeeze: `dive.Flythrough 10 1 60 72`.
- [ ] Silt-out in the silt room.
- [ ] 3 different dive slates (recipes in section 2).
- [ ] Air pocket surfacing and mask fog rinse (`DiveGoPocket`, Space, H).
- [ ] Sound demo with the console visible: `DiveSound 0`, `DiveSound 1`, `DiveSoundEvent 1`, `11`, `15`, `16`.
- [ ] Glow stick thrown into the dark chamber (ending shot).
- [ ] Thumbnail still: `dive.Shot` in the chamber looking up.
- [ ] Every gameplay shot in both vertical and horizontal windows.

**Notes from checking the code tonight:**
- The B-roll table in [[Recording Devlog 1]] still uses the old route numbers (`dive.GoTo 88` and `dive.Flythrough 30 1 70 92` now land in the chimney, not the chamber). This script uses `dive.GoToMark` and the route v2 numbers instead: squeeze 61 to 71 m, chimney 81 to 97 m, chamber 110 to 137 m.
- With a from and to, `dive.Flythrough S 1 A B` takes S seconds for the whole stretch.
- During a flythrough the underwater look and halocline blur follow your still diver, not the camera. That is why the halocline shot is swum by hand.
- Mask fog stays on screen in recording mode. To hide it, untick **Draw When HUD Hidden** on the diver's MaskFog.
