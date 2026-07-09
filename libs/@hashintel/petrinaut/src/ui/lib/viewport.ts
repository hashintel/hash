import type {
  PetrinautReactFlowInstance,
  NodeType,
} from "../views/SDCPN/reactflow-types";

type Viewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// returns the amount offscreen as a postive integer for each direction
const getOffscreenAmount = (
  reactFlowInstance: PetrinautReactFlowInstance,
  viewport: Viewport,
  nodes: NodeType[],
) => {
  const { x, y, width, height } = reactFlowInstance.getNodesBounds(nodes);
  return {
    left: Math.max(viewport.x - x, 0),
    right: Math.max(x + width - (viewport.x + viewport.width), 0),
    top: Math.max(viewport.y - y, 0),
    bottom: Math.max(y + height - (viewport.y + viewport.height), 0),
  };
};

const isOffscreen = (
  reactFlowInstance: PetrinautReactFlowInstance,
  viewport: Viewport,
  nodes: NodeType[],
) => {
  const { left, right, top, bottom } = getOffscreenAmount(
    reactFlowInstance,
    viewport,
    nodes,
  );
  return left > 0 || right > 0 || top > 0 || bottom > 0;
};

const canFitInViewport = (
  reactFlowInstance: PetrinautReactFlowInstance,
  viewport: Viewport,
  nodes: NodeType[],
) => {
  const { width, height } = reactFlowInstance.getNodesBounds(nodes);
  return width < viewport.width && height < viewport.height;
};

// If looking to recenter an edge you should pass the nodes it connects instead
// Since we don't actually hold the xy coordinates of the edge, this is the best we can do for now without
// either measuring the bounding box in the dom or doing math to plot out the bezier curve
export const recenterToFitViewport = (
  reactFlowInstance: PetrinautReactFlowInstance | null,
  viewport: Viewport,
  nodes: NodeType[],
) => {
  if (!reactFlowInstance) return;
  if (!isOffscreen(reactFlowInstance, viewport, nodes)) return;
  if (!canFitInViewport(reactFlowInstance, viewport, nodes)) return;

  const { left, right, top, bottom } = getOffscreenAmount(
    reactFlowInstance,
    viewport,
    nodes,
  );
  return { x: left > 0 ? left * -1 : right, y: top > 0 ? top * -1 : bottom };
};

export const getViewportRect = (
  canvas: HTMLElement,
  viewport: { x: number; y: number; zoom: number },
  overlays: { left?: number; right?: number; top?: number; bottom?: number } = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
) => {
  const { width, height } = canvas.getBoundingClientRect();
  return {
    width:
      (width - (overlays.left ?? 0) - (overlays.right ?? 0)) / viewport.zoom,
    height:
      (height - (overlays.top ?? 0) - (overlays.bottom ?? 0)) / viewport.zoom,
    x: (-viewport.x + (overlays.left ?? 0)) / viewport.zoom,
    y: (-viewport.y + (overlays.top ?? 0)) / viewport.zoom,
    zoom: viewport.zoom,
  };
};
