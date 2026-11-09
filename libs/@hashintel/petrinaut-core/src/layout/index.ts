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
  COMPONENT_INSTANCE_FOOTER_HEIGHT,
  COMPONENT_INSTANCE_HEADER_HEIGHT,
  COMPONENT_INSTANCE_PORT_ROW_HEIGHT,
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
