import { produce } from "immer";
import { useEffect, useState } from "react";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import { useSentryFeedbackAction } from "./app/sentry-feedback-button";
import {
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "./app/use-local-storage-sdcpns";

import type {
  MinimalNetMetadata,
  PetrinautDocHandle,
  SDCPN,
} from "@hashintel/petrinaut-core";

const isEmptySDCPN = (sdcpn: SDCPN) =>
  sdcpn.places.length === 0 &&
  sdcpn.transitions.length === 0 &&
  sdcpn.types.length === 0 &&
  sdcpn.parameters.length === 0 &&
  sdcpn.differentialEquations.length === 0;

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const createDefaultStoredSDCPN = (): SDCPNInLocalStorage => ({
  id: "net-1",
  title: "New Process",
  sdcpn: emptySDCPN,
  lastUpdated: new Date(0).toISOString(),
});

/**
 * Creates the localStorage record for a newly created net, keeping the generated
 * id and last-updated timestamp in sync.
 */
const createLocalStorageNetRecord = (params: {
  petriNetDefinition: SDCPN;
  title: string;
}): SDCPNInLocalStorage => {
  const now = new Date();

  return {
    id: `net-${now.getTime()}`,
    title: params.title,
    sdcpn: params.petriNetDefinition,
    lastUpdated: now.toISOString(),
  };
};

const createHandle = (net: SDCPNInLocalStorage): PetrinautDocHandle =>
  createJsonDocHandle({ id: net.id, initial: net.sdcpn });

const getStoredSDCPNsForDisplay = (
  storedSDCPNs: Record<string, SDCPNInLocalStorage>,
): Record<string, SDCPNInLocalStorage> => {
  if (Object.values(storedSDCPNs).length > 0) {
    return storedSDCPNs;
  }

  const defaultStoredSDCPN = createDefaultStoredSDCPN();
  return { [defaultStoredSDCPN.id]: defaultStoredSDCPN };
};

type ActiveHandle = {
  handle: PetrinautDocHandle;
  netId: string;
  fallbackNet: SDCPNInLocalStorage;
};

const createActiveHandle = (net: SDCPNInLocalStorage): ActiveHandle => ({
  handle: createHandle(net),
  netId: net.id,
  fallbackNet: net,
});

/**
 * Demo-site shell for Petrinaut.
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable state.
 * Switching files replaces the active handle instead of keeping handles alive
 * for background nets.
 */
export const DevApp = () => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  const { storedSDCPNs, setStoredSDCPNs } = useLocalStorageSDCPNs();
  const storedSDCPNsForDisplay = getStoredSDCPNsForDisplay(storedSDCPNs);
  const firstNet = Object.values(storedSDCPNsForDisplay)[0] ?? null;

  // The net currently selected in the UI.
  const [currentNetId, setCurrentNetId] = useState<string | null>(
    () => firstNet?.id ?? null,
  );

  // Metadata and persisted SDCPN snapshot for the selected net.
  const currentNet = currentNetId
    ? (storedSDCPNsForDisplay[currentNetId] ?? null)
    : null;

  // Live editable document handle for the selected net only.
  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(() =>
    firstNet ? createActiveHandle(firstNet) : null,
  );

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const { fallbackNet, handle, netId } = activeHandle;

    return handle.subscribe((event) => {
      const lastUpdated = new Date().toISOString();

      setStoredSDCPNs((prev) => {
        const stored = prev[netId] ?? fallbackNet;

        return produce(prev, (draft) => {
          draft[netId] = {
            ...stored,
            sdcpn: event.next,
            lastUpdated,
          };
        });
      });
    });
  }, [activeHandle, setStoredSDCPNs]);

  const existingNets: MinimalNetMetadata[] = Object.values(storedSDCPNs)
    .map((net) => ({
      netId: net.id,
      title: net.title,
      lastUpdated: net.lastUpdated,
    }))
    .sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );

  const createNewNet = (params: {
    petriNetDefinition: SDCPN;
    title: string;
  }) => {
    const newNet = createLocalStorageNetRecord(params);
    const previousNet =
      currentNetId && currentNetId !== newNet.id ? currentNet : null;
    const previousNetIdToRemove = previousNet !== null ? currentNetId : null;

    setStoredSDCPNs((prev) => {
      const next = { ...prev, [newNet.id]: newNet };

      // Remove the previous net if it was empty and unmodified
      if (
        previousNetIdToRemove &&
        previousNet &&
        isEmptySDCPN(prev[previousNetIdToRemove]?.sdcpn ?? previousNet.sdcpn)
      ) {
        delete next[previousNetIdToRemove];
      }

      return next;
    });
    setActiveHandle(createActiveHandle(newNet));
    setCurrentNetId(newNet.id);
  };

  const loadPetriNet = (petriNetId: string) => {
    const netToLoad = storedSDCPNsForDisplay[petriNetId];
    if (!netToLoad) {
      return;
    }

    // Remove the current net if it was empty and unmodified
    if (currentNetId && currentNetId !== petriNetId) {
      const previousNetIdToRemove =
        currentNet && isEmptySDCPN(currentNet.sdcpn) ? currentNetId : null;

      setStoredSDCPNs((prev) => {
        const prevNet = previousNetIdToRemove
          ? prev[previousNetIdToRemove]
          : null;

        if (previousNetIdToRemove && prevNet && isEmptySDCPN(prevNet.sdcpn)) {
          const next = { ...prev };
          delete next[previousNetIdToRemove];
          return next;
        }
        return prev;
      });
    }
    setActiveHandle(createActiveHandle(netToLoad));
    setCurrentNetId(petriNetId);
  };

  const setTitle = (title: string) => {
    if (!currentNetId || !currentNet) {
      return;
    }

    const lastUpdated = new Date().toISOString();

    setStoredSDCPNs((prev) =>
      produce(prev, (draft) => {
        draft[currentNetId] = {
          ...(draft[currentNetId] ?? currentNet),
          title,
          lastUpdated,
        };
      }),
    );
  };

  if (!currentNet) {
    return null;
  }

  if (!activeHandle || activeHandle.netId !== currentNet.id) {
    return null;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Petrinaut
        handle={activeHandle.handle}
        existingNets={existingNets}
        createNewNet={createNewNet}
        hideNetManagementControls={false}
        loadPetriNet={loadPetriNet}
        readonly={false}
        setTitle={setTitle}
        title={currentNet.title}
        viewportActions={[sentryFeedbackAction]}
      />
    </div>
  );
};
