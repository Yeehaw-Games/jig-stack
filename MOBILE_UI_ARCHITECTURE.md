# JigStack Mobile UI Architecture (Phase 1–5)

Goal: production-ready mobile UI + controls without degrading desktop gameplay and without touching core server logic.

## Mode Detection
`assets/ui/mobileLayout.js`

- `gameMode = mobile` if:
  - device reports touch (`maxTouchPoints > 0` or `ontouchstart`), OR
  - `viewportWidth < 900px`
- otherwise `gameMode = desktop`

On mode switch (resize/orientation change):
- toggle `:root.mode-mobile` / `:root.mode-desktop`
- refresh touch controls

## Layout Rules (Mobile)
CSS: `assets/ui/mobile.css`

- Board stays **in-world** (3D), HUD overlays.
- HUD top is compact: score/level/lines/combo + intensity bar.
- Right-side “How to play” and leaderboard are hidden on mobile to reduce clutter.
- Bottom controls bar:
  - Rotate
  - Hard drop
- **No scroll**: `html, body { overflow:hidden; overscroll-behavior:none }`

## Camera Lock / No Gesture Conflicts
Because the HYTOPIA camera can respond to touch ges mobile mode creates a full-screen gesture-capture layer:
- Element: `#mobile-gesture-layer` (created by `mobileLayout.js`)
- In mobile mode it becomes active and captures pointer/touch events
- This prevents touch gestures from reaching the underlying game view (camera)

## Modules
- `assets/ui/inputLayer.js`
  - unified send
  - per-action debounce
  - haptic hook (`navigator.vibrate`)
  - client-side pause gate

- `assets/ui/mobileLayout.js`
  - mode detection
  - applies CSS mode classes
  - disables pinch-zoom (best effort)

- `assets/ui/touchControls.js`
  - gesture layer handling
  - bottom buttons
  - two-finger tap pause overlay

## Safe Desktop Guarantee
Desktop behavior is preserved:
- existing keyboard controls remain
- existing HUD layout remains (mobile changes only apply under `:root.mode-mobile`)

## Future Extensions
- If we add a server-level pause later, map the client pause toggle to a server action.
- If we add hold-piece gameplay later, the HUD already has a place for it (side overlay).
