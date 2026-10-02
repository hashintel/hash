import { useStoreApi } from "@xyflow/react";
import { useEffect, useRef } from "react";

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
 * A selection box drawn with the multi-selection modifier held adds to the
 * selection: the elements selected when the box starts stay selected. React
 * Flow clears the selection as a box starts and deselects whatever the box
 * leaves out, so those deselections are dropped for the kept elements. It
 * also marks a node it deselects that way as unselected in its own lookup,
 * so the flag is set back, or the node would render unselected while it
 * stays in the selection.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/react/src/utils/changes.ts#L107
 */
export const useApplyNodeChanges = (interactions: CanvasInteractions) => {
  const flowStore = useStoreApi();
  const keptSelection = useRef<ReadonlySet<string> | null>(null);

  useEffect(
    () =>
      flowStore.subscribe((state) => {
        if (!state.userSelectionRect) {
          keptSelection.current = null;
        }
      }),
    [flowStore],
  );

  return (changes: (NodeChange | EdgeChange)[]) => {
    const {
      userSelectionRect,
      multiSelectionActive,
      nodes,
      edges,
      nodeLookup,
    } = flowStore.getState();
    if (userSelectionRect && multiSelectionActive && !keptSelection.current) {
      keptSelection.current = new Set(
        [...nodes, ...edges]
          .filter((element) => element.selected)
          .map((element) => element.id),
      );
    }
    const kept = keptSelection.current;

    const selections: CanvasSelectionChange[] = [];
    const moves: CanvasNodeMove[] = [];
    const drops: CanvasNodeDrop[] = [];

    for (const change of changes) {
      if (change.type === "select") {
        if (!change.selected && kept?.has(change.id)) {
          const internalNode = nodeLookup.get(change.id);
          if (internalNode) {
            internalNode.selected = true;
          }
          continue;
        }
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
