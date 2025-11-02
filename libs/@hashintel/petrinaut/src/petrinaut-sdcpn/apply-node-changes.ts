import type { NodeChange } from "reactflow";

import type { DraggingStateByNodeId } from "./state/mod";

/**
 * A variant of reactflow's applyChange which updates node positions in the SDCPN store.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/react/src/utils/changes.ts#L107
 */
export const applyNodeChanges = ({
  changes,
  draggingStateByNodeId,
  updatePlacePosition,
  updateTransitionPosition,
  updateDraggingStateByNodeId,
}: {
  changes: NodeChange[];
  draggingStateByNodeId: DraggingStateByNodeId;
  updatePlacePosition: (placeId: string, x: number, y: number) => void;
  updateTransitionPosition: (
    transitionId: string,
    x: number,
    y: number,
  ) => void;
  updateDraggingStateByNodeId: (
    updater: (state: DraggingStateByNodeId) => DraggingStateByNodeId,
  ) => void;
}) => {
  const positionUpdates: Array<{
    id: string;
    position: { x: number; y: number };
  }> = [];

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
        updateDraggingStateByNodeId((existing) => ({
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
        positionUpdates.push({
          id: change.id,
          position: lastPosition,
        });

        updateDraggingStateByNodeId((existing) => ({
          ...existing,
          [change.id]: {
            dragging: false,
            position: lastPosition,
          },
        }));
      }
    }
  }

  // Apply position updates to SDCPN store
  for (const { id, position } of positionUpdates) {
    // Determine if it's a place or transition based on node ID prefix
    if (id.startsWith("place__")) {
      updatePlacePosition(id, position.x, position.y);
    } else if (id.startsWith("transition__")) {
      updateTransitionPosition(id, position.x, position.y);
    }
  }
};
