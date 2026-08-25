import { useLocalStorage } from "@mantine/hooks";

import type { SDCPN } from "@hashintel/petrinaut-core";

const rootLocalStorageKey = "petrinaut-sdcpn";

export type SDCPNInLocalStorage = {
  id: string;
  lastUpdated: string; // ISO timestamp
  sdcpn: SDCPN;
  title: string;
  voiceInterview?: {
    conversationId: string;
    revision: number;
    source: "brunch" | "mock";
    transcript: {
      speaker: "assistant" | "expert";
      transcript: string;
      turnId: number;
    }[];
    warnings: string[];
  };
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
