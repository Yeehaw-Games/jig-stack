/**
 * Tetris HUD client: receives server state, sends actions (left, right, rotate, softDrop, hardDrop, reset).
 * Soft drop: mousedown/touchstart -> softDropDown, mouseup/touchend -> softDropUp.
 * Keyboard: Arrow keys or WASD (A left, D right, W rotate, S soft drop), Space hard drop, R reset.
 * Music: played from UI via HTML5 Audio so mute button can pause it (engine has no per-player mute API).
 */

(function () {
  var SCORE_BURST_DURATION_MS = 900;
  var SCREEN_SHAKE_DURATION_MS = 300;
  var LEVEL_UP_MOMENT_DURATION_MS = 1200;

  // Resolve assets base URL from this script's src (e.g. .../assets/ui/hud.js -> .../assets)
  var scriptEl = document.currentScript;
  var scriptSrc = scriptEl ? scriptEl.src : '';
  var assetsBase = scriptSrc.replace(/\/ui\/hud\.js(\?.*)?$/i, '');
  if (!assetsBase && typeof document !== 'undefined' && document.location) {
    var path = document.location.pathname || '';
    var uiIdx = path.indexOf('/ui/');
    if (uiIdx >= 0) assetsBase = (document.location.origin || '') + path.slice(0, uiIdx) + '/assets';
  }
  /** One-shot sound when game ends (play only on transition to GAME_OVER). */
  var gameOverSoundUrl = assetsBase ? assetsBase + '/audio/game-over.mp3' : '';
  /** Voice line after game-over sound. */
  var gameOverVoiceUrl = assetsBase ? assetsBase + '/audio/game-over-voice.mp3' : '';
  /** Jig stacked clip after game-over voice. */
  var jigStackedUrl = assetsBase ? assetsBase + '/audio/jig-stacked.mp3' : '';
  /** In-game looping background music (play only when status is RUNNING). */
  var soundtrackUrl = assetsBase ? assetsBase + '/audio/get-jiggy-with-jigg-stack.mp3' : '';
  /** Main BGM playlist; use host-injected array if present, else the following (repeats in order). */
  var soundtrackPlaylist = (typeof soundtrackPlaylist !== 'undefined' && Array.isArray(soundtrackPlaylist)) ? soundtrackPlaylist : (assetsBase ? [
    assetsBase + '/audio/get-jiggy-with-jigg-stack.mp3',
    assetsBase + '/audio/female-latin-jigg-stack.mp3',
    assetsBase + '/audio/jigg-stack.mp3',
    assetsBase + '/audio/never-stop-stackin.mp3',
    assetsBase + '/audio/jam-to-the-jigg-stack.mp3',
    assetsBase + '/audio/jigggggg-stack.mp3',
    assetsBase + '/audio/i-think-thats-how-my-mom-met-my-dad-jigg-stack.mp3',
    assetsBase + '/audio/ive-gotten-jigged-by-a-stack.mp3',
    assetsBase + '/audio/ill-play-with-you-like-jigg-stack.mp3',
    assetsBase + '/audio/my-favorite-game-is-jigg-stack.mp3',
    assetsBase + '/audio/ill-ignore-the-world-to-play-jigg-stack.mp3',
    assetsBase + '/audio/i-live-in-the-world-of-jigg-stack.mp3'
  ] : []);
  if (soundtrackPlaylist.length > 1) {
    for (var i = soundtrackPlaylist.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = soundtrackPlaylist[i];
      soundtrackPlaylist[i] = soundtrackPlaylist[j];
      soundtrackPlaylist[j] = t;
    }
  }
  var lineClearSoundUrl = assetsBase ? assetsBase + '/audio/line-clear.mp3' : '';
  /** One-shot when player clears exactly 2 lines. */
  var break2LinesSoundUrl = assetsBase ? assetsBase + '/audio/break-2-lines.mp3' : '';
  /** One-shot when player clears exactly 3 lines. */
  var break3LinesSoundUrl = assetsBase ? assetsBase + '/audio/break-3-lines.mp3' : '';
  /** One-shot when player clears exactly 4 lines (Tetris). */
  var break4LinesSoundUrl = assetsBase ? assetsBase + '/audio/break-4-lines.mp3' : '';
  /** One-shot when piece locks (lands). */
  var blockLandSoundUrl = assetsBase ? assetsBase + '/audio/block-land.mp3' : '';
  var buttonClickSoundUrl = assetsBase ? assetsBase + '/audio/button-click.mp3' : '';
  /** One-shot sound when player levels up. */
  var levelUpSoundUrl = assetsBase ? assetsBase + '/audio/level-up.mp3' : '';
  /** Trim start of button click (seconds) to skip silent lead-in. */
  var buttonClickTrimStart = 0.35;

  /** Last level we saw (to play level-up sound only when level increases). */
  var lastLevel = undefined;

  var soundtrackElements = [];
  /** Current track index in playlist (sequential playback; wraps to 0 after last). */
  var currentSoundtrackIndex = 0;
  /** User-initiated pause (independent of mute); when true, current track is paused. */
  var soundtrackPaused = false;
  var fadeTimerId = null;
  var SOUNDTRACK_TARGET_VOLUME = 0.5;
  var SOUNDTRACK_CROSSFADE_DURATION_MS = 1800;
  var lastStackHeight = 0;

  /** Derive a readable track title from a playlist URL (e.g. never-stop-stackin.mp3 -> "Never Stop Stackin"). */
  function urlToDisplayName(url) {
    if (!url || typeof url !== 'string') return '—';
    var name = url.replace(/^.*\//, '').replace(/\.mp3$/i, '').replace(/-/g, ' ');
    if (!name) return '—';
    return name.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function shouldPlaySoundtrack() {
    var isRunning = lastStatus === 'playing' || lastStatus === 'RUNNING';
    return isRunning && lastAppliedMusicMuted !== true;
  }

  function cancelFade() {
    if (fadeTimerId != null) {
      clearInterval(fadeTimerId);
      fadeTimerId = null;
    }
  }

  function getSoundtrackElements() {
    if (soundtrackElements.length === soundtrackPlaylist.length) return soundtrackElements;
    var n = soundtrackPlaylist.length;
    for (var i = 0; i < n; i++) {
      var url = soundtrackPlaylist[i];
      var audio = new window.Audio();
      audio.preload = 'auto';
      audio.loop = false;
      audio.volume = 0;
      audio.src = url;
      audio.load();
      (function (idx) {
        audio.addEventListener('ended', function onEnded() {
          if (!shouldPlaySoundtrack() || n < 2) return;
          var nextIndex = (idx + 1) % n;
          currentSoundtrackIndex = nextIndex;
          startTrackByIndex(soundtrackElements, nextIndex);
        });
      })(i);
      soundtrackElements.push(audio);
    }
    return soundtrackElements;
  }

  /** Crossfade from current track to target index (0 = main, 1 = intense). */
  function crossfadeToTrack(toIndex) {
    var elements = getSoundtrackElements();
    if (elements.length < 2 || toIndex === currentSoundtrackIndex) return;
    var fromIndex = currentSoundtrackIndex;
    var fromEl = elements[fromIndex];
    var toEl = elements[toIndex];
    toEl.currentTime = 0;
    toEl.volume = 0;
    toEl.play().catch(function () {});
    cancelFade();
    var start = Date.now();
    fadeTimerId = setInterval(function () {
      if (!shouldPlaySoundtrack()) {
        fromEl.pause();
        toEl.pause();
        cancelFade();
        return;
      }
      var elapsed = Date.now() - start;
      if (elapsed >= SOUNDTRACK_CROSSFADE_DURATION_MS) {
        fromEl.volume = 0;
        fromEl.pause();
        toEl.volume = SOUNDTRACK_TARGET_VOLUME;
        currentSoundtrackIndex = toIndex;
        cancelFade();
        return;
      }
      var t = elapsed / SOUNDTRACK_CROSSFADE_DURATION_MS;
      fromEl.volume = (1 - t) * SOUNDTRACK_TARGET_VOLUME;
      toEl.volume = t * SOUNDTRACK_TARGET_VOLUME;
    }, 50);
  }

  /** When stack height crosses threshold, crossfade between main and intense track (disabled for 2-track sequential playlist). */
  function applySoundtrackIntensity() {
    if (!shouldPlaySoundtrack()) return;
    var elements = getSoundtrackElements();
    if (elements.length < 2) return;
    if (soundtrackPlaylist.length === 2) return;
    var wantIntense = lastStackHeight >= STACK_HEIGHT_INTENSE_THRESHOLD;
    var wantIndex = wantIntense ? 1 : 0;
    if (wantIndex !== currentSoundtrackIndex && fadeTimerId == null) {
      crossfadeToTrack(wantIndex);
    }
  }

  var lastAppliedMusicMuted = undefined;
  var lastAppliedSfxMuted = undefined;
  /** Last normalized status (gameover = play game-over sound once). */
  var lastStatus = '';
  /** Current SFX muted state (for future SFX: check before playing). */
  window.__tetrisSfxMuted = false;

  function setMusicMuted(muted) {
    var elements = getSoundtrackElements();
    for (var i = 0; i < elements.length; i++) elements[i].pause();
    if (muted) cancelFade();
    updateMiniPlayerUI();
    /* When unmuted, playback is started only when status is RUNNING (see applySoundtrackForStatus). */
  }

  /** Sync mini player UI: title, Pause/Play button label, Next button enabled state. */
  function updateMiniPlayerUI() {
    var titleEl = document.getElementById('miniplayer-title');
    var pauseBtn = document.getElementById('btn-miniplayer-pause');
    var nextBtn = document.getElementById('btn-miniplayer-next');
    var n = soundtrackPlaylist.length;
    var displayName = n > 0 && currentSoundtrackIndex >= 0 && currentSoundtrackIndex < n
      ? urlToDisplayName(soundtrackPlaylist[currentSoundtrackIndex])
      : '—';
    if (titleEl) titleEl.textContent = displayName;
    var isPaused = soundtrackPaused || lastAppliedMusicMuted === true;
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? 'Play' : 'Pause';
      pauseBtn.setAttribute('aria-label', isPaused ? 'Play' : 'Pause');
    }
    if (nextBtn) {
      nextBtn.disabled = n < 2;
      nextBtn.setAttribute('aria-disabled', n < 2 ? 'true' : 'false');
    }
  }

  /** Play game-over sequence: game-over sound → game-over voice → jig stacked (respects SFX mute). */
  function playGameOverSound() {
    if (window.__tetrisSfxMuted || !gameOverSoundUrl) return;
    var gameOver = new window.Audio(gameOverSoundUrl);
    gameOver.volume = 0.6;
    gameOver.play().catch(function () {});
    gameOver.addEventListener('ended', function onGameOverEnded() {
      gameOver.removeEventListener('ended', onGameOverEnded);
      if (window.__tetrisSfxMuted || !gameOverVoiceUrl) return;
      var voice = new window.Audio(gameOverVoiceUrl);
      voice.volume = 0.6;
      voice.play().catch(function () {});
      voice.addEventListener('ended', function onVoiceEnded() {
        voice.removeEventListener('ended', onVoiceEnded);
        if (window.__tetrisSfxMuted || !jigStackedUrl) return;
        var jig = new window.Audio(jigStackedUrl);
        jig.volume = 0.6;
        jig.play().catch(function () {});
      });
    });
  }

  function startTrackByIndex(elements, index) {
    var el = (elements && elements.length) ? elements : getSoundtrackElements();
    if (!el.length) return;
    currentSoundtrackIndex = index;
    soundtrackPaused = false;
    for (var i = 0; i < el.length; i++) {
      if (i === index) {
        el[i].currentTime = 0;
        el[i].volume = SOUNDTRACK_TARGET_VOLUME;
        el[i].play().catch(function () {
          if (el.length > 1) {
            var nextIndex = (index + 1) % el.length;
            startTrackByIndex(el, nextIndex);
          }
        });
      } else {
        el[i].pause();
        el[i].volume = 0;
      }
    }
    updateMiniPlayerUI();
  }

  /** Next track: stop current, advance index, start next. Call from Next button or N key. */
  function goToNextTrack() {
    var elements = getSoundtrackElements();
    if (elements.length < 2) return;
    var currentEl = elements[currentSoundtrackIndex];
    if (currentEl) currentEl.pause();
    playButtonClickSound();
    soundtrackPaused = false;
    var nextIndex = (currentSoundtrackIndex + 1) % elements.length;
    startTrackByIndex(elements, nextIndex);
  }

  /** Toggle pause/play for mini player. Call from Pause button or P key. */
  function toggleMiniPlayerPause() {
    playButtonClickSound();
    var elements = getSoundtrackElements();
    var currentEl = elements.length > 0 && currentSoundtrackIndex >= 0 && currentSoundtrackIndex < elements.length ? elements[currentSoundtrackIndex] : null;
    soundtrackPaused = !soundtrackPaused;
    if (currentEl) {
      if (soundtrackPaused) currentEl.pause();
      else if (lastAppliedMusicMuted !== true) currentEl.play().catch(function () {});
    }
    updateMiniPlayerUI();
  }

  /** Start soundtrack from a user gesture (e.g. Start Game click) so the browser allows play(). */
  function startSoundtrackFromUserGesture() {
    if (lastAppliedMusicMuted === true) return;
    var elements = getSoundtrackElements();
    if (elements.length === 0) return;
    startTrackByIndex(elements, 0);
  }

  /** Start or stop soundtrack based on status and mute. Main track (get-jiggy) by default; intensity switches to intense track. */
  function applySoundtrackForStatus(status, musicMuted) {
    var elements = getSoundtrackElements();
    if (elements.length === 0) return;
    var isPlaying = (status === 'playing' || status === 'RUNNING') && !musicMuted;
    if (isPlaying) {
      cancelFade();
      // Only force track index 0/1 when using 2-track intensity mode (main vs intense). With a multi-track playlist, leave currentSoundtrackIndex alone so N and auto-advance work.
      if (soundtrackPlaylist.length < 2) {
        var wantIntense = typeof STACK_HEIGHT_INTENSE_THRESHOLD === 'number' && lastStackHeight >= STACK_HEIGHT_INTENSE_THRESHOLD;
        var idx = wantIntense ? 1 : 0;
        currentSoundtrackIndex = idx;
      }
      // Soundtrack starts only from user gesture (Start Game / Start New Game), not from server payload.
    } else {
      for (var i = 0; i < elements.length; i++) elements[i].pause();
      cancelFade();
    }
  }

  function send(action) {
    // Route through unified input layer when present (mobile + desktop).
    if (window.JigStackInput && window.JigStackInput.sendAction) {
      window.JigStackInput.sendAction(action);
      return;
    }
    if (typeof hytopia !== 'undefined' && hytopia.sendData) {
      hytopia.sendData({ action: action });
    }
  }

  function updateLeaderboard(leaderboard) {
    if (!leaderboard || typeof leaderboard !== 'object') return;
    var panel = document.getElementById('leaderboard-panel');
    var statusEl = document.getElementById('leaderboard-status');
    var rowsEl = document.getElementById('leaderboard-rows');
    if (!panel || !rowsEl) return;
    var status = leaderboard.status === 'online' ? 'online' : 'offline';
    var selfId = leaderboard.selfPlayerId;
    panel.classList.toggle('offline', status !== 'online');
    if (statusEl) {
      statusEl.textContent = status === 'online' ? 'Online' : 'Offline';
      statusEl.className = 'leaderboard-status ' + status;
    }
    var rows = Array.isArray(leaderboard.rows) ? leaderboard.rows : [];
    if (rows.length === 0) {
      rowsEl.innerHTML = '<div class="leaderboard-empty">No scores yet</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rank = r.rank != null ? r.rank : i + 1;
      var name = (r.name != null && r.name !== '') ? String(r.name) : (r.playerId || '—');
      var score = r.score != null ? Number(r.score) : 0;
      var isSelf = selfId != null && String(r.playerId) === String(selfId);
      html += '<div class="leaderboard-row' + (isSelf ? ' self' : '') + '" data-player-id="' + (r.playerId || '') + '">';
      html += '<span class="rank">' + rank + '</span>';
      html += '<span class="name" title="' + name.replace(/"/g, '&quot;') + '">' + name.replace(/</g, '&lt;') + '</span>';
      html += '<span class="score">' + score + '</span>';
      html += '</div>';
    }
    rowsEl.innerHTML = html;
  }

  function playLineClearSound(lines) {
    var url = lineClearSoundUrl;
    if (lines === 2 && break2LinesSoundUrl) url = break2LinesSoundUrl;
    else if (lines === 3 && break3LinesSoundUrl) url = break3LinesSoundUrl;
    else if (lines === 4 && break4LinesSoundUrl) url = break4LinesSoundUrl;
    if (window.__tetrisSfxMuted || !url) return;
    var audio = new window.Audio(url);
    audio.volume = 0.6;
    audio.play().catch(function () {});
  }

  function playBlockLandSound() {
    if (window.__tetrisSfxMuted || !blockLandSoundUrl) return;
    var audio = new window.Audio(blockLandSoundUrl);
    audio.volume = 0.6;
    audio.play().catch(function () {});
  }

  function playButtonClickSound() {
    if (window.__tetrisSfxMuted || !buttonClickSoundUrl) return;
    var audio = new window.Audio(buttonClickSoundUrl);
    audio.volume = 0.6;
    audio.currentTime = buttonClickTrimStart;
    audio.play().catch(function () {});
  }

  function playLevelUpSound() {
    if (window.__tetrisSfxMuted || !levelUpSoundUrl) return;
    var audio = new window.Audio(levelUpSoundUrl);
    audio.volume = 0.6;
    audio.play().catch(function () {});
  }

  function showScoreBurst(points, lines) {
    if (lines > 0) playLineClearSound(lines);
    var el = document.createElement('div');
    el.className = 'score-burst';
    el.textContent = '+' + points;
    if (lines === 4) {
      el.classList.add('tetris-burst');
    } else if (lines === 3) {
      el.classList.add('triple-burst');
    }
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, SCORE_BURST_DURATION_MS);
    if (lines >= 3) {
      document.body.classList.add('screen-shake');
      setTimeout(function () {
        document.body.classList.remove('screen-shake');
      }, SCREEN_SHAKE_DURATION_MS);
    }
  }

  var COMBO_BURST_DURATION_MS = 900;
  function showComboBurst(comboCount) {
    if (comboCount < 1) return;
    var pop = document.createElement('div');
    pop.className = 'combo-burst';
    pop.textContent = 'Combo x' + (comboCount + 1);
    document.body.appendChild(pop);
    setTimeout(function () {
      pop.remove();
    }, COMBO_BURST_DURATION_MS);
  }

  /** Short screen tint + "Level N" splash when level increases. */
  function showLevelUpMoment(level) {
    if (level == null || level === '') return;
    var overlay = document.createElement('div');
    overlay.className = 'level-up-moment';
    overlay.setAttribute('aria-hidden', 'true');
    var text = document.createElement('div');
    text.className = 'level-up-moment__text';
    text.textContent = 'Level ' + level;
    overlay.appendChild(text);
    document.body.appendChild(overlay);
    setTimeout(function () {
      overlay.remove();
    }, LEVEL_UP_MOMENT_DURATION_MS);
  }

  function updateUI(data) {
    const el = function id(name) { return document.getElementById(name); };
    if (data.type === 'lineClearBurst') {
      showScoreBurst(data.points, data.linesCleared);
      if (data.comboCount >= 1) showComboBurst(data.comboCount);
      if (data.linesCleared === 4 && typeof confetti === 'function') {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      }
      /* Fall through so merged payloads still update score/level/lines */
    }
    if (data.type === 'pieceLock') {
      playBlockLandSound();
      return;
    }
    if (data.stackHeight !== undefined) lastStackHeight = data.stackHeight;
    if (data.leaderboard !== undefined) updateLeaderboard(data.leaderboard);
    if (data.musicMuted !== undefined) {
      var muteBtn = el('btn-mute-music');
      if (muteBtn) {
        muteBtn.classList.toggle('muted', data.musicMuted);
        muteBtn.setAttribute('aria-label', data.musicMuted ? 'Unmute music' : 'Mute music');
        muteBtn.title = data.musicMuted ? 'Unmute music' : 'Mute music';
        muteBtn.textContent = (data.musicMuted ? '\uD83D\uDD07' : '\uD83C\uDFB5') + ' Music';
      }
      if (data.musicMuted !== lastAppliedMusicMuted) {
        lastAppliedMusicMuted = data.musicMuted;
        setMusicMuted(data.musicMuted);
        applySoundtrackForStatus(lastStatus, data.musicMuted);
      }
    }
    if (data.sfxMuted !== undefined) {
      lastAppliedSfxMuted = data.sfxMuted;
      window.__tetrisSfxMuted = data.sfxMuted;
      var sfxBtn = el('btn-mute-sfx');
      if (sfxBtn) {
        sfxBtn.classList.toggle('muted', data.sfxMuted);
        sfxBtn.setAttribute('aria-label', data.sfxMuted ? 'Unmute SFX' : 'Mute SFX');
        sfxBtn.title = data.sfxMuted ? 'Unmute sound effects' : 'Mute sound effects';
        sfxBtn.textContent = (data.sfxMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A') + ' SFX';
      }
    }
    // ——— ScoreBar component: score, level, lines + animation hooks ———
    var ScoreBar = window.TetrisHudComponents && window.TetrisHudComponents.ScoreBar;
    if (ScoreBar && (data.score !== undefined || data.level !== undefined || data.lines !== undefined)) {
      var changes = ScoreBar.update({ score: data.score, level: data.level, lines: data.lines });
      if (data.level !== undefined && lastLevel !== undefined && data.level > lastLevel) {
        playLevelUpSound();
        showLevelUpMoment(data.level);
      }
      if (data.level !== undefined) lastLevel = data.level;
      ScoreBar.applyAnimationClasses(changes);
    } else {
      if (data.score !== undefined) { var s = el('score'); if (s) s.textContent = data.score; }
      if (data.level !== undefined) {
        var l = el('level');
        if (l) l.textContent = data.level;
        if (lastLevel !== undefined && data.level > lastLevel) {
          playLevelUpSound();
          showLevelUpMoment(data.level);
        }
        lastLevel = data.level;
      }
      if (data.lines !== undefined) { var n = el('lines'); if (n) n.textContent = data.lines; }
    }
    if (data.comboCount !== undefined) {
      var c = el('combo');
      if (c) {
        c.textContent = data.comboCount === 0 ? '\u2014' : 'x' + (data.comboCount + 1);
        var statCombo = c.closest('.stat');
        if (statCombo) statCombo.classList.toggle('combo-active', data.comboCount > 0);
      }
    }
    // ——— Normalized status: gameover overlay, soundtrack, controls-hud visibility ———
    // Server sends RUNNING | GAME_OVER | ASSIGNING_PLOT | NO_PLOT; client uses playing | gameover | waiting
    if (data.status !== undefined) {
      var raw = data.status;
      var status = raw === 'RUNNING' ? 'playing' : (raw === 'GAME_OVER' ? 'gameover' : (raw === 'ASSIGNING_PLOT' || raw === 'NO_PLOT' ? 'waiting' : raw));
      var overlay = document.getElementById('game-over-overlay');
      if (overlay) {
        if (status === 'gameover') {
          var scoreEl = document.getElementById('game-over-score');
          var linesEl = document.getElementById('game-over-lines');
          if (scoreEl) scoreEl.textContent = data.score != null ? data.score : 0;
          if (linesEl) linesEl.textContent = data.lines != null ? data.lines : 0;
          overlay.classList.add('visible');
          overlay.setAttribute('aria-hidden', 'false');
          if (lastStatus !== 'gameover') {
            playGameOverSound();
            if (typeof confetti === 'function') {
              confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 } });
              setTimeout(function () {
                confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 }, colors: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181'] });
              }, 200);
            }
          }
        } else {
          overlay.classList.remove('visible');
          overlay.setAttribute('aria-hidden', 'true');
        }
      }
      applySoundtrackForStatus(status, lastAppliedMusicMuted === true);
      lastStatus = status;
      applySoundtrackIntensity();
    }

    // ——— Start Game panel (right-side HUD): visible only when game not started; hide during play and after game over until they click Start New Game. ———
    // Only show when we explicitly know the game hasn't started (gameStarted === false). If gameStarted is undefined (e.g. in partial payloads), don't change visibility to avoid a brief flash during gameplay.
    var serverStatus = data.serverStatus;
    var startPanel = document.getElementById('start-game-panel');
    if (startPanel && (data.gameStarted !== undefined || data.serverStatus !== undefined)) {
      var showStart = data.gameStarted === false && serverStatus !== 'NO_PLOT' && serverStatus !== 'ASSIGNING_PLOT';
      if (showStart) startPanel.classList.remove('hidden'); else startPanel.classList.add('hidden');
    }

    // ——— Server-only hint (NO_PLOT / ASSIGNING_PLOT). ———
    var hintEl = document.getElementById('hint-server-message');
    if (serverStatus === 'NO_PLOT') {
      if (hintEl) { hintEl.textContent = 'All plots full. Wait for a free plot.'; hintEl.classList.remove('hidden'); }
    } else if (serverStatus === 'ASSIGNING_PLOT') {
      if (hintEl) { hintEl.textContent = 'Assigning plot…'; hintEl.classList.remove('hidden'); }
    } else if (hintEl) {
      hintEl.classList.add('hidden');
    }

    // ——— Next piece preview (right side under leaderboard). Only update when payload includes next piece so partial payloads (e.g. leaderboard-only) don't clear the preview. Support both camelCase and snake_case. ———
    var nextPiecePayload = Object.prototype.hasOwnProperty.call(data, 'nextPiece') ? data.nextPiece : (Object.prototype.hasOwnProperty.call(data, 'next_piece') ? data.next_piece : undefined);
    if (nextPiecePayload !== undefined) {
      var NextPreview = window.TetrisHudComponents && window.TetrisHudComponents.NextPreview;
      if (NextPreview) NextPreview.update(nextPiecePayload);
    }
  }

  if (typeof hytopia !== 'undefined' && hytopia.onData) {
    hytopia.onData(updateUI);
  }
// Init mobile layout + touch controls (no-ops on desktop).
try {
  if (window.JigStackMobileLayout && window.JigStackMobileLayout.init) window.JigStackMobileLayout.init();
  if (window.JigStackTouchControls && window.JigStackTouchControls.init) window.JigStackTouchControls.init();
} catch (_) {}
  var buttons = document.querySelectorAll('.btn[data-action]');
  for (var i = 0; i < buttons.length; i++) {
    var btn = buttons[i];
    var action = btn.getAttribute('data-action');
    if (!action) continue;

    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      playButtonClickSound();
      var a = this.getAttribute('data-action');
      if (a === 'start' || a === 'reset') startSoundtrackFromUserGesture();
      send(a);
      if (a === 'softDropDown') this._softDropSent = true;
    });
    btn.addEventListener('mouseup', function () {
      if (this._softDropSent && this.getAttribute('data-action') === 'softDropDown') {
        send('softDropUp');
        this._softDropSent = false;
      }
    });
    btn.addEventListener('mouseleave', function () {
      if (this._softDropSent) {
        send('softDropUp');
        this._softDropSent = false;
      }
    });
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      playButtonClickSound();
      var a = this.getAttribute('data-action');
      if (a === 'start' || a === 'reset') startSoundtrackFromUserGesture();
      send(a);
      if (a === 'softDropDown') this._softDropSent = true;
    }, { passive: false });
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      if (this._softDropSent && this.getAttribute('data-action') === 'softDropDown') {
        send('softDropUp');
        this._softDropSent = false;
      }
    }, { passive: false });
  }

  // ——— Mute buttons: optimistic local toggle + notify server (event delegation so they work in any load order) ———
  function applyMuteButtonUi(btn, muted, isMusic) {
    if (!btn) return;
    btn.classList.toggle('muted', muted);
    if (isMusic) {
      btn.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
      btn.title = muted ? 'Unmute music' : 'Mute music';
      btn.textContent = (muted ? '\uD83D\uDD07' : '\uD83C\uDFB5') + ' Music';
    } else {
      btn.setAttribute('aria-label', muted ? 'Unmute SFX' : 'Mute SFX');
      btn.title = muted ? 'Unmute sound effects' : 'Mute sound effects';
      btn.textContent = (muted ? '\uD83D\uDD07' : '\uD83D\uDD0A') + ' SFX';
    }
  }

  function handleMuteButton(btn) {
    if (!btn || !btn.id) return;
    if (btn.id === 'btn-mute-music') {
      playButtonClickSound();
      if (lastAppliedMusicMuted === undefined) lastAppliedMusicMuted = false;
      lastAppliedMusicMuted = !lastAppliedMusicMuted;
      applyMuteButtonUi(btn, lastAppliedMusicMuted, true);
      setMusicMuted(lastAppliedMusicMuted);
      applySoundtrackForStatus(lastStatus, lastAppliedMusicMuted);
      send('toggleMusicMute');
    } else if (btn.id === 'btn-mute-sfx') {
      playButtonClickSound();
      if (lastAppliedSfxMuted === undefined) lastAppliedSfxMuted = false;
      lastAppliedSfxMuted = !lastAppliedSfxMuted;
      window.__tetrisSfxMuted = lastAppliedSfxMuted;
      applyMuteButtonUi(btn, lastAppliedSfxMuted, false);
      send('toggleSfxMute');
    }
  }

  function onMutePointerDown(e) {
    var target = e.target;
    var btn = target && target.id && (target.id === 'btn-mute-music' || target.id === 'btn-mute-sfx') ? target : (target && target.closest ? target.closest('#btn-mute-music, #btn-mute-sfx') : null);
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      handleMuteButton(btn);
    }
  }

  function onMiniPlayerPointerDown(e) {
    var target = e.target;
    var btn = target && target.closest ? target.closest('#btn-miniplayer-pause, #btn-miniplayer-next') : null;
    if (!btn || btn.disabled) return;
    if (btn.id === 'btn-miniplayer-pause') {
      e.preventDefault();
      e.stopPropagation();
      toggleMiniPlayerPause();
    } else if (btn.id === 'btn-miniplayer-next') {
      e.preventDefault();
      e.stopPropagation();
      goToNextTrack();
    }
  }

  document.addEventListener('mousedown', onMutePointerDown, true);
  document.addEventListener('touchstart', onMutePointerDown, { capture: true, passive: false });
  document.addEventListener('mousedown', onMiniPlayerPointerDown, true);
  document.addEventListener('touchstart', onMiniPlayerPointerDown, { capture: true, passive: false });

  updateMiniPlayerUI();

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.matches('input, textarea'))) return;
    var key = e.key;
    if (key === 'n' || key === 'N') { goToNextTrack(); e.preventDefault(); return; }
    if (key === 'p' || key === 'P') { toggleMiniPlayerPause(); e.preventDefault(); return; }
    if (key === 'm' || key === 'M') {
      var musicBtn = document.getElementById('btn-mute-music');
      if (musicBtn) handleMuteButton(musicBtn);
      e.preventDefault();
      return;
    }
    if (key === 'x' || key === 'X') {
      var sfxBtn = document.getElementById('btn-mute-sfx');
      if (sfxBtn) handleMuteButton(sfxBtn);
      e.preventDefault();
      return;
    }
    if (key === 'j' || key === 'J') {
      var startBtn = document.getElementById('btn-start-game');
      var startPanel = document.getElementById('start-game-panel');
      if (startBtn && startPanel && !startPanel.classList.contains('hidden')) {
        startBtn.click();
      }
      e.preventDefault();
      return;
    }
    if (window.JigStackInput && window.JigStackInput.isPaused && window.JigStackInput.isPaused()) return;

    if (key === 'ArrowLeft' || key === 'a' || key === 'A') { send('left'); e.preventDefault(); }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') { send('right'); e.preventDefault(); }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') { send('rotate'); e.preventDefault(); }
    if (key === 'ArrowDown' || key === 's' || key === 'S') { send('softDropDown'); e.preventDefault(); _softDropKey = true; }
    if (key === ' ') { send('hardDrop'); e.preventDefault(); }
    if (key === 'e' || key === 'E') { send('usePowerUp'); e.preventDefault(); }
    if (key === 'r' || key === 'R') { send('reset'); e.preventDefault(); }
  });
  document.addEventListener('keyup', function (e) {
    var key = e.key;
    if ((key === 'ArrowDown' || key === 's' || key === 'S') && typeof _softDropKey !== 'undefined' && _softDropKey) {
      send('softDropUp');
      _softDropKey = false;
    }
  });
  var _softDropKey = false;
})();
