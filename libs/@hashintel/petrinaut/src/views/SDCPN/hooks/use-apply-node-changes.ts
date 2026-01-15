import { use } from "react";
import type { EdgeChange, NodeChange } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";
import { SDCPNContext } from "../../../state/sdcpn-context";

/**
 * A hook that provides a callback to apply ReactFlow node changes to the SDCPN store.
 * This is a variant of reactflow's applyChange which updates node positions in the SDCPN store.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/react/src/utils/changes.ts#L107
 */
export function useApplyNodeChanges() {
  const { getItemType } = use(SDCPNContext);

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
  const { updatePlacePosition, updateTransitionPosition } = use(SDCPNContext);

  return (changes: (NodeChange | EdgeChange)[]) => {
    const positionUpdates: Array<{
      id: string;
      position: { x: number; y: number };
    }> = [];

    let selectionChanged = false;

    // Check if current selection has any non-node items (types, etc.)
    const hasNonNodeSelection = Array.from(selectedItemIds).some((id) => {
      const itemType = getItemType(id);
      return (
        itemType !== "place" && itemType !== "transition" && itemType !== "arc"
      );
    });

    // If we have non-node items selected, clear them when ReactFlow tries to select something
    // Otherwise, keep the existing selection and let ReactFlow modify it
    const newSelectedIds = new Set(hasNonNodeSelection ? [] : selectedItemIds);

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
        if (change.selected && !selectedItemIds.has(change.id)) {
          newSelectedIds.add(change.id);
        } else if (!change.selected && selectedItemIds.has(change.id)) {
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
        updatePlacePosition(id, { x: position.x, y: position.y });
      } else if (itemType === "transition") {
        updateTransitionPosition(id, { x: position.x, y: position.y });
      }
    }
  };
}
