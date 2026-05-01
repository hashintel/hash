import type {
  MinimalNetMetadata,
  PetrinautDocHandle,
  SDCPN,
} from "@hashintel/petrinaut";
import { createJsonDocHandle, PetrinautNext } from "@hashintel/petrinaut";
import { produce } from "immer";
import { useEffect, useRef, useState } from "react";

import { useSentryFeedbackAction } from "./app/sentry-feedback-button";
import {
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "./app/use-local-storage-sdcpns";

const isEmptySDCPN = (sdcpn: SDCPN) =>
  sdcpn.places.length === 0 &&
  sdcpn.transitions.length === 0 &&
  sdcpn.types.length === 0 &&
  sdcpn.parameters.length === 0 &&
  sdcpn.differentialEquations.length === 0;

export const DevApp = () => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  const { storedSDCPNs, setStoredSDCPNs } = useLocalStorageSDCPNs();

  const [currentNetId, setCurrentNetId] = useState<string | null>(null);

  const currentNet = currentNetId ? (storedSDCPNs[currentNetId] ?? null) : null;

  /**
   * Per-net handles. Each handle owns the live SDCPN and its undo/redo
   * history. localStorage is the persistence layer; we mirror handle
   * changes into it via subscribe.
   */
  const handlesRef = useRef<Map<string, PetrinautDocHandle>>(new Map());
  const setStoredSDCPNsRef = useRef(setStoredSDCPNs);
  setStoredSDCPNsRef.current = setStoredSDCPNs;

  const getOrCreateHandle = (net: SDCPNInLocalStorage): PetrinautDocHandle => {
    const existing = handlesRef.current.get(net.id);
    if (existing) {
      return existing;
    }
    const handle = createJsonDocHandle({ id: net.id, initial: net.sdcpn });
    handlesRef.current.set(net.id, handle);

    handle.subscribe((event) => {
      setStoredSDCPNsRef.current((prev) => {
        const stored = prev[net.id];
        if (!stored) {
          return prev;
        }
        return produce(prev, (draft) => {
          draft[net.id] = {
            ...stored,
            sdcpn: event.next,
            lastUpdated: new Date().toISOString(),
          };
        });
      });
    });

    return handle;
  };

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
    const newNet: SDCPNInLocalStorage = {
      id: `net-${Date.now()}`,
      title: params.title,
      sdcpn: params.petriNetDefinition,
      lastUpdated: new Date().toISOString(),
    };

    setStoredSDCPNs((prev) => {
      const next = { ...prev, [newNet.id]: newNet };

      // Remove the previous net if it was empty and unmodified
      if (currentNetId && currentNetId !== newNet.id) {
        const prevNet = prev[currentNetId];
        if (prevNet && isEmptySDCPN(prevNet.sdcpn)) {
          delete next[currentNetId];
          handlesRef.current.delete(currentNetId);
        }
      }

      return next;
    });
    setCurrentNetId(newNet.id);
  };

  const loadPetriNet = (petriNetId: string) => {
    // Remove the current net if it was empty and unmodified
    if (currentNetId && currentNetId !== petriNetId) {
      setStoredSDCPNs((prev) => {
        const prevNet = prev[currentNetId];
        if (prevNet && isEmptySDCPN(prevNet.sdcpn)) {
          const next = { ...prev };
          delete next[currentNetId];
          handlesRef.current.delete(currentNetId);
          return next;
        }
        return prev;
      });
    }
    setCurrentNetId(petriNetId);
  };

  const setTitle = (title: string) => {
    if (!currentNetId) {
      return;
    }

    setStoredSDCPNs((prev) =>
      produce(prev, (draft) => {
        if (draft[currentNetId]) {
          draft[currentNetId].title = title;
        }
      }),
    );
  };

  // Initialize with a default net if none exists
  useEffect(() => {
    const sdcpnsInStorage = Object.values(storedSDCPNs);

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
    } else if (!currentNetId) {
      setCurrentNetId(sdcpnsInStorage[0].id);
    }
  }, [currentNetId, createNewNet, setStoredSDCPNs, storedSDCPNs]);

  if (!currentNet) {
    return null;
  }

  const handle = getOrCreateHandle(currentNet);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautNext
        handle={handle}
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
