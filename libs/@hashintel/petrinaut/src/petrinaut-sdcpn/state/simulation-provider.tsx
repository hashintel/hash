import { createContext, useContext, useRef } from "react";
import { useStore } from "zustand";

import { SDCPNContext } from "./sdcpn-provider";
import type { SimulationStoreState } from "./simulation-store";
import { createSimulationStore } from "./simulation-store";

type SimulationStore = ReturnType<typeof createSimulationStore>;

const SimulationContext = createContext<SimulationStore | null>(null);

export type SimulationProviderProps = React.PropsWithChildren;

export const SimulationProvider: React.FC<SimulationProviderProps> = ({
  children,
}) => {
  const storeRef = useRef<SimulationStore | undefined>(undefined);

  // Get the SDCPN store to pass to the simulation store
  const sdcpnStore = useContext(SDCPNContext);

  if (!sdcpnStore) {
    throw new Error("SimulationProvider must be used within SDCPNProvider");
  }

  storeRef.current ??= createSimulationStore(sdcpnStore);

  return (
    <SimulationContext.Provider value={storeRef.current}>
      {children}
    </SimulationContext.Provider>
  );
};

export function useSimulationStore<T>(
  selector: (state: SimulationStoreState) => T,
): T {
  const store = useContext(SimulationContext);

  if (!store) {
    throw new Error(
      "useSimulationStore must be used within SimulationProvider",
    );
  }

  return useStore(store, selector);
}
