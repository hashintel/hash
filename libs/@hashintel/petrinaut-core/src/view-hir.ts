/**
 * Public entry point for the view HIR, the representation a place
 * visualizer lowers to. It builds on the expression HIR (`./hir`): every
 * value inside a picture is an HIR expression under the `visualizer`
 * surface. See `view-hir/README.md`.
 *
 * The pipeline: visualizer code → `lowerVisualizerToHir` (lowering and
 * checking, in the language worker) → `interpretViewHir` (in the editor) →
 * element values the renderer turns into DOM.
 */
export { checkViewHir } from "./view-hir/check-view";
export {
  interpretViewHir,
  ViewElementValue,
  type ViewProps,
  type ViewValue,
} from "./view-hir/interpret-view";
export { lowerViewHir, type LowerViewResult } from "./view-hir/lower-view";
export {
  isSafeViewValue,
  VIEW_ELEMENT_ATTRIBUTES,
  VIEW_ELEMENT_TAGS,
  VIEW_STYLE_PROPERTIES,
} from "./view-hir/view-elements";
export {
  VIEW_FRAGMENT_TAG,
  type ViewAnd,
  type ViewAttribute,
  type ViewCond,
  type ViewElement,
  type ViewEmpty,
  type ViewExpr,
  type ViewHir,
  type ViewLet,
  type ViewMap,
  type ViewNamedSpan,
  type ViewNode,
  type ViewText,
} from "./view-hir/view-hir";
export { viewHirSchema, viewNodeSchema } from "./view-hir/view-hir-schema";
export {
  lowerVisualizerToHir,
  type VisualizerHir,
} from "./view-hir/visualizer";
