import {
  calculateGraphLayout,
  layoutNodeDimensions,
} from "@hashintel/petrinaut-core";

import type {
  ComponentInstance,
  Place,
  SDCPN,
  Transition,
} from "@hashintel/petrinaut-core";

type Positioned = { id: string; x: number; y: number };

const withPosition = <T extends Positioned>(
  node: T,
  positions: Record<string, { x: number; y: number }>,
): T => {
  const position = positions[node.id];

  return position ? { ...node, x: position.x, y: position.y } : node;
};

/**
 * Positions the nodes of one level of a net (the root, or a subnet's internals) with Petrinaut's automatic
 * layout, so that a compiled net renders readably without being arranged by hand.
 */
export const layOut = async <
  Nodes extends {
    places: Place[];
    transitions: Transition[];
    componentInstances?: ComponentInstance[];
  },
>(
  nodes: Nodes,
): Promise<Nodes> => {
  const net: SDCPN = {
    places: nodes.places,
    transitions: nodes.transitions,
    componentInstances: nodes.componentInstances ?? [],
    types: [],
    differentialEquations: [],
    parameters: [],
  };

  const positions = await calculateGraphLayout(net, layoutNodeDimensions);

  return {
    ...nodes,
    places: nodes.places.map((place) => withPosition(place, positions)),
    transitions: nodes.transitions.map((transition) =>
      withPosition(transition, positions),
    ),
    ...(nodes.componentInstances
      ? {
          componentInstances: nodes.componentInstances.map((instance) =>
            withPosition(instance, positions),
          ),
        }
      : {}),
  };
};
