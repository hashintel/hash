/**
 * A filled contour plot over a sparse grid of sampled values, Optuna-style:
 * inverse-distance-weighted interpolation onto a raster, marching-squares
 * iso-lines, a ColorBrewer Blues ramp, dots where data actually exists, and
 * optional ring markers for externally supplied points.
 *
 * Purely presentational: it knows nothing about parameters, experiments, or
 * how values are computed. Callers hand it grid-indexed values (`"x,y"` keys
 * into an `nx × ny` index space, y up) and receive clicks back as fractions
 * of the plot area — mapping fractions to whatever the axes mean is the
 * caller's business. The plot repaints whenever `values` or `markers`
 * change, so a caller streaming samples in gets a live, progressively
 * sharpening picture.
 *
 * Painting is tuned for that streaming: draws coalesce to one per animation
 * frame (a cache-refill walk resolves dozens of cells back to back), the
 * interpolation folds only new samples into a persistent accumulator, and
 * the filled bands blit one raster-resolution image instead of issuing a
 * `fillRect` and an `rgb(...)` string per cell — so a markers-only change
 * never recomputes the field at all.
 */
import { useEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import {
  bluesLut,
  contourLevels,
  createIdwAccumulator,
  marchingSquaresSegments,
} from "../../react/experiments/contour-grid";
import { useElementSize } from "../../react/hooks/use-element-size";

import type {
  ContourSample,
  IdwAccumulator,
} from "../../react/experiments/contour-grid";

/** Raster resolution per grid cell, in pixels of interpolation lattice. */
const RASTER_SUBDIVISION = 8;

/** Values sampled so far, keyed `"x,y"` in grid-index space (y up). */
export type ContourSurfaceValues = ReadonlyMap<string, number>;

/** An externally supplied point drawn as a ring, in grid-index space. */
export type ContourSurfaceMarker = {
  x: number;
  y: number;
  /** Draw larger and stronger — e.g. a study's best trial. */
  emphasis?: boolean;
};

/** The canonical key of a sampled grid cell. */
export function contourSurfaceKey(xIndex: number, yIndex: number): string {
  return `${xIndex},${yIndex}`;
}

const frameStyle = css({
  position: "relative",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  overflow: "hidden",
  backgroundColor: "neutral.s00",
});

const canvasStyle = css({
  display: "block",
  width: "[100%]",
  cursor: "crosshair",
});

/** Everything one plot instance keeps between paints. */
type PaintState = {
  lut: Uint8ClampedArray;
  accumulator: IdwAccumulator | null;
  accumulatorSize: string;
  /** The filled field + iso-line geometry of one accumulator version. */
  field: {
    version: number;
    min: number;
    max: number;
    image: HTMLCanvasElement;
    segments: [number, number, number, number][][];
  } | null;
};

function paint(options: {
  canvas: HTMLCanvasElement;
  state: PaintState;
  width: number;
  height: number;
  nx: number;
  ny: number;
  values: ContourSurfaceValues;
  markers: readonly ContourSurfaceMarker[];
}): void {
  const { canvas, state, width, height, nx, ny, values, markers } = options;
  const pixelRatio = globalThis.devicePixelRatio || 1;
  const deviceWidth = Math.max(1, Math.round(width * pixelRatio));
  const deviceHeight = Math.max(1, Math.round(height * pixelRatio));
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
  context.clearRect(0, 0, width, height);

  const samples: ContourSample[] = [];
  for (const [key, value] of values) {
    const [x = 0, y = 0] = key.split(",").map(Number);
    samples.push({ x, y, value });
  }

  const pointX = (x: number): number => (x / Math.max(nx - 1, 1)) * width;
  const pointY = (y: number): number =>
    height - (y / Math.max(ny - 1, 1)) * height;

  if (samples.length > 0) {
    const rasterWidth = Math.max(2, (nx - 1) * RASTER_SUBDIVISION + 1);
    const rasterHeight = Math.max(2, (ny - 1) * RASTER_SUBDIVISION + 1);
    const sizeKey = `${nx}|${ny}|${rasterWidth}|${rasterHeight}`;
    if (state.accumulator === null || state.accumulatorSize !== sizeKey) {
      state.accumulator = createIdwAccumulator({
        nx,
        ny,
        width: rasterWidth,
        height: rasterHeight,
      });
      state.accumulatorSize = sizeKey;
      state.field = null;
    }
    const raster = state.accumulator.update(samples);

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const sample of samples) {
      min = Math.min(min, sample.value);
      max = Math.max(max, sample.value);
    }
    const span = max - min;

    if (
      state.field === null ||
      state.field.version !== state.accumulator.version ||
      state.field.min !== min ||
      state.field.max !== max
    ) {
      // One RGBA pixel per filled cell (the cell takes its top-left corner's
      // value, as the fillRect version did), blitted scaled with smoothing
      // off — the same blocks without 6,400 fillStyle parses.
      const cellsWidth = rasterWidth - 1;
      const cellsHeight = rasterHeight - 1;
      const pixels = new Uint8ClampedArray(cellsWidth * cellsHeight * 4);
      for (let py = 0; py < cellsHeight; py++) {
        for (let px = 0; px < cellsWidth; px++) {
          const value = raster[py * rasterWidth + px]!;
          const t = span > 0 ? (value - min) / span : 0.5;
          const entry = Math.min(255, Math.max(0, Math.round(t * 255))) * 3;
          const out = (py * cellsWidth + px) * 4;
          pixels[out] = state.lut[entry]!;
          pixels[out + 1] = state.lut[entry + 1]!;
          pixels[out + 2] = state.lut[entry + 2]!;
          pixels[out + 3] = 255;
        }
      }
      const image = state.field?.image ?? document.createElement("canvas");
      image.width = cellsWidth;
      image.height = cellsHeight;
      image
        .getContext("2d")!
        .putImageData(new ImageData(pixels, cellsWidth, cellsHeight), 0, 0);

      const segments =
        span > 0
          ? contourLevels(min, max, 10).map((level) =>
              marchingSquaresSegments(raster, rasterWidth, rasterHeight, level),
            )
          : [];

      state.field = {
        version: state.accumulator.version,
        min,
        max,
        image,
        segments,
      };
    }

    const cellWidth = width / (rasterWidth - 1);
    const cellHeight = height / (rasterHeight - 1);

    context.imageSmoothingEnabled = false;
    context.drawImage(state.field.image, 0, 0, width, height);
    context.imageSmoothingEnabled = true;

    context.strokeStyle = "rgba(15, 23, 42, 0.35)";
    context.lineWidth = 1;
    for (const levelSegments of state.field.segments) {
      context.beginPath();
      for (const [x1, y1, x2, y2] of levelSegments) {
        context.moveTo(x1 * cellWidth, y1 * cellHeight);
        context.lineTo(x2 * cellWidth, y2 * cellHeight);
      }
      context.stroke();
    }

    // Sampled points, so it is visible where data actually exists.
    for (const sample of samples) {
      context.beginPath();
      context.arc(pointX(sample.x), pointY(sample.y), 2.5, 0, Math.PI * 2);
      context.fillStyle = "rgba(15, 23, 42, 0.75)";
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.9)";
      context.lineWidth = 1;
      context.stroke();
    }
  }

  // External markers as rings, distinct from the sampled dots.
  for (const marker of markers) {
    context.beginPath();
    context.arc(
      pointX(marker.x),
      pointY(marker.y),
      marker.emphasis ? 5 : 3.5,
      0,
      Math.PI * 2,
    );
    context.strokeStyle = marker.emphasis
      ? "rgba(217, 119, 6, 0.95)"
      : "rgba(217, 119, 6, 0.55)";
    context.lineWidth = marker.emphasis ? 2 : 1.25;
    context.stroke();
  }
}

export const ContourSurface = ({
  nx,
  ny,
  values,
  markers = [],
  height = 280,
  onClickFraction,
  "aria-label": ariaLabel,
}: {
  /** Grid extent in index space: value keys lie in [0, nx-1] × [0, ny-1]. */
  nx: number;
  ny: number;
  values: ContourSurfaceValues;
  markers?: readonly ContourSurfaceMarker[];
  /** Plot height in pixels; the width follows the container. */
  height?: number;
  /**
   * A click on the plot, as fractions of its area: x rightward, y upward,
   * both in [0, 1].
   */
  onClickFraction?: (fractionX: number, fractionY: number) => void;
  "aria-label"?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(frameRef, { debounce: 50 });
  const paintStateRef = useRef<PaintState | null>(null);
  const frameHandleRef = useRef<number | null>(null);

  // Painting is imperative canvas work driven by measured size — outside
  // React's render, same as the uPlot charts. One paint per animation frame,
  // latest props win: a cache-refill walk resolves dozens of cells in a
  // burst, and painting each intermediate picture is pure waste.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || size.width === 0) {
      return;
    }
    paintStateRef.current ??= {
      lut: bluesLut(),
      accumulator: null,
      accumulatorSize: "",
      field: null,
    };
    const state = paintStateRef.current;
    if (frameHandleRef.current !== null) {
      cancelAnimationFrame(frameHandleRef.current);
    }
    frameHandleRef.current = requestAnimationFrame(() => {
      frameHandleRef.current = null;
      paint({
        canvas,
        state,
        width: size.width,
        height,
        nx,
        ny,
        values,
        markers,
      });
    });
    return () => {
      if (frameHandleRef.current !== null) {
        cancelAnimationFrame(frameHandleRef.current);
        frameHandleRef.current = null;
      }
    };
  }, [height, markers, nx, ny, size, values]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClickFraction) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const clamp = (fraction: number) => Math.min(Math.max(fraction, 0), 1);
    onClickFraction(
      clamp((event.clientX - bounds.left) / bounds.width),
      clamp(1 - (event.clientY - bounds.top) / bounds.height),
    );
  };

  return (
    <div ref={frameRef} className={frameStyle}>
      <canvas
        ref={canvasRef}
        className={canvasStyle}
        style={{ height }}
        aria-label={ariaLabel}
        onClick={handleClick}
      />
    </div>
  );
};
