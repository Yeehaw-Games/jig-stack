/**
 * World state container for one Tetris game.
 * Creates and resets state; does not run game logic.
 */

import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  GRAVITY_BASE_MS,
  SPAWN_X,
  SPAWN_Y,
} from '../config/tetris.js';
import type { BoardGrid, PieceState, TetrisState } from './types.js';
import { createRng } from '../util/rng.js';
import type { PieceTypeId } from './types.js';

/** RNG returns [0,1); ensure we always get 1..7 for piece type. */
function randomPieceType(rng: () => number): PieceTypeId {
  const n = Math.floor(rng() * 7);
  const clamped = ((n % 7) + 7) % 7;
  return (clamped + 1) as PieceTypeId;
}

let pieceIdCounter = 0;

function createEmptyBoard(): BoardGrid {
  const grid: BoardGrid = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    grid.push(Array(BOARD_WIDTH).fill(0));
  }
  return grid;
}

function createPiece(type: PieceTypeId, x: number, y: number): PieceState {
  return {
    id: `p${++pieceIdCounter}`,
    type,
    rotation: 0,
    x,
    y,
  };
}

/** Create a new piece for the "next" queue (rotation 0, position doesn't matter for next). */
export function createNextPiece(type: PieceTypeId): PieceState {
  return createPiece(type, 0, 0);
}

/** Create initial state for a new game. Starts with one piece already active so no R is needed. */
export function createInitialState(seed?: number): TetrisState {
  const rngObj = createRng(seed);
  const firstType = randomPieceType(() => rngObj.next());
  const activePiece = createPiece(firstType, SPAWN_X, SPAWN_Y);
  const secondType = randomPieceType(() => rngObj.next());
  const nextPiece = createNextPiece(secondType);
  return {
    gameStatus: 'RUNNING',
    board: createEmptyBoard(),
    activePiece,
    nextPiece,
    score: 0,
    level: 1,
    lines: 0,
    gravityAccumulatorMs: 0,
    gravityIntervalMs: GRAVITY_BASE_MS,
    softDropActive: false,
    seed,
    rngState: rngObj.getState(),
    lastLinesCleared: 0,
    lastLineClearTimeMs: 0,
    comboCount: 0,
  };
}

/** Reset to a new game (same seed optional). */
export function resetState(state: TetrisState, seed?: number): void {
  const s = createInitialState(seed ?? state.seed);
  state.gameStatus = s.gameStatus;
  state.board = s.board;
  state.activePiece = s.activePiece;
  state.nextPiece = s.nextPiece;
  state.score = s.score;
  state.level = s.level;
  state.lines = s.lines;
  state.gravityAccumulatorMs = s.gravityAccumulatorMs;
  state.gravityIntervalMs = s.gravityIntervalMs;
  state.softDropActive = false;
  state.seed = s.seed;
  state.rngState = s.rngState;
  state.lastLinesCleared = s.lastLinesCleared;
  state.lastLineClearTimeMs = s.lastLineClearTimeMs;
  state.comboCount = s.comboCount;
}

/** Spawn the next piece onto the board; returns the new active piece or null if spawn collides (game over). */
export function spawnNextPiece(state: TetrisState, rng: () => number): PieceState | null {
  let next = state.nextPiece;
  if (!next) {
    const nextType = randomPieceType(rng);
    state.nextPiece = createNextPiece(nextType);
    next = state.nextPiece;
  }

  const type = (next.type >= 1 && next.type <= 7 ? next.type : 1) as PieceTypeId;
  const active = createPiece(type, SPAWN_X, SPAWN_Y);
  active.rotation = 0;

  const nextType = randomPieceType(rng);
  state.nextPiece = createNextPiece(nextType);

  state.activePiece = active;
  return active;
}
