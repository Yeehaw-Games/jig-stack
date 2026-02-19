/**
 * Reactor Arcade: Industrial Energy Reactor — Subtle Core Edition.
 * Per-plot floating platform, dark backdrop, two reactor columns with thin molten cores.
 * Builds once at startup; shell geometry is never cleared during board reset.
 * Visual architecture only: no gameplay or input changes.
 */

import type { World } from 'hytopia';
import { BOARD_WIDTH, BOARD_HEIGHT, BOARD_RENDER_HEIGHT } from '../config/tetris.js';
import type { Plot } from './PlotManager.js';

// ---------------------------------------------------------------------------
// Dimensions (match spec). Board origin = bottom-left corner.
// ---------------------------------------------------------------------------
const BOARD_W = BOARD_WIDTH;   // 10
const BOARD_H = BOARD_HEIGHT;  // 20

const PLATFORM_W = 22;
const PLATFORM_D = 14;
const PLATFORM_THICKNESS = 2;
const BOARD_OFFSET_FROM_BACK = 3;

const BACKDROP_W = 16;
const BACKDROP_H = 26;
const BACKDROP_THICKNESS = 1;
const BACKDROP_Z_OFFSET = -2;

const COLUMN_WIDTH = 3;
const COLUMN_DEPTH = 2;
const COLUMN_HEIGHT = 28;
const COLUMN_LEFT_OFFSET = -1;   // 1 block outside left board edge
const COLUMN_RIGHT_OFFSET = BOARD_W;
const STEEL_BAND_INTERVAL = 6;

const VENT_STRIP_LENGTH = 8;
const VENT_STRIP_INSET = 1;

const SPAWN_PAD_SIZE = 3;
const SPAWN_PAD_Z_OFFSET = 4;

const GLOW_SLIT_WIDTH = 10;
const GLOW_SLIT_HEIGHT = 1;
/** Backdrop lava band: fixed Y range (baseY + 12 to baseY + 13), spans full backdrop X at backdropZ. */
const BACKDROP_LAVA_BAND_Y_OFFSET = 12;
const BACKDROP_LAVA_BAND_HEIGHT = 2;

/** Ms between frame advances for column lava animation (visible scroll). */
const TICK_REACTOR_LAVA_MS = 140;

// ---------------------------------------------------------------------------
// Theme: dark industrial, subtle molten accents
// ---------------------------------------------------------------------------
export interface ReactorTheme {
  platformTopId: number;       // dark steel / charcoal
  platformTrimId: number;      // slightly lighter metallic
  platformUndersideId: number; // darker matte
  ventStripId: number;         // optional molten strip on platform edge
  spawnPadId: number;
  spawnPadCenterId: number;    // small 1-block molten indicator
  backdropId: number;          // deep charcoal
  backdropSeamId: number;     // horizontal darker stripe every 5 blocks
  glowSlitId: number;         // optional subtle lava at mid-height
  backdropLavaBandId: number; // horizontal lava band on backdrop (left→right)
  columnCasingId: number;     // dark matte, near black
  columnLavaId: number;       // 1-block vertical molten core (static fallback)
  /** Animation frames for column lava core (scrolling top→bottom). If length >= 2, core is animated. */
  columnLavaFrames: number[];
  columnBandId: number;       // steel band every 6 blocks
  horizonBeamId: number;       // unused; kept for block palette compatibility
}

export const DEFAULT_REACTOR_THEME: ReactorTheme = {
  platformTopId: 40,
  platformTrimId: 41,
  platformUndersideId: 42,
  ventStripId: 43,
  spawnPadId: 44,
  spawnPadCenterId: 45,
  backdropId: 46,
  backdropSeamId: 47,
  glowSlitId: 48,
  backdropLavaBandId: 48,     // same as glowSlitId for lava band on backdrop
  columnCasingId: 49,
  columnLavaId: 50,
  columnLavaFrames: [50, 53, 50, 53],  // 50=lava, 53=magma (different textures = visible motion)
  columnBandId: 51,
  horizonBeamId: 52,
};

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------
function setBlock(world: World, x: number, y: number, z: number, id: number): void {
  world.chunkLattice.setBlock({ x, y, z }, id);
}

/**
 * Heavy floating platform: dark steel top, lighter metallic trim on sides, darker matte underside.
 * Optional vent strip: 1 block wide, 8 blocks long, inset 1 on one side edge.
 */
function buildPlatform(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ReactorTheme
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
      const onSide = x === platformMinX || x === platformMaxX || z === platformBackZ || z === platformFrontZ;
      setBlock(world, x, platformTopY, z, onSide ? theme.platformTrimId : theme.platformTopId);
      setBlock(world, x, platformBottomY, z, theme.platformUndersideId);
    }
  }

  // Vent strip: 1 block wide, 8 blocks long, inset 1 on front edge (one side)
  const ventZ = platformFrontZ - VENT_STRIP_INSET;
  const ventStartX = boardCenterX - Math.floor(VENT_STRIP_LENGTH / 2);
  for (let dx = 0; dx < VENT_STRIP_LENGTH; dx++) {
    setBlock(world, ventStartX + dx, platformTopY, ventZ, theme.ventStripId);
  }
}

/**
 * Backdrop: deep charcoal base, horizontal seam every 5 blocks. Single lava band at fixed Y (baseY+12..13) spanning X left→right on backdrop plane. Optional glow slit at mid-height.
 */
function buildBackdrop(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ReactorTheme
): void {
  const backdropZ = oz + BACKDROP_Z_OFFSET;
  const halfW = Math.floor(BACKDROP_W / 2);
  const boardCenterX = ox + Math.floor(BOARD_W / 2);
  const minX = boardCenterX - halfW;
  const glowSlitMinX = boardCenterX - Math.floor(GLOW_SLIT_WIDTH / 2);

  const bandYMin = oy + BACKDROP_LAVA_BAND_Y_OFFSET;
  const bandYMax = bandYMin + BACKDROP_LAVA_BAND_HEIGHT - 1;

  for (let by = 0; by < BACKDROP_H; by++) {
    const y = oy + by;
    const isSeam = by > 0 && by % 5 === 0;  // every 5 blocks: 1-block thin darker stripe
    const inGlowSlit = by >= Math.floor((BACKDROP_H - GLOW_SLIT_HEIGHT) / 2) &&
      by < Math.floor((BACKDROP_H - GLOW_SLIT_HEIGHT) / 2) + GLOW_SLIT_HEIGHT;
    const inLavaBand = y >= bandYMin && y <= bandYMax;
    for (let bx = 0; bx < BACKDROP_W; bx++) {
      const x = minX + bx;
      let id = theme.backdropId;
      if (inLavaBand) id = theme.backdropLavaBandId;
      else if (isSeam) id = theme.backdropSeamId;
      else if (inGlowSlit && x >= glowSlitMinX && x < glowSlitMinX + GLOW_SLIT_WIDTH) id = theme.glowSlitId;
      setBlock(world, x, y, backdropZ, id);
    }
  }
}

/**
 * Two reactor columns: 3 wide, 2 deep, 28 high. Dark casing, 1-block lava core (top→bottom), steel bands every 6.
 */
function buildReactorColumns(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ReactorTheme
): void {
  const columnBaseY = oy - 2;
  const yBottom = columnBaseY;
  const yTop = columnBaseY + COLUMN_HEIGHT - 1;
  const zStart = oz - (COLUMN_DEPTH - 1);
  const zEnd = oz;

  for (const colSide of ['left', 'right'] as const) {
    const baseX = colSide === 'left' ? ox + COLUMN_LEFT_OFFSET : ox + COLUMN_RIGHT_OFFSET;
    const minX = colSide === 'left' ? baseX - (COLUMN_WIDTH - 1) : baseX;
    const maxX = colSide === 'left' ? baseX : baseX + (COLUMN_WIDTH - 1);
    const coreX = minX + Math.floor(COLUMN_WIDTH / 2);  // 1-block lava strip centered in 3x2 column
    const lavaId = theme.columnLavaFrames.length > 0 ? theme.columnLavaFrames[0] : theme.columnLavaId;

    for (let y = yTop; y >= yBottom; y--) {
      const dy = y - yBottom;
      const isBand = dy % STEEL_BAND_INTERVAL === 0;
      for (let z = zStart; z <= zEnd; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (x === coreX) {
            setBlock(world, x, y, z, lavaId);
          } else if (isBand) {
            setBlock(world, x, y, z, theme.columnBandId);
          } else {
            setBlock(world, x, y, z, theme.columnCasingId);
          }
        }
      }
    }
  }
}

/**
 * 3x3 dark spawn pad with small 1-block molten center. No bright neon outline.
 */
function buildSpawnPad(
  world: World,
  ox: number, oy: number, oz: number,
  theme: ReactorTheme
): void {
  const padZ = oz + SPAWN_PAD_Z_OFFSET;
  const boardCenterX = ox + Math.floor(BOARD_W / 2);
  const padMinX = boardCenterX - Math.floor(SPAWN_PAD_SIZE / 2);
  const padY = oy - 1;
  const centerDx = Math.floor(SPAWN_PAD_SIZE / 2);
  const centerDz = Math.floor(SPAWN_PAD_SIZE / 2);

  for (let dx = 0; dx < SPAWN_PAD_SIZE; dx++) {
    for (let dz = 0; dz < SPAWN_PAD_SIZE; dz++) {
      const isCenter = dx === centerDx && dz === centerDz;
      setBlock(world, padMinX + dx, padY, padZ + dz, isCenter ? theme.spawnPadCenterId : theme.spawnPadId);
    }
  }
}

// Per-plot animation state for column lava (frame index and last tick time).
const reactorLavaStateByPlotId = new Map<string, { lastMs: number; frame: number }>();

/**
 * Advance column lava animation and write lava core blocks. Call every tick from render path.
 * Uses frames[(frame + dy) % frames.length] so lava appears to flow top→bottom. No-op if columnLavaFrames.length < 2.
 */
export function tickReactorColumnLava(
  world: World,
  plot: Plot,
  nowMs: number,
  theme: ReactorTheme = DEFAULT_REACTOR_THEME
): void {
  const frames = theme.columnLavaFrames;
  if (!frames || frames.length < 2) return;

  let state = reactorLavaStateByPlotId.get(plot.id);
  if (!state) {
    state = { lastMs: nowMs, frame: 0 };
    reactorLavaStateByPlotId.set(plot.id, state);
  }
  const elapsed = nowMs - state.lastMs;
  if (elapsed >= TICK_REACTOR_LAVA_MS) {
    state.frame = (state.frame + 1) % frames.length;
    state.lastMs = nowMs;
  }

  const ox = plot.origin.x;
  const oy = plot.origin.y;
  const oz = plot.origin.z;
  const columnBaseY = oy - 2;
  const yBottom = columnBaseY;
  const yTop = columnBaseY + COLUMN_HEIGHT - 1;
  const zStart = oz - (COLUMN_DEPTH - 1);
  const zEnd = oz;
  const currentFrame = state.frame;

  for (const colSide of ['left', 'right'] as const) {
    const baseX = colSide === 'left' ? ox + COLUMN_LEFT_OFFSET : ox + COLUMN_RIGHT_OFFSET;
    const minX = colSide === 'left' ? baseX - (COLUMN_WIDTH - 1) : baseX;
    const coreX = minX + Math.floor(COLUMN_WIDTH / 2);

    for (let y = yTop; y >= yBottom; y--) {
      const dy = yTop - y;  // 0 at top, so pattern matches Lavafall
      const blockId = frames[(currentFrame + dy) % frames.length];
      for (let z = zStart; z <= zEnd; z++) {
        setBlock(world, coreX, y, z, blockId);
      }
    }
  }
}

/** Clear per-plot lava animation state when instance is destroyed. */
export function clearReactorLavaState(plotId: string): void {
  reactorLavaStateByPlotId.delete(plotId);
}

/**
 * Compute shellBounds and boardBounds from plot origin.
 * shellBounds includes platform, backdrop (and lava band), columns, vent strip. No floating horizon beam.
 * boardBounds is board-only; clearBoard(plot) clears only boardBounds.
 */
export function getReactorBounds(origin: { x: number; y: number; z: number }): {
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
  const colBottomY = oy - 2;
  const colTopY = colBottomY + COLUMN_HEIGHT - 1;
  const leftColMinX = ox + COLUMN_LEFT_OFFSET - (COLUMN_WIDTH - 1);
  const rightColMaxX = ox + COLUMN_RIGHT_OFFSET + (COLUMN_WIDTH - 1);
  const backdropZ = oz + BACKDROP_Z_OFFSET;

  const shellBounds = {
    minX: Math.min(platformMinX, leftColMinX),
    maxX: Math.max(platformMaxX, rightColMaxX),
    minY: oy - PLATFORM_THICKNESS,
    maxY: colTopY,
    minZ: backdropZ,
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
 * Build reactor shell once per plot at startup.
 * Platform, backdrop (with lava band), two reactor columns, spawn pad. No floating horizon beam.
 * Does not modify boardBounds. No animation loops or tick updates.
 */
export function buildReactorArcadeBooth(
  world: World,
  plot: Plot,
  theme: ReactorTheme = DEFAULT_REACTOR_THEME
): void {
  const { origin } = plot;
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;

  buildPlatform(world, ox, oy, oz, theme);
  buildBackdrop(world, ox, oy, oz, theme);
  buildReactorColumns(world, ox, oy, oz, theme);
  buildSpawnPad(world, ox, oy, oz, theme);
}
