import { requiredContext } from "../../../../../../react/required-context";

import type { CanvasScene } from "../../../canvas-scene";
import type { CanvasInteractions } from "../../../use-canvas-interactions";

/**
 * The id of the one edge React Flow holds for all the arcs: the arc layer.
 * No arc has it, since an arc's id names its two ends.
 */
export const arcLayerEdgeId = "petrinaut-arcs";

/** What the arcs do with the pointer and the keys. */
export type ArcLayerGestures = Pick<
  CanvasInteractions,
  "selectLink" | "clearHover" | "isAddMode"
> & {
  /** The pointer came onto the item with this id. */
  enterItem: (event: React.MouseEvent, id: string) => void;
};

export type ArcLayerInput = { scene: CanvasScene; gestures: ArcLayerGestures };

/**
 * What the canvas gives the arc layer. React Flow renders the layer as an
 * edge and passes an edge nothing but its own props, so the scene reaches it
 * here: a new scene then renders the layer without a new edge object.
 */
export const [ArcLayerContext, useArcLayerInput] =
  requiredContext<ArcLayerInput>("ReactFlowCanvas");
