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
 *
 * A walk restart (the caller clearing `values` to sample a new slice) keeps
 * the previous picture up, dimmed, until the new walk has enough samples to
 * say something — a blank plot after every slider move read as a crash, and
 * two samples interpolate to a near-uniform wash that says less than the
 * dimmed old picture does.
 */
import { useEffect, useRef, useState } from "react";

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
  // Horizontal touch drags navigate; vertical swipes stay the browser's to
  // scroll the drawer (the browser takes the pointer over and fires
  // pointercancel, which aborts the drag without committing).
  touchAction: "pan-y",
  userSelect: "none",
});

// The drag crosshair: two hairlines and a ring, positioned in percentages so
// pointer moves never repaint the (expensive) field raster below them.
const crosshairLineXStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  width: "[1px]",
  backgroundColor: "[rgba(217, 119, 6, 0.65)]",
  pointerEvents: "none",
});

const crosshairLineYStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  height: "[1px]",
  backgroundColor: "[rgba(217, 119, 6, 0.65)]",
  pointerEvents: "none",
});

const crosshairDotStyle = css({
  position: "absolute",
  width: "[11px]",
  height: "[11px]",
  borderRadius: "full",
  borderWidth: "[2px]",
  borderStyle: "solid",
  borderColor: "[rgba(217, 119, 6, 0.95)]",
  backgroundColor: "[rgba(255, 255, 255, 0.6)]",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
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
  /** The last complete-enough field, kept as the ghost across restarts. */
  ghost: {
    image: HTMLCanvasElement;
    segments: [number, number, number, number][][];
    rasterWidth: number;
    rasterHeight: number;
  } | null;
};

/** Samples a fresh walk needs before its field replaces the ghost. */
const GHOST_MIN_SAMPLES = 3;

/** Draws a retained field (image + iso-lines) into the plot area. */
/* eslint-disable no-param-reassign -- configuring the caller's canvas context
   (smoothing, stroke style) is what a draw helper is for */
function drawField(
  context: CanvasRenderingContext2D,
  field: {
    image: HTMLCanvasElement;
    segments: [number, number, number, number][][];
  },
  width: number,
  height: number,
  rasterWidth: number,
  rasterHeight: number,
): void {
  const cellWidth = width / (rasterWidth - 1);
  const cellHeight = height / (rasterHeight - 1);
  context.imageSmoothingEnabled = false;
  context.drawImage(field.image, 0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.strokeStyle = "rgba(15, 23, 42, 0.35)";
  context.lineWidth = 1;
  for (const levelSegments of field.segments) {
    context.beginPath();
    for (const [x1, y1, x2, y2] of levelSegments) {
      context.moveTo(x1 * cellWidth, y1 * cellHeight);
      context.lineTo(x2 * cellWidth, y2 * cellHeight);
    }
    context.stroke();
  }
}
/* eslint-enable no-param-reassign */

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

  const rasterWidth = Math.max(2, (nx - 1) * RASTER_SUBDIVISION + 1);
  const rasterHeight = Math.max(2, (ny - 1) * RASTER_SUBDIVISION + 1);

  // A restarted walk: too few samples to interpolate anything meaningful.
  // The previous slice's picture, dimmed, bridges the gap; the new walk's
  // dots draw on top so progress is visible.
  const ghosting = samples.length < GHOST_MIN_SAMPLES && state.ghost !== null;
  if (ghosting && state.ghost !== null) {
    context.globalAlpha = 0.45;
    drawField(
      context,
      state.ghost,
      width,
      height,
      state.ghost.rasterWidth,
      state.ghost.rasterHeight,
    );
    context.globalAlpha = 1;
    for (const sample of samples) {
      context.beginPath();
      context.arc(pointX(sample.x), pointY(sample.y), 2.5, 0, Math.PI * 2);
      context.fillStyle = "rgba(15, 23, 42, 0.75)";
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.9)";
      context.lineWidth = 1;
      context.stroke();
    }
    // Fall through: external markers (trial rings, the best point) are
    // caller state, not part of the retained field — they stay visible.
  }

  if (!ghosting && samples.length > 0) {
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
      // The ghost is a snapshot, not an alias: the live field's canvas is
      // reused across versions, so the ghost copies it once it is worth
      // keeping.
      if (samples.length >= GHOST_MIN_SAMPLES) {
        const ghostImage =
          state.ghost?.image ?? document.createElement("canvas");
        ghostImage.width = image.width;
        ghostImage.height = image.height;
        ghostImage.getContext("2d")!.drawImage(image, 0, 0);
        state.ghost = {
          image: ghostImage,
          segments,
          rasterWidth,
          rasterHeight,
        };
      }
    }

    drawField(context, state.field, width, height, rasterWidth, rasterHeight);

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

export type ContourSurfaceFraction = {
  /** Rightward fraction of the plot area, in [0, 1]. */
  x: number;
  /** Upward fraction of the plot area, in [0, 1]. */
  y: number;
};

export const ContourSurface = ({
  nx,
  ny,
  values,
  markers = [],
  height = 280,
  contentKey,
  onPickFraction,
  onPreviewFraction,
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
   * Identity of the plotted quantity (the axes and the metric). A change
   * drops the retained ghost: bridging a *slice* change with the previous
   * picture helps, bridging a different quantity with it would mislead.
   */
  contentKey?: string;
  /**
   * A position picked on the plot. A click commits where it lands; a drag
   * shows a crosshair while the pointer moves and commits on release, so the
   * plot works as a control, not just a target.
   */
  onPickFraction?: (fraction: ContourSurfaceFraction) => void;
  /**
   * The position under the pointer while a drag is in progress — for a live
   * readout beside the plot — and null when the drag ends or cancels.
   */
  onPreviewFraction?: (fraction: ContourSurfaceFraction | null) => void;
  "aria-label"?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(frameRef, { debounce: 50 });
  const paintStateRef = useRef<PaintState | null>(null);
  const contentKeyRef = useRef<string | undefined>(contentKey);
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
      ghost: null,
    };
    const state = paintStateRef.current;
    if (contentKeyRef.current !== contentKey) {
      contentKeyRef.current = contentKey;
      state.ghost = null;
    }
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
  }, [contentKey, height, markers, nx, ny, size, values]);

  // The one pointer this component armed on pointerdown. Touch pointers get
  // implicit capture whether or not we asked, so capture state cannot tell
  // "our drag" from "a stray finger": only the armed id navigates, a second
  // pointer is ignored, and a display-only plot (no onPickFraction) never
  // arms at all.
  const [drag, setDrag] = useState<{
    pointerId: number;
    fraction: ContourSurfaceFraction;
  } | null>(null);
  const dragPreview = drag?.fraction ?? null;

  const fractionAt = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ): ContourSurfaceFraction => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clamp = (fraction: number) => Math.min(Math.max(fraction, 0), 1);
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp(1 - (event.clientY - bounds.top) / bounds.height),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      !onPickFraction ||
      event.button !== 0 ||
      !event.isPrimary ||
      drag !== null
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const fraction = fractionAt(event);
    setDrag({ pointerId: event.pointerId, fraction });
    onPreviewFraction?.(fraction);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    const fraction = fractionAt(event);
    setDrag({ pointerId: event.pointerId, fraction });
    onPreviewFraction?.(fraction);
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (drag === null || drag.pointerId !== event.pointerId) {
      return false;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
    onPreviewFraction?.(null);
    return true;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (endDrag(event)) {
      // Commit where the pointer released — a plain click is the degenerate
      // drag that never moved.
      onPickFraction?.(fractionAt(event));
    }
  };

  // Cancel (the browser taking a touch over to scroll) and lost capture (a
  // context menu swallowing the release) both abort without committing.
  const handlePointerCancel = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    endDrag(event);
  };

  return (
    <div ref={frameRef} className={frameStyle}>
      <canvas
        ref={canvasRef}
        className={canvasStyle}
        style={{ height }}
        aria-label={ariaLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
      />
      {dragPreview ? (
        <>
          <div
            className={crosshairLineXStyle}
            style={{ left: `${dragPreview.x * 100}%` }}
          />
          <div
            className={crosshairLineYStyle}
            style={{ top: `${(1 - dragPreview.y) * 100}%` }}
          />
          <div
            className={crosshairDotStyle}
            style={{
              left: `${dragPreview.x * 100}%`,
              top: `${(1 - dragPreview.y) * 100}%`,
            }}
          />
        </>
      ) : null}
    </div>
  );
};
