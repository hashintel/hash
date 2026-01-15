import { createContext, use } from "react";

import type {
  Color,
  DifferentialEquation,
  MinimalNetMetadata,
  MutateSDCPN,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "../core/types/sdcpn";

export type SDCPNProviderProps = {
  createNewNet: (params: {
    petriNetDefinition: SDCPN;
    title: string;
  }) => void;
  existingNets: MinimalNetMetadata[];
  loadPetriNet: (petriNetId: string) => void;
  petriNetId: string | null;
  petriNetDefinition: SDCPN;
  readonly: boolean;
  mutatePetriNetDefinition: MutateSDCPN;
  setTitle: (title: string) => void;
  title: string;
};

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
  getItemType: (
    id: string,
  ) =>
    | "place"
    | "transition"
    | "arc"
    | "type"
    | "differentialEquation"
    | "parameter"
    | null;
  deleteItemsByIds: (ids: Set<string>) => void;
  layoutGraph: () => Promise<void>;
};

export const ARC_ID_PREFIX = "$A_";
export type ArcIdPrefix = typeof ARC_ID_PREFIX;

export const ARC_ID_SEPARATOR = "___";

/**
 * Arc ID format: {@link ARC_ID_PREFIX}<inputId>{@link ARC_ID_SEPARATOR}<outputId>
 */
export const generateArcId = ({
  inputId,
  outputId,
}: { inputId: string; outputId: string }): `${ArcIdPrefix}${string}` => {
  return `${ARC_ID_PREFIX}${inputId}${ARC_ID_SEPARATOR}${outputId}`;
};

export type SDCPNContextValue = SDCPNProviderProps & MutationHelperFunctions;

export const SDCPNContext = createContext<SDCPNContextValue | null>(null);

export function useSDCPNContext(): SDCPNContextValue {
  const context = use(SDCPNContext);

  if (!context) {
    throw new Error("useSDCPNContext must be used within SDCPNProvider");
  }

  return context;
}
