/**
 * Easing between density grids of one selection: a re-delivery blends into
 * the picture on screen, then settles to exactly what its data describes.
 */
import type { HeatmapDensityGrid } from "./density-grid";

/** How much of a new grid shows per blend step; the rest is the shown one. */
export const HEATMAP_BLEND_WEIGHT = 0.5;
/**
 * Settle redraws after a blended paint, `HEATMAP_SETTLE_MS` apart (the
 * session's publish cadence), each halving what remains of the old picture;
 * the last paints the target exactly.
 */
export const HEATMAP_SETTLE_STEPS = 3;
export const HEATMAP_SETTLE_MS = 100;

export type HeatmapDisplay = {
  /** What is on screen. */
  grid: HeatmapDensityGrid;
  /** What the latest frames describe; `grid` converges to it. */
  target: HeatmapDensityGrid;
  /** Settle steps still to run before `grid` is `target`. */
  stepsLeft: number;
};

/**
 * The grid's density at `value` in `column`, sampled linearly between its
 * rows; 0 outside its value range.
 */
const sampleGrid = (
  grid: HeatmapDensityGrid,
  column: number,
  value: number,
): number => {
  if (grid.rows === 1) {
    return value >= grid.valueMin && value <= grid.valueMax
      ? grid.densities[column]!
      : 0;
  }
  const position =
    ((value - grid.valueMin) / (grid.valueMax - grid.valueMin)) *
    (grid.rows - 1);
  if (position < -0.5 || position > grid.rows - 0.5) {
    return 0;
  }
  const lowRow = Math.max(0, Math.min(grid.rows - 1, Math.floor(position)));
  const highRow = Math.min(grid.rows - 1, lowRow + 1);
  const highWeight = Math.max(0, Math.min(1, position - lowRow));
  return (
    grid.densities[lowRow * grid.columns + column]! * (1 - highWeight) +
    grid.densities[highRow * grid.columns + column]! * highWeight
  );
};

/**
 * `next` mixed with `previous` over the columns both have; appended columns
 * show `next` as is, and a lattice that moved is bridged by sampling
 * `previous` at each new row's value. A blended column's peak can sit below
 * 1 mid-transition — that lightening is the fade, and settling restores it.
 */
export const blendHeatmapGrids = (
  previous: HeatmapDensityGrid | null,
  next: HeatmapDensityGrid,
  weight = HEATMAP_BLEND_WEIGHT,
): HeatmapDensityGrid => {
  if (previous === null || weight >= 1) {
    return next;
  }
  const sharedColumns = Math.min(previous.columns, next.columns);
  if (sharedColumns === 0) {
    return next;
  }
  const rowStep =
    next.rows > 1 ? (next.valueMax - next.valueMin) / (next.rows - 1) : 0;
  const sameLattice =
    previous.rows === next.rows &&
    previous.valueMin === next.valueMin &&
    previous.valueMax === next.valueMax;
  const densities = new Float32Array(next.densities);
  for (let row = 0; row < next.rows; row++) {
    // A single-row grid's value sits at the center of its padded range.
    const value =
      next.rows > 1
        ? next.valueMin + row * rowStep
        : (next.valueMin + next.valueMax) / 2;
    for (let column = 0; column < sharedColumns; column++) {
      const index = row * next.columns + column;
      const before = sameLattice
        ? previous.densities[row * previous.columns + column]!
        : sampleGrid(previous, column, value);
      densities[index] =
        before * (1 - weight) + next.densities[index]! * weight;
    }
  }
  return { ...next, densities };
};

/** Eased in from `shown` when there is a picture to ease from. */
export const easeHeatmapDisplay = (
  shown: HeatmapDisplay | null,
  target: HeatmapDensityGrid,
): HeatmapDisplay => {
  if (shown === null) {
    return { grid: target, target, stepsLeft: 0 };
  }
  return {
    grid: blendHeatmapGrids(shown.grid, target),
    target,
    stepsLeft: HEATMAP_SETTLE_STEPS,
  };
};

/** One settle step; the last is the target itself, so the sequence ends exact. */
export const settleHeatmapDisplay = (shown: HeatmapDisplay): HeatmapDisplay => {
  if (shown.stepsLeft <= 1) {
    return { grid: shown.target, target: shown.target, stepsLeft: 0 };
  }
  return {
    grid: blendHeatmapGrids(shown.grid, shown.target),
    target: shown.target,
    stepsLeft: shown.stepsLeft - 1,
  };
};
