import { createContext } from "react";

import type { MutationHelperFunctions } from "@hashintel/petrinaut-core";

export type MutationContextValue = MutationHelperFunctions;

const DEFAULT_CONTEXT_VALUE: MutationContextValue = {
  addPlace: () => {},
  updatePlace: () => {},
  updatePlacePosition: () => {},
  removePlace: () => {},
  addTransition: () => {},
  updateTransition: () => {},
  updateTransitionPosition: () => {},
  removeTransition: () => {},
  addArc: () => {},
  removeArc: () => {},
  updateArcWeight: () => {},
  updateArcType: () => {},
  updateArcPlace: () => {},
  addType: () => {},
  updateType: () => {},
  removeType: () => {},
  addTypeElement: () => {},
  updateTypeElement: () => {},
  removeTypeElement: () => {},
  moveTypeElement: () => {},
  addDifferentialEquation: () => {},
  updateDifferentialEquation: () => {},
  removeDifferentialEquation: () => {},
  addParameter: () => {},
  updateParameter: () => {},
  removeParameter: () => {},
  addScenario: () => {},
  updateScenario: () => {},
  removeScenario: () => {},
  addMetric: () => {},
  updateMetric: () => {},
  removeMetric: () => {},
  deleteItemsByIds: () => {},
  commitNodePositions: () => {},
};

export const MutationContext = createContext<MutationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
