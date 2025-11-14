import { createContext, useContext, useEffect } from "react";
import { useStore } from "zustand";

import type { SDCPNState } from "./sdcpn-store";
import { createSDCPNStore, isEmptySDCPN } from "./sdcpn-store";
import { useLocalStorageSDCPNs } from "./use-local-storage-sdcpns";

type SDCPNStore = ReturnType<typeof createSDCPNStore>;

export const SDCPNContext = createContext<SDCPNStore | null>(null);

export type SDCPNProviderProps = React.PropsWithChildren;

export const SDCPNProvider: React.FC<SDCPNProviderProps> = ({ children }) => {
  const { storedSDCPNs, setStoredSDCPNs } = useLocalStorageSDCPNs();

  const store = createSDCPNStore({
    initialSDCPN: Object.values(storedSDCPNs).sort((a, b) =>
      b.lastUpdated.localeCompare(a.lastUpdated),
    )[0]?.sdcpn,
  });

  const currentSdcpn = useStore(store, (state) => state.sdcpn);

  useEffect(() => {
    if (isEmptySDCPN(currentSdcpn)) {
      return;
    }

    setStoredSDCPNs((prev) => ({
      ...prev,
      [currentSdcpn.id]: {
        lastUpdated: new Date().toISOString(),
        sdcpn: currentSdcpn,
      },
    }));
  }, [currentSdcpn, setStoredSDCPNs]);

  return (
    <SDCPNContext.Provider value={store}>{children}</SDCPNContext.Provider>
  );
};

export function useSDCPNStore<T>(selector: (state: SDCPNState) => T): T {
  const store = useContext(SDCPNContext);

  if (!store) {
    throw new Error("useSDCPNStore must be used within SDCPNProvider");
  }

  return useStore(store, selector);
}
