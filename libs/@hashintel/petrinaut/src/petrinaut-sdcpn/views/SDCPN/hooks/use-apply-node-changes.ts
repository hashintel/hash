import type { NodeChange } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNStore } from "../../../state/sdcpn-provider";

/**
 * A hook that provides a callback to apply ReactFlow node changes to the SDCPN store.
 * This is a variant of reactflow's applyChange which updates node positions in the SDCPN store.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/react/src/utils/changes.ts#L107
 */
export function useApplyNodeChanges() {
  const getItemType = useEditorStore((state) => state.getItemType);
  const draggingStateByNodeId = useEditorStore(
    (state) => state.draggingStateByNodeId,
  );
  const updateDraggingStateByNodeId = useEditorStore(
    (state) => state.updateDraggingStateByNodeId,
  );
  const setSelectedItemIds = useEditorStore(
    (state) => state.setSelectedItemIds,
  );
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);
  const updatePlacePosition = useSDCPNStore(
    (state) => state.updatePlacePosition,
  );
  const updateTransitionPosition = useSDCPNStore(
    (state) => state.updateTransitionPosition,
  );

  return (changes: NodeChange[]) => {
    const positionUpdates: Array<{
      id: string;
      position: { x: number; y: number };
    }> = [];

    let selectionChanged = false;
    const newSelectedIds = new Set(selectedItemIds);

    for (const change of changes) {
      if (
        // We add nodes in onDrop, we won't handle these kind of changes
        change.type === "add" ||
        // unclear what reset is supposed to do, it's not handled in reactflow's applyChange implementation
        change.type === "reset" ||
        // We don't allow resizing at the moment
        change.type === "dimensions"
      ) {
        continue;
      }

      if (change.type === "select") {
        selectionChanged = true;
        if (change.selected) {
          newSelectedIds.add(change.id);
        } else {
          newSelectedIds.delete(change.id);
        }
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

    // Apply selection changes to EditorStore
    if (selectionChanged) {
      setSelectedItemIds(newSelectedIds);
    }

    // Apply position updates to SDCPN store
    for (const { id, position } of positionUpdates) {
      // Get item type to determine whether it's a place or transition
      const itemType = getItemType(id);

      if (itemType === "place") {
        updatePlacePosition(id, position.x, position.y);
      } else if (itemType === "transition") {
        updateTransitionPosition(id, position.x, position.y);
      }
    }
  };
}
