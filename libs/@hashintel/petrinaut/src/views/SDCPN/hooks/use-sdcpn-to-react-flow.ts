import { MarkerType } from "reactflow";

import type { SDCPN } from "../../../core/types/sdcpn";
import { hexToHsl } from "../../../lib/hsl-color";
import { useEditorStore } from "../../../state/editor-provider";
import { generateArcId } from "../../../state/sdcpn-provider";
import type {
  NodeType,
  PetriNetDefinitionObject,
} from "../../../state/types-for-editor-to-remove";

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
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);

  const nodes: NodeType[] = [];

  // Create place nodes
  for (const place of sdcpn.places) {
    const draggingState = draggingStateByNodeId[place.id];

    // Check if place has a type with at least one dimension (element)
    const placeType = place.colorId
      ? sdcpn.types.find((type) => type.id === place.colorId)
      : null;
    const hasColorType = !!(placeType && placeType.elements.length > 0);

    nodes.push({
      id: place.id,
      type: "place",
      position: draggingState?.dragging
        ? draggingState.position
        : { x: place.x, y: place.y },
      width: place.width ?? 80,
      height: place.height ?? 80,
      dragging: draggingState?.dragging ?? false,
      selected: selectedItemIds.has(place.id),
      data: {
        label: place.name,
        type: "place",
        dynamicsEnabled: place.dynamicsEnabled,
        hasColorType,
        typeColor: placeType?.displayColor, // Pass the type color for border styling
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
      selected: selectedItemIds.has(transition.id),
      data: {
        label: transition.name,
        type: "transition",
        lambdaType: transition.lambdaType,
      },
    });
  }

  // Create arcs from input and output arcs
  const arcs = [];

  for (const transition of sdcpn.transitions) {
    // Input arcs (from places to transition)
    for (const inputArc of transition.inputArcs) {
      const arcId = generateArcId({
        inputId: inputArc.placeId,
        outputId: transition.id,
      });

      // Get the place to determine type color
      const place = sdcpn.places.find((pl) => pl.id === inputArc.placeId);
      const placeType = place?.colorId
        ? sdcpn.types.find((type) => type.id === place.colorId)
        : null;
      const arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      arcs.push({
        id: arcId,
        source: inputArc.placeId,
        target: transition.id,
        type: "default" as const,
        selected: selectedItemIds.has(arcId),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: arcColor,
          width: 20,
          height: 20,
        },
        style: {
          stroke: arcColor,
          strokeWidth: 2,
        },
        data: {
          tokenWeights: {
            default: inputArc.weight,
          },
        },
      });
    }

    // Output arcs (from transition to places)
    for (const outputArc of transition.outputArcs) {
      const arcId = generateArcId({
        inputId: transition.id,
        outputId: outputArc.placeId,
      });

      // Get the place to determine type color
      const place = sdcpn.places.find((pl) => pl.id === outputArc.placeId);
      const placeType = place?.colorId
        ? sdcpn.types.find((type) => type.id === place.colorId)
        : null;
      const arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      arcs.push({
        id: arcId,
        source: transition.id,
        target: outputArc.placeId,
        type: "default" as const,
        selected: selectedItemIds.has(arcId),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: arcColor,
          width: 20,
          height: 20,
        },
        style: {
          stroke: arcColor,
          strokeWidth: 2,
        },
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
}
