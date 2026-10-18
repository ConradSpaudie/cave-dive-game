# Free Assets and Licensing

> Researched October 2026. Licenses change, so re-check the license on the actual asset page the day you download it, and screenshot it.

**Goal:** get photoreal cave rocks, wet surfaces, scuba gear, fish, and first-person arms for $0, legally, for a game sold on Steam. Pay only where free is the line between good and bad quality.

Builds on [[Engine, Hardware and Platforms]] and serves [[Art Direction]].

---

## The short version (do this)

| Need | Get it from | License | Verdict |
|------|-------------|---------|---------|
| Cave rock textures | **ambientCG** and **Poly Haven** | CC0 (no credit needed) | Start here. Best free option. |
| Cave rock 3D shapes | Free **Megascans** on Fab, plus Poly Haven rock and cliff models | Fab Standard / CC0 | Good for testing. Build the cave kit from these plus your own Blender sculpts. |
| Wet surfaces | Make them in Unreal (a "wetness" material layer on any rock) | Your own work | Free, and better than downloading "wet" textures. |
| First-person arms | **UE5 First Person template** (Manny/Quinn based) plus a glove mesh | Unreal Engine EULA (Unreal-only) | Use this. Gloves hide the hands. |
| Swim animations | **Mixamo** (swimming, treading water), retargeted to Manny | Free, royalty-free | Use for a first pass, then hand-polish. |
| Scuba gear models | Sketchfab CC0/CC-BY, Fab free | CC0 / CC-BY / Fab Standard | Quality is mixed. This is the #1 place where paying might be worth it. |
| Fish and creatures | Sketchfab CC0/CC-BY scans, Fab free | Varies | Fine for real fish. Invented creatures you make yourself. |
| Fossils and bones | Museum 3D scans (many CC0, for example Smithsonian Open Access) | CC0 | Great free source for real skulls and fossils. |
| Learning and systems | Unreal sample projects | Unreal Engine EULA | Use for learning PCG, Nanite, animation, and multiplayer. |

**Hard rule:** keep a credits log from day one (see "Credits log" at the bottom). One bad asset in a released game can get it pulled from Steam.

---

## 1. The Unreal Engine license (the base of everything)

- Unreal Engine is free to use. Epic takes a **5% royalty only after a game earns more than $1 million USD lifetime gross**. Until then, nothing.
- Lots of Epic's free content (samples, templates, Megascans inside samples, Game Animation Sample) is licensed **only for Unreal Engine projects**. That's fine for us, since we're UE5-only. You can't take it into Unity or sell it as an asset pack.

---

## 2. Fab (Epic's asset store) and Megascans

### Current Megascans status (October 2026)
| Fact | Detail |
|------|--------|
| Free for everyone? | **No, not anymore.** Megascans was free to everyone only until **December 31, 2024**. Since 2025 most Megascans cost money on Fab. |
| Anything still free? | Yes. Epic kept a set of Megascans free on Fab (one 2026 guide counts 1,500+ free Megascans assets). Search Fab with the "Free" filter plus "Megascans". |
| Already claimed in 2024? | If you claimed the legacy library before the end of 2024, those assets stay yours under the license you accepted. (If Conrad or Tyrus didn't claim then, assume you don't have it.) |
| Quixel Bridge | Still around in 2026 but being phased out. New Megascans have been Fab-only since early 2026. Back up anything you download. |

### Fab license types
| License | What it means for us |
|---------|----------------------|
| **Standard: Personal tier** | For buyers who made **$100,000 or less** in the last 12 months. Commercial games allowed. This is us. |
| **Standard: Professional tier** | For buyers above $100,000 in the last 12 months. If the game takes off, newer purchases must use this tier. |
| **CC-BY (on Fab)** | Free, but you MUST credit the creator. |
| **UE Marketplace License (legacy)** | Old listings moved from the Unreal Marketplace. Unreal-only, still usable. |

### Epic's free content every two weeks
- Fab gives away **"Limited-Time Free" products every two weeks** (first and third Tuesday of the month). Normally paid assets, free for two weeks.
- **If you claim ("buy" at $0) during the free window, it's yours forever.**
- **Habit:** both of you check fab.com/limited-time-free every other Tuesday and claim anything remotely useful (rocks, caves, underwater, particles, fish, gear, horror audio). It costs nothing and builds a library.

### What to grab on Fab for THIS game
Search terms that work: `cave`, `limestone`, `cliff`, `rock`, `stalactite`, `cenote`, `underwater`, `seabed`, `coral rock`, `fossil`, `skull`, `scuba`, `diving`, `fish`, `particles`, `bubbles`, `caustics`, `Niagara underwater`.

### Gotchas
- Some limited-time free items are free **only for the Personal tier**. Fine for now; just note it in the credits log.
- Check whether a listing is "Unreal-only" (Epic content) or Standard (any engine). Doesn't matter for us, but write it down.
- "Megascans-style" packs from third parties are not Megascans. Read their license.
- **AI tags:** some Fab listings carry a NoAI tag (the creator doesn't want it used with AI). Don't feed those into AI tools.

---

## 3. Unreal sample projects (free, commercial use OK in UE projects)

| Sample | What's useful for THIS game | Gotcha |
|--------|------------------------------|--------|
| **First Person template (updated in UE 5.6)** | The starting point for the diver: first-person rendering with separate FOV and scale for arms, a full-body character, a control rig. The **Survival Horror variant** includes a flashlight and an example map for lighting dark environments. Exactly our problem. | Uses Manny/Quinn mannequins, which you dress up with your own gloves and gear. |
| **Game Animation Sample** | 500+ free animations and a motion matching setup. Good for dry chamber walking, climbing, falling, ragdoll blends. | Unreal-only license. No real swimming set, so swimming comes from Mixamo or your own work. |
| **Electric Dreams** | Shows the PCG (Procedural Content Generation) framework building a big environment from pieces. The best learning reference for [[Cave Generation]]. Some Megascans rocks and foliage inside. | Very big download and heavy to run. Wait until the external SSD exists. |
| **Valley of the Ancient** | Huge Nanite Megascans cliffs and rocks (Moab, Utah), Lumen lighting, a dark "other realm" area. Great for learning Nanite rock workflows and for borrowing rock meshes to re-texture as limestone. | Desert sandstone shapes, not cave shapes. Needs a strong PC (Epic recommends 64 GB RAM). Large download. |
| **Lyra** | Epic's multiplayer game framework. Useful to study how Epic structures networked games. | Big and complex for a beginner. Study it, don't build on top of it. |
| **City Sample** | Not relevant (city, cars, crowds). Skip. | Huge download (tens of GB). |
| **Content Examples** | Small example maps for Niagara particles, materials, audio, physics. Great for learning bubbles and particles. | None. |

**How to get samples:** Fab website, Add to My Library, then Epic Games Launcher > Unreal Engine > Library > Fab Library > Create Project. Samples only appear there if you have the matching engine version installed.

---

## 4. Mixamo (Adobe)

| | |
|---|---|
| Cost | Free with an Adobe account |
| License | **Royalty-free, commercial games allowed** |
| Can't do | Share or sell the raw animation or character files (for example, put them in a public GitHub repo or sell them in an asset pack). Can't use them to train machine learning models. |
| Useful animations | Swimming, treading water, swim-to-edge style climbs, crawling, falling, getting up, pushing, pulling. |
| How | Download as FBX (no skin, 30 fps), import into UE5, retarget to Manny with the IK Retargeter. |

**Gotchas:**
- **Keep the GitHub repo private**, or keep Mixamo files out of it (raw files in a public repo counts as redistribution).
- Adobe hasn't actively maintained Mixamo in years. It still works in 2026, but download everything you might need now and back it up.
- Mixamo animations are third-person and full-body. In first person you only see arms, so expect to hand-tweak arm poses (holding the light, grabbing rope, pulling along rock).

---

## 5. Poly Haven (CC0)

| | |
|---|---|
| License | **CC0** (public domain): use for anything, no credit required (credit is still a nice thing to do) |
| What's there | 2,300+ assets: 850+ textures, 520+ models, 990+ HDRIs (September 2026 count), up to 16K resolution |
| Grab for THIS game | Rock and cliff textures, rock boulder models, gravel, mud, sand, rough concrete (works as worn limestone), a few dead-wood and root models (for Root Curtain and Foxfire Wood in [[Logbook Species List]]), HDRIs for the hub and main menu |
| Gotcha | Not much underwater-specific content. Rocks lean "outdoor cliff," so re-tint toward the limestone palette in [[Art Direction]]. |

---

## 6. ambientCG (CC0)

| | |
|---|---|
| License | **CC0**, no credit required |
| What's there | 2,000+ PBR materials, 1K to 8K |
| Grab for THIS game | Rock (many limestone-like), Ground (silt, mud, sand), Gravel, Moss, Bark (drowned wood), Plaster and Concrete (good base for flowstone) |
| Gotcha | Textures only, mostly flat-surface. Combine with Nanite displacement or your own sculpted meshes for real depth. |

---

## 7. Sketchfab

**Status in 2026:** Epic sold Sketchfab and ArtStation to **KitBash (August 2026)**. Free downloadable models are still downloadable. Only CC-BY and Fab Standard models were copied to Fab; CC0 and other CC models stayed on Sketchfab. The future roadmap is unclear, so **download what you need now**.

### License cheat sheet
| License | Use in our Steam game? | Rules |
|---------|------------------------|-------|
| **CC0** | Yes | Nothing required |
| **CC-BY** | Yes | Must credit: **author name, model title, link to the model, and the license (CC-BY 4.0)**. Put it in the in-game credits and on the store page or a credits file. |
| **CC-BY-SA** | Avoid | "Share-alike": your changed version must use the same license. Risky in a closed game. |
| **CC-BY-NC** | **No** | Non-commercial only. A Steam game is commercial even if it's cheap. |
| **CC-BY-ND** | **No** | No modifications. You can't even re-texture or re-scale it properly. |

### What to grab for THIS game
- **Scuba gear:** search `scuba tank`, `sidemount`, `regulator`, `dive mask`, `fins`, `BCD`, `wing`, `dive light`, `dive computer`.
- **Fish and cave life:** search `fish scan`, `axolotl` (close to the olm), `salamander`, `crayfish`, `shrimp`, `isopod`, `eel`, `coelacanth`, `trilobite`.
- **Fossils and bones:** search `fossil`, `skull`, `museum scan`. Many museums publish CC0 scans.

### Gotchas
- **Ripped models:** some uploads are stolen from other games or include real brand logos. If it looks like a game asset or carries a logo, skip it.
- License shown at download time is what counts. Screenshot it.
- Photogrammetry scans are often millions of triangles with messy topology. Fine for Nanite rocks and props, bad for animated creatures (needs retopology).

---

## 8. MetaHuman

| | |
|---|---|
| License | Included with the Unreal Engine license. **Free for anyone under $1 million USD revenue**, then normal UE terms apply. Since 2025 (UE 5.6), MetaHumans can also be used in other engines. |
| Use for THIS game | Low priority, since faces aren't a priority (see [[Gear and Customization]]). Possible uses: the short intro cinematic, hub characters, high-quality hand and arm meshes if the Manny arms look too plain. |
| Gotchas | Heavy on performance and disk space. A face hidden behind a mask and regulator doesn't need MetaHuman quality. Don't start here. |

---

## 9. First-person arms and hands

| Option | Cost | Quality | Verdict |
|--------|------|---------|---------|
| **UE5 First Person template arms (Manny/Quinn)** | Free | Good, well rigged, works with the template's first-person rendering | **Use this.** |
| Game Animation Sample Manny | Free | Same skeleton, more animations | Use alongside the template |
| MetaHuman hands and arms | Free | Best skin detail | Overkill: our hands wear gloves |
| Mixamo characters | Free | Okay | Skip; arms look generic |
| Fab free "FPS arms" packs | Free (check license) | Mixed | Only if a giveaway has a good one |

**The plan:** Manny's arms + a **neoprene diving glove mesh** (made in Blender or from a CC0 base) + a wetsuit sleeve material using the customization system. Gloves remove the hardest problem (realistic bare hands), and real cold cave divers wear them anyway. The left hand always holds the primary light (Goodman handle), per [[Art Direction]].

---

## 10. Other free sources (prototype only)

| Source | License | Use |
|--------|---------|-----|
| Kenney | CC0 | Stylized. Greybox prototypes and UI icons only. |
| Quaternius | CC0 | Stylized low-poly. Prototype only. |
| itch.io asset packs | Varies per pack | Read every license. |
| Textures.com | Free tier with limits | Okay for a few textures. Read terms. |

**Not allowed:** anything ripped from other games, YouTube, Google Images, or "free download" sites that don't state a license.

**AI-generated assets:** Steam asks developers to disclose AI-generated content on the store page. If you ever use AI tools to make textures, models, or sounds, write it down so the Steam disclosure is honest.

---

## What's worth paying for

Only when free is clearly the difference between good and bad.

| Item | Rough price | Why | When |
|------|-------------|-----|------|
| **External SSD** (already planned) | $60 to $120 | Without it, nothing else matters (see [[Engine, Hardware and Platforms]]) | Now |
| **A realistic scuba / sidemount gear pack** (Fab) | About $20 to $60 | Gear is our "character design" and it's on screen every second. Free gear models are often low quality or wrong (recreational back-mount, not sidemount). | After the swim prototype works |
| **A modular cave or rock kit** (Fab, only if free rocks don't stitch well) | About $20 to $80 | Procedural caves need pieces that connect cleanly. Free scans don't. | After testing free rocks in the cave generator |
| **One good fish pack** | About $15 to $40 | Only if Sketchfab real-fish scans fail | Later |

**Not worth paying for:** Megascans subscriptions, MetaHuman anything, animation packs before the swim system exists, "complete underwater game" templates (they lock you into someone else's code).

**Best trick:** watch the free-every-two-weeks giveaways first. Paid packs on your wishlist sometimes go free.

---

## Credits log (start this now)

Make a file `Tech/Asset Credits.md` (or a spreadsheet) and add a row every time you import anything.

| Asset | Source URL | Author | License | Credit needed? | Date downloaded | Screenshot of license? | Used where |
|-------|-----------|--------|---------|----------------|-----------------|------------------------|-----------|
| example: Limestone 012 | ambientcg.com/... | ambientCG | CC0 | No | 2026-10-17 | Yes | Zone 2 walls |

---

## Related notes
- [[Engine, Hardware and Platforms]]
- [[Art Direction]]
- [[Cave Generation]]
- [[Gear and Customization]]
- [[Movement and Swimming]]
- [[Audio Sourcing]]

---

## Sources
- Fab licenses and pricing (Epic docs): https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab
- Fab End User License Agreement: https://www.fab.com/cla
- Fab launch announcement (Epic): https://www.unrealengine.com/en-US/blog/fab-epics-new-unified-content-marketplace-launches-today
- Fab free content program (Epic): https://www.unrealengine.com/fabfreecontent
- Fab limited-time free page: https://www.fab.com/limited-time-free
- Fab giveaway changes, twice a month, keep forever (GameFromScratch): https://gamefromscratch.com/massive-changes-to-the-unreal-engine-fab-marketplace-giveaways/
- Megascans no longer free after 2024 (80.lv): https://80.lv/articles/megascans-no-longer-free-after-2024/
- Megascans free until end of 2024 (CG Channel): https://www.cgchannel.com/2024/10/epic-games-has-made-megascans-free-to-all-but-only-until-the-end-of-2024/
- Legacy Megascans access (Epic forums): https://forums.unrealengine.com/t/access-legacy-megascans-on-bridge-and-quixel-com/2142664
- Quixel to Fab migration guide 2026 (StraySpark): https://www.strayspark.studio/blog/quixel-to-fab-migration-indie-developer-survival-guide-2026
- Free game assets in 2026 (Cinevva): https://app.cinevva.com/guides/game-assets-guide.html
- UE 5.6 updated templates (Epic): https://www.unrealengine.com/en-US/news/updated-game-templates-for-unreal-engine-5-6available-now
- First Person template docs (Epic): https://dev.epicgames.com/documentation/en-us/unreal-engine/first-person-template-in-unreal-engine
- Game Animation Sample, 500+ free animations (CG Channel): https://www.cgchannel.com/2024/06/get-500-free-game-ready-animations-for-use-in-unreal-engine
- Electric Dreams sample (CG Channel): https://www.cgchannel.com/2023/06/download-epic-games-free-electric-dreams-sample-project/
- Valley of the Ancient (Epic docs): https://dev.epicgames.com/documentation/en-us/unreal-engine/valley-of-the-ancient-sample-game-for-unreal-engine
- City Sample (CG Channel): https://www.cgchannel.com/2022/04/download-epic-games-free-city-sample-assets-for-ue5
- Mixamo licensing FAQ (Adobe Community): https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400
- Mixamo and alternatives 2026 (Cinevva): https://app.cinevva.com/guides/free-character-animations-rigging
- Epic sells ArtStation and Sketchfab to KitBash (Game Developer): https://gamedeveloper.com/business/epics-sells-artstation-and-sketchfab-to-kitbash
- Epic sold ArtStation and Sketchfab (Game World Observer): https://gameworldobserver.com/2026/08/11/epic-games-has-sold-artstation-and-sketchfab
- Sketchfab update after Fab launch (Sketchfab blog): https://sketchfab.com/blogs/community/sketchfab-update-what-you-need-to-know-now-that-fabs-live/
- MetaHuman license: https://www.metahuman.com/en-US/license
- MetaHumans usable in other engines (Digital Production): https://digitalproduction.com/2025/06/05/metahumans-graduate-ready-for-unity-godot-and-the-fab-cash-register/
- Poly Haven license: https://polyhaven.com/license
- ambientCG license: https://ambientcg.com/license
- Creative Commons license types: https://creativecommons.org/share-your-work/cclicenses/
- Smithsonian Open Access (CC0 3D scans): https://www.si.edu/openaccess
