import type { EdgeChange, NodeChange } from "@xyflow/react";
import { use } from "react";

import { EditorContext } from "../../../state/editor-context";
import { SDCPNContext } from "../../../state/sdcpn-context";
import type { SelectionItem, SelectionMap } from "../../../state/selection";
import { UserSettingsContext } from "../../../state/user-settings-context";
import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "../styles/styling";

/**
 * A hook that provides a callback to apply ReactFlow node changes to the SDCPN store.
 * This is a variant of reactflow's applyChange which updates node positions in the SDCPN store.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/react/src/utils/changes.ts#L107
 */
export function useApplyNodeChanges() {
  const { getItemType, updatePlacePosition, updateTransitionPosition } =
    use(SDCPNContext);
  const {
    draggingStateByNodeId,
    updateDraggingStateByNodeId,
    setSelection,
    selection,
  } = use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);
  const dims = compactNodes ? compactNodeDimensions : classicNodeDimensions;

  return (changes: (NodeChange | EdgeChange)[]) => {
    const positionUpdates: Array<{
      id: string;
      position: { x: number; y: number };
    }> = [];

    let selectionChanged = false;

    // Check if current selection has any non-node items (types, etc.)
    const hasNonCanvasSelection = Array.from(selection.values()).some(
      (item) =>
        item.type !== "place" &&
        item.type !== "transition" &&
        item.type !== "arc",
    );

    // If we have non-canvas items selected, clear them when ReactFlow tries to select something
    // Otherwise, keep the existing selection and let ReactFlow modify it
    const newSelection: SelectionMap = new Map(
      hasNonCanvasSelection ? [] : selection,
    );

    for (const change of changes) {
      if (
        // We add nodes in onDrop, we won't handle these kind of changes
        change.type === "add" ||
        // We handle replace the same as add — our SDCPN store is the source of truth
        change.type === "replace" ||
        // We don't allow resizing at the moment
        change.type === "dimensions"
      ) {
        continue;
      }

      if (change.type === "select") {
        selectionChanged = true;
        if (change.selected && !selection.has(change.id)) {
          const itemType = getItemType(change.id);
          if (itemType) {
            const item: SelectionItem = { type: itemType, id: change.id };
            newSelection.set(change.id, item);
          }
        } else if (!change.selected && selection.has(change.id)) {
          newSelection.delete(change.id);
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

          // Clear the dragging state for this node now that the drag is complete
          // and the position has been collected for commit to the SDCPN store.
          // Keeping stale positions here would cause them to be re-applied
          // if ReactFlow emits a spurious position change after an undo.
          updateDraggingStateByNodeId((existing) => {
            const { [change.id]: _, ...rest } = existing;
            return rest;
          });
        }
      }
    }

    // Apply selection changes to EditorStore
    if (selectionChanged) {
      setSelection(newSelection);
    }

    // Apply position updates to SDCPN store
    for (const { id, position } of positionUpdates) {
      // Get item type to determine whether it's a place or transition
      const itemType = getItemType(id);

      if (itemType === "place") {
        updatePlacePosition(id, {
          x: position.x + dims.place.width / 2,
          y: position.y + dims.place.height / 2,
        });
      } else if (itemType === "transition") {
        updateTransitionPosition(id, {
          x: position.x + dims.transition.width / 2,
          y: position.y + dims.transition.height / 2,
        });
      }
    }
  };
}
