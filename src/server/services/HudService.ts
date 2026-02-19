/**
 * HudService: sends HUD data to client UI (score, level, lines, status, optional leaderboard).
 * Multi-player: each player receives HUD from their own plot instance; no instance = idle/assigning message.
 */

import type { Player } from 'hytopia';
import type { TetrisState } from '../state/types.js';
import type { LeaderboardPayload } from '../schema/hudMessages.js';
import { getInstanceByPlayer } from '../game/InstanceRegistry.js';
import { getPieceMatrix, getPieceTypeLetter, getStackHeight } from '../systems/TetrisSystem.js';

/** Next piece for HUD preview: type letter (I,O,T,S,Z,J,L) and 4x4 matrix. */
export interface NextPiecePayload {
  type: string;
  matrix: number[][];
}

export interface HudPayload {
  score: number;
  level: number;
  lines: number;
  comboCount: number;
  status: string; // RUNNING | GAME_OVER | ASSIGNING_PLOT | NO_PLOT
  gameStarted: boolean;
  /** Highest filled row count (1–20). 0 = empty. Used for intensity-based BGM. */
  stackHeight?: number;
  leaderboard?: LeaderboardPayload;
  /** Next piece for preview panel; only when game is running and next piece exists. */
  nextPiece?: NextPiecePayload | null;
}

export function buildHudPayload(
  state: TetrisState,
  gameStarted: boolean,
  leaderboard?: LeaderboardPayload
): HudPayload {
  const payload: HudPayload = {
    score: state.score,
    level: state.level,
    lines: state.lines,
    comboCount: state.comboCount,
    status: state.gameStatus,
    gameStarted,
    stackHeight: getStackHeight(state.board),
  };
  if (leaderboard) payload.leaderboard = leaderboard;
  if (state.gameStatus === 'RUNNING' && state.nextPiece) {
    payload.nextPiece = {
      type: getPieceTypeLetter(state.nextPiece.type),
      matrix: getPieceMatrix(state.nextPiece.type, state.nextPiece.rotation),
    };
  } else {
    payload.nextPiece = null;
  }
  return payload;
}

/** Idle payload when player has no plot (assigning or all full). */
function idleHudPayload(leaderboard?: LeaderboardPayload, noPlot?: boolean): HudPayload {
  const payload: HudPayload = {
    score: 0,
    level: 1,
    lines: 0,
    comboCount: 0,
    status: noPlot ? 'NO_PLOT' : 'ASSIGNING_PLOT',
    gameStarted: false,
    stackHeight: 0,
    nextPiece: null,
  };
  if (leaderboard) payload.leaderboard = leaderboard;
  return payload;
}

/**
 * Send HUD to this player. Routing: payload comes from their plot instance.
 * If no instance, sends idle state (ASSIGNING_PLOT or NO_PLOT when all plots full).
 * When instance has a pending line-clear burst, sends that first then clears it.
 */
export function sendHudToPlayer(
  player: Player,
  leaderboard?: LeaderboardPayload,
  noPlot?: boolean,
  musicMuted?: boolean,
  sfxMuted?: boolean
): void {
  const instance = getInstanceByPlayer(player.id);
  const payload = instance
    ? instance.getHudPayload(leaderboard)
    : idleHudPayload(leaderboard, noPlot);
  if (musicMuted !== undefined) payload.musicMuted = musicMuted;
  if (sfxMuted !== undefined) payload.sfxMuted = sfxMuted;
  player.ui.sendData(payload);

  if (instance?.pendingLineClearBurst) {
    const { points, linesCleared, comboCount } = instance.pendingLineClearBurst;
    player.ui.sendData({
      type: 'lineClearBurst',
      points,
      linesCleared,
      comboCount,
    });
    instance.pendingLineClearBurst = null;
  }
  if (instance?.pendingPieceLock) {
    player.ui.sendData({ type: 'pieceLock' });
    instance.pendingPieceLock = false;
  }
}

/** Send only leaderboard payload (e.g. periodic broadcast or after score submit). */
export function sendLeaderboardToPlayer(player: Player, payload: LeaderboardPayload): void {
  player.ui.sendData({ leaderboard: payload });
}
