import { type ReactNode, useRef, useState } from "react";

import { createJsonDocHandle, type PetrinautDocHandle } from "../core/handle";
import type { MinimalNetMetadata, SDCPN } from "../core/types/sdcpn";
import { Petrinaut } from "./petrinaut";

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

/**
 * Self-contained wrapper around {@link Petrinaut} that manages a small
 * in-memory net registry, mirroring the shape of the demo-site's `DevApp`.
 *
 * Intended for Storybook stories — owns one handle per net id (via a ref
 * map), so per-net history survives switching between nets.
 */
export const PetrinautStoryProvider = ({
  initialTitle = "New Process",
  initialDefinition = emptySDCPN,
  hideNetManagementControls = false,
  readonly = false,
  children,
}: {
  initialTitle?: string;
  initialDefinition?: SDCPN;
  hideNetManagementControls?: boolean;
  readonly?: boolean;
  children?: ReactNode;
}) => {
  "use no memo"; // getOrCreateHandle intentionally lazy-initialises a ref-held Map during render — same pattern as the demo-site DevApp.

  const [nets, setNets] = useState<Record<string, StoredNet>>(() => {
    const id = "net-1";
    return {
      [id]: { id, title: initialTitle, sdcpn: initialDefinition },
    };
  });
  const [currentNetId, setCurrentNetId] = useState<string>("net-1");

  const handlesRef = useRef<Map<string, PetrinautDocHandle>>(new Map());

  const getOrCreateHandle = (net: StoredNet): PetrinautDocHandle => {
    const existing = handlesRef.current.get(net.id);
    if (existing) {
      return existing;
    }
    const handle = createJsonDocHandle({ id: net.id, initial: net.sdcpn });
    handlesRef.current.set(net.id, handle);

    handle.subscribe((event) => {
      setNets((prev) => {
        const stored = prev[net.id];
        if (!stored) {
          return prev;
        }
        return { ...prev, [net.id]: { ...stored, sdcpn: event.next } };
      });
    });

    return handle;
  };

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
  const handle = getOrCreateHandle(currentNet);

  return (
    <>
      <Petrinaut
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
