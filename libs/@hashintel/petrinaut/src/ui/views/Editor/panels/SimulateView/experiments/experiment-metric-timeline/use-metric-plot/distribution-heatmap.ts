/**
 * The distribution heatmap: a uPlot plugin that paints every streamed
 * distribution frame as one column of a density image.
 *
 * The pipeline is fixed. Each frame's bins are painted onto a value-axis
 * grid at the histogram's own resolution (one row per bin step, capped at
 * plot-pixel resolution), each bin spread over the rows its extent covers,
 * each column normalized against its own maximum (full color marks the most
 * likely value at that time step), and the grid drawn through a magma lookup
 * table in a single `drawImage` — no per-bin canvas state: what is dark is
 * exactly where the runs concentrated.
 *
 * Two things keep a streaming picture honest AND calm. Bins are painted by
 * the extent their producer declared, not as points: frames on different
 * lattices (the host-emitted exact initial frame next to GPU frames binned
 * at a stride; a probe's guessed window next to the calibrated one) would
 * otherwise alias into alternating dark and empty rows. And within one
 * selection, each new grid eases in from the one on screen (resampled by
 * value when the lattice moved) and settles over a few steps, so a
 * cumulative re-delivery — a GPU tile, a re-run, a pipelined rung folding
 * in — blends in instead of snapping the whole picture, and the stream's
 * last delivery ends in exactly the picture its data describes.
 */
import uPlot from "uplot";

import { distributionFramesFrom } from "../shared/metric-frames";

import type {
  DistributionMetricFrame,
  MetricFrame,
} from "../shared/metric-frames";

/** The slice of a distribution frame the heatmap reads. */
export type HeatmapFrame = Pick<
  DistributionMetricFrame,
  "time" | "bins" | "binExtent"
>;

/** One grid row per this many device pixels of plot height, at most. */
const DEVICE_PIXELS_PER_ROW = 2;
const MAX_ROWS = 512;

export type HeatmapDensityGrid = {
  columns: number;
  rows: number;
  /** Row-major `[row * columns + column]`, in [0, 1]; row 0 is `valueMin`. */
  densities: Float32Array;
  valueMin: number;
  valueMax: number;
};

type ValueLattice = {
  /** [min, max] over every bin value, padded to a span > 0. */
  range: [number, number];
  rows: number;
  /** The smallest gap between any two bin values across the chart. */
  minGap: number;
};

/**
 * The value range the frames' bins cover, and the grid rows that resolve
 * them: one row per step of the smallest gap between any two bin values
 * across the whole chart, so a histogram is drawn at its own resolution —
 * a distribution over six values gets six contiguous cells, not six thin
 * stripes with gaps — capped at (half) the plot's device-pixel height,
 * past which finer rows cannot be seen. The gap must consider values from
 * different frames too: a value that never shares a frame with a near
 * neighbour (a bistable metric's transitional step, say) would otherwise
 * land between rows and splat onto values no run ever had.
 */
function valueLattice(
  frames: readonly HeatmapFrame[],
  plotDevicePixelHeight: number,
): ValueLattice | null {
  const rowCap = Math.max(
    1,
    Math.min(
      MAX_ROWS,
      Math.round(plotDevicePixelHeight / DEVICE_PIXELS_PER_ROW),
    ),
  );
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  // Once there are more distinct values than rows the cap decides alone
  // (distinct values within a span force a gap small enough that the
  // lattice needs at least that many rows), so stop collecting them.
  const distinct = new Set<number>();
  for (const frame of frames) {
    for (const [value] of frame.bins) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (distinct.size <= rowCap) {
        distinct.add(value);
      }
    }
  }
  if (!Number.isFinite(min)) {
    return null;
  }
  if (min === max) {
    return { range: [min - 0.5, max + 0.5], rows: 1, minGap: 1 };
  }
  const sorted = [...distinct].sort((left, right) => left - right);
  let minGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < sorted.length; index++) {
    minGap = Math.min(minGap, sorted[index]! - sorted[index - 1]!);
  }
  if (distinct.size > rowCap) {
    return { range: [min, max], rows: rowCap, minGap };
  }
  const latticeRows = Math.round((max - min) / minGap) + 1;
  return { range: [min, max], rows: Math.min(latticeRows, rowCap), minGap };
}

/**
 * Rasterize the frames into a column-normalized density grid: each bin's
 * count is spread over the rows its extent covers (`[v - below, v + above]`
 * as the producer declared it; an exact bin gets the cell of one lattice
 * step around its value), weighted by overlap, then every column is scaled
 * so its own densest cell is 1. A bin exactly on the lattice lands wholly in
 * its row; a bin wider than a row fills every row it spans evenly; a bin
 * between rows shares out by area. Nothing is inferred from which values a
 * frame happens to occupy: a sparse or two-mode frame stays sparse.
 */
export function buildHeatmapDensityGrid(
  frames: readonly HeatmapFrame[],
  plotDevicePixelHeight: number,
): HeatmapDensityGrid | null {
  const lattice = valueLattice(frames, plotDevicePixelHeight);
  if (!lattice) {
    return null;
  }
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
      // The bin's extent in row units, where row r spans [r - 0.5, r + 0.5].
      const lower = (value - below - valueMin) / rowStep;
      const upper = (value + above - valueMin) / rowStep;
      const extent = upper - lower;
      if (extent <= 0) {
        // Narrower than floating point resolves at this value (the chart
        // has more distinct values than rows, so the lattice gap is far
        // below the row step): the whole count goes to the row the value
        // falls in. Dropping it would erase runs that happened.
        const row = Math.round((value - valueMin) / rowStep);
        if (row >= 0 && row < rows) {
          densities[row * columns + column]! += count;
        }
        continue;
      }
      // Weight by overlap with the bin's full extent. The half bin reaching
      // past the outermost row centers is off the grid and simply not drawn
      // — renormalizing it into the edge rows made them darker than the
      // interior, an artifact of the grid's bounds rather than the data.
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
}

/**
 * How much of a new grid shows per blend step; the rest is the picture
 * already on screen.
 */
export const HEATMAP_BLEND_WEIGHT = 0.5;

/**
 * The previous grid's density at `value` in `column`, sampled linearly
 * between its rows; 0 outside its value range.
 */
function sampleGrid(
  grid: HeatmapDensityGrid,
  column: number,
  value: number,
): number {
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
}

/**
 * `next` mixed with what was on screen, so a re-delivery that reshapes
 * existing columns eases in rather than snapping. Columns `previous` never
 * had (frames appended since) show `next` as is; a lattice that moved is
 * bridged by sampling `previous` at each new row's value. Blending two
 * column-normalized grids can leave a column's peak below 1 mid-transition —
 * that lightening IS the fade, and the settle steps take it back to 1.
 */
export function blendHeatmapGrids(
  previous: HeatmapDensityGrid | null,
  next: HeatmapDensityGrid,
  weight = HEATMAP_BLEND_WEIGHT,
): HeatmapDensityGrid {
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
}

/**
 * The settle that follows a blended paint when no further data arrives:
 * `HEATMAP_SETTLE_STEPS` redraws, `HEATMAP_SETTLE_MS` apart (the session's
 * publish cadence), each halving what remains of the old picture, the last
 * painting the new grid exactly. Without it the stream's final delivery
 * would stay a permanent half-mix — column peaks below 1, the darkest cell
 * no longer the most likely value.
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
 * The display after new frames built `target`: eased in from `shown` when
 * there is a picture to ease from, painted exactly otherwise.
 */
export function easeHeatmapDisplay(
  shown: HeatmapDisplay | null,
  target: HeatmapDensityGrid,
): HeatmapDisplay {
  if (shown === null) {
    return { grid: target, target, stepsLeft: 0 };
  }
  return {
    grid: blendHeatmapGrids(shown.grid, target),
    target,
    stepsLeft: HEATMAP_SETTLE_STEPS,
  };
}

/**
 * One settle step toward the target; the last step is the target itself,
 * so the sequence ends exact rather than asymptotically close.
 */
export function settleHeatmapDisplay(shown: HeatmapDisplay): HeatmapDisplay {
  if (shown.stepsLeft <= 1) {
    return { grid: shown.target, target: shown.target, stepsLeft: 0 };
  }
  return {
    grid: blendHeatmapGrids(shown.grid, shown.target),
    target: shown.target,
    stepsLeft: shown.stepsLeft - 1,
  };
}

/** Matplotlib's magma, subsampled; position 0 is lightest, 1 darkest. */
const MAGMA_STOPS: readonly (readonly [number, number, number, number])[] = [
  [0, 252, 253, 191],
  [0.25, 254, 159, 109],
  [0.5, 222, 73, 104],
  [0.75, 129, 37, 129],
  [1, 11, 9, 36],
];

/**
 * A 256-entry RGBA lookup table over the magma ramp. Zero density stays
 * fully transparent so the chart grid shows through; alpha then steps to a
 * visible floor so sparse bins do not vanish against the background.
 */
export function magmaLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let index = 0; index < 256; index++) {
    const position = index / 255;
    let low = MAGMA_STOPS[0]!;
    let high = MAGMA_STOPS.at(-1)!;
    for (let stop = 0; stop < MAGMA_STOPS.length - 1; stop++) {
      if (
        position >= MAGMA_STOPS[stop]![0] &&
        position <= MAGMA_STOPS[stop + 1]![0]
      ) {
        low = MAGMA_STOPS[stop]!;
        high = MAGMA_STOPS[stop + 1]!;
        break;
      }
    }
    const spanWidth = high[0] - low[0];
    const mix = spanWidth === 0 ? 0 : (position - low[0]) / spanWidth;
    lut[index * 4] = Math.round(low[1] + (high[1] - low[1]) * mix);
    lut[index * 4 + 1] = Math.round(low[2] + (high[2] - low[2]) * mix);
    lut[index * 4 + 2] = Math.round(low[3] + (high[3] - low[3]) * mix);
    lut[index * 4 + 3] =
      index === 0 ? 0 : Math.round(Math.min(1, 0.15 + position * 0.85) * 255);
  }
  return lut;
}

/** The grid as one RGBA pixel per cell (image row 0 at `valueMax`). */
export function rasterizeHeatmap(
  grid: HeatmapDensityGrid,
  lut: Uint8ClampedArray,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(grid.columns * grid.rows * 4);
  for (let row = 0; row < grid.rows; row++) {
    const imageRow = grid.rows - 1 - row;
    for (let column = 0; column < grid.columns; column++) {
      const density = grid.densities[row * grid.columns + column]!;
      const entry = Math.min(255, Math.round(density * 255)) * 4;
      const out = (imageRow * grid.columns + column) * 4;
      pixels[out] = lut[entry]!;
      pixels[out + 1] = lut[entry + 1]!;
      pixels[out + 2] = lut[entry + 2]!;
      pixels[out + 3] = lut[entry + 3]!;
    }
  }
  return pixels;
}

/**
 * @param framesRef the frames to paint, read at draw time
 * @param epochRef the selection the frames belong to; frames of a new epoch
 *   start from their own data instead of easing in from the old selection
 */
export function createDistributionHeatmapPlugin(
  framesRef: { current: readonly MetricFrame[] },
  epochRef?: { current: string | undefined },
): uPlot.Plugin {
  const lut = magmaLut();
  // One cell-resolution scratch canvas per plugin (per uPlot instance),
  // created lazily so importing this module stays DOM-free.
  let cellCanvas: HTMLCanvasElement | null = null;
  // uPlot redraws for reasons besides new data (size, scale, cursor lock);
  // the same frames at the same plot height reuse the rasterized cells.
  let rasterCache: {
    frames: readonly MetricFrame[];
    epoch: string | undefined;
    bboxHeight: number;
    display: HeatmapDisplay;
    timeFirst: number;
    timeLast: number;
  } | null = null;
  // The pending settle redraw, and whether the next draw IS that redraw
  // (as opposed to one uPlot runs for its own reasons).
  const settle: { timer: ReturnType<typeof setTimeout> | null; due: boolean } =
    { timer: null, due: false };

  const cancelSettle = () => {
    if (settle.timer !== null) {
      clearTimeout(settle.timer);
      settle.timer = null;
    }
    settle.due = false;
  };
  const scheduleSettle = (u: uPlot) => {
    cancelSettle();
    settle.timer = setTimeout(() => {
      settle.timer = null;
      settle.due = true;
      u.redraw(false, false);
    }, HEATMAP_SETTLE_MS);
  };
  const paint = (grid: HeatmapDensityGrid) => {
    cellCanvas ??= document.createElement("canvas");
    cellCanvas.width = grid.columns;
    cellCanvas.height = grid.rows;
    cellCanvas
      .getContext("2d")!
      .putImageData(
        new ImageData(rasterizeHeatmap(grid, lut), grid.columns, grid.rows),
        0,
        0,
      );
  };

  return {
    hooks: {
      draw: (u) => {
        const sourceFrames = framesRef.current;
        const epoch = epochRef?.current;
        const isSettleDraw = settle.due;
        settle.due = false;
        if (
          rasterCache === null ||
          rasterCache.frames !== sourceFrames ||
          rasterCache.epoch !== epoch ||
          rasterCache.bboxHeight !== u.bbox.height
        ) {
          const frames = distributionFramesFrom(sourceFrames);
          if (frames.length === 0) {
            cancelSettle();
            rasterCache = null;
            return;
          }
          const built = buildHeatmapDensityGrid(frames, u.bbox.height);
          if (!built) {
            return;
          }
          // New frames of the same selection at the same height ease in from
          // the displayed picture. A new selection starts from its own data
          // (the plot's crossfade overlay bridges that transition), and a
          // resize repaints exactly (the picture did not change, its pixels
          // did).
          const shown =
            rasterCache !== null &&
            rasterCache.epoch === epoch &&
            rasterCache.bboxHeight === u.bbox.height
              ? rasterCache.display
              : null;
          const display = easeHeatmapDisplay(shown, built);
          rasterCache = {
            frames: sourceFrames,
            epoch,
            bboxHeight: u.bbox.height,
            display,
            timeFirst: frames[0]!.time,
            timeLast: frames.at(-1)!.time,
          };
          paint(display.grid);
          if (display.stepsLeft > 0) {
            scheduleSettle(u);
          } else {
            cancelSettle();
          }
        } else if (isSettleDraw && rasterCache.display.stepsLeft > 0) {
          const display = settleHeatmapDisplay(rasterCache.display);
          rasterCache = { ...rasterCache, display };
          paint(display.grid);
          if (display.stepsLeft > 0) {
            scheduleSettle(u);
          }
        }
        if (cellCanvas === null) {
          return;
        }
        const { timeFirst, timeLast } = rasterCache;
        const { grid } = rasterCache.display;

        // Cell centers sit on the frame times and grid-row values, so the
        // image extends half a cell beyond the outermost centers. All
        // coordinates come from `valToPos`, keeping the image aligned with
        // the axes whatever range the y scale settled on.
        const yTop = u.valToPos(grid.valueMax, "y", true);
        const yBottom = u.valToPos(grid.valueMin, "y", true);
        const cellHeight =
          grid.rows > 1
            ? (yBottom - yTop) / (grid.rows - 1)
            : 8 * uPlot.pxRatio;
        const xFirst = u.valToPos(timeFirst, "x", true);
        const xLast = u.valToPos(timeLast, "x", true);
        const cellWidth =
          grid.columns > 1
            ? (xLast - xFirst) / (grid.columns - 1)
            : 10 * uPlot.pxRatio;

        const ctx = u.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          cellCanvas,
          xFirst - cellWidth / 2,
          yTop - cellHeight / 2,
          xLast - xFirst + cellWidth,
          yBottom - yTop + cellHeight,
        );
        ctx.restore();
      },
      destroy: () => {
        cancelSettle();
      },
    },
  };
}
