import { createContext } from "react";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type MinimalNetMetadata,
  type PetrinautExtensionSettings,
  type SDCPN,
} from "@hashintel/petrinaut-core";

export type SDCPNProviderProps = {
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  existingNets: MinimalNetMetadata[];
  loadPetriNet: (petriNetId: string) => void;
  petriNetId: string | null;
  petriNetDefinition: SDCPN;
  readonly: boolean;
  extensions: PetrinautExtensionSettings;
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
    | "wire"
    | "componentInstance"
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
    subnets: [],
    componentInstances: [],
  },
  readonly: true,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "",
  getItemType: () => null,
};

export const SDCPNContext = createContext<SDCPNContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
