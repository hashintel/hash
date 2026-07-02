/**
 * Grid traversal for the bubble-grid packer: enumerates every cell a capsule
 * kernel (corridor segment dilated by its radius) can influence.
 *
 * The spine is walked with an exact Amanatides-Woo traversal, so no crossed
 * cell can be missed by sampling gaps. At each crossed cell the spine's
 * clipped sub-segment is compared against the cell edges; neighbours within
 * the capsule radius of it are enumerated too. Because corridor radii are
 * ≪ the cell size (cells are 2 × the point-kernel field radius, capsules
 * less than half that), the ring-1 neighbours of crossed cells always cover
 * the full support. The packer clamps the radius to the cell size to keep
 * that invariant even if the constants drift.
 */

export interface CapsuleCellQuery {
  /** Spine endpoints (world units). */
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  /** Capsule kernel radius (world units); must be ≤ cellSize. */
  readonly radius: number;
  /** Grid frame. */
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
}

/**
 * Mark the crossed cell plus every neighbour the capsule can bleed into: the
 * clipped sub-segment's extent against the cell edges decides which sides
 * (and corners) the support crosses.
 */
function markCellWithNeighbours(
  {
    ax,
    ay,
    bx,
    by,
    originX,
    originY,
    cellSize,
    cols,
    rows,
    radius,
  }: CapsuleCellQuery,
  mark: (col: number, row: number) => void,
  col: number,
  row: number,
  tEnter: number,
  tExit: number,
): void {
  const dirX = bx - ax;
  const dirY = by - ay;

  const enterX = ax + dirX * tEnter;
  const enterY = ay + dirY * tEnter;

  const exitX = ax + dirX * tExit;
  const exitY = ay + dirY * tExit;

  const markClamped = (candidateCol: number, candidateRow: number): void => {
    if (
      candidateCol >= 0 &&
      candidateCol < cols &&
      candidateRow >= 0 &&
      candidateRow < rows
    ) {
      mark(candidateCol, candidateRow);
    }
  };

  markClamped(col, row);

  const cellMinX = originX + col * cellSize;
  const cellMinY = originY + row * cellSize;

  const nearLeft = Math.min(enterX, exitX) < cellMinX + radius;
  const nearRight = Math.max(enterX, exitX) > cellMinX + cellSize - radius;
  const nearBottom = Math.min(enterY, exitY) < cellMinY + radius;
  const nearTop = Math.max(enterY, exitY) > cellMinY + cellSize - radius;

  if (nearLeft) {
    markClamped(col - 1, row);
  }
  if (nearRight) {
    markClamped(col + 1, row);
  }
  if (nearBottom) {
    markClamped(col, row - 1);
  }
  if (nearTop) {
    markClamped(col, row + 1);
  }
  if (nearLeft && nearBottom) {
    markClamped(col - 1, row - 1);
  }
  if (nearLeft && nearTop) {
    markClamped(col - 1, row + 1);
  }
  if (nearRight && nearBottom) {
    markClamped(col + 1, row - 1);
  }
  if (nearRight && nearTop) {
    markClamped(col + 1, row + 1);
  }
}

/**
 * Invoke `mark` for every in-bounds cell the capsule's support can touch.
 * Cells may be reported more than once (straight walks revisit neighbours);
 * the caller dedupes.
 */
export function forEachCapsuleCell(
  query: CapsuleCellQuery,
  mark: (col: number, row: number) => void,
): void {
  const { ax, ay, bx, by, originX, originY, cellSize, cols, rows } = query;

  const clampCol = (value: number) =>
    Math.min(cols - 1, Math.max(0, Math.floor((value - originX) / cellSize)));
  const clampRow = (value: number) =>
    Math.min(rows - 1, Math.max(0, Math.floor((value - originY) / cellSize)));

  let col = clampCol(ax);
  let row = clampRow(ay);

  const endCol = clampCol(bx);
  const endRow = clampRow(by);

  const dirX = bx - ax;
  const dirY = by - ay;

  const stepCol = dirX > 0 ? 1 : -1;
  const stepRow = dirY > 0 ? 1 : -1;

  const tDeltaX = dirX !== 0 ? Math.abs(cellSize / dirX) : Infinity;
  const tDeltaY = dirY !== 0 ? Math.abs(cellSize / dirY) : Infinity;

  const nextBoundaryX = originX + (col + (stepCol > 0 ? 1 : 0)) * cellSize;
  const nextBoundaryY = originY + (row + (stepRow > 0 ? 1 : 0)) * cellSize;

  let tMaxX = dirX !== 0 ? (nextBoundaryX - ax) / dirX : Infinity;
  let tMaxY = dirY !== 0 ? (nextBoundaryY - ay) / dirY : Infinity;
  let tEnter = 0;

  // The walk normally ends at B's cell; the guard bound (a straight walk can
  // cross at most cols + rows cells) is a hard stop against float edge cases
  // on the boundary comparisons.
  for (let guard = 0; guard <= cols + rows + 2; guard++) {
    const tExit = Math.min(1, Math.min(tMaxX, tMaxY));
    markCellWithNeighbours(query, mark, col, row, tEnter, tExit);

    if ((col === endCol && row === endRow) || tExit >= 1) {
      break;
    }

    tEnter = tExit;
    if (tMaxX < tMaxY) {
      col += stepCol;
      tMaxX += tDeltaX;
    } else {
      row += stepRow;
      tMaxY += tDeltaY;
    }
  }
}
