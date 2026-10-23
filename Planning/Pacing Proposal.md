# Tied Under: Pacing Proposal (Phase 1, solo tunnel)

Status: Conrad said go (Oct 22, 2026). Built the same night, all 8 steps, compiled and tried in Play on the Mac: faster swim, beat gap meter, skill callouts and depth record, 24 find spots with haul, the three set pieces (air bell ledge, end slot pull, diver's slates), the return trip (outbound current, return moments, ascent pop), and stars, bests and the collection save. Next: a full no-command playtest to read the real longest gap, then a polish pass (bigger cards and counters, silt puff too white). Related: [[Run Variety System]], [[Overnight Build Oct 22]].

**The plan in one line:** keep the 169 m route, make swimming about 15% faster, and fill the route with seeded **finds** and **skill callouts** so something good happens every 15 to 30 seconds. Then turn the three big rooms (chimney, chamber, end slot) into the big payoffs, and give the swim back its own new beats.

## 1. Why the cave feels empty right now

- **Too little happens per minute.** A full dive runs about 6 to 7 minutes, and the moment director fires only 2 or 3 surprises in that time. That works out to one real event every 2 to 3 minutes. The route sections (bend, bedding plane, chimney) change how the cave looks, but they don't give you anything to *do*.
- **Swim speed against distance.** Top cruising speed is 140 cm/s (frog kick), and kick-and-glide swimming averages about 1.1 m/s. So the 166 m from the start to the end takes about 2:30 of steady swimming. Three connector stretches have nothing in them at all (55 to 61 m, 71 to 81 m, 97 to 110 m). That's about 29 m, or 25 seconds of plain swimming.
- **There's almost nothing to collect.** The whole game has one pickup (the glint), it only appears when the director rolls it, and it sits in the side passage, which is a dead end. Nothing gives you a reason to sweep your beam around.
- **Reaching the end feels flat.** The goal is touching a rock slot, and the reward is a text message.
- **The swim back is half the dive and has nothing new in it.** Every moment has already fired, and you swim the same tunnel in reverse.
- **No feedback until the very end.** There's no counter, no ping and no record during the dive. The slate at the end is the first time the game says "nice."

## 2. The target loop

- **A micro beat every 15 to 30 seconds of swimming.** At about 1.25 m/s, that means one every 20 to 35 m of route, in **both** directions.
- **A big beat every 2 to 3 minutes.**
- **Dive length: 6 to 8 minutes** for a full solo round trip. The 10 minute tank stays a real limit, because detours eat into it.

**The reward ladder, in this game's terms:**
- **Micro (every 15 to 30 s):** a glint catches your beam, then a tink, a name card and the haul counter goes up. Or a short skill callout like "Clean squeeze."
- **Small (every 45 to 90 s):** a rarer find, a diver's slate with a funny note, a new depth record ping, or a hidden find behind a boulder.
- **Big (every 2 to 3 min):** a set piece in a room you already have. The chimney drop through the water layers, surfacing in the air pocket to a surprise, pulling something out of the end slot, and seeing the daylight glow on the way out followed by the star rating.

## 3. Catalogue of reward beats (Phase 1 safe)

Pillar numbers: 1 friends first, 2 looks and feels real, 3 the rope, 4 never repetitive, 5 cost.

| Beat | What the player sees | The dopamine moment | Cost | Pillar | Funny in co-op later |
|---|---|---|---|---|---|
| **Lost things** (the glint, expanded) | Brass, glass or plastic sparkles in the beam from up to 10 m away | Tink, a name card ("a spoon. Why is there a spoon"), haul +$ | S (reuse `ADiveGlintObject`) | 4, 1 | Yes: racing to grab it, and "I saw it first" |
| **Rarity tiers** | Common junk, uncommon, rare (gold sparkle), legendary (pulsing) | Gold sparkle means "oh no way" | S | 4, 5 | Yes |
| **Goblin's Gold** (fake treasure) | A moss that shines gold in your light, real-world based | You swim over and get "Worth $0. It's moss." | S | 1, 2 | Yes: the classic trick-your-friend find |
| **Previous diver's slates** | A slate tied to a rock, with a short funny note that hints at the lost city legend | Something to read, a laugh and a story crumb | S | 1, 10% story | Yes: reading it out loud |
| **Hidden finds** | Finds placed behind boulders, in bedding plane corners and on chimney ledges, just off the swim line | "I only found that because I looked" | S | 4, 5 | Yes |
| **Skill callouts** | "Clean squeeze" (restriction with no wall hit), "Silt ghost" (silt room with no silt-out), "Smooth drop" (chimney with no bump) | A sound ping and a bonus +$ | S | 2, 5 | Yes: the person behind you fails it |
| **Depth record ping** | The watch flashes "New depth 22 m (best 19 m)" | A number beaten | S | 5 | Yes |
| **Air bell surprise** | Surface in the chamber's air pocket and find a dry ledge with a seeded set piece (an old lamp and a slate, a scratched "NOT THIS WAY", a camp bag with a find inside) | The reveal, and your air refills | M | 2, 4 | Yes |
| **The end slot** | Something is wedged in the 60 cm slot. Hold E for 3 s and it pulls free, the rock groans and silt puffs out | Tension, then the dive's best roll (rare or legendary) | M | 5, 1 | Yes: who reaches in? |
| **Side passage detour** | A rare-tier sparkle is visible from the junction, 15 m in | About 30 s of air for a better find, a real choice | S (placement) | 5 | Yes |
| **Return current** | Water flows outward through the bedding plane on the way back | A free 14 m ride at 3 m/s, with a whoosh and a bubble streak | M | 2, 4 | Yes: the rope yank, later |
| **Haul and stars** | Haul counter on the HUD and the watch. The slate shows 1 to 3 stars and "New best haul!" | A number going up, and a reason to press R | S | 4 | Yes |
| **Collection book** | The slate lists "Lost things found: 14 / 30" and tags first-ever finds "New!" | Completionist pull across dives | S to M | 4 | Yes |

## 4. Beat map of the existing route

**Recommendation: do not shorten the tunnel.** Its nine sections are good. They're empty, not too long. Fill the 29 m of dead connectors with finds instead. **Do speed up swimming a little:** `MaxDiveSpeed` 140 to **160 cm/s**, `KickImpulse` 95 to **110**, and `KickPeriod` 0.8 to **0.7 s**. That makes freestyle about 192 cm/s and leaves sprint at 250. Going faster than that would make silt stop mattering and would lose the heavy, real feel (the economy note caps speed for the same reason). The new average of about 1.25 m/s puts the end at about 3:00 and the full dive at about 6:30.

**Going in:**

| Time | Meters | Beat |
|---|---|---|
| 0:10 | 10 to 15 | **Guaranteed first find** on the entrance slope (common). This teaches "sparkle = grab it". |
| 0:25 | 28 Bend | The glow dies behind you, then a find sparkles around the corner |
| 0:30 | 35 Junction | Rare sparkle visible down the side passage (detour choice). Slate #1 at Branch |
| 0:40 | 41 to 55 | Bedding plane: 1 or 2 finds tucked in the low corners (buoyancy skill) |
| 0:55 | 55 to 61 | Connector find |
| 1:05 | 61 to 71 | **Clean squeeze** callout (the snag moment may roll here) |
| 1:15 | 71 to 81 | Connector find, or slate #2 |
| **1:25** | **81 to 97** | **BIG 1:** the chimney drop, halocline, thermocline, "New depth 22 m", a find on a ledge halfway down |
| 1:45 | 97 to 110 | Something glints in the chamber mouth, pulling you forward |
| **2:00** | **110 to 137** | **BIG 2:** the chamber opens up (eye adaptation), then surfacing reveals the air bell set piece and refills your air |
| 2:40 | 143 to 158 | **Silt ghost** callout, plus a half-buried find that you can only see if you keep the silt down |
| **3:00** | **163 to 169** | **BIG 3:** pull the item out of the end slot. The watch then says "Halfway. Get out with 40% air for a bonus." |

**Coming back:**

| Time | Beat |
|---|---|
| 3:30 | Silt room has settled: a find that was hidden going in is now uncovered |
| 3:50 | Chamber: a "the cave changed" return moment (rock fall dropped something, or the knocking has moved) |
| 4:20 | Chimney ascent: ear pop, your swirls are still in the halocline, a find that only shows when you look up |
| 4:50 | Restriction again: clean squeeze x2 |
| 5:15 | **Return current** in the bedding plane |
| 5:40 | Last chance at the junction detour |
| **6:10** | **BIG 4:** the blue glow comes back past the Bend, then the slate shows stars, haul and new bests, "R to dive again" |

## 5. Build next, in order (about 4 to 5 days)

1. **Speed tuning pass** (half a day). Put the three new values in `DA_DiveTuning`. *Done when:* a straight swim from the start to `End` with no stops takes 2:20 to 2:45, and the silt room still silts out if you sprint.
2. **Beat gap meter** (half a day). The character records a timestamp for every find, callout and moment. The slate (and `dive.Debug`) shows "Longest gap: 34 s at 97 m". *Done when:* it reports the real gaps in today's build, so every later step can be measured.
3. **Find spots** (1 day). 24 named find spots in `DiveTunnelRoute.cpp`, next to the existing markers. Each dive, the director's seed turns on 12 to 14 of them, rolls a tier for each and picks from a table of 30 lost things. Includes a 10 m sparkle range and a `dive.Finds` command. *Done when:* the same seed gives the same finds, no 30 m stretch in either direction is ever empty, and the first find is always within 15 m.
4. **Haul feedback** (half a day). Pickup card with a +$ value, a rising synth chime by tier, a counter on the HUD and the watch, and Haul and Finds lines on the slate. *Done when:* every pickup gives sound, a card and a number within 0.2 s.
5. **Three big set pieces** (1 day). Air bell ledge (3 seeded variants), end slot pull (hold E 3 s, rock groan, silt puff, best tier roll), and 8 diver's slates (2 or 3 per dive). *Done when:* all three fire in every dive, and the end slot never gives a common item.
6. **Skill callouts and depth record** (half a day). Clean squeeze, silt ghost, smooth drop, new depth. *Done when:* each one fires only when it was earned, and is listed on the slate.
7. **The return trip** (1 day). 1 or 2 return-only moments rolled by the director, find spots that are only visible facing out, and one current volume in the bedding plane that only runs on the way out (through the movement component's current hook). *Done when:* the beat gap meter shows no gap over 30 s on the way back. This pulls currents forward from a later phase. It's worth it because it's one volume, it directly fixes the long swims, and it doesn't block networking.
8. **Stars, bests and collection** (half a day). Local `USaveGame` with best haul, best time, deepest point and every find ever collected. The slate shows stars, "New best!" and "14 / 30". *Done when:* bests survive a restart, and a never-seen find shows "New!".

**Playtest goal:** in 3 dives in a row, the longest gap is under 30 s and the tester presses R without being asked.

## 6. How this stays never repetitive

Everything new rolls from the **same seed the moment director already uses**, so `dive.Moments 1234` rebuilds the whole dive: which 12 to 14 of the 24 find spots are live, each one's rarity tier and item, which 2 or 3 of the 8 slates appear, which of the 3 air bell set pieces you get, what the end slot holds, and which return moments fire. On top of that, the save file's collection list works as a tiny version of the Novelty Director. When the seed picks between equal options, it leans toward finds you have never collected. That way the "14 / 30" keeps climbing, and every dive has a fair chance of something "New!". The tunnel stays the same, but what you find in it, where it is and how the swim back goes change every dive. Every new find type should still go through the Run Variety checklist: a find that's always in the same place and always the same item fails it.
