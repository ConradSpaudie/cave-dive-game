# Hub Design

> **PROPOSAL, awaiting Conrad's approval.** Nothing here is decided. Built on hub answers 6 to 15 in [[Proposed Answers]]. Once approved, move the agreed parts into [[Progression, Hub and Leaderboards]] and log it in [[Decision Log]].

## The short version
The hub is **Sump Camp**, a scruffy dive camp in a jungle clearing beside a big sinkhole. It is walkable, first person, and shared (everyone appears at the host's camp). The dive starts at the rope stake on the edge of the sinkhole, so there is no loading screen between hanging out and diving. One NPC runs it: **Marv**, a grumpy old dive instructor.

---

## 1. Layout

```
                 [ Jungle trail / Truck ]  <- spawn point
                          |
   [ Locker Shack ]--[ Campfire ]--[ Gear Tent (Marv) ]
          |               |               |
   [ Species Board ]  [ Contract Board ]  [ Sell Table ]
          |               |               |
   [ Fossil Shelves ] [ Leaderboard Rock ] [ Research Table ]
                          |
        [ Jump Cliff ] -- [ Dive Platform + Rope Stake ] -- [ Practice Pool ]
                          |
                    ( the sinkhole )
```

The whole camp is about 60 m across. You can walk from the truck to the stake in about 20 seconds. Small on purpose: friends should always be within shouting distance.

### Zones and interactions

| Zone | What it is | Interaction |
|---|---|---|
| **The Truck** | Marv's rusty pickup at the end of the trail. Everyone spawns here. | Truck radio: pick hub music (the only music outside the bottom chamber, per [[Audio]]). Honk the horn. |
| **Campfire** | Log benches around a fire. The social center. | Sit on a log to mark yourself "ready." Roast a marshmallow (pointless, required). |
| **Gear Tent** | Marv's tent full of tanks and hoses. | Buy and upgrade gear, buy consumables (all numbers in [[Economy and Progression]]). |
| **Locker Shack** | A tin shed with a cracked mirror and hooks. | Loadout editing, wetsuit editor, mask builder, flipper tuning (see [[Gear and Customization]]). The mirror is the only place you see yourself. |
| **Sell Table** | A folding table with a rusty scale. | Your haul bag empties here after a dive. Press once to sell everything, or pick items to keep as trophies. |
| **Research Table** | A desk under a tarp with a microscope and coffee rings. | Read the logbook, claim logbook bounties, look at photos from the camera tool. |
| **Species Board** | A big corkboard. | Every species you log appears as a pencil sketch pinned to it. Shinies get a gold pin. Look at a sketch to see your size record. |
| **Fossil Shelves** | Wooden shelves that start empty. | Fossils you choose to keep (instead of selling) go on display. |
| **Contract Board** | A plank nailed to a tree. | Pick this run's contract (see [[Run Variety System]]). Also shows the weekly seed. |
| **Leaderboard Rock** | A boulder covered in chalk tally marks. | Leaderboards from [[Progression, Hub and Leaderboards]], written in chalk. Friends' names first, global second. |
| **Dive Platform and Rope Stake** | A wooden deck over the water with the iron stake and 4 painted footprints. | Rope order, difficulty chalkboard, saboteur toggle, start the dive (section 4). |
| **Practice Pool** | The shallow end of the sinkhole, fenced with floating rope. | Buoyancy and swim practice (section 6). |
| **Jump Cliff** | A rock ledge above the deep end. | Ragdoll jumping and the belly-flop meter (section 6). |

---

## 2. Marv, the instructor

### Who he is
- **Marv Kessler**, 60-something ex-cave diver. Mapped half the world's flooded caves, got banned from most of them. Lives in his truck.
- **Personality:** grumpy, dry, impossible to impress, secretly proud of you. Complains about paperwork, insurance, and "kids these days," then quietly patches your tank.
- **Rule for writing him:** he is never mean about the player's skill in a way that stings. He roasts the situation, the gear, and himself. Every insult hides a tip.
- **Voice:** a Conrad or Tyrus recording is the plan (free, and great devlog content: "I voiced the grumpy old man"). Lines are short so recording is cheap: about 150 lines at launch.

### His role
1. Tells the intro story on first launch (the dive-school dropouts hired to map a cave nobody else will touch, from [[Proposed Answers]] #47).
2. Narrates the tutorial (see [[Tutorial Design]]).
3. Runs the Gear Tent and buys treasure at the Sell Table.
4. Posts contracts and the Want List (+50% items, from [[Economy and Progression]]).
5. Reacts to every run's results.
6. Never goes into the cave. He is the surface. That keeps him cheap to build (no swimming animations) and makes the cave feel lonelier.

### Example voice lines

| Moment | Line |
|---|---|
| First meeting | "You're the dropouts? Great. Fantastic. The insurance company is gonna love this." |
| Selling junk | "A rock. You brought me a rock. From a cave. Here's twenty bucks so you'll stop looking at me like that." |
| Selling something great | "...Where did you find this. No, don't tell me. I'll just be jealous." |
| Buying an upgrade | "Bigger tank. Good. Now you can be lost for longer." |
| Buying the lantern | "You put glowing bugs in a cage and call it a flashlight. I did the same thing in '89. Lost two fingers. Different story." |
| Team wipe | "So. Everyone died. Did you at least log the thing that killed you?" |
| Reached the bottom | "...Huh. You actually did it. Don't tell anyone I said 'huh.'" |
| Long time no play | "Oh, look who remembered they have a job." |
| Someone jumps off the cliff | "Ten out of ten. Medically irresponsible." |
| Rope tangle stat on results | "Fourteen tangles. You weren't diving, you were knitting." |
| Saboteur caught | "Tied up your own teammate. Beautiful. That's how I lost my last crew." |
| Idle at the campfire | "Fire's not gonna dive for you." |
| Waiting on a friend | "We waiting for the fourth one, or did they drown on the way here?" |
| New species logged | "Never seen one of those. Which means it's either rare or you made it up." |
| Picking a hard contract | "Oh, you're brave. Or stupid. In my experience, same thing." |

---

## 3. Hub growth

The camp grows with the **host's** total lifetime earnings and logbook, so a host's camp is something they show off to friends. Visiting players see the host's camp, not their own.

| Stage | Name | Unlocks at | What changes |
|---|---|---|---|
| 1 | Broke Camp | Start | One tent, a tarp, the truck, an empty corkboard. Marv sleeps in the truck. |
| 2 | Getting By | $5,000 lifetime | String lights, a second bench, fossil shelves built, a proper sign over the Gear Tent. |
| 3 | Real Outfit | $20,000 lifetime or 25 species | Wooden dive platform upgrade, hammock, a generator hum, the Species Board doubles in size. |
| 4 | Famous Divers | $50,000 lifetime or first bottom reached | Marv gets a camping chair and a mug that says "World's Okayest Instructor." A photo wall of the team's best camera shots. |
| 5 | Legends of the Sump | $100,000 lifetime or 40 species | A small museum hut for fossils, a giant skeleton (the first bottom creature you logged) hung from the trees, a news crew van that never leaves. |

Also always growing, independent of stage:
- Every logged species adds a sketch to the board.
- Every kept fossil appears on a shelf.
- Every shiny gets a gold pin.
- Real-money camp decorations (from [[Monetization]]) can be placed at any stage.

---

## 4. Pre-dive flow
Everything happens in the world, not in menus, except the loadout screen.

| Step | Where | What happens |
|---|---|---|
| 1. Lobby | Campfire | The host's camp is the lobby. Friends join through Steam invite (section 7). Sitting on a log marks you ready. |
| 2. Loadout | Locker Shack | Opens the loadout screen: tanks (Light / Standard / Heavy), mask modules, lantern, consumables, logbook and tools. Your last loadout is remembered. |
| 3. Contract (optional) | Contract Board | Look at the board, pick one of 3 contracts or none. Shows the weekly seed if the host wants to play it. |
| 4. Difficulty | Chalkboard on the platform | Host taps one: **Easy** (about 15 min, zones 1 to 3, 0.6x Cash), **Standard** (30 to 45 min, all 5 zones, 1.0x), **Deep** (45 to 60+ min, more modifiers, 1.4x Cash). |
| 5. Saboteur toggle | Chalkboard, below difficulty | Host only. Greyed out unless exactly 4 players are present. Off by default. Rules in [[Saboteur Mode]]. |
| 6. Rope order | 4 painted footprints on the platform | Stand on a footprint to claim a position: 1 Leader, 2 Second, 3 Third, 4 Last. Two players fighting over Leader is the intended chaos; Marv says "Rock paper scissors. Hurry." after 10 s. |
| 7. Clip in | Rope Stake | When everyone is on a footprint, the host pulls the stake lever. Everyone clips on in order (a 2 s animation), Marv says a line, 3, 2, 1, and everyone jumps or gets shoved in. |

The cave starts loading in the background the moment the host taps a difficulty, so the jump into the water is seamless.

---

## 5. Post-dive flow

| Step | What happens |
|---|---|
| 1. Rope ascent | After the bottom (or after the team swims out, or a wipe), a fast rope-ascent sequence pulls everyone up through the cave in about 15 seconds, past the places they visited. Dead divers are hauled up limp on the rope (very funny, very grim). |
| 2. Pop out | Everyone surfaces in the sinkhole beside the platform and climbs out dripping. |
| 3. Results clipboard | Marv hands each player a clipboard (in-world UI). It shows: deepest depth, time, air left, rope used, deaths, new log entries, haul value, depth bonus, contract result. |
| 4. Funny awards | The clipboard's back page gives each player one award, chosen from real stats: "Most Tangles," "Loudest Scream" (voice volume peak), "Silt Machine," "Dragged Most Meters," "Air Thief" (most air received), "Died First," "Never Stopped Talking." Designed to be clipped and posted. |
| 5. Selling | Haul bags dump onto the Sell Table. Marv picks each item up with a reaction line (skippable). Press once to sell all, or hold on an item to keep it for the fossil shelf. |
| 6. Log updates | New sketches fly onto the Species Board one by one with a pencil scribble sound. Bounties paid at the Research Table automatically. |
| 7. Back to the campfire | Ready for the next run. Target time from surfacing to the next dive: under 3 minutes if players want it. |

---

## 6. Practice Pool and Jump Cliff

### Practice Pool
A 4 m deep, clear, sunlit part of the sinkhole, fenced by a floating rope.
- **Buoyancy rings:** 3 floating hoops at different depths. Swim through them using only the breath buoyancy control. A small chalk tally counts your best time.
- **Squeeze pipe:** a concrete drainage pipe on the bottom to practice the squeeze key.
- **Silt patch:** one corner of silt to practice slowing down and waiting.
- **Kevin:** Marv's waterlogged training dummy, used to practice grabbing, towing, and air sharing. Kevin can be dragged anywhere in camp. Kevin will end up on the roof of the truck.
- No air drain in the pool. It is a toy, not a test.

### Jump Cliff
A ledge with three marked heights: 3 m, 8 m, 15 m.
- Jumping from 8 m or more ragdolls you (practice for dry sections, from [[Movement and Swimming]]).
- **Belly-flop meter:** a hand-painted sign scores your splash from 1 to 10. Marv reads the score out loud.
- Landing on a friend in the water knocks both of you into ragdoll. Intended.
- No damage at the hub. Ever.

---

## 7. Multiplayer join flow

| Situation | What happens |
|---|---|
| Hosting | Press "Dive with friends" on the title screen: you load into your own camp as the host. Lobby is friends-only at launch (from [[Rope and Multiplayer]]). |
| Joining at the hub | Accept a Steam invite or click "Join" on a friend in the Steam friends list. You walk in from the jungle trail by the truck. Marv: "Another one." |
| Joining mid-dive | You spawn at the stake. You clip on and "rappel" down the rope at 3x swim speed, auto-following it, until you reach the last diver. You become the new Last in the rope order. Takes 20 to 60 seconds. |
| Max players | 4. A fifth friend sees "Camp full" and can wait in a queue for the next run. |
| Leaving mid-dive | Your diver goes limp on the rope like a dead diver (the team can tow you). You keep your log entries and get your share of the haul banked so far. |
| Host leaves mid-dive | The run ends for everyone. Everything carried is banked at full value, no depth bonus. Everyone returns to their own camp. |
| Solo | Same camp, same flow, just you and Marv. The footprints on the platform show only the Leader spot. |
