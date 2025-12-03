import { produce } from "immer";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MinimalNetMetadata, SDCPN } from "../../src/core/types/sdcpn";
import { convertOldFormatToSDCPN } from "../../src/old-formats/convert-old-format";
import { Petrinaut } from "../../src/petrinaut";
import {
  isOldFormatInLocalStorage,
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "./app/use-local-storage-sdcpns";

export const DevApp = () => {
  const { storedSDCPNs, setStoredSDCPNs } = useLocalStorageSDCPNs();

  const [currentNetId, setCurrentNetId] = useState<string | null>(null);

  const currentNet = useMemo(() => {
    if (!currentNetId) {
      return null;
    }
    return storedSDCPNs[currentNetId] ?? null;
  }, [currentNetId, storedSDCPNs]);

  const existingNets: MinimalNetMetadata[] = useMemo(() => {
    return Object.values(storedSDCPNs)
      .filter(
        (net): net is SDCPNInLocalStorage => !isOldFormatInLocalStorage(net),
      )
      .map((net) => ({
        netId: net.id,
        title: net.title,
      }));
  }, [storedSDCPNs]);

  const createNewNet = useCallback(
    (params: {
      petriNetDefinition: SDCPN;
      title: string;
    }) => {
      const newNet: SDCPNInLocalStorage = {
        id: `net-${Date.now()}`,
        title: params.title,
        sdcpn: params.petriNetDefinition,
        lastUpdated: new Date().toISOString(),
      };

      setStoredSDCPNs((prev) => ({ ...prev, [newNet.id]: newNet }));
      setCurrentNetId(newNet.id);
    },
    [setStoredSDCPNs],
  );

  const loadPetriNet = useCallback((petriNetId: string) => {
    setCurrentNetId(petriNetId);
  }, []);

  const setTitle = useCallback(
    (title: string) => {
      if (!currentNetId) {
        return;
      }

      setStoredSDCPNs((prev) =>
        produce(prev, (draft) => {
          if (draft[currentNetId] && "title" in draft[currentNetId]) {
            draft[currentNetId].title = title;
          }
        }),
      );
    },
    [currentNetId, setStoredSDCPNs],
  );

  const mutatePetriNetDefinition = useCallback(
    (definitionMutationFn: (draft: SDCPN) => void) => {
      if (!currentNetId) {
        return;
      }

      setStoredSDCPNs((prev) =>
        produce(prev, (draft) => {
          if (draft[currentNetId]) {
            draft[currentNetId].sdcpn = produce(
              draft[currentNetId].sdcpn,
              definitionMutationFn,
            );
          }
        }),
      );
    },
    [currentNetId, setStoredSDCPNs],
  );

  // Initialize with a default net if none exists
  useEffect(() => {
    const sdcpnsInStorage = Object.values(storedSDCPNs);

    const convertedNets: Record<string, SDCPNInLocalStorage> = {};

    for (const sdcpnInStorage of sdcpnsInStorage) {
      if (!isOldFormatInLocalStorage(sdcpnInStorage)) {
        continue;
      }

      const convertedSdcpn = convertOldFormatToSDCPN(sdcpnInStorage.sdcpn);

      if (!convertedSdcpn) {
        throw new Error(
          "Couldn't convert old format to SDCPN, but should have been able to",
        );
      }

      convertedNets[sdcpnInStorage.sdcpn.id] = {
        /**
         * The id and title used to be in the SDCPN definition itself, so we add them back here.
         * A legacy provision only which can probably be removed once 2025 is over.
         */
        id: sdcpnInStorage.sdcpn.id,
        title: sdcpnInStorage.sdcpn.title,
        sdcpn: convertedSdcpn,
        lastUpdated: sdcpnInStorage.lastUpdated,
      };
    }

    if (Object.keys(convertedNets).length > 0) {
      setStoredSDCPNs((existingSDCPNs) => ({
        ...existingSDCPNs,
        ...convertedNets,
      }));
      return;
    }

    if (!sdcpnsInStorage[0]) {
      createNewNet({
        petriNetDefinition: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
        title: "New Process",
      });
    } else if (isOldFormatInLocalStorage(sdcpnsInStorage[0])) {
      throw new Error(
        "Old format SDCPN found in storage, but should have been converted",
      );
    } else if (!currentNetId) {
      setCurrentNetId(sdcpnsInStorage[0].id);
    }
  }, [currentNetId, createNewNet, setStoredSDCPNs, storedSDCPNs]);

  if (!currentNet || isOldFormatInLocalStorage(currentNet)) {
    return null;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Petrinaut
        existingNets={existingNets}
        createNewNet={createNewNet}
        hideNetManagementControls={false}
        loadPetriNet={loadPetriNet}
        petriNetId={currentNetId}
        petriNetDefinition={currentNet.sdcpn}
        mutatePetriNetDefinition={mutatePetriNetDefinition}
        readonly={false}
        setTitle={setTitle}
        title={currentNet.title}
      />
    </div>
  );
};
