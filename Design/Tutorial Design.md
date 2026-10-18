# Tutorial Design

> **PROPOSAL, awaiting Conrad's approval.** Nothing here is decided. Answers question 79 in [[Answers Round 1]] ("Yes, build a tutorial"). Once approved, log it in [[Decision Log]].

## The short version
The tutorial is one short dive into the **practice sinkhole** next to camp, narrated by Marv over a cheap waterproof radio clipped to your mask. It teaches each core mechanic once, in order, in about **8 minutes**. It doubles as the intro story. It's skippable, and there is a solo and a co-op version. Every lesson ends with a joke, not a checkmark.

Marv's personality and the camp are in [[Hub Design]]. Mechanics come from [[Movement and Swimming]], [[Diving Systems]], [[Rope and Multiplayer]], and [[Creatures, Flora and Logbook]].

---

## 1. Rules for the tutorial
1. **Under 10 minutes.** Target 8.
2. **One mechanic per step,** taught by doing, never by reading. On-screen text is a single key prompt at most.
3. **Every step has a joke.** Marv roasts, Kevin the dummy suffers, something goes slightly wrong.
4. **No fail states.** You can't die. Air never runs out. If you mess up, Marv sighs and you try again.
5. **Skippable at any time** (hold Esc for 2 s), and skippable at the start.
6. **Teach only the core.** Advanced stuff (saboteur, contracts, lantern mixing) is taught later with one-line tips the first time it comes up.

---

## 2. The intro (before the dive, about 60 seconds)
- First launch: you wake up in the back of Marv's truck as it bumps down the jungle trail.
- Marv (driving, not looking back): "So. You're the dive school dropouts. Failed buoyancy, failed navigation, one of you failed 'not panicking.' Perfect. Nobody else will take this job."
- He explains, in three lines, the story from [[Proposed Answers]] #47: a new cave was found under a sinkhole, nobody wants to map it, he is broke, you are broke. "You map it, you log what's down there, you bring me anything shiny. I pay you. Mostly."
- The truck stops at camp. "Before I let you anywhere near the real cave, you're doing the practice hole. Get your gear on."
- The first time only, Marv asks: **"You done this before?"** Answering "Yes" skips the tutorial (section 6).

---

## 3. Tutorial steps (solo version)
The practice sinkhole is a small handmade cave, about 25 m deep, with a sunlit entrance, one dark bend, one silt room, one squeeze, a small current, and an air pocket. Kevin the training dummy plays the teammate.

| # | Mechanic | What the player does | Marv says (example) | The joke | Time |
|---|---|---|---|---|---|
| 1 | Walk and look | Walk from the truck to the Locker Shack | "That's walking. You're doing great. I've had worse." | He's grading you on walking. | 15 s |
| 2 | Loadout | Pick a tank loadout (Light / Standard / Heavy) at the locker | "Heavy is three tanks. You'll swim like a fridge. Take Standard." | Picking Heavy makes you waddle to the platform. | 30 s |
| 3 | Rope and clip in | Stand on the Leader footprint, clip onto the stake | "This rope is your mom now. You don't leave your mom." | | 15 s |
| 4 | Jump in | Jump off the platform | "Feet first. ...Or face first, sure." | Ragdoll splash if you jump from the side. | 10 s |
| 5 | Swim and breathe | Swim down to a floating buoy; hear your own breathing | "Hear that? That's your air leaving. Slow down, it leaves slower." | | 30 s |
| 6 | Buoyancy | Inflate to rise to a ring, then breathe the air back to sink to the next one | "Breathe into the vest to go up. Suck it back to go down. Yes, it's gross. Yes, it's real." | Over-inflating rockets you into the ceiling. Marv: "Buoyancy launch. Classic." (funny moment #4 from [[Proposed Answers]]) | 60 s |
| 7 | Flashlight and dark | Swim around the dark bend, turn on the flashlight | "Dark comes fast down there. Light on. Battery's not forever, so don't admire the rocks." | The light reveals Kevin, wedged in the rock, staring at you. | 30 s |
| 8 | Measure and log | Measure Stalag Moss with the tape and log it | "Moss. Measure it. Thrilling science." | The moss "is 40 cm if you count the rock." First logbook entry pops. | 45 s |
| 9 | Silt-out | Swim fast through the silt room, then stop and wait for it to settle | "Kick like that again and you'll be blind. ...Yep. Now wait." | The 10 s wait is filled with Marv humming badly. | 30 s |
| 10 | Squeeze | Use the squeeze key to get through a tight hole | "Squeeze. Arms first. Do not get stuck, I am not coming in there." | Kevin got stuck in this hole years ago; his flipper is still there. | 30 s |
| 11 | Cuts and tape | You scrape a sharp rock (scripted). Patch it with tape | "Tape it. Everything in life can be fixed with tape." | Option to tape Kevin's face too. Marv: "Leave Kevin alone." | 30 s |
| 12 | Current and anchoring | A small current drags Kevin (tied behind you). Grab the wall and do the tug-of-war rescue | "Grab the wall! Mash! Pull! He's worth forty bucks!" | If you fail, you and Kevin tumble into a soft sandy pit. Try again. | 45 s |
| 13 | Rope tangle | Swim around Kevin once; untangle with the mouse circle | "You tied yourself to a dummy and then tied a knot in the dummy. Impressive." | | 30 s |
| 14 | Waypoint | Place a glowing waypoint and name it | "Name it something useful." Default name suggestion: "Kevin's Grave." | | 20 s |
| 15 | Air pocket and refill | Surface into the air pocket; voices go clear; refill air | "Air pocket. Breathe. Voices sound normal up here, so try not to scream." | Your own heavy breathing echoes. | 30 s |
| 16 | Pick up treasure | Dig a fossil shell fragment out of the silt in the air pocket | "Something to sell. Barely." | | 20 s |
| 17 | Rope ascent | Pull the rope twice to signal "up." The rope ascent pulls you to the surface | "Two tugs means up. One tug means you're an idiot. Remember that." | Kevin is dragged up behind you, limp, bonking off every rock. | 15 s |
| 18 | Sell and results | Climb out, take Marv's clipboard, sell the fossil at the Sell Table | "Twenty bucks. Plus a hundred and thirty for not drowning. Don't spend it all at once." | Funny award on the clipboard: "Most Kevin Damage." | 30 s |

**Total: about 8 minutes.** Reward: $150 starter Cash and the **Kevin sticker** (wetsuit cosmetic), from [[Economy and Progression]].

Tutorial exit line: "Fine. You're not completely useless. Real cave's through there. Don't die on my insurance."

---

## 4. Co-op version (2 to 4 players)
Runs when **any** player in the lobby has not done the tutorial. Same cave, same order, with these changes:

| Step | Solo | Co-op change |
|---|---|---|
| 3 Rope | Leader footprint only | Everyone picks rope order on the footprints. Marv: "Leader goes first. Last goes last. That's the whole lesson." |
| 6 Buoyancy | Rings | Race through the rings. Loser gets roasted by name. |
| 9 Silt-out | Solo silt | The Leader kicks up the silt (scripted) so everyone behind gets blinded. Marv: "Your leader just did that. Remember this moment." (funny moment #2) |
| 10 Squeeze | Solo | One player gets "stuck" (scripted), the others pull them through by the ankles (funny moment #3). |
| 12 Current | Rescue Kevin | The current grabs a real player. Everyone else anchors and mashes. Kevin is still tied on at the back, just for weight. |
| New: Grab and tow | n/a | Tow a teammate 5 m. |
| New: Air sharing | n/a | One player's air "runs low" (scripted); a teammate shares. Marv: "Face each other. Closer. It's not a date." |
| 15 Air pocket | Solo echo | Voices go from muffled to clear at once (funny moment #5). |

Co-op adds about 2 minutes. Target: 10 minutes total.

**Veterans in a co-op tutorial:** players who already finished it can either join as normal (they still get the funny moments) or wait at the camp's Practice Pool and Jump Cliff. Veterans who join get a small $50 "babysitting fee" from Marv.

---

## 5. Just-in-time tips (after the tutorial)
Things the tutorial doesn't teach get one Marv radio line the first time they happen in a real run, then never again:
- First lantern catch, first eel, first dry chamber fall, first earthquake, first death (ghost bubble), first contract, first time Saboteur Mode is on.
- Example (first death): "Congratulations, you're a bubble. Follow your friends and make noises. That's your job now."

Tips can be turned off in settings.

---

## 6. Skipping

| How | What happens |
|---|---|
| "You done this before?" Yes, on first launch | Skip to camp. You still get the $150 and Kevin sticker. Just-in-time tips cover everything you missed. |
| Hold Esc for 2 s mid-tutorial | Marv: "Fine. Go drown on your own time." Jump straight to step 18 (results and selling). |
| Replay later | Talk to Marv: "Can I do the practice hole again?" Always available, no reward the second time. |
| Co-op with a skipper | If one player skips, they wait in camp; the rest finish the tutorial. |

---

## 7. Build notes
- The practice sinkhole is a **handmade** level, not generated, so it's the same every time. That's fine here: you only play it once. It also makes a great first build target in Phase 4 of the [[Roadmap]].
- All 18 steps reuse systems from the real game. The only tutorial-only code is the scripted events (scripted silt, stuck player, low air) and Marv's radio trigger volumes.
- About 60 Marv lines for the tutorial (solo plus co-op), recorded with the rest of his lines.
