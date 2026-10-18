# Art Direction

> **Status: PROPOSAL for Conrad to approve.** This is the visual rulebook for the whole game. It uses the five depth zones proposed in [[Logbook Species List]]. Once approved, log it in [[Decision Log]].

The one-sentence identity: **a real cave dive filmed by a documentary crew, where your flashlight is the only thing that makes the world exist, until the deep starts glowing back at you.**

Every visual choice serves [[Game Pillars]] #2 (looks and feels real). The five priorities, in order: lighting, water, rock detail, the diver moving through water, and the environment reacting to the player.

---

## The five rules (read these if nothing else)

1. **Black is black.** Turn auto exposure OFF (or clamp it tightly). The camera must never "adjust" a pitch-black cave into murky grey. Darkness is a resource the player spends light against.
2. **Light is something you carry.** After Zone 1, every visible pixel was lit by a diver's light, a creature, or a glowing plant. No invisible fill lights in Zones 3 to 5.
3. **Water eats red.** Things close to your light (under 1.5 m) show true, warm color. Farther away, they fade to blue-green and then to black. This one rule sells "underwater" more than anything else.
4. **There is always something in the water.** Floating particles (silt, specks, "marine snow") show up in every flashlight beam. Clean, empty water looks fake.
5. **The cave reacts.** Fins kick up silt, bubbles crawl along the ceiling, fish scatter from light, glowworms dim when you talk. If the player touches the world and nothing moves, that's a bug.

---

## Mood and palette per depth zone

Hex values are starting points for materials, fog, lights, and post process. Tune them in the editor, but keep each zone's identity.

### Zone 1: The Mouth (0 to 20 m)
**Mood:** Bright, calm, beautiful. "This is the most beautiful place I've ever seen." Think Mexican cenote entrance photos.

| Role | Hex | Swatch description |
|------|-----|--------------------|
| Sun shaft core | `#EAF6F2` | Near-white, slightly green |
| Sun shaft edge / near water | `#9FE3D6` | Pale cenote turquoise |
| Mid water | `#2E8C8A` | Clear teal |
| Far water | `#0F4F5C` | Deep blue-teal |
| Shadow | `#0B2A33` | Dark teal, never pure black yet |
| Limestone | `#C9B99A` | Warm cream rock |
| Moss, algae, roots | `#5E7A3A` | Olive green |

**Light:** Sun shafts (god rays) through the entrance, moving caustics on the floor and walls, bright and readable. The only zone with caustics.

### Zone 2: Twilight Throat (20 to 60 m)
**Mood:** Curious, a little eerie. The light drops off hard around the first corner.

| Role | Hex | Swatch description |
|------|-----|--------------------|
| Last daylight in water | `#1E4A52` | Dim blue-green haze |
| Ambient water | `#12363F` | Dark teal |
| Shadow | `#050F14` | Almost black |
| Limestone in flashlight | `#8C7F6A` | Tan-grey |
| Silt floor | `#A89A7E` | Pale beige-brown |
| Diver flashlight | `#FFF1D6` | Warm white (about 5000 K) |
| Glowworm blue | `#7FE8FF` | Cold pale cyan |
| Foxfire green | `#7CFF9E` | Soft mint green, very faint |

**Light:** A faint blue "glow from behind you" at the start of the zone, gone by its end. Flashlights take over.

### Zone 3: The Black Galleries (60 to 120 m)
**Mood:** Quiet, lonely, tense. The screen is mostly black. Your beam is a sword.

| Role | Hex | Swatch description |
|------|-----|--------------------|
| Void | `#020507` | True near-black |
| Water at beam edge | `#08161C` | Very dark blue |
| Rock in flashlight | `#6F675C` | Cool grey-brown |
| Wet rock highlight | `#D8D2C4` | Bone-white sparkle |
| Particulates in beam | `#B9B2A3` | Dusty grey-cream |
| Sea firefly blue | `#2FA8FF` | Electric blue |
| Ghost fire green | `#9BFF6A` | Lime green |

**Light:** Only diver lights and rare glowers. Aim for about 70% of the screen being near-black at any time.

### Zone 4: The Sulfur Deep (120 to 200 m)
**Mood:** Wrong, toxic, sickly. The water itself looks ill. The halocline cloud is a visible "floor" you sink through.

| Role | Hex | Swatch description |
|------|-----|--------------------|
| Void | `#030402` | Black with a hint of olive |
| Ambient water | `#141A12` | Murky dark olive |
| Halocline cloud | `#CFC6A0` | Milky yellow-grey |
| Sulfur stain | `#B8A548` | Mustard yellow |
| Bacterial mats | `#E8E4D6` | Off-white cloth |
| Snottite drip | `#D9E07A` | Pale acid yellow-green |
| Stained rock | `#4E4A3C` | Dark khaki |
| Lure glow (Lanternjaw) | `#6FFFE9` | Bright aqua, "too pretty" |

**Light:** Flashlight beams look shorter and yellower here (thicker water, heavier fog). The few glowing pockets feel like oases.

### Zone 5: The Old Water (200 m and below)
**Mood:** Ancient, enormous, awe first and 15% horror. Big caverns after tight squeezes. Bioluminescence is the only light.

| Role | Hex | Swatch description |
|------|-----|--------------------|
| Void | `#010203` | Deepest black |
| Basalt-dark rock | `#3A3A40` | Cold blue-grey |
| Fossil bone | `#D9CFB8` | Aged ivory |
| Deep bioluminescent blue | `#3D7BFF` | Royal blue |
| Rare violet | `#8E6BFF` | Soft violet |
| Teal glow | `#29F0C8` | Bright teal |
| Starfall swarm | `#BFE9FF` | Starlight white-blue |

**Light:** Creatures, swarms, Choir Lilies, and the lantern. Turning your own light off should reveal a starfield of life.

### Air pockets and dry chambers (any zone)
Warm relief from the cold water colors. Wet rock glistens, drips fall, breath fogs in cold air.

| Role | Hex |
|------|-----|
| Flashlight on wet rock | `#FFE7C2` |
| Wet rock base | `#5C5248` |
| Water surface from above | `#0E2A30` |
| Glowworm ceiling | `#7FE8FF` |

---

## Lighting rules

| Rule | Value / guidance |
|------|------------------|
| Exposure | Manual or tightly clamped (Min EV and Max EV close together). Never let the camera "eye adapt" to darkness in Zones 3 to 5. |
| Primary light (handheld, on a Goodman handle) | Spotlight, inner cone 6 to 10 degrees, outer cone 18 to 25 degrees. Bright, narrow, like a real cave diving primary light. |
| Visible beam length | About 10 to 15 m in clear water (Zones 1 to 3), 5 to 8 m in Zone 4. Beam fades, never ends with a hard edge. |
| Light color | Cool-neutral LED white, about 5000 to 6000 K (`#FFF1D6` to `#F4F7FF`). Low battery shifts warmer and dimmer (about 3500 K, `#FFD8A0`) and flickers. |
| Backup lights | Smaller, wider (30 to 40 degree cone), dimmer (about 30% of the primary). Clipped to the chest. |
| Mask headlight (gear option) | Wide and soft, but it causes strong backscatter (particles light up right in front of your face). This is the real-world trade-off, so use it as a gameplay trade-off. |
| Volumetrics | Every diver light casts a volumetric beam. Teammates' beams are how you find them in the dark. |
| Red falloff | Objects past about 1.5 m from the light lose red, past about 6 m they are mostly blue-green, past the beam they are black. |
| Bioluminescence | Emissive materials plus small point lights only on the brightest creatures (Lantern brightness 3 to 5). Glow should pulse slowly (2 to 6 second cycles) and react to touch (flash brighter, then dim). |
| Bioluminescence color family | Mostly blue (`#2FA8FF`, `#3D7BFF`), some cyan and teal (`#7FE8FF`, `#29F0C8`), rare green (`#9BFF6A`) and violet (`#8E6BFF`). Never red or orange (real deep-water glow is almost all blue and green, which is also why red is the "danger" color). |
| Bloom | Subtle. Glow should feel soft, not blown out like a nightclub. |
| Caustics | ONLY in Zone 1 and in air pockets lit by a strong light. Moving caustics deep in a dark cave break realism. |
| Sun | Only exists in Zone 1 and the hub. |

**Light is gameplay:** a teammate's beam swinging toward you is communication. A beam disappearing around a corner is tension. A beam pointed straight at a friend's face blinds them (backscatter plus bloom), which is a free comedy moment.

---

## Water look

| Element | Guidance |
|---------|----------|
| Particulates | Always present. Three layers: fine dust (thousands of tiny specks only visible in beams), mid specks (drifting slowly, a few per cubic meter), and silt clumps near the floor. Density goes up with depth and in silt rooms. |
| Haze / fog | Distance fog colored per zone (see palettes). Gets thicker with depth. In Zone 4 it's a heavy yellow-olive soup. |
| Caustics | Zone 1 and lit air pockets only (see lighting rules). |
| Silt-outs | A thick, lit-from-inside cloud that swallows your beam. It should glow beige-white where your light hits it and kill all visibility within about 1 m. Fades slowly over 10 to 15 seconds (see [[Diving Systems]]). |
| Halocline | A shimmering, wobbling layer between Zones 3 and 4 that bends the view through it like heat haze, plus the milky sulfide cloud. |
| Bubbles | Exhaled bubbles rise, wobble, merge, and pool on the ceiling as shiny silver puddles. Bubbles pooling on the ceiling is a real cave diving detail and very cinematic. |
| Water surface (air pockets) | Seen from below, a bright silver mirror (total internal reflection) that breaks into ripples when someone surfaces. |
| Depth fog effect | The "foggy vision" from depth (see [[Diving Systems]]): soft vignette, slight blur at edges, slight color drain. It must look like a camera effect, not a broken screen. |

---

## Rock and material language

The cave is **flooded limestone karst**: rock dissolved by water over millions of years, then flooded. That gives a clear shape language.

| Feature | What it looks like | Where |
|---------|--------------------|-------|
| Scalloped walls | Smooth, spoon-shaped dents carved by flowing water | Current passages, all zones |
| Speleothems | Stalactites, stalagmites, columns, flowstone (formed when the cave was dry, now underwater) | "Decorated" chambers, Zones 1 to 3 |
| Breakdown | Sharp, blocky boulders from collapsed ceilings | Big chambers, near cave-ins |
| Silt floors | Soft, smooth beige floors that look solid but explode into clouds | Silt rooms, Zones 2 to 5 |
| Restrictions | Low bedding planes, tight vertical cracks | Squeezes |
| Sulfur staining | Yellow and white crusts, bacterial mats, corroded rock | Zone 4 |
| Fossil walls | Shells, bones, and ammonites embedded in rock | Zones 3 to 5 |
| Dark old rock | Colder, denser, blue-grey stone (game fiction, not real karst) | Zone 5 |

**Material rules:**
- **Underwater rock is NOT shiny.** Wet-look specular highlights come from a film of water on a surface in air. Fully underwater, surfaces look matte, with a little soft sheen. Save "glistening wet" for air pockets and dry chambers.
- **High detail up close, readable silhouettes far away.** Players spend most of their time 0.5 to 3 m from rock walls, so macro detail (cracks, pores, small fossils) matters more than big vistas.
- **Every surface has a "touch" response:** silt puffs off ledges, algae sways, bacterial mats ripple, small stones tumble.
- **Avoid noise-blob caves.** Modular, scanned-quality rock pieces stitched together (see [[Cave Generation]] and [[Free Assets and Licensing]]).

---

## Diver gear look

Gear is the main "character design" (faces are not a priority, see [[Gear and Customization]]). It should look like real technical cave diving gear, built from real parts, with **invented brand names only** (no real logos).

| Item | Real-world look | First-person visibility |
|------|-----------------|-------------------------|
| Sidemount cylinders | Two aluminum cylinders (about 11 L / "80 cubic foot" size) clipped under each arm along the body, bungeed at the neck. Matte silver or painted. | Visible when you look down or squeeze through restrictions |
| Harness and wing | Minimal black webbing harness with stainless D-rings and a flat wing (buoyancy bladder) on the back. Inflator hose on the left shoulder. | Inflator hose comes up when you breathe into the BCD (see [[Movement and Swimming]]) |
| Long hose | 2.1 m primary hose, usually black, routed around the neck. Used to donate air to a buddy. | Visible when sharing air |
| Backup regulator | Short "necklace" hose under the chin | Rarely visible |
| Pressure gauges | One small gauge per cylinder, clipped to the chest | When you check air manually |
| Primary light | Canister or compact light on a "Goodman handle" (strap on the back of your hand). | Always visible: the left hand holds the light |
| Backup lights | Two small torches clipped to the chest strap | When you switch to backup |
| Mask | Low-volume, frameless, black silicone skirt (black reduces glare, standard for cave divers) | The mask edge frames the screen |
| Fins | Stiff, heavy, short "jet style" blade fins for frog kicking (good for silt control) | When looking back or in squeezes |
| Exposure suit | Wetsuit with hood and gloves (cold caves) | Gloves are always on screen |
| Dive computer | Wrist-mounted, chunky, with a glowing screen | The watch from [[HUD, Watch and Waypoints]] |
| Line cutter | Small cutter on the harness | Rope chaos tool |
| Line markers | Real cave divers clip plastic "arrows" and "cookies" to the guideline to mark direction and exits | Great real basis for waypoints |

**Wear and tear:** gear gets scuffed, silted, scratched, taped. Repair tape patches stay visible for the run. Customized wetsuit designs (see [[Gear and Customization]]) show on gloves, sleeves, and other players.

**Gloves are a gift:** cold-water diving gloves mean we never have to make realistic bare hands, which are one of the hardest things to make look good in first person.

---

## HUD style spec (inside the mask)

Builds on [[HUD, Watch and Waypoints]].

| Property | Spec |
|----------|------|
| Concept | A real heads-up display projected on the inside of the mask glass |
| Primary color | `#4FF2D0` (greenish-blue, more green than the creatures' blue so it never gets confused with bioluminescence) |
| Secondary color | `#2BB8C9` (dimmer teal for labels and units) |
| Warning | `#FFC857` (amber) for low air, low battery, high panic |
| Critical | `#FF4D5E` (red) for out of air, mask flooding, severe injury. Red is used ONLY for danger, never for decoration. |
| Glow | Soft outer glow around text and lines, plus a faint "light bleed" haze on the glass behind each readout |
| Glass layer | Readouts sit "behind" a glass layer: slight refraction at the edges, faint smudges, tiny scratches, occasional water droplets on the inside |
| Depth feel | Readouts curve slightly with the mask shape and lag 50 to 80 ms behind fast head turns, so they feel attached to your face, not glued to the monitor |
| Brightness | Auto-dims in very dark areas so it doesn't blind the player or wash out the darkness |
| Font | A clean, technical, open-licensed font. Recommended: **B612 Mono** (designed for aircraft cockpit legibility, free under the SIL Open Font License) or **Share Tech Mono** (also OFL, more sci-fi). Numbers must be monospaced so they don't jitter. |
| Layout | Minimal: depth, air, stamina, compass heading by default. Everything else is optional and player-placed. |
| Damage states | Mask fogging (panic, cold), cracks (impact), flicker and color shift (mask flooding), dimmed and glitchy (low HUD battery if added) |
| No floating game UI | No health bars over teammates, no quest markers in the world. Teammate info appears as small HUD tags only when they're in view. |

---

## UI and menu style

The rule: **menus are physical objects from a real diver's kit.** No glossy video game menus.

| Screen | Style |
|--------|-------|
| Main menu | Live 3D scene: the cave entrance at dawn, rope stake in the foreground, gear laid out on a tarp. Text overlays in the HUD font and color. |
| Pre-dive loadout | Gear laid out on a tarp or bench, seen from above. Click items to swap. |
| Logbook | Waterproof notebook: off-white paper (`#EDE6D3`), pencil gray text (`#2B2B2B`), hand sketches of each species, measurements written in. Handwritten font for notes (open license, for example **Caveat**), plus a clean font for numbers. |
| Dive slate | White plastic slate with pencil writing, used for run summaries ("Max depth, time, air left"). |
| Hologram map | The watch projects a 3D map in the HUD teal (`#4FF2D0`), with the rope as a glowing line and waypoints as labeled lights. |
| Settings and pause | Dark panel (`#0A1014`) with teal accent (`#4FF2D0`). Simple, readable sans serif (for example **Inter**, OFL). |
| Leaderboards | A cork board or whiteboard in the hub with pinned dive slates. |

---

## Real-world reference to study

No images are stored in this vault. Watch, study, take notes on what makes each shot work, and build your own versions.

### Cave diving films and documentaries
| Title | Year | Why study it |
|-------|------|--------------|
| **Diving Into the Darkness** (dir. Nays Baghai) | 2024 | Documentary about cave explorer Jill Heinerth. Very clear water cave footage, how lights carve the dark, and a tense lost-in-a-cave reenactment. |
| **The Rescue** (dir. Chai Vasarhelyi and Jimmy Chin, National Geographic) | 2021 | Real footage from the Tham Luang cave rescue: murky water, zero visibility, guideline, cramped squeezes. The "real horror" reference. |
| **Thirteen Lives** (dir. Ron Howard) | 2022 | Dramatized Tham Luang rescue. Great for how film lighting makes dark, silty water readable. |
| **Diving into the Unknown** (dir. Juan Reina) | 2016 | Finnish divers recovering friends from a deep Norwegian cave (Plura). Cold, dark, technical, emotional. Very close to Zone 3 mood. |
| **Sanctum** (dir. Alister Grierson, produced by James Cameron) | 2011 | Fictional cave diving thriller. Not accurate, but useful for big-chamber cinematography and light design. |
| **The Descent** (dir. Neil Marshall) | 2005 | Dry cave horror. Study how it uses flares, headlamps, and color (red, green) to light darkness. Useful for dry chambers. |
| **Last Breath** (documentary) | 2019 | Saturation diving accident. Useful for diver comms voice sound, breathing, and the feel of helmet cams. |
| **Blue Planet II, episode "The Deep"** (BBC) | 2017 | Best reference for bioluminescent creatures, glow colors, and how glow moves. |
| **Water's Journey: Hidden Rivers of Florida** (Wes Skiles) | 2003 | Classic flooded cave cinematography in Florida springs. |

### Photographers and cinematographers
| Name | Why study them |
|------|----------------|
| **Martin Broen** | Mexican cenote photography: sun shafts, light beams through crystal water, divers as tiny figures in huge decorated caves. Zone 1 and 2 bible. |
| **Becky Kagan Schott** | Underwater cinematographer for cave and wreck work. Great for moving camera, lighting divers in darkness. |
| **Jill Heinerth** | Explorer, photographer, filmmaker. Her book *Into the Planet* (2019) is also a great read for real cave diving feelings and stories. |
| **Wes Skiles** | Pioneer of cave film lighting in Florida and Bahamas blue holes, including National Geographic work. |
| **Stratis Kas** | Technical diver and cave photographer known for dramatic, high-contrast cave images. |

### Real places to study (photos and video)
- **Yucatan cenotes** (Dos Ojos, Sac Actun, Cenote Angelita): Zone 1 light, Zone 4 halocline cloud.
- **Florida springs** (Ginnie Springs, Devil's Eye): tannic water layers, scalloped limestone, current passages.
- **Bahamas blue holes:** deep, sulfur layers, fossils.
- **Plura and Jordbrugrotta, Norway:** cold, dark, Scandinavian cave diving (close to Sweden).
- **Waitomo Caves, New Zealand:** the glowworm "night sky" for dry chambers.

### Games to study
| Game | What to learn |
|------|---------------|
| **Subnautica 2** (Unreal Engine 5, Early Access since May 14, 2026, 1 to 4 player co-op) | The closest current reference: UE5 water, co-op underwater play, creature design, how a UE5 underwater game is lit. |
| **Under The Waves** (Parallel Studio, 2023) | Realistic diving, gear, lonely mood, underwater lighting. |
| **SOMA** (Frictional Games, 2015) | Darkness, underwater horror, sound and light used for tension. |
| **Abzû** (Giant Squid, 2016) | Stylized, but the best reference for fish schools moving and reacting. |
| **Beyond Blue** (E-Line Media, 2020) | Real marine biology, scanning and logging creatures (close to the logbook). |
| **Senua's Saga: Hellblade II** (Ninja Theory, 2024, UE5) | Photoreal rock, fog, and lighting in UE5. The "photoreal bar." |
| **Bodycam** (UE5) | How "real camera" tricks (lens, exposure, motion) make UE5 look like real footage. |
| **Deep Rock Galactic** | Not photoreal, but the best example of light as a co-op resource in dark caves. |
| **PEAK** | Tone reference: co-op chaos, friendly physics comedy (see [[Game Pillars]]). |

---

## Related notes
- [[Game Pillars]]
- [[Cave Generation]]
- [[Diving Systems]]
- [[Gear and Customization]]
- [[HUD, Watch and Waypoints]]
- [[Creatures, Flora and Logbook]]
- [[Logbook Species List]]
- [[Free Assets and Licensing]]
- [[Audio Sourcing]]

---

## Sources
- Diving Into the Darkness review (Divernet): https://divernet.com/scuba-diving/review-diving-into-the-darkness-sets-new-standards-for-dive-documentaries/
- Diving Into the Darkness (Cambridge Film Festival): https://cambridgefilmfestival.org.uk/film/2024/diving-into-the-darkness
- Diving Into the Darkness (Whistler Film Festival): https://www.whistlerfilmfestival.com/films/2024/diving-into-the-darkness
- Becky Kagan Schott profile (Scubaverse): https://scubaverse.com/profile/becky-kagan-schott/more_info
- Underwater photographers (Scuba Diving magazine): https://www.scubadiving.com/meet-underwater-photographers-behind-scuba-diving-magazine
- Subnautica 2 Early Access launch (GameLuster): https://gameluster.com/subnautica-2-early-access-out-now/
- UE 5.6 updated game templates (Epic): https://www.unrealengine.com/en-US/news/updated-game-templates-for-unreal-engine-5-6available-now
- Valley of the Ancient sample (Epic docs, Nanite and Lumen notes): https://dev.epicgames.com/documentation/en-us/unreal-engine/valley-of-the-ancient-sample-game-for-unreal-engine
