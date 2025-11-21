import { useLocalStorage } from "@mantine/hooks";

import type { SDCPN } from "../core/types/sdcpn";

const rootLocalStorageKey = "petrinaut-sdcpn";

type SDCPNInLocalStorage = {
  lastUpdated: string; // ISO timestamp
  sdcpn: SDCPN;
};

type LocalStorageSDCPNsStore = Record<string, SDCPNInLocalStorage>;

export const useLocalStorageSDCPNs = () => {
  const [storedSDCPNs, setStoredSDCPNs] =
    useLocalStorage<LocalStorageSDCPNsStore>({
      key: rootLocalStorageKey,
      defaultValue: {},
      getInitialValueInEffect: false,
    });

  return { storedSDCPNs, setStoredSDCPNs };
};
