#!/usr/bin/env node
/**
 * Generate assets/map.json for the Tetris arcade room.
 * Block IDs: 8=floor (stone), 15=wall (stone), 11=oak-log (trim/pillars), 5=accent (red), 12=sand (stage).
 * Indoor variety: full floor checkerboard (stone + sand), wall wainscoting,
 * ceiling edge trim, back wall base strip.
 * Clearance: no blocks at x in [-3,12], y in [-4,22], z in [-2,1] (board + procedural walls).
 */

// Smaller arena: reduced width and depth (was 60×55, now 43×45)
const ROOM_MIN_X = -18;
const ROOM_MAX_X = 24;
const ROOM_MIN_Z = -22;
const ROOM_MAX_Z = 22;
const WALL_Y_LO = 1;
const WALL_Y_HI = 20;
const CEILING_Y = 21;
const FLOOR_Y = 0;

const BOARD_X_LO = -3;
const BOARD_X_HI = 12;
const BOARD_Y_LO = -4;
const BOARD_Y_HI = 22;
const BOARD_Z_LO = -2;
const BOARD_Z_HI = 1;

function inClearance(x, y, z) {
  return x >= BOARD_X_LO && x <= BOARD_X_HI && y >= BOARD_Y_LO && y <= BOARD_Y_HI && z >= BOARD_Z_LO && z <= BOARD_Z_HI;
}

const BLOCK = {
  FLOOR: 8,
  WALL: 15,
  TRIM: 11,
  ACCENT: 5,
  STAGE: 12,
};

const blocks = {};

function set(x, y, z, id) {
  if (inClearance(x, y, z)) return;
  blocks[`${x},${y},${z}`] = id;
}

// Floor (y=0): checkerboard of stone (8) and sand (12) across the entire room (game overwrites board/wall cells at runtime).
// Use ((x+z)%2+2)%2 so negative coordinates alternate correctly (JS % can return -1).
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    const isSand = ((x + z) % 2 + 2) % 2 === 1;
    blocks[`${x},${FLOOR_Y},${z}`] = isSand ? BLOCK.STAGE : BLOCK.FLOOR;
  }
}

// Back wall (z = ROOM_MIN_Z) with hole for backplate; two strips
for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
  for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
    if (x >= -6 && x <= 15) continue; // hole for backplate
    set(x, y, ROOM_MIN_Z, BLOCK.WALL);
  }
}
// Back wall base strip (oak kick plate) where the wall exists
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  if (x >= -6 && x <= 15) continue;
  set(x, 1, ROOM_MIN_Z, BLOCK.TRIM);
}

// Backplate inset (z = ROOM_MIN_Z + 1)
for (let x = -6; x <= 15; x++) {
  for (let y = -2; y <= 22; y++) {
    if (inClearance(x, y, ROOM_MIN_Z + 1)) continue;
    set(x, y, ROOM_MIN_Z + 1, BLOCK.TRIM);
  }
}

// Left wall (x = ROOM_MIN_X)
for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MIN_X, y, z, BLOCK.WALL);
  }
}
// Left wall wainscoting: horizontal oak strips at y=2, y=11, y=19
for (const wy of [2, 11, 19]) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MIN_X, wy, z, BLOCK.TRIM);
  }
}

// Right wall (x = ROOM_MAX_X)
for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MAX_X, y, z, BLOCK.WALL);
  }
}
// Right wall wainscoting: horizontal oak strips at y=2, y=11, y=19
for (const wy of [2, 11, 19]) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MAX_X, wy, z, BLOCK.TRIM);
  }
}

// Ceiling (y = CEILING_Y)
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(x, CEILING_Y, z, BLOCK.WALL);
  }
}
// Ceiling edge trim (front and back) so the ceiling isn’t one flat grey
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  set(x, CEILING_Y, ROOM_MAX_Z, BLOCK.TRIM);
  if (x < -6 || x > 15) set(x, CEILING_Y, ROOM_MIN_Z, BLOCK.TRIM);
}

// Stage (y=1, in front of board)
for (let x = -2; x <= 11; x++) {
  for (let z = 3; z <= 8; z++) {
    set(x, 1, z, BLOCK.STAGE);
  }
}

// Marquee (above board, accent)
for (let x = -2; x <= 11; x++) {
  for (let z = -1; z <= 1; z++) {
    set(x, 20, z, BLOCK.ACCENT);
  }
}

// Monitor mount panel (right wall at ROOM_MAX_X, inset z 12..20, y 6..15)
for (let y = 6; y <= 15; y++) {
  for (let z = 12; z <= 20; z++) {
    set(ROOM_MAX_X, y, z, BLOCK.TRIM);
  }
}
for (let y = 5; y <= 16; y++) {
  set(ROOM_MAX_X, y, 11, BLOCK.ACCENT);
  set(ROOM_MAX_X, y, 21, BLOCK.ACCENT);
}
for (let z = 11; z <= 21; z++) {
  set(ROOM_MAX_X, 5, z, BLOCK.ACCENT);
  set(ROOM_MAX_X, 16, z, BLOCK.ACCENT);
}

// Four corner pillars (oak-log)
const corners = [[ROOM_MIN_X, ROOM_MIN_Z], [ROOM_MIN_X, ROOM_MAX_Z], [ROOM_MAX_X, ROOM_MIN_Z], [ROOM_MAX_X, ROOM_MAX_Z]];
for (const [px, pz] of corners) {
  for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
    set(px, y, pz, BLOCK.TRIM);
  }
}

// Front lip/railing (z = ROOM_MAX_Z, y=1) so players don't fall
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  set(x, 1, ROOM_MAX_Z, BLOCK.WALL);
}


const blockTypes = [
  { id: 1, name: "andesite", textureUri: "blocks/andesite.png", isCustom: false, isMultiTexture: false },
  { id: 2, name: "birch-leaves", textureUri: "blocks/birch-leaves.png", isCustom: false, isMultiTexture: false },
  { id: 3, name: "bricks", textureUri: "blocks/bricks.png", isCustom: false, isMultiTexture: false },
  { id: 4, name: "coal-ore", textureUri: "blocks/coal-ore.png", isCustom: false, isMultiTexture: false },
  { id: 5, name: "cobblestone", textureUri: "blocks/cobblestone.png", isCustom: false, isMultiTexture: false },
  { id: 6, name: "grass-block-pine", textureUri: "blocks/grass-block-pine", isCustom: false, isMultiTexture: true },
  { id: 7, name: "grass-block", textureUri: "blocks/grass-block", isCustom: false, isMultiTexture: true },
  { id: 8, name: "grass-flower-block-pine", textureUri: "blocks/grass-flower-block-pine", isCustom: false, isMultiTexture: true },
  { id: 9, name: "grass-flower-block", textureUri: "blocks/grass-flower-block", isCustom: false, isMultiTexture: true },
  { id: 10, name: "oak-leaves", textureUri: "blocks/oak-leaves.png", isCustom: false, isMultiTexture: false },
  { id: 11, name: "oak-log", textureUri: "blocks/oak-log", isCustom: false, isMultiTexture: true },
  { id: 12, name: "sand", textureUri: "blocks/sand.png", isCustom: false, isMultiTexture: false },
  { id: 13, name: "spruce-leaves", textureUri: "blocks/spruce-leaves.png", isCustom: false, isMultiTexture: false },
  { id: 14, name: "spruce-log", textureUri: "blocks/spruce-log", isCustom: false, isMultiTexture: true },
  { id: 15, name: "stone", textureUri: "blocks/stone.png", isCustom: false, isMultiTexture: false },
  { id: 16, name: "water", textureUri: "blocks/water.png", isCustom: false, isMultiTexture: false, isLiquid: true },
  { id: 17, name: "lamp", textureUri: "blocks/wool-yellow.png", isCustom: false, isMultiTexture: false },
];

const map = { blockTypes, blocks, entities: {}, version: "2.0.0" };
console.log(JSON.stringify(map, null, 2));
