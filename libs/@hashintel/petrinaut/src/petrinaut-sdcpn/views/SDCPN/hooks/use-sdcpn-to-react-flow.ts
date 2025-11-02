import { useMemo } from "react";

import type { SDCPN } from "../../../../core/types/sdcpn";
import { useEditorStore } from "../../../state/editor-provider";
import type { NodeType, PetriNetDefinitionObject } from "../../../state/types-for-editor-to-remove";

/**
 * Converts SDCPN state to ReactFlow format (nodes and edges), and combines
 * with the transient dragging state from the editor store.
 *
 * This hook merges the functionality of:
 * - Converting SDCPN places/transitions/arcs to ReactFlow nodes/edges
 * - Folding in the dragging state for proper rendering during drag operations
 *
 * @param sdcpn - The SDCPN state to convert
 * @returns An object with nodes (including dragging state) and arcs for ReactFlow
 */
export function useSdcpnToReactFlow(sdcpn: SDCPN): PetriNetDefinitionObject {
  const draggingStateByNodeId = useEditorStore(
    (state) => state.draggingStateByNodeId,
  );

  return useMemo(() => {
    const nodes: NodeType[] = [];

    // Create place nodes
    for (const place of sdcpn.places) {
      const draggingState = draggingStateByNodeId[place.id];

      nodes.push({
        id: place.id,
        type: "place",
        position: draggingState?.dragging
          ? draggingState.position
          : { x: place.x, y: place.y },
        width: place.width ?? 80,
        height: place.height ?? 80,
        dragging: draggingState?.dragging ?? false,
        data: {
          label: place.name,
          type: "place",
        },
      });
    }

    // Create transition nodes
    for (const transition of sdcpn.transitions) {
      const draggingState = draggingStateByNodeId[transition.id];

      nodes.push({
        id: transition.id,
        type: "transition",
        position: draggingState?.dragging
          ? draggingState.position
          : { x: transition.x, y: transition.y },
        width: transition.width ?? 60,
        height: transition.height ?? 60,
        dragging: draggingState?.dragging ?? false,
        data: {
          label: transition.name,
          type: "transition",
        },
      });
    }

    // Create arcs from input and output arcs
    const arcs = [];

    for (const transition of sdcpn.transitions) {
      // Input arcs (from places to transition)
      for (const inputArc of transition.inputArcs) {
        const arcId = `arc__${inputArc.placeId}-${transition.id}`;

        arcs.push({
          id: arcId,
          source: inputArc.placeId,
          target: transition.id,
          type: "default" as const,
          data: {
            tokenWeights: {
              default: inputArc.weight,
            },
          },
        });
      }

      // Output arcs (from transition to places)
      for (const outputArc of transition.outputArcs) {
        const arcId = `arc__${transition.id}-${outputArc.placeId}`;

        arcs.push({
          id: arcId,
          source: transition.id,
          target: outputArc.placeId,
          type: "default" as const,
          data: {
            tokenWeights: {
              default: outputArc.weight,
            },
          },
        });
      }
    }

    return {
      nodes,
      arcs,
    };
  }, [sdcpn, draggingStateByNodeId]);
}
