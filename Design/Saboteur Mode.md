> **Decided Oct 21, 2026 (Conrad): in every 4-player game, one player is always the saboteur.** Anything below about a percentage chance or the mode being optional is superseded.

# Saboteur Mode

> **PROPOSAL, awaiting Conrad's approval.** Nothing here is decided. Built on saboteur answers 17 and 20 to 24 in [[Proposed Answers]]. Once approved, move the agreed parts into [[Rope and Multiplayer]] and log it in [[Decision Log]].

## The short version
In 4-player runs, the host can turn on Saboteur Mode. Each run there is a **25% chance** one random player is secretly the saboteur. Nobody but the saboteur knows if one exists. The saboteur has six "accident" abilities that make the dive go wrong but can never directly kill. The team can tie up a suspect, but a wrong accusation costs air. The saboteur wins if the team fails to reach the bottom.

Note: Conrad's answer 16 in [[Answers Round 1]] says that in 4-player games one player *is* secretly the saboteur. The 25% chance per run and "off by default" below go against that and may be too low to feel like a real mode (3 of 4 runs have no saboteur). Conrad decides; 100% or 50% are the obvious alternatives.

The goal is a funnier dive, not a meaner one. Every ability should be deniable ("that wasn't me, I swear, it was the crab").

---

## 1. Rules

| Rule | Detail |
|---|---|
| Who can play it | Exactly 4 players at the start of the run. |
| How it turns on | Host toggles it on the dive platform chalkboard (see [[Hub Design]]). Off by default. |
| Chance per run | 25% that a saboteur exists. The other 75% of runs have no saboteur, but everyone still gets the "a saboteur may be among you" warning. |
| Who | Random among the 4. The same player cannot be saboteur two runs in a row. |
| How you find out | When the rope clips on at the stake, the saboteur's mask HUD flashes a red tint for 2 seconds and shows their ability wheel. Everyone else sees nothing. |
| Rope position | The saboteur keeps whatever rope position they picked, so being Leader or Last is not a giveaway. |
| What everyone else does | Normal dive: reach the bottom, log, collect. |
| Leaderboards | Saboteur Mode runs go on a separate leaderboard so they don't mess with normal records. Logbook entries and Cash still count. |

---

## 2. Saboteur abilities
Opened with a hold-key ability wheel (only the saboteur has it). Each ability looks like something a normal clumsy player could do by accident.

| Ability | What it does | Cooldown | Evidence it leaves |
|---|---|---|---|
| **Quiet Unclip** | Unclip a teammate within arm's reach from behind in 1 s (normal unclip takes 3 s, per [[Proposed Answers]] #17). The victim drifts free. | 150 s | A soft "click" sound that is directional for whoever is closest. |
| **Silt Kick** | A huge silt cloud, 3x a normal sprint silt-out, behind you. | 90 s | Anyone can cause silt, so it is very deniable. The cloud starts at the saboteur's fins. |
| **Slow Leak** | Open a teammate's valve a crack: they lose 15% of current air over 30 s with a faint bubble stream from their tank. Only works while touching them (grabbing, towing, air sharing). | 180 s | Bubble stream from the victim's tank; victim's air readout drops faster. |
| **False Waypoint** | Place a waypoint up to 15 m away instead of where you stand, named anything (from [[HUD, Watch and Waypoints]], normal ones only go where you stand). | 120 s | Up close, a false waypoint flickers once every 10 s. Only noticeable if you stare. |
| **Light Flicker** | Make one teammate's flashlight flicker and die for 6 s. | 120 s | Their battery readout does not drop, which a sharp player can notice. |
| **Chum Drop** | Drop a pouch of bait that attracts the nearest creature (crayfish, leeches, an eel if one is near). | 240 s | A small brown cloud where it was dropped. |

Plus the free ability everyone has: **lying** on voice chat about directions, air, or what that sound was.

### Ability rules
- Abilities cannot be used for the first 90 seconds of the run, so the saboteur cannot wreck the team at the stake.
- Max one active effect per victim at a time.
- No ability causes damage or death directly. They create situations, then the cave does the rest.
- After being tied up, all abilities are disabled.

---

## 3. Detection and tie-up

### Clues the team can find
- **Ability evidence** (table above).
- **Results-style stats on the watch:** any player can tap their watch to see the team's live "Air Shared" and "Times Unclipped" counts per player. A saboteur who keeps "helping" teammates shows up here.
- **No-saboteur doubt:** 75% of runs have no saboteur. Real accidents happen constantly. That is the joke.

### Tie-up
1. **Two players** grab the same suspect at the same time and hold for 3 seconds (a rope-wrapping animation and sound).
2. The suspect is moved to the back of the rope (becomes Last) and cannot use tools, abilities, waypoints, or air sharing. They can still swim, talk, and complain.
3. The result is instant:

| Who got tied | What happens |
|---|---|
| The real saboteur | Their mask flashes red for everyone to see. Their abilities are off for the rest of the run. Marv's line is waiting at the results screen. |
| An innocent player (or no saboteur exists) | Both accusers lose 20% of their current air on the spot (the "rope tightens on your hoses" penalty). The innocent player is freed and gets a 60 s "Wrongly Accused" buff: +20% stamina regen. |

### Limits
- Each player can accuse **2 times per run**. A team can make at most 8 accusations.
- After a wrong accusation, nobody can tie anyone for 60 s.
- **Wriggle free:** a tied saboteur can break loose once per run if no teammate is within 8 m for 20 s. They mash keys for 10 s. Their abilities stay disabled, but they can swim off unroped. Pure chaos fuel.

---

## 4. Win conditions

| Outcome | Who wins | How |
|---|---|---|
| Team reaches the bottom with at least one non-saboteur alive | Team | Normal win. |
| Team reaches the bottom with the saboteur tied up | Team (big win) | Bonus for every non-saboteur. |
| All non-saboteurs dead (or out of air with no air pocket) | Saboteur | The saboteur must still be alive or have died after the last teammate. |
| Team gives up (host ends the run, or everyone swims out without reaching the bottom) | Saboteur | |
| Team reaches the bottom, saboteur never caught | Team, but saboteur gets the "Undercover" bonus if they used at least 3 abilities | Both sides get something. |

### Payouts (on top of normal haul, see [[Economy and Progression]])

| Result | Non-saboteurs | Saboteur |
|---|---|---|
| Team wins, saboteur tied | +$400 each, +1 FT | Normal haul only |
| Team wins, saboteur free | Normal | +$300 "Undercover" bonus if 3+ abilities used |
| Saboteur wins, saboteur alive | Wipe rules (25% of haul) | Full team haul +$600, +2 FT |
| Saboteur wins, saboteur died last | Wipe rules | Full team haul +$300 |
| No saboteur existed | Normal; each wrong accusation listed on the results clipboard for shame | n/a |

---

## 5. Balancing targets

| Number | Target | How to tune it |
|---|---|---|
| Saboteur win rate | 35% to 40% | Change cooldowns first, then the wrong-accusation air cost. |
| Abilities used per run | 5 to 8 | If lower, cooldowns are too long or abilities feel too risky. |
| Correct catches | 40% to 50% of saboteur runs | If higher, evidence is too obvious; if lower, add one more clue. |
| Wrong accusations per no-saboteur run | 1 to 2 | This is the comedy. If 0, the warning isn't creating doubt. |

Other balance rules:
- The saboteur shares the rope and the air budget, so wrecking the team too early drowns them too. That's the main natural brake.
- Saboteur Mode runs use Standard or Deep difficulty only. Easy is too short for any tension.
- Deep zones make every ability stronger (less air, more danger), so the saboteur is naturally strongest late. Tie-ups should usually happen in Zones 3 and 4.

---

## 6. How it stays funny, not toxic

1. **Opt-in, friends only.** Off by default, 4 friends only, no strangers at launch.
2. **No direct killing.** The saboteur makes accidents. Deaths come from the cave, so blame is always shared and nobody feels personally murdered.
3. **Everything is deniable.** Normal players silt, unclip, and get lost all the time. "It was the crab" must always be a believable defense (the Grout Crab really does cut ropes, see [[Logbook Species List]]).
4. **The reveal is the punchline.** At the results clipboard, a "Saboteur Highlights" page lists every ability used with a timestamp and what happened next ("12:41 Slow Leak on Tyrus. 12:43 Tyrus blamed Conrad."). Built to be read out loud and clipped.
5. **Wrong accusations are funny, not crushing.** 20% air hurts but rarely kills; the innocent gets a buff.
6. **Short punishment.** Being tied up doesn't remove you from the run. You still swim, talk, and get your share.
7. **No stats that shame.** No public "times caught" leaderboard. Only friends see saboteur stats.
8. **Never two in a row** for the same player, so nobody gets typecast.

---

## 7. Edge cases

| Situation | What happens |
|---|---|
| Saboteur disconnects | Saboteur role ends. Remaining players get a "Someone fled the scene" message at the results clipboard (not mid-run, to keep the doubt). The team wins by reaching the bottom as normal. |
| Saboteur reconnects mid-run | They rejoin through the mid-dive rappel (see [[Hub Design]]) with their role and cooldowns restored. |
| Innocent player disconnects (now 3 players) | Saboteur Mode stays on for this run. Next run, the toggle greys out unless a 4th player joins. |
| A player joins mid-dive | They are never the saboteur. Saboteur roles are only assigned at the stake. |
| Saboteur dies (and is the only saboteur) | They become a ghost bubble like anyone else (from [[Proposed Answers]] #25). Their identity stays hidden. Ghost sounds are the same for everyone, so a dead saboteur can still "help" in the wrong direction. Abilities are off. If revived, they get abilities back with full cooldowns. |
| Saboteur is the last one alive | If all three teammates are dead, the saboteur wins immediately. The run ends with the rope ascent. |
| Everyone dies at once (earthquake, eel chain shock) | If the saboteur died at the same moment or after the last teammate, saboteur wins with the lower bonus. |
| Tied saboteur needed for air sharing | Tied players cannot give air, but they can receive it. Teammates can still save them. |
| Saboteur is the host | No advantage. Roles are chosen at the stake from a random roll. (Among friends, cheating risk is accepted.) |
| Two players accuse each other at once | Only one tie-up animation can run per target. A player being tied can't tie anyone. |
| Unclipped player gets lost | Same as any unclip: they lose rope guidance and must find the rope again. Rope Tags and the hologram map help (see [[Economy and Progression]]). |
