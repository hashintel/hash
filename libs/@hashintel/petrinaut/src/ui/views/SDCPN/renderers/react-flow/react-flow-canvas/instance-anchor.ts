import type {
  CanvasComponentInstanceNode,
  CanvasNode,
  CanvasPoint,
} from "../../../canvas-scene";
import type { NodeOrigin } from "@xyflow/react";

/**
 * A component instance hangs from the middle of its top edge in React Flow,
 * where every other node hangs from its centre. React Flow places a node from
 * the height it measures, so a card hung from its centre would be moved on
 * every frame its height animates; hung from its top, it stays put and grows
 * downward. The scene and the document keep the centre.
 */
export const instanceFlowOrigin: NodeOrigin = [0.5, 0];

/** Where React Flow holds a card the scene has centred at `node.position`. */
export const instanceFlowPosition = (
  node: Pick<CanvasComponentInstanceNode, "position" | "height">,
): CanvasPoint => ({
  x: node.position.x,
  y: node.position.y - node.height / 2,
});

/**
 * A position React Flow reports for a node, as the document holds it: a
 * card's comes back from its top edge to the centre the document stores,
 * which for an unfolded card is the centre of the card folded.
 */
export const documentPositionOf = (
  node: CanvasNode | undefined,
  flowPosition: CanvasPoint,
): CanvasPoint =>
  node?.kind === "componentInstance"
    ? {
        x: flowPosition.x,
        y: flowPosition.y + node.height / 2 - node.anchorOffset,
      }
    : flowPosition;
