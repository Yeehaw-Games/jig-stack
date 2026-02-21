/**
 * Touch controls for JigStack.
 * Gestures (mobile mode only):
 * - Tap left/right zones → move
 * - Swipe down → soft drop (hold until release)
 * - Long press → fast drop (soft drop hold)
 * - Two-finger tap → pause (client-side)
 * Buttons:
 * - Rotate
 * - Hard drop
 *
 * Constraints:
 * - No camera gestures: we capture all touches on mobile-gesture-layer.
 * - 44px min targets (enforced via CSS)
 * - Debounce inputs (via inputLayer)
 */

(function () {
  var TAP_MAX_MOVEMENT_PX = 12;
  var SWIPE_DOWN_THRESHOLD_PX = 38;
  var LONG_PRESS_MS = 260;

  var gestureLayer = null;
  var rotateBtn = null;
  var hardDropBtn = null;
  var pauseOverlay = null;

  var state = {
    active: false,
    startX: 0,
    startY: 0,
    startT: 0,
    moved: false,
    swipeDown: false,
    longPressTimer: null,
    softDropping: false,
    pointers: new Map(),
    twoFingerTapArmed: false,
  };
  function getMode() {
    return window.JigStackMobileLayout ? windackMobileLayout.getMode() : 'desktop';
  }

  function send(action, opts) {
    if (!window.JigStackInput || !window.JigStackInput.sendAction) return;
    window.JigStackInput.sendAction(action, opts);
  }

  function haptic(ms) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(ms || 10); } catch (_) {}
    }
  }
  function ensureOverlay() {
    var hud = document.getElementById('hud');
    if (!hud) return;

    // Controls bar
    var existing = document.getElementById('mobile-controls');
    if (!existing) {
      var bar = document.createElement('div');
      bar.id = 'mobile-controls';
      bar.innerHTML = '' +
        '<button type="button" class="btn btn-mobile" id="btn-mobile-rotate" aria-label="Rotate">⟳</button>' +
        '<button type="button" class="btn btn-mobile" id="btn-mobile-harddrop" aria-label="Hard drop">⬇⬇</button>';
      hud.appendChild(bar);
    }
    rotateBtn = document.getElementById('btn-mobile-rotate');
    hardDropBtn = document.getElementById('btn-mobile-harddrop');

    // Pause overlay
    if (!document.getElementById('mobile-pause-overlay')) {
      var ov = document.createElement('div');
      ov.id = 'mobile-pause-overlay';
      ov.innerHTML = '' +
        '<div class="pause-card">' +
        '  <div class="pause-title">Paused</div>' +
        '  <button type="button" class="btn btn-new-game" id="btn-mobile-resume" aria-label="Resume">Resume</button>' +
        '</div>';
      hud.appendChild(ov);
    }
    pauseOverlay = document.getElementById('mobile-pause-overlay');
    var resumeBtn = document.getElementById('btn-mobile-resume');
    if (resumeBtn && !resumeBtn._wired) {
      resumeBtn._wired = true;
      resumeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        setPaused(false);
      });
      resumeBtn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        setPaused(false);
      }, { passive: false });
    }
  }
  function setPaused(next) {
    if (!window.JigStackInput) return;
    window.JigStackInput.setPaused(next);
    if (pauseOverlay) pauseOverlay.classList.toggle('visible', !!next);
    if (!next) {
      // Clear any lingering drop state.
      if (state.softDropping) {
        send('softDropUp');
        state.softDropping = false;
      }
    }
  }

  function isPaused() {
    return window.JigStackInput && window.JigStackInput.isPaused && window.JigStackInput.isPaused();
  }

  function onRotate(e) {
    e.preventDefault();
    if (isPaused()) return;
    send('rotate', { haptic: true, hapticMs: 10 });
  }

  function onHardDrop(e) {
    e.preventDefault();
    if (isPaused()) return;
    send('hardDrop', { debounceMs: 120, haptic: true, hapticMs: 14 });
  }

  function clearLongPress() {
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
  }

  function beginSoftDrop() {
    if (state.softDropping) return;
    state.softDropping = true;
    send('softDropDown');
  }

  function endSoftDrop() {
    if (!state.softDropping) return;
    state.softDropping = false;
    send('softDropUp');
  }

  function onPointerDown(e) {
    if (getMode() !== 'mobile') return;
    if (!gestureLayer || !gestureLayer.classList.contains('active')) return;

    // If the tap hits a control button, let the button handle it.
    var t = e.target;
    if (t && (t.closest && t.closest('#mobile-controls, .btn, #btn-new-game, #btn-start-game, #btn-mute-music, #btn-mute-sfx'))) {
      return;
    }

    e.preventDefault();
    state.pointers.set(e.pointerId || 0, { x: e.clientX, y: e.clientY, t: Date.now() });
    if (state.pointers.size === 2) {
      state.twoFingerTapArmed = true;
      clearLongPress();
      return;
    }

    state.startX = e.clientX;
    state.startY = e.clientY;
    state.startT = Date.now();
    state.moved = false;
    state.swipeDown = false;

    clearLongPress();
    state.longPressTimer = setTimeout(function () {
      // Long press = fast drop (soft drop hold)
      if (!state.moved && !state.swipeDown && state.pointers.size === 1 && !isPaused()) {
        beginSoftDrop();
        haptic(12);
      }
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e) {
    if (getMode() !== 'mobile') return;
    if (!gestureLayer || !gestureLayer.classList.contains('active')) return;

    if (state.pointers.has(e.pointerId || 0)) {
      state.pointers.set(e.pointerId || 0, { x: e.clientX, y: e.clientY, t: Date.now() });
    }
    // If two fingers are down, don't interpret as move/drop.
    if (state.pointers.size >= 2) {
      clearLongPress();
      return;
    }

    var dx = e.clientX - state.startX;
    var dy = e.clientY - state.startY;

    if (Math.abs(dx) > TAP_MAX_MOVEMENT_PX || Math.abs(dy) > TAP_MAX_MOVEMENT_PX) {
      state.moved = true;
      clearLongPress();
    }
    // Swipe down triggers soft drop (hold until release)
    if (!state.swipeDown && dy > SWIPE_DOWN_THRESHOLD_PX && !isPaused()) {
      state.swipeDown = true;
      beginSoftDrop();
      haptic(10);
    }

    e.preventDefault();
  }

  function onPointerUp(e) {
    if (getMode() !== 'mobile') return;
    if (!gestureLayer || !gestureLayer.classList.contains('active')) return;

    e.preventDefault();
    var wasTwoFinger = state.pointers.size === 2 && state.twoFingerTapArmed;

    state.pointers.delete(e.pointerId || 0);

    if (wasTwoFinger && state.pointers.size === 0) {
      // Two-finger tap => pause toggle
      state.twoFingerTapArmed = false;
      setPaused(!isPaused());
      haptic(15);
      return;
    }

    clearLongPress();
    // End soft drop if it was active
    endSoftDrop();

    if (isPaused()) return;

    // Tap left/right halves to move
    if (!state.moved && !state.swipeDown) {
      var w = window.innerWidth || 1;
      if (e.clientX < w * 0.5) {
        send('left', { haptic: true, hapticMs: 8 });
      } else {
        send('right', { haptic: true, hapticMs: 8 });
      }
    }
    state.moved = false;
    state.swipeDown = false;
  }

  function wireButtons() {
    if (rotateBtn && !rotateBtn._wired) {
      rotateBtn._wired = true;
      rotateBtn.addEventListener('click', onRotate);
      rotateBtn.addEventListener('touchstart', onRotate, { passive: false });
    }
    if (hardDropBtn && !hardDropBtn._wired) {
      hardDropBtn._wired = true;
      hardDropBtn.addEventListener('click', onHardDrop);
      hardDropBtn.addEventListener('touchstart', onHardDrop, { passive: false });
    }
  }

  function wireLayer() {
    if (!gestureLayer || gestureLayer._wired) return;
    gestureLayer._wired = true;

    // Pointer events unify mouse/touch; we only act in mobile mode.
    gestureLayer.addEventListener('pointerdown', onPointerDown, { passive: false });
    gestureLayer.addEventListener('pointermove', onPointerMove, { passive: false });
    gestureLayer.addEventListener('pointerup', onPointerUp, { passive: false });
    gestureLayer.addEventListener('pointercancel', onPointerUp, { passive: false });

    // Prevent scroll on touchmove
    gestureLayer.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  }
  function refresh() {
    gestureLayer = document.getElementById('mobile-gesture-layer');
    ensureOverlay();
    wireButtons();
    wireLayer();

    // Toggle visibility
    var show = getMode() === 'mobile';
    var bar = document.getElementById('mobile-controls');
    if (bar) bar.classList.toggle('visible', show);
    if (pauseOverlay) pauseOverlay.classList.toggle('enabled', show);
  }

  function init() {
    refresh();
  }

  window.JigStackTouchControls = {
    init: init,
    refresh: refresh,
  };
})();
