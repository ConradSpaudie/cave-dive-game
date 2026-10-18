# Proposed Answers (Round 2)

Claude's proposed answers to every question in [[Open Questions]], written overnight on 2026-10-17. **Nothing here is decided.** Read through, then reply with the numbers you want to change. Anything you don't change, Claude will move into the Design notes and the [[Decision Log]].

Format: **Proposal**, then a one-line why.

---

## Reminder: define "funny"
Proposal: these are the five moments the game is built to produce.
1. **The rope yank.** A friend gets caught in a current and drags the whole team backwards, everyone screaming on proximity chat.
2. **The silt-out blame game.** Someone kicks too hard, the cave goes brown, and nobody can see who did it.
3. **The squeeze.** One player gets stuck in a tight hole, flippers kicking, while the others pull them through by the ankles.
4. **The buoyancy launch.** Someone over-inflates their vest and rockets into the ceiling, or sinks like a stone mid-sentence.
5. **The muffled scream.** Voices go muffled and bubbly underwater, then suddenly crystal clear when someone pops into an air pocket mid-panic.
Why: PEAK's comedy comes from physics plus voice chat plus being stuck together. These five use systems you already designed.

## Blockers
1. Mac chip and RAM: **only you can check.** Apple menu > About This Mac.
2. External SSD: **Yes, buy a 1 TB external SSD.** It's the only purchase the project needs right now. See [[Setup Guide]].
3. Windows PC: **Borrow one for builds only, starting at Phase 5.** You don't need it until the playtest build.
4. Tyrus: **Co-designer and playtester for now.** Building happens on your one Mac; Tyrus owns playtest notes and the "funny moments" list.
5. GitHub: **Done.** Design vault is ConradSpaudie/cave-dive-game (public). The game code goes in a second repo, **cave-dive-game-unreal (private)**, because the code and art are what's worth protecting.

## The hub
6. What it is: **A dive camp at the cave entrance:** a jungle clearing beside a sinkhole, with a gear tent, a research table, and the rope stake at the water's edge. Why: the hub and the dive start become the same place, so there's no loading screen between them.
7. Walkable or menu: **Walkable in first person.** It's where friends goof around before a dive.
8. Shared or personal: **Shared.** Whoever hosts, everyone appears at that host's camp.
9. What you can do: buy gear, upgrade gear, customize suits/masks/flippers, sell treasure, read the logbook, check leaderboards, pick difficulty, choose rope order.
10. NPCs: **One NPC: a grumpy old dive instructor** who runs the gear tent, buys treasure, and gives the intro story. Why: one character is cheap to make and gives the game a face.
11. Hub grows: **Yes.** Logged species appear as sketches pinned to a board, fossils go on display shelves, and the camp gets fancier as you earn money.
12. Fun stuff while waiting: **A practice pool in the sinkhole** to test buoyancy, plus a cliff to jump off (ragdoll practice).
13. Multiple caves: **One entrance, a new procedural cave every run** behind it. Why: keeps scope small; the variety comes from generation.
14. Story intro: **Yes.** First launch only, the instructor explains why you're here (see 47).
15. Day/night or weather: **Not at launch.** Nice-to-have later.

## Rope
16. Split at a branch: **The rope physically blocks it.** Players can only spread out as far as the rope between them allows (proposal: 8 meters between each diver). To go different ways, someone has to unclip (see 17).
17. Unclip: **Yes, anyone can unclip and re-clip, with a 3-second animation.** Unclipped divers lose the rope's guidance and can get lost. This is also the saboteur's main tool.
18. Snag physics: **Simplified.** The rope follows the path players actually swam (a breadcrumb line) and only snags at a few marked "snag points." Full physics rope over hundreds of meters is too expensive. See [[Rope System]].
19. Solo rope: **Yes,** you're still tied to the surface stake. The rope is how you find your way out.

## Saboteur
20. Always on or setting: **A lobby setting, off by default.** Why: it changes the game a lot; friends should opt in.
21. Who knows: **The saboteur knows from the start. Others know a saboteur might exist (25% chance per run) but not who.** Why: the "maybe there isn't one" doubt makes accusations funnier.
   Note: your answer 16 in [[Answers Round 1]] says one player *is* the saboteur in 4-player games. 25% (and #20's "off by default") changes that, and 25% may be too low. Your call.
22. Saboteur powers: quietly unclip someone, kick up silt on purpose, "accidentally" drain shared air, lie about directions, drop a waypoint in the wrong place. No direct killing.
23. Catching them: **A "tie up" action** when two players grab the same person for 3 seconds: the suspect is clipped to the back of the rope and can't use tools. Wrong accusation costs air.
24. Saboteur win: **Everyone else runs out of air or the team fails to reach the bottom.** The saboteur gets bonus money if they survive.

## Death and failure
25. Death: **You become a ghost bubble** that can follow the team, see through walls faintly, and make small sounds to help. Teammates can revive you only at an air pocket by bringing your body there.
26. Drag bodies: **Yes,** bodies stay clipped to the rope and can be towed. Very funny, very grim.
27. Total wipe: **You keep logged species and 25% of the money you found.** Why: no progress loss is boring; total loss is rage-quit territory.
28. Lose gear: **No.** Gear stays yours. Consumables (tape, glow sticks, extra tanks) used in the run are gone.

## Movement and controls
29. Mode switching: **Automatic based on surroundings**, with one "squeeze" key for tight holes. Why: fewer buttons for a beginner-friendly feel.
30. Current rescue mini game: **Alternating-key tug of war:** the stuck player and the anchoring player both mash alternating keys while a bar fills. Teamwork beats one person.
31. Untangle mini game: **Rotate the mouse in the direction an arrow shows** (circle motions) for about 5 seconds.
32. Sprint-swim: **Yes,** hold Shift. Burns air 2x and kicks up silt in silty areas.

## Air and diving
33. Tank loadouts:
- **Light (1 tank):** fastest swim, most stamina, about 10 minutes of air.
- **Standard (2 tanks):** normal speed and stamina, about 20 minutes.
- **Heavy (3 tanks):** slowest, less stamina, about 30 minutes. Can drop tanks along the way.
34. One tank: **About 10 real minutes** at calm breathing. Panic and sprinting drain it faster.
35. Air sharing: **Yes,** face a teammate and hold a key. You both drain from the giver's tank.
36. Decompression: **No real decompression.** The end of the run is reaching the bottom, then a fast "rope ascent" sequence. Why: realistic deco is slow and not funny.
37. Cold: **Slowly drains stamina and makes your hands shake** (wobbly flashlight). Warm pockets reset it.
38. Lowering panic: **Hold a "slow breathing" key** (uses less air, calms you), plus being touched by a teammate, plus reaching an air pocket.

## Creatures and logbook
39. Dangerous creatures: electric eels (shock: drops flashlight, spikes panic), the deep lure predator (bite: injury), territorial cave crayfish (pinch: tiny cut). Most creatures are harmless. See [[Logbook Species List]].
40. Catching for the lantern: **Swim slowly up to it and press a key** while it's in your light. Skittish ones flee if you're fast or loud.
41. Measuring: **Aim a measuring tape tool at the creature and hold** for 2 seconds while it stays in frame. Bigger specimens are worth more.
42. Camera: **Yes,** an optional camera tool. Photos go in the logbook and can be shared. Great for your content.
43. Boss at the bottom: **No fight. A huge, ancient, harmless creature** you can only log (think a whale-sized blind fish). The "holy crap" moment, not a battle.

## Cave and depth
44. Depth zones: **5 zones.** See the zone breakdown in [[Logbook Species List]].
45. The bottom: **A massive flooded chamber with an ancient ruin**, unexplained. Each run's bottom is different. Good lore hook without heavy story.
46. Earthquakes: **Random, rare, and more likely the deeper you go.** They shake the camera, drop rocks, and can close one path.

## Story
47. Intro: **You're a team of broke dive-school dropouts** hired by the grumpy instructor to map a newly discovered cave, because no one else will take the job. Why: explains the funny incompetence, justifies money and gear upgrades, and keeps the tone light.

## Customization
48. Wetsuit editor: **Color zones plus stickers/patterns at launch, freehand drawing later.** Why: freehand drawing on a 3D suit is a big build; zones and stickers get 90% of the fun.
49. Mask components: frame (shape), glass (clear / wide / tinted), seal (normal / tight: resists flooding), lamp (none / headlamp), HUD module (basic / advanced).

## Audio
50. Music: **Mostly ambience** (breathing, water, creaks), with music only in the hub and at the bottom chamber reveal.

## Business and brand
51. Monetization: **Free game plus paid cosmetic packs and a Supporter Pack, no ads.** See [[Monetization]].
   Note: your answer 80 in [[Answers Round 1]] said you wanted revenue from ads. This proposal drops ads; it only stands if you agree.
52. Game name ideas: **Silt**, **Line Out**, **Tied Under**, **Breathe Down**, **Sump** (a "sump" is a flooded cave passage). Top pick: **Tied Under**, since it says co-op, rope, and underwater in two words.
53. Studio name ideas: **Bubble Line Games**, **Deep End Studio**, **Bad Buoyancy**. Top pick: **Bad Buoyancy**, funny and on theme.
54. Instagram: **only you can answer the handle.** Proposed cadence: one devlog post per week, starting with Phase 1 footage.
