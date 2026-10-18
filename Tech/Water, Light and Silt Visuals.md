# Water, Light and Silt Visuals

Technical plan for Pillar 2 in [[Game Pillars]]: lighting, water, silt and depth effects from [[Diving Systems]], [[Cave Generation]] and [[Creatures, Flora and Logbook]]. Researched October 2026 against Unreal Engine 5.8.

## Plain-language explanation

You are almost never looking *at* water in this game; you are *inside* it. So "water" is mostly a camera effect:

- **Post-processing** is a filter on the final image: color tint, blur, vignette, distortion. Being underwater is mostly post-processing.
- **Volumetric fog** fills the air (or water) with a fog that lights can shine through. It is what makes a flashlight look like a visible beam in murky water. Particles can also *add* fog density, which is perfect for silt.
- **Lumen** is Unreal's real-time bounce lighting. In a cave it means your flashlight hitting a wall softly lights the walls around it. In near-total darkness that bounce light is most of what makes the scene look real.
- **Niagara** is Unreal's particle system (bubbles, silt, plankton specks).
- **Emissive** materials glow on their own but mostly do not light other things; small glowing objects are largely ignored by Lumen's lighting. A real (small) light is needed when something should actually light the rock.

## Recommended approach

**Darkness first: no sky light in the cave, clamped exposure, player flashlights as the main light, volumetric fog for water, and silt as Niagara particles that write into that fog.**

### 1. Darkness that falls off fast

- **No sky light underground.** A sky light makes every cave glow faintly. Use the sun and sky only at the entrance, blocked by the cave shell.
- **Clamp auto exposure.** By default the camera "eye adapts" and brightens darkness until it looks grey. Set Min and Max EV100 in a global Post Process Volume so dark stays dark; adjust per depth zone.
- Closed, thick module shells (see [[Procedural Cave Generation]]) to stop Lumen light leaks. If a sealed area still glows, raise Lumen Scene Detail and Max Trace Distance. A 5.8.3 bug report shows broad leaks in sealed rooms with the default gather; `r.Lumen.FinalGatherMethod 0` fixed that case, so keep it in mind as a test.
- Lumen in **Software Ray Tracing** mode as the default (runs on the target GPUs and on Apple Silicon M1+).

### 2. Underwater look

- A C++ check each frame: is the camera inside a water volume? If yes, blend in an underwater post-process material and settings. If the camera is above an air-pocket surface, blend it out.
- Underwater settings: blue-green tint that shifts by depth zone, slightly lowered contrast at distance, gentle chromatic aberration and a soft lens edge where the mask frame is, and a few drifting plankton particles near the camera so the water feels like a substance.
- **Exponential Height Fog with Volumetric Fog on**, dense, short View Distance (start around 30 to 50 m), dark albedo. Visibility in a clear cave can be good, in a silty one terrible; drive fog density from the zone.

### 3. Flashlights

- A **shadow-casting Spot Light** attached to each diver's hand or mask. Give it a soft inner cone and a wider dim outer cone like a real dive light.
- Raise its **Volumetric Scattering Intensity** so the beam shows in the water. Shadowed spot lights in volumetric fog cost about 3 times unshadowed ones, but with only 4 players that is fine.
- Limitations: IES light profiles and light functions do not affect volumetric fog for spot lights, and fast-moving lights can leave faint trails in the fog (temporal reprojection). Test fast flashlight sweeps early.
- Battery drain = intensity and cone flicker over time, driven from C++.

### 4. Bioluminescence

- **Emissive material for the glow itself** (creatures, moss, fungi, the lantern).
- **Only the ones that should light the cave also get a small Point Light:** unshadowed, short radius (1 to 3 m), no volumetric shadow. Lumen alone will not reliably light rock from small emissive objects.
- The **lantern** is one point light whose brightness is the sum of the caught creatures' brightness ([[Creatures, Flora and Logbook]]).
- **MegaLights** (production ready in 5.8) can handle hundreds of shadowed lights, but it needs hardware ray tracing (RTX 20 series / RX 6000 or newer) and is Experimental on Mac. Treat it as an "Epic" quality bonus, not something the core look depends on. See [[Performance and Mac]].

### 5. Silt-outs (the signature effect)

Use a **Niagara GPU system with two layers**, spawned locally on every machine from each diver's fin speed when the floor below is a silty surface (tag silt floors with a Physical Material).

- **Layer A: volume particles.** Particles using a material in the **Volume** domain (with a SphereMask for each particle) write density straight into Volumetric Fog. Flashlight beams then get lit and shadowed through the silt cloud automatically. This is the "torch beam cutting through murk" look, and it is much cheaper than covering the screen in transparent sprites.
- **Layer B: a few lit translucent sprites** near the camera for close-up detail and swirls. Keep the count low and sprites large; transparency overdraw is the main cost.
- **Motion:** burst upward and outward from the fins with curl-noise turbulence, high drag so it hangs, then very weak gravity. Fade density over a 10 to 15 second lifetime with some randomness, so it settles like the design asks.
- **Gameplay is separate from visuals.** The server keeps a coarse grid of silt density values that decay over time (shrinking to about 5% in roughly 13 seconds). That grid decides "you are silted out" for HUD, AI and leaderboards. Particles are local eye candy that match it closely enough.
- Because each machine already sees teammates moving, each machine spawns their silt itself. No extra networking needed.

### 6. Depth fog and narcosis

- One **post-process material** driven by a `Narcosis` value (0 to 1) set from C++ based on depth, stored in a Material Parameter Collection.
- As it rises: tunnel vignette, slight desaturation, slow wavy distortion, subtle chromatic aberration, a little extra fog density, and a low-pass filter on audio ([[Audio]]). Ramp it slowly and keep it beautiful, never cheap.

### 7. Air-pocket water surfaces

- **Simple planes with a Single Layer Water material**, placed by the generator at each air pocket's water level. Single Layer Water is the engine's efficient water shading model with proper scattering, absorption, reflection and refraction.
- **Do not use the Water plugin** for this. It is built for landscapes, oceans, rivers and lakes; air pockets are small flat pools inside modules, and the plugin adds complexity without benefit here.
- Add a Niagara ripple and drip effect and a "surfacing" splash for clips.

## Why this pick

- Darkness and a single beam of light are what make cave footage look real; they are also the cheapest scene to render well.
- Volumetric fog plus Volume-domain particles gives lit, shadowed silt without a custom renderer.
- Nothing core depends on hardware ray tracing or MegaLights, so it runs on the minimum PC spec and on Mac.

## Risks and honest difficulty

- **Difficulty: medium.** Most of this is tuning in the editor, not complex code, but tuning takes many hours.
- Darkness plus Lumen can look noisy or blotchy when the only light is a small flashlight. Test on the real cave kit early.
- Silt filling the whole screen is exactly the moment frame rate is most at risk. Profile a full silt-out on the minimum spec.
- Volumetric fog is low resolution; very close silt can look soft, which is why Layer B exists.
- Post-process stacking (underwater + narcosis + panic + injury) can turn into mush. Give each effect a clear job and a cap.

## First prototype step

1. One grey-box dark tunnel, no sky light, exposure clamped.
2. One flashlight spot light with volumetric scattering, height fog with volumetric fog on.
3. A Niagara silt burst on a key press using a Volume-domain particle material, fading over 12 seconds.
4. Record a 15 second clip swimming into the silt with the flashlight. If it looks good in a grey box, it will look great with real rock. This is a strong devlog #1 shot ([[Personal Brand and Marketing]]).

Related: [[Diving Systems]], [[Procedural Cave Generation]], [[Swimming and Underwater Movement]], [[Performance and Mac]].

## Sources
- https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-fog-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/local-fog-volumes-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine
- https://forums.unrealengine.com/t/ue-5-8-3-lumen-broad-interior-light-leakage-in-a-sealed-stock-cube-room-with-screen-probe-gather/2839515
- https://dev.epicgames.com/documentation/en-us/unreal-engine/megalights-in-unreal-engine
- https://www.guru3d.com/story/unreal-engine-58-debuts-lumen-lite-and-productionready-megalights/
- https://dev.epicgames.com/documentation/en-us/unreal-engine/single-layer-water-shading-model-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Plugins/Water/FUnderwaterPostProcessSettings
- https://dev.epicgames.com/documentation/en-us/unreal-engine/auto-exposure-in-unreal-engine
- https://dev.epicgames.com/documentation/unreal-engine/using-the-emissive-material-input-in-unreal-engine
- https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes
