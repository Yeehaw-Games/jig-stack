/**
 * TetrisSystem: server-authoritative game logic.
 * Handles piece shapes, collision, movement, rotation (with wall kick), lock, line clear, scoring.
 * No rendering; no I/O. Pure state transitions.
 */

import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  GRAVITY_BASE_MS,
  GRAVITY_DECREASE_PER_LEVEL_MS,
  GRAVITY_MIN_MS,
  SOFT_DROP_INTERVAL_MS,
  LINES_PER_LEVEL,
  SCORE_PER_LINES,
  COMBO_WINDOW_MS,
  COMBO_MULTIPLIER_PER_STACK,
  WALL_KICK_OFFSETS,
  SPAWN_X,
  SPAWN_Y,
} from '../config/tetris.js';
import type { BoardGrid, CellValue, PieceState, TetrisState } from '../state/types.js';
import type { PieceTypeId } from '../state/types.js';
import { spawnNextPiece, createNextPiece } from '../state/WorldState.js';
import { clampGravityMs } from '../util/time.js';

// --- Piece definitions (4x4 grid per rotation; 1 = filled). Standard SRS-style. ---
// Each shape is [rotation][localY][localX]. Origin is top-left of 4x4 for placement.
type ShapeCell = 0 | 1;
type Shape4x4 = ShapeCell[][];

const SHAPES: Record<PieceTypeId, Shape4x4[]> = {
  1: [
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
  ],
  2: [
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  ],
  3: [
    [[0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
  ],
  4: [
    [[0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0]],
    [[1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
  ],
  5: [
    [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
  ],
  6: [
    [[1, 0, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
  ],
  7: [
    [[0, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
  ],
};

const PIECE_TYPE_TO_LETTER: Record<PieceTypeId, 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'> = {
  1: 'I', 2: 'O', 3: 'T', 4: 'S', 5: 'Z', 6: 'J', 7: 'L',
};

/** Get 4x4 shape matrix for a piece type and rotation (for HUD next-piece preview). */
export function getPieceMatrix(typeId: PieceTypeId, rotation: number): number[][] {
  const type = (typeId >= 1 && typeId <= 7 ? typeId : 1) as PieceTypeId;
  const rotations = SHAPES[type];
  if (!rotations) return Array(4).fill(0).map(() => Array(4).fill(0));
  const shape = rotations[rotation % 4];
  if (!shape) return Array(4).fill(0).map(() => Array(4).fill(0));
  return shape.map((row) => row.map((c) => c as number));
}

/** Get piece letter for HUD (I, O, T, S, Z, J, L). */
export function getPieceTypeLetter(typeId: PieceTypeId): 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L' {
  return PIECE_TYPE_TO_LETTER[(typeId >= 1 && typeId <= 7 ? typeId : 1) as PieceTypeId];
}

/** Get world (board) cell coordinates occupied by the piece (without checking bounds). */
export function getPieceCells(piece: PieceState): Array<{ x: number; y: number }> {
  const type = (piece.type >= 1 && piece.type <= 7 ? piece.type : 1) as PieceTypeId;
  const rotations = SHAPES[type];
  if (!rotations) return [];
  const shape = rotations[piece.rotation % 4];
  if (!shape) return [];
  const cells: Array<{ x: number; y: number }> = [];
  for (let ly = 0; ly < 4; ly++) {
    for (let lx = 0; lx < 4; lx++) {
      if (shape[ly][lx]) cells.push({ x: piece.x + lx, y: piece.y + ly });
    }
  }
  return cells;
}

/** Check if any of the piece's cells are out of bounds or overlap a filled board cell. Spawn zone (y >= BOARD_HEIGHT) is allowed. */
export function collides(board: BoardGrid, piece: PieceState): boolean {
  const cells = getPieceCells(piece);
  for (const { x, y } of cells) {
    if (x < 0 || x >= BOARD_WIDTH || y < 0) return true;
    if (y < BOARD_HEIGHT && board[y][x] !== 0) return true;
  }
  return false;
}

/** True when the stack has reached the top row of the play area (game over line). */
export function stackReachedTop(board: BoardGrid): boolean {
  const topRow = BOARD_HEIGHT - 1;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    if (board[topRow][x] !== 0) return true;
  }
  return false;
}

/** Try to move piece by (dx, dy). Returns true if move was applied. */
export function tryMove(state: TetrisState, dx: number, dy: number): boolean {
  const p = state.activePiece;
  if (!p || state.gameStatus !== 'RUNNING') return false;
  const moved: PieceState = { ...p, x: p.x + dx, y: p.y + dy };
  if (collides(state.board, moved)) return false;
  state.activePiece = moved;
  return true;
}

/**
 * Rotation: try rotation in place, then wall-kick offsets in order (SRS-style).
 * Rotation is clockwise (rotation index 0→1→2→3). If rotation in place collides,
 * we try shifting the piece by each offset in WALL_KICK_OFFSETS until valid or none work.
 */
export function tryRotate(state: TetrisState): boolean {
  const p = state.activePiece;
  if (!p || state.gameStatus !== 'RUNNING') return false;
  const nextRotation = (p.rotation + 1) % 4;
  for (const [dx, dy] of WALL_KICK_OFFSETS) {
    const kicked: PieceState = { ...p, rotation: nextRotation, x: p.x + dx, y: p.y + dy };
    if (!collides(state.board, kicked)) {
      state.activePiece = kicked;
      return true;
    }
  }
  return false;
}

/** Soft drop: move down by one. Returns true if moved. */
export function softDrop(state: TetrisState): boolean {
  return tryMove(state, 0, -1);
}

/**
 * Hard drop: move piece down until it hits something, then lock.
 * Returns the line clear result (linesCleared, points) when lines were cleared; otherwise { linesCleared: 0, points: 0 }.
 */
export function hardDrop(state: TetrisState, rng: () => number, nowMs: number): LineClearResult {
  const p = state.activePiece;
  const zero: LineClearResult = { linesCleared: 0, points: 0 };
  if (!p || state.gameStatus !== 'RUNNING') return zero;
  let dy = 0;
  while (tryMove(state, 0, -1)) dy++;
  return lockPiece(state, rng, nowMs);
}

export interface LineClearResult {
  linesCleared: number;
  points: number;
}

/**
 * Merge piece into board and clear full lines. Call after lock.
 * Line clear: identify full rows, remove them (splice), then push empty rows on top
 * so the grid stays BOARD_HEIGHT rows and everything above drops down.
 * Combo: if nowMs is within COMBO_WINDOW_MS of last clear, multiplier stacks (1 + comboCount * COMBO_MULTIPLIER_PER_STACK).
 */
function mergeAndClearLines(state: TetrisState, nowMs: number): LineClearResult {
  const p = state.activePiece;
  const zero: LineClearResult = { linesCleared: 0, points: 0 };
  if (!p) return zero;

  const cells = getPieceCells(p);
  for (const { x, y } of cells) {
    if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      state.board[y][x] = p.type as CellValue;
    }
  }
  state.activePiece = null;

  const fullRows: number[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    if (state.board[y].every(c => c !== 0)) fullRows.push(y);
  }
  state.lastLinesCleared = fullRows.length;

  if (fullRows.length === 0) return zero;

  // Remove rows from highest index first so splice doesn't shift indices we still need to remove
  fullRows.sort((a, b) => b - a);
  for (const row of fullRows) {
    state.board.splice(row, 1);
    state.board.push(Array(BOARD_WIDTH).fill(0));
  }
  while (state.board.length < BOARD_HEIGHT) {
    state.board.push(Array(BOARD_WIDTH).fill(0));
  }

  // Combo: within 5s of previous clear = stack multiplier
  const inWindow =
    state.lastLineClearTimeMs > 0 && nowMs - state.lastLineClearTimeMs <= COMBO_WINDOW_MS;
  const newComboCount = inWindow ? state.comboCount + 1 : 0;
  state.lastLineClearTimeMs = nowMs;
  state.comboCount = newComboCount;

  const basePoints = SCORE_PER_LINES[fullRows.length] ?? 0;
  const multiplier = 1 + newComboCount * COMBO_MULTIPLIER_PER_STACK;
  const points = Math.round(basePoints * multiplier);
  state.score += points;
  state.lines += fullRows.length;
  const levelBefore = state.level;
  state.level = Math.floor(state.lines / LINES_PER_LEVEL) + 1;
  if (state.level > levelBefore) {
    state.gravityIntervalMs = clampGravityMs(
      GRAVITY_BASE_MS - state.level * GRAVITY_DECREASE_PER_LEVEL_MS,
      GRAVITY_MIN_MS,
      GRAVITY_BASE_MS
    );
  }
  return { linesCleared: fullRows.length, points };
}

/** Lock current piece: merge into board, clear lines, spawn next (or game over). Returns line clear result when lines were cleared. */
function lockPiece(state: TetrisState, rng: () => number, nowMs: number): LineClearResult {
  const result = mergeAndClearLines(state, nowMs);
  state.gravityAccumulatorMs = 0;
  if (stackReachedTop(state.board)) {
    state.gameStatus = 'GAME_OVER';
    state.activePiece = null;
    return result;
  }
  const spawned = spawnNextPiece(state, rng);
  if (spawned && collides(state.board, spawned)) {
    state.gameStatus = 'GAME_OVER';
    state.activePiece = null;
  }
  return result;
}

/** Apply gravity: if interval elapsed, move down once; if can't move, lock. Returns line clear result when a lock cleared lines. */
export function tickGravity(
  state: TetrisState,
  deltaMs: number,
  rng: () => number,
  nowMs: number
): LineClearResult | null {
  if (state.gameStatus !== 'RUNNING' || !state.activePiece) return null;
  const interval = state.softDropActive ? SOFT_DROP_INTERVAL_MS : state.gravityIntervalMs;
  state.gravityAccumulatorMs += deltaMs;
  while (state.gravityAccumulatorMs >= interval) {
    state.gravityAccumulatorMs -= interval;
    const moved = tryMove(state, 0, -1);
    if (!moved) {
      return lockPiece(state, rng, nowMs);
    }
  }
  return null;
}

/** Force next piece type (for /spawn debug). Piece type 1..7. */
export function forceNextPiece(state: TetrisState, pieceType: PieceTypeId): void {
  state.nextPiece = createNextPiece(pieceType);
}

/** Fill a row for testing line clear (/fillrow). */
export function fillRow(state: TetrisState, y: number): void {
  if (y < 0 || y >= BOARD_HEIGHT) return;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    state.board[y][x] = 1; // use type 1 (I) as filler
  }
}
