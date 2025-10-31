import { useMemo } from "react";

import type { NodeType, PlaceNodeType } from "../types";

/**
 * Finds the selected place node from the list of nodes.
 *
 * @param nodes - All nodes in the Petri Net
 * @param selectedPlaceId - The ID of the selected place
 * @returns The selected place node, or null if no place is selected
 * @throws Error if the place ID doesn't exist in the nodes
 */
export const useSelectedPlace = (
  nodes: NodeType[],
  selectedPlaceId: string | null,
): PlaceNodeType | null => {
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
