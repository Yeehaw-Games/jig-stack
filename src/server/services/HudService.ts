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
  /** Optional raw server status for NO_PLOT / ASSIGNING_PLOT; client uses for Start panel and hints. */
  serverStatus?: string;
  /** When present, client plays line-clear SFX and shows score burst (ordering guaranteed with pieceLock). */
  lineClearBurst?: { points: number; linesCleared: number; comboCount: number };
  /** When true, client plays block-land SFX. Sent in same payload as lineClearBurst when both occur. */
  pieceLock?: boolean;
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
    serverStatus: state.gameStatus,
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
    serverStatus: noPlot ? 'NO_PLOT' : 'ASSIGNING_PLOT',
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
 * Line-clear burst and piece-lock are included in the single payload so SFX ordering is guaranteed.
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

  if (instance?.pendingLineClearBurst) {
    const { points, linesCleared, comboCount } = instance.pendingLineClearBurst;
    payload.lineClearBurst = { points, linesCleared, comboCount };
    instance.pendingLineClearBurst = null;
  }
  if (instance?.pendingPieceLock) {
    payload.pieceLock = true;
    instance.pendingPieceLock = false;
  }

  player.ui.sendData(payload);
}

/** Send only leaderboard payload (e.g. periodic broadcast or after score submit). */
export function sendLeaderboardToPlayer(player: Player, payload: LeaderboardPayload): void {
  player.ui.sendData({ leaderboard: payload });
}
