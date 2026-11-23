import { createContext } from "react";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautExtensionSettings,
  type SDCPN,
  type SelectionItemType,
} from "@hashintel/petrinaut-core";

import { useSelected, type Published } from "../shared/select-from-context";

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

/** Where `SDCPNProvider` publishes the context value for {@link useSDCPNState}. */
export const SDCPNPublishedContext =
  createContext<Published<SDCPNContextValue>>(null);

/**
 * One part of the open document's context. The reader renders when that part
 * changes, where `use(SDCPNContext)` renders it for every edit.
 *
 * ```tsx
 * const readonly = useSDCPNState((document) => document.readonly);
 * ```
 */
export const useSDCPNState = <Selected>(
  select: (document: SDCPNContextValue) => Selected,
): Selected => useSelected(SDCPNContext, SDCPNPublishedContext, select);
