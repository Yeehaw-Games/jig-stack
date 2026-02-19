/**
 * Tetris — HYTOPIA SDK entry point.
 * Multi-player presence: each player gets a private plot with isolated Tetris instance.
 */

import 'dotenv/config';

import { logLeaderboardEnvStatus, checkSupabaseConnectivity } from './src/server/config/leaderboard.js';
import { startServer, Audio, PlayerEvent, PlayerManager, PlayerUIEvent } from 'hytopia';
import type { World } from 'hytopia';
import { runTick } from './src/server/systems/GameLoop.js';
import { pushAction } from './src/server/systems/InputSystem.js';
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
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_WALL_BLOCK_ID,
  TICKS_PER_SECOND,
} from './src/server/config/tetris.js';
import { clearPlayer } from './src/server/systems/InputSystem.js';
import { initPlots, assignPlot, releasePlot } from './src/server/plots/PlotManager.js';
import { DEFAULT_REACTOR_THEME } from './src/server/plots/ReactorArcade.js';
import { GameInstance } from './src/server/game/GameInstance.js';
import { registerInstance, unregisterInstance, getAllInstances, getInstanceByPlayer } from './src/server/game/InstanceRegistry.js';

/** Block type id for floor (used if a map is loaded later). */
const FLOOR_BLOCK_ID = 8;

/** Camera offset from plot origin so each player looks at their own board. */
function cameraPositionForPlot(origin: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return {
    x: origin.x + Math.floor(BOARD_WIDTH / 2),
    y: origin.y + Math.floor(BOARD_HEIGHT / 2),
    z: origin.z + 6,
  };
}

startServer((world: World) => {
  // Reactor Arcade: industrial reactor shell per plot (built once at startup).
  // Register block types before world.start()
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
    textureUri: 'blocks/oak-log',
  });

  // Reactor Arcade theme: dark industrial, subtle molten accents
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.platformTopId,
    name: 'reactor_platform_top',
    textureUri: 'blocks/wool-black.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.platformTrimId,
    name: 'reactor_platform_trim',
    textureUri: 'blocks/iron-block.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.platformUndersideId,
    name: 'reactor_platform_underside',
    textureUri: 'blocks/wool-black.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.ventStripId,
    name: 'reactor_vent_strip',
    textureUri: 'blocks/lava.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.spawnPadId,
    name: 'reactor_spawn_pad',
    textureUri: 'blocks/wool-black.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.spawnPadCenterId,
    name: 'reactor_spawn_center',
    textureUri: 'blocks/lava.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.backdropId,
    name: 'reactor_backdrop',
    textureUri: 'blocks/wool-black.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.backdropSeamId,
    name: 'reactor_backdrop_seam',
    textureUri: 'blocks/wool-dark-gray.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.glowSlitId,
    name: 'reactor_glow_slit',
    textureUri: 'blocks/lava.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.columnCasingId,
    name: 'reactor_column_casing',
    textureUri: 'blocks/wool-black.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.columnLavaId,
    name: 'reactor_column_lava',
    textureUri: 'blocks/lava.png',
  });
  // Second frame for column lava animation (visually distinct from lava.png)
  world.blockTypeRegistry.registerGenericBlockType({
    id: 53,
    name: 'reactor_column_lava_flow',
    textureUri: 'blocks/magma-block.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.columnBandId,
    name: 'reactor_column_band',
    textureUri: 'blocks/iron-block.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: DEFAULT_REACTOR_THEME.horizonBeamId,
    name: 'reactor_horizon_beam',
    textureUri: 'blocks/wool-black.png',
  });

  world.start();

  initPlots(world);

  logLeaderboardEnvStatus();
  checkSupabaseConnectivity().catch(() => {});

  startLeaderboardBroadcastInterval(world);

  const SOUNDTRACK_URI = 'audio/get-jiggy-with-jigg-stack.mp3';
  // Soundtrack is played client-side from the UI (assets/ui/hud.js) so the mute button can
  // actually pause it; the engine has no per-player mute API for world audio.
  // So we do not play the soundtrack on the world here.

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

  /** Track which players we've already submitted game-over score for (avoid duplicate submit). */
  const gameOverSubmittedIds = new Set<string>();
  /** Players who joined but got no plot (all full). Show NO_PLOT in HUD. */
  const noPlotPlayerIds = new Set<string>();
  /** Players who have muted music (client pauses soundtrack when true). */
  const mutedMusicPlayerIds = new Set<string>();
  /** Players who have muted SFX (used when playing SFX so we can skip or mute per player). */
  const mutedSfxPlayerIds = new Set<string>();

  let gameLoopIntervalRef: ReturnType<typeof setInterval> | null = null;
  let tickInProgress = false;
  const tickIntervalMs = 1000 / TICKS_PER_SECOND;

  function startTickInterval(): void {
    if (gameLoopIntervalRef != null) return;
    setTimeout(tick, 0);
    gameLoopIntervalRef = setInterval(tick, tickIntervalMs);
  }

  function tick(): void {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      muteNonSoundtrackAudio();
      runTick(world, tickIntervalMs);

      // Game over: submit score for solo players
      for (const instance of getAllInstances()) {
        if (instance.state.gameStatus !== 'GAME_OVER') continue;
        if (!gameOverSubmittedIds.has(instance.playerId)) {
          const pl = PlayerManager.instance.getConnectedPlayersByWorld(world).find((p) => p.id === instance.playerId);
          if (pl) {
            gameOverSubmittedIds.add(instance.playerId);
            submitScore(pl, instance.state.score).then(() => {
              refreshCache();
              broadcastLeaderboard(world);
            });
          }
        }
      }

      PlayerManager.instance.getConnectedPlayersByWorld(world).forEach((player) => {
        sendHudToPlayer(player, getLeaderboardForHud(String(player.id)), noPlotPlayerIds.has(player.id), mutedMusicPlayerIds.has(player.id), mutedSfxPlayerIds.has(player.id));
      });
      muteNonSoundtrackAudio();

    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('[Tetris] tick error', err);
    } finally {
      tickInProgress = false;
    }
  }

  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    player.ui.load('ui/index.html');
    startTickInterval();

    const plot = assignPlot(player.id);
    if (plot) {
      const instance = new GameInstance(plot, player.id);
      registerInstance(player.id, instance);
      instance.render(world);
      // Spawn point is available as plot.spawnPoint when using a PlayerEntity; camera targets this plot
      player.camera.setAttachedToPosition(cameraPositionForPlot(plot.origin));
    } else {
      noPlotPlayerIds.add(player.id);
      player.camera.setAttachedToPosition({ x: 0, y: 10, z: 0 });
      // HUD will show NO_PLOT via sendHudToPlayer
    }

    player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: Record<string, unknown> }) => {
      const action = data?.action as string | undefined;
      if (typeof action !== 'string') return;
      if (action === 'toggleMusicMute') {
        if (mutedMusicPlayerIds.has(player.id)) mutedMusicPlayerIds.delete(player.id);
        else mutedMusicPlayerIds.add(player.id);
        sendHudToPlayer(player, getLeaderboardForHud(String(player.id)), noPlotPlayerIds.has(player.id), mutedMusicPlayerIds.has(player.id), mutedSfxPlayerIds.has(player.id));
        return;
      }
      if (action === 'toggleSfxMute') {
        if (mutedSfxPlayerIds.has(player.id)) mutedSfxPlayerIds.delete(player.id);
        else mutedSfxPlayerIds.add(player.id);
        sendHudToPlayer(player, getLeaderboardForHud(String(player.id)), noPlotPlayerIds.has(player.id), mutedMusicPlayerIds.has(player.id), mutedSfxPlayerIds.has(player.id));
        return;
      }
      pushAction(player.id, action as Parameters<typeof pushAction>[1]);
      if (action === 'start') {
        const inst = getInstanceByPlayer(player.id);
        if (inst) inst.setGameStarted();
      }
    });

    upsertPlayer(player).then(() => {});
    sendHudToPlayer(player, getLeaderboardForHud(String(player.id)), noPlotPlayerIds.has(player.id), mutedMusicPlayerIds.has(player.id), mutedSfxPlayerIds.has(player.id));
  });

  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const instance = getInstanceByPlayer(player.id);
    if (instance) {
      instance.clearAndDestroy(world);
      unregisterInstance(player.id);
    }
    releasePlot(player.id);
    clearPlayer(player.id);
    gameOverSubmittedIds.delete(player.id);
    noPlotPlayerIds.delete(player.id);
    mutedMusicPlayerIds.delete(player.id);
    mutedSfxPlayerIds.delete(player.id);
  });

  world.on(PlayerEvent.CHAT_MESSAGE_SEND, ({ player, message }) => {
    const result = handleCommand(player.id, message);
    if (result.handled && result.message) {
      world.chatManager.sendPlayerMessage(player, result.message);
    }
  });
});
