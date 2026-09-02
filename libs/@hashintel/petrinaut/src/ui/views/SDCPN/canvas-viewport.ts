/**
 * Viewport arithmetic shared by every renderer: fitting the net into the
 * container and keeping selected nodes visible when panels open.
 */

import {
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
  ZOOM_PADDING,
} from "@hashintel/petrinaut-core";

import type { CanvasViewport } from "./canvas-renderer";
import type { CanvasNode } from "./canvas-scene";
import type { Rect, Size } from "@hashintel/petrinaut-core";

/** The part of the scene a viewport shows, in scene coordinates. */
export type VisibleSceneRect = Rect & { zoom: number };

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
): CanvasViewport => {
  const zoom = clamp(
    Math.min(
      container.width / (bounds.width * (1 + padding)),
      container.height / (bounds.height * (1 + padding)),
    ),
    minZoom,
    maxZoom,
  );
  return {
    zoom,
    x: container.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: container.height / 2 - (bounds.y + bounds.height / 2) * zoom,
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
  );
};

// returns the amount offscreen as a positive integer for each direction
const getOffscreenAmount = (bounds: Rect, viewport: Rect) => ({
  left: Math.max(viewport.x - bounds.x, 0),
  right: Math.max(bounds.x + bounds.width - (viewport.x + viewport.width), 0),
  top: Math.max(viewport.y - bounds.y, 0),
  bottom: Math.max(
    bounds.y + bounds.height - (viewport.y + viewport.height),
    0,
  ),
});

const isOffscreen = (bounds: Rect, viewport: Rect) => {
  const { left, right, top, bottom } = getOffscreenAmount(bounds, viewport);
  return left > 0 || right > 0 || top > 0 || bottom > 0;
};

const canFitInViewport = (bounds: Rect, viewport: Rect) =>
  bounds.width < viewport.width && bounds.height < viewport.height;

/**
 * The scene-space translation that brings `nodes` back into `viewport`, or
 * undefined when they are already visible or too large to fit. To recenter an
 * arc, pass the nodes it connects: arcs have no stored geometry.
 */
export const recenterToFitViewport = (
  viewport: Rect,
  nodes: Pick<CanvasNode, "position" | "width" | "height">[],
) => {
  const bounds = getBoundsOfCenteredBoxes(nodes);
  if (!bounds) return;
  if (!isOffscreen(bounds, viewport)) return;
  if (!canFitInViewport(bounds, viewport)) return;

  const { left, right, top, bottom } = getOffscreenAmount(bounds, viewport);
  return { x: left > 0 ? left * -1 : right, y: top > 0 ? top * -1 : bottom };
};

/**
 * The scene rectangle visible through the viewport once the given overlay
 * insets (panels covering the canvas edges, in pixels) are removed.
 */
export const getViewportRect = (
  canvasSize: Size,
  viewport: CanvasViewport,
  overlays: { left?: number; right?: number; top?: number; bottom?: number } = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
): VisibleSceneRect => {
  return {
    width:
      (canvasSize.width - (overlays.left ?? 0) - (overlays.right ?? 0)) /
      viewport.zoom,
    height:
      (canvasSize.height - (overlays.top ?? 0) - (overlays.bottom ?? 0)) /
      viewport.zoom,
    x: (-viewport.x + (overlays.left ?? 0)) / viewport.zoom,
    y: (-viewport.y + (overlays.top ?? 0)) / viewport.zoom,
    zoom: viewport.zoom,
  };
};
