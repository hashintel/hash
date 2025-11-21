import type { NodeType } from "@hashintel/petrinaut-old";
import { nodeDimensions } from "@hashintel/petrinaut-old";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import type { PersistedNet } from "../use-process-save-and-load";

/**
 * Updates the input and output place nodes in a sub-process net to include new input and output places from the parent transition,
 * and remove links to input and output places in the parent which are no longer selected as relevant to the sub-process.
 *
 * New input places are positioned above the leftmost node(s), and new output places above the rightmost node(s).
 *
 * @param subProcessNet - The sub-process net to update
 * @param inputPlaceLabelById - A map of relevant input place IDs to their labels
 * @param outputPlaceLabelById - A map of relevant output place IDs to their labels
 *
 * @returns The new sub-process nodes, or null if no changes were made
 */
export const updateSubProcessDefinitionForParentPlaces = ({
  subProcessNet,
  inputPlaceLabelById,
  outputPlaceLabelById,
}: {
  subProcessNet: PersistedNet;
  inputPlaceLabelById: Record<string, string>;
  outputPlaceLabelById: Record<string, string>;
}): NodeType[] | null => {
  const { nodes } = subProcessNet.definition;

  /**
   * We want to find the leftmost and rightmost places, and the minimum y-coordinates for the leftmost and rightmost places,
   * so that we can position the new input and output places above the leftmost and rightmost places, respectively.
   */
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minYLeft = Number.POSITIVE_INFINITY;
  let minYRight = Number.POSITIVE_INFINITY;

  const newNodes: NodeType[] = [];

  const inputPlaceIds = Object.keys(inputPlaceLabelById);
  const outputPlaceIds = Object.keys(outputPlaceLabelById);

  const inputPlaceIdsToAdd = new Set<string>(inputPlaceIds);
  const outputPlaceIdsToAdd = new Set<string>(outputPlaceIds);

  let nodesUnlinkedCount = 0;

  for (const node of nodes) {
    /**
     * Register the node's position so that we can position any new input and output places correctly later.
     */
    const x = node.position.x;
    const y = node.position.y;

    if (x < minX) {
      minX = x;
      minYLeft = y;
    } else if (x === minX) {
      minYLeft = Math.min(minYLeft, y);
    }

    if (x > maxX) {
      maxX = x;
      minYRight = y;
    } else if (x === maxX) {
      minYRight = Math.min(minYRight, y);
    }

    if (
      node.data.type === "place" &&
      node.data.parentNetNode &&
      ((node.data.parentNetNode.type === "input" &&
        !inputPlaceIds.includes(node.data.parentNetNode.id)) ||
        (node.data.parentNetNode.type === "output" &&
          !outputPlaceIds.includes(node.data.parentNetNode.id)))
    ) {
      /**
       * This is an input or output place node from the parent which is no longer relevant to the sub-process,
       * so we remove the link to the parent process node.
       */
      const { parentNetNode: _, ...restData } = node.data;

      newNodes.push({
        ...node,
        data: restData,
      });

      nodesUnlinkedCount++;

      continue;
    }

    if (node.data.type === "place" && node.data.parentNetNode) {
      /**
       * Register the fact that we've seen a linked input or output place, so that it doesn't need adding as a new node.
       */
      if (node.data.parentNetNode.type === "input") {
        inputPlaceIdsToAdd.delete(node.data.parentNetNode.id);
      } else {
        outputPlaceIdsToAdd.delete(node.data.parentNetNode.id);
      }
    }

    newNodes.push(node);
  }

  if (
    inputPlaceIdsToAdd.size === 0 &&
    outputPlaceIdsToAdd.size === 0 &&
    nodesUnlinkedCount === 0
  ) {
    /**
     * No changes were necessary to the sub-process, so we return null.
     */
    return null;
  }

  if (minX === Number.POSITIVE_INFINITY) {
    minX = 0;
  }
  if (maxX === Number.NEGATIVE_INFINITY) {
    maxX = 300;
  }
  if (minYLeft === Number.POSITIVE_INFINITY) {
    minYLeft = 0;
  }
  if (minYRight === Number.POSITIVE_INFINITY) {
    minYRight = 0;
  }

  for (const [index, inputPlaceId] of [...inputPlaceIdsToAdd].entries()) {
    const id = generateUuid();

    const label = inputPlaceLabelById[inputPlaceId];

    if (!label) {
      throw new Error(`Input place label not found for id ${inputPlaceId}`);
    }

    newNodes.push({
      id,
      type: "place",
      position: {
        x: minX,
        y: minYLeft - (nodeDimensions.place.height + 80) * (index + 1), // stack above leftmost
      },
      ...nodeDimensions.place,
      data: {
        label,
        type: "place",
        parentNetNode: {
          id: inputPlaceId,
          type: "input",
        },
      },
    });
  }

  for (const [index, outputPlaceId] of [...outputPlaceIdsToAdd].entries()) {
    const id = generateUuid();

    const label = outputPlaceLabelById[outputPlaceId];

    if (!label) {
      throw new Error(`Output place label not found for id ${outputPlaceId}`);
    }

    newNodes.push({
      id,
      type: "place",
      position: {
        x: maxX,
        y: minYRight - (nodeDimensions.place.height + 80) * (index + 1), // stack above rightmost
      },
      ...nodeDimensions.place,
      data: {
        label,
        type: "place",
        parentNetNode: {
          id: outputPlaceId,
          type: "output",
        },
      },
    });
  }

  return newNodes;
};
