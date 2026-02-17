/**
 * Tetris HUD client: receives server state, sends actions (left, right, rotate, softDrop, hardDrop, reset).
 * Soft drop: mousedown/touchstart -> softDropDown, mouseup/touchend -> softDropUp.
 * Keyboard: Arrow keys or WASD (A left, D right, W rotate, S soft drop), Space hard drop, R reset.
 */

(function () {
  function send(action) {
    if (typeof hytopia !== 'undefined' && hytopia.sendData) {
      hytopia.sendData({ action });
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

  function updateUI(data) {
    const el = function id(name) { return document.getElementById(name); };
    if (data.leaderboard !== undefined) updateLeaderboard(data.leaderboard);
    if (data.score !== undefined) { var s = el('score'); if (s) s.textContent = data.score; }
    if (data.level !== undefined) { var l = el('level'); if (l) l.textContent = data.level; }
    if (data.lines !== undefined) { var n = el('lines'); if (n) n.textContent = data.lines; }
    if (data.status !== undefined) {
      var statusEl = el('status');
      var statusStat = statusEl && statusEl.closest('.stat.status');
      if (statusEl) {
        statusEl.textContent = data.status;
        statusEl.setAttribute('data-status', data.status);
      }
      if (statusStat) {
        statusStat.style.display = 'none';
      }
      var overlay = document.getElementById('game-over-overlay');
      if (overlay) {
        if (data.status === 'GAME_OVER') {
          var scoreEl = document.getElementById('game-over-score');
          var linesEl = document.getElementById('game-over-lines');
          if (scoreEl) scoreEl.textContent = data.score != null ? data.score : 0;
          if (linesEl) linesEl.textContent = data.lines != null ? data.lines : 0;
          overlay.classList.add('visible');
          overlay.setAttribute('aria-hidden', 'false');
        } else {
          overlay.classList.remove('visible');
          overlay.setAttribute('aria-hidden', 'true');
        }
      }
    }
    if (data.gameStarted !== undefined) {
      var startArea = document.getElementById('start-area');
      var hint = document.getElementById('hint');
      if (data.gameStarted) {
        if (startArea) startArea.style.display = 'none';
        if (hint) hint.textContent = 'WASD or arrows: A/← left, D/→ right, W/↑ rotate, S/↓ soft drop. Space hard drop. R or Reset to restart.';
      } else {
        if (startArea) startArea.style.display = '';
        if (hint) hint.textContent = 'Click Start to begin the round.';
      }
    }
  }

  if (typeof hytopia !== 'undefined' && hytopia.onData) {
    hytopia.onData(function (data) {
      updateUI(data);
    });
  }

  var buttons = document.querySelectorAll('.btn[data-action]');
  for (var i = 0; i < buttons.length; i++) {
    var btn = buttons[i];
    var action = btn.getAttribute('data-action');
    if (!action) continue;

    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var a = this.getAttribute('data-action');
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
      var a = this.getAttribute('data-action');
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

  document.addEventListener('keydown', function (e) {
    var key = e.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') { send('left'); e.preventDefault(); }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') { send('right'); e.preventDefault(); }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') { send('rotate'); e.preventDefault(); }
    if (key === 'ArrowDown' || key === 's' || key === 'S') { send('softDropDown'); e.preventDefault(); _softDropKey = true; }
    if (key === ' ') { send('hardDrop'); e.preventDefault(); }
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
