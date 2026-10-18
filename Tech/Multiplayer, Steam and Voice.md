# Multiplayer, Steam and Voice

Technical plan for the online side of [[Rope and Multiplayer]]. Researched October 2026 against Unreal Engine 5.8 and current Steamworks docs.

## Plain-language explanation

- **Replication** is how Unreal keeps everyone's game in sync. One machine is the **server** (the boss). It decides what is true: where everyone is, how much air they have, what the cave seed is. It sends ("replicates") that to the other players, the **clients**.
- **Listen server:** one player's game is both a player and the server. Free, no hosting. If that player quits, the session ends.
- **Dedicated server:** a separate program running on a rented machine with no player. Costs money every month, needs to be built for Windows or Linux, and is overkill for a group of friends.
- **Online Subsystem Steam** is Unreal's built-in connector to Steam: logging in, friends, invites, lobbies, voice.
- **Steam Sockets** sends game traffic through Valve's relay network, which handles home router problems (NAT) automatically and hides players' IP addresses from each other.
- **Proximity voice** means you hear teammates louder when close and quieter when far, with an underwater muffle.

Key Unreal building blocks: `GameMode` (rules, server only), `GameState` (shared info like seed and rope, everyone gets it), `PlayerState` (per-player info like name and loadout), `PlayerController` (each player's input), and **RPCs** (function calls sent across the network, e.g. "server, I want to drop this tank").

## Recommended approach

**Listen server, Steam Online Subsystem + Steam Sockets, friends-only presence sessions with join-in-progress, and Unreal's built-in voice chat (VoIP over Steam) with attenuation.** All free.

### Networking setup

- Enable the **Online Subsystem Steam** and **Steam Sockets** plugins. Set `DefaultPlatformService=Steam`, `SteamDevAppId=480` during development (Valve's shared test app "Spacewar"), and point the game net driver at `SteamSocketsNetDriver` in the engine config.
- Use the **default replication system** for now. Epic's newer system **Iris** is production ready in 5.8, but it adds things to learn and 4 players do not need it.
- Write session code in a C++ `UGameInstanceSubsystem` (create, find friends' sessions, join, accept invites) using the `IOnlineSession` interface. The popular free **Advanced Sessions** plugin is mostly Blueprint nodes, so it fits this project less well, though its source is a good reference.
- Design rule: **the server owns all gameplay truth** (air, damage, rope, tangles, silt-out state, cave seed). Clients send inputs and requests.

### Friends-only lobbies

- Create sessions with presence on, `bAllowJoinViaPresenceFriendsOnly = true`, `bAllowInvites = true`, max 4 players, not advertised publicly.
- Friends join through the Steam friends list ("Join Game") or an invite. Handle the invite-accepted event in the subsystem.
- Public matchmaking waits until later, as decided.

### Join-in-progress

- Keep `bAllowJoinInProgress = true` for the whole run.
- On join: the client shows a loading screen, receives the seed and current segment from `GameState`, generates the cave locally ([[Procedural Cave Generation]]), receives the full rope bend-point list ([[Rope System]]), then spawns at the **stake** PlayerStart and follows the rope down.
- New rope span: the late joiner is tied on as the new "last" diver between the stake and the previous last diver.

### Host leaving

- No host migration on listen servers. If the host quits, everyone returns to the hub with a clear "host left" message. Save each player's own progress locally after every run so nothing is lost.

### Proximity voice

- Turn on voice in config (`[Voice] bEnabled=true`, `bHasVoiceEnabled=true` for the online subsystem). Steam handles voice transport.
- For each remote player, create a **`UVOIPTalker`** attached to their head with **Voice Settings**:
  - **Attenuation Settings:** volume falls off with distance (start: full volume to 3 m, silent beyond about 25 m, tune by feel; caves and rock could block it with occlusion later).
  - **Source Effect Chain:** a low-pass filter "underwater regulator" muffle, switched off when both players are in an air pocket ([[Audio]]: muffled underwater, clear in air).
- Push-to-talk and open mic both available in settings.
- **Known bug:** players who join in progress can hear existing talkers at full volume ignoring attenuation. Fix by registering the talker only once the PlayerState exists (in `OnRep_PlayerState`) and re-applying settings (briefly mute and unmute) on join.

### Voice toggle (for Discord or FaceTime players)

- A settings option **"In-game voice: On / Off"**. Off = do not start sending your mic and mute all remote talkers locally. Per-player mute in the pause menu too.
- Default to On in friends lobbies.

### Other voice options considered

- **EOS Voice (Epic Online Services):** free, but adds a whole second online service to set up and you handle positional audio yourself. Not needed while built-in voice works.
- **Vivox:** free up to 5,000 peak concurrent users, then $2,000 per extra 5,000. Not needed.
- If built-in attenuation turns out to be unworkable, a paid Fab voice plugin is the fallback.

### Steam costs and business setup

- **Steam Direct fee: $100 per game (app).** Not refundable, but paid back to you once the game earns $1,000 in adjusted gross revenue.
- **Steam Playtest is free** for developers and players. It is a "child" app attached to your main game's store page; players sign up from the store page. A **demo** is also a child app of the main game. Plan: one $100 app, then a free Playtest first, then a demo for Steam Next Fest.
- Development and testing need no fee at all (App ID 480).
- **Age and paperwork:** Steamworks requires signing legal agreements and providing bank and tax information. For someone under 18 this realistically means a **parent or guardian sets up the Steamworks account** and is the legal partner. Sort this out before you want to put up a store page.

## Why this pick

- Listen server costs $0 and fits 1 to 4 friends perfectly; PEAK-style friend games work this way.
- Steam Sockets solves connection problems and hides IPs, and supports Windows, Mac and Linux players in the same session.
- Built-in voice needs no extra accounts or services, and its attenuation and effect chain directly support proximity and underwater muffling.

## Risks and honest difficulty

- **Difficulty: medium.** Getting two people connected is a weekend. Making every system correct online (rope, prediction, late joiners) is ongoing and is why multiplayer should be on from early on, not added at the end.
- **Testing Steam needs two machines and two Steam accounts.** You cannot run two Steam clients on one computer. Do most testing with **multiple Play-In-Editor windows** using the NULL subsystem, plus simulated lag, and do real Steam tests with Tyrus regularly.
- Built-in voice has rough edges (the join-in-progress bug above). Budget time for it.
- The host's upload speed and PC carry everyone; a weak host PC means a laggy run for all.
- Mac players and Windows players must run the exact same game version to play together.

## First prototype step

1. Before Steam: in PIE, run 2 players as listen server with `Net PktLag=150` and make two divers swim together, with `BCDAir` replicating.
2. Add Online Subsystem Steam + Steam Sockets with App ID 480. Create a friends-only session from a debug key, have Tyrus join through the Steam friends list.
3. Add `UVOIPTalker` with attenuation and confirm you hear each other fade with distance.
4. Have Tyrus quit and rejoin mid-session to test join-in-progress.

Related: [[Rope and Multiplayer]], [[Rope System]], [[Swimming and Underwater Movement]], [[Procedural Cave Generation]], [[Monetization]], [[Roadmap]].

## Sources
- https://dev.epicgames.com/documentation/en-us/unreal-engine/online-subsystem-steam-interface-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/using-steam-sockets-in-unreal-engine
- https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes
- https://forums.unrealengine.com/t/voip-attenuation-not-working-for-new-join-in-progress-players/467430
- https://forums.unrealengine.com/t/advanced-sessions-plugin/30020?page=156
- https://forums.unrealengine.com/t/how-to-use-steams-join-game-from-friends-list/450793
- https://www.epicgames.com/site/news/epic-online-services-launches-free-in-game-voice-and-easy-anti-cheat
- https://activation.unity3d.com/products/gaming-services/pricing
- https://partner.steamgames.com/doc/gettingstarted/appfee
- https://partner.steamgames.com/doc/features/playtest
- https://steamcommunity.com/discussions/forum/1/3118160027728867568
