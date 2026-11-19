import { createContext } from "react";

import type { ReadOnlyAction } from "./read-only-action-context";
import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core";

/**
 * Net-management concerns that the host app owns: a list of other available
 * nets, switching between them, creating a new one, and the currently loaded
 * net's title. None of this is part of the SDCPN document; it lives outside
 * Core because it's specific to how the host stores and discovers nets.
 *
 * `<PetrinautProvider>` accepts a value of this shape and republishes it via
 * this context. It is kept out of `SDCPNContext`: a host may hand over a new
 * list or new callbacks on every edit, and only the few components that show
 * them should render then.
 */
export type NetManagement = {
  title: string;
  setTitle?: (title: string) => void;
  existingNets: MinimalNetMetadata[];
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  loadPetriNet: (petriNetId: string) => void;
  /**
   * Offered with the notice that explains a blocked edit on a document the
   * host made read-only, e.g. saving an editable copy. `<Petrinaut>` sets it
   * from the first running plugin that declares `readOnlyAction`. Read it
   * from `ReadOnlyActionContext`, where the provider republishes it.
   */
  readOnlyAction?: ReadOnlyAction;
};

const DEFAULT_NET_MANAGEMENT: NetManagement = {
  title: "",
  existingNets: [],
  createNewNet: () => {},
  loadPetriNet: () => {},
};

export const NetManagementContext = createContext<NetManagement>(
  DEFAULT_NET_MANAGEMENT,
);
