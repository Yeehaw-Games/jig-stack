/**
 * Tetris game state types.
 * Board, piece, and game status for server-authoritative logic.
 */

export type GameStatus = 'RUNNING' | 'GAME_OVER';

/** Grid cell: 0 = empty, 1..7 = piece type (I,O,T,S,Z,J,L). */
export type CellValue = number;

/** Piece type id (1-7). */
export type PieceTypeId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PieceState {
  id: string;
  type: PieceTypeId;
  rotation: number; // 0..3
  x: number;
  y: number;
}

/** 2D board: board[y][x], row-major. */
export type BoardGrid = CellValue[][];

export interface TetrisState {
  gameStatus: GameStatus;
  board: BoardGrid;
  activePiece: PieceState | null;
  nextPiece: PieceState | null;
  score: number;
  level: number;
  lines: number;
  /** Gravity accumulator in ms; when >= gravityInterval, apply gravity and subtract. */
  gravityAccumulatorMs: number;
  /** Current gravity interval in ms (can be overridden by /speed for testing). */
  gravityIntervalMs: number;
  /** Soft drop active this tick (from input). */
  softDropActive: boolean;
  /** Optional RNG seed for deterministic replays (future). */
  seed?: number;
  /** Persisted RNG state so each tick advances the same sequence (random piece types). */
  rngState?: number;
  /** Last lines cleared in the previous lock (for scoring display). */
  lastLinesCleared: number;
  /** Timestamp (ms) of last line clear; 0 = none. Used for combo window. */
  lastLineClearTimeMs: number;
  /** Consecutive line clears within combo window; 0 = first clear or window expired. */
  comboCount: number;
}

export type TetrominoName = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
