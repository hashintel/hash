/**
 * How a surface view samples its X×Y sub-grid: which axis positions it
 * visits, in what order, and with how many runs per cell.
 */

/** Runs a surface cell needs before its point appears. */
export const SURFACE_CELL_RUNS = 8;

/**
 * Sampled positions per axis: a subset of the slider's quantization, coarse
 * enough that a full X×Y sweep at `SURFACE_CELL_RUNS` stays affordable.
 */
export const SURFACE_GRID_POSITIONS = 11;

export type SurfaceCell = { x: number; y: number };

/** Evenly spread quantized positions of an axis with `stepCount + 1` steps. */
export const surfacePositions = (axis: { stepCount: number }): number[] => {
  const count = Math.min(SURFACE_GRID_POSITIONS, axis.stepCount + 1);
  const positions = Array.from({ length: count }, (_, index) =>
    Math.round((index * axis.stepCount) / (count - 1)),
  );
  return [...new Set(positions)];
};

/**
 * The cells of an `nx × ny` grid grouped into quad-tree refinement levels:
 * level 0 is the four corners, and each further level splits every region in
 * two over x and over y — the lattice `i / 2^level`, rounded onto the grid —
 * keeping only the cells no earlier level produced. Sampling level by level
 * paints a complete coarse picture after every level.
 */
export const quadTreeLevels = (nx: number, ny: number): SurfaceCell[][] => {
  const axisLevels = (count: number): number[] => {
    const levels = new Array<number>(count).fill(-1);
    let assigned = 0;
    for (let depth = 0; assigned < count && depth <= 30; depth++) {
      const points = 2 ** depth;
      for (let i = 0; i <= points; i++) {
        const index = Math.round((i / points) * (count - 1));
        if (levels[index] === -1) {
          levels[index] = depth;
          assigned += 1;
        }
      }
    }
    return levels;
  };

  const xLevels = axisLevels(nx);
  const yLevels = axisLevels(ny);
  const byLevel: SurfaceCell[][] = [];
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const level = Math.max(xLevels[x]!, yLevels[y]!);
      (byLevel[level] ??= []).push({ x, y });
    }
  }
  return byLevel.filter((level) => level.length > 0);
};

/**
 * Quad-tree levels cut into chunks of at most `chunkCells`. Chunks never span
 * levels, so each level paints as a unit.
 */
export const quadTreeChunks = (
  nx: number,
  ny: number,
  chunkCells: number,
): SurfaceCell[][] =>
  quadTreeLevels(nx, ny).flatMap((level) => {
    const chunks: SurfaceCell[][] = [];
    for (let start = 0; start < level.length; start += chunkCells) {
      chunks.push(level.slice(start, start + chunkCells));
    }
    return chunks;
  });
