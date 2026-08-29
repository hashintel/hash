import { getViewportForBounds } from "@xyflow/react";

import {
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
  ZOOM_PADDING,
} from "@hashintel/petrinaut-core";

import type { NodeType } from "../views/SDCPN/reactflow-types";
import type { Rect, Size } from "@hashintel/petrinaut-core";

type Viewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The canvas never zooms in past this when fitting the net into view. */
export const MAX_FIT_ZOOM = 1.1;

/**
 * The viewport centered on the given net bounds, respecting the same zoom
 * limits as the rest of the canvas. Top-left origin at zoom 1 when there is
 * nothing to fit.
 */
export const getInitialViewport = (
  bounds: Rect | null,
  container: Size,
): { x: number; y: number; zoom: number } => {
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  return getViewportForBounds(
    bounds,
    container.width,
    container.height,
    getMinZoomForBounds(bounds, container),
    MAX_FIT_ZOOM,
    ZOOM_PADDING,
  );
};

// returns the amount offscreen as a positive integer for each direction
const getOffscreenAmount = (bounds: Rect, viewport: Viewport) => ({
  left: Math.max(viewport.x - bounds.x, 0),
  right: Math.max(bounds.x + bounds.width - (viewport.x + viewport.width), 0),
  top: Math.max(viewport.y - bounds.y, 0),
  bottom: Math.max(
    bounds.y + bounds.height - (viewport.y + viewport.height),
    0,
  ),
});

const isOffscreen = (bounds: Rect, viewport: Viewport) => {
  const { left, right, top, bottom } = getOffscreenAmount(bounds, viewport);
  return left > 0 || right > 0 || top > 0 || bottom > 0;
};

const canFitInViewport = (bounds: Rect, viewport: Viewport) =>
  bounds.width < viewport.width && bounds.height < viewport.height;

// If looking to recenter an edge you should pass the nodes it connects instead
// Since we don't actually hold the xy coordinates of the edge, this is the best we can do for now without
// either measuring the bounding box in the dom or doing math to plot out the bezier curve
export const recenterToFitViewport = (
  viewport: Viewport,
  nodes: NodeType[],
) => {
  const bounds = getBoundsOfCenteredBoxes(nodes);
  if (!bounds) return;
  if (!isOffscreen(bounds, viewport)) return;
  if (!canFitInViewport(bounds, viewport)) return;

  const { left, right, top, bottom } = getOffscreenAmount(bounds, viewport);
  return { x: left > 0 ? left * -1 : right, y: top > 0 ? top * -1 : bottom };
};

export const getViewportRect = (
  canvasSize: Size,
  viewport: { x: number; y: number; zoom: number },
  overlays: { left?: number; right?: number; top?: number; bottom?: number } = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
) => {
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
