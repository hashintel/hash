import type { EdgeChange, NodeChange } from "@xyflow/react";
import { use } from "react";

import { EditorContext } from "../../../state/editor-context";
import { SDCPNContext } from "../../../state/sdcpn-context";
import type { SelectionMap } from "../../../state/selection";
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
  const { updateDraggingStateByNodeId, setSelection } = use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);
  const dims = compactNodes ? compactNodeDimensions : classicNodeDimensions;

  return (changes: (NodeChange | EdgeChange)[]) => {
    const positionCommits: Array<{
      id: string;
      position: { x: number; y: number };
    }> = [];
    let selectionChanged = false;

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

    // Apply selection changes to EditorStore using a functional updater
    // so that concurrent onNodesChange and onEdgesChange calls (which
    // ReactFlow fires separately in the same event tick) don't clobber
    // each other due to stale closure state.
    if (selectionChanged) {
      setSelection((prevSelection) => {
        const hasNonCanvasItems = Array.from(prevSelection.values()).some(
          (item) =>
            item.type !== "place" &&
            item.type !== "transition" &&
            item.type !== "arc",
        );

        const base: SelectionMap = new Map(
          hasNonCanvasItems ? [] : prevSelection,
        );

        for (const change of changes) {
          if (change.type === "select") {
            if (change.selected && !prevSelection.has(change.id)) {
              const itemType = getItemType(change.id);
              // Skip arcs — they are only selectable via direct click
              // (onEdgeClick), not via drag-to-select box selection.
              if (itemType && itemType !== "arc") {
                base.set(change.id, { type: itemType, id: change.id });
              }
            } else if (!change.selected && prevSelection.has(change.id)) {
              base.delete(change.id);
            }
          }
        }

        return base;
      });
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
