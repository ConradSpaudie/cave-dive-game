# Answers Round 3 (2026-10-21): Unreal build

Conrad's voice answers to the 182 questions in the Claude doc "Tied Under: Unreal Build Questions" (https://claude.ai/artifact/XPPETaTmQbH9u3VcqDa4S3), cleaned up. Numbers match that doc. Anything not mentioned here = Claude's pick accepted.

**Big rule:** everything is built and rendered in Unreal Engine 5.8. The browser version is only a test.

## 1. Big picture
1. First public version is the **solo** version, not co-op.
2. Build the solo feel first, then co-op.
3. Browser version = test only.
4. First Steam playtest: aim for about 2 to 3 weeks from now.
5. **Full release, no Early Access.** Done by **June 2027**.
6. Steam Next Fest: don't care.
7. 30 second first-person intro on first launch, plus a lore animation (see Story).
8. Tutorial is **skippable**, with an easy way to go back to it if skipped by accident (good UI and UX).
9. Tutorial no longer than **3 minutes**.
10. The grumpy broke instructor teaches it. Conrad loves his wit.
11. Main menu fully 3D in Unreal. Conrad gives specifics later.
12. **Reward scene, not a flat results screen.** You climb out of the cave into a giant circular sinkhole in the Amazon: ancient ruins, ancient spiral staircases cut around the walls of the hole, you walk up them to the top (what's at the top: later, maybe a podium). Full Amazon forest, mountains, clouds, sun and sky rendered around it.
13. Difficulty: Easy, Standard, Hard, Endless.
14. Air is the only timer.
16. **Communication for players without a mic.** In settings you pick: **Mic (default)**, **Hand signals**, or **Bubble text**, each with a short description.
    - Bubble text: type a message and a speech bubble pops up that nearby players see.
    - Voice typing into the bubble box, then Enter to send, so you can still swim.
    - Hand signals also get built.
17. No pings.

## 2. Diver body and movement
18. Everything realistic: real weight and drift, input responds instantly. No delay.
19. See your own body, legs and fins.
23. **Barrel roll: yes.** Conrad wants it, no motion sickness concerns.
24. **Choose your stroke:** freestyle, frog kick, doggy paddle, and more, customizable.
25. Pull along rock with E: yes.
26. E = grab rock, grab friend, pick up, take off fins, climb.
22. **Keys changed:** C = clip and unclip. **No down key:** look down and swim to go down. Space = up.
27. Land: you move very slowly in fins until you press E, which plays an animation of taking the fins off. Then you see yourself carrying the fins as you walk.
28. Climbing with E on climb points. Lots of them, leading to interesting areas.
29. Ragdoll camera stays first person.
30. Fall damage as proposed (over 4 m hurts, over 10 m breaks a leg).
31. Squeezes: animation of taking your tank off. Damage based on how long it takes, chance to rip your mask off.
33. Camera sway: Claude to elaborate.
36. Soft collisions: yes.
37. Tow a knocked-out friend: grab with E, or swim if they're clipped on the rope.
38. **Emotes: yes.** Backflip, spin, slow underwater cartwheel, handstand, other funny moves.

## 3. Air, buoyancy, light
39. Tank loadouts good, but wants **lots of trade-offs**: more or bigger tanks cost stamina or speed, etc.
40. Breathing automatic. **Q = control breathing: slow it down to regain stamina or heal.**
41. Each breath moves you up and down a little.
42. B inflate, V deflate: Claude to elaborate.
43. Out of air: 20 seconds of gasping and tunnel vision, a friend can still save you.
44. **Air sharing: take your regulator out of your mouth and give it to a friend.** They breathe, then you can put it back. Key decided later.
45. **Air refill tools** left by past explorers. Found only in caves, never in the shop. You keep them after the dive, but they wear out with every use. **The deeper you are, the worse the air quality, so the less air they can pack into your tank.**
46. Mask off in air pockets: yes.
47. Panic effects: all four.
48. Narcosis: yes.
49. Wetsuit and drysuit: yes.
50. **3 lights: 15 min, 5 min, 5 min.** Plus the creature cage lantern.
54. **Glow sticks: 5 per person, on your belt.**
    - Press G to take one in your hand, press G again to crack it. It lasts a limited time.
    - Press the flashlight key to put it away and go back to the flashlight.
    - **Hold G to aim a throw:** a dotted arc (like a projectile path in physics class) with an X where it lands. The X always sits on a surface.
    - Throw power depends on your stamina and how injured you are.
56. Stamina drains: keep.
57. **Don't drop full tanks.** You can drop empty tanks. No checkpoint tanks (you move forward, not back).
58. Regulator free-flow: yes.
- **Duct tape:** limited amount, patches cuts and suit tears. Upgrade the amount with loot found in caves.
59. **Mask flooding rules:**
    - Three causes:
      1. A predator attack (small chance).
      2. Taking your regulator out to share air.
      3. Strong currents.
    - No key to clear it.
    - Sharing air: it floods until you plug the regulator back in. If it gets too high you take a little damage until it drains.
    - Predator: stops 15 seconds after it starts.
    - Current: floods while you're in the current, only when your mask is side-on (perpendicular) to the flow. Facing into it or away from it is safe. Moving fast side-on also floods.
    - Visuals: only 5 to 10% blur. The water in the mask is the main effect. More blur in deeper or dirtier water (silt gets in your eyes).

## 4. Rope
60. **Real rope physics everywhere, rendered in Unreal.** The browser ropes look static and fake. The rope reacts to currents and the environment.
    - **Nails/anchors:** you can hammer a nail into the cave wall to pin the rope, cross a current, then nail it again so the rope stays put.
61. **Max distance between divers: 6 m.** Divers can attach to each other with E.
62. Order: leader, second, third, last.
63. A swept-away friend yanks you only if they're clipped on. **If not clipped, they get carried wherever the current goes** unless they grab a rock. **Climb-back mini game:** a clip moves around a circle with white and shaded parts, press Space when it's on white. The white part shrinks as you get closer to escaping the current.
65. Rope frays and breaks if yanked hard against sharp rock. Reattach by nailing it to a wall.
64. Unclip and re-clip: 3 second animation.
66. Tangles: as proposed, plus the mini game.
67. Hold R to follow the rope blind: yes.
68. Line arrows: yes.
69. Tap T to tug. **Conrad wants the tug to physically vibrate the player's computer** (asked Claude to explain if this is possible).
70. Only big predators bite or grab the rope.
71. **The lobby votes on the rope color at the start of the dive.**
72. The rope is only seen when it's actually in view (normal line of sight). Visible on the hologram map. Respawned players follow it down.
73. Always tied to the surface stake.
74. Infinite and weightless far back.

## 5. Co-op, modes, death
75. One player hosts through Steam.
76. Host quits = dive ends for everyone.
77. Saboteur Mode needs exactly 4.
78. Join mid-dive: yes.
79. **Voice range underwater: 9 m**, muffled and bubbly. Clear in air pockets and on land. No radios.
80. Text chat in lobby and hub only, plus bubble text in the dive.
81. Keep all saboteur powers.
82. **Saboteur tools:**
    - Blood bait (attracts monsters).
    - Valve wrench: get close and unscrew a teammate's tank so it falls off.
    - Scissors: cut a teammate's wetsuit (they can tape it if they have tape). **The scissors are always visible in the saboteur's hand, so if anyone looks at them while they carry it, they're outed.**
83. Saboteur wins when all 3 are dead.
84. Team wins when at least one diver reaches the bottom chamber alive.
85. No voting. You just kill them.
86. Tie up: keep.
87. Saboteur respawns unlimited, at the top.
- **Saboteur Mode deaths: the 3 teammates do NOT respawn. Dead is dead.** Only the saboteur respawns.
88. Sabotage replay of highlights: injuries, tank unscrews, intense group moments, teammate deaths.
89. **Team Mode:** you become a ghost bubble. Friends can revive you by bringing your body to an air pocket. If nobody does within 30 to 45 seconds (Claude picks), you respawn at the top.
90. Bodies stay clipped and can be towed on the line (slower), or grabbed and carried (faster).
91. Ghosts: keep.
92. Friendly fire full damage, knives cut the rope.
93. No AI buddy, ever.
94. Total wipe: keep logged species and 25% of money.

## 6. Cave and look
95. Generator approach: yes.
96. All 3 cave looks. **Caves must look like real caves: jagged, rugged, not smooth.**
97. 5 zones, browser zone names kept.
99. 20 set pieces: yes.
100. Seeds and daily cave: yes.
101. About 1.5 km of swimming. Depth said as "20 meters" (to confirm, the question said 120 m).
102. **Dry sections:** 3 to 4 per run on medium (Standard). Endless: unlimited, about 1 to 2 for every 20 to 40 m of depth, growing as you go deeper (3 to 4, then 5 to 6, etc).
103 to 116: all yes (haloclines, hydrogen sulfide, clarity, sun shafts, breakable stalactites, drifting silt, ceiling bubble mirrors, caustics, Lumen and Nanite with a low preset for Ty, earthquakes that close a path, everything synced, digging, glowing plants, old lines from past expeditions).

## 7. Creatures, predators, weapons
117. Free models first, paid artists later. Conrad and friends may draw some.
118. 20 species.
119. Flee from light and noise. **Hurt creatures:** small ones die, medium ones flee, large ones attack (predators) or flee (prey).
121 to 130: keep all (6 predators, gore level, only The Maw one-shots, 7 weapons, rare ammo in stashes, speargun reel, injuries, tape and splints, currents, bad air).
131. **Jump scares: 3 to 4 per run.**
132 to 135: yes (strange things deeper, harmless scary giants, no boss at the bottom, the curious glow-stick-stealing fish).
- Tameable pets and food from stashes: considered, then dropped.

## 8. Hub and gear
136 to 152: keep all.
- **The hub must be fully 3D with as much detail as the dive itself.** Reference: the hub in "Deep Descent" (see everyone, walk around, buy, sell, upgrade, test trials). Conrad adds specifics later.
137. Conrad and friends voice the old man.

## 9. HUD, story, endings
153 to 166: keep all.
162. **Bottom chamber must be different every run, never repetitive.** Ideas: shipwrecks, old divers with treasure, flooded towns, lost civilizations, Atlantis, a flooded mansion, a flooded castle. **Conrad wants 1,000 unique end chambers**, built in Unreal.
165. Lore: yes.
- **Lore intro animation** (like the Deep Descent intro), high quality, in Unreal. Not horror.
  - The divers are broke college dropouts from a bad college who never finished. Surfer boys and surfer girls, all with some diving experience, who want to explore.
  - The grumpy old man is broke too. He needs divers, and he has the supplies and resources.
  - Both sides are broke, so they partner up.
  - Claude maps out the full lore and asks Conrad questions.

## 10. Tech and team
167 to 182: all accepted (60 fps target, a parent signs up for Steamworks, pay for GitHub storage when needed, sponsor posters only for ads, photo mode, streamer mode, cinematic camera, weekly playtests, Conrad has final say).
- Loenn: playtester. Ty: Windows builds.
