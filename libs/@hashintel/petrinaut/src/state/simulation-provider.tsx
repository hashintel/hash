import { createContext, useContext, useEffect, useRef } from "react";
import { useStore } from "zustand";

import { useSDCPNContext } from "./sdcpn-provider";
import type { SimulationStoreState } from "./simulation-store";
import { createSimulationStore } from "./simulation-store";

type SimulationStore = ReturnType<typeof createSimulationStore>;

const SimulationContext = createContext<SimulationStore | null>(null);

export type SimulationProviderProps = React.PropsWithChildren;

export const SimulationProvider: React.FC<SimulationProviderProps> = ({
  children,
}) => {
  const sdcpnContext = useSDCPNContext();
  const { petriNetId } = sdcpnContext;

  const sdcpnContextRef = useRef(sdcpnContext);
  useEffect(() => {
    sdcpnContextRef.current = sdcpnContext;
  }, [sdcpnContext]);

  // Allow the methods in the Zustand simulation store to access the latest value
  const getSDCPN = () => ({
    sdcpn: sdcpnContextRef.current.petriNetDefinition,
  });

  const simulationStore = createSimulationStore(getSDCPN);

  useEffect(() => {
    if (petriNetId) {
      simulationStore.getState().__reinitialize();
    }
  }, [petriNetId, simulationStore]);

  return (
    <SimulationContext.Provider value={simulationStore}>
      {children}
    </SimulationContext.Provider>
  );
};

export function useSimulationStore<T>(
  selector: (state: SimulationStoreState) => T
): T {
  const store = useContext(SimulationContext);

  if (!store) {
    throw new Error(
      "useSimulationStore must be used within SimulationProvider"
    );
  }

  return useStore(store, selector);
}
