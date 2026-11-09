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

/**
 * The part of the container the canvas can be seen through, in screen
 * pixels: the container less the panels covering its edges and a margin.
 */
const visibleArea = (
  container: Size,
  insets: CanvasViewportInsets,
  margin: number,
) => ({
  left: (insets.left ?? 0) + margin,
  top: (insets.top ?? 0) + margin,
  right: container.width - (insets.right ?? 0) - margin,
  bottom: container.height - (insets.bottom ?? 0) - margin,
});

/** Whether a scene point shows through the uncovered part of the container. */
export const isScenePointInView = (
  point: { x: number; y: number },
  viewport: CanvasViewport,
  container: Size,
  insets: CanvasViewportInsets,
): boolean => {
  const area = visibleArea(container, insets, 0);
  const screenX = point.x * viewport.zoom + viewport.x;
  const screenY = point.y * viewport.zoom + viewport.y;
  return (
    screenX >= area.left &&
    screenX <= area.right &&
    screenY >= area.top &&
    screenY <= area.bottom
  );
};

/**
 * The viewport that brings `bounds`, in scene coordinates, inside the part of
 * the container the panels leave uncovered, keeping `margin` pixels clear.
 *
 * It pans as little as it can, so a node half under a panel slides just far
 * enough out. Bounds too large for the area are centred in it and, when
 * `zoomOut` allows, zoomed out to fit, never below `minZoom`; otherwise they
 * are left alone. Null when the bounds are already in view.
 */
export const revealBounds = ({
  bounds,
  viewport,
  container,
  insets,
  margin,
  minZoom,
  zoomOut,
}: {
  bounds: Rect;
  viewport: CanvasViewport;
  container: Size;
  insets: CanvasViewportInsets;
  margin: number;
  minZoom: number;
  zoomOut: boolean;
}): CanvasViewport | null => {
  const area = visibleArea(container, insets, margin);
  const areaWidth = area.right - area.left;
  const areaHeight = area.bottom - area.top;
  if (areaWidth <= 0 || areaHeight <= 0) {
    return null;
  }

  const fits =
    bounds.width * viewport.zoom <= areaWidth &&
    bounds.height * viewport.zoom <= areaHeight;

  if (!fits) {
    if (!zoomOut) {
      return null;
    }
    const zoom = Math.max(
      minZoom,
      Math.min(
        viewport.zoom,
        areaWidth / Math.max(bounds.width, 1),
        areaHeight / Math.max(bounds.height, 1),
      ),
    );
    return {
      zoom,
      x: area.left + areaWidth / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: area.top + areaHeight / 2 - (bounds.y + bounds.height / 2) * zoom,
    };
  }

  const left = bounds.x * viewport.zoom + viewport.x;
  const top = bounds.y * viewport.zoom + viewport.y;
  const right = left + bounds.width * viewport.zoom;
  const bottom = top + bounds.height * viewport.zoom;
  const dx =
    left < area.left
      ? area.left - left
      : right > area.right
        ? area.right - right
        : 0;
  const dy =
    top < area.top
      ? area.top - top
      : bottom > area.bottom
        ? area.bottom - bottom
        : 0;

  return dx === 0 && dy === 0
    ? null
    : { x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom };
};
