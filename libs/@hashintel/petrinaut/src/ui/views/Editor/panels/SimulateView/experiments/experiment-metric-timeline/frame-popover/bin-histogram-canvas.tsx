/**
 * The frame popover's histogram, drawn as a raster on a canvas.
 *
 * A distribution frame can carry thousands of bins; one DOM row per bin
 * showed a dozen of them at a time behind a scrollbar, so the shape of the
 * distribution — which is the reason to open the popover at all — was never
 * visible. The canvas draws the whole distribution at once in a fixed box:
 * bins become adjacent rectangles across the value axis (see
 * `bin-histogram-raster`), heights are counts, and both axes are labelled.
 *
 * Colour comes from the container's computed `color`, so the drawing follows
 * the theme's neutral scale like the surrounding markup does; the lighter
 * parts vary it with `globalAlpha` rather than hard-coding a second colour.
 */
import { useEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../../../../../react/hooks/use-element-size";
import { formatNumber } from "../../shared/format-number";
import {
  columnDensity,
  formatAxisTick,
  niceAxisTicks,
  rasterizeBins,
} from "./bin-histogram-raster";

import type { DistributionBins } from "../shared/metric-frames";

/** Gutter holding the count labels. */
const AXIS_LEFT = 34;
/** Gutter holding the value labels. */
const AXIS_BOTTOM = 14;
const PAD_TOP = 6;
const PAD_RIGHT = 6;
/** Bars-only height; the box adds the axis gutters to this. */
const PLOT_HEIGHT = 84;
const CANVAS_HEIGHT = PAD_TOP + PLOT_HEIGHT + AXIS_BOTTOM;
const LABEL_FONT = "10px system-ui, -apple-system, sans-serif";
/** Gap between x labels, so neighbours never touch. */
const LABEL_GAP = 6;

const containerStyle = css({
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  backgroundColor: "neutral.s10",
  // The canvas reads this to draw with; every part of the histogram is this
  // colour at some alpha.
  color: "neutral.s120",
  overflow: "hidden",
});

const canvasStyle = css({
  display: "block",
  width: "full",
  height: "[104px]",
});

/* eslint-disable no-param-reassign -- sizing the caller's canvas backing
   store is what a draw helper is for */
function drawHistogram(
  canvas: HTMLCanvasElement,
  width: number,
  bins: DistributionBins,
): void {
  const pixelRatio = globalThis.devicePixelRatio || 1;
  const deviceWidth = Math.max(1, Math.round(width * pixelRatio));
  const deviceHeight = Math.max(1, Math.round(CANVAS_HEIGHT * pixelRatio));
  // Assigning width/height reallocates the backing store and implicitly
  // clears — only pay that when the size actually changed.
  if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
    canvas.width = deviceWidth;
    canvas.height = deviceHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, CANVAS_HEIGHT);

  const plotWidth = Math.max(1, width - AXIS_LEFT - PAD_RIGHT);
  const plotBottom = PAD_TOP + PLOT_HEIGHT;
  const color = globalThis.getComputedStyle(canvas).color;
  context.font = LABEL_FONT;

  const { columns, maxDensity, domainMin, domainMax } = rasterizeBins(
    bins,
    plotWidth,
  );

  // Two steps, not three: the plot is 84px tall and every label is 10px.
  // Whole samples only, unless merging put the peak below one per bin.
  const countTicks = niceAxisTicks(0, maxDensity, 2, maxDensity >= 1 ? 1 : 0);
  const countY = (count: number): number =>
    maxDensity === 0
      ? plotBottom
      : plotBottom - (count / maxDensity) * PLOT_HEIGHT;

  // Gridlines first, so the bars sit on top of them.
  context.fillStyle = color;
  context.globalAlpha = 0.08;
  for (const tick of countTicks) {
    if (tick > 0) {
      context.fillRect(AXIS_LEFT, Math.round(countY(tick)), plotWidth, 1);
    }
  }

  // The bars, in one fill pass: a thousand-column raster re-parsing the fill
  // colour per column is the expensive way to draw the same picture.
  context.globalAlpha = 0.85;
  for (const column of columns) {
    if (column.count <= 0) {
      continue;
    }
    // A bin with samples is never invisible: it keeps a pixel of height even
    // when it rounds to nothing beside the tallest column.
    const height = Math.max(
      1,
      (columnDensity(column) / maxDensity) * PLOT_HEIGHT,
    );
    context.fillRect(
      AXIS_LEFT + column.left,
      plotBottom - height,
      column.right - column.left,
      height,
    );
  }

  // Axis rules.
  context.globalAlpha = 0.25;
  context.fillRect(AXIS_LEFT, PAD_TOP, 1, PLOT_HEIGHT + 1);
  context.fillRect(AXIS_LEFT, plotBottom, plotWidth, 1);

  context.globalAlpha = 0.6;
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (const tick of countTicks) {
    context.fillText(formatAxisTick(tick), AXIS_LEFT - 4, countY(tick));
  }

  context.textAlign = "center";
  context.textBaseline = "top";
  const valueTicks = niceAxisTicks(domainMin, domainMax, 4);
  const valueX = (value: number): number =>
    AXIS_LEFT +
    ((value - domainMin) / Math.max(domainMax - domainMin, 1e-12)) * plotWidth;
  let lastLabelRight = Number.NEGATIVE_INFINITY;
  for (const tick of valueTicks) {
    const label = formatAxisTick(tick);
    const half = context.measureText(label).width / 2;
    const center = valueX(tick);
    if (center - half < lastLabelRight + LABEL_GAP) {
      continue;
    }
    // Nudge the outermost labels inside the canvas rather than clipping them.
    const clamped = Math.min(
      Math.max(center, AXIS_LEFT + half),
      width - half - 1,
    );
    context.fillText(label, clamped, plotBottom + 3);
    lastLabelRight = clamped + half;
  }

  context.globalAlpha = 1;
}
/* eslint-enable no-param-reassign */

export const BinHistogramCanvas = ({ bins }: { bins: DistributionBins }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(containerRef);
  const width = size?.width ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && width > 0) {
      drawHistogram(canvas, width, bins);
    }
  }, [bins, width]);

  const values = bins.map(([value]) => value);
  const peak = bins.reduce((max, [, frequency]) => Math.max(max, frequency), 0);

  return (
    <div ref={containerRef} className={containerStyle}>
      <canvas
        ref={canvasRef}
        className={canvasStyle}
        role="img"
        aria-label={
          bins.length === 0
            ? "No samples in this frame"
            : `Histogram of ${bins.length} bins from ${formatNumber(
                Math.min(...values),
              )} to ${formatNumber(Math.max(...values))}, peak count ${peak}`
        }
      />
    </div>
  );
};
