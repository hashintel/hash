import { type Node, getNodesBounds } from "@xyflow/react";

type Viewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// returns the amount offscreen as a postive integer for each direction
const getOffscreenAmount = (viewport: Viewport, nodes: Node[]) => {
  const { x, y, width, height } = getNodesBounds(nodes);
  return {
    left: Math.max(viewport.x - x, 0),
    right: Math.max(x + width - (viewport.x + viewport.width), 0),
    top: Math.max(viewport.y - y, 0),
    bottom: Math.max(y + height - (viewport.y + viewport.height), 0),
  };
};

const isOffscreen = (viewport: Viewport, nodes: Node[]) => {
  const { left, right, top, bottom } = getOffscreenAmount(viewport, nodes);
  return left > 0 || right > 0 || top > 0 || bottom > 0;
};

const canFitInViewport = (viewport: Viewport, nodes: Node[]) => {
  const { width, height } = getNodesBounds(nodes);
  return width < viewport.width && height < viewport.height;
};

// If looking to recenter an edge you should pass the nodes it connects instead
// Since we don't actually hold the xy coordinates of the edge, this is the best we can do for now without
// either measuring the bounding box in the dom or doing math to plot out the bezier curve
export const recenterToFitViewport = (viewport: Viewport, nodes: Node[]) => {
  if (!isOffscreen(viewport, nodes)) return;
  if (!canFitInViewport(viewport, nodes)) return;

  const { left, right, top, bottom } = getOffscreenAmount(viewport, nodes);
  return { x: left > 0 ? left * -1 : right, y: top > 0 ? top * -1 : bottom };
};
