import { createContext } from "react";

import type { MinimalNetMetadata, SDCPN } from "../core/types/sdcpn";

export const ARC_ID_PREFIX = "$A_";
export type ArcIdPrefix = typeof ARC_ID_PREFIX;

export const ARC_ID_SEPARATOR = "___";

/**
 * Arc ID format: {@link ARC_ID_PREFIX}<inputId>{@link ARC_ID_SEPARATOR}<outputId>
 */
export function generateArcId({
  inputId,
  outputId,
}: { inputId: string; outputId: string }): `${ArcIdPrefix}${string}` {
  return `${ARC_ID_PREFIX}${inputId}${ARC_ID_SEPARATOR}${outputId}`;
}

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
  setTitle: (title: string) => void;
  title: string;
};

export type SDCPNContextValue = SDCPNProviderProps & {
  getItemType: (
    id: string,
  ) =>
    | "place"
    | "transition"
    | "arc"
    | "type"
    | "differentialEquation"
    | "parameter"
    | "componentInstance"
    | null;
};

const DEFAULT_CONTEXT_VALUE: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: null,
  petriNetDefinition: {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
    subnets: [],
  },
  readonly: true,
  setTitle: () => {},
  title: "",
  getItemType: () => null,
};

export const SDCPNContext = createContext<SDCPNContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
