# Run Variety System

> **PROPOSAL, awaiting Conrad's approval.** Nothing here is decided. This is the system that fights the game's one failure condition: becoming repetitive (see [[Home]] and [[Game Pillars]]). Once approved, move the agreed parts into [[Cave Generation]] and log it in [[Decision Log]].

## The short version
Every run is built from five layers that each roll separately:

1. **The cave itself** (layout archetype, zone variants, landmark rooms).
2. **Run modifiers** (0 to 2 per run: earthquakes, floods, low visibility, and more).
3. **The bottom** (one of several mystery bottom chambers).
4. **A contract** from Marv (optional side goal).
5. **Rare events** (rare biomes and rare creature events).

On top of that, a **Novelty Director** remembers what each player has already seen and pushes new things toward them, and an **unlock schedule** keeps adding content for the first 40 or so runs. Any new feature is tested against the checklist at the end of this note.

---

## 1. Procedural generation variety

The generator stitches handmade modular rock pieces together (approach from [[Engine, Hardware and Platforms]]). Variety comes from rolling these axes per run:

### 1.1 Layout archetype (one per run)

| Archetype | Shape | Feels like | Weight |
|---|---|---|---|
| The Shaft | Mostly vertical, big drops, ledges | Falling down a well | 20% |
| The Maze | Many short branches, lots of reconnects | Getting lost together | 20% |
| The River | Long horizontal passages with strong current | Being pushed around | 20% |
| The Chain | Big chambers linked by tight squeezes | Squeeze, relief, squeeze | 25% |
| The Split | Two main routes from Zone 2 that rejoin at Zone 4 | A real choice early | 15% |

### 1.2 Zone variants (one per zone per run)
Each of the 5 zones from [[Logbook Species List]] has 3 variants at launch. They change color, hazards, and which species are favored.

| Zone | Variant A | Variant B | Variant C |
|---|---|---|---|
| 1 The Mouth | Root Cenote (hanging roots, tangles) | Sunbeam Pool (open water, bright) | Bat Grotto (dry entrance chamber, guano) |
| 2 Twilight Throat | Glowworm Halls (dry chambers) | Silt Maze (silt everywhere) | Cold Spring (cold water, warm pockets) |
| 3 Black Galleries | Eel Run (long narrow passages) | Bone Floor (fossil-rich silt) | Mat Gardens (bacterial mats, white-outs) |
| 4 Sulfur Deep | Halocline Falls (thick veil layer) | Snottite Domes (acid air pockets) | Vent Fields (warm, chemosynthetic life) |
| 5 Old Water | Giant Caverns (huge open space) | Fossil Beds (dig sites) | Choir Fields (Choir Lilies, quiet awe) |

3 variants per zone across 5 zones gives 243 zone combinations, times 5 archetypes, before anything else rolls.

### 1.3 Landmark rooms
Handmade set-piece rooms dropped into the generated cave. **About 30 at launch**, at most 1 per zone per run. Examples:
- The Drowned Truck (an old car that fell into the sinkhole decades ago, with a lost diver's journal page).
- The Pipe Organ (stalactites that ring when the rope brushes them).
- The Wrong Way Room (an air pocket with a sign scratched into the rock: "NOT THIS WAY").
- The Bell Chamber (an air bubble trapped under a rock dome, voices echo three times).
- The Old Camp (a previous expedition's dry camp with abandoned gear to loot).

### 1.4 Repetition memory
The game keeps a history of the host's last 10 runs and **will not repeat**:
- The same archetype more than 2 runs in a row.
- The same zone variant in the same zone within 3 runs.
- Any landmark room within 5 runs.
- The same bottom within 4 runs.

### 1.5 Conditions drive spawns
Warm areas, currents, silt rooms, and air pockets each favor different species (rule 7 in [[Logbook Species List]]). Same depth, different conditions, different life.

---

## 2. Run modifiers
Each run rolls 0 to 2 modifiers. Odds by difficulty: Easy 0 to 1, Standard 1 (sometimes 2), Deep always 2. The dive platform chalkboard shows them before you jump, except "hidden" ones, which reveal themselves in the cave.

| Modifier | What it does | Hidden? | Funny or tense moment it creates |
|---|---|---|---|
| **Earthquakes** | 2 to 4 quakes in the run, more likely deeper (from [[Proposed Answers]] #46). Shake, falling rocks, one path closes, sometimes a new one opens. | Yes | The path behind you collapses. You can only go down now. |
| **Flood Surge** | Every 6 to 8 minutes, a pulse of current rushes down the cave for 20 s. Anchor to the wall or get dragged. | No | The rope yank (funny moment #1) on a schedule. |
| **Low Visibility** | Silt hangs in the water; light range is 40% shorter. | No | "Who is that? Is that you?" |
| **Warm Spring** | A warm current runs through the cave. Cold is gone, more life spawns. | No | A relaxed run full of logging. A breather. |
| **Cold Snap** | Cold drains stamina 2x, warm pockets matter. | No | Huddling in an air pocket together, shaking flashlights. |
| **Bloom** | Twice as many glowing creatures. Lanterns fill fast. | No | The prettiest run. Clip bait for Instagram. |
| **The Old Line** | An old expedition's rope runs through the cave. Follow it for shortcuts and lost gear, but it ends somewhere bad. | No | "Do we trust the dead guy's rope?" |
| **Gold Rush** | 2x treasure spawns, but more territorial creatures. | No | Greed versus survival. |
| **Silent Cave** | Almost no creatures. Very quiet. Sounds carry far. | Yes | The 15% horror: something big is out there. A Platejaw sighting is more likely. |
| **Bat Exodus** | Thousands of bats pour out of the entrance at the start. | No | Screaming at the stake before the dive even starts. |
| **Leech Season** | Rope Leeches are common in every zone. | No | Picking leeches off each other in air pockets. |
| **Shifting Silt** | Silt floors slowly bury and reveal dig spots every few minutes. | No | Fossils appear behind you; do you go back? |
| **Echoes** | Voices echo with a delay in chambers. | No | Talking over your own echo, confusion on the rope. |
| **Busted Gear** | Every player starts with one random gear fault (a cracked mask seal, a weak battery, a sticky clip). | No | Everyone has a different problem. |
| **Collapse Ahead** | Marv warns the main route is blocked; the team must find a side route at Zone 3. | No | Forced exploration of branches you'd normally skip. |
| **Visitor** | One creature from two zones deeper appears early (from rule 6 in [[Logbook Species List]]). | Yes | A Lanternjaw in Zone 2. Nobody is ready. |

Modifier rules:
- Two modifiers that cancel each other (Warm Spring and Cold Snap) never roll together.
- No modifier repeats within 3 runs (repetition memory).
- Deep difficulty gets one modifier from a "spicy" list (Earthquakes, Flood Surge, Silent Cave, Busted Gear).

---

## 3. Mystery bottoms
The bottom is a massive flooded chamber with an ancient, unexplained ruin (from [[Proposed Answers]] #45) and a huge harmless creature to log (#43). Each bottom is a different ruin and creature.

| Bottom | The ruin | The giant | Unlocks |
|---|---|---|---|
| The Drowned Steps | A staircase carved into rock, leading nowhere | A whale-sized blind cavefish | First bottom, always |
| The Lantern Hall | Thousands of stone niches with glowing fungi in each | A giant Spiral Drifter | After 2 bottoms |
| The Ribcage | A natural chamber inside a fossil skeleton the size of a building | A giant Cathedral Isopod colony | After 4 bottoms |
| The Mirror Lake | An air chamber with a perfectly still lake you see your team in | A giant Echo Ray that mimics the whole team | After 6 bottoms |
| The Door | A huge stone door, sealed, with handprints | Something behind the door you only hear | After 8 bottoms |
| The Garden | A ring of Choir Lilies that plays a full song when all 4 divers touch them | A swarm of Starfall the size of a building | After 10 bottoms |

More bottoms are a strong post-launch update (each one is a content drop and a devlog).

Each bottom also has 3 small random parts (lighting color, which side tunnels exist, where the fossil cache is), so even the same bottom looks different.

---

## 4. Contracts from Marv
The Contract Board shows 3 contracts every hub visit. Pick one or none. Rewards from [[Economy and Progression]].

| Contract | Goal | Reward | Difficulty |
|---|---|---|---|
| Show and Tell | Bring back any $$$ fossil | $250, 1 FT | Normal |
| Lights Out | Reach Zone 3 with no flashlights on (lantern only) | $400, 1 FT | Hard |
| Measure Twice | Log 3 size records in one run | $200, 1 FT | Normal |
| Bring Kevin | Take Kevin the training dummy down to Zone 3 and back on the rope | $500, 3 FT | Hard (and stupid) |
| Tight Squeeze | Pass through 10 squeezes | $250, 1 FT | Normal |
| No Tangles | Reach Zone 2 without a single rope tangle | $300, 1 FT | Normal |
| Photo Day | Photograph 3 dangerous species | $450, 3 FT | Hard |
| Light Bulb | Fill the lantern to max slots | $350, 1 FT | Normal |
| Air Miser | Finish with 30% air left | $300, 1 FT | Normal |
| Find My Stuff | Find Marv's lost camera in a specific zone | $600, 3 FT | Hard |

Rules: at least one of the 3 is always a contract you haven't done before. Doing 5 contracts in a row gives a "Marv's Favorite" streak bonus (+2 FT).

---

## 5. Weekly seed
- Every Monday, a fixed seed goes live: the same cave, modifiers, and bottom for every player.
- Shown on the Contract Board as a pinned postcard.
- Leaderboards for that seed only: fastest to the bottom, most species, most air left.
- The weekly seed always uses one modifier combination that can't roll normally (for example, Bloom plus Silent Cave: a beautiful, quiet, creepy run).
- Rewards: Fin Tokens for placing in the top 25% of your friends (see [[Economy and Progression]]).
- Bonus content angle: Conrad posts "this week's seed" runs on Instagram and TikTok.

---

## 6. Rare events

### Rare biomes (about 1 in 12 runs)
Replace one normal zone variant.

| Rare biome | Zone | What makes it special |
|---|---|---|
| Crystal Throat | 2 or 3 | Giant selenite crystals that scatter light; flashlights light whole rooms |
| Drowned Forest | 1 or 2 | A sunken petrified forest, root tangles everywhere |
| Lava Glass Tunnels | 4 | Black glassy rock, warm water, sharp edges (lots of cuts) |
| Bone Choir | 5 | A cavern lined with fossils that hum when currents pass |

### Rare creature events (about 1 in 15 runs)

| Event | What happens |
|---|---|
| Lobefin Run | A school of Deep Lobefins migrates up into Zone 3 |
| Starfall Night | A Starfall Swarm appears in Zone 4 instead of Zone 5 |
| The Hunt | A Platejaw is actively hunting in Zone 5; lights attract it |
| Shiny Hour | Shiny spawn chance goes from 1 in 200 to 1 in 20 for the run |
| Lamplighter Sighting | The Lamplighter appears for the first time and leads someone off the line |

**Guarantee:** every player sees at least one rare biome or rare creature event by run 8. After that, pure luck.

---

## 7. The Novelty Director
A background system that tracks what each player has seen (species, variants, landmark rooms, modifiers, bottoms).
- **Runs 1 to 20:** every run includes at least 3 things the least-experienced player has never seen.
- **After run 20:** at least 1 new thing per run while unseen content exists.
- When choosing between equal options (which landmark, which spawn), it picks the one the group has seen least.
- It never forces a rare event; it only tilts the odds.

---

## 8. Unlock pacing
New content keeps arriving for about the first 40 runs, so early runs never feel like "this is all there is."

| Run or milestone | What unlocks |
|---|---|
| Tutorial | Practice sinkhole, Zones 1 and 2, archetypes The Chain and The Maze |
| Run 3 | Run modifiers start rolling; contracts unlock |
| Run 5 | The River and The Shaft archetypes |
| First Zone 3 reach | Zone 3 variants, Earthquakes modifier |
| Run 8 | Rare biomes and creature events (one guaranteed) |
| First Zone 4 reach | Zone 4 variants, Deep difficulty |
| Run 12 | The Split archetype; weekly seed |
| First bottom | Bottom 1, "Keep going" endless mode, Saboteur Mode toggle |
| 2, 4, 6, 8, 10 bottoms | Bottoms 2 to 6 |
| 25 species | Zone C variants (third variant in every zone) |
| 40 species | Hard contracts become 1 of the 3 every visit; the rarest landmark rooms |

Saboteur Mode unlocking at the first bottom means friends learn the real game before they start betraying each other.

---

## 9. Repetitiveness checklist
Run every new feature, room, creature, or system through this. **It needs at least 4 yes answers to ship.** Fewer than 4: rework or cut it.

| # | Question | Yes / No |
|---|---|---|
| 1 | Does it play out differently depending on who is on the rope and what they do? | |
| 2 | Does it interact with at least two existing systems (rope, air, silt, light, currents, creatures, buoyancy)? | |
| 3 | Can it create a moment players would clip and send to a friend? | |
| 4 | Is it different on run 20 than on run 2 (because of skill, gear, or context)? | |
| 5 | Does it vary by depth zone, modifier, or cave layout? | |
| 6 | Does it force a decision with a cost (from pillar 5 in [[Game Pillars]])? | |
| 7 | Can players not see it every run (rare enough to be a surprise)? | |
| 8 | Does it avoid adding a chore that must be done every run the same way? | |

Red flags that mean "cut it" no matter the score:
- It is a fixed sequence that plays the same every time (like an unskippable cutscene).
- It is a required step every run with no choice.
- Its best strategy is the same in every cave.
