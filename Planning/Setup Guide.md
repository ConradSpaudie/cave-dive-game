# Setup Guide

> **Update Oct 21, 2026: Conrad has a new Mac (48 GB RAM, about 2 TB storage). Skip every external SSD step.**
> - No `CaveSSD`. Install everything on the Mac's own drive with the default locations.
> - Xcode: Conrad's M5 Mac already has **Xcode 27.1** from the App Store, on macOS 27. Keep it. With UE 5.8.3 on Xcode 27, building and running the editor works; only packaging a standalone Mac game fails (known Epic forum bug, no official fix yet). We don't need Mac packages now: Ty's PC makes the Windows builds.
> - Unreal Engine 5.8 installs to the Launcher default, `/Users/Shared/Epic Games/UE_5.8`.
> - The game project lives at `~/Projects/CaveDive` (clone `ConradSpaudie/cave-dive-game-unreal` there).
> - Leave the Unreal cache (DDC) at its default.
> - Do NOT run Windows in an emulator for Unreal: Windows on Apple Silicon has no DirectX 12, and Unreal 5 needs it. The Mac runs Unreal natively. Ty's Windows PC makes the Windows builds.
> Wherever the steps below say `CaveSSD`, use the default location instead.


Goal: go from zero to "a blank UE5 C++ first-person project opens on my Mac and lives in its own GitHub repo." This is Phase 0 of the [[Roadmap]]. Background on why each step exists is in [[Engine, Hardware and Platforms]].

Checked October 2026. The current engine is **Unreal Engine 5.8** (latest hotfix 5.8.3, released September 22, 2026, with 5.8.4 expected). Epic calls 5.8 the last planned major UE5 release (a 5.9 is still possible); Unreal Engine 6 Early Access is targeted for the end of 2027, so 5.8 is the version to build on.

**Total time:** about 1 to 2 evenings of hands-on work, plus several hours of downloads you can leave running.

## Before you start: who has to sign in
These steps need you (or a parent) at the keyboard. Claude Code cannot do them for you.

| Account | Used for | Step |
|---|---|---|
| Mac admin password | Installing apps, Disk Utility, `sudo` commands | 3, 4, 5, 9 |
| **Apple ID** (free, no paid developer program needed) | Downloading the right Xcode from Apple's developer site | 5 |
| **Epic Games account** (free) | Epic Games Launcher, Unreal Engine, Fab assets | 6 |
| **GitHub account** (ConradSpaudie) | Creating the game repo and pushing | 9, 10 |

Never paste a password, token, or 2FA code into Claude Code. Type them only into the official app or website.

## The plan in one picture
- **Internal Mac drive:** macOS, your apps, the Epic Games Launcher, and your vault. Nothing big.
- **External SSD (named `CaveSSD`):** Xcode, Unreal Engine 5.8, the engine cache, and the game project.
- **GitHub:** `cave-dive-game` (this vault, public) and a new **private** repo `cave-dive-game-unreal` (the actual game).

---

## Step 1: Check your Mac (5 min)
1. Click the **Apple menu** (top left) > **About This Mac**.
2. Write down three things in [[Open Questions]] or [[Decision Log]]:
   - **Chip:** for example "Apple M2 Pro".
   - **Memory:** for example "16 GB".
   - **macOS:** the name and number, for example "macOS Tahoe 26.4" or "macOS 27.0".
3. Compare against what Epic lists for UE 5.8 on Mac:

| | Minimum | Recommended |
|---|---|---|
| Chip | Apple Silicon M1 (M2 or newer for Nanite, Virtual Shadow Maps, hardware ray tracing) | M3 |
| Memory | 16 GB | 32 GB or more |
| macOS | Sonoma 14.5 (but Xcode 26 needs Sequoia 15.6, so 15.6 is your real minimum) | Latest Sequoia 15 or Tahoe 26 |

What it means for you:
- **M1:** Unreal works, Lumen lighting works, but Nanite (super-detailed rock meshes) is not supported. Phase 1 still works fine; tell Claude Code your chip so it avoids Nanite.
- **8 GB memory:** below Epic's minimum. It may still open, but expect crashes and slow shader compiles. Tell Claude Code, and keep other apps closed while Unreal runs.
- **macOS 27:** see the warning in Step 5 before installing Xcode.
- **Do not upgrade macOS during this setup.** A macOS update can break the Xcode version Unreal needs.

## Step 2: Free up space on the internal drive safely (20 to 45 min)
You have about 7 GB free (measured on Oct 17; you estimated 9). Unreal itself goes on the SSD, but macOS needs breathing room (at least 20 GB free) for memory swap and caches, and Unreal still writes some files to your home folder. Aim for 20 GB free.

**See what is using space:**
1. Apple menu > **System Settings** > **General** > **Storage**. Wait for the bar to finish calculating.
2. Click the **(i)** next to each category to see the biggest items.
3. Optional, in Terminal (read-only, deletes nothing). It lists the biggest folders in your home folder, smallest to largest:
   ```bash
   du -sh ~/* 2>/dev/null | sort -h
   ```

**Usually safe to clear:**
- **Trash:** right-click the Trash in the Dock > Empty Trash.
- **Downloads folder:** old installers (`.dmg`, `.pkg`, `.zip`) you already installed. Open each file's name and ask "do I still need this?" before trashing it.
- **Apps you installed and no longer use:** open the Applications folder and drag them to Trash. Only apps you installed yourself, never anything Apple shipped with the Mac.
- **Big videos or files** you already have a copy of somewhere else (iCloud, Google Drive, a USB stick). Storage > Documents > "Large Files" shows them.
- **Old iPhone or iPad backups:** Storage > iOS Files. Only delete a backup if that device already backs up to iCloud. If unsure, ask a parent first.
- **Messages attachments:** Storage > Messages > review large attachments (videos you already saved elsewhere).

**Never do these:**
- Never delete anything inside `/System`, `/Library`, or `~/Library` by hand, or anything listed under "System Data" or "macOS".
- Never run `sudo rm` commands you found online, and never let Claude Code run delete commands on your system folders.
- Never install "Mac cleaner" apps. They are unnecessary and some are malware.
- Do not turn on iCloud "Optimize Mac Storage" for Photos without asking whoever manages the family iCloud plan.

If you cannot reach 20 GB yet, that is OK. Get as close as you can, then move on; the SSD carries the heavy load.

## Step 3: Buy and format the external SSD (15 min plus shipping)
This is the one purchase in the project.

**What to buy:**
- **Capacity:** 1 TB minimum. 2 TB if you can afford it (photoreal assets grow fast).
- **Type:** a portable NVMe SSD, **USB 3.2 Gen 2 (10 Gbps)**, USB-C. Not a spinning hard drive and not a thumb drive; both are far too slow.
- **Pick:** Samsung T7 1 TB or Crucial X9 Pro 1 TB, whichever is cheaper that week. SanDisk Extreme is also fine.
- **Price:** SSD prices roughly doubled to tripled in 2026 because AI data centers are buying up flash memory. In October 2026 the Samsung T7 1 TB lists around $230. Expect roughly **$150 to $250 for 1 TB**. Watch for sales; any of the three above is fine.

**About USB speeds:**
- USB 3.2 Gen 2 = 10 Gbps, about 1,000 MB/s. This is the sweet spot and plenty for Unreal.
- "USB 3.2 Gen 2x2" (20 Gbps) drives such as the Samsung T9 run at only 10 Gbps on a Mac, because Macs do not support Gen 2x2. Do not pay extra for it.
- Thunderbolt or USB4 drives (around 3,000 MB/s) are faster but cost much more. Not needed.
- Plug the SSD **straight into a USB-C port on the MacBook** with the cable that came in the box, not through a hub.

**Format it (this erases the drive, so do it only on the new SSD):**
1. Plug in the SSD. If macOS asks "Use this disk for Time Machine?", click **Don't Use**.
2. Open **Disk Utility** (Cmd+Space, type "Disk Utility").
3. Menu bar: **View** > **Show All Devices**.
4. In the sidebar, click the **top-level entry for the SSD** (the one with the brand name, for example "Samsung PSSD T7 Media"). Double-check it is the SSD, not "Apple SSD" or "Macintosh HD".
5. Click **Erase** and set:
   - Name: `CaveSSD`
   - Format: **APFS** (plain APFS, **not** "APFS (Case-sensitive)". Unreal Editor refuses to run on case-sensitive drives.)
   - Scheme: **GUID Partition Map**
6. Click **Erase**, then **Done**.
7. In Finder, create these folders on `CaveSSD`: `Applications`, `Epic Games`, `Projects`, `UnrealCache`.

Do not use exFAT. macOS litters exFAT drives with hidden `._` files that break Unreal's C++ builds.

Habit: always **eject** the SSD (Finder sidebar, eject icon) before unplugging it, and keep Unreal closed when you do. Pulling it out while Unreal is open can corrupt the project.

## Step 4: Install the Xcode command line basics (10 min)
C++ Unreal projects on a Mac **require Xcode**: it provides the Apple compiler (Clang), the Metal shader tools, and the macOS SDK. Blueprint-only projects can skip it, but we are using C++ (see [[Engine, Hardware and Platforms]]).

1. Open Terminal and run:
   ```bash
   xcode-select --install
   ```
2. Click **Install** in the popup. This gives you `git` and basic tools right away. The full Xcode comes next.

## Step 5: Install the correct full Xcode onto the SSD (45 to 90 min, mostly download) [Apple ID]
The newest Xcode in the App Store is **not** the one you want. Unreal needs a specific version.

**Which Xcode:**
- Epic's UE 5.8 Mac requirements: **minimum Xcode 26.0, recommended Xcode 26.1.1**, and "Xcode 26.4 is not compatible."
- Xcode 26.1.1 runs on **macOS Sequoia 15.6 up to macOS Tahoe 26.x**.
- So: if your Mac is on **macOS 15.6 to 26.x**, install **Xcode 26.1.1**. This is the default path.
- **If your Mac is already on macOS 27:** Xcode 26.1.1 is not supported on macOS 27. Forum reports (including Epic staff) say **Xcode 26.6** works for UE 5.8 on macOS 27, and that Xcode 27 (current App Store version) can build the editor but reportedly cannot package a Mac game build until the UE 5.8.4 hotfix. Install Xcode 26.6 instead, and update this note if 5.8.4 is out.

**Install it:**
1. Go to `developer.apple.com/download/all` and **sign in with your Apple ID** (free; accept the developer agreement if asked).
2. Search "Xcode 26.1.1" (or "Xcode 26.6" on macOS 27) and download the `.xip` file (several GB). Save it to `CaveSSD`.
3. Double-click the `.xip` on the SSD to expand it (takes 10 to 20 min). You get `Xcode.app`, roughly 10 to 15 GB.
4. Drag `Xcode.app` into `CaveSSD/Applications`. Delete the `.xip` afterward to save space.
5. In Terminal, tell macOS to use this Xcode, accept the license, and finish setup (enter your Mac password when asked):
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   sudo xcodebuild -runFirstLaunch
   xcodebuild -downloadComponent MetalToolchain
   ```
   The last line downloads the Metal shader compiler, which Xcode 26 no longer includes by default. If it says it is already installed, good.
6. Check it worked:
   ```bash
   xcodebuild -version
   ```
   It should print `Xcode 26.1.1` (or 26.6).

Do not let the App Store "update" Xcode. If an Xcode appears in your main Applications folder from the App Store, leave it alone, but keep `xcode-select` pointed at the SSD copy.

## Step 6: Install the Epic Games Launcher and Unreal Engine 5.8 onto the SSD (15 min hands-on, 1 to 3 hours download) [Epic account]
1. Go to `unrealengine.com/download`, download the Epic Games Launcher for Mac (`.dmg`), open it, and drag the launcher into your main Applications folder. The launcher itself is small.
2. Open it and **sign in with your Epic Games account** (create one if needed; turn on two-factor authentication).
3. Click **Unreal Engine** in the left sidebar > **Library** tab.
4. Next to "ENGINE VERSIONS", click **+**. A new engine slot appears; choose the newest **5.8.x** from its dropdown.
5. Click **Install**. In the install dialog, click **Browse** and choose `CaveSSD/Epic Games`. The engine goes into `/Users/Shared/Epic Games/UE_5.8`.
6. Click **Options** before confirming and trim the install:
   - Keep: **Core Components**, **Templates and Feature Packs** (you need the First Person template), **Starter Content**.
   - Untick: **Editor symbols for debugging** (huge), and the **iOS, tvOS, Android, Linux, visionOS** target platforms. You only need Mac for now.
7. Plan for **about 40 to 70 GB** installed and keep 150 GB free on the SSD overall during install. Leave the Mac plugged in and awake.
8. Launcher settings (gear icon or profile menu > Settings): if you see **Edit Vault Cache Location**, point it at `CaveSSD/Epic Games/VaultCache` so Fab downloads also go to the SSD.

A known launcher bug on Mac: clicking a project stored on an external drive in the launcher sometimes does nothing. If that happens, click **Launch** on the engine itself and open the project from the Unreal Project Browser instead.

**Fab and Megascans (asset licensing, as of 2026):**
- Fab is Epic's asset store. Fab content under the Standard License can be used commercially in your game, with no attribution required, but you **cannot redistribute the raw files** (which matters for public repos, see Step 9).
- Megascans were free for everyone only until the end of 2024. Since 2025 most of the Megascans library is **paid**. Anything you claimed in 2024 stays yours.
- Fab still has a **permanently free** section (including some Megascans) and **limited-time free** products every two weeks. Claim the free cave, rock, and underwater items when they show up; they cost $0 and stay in your library.

## Step 7: Create the blank C++ First Person project on the SSD (30 to 60 min, mostly compiling)
1. In the launcher, click **Launch** on UE 5.8. The first launch compiles shaders and can take 10 to 30 minutes. If macOS asks whether Unreal can access files on a removable volume, click **Allow**.
2. In the Unreal Project Browser: **Games** > **First Person**.
3. Set:
   - **C++** (not Blueprint). This is the key setting.
   - If the template offers variants (such as Arena Shooter or Horror), pick the plain base version.
   - Target Platform: **Desktop**. Quality Preset: **Maximum**.
   - Starter Content: **off** (saves space; you can add it later).
   - Ray Tracing: leave off for now.
   - Project Location: `$HOME/Projects`
   - Project Name: `CaveDive` (no spaces, short)
4. Click **Create**. Unreal generates the C++ code, compiles it with Xcode, and opens the editor. The first compile can take 10 to 20 minutes.
5. Press **Play** (green triangle in the toolbar). You should be able to walk around the template level with first-person arms. Press **Esc** to stop.
6. **Move the engine cache to the SSD.** Unreal's Derived Data Cache (DDC) stores compiled shaders and textures and can grow to tens of GB. By default on a Mac it lives under `~/Library/Application Support/Epic/` on your nearly full internal drive.
   - In the editor: **Unreal Editor menu** (or Edit) > **Editor Preferences**, then type `DDC` and then `Zen` into the search box.
   - Set any "Local DDC Path" / "Global Local DDC Path" / Zen "Data Path" fields you find to `/Volumes/CaveSSD/UnrealCache`.
   - Restart the editor.
   - Check it worked: after a play session, `CaveSSD/UnrealCache` should contain files and grow, and this command (read-only) should show the Epic folder in your Library staying small:
     ```bash
     du -sh ~/Library/Application\ Support/Epic
     ```
   - If you cannot find the setting, ask Claude Code to look it up for UE 5.8 on Mac. Do not delete the old cache folder by hand; ask first.
7. Close the editor.

## Step 8: Install Git LFS (10 min)
Unreal files like `.uasset` and `.umap` are big binary files. Normal git handles them badly; **Git LFS** (Large File Storage) stores them separately.

1. Check if you have Homebrew:
   ```bash
   brew --version
   ```
2. If yes: `brew install git-lfs`. If no: download the macOS (ARM64) installer from `git-lfs.com` and follow its instructions, or install Homebrew from `brew.sh` first (it asks for your Mac password).
3. Turn it on once for your user:
   ```bash
   git lfs install
   ```

**GitHub's free limits:** a free account gets **10 GiB of LFS storage and 10 GiB of LFS bandwidth per month**. Every clone or pull of LFS files (including Tyrus cloning the repo) counts toward bandwidth. If you go over with no payment method on file, GitHub blocks LFS until the next month instead of charging you. Keep a $0 budget in GitHub billing settings so you are never charged. Phase 1 should fit easily; heavy Megascans-style assets later may not, so commit only assets the game actually uses.

## Step 9: Create the private game repo and first commit (20 min) [GitHub sign-in]
Keep the game in its **own** repo, separate from this vault (`cave-dive-game`).

**Make it private.** Fab's license forbids redistributing asset files, so a public repo with Fab assets inside would break the license. Private repos are free on GitHub, and you can invite Tyrus as a collaborator.

1. On github.com (signed in as ConradSpaudie): **New repository** > name `cave-dive-game-unreal` > **Private** > do **not** add a README, .gitignore, or license > **Create repository**.
2. In Terminal, go to the project:
   ```bash
   cd $HOME/Projects/CaveDive
   ```
3. Create the `.gitignore`. Easiest: start Claude Code here and ask: "Create a .gitignore and .gitattributes for this UE 5.8 C++ project on Mac, exactly as described in the Setup Guide." Or create them yourself with these contents.

   `.gitignore`:
   ```gitignore
   # Unreal generated folders (rebuilt automatically)
   Binaries/
   Intermediate/
   Saved/
   DerivedDataCache/
   Build/
   Plugins/*/Binaries/
   Plugins/*/Intermediate/

   # IDE and project files (regenerated by Unreal)
   *.xcworkspace
   *.xcodeproj
   *.code-workspace
   *.sln
   .vs/
   .vscode/
   .idea/

   # macOS junk
   .DS_Store
   ._*

   # Claude Code local settings (keep CLAUDE.md, ignore personal settings)
   .claude/settings.local.json
   ```
   This keeps the important parts tracked: `Config/`, `Content/`, `Source/`, `CaveDive.uproject`, and `CLAUDE.md`.

   `.gitattributes`:
   ```text
   # Unreal assets and maps
   *.uasset filter=lfs diff=lfs merge=lfs -text lockable
   *.umap filter=lfs diff=lfs merge=lfs -text lockable

   # Source art and audio
   *.fbx filter=lfs diff=lfs merge=lfs -text
   *.obj filter=lfs diff=lfs merge=lfs -text
   *.blend filter=lfs diff=lfs merge=lfs -text
   *.png filter=lfs diff=lfs merge=lfs -text
   *.jpg filter=lfs diff=lfs merge=lfs -text
   *.tga filter=lfs diff=lfs merge=lfs -text
   *.exr filter=lfs diff=lfs merge=lfs -text
   *.hdr filter=lfs diff=lfs merge=lfs -text
   *.psd filter=lfs diff=lfs merge=lfs -text
   *.wav filter=lfs diff=lfs merge=lfs -text
   *.mp3 filter=lfs diff=lfs merge=lfs -text
   *.ogg filter=lfs diff=lfs merge=lfs -text
   *.mp4 filter=lfs diff=lfs merge=lfs -text

   # Code and config stay as normal text
   *.cpp text
   *.h text
   *.cs text
   *.ini text
   *.uproject text
   ```
   `lockable` lets you and Tyrus "lock" a map or asset while editing so you never both change the same binary file (they cannot be merged).
4. Initialize and push. The `.gitattributes` file must be committed **before** the assets so LFS catches them:
   ```bash
   git init -b main
   git add .gitattributes .gitignore
   git commit -m "Add gitignore and LFS rules"
   git add .
   git status
   ```
   Look at `git status`. You should **not** see `Binaries/`, `Intermediate/`, `Saved/`, or `DerivedDataCache/`. If you do, stop and fix `.gitignore` first.
   ```bash
   git commit -m "Blank UE 5.8 C++ First Person project"
   git remote add origin https://github.com/ConradSpaudie/cave-dive-game-unreal.git
   git push -u origin main
   ```
   The first push asks you to sign in to GitHub (browser popup or `gh auth login` if you use the GitHub CLI). Never paste a token into Claude Code.
5. Check it: `git lfs ls-files` should list `.uasset` and `.umap` files, and on github.com those files should show "Stored with Git LFS".
6. Invite Tyrus: repo **Settings** > **Collaborators** > add his GitHub username.

## Step 10: Point Claude Code at both the project and the vault (10 min)
Claude Code works best when started inside the game project, with the vault added as a second folder it can read.

1. Find your vault's path on the Mac. In Terminal, type `cd ` (with a space), drag the vault folder from Finder into the Terminal window, and press Enter. Then run `pwd` and copy the path it prints, for example `/Users/conrad/Documents/cave-dive-game`.
2. Start Claude Code in the project with the vault added:
   ```bash
   cd $HOME/Projects/CaveDive
   claude --add-dir "/Users/conrad/Documents/cave-dive-game"
   ```
   (Use your real vault path.) If Claude Code is already running, type `/add-dir` and the vault path instead.
3. Run the first prompt in [[Phase 1 Prompts]]. It creates a `CLAUDE.md` in the project that summarizes the game and tells Claude Code where the vault is, so every future session starts with context.
4. Optional shortcut: add this line to `~/.zshrc` so typing `cavedive` does steps 2 and 3 for you:
   ```bash
   alias cavedive='cd $HOME/Projects/CaveDive && claude --add-dir "/Users/conrad/Documents/cave-dive-game"'
   ```
5. Keep the two repos separate: commit design changes in the vault repo, code and assets in `cave-dive-game-unreal`.

**Done when:** you can unplug and replug the SSD, launch UE 5.8, open `CaveDive`, press Play, walk around, and see the project on GitHub as a private repo with LFS files.

---

## About Windows builds
A Mac **cannot** package the Windows version of the game. Unreal only builds Windows packages on a Windows PC. You do not need one for Phase 1 (the editor on your Mac is enough to build and record the prototype). Before the Phase 5 Steam playtest you will need access to a Windows PC with a decent GPU for building and testing. See [[Engine, Hardware and Platforms]] and add a line to [[Open Questions]] about whose PC that will be.

## Troubleshooting quick list
- **"Unreal can only run on a case-insensitive file system":** the SSD was formatted as APFS (Case-sensitive). Back up anything on it and reformat as plain APFS.
- **Project will not compile, mentions Xcode or SDK:** run `xcodebuild -version` and `xcode-select -p`. They must point to the SSD Xcode 26.1.1 (or 26.6).
- **"Missing Metal Toolchain":** run `xcodebuild -downloadComponent MetalToolchain`.
- **Launcher does nothing when clicking the project:** launch the engine and open the project from the Project Browser.
- **Internal drive filling up again:** check `du -sh ~/Library/Application\ Support/Epic` and recheck the DDC setting in Step 7.

## Sources
- https://dev.epicgames.com/documentation/en-us/unreal-engine/macos-development-requirements-for-unreal-engine
- https://developer.apple.com/xcode/system-requirements
- https://wnhub.io/news/engines/item-51157
- https://www.unrealengine.com/news/state-of-unreal-2026-top-news-from-the-show
- https://forums.unrealengine.com/t/5-8-3-hotfix-released/2833315
- https://forums.unrealengine.com/t/ue5-8-unable-to-build-game-on-macos-27/2746676
- https://forums.unrealengine.com/t/ue-5-8-3-build-macos-27-every-mac-game-target-build-fails-at-failed-to-finalize-the-app-with-xcode-because-uba-starts-xcodebuild-with-stdin-closed/2840411
- https://forums.unrealengine.com/t/mac-apple-chip-external-drive-engine-source-build-tips/2714895
- https://forums.unrealengine.com/t/macos-epic-games-launcher-cant-launch-projects/2751587
- https://forums.unrealengine.com/t/storage-required-to-install-unreal-engine-5-8-1/2740177
- https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine
- https://developer.apple.com/forums/thread/805547
- https://docs.github.com/en/billing/concepts/product-billing/git-lfs
- https://uhiyama-lab.com/en/notes/ue/git-lfs-project-management/
- https://github.com/MOZGIII/ue5-gitignore
- https://80.lv/articles/megascans-no-longer-free-after-2024/
- https://www.unrealengine.com/fabfreecontent
- https://licenseorg.com/guide/3d-assets/quixel-megascans
- https://www.listofdisks.com/products/samsung-t7-1tb-mu-pc1t0t-am-b7f3c2
- https://wccftech.com/samsung-and-kingston-hike-ssd-prices-by-10-again-pushing-1tb-drives-past-330-as-nand-shortage-deepens/
- https://www.claudelog.com/faqs/--add-dir/
