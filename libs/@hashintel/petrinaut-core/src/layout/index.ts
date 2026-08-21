/**
 * @layerRoot core.layout
 * @role Computes node positions for a net, so auto-layout does not require the canvas
 */

export {
  calculateGraphLayout,
  type LayoutDimensions,
  type NodePosition,
} from "./calculate-graph-layout";
export { layoutNodeDimensions } from "./dimensions";
