/**
 * @layerRoot core.layout
 * @role Computes node positions, dimensions and canvas geometry for a net, so neither auto-layout nor viewport math requires the canvas
 */

export {
  calculateGraphLayout,
  type LayoutDimensions,
  type NodePosition,
} from "./calculate-graph-layout";
export {
  classicNodeDimensions,
  compactNodeDimensions,
  getComponentInstanceHeight,
  layoutNodeDimensions,
  type NodeDimensions,
  type RenderNodeDimensions,
} from "./dimensions";
export {
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
  type Rect,
  type Size,
  ZOOM_PADDING,
} from "./geometry";
