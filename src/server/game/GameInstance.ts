/**
 * GameInstance: one Tetris game per plot/player.
 * Encapsulates state, gravity tick, input handling, HUD payload, and render.
 * All coordinates are in local board space; origin is applied at render time.
 */

import type { World } from 'hytopia';
import { ParticleEmitter } from 'hytopia';
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
import { finalizeLineClear } from '../systems/TetrisSystem.js';

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
  /** One-shot particle emitters used to fake a bloom/glow burst on line clear. */
  private _lineClearFxEmitters: ParticleEmitter[];
  private _lineClearFxUntilMsApplied: number;
  /** When true, next render should spawn game-over confetti then clear this. */
  private _pendingGameOverConfetti: boolean;
  /** One-shot particle emitters for game-over confetti. */
  private _gameOverConfettiEmitters: ParticleEmitter[];

  constructor(plot: Plot, playerId: string, seed?: number) {
    this.plot = plot;
    this.playerId = playerId;
    this.state = createInitialState(seed);
    this.gameStarted = false;
    this.dirty = true;
    this.lastRenderMs = 0;
    this.pendingLineClearBurst = null;
    this.pendingPieceLock = false;
    this._lineClearFxEmitters = [];
    this._lineClearFxUntilMsApplied = 0;
    this._pendingGameOverConfetti = false;
    this._gameOverConfettiEmitters = [];
  }

  private _clearLineClearFxEmitters(): void {
    for (const emitter of this._lineClearFxEmitters) {
      try {
        emitter.despawn();
      } catch {
        // ignore
      }
    }
    this._lineClearFxEmitters = [];
    this._lineClearFxUntilMsApplied = 0;
  }

  private _applyLineClearBloomFx(world: World, nowMs: number): void {
    const rows = this.state.lineClearFxRows;
    if (!rows || rows.length === 0) {
      if (this._lineClearFxEmitters.length > 0) this._clearLineClearFxEmitters();
      return;
    }

    // Only spawn emitters once per clear (keyed off untilMs).
    if (this._lineClearFxUntilMsApplied === this.state.lineClearFxUntilMs) return;

    this._clearLineClearFxEmitters();
    this._lineClearFxUntilMsApplied = this.state.lineClearFxUntilMs;

    const origin = this.plot.origin;
    const centerX = origin.x + (BOARD_WIDTH - 1) / 2;
    const zInFrontOfBoard = origin.z + 0.8;
    const msRemaining = Math.max(0, this.state.lineClearFxUntilMs - nowMs);

    for (const row of rows) {
      const emitter = new ParticleEmitter({
        textureUri: 'particles/star_01.png',
        position: { x: centerX, y: origin.y + row + 0.5, z: zInFrontOfBoard },
        positionVariance: { x: BOARD_WIDTH / 2, y: 0.06, z: 0.06 },
        maxParticles: 220,
        rate: 0, // one-shot burst
        lifetime: 0.22,
        lifetimeVariance: 0.06,
        sizeStart: 0.35,
        sizeStartVariance: 0.2,
        sizeEnd: 0.05,
        sizeEndVariance: 0.03,
        opacityStart: 0.9,
        opacityStartVariance: 0.1,
        opacityEnd: 0,
        opacityEndVariance: 0.05,
        colorStart: { r: 255, g: 160, b: 40 },
        colorStartVariance: { r: 30, g: 20, b: 10 },
        colorEnd: { r: 255, g: 80, b: 0 },
        colorEndVariance: { r: 20, g: 20, b: 10 },
        // Per SDK source: values > 1 create HDR/bloom effects.
        colorIntensityStart: 3.0,
        colorIntensityEnd: 2.0,
        velocity: { x: 0, y: 0.2, z: 0 },
        velocityVariance: { x: 1.8, y: 0.5, z: 0.2 },
        gravity: { x: 0, y: 0, z: 0 },
        transparent: true,
      });

      emitter.spawn(world);
      emitter.burst(90);
      this._lineClearFxEmitters.push(emitter);

      setTimeout(() => {
        try {
          if (emitter.isSpawned) emitter.despawn();
        } catch {
          // ignore
        }
      }, msRemaining + 350);
    }

    // Tetris (4-line) celebration: extra burst at center with more particles and distinct colors
    if (rows.length === 4) {
      const midY = origin.y + (rows[0]! + rows[3]!) / 2 + 0.5;
      const tetrisEmitter = new ParticleEmitter({
        textureUri: 'particles/star_01.png',
        position: { x: centerX, y: midY, z: zInFrontOfBoard },
        positionVariance: { x: BOARD_WIDTH * 0.6, y: 0.5, z: 0.15 },
        maxParticles: 280,
        rate: 0,
        lifetime: 0.4,
        lifetimeVariance: 0.1,
        sizeStart: 0.4,
        sizeStartVariance: 0.15,
        sizeEnd: 0.06,
        sizeEndVariance: 0.04,
        opacityStart: 0.95,
        opacityStartVariance: 0.05,
        opacityEnd: 0,
        opacityEndVariance: 0.05,
        colorStart: { r: 255, g: 200, b: 60 },
        colorStartVariance: { r: 40, g: 30, b: 20 },
        colorEnd: { r: 255, g: 100, b: 255 },
        colorEndVariance: { r: 30, g: 30, b: 30 },
        colorIntensityStart: 3.2,
        colorIntensityEnd: 2.2,
        velocity: { x: 0, y: 0.4, z: 0 },
        velocityVariance: { x: 2.2, y: 0.8, z: 0.3 },
        gravity: { x: 0, y: 0, z: 0 },
        transparent: true,
      });
      tetrisEmitter.spawn(world);
      tetrisEmitter.burst(140);
      this._lineClearFxEmitters.push(tetrisEmitter);
      setTimeout(() => {
        try {
          if (tetrisEmitter.isSpawned) tetrisEmitter.despawn();
        } catch {
          // ignore
        }
      }, msRemaining + 550);
    }
  }

  private _clearGameOverConfettiEmitters(): void {
    for (const emitter of this._gameOverConfettiEmitters) {
      try {
        emitter.despawn();
      } catch {
        // ignore
      }
    }
    this._gameOverConfettiEmitters = [];
  }

  private _applyGameOverConfetti(world: World): void {
    if (!this._pendingGameOverConfetti) return;
    this._pendingGameOverConfetti = false;
    this._clearGameOverConfettiEmitters();

    const origin = this.plot.origin;
    const centerX = origin.x + (BOARD_WIDTH - 1) / 2;
    const centerY = origin.y + BOARD_HEIGHT / 2;
    const zInFrontOfBoard = origin.z + 0.8;

    const confettiColors = [
      { start: { r: 255, g: 80, b: 80 }, end: { r: 200, g: 40, b: 40 } },
      { start: { r: 80, g: 180, b: 255 }, end: { r: 40, g: 120, b: 200 } },
      { start: { r: 255, g: 220, b: 80 }, end: { r: 220, g: 180, b: 40 } },
      { start: { r: 100, g: 255, b: 120 }, end: { r: 60, g: 200, b: 80 } },
      { start: { r: 220, g: 120, b: 255 }, end: { r: 180, g: 80, b: 200 } },
    ];
    const burstCount = 70;
    const lifetime = 1.2;
    const cleanupMs = (lifetime + 0.5) * 1000;

    for (const { start: colorStart, end: colorEnd } of confettiColors) {
      const emitter = new ParticleEmitter({
        textureUri: 'particles/star_01.png',
        position: { x: centerX, y: centerY, z: zInFrontOfBoard },
        positionVariance: { x: BOARD_WIDTH * 0.4, y: BOARD_HEIGHT * 0.2, z: 0.3 },
        maxParticles: 150,
        rate: 0,
        lifetime,
        lifetimeVariance: 0.3,
        sizeStart: 0.2,
        sizeStartVariance: 0.1,
        sizeEnd: 0.08,
        sizeEndVariance: 0.04,
        opacityStart: 0.95,
        opacityStartVariance: 0.05,
        opacityEnd: 0,
        opacityEndVariance: 0.05,
        colorStart,
        colorStartVariance: { r: 30, g: 30, b: 30 },
        colorEnd,
        colorEndVariance: { r: 20, g: 20, b: 20 },
        colorIntensityStart: 1.5,
        colorIntensityEnd: 1,
        velocity: { x: 0, y: 2.5, z: 0 },
        velocityVariance: { x: 2, y: 1.2, z: 0.8 },
        gravity: { x: 0, y: -3, z: 0 },
        transparent: true,
      });

      emitter.spawn(world);
      emitter.burst(burstCount);
      this._gameOverConfettiEmitters.push(emitter);

      setTimeout(() => {
        try {
          if (emitter.isSpawned) emitter.despawn();
        } catch {
          // ignore
        }
      }, cleanupMs);
    }
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
    // Freeze all gameplay actions during the line-clear flash window (except reset above).
    if (this.state.lineClearFxRows && this.state.lineClearFxRows.length > 0) {
      return;
    }
    if (this.state.gameStatus !== 'RUNNING' || !action || action === 'start') return;
    if (action === 'left') tryMove(this.state, -1, 0);
    else if (action === 'right') tryMove(this.state, 1, 0);
    else if (action === 'rotate') tryRotate(this.state);
    else if (action === 'hardDrop') {
      const rngObj = createRng(getRngSeed(this.state));
      const lineClear = hardDrop(this.state, () => rngObj.next(), Date.now());
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

    const nowMs = Date.now();
    // Line-clear flash: pause gameplay, then finalize the clear when timer expires.
    if (state.lineClearFxRows && state.lineClearFxRows.length > 0) {
      if (nowMs < state.lineClearFxUntilMs) {
        this.dirty = true;
        return;
      }
      finalizeLineClear(state);
      this.dirty = true;
    }

    const rngObj = createRng(getRngSeed(state));
    const rng = () => rngObj.next();

    // Spawn piece if none
    if (state.gameStatus === 'RUNNING' && !state.activePiece) {
      if (stackReachedTop(state.board)) {
        state.gameStatus = 'GAME_OVER';
        this._pendingGameOverConfetti = true;
      } else {
        spawnNextPiece(state, rng);
        if (state.activePiece && collides(state.board, state.activePiece)) {
          state.gameStatus = 'GAME_OVER';
          state.activePiece = null;
          this._pendingGameOverConfetti = true;
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
    const lineClear = tickGravity(state, effectiveDeltaMs, rng, nowMs);
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
        this._pendingGameOverConfetti = true;
      } else {
        spawnNextPiece(state, () => rngObj.next());
        state.rngState = rngObj.getState();
        if (state.activePiece && collides(state.board, state.activePiece)) {
          state.gameStatus = 'GAME_OVER';
          state.activePiece = null;
          this._pendingGameOverConfetti = true;
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
    this._applyLineClearBloomFx(world, now);
    this._applyGameOverConfetti(world);
    if (!this.dirty && now - this.lastRenderMs < RENDER_THROTTLE_MS) return;
    renderInstance(this.state, world, this.plot.origin, this.plot.id);
    this.dirty = false;
    this.lastRenderMs = now;
  }

  /** Reset this instance's game (same seed). Used by /reset. Clears gameStarted so client shows Start again. */
  reset(seed?: number): void {
    resetState(this.state, seed);
    this.gameStarted = false;
    this._pendingGameOverConfetti = false;
    this._clearGameOverConfettiEmitters();
    this.dirty = true;
  }

  /** Clear this instance's rendered blocks and cache. Call when releasing plot. */
  clearAndDestroy(world: World): void {
    this._clearLineClearFxEmitters();
    this._clearGameOverConfettiEmitters();
    clearInstanceRenderCache(world, this.plot);
    clearReactorLavaState(this.plot.id);
  }
}
