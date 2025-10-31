import { useMemo } from "react";

import type { NodeType, PlaceNodeType } from "../types";
import { useEditorStore } from "./editor-store";

/**
 * Finds the selected place node from the list of nodes using the Zustand store.
 *
 * @param nodes - All nodes in the Petri Net
 * @returns The selected place node, or null if no place is selected
 * @throws Error if the place ID doesn't exist in the nodes
 */
export const useSelectedPlace = (nodes: NodeType[]): PlaceNodeType | null => {
  const selectedPlaceId = useEditorStore((state) => state.selectedPlaceId);

  return useMemo(() => {
    if (!selectedPlaceId) {
      return null;
    }

    const place = nodes.find(
      (node): node is PlaceNodeType =>
        node.id === selectedPlaceId && node.data.type === "place",
    );

    if (!place) {
      throw new Error(`Cannot find place with id ${selectedPlaceId}`);
    }

    return place;
  }, [nodes, selectedPlaceId]);
};
