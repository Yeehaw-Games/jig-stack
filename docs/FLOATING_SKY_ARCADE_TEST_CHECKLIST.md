# Floating Sky Arcade — Manual Test Checklist

Use this after deploying the Floating Sky Arcade booth changes.

- [ ] **Start server** – No errors; block types (including arcade theme 20–25) register; `initPlots(world)` runs after `world.start()`.
- [ ] **All plots show booth** – Each plot has: floating platform, vertical backdrop panel, two vertical frame beams, light accent strip above board, 3×3 spawn pad in front.
- [ ] **Join with 2 browser windows** – Two clients; each gets a plot and spawns on their own platform.
- [ ] **Each board renders independently** – Play in one window; the other plot’s board is unchanged. No shared state.
- [ ] **Reset clears board only** – Use reset (or leave and rejoin); only the board area (boardBounds) is cleared. Platform, backdrop, and beams remain.
- [ ] **No overlapping shells** – With 4+ plots, no two booths overlap (PLOT_SPACING_X/Z = 40; booth fits in 30×30).
- [ ] **No FPS drop with 4+ players** – Booths are built once at startup; no per-tick geometry changes.

## Quick regression

- [ ] No PvP; no shared state.
- [ ] Board logic unchanged (gravity, pieces, scoring).
- [ ] Shell geometry is never cleared during resets.
