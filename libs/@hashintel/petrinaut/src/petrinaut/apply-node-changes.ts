import type { Dispatch, SetStateAction } from "react";
import type { NodeAddChange, NodeChange } from "reactflow";

import type { MutatePetriNetDefinition } from "./editor-context";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

/**
 * A variant of reactflow's applyChange which mutates the petri net definition instead of creating a new node or edge array.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/react/src/utils/changes.ts#L107
 */
export const applyNodeChanges = ({
  changes,
  draggingStateByNodeId,
  mutatePetriNetDefinition,
  setDraggingStateByNodeId,
}: {
  changes: NodeChange[];
  draggingStateByNodeId: DraggingStateByNodeId;
  mutatePetriNetDefinition: MutatePetriNetDefinition;
  setDraggingStateByNodeId: Dispatch<SetStateAction<DraggingStateByNodeId>>;
}) => {
  const changesByNodeId: Record<string, NodeChange[]> = {};
  const addChanges: NodeAddChange[] = [];

  for (const change of changes) {
    if (
      // We add nodes in onDrop, we won't handle these kind of changes
      change.type === "add" ||
      // unclear what reset is supposed to do, it's not handled in reactflow's applyChange implementation
      change.type === "reset" ||
      // We handle selection in separate state ourselves
      change.type === "select" ||
      // We don't allow resizing at the moment
      change.type === "dimensions"
    ) {
      continue;
    }

    if (change.type === "position") {
      if (change.dragging) {
        setDraggingStateByNodeId((existing) => ({
          ...existing,
          [change.id]: {
            dragging: true,
            position: change.position ?? { x: 0, y: 0 },
          },
        }));
      } else {
        const lastPosition = draggingStateByNodeId[change.id]?.position;

        if (!lastPosition) {
          // we've had a dragging: false with no preceding dragging: true, so the node has not been dragged anywhere.
          continue;
        }

        /**
         * When dragging stops, we receive a change event with 'dragging: false' but no position.
         * We use the last position we received to report the change to the consumer.
         */
        changesByNodeId[change.id] ??= [];
        changesByNodeId[change.id]!.push({
          type: "position",
          id: change.id,
          position: lastPosition,
        });

        setDraggingStateByNodeId((existing) => ({
          ...existing,
          [change.id]: {
            dragging: false,
            position: lastPosition,
          },
        }));
      }
    }
  }

  if (addChanges.length === 0 && Object.keys(changesByNodeId).length === 0) {
    return;
  }

  mutatePetriNetDefinition((existingNet) => {
    for (const node of existingNet.nodes) {
      const changesForNode: NodeChange[] = changesByNodeId[node.id] ?? [];

      for (const change of changesForNode) {
        if (change.type === "position") {
          if (change.position) {
            if (node.position.x !== change.position.x) {
              node.position.x = change.position.x;
            }
            if (node.position.y !== change.position.y) {
              node.position.y = change.position.y;
            }
          }

          if (change.positionAbsolute) {
            if (node.positionAbsolute?.x !== change.positionAbsolute.x) {
              node.positionAbsolute ??= { x: 0, y: 0 };
              node.positionAbsolute.x = change.positionAbsolute.x;
            }
            if (node.positionAbsolute.y !== change.positionAbsolute.y) {
              node.positionAbsolute ??= { x: 0, y: 0 };
              node.positionAbsolute.y = change.positionAbsolute.y;
            }
          }
        }
      }
    }

    existingNet.nodes.push(...addChanges.map((change) => change.item));
  });
};
