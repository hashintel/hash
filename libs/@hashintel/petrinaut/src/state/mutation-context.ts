import { createContext } from "react";

import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  Transition,
} from "../core/types/sdcpn";
import type { SelectionMap } from "./selection";

export type MutationHelperFunctions = {
  addPlace: (place: Place) => void;
  updatePlace: (placeId: string, updateFn: (place: Place) => void) => void;
  updatePlacePosition: (
    placeId: string,
    position: { x: number; y: number },
  ) => void;
  removePlace: (placeId: string) => void;
  addTransition: (transition: Transition) => void;
  updateTransition: (
    transitionId: string,
    updateFn: (transition: Transition) => void,
  ) => void;
  updateTransitionPosition: (
    transitionId: string,
    position: { x: number; y: number },
  ) => void;
  removeTransition: (transitionId: string) => void;
  addArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
  removeArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
  ) => void;
  updateArcWeight: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
  addType: (type: Color) => void;
  updateType: (typeId: string, updateFn: (type: Color) => void) => void;
  removeType: (typeId: string) => void;
  addDifferentialEquation: (equation: DifferentialEquation) => void;
  updateDifferentialEquation: (
    equationId: string,
    updateFn: (equation: DifferentialEquation) => void,
  ) => void;
  removeDifferentialEquation: (equationId: string) => void;
  addParameter: (parameter: Parameter) => void;
  updateParameter: (
    parameterId: string,
    updateFn: (parameter: Parameter) => void,
  ) => void;
  removeParameter: (parameterId: string) => void;
  deleteItemsByIds: (items: SelectionMap) => void;
  layoutGraph: () => Promise<void>;
  pasteEntities: () => Promise<Array<{ type: string; id: string }> | null>;
  commitNodePositions: (
    commits: Array<{
      id: string;
      itemType: "place" | "transition";
      position: { x: number; y: number };
    }>,
  ) => void;
};

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
  addType: () => {},
  updateType: () => {},
  removeType: () => {},
  addDifferentialEquation: () => {},
  updateDifferentialEquation: () => {},
  removeDifferentialEquation: () => {},
  addParameter: () => {},
  updateParameter: () => {},
  removeParameter: () => {},
  deleteItemsByIds: () => {},
  layoutGraph: async () => {},
  pasteEntities: async () => null,
  commitNodePositions: () => {},
};

export const MutationContext = createContext<MutationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
