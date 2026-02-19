# 🧪 QA REPORT – JIGSTACK

**Scope:** Full codebase audit + gameplay simulation + design improvements + edge cases + architecture.  
**Codebase:** `index.ts`, server state, GameLoop, InputSystem, RenderSystem (Instance), HudService, TetrisSystem, WorldState, CommandService, UI/HUD, config, schema.  
**Audit date:** 2025-02-19.

---

## 🚨 Critical Issues

1. **Input queue unbounded — client can DoS server memory**  
   **File:** `src/server/systems/InputSystem.ts`  
   **Detail:** `pushAction()` appends to `queue` with no cap. A client (or bot) can send hundreds of actions per second; each tick only consumes one. Under sustained spam the queue grows without limit per player, leading to memory growth and possible OOM.  
   **Fix:** Cap `queue.length` (e.g. max 32–64); drop oldest or newest when full and optionally log.

2. **ScoreBar.js is empty — HUD fallback can misbehave**  
   **File:** `assets/ui/components/ScoreBar.js`  
   **Detail:** `hud.js` checks `window.TetrisHudComponents.ScoreBar` and calls `ScoreBar.update()` / `ScoreBar.applyAnimationClasses()`. The file is empty, so `ScoreBar` is undefined and the code falls back to direct DOM updates (lines 239–248). Score pop / level-up flash / lines-glow animations never run when the component is missing; behavior is correct but all polish animations are effectively disabled.  
   **Fix:** Implement `ScoreBar.js` (update + applyAnimationClasses) or remove the component reference and rely on the fallback explicitly.

3. **Legacy RenderSystem.ts still uses module-level cache — dead code / confusion**  
   **File:** `src/server/systems/RenderSystem.ts`  
   **Detail:** Game loop uses **only** `RenderSystemInstance` (per-plot cache, `renderInstance()`). The older `RenderSystem.render(state, world)` with global `lastRendered` / `lastRenderedWall` and `getWallLayout()` is never called in the current flow. Reactor Arcade builds the shell once; walls are not procedural per instance. Having two render systems risks future bugs if someone calls `RenderSystem.render` or `clearRenderCache()` in a single-instance context.  
   **Fix:** Remove or clearly deprecate `RenderSystem.ts` and `clearRenderCache` usage from index (if any), or document that it is legacy/single-instance only.

4. **No lock delay — piece locks immediately on land**  
   **Files:** `src/server/systems/TetrisSystem.ts`, `src/server/config/tetris.ts`  
   **Detail:** README and design both note “no lock delay.” As soon as the piece cannot move down, `tickGravity` calls `lockPiece()`. There is no timer to allow a short slide (e.g. 500 ms) after landing. This reduces control and feels harsh compared to modern Tetris.  
   **Fix:** Add `LOCK_DELAY_MS`, a lock-down timer that resets on move/rotate, and only call `lockPiece` when the timer expires while piece cannot move down.

5. **`usePowerUp` sent from client but never handled — dead action**  
   **Files:** `assets/ui/hud.js` (keydown `e`/`E`), `src/server/game/GameInstance.ts` (`handleAction`)  
   **Detail:** Client sends `usePowerUp` on E key; server pushes it to the input queue and consumes it, but `handleAction()` only handles `left`, `right`, `rotate`, `hardDrop`, `reset`, `start`. Other actions (including `usePowerUp`) are ignored after the `gameStatus` / `lineClearFxRows` checks. No crash, but key does nothing and suggests a missing feature.  
   **Fix:** Either remove the E key binding and `usePowerUp` from the client or add a no-op handler and document “reserved for future power-ups.”

---

## ⚠️ Medium Issues

6. **Tick uses fixed delta with clamp — under load, game can feel like it freezes**  
   **File:** `src/server/game/GameInstance.ts` (lines 228–230)  
   **Detail:** `effectiveDeltaMs = Math.min(500, Math.max(50, deltaMs))` and gravity use this. The main loop passes `tickIntervalMs` (50 ms at 20 TPS). If the event loop is starved, `deltaMs` is still the interval, not wall-clock. So real time can advance while the game advances one tick — perceived freeze.  
   **Fix:** Pass wall-clock delta from index (`Date.now() - lastTickTime`), clamp to e.g. [50, 500], and use that for gravity so catch-up happens after stall.

7. **Gravity accumulator seeded with full interval when 0 — first drop can be delayed**  
   **File:** `src/server/game/GameInstance.ts` (lines 229–231)  
   **Detail:** When `gravityAccumulatorMs === 0`, it’s set to `state.gravityIntervalMs` or 50 for soft drop. So the first gravity step is delayed by a full interval instead of starting from 0. Minor feel issue.  
   **Fix:** Consider seeding with 0 so the first gravity step can occur on the next tick (or use a fractional seed).

8. **HUD sends two messages when line clear + piece lock — possible ordering/race**  
   **File:** `src/server/services/HudService.ts` (lines 84–97)  
   **Detail:** `sendHudToPlayer` sends the main payload, then if `pendingLineClearBurst` sends a second `sendData({ type: 'lineClearBurst', ... })`, then if `pendingPieceLock` sends a third `sendData({ type: 'pieceLock' })`. Client processes in order, but if the transport reorders or merges, burst and lock could be applied in wrong order (e.g. lock sound before line clear sound).  
   **Fix:** Prefer a single structured payload (e.g. `{ ...hud, lineClearBurst?, pieceLock?: true }`) so ordering is guaranteed, or document that client must process in receive order.

9. **Reset during line-clear flash clears state immediately — no flash cleanup**  
   **File:** `src/server/game/GameInstance.ts` (`handleAction`), `src/server/state/WorldState.ts` (`resetState`)  
   **Detail:** When `action === 'reset'`, `resetState(this.state)` runs and clears `lineClearFxRows` / `lineClearFxUntilMs`. The line-clear flash and any pending `finalizeLineClear` are abandoned. Visually and logically consistent, but particle emitters in `_applyLineClearBloomFx` may already be spawned; they are one-shot and cleaned by timeout, so no leak. Minor: client might still show a brief burst if it already received `lineClearBurst`.  
   **Fix:** Optional: when resetting during line-clear, clear `pendingLineClearBurst` and `pendingPieceLock` so the next HUD send doesn’t send stale burst/lock.

10. **Leaderboard submit only when run beats previous best — not documented in UI**  
    **File:** `src/server/services/LeaderboardService.ts` (submitScore logic), README  
    **Detail:** Score is submitted on game over only if it beats the player’s previous best. The HUD shows “Score” and “Best score” on game over but doesn’t explain that submission is conditional. Players may expect every run to appear.  
    **Fix:** Document in UI or game-over card (“Submitted when you beat your best”) or submit every run and show “Best” vs “This run.”

11. **`/fillrow` and `/spawn` available in production — cheat/exploit**  
    **File:** `src/server/services/CommandService.ts`  
    **Detail:** Any player can type `/fillrow <y>` and `/spawn I` etc. to manipulate their board and next piece. Fine for dev; in production this breaks fairness and leaderboard integrity.  
    **Fix:** Gate behind a role/env flag (e.g. `ALLOW_CHEAT_COMMANDS`) or disable in production build.

12. **`muteNonSoundtrackAudio()` runs twice per tick**  
    **File:** `index.ts` (tick function)  
    **Detail:** `muteNonSoundtrackAudio()` is called at the start of `tick()` and again after `runTick` and HUD send. Redundant; the second call is unnecessary unless other code registers audio during the tick.  
    **Fix:** Call once after all tick work (or once at start) to avoid redundant iteration over `getAllAudios()`.

---

## 🟢 Minor Polish Items

13. **README still says “single controller” and “only first player”**  
    **File:** `README.md`  
    **Detail:** Code is multi-instance (per-player plot and GameInstance). README is outdated.  
    **Fix:** Update to “each player gets their own plot and board.”

14. **Next piece preview uses rotation 0 for “next”**  
    **File:** `src/server/services/HudService.ts`, `getPieceMatrix(state.nextPiece.type, state.nextPiece.rotation)`  
    **Detail:** `createNextPiece(type)` sets rotation 0; HUD sends that. Preview is correct (next piece always shown in default rotation). No bug; just confirmation.

15. **Game over overlay “Best score” source unclear on client**  
    **File:** `assets/ui/index.html` (`id="game-over-best"`), `assets/ui/hud.js`  
    **Detail:** `game-over-score` and `game-over-lines` are set from payload; `game-over-best` is not updated in the provided `updateUI`. If leaderboard is used for “best,” it needs to be wired (e.g. from leaderboard self-row or a dedicated `bestScore` in HUD).  
    **Fix:** Set `game-over-best` from leaderboard self score or add `bestScore` to HudPayload.

16. **Soft drop applies one row per tick in two places**  
    **File:** `src/server/game/GameInstance.ts`  
    **Detail:** Soft drop is applied in `handleAction` (only when `action` is consumed) and again in `tick()` (lines 222–225) when `state.softDropActive`. So when soft drop is held, every tick moves the piece down once in `tick()`. `handleAction` doesn’t apply soft drop by itself for the consumed action. Logic is correct; duplication of “soft drop active” handling is minimal.

17. **Wall kick offsets are horizontal and one up only — no I-piece specific table**  
    **File:** `src/server/config/tetris.ts` (`WALL_KICK_OFFSETS`)  
    **Detail:** Standard SRS uses different kick tables for I vs other pieces. This config uses one table for all. Rotation near walls may fail in edge cases for I.  
    **Fix:** Optional: add I-piece wall kick table and select by piece type in `tryRotate`.

18. **No back-to-back (B2B) bonus for consecutive Tetris (4-line) clears**  
    **File:** `src/server/systems/TetrisSystem.ts` (`applyLineClearScoring`)  
    **Detail:** Scoring uses `SCORE_PER_LINES[1..4]` and combo window multiplier. There is no extra multiplier for clearing 4 lines when the previous clear was also 4 lines.  
    **Fix:** Add `lastWasTetris` (or equivalent) and apply B2B multiplier when `fullRowsCount === 4 && lastWasTetris`.

---

## 🎮 Gameplay Improvements

| Improvement | Why | Complexity | Risk |
|-------------|-----|------------|------|
| Lock delay (500 ms, reset on move/rotate) | Modern feel; allows last-moment slide | Med | Low |
| Hold piece | Strategic depth, standard expectation | Med | Low |
| Ghost piece (client-side from server state) | Easier placement, less frustration | Low | Low |
| Back-to-back bonus for Tetris | Rewards risk, competitive standard | Low | Low |
| I-piece wall kick table | Fewer “rotation failed” edge cases | Low | Low |
| Level-up visual (e.g. brief screen tint) | Clear feedback for level change | Low | Low |
| Perfect clear bonus | Extra reward for full board clear | Med | Low |
| Combo counter in HUD | Makes combo system visible | Low | Low |
| “Next” queue (e.g. 3 pieces) | More planning, optional | Med | Med |
| Garbage lines (multiplayer) | Enables versus / battle mode | High | Med |

---

## ⚙ Performance Analysis

**Summary**

- **Tick:** One loop over `getAllInstances()`; per instance: consume one input, `handleAction`, `tick()`, `render()`. No O(n²) over players; instance count is capped by `PLOT_COUNT` (8).
- **Rendering:** `RENDER_FULL_REDRAW = true` in `RenderSystemInstance`: every dirty render writes full board (BOARD_WIDTH × BOARD_RENDER_HEIGHT cells). Throttle 50 ms limits to ~20 fps per instance. Each `setBlock` is a world write; with 8 instances this is bounded but non-trivial.
- **Board operations:** Line clear uses `findFullRows` (one pass), then `splice` + `push` per row. No O(n²) over board; piece cells and collision are O(1) per piece.
- **Audio:** Client creates new `Audio()` for each SFX (line clear, block land, button, level up, game over). No pooling; repeated rapid SFX could create many elements. Soundtrack is one element, looped.
- **Memory:** `gameOverSubmittedIds` and `noPlotPlayerIds` are cleared on leave. Input queues are unbounded (see Critical #1). Instance caches (`instanceCaches`) are removed when plot is cleared on leave. Leaderboard cache is TTL-based.
- **Console:** No obvious spam; leaderboard and Supabase log at startup/warn level.

**Performance risk score: 5/10**

- **Where to optimize first:**  
  1) Cap input queue (correctness and memory).  
  2) Consider incremental render (diff) when full redraw is proven stable (see `INTERMITTENT_RENDERING_AUDIT.md`).  
  3) Client SFX: reuse or pool Audio elements for frequent sounds (line clear, block land).  
  4) If instance count or board size grows, profile `setBlock` volume and consider batching if the engine supports it.

---

## 🧠 Design Opportunities

- **Combo feedback:** Combo multiplier exists; add HUD combo counter and optional “Combo x2” popup.
- **Perfect clear:** Detect zero blocks in board after clear; award bonus points and distinct SFX.
- **Level-up moment:** Short screen tint or “Level N” splash when level increases.
- **Audio escalation:** Slightly increase BGM tempo or layer at higher levels.
- **Spectator:** When all plots are full, allow “watch” mode (camera on one plot, read-only HUD) and document in MULTIPLAYER_TESTING.
- **Ranked / competitive:** Same rules, seed optional; submit to a “season” or “ranked” leaderboard; show ELO or tier (architecture already supports per-player score submit).
- **Mobile:** Touch soft-drop hold is implemented; add optional virtual D-pad or swipe-rotate for accessibility.
- **Retention:** Daily challenge (fixed seed per day), “lines today” counter, simple achievements (first Tetris, 5 combos, etc.).
- **Cosmetic hooks:** Per-piece skins, board themes, particle style for line clear — all client-side or server-sent “theme id” only; no pay-to-win.

---

## 📱 Mobile Risk Assessment

- **Viewport:** `index.html` has `viewport-fit=cover` and `user-scalable=no`; CSS uses `env(safe-area-inset-*)` and `100dvh`. Short viewports (e.g. 844×390) use a dedicated media query; leaderboard and right stack can get cramped.
- **Touch:** Soft drop uses `touchstart`/`touchend` with `passive: false` and `preventDefault` to avoid scroll. Button handlers use `_softDropSent`; mouseleave sends `softDropUp` so releasing outside works. Risk: very fast tap might send softDropDown then softDropUp in same tick — server gets both; no bug.
- **Layout:** Fixed positions (e.g. `top: 260px`, `top: 140px` for short) can overlap on odd aspect ratios or notches. Test on 844×390 and 375×812.
- **Orientation change:** No `resize` or `orientationchange` handler to recenter or adjust layout; CSS is fluid but fixed `top` values may leave gaps or overlap after rotate.
- **ScoreBar.js missing:** On mobile, score/level/lines still update (fallback), but animations (score pop, level flash) don’t run — slightly less feedback on small screens.
- **Audio:** Autoplay policies may block BGM until first tap; game-over and SFX use one-shot `Audio().play()`. Document “tap to start music” if needed.

---

## 🏁 Final Verdict

| Category | Score (1–10) | Notes |
|----------|--------------|--------|
| **Stability** | 7 | Tick reentrancy guarded; board guards in render/tick; one unbounded queue (input); ScoreBar missing but safe fallback. |
| **Fun** | 7 | Solid core loop, combos, line-clear burst; no lock delay or hold, so feel is a step behind modern Tetris. |
| **Competitive potential** | 7 | Server authority, deterministic RNG, leaderboard; no B2B, no ranked mode or spectator yet. |
| **Polish** | 6 | Line-clear SFX/variants, level-up sound, screen shake; ScoreBar animations missing; “Best score” and some HUD details incomplete. |

**Top 5 highest-ROI improvements**

1. **Cap input queue** (InputSystem) — Prevents abuse and memory growth; small change.  
2. **Implement or remove ScoreBar component** — Either restore score/level/lines animations or delete reference and document fallback.  
3. **Add lock delay** — Single config constant + timer in TetrisSystem/GameInstance; large feel improvement.  
4. **Fix or remove `usePowerUp`** — Remove E key or add explicit no-op so behavior is clear.  
5. **Use wall-clock delta for gravity** — Pass elapsed time from index into tick; clamp; reduces “freeze” feeling under load.

---

## 🚫 What’s Missing (Explicit List)

- **Lock delay** (config + logic).
- **Hold piece** (state field, key binding, swap logic).
- **Ghost piece** (client or server-driven preview of drop position).
- **Back-to-back (B2B)** bonus for consecutive 4-line clears.
- **I-piece-specific wall kick** table.
- **ScoreBar.js** implementation (or its removal from HUD).
- **`game-over-best`** wiring on client (or `bestScore` in payload).
- **Spectator mode** when all plots full.
- **Production guard** for `/fillrow` and `/spawn` (or equivalent cheat commands).
- **Bounded input queue** (max length + drop policy).
- **Single structured HUD payload** for lineClearBurst + pieceLock (optional ordering guarantee).
- **Power-up system** (if E key is to be meaningful).
- **Ranked/season leaderboard** (optional; current global leaderboard exists).
- **Documentation** that each player gets their own plot/instance (README update).

---

*End of QA Report.*
