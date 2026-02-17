# Arena Map Notes (`assets/map.json`)

This document describes the Tetris arcade room map: block IDs, board alignment, validation, and knobs.

---

## 1. Block ID Mapping (from this repo)

All block IDs and `textureUri` values come from the existing `assets/map.json` / `blockTypes` and runtime registration in `index.ts`. **No new textureUris were invented** to avoid green static / invalid texture issues.

| Role            | Block ID | Map blockType name        | Runtime (index.ts)              | Use in arena                    |
|-----------------|----------|---------------------------|----------------------------------|---------------------------------|
| Floor           | 8        | grass-flower-block-pine   | Overwritten → stone (`blocks/stone.png`) | Room floor (y=0)               |
| Wall            | 15       | stone                     | Same → stone                     | Walls, ceiling, front lip      |
| Trim / pillars  | 11       | oak-log                   | Not overwritten                  | Backplate, monitor mount, corner pillars |
| Bright accent   | 5        | cobblestone (in map file) | Overwritten → wool-red (tetris) | Marquee, monitor border        |
| Stage           | 12       | sand                      | Not overwritten                  | Stage platform in front of board |

- **1–7**: Reserved for Tetris pieces (registered in `index.ts`; do not use for static map geometry).
- **9, 10, 13, 14, 16**: Available in map only (grass-flower-block, oak-leaves, spruce-leaves, spruce-log, water); not used in current arena.

---

## 2. Board Anchor and Clearance

- **Board origin**: `BOARD_ORIGIN = { x: 0, y: 0, z: 0 }` (`src/server/config/tetris.ts`).
- **Board size**: 10 columns (x 0..9), 20 rows (y 0..19), single plane at **z = 0**.
- **Procedural walls** (from `WallGenerator.ts`): extend to x ∈ [-3, 12], y ∈ [-4, 22], z ∈ [-2, 1] (left wall, right wall, bottom/top thickness, front/back depth).

**Clearance zone (no map blocks):**  
`x ∈ [-3, 12]`, `y ∈ [-4, 22]`, `z ∈ [-2, 1]`.  
The arena generator leaves this volume empty so the procedural board and walls render correctly and are not overwritten by the map.

- **Player spawn**: `(4, 10, 6)`; spawn platform at y=9 under feet (`index.ts`). No overlap with arena floor (y=0) or stage (y=1).

---

## 3. Arena Geometry Summary

- **Room**: width 43 (x -18..24), depth 45 (z -22..22), wall height 20 (y 1..20), ceiling at y=21.
- **Floor**: y=0, full room except the clearance hole (C-shaped). Checkerboard of stone (8) and sand (12); oak trim (11) border around stage (x -3..12, z 2..9).
- **Walls**: Left/right have oak wainscoting at y=2, 11, 19; back wall oak base strip at y=1. Ceiling edge trim (oak) at front and back.
- **Back wall**: z=-22, with a rectangular “window” (x -6..15) for the backplate.
- **Backplate**: inset at z=-21, x -6..15, y -2..22 (wider/taller than the 10×20 board for framing).
- **Stage**: y=1, x -2..11, z 3..8 (centered in front of board).
- **Marquee**: y=20, x -2..11, z -1..1 (accent strip above board).
- **Monitor mount**: right wall at x=24, z 11..21, y 5..16 (trim with accent border for future leaderboard).
- **Corner pillars**: at (-18,-22), (-18,22), (24,-22), (24,22), y 1..20.
- **Front lip**: y=1, z=22, full width (so players don’t fall out).

---

## 4. How to Validate in World Builder

1. **Textures**
   - Open the map in HYTOPIA World Builder.
   - Confirm no green static / noise: floor (8), walls (15), oak-log (11), sand (12), and accent (5) should show correct textures (at runtime 5 and 8 are overwritten by code; in editor they may show map blockType).

2. **Board placement and clearance**
   - Ensure no map blocks exist at (0,0,0) or over the board (x 0..9, y 0..19, z=0) or the procedural wall volume (x -3..12, y -4..22, z -2..1).
   - You can search the map JSON for keys like `"0,0,0"` or `"5,10,0"`; there should be no such entries.

3. **Spawn and line of sight**
   - Spawn is at (4, 10, 6). Confirm the player has clear line of sight to the board (origin at (0,0,0)) and that the front of the room (positive z) is open or only has the low front lip.

---

## 5. Quick Knobs to Tweak

| Knob | Where | Effect |
|------|--------|--------|
| Room size | `ROOM_MIN_X`, `ROOM_MAX_X`, `ROOM_MIN_Z`, `ROOM_MAX_Z` in `scripts/generate-arena-map.js` | Larger/smaller arena footprint. |
| Wall height | `WALL_Y_LO`, `WALL_Y_HI`, `CEILING_Y` | Taller/shorter room and ceiling. |
| Stage position | Stage loops (x -2..11, z 3..8, y=1) | Move stage forward/back (z) or left/right (x). |
| Backplate size | Backplate loop (x -6..15, y -2..22, z=-26) | Wider/taller backplate; keep aligned with board (0..9, 0..19) plus margin. |
| Marquee position | Marquee loop (y=20, x -2..11, z -1..1) | Raise/lower (y) or shift (x/z). |
| Clearance zone | `BOARD_X_LO/HI`, `BOARD_Y_LO/HI`, `BOARD_Z_LO/HI` | If you change procedural wall config in `tetris.ts`, update these so the map still leaves the board volume clear. |

After changing the script, run:  
`node scripts/generate-arena-map.js > assets/map.json`

---

## 6. Assumptions

- **Coordinate system**: Same as in code: board at z=0; positive z = toward the player; back wall at z=-27.
- **Block registration order**: Map is loaded first (blockTypes 1–16 from map); then `index.ts` registers 1–7 (tetris), 8 (floor), 15 (wall). So 8 and 15 in the map are overwritten at runtime; 5 is overwritten to wool-red for accent.
- **No new block types**: Only existing map blockTypes and textureUris are used; no new IDs or texture paths added.
- **Spawn platform**: Still placed by code at (2..6, 9, 5..7) with block 8; arena does not place blocks there (y=9 is above stage and floor).

---

## 7. File Locations

- **Map**: `assets/map.json`
- **Backup of previous map**: `assets/map.previous.json`
- **Generator script**: `scripts/generate-arena-map.js`
