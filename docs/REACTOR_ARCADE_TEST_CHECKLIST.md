# Reactor Arcade — Manual Test Checklist

**Theme:** Industrial Energy Reactor — Subtle Core Edition.

Use this after deploying the Reactor Arcade visual update.

## Visual

- [ ] **Start server** – No errors; block types (including reactor theme 40–52) register; `initPlots(world)` runs after `world.start()`.
- [ ] **Dark platform** – Each plot has a heavy floating platform: dark steel/charcoal top, lighter metallic side trim, darker matte underside.
- [ ] **Dark backdrop** – Backdrop panel is deep charcoal with horizontal structure seams every 5 blocks; no neon grid.
- [ ] **Two reactor columns** – Two heavy columns frame the board (1 block outside left and right board edges). Dark matte casing, 1-block-wide vertical molten core inside each column.
- [ ] **Steel bands** – Every 6 blocks vertically on columns, a 1-block metallic ring.
- [ ] **Thin molten core** – Lava strip inside columns is only 1 block wide; it does not overpower the board.
- [ ] **Board remains brightest** – Tetrominos and board area are the most readable element.
- [ ] **Spawn pad** – 3×3 dark pad with small 1-block molten indicator in center; no bright neon outline.
- [ ] **Vent strip** – Optional: subtle 1-block-wide molten strip (8 blocks long) inset on one platform edge.
- [ ] **Horizon beam** – Optional: single thin horizontal dark beam behind backdrop for depth.

## Behavior

- [ ] **Reset clears board only** – Reset (or leave and rejoin) clears only the board area (boardBounds). Platform, backdrop, and columns remain.
- [ ] **No lava outside core/vent** – Lava appears only in column cores, optional vent strip, optional glow slit, and spawn center.
- [ ] **Multiplayer** – Two or more clients; each gets a plot; plots are visually distinct but consistent (same reactor look).

## Performance & safety

- [ ] **No FPS drop** – With 4+ players, no frame drop; shell is built once at startup, no animation loops or tick updates.
- [ ] **No overlapping shells** – Plots do not overlap (PLOT_SPACING_X/Z = 40).

## Regression

- [ ] No PvP; no shared state.
- [ ] Board logic unchanged (gravity, pieces, scoring).
- [ ] Shell geometry is never cleared during resets.
- [ ] boardBounds unchanged; clearBoard(plot) clears only boardBounds.
