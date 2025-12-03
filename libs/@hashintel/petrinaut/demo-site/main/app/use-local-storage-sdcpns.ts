import { useLocalStorage } from "@mantine/hooks";

import type { SDCPN } from "../../../src/core/types/sdcpn";
import {
  isOldFormat,
  type OldFormat,
} from "../../../src/old-formats/convert-old-format";

const rootLocalStorageKey = "petrinaut-sdcpn";

export type SDCPNInLocalStorage = {
  id: string;
  lastUpdated: string; // ISO timestamp
  sdcpn: SDCPN;
  title: string;
};

type OldFormatInLocalStorage = {
  lastUpdated: string; // ISO timestamp
  sdcpn: OldFormat;
};

type LocalStorageSDCPNsStore = Record<
  string,
  SDCPNInLocalStorage | OldFormatInLocalStorage
>;

export const isOldFormatInLocalStorage = (
  stored: OldFormatInLocalStorage | SDCPNInLocalStorage,
): stored is OldFormatInLocalStorage => {
  return !("id" in stored) && isOldFormat(stored.sdcpn);
};

export const useLocalStorageSDCPNs = () => {
  const [storedSDCPNs, setStoredSDCPNs] =
    useLocalStorage<LocalStorageSDCPNsStore>({
      key: rootLocalStorageKey,
      defaultValue: {},
      getInitialValueInEffect: false,
    });

  return { storedSDCPNs, setStoredSDCPNs };
};
