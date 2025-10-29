import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { SDCPNState } from "./sdcpn-store";
import { createSDCPNStore } from "./sdcpn-store";

type SDCPNStore = ReturnType<typeof createSDCPNStore>;

export const SDCPNContext = createContext<SDCPNStore | null>(null);

export type SDCPNProviderProps = React.PropsWithChildren;

export const SDCPNProvider: React.FC<SDCPNProviderProps> = ({ children }) => {
  const store = createSDCPNStore();

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
