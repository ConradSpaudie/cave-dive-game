# Audio Sourcing

> Researched October 2026. Re-check each license on the download page and screenshot it.

How to get every sound in the game for $0 (or close), legally, and how to make it sound underwater in Unreal Engine 5. Builds on [[Audio]], where breathing is named the most important sound in the game.

---

## The short version (do this)

1. **Download the Sonniss GDC bundles** (free, commercial, no credit). That's gigabytes of pro sound effects in one go.
2. **Use Freesound with the license filter set to CC0** first. Use CC-BY only when it's the best option, and log the credit.
3. **Record your own breathing and bubbles** with a phone (method below). Breathing must be unique to this game.
4. **Buy one thing if anything:** the Sonniss "Scuba Diving Equipment" library (about $45). Real hydrophone recordings of regulators, bubbles, and BCD inflators in a sea and a cave lake. Cheaper than any hydrophone and exactly our sounds.
5. **Never use** BBC Sound Effects, YouTube rips, or anything marked NC (non-commercial).

---

## Free and legal sources

| Source | License | Commercial game OK? | Credit needed? | Best for THIS game | Gotchas |
|--------|---------|--------------------|----------------|--------------------|---------|
| **Sonniss GDC Game Audio Bundle** (gdc.sonniss.com) | Royalty-free, unlimited projects, for life | Yes | No | Water, rock impacts, creature layers, ambiences, UI. The 2026 bundle is 7.47 GB+; older yearly bundles are on the archive page. | Can't redistribute the raw files (keep them out of a public repo). Using them to train AI is prohibited. |
| **Freesound** (freesound.org), **CC0 sounds** | Public domain | Yes | No | Bubbles, water drips, splashes, cave ambience, rock creaks. Reportedly about half of its 737,000+ sounds are CC0. | License is set per sound. Filter by license every search. |
| **Freesound, CC-BY sounds** | Attribution | Yes | **Yes**: author, sound name, link, license | Same as above when the CC0 option is worse | Log every one in the credits file. |
| **Freesound, CC-BY-NC sounds** | Non-commercial | **No** | n/a | Nothing | A Steam game is commercial. Skip. |
| **Pixabay** (pixabay.com/sound-effects) | Pixabay Content License | Yes | No | Fillers: splashes, UI blips, ambience beds | Can't resell files on their own. Some uploads may be stolen, so prefer Sonniss and Freesound CC0, and keep proof of where you got it. |
| **Kenney audio packs** | CC0 | Yes | No | UI clicks and interface sounds | Stylized, not realistic. UI only. |
| **Fab audio** (free or limited-time free) | Fab Standard | Yes | No (Standard) / Yes (CC-BY) | Horror stingers, ambience packs, creature packs | Check Personal vs Professional tier (see [[Free Assets and Licensing]]). |
| **ZapSplat** (free tier) | ZapSplat Standard License | Yes | **Yes** on the free tier | Backup source | Credit line required unless you pay for Gold. |
| **OpenGameArt** | Per item (CC0, CC-BY, OGA-BY, GPL) | Mostly | Depends | Rarely needed | Avoid GPL audio in a closed game. |
| **BBC Sound Effects** | RemArc License | **No** | n/a | Listening reference only | The free license is non-commercial (personal, education, research). Not for a game sold on Steam. |
| **YouTube** | Usually none | **No** | n/a | Nothing | Almost never legal to use. |

---

## Record your own breathing and bubbles (cheap)

Breathing is the soul of the game, so it should be recorded by you, with lots of variation.

### What a regulator sounds like (so you know what to fake)
- **Inhale:** a hiss of air rushing through the valve, a bit metallic, with a "click" at the start when the valve opens.
- **Exhale:** a low rumble and gurgle as the exhaust valve flutters, followed right away by a burst of bubbles rolling past your ears.
- **From inside your own head:** close, bassy, a little muffled. Other divers sound very different: distant bubble bursts and a faint hiss.

### Option A: Fake it at home ($0) (start here)
| Sound | How to record it |
|-------|------------------|
| Inhale hiss | Breathe in hard through clenched teeth or through a snorkel or a short PVC tube held close to the phone mic. Try a slightly open mouth for variety. |
| Valve click | Click a pen or tap a plastic bottle cap near the mic, layered at the start of each inhale. |
| Exhale rumble | Hum and blow through a tube into a bucket of water, mic close to the surface. |
| Bubbles (heard underwater) | Put the phone in a sealed zip-lock bag (double bagged, test with tissue first) inside the bucket or bathtub, then blow bubbles through a straw or tube. Different tube sizes give different bubble sizes. |
| Bubbles (above water) | Same, but with the phone above the surface. |
| Free-flow (regulator failure) | Hold a spray can or bike pump valve open near the mic, or blow hard through a tube underwater for a long burst. |
| BCD inflate | Short bursts from a bike pump, or blowing into a balloon near the mic. |
| Panic breathing | Record yourself after running stairs. Fast, ragged, real. |

**Record a LOT of takes:** at least 40 inhales and 40 exhales at calm, working, and panic levels. Repetition is the enemy (see [[Game Pillars]]).

**Recording setup:** a closet full of clothes (kills room echo), phone in airplane mode, a lossless WAV recording app, mic 10 to 20 cm away, levels peaking around -6 dB so nothing clips.

### Option B: Real regulator (best quality, low cost)
- Ask a local dive shop if you can record in their training pool during a class or Discover Scuba session. Shops are often happy to help a student project, especially with a credit in the game.
- Only breathe from scuba gear under a certified instructor's supervision. Never on your own.
- Mic options in the pool: phone in a waterproof pouch held next to the diver's head (closest to "in your own head"), and a hydrophone a few meters away (for "teammate" bubbles).

### Hydrophones (only if needed)
| Option | Price (approx.) | Notes |
|--------|-----------------|-------|
| DIY piezo disc hydrophone | About $5 | A piezo disc soldered to a cable, coated in rubber spray or plasti-dip. Colored sound, but great for bubbles and clanks. |
| JrF D-Series | About $80 plus shipping | Cheapest real hydrophone. Needs a piezo preamp. Weak above 3 kHz. |
| Aquarian Audio H2a | Around $170 and up | Has a built-in preamp, so it just works with a recorder. The common budget pick. |

**Verdict:** don't buy a hydrophone yet. Start with Option A plus the $45 Sonniss scuba library. Only buy a hydrophone if a dive shop agrees to a pool session.

---

## Making it sound underwater in UE5

Plain-language plan. Claude Code can write most of this in C++; the MetaSound graphs are built in the editor.

### Step 1: Split all sound into groups (submixes)
| Submix | What goes in it | Underwater treatment |
|--------|-----------------|----------------------|
| **World** | Everything in the cave: rocks, creatures, water, other divers' bubbles | Muffled (low-pass) and thick reverb |
| **Self** | Your own breathing, regulator, bubbles, mask, heartbeat | NOT muffled. It's inside your head. Close, bassy, dry. |
| **Voice** | Teammates' proximity voice chat | Its own "underwater comms" effect (see Step 5) |
| **UI** | Menus, HUD beeps | Untouched |
| **Music / ambience** | Optional music, zone ambience beds | Light treatment |

This split is the most important decision: if your own breathing gets muffled like the world, it sounds wrong.

### Step 2: The medium switch (water vs air)
- When the player's camera goes underwater, apply a **submix effect chain** on the World submix:
  - **Low-pass filter** at about **800 to 1,500 Hz** (underwater, high frequencies vanish).
  - **EQ:** a small boost around 100 to 250 Hz for that heavy, pressured feel.
  - **Reverb:** short, dense, dark.
- When the camera breaks the surface in an air pocket: remove the low-pass, and switch to a **cave reverb** (big, echoey, dripping). Use a convolution reverb with a real cave impulse response if you can find a CC0 one, or the built-in reverb tuned large and wet.
- **Crossfade over about 0.2 to 0.4 seconds**, not instantly. Half-in-half-out at the surface should sound half-muffled.
- **How:** drive it with an **Audio Modulation "Control Bus"** called `Medium` (0 = air, 1 = water) that the code sets. Or use **Audio Gameplay Volumes** (an Unreal plugin with Filter, Reverb, and Submix Override components on water volumes). Audio Gameplay Volumes is still marked **Beta**, so the Control Bus approach is the safer default.

### Step 3: Distance and rock (attenuation and occlusion)
- Every world sound gets an **attenuation setting** with a **low-pass by distance** (far sounds lose more highs). Use shorter distances underwater than in air.
- **Occlusion:** when rock is between you and a sound, low-pass it more and turn it down. Unreal's attenuation has a built-in occlusion trace (costs some performance).
- **Optional upgrade: Steam Audio** (Valve's free, open-source audio plugin for UE). It does real occlusion and reverb based on the actual cave geometry, which fits procedural caves well. Try it after the basics work.

### Step 4: MetaSounds for breathing and bubbles
MetaSounds is Unreal's built-in sound programming system: a graph that makes sounds react to the game.

**The breathing MetaSound** (the most important asset in the game):
- **Inputs from the game:** `BreathRate`, `Effort`, `Panic`, `AirLeft`, `Depth`, `MaskFlooded`, `RegulatorFailed`.
- **Inhale:** picks a random take from 40+ recordings, with small random pitch (plus or minus 3%) and volume changes, so no two breaths match.
- **Exhale:** same, then **triggers a bubble burst** in sync.
- **Panic:** faster breaths, gaspier takes, heartbeat layer.
- **Low air:** inhales get harder and "thinner" (more hiss, shorter).
- **Regulator failure / free-flow:** a looping roaring hiss plus a huge bubble stream.
- **Buoyancy:** the inflate and deflate sounds when breathing into the BCD (see [[Movement and Swimming]]).

**Procedural bubbles (bonus, very cool):** a single bubble's sound is basically a short sine tone that fades fast while its pitch rises. Bigger bubbles are lower. A MetaSound can generate infinite unique bubbles this way, layered over the recorded ones. Endless variety for free.

### Step 5: Voice chat processing
Teammates' voices run through Unreal's VOIP talker (it lets you set attenuation, a source effect chain, and a submix for each talking player).

| Situation | Voice treatment |
|-----------|-----------------|
| **Underwater** | Band-pass about 300 to 3,000 Hz (like a full-face mask comms unit), a little distortion, light low-pass by distance, plus a **bubble layer triggered whenever they talk** (driven by their voice volume) |
| **Air pocket** | Clean voice, plus the cave reverb |
| **Distance** | Proximity falloff (spatial), so turning to face a teammate changes how they sound (see [[Audio]]) |
| **Behind rock** | More muffled and quieter (occlusion) |
| **Proximity off** | When players use Discord instead, none of this applies (see [[Rope and Multiplayer]]) |

**Note:** real divers basically can't talk through a normal regulator. This game lets them anyway because talking is the fun (see [[Game Pillars]]). The effect just has to sell "through water."

---

## Shopping list: every sound the game needs

Source key: **Rec** = record it yourself, **Son** = Sonniss GDC bundles, **Son$** = Sonniss Scuba library ($45), **FS0** = Freesound CC0, **Proc** = generated in MetaSounds, **Ken** = Kenney.

### Breathing (Self submix)
| Sound | Takes needed | Source |
|-------|--------------|--------|
| Calm inhale / exhale | 20 / 20 | Rec, Son$ |
| Working (swimming hard) inhale / exhale | 15 / 15 | Rec |
| Panic gasp inhale / exhale | 15 / 15 | Rec |
| Low air, hard-to-pull inhale | 10 | Rec |
| Out of air (empty breath, valve clack) | 5 | Rec |
| Regulator free-flow loop | 3 | Rec, Son$ |
| Regulator out of mouth (sputter, purge button) | 5 | Rec, Son$ |
| Breathing in air (surfacing gasp, catching breath) | 15 | Rec |
| Cough, choke on water | 8 | Rec |
| Heartbeat (calm to panic) | 3 loops | Rec, FS0 |
| Breathing into the BCD (inflate) and back (deflate) | 6 / 6 | Rec, Son$ |

### Bubbles
| Sound | Source |
|-------|--------|
| Own exhale bubbles past the ears | Rec, Son$ |
| Teammate bubbles at distance | Son$, FS0 |
| Bubbles pooling and rolling on the ceiling | Rec, FS0 |
| Single tiny bubbles (procedural layer) | Proc |
| Big bubble burst (BCD dump, cave-in air release) | Rec, Son |
| Bubbles from a creature or vent | FS0, Proc |

### Water
| Sound | Source |
|-------|--------|
| Underwater ambience bed per zone (5 zones, all different) | Son, FS0 |
| Current / flow (gentle, strong, violent) | Son, FS0 |
| Movement through water: fin kicks, arm strokes | Rec (bathtub), Son |
| Surfacing splash, going under | Rec, Son |
| Water surface lapping in air pockets | FS0, Son |
| Drips (many sizes) in dry chambers | FS0 |
| Halocline crossing (odd, warbling shift) | Son layered and filtered |
| Mask flooding gurgle | Rec |
| Silt-out (soft whoosh plus muffling) | Rec, FS0 |

### Rock
| Sound | Source |
|-------|--------|
| Hand and glove on rock (grab, slide, pull) | Rec |
| Tank scraping and clanking on rock (squeezes) | Rec (metal bottle on a stone), Son$ |
| Gravel and small stones tumbling | Son, FS0 |
| Rock creaks and groans (the cave settling) | Son, FS0 (pitch down ice and wood creaks) |
| Earthquake rumble | Son |
| Cave-in (large collapse, underwater and in air) | Son |
| Boulder impact underwater (dull thuds) | Son, filtered |
| Footsteps and climbing in dry chambers (wet rock, guano, silt) | Rec, Son |
| Ragdoll fall impacts | Son |

### Creatures
| Sound | Source |
|-------|--------|
| Fish school scatter (water swish) | Son, Rec |
| Eel electric shock (crackle, buzz, along the rope) | Son, FS0 |
| Isopod clicking, crawling | Rec (crab shells, plastic), Son |
| Lanternjaw lunge and bite | Son layered |
| Platejaw distant call / charge | Son (whale and animal calls pitched way down) |
| Echo Ray mimic (warped teammate voice) | Proc (voice effect) |
| Choir Lilies hum (musical chord) | Proc, Rec (glass harp, singing) |
| Glowworm and firefly shimmer (soft tinkle when they flash) | Proc, FS0 |
| Bats (wing flutter, squeaks) | FS0, Son |
| Cave crickets jumping | Rec, FS0 |
| Bellows Fish burp | Rec (you, obviously) |
| Gulper Tubes "thwup" | Rec |
| Slimewarden slime squelch | Rec (slime, wet food) |

### Gear
| Sound | Source |
|-------|--------|
| Flashlight on / off click, low battery flicker buzz | Rec |
| Tank clips, bungee snaps, D-ring jingles | Rec, Son$ |
| Tank drop and pickup | Rec, Son$ |
| Rope: tightening, slack, tangle, rubbing on rock, snapping taut, being cut | Rec (real rope on wood and stone) |
| Repair tape rip and stick | Rec |
| Lantern cage open / close, creature inside it | Rec |
| Measuring tape extend / retract | Rec |
| Logbook pencil and page | Rec |
| Watch beep, hologram map open | Proc, Ken |
| Waypoint placed | Proc |
| Line cutter snip | Rec |

### UI
| Sound | Source |
|-------|--------|
| Menu hover, click, back | Ken |
| Loadout item equip | Rec (real gear clicks) |
| Logbook new species (satisfying chime) | Proc |
| HUD warnings: low air, low battery, high panic | Proc |
| Run summary / leaderboard | Ken, Proc |

### Voice processing (not recordings, effects)
| Effect | Where |
|--------|-------|
| Underwater comms (band-pass, distortion, bubbles on speech) | Voice submix, underwater |
| Air pocket reverb | Voice submix, air |
| Proximity falloff and occlusion | All voice |
| Mimic voice (Echo Ray) | Special creature effect (see [[Logbook Species List]]) |
| Radio crackle (optional, if voice ever goes "through the rope") | Voice submix |

### Music (open question in [[Audio]])
Recommendation (matches [[Proposed Answers]] #50): **mostly ambience**, with music only in the hub and at the bottom chamber reveal. Music should never cover breathing.

---

## Credits log
Add every CC-BY sound to the same credits file as the art assets (see [[Free Assets and Licensing]]), with author, sound name, link, license, and date.

---

## Related notes
- [[Audio]]
- [[Diving Systems]]
- [[Rope and Multiplayer]]
- [[Movement and Swimming]]
- [[Free Assets and Licensing]]
- [[Art Direction]]

---

## Sources
- Sonniss GDC bundle site: https://gdc.sonniss.com/
- Sonniss GDC 2026 bundle release (Rekkerd): https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/
- Sonniss Scuba Diving Equipment library: https://sonniss.com/sound-effects/scuba-diving-equipment-sound-diving/
- Sonniss scuba library track list (PDF): https://sonniss.com/wp-content/uploads/edd/2017/11/Track_list_dive.pdf
- Free sound effects and music for games 2026 (Cinevva): https://app.cinevva.com/guides/free-sound-effects-music
- Freesound: https://freesound.org/
- Pixabay Terms of Service: https://pixabay.com/service/terms/
- Pixabay FAQ: https://pixabay.com/service/faq/
- BBC Sound Effects archive, non-commercial RemArc license (MusicTech): https://musictech.com/news/music/the-bbc-sound-effects-archive-over-33000-free-samples
- Hydrophone review, JrF, Aquarian, Ambient (Zach Poff): https://zachpoff.com/resources/hydrophone-review-ambient-asf-1-asf-2-aquarian-audio-jrf/
- DIY hydrophone (Hackaday): https://hackaday.com/tag/hydrophone/
- Audio Gameplay Volumes overview (Epic docs): https://dev.epicgames.com/documentation/en-us/unreal-engine/audio-gameplay-volumes-overview
- Audio Gameplay Volumes quick start (Epic docs): https://dev.epicgames.com/documentation/en-us/unreal-engine/audio-gameplay-volumes-quick-start
- VOIP listener synth component API (Epic docs): https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/VoipListenerSynthComponent.html
- Voice settings API (Epic docs): https://docs.unrealengine.com/PythonAPI/class/VoiceSettings.html
- Steam Audio open source (GameFromScratch): https://gamefromscratch.com/valve-open-source-steam-audio/
- Steam Audio open source (FOSS Force): https://fossforce.com/2024/02/valve-releases-steam-audio-as-open-source/
