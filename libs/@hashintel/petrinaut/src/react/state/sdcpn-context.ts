import { createContext } from "react";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautExtensionSettings,
  type SDCPN,
  type SelectionItemType,
} from "@hashintel/petrinaut-core";

/**
 * The open document and what the instance says about it.
 *
 * Nothing the host owns is in here: its title, its list of nets and its
 * callbacks are in `NetManagementContext`. A host may change those on every
 * edit, and almost every part of the editor reads this context.
 */
export type SDCPNContextValue = {
  petriNetId: string | null;
  petriNetDefinition: SDCPN;
  readonly: boolean;
  extensions: PetrinautExtensionSettings;
  getItemType: (id: string) => SelectionItemType | null;
};

const DEFAULT_CONTEXT_VALUE: SDCPNContextValue = {
  petriNetId: null,
  petriNetDefinition: {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
    components: [],
    componentInstances: [],
  },
  readonly: true,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  getItemType: () => null,
};

export const SDCPNContext = createContext<SDCPNContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
