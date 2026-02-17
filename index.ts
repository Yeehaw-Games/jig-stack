/**
 * Tetris — HYTOPIA SDK entry point.
 * Server-authoritative, tick-based gravity, solo-first. One world, one board, first player is controller.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logLeaderboardEnvStatus, checkSupabaseConnectivity } from './src/server/config/leaderboard.js';
import {
  startServer,
  Audio,
  DefaultPlayerEntity,
  DefaultPlayerEntityController,
  PlayerEvent,
  PlayerManager,
  PlayerUIEvent,
  RigidBodyType,
} from 'hytopia';
import type { World, WorldMap } from 'hytopia';
import { createInitialState } from './src/server/state/WorldState.js';
import type { TetrisState } from './src/server/state/types.js';
import { runTick } from './src/server/systems/GameLoop.js';
import { pushAction } from './src/server/systems/InputSystem.js';
import { clearRenderCache, render } from './src/server/systems/RenderSystem.js';
import { sendHudToPlayer } from './src/server/services/HudService.js';
import { handleCommand } from './src/server/services/CommandService.js';
import {
  getLeaderboardForHud,
  upsertPlayer,
  submitScore,
  broadcastLeaderboard,
  startLeaderboardBroadcastInterval,
  refreshCache,
} from './src/server/services/LeaderboardService.js';
import {
  BLOCK_TEXTURE_URIS,
  BOARD_WALL_BLOCK_ID,
  TICKS_PER_SECOND,
} from './src/server/config/tetris.js';
import { clearPlayer } from './src/server/systems/InputSystem.js';

const PLAYER_SPAWN = { x: 4, y: 10, z: 6 };

/** Block type id for spawn platform (floor). */
const FLOOR_BLOCK_ID = 8;

/** Build a small 5x3 platform under the player spawn so they land on it without blocking the board view. */
function placeSpawnPlatform(world: World): void {
  const y = PLAYER_SPAWN.y - 1; // block below feet
  for (let x = PLAYER_SPAWN.x - 2; x <= PLAYER_SPAWN.x + 2; x++) {
    for (let z = PLAYER_SPAWN.z - 1; z <= PLAYER_SPAWN.z + 1; z++) {
      world.chunkLattice.setBlock({ x, y, z }, FLOOR_BLOCK_ID);
    }
  }
}

/** Path to the arena map (loaded so the room is not empty). */
const MAP_PATH = join(process.cwd(), 'assets', 'map.json');

startServer((world: World) => {
  const state: TetrisState = createInitialState();
  let controllerPlayerId: string | null = null;
  let prevGameStatus: typeof state.gameStatus = state.gameStatus;

  // Load arena map first (floor, walls, stage, etc.); then we override block types 1–7, 8, 15 for Tetris/floor/wall
  try {
    const mapJson = readFileSync(MAP_PATH, 'utf-8');
    const map = JSON.parse(mapJson) as WorldMap;
    world.loadMap(map);
  } catch (err) {
    console.warn('Tetris: could not load assets/map.json:', (err as Error).message);
  }

  // Register block types before world.start() so chunk/world logic never sees unregistered IDs
  for (let id = 1; id <= 7; id++) {
    world.blockTypeRegistry.registerGenericBlockType({
      id,
      name: `tetris_${id}`,
      textureUri: BLOCK_TEXTURE_URIS[id] ?? 'blocks/stone.png',
    });
  }
  world.blockTypeRegistry.registerGenericBlockType({
    id: FLOOR_BLOCK_ID,
    name: 'floor',
    textureUri: 'blocks/stone.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: BOARD_WALL_BLOCK_ID,
    name: 'wall',
    textureUri: 'blocks/oak-log', // board frame = oak (multi-texture)
  });

  world.start();

  logLeaderboardEnvStatus();
  checkSupabaseConnectivity().catch(() => {});

  startLeaderboardBroadcastInterval(world);

  const SOUNDTRACK_URI = 'audio/game-over.mp3';
  const soundtrack = new Audio({
    uri: SOUNDTRACK_URI,
    loop: true,
    volume: 0.5,
  });
  soundtrack.play(world);

  /** Stop and remove any non-soundtrack audio (footsteps, block crunch/collision SFX, etc.) so only the soundtrack plays. */
  function muteNonSoundtrackAudio(): void {
    const toRemove: Audio[] = [];
    world.audioManager.getAllAudios().forEach((audio) => {
      if (audio.uri !== SOUNDTRACK_URI) toRemove.push(audio);
    });
    toRemove.forEach((audio) => {
      try {
        world.audioManager.unregisterAudio(audio);
      } catch {
        audio.setVolume(0);
        audio.pause();
      }
    });
  }

  let gameLoopStarted = false;
  let gameLoopIntervalRef: ReturnType<typeof setInterval> | null = null;
  let tickInProgress = false;
  const tickIntervalMs = 1000 / TICKS_PER_SECOND;

  /** Start the tick interval so actions (Start, R) are always consumed. Call when first player joins. */
  function startTickInterval(): void {
    if (gameLoopIntervalRef != null) return;
    clearRenderCache(world);
    render(state, world);
    setTimeout(tick, 0);
    gameLoopIntervalRef = setInterval(tick, tickIntervalMs);
  }

  /** Called when user clicks Start: enable gravity and game logic. */
  function setGameStarted(): void {
    if (gameLoopStarted) return;
    gameLoopStarted = true;
    clearRenderCache(world);
    render(state, world);
  }

  function tick(): void {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      muteNonSoundtrackAudio(); // Strip any SFX (steps, crunch, etc.) before tick
      runTick(world, state, controllerPlayerId, tickIntervalMs, gameLoopStarted);
      // Game over: submit controller's score and broadcast leaderboard (server-authoritative)
      if (prevGameStatus === 'RUNNING' && state.gameStatus === 'GAME_OVER' && controllerPlayerId) {
        const controller = PlayerManager.instance.getConnectedPlayersByWorld(world).find((p) => p.id === controllerPlayerId);
        if (controller) {
          submitScore(controller, state.score).then(() => {
            refreshCache();
            broadcastLeaderboard(world);
          });
        }
      }
      prevGameStatus = state.gameStatus;
      PlayerManager.instance.getConnectedPlayersByWorld(world).forEach((player) => {
        sendHudToPlayer(player, state, gameLoopStarted);
      });
      muteNonSoundtrackAudio(); // Again after tick so only soundtrack remains
    } catch (err) {
      clearRenderCache(world);
      render(state, world);
      if (typeof console !== 'undefined' && console.error) console.error('[Tetris] tick error', err);
    } finally {
      tickInProgress = false;
    }
  }

  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    player.ui.load('ui/index.html');
    if (controllerPlayerId == null) {
      controllerPlayerId = player.id;
    }
    startTickInterval();
    player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: Record<string, unknown> }) => {
      const action = data?.action as string | undefined;
      if (typeof action === 'string') {
        pushAction(player.id, action as Parameters<typeof pushAction>[1]);
        if (action === 'start') setGameStarted();
      }
    });
    upsertPlayer(player).then(() => {});
    const leaderboardPayload = getLeaderboardForHud(String(player.id));
    sendHudToPlayer(player, state, gameLoopStarted, leaderboardPayload);

    // Force full board render so client sees current game state
    clearRenderCache(world);
    render(state, world);

    // No platform: player floats at spawn so the board view isn't blocked (gravity disabled)
    // placeSpawnPlatform(world);
    const playerEntity = new DefaultPlayerEntity({
      player,
      name: 'Player',
      rigidBodyOptions: { type: RigidBodyType.DYNAMIC, gravityScale: 0 }, // float in space, don't fall
      controller: new DefaultPlayerEntityController({
        canWalk: () => false,
        canJump: () => false,
        canRun: () => false,
        canSwim: () => false,
      }),
    });
    playerEntity.spawn(world, PLAYER_SPAWN);
    // Ensure gravity stays off (in case rigidBodyOptions wasn't applied to player body)
    playerEntity.setGravityScale(0);
    // Remove any entity-attached sounds (e.g. footstep/step) so only the soundtrack plays
    world.audioManager.unregisterEntityAttachedAudios(playerEntity);
  });

  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    clearPlayer(player.id);
    if (controllerPlayerId === player.id) {
      controllerPlayerId = null;
    }
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach((e) => e.despawn());
  });

  world.on(PlayerEvent.CHAT_MESSAGE_SEND, ({ player, message }) => {
    const result = handleCommand(message, state);
    if (result.handled && result.message) {
      world.chatManager.sendPlayerMessage(player, result.message);
    }
  });

  clearRenderCache(world);
  render(state, world);
});
