import { type FunctionComponent, useEffect, useMemo } from "react";

import type {
  HistoryEntry,
  PetrinautDocHandle,
  PetrinautHistory,
  ReadableStore,
} from "../core/handle";
import { createPetrinaut, type Petrinaut as Instance } from "../core/instance";
import type { MinimalNetMetadata, SDCPN } from "../core/types/sdcpn";
import { Petrinaut } from "../petrinaut";
import { PetrinautInstanceContext } from "../react/instance-context";
import { useStore } from "../react/use-store";
import type { UndoRedoContextValue } from "../state/undo-redo-context";
import type { ViewportAction } from "../types/viewport-action";

export type PetrinautNextProps = {
  handle: PetrinautDocHandle;
  title?: string;
  setTitle?: (title: string) => void;
  readonly?: boolean;
  hideNetManagementControls?: boolean;
  existingNets?: MinimalNetMetadata[];
  createNewNet?: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  loadPetriNet?: (petriNetId: string) => void;
  viewportActions?: ViewportAction[];
};

const noop = () => {};

function constStore<T>(value: T): ReadableStore<T> {
  return {
    get: () => value,
    subscribe: () => () => {},
  };
}

const EMPTY_BOOL_STORE = constStore(false);
const EMPTY_ENTRIES_STORE = constStore<readonly HistoryEntry[]>([]);
const EMPTY_INDEX_STORE = constStore(0);

function useHandleHistoryAsUndoRedo(
  history: PetrinautHistory | undefined,
): UndoRedoContextValue | undefined {
  const canUndo = useStore(history?.canUndo ?? EMPTY_BOOL_STORE);
  const canRedo = useStore(history?.canRedo ?? EMPTY_BOOL_STORE);
  const entries = useStore(history?.entries ?? EMPTY_ENTRIES_STORE);
  const currentIndex = useStore(history?.currentIndex ?? EMPTY_INDEX_STORE);

  if (!history) {
    return undefined;
  }

  return {
    canUndo,
    canRedo,
    history: entries.map((e) => ({ timestamp: e.timestamp })),
    currentIndex,
    undo: () => {
      history.undo();
    },
    redo: () => {
      history.redo();
    },
    goToIndex: (index: number) => {
      history.goToIndex(index);
    },
  };
}

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
  viewportActions,
}) => {
  const instance = useMemo<Instance>(
    () => createPetrinaut({ document: handle, readonly }),
    [handle, readonly],
  );

  useEffect(() => () => instance.dispose(), [instance]);

  const definition = useStore(instance.definition);
  const undoRedo = useHandleHistoryAsUndoRedo(handle.history);

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
        undoRedo={undoRedo}
        viewportActions={viewportActions}
      />
    </PetrinautInstanceContext>
  );
};
