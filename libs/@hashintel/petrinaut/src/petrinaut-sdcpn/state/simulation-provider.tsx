import { createContext, useContext, useEffect } from "react";
import { useStore } from "zustand";

import { EditorContext } from "./editor-provider";
import { SDCPNContext } from "./sdcpn-provider";
import type { SimulationStoreState } from "./simulation-store";
import { createSimulationStore } from "./simulation-store";

type SimulationStore = ReturnType<typeof createSimulationStore>;

const SimulationContext = createContext<SimulationStore | null>(null);

export type SimulationProviderProps = React.PropsWithChildren;

export const SimulationProvider: React.FC<SimulationProviderProps> = ({
  children,
}) => {
  // Get the SDCPN store to pass to the simulation store
  const sdcpnStore = useContext(SDCPNContext);
  const editorStore = useContext(EditorContext);

  if (!sdcpnStore || !editorStore) {
    throw new Error(
      "SimulationProvider must be used within SDCPNProvider and EditorProvider",
    );
  }

  const simulationStore = createSimulationStore(sdcpnStore);

  useEffect(() => {
    const unsub1 = sdcpnStore.subscribe((prevState, newState) => {
      if (prevState.sdcpn.id !== newState.sdcpn.id) {
        simulationStore.getState().__reinitialize();
      }
    });
    const unsub2 = editorStore.subscribe((prevState, newState) => {
      if (prevState.globalMode !== newState.globalMode) {
        simulationStore.getState().__reinitialize();
      }
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [sdcpnStore, editorStore, simulationStore]);

  return (
    <SimulationContext.Provider value={simulationStore}>
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
