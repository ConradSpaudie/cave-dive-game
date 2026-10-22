# Phase 2 Prompts

Copy-paste prompts for Claude Code to build Phase 2 "Friends" from the [[Roadmap]]: two divers in the same cave over the internet, tied together by one rope, talking with proximity voice. It all happens in the Phase 1 rock tunnel (the 169 m handmade route), so every new piece of work is about people, not caves.

> **Which phase number?** The [[Roadmap]] calls Phase 2 "Friends", and that is what this note builds. The newer Claude doc "Tied Under: Unreal Build Plan" (Oct 21) orders things differently: there, Phase 2 is "The Cave" (the procedural generator) and co-op is Phase 5 (Mar 3 to Apr 7). These prompts work in either order. If the cave comes first, Prompt 0 names the phase "Phase 5 Co-op" instead, and Prompt 2 must also send the cave seed to the joining player. See Open question 1.

**What Phase 2 delivers**
- 2-player online co-op through Steam. The host's game is the server (a listen server). The friend joins from the Steam friends list or an invite, even mid-dive.
- Swimming, breathing, the vest, lights, panic, injuries and gear that work the same online as solo, with no rubber-banding at normal lag.
- One rope from the stake through both divers, at most 6 m of rope between them, with tugs as a way to talk.
- Grabbing, towing and sharing air. Blacking out turns you into a ghost bubble your buddy can save at an air pocket, or you respawn at the stake after 40 s.
- Proximity voice (9 m, muffled underwater, clear in air pockets) and the no-mic options: hand signals and bubble text.
- A co-op dive slate, a playtest with Tyrus and Loenn, and a two-player performance check.
- **Goal: two people swimming together on a rope is already funny.**

**What Phase 2 does NOT build** (CLAUDE.md enforces this after Prompt 0)
- Saboteur Mode and everything in [[Saboteur Mode]] (scissors, valve wrench, blood bait, tie-up, friendly fire), the 4-player mode choice (Team Mode or Saboteur Mode), and 3 or 4 player tuning. The code must not assume exactly 2 players (use lists, never "the other diver"), but only 2 players get tested.
- Procedural caves, currents and the escape mini game, tangles and the untangle mini game, creatures, weapons.
- The hub, a lobby, the rope color vote, text chat, public matchmaking, dedicated servers, host migration.
- Epic's newer systems Iris (replication) and Mover (movement). We keep default replication and the Character Movement Component, as [[Multiplayer, Steam and Voice]] and [[Swimming and Underwater Movement]] recommend.

**How long:** about 6 weeks at 15 hours a week (about 90 hours). Prompts 1 to 4 are the hardest: plan two weeks for them. Prompts 3, 7 and 8 may each need two sessions. After that, roughly two prompts a week.

**The failure condition still rules: if the game becomes repetitive, it has failed.** Phase 2 adds no new caves, so the variety has to come from people: a buddy who silts you out, a tug code read wrong, a tow to the air pocket with 3 seconds left. When a prompt leaves a choice open, pick the version that makes a different story every dive. Prompt 14 checks it: if the third dive of the night feels like the first, write down why.

Design sources: [[Game Pillars]], [[Rope and Multiplayer]], [[Rope System]], [[Multiplayer, Steam and Voice]], [[Swimming and Underwater Movement]], [[Decision Log]], [[Answers Round 3]], [[Saboteur Mode]] (only to know what not to build). Code sources in the repo: `CLAUDE.md`, `README.md`, `REVIEW-NIGHT.md` (section "Phase 2 networking prep plan (not done)") and `REVIEW-PHASE1.md` (section 4).

## Binding decisions these prompts follow
From the [[Decision Log]] and [[Answers Round 3]]. Where an older note says something else, these win (Prompt 0 fixes the old notes).

| Rule | Value |
|---|---|
| Rope between divers | At most 6 m between neighbours (Tech/Rope System said 8 m) |
| Nails | 10 per person per dive |
| Voice | 9 m underwater, muffled and bubbly, clear in air pockets, no radios (Tech note said 25 m) |
| No-mic options | Mic (default), Hand signals, Bubble text (Enter; voice typing with the computer's own dictation). Design/Rope and Multiplayer still says "voice only": outdated |
| Keys | C clip and unclip, Space up, no down key, E grab rock or friend, Q slow breathing, G glow stick, R follow rope, T tug, H share air, N nail, Z signal wheel, Enter bubble text |
| Death (Team Mode rules) | You become a ghost bubble. Friends revive you by bringing your body to an air pocket. Otherwise you respawn at the stake after 40 s with full air and no leftover tape or glow sticks, and follow the rope down |
| Hosting | One player hosts through Steam. Host quits = the dive ends for everyone |
| Joining | Mid-dive: spawn at the stake and follow the rope down |
| Friendly fire | Off (Team Mode). There are no weapons yet anyway |

## How to use these
- Same loop as Phase 1: **one prompt per session, in order.** Paste the whole code block. Close the Unreal Editor before Claude Code builds.
- **Solo must keep working.** After every prompt, also press Play with 1 player and run a few Phase 1 checks from README.md. Co-op that breaks solo is not done.
- Commit after every prompt that passes its test. Networking bugs hide well; small commits make them easy to find.
- From Prompt 5 on, play with Tyrus over Steam at least once a week. Loenn joins the weekly playtest and writes down every funny moment.
- When a decision changes while building, update the Design note and add a line to [[Decision Log]].

### The two-player Play loop (every test uses it)
1. Next to the green **Play** button, click the three dots (Change Play Mode and Play Settings). Set **Number of Players** to `2` and **Net Mode** to **Play As Listen Server**. Pick **New Editor Window (PIE)** so each player gets a window. The window titles say which is the server (the host) and which is the client.
2. Press Play. Click into a window to control that diver. **Shift+F1** (fn+Shift+F1 on a Mac keyboard) frees the mouse so you can click the other window.
3. **Lag:** Editor Preferences > Level Editor > Play > Multiplayer Options: tick **Enable Network Emulation**, profile **Average** first, then **Bad**. If you cannot find it, type in each window's console (Backtick): `NetEmulation.PktLag 150` and `NetEmulation.PktLoss 2`. Back to normal: `NetEmulation.PktLag 0` and `NetEmulation.PktLoss 0`.
4. **Corrections:** in the client window type `p.NetShowCorrections 1`. Every time the server corrects your position it draws two capsules (where you were and where the server put you). A few in Bad lag are fine. A steady stream while swimming normally is a bug: take a screenshot and tell Claude Code what you were doing.
5. `stat net` shows the data going in and out. `stat unit` works as before.
6. Menu names are as of UE 5.8. If one has moved, ask Claude Code.

Both Play windows run inside one editor. That is fine for everything except Steam and real voice (Prompts 5 and 12), which need **Standalone Game** on two computers.

---

## Prompt 0: Update CLAUDE.md for Phase 2
**Goal:** every future session knows we are in Phase 2, what it may and may not build, and the new networking rules.

```text
Read CLAUDE.md, then from the vault: Planning/Roadmap.md, Planning/Decision Log.md, Planning/Phase 2 Prompts.md (the intro and the binding decisions table), Design/Rope and Multiplayer.md, Tech/Multiplayer, Steam and Voice.md, Tech/Rope System.md. In the repo: REVIEW-NIGHT.md (section "Phase 2 networking prep plan (not done)") and REVIEW-PHASE1.md (section 4).

Update CLAUDE.md. Do not change any code.

1. Replace "Current phase" with Phase 2 "Friends": 2-player online co-op on a listen server through Steam, the shared rope (at most 6 m between divers, tugs to talk), joining mid-dive by following the rope down from the stake, grabbing, towing and sharing air, Team Mode death (ghost bubble, revive at an air pocket, 40 s respawn at the stake), proximity voice (9 m) with the no-mic options (hand signals, bubble text), a co-op dive slate. Still the one handmade rock tunnel.
2. "Do NOT build yet": Saboteur Mode and its tools, the 4-player mode choice, 3 and 4 player tuning, procedural caves, currents, tangles, creatures, weapons, hub, lobby, rope color vote, text chat, public matchmaking, dedicated servers, host migration, Iris, Mover. Code must never assume exactly 2 players (lists, not "the other diver").
3. A new short section "Networking rules":
   - The server owns gameplay truth: air, damage, who is out, the rope, silt. Clients send input and requests (Server RPCs on the owning component).
   - Every new gameplay value says in its comment who owns it and how it travels: saved move, replicated to everyone, owner only, or local only.
   - Button states that change movement go in the saved move (FDiveNetworkMoveData), never in a plain variable.
   - Visual and audio components that are "my own screen or my own ears" run only for the locally controlled diver. "What my buddy looks like" runs on every machine.
   - Random gameplay rolls only on the server. Cosmetic randomness can run anywhere.
   - Solo (Standalone and 1-player Play) must play exactly like Phase 1.
   - Test loop after every prompt: 1 player, then 2 players as listen server, then with Bad network emulation and p.NetShowCorrections 1.
4. Point "Build order and prompts" at Planning/Phase 2 Prompts.md (keep the Phase 1 line as history) and add Tech/Multiplayer, Steam and Voice.md to the list of notes.
5. Plugins: Online Subsystem Steam is approved. Steam Sockets and Synthesis are separate built-in plugins that are NOT approved: ask first.
6. Keep CLAUDE.md under about 200 lines. Shorten the Phase 1 Prompts status to two or three lines if needed.

Then fix three stale lines in the vault so the notes match the Decision Log (show me each change first): Design/Rope and Multiplayer.md "No hand signals; voice only" (now Mic, Hand signals, Bubble text), Tech/Rope System.md player spans "start at 8 m" (now 6 m), Tech/Multiplayer, Steam and Voice.md "silent beyond about 25 m" (now 9 m). Add a line to Planning/Decision Log.md: today's date, "Phase 2 Friends started, built from Planning/Phase 2 Prompts.md".

Show me the CLAUDE.md diff and wait for my OK before committing.
```

**Do by hand in the editor:** nothing.

**Test it worked:**
- Quit Claude Code, start it again in the project, and ask: "What phase are we in, what are you not allowed to build, and who owns a diver's air in co-op?" It should say Phase 2 Friends, list Saboteur Mode and procedural caves among the forbidden things, and say the server owns air.
- The three vault notes now say 6 m, 9 m and the three no-mic options.

---

## Prompt 1: Move gameplay state off the character
**Goal:** step 1 of the networking prep plan in REVIEW-NIGHT.md. `ADiveCharacter` goes back to being a wiring hub, and every piece of gameplay state lives in a component that can replicate later. Solo plays exactly the same.

```text
Read CLAUDE.md, then from the vault: Tech/Swimming and Underwater Movement.md (Networking the custom movement), Tech/Multiplayer, Steam and Voice.md. In the repo: REVIEW-NIGHT.md, section "Phase 2 networking prep plan (not done)", step 1, and REVIEW-PHASE1.md section 4.

Do step 1 of that plan exactly as written. No networking yet. Behavior must not change at all.

1. New UDiveGearComponent (Diver/DiveGearComponent.h/.cpp): GlowSticksLeft, HeldStick, ChestStick, bLightOnBeforeStick, bTookStickThisPress, bAimingThrow, GlowHoldTime, ThrowArc, bThrowArcHit, WaypointCount, and TakeGlowStick, StowGlowStick, ThrowGlowStick, UpdateGlowStick, GetThrowStart, GetThrowVelocity, DropWaypoint. Inputs from the character each frame: camera transform, stamina, Injury->GetThrowPowerScale(). Outputs: "stick light on" (for panic), the throw arc (for the HUD), messages. Move GlowSticksPerDive, ThrowSpeed and the other tunables with the same names.
2. New UDiveRopeHandsComponent (Diver/DiveRopeHandsComponent.h/.cpp): ClipTimer, bFollowKeyHeld, bFollowingRope, TugKick, TugFlashTime, NailsLeft (NailsPerDive stays 10), RopeMessage, RopeMessageTime, the Rope pointer, and the UpdateRopeActions, HandleClip, HandleTug, HandleNail logic. Outputs: the values for UDiveMovementComponent::SetFollowingRope, the tug push, TugKick for the camera.
3. Breathing state into UDiveAirComponent: BreathHoldLeft and RegulatorOutTime. Air exposes "extra panic per second right now" (today 0.06 and 0.02, hard-coded in ADiveCharacter::Tick: make them tunables with those defaults) and an OnMustDrown event. The character keeps adding that panic.
4. Holding rock: delete the character's bHoldingRock and RockNormal copies; read Move->IsHoldingRock().
5. Tank keys: TankKeyDownTime and the drop timing move into UDiveTankComponent.
6. Leave on the character: camera feel (bob, roll, shake, drift, barrel roll), hand glow, input handlers. They are local and cosmetic.
7. Update every caller: GetHUDStats, the hints (DiveCharacterHints.cpp), the dive log inputs (DiveCharacterRun.cpp), the watch inputs, DiveTuningData and DiveCharacterTuning.cpp, ReleaseHeldInputs, and the console commands. Keep the data flow rule: components never find each other; ADiveCharacter::Tick hands values across.
8. Each new component gets a plain-English header comment, including one line on what will replicate in Phase 2 (owner only, everyone, or server only).
9. Update the code map in CLAUDE.md and the class table in README.md.

Build and fix all errors (remember -Wshadow and the other compile rules in CLAUDE.md). Then list every tunable that moved, so I can re-enter any value I had changed in BP_DiveCharacter or DA_DiveTuning.
```

**Do by hand in the editor:**
1. Open `BP_DiveCharacter`. For each tunable Claude listed, select the new component (Gear, RopeHands, Air or Tanks) and re-enter any value you had changed. Compile, Save.
2. Open `DA_DiveTuning` and check that the glow stick and nail values still have their ticks.

**Test it worked (solo, 1 player):**
1. Glow sticks: G to take, G to crack, hold G to aim (dotted arc and X), let go to throw. 5 sticks, count goes down.
2. Rope: C to clip on (3 s), hold R to follow, T to tug, N to nail (watch says 9 nails left).
3. Tanks: `DiveTanks 2 1 0`, `DiveEmptyTank`, press 2, hold 1 to drop the empty tank.
4. The stuck-keys test from REVIEW-NIGHT.md (hold B, H and Z while drowning, then `dive.RefillAir`): nothing stays held.
5. Light off, crack a glow stick: PANIC stops climbing from darkness.
6. `stat unit` while swimming: Game time the same as before.
7. Two-player Play loop, lag off: it only has to start without crashing. Everything else in co-op is still wrong, and that is expected.

---

## Prompt 2: Two divers in one cave
**Goal:** with two players in Play, both see the same rock tunnel and each other. Things that belong to "my own screen" stay local. Swimming will still stutter on the client: Prompt 3 fixes that.

```text
Read CLAUDE.md, then from the vault: Tech/Multiplayer, Steam and Voice.md, Design/Rope and Multiplayer.md, Game Pillars.md (fully first person). In the repo: REVIEW-NIGHT.md steps 2 (only the "visual components stay local" part) and 5, REVIEW-PHASE1.md section 4.

Make 2-player Play As Listen Server work in Play In Editor. No Steam yet (the Null online subsystem that Play In Editor uses is fine).

1. The cave on every machine. ACaveDiveGameMode spawns ADiveTunnelActor in InitGame, which only runs on the server, and ADiveTunnelActor::SpawnExtras returns early without authority, so the client gets no rock. Fix it so both machines have the same tunnel, side passage, water layers, air pocket and silt volumes. Preferred: the tunnel actor replicates (always relevant) and every machine builds its own mesh and dressing from the same seed and route data, so no rock is ever sent over the network. Gameplay volumes (silt, air pocket) exist on both machines; who decides their state comes in Prompt 6. Make sure nothing in the build uses unseeded randomness, and log a short checksum of the built mesh on each machine so I can compare.
2. Player starts: both divers start near the tunnel start, about 2 m apart, never inside each other (extend ChoosePlayerStart).
3. Local only: everything that is "my own screen or my own ears" runs only for the locally controlled diver: post process (UDiveUnderwaterComponent), mask water and mask fog, watch, hints, synth audio, marine snow, surfacing effects, the water layer sensor's screen effects, recording and cinematic, the first-person body and arms. Some already check IsLocallyControlled (see CLAUDE.md); add the same check to the rest, and switch their tick off on other players' divers so they cost nothing.
4. What my buddy looks like: the full body (ACharacter's Mesh, owner no see) shows on the other screen with its head, roughly in a swim pose along the direction it moves. Its flashlight beam comes from its hand and points where that player looks (use the replicated aim, GetBaseAimRotation, not the camera). Simple is fine; Prompt 6 polishes it. Follow the Lumen rule in CLAUDE.md for every moving mesh.
5. Per-player drowning, first version: in a game with more than one player, StartDrowning and RestartAfterOutOfAir must not call OpenLevel (it resets everyone). For now the game mode restarts only that player at the start with full air. Single player keeps OpenLevel exactly as today. Prompt 11 replaces this with the ghost bubble.
6. The F10 settings panel only pauses in single player. With more players it opens without pausing. Keep the "let go of held keys" behavior.
7. Debug console commands act on your own diver. Make the ones that change gameplay (dive.RefillAir, dive.SetBattery, DiveTanks, DiveEmptyTank, DiveForceCut, DiveHeal, DiveEndRun, dive.GoTo, dive.GoToMark, dive.TeleportStart) work from the client by sending a Server RPC. List any you leave single-player only.
8. The character replicates as normal. Do NOT replicate the components yet (Prompt 4). Add one dive.Debug line on each window: net mode (server, client or standalone), my role, number of players.

Build, fix errors. Then list what will still look wrong with 2 players until Prompts 3 to 6.
```

**Do by hand in the editor:**
1. Set up the two-player Play loop (top of this note). Lag off for now.
2. If Claude moved anything that needs a setting in the level or a Blueprint, do what it lists.

**Test it worked:**
1. Play with 1 player: the dive plays like Phase 1, and F10 still pauses.
2. Two-player Play loop, lag off: both windows show the same rock tunnel. In the Output Log, the tunnel checksum line is the same for the server and the client.
3. In the server window, look at the other diver: a full body with a head and a flashlight beam. Same in the client window. Neither window shows the other player's watch, hints, mask water or HUD.
4. On the client, look up and down: on the server's screen the client's beam follows.
5. In the client console: `dive.RefillAir`, `DiveForceCut 0.6`, `DiveHeal`. Each acts on the client's own diver.
6. Drown the client fast (`DiveTanks 1 0 0`, then `DiveEmptyTank`): only the client's diver restarts at the start. The server's diver is untouched.
7. F10 in either window: the panel opens and the dive keeps running.
8. Expected and not bugs yet: the client's swimming stutters or snaps back, the vest lifts differently on the two screens, the rope belongs to one diver only.

---

## Prompt 3: Replicated swimming with saved moves
**Goal:** your own swimming feels as smooth online as solo, and your buddy sees you swim smoothly, even with lag. Step 3 of the prep plan (the movement part).

```text
Read CLAUDE.md, then from the vault: Tech/Swimming and Underwater Movement.md (Networking the custom movement), Tech/Rope System.md (Rope pull and network prediction). In the repo: REVIEW-NIGHT.md step 3, and the header comment of UDiveMovementComponent.

Make UDiveMovementComponent predict on the client and replicate correctly:

1. Use the newer move data path, because 5.8 only has 4 custom compressed flags (FLAG_Custom_0 to _3) and we need more: FDiveNetworkMoveData (subclass of FCharacterNetworkMoveData from 5.8 CharacterMovementReplication.h) with its Serialize, a container subclass, and SetNetworkMoveDataContainer in the movement component constructor. Plus FSavedMove_Dive (Clear, SetMoveFor, PrepMoveFor, CanCombineWith and whatever else 5.8 needs) and FNetworkPredictionData_Client_Dive. Check every signature in the 5.8 headers.
2. Per-move data: sprint held, burst kick (a one-shot: it must fire exactly once on the server and the client, also when moves are combined or resent), holding rock and the rock normal, following the rope with the hold point and direction, stroke style. Quantize vectors sensibly.
3. Slow-changing values replicate as normal properties, set by the server: loadout scales (speed and stamina from the tanks), flow velocity, stamina regen multiplier. For now BuoyancyAcceleration is server-set too and the client accepts small corrections (Prompt 4 puts the vest in the move).
4. Stamina changes how fast you can sprint, so the server and the client must agree. Either make it part of the predicted movement state (restored correctly on a correction), or make it server owned and replicated with small corrections. Pick the simpler correct option and explain why.
5. Tug pushes (PendingAcceleration from the rope) are decided on the server: apply them as a server-side launch, not from client input, and keep them soft so the correction is smooth.
6. Simulated proxies (your buddy on your screen) move smoothly, no jitter. Use the movement component's built-in smoothing and tune it if needed. Camera bob, roll and barrel roll stay local and never touch the capsule.
7. A dive.Debug line: corrections in the last 10 seconds and the size of the last one in cm.
8. Rewrite the networking part of UDiveMovementComponent's header comment in plain English: what travels in the move, what replicates, what stays local. Update the "(Saved move flag in Phase 2.)" notes.

Build, fix errors. Then tell me the 3 tests most likely to show a bug, and what the bug would look like.
```

**Do by hand in the editor:** nothing. Use the two-player Play loop with lag off, then **Average**, then **Bad**.

**Test it worked:**
1. Solo: swimming feels exactly as before (kick rhythm, glide, burst kick, sprint, strokes on K, barrel roll).
2. Two players, lag off, `p.NetShowCorrections 1` on the client. On the client: swim to the junction, sprint (hold Shift), tap Shift for burst kicks, switch stroke with K, hold E on rock and pull along it, hold R on the rope and slide. No capsules, or a rare one.
3. Same with **Average**, then **Bad**: swimming still feels instant on the client. A few small corrections in Bad are OK if you cannot feel them.
4. From the server window, watch the client's diver sprint and burst kick: smooth, no jitter, no teleporting.
5. Burst kick test: in Bad lag, tap Shift 10 times fast on the client. Both screens show the same number of lunges, none doubled or missing.
6. Puff the vest (B) on the client in Bad lag: small corrections while rising are expected until Prompt 4. Note how bad it looks.
7. `dive.Debug 1` on the client: the corrections line stays near 0 while swimming normally.

---

## Prompt 4: Air, light, vest and panic online
**Goal:** the server owns every number that can kill you, each player sees their own exact numbers, and the vest is predicted so going up and down feels as instant as solo. Step 2 of the prep plan, plus the vest part of step 3.

```text
Read CLAUDE.md, then from the vault: Design/Diving Systems.md, Tech/Swimming and Underwater Movement.md, Tech/Multiplayer, Steam and Voice.md (the server owns all gameplay truth). In the repo: REVIEW-NIGHT.md steps 2 and 3 (the buoyancy part), REVIEW-PHASE1.md section 4 items 2 and 6.

1. SetIsReplicatedByDefault(true) on Air, Buoyancy, Panic, Injury, Tanks, Mask, Flashlight, Gear and RopeHands. Replicate only what other machines need (DOREPLIFETIME). COND_OwnerOnly for numbers only my own HUD shows: panic, tape left, battery percent, air liters, stamina, mask water. Everyone gets what they can see or hear: light on or off and which light, breath state (for bubbles), held glow stick, regulator out, injured or not. Use OnRep functions for anything that must change a visual.
2. The server runs air, panic, injury, mask and battery. The owning client may run the same math for smooth HUD numbers, but the server's value wins (ease toward it when it arrives, snap if far off).
3. Every gameplay change from input goes through a Server RPC on the owning component, validated on the server: light toggle and switching lights (F), slow breathing (Q), regulator out (H), duct tape (X), tank switch and tank drop (1, 2, 3), glow stick take, crack and throw (G), waypoint (P). For example: no tape with 0 strips, no dropping a tank that is not empty.
4. Random gameplay rolls (UDiveMaskComponent::TryPredatorFlood, cut chances, anything else) run on the server only.
5. The vest in the move: put the vest buttons (puffs from B, dump held on V) into FDiveNetworkMoveData and step the vest inside the movement update, so the server and the predicting client get the same BCD liters and the same lift. Air the vest spends is taken from the tank once, on the server. Breath bob (lung volume) changes lift too: make the server and the client use the same breath phase, or keep the breath bob out of the predicted part if it causes corrections. Tell me which you did.
6. The depth squeeze on the vest uses the same depth on both machines (the diver's position, never the camera).
7. Events (OnLowAir, OnBatteryChanged, OnInjured and the rest) fire where they are needed: on the owner for HUD and sound, on everyone for visuals.
8. dive.Debug on the client: air and BCD liters as the client has them and as the server last sent them.

Build, fix errors. Then list what my buddy can now see of me and what still only shows on my own screen.
```

**Do by hand in the editor:** nothing.

**Test it worked:**
1. Solo: vest, air, lights, tape, tanks and glow sticks work as in Phase 1. Hover in the chamber with B and V.
2. Two players, **Bad** lag, `p.NetShowCorrections 1` on the client. On the client: puff with B to rise, hold V to sink, hover in the chamber. It feels instant, with almost no capsules.
3. `dive.Debug 1` on the client after 2 minutes of swimming: client air and server air are within a second of each other, BCD liters match.
4. Client presses F: on the server's screen the client's beam goes off and on. Client switches to its second light: the server sees the change.
5. Client: `DiveForceCut 0.6`, then hold X for 2 s. Taping works in Bad lag and the strip count goes down by exactly one.
6. Client: `DiveTanks 2 1 0`, `DiveEmptyTank`, press 2, then hold 1. The server sees one tank fall away (an aluminum tank floats up).
7. Drown the client (`DiveTanks 1 0 0`, `DiveEmptyTank`): it happens at the same moment on both screens, and only the client restarts.

---

## Prompt 5: Steam sessions and invites
**Goal:** Conrad hosts on the Mac and Tyrus joins from his Windows PC over the internet through Steam. The first real co-op test.

```text
Read CLAUDE.md, then from the vault: Tech/Multiplayer, Steam and Voice.md (Networking setup, Friends-only lobbies, Join-in-progress, Host leaving), Planning/Decision Log.md (host quits = the dive ends for everyone). Check Epic's 5.8 docs for Online Subsystem Steam.

Add Steam hosting and joining:

1. Enable the Online Subsystem Steam plugin (approved). Steam Sockets is a separate built-in plugin that is NOT on the approved list: ask me before enabling it. If I say no or I am not around, use the net driver that Online Subsystem Steam provides and add the question to the vault's Open Questions. Add the modules to CaveDive.Build.cs (OnlineSubsystem, OnlineSubsystemUtils and whatever 5.8 needs). Config: DefaultPlatformService=Steam, SteamDevAppId=480 (Valve's free test app), the net driver lines. Play In Editor must keep working with the Null subsystem: test this.
2. UDiveSessionSubsystem (a UGameInstanceSubsystem in Core/DiveSessionSubsystem.h/.cpp) using IOnlineSession: HostDive (friends-only presence session: bAllowJoinViaPresenceFriendsOnly, bAllowInvites, bAllowJoinInProgress true, not advertised, MaxPlayers a tunable defaulting to 2 with a cap of 4; then open the tunnel map with ?listen), InviteFriend (the Steam overlay invite dialog), joining from the friends list ("Join Game") and from an accepted invite, and LeaveDive. Every step logs one plain-English line.
3. Host leaves: the client goes back to a solo dive with the message "The host left the dive." Any network failure shows a message, never a silent freeze.
4. Controls: three rows in the F10 panel (Host a co-op dive, Invite a friend, Leave dive) and console commands dive.Host, dive.Invite, dive.Leave and dive.Session (prints the session state, player names and ping).
5. When a player joins, the HUD shows "<Steam name> joined the dive" for 3 seconds. No floating name tags (we stay first person and real).
6. Write a short guide into the vault at Planning/Steam Test Guide.md: what Conrad does on the Mac and what Tyrus does on Windows, step by step: Steam running and logged in, being Steam friends, both on the same git commit with the same content, Standalone Game, hosting, inviting, joining, and what to try when it fails. Plain English, no em dashes.

Build, fix errors. Then tell me exactly what Tyrus must pull, build and copy.
```

**Do by hand in the editor:**
1. Commit and push. Tyrus pulls the same commit and builds the editor on Windows (`WINDOWS-BUILD.md`), including copying the mannequin folder so his game has the same content as yours. Different code or content between the two computers is the most common reason joining fails.
2. Both: Steam running and logged in, and you are Steam friends.
3. Conrad: in the editor, open the Play dropdown and pick **Standalone Game** (Steam does not run in the normal Play windows). Press F10 > **Host a co-op dive** (or `dive.Host`), then **Invite a friend**.
4. Tyrus: Standalone Game too, then accept the invite (or right-click Conrad in the Steam friends list > **Join Game**). On his PC set `dive.Set Quality low` (his graphics card has 5 GB).

**Test it worked:**
1. The two-player Play loop still works with no Steam errors stopping it.
2. Standalone on the Mac: `dive.Session` says Steam is the online service and shows your Steam name.
3. Conrad hosts, Tyrus joins from the invite: "Tyrus joined the dive" shows on Conrad's screen. Swim together to the chamber. `dive.Session` shows the ping.
4. Tyrus types `p.NetShowCorrections 1` and swims, sprints and uses the vest: write down the ping and how it felt.
5. Tyrus leaves (`dive.Leave`) and joins again from the friends list while Conrad keeps swimming: he gets back in. (Starting at the stake comes in Prompt 9.)
6. Conrad quits the game: Tyrus sees "The host left the dive" and lands in a solo dive, not a frozen screen.

---

## Prompt 6: Everything your buddy can see
**Goal:** the world reacts the same for both players: your bubbles, your glow sticks, your silt cloud that blinds your buddy, your hand signals and emotes, and a body that swims like a diver.

```text
Read CLAUDE.md, then from the vault: Game Pillars.md (pillars 1 and 2), Design/Diving Systems.md (silt-outs), Design/Art Direction.md, Planning/Decision Log.md (hand signals, emotes). In the repo: REVIEW-PHASE1.md section 4 items 5 and 7, and the "Co-op later" note in the header of UDiveExpressionComponent.

1. Spawned things go through the server and replicate: glow sticks (held, cracked, thrown, landed: one stick that lands in the same place on every screen), waypoint beacons (P), dropped tanks. Rope nails come with the shared rope in Prompt 7; make sure their spawn path is already server side. A thrown stick: the server simulates the flight; the thrower's own screen may predict it so the throw feels instant, but there is only ever one stick.
2. Shared silt: the server owns each ADiveSiltVolume's density and stirring (anyone's fins stir it) and replicates a compact density and settle state. Each machine draws its own fog clouds from that. Your buddy sprinting past must silt you out.
3. Breath bubbles: every diver's exhale releases bubbles from the regulator on their body (UDiveBubbleComponent), driven by the replicated breath state. Other divers' exhales make a quiet spatial bubble sound (synthesized, no sound files), heard within about 9 m.
4. Hand signals and emotes (Z wheel): StartHandSignal and StartEmote become Server RPCs, and ActiveSignal, ActiveEmote and their start times replicate. Your buddy sees your right hand make OK, Up, Down or Problem in front of your mask, and sees your body do the backflip. Only the camera turn of an emote stays local.
5. The buddy's body (ACharacter's Mesh): pose it from replicated values with the same body math as UDiveBodyComponent where it fits: fin kicks in rhythm, arm pull, look pitch (head and light hand follow it), the light hand holding the flashlight or a glow stick, the right hand signal, a hand on the rock while holding rock. Update far bodies less often (distance based).
6. The buddy's light: the beam comes from their light hand with the same smoothed lag, plus a faint hand glow like your own. Dying, flickering and switched-off lights show on both screens. Keep shadows on for now; Prompt 14 measures the cost.

Build, fix errors. Then tell me what costs the most per extra diver.
```

**Do by hand in the editor:** nothing, unless Claude needs an asset (it will list it).

**Test it worked (two players, Average lag):**
1. Client takes a glow stick (G), cracks it (G) and throws it at the chamber floor: both windows show one glowing stick in the same spot. Repeat in **Bad** lag.
2. Server drops a waypoint (P): the client sees it with the same number.
3. Silt: the client hovers just above the floor (`dive.GoToMark SiltRoom 2` in the client's console). The server's diver sprints past low over the floor. The client's screen silts out. `dive.Debug 1` on both: the silt readings match, and it settles on both screens at about the same time.
4. Watch the other diver for 10 s: bubble bursts rise from their regulator with each breath, faster when they sprint.
5. Client holds Z and picks Up: on the server's screen the client's right hand shows the thumbs up. Client picks Backflip: the server sees the body flip.
6. Server types `dive.SetBattery 8`: on the client's screen the server's beam flickers warm. Server presses F: the beam disappears.
7. `stat unit` on the server with the client diver in view, then out of view: write down the difference for Prompt 14.

---

## Prompt 7: One rope, two divers
**Goal:** the heart of Pillar 3. One rope from the stake runs through both divers, simulated by the server and the same on both screens. Step 4 of the prep plan.

```text
Read CLAUDE.md, then from the vault: Tech/Rope System.md (all of it), Design/Rope and Multiplayer.md, Game Pillars.md (pillar 3), Context/Answers Round 3.md (section 4, Rope), Planning/Decision Log.md (6 m between divers, 10 nails per person). In the repo: REVIEW-NIGHT.md step 4 and the rope cost items in the first review, and the header comment of ADiveRope.

Turn ADiveRope into one shared rope for any number of divers (test with 2):

1. One rope per dive, spawned by the server at the stake (not by each character's SetupRope), replicated, always relevant. Only the server simulates the gameplay rope.
2. Replace AttachedDiver with TArray<FDiveRopeClip> (diver, distance along the rope, clipped yes or no, rope order). AttachDiver, DetachDiver and IsDiverAttached(Diver) take the diver. Order from the design: the leader is farthest from the stake and holds the rope end (the rope pays out behind the leader); every other diver's clip slides along the rope. For Phase 2 the order is the order divers clip on at the stake: the first one is the leader. Keep it a list so 4 divers work later.
3. Clip and unclip (C, 3 seconds, C again cancels) run on the server through a Server RPC on UDiveRopeHandsComponent. Clipping on away from the stake clips at the closest rope point within reach. An unclipped diver keeps their place in the order but is free.
4. Nails (N): server side, 10 per person per dive (NailsPerDive on RopeHands). Rope behind a nail stays put, as now.
5. Network: replicate the anchors (stake, nails, clip points) and the settled rope points with FFastArraySerializer (a new point only sends that point), and the simulated stretch near the divers at a lower rate. Each client runs its own verlet rope between those for looks (the two layers in Tech/Rope System.md). The cosmetic rope never pushes anyone.
6. R (follow the rope blind) works for every diver on the shared rope, toward the stake or toward the leader, whichever way you face.
7. Rope length on the watch and in the dive log: total rope from the stake to the leader, the same on both screens.
8. If two divers make the rope cost worse, fix the two rope cost items from REVIEW-NIGHT.md (render state rebuilt every frame, sweeps for points that barely moved).
9. Not yet: the 6 m pull and tug codes (Prompt 8), tangles (a later phase).
10. Update every caller: SetupRope, the rope actions, the watch input bRopeClipped, GetHUDStats, the hints, the end point follow in ADiveRope::Tick, the dive log, dive.TeleportStart.

Build, fix errors. Explain in plain English how the rope now travels over the network and how much data a long dive costs.
```

**Do by hand in the editor:**
1. If a `DiveRope` is placed in your test level, delete it: the server spawns the rope now. (Claude Code will say if this applies.)

**Test it worked:**
1. Solo: the rope pays out from the stake, R follows, T tugs, N nails (10), C clips and unclips. Same as Phase 1.
2. Two players, lag off: the server's diver clips on at the start first (C, 3 s), then the client's. The server swims ahead: the rope pays out behind the server's diver and runs past the client's clip. Both windows show the rope in the same place, bending around the same rock.
3. The client holds R and slides along the rope toward the leader, then back toward the stake.
4. The leader nails the rope at the junction (N): the leader's watch says 9 nails, the client's still says 10. Both see the nail.
5. The client unclips (C, 3 s) and swims free, then clips on again next to the rope.
6. **Bad** lag: the leader swims around a column in the chamber. On both screens the rope bends around the same column (the wiggle may differ a little, that is fine).
7. `stat net` on the server while the leader lays 50 m of rope: write down the Out number.

---

## Prompt 8: The 6 m rule and tugs
**Goal:** the rope physically ties you together (at most 6 m of rope between neighbours, a soft pull, never a hard snap), and tugs become a language.

```text
Read CLAUDE.md, then from the vault: Tech/Rope System.md (Tension, Rope pull and network prediction), Design/Rope and Multiplayer.md, Context/Answers Round 3.md (61 to 69), Planning/Decision Log.md, Design/HUD, Watch and Waypoints.md, Design/Audio.md.

1. Spacing: at most 6 m of rope between two neighbouring clipped divers (RopeSpanMax, tunable, default 600 cm). Beyond that a soft spring pulls both along the rope toward each other: tunable stiffness, a clamp on the biggest pull, and a small slack zone so it never jitters right at 6 m. Apply the pull inside the movement update so it predicts: the server computes it from the shared rope, the owning client from its copy, and small corrections are accepted. Never a hard constraint, never a teleport. If both swim apart, the stronger one wins slowly. Holding rock (E) anchors you: your buddy reaches the end of the rope instead of dragging you off.
2. Tug (T): a pulse travels along the rope from your clip to every other clipped diver (an OnTugReceived(Diver, Strength) event per clip, as in REVIEW-NIGHT.md step 4). The receiver feels it: a camera jolt, a small pull in the tug's direction, the rope jerking visibly at their clip, a deep thud from the synth audio, and a HUD flash with tick marks.
3. Tug codes, counted by the receiver: tugs less than 1.2 s apart (tunable) are one message, shown as 1 to 4 ticks after the last tug. Meanings follow the real cave diving line signals (OATH): 1 OK, 2 Advance (go on), 3 Take up (come back to me), 4 Help. The HUD shows only the ticks; the meanings are in the F1 controls overlay, because learning them (and getting them wrong) is part of the fun. Add a tunable to also show the meaning as words, off by default.
4. Sending a tug: a small arm pull on your own body and a softer thud, so you know it went out.
5. Hints: a first-dive hint the first time you receive a tug ("Tug! Count them: 1 OK, 2 go on, 3 come back, 4 help. Tap T to answer."). Update both hint tables and the F1 list (CLAUDE.md rule).
6. Count tugs sent and received per diver for the dive slate (Prompt 13).
7. dive.Debug: rope length between each pair of neighbours, spring force, last tug count.

Build, fix errors. Tell me which 3 values to tune first if the pull feels too stiff or too loose.
```

**Do by hand in the editor:** nothing. Tune the values Claude names on the rope while playing (F8, select the rope).

**Test it worked:**
1. Two players, both clipped. The leader swims away while the client hovers still: at about 6 m of rope the leader slows down and the client starts drifting after them. No snapping, no stutter. `dive.Debug 1` shows the span near 600 cm.
2. The client holds rock (E): the leader stops at the end of the rope and cannot drag the client off.
3. Both swim apart hard: the stronger one wins slowly, nobody teleports.
4. **Bad** lag with `p.NetShowCorrections 1` on the client while it is being dragged: small corrections at most.
5. The leader taps T three times quickly: the client feels three jolts, hears thuds and sees 3 ticks. The client taps T once: the leader sees 1 tick.
6. Hold F1: the four tug meanings are listed.
7. Swim the restriction one after the other while clipped (`dive.GoToMark Restriction 4`): the rope pulls the second diver toward the hole without getting them stuck. If it snags, tell Claude Code where.
8. Solo: with one diver nothing changes.

---

## Prompt 9: Joining mid-dive by following the rope
**Goal:** a friend who joins late appears at the stake, clips on, and follows the rope down to the group. Pillar 3: the rope is the joining mechanic. The 40 s respawn in Prompt 11 reuses this.

```text
Read CLAUDE.md, then from the vault: Tech/Multiplayer, Steam and Voice.md (Join-in-progress, the known voice bug), Tech/Rope System.md (late joiners), Design/Rope and Multiplayer.md (Joining mid-dive), Context/Answers Round 3.md (72, 78).

1. A player who joins during a dive spawns at the stake (the tunnel start, next to the rope's stake), facing down the rope, with full air and the normal loadout.
2. They receive the whole rope (anchors and points) before they see it, so it never pops in half built. A short fade in covers the wait.
3. They are not clipped on. A hint: "Your friends are down there. Tap C at the stake to clip on, then hold R to follow the rope." Clipping on at the stake makes them the new last diver (closest to the stake).
4. Following a long rope must not be boring: holding R and Shift slides faster along the rope (tunable, costs stamina like sprinting).
5. Everything already in the world shows correctly to the joiner: glow sticks (lit or dead), waypoints, dropped tanks, nails, silt, the other divers' lights.
6. Make "spawn at the stake and follow the rope" one function on the game mode (for example RespawnAtStake). Prompt 11 uses it for the 40 s respawn.
7. The joiner's dive log starts when they join, and the slate will say they joined late.
8. Voice does not exist yet (Prompt 12). Leave a comment where the voice join fix will go.

Build, fix errors.
```

**Do by hand in the editor:**
1. Editor Preferences > Level Editor > Play > Multiplayer Options: tick **Allow Late Joining**. During Play an **Add Another Client** button appears in the toolbar.

**Test it worked:**
1. Two-player Play loop settings but **Number of Players 1** (still Play As Listen Server). Swim to the chamber laying rope, nail it twice, throw a glow stick, drop a waypoint.
2. Click **Add Another Client**. The new window starts at the stake looking down the rope. The rope, both nails, the glow stick and the waypoint are already there.
3. The joiner taps C at the stake (3 s), holds R and W: they slide down the rope. Hold R and Shift: faster, stamina drops.
4. When the joiner arrives, the 6 m rule and tugs work between the two.
5. Over Steam with Tyrus (Standalone): Tyrus joins from the friends list while Conrad is in the chamber. Same as steps 2 to 4.

---

## Prompt 10: Grab, tow and share air
**Goal:** you can grab your buddy, tow them, and hand them your regulator when their tank runs dry. The Roadmap's "grabbing each other".

```text
Read CLAUDE.md, then from the vault: Planning/Roadmap.md (Phase 2: grabbing each other), Context/Answers Round 3.md (26, 37, 44, 59, 61, 90), Planning/Decision Log.md (air sharing by handing your regulator to a friend), Design/Diving Systems.md.

1. Grab (hold E): if a diver is within reach (about 1 m, tunable) and roughly in front of you, E grabs them instead of the rock. The server decides. A soft spring inside the movement update pulls the grabbed diver toward a hold point in front of you (predicted, like the rope pull). You swim slower while towing (tunable). The grabbed diver can still swim and breaks free by swimming away hard for 1 s (tunable): a grab is a help, not a trap. Both see a hand on the other diver.
2. Air sharing (hold H) near a buddy: the existing H takes your regulator out (you hold your breath, your mask floods). If a buddy is within reach and you are looking at them, they breathe from your active tank while you hold H; their own tank pauses and their screen says "Breathing from <name>'s tank". Let go of H to take it back. All decided on the server.
3. Design rules (Answers 59): sharing floods your mask until you plug the regulator back in, and if the mask water gets too high you take a little damage until it drains. Use the existing mask and injury components.
4. Out of air with a buddy close: the low air and empty tank hints mention the buddy ("No air? Get to your buddy. They can share with H.").
5. Dive log, per diver: meters towed and towed by, seconds of air given and received.
6. No new keys (E and H only). Update both hint tables and the F1 list.

Build, fix errors.
```

**Do by hand in the editor:** nothing.

**Test it worked:**
1. Two players. The client swims up to the server's diver, looks at it and holds E: grabbed. The client swims: the server's diver comes along and the client is slower. The server swims away hard: free after about a second.
2. **Bad** lag with `p.NetShowCorrections 1` on both: towing causes few corrections.
3. The server empties its tank (`DiveTanks 1 0 0`, then `DiveEmptyTank`) and starts holding its breath. The client swims close, looks at it and holds H: the server's screen says "Breathing from <name>'s tank", its breath-hold stops, and the client's air drops faster. The client's mask floods. The client lets go: back to normal.
4. The client holds H for a long time: once the mask is nearly full it takes a little damage.
5. Solo: E still grabs rock and H still takes your regulator out.

---

## Prompt 11: Blackout, ghost bubble and revive
**Goal:** Team Mode death from the design. Running out of air (or bleeding out) makes you a ghost bubble. Your buddy can save you by getting your body to an air pocket, otherwise you respawn at the stake after 40 s. Step 5 of the prep plan.

```text
Read CLAUDE.md, then from the vault: Planning/Decision Log.md (Team Mode: revive at an air pocket, else respawn at the top after about 40 seconds), Context/Answers Round 3.md (89 to 91, F12), Planning/Proposed Answers.md (25, the ghost bubble), Design/Diving Systems.md. In the repo: REVIEW-NIGHT.md step 5.

1. A per-player "out" state owned by the server, on a new component (for example UDiveDownedComponent), not on the character and not in static data. Drowning (OnMustDrown) and health 0 both lead to it. Single player keeps today's behavior (fade, slate, R to dive again); only multiplayer uses the ghost.
2. The body goes limp (relaxed pose, slowly sinking or floating with its vest) and stays clipped on the rope if it was clipped. It can be towed on the rope (slower, the pull from Prompt 8) or grabbed with E and carried (faster, Prompt 10).
3. The ghost bubble: your view leaves the body and becomes a small bubble. Still first person: you see from inside it, with a soft wobbly lens edge. It swims slowly (WASD and mouse), stays within about 15 m of your body (tunable) and cannot pass through rock. Other divers see a faint silvery bubble. Left click makes a small "blub" that others hear, so you can guide them. A clear 40 s timer on the ghost's screen (RespawnSeconds, tunable).
4. Revive: if the body's head gets into an air pocket (ADiveAirPocketVolume) before the timer ends, you come back: the view returns to the body, a coughing breath, high panic, and the air pocket refills your air as it normally does.
5. Respawn: when the timer ends you respawn at the stake (the function from Prompt 9) with full air and no tape or glow sticks left (Answers F12), unclipped. The old body disappears in a burst of bubbles.
6. Total wipe: if every diver is out at the same time, the dive fails for everyone (Prompt 13 turns it into a team slate).
7. Debug commands DiveKnockOut and DiveRevive, working from the client through the server.
8. Hints: the first time you are a ghost ("You blacked out. Your buddy can save you: get your body to an air pocket. Click to make noise."), and the first time your buddy is out ("<name> is out! Grab them (E) and get them to an air pocket."). Update both hint tables.

Build, fix errors.
```

**Do by hand in the editor:** nothing.

**Test it worked:**
1. Two players, both at the chamber (`dive.GoToMark Chamber` in each window); the air pocket is in the ceiling. The client types `DiveKnockOut`: the client sees from a ghost bubble with a 40 s timer; the server sees the client's body go limp and a faint bubble.
2. The ghost swims away from the body and stops at about 15 m. It clicks: the server hears a blub from that direction.
3. The server grabs the body (E) and swims up into the air pocket: the client's view snaps back into the body, coughing.
4. `DiveKnockOut` again and do nothing: at 0 the client respawns at the stake with full air, no tape and no glow sticks. It clips on and follows the rope down (Prompt 9).
5. Knock out the client while clipped, and the server swims off: the body follows on the rope, slowly.
6. Both type `DiveKnockOut` within a second: the dive fails for both.
7. Solo: running out of air still fades, shows the slate, and R starts a new dive.

---

## Prompt 12: Proximity voice and the no-mic options
**Goal:** hear your buddy within 9 m, muffled and bubbly underwater, clear in an air pocket. Players without a mic use hand signals or bubble text.

```text
Read CLAUDE.md, then from the vault: Tech/Multiplayer, Steam and Voice.md (Proximity voice, Known bug, Voice toggle), Design/Audio.md, Context/Answers Round 3.md (16, 79, 80, F9, F10), Planning/Decision Log.md (voice range 9 m, no-mic options).

Voice:
1. Turn voice on in config (check the 5.8 setting names). Steam carries the voice.
2. For each other player, a UVOIPTalker attached to their head with Voice Settings: full volume up to 3 m, fading to silent at 9 m (VoiceRange, tunable). Underwater it is muffled by a low-pass filter (the attenuation settings' own low-pass is enough; the Synthesis plugin's source effects are NOT approved, ask before using them). Clear only when both the talker's and the listener's heads are in an air pocket. Create the attenuation in C++ at runtime if you can, so no asset is needed; otherwise tell me which assets to make.
3. Bubbly: while a buddy talks (their voice level above a threshold), their regulator releases extra bubbles and the synth audio plays soft bubble bursts at their head. You see your friend talking.
4. Fix the join-in-progress bug from the vault note: register the talker once the PlayerState exists (OnRep_PlayerState) and re-apply the settings on join. Prompt 9 left a comment where.
5. Settings (F10 panel and dive.Set): Communication: Mic (default), Hand signals, Bubble text. In Mic mode: Open mic (default) or Push to talk on Left Ctrl (hold). Mic volume and buddy volume. Choosing Hand signals or Bubble text switches your mic off and the hints point you to Z or Enter. Muting one player from dive.Session.
6. A test path for Play In Editor, where real voice may not work: DiveVoiceTest makes the other diver's talker play a looping synthesized test sound through the same range and muffle, so I can test both with two Play windows.

Bubble text:
7. Enter opens a small text box at the bottom of the screen: the keyboard types into the box, the mouse still looks, you keep gliding. Enter sends, Esc or F10 cancels, 60 characters max. Voice typing uses the computer's own dictation (Mac: press Fn twice, Windows: Win+H). Nothing to build for that, but say it in the box's hint line.
8. Sent text appears as a speech bubble in the water in front of the sender's mask, for every player within 9 m (the same VoiceRange) who has a line of sight to it (not through rock). It faces the reader, stays readable, drifts up a little like a bubble and fades after 6 s (tunable). The sender sees their own bubble. The server relays it.
9. Hand signals already replicate (Prompt 6). Check a "Hand signals" player can be understood: the signal is readable at 9 m when it is in someone's light.
10. Update the F1 list and both hint tables: Enter = bubble text, Left Ctrl = push to talk (only when that mode is on).

Build, fix errors. Then tell me what to test over Steam with Tyrus.
```

**Do by hand in the editor:**
1. If Claude could not make the voice attenuation in code, create the assets it names (Content Browser: right-click > Audio > **Sound Attenuation**) and assign them in `BP_DiveCharacter`.
2. For the Steam test: both players wear headphones (with speakers you hear yourself echo back).
3. On the Mac, turn on Dictation (System Settings > Keyboard > Dictation) to try voice typing.

**Test it worked:**
1. Two Play windows: type `DiveVoiceTest` in the client. The server's diver swims away from the client: the test sound fades and is silent past about 9 m. Up close it sounds muffled.
2. Both go to the air pocket (`DiveGoPocket` in each window, then Space): with both heads out it sounds clear. One goes under: muffled again.
3. Bubble text: the client presses Enter, types `follow me lol`, Enter. The server sees the bubble in front of the client's mask, drifting up, gone after 6 s. Move the server 12 m away: no bubble. Hide the server behind rock: no bubble.
4. On the Mac: Enter, press Fn twice, speak. The words appear in the box.
5. Over Steam with Tyrus (Standalone, headphones): you hear each other, muffled, fading out at about 9 m. Both surface in the air pocket: clear. Tyrus leaves and rejoins mid-dive: his voice is still quiet when he is far away (the join bug is fixed). Switch to Push to talk: you are only heard while holding Left Ctrl. Tyrus switches to Bubble text: his mic goes off.
6. While Tyrus talks, look at him: extra bubbles from his regulator.

---

## Prompt 13: The co-op dive slate
**Goal:** the end-of-dive slate becomes a team slate that is fun to read out loud and clip.

```text
Read CLAUDE.md, then from the vault: Game Pillars.md (pillar 1: the best moments are the ones you clip and send), Business/Personal Brand and Marketing.md, Context/Answers Round 3.md (12: the reward scene is a later phase, not this). In the repo: the header comment of UDiveLogComponent and UI/DiveDebugHUDSummary.cpp.

1. Ending a multiplayer dive: DIVE COMPLETE when every diver who is not out is back at the start (after going at least 20 m in) with air left. A total wipe (everyone out at once) is YOU DID NOT MAKE IT BACK. The server decides and the dive ends for everyone at the same moment.
2. Each diver's log is gathered on the server and replicated to everyone (PlayerState is a good home), so every screen shows the same slate.
3. The slate: the team result and team time on top, then one column per diver: time, deepest, farthest, air used, silt-outs caused, silt-outs suffered because of a buddy, tugs sent and received, meters towed and towed by, air shared, times knocked out and revived, glow sticks, nails, joined late.
4. One funny award per diver, picked by comparing their stats with the others, for example "Silt Lord" (silted the buddy out 3 times), "Dead Weight" (towed 40 m), "Chatterbox" (most tugs), "Lungs of Steel" (least air used), "Second Chances" (revived), "Guardian Angel" (shared the most air). About 15 awards, each with a funny line, never mean. Keep them in one table at the top of a .cpp so I can add more.
5. Restart: in multiplayer only the host's R starts a new dive, and it takes everyone along (a server travel, not OpenLevel; check RestartGame in 5.8). Clients see "Waiting for the host (R)". Single player keeps R as today.
6. dive.Cinematic still shows the slate (a good closing shot for the devlog).

Build, fix errors.
```

**Do by hand in the editor:** nothing.

**Test it worked:**
1. Two players swim to the end and back. When the second one reaches the start: DIVE COMPLETE on both screens, the same slate with two columns.
2. During that dive, the client towed the server a little and tugged 5 times: the slate shows it.
3. Each diver's award makes sense from the numbers.
4. The client presses R: "Waiting for the host (R)". The host presses R: both start a new dive together.
5. Both type `DiveKnockOut`: YOU DID NOT MAKE IT BACK on both screens.
6. Solo: the Phase 1 slate is unchanged.

---

## Prompt 14: Two-player playtest and performance check
**Goal:** prove the Phase 2 goal ("two people swimming together on a rope is already funny"), measure performance with two divers, and record footage for devlog #2.

```text
Read CLAUDE.md, then from the vault: Planning/Playtest Kit.md, Game Pillars.md, Tech/Performance and Mac.md, Business/Personal Brand and Marketing.md, Planning/Recording Devlog 1.md.

Do not build gameplay in this prompt.

1. Write Planning/Phase 2 Playtest.md in the vault: a 2-player playtest script for Conrad and Tyrus over Steam (Loenn watching, or playing later). Three dives in a row: dive 1 just swim together to the end and back; dive 2 nail the rope and talk only with tug codes and hand signals; dive 3 one diver runs out of air on purpose and the other saves them. A sheet to write down every funny moment and every bug with the time. Six questions afterwards: was it funny, when did you laugh, did dive 3 feel different from dive 1, did the rope feel like a lifeline or a leash, what did you want to do that you could not, what would you cut. Include the "never repetitive" check: if dive 3 felt like dive 1, write down why. Plain English, no em dashes.
2. Performance: tell me which numbers to collect on the host Mac and on Tyrus's PC (stat fps, stat unit, stat gpu, stat net) at four moments: both divers swimming with lights on and in view of each other; both lights pointing down the same long stretch; one diver silting the other out in the silt room; one towing the other through the restriction. Targets: host 60 fps, Tyrus's PC 60 fps on Low, server Out under about 20 KB/s per client. After I send the numbers, suggest and make the fixes they call for (for example no shadows from a buddy's light beyond some distance, fewer pose updates for far divers, a lower rope update rate).
3. Network check: explain how to read stat net and what is too high. List every value that replicates every frame and could be sent less often.
4. Footage: a 20 to 30 second co-op shot list for devlog #2 (two lights in the dark, a tug code read wrong, a silt-out caused by your buddy, a tow up into the air pocket, a bubble text at the worst moment) and how to record it (each player records their own screen with the steps in Recording Devlog 1.md).
5. When the playtest notes come back: write down what Phase 2 delivered in the Roadmap and add the decisions made during the phase to the Decision Log.
```

**Do by hand in the editor:**
1. Run the playtest script with Tyrus over Steam, Loenn taking notes. Fill in the sheet.
2. Collect the numbers at the four moments on both computers and paste them into Claude Code.
3. Record the shot list on both computers and cut devlog #2 in CapCut or iMovie.
4. When the goal is met, mark Phase 2 done in the [[Roadmap]] (and in the build plan doc).

**Test it worked:** three dives in a row with Tyrus over Steam with no crash and no stuck player, at least 5 laughs on the sheet, the host steady at 60 fps, Tyrus at 60 fps on Low, and dive 3 felt different from dive 1. You have a clip you would actually post. That is Phase 2.

---

## After Phase 2
When two divers on a rope are reliably funny, move on to the next phase in the [[Roadmap]] (the cave). From now on, every new feature is built co-op ready from day one and tested with the two-player Play loop before it is called done. Start the next phase by asking Claude Code to update CLAUDE.md's "current phase" section.

## Open questions for Conrad
The prompts above already made these calls so the work is not blocked. Change any of them and tell Claude Code before the prompt that uses it.

1. **Phase order.** These prompts build co-op now, as the [[Roadmap]] says. The Oct 21 build plan puts the cave generator next and co-op in Phase 5 (Mar 3 to Apr 7). Which order? (If the cave comes first, these prompts become Phase 5 and Prompt 2 adds sending the cave seed.)
2. **Steam Sockets plugin** (Prompt 5): OK to enable? It is a free built-in Epic plugin but was not on the approved list. Without it we use Steam's own older net driver.
3. **Rope order** (Prompt 7): the first diver to clip on at the stake is the leader, late joiners become last. Or do you want to pick your place (leader, second, third, last) before the dive?
4. **Tug codes** (Prompt 8): the real OATH signals (1 OK, 2 go on, 3 come back, 4 help), with only tick marks on the HUD. Should the HUD show the words too?
5. **Tug vibration** (Answers 69): a real tap on MacBook trackpads is possible with a small Mac-only code file, but it is not in these prompts. Add it to Prompt 8?
6. **Push to talk key** (Prompt 12): Left Ctrl (hold), with open mic as the default. OK?
7. **No-mic setting** (Prompt 12): picking Hand signals or Bubble text only switches your mic off. Z signals and Enter bubble text work for everyone in every mode. OK?
8. **Bubble text** (Prompt 12): same 9 m as voice, hidden behind rock, 60 characters, 6 seconds. OK?
9. **Respawn rules** (Prompt 11): "no leftover tape or glow sticks" read as "you come back with none". And a revived diver gets air from the air pocket as usual, not a fixed amount. Right reading?
10. **Ghost bubble** (Prompt 11): stays within 15 m of your body, left click makes a "blub". Proposed Answers 25 also says ghosts "see through walls faintly": left out for now. Add it?
11. **Breaking free from a grab** (Prompt 10): swim hard for 1 s to escape. Or should a grab hold until the grabber lets go?
12. **Session size** (Prompt 5): 2 players max in Phase 2 (the code allows 4). Keep 3 and 4 player games closed until the 4-player phase?
13. **Solo blackout:** solo keeps the Phase 1 slate and R. Should solo divers also get the 40 s respawn at the stake, or is that only for co-op?
14. **Steam App ID:** Phase 2 uses Valve's test app 480 (Spacewar). The real Tied Under app needs the $100 Steamworks sign-up by a parent. When should we switch?
15. **Pausing in co-op:** the F10 panel no longer pauses with 2 players. REVIEW-NIGHT.md also asks what a pause should do to a half-aimed glow stick throw. Still open.
