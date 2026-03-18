import type { SDCPN } from "@hashintel/petrinaut";
import { useLocalStorage } from "@mantine/hooks";

const rootLocalStorageKey = "petrinaut-sdcpn";

export type SDCPNInLocalStorage = {
  id: string;
  lastUpdated: string; // ISO timestamp
  sdcpn: SDCPN;
  title: string;
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
