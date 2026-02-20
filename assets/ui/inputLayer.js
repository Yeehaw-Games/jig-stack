/**
 * Unified input layer for JigStack HUD.
 * - Desktop: keyboard + existing buttons
 * - Mobile: touchControls routes actions through here
 *
 * Responsibilities:
 * - Send actions to server via hytopia.sendData
 * - Debounce / suppress double-fire
 * - Client-side pause gate (no server pause required)
 */
(function () {
  var DEFAULT_DEBOUNCE_MS = 70;

  var lastSentAtByAction = Object.create(null);
  var paused = false;

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function canSend(action, debounceMs) {
    var t = nowMs();
    var last = lastSentAtByAction[action] || 0;
    var win = typeof debounceMs === 'number' ? debounceMs : DEFAULT_DEBOUNCE_MS;
    if (t - last < win) return false;
    lastSentAtByAction[action] = t;
    return true;
  }

  function rawSend(action) {
    if (typeof hytopia !== 'undefined' && hytopia.sendData) {
      hytopia.sendData({ action: action });
    }
  }

  function sendAction(action, opts) {
    opts = opts || {};

    // Pause is client-side for now (do NOT change server gameplay logic).
    if (paused && action !== 'reset' && action !== 'start') return;

    // softDropUp/down are stateful; do not debounce them.
    if (action === 'softDropDown' || action === 'softDropUp') {
      rawSend(action);
      return;
    }

    if (!canSend(action, opts.debounceMs)) return;
    rawSend(action);

    if (opts.haptic === true && typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(opts.hapticMs || 10); } catch (_) {}
    }
  }
  function setPaused(next) {
    paused = !!next;
    // Ensure we don't get stuck soft-dropping if pause happens mid-hold.
    if (paused) {
      rawSend('softDropUp');
    }
  }

  function isPaused() {
    return paused;
  }

  window.JigStackInput = {
    sendAction: sendAction,
    setPaused: setPaused,
    isPaused: isPaused,
  };
})();
