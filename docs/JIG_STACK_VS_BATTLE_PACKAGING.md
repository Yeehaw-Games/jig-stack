# Jig Stack vs Battle JigStack: Two Separate Games

Battle JigStack is a **separate game** from Jig Stack, not just another mode. This doc explains how the platform tells them apart and how to package each.

---

## How the platform differentiates the two games

Differentiation happens **where you upload**, not inside the zip:

1. **Two game listings in Hytopia Create**  
   Create two games in [Create](https://hytopia.com/create/):
   - **Jig Stack** (solo / arcade)
   - **Battle JigStack** (head-to-head battle)

2. **Each game has its own Game ID and Hosting tab**  
   When you upload a zip, you’re in one of those game’s **Hosting** tabs. The zip is then associated with **that** game. At runtime, Hytopia uses that game’s **Game ID** (and credentials); the zip file itself does not store the game identity.

3. **Updates**  
   - To update **Jig Stack**: open **Jig Stack** in Create → **Hosting** → Upload your Jig Stack zip.  
   - To update **Battle JigStack**: open **Battle JigStack** in Create → **Hosting** → Upload your Battle JigStack zip.

So: **which game you upload to** is what differentiates them. Use the correct zip for each game.

---

## How to get two different zips

Right now this repo builds **one** package (solo + battle). To ship Jig Stack and Battle JigStack as two separate games you need **two different builds** (and thus two zips).

### Option A: Two project folders (recommended for “totally separate” games)

- **Jig Stack**: A project that only has solo/arcade (no battle code, or battle disabled).  
  - e.g. this repo with battle removed or gated off.  
  - Run `hytopia package` there → e.g. `Tetris.zip` or `Jig Stack.zip` (if the folder is named `Jig Stack`).  
  - Upload that zip to the **Jig Stack** game in Create.

- **Battle JigStack**: A separate project that only has battle (e.g. copy of the repo with solo/arcade removed and battle-only entry).  
  - Run `hytopia package` there → e.g. `Battle-JigStack.zip`.  
  - Upload that zip to the **Battle JigStack** game in Create.

The zip filename comes from the **folder name** (`path.basename(projectRoot)`). So a folder named `Jig Stack` produces `Jig Stack.zip`; a folder named `Battle-JigStack` produces `Battle-JigStack.zip`.

### Option B: One repo, runtime variant (this repo)

This repo supports a **runtime** variant via `GAME_VARIANT`:

- **`GAME_VARIANT=jigstack`** (or unset): **Jig Stack only** — solo/arcade, no battle. No `initBattleBooths`, no `/battle` commands, no battle HUD. Default.
- **`GAME_VARIANT=battle`**: Battle JigStack — battle mode enabled.

So you can use **one zip** for both games: set `GAME_VARIANT` in the Hytopia Create hosting env for each game (e.g. leave unset or `jigstack` for Jig Stack, set `battle` for Battle JigStack). When you work on Jig Stack, leave `GAME_VARIANT` unset (or set `jigstack`) in your local `.env`, run `npm run package`, and upload the zip to the **Jig Stack** game in Create. The same zip can be uploaded to the **Battle JigStack** game with `GAME_VARIANT=battle` set there.

**Zip filename:** `hytopia package` names the zip after the **project folder** (e.g. `Tetris.zip` if the folder is `Tetris`). To get `Jig Stack.zip`, either run package from a folder named `Jig Stack` or rename the zip after packaging.

---

## When you're ready to package Jig Stack only

1. **Ensure Jig Stack variant** — In this repo, leave `GAME_VARIANT` unset in `.env` (or set `GAME_VARIANT=jigstack`). That keeps battle disabled so the build is Jig Stack only.
2. **Build and package** — From the project root run: `npm run package` (runs `hytopia package`).
3. **Optional: rename zip** — The zip is named from the folder (e.g. `Tetris.zip`). Rename to `Jig Stack.zip` if you want that filename.
4. **Upload** — In [Hytopia Create](https://hytopia.com/create/), open the **Jig Stack** game → **Hosting** tab → **Upload Game** and select the zip.

You can run these steps anytime after working on Jig Stack tasks in this repo.

---

## Summary

| Question | Answer |
|----------|--------|
| How does Hytopia tell Jig Stack and Battle JigStack apart? | By **which game** in Create you upload to (each game has its own Game ID and Hosting). |
| How do my updates go to the right game? | Upload the Jig Stack zip to Jig Stack’s Hosting; upload the Battle JigStack zip to Battle JigStack’s Hosting. |
| How do I get a Jig Stack–only zip from this repo? | Use a **Jig Stack** build variant (battle disabled) and run `hytopia package` (Option B). For Battle JigStack, use a separate project and package there (Option A). |
