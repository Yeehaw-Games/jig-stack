/**
 * In-world leaderboard SceneUI template (monitor on the right wall).
 * Registered so the server can create one instance at the panel position.
 */
(function () {
  if (typeof hytopia === 'undefined' || !hytopia.registerSceneUITemplate) return;

  hytopia.registerSceneUITemplate('tetris:leaderboard', function (id, onState) {
    var template = document.getElementById('tetris-leaderboard-template');
    if (!template || !template.content) return document.createElement('div');

    var clone = template.content.cloneNode(true);
    var statusEl = clone.querySelector('.scene-ui-status');
    var rowsEl = clone.querySelector('.scene-ui-rows');

    onState(function (state) {
      var leaderboard = state && state.leaderboard;
      if (!leaderboard || typeof leaderboard !== 'object') {
        if (statusEl) statusEl.textContent = '—';
        if (rowsEl) rowsEl.innerHTML = '<div class="leaderboard-empty">No scores yet</div>';
        return;
      }

      var status = leaderboard.status === 'online' ? 'online' : 'offline';
      if (statusEl) {
        statusEl.textContent = status === 'online' ? 'Online' : 'Offline';
        statusEl.className = 'leaderboard-status scene-ui-status ' + status;
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
        html += '<div class="leaderboard-row" data-player-id="' + (r.playerId || '') + '">';
        html += '<span class="rank">' + rank + '</span>';
        html += '<span class="name" title="' + name.replace(/"/g, '&quot;') + '">' + name.replace(/</g, '&lt;') + '</span>';
        html += '<span class="score">' + score + '</span>';
        html += '</div>';
      }
      rowsEl.innerHTML = html;
    });

    return clone;
  });
})();
