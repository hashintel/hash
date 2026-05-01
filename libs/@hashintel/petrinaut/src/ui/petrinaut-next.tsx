import { type FunctionComponent, useEffect, useMemo } from "react";

import { createPetrinaut, type Petrinaut as Instance } from "../core/instance";
import type { PetrinautDocHandle } from "../core/handle";
import type { MinimalNetMetadata, SDCPN } from "../core/types/sdcpn";
import { Petrinaut } from "../petrinaut";
import { PetrinautInstanceContext } from "../react/instance-context";
import { useStore } from "../react/use-store";

export type PetrinautNextProps = {
  handle: PetrinautDocHandle;
  title?: string;
  setTitle?: (title: string) => void;
  readonly?: boolean;
  hideNetManagementControls?: boolean;
  existingNets?: MinimalNetMetadata[];
  createNewNet?: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  loadPetriNet?: (petriNetId: string) => void;
};

const noop = () => {};

/**
 * Spike: a handle-driven entry point that creates a Core instance and bridges it
 * to the existing prop-shaped <Petrinaut>. Lives in /ui because it mounts UI;
 * once the full bridge stack lands in /react, this wrapper goes away.
 */
export const PetrinautNext: FunctionComponent<PetrinautNextProps> = ({
  handle,
  title = "Untitled",
  setTitle = noop,
  readonly = false,
  hideNetManagementControls = true,
  existingNets = [],
  createNewNet = noop,
  loadPetriNet = noop,
}) => {
  const instance = useMemo<Instance>(
    () => createPetrinaut({ document: handle, readonly }),
    [handle, readonly],
  );

  useEffect(() => () => instance.dispose(), [instance]);

  const definition = useStore(instance.definition);

  const mutate = (fn: (draft: SDCPN) => void) => {
    instance.mutate(fn);
  };

  return (
    <PetrinautInstanceContext value={instance}>
      <Petrinaut
        existingNets={existingNets}
        createNewNet={createNewNet}
        hideNetManagementControls={hideNetManagementControls}
        loadPetriNet={loadPetriNet}
        petriNetId={handle.id}
        petriNetDefinition={definition}
        mutatePetriNetDefinition={mutate}
        readonly={readonly}
        setTitle={setTitle}
        title={title}
      />
    </PetrinautInstanceContext>
  );
};
