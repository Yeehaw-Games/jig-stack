/**
 * Tetris game configuration.
 * Board dimensions, gravity, scoring, and block type mapping.
 */

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

/** Rows above the play area (0..BOARD_HEIGHT-1) where the piece spawns; piece drops in from here. */
export const SPAWN_ZONE_ROWS = 4;
/** Total grid rows we render (play area + spawn zone). Walls/boardBounds use this height. */
export const BOARD_RENDER_HEIGHT = BOARD_HEIGHT + SPAWN_ZONE_ROWS;

/** World origin for the board: first cell (0,0) maps to this world position. */
export const BOARD_ORIGIN = { x: 0, y: 0, z: 0 };

/** Block type id for the visible board boundary (walls). Oak-log for a warmer frame. */
export const BOARD_WALL_BLOCK_ID = 11;

/** Wall frame: thickness in grid units for left/right sides. Larger = pillars extend further left/right. */
export const WALL_THICKNESS = 5;
/** Left/right walls extend this many blocks in the horizontal X direction (left wall extends to -WALL_SIDE_X, right to BOARD_WIDTH + WALL_SIDE_X - 1). */
export const WALL_SIDE_X = 3;
/** Bottom "floor" and top "ceiling" thickness in grid units. Larger = clearly visible base and cap. */
export const WALL_BOTTOM_THICKNESS = 4;
export const WALL_TOP_THICKNESS = 3;
/** Wall depth in front of the board (toward the player). */
export const WALL_DEPTH = 2;
/** Wall depth behind the board (away from the player). Walls extend in both Z directions. */
export const WALL_DEPTH_BACK = 2;
/** Probability [0,1] that a wall cell is filled; rest stay air for a broken/ruined look. 1 = solid. */
export const WALL_FILL_PROBABILITY = 0.92;

/** Spawn position: grid column and row. Grid row 0 = bottom; world Y increases upward. */
export const SPAWN_X = 3; // center-ish for 4-cell-wide pieces (e.g. I spans 3,4,5,6)
export const SPAWN_Y = BOARD_HEIGHT; // spawn above play area: piece occupies rows 20–23 (drops in from top)

/** Gravity: interval in ms between automatic downward moves. Decreases with level. */
export const GRAVITY_BASE_MS = 800;
export const GRAVITY_DECREASE_PER_LEVEL_MS = 60;
export const GRAVITY_MIN_MS = 100;

/** Soft drop: interval in ms when soft-drop is active (faster than gravity). */
export const SOFT_DROP_INTERVAL_MS = 50;

/** Lines per level before level increases. */
export const LINES_PER_LEVEL = 10;

/** Score per lines cleared in one move (classic-ish). */
export const SCORE_PER_LINES: Record<number, number> = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

/** Combo: if a line clear happens within this many ms of the previous, multiplier stacks. */
export const COMBO_WINDOW_MS = 5000;
/** Per-stack multiplier: 1 + (comboCount * COMBO_MULTIPLIER_PER_STACK). */
export const COMBO_MULTIPLIER_PER_STACK = 0.1;

/** Piece type id to block type id (1-7). 0 is reserved for air. */
export const PIECE_TYPE_TO_BLOCK_ID: Record<number, number> = {
  1: 1, // I -> block 1
  2: 2, // O
  3: 3, // T
  4: 4, // S
  5: 5, // Z
  6: 6, // J
  7: 7, // L
};

/** Default texture names for block types (use textures from assets atlas). */
export const BLOCK_TEXTURE_URIS: Record<number, string> = {
  1: 'blocks/wool-cyan.png',
  2: 'blocks/wool-yellow.png',
  3: 'blocks/wool-purple.png',
  4: 'blocks/wool-green.png',
  5: 'blocks/wool-red.png',
  6: 'blocks/wool-blue.png',
  7: 'blocks/wool-orange.png',
};

/** Game loop tick rate: target ticks per second. */
export const TICKS_PER_SECOND = 20;

/** Wall-kick offsets for rotation (try in order): (dx, dy) in grid units. */
export const WALL_KICK_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [2, 0],
  [-2, 0],
  [0, -1],
];
