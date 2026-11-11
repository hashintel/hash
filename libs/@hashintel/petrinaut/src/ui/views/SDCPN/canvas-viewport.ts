/**
 * Viewport arithmetic shared by every renderer: fitting the net into the
 * container and bringing a selection into the part the panels leave visible.
 */

import { getMinZoomForBounds, ZOOM_PADDING } from "@hashintel/petrinaut-core";

import type { CanvasViewport } from "./canvas-renderer";
import type { Rect, Size } from "@hashintel/petrinaut-core";

export type CanvasViewportInsets = {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
};

/** The canvas never zooms in past this when fitting the net into view. */
export const MAX_FIT_ZOOM = 1.1;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * The viewport that fits `bounds` into `container`: `padding` is the fraction
 * of the bounds left free around them, the zoom is clamped to the given
 * range, and the bounds sit centred.
 */
export const fitViewportToBounds = (
  bounds: Rect,
  container: Size,
  minZoom: number,
  maxZoom: number,
  padding: number,
  insets: CanvasViewportInsets = {},
): CanvasViewport => {
  const left = insets.left ?? 0;
  const right = insets.right ?? 0;
  const top = insets.top ?? 0;
  const bottom = insets.bottom ?? 0;
  const availableWidth = Math.max(1, container.width - left - right);
  const availableHeight = Math.max(1, container.height - top - bottom);
  const zoom = clamp(
    Math.min(
      availableWidth / (bounds.width * (1 + padding)),
      availableHeight / (bounds.height * (1 + padding)),
    ),
    minZoom,
    maxZoom,
  );
  return {
    zoom,
    x: left + availableWidth / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: top + availableHeight / 2 - (bounds.y + bounds.height / 2) * zoom,
  };
};

/**
 * The viewport centred on the given net bounds, respecting the same zoom
 * limits as the rest of the canvas. Top-left origin at zoom 1 when there is
 * nothing to fit.
 */
export const getInitialViewport = (
  bounds: Rect | null,
  container: Size,
  insets: CanvasViewportInsets = {},
): CanvasViewport => {
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  return fitViewportToBounds(
    bounds,
    container,
    getMinZoomForBounds(bounds, container),
    MAX_FIT_ZOOM,
    ZOOM_PADDING,
    insets,
  );
};

/** The screen rectangle of the container that `insets` leave uncovered. */
const uncoveredArea = (container: Size, insets: CanvasViewportInsets) => ({
  left: insets.left ?? 0,
  top: insets.top ?? 0,
  right: container.width - (insets.right ?? 0),
  bottom: container.height - (insets.bottom ?? 0),
});

/** Whether a scene point shows through the part `insets` leave uncovered. */
export const isScenePointInView = (
  point: { x: number; y: number },
  viewport: CanvasViewport,
  container: Size,
  insets: CanvasViewportInsets,
): boolean => {
  const area = uncoveredArea(container, insets);
  const x = point.x * viewport.zoom + viewport.x;
  const y = point.y * viewport.zoom + viewport.y;
  return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
};

/** How far a span has to move to lie inside a range it fits in. */
const shiftInto = (start: number, end: number, min: number, max: number) =>
  start < min ? min - start : end > max ? max - end : 0;

/**
 * The viewport that brings `bounds`, in scene coordinates, inside the part of
 * the container that `insets` leave uncovered. Null when they are there
 * already, or cannot be brought there.
 *
 * It pans as little as it can, so a node half under a panel slides just far
 * enough out. Bounds too large for the area are left alone, unless `zoomOut`
 * allows fitting them: centred, and zoomed out no further than `minZoom`.
 */
export const revealBounds = ({
  bounds,
  viewport,
  container,
  insets,
  minZoom,
  zoomOut,
}: {
  bounds: Rect;
  viewport: CanvasViewport;
  container: Size;
  insets: CanvasViewportInsets;
  minZoom: number;
  zoomOut: boolean;
}): CanvasViewport | null => {
  const area = uncoveredArea(container, insets);
  const width = area.right - area.left;
  const height = area.bottom - area.top;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const { zoom } = viewport;
  if (bounds.width * zoom > width || bounds.height * zoom > height) {
    return zoomOut
      ? fitViewportToBounds(bounds, container, minZoom, zoom, 0, insets)
      : null;
  }

  const left = bounds.x * zoom + viewport.x;
  const top = bounds.y * zoom + viewport.y;
  const dx = shiftInto(left, left + bounds.width * zoom, area.left, area.right);
  const dy = shiftInto(top, top + bounds.height * zoom, area.top, area.bottom);
  return dx === 0 && dy === 0
    ? null
    : { x: viewport.x + dx, y: viewport.y + dy, zoom };
};
