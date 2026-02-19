/**
 * Per-instance rendering: one cache per plot, render at arbitrary origin, clear only boardBounds.
 * Reactor Arcade shell (platform/backdrop/columns) is built once and never cleared; no procedural walls.
 */

import type { World } from 'hytopia';
import { BOARD_WIDTH, BOARD_HEIGHT, BOARD_RENDER_HEIGHT, BOARD_WALL_BLOCK_ID, PIECE_TYPE_TO_BLOCK_ID } from '../config/tetris.js';
import type { TetrisState } from '../state/types.js';
import { getPieceCells } from '../systems/TetrisSystem.js';
import type { Plot } from '../plots/PlotManager.js';

const RENDER_FULL_REDRAW = true;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

interface InstanceCache {
  lastRendered: Map<string, number>;
  lastRenderedWall: Set<string>;
}

const instanceCaches = new Map<string, InstanceCache>();

function getCache(plotId: string): InstanceCache {
  let c = instanceCaches.get(plotId);
  if (!c) {
    c = { lastRendered: new Map(), lastRenderedWall: new Set() };
    instanceCaches.set(plotId, c);
  }
  return c;
}

function getDesiredCell(state: TetrisState, x: number, y: number): number {
  if (state.activePiece) {
    const cells = getPieceCells(state.activePiece);
    const type = state.activePiece.type;
    const safeType = type >= 1 && type <= 7 ? type : 1;
    for (const c of cells) {
      if (c.x === x && c.y === y) return safeType;
    }
  }
  if (y >= 0 && y < state.board.length && x >= 0 && x < state.board[0].length) {
    return state.board[y][x];
  }
  return 0;
}

function gridToWorld(origin: { x: number; y: number; z: number }, gx: number, gy: number): { x: number; y: number; z: number } {
  return {
    x: origin.x + gx,
    y: origin.y + gy,
    z: origin.z,
  };
}

const VALID_BLOCK_IDS = new Set([0, 1, 2, 3, 4, 5, 6, 7, BOARD_WALL_BLOCK_ID]);

/**
 * Render this instance's board and walls to the world at the given origin.
 * Uses per-plot cache so we only touch this plot's cells.
 */
export function renderInstance(
  state: TetrisState,
  world: World,
  origin: { x: number; y: number; z: number },
  plotId: string
): void {
  if (!state.board?.length || !state.board[0]) return;
  if (state.board.length !== BOARD_HEIGHT || state.board[0].length !== BOARD_WIDTH) return;

  const cache = getCache(plotId);
  const desired = new Map<string, number>();
  const width = state.board[0].length;
  const height = BOARD_RENDER_HEIGHT;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = getDesiredCell(state, x, y);
      const blockId = id === 0 ? 0 : PIECE_TYPE_TO_BLOCK_ID[id] ?? 0;
      desired.set(cellKey(x, y), blockId);
    }
  }

  // Reactor Arcade: no procedural walls (shell is built once by ReactorArcade).
  const newWallKeys = new Set<string>();
  for (const key of cache.lastRenderedWall) {
    if (!newWallKeys.has(key)) {
      const [x, y, z] = key.split(',').map(Number);
      world.chunkLattice.setBlock({ x, y, z }, 0);
    }
  }
  cache.lastRenderedWall = newWallKeys;

  const doFullRedraw = RENDER_FULL_REDRAW || cache.lastRendered.size === 0;
  const keysToApply = doFullRedraw ? desired.keys() : new Set([...cache.lastRendered.keys(), ...desired.keys()]);

  for (const key of keysToApply) {
    const next = desired.get(key) ?? 0;
    const prev = cache.lastRendered.get(key);
    if (doFullRedraw || prev !== next) {
      if (!VALID_BLOCK_IDS.has(next)) continue;
      const [x, y] = key.split(',').map(Number);
      const pos = gridToWorld(origin, x, y);
      world.chunkLattice.setBlock(pos, next);
    }
  }
  cache.lastRendered = desired;
}

/**
 * Clear this plot's rendered blocks (board + walls) and remove its cache.
 * Call when player leaves so the plot region is empty for the next assignee.
 */
export function clearInstanceRenderCache(world: World, plot: Plot): void {
  clearPlotRegion(world, plot);
  instanceCaches.delete(plot.id);
}

/**
 * Set all blocks in the plot's board bounds to air. Only clears boardBounds (active board area).
 * Shell geometry (platform, backdrop, beams) is never cleared.
 */
export function clearPlotRegion(world: World, plot: Plot): void {
  const { minX, maxX, minY, maxY, minZ, maxZ } = plot.boardBounds;
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        world.chunkLattice.setBlock({ x, y, z }, 0);
      }
    }
  }
}
