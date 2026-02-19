# Tetris (HYTOPIA SDK)

Server-authoritative, voxel-rendered Tetris with a 10×20 board. Solo-first, mobile-friendly HUD, tick-based gravity.

## How to run

1. **Install dependencies**
   ```bash
   npm install
   ```
   or
   ```bash
   bun install
   ```

2. **Start the game server**
   ```bash
   npm run dev
   ```
   or
   ```bash
   bunx hytopia dev
   ```

3. Connect with the HYTOPIA client to the running server and join the world. Load the Tetris UI; the first player to join is the controller.

## Manual test plan

- [ ] **Start** – Server starts; first player joins and sees HUD (Score 0, Level 1, Lines 0, Next piece, RUNNING).
- [ ] **Board** – 10×20 grid of blocks is visible in the world at the board origin.
- [ ] **First piece** – A piece appears at the top and falls after the gravity interval.
- [ ] **Left/Right** – Buttons or Arrow Left/Right move the piece; it does not leave the board or overlap locked cells.
- [ ] **Rotate** – Rotate button or Arrow Up rotates the piece (with wall kick near walls).
- [ ] **Soft drop** – Hold Soft Drop or Arrow Down; piece falls faster. Release to resume normal gravity.
- [ ] **Hard drop** – Hard Drop or Space locks the piece at the bottom immediately.
- [ ] **Lock** – When the piece cannot move down, it locks; next piece spawns; if spawn is blocked, game over.
- [ ] **Line clear** – Filling a full row removes it and shifts rows down; score and lines update (1=100, 2=300, 3=500, 4=800).
- [ ] **Level** – Every 10 lines, level increases and gravity speeds up.
- [ ] **Reset** – Reset button or `/reset` starts a new game; board clears, score/lines/level reset.
- [ ] **Mobile** – Large touch buttons work for Left, Right, Rotate, Soft Drop, Hard Drop, Reset.
- [ ] **Keyboard** – WASD (A left, D right, W rotate, S soft drop) or arrow keys, Space (hard drop), R (reset) work on desktop.

## Debug commands

| Command | Description |
|--------|-------------|
| `/reset` | Reset the current run immediately (same as Reset button). |
| `/speed <ms>` | Override gravity interval in milliseconds (e.g. ` /speed 200` for fast fall). |
| `/fillrow <y>` | Fill row `y` (0–19) with blocks for testing line clears. |
| `/spawn <I\|O\|T\|S\|Z\|J\|L>` | Set the next piece type (e.g. ` /spawn I`). |

## Known limitations and next enhancements

- **Single controller** – Only the first player to join controls the game; others can watch. No per-player instances yet.
- **No hold** – Hold piece for later is not implemented.
- **No ghost** – Ghost (preview of drop position) is not shown.
- **No lock delay** – Piece locks as soon as it cannot move down (no short delay to slide).
- **Block textures** – Uses `blocks/cyan.png` etc.; add or replace under `assets/blocks/` if your project has custom textures.
- **Next steps** – Hold piece, ghost piece, lock delay, optional seed (`/seed`), multiplayer garbage.

## Leaderboard Setup

The game includes a **global persistent leaderboard** shown in a HUD panel on the right. It persists across server restarts and is stored in Supabase Postgres.

1. **Environment variables** (server only; do not expose the service role key to the client):
   - `NEXT_PUBLIC_SUPABASE_URL` – your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` – server-only key for backend writes

2. **Database**: Run the provided SQL in the Supabase SQL Editor:
   - Open your Supabase project → SQL Editor → New query
   - Paste and run the contents of `supabase/leaderboard.sql`

3. **Install dependencies**: `npm install` (adds `@supabase/supabase-js`).

4. Restart the server; the leaderboard panel will show **Online** when Supabase is reachable, or **Offline** if the DB is unavailable (gameplay continues). Scores are submitted only on game over (server-authoritative) and only when the run beats the player’s previous best.
# jig-stack
