import { createContext, useContext, useEffect, useRef } from "react";
import { useStore } from "zustand";

import { useNotifications } from "../notifications/notifications-context";
import { useSDCPNContext } from "./sdcpn-provider";
import type { SimulationStoreState } from "./simulation-store";
import { createSimulationStore } from "./simulation-store";

type SimulationStore = ReturnType<typeof createSimulationStore>;

const SimulationContext = createContext<SimulationStore | null>(null);

export type SimulationProviderProps = React.PropsWithChildren;

/**
 * Internal component that subscribes to simulation state changes
 * and shows notifications when appropriate.
 */
const SimulationStateNotifier: React.FC<{ store: SimulationStore }> = ({
  store,
}) => {
  const { notify } = useNotifications();
  const previousStateRef = useRef<SimulationStoreState["state"] | null>(null);

  useEffect(() => {
    const unsubscribe = store.subscribe((state) => {
      const previousState = previousStateRef.current;
      previousStateRef.current = state.state;

      // Notify when simulation completes
      if (state.state === "Complete" && previousState !== "Complete") {
        notify({ message: "Simulation complete" });
      }
    });

    return unsubscribe;
  }, [store, notify]);

  return null;
};

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
      <SimulationStateNotifier store={simulationStore} />
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
