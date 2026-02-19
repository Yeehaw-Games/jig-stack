/**
 * HUD message types sent from server to client UI.
 * Game HUD (score, level, lines, status) is sent every tick.
 * Leaderboard is sent on join and periodically (or after score submit).
 */

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  name: string;
  score: number;
}

export interface LeaderboardPayload {
  status: 'online' | 'offline';
  updatedAtMs: number;
  rows: LeaderboardRow[];
  selfPlayerId?: string;
}

export interface HudPayload {
  score: number;
  level: number;
  lines: number;
  status: string;
  gameStarted: boolean;
  /** When present, client updates the leaderboard panel. */
  leaderboard?: LeaderboardPayload;
  /** Optional raw server status for NO_PLOT / ASSIGNING_PLOT messages. */
  serverStatus?: string;
}
