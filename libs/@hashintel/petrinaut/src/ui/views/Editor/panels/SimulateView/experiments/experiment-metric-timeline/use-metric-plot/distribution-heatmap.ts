/**
 * A uPlot plugin painting every streamed distribution frame as one column
 * of a density image, drawn through a magma lookup table in one
 * `drawImage`: dark is exactly where the runs concentrated at that time.
 * Frames of the same selection at the same height ease in from the picture
 * on screen; a new selection or a resize paints exactly.
 */
import uPlot from "uplot";

import {
  MAGMA_STOPS,
  rampLut,
  rasterizeNormalized,
} from "../../../../../../../shared/color-ramp";
import {
  binValueSummary,
  distributionFramesFrom,
} from "../shared/metric-frames";
import { buildHeatmapDensityGrid } from "./distribution-heatmap/density-grid";
import {
  easeHeatmapDisplay,
  HEATMAP_SETTLE_MS,
  settleHeatmapDisplay,
} from "./distribution-heatmap/display-easing";

import type { MetricFrame } from "../shared/metric-frames";
import type { HeatmapDensityGrid } from "./distribution-heatmap/density-grid";
import type { HeatmapDisplay } from "./distribution-heatmap/display-easing";

export type HeatmapContent = {
  frames: readonly MetricFrame[];
  /** The selection the frames belong to; a new one starts from its own data. */
  epoch: string | undefined;
};

/**
 * Zero density stays transparent so the chart grid shows through; any
 * density is at least faintly visible, so sparse bins do not vanish.
 */
export const heatmapAlpha = (position: number): number =>
  position === 0 ? 0 : 0.15 + position * 0.85;

type Raster = {
  frames: readonly MetricFrame[];
  epoch: string | undefined;
  bboxHeight: number;
  display: HeatmapDisplay;
  timeFirst: number;
  timeLast: number;
};

/** @param readContent the frames to paint and their selection, read at draw time */
export const createDistributionHeatmapPlugin = (
  readContent: () => HeatmapContent,
): uPlot.Plugin => {
  const lut = rampLut(MAGMA_STOPS, heatmapAlpha);
  // One pixel per grid cell; created on first paint so importing this module
  // stays DOM-free.
  let cells: HTMLCanvasElement | null = null;
  // uPlot redraws for reasons besides new data (size, scale, cursor lock);
  // the same frames at the same height reuse the rasterized cells.
  let raster: Raster | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  // Whether the next draw is the settle redraw, as opposed to one uPlot runs
  // for its own reasons.
  let settleDue = false;

  const cancelSettle = () => {
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    settleDue = false;
  };
  const scheduleSettle = (u: uPlot) => {
    cancelSettle();
    settleTimer = setTimeout(() => {
      settleTimer = null;
      settleDue = true;
      u.redraw(false, false);
    }, HEATMAP_SETTLE_MS);
  };
  const paint = (grid: HeatmapDensityGrid) => {
    cells ??= document.createElement("canvas");
    cells.width = grid.columns;
    cells.height = grid.rows;
    const pixels = rasterizeNormalized(
      grid.densities,
      { columns: grid.columns, rows: grid.rows, flipY: true },
      lut,
    );
    cells
      .getContext("2d")!
      .putImageData(new ImageData(pixels, grid.columns, grid.rows), 0, 0);
  };
  const showDisplay = (u: uPlot, display: HeatmapDisplay) => {
    paint(display.grid);
    if (display.stepsLeft > 0) {
      scheduleSettle(u);
    } else {
      cancelSettle();
    }
  };

  const updateRaster = (u: uPlot): void => {
    const { frames: sourceFrames, epoch } = readContent();
    const isSettleDraw = settleDue;
    settleDue = false;
    if (
      raster !== null &&
      raster.frames === sourceFrames &&
      raster.epoch === epoch &&
      raster.bboxHeight === u.bbox.height
    ) {
      if (isSettleDraw && raster.display.stepsLeft > 0) {
        const display = settleHeatmapDisplay(raster.display);
        raster = { ...raster, display };
        showDisplay(u, display);
      }
      return;
    }
    const frames = distributionFramesFrom(sourceFrames);
    const target =
      frames.length > 0
        ? buildHeatmapDensityGrid(
            frames,
            u.bbox.height,
            binValueSummary(sourceFrames),
          )
        : null;
    if (target === null) {
      cancelSettle();
      raster = null;
      return;
    }
    const shown =
      raster !== null &&
      raster.epoch === epoch &&
      raster.bboxHeight === u.bbox.height
        ? raster.display
        : null;
    const display = easeHeatmapDisplay(shown, target);
    raster = {
      frames: sourceFrames,
      epoch,
      bboxHeight: u.bbox.height,
      display,
      timeFirst: frames[0]!.time,
      timeLast: frames.at(-1)!.time,
    };
    showDisplay(u, display);
  };

  return {
    hooks: {
      draw: (u) => {
        updateRaster(u);
        if (cells === null || raster === null) {
          return;
        }
        const { timeFirst, timeLast } = raster;
        const { grid } = raster.display;

        // Cell centers sit on the frame times and grid-row values, so the
        // image extends half a cell beyond the outermost centers. Every
        // coordinate comes from `valToPos`, keeping the image aligned with
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
          cells,
          xFirst - cellWidth / 2,
          yTop - cellHeight / 2,
          xLast - xFirst + cellWidth,
          yBottom - yTop + cellHeight,
        );
        ctx.restore();
      },
      destroy: cancelSettle,
    },
  };
};
