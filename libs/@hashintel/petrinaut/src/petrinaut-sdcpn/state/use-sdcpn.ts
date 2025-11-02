import { useSDCPNStore } from "./sdcpn-store";

/**
 * Hook to access the current SDCPN definition from the store.
 * Returns null if no SDCPN is loaded.
 */
export const useSDCPN = () => {
  return useSDCPNStore((state) => state.sdcpn);
};

/**
 * Hook to mutate the SDCPN definition.
 * Provides a mutation function that operates on a copy of the SDCPN.
 */
export const useMutateSDCPN = () => {
  return useSDCPNStore((state) => state.mutateSDCPN);
};
