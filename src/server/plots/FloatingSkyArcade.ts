/**
 * Floating Sky Arcade Booth: per-plot floating platform, backdrop, and frame beams.
 * Builds once at startup; shell geometry is never cleared during board reset.
 * Future-themeable via ArcadeTheme (e.g. Neon Void).
 */

import type { World } from 'hytopia';
import { BOARD_WIDTH, BOARD_HEIGHT, BOARD_RENDER_HEIGHT } from '../config/tetris.js';
import type { Plot } from './PlotManager.js';

// ---------------------------------------------------------------------------
// Dimensions (match spec exactly). Board origin = bottom-left corner.
// ---------------------------------------------------------------------------
const BOARD_W = BOARD_WIDTH;   // 10
const BOARD_H = BOARD_HEIGHT;  // 20

const PLATFORM_W = 22;
const PLATFORM_D = 14;
const PLATFORM_THICKNESS = 2;
const BOARD_OFFSET_FROM_BACK = 3;  // board sits 3 blocks from platform back edge

const BACKDROP_W = 16;
const BACKDROP_H = 26;
const BACKDROP_THICKNESS = 1;
const BACKDROP_Z_OFFSET = -2;  // behind board back edge

const BEAM_HEIGHT = 28;
const BEAM_THICKNESS_X = 1;
const BEAM_DEPTH = 2;
const BEAM_LEFT_OFFSET = -1;   // 1 block outside left board edge
const BEAM_RIGHT_OFFSET = BOARD_W; // 1 block outside right board edge

const ACCENT_STRIP_W = 14;
const ACCENT_STRIP_Y_OFFSET = 1;  // above backdrop top

const SPAWN_PAD_SIZE = 3;
const SPAWN_PAD_Z_OFFSET = 4;  // 4 blocks in front of board

// ---------------------------------------------------------------------------
// Theme (future: Neon Void etc. plug in here)
// ---------------------------------------------------------------------------
export interface ArcadeTheme {
  platformTopId: number;
  platformTrimId: number;
  backdropId: number;
  beamId: number;
  accentId: number;
  spawnPadId: number;
}

export const DEFAULT_ARCADE_THEME: ArcadeTheme = {
  platformTopId: 20,
  platformTrimId: 21,
  backdropId: 22,
  beamId: 23,
  accentId: 24,
  spawnPadId: 25,
};

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------
function setBlock(world: World, x: number, y: number, z: number, id: number): void {
  world.chunkLattice.setBlock({ x, y, z }, id);
}

/**
 * Build the floating platform centered under the board.
 * Board sits 3 blocks from back edge, centered horizontally.
 */
function buildPlatform(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ArcadeTheme
): void {
  const halfW = Math.floor(PLATFORM_W / 2);
  const boardCenterX = ox + Math.floor(BOARD_W / 2);
  const platformMinX = boardCenterX - halfW;
  const platformMaxX = platformMinX + PLATFORM_W - 1;

  const platformBackZ = oz - BOARD_OFFSET_FROM_BACK;
  const platformFrontZ = platformBackZ + PLATFORM_D - 1;

  const platformTopY = oy - 1;
  const platformBottomY = oy - PLATFORM_THICKNESS;

  for (let x = platformMinX; x <= platformMaxX; x++) {
    for (let z = platformBackZ; z <= platformFrontZ; z++) {
      setBlock(world, x, platformTopY, z, theme.platformTopId);
      setBlock(world, x, platformBottomY, z, theme.platformTrimId);
    }
  }
}

/**
 * Backdrop panel behind board at Z - 2 from board back edge.
 * Optional: alternate every 4 rows for subtle gradient.
 */
function buildBackdrop(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ArcadeTheme
): void {
  const backdropZ = oz + BACKDROP_Z_OFFSET;
  const halfW = Math.floor(BACKDROP_W / 2);
  const boardCenterX = ox + Math.floor(BOARD_W / 2);
  const minX = boardCenterX - halfW;
  const maxX = minX + BACKDROP_W - 1;

  for (let by = 0; by < BACKDROP_H; by++) {
    const y = oy + by;
    const rowAlternate = Math.floor(by / 4) % 2 === 0;
    for (let bx = 0; bx < BACKDROP_W; bx++) {
      const x = minX + bx;
      setBlock(world, x, y, backdropZ, theme.backdropId);
    }
  }
}

/**
 * Two vertical beams: 1 block outside left and right board edges.
 */
function buildBeams(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ArcadeTheme
): void {
  const beamBottomY = oy - 2;
  const beamTopY = beamBottomY + BEAM_HEIGHT - 1;
  const zStart = oz - (BEAM_DEPTH - 1);
  const zEnd = oz;

  for (const x of [ox + BEAM_LEFT_OFFSET, ox + BEAM_RIGHT_OFFSET]) {
    for (let y = beamBottomY; y <= beamTopY; y++) {
      for (let z = zStart; z <= zEnd; z++) {
        setBlock(world, x, y, z, theme.beamId);
      }
    }
  }
}

/**
 * Light accent strip above board: 14 blocks wide at backdrop top + 1.
 */
function buildAccentStrip(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ArcadeTheme
): void {
  const stripY = oy + BACKDROP_H + ACCENT_STRIP_Y_OFFSET;
  const halfW = Math.floor(ACCENT_STRIP_W / 2);
  const boardCenterX = ox + Math.floor(BOARD_W / 2);
  const minX = boardCenterX - halfW;
  const maxX = minX + ACCENT_STRIP_W - 1;
  const backdropZ = oz + BACKDROP_Z_OFFSET;

  for (let x = minX; x <= maxX; x++) {
    setBlock(world, x, stripY, backdropZ, theme.accentId);
  }
}

/**
 * 3x3 spawn pad, 4 blocks in front of board; different material.
 */
function buildSpawnPad(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ArcadeTheme
): void {
  const padZ = oz + SPAWN_PAD_Z_OFFSET;
  const boardCenterX = ox + Math.floor(BOARD_W / 2);
  const padMinX = boardCenterX - Math.floor(SPAWN_PAD_SIZE / 2);
  const padY = oy - 1;

  for (let dx = 0; dx < SPAWN_PAD_SIZE; dx++) {
    for (let dz = 0; dz < SPAWN_PAD_SIZE; dz++) {
      setBlock(world, padMinX + dx, padY, padZ + dz, theme.spawnPadId);
    }
  }
}

/**
 * Compute shellBounds and boardBounds from plot origin.
 * Used by PlotManager when creating plots and by buildFloatingSkyArcadeBooth.
 */
export function getArcadeBounds(origin: { x: number; y: number; z: number }): {
  shellBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  boardBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
} {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;

  const halfPW = Math.floor(PLATFORM_W / 2);
  const boardCenterX = ox + Math.floor(BOARD_W / 2);
  const platformMinX = boardCenterX - halfPW;
  const platformMaxX = platformMinX + PLATFORM_W - 1;
  const platformBackZ = oz - BOARD_OFFSET_FROM_BACK;
  const platformFrontZ = platformBackZ + PLATFORM_D - 1;
  const backdropTopY = oy + BACKDROP_H - 1;
  const accentY = oy + BACKDROP_H + ACCENT_STRIP_Y_OFFSET;

  const shellBounds = {
    minX: platformMinX,
    maxX: platformMaxX,
    minY: oy - PLATFORM_THICKNESS,
    maxY: accentY,
    minZ: oz + BACKDROP_Z_OFFSET,
    maxZ: platformFrontZ,
  };

  const boardBounds = {
    minX: ox,
    maxX: ox + BOARD_W - 1,
    minY: oy,
    maxY: oy + BOARD_RENDER_HEIGHT - 1,
    minZ: oz,
    maxZ: oz + 1,
  };

  return { shellBounds, boardBounds };
}

/**
 * Build floating platform, backdrop, vertical frame beams, accent strip, and spawn pad.
 * Does not modify boardBounds. Call once per plot at startup.
 */
export function buildFloatingSkyArcadeBooth(
  world: World,
  plot: Plot,
  theme: ArcadeTheme = DEFAULT_ARCADE_THEME
): void {
  const { origin } = plot;
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;

  buildPlatform(world, ox, oy, oz, theme);
  buildBackdrop(world, ox, oy, oz, theme);
  buildBeams(world, ox, oy, oz, theme);
  buildAccentStrip(world, ox, oy, oz, theme);
  buildSpawnPad(world, ox, oy, oz, theme);
}
