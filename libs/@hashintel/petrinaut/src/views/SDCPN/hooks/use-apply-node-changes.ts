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
  const { getItemType, mutatePetriNetDefinition } = use(SDCPNContext);
  const { updateDraggingStateByNodeId, setSelection, selection } =
    use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);
  const dims = compactNodes ? compactNodeDimensions : classicNodeDimensions;

  return (changes: (NodeChange | EdgeChange)[]) => {
    const positionCommits: Array<{
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
        } else if (change.position) {
          // Drag ended for this node. Use `change.position` directly rather than
          // reading from `draggingStateByNodeId`, because the closure may be stale:
          // ReactFlow syncs `onNodesChange` to its store via useEffect, so between
          // rapid mouse events the callback may reference an older render's state.
          positionCommits.push({
            id: change.id,
            position: change.position,
          });
        }
      }
    }

    // Apply selection changes to EditorStore
    if (selectionChanged) {
      setSelection(newSelection);
    }

    // Commit all final positions from drag-end in a single atomic mutation
    // so that clearing the dragging state never exposes stale SDCPN positions.
    if (positionCommits.length > 0) {
      const commits = positionCommits.map(({ id, position }) => ({
        id,
        itemType: getItemType(id),
        position,
      }));

      mutatePetriNetDefinition((sdcpn) => {
        for (const { id, itemType, position } of commits) {
          if (itemType === "place") {
            for (const place of sdcpn.places) {
              if (place.id === id) {
                place.x = position.x + dims.place.width / 2;
                place.y = position.y + dims.place.height / 2;
                break;
              }
            }
          } else if (itemType === "transition") {
            for (const transition of sdcpn.transitions) {
              if (transition.id === id) {
                transition.x = position.x + dims.transition.width / 2;
                transition.y = position.y + dims.transition.height / 2;
                break;
              }
            }
          }
        }
      });
      updateDraggingStateByNodeId(() => ({}));
    }
  };
}
