/**
 * A filled contour plot over a sparse grid of sampled values, Optuna-style:
 * inverse-distance-weighted interpolation, marching-squares iso-lines, a
 * Blues ramp, dots where data exists, and markers for external points — amber
 * rings or filled dots, a hollow grey ring for a point without a value, and
 * the navigation mark.
 *
 * Purely presentational: callers hand it grid-indexed values (`"x,y"` keys
 * into an `nx × ny` index space, y up — fractional coordinates included) and
 * receive picks back as fractions of the plot area. The plot repaints as
 * `values` stream in, one paint per animation frame; a caller clearing
 * `values` for a new slice keeps the previous picture up, dimmed, until the
 * new samples can replace it. Without `onPickFraction` the plot is
 * display-only: no crosshair cursor, and a drag never arms.
 */
import { useEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../react/hooks/use-element-size";
import {
  type ContourSurfaceMarker,
  type ContourSurfaceSampleMarks,
  type ContourSurfaceValues,
  createPaintState,
  paintField,
  type PaintState,
} from "./contour-surface/paint-field";
import {
  type ContourSurfaceFraction,
  DragCrosshair,
  useSurfaceDrag,
} from "./contour-surface/use-surface-drag";

export type {
  ContourSurfaceMarker,
  ContourSurfaceSampleMarks,
  ContourSurfaceValues,
} from "./contour-surface/paint-field";
export type { ContourSurfaceFraction } from "./contour-surface/use-surface-drag";

/** The canonical key of a sampled grid cell. */
export const contourSurfaceKey = (xIndex: number, yIndex: number): string =>
  `${xIndex},${yIndex}`;

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
  "&[data-interactive]": { cursor: "crosshair" },
  // Horizontal touch drags navigate; vertical swipes stay the browser's to
  // scroll the drawer (it fires pointercancel, which aborts the drag).
  touchAction: "pan-y",
  userSelect: "none",
});

export const ContourSurface = ({
  nx,
  ny,
  values,
  markers = [],
  sampleMarks = "dot",
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
  /**
   * Whether every sampled cell gets a dot. `none` suits a plot whose samples
   * are already drawn as markers.
   */
  sampleMarks?: ContourSurfaceSampleMarks;
  /** Plot height in pixels; the width follows the container. */
  height?: number;
  /**
   * Identity of the plotted quantity (the axes and the metric). A change
   * drops the dimmed previous picture: bridging a slice change with it helps,
   * bridging a different quantity with it would mislead.
   */
  contentKey?: string;
  /** A position picked on the plot: a click, or where a drag released. */
  onPickFraction?: (fraction: ContourSurfaceFraction) => void;
  /** The position under the pointer mid-drag; null when the drag ends. */
  onPreviewFraction?: (fraction: ContourSurfaceFraction | null) => void;
  "aria-label"?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(frameRef, { debounce: 50 });
  const paintStateRef = useRef<PaintState | null>(null);
  const { preview, handlers } = useSurfaceDrag({
    onPickFraction,
    onPreviewFraction,
  });

  // Imperative canvas work driven by measured size. Painting on the next
  // animation frame coalesces a burst of streamed values into one paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || size.width === 0) {
      return;
    }
    paintStateRef.current ??= createPaintState();
    const state = paintStateRef.current;
    const frame = requestAnimationFrame(() => {
      paintField({
        canvas,
        state,
        width: size.width,
        height,
        nx,
        ny,
        values,
        markers,
        sampleMarks,
        contentKey,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [contentKey, height, markers, nx, ny, sampleMarks, size, values]);

  return (
    <div ref={frameRef} className={frameStyle}>
      <canvas
        ref={canvasRef}
        className={canvasStyle}
        style={{ height }}
        aria-label={ariaLabel}
        data-interactive={onPickFraction ? "" : undefined}
        {...handlers}
      />
      {preview ? <DragCrosshair fraction={preview} /> : null}
    </div>
  );
};
