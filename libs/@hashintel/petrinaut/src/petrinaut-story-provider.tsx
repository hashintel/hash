import { produce } from "immer";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import type { MinimalNetMetadata, SDCPN } from "./core/types/sdcpn";
import { Petrinaut } from "./petrinaut";

type StoredNet = {
  id: string;
  title: string;
  sdcpn: SDCPN;
};

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

/**
 * A self-contained wrapper around {@link Petrinaut} that manages net state
 * in-memory, mirroring the behaviour of the demo-site's `DevApp`.
 *
 * Intended for use in Storybook stories.
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
  const [nets, setNets] = useState<Record<string, StoredNet>>(() => {
    const id = "net-1";
    return {
      [id]: { id, title: initialTitle, sdcpn: initialDefinition },
    };
  });

  const [currentNetId, setCurrentNetId] = useState<string>("net-1");

  const currentNet = nets[currentNetId]!;

  const existingNets: MinimalNetMetadata[] = useMemo(
    () => Object.values(nets).map((n) => ({ netId: n.id, title: n.title })),
    [nets],
  );

  const createNewNet = useCallback(
    (params: { petriNetDefinition: SDCPN; title: string }) => {
      const id = `net-${Date.now()}`;
      setNets((prev) => ({
        ...prev,
        [id]: { id, title: params.title, sdcpn: params.petriNetDefinition },
      }));
      setCurrentNetId(id);
    },
    [],
  );

  const loadPetriNet = useCallback((petriNetId: string) => {
    setCurrentNetId(petriNetId);
  }, []);

  const setTitle = useCallback(
    (title: string) => {
      setNets((prev) =>
        produce(prev, (draft) => {
          if (draft[currentNetId]) {
            draft[currentNetId].title = title;
          }
        }),
      );
    },
    [currentNetId],
  );

  const mutatePetriNetDefinition = useCallback(
    (mutationFn: (draft: SDCPN) => void) => {
      setNets((prev) =>
        produce(prev, (draft) => {
          if (draft[currentNetId]) {
            draft[currentNetId].sdcpn = produce(
              draft[currentNetId].sdcpn,
              mutationFn,
            );
          }
        }),
      );
    },
    [currentNetId],
  );

  return (
    <>
      <Petrinaut
        existingNets={existingNets}
        createNewNet={createNewNet}
        hideNetManagementControls={hideNetManagementControls}
        loadPetriNet={loadPetriNet}
        petriNetId={currentNetId}
        petriNetDefinition={currentNet.sdcpn}
        mutatePetriNetDefinition={mutatePetriNetDefinition}
        readonly={readonly}
        setTitle={setTitle}
        title={currentNet.title}
      />
      {children}
    </>
  );
};
