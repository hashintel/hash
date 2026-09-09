import { use } from "react";

import { EditorContext } from "../../../../react/state/editor-context";

import type { SelectionVariant } from "../styles/node-surface";

/**
 * How a node should be drawn relative to the current selection: part of the
 * resource selection, part of React Flow's own, or dimmed as unconnected to
 * whatever is selected or hovered.
 *
 * @param selected React Flow's own selected flag for the node
 */
export const useSelectionVariant = (
  nodeId: string,
  selected: boolean,
): SelectionVariant => {
  const {
    isSelected,
    isNotSelectedConnection,
    isNotHoveredConnection,
    hoveredItem,
  } = use(EditorContext);

  if (isSelected(nodeId)) {
    return "resource";
  }

  if (selected) {
    return "reactflow";
  }

  if (
    isNotHoveredConnection(nodeId) ||
    (!hoveredItem && isNotSelectedConnection(nodeId))
  ) {
    return "notSelectedConnection";
  }

  return "none";
};
