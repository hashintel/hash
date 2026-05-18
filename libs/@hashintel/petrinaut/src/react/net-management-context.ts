import { createContext } from "react";

import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core/types/sdcpn";

/**
 * Net-management concerns that the host app owns: a list of other available
 * nets, switching between them, creating a new one, and the currently loaded
 * net's title. None of this is part of the SDCPN document; it lives outside
 * Core because it's specific to how the host stores and discovers nets.
 *
 * `<PetrinautProvider>` accepts a value of this shape and republishes it via
 * this context so bridges (notably the SDCPN bridge) can compose it with
 * Core-derived values into the legacy `SDCPNContext`.
 */
export type NetManagement = {
  title: string;
  setTitle: (title: string) => void;
  existingNets: MinimalNetMetadata[];
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  loadPetriNet: (petriNetId: string) => void;
};

const DEFAULT_NET_MANAGEMENT: NetManagement = {
  title: "",
  setTitle: () => {},
  existingNets: [],
  createNewNet: () => {},
  loadPetriNet: () => {},
};

export const NetManagementContext = createContext<NetManagement>(
  DEFAULT_NET_MANAGEMENT,
);
