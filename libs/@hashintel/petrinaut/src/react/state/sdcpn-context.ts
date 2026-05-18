import { createContext } from "react";

import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core/types/sdcpn";

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
  },
  readonly: true,
  setTitle: () => {},
  title: "",
  getItemType: () => null,
};

export const SDCPNContext = createContext<SDCPNContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
