import { useMemo } from "react";

import type { NodeType } from "../types";
import type { DraggingStateByNodeId } from "./use-editor-state";

/**
 * Combines the nodes from the Petri Net definition with the transient dragging state.
 * This is necessary because ReactFlow needs to know about dragging state for rendering,
 * but we don't want to report position changes to the consumer while dragging is in progress.
 *
 * @param nodes - The nodes from the Petri Net definition
 * @param draggingStateByNodeId - The transient dragging state
 * @returns Nodes with dragging state folded in
 */
export const useNodesWithDraggingState = (
  nodes: NodeType[],
  draggingStateByNodeId: DraggingStateByNodeId,
) => {
  return useMemo(() => {
    return nodes.map((node) => {
      const draggingState = draggingStateByNodeId[node.id];

      return {
        ...node,
        // Fold in dragging state (the consumer isn't aware of it, as it's a transient property)
        dragging: draggingState?.dragging ?? false,
        position: draggingState?.dragging
          ? draggingState.position
          : node.position,
      };
    });
  }, [nodes, draggingStateByNodeId]);
};
