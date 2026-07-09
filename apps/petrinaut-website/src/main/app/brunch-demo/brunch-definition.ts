import {
  calculateGraphLayout,
  layoutNodeDimensions,
} from "@hashintel/petrinaut-core";

import type { BrunchNetDefinition } from "./brunch-protocol";
import type { SDCPN } from "@hashintel/petrinaut-core";

export { brunchNetDefinitionSchema } from "./brunch-protocol";

const shouldAutoLayout = (definition: BrunchNetDefinition): boolean => {
  const nodes = [...definition.places, ...definition.transitions];

  if (nodes.some((node) => node.x === undefined || node.y === undefined)) {
    return true;
  }

  return (
    nodes.length > 1 && nodes.every((node) => node.x === 0 && node.y === 0)
  );
};

const toSDCPN = (definition: BrunchNetDefinition): SDCPN => ({
  places: definition.places.map((place) => ({
    id: place.id,
    name: place.name,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: place.x ?? 0,
    y: place.y ?? 0,
  })),
  transitions: definition.transitions.map((transition) => ({
    id: transition.id,
    name: transition.name,
    inputArcs: transition.inputArcs,
    outputArcs: transition.outputArcs,
    lambdaType: "predicate",
    lambdaCode: "",
    transitionKernelCode: "",
    x: transition.x ?? 0,
    y: transition.y ?? 0,
  })),
  types: [],
  differentialEquations: [],
  parameters: [],
});

export const normalizeBrunchDefinition = async (
  definition: BrunchNetDefinition,
): Promise<SDCPN> => {
  const sdcpn = toSDCPN(definition);

  if (!shouldAutoLayout(definition)) {
    return sdcpn;
  }

  const positions = await calculateGraphLayout(sdcpn, layoutNodeDimensions);

  return {
    ...sdcpn,
    places: sdcpn.places.map((place) => ({
      ...place,
      ...positions[place.id],
    })),
    transitions: sdcpn.transitions.map((transition) => ({
      ...transition,
      ...positions[transition.id],
    })),
  };
};
