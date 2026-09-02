import type {
  CanvasInteractions,
  CanvasNodeDrop,
  CanvasNodeMove,
  CanvasSelectionChange,
} from "../../../use-canvas-interactions";
import type { EdgeChange, NodeChange } from "@xyflow/react";

/**
 * Turns the changes React Flow reports into canvas interactions. Adds,
 * replacements and dimension changes are ignored: the SDCPN store is the
 * source of truth for structure and sizes.
 *
 * Drag ends use `change.position` directly rather than the dragging state,
 * because React Flow syncs `onNodesChange` to its store via an effect, so
 * between rapid mouse events the callback may see an older render's state.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/react/src/utils/changes.ts#L107
 */
export const useApplyNodeChanges = (interactions: CanvasInteractions) => {
  return (changes: (NodeChange | EdgeChange)[]) => {
    const selections: CanvasSelectionChange[] = [];
    const moves: CanvasNodeMove[] = [];
    const drops: CanvasNodeDrop[] = [];

    for (const change of changes) {
      if (change.type === "select") {
        selections.push({ id: change.id, selected: change.selected });
      } else if (change.type === "position") {
        if (change.dragging) {
          moves.push({
            id: change.id,
            position: change.position ?? { x: 0, y: 0 },
          });
        } else {
          drops.push({ id: change.id, position: change.position ?? null });
        }
      }
    }

    if (selections.length > 0) {
      interactions.applySelectionChanges(selections);
    }
    if (moves.length > 0) {
      interactions.moveNodes(moves);
    }
    if (drops.length > 0) {
      interactions.dropNodes(drops);
    }
  };
};
