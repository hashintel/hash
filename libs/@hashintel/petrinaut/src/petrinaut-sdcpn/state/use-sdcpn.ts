import { useSDCPNStore } from "./sdcpn-store";

/**
 * Hook to access the current SDCPN definition from the store.
 * Returns null if no SDCPN is loaded.
 */
export const useSDCPN = () => {
  return useSDCPNStore((state) => state.sdcpn);
};
