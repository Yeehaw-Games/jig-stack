# Next Piece HUD — System Trace & Fix (JigStack)

**Audit mode:** Deep trace, no guessing.  
**Objective:** Identify why Next Piece HUD is not rendering/updating correctly in JigStack and fix deterministically.

---

## PHASE 1 — SYSTEM TRACE

### 1. Piece Lifecycle (exact file and function)

- **Where pieces are generated:** `src/server/state/WorldState.ts` — `randomPieceType(rng)` (1..7), used in `createInitialState` and `spawnNextPiece`.
- **Where next piece is stored:** `state.nextPiece` (`TetrisState` in `src/server/state/types.ts`). Single field; no separate queue.
- **Queue:** There is **no** `pieceQueue` or `previewQueue`. The game uses a **single next piece** (not 7-bag). `nextPiece` is **pre-generated** (not lazy).
- **Where “spawn” happens:** `src/server/state/WorldState.ts` — `spawnNextPiece(state, rng)`: uses `state.nextPiece` as the piece to spawn, creates new `activePiece`, then generates a **new** `state.nextPiece` with `createNextPiece(nextType)`.
- **Where currentPiece is assigned:** Same function — `state.activePiece = active` (the piece that was `state.nextPiece`).
- **Where nextPiece is updated:** Same function — `state.nextPiece = createNextPiece(nextType)` after spawning.
- **Initial state:** `createInitialState()` in `WorldState.ts` creates both `activePiece` and `nextPiece`; both exist before first tick.

**Confirmed:**

- `nextPiece` exists (single `PieceState | null`).
- No `pieceQueue` or `previewQueue`.
- `nextPiece` is pre-generated and updated in `spawnNextPiece` and in `createInitialState` / `resetState`.

### 2. Game Data → HUD Data Bridge

- **Send path:** `index.ts` → `sendHudToPlayer(player, ...)` every tick (after `runTick`), and on JOINED_WORLD, mute toggles, and start.
- **Build payload:** `HudService.buildHudPayload(state, gameStarted, leaderboard)` → `instance.getHudPayload(leaderboard)` in `GameInstance.ts`.
- **Send:** `player.ui.sendData(payload)` in `HudService.sendHudToPlayer`. Single payload; no separate `sendData` for next piece.
- **Payload schema sent:** `nextPiece?: NextPiecePayload | null` with `{ type: string (I|O|T|S|Z|J|L), matrix: number[][] }`. Key is **camelCase** `nextPiece`.
- **Client expectation:** `assets/ui/hud.js` reads `data.nextPiece` or `data.next_piece` (snake_case fallback). Expects `{ type, matrix }`.
- **Mismatch risk:** If the host (e.g. JigStack) wraps the payload as `{ data: payload }` or `{ payload: payload }`, the client must unwrap; only `data.data` was unwrapped before this fix. Adding `data.payload` unwrap for compatibility.

### 3. HUD Rendering Logic

- **Next piece container:** `#next-preview-container` (HTML), `#next-preview-grid` (4×4 grid).
- **Render functions:**  
  - `NextPreview.update(nextPiece)` in `assets/ui/components/NextPreview.js` (clears grid, fills from `nextPiece.matrix` + type).  
  - `renderNextPieceGrid(payload)` in `assets/ui/hud.js` (direct DOM fallback; clears `innerHTML`, creates 16 cells, adds `.filled` + type class).
- **Update path:** `updateUI(data)` in `hud.js` → `nextPiecePayload = data.nextPiece ?? data.next_piece` → if `!== undefined`, `NextPreview.ensureGridInited()`, `NextPreview.update(nextPiecePayload)`, then `renderNextPieceGrid(nextPiecePayload)`.
- **When called:** On every `hytopia.onData(updateUI)` callback (each server `sendData`).
- **Guards:** `nextPiecePayload !== undefined` so partial payloads (e.g. leaderboard-only) do not clear the preview. Null payload (`nextPiece: null`) is passed through to clear preview (e.g. game over).
- **Panel visibility:** `#next-preview-container` is hidden only when `serverStatus === 'NO_PLOT' || 'ASSIGNING_PLOT'`.

**Possible failure modes:**

- First HUD sent before client has registered `onData` or before DOM ready → first payload lost; preview appears only after next tick(s).
- Payload wrapped as `data.payload` in some runtimes → client never sees `data.nextPiece` → no update.
- `state.nextPiece` null while `gameStatus === 'RUNNING'` (invariant violation) → server sends `nextPiece: null` → client clears preview incorrectly.

---

## PHASE 2 — FAILURE MODE ANALYSIS

- **A. Not initialized before first spawn:** `createInitialState()` sets `nextPiece`; no spawn before Start. After Start, first spawn uses that `nextPiece`. So next piece exists before first spawn.
- **B. Queue depletion:** No queue; single `nextPiece`. `spawnNextPiece` always assigns a new `nextPiece` after spawn. No depletion.
- **C. Double-shift:** N/A (no queue). Single assignment in `spawnNextPiece` is correct.
- **D. Async ordering:** HUD is sent **after** `runTick` (which runs `instance.tick()` and thus `lockPiece` → `spawnNextPiece`). So payload reflects post-lock state. No ordering bug.
- **E. Stale reference:** `createNextPiece(type)` returns a new object each time. No shared reference with `activePiece`.

**Conclusion:** Logic is correct. Likely causes for “not rendering/updating” in JigStack: (1) payload wrapping (`data.payload`) not unwrapped, (2) first payload before UI/onData ready, (3) rare invariant break (RUNNING with null `nextPiece`). Fixes: unwrap `data.payload`, server-side guard + fallback when RUNNING and `nextPiece` null, and optional debug logging.

---

## PHASE 3 — ARCHITECTURE (CONFIRMED)

- **Model:** `nextPiece` is the single “next” piece; HUD never computes it; HUD only renders what it is given. Matches required pattern (conceptually `nextPiece = queue[0]` with queue length 1).
- **No refactor needed** for queue logic. Only hardening and compatibility (unwrap, guard, debug).

---

## PHASE 4 — HARDENING IMPLEMENTED

- **Server:** In `buildHudPayload`, if `state.gameStatus === 'RUNNING'` and `!state.nextPiece`, log error and set `payload.nextPiece` to a fallback (type `'T'`, default matrix) so client never receives null next piece while RUNNING.
- **Server:** `DEBUG_NEXT_PIECE` (env or constant): when true, log queue/spawn/next/payload (conceptually: nextPiece type, payload.nextPiece).
- **Client:** Unwrap `data.payload` when present (in addition to `data.data`).
- **Client:** When `DEBUG_NEXT_PIECE` is true, log received `nextPiecePayload` and when updating.
- **Client:** Runtime guard: if we receive `nextPiece === null` while status suggests RUNNING, log (no state mutation).

---

## PHASE 5 — VISUAL VALIDATION

- Preview uses DOM (4×4 grid + CSS classes), not voxel/canvas. No camera or 3D preview.
- `renderNextPieceGrid` clears `grid.innerHTML` before re-render → no ghost blocks.
- Type classes (e.g. `.block-t`) applied per cell; scaling via CSS (`.next-preview-grid`). No Z-fighting.

---

## PHASE 6 — DELIVERABLES

### Root cause summary

The piece lifecycle and server→client payload are correct: `nextPiece` is set in `createInitialState` and updated in `spawnNextPiece`; HUD is sent every tick with `nextPiece` in the payload; the client updates the DOM when `nextPiece` is present. The most likely causes for “Next Piece HUD not rendering or updating” in JigStack are: **(1)** the host wrapping the payload as `{ payload: ... }` so the client never saw `data.nextPiece`, **(2)** the first HUD payload arriving before the client had registered `onData` or before the DOM was ready (first paint delayed or lost), and **(3)** a rare invariant break where `state.nextPiece` is null while `gameStatus === 'RUNNING'`, causing the server to send `nextPiece: null` and the client to clear the preview. No queue or double-shift bug was found; architecture matches the required model (nextPiece is the single next piece; HUD only renders what it is given).

### Code changes (summary)

- **HudService.ts:** Guard when `gameStatus === 'RUNNING'` and `!state.nextPiece`: log error and set `payload.nextPiece` to fallback `{ type: 'T', matrix }` so the client never receives null next piece while RUNNING. Added `DEBUG_NEXT_PIECE` (env) to log payload.
- **hud.js:** Unwrap `data.payload` when present (in addition to `data.data`) so runtimes that send `{ payload: hudPayload }` work. Added `window.DEBUG_NEXT_PIECE` (checked at log time) and runtime guard: log error when `nextPiece === null` but status is RUNNING.

### Suggested unit test

- **Server:** Call `buildHudPayload(state, true)` with `state.gameStatus === 'RUNNING'`, `state.nextPiece === null`. Assert `payload.nextPiece` is non-null and `payload.nextPiece.type === 'T'`.

### Runtime test steps (after fix)

1. Start game → Next piece visible in preview.
2. Lock piece → Preview updates immediately to the next piece.
3. Play ~50 pieces → No desync between spawned piece and last-shown preview.
4. Game over → Preview clears or shows last next piece; no crash.
5. Restart → Preview resets correctly for the new game.
6. Rapid piece placement → No flicker or stale preview.

### Architectural debt

- No piece queue (single next only). A 7-bag or “next 3” would require a queue on the server and schema/UI changes.
- First-payload timing: if the first HUD is sent before the client’s `onData` is registered, the first frame of the preview can be missing until the next tick; consider a “UI ready” handshake if needed.

### Test script to run (from brief)

After fix, confirm:

- Start game → Next piece visible  
- Lock piece → Preview updates instantly  
- Play 50 pieces → No desync  
- Game over → Preview stable  
- Restart → Preview resets correctly  
- Rapid piece placement → No flicker  

**Debug:** Server: `DEBUG_NEXT_PIECE=1` (env). Client: `window.DEBUG_NEXT_PIECE = true` in console before or during play.

### If next piece still doesn't show

1. **Browser console** – Open DevTools → Console. On load you should see:
   - `[HUD] payload #1 keys: ...` (list of keys in the first payload)
   - `[HUD] nextPiece in data: ...` (either the object or `MISSING`)
   If `nextPiece` is `MISSING` and the keys list does not contain `nextPiece`, the server is not sending it (or the host is stripping it). If you see `[HudService] No instance for player ...` in the **server** log, that player has no game instance so they get idle payload with `nextPiece: null`.

2. **On-screen diagnostic** – In the browser console run: `window.DEBUG_HUD_PAYLOAD = true`. A green box at the bottom will show:
   - **Keys:** payload keys received
   - **nextPiece:** MISSING / null / type=X
   - **grid exists:** whether `#next-preview-grid` was found
   Use this to confirm whether the client receives `nextPiece` and whether the DOM element exists. After fixing, set `window.DEBUG_HUD_PAYLOAD = false` or refresh to hide it.
