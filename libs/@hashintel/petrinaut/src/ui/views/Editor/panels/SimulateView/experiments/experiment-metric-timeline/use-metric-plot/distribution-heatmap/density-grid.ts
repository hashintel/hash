/**
 * Distribution frames as a column-normalized density grid: one column per
 * frame, one row per resolvable bin value, each column scaled so its own
 * densest cell is 1.
 */
import {
  MAX_RESOLVED_BIN_VALUES,
  summarizeBinValues,
} from "../../shared/metric-frames";

import type {
  BinValueSummary,
  DistributionMetricFrame,
} from "../../shared/metric-frames";

/** The slice of a distribution frame the heatmap reads. */
export type HeatmapFrame = Pick<
  DistributionMetricFrame,
  "time" | "bins" | "binExtent"
>;

export type HeatmapDensityGrid = {
  columns: number;
  rows: number;
  /** Row-major `[row * columns + column]`, in [0, 1]; row 0 is `valueMin`. */
  densities: Float32Array;
  valueMin: number;
  valueMax: number;
};

/** One grid row per this many device pixels of plot height, at most. */
const DEVICE_PIXELS_PER_ROW = 2;
/** One row per distinct value at most; the summary resolves that many. */
const MAX_ROWS = MAX_RESOLVED_BIN_VALUES;

type ValueLattice = {
  /** [min, max] over every bin value, padded to a span > 0. */
  range: [number, number];
  rows: number;
  /** The smallest gap between any two bin values across the chart. */
  minGap: number;
};

/**
 * One row per step of the smallest gap between bin values across the whole
 * chart, so a histogram over six values gets six contiguous cells rather
 * than thin stripes; capped at half the plot's device-pixel rows. The gap
 * spans frames: a value that never shares a frame with a near neighbour
 * would otherwise land between rows and splat onto values no run had.
 */
const valueLattice = (
  values: BinValueSummary,
  plotDevicePixelHeight: number,
): ValueLattice => {
  const rowCap = Math.max(
    1,
    Math.min(
      MAX_ROWS,
      Math.round(plotDevicePixelHeight / DEVICE_PIXELS_PER_ROW),
    ),
  );
  const { min, max, distinctValues } = values;
  if (min === max) {
    return { range: [min - 0.5, max + 0.5], rows: 1, minGap: 1 };
  }
  let minGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < distinctValues.length; index++) {
    minGap = Math.min(
      minGap,
      distinctValues[index]! - distinctValues[index - 1]!,
    );
  }
  if (distinctValues.length > rowCap) {
    return { range: [min, max], rows: rowCap, minGap };
  }
  const latticeRows = Math.round((max - min) / minGap) + 1;
  return { range: [min, max], rows: Math.min(latticeRows, rowCap), minGap };
};

/**
 * Each bin's count is spread over the rows its extent covers — `[v - below,
 * v + above]` as the producer declared it, or one lattice step around an
 * exact bin's value — weighted by overlap, so frames on different lattices
 * (an exact initial frame next to stride-binned GPU frames) do not alias
 * into alternating dark and empty rows. `values` defaults to a summary of
 * `frames`; the plugin passes the one the y scale already computed.
 */
export const buildHeatmapDensityGrid = (
  frames: readonly HeatmapFrame[],
  plotDevicePixelHeight: number,
  values: BinValueSummary | null = summarizeBinValues(frames),
): HeatmapDensityGrid | null => {
  if (values === null) {
    return null;
  }
  const lattice = valueLattice(values, plotDevicePixelHeight);
  const { rows } = lattice;
  const [valueMin, valueMax] = lattice.range;
  const rowStep = rows > 1 ? (valueMax - valueMin) / (rows - 1) : 1;
  const columns = frames.length;
  const densities = new Float32Array(rows * columns);

  for (let column = 0; column < columns; column++) {
    const frame = frames[column]!;
    const below = frame.binExtent?.below ?? lattice.minGap / 2;
    const above = frame.binExtent?.above ?? lattice.minGap / 2;
    for (const [value, count] of frame.bins) {
      // Row r spans [r - 0.5, r + 0.5] in these units.
      const lower = (value - below - valueMin) / rowStep;
      const upper = (value + above - valueMin) / rowStep;
      const extent = upper - lower;
      if (extent <= 0) {
        // The extent vanished in floating point (more distinct values than
        // rows); the whole count goes to the row the value falls in.
        const row = Math.round((value - valueMin) / rowStep);
        if (row >= 0 && row < rows) {
          densities[row * columns + column]! += count;
        }
        continue;
      }
      // The half bin reaching past the outermost row centers is off the grid
      // and not drawn; folding it into the edge rows would darken them for
      // a reason the data does not contain.
      const firstRow = Math.max(0, Math.floor(lower + 0.5));
      const lastRow = Math.min(rows - 1, Math.floor(upper + 0.5));
      for (let row = firstRow; row <= lastRow; row++) {
        const overlap = Math.min(upper, row + 0.5) - Math.max(lower, row - 0.5);
        if (overlap > 0) {
          densities[row * columns + column]! += (count * overlap) / extent;
        }
      }
    }

    let max = 0;
    for (let row = 0; row < rows; row++) {
      max = Math.max(max, densities[row * columns + column]!);
    }
    if (max > 0) {
      for (let row = 0; row < rows; row++) {
        densities[row * columns + column]! /= max;
      }
    }
  }

  return { columns, rows, densities, valueMin, valueMax };
};
