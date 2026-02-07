import type { Color, Place, SDCPN, Transition } from "@hashintel/petrinaut";

/**
 * Old format types from petrinaut-old.
 * Defined here to avoid importing from the old package.
 */
type TokenCounts = {
  [tokenTypeId: string]: number;
};

type ArcData = {
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
};

type ArcType = {
  id: string;
  source: string;
  target: string;
  data?: ArcData;
};

type PlaceNodeData = {
  label: string;
  initialTokenCounts?: TokenCounts;
  parentNetNode?: {
    id: string;
    type: "input" | "output";
  };
  type: "place";
};

type TransitionNodeData = {
  conditions?: {
    id: string;
    name: string;
    probability: number;
    outputEdgeId: string;
  }[];
  label: string;
  delay?: number;
  description?: string;
  childNet?: {
    childNetId: string;
    childNetTitle: string;
    inputPlaceIds: string[];
    outputPlaceIds: string[];
  };
  type: "transition";
};

type NodeType = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: PlaceNodeData | TransitionNodeData;
};

type TokenType = {
  id: string;
  name: string;
  color: string;
};

export type PetriNetDefinitionObject = {
  arcs: ArcType[];
  nodes: NodeType[];
  tokenTypes: TokenType[];
};

/**
 * Convert old PetriNetDefinitionObject format to new SDCPN format.
 * Used when loading persisted data from the graph.
 */
export function convertPetriNetDefinitionObjectToSDCPN(
  old: PetriNetDefinitionObject,
): SDCPN {
  const places: Place[] = [];
  const transitions: Transition[] = [];

  // Separate nodes into places and transitions
  for (const node of old.nodes) {
    if (node.data.type === "place") {
      const placeData = node.data as PlaceNodeData;
      places.push({
        id: node.id,
        name: placeData.label,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: node.position.x,
        y: node.position.y,
        width: node.width,
        height: node.height,
      });
    } else if (node.data.type === "transition") {
      const transitionData = node.data as TransitionNodeData;

      // Find input arcs (arcs where this transition is the target)
      const inputArcs = old.arcs
        .filter((arc) => arc.target === node.id)
        .map((arc) => ({
          placeId: arc.source,
          weight: getArcWeight(arc),
        }));

      // Find output arcs (arcs where this transition is the source)
      const outputArcs = old.arcs
        .filter((arc) => arc.source === node.id)
        .map((arc) => ({
          placeId: arc.target,
          weight: getArcWeight(arc),
        }));

      transitions.push({
        id: node.id,
        name: transitionData.label,
        inputArcs,
        outputArcs,
        lambdaType: "predicate",
        lambdaCode: "return true;",
        transitionKernelCode: "return input;",
        x: node.position.x,
        y: node.position.y,
        width: node.width,
        height: node.height,
      });
    }
  }

  // Convert token types to colors
  const types: Color[] = old.tokenTypes.map((tokenType) => ({
    id: tokenType.id,
    name: tokenType.name,
    iconSlug: "circle",
    displayColor: tokenType.color,
    elements: [],
  }));

  return {
    places,
    transitions,
    types,
    differentialEquations: [],
    parameters: [],
  };
}

/**
 * Convert new SDCPN format to old PetriNetDefinitionObject format.
 * Used when saving to the graph to maintain backward compatibility.
 */
export function convertSDCPNToPetriNetDefinitionObject(
  sdcpn: SDCPN,
): PetriNetDefinitionObject {
  const nodes: NodeType[] = [];
  const arcs: ArcType[] = [];

  // Convert places to nodes
  for (const place of sdcpn.places) {
    nodes.push({
      id: place.id,
      type: "place",
      position: { x: place.x, y: place.y },
      width: place.width,
      height: place.height,
      data: {
        label: place.name,
        type: "place",
      },
    });
  }

  // Convert transitions to nodes and extract arcs
  let arcIdCounter = 0;
  for (const transition of sdcpn.transitions) {
    nodes.push({
      id: transition.id,
      type: "transition",
      position: { x: transition.x, y: transition.y },
      width: transition.width,
      height: transition.height,
      data: {
        label: transition.name,
        type: "transition",
      },
    });

    // Convert input arcs (place → transition)
    for (const inputArc of transition.inputArcs) {
      arcs.push({
        id: `arc-${arcIdCounter++}`,
        source: inputArc.placeId,
        target: transition.id,
        data: {
          tokenWeights: createTokenWeights(inputArc.weight, sdcpn.types),
        },
      });
    }

    // Convert output arcs (transition → place)
    for (const outputArc of transition.outputArcs) {
      arcs.push({
        id: `arc-${arcIdCounter++}`,
        source: transition.id,
        target: outputArc.placeId,
        data: {
          tokenWeights: createTokenWeights(outputArc.weight, sdcpn.types),
        },
      });
    }
  }

  // Convert colors to token types
  const tokenTypes: TokenType[] = sdcpn.types.map((color) => ({
    id: color.id,
    name: color.name,
    color: color.displayColor,
  }));

  return {
    arcs,
    nodes,
    tokenTypes,
  };
}

/**
 * Helper to get the total weight from an arc's token weights.
 * Returns 1 if no weights are defined.
 */
function getArcWeight(arc: ArcType): number {
  if (!arc.data?.tokenWeights) {
    return 1;
  }
  const weights = Object.values(arc.data.tokenWeights).filter(
    (w): w is number => w !== undefined,
  );
  return weights.length > 0 ? Math.max(...weights) : 1;
}

/**
 * Helper to create token weights object from a single weight value.
 * Distributes the weight to the first token type if available.
 */
function createTokenWeights(
  weight: number,
  types: Color[],
): { [tokenTypeId: string]: number | undefined } {
  const firstType = types[0];
  if (!firstType) {
    return {};
  }
  // Apply weight to first token type
  return { [firstType.id]: weight };
}

/**
 * Check if an object is in the old PetriNetDefinitionObject format.
 */
export function isOldFormat(obj: unknown): obj is PetriNetDefinitionObject {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return (
    Array.isArray(record.arcs) &&
    Array.isArray(record.nodes) &&
    Array.isArray(record.tokenTypes)
  );
}

/**
 * Check if an object is in the new SDCPN format.
 */
export function isSDCPNFormat(obj: unknown): obj is SDCPN {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return (
    Array.isArray(record.places) &&
    Array.isArray(record.transitions) &&
    Array.isArray(record.types)
  );
}
