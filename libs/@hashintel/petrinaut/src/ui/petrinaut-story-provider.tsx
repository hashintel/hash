import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  createJsonDocHandle,
  type PetrinautDocHandle,
  type MinimalNetMetadata,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { Petrinaut, type PetrinautAiAssistant } from "./petrinaut";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

type StoredNet = {
  id: string;
  title: string;
  /** Latest snapshot — kept in sync with handle.doc() via subscribe. */
  sdcpn: SDCPN;
};

type HandlesByNetId = Record<string, PetrinautDocHandle>;

/**
 * Self-contained wrapper around {@link Petrinaut} that manages a small
 * in-memory net registry, mirroring the shape of the demo-site's `DevApp`.
 *
 * Intended for Storybook stories — owns one handle per net id, so per-net
 * history survives switching between nets.
 */
export const PetrinautStoryProvider = ({
  aiAssistant,
  initialTitle = "New Process",
  initialDefinition = emptySDCPN,
  hideNetManagementControls = false,
  readonly = false,
  children,
}: {
  aiAssistant?: PetrinautAiAssistant;
  initialTitle?: string;
  initialDefinition?: SDCPN;
  hideNetManagementControls?: boolean;
  readonly?: boolean;
  children?: ReactNode;
}) => {
  const [nets, setNets] = useState<Record<string, StoredNet>>(() => {
    const id = "net-1";
    return {
      [id]: { id, title: initialTitle, sdcpn: initialDefinition },
    };
  });
  const [currentNetId, setCurrentNetId] = useState<string>("net-1");
  const [handlesByNetId, setHandlesByNetId] = useState<HandlesByNetId>(() => ({
    "net-1": createJsonDocHandle({ id: "net-1", initial: initialDefinition }),
  }));

  // Track which handles have an active subscription so adding a new net only
  // wires up the new handle instead of tearing down every existing one.
  const unsubscribersRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    for (const handle of Object.values(handlesByNetId)) {
      if (unsubscribersRef.current.has(handle.id)) {
        continue;
      }
      const off = handle.subscribe((event) => {
        setNets((prev) => {
          const stored = prev[handle.id];
          if (!stored) {
            return prev;
          }
          return { ...prev, [handle.id]: { ...stored, sdcpn: event.next } };
        });
      });
      unsubscribersRef.current.set(handle.id, off);
    }
  }, [handlesByNetId]);

  useEffect(
    () => () => {
      for (const off of unsubscribersRef.current.values()) {
        off();
      }
      unsubscribersRef.current.clear();
    },
    [],
  );

  const existingNets: MinimalNetMetadata[] = Object.values(nets).map((net) => ({
    netId: net.id,
    title: net.title,
    lastUpdated: new Date().toISOString(),
  }));

  const createNewNet = (params: {
    petriNetDefinition: SDCPN;
    title: string;
  }) => {
    const id = `net-${Date.now()}`;
    const handle = createJsonDocHandle({
      id,
      initial: params.petriNetDefinition,
    });
    setHandlesByNetId((prev) => ({
      ...prev,
      [id]: handle,
    }));
    setNets((prev) => ({
      ...prev,
      [id]: { id, title: params.title, sdcpn: params.petriNetDefinition },
    }));
    setCurrentNetId(id);
  };

  const loadPetriNet = (petriNetId: string) => {
    setCurrentNetId(petriNetId);
  };

  const setTitle = (title: string) => {
    setNets((prev) => {
      const net = prev[currentNetId];
      if (!net) {
        return prev;
      }
      return { ...prev, [currentNetId]: { ...net, title } };
    });
  };

  const currentNet = nets[currentNetId]!;
  const handle = handlesByNetId[currentNetId];

  if (!handle) {
    return null;
  }

  return (
    <>
      <Petrinaut
        aiAssistant={aiAssistant}
        handle={handle}
        existingNets={existingNets}
        createNewNet={createNewNet}
        hideNetManagementControls={hideNetManagementControls}
        loadPetriNet={loadPetriNet}
        readonly={readonly}
        setTitle={setTitle}
        title={currentNet.title}
      />
      {children}
    </>
  );
};
