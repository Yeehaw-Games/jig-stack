/**
 * Mobile layout module.
 * Detects mobile mode and applies CSS classes + interaction guards:
 * - mobile if (touch) OR (viewport < 900px)
 * - safe switching on resize
 * - no scroll
 * - capture gestures to prevent camera movement
 * - disable pinch zoom (best effort)
 */

(function () {
  var MOBILE_BREAKPOINT_PX = 900;

  function hasTouch() {
    if (typeof window === 'undefined') return false;
    return (
      ('ontouchstart' in window) ||
      (navigator && (navigator.maxTouchPoints || navigator.msMaxTouchPoints) > 0)
    );
  }

  function getViewportWidth() {
    return (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
  }

  function detectMode() {
    var w = getViewportWidth();
    return (hasTouch() || w < MOBILE_BREAKPOINT_PX) ? 'mobile' : 'desktop';
  }

  var currentMode = 'desktop';
  var resizeTimer = null;

  function applyMode(mode) {
    currentMode = mode;
    var root = document.documentElement;
    var body = document.body;
    if (!root || !body) return;
    root.classList.toggle('mode-mobile', mode === 'mobile');
    root.classList.toggle('mode-desktop', mode === 'desktop');

    // Ensure a gesture-capture layer exists to prevent camera gestures beneath HUD.
    var layer = document.getElementById('mobile-gesture-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'mobile-gesture-layer';
      layer.setAttribute('aria-hidden', 'true');
      body.appendChild(layer);
    }

    layer.classList.toggle('active', mode === 'mobile');
    // Best-effort: prevent iOS gesture zoom.
    if (mode === 'mobile') {
      document.addEventListener('gesturestart', prevent, { passive: false });
      document.addEventListener('gesturechange', prevent, { passive: false });
      document.addEventListener('gestureend', prevent, { passive: false });
    } else {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend', prevent);
    }
  }

  function prevent(e) {
    if (e && e.preventDefault) e.preventDefault();
  }
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var next = detectMode();
      if (next !== currentMode) applyMode(next);
      if (window.JigStackTouchControls && window.JigStackTouchControls.refresh) {
        window.JigStackTouchControls.refresh();
      }
    }, 120);
  }

  function init() {
    currentMode = detectMode();
    applyMode(currentMode);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  window.JigStackMobileLayout = {
    init: init,
    getMode: function () { return currentMode; },
    detectMode: detectMode,
    applyMode: applyMode,
  };
})();
