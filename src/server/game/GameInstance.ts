/**
 * GameInstance: one Tetris game per plot/player.
 * Encapsulates state, gravity tick, input handling, HUD payload, and render.
 * All coordinates are in local board space; origin is applied at render time.
 */

import type { World } from 'hytopia';
import type { Plot } from '../plots/PlotManager.js';
import type { TetrisState } from '../state/types.js';
import type { InputAction } from '../systems/InputSystem.js';
import { createInitialState, resetState, spawnNextPiece } from '../state/WorldState.js';
import { createRng } from '../util/rng.js';
import type { LineClearResult } from '../systems/TetrisSystem.js';
import {
  tryMove,
  tryRotate,
  hardDrop,
  tickGravity,
  collides,
  stackReachedTop,
} from '../systems/TetrisSystem.js';
import { BOARD_WIDTH, BOARD_HEIGHT } from '../config/tetris.js';
import { renderInstance, clearInstanceRenderCache } from './RenderSystemInstance.js';
import { tickReactorColumnLava, clearReactorLavaState, DEFAULT_REACTOR_THEME } from '../plots/ReactorArcade.js';
import type { HudPayload } from '../services/HudService.js';
import { buildHudPayload } from '../services/HudService.js';
import type { LeaderboardPayload } from '../schema/hudMessages.js';

const RENDER_THROTTLE_MS = 50; // ~20 fps max for per-instance render

function getRngSeed(state: TetrisState): number | undefined {
  const r = state.rngState;
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  return state.seed;
}

export class GameInstance {
  readonly plot: Plot;
  readonly playerId: string;
  /** Server-authoritative Tetris state for this plot. */
  readonly state: TetrisState;
  /** True once this player has clicked Start (gravity and piece spawn active). */
  gameStarted: boolean;
  /** Set when board/piece changed so we only re-render when needed. */
  dirty: boolean;
  /** Throttle re-renders. */
  lastRenderMs: number;
  /** When set, next HUD send should include lineClearBurst then clear this. */
  pendingLineClearBurst: LineClearResult | null;
  /** When set, next HUD send should include pieceLock (block landed) then clear this. */
  pendingPieceLock: boolean;

  constructor(plot: Plot, playerId: string, seed?: number) {
    this.plot = plot;
    this.playerId = playerId;
    this.state = createInitialState(seed);
    this.gameStarted = false;
    this.dirty = true;
    this.lastRenderMs = 0;
    this.pendingLineClearBurst = null;
    this.pendingPieceLock = false;
  }

  /** Call when player sends 'start' — enables gravity and piece spawn. */
  setGameStarted(): void {
    if (this.gameStarted) return;
    this.gameStarted = true;
    this.dirty = true;
  }

  /** Apply one consumed action to this instance's state. Routing: only call for the instance's player. */
  handleAction(action: InputAction | null, softDropActive: boolean): void {
    this.state.softDropActive = softDropActive;
    if (action === 'reset') {
      resetState(this.state);
      this.gameStarted = false;
      this.dirty = true;
      return;
    }
    if (this.state.gameStatus !== 'RUNNING' || !action || action === 'start') return;
    if (action === 'left') tryMove(this.state, -1, 0);
    else if (action === 'right') tryMove(this.state, 1, 0);
    else if (action === 'rotate') tryRotate(this.state);
    else if (action === 'hardDrop') {
      const rngObj = createRng(getRngSeed(this.state));
      const lineClear = hardDrop(this.state, () => rngObj.next());
      this.state.rngState = rngObj.getState();
      this.pendingPieceLock = true;
      if (lineClear.linesCleared > 0) this.pendingLineClearBurst = lineClear;
    }
    this.dirty = true;
  }

  /**
   * Advance gravity and piece spawn. Call once per server tick per instance.
   * Does not consume input; caller must call handleAction first with consumed action.
   */
  tick(deltaMs: number): void {
    const state = this.state;
    if (!state.board?.length || state.board.length !== BOARD_HEIGHT || !state.board[0] || state.board[0].length !== BOARD_WIDTH) {
      return;
    }

    if (!this.gameStarted) {
      this.dirty = true;
      return;
    }

    const rngObj = createRng(getRngSeed(state));
    const rng = () => rngObj.next();

    // Spawn piece if none
    if (state.gameStatus === 'RUNNING' && !state.activePiece) {
      if (stackReachedTop(state.board)) {
        state.gameStatus = 'GAME_OVER';
      } else {
        spawnNextPiece(state, rng);
        if (state.activePiece && collides(state.board, state.activePiece)) {
          state.gameStatus = 'GAME_OVER';
          state.activePiece = null;
        }
      }
      this.dirty = true;
    }

    // Soft drop: one row per tick when holding
    if (state.gameStatus === 'RUNNING' && state.activePiece && state.softDropActive) {
      tryMove(state, 0, -1);
      this.dirty = true;
    }

    // Gravity
    const effectiveDeltaMs = Math.min(500, Math.max(50, deltaMs));
    if (state.activePiece && state.gravityAccumulatorMs === 0) {
      state.gravityAccumulatorMs = state.softDropActive ? 50 : state.gravityIntervalMs;
    }
    const lineClear = tickGravity(state, effectiveDeltaMs, rng, Date.now());
    if (lineClear) {
      this.pendingPieceLock = true;
      if (lineClear.linesCleared > 0) this.pendingLineClearBurst = lineClear;
    }
    this.dirty = true;

    state.rngState = rngObj.getState();

    // Emergency spawn
    if (state.gameStatus === 'RUNNING' && !state.activePiece) {
      if (stackReachedTop(state.board)) {
        state.gameStatus = 'GAME_OVER';
      } else {
        spawnNextPiece(state, () => rngObj.next());
        state.rngState = rngObj.getState();
        if (state.activePiece && collides(state.board, state.activePiece)) {
          state.gameStatus = 'GAME_OVER';
          state.activePiece = null;
        }
      }
      this.dirty = true;
    }
  }

  /** HUD payload for this instance (score, level, lines, status, gameStarted). */
  getHudPayload(leaderboard?: LeaderboardPayload): HudPayload {
    return buildHudPayload(this.state, this.gameStarted, leaderboard);
  }

  /**
   * Render this instance's board to the world at plot.origin.
   * Column lava is ticked every call for motion; board only if dirty and throttle allows.
   */
  render(world: World): void {
    const now = Date.now();
    tickReactorColumnLava(world, this.plot, now, DEFAULT_REACTOR_THEME);
    if (!this.dirty && now - this.lastRenderMs < RENDER_THROTTLE_MS) return;
    renderInstance(this.state, world, this.plot.origin, this.plot.id);
    this.dirty = false;
    this.lastRenderMs = now;
  }

  /** Reset this instance's game (same seed). Used by /reset. Clears gameStarted so client shows Start again. */
  reset(seed?: number): void {
    resetState(this.state, seed);
    this.gameStarted = false;
    this.dirty = true;
  }

  /** Clear this instance's rendered blocks and cache. Call when releasing plot. */
  clearAndDestroy(world: World): void {
    clearInstanceRenderCache(world, this.plot);
    clearReactorLavaState(this.plot.id);
  }
}
