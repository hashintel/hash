import type { EdgeChange, NodeChange } from "@xyflow/react";
import { use } from "react";

import { EditorContext } from "../../../state/editor-context";
import { MutationContext } from "../../../state/mutation-context";
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
  const { getItemType } = use(SDCPNContext);
  const { commitNodePositions } = use(MutationContext);
  const { updateDraggingStateByNodeId, setSelection } = use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);
  const dimensions = compactNodes
    ? compactNodeDimensions
    : classicNodeDimensions;

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
        } else {
          if (change.position) {
            // Drag ended for this node. Use `change.position` directly rather than
            // reading from `draggingStateByNodeId`, because the closure may be stale:
            // ReactFlow syncs `onNodesChange` to its store via useEffect, so between
            // rapid mouse events the callback may reference an older render's state.
            positionCommits.push({
              id: change.id,
              position: change.position,
            });
          }
          // Always clear dragging state on drag-end, even if position is absent,
          // to avoid leaving nodes stuck in a visual dragging state.
          updateDraggingStateByNodeId((existing) => {
            if (!(change.id in existing)) {
              return existing;
            }
            const { [change.id]: _, ...rest } = existing;
            return rest;
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

        let changed = hasNonCanvasItems && prevSelection.size > 0;

        for (const change of changes) {
          if (change.type === "select") {
            if (change.selected && !base.has(change.id)) {
              const itemType = getItemType(change.id);
              // Skip arcs — they are only selectable via direct click
              // (onEdgeClick), not via drag-to-select box selection.
              if (itemType && itemType !== "arc") {
                base.set(change.id, { type: itemType, id: change.id });
                changed = true;
              }
            } else if (!change.selected && base.has(change.id)) {
              base.delete(change.id);
              changed = true;
            }
          }
        }

        // Avoid unnecessary re-renders when nothing actually changed
        return changed ? base : prevSelection;
      });
    }

    // Commit all final positions from drag-end in a single atomic mutation
    // so that clearing the dragging state never exposes stale SDCPN positions.
    if (positionCommits.length > 0) {
      const commits: Array<{
        id: string;
        itemType: "place" | "transition";
        position: { x: number; y: number };
      }> = [];

      for (const { id, position } of positionCommits) {
        const type = getItemType(id);
        if (type === "place") {
          commits.push({
            id,
            itemType: type,
            position: {
              x: position.x + dimensions.place.width / 2,
              y: position.y + dimensions.place.height / 2,
            },
          });
        } else if (type === "transition") {
          commits.push({
            id,
            itemType: type,
            position: {
              x: position.x + dimensions.transition.width / 2,
              y: position.y + dimensions.transition.height / 2,
            },
          });
        }
      }

      if (commits.length > 0) {
        commitNodePositions(commits);
      }
    }
  };
}
