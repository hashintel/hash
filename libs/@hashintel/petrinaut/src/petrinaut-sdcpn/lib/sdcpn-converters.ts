import type { SDCPN } from "../../core/types/sdcpn";
import type { NodeType, PetriNetDefinitionObject } from "../state/types-for-editor-to-remove";

/**
 * Convert an SDCPN to ReactFlow representation (nodes and edges)
 */
export function sdcpnToReactFlow(
  sdcpn: SDCPN,
  existingPetriNet?: PetriNetDefinitionObject,
): PetriNetDefinitionObject {
  const nodes: NodeType[] = [];

  // Create place nodes
  for (const place of sdcpn.places) {
    nodes.push({
      id: place.id,
      type: "place",
      position: { x: place.x, y: place.y },
      width: place.width ?? 80,
      height: place.height ?? 80,
      data: {
        label: place.name,
        type: "place",
      },
    });
  }

  // Create transition nodes
  for (const transition of sdcpn.transitions) {
    nodes.push({
      id: transition.id,
      type: "transition",
      position: { x: transition.x, y: transition.y },
      width: transition.width ?? 60,
      height: transition.height ?? 60,
      data: {
        label: transition.name,
        type: "transition",
      },
    });
  }

  // Create arcs from input and output arcs
  const arcs = [];
  const existingArcsById = new Map(
    existingPetriNet?.arcs.map((arc) => [arc.id, arc]) ?? [],
  );

  for (const transition of sdcpn.transitions) {
    // Input arcs (from places to transition)
    for (const inputArc of transition.inputArcs) {
      const arcId = `arc__${inputArc.placeId}-${transition.id}`;
      const existingArc = existingArcsById.get(arcId);

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
        interactionWidth: existingArc?.interactionWidth ?? 8,
      });
    }

    // Output arcs (from transition to places)
    for (const outputArc of transition.outputArcs) {
      const arcId = `arc__${transition.id}-${outputArc.placeId}`;
      const existingArc = existingArcsById.get(arcId);

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
        interactionWidth: existingArc?.interactionWidth ?? 8,
      });
    }
  }

  return {
    nodes,
    arcs,
  };
}
