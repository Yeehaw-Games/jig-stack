# Patch Log — Mobile UI + Controls

## Summary
Implements a modular mobile UI/control system for JigStack without changing server gameplay logic or degrading desktop controls.

## Files Added
- `assets/ui/inputLayer.js` — unified input layer (debounce, pause gate, haptics)
- `assets/ui/mobileLayout.js` — mode detection + safe resize switching + gesture capture layer
- `assets/ui/touchControls.js` — mobile gestures + bottom control bar + pause overlay
- `assets/ui/mobile.css` — mobile layout rules + gesture layer + controls styling

## Files Modified
- `assets/ui/index.html`
  - includes the new modules + `mobile.css`
  - adds intensity bar element
- `assets/ui/hud.js`
  - routes sending through unified input layer when available
  - initializes mobile modules
  ent-side intensity bar updates
- `assets/ui/hud.css`
  - adds intensity bar styling
  - hardens no-scroll behavior

## Notes
- Desktop behavior is preserved; mobile behavior is gated behind `:root.mode-mobile`.
- Two-finger tap pause is client-only (no server pause action added).
