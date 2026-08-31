import type { LayoutDimensions } from "./calculate-graph-layout";

export type NodeDimensions = { width: number; height: number };

/**
 * Dimensions for every node kind the canvas renders.
 */
export type RenderNodeDimensions = {
  place: NodeDimensions;
  transition: NodeDimensions;
  componentInstance: NodeDimensions;
};

/**
 * How nodes are drawn on the canvas, per visualization mode
 * (`userSettings.compactNodes`). The canvas renders nodes at exactly these
 * sizes and derives bounds and viewport math from them, so React Flow never
 * has to measure the DOM.
 */
export const compactNodeDimensions: RenderNodeDimensions = {
  place: { width: 180, height: 50 },
  transition: { width: 180, height: 50 },
  componentInstance: { width: 180, height: 96 },
};

export const classicNodeDimensions: RenderNodeDimensions = {
  place: { width: 130, height: 130 },
  transition: { width: 160, height: 80 },
  componentInstance: { width: 180, height: 96 },
};

const PORT_ROW_HEIGHT = 28;

/**
 * Component instances grow vertically with their port count, so the ports
 * have room to spread along the node's edge.
 */
export const getComponentInstanceHeight = (
  dimensions: RenderNodeDimensions,
  portCount: number,
): number =>
  Math.max(
    dimensions.componentInstance.height,
    (portCount + 1) * PORT_ROW_HEIGHT,
  );

const maxDimensions = (
  first: NodeDimensions,
  second: NodeDimensions,
): NodeDimensions => ({
  width: Math.max(first.width, second.width),
  height: Math.max(first.height, second.height),
});

/**
 * Layout-stable node dimensions used by {@link calculateGraphLayout}.
 *
 * Per-axis maximum of the compact and classic rendering dimensions, so
 * auto-layout output is invariant to the user's compact/classic visualization
 * choice. Without this, toggling `userSettings.compactNodes` after running
 * layout would visually shift every node.
 */
export const layoutNodeDimensions: LayoutDimensions = {
  place: maxDimensions(
    compactNodeDimensions.place,
    classicNodeDimensions.place,
  ),
  transition: maxDimensions(
    compactNodeDimensions.transition,
    classicNodeDimensions.transition,
  ),
  componentInstance: maxDimensions(
    compactNodeDimensions.componentInstance,
    classicNodeDimensions.componentInstance,
  ),
};
