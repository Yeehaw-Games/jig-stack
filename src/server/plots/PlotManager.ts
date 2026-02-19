/**
 * PlotManager: allocates and releases private Tetris plots per player.
 * Each plot has an origin (board 0,0 in world), shellBounds, boardBounds, and spawn point.
 * Max players = PLOT_COUNT; no PvP, state fully isolated per plot.
 *
 * Architecture: Reactor Arcade shell (platform, backdrop, columns) is built once per plot
 * at startup. clearBoard clears only boardBounds; shell is never cleared.
 */

import type { World } from 'hytopia';
import { BOARD_WIDTH } from '../config/tetris.js';
import { getReactorBounds, buildReactorArcadeBooth } from './ReactorArcade.js';

// --- Plot layout constants ---
export const PLOT_COUNT = 8;
export const PLOT_COLS = 4;
export const PLOT_ROWS = 2;

/**
 * World units between plot origins. Large gap so reactor shells do not overlap.
 */
export const PLOT_SPACING_X = 40;
export const PLOT_SPACING_Z = 40;

/** Base world position for the first plot origin. */
export const PLOT_ORIGIN_BASE = { x: 0, y: 0, z: 0 };

/** Spawn in front of board (on spawn pad). */
const SPAWN_OFFSET_X = Math.floor(BOARD_WIDTH / 2);
const SPAWN_OFFSET_Y = 1;
const SPAWN_OFFSET_Z = 5;

export interface Plot {
  id: string;
  /** World position where board (0,0) maps. */
  origin: { x: number; y: number; z: number };
  /** Full shell bounds (platform, backdrop, columns, vent, horizon). Never cleared. */
  shellBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Board-only bounds. clearBoard(plot) clears only this region. */
  boardBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Legacy: same as shellBounds for compatibility. */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** World position where player is teleported when assigned. */
  spawnPoint: { x: number; y: number; z: number };
  /** Set when a player is assigned; undefined when free. */
  assignedPlayerId?: string;
}

const plots: Plot[] = [];
/** playerId -> Plot (for routing input and HUD). */
const playerToPlot = new Map<string, Plot>();

/**
 * Initialize plot definitions and build reactor shell for each plot.
 * Call once when world starts. Shell is built once; clearBoard clears only boardBounds.
 */
export function initPlots(world: World): void {
  if (plots.length > 0) return;
  let idx = 0;
  for (let row = 0; row < PLOT_ROWS; row++) {
    for (let col = 0; col < PLOT_COLS; col++) {
      const origin = {
        x: PLOT_ORIGIN_BASE.x + col * PLOT_SPACING_X,
        y: PLOT_ORIGIN_BASE.y,
        z: PLOT_ORIGIN_BASE.z + row * PLOT_SPACING_Z,
      };
      const { shellBounds, boardBounds } = getReactorBounds(origin);
      const spawnPoint = {
        x: origin.x + SPAWN_OFFSET_X,
        y: origin.y + SPAWN_OFFSET_Y,
        z: origin.z + SPAWN_OFFSET_Z,
      };
      const plot: Plot = {
        id: `plot_${idx}`,
        origin: { ...origin },
        shellBounds: { ...shellBounds },
        boardBounds: { ...boardBounds },
        bounds: { ...shellBounds },
        spawnPoint: { ...spawnPoint },
      };
      plots.push(plot);
      buildReactorArcadeBooth(world, plot);
      idx++;
      if (idx >= PLOT_COUNT) break;
    }
    if (idx >= PLOT_COUNT) break;
  }
}

/**
 * Assign an available plot to the player. Returns the plot or null if all occupied.
 */
export function assignPlot(playerId: string): Plot | null {
  if (playerToPlot.has(playerId)) return playerToPlot.get(playerId)!;
  const plot = plots.find((p) => !p.assignedPlayerId);
  if (!plot) return null;
  plot.assignedPlayerId = playerId;
  playerToPlot.set(playerId, plot);
  return plot;
}

/**
 * Release the plot assigned to the player. Idempotent.
 */
export function releasePlot(playerId: string): void {
  const plot = playerToPlot.get(playerId);
  if (!plot) return;
  plot.assignedPlayerId = undefined;
  playerToPlot.delete(playerId);
}

/**
 * Get the plot assigned to the player, if any.
 */
export function getPlotByPlayer(playerId: string): Plot | undefined {
  return playerToPlot.get(playerId);
}

/**
 * Get all plots (for admin /plots and iteration).
 */
export function getAllPlots(): Plot[] {
  return [...plots];
}

/**
 * Number of plots (max concurrent players with active boards).
 */
export function getMaxPlots(): number {
  return plots.length || PLOT_COUNT;
}
