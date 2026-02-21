/**
 * NextPreview: right-side panel showing next piece in a 4x4 mini-grid.
 * Renders nextPiece.matrix with block color classes by piece type. Scale animation on update.
 */

(function (global) {
  var CONTAINER_ID = 'next-preview-container';
  var GRID_ID = 'next-preview-grid';
  var GRID_SIZE = 4;
  var PIECE_TYPE_TO_CLASS = {
    I: 'block-i',
    O: 'block-o',
    T: 'block-t',
    S: 'block-s',
    Z: 'block-z',
    J: 'block-j',
    L: 'block-l',
  };

  /**
   * Render a 4x4 matrix into the mini-grid. matrix[row][col], 1 = filled.
   * @param {number[][]} matrix - 4x4 grid (0 or 1)
   * @param {string} type - 'I'|'O'|'T'|'S'|'Z'|'J'|'L'
   */
  function renderMiniMatrix(matrix, type) {
    var container = document.getElementById(GRID_ID);
    if (!container) return;
    var typeKey = (type && typeof type === 'string' && type.toUpperCase) ? type.toUpperCase() : 'T';
    var cls = PIECE_TYPE_TO_CLASS[typeKey] || 'block-t';
    container.innerHTML = '';
    container.classList.remove('next-preview-updated');
    for (var row = 0; row < GRID_SIZE; row++) {
      for (var col = 0; col < GRID_SIZE; col++) {
        var cell = document.createElement('div');
        cell.className = 'next-preview-cell';
        var val = matrix && matrix[row] && matrix[row][col];
        if (val !== undefined && val !== null && val !== 0 && val !== '0') {
          cell.classList.add('filled', cls);
        }
        container.appendChild(cell);
      }
    }
    container.offsetHeight;
    container.classList.add('next-preview-updated');
  }

  /**
   * Update preview with next piece payload. If payload is null/undefined, hide or show placeholder.
   * @param {{ type: string, matrix: number[][] } | null | undefined} nextPiece
   */
  function update(nextPiece) {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    if (!nextPiece || !nextPiece.matrix || !nextPiece.type) {
      container.classList.add('next-preview-empty');
      renderMiniMatrix(Array(GRID_SIZE).fill(0).map(function () { return Array(GRID_SIZE).fill(0); }), 'T');
      return;
    }
    container.classList.remove('next-preview-empty');
    var typeKey = (nextPiece.type && typeof nextPiece.type === 'string' && nextPiece.type.toUpperCase) ? nextPiece.type.toUpperCase() : 'T';
    renderMiniMatrix(nextPiece.matrix, typeKey);
  }

  /** Ensure the grid has 16 cells so the layout is visible before the first payload. Call once when DOM is ready. */
  function ensureGridInited() {
    var grid = document.getElementById(GRID_ID);
    if (!grid || grid.children.length > 0) return;
    renderMiniMatrix(Array(GRID_SIZE).fill(0).map(function () { return Array(GRID_SIZE).fill(0); }), 'T');
  }

  global.TetrisHudComponents = global.TetrisHudComponents || {};
  global.TetrisHudComponents.NextPreview = {
    update: update,
    renderMiniMatrix: renderMiniMatrix,
    ensureGridInited: ensureGridInited,
    CONTAINER_ID: CONTAINER_ID,
    GRID_ID: GRID_ID,
    GRID_SIZE: GRID_SIZE,
  };

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureGridInited);
  } else if (typeof document !== 'undefined') {
    ensureGridInited();
  }
})(typeof window !== 'undefined' ? window : this);
