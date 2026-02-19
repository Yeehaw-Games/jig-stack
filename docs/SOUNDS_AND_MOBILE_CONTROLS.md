# Sounds & Mobile Controls — Quick Reference

Reference for adding sounds and testing/tweaking mobile controls (e.g. when testing on device tonight).

---

## Adding new sounds

- **Where sounds are wired:** `assets/ui/hud.js` (client-side; respects SFX mute).
- **Where files live:** `assets/audio/` (e.g. `game-over.mp3`, `line-clear.mp3`, `block-land.mp3`, `button-click.mp3`, `level-up.mp3`, `soundtrack.mp3`).

**Steps to add a new SFX:**

1. Add the file under `assets/audio/` (e.g. `my-sound.mp3`).
2. In `assets/ui/hud.js` near the top (with other `*SoundUrl` vars), add:
   ```js
   var mySoundUrl = assetsBase ? assetsBase + '/audio/my-sound.mp3' : '';
   ```
3. Add a small helper (next to `playLineClearSound`, etc.):
   ```js
   function playMySound() {
     if (window.__tetrisSfxMuted || !mySoundUrl) return;
     var audio = new window.Audio(mySoundUrl);
     audio.volume = 0.6;
     audio.play().catch(function () {});
   }
   ```
4. Call `playMySound()` from the right place (e.g. inside `updateUI()` when you detect the event, or when a button is pressed). All SFX respect `window.__tetrisSfxMuted` (tied to the SFX mute button).

**Existing sound hooks:**

| Event / trigger        | Function / where it’s called                          |
|------------------------|--------------------------------------------------------|
| Game over              | `playGameOverSound()` — when `status` becomes GAME_OVER |
| Line clear             | `playLineClearSound()` — from `showScoreBurst(..., lines)` |
| Piece lock (land)      | `playBlockLandSound()` — when `data.type === 'pieceLock'` |
| Button press           | `playButtonClickSound()` — on mousedown/touchstart for `.btn[data-action]` |
| Level up               | `playLevelUpSound()` — when `data.level > lastLevel`   |
| Background music       | Soundtrack — started in `applySoundtrackForStatus()` when status is RUNNING and music not muted |

---

## Mobile controls (where to tweak)

- **HTML:** `assets/ui/index.html` — structure of the HUD (stats, Start, Power-up, game-over overlay, leaderboard, battle HUD). There are **no dedicated left/right/rotate/soft-drop/hard-drop buttons in the HTML**; those would need to be added for visible on-screen controls.
- **JS:** `assets/ui/hud.js`:
  - **Touch:** Buttons use `touchstart` / `touchend` (with `passive: false` and `preventDefault()`) so taps work like clicks. Soft drop: touchstart → `softDropDown`, touchend → `softDropUp`.
  - **Keyboard:** Arrow keys and WASD (left, right, rotate, soft drop), Space (hard drop), R (reset), E (power-up). So on mobile, **only the buttons that exist in the HTML** (Start, Reset, Power-up, mute) get touch; **gameplay is keyboard-only** unless you add on-screen control buttons.
- **CSS:** `assets/ui/hud.css`:
  - `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent` on `body`.
  - `.btn` has `min-width: 52px`, `min-height: 52px` (touch-friendly). For larger tap targets, increase `min-width` / `min-height` or add a class for “game control” buttons.

**To add on-screen game controls (left, right, rotate, soft drop, hard drop) for mobile:**

1. In `index.html`, add a controls section (e.g. a row of buttons with `data-action="left"`, `data-action="right"`, `data-action="rotate"`, `data-action="softDropDown"` / soft drop, `data-action="hardDrop"`). The existing JS already forwards any `data-action` from buttons via `send(action)` and handles soft drop down/up on touch.
2. Style them in `hud.css` (e.g. fixed at bottom, large touch targets, only show when `data.gameStarted` or when status is RUNNING if you want to hide before start).

---

## Testing mobile without a device

- **Chrome DevTools:** F12 → toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M) → pick a phone profile. You can test layout and tap targets; touch events are simulated. Not perfect for latency/feel.
- **Real device:** Run the game (e.g. `npm run dev`), connect to the same network, open the play URL on the phone (or use Hytopia client on device if that’s how you run it). Then test touch on the actual buttons and, once added, on-screen controls.

---

## Checklist for tonight

- [ ] Add any new sound files under `assets/audio/`.
- [ ] Wire new SFX in `hud.js` (URL var + `play*` function + call site).
- [ ] If adding on-screen mobile controls: add buttons in `index.html` with `data-action`, style in `hud.css`, optionally show/hide by game state.
- [ ] Test on device (or DevTools device mode): tap targets, soft drop hold, and any new sounds.
