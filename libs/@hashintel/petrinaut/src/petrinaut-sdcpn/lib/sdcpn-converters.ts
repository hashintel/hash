import type { Place, SDCPN, Transition } from "../../core/types/sdcpn";
import type { NodeType, PetriNetDefinitionObject } from "../types";

/**
 * Convert a ReactFlow representation (PetriNetDefinitionObject) to SDCPN format
 */
export const reactFlowToSDCPN = (
  petriNetDefinition: PetriNetDefinitionObject,
  id: string,
  title: string,
): SDCPN => {
  const places: Place[] = [];
  const transitions: Transition[] = [];

  // Convert nodes to places and transitions
  for (const node of petriNetDefinition.nodes) {
    if (node.type === "place") {
      places.push({
        id: node.id,
        name: node.data.label,
        dimensions: 1, // Default to 1 dimension
        differentialEquationCode: "",
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? undefined,
        height: node.height ?? undefined,
      });
    } else if (node.type === "transition") {
      const inputArcs = petriNetDefinition.arcs
        .filter((arc) => arc.target === node.id)
        .map((arc) => ({
          placeId: arc.source,
          weight: Object.values(arc.data?.tokenWeights ?? {})[0] ?? 1,
        }));

      const outputArcs = petriNetDefinition.arcs
        .filter((arc) => arc.source === node.id)
        .map((arc) => ({
          placeId: arc.target,
          weight: Object.values(arc.data?.tokenWeights ?? {})[0] ?? 1,
        }));

      transitions.push({
        id: node.id,
        name: node.data.label,
        inputArcs,
        outputArcs,
        lambdaCode: "",
        transitionKernelCode: "",
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? undefined,
        height: node.height ?? undefined,
      });
    }
  }

  return {
    id,
    title,
    places,
    transitions,
  };
};

/**
 * Convert an SDCPN to ReactFlow representation (nodes and edges)
 */
export const sdcpnToReactFlow = (
  sdcpn: SDCPN,
  existingPetriNet?: PetriNetDefinitionObject,
): PetriNetDefinitionObject => {
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
        initialTokenCounts: {},
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
    tokenTypes: existingPetriNet?.tokenTypes ?? [
      {
        id: "default",
        name: "Token",
        color: "#4A90E2",
      },
    ],
  };
};
