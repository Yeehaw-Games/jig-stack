# JigStack Mobile Control Map

## Mode Trigger
Mobile mode is enabled when:
- touch device detected OR
- viewport width < 900px

## Gesture Layer
All gestures are captured on `#mobile-gesture-layer` to avoid camera movement.

## Gestures
Implemented in `assets/ui/touchControls.js`.
- Tap left half → `left`
- Tap right half → `right`
- Swipe down (>= ~38px) → `softDropDown` until finger release → `softDropUp`
- Long press (>= ~260ms) → `softDropDown` until release → `softDropUp`
- Two-finger tap → client pause overlay toggle (blocks inputs while paused)

## Buttons (Bottom Bar)
- Rotate button → `rotate`
- Hard drop button → `hardDrop`

## Debounce / Safety
- Move/rotate/hardDrop are debounced in `assets/ui/inputLayer.js`.
- softDropDown/Up are never debounced.
- Pause forces `softDropUp` to avoid stuck drop.
## Haptics
- Haptics are best-effort via `navigator.vibrate()`.
- Hook points exist in `inputLayer.js` and `touchControls.js`.
