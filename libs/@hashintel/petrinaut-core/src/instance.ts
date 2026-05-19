import type {
  PetrinautDocHandle,
  PetrinautPatch,
  ReadableStore,
} from "./handle";
import {
  createPetrinautActions,
  type MutationHelperFunctions,
} from "./actions";
import type { SDCPN } from "./types/sdcpn";

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

export type EventStream<T> = {
  subscribe(listener: (event: T) => void): () => void;
};

/**
 * The live document instance. Owns the handle, mutations, and patch stream.
 *
 * **Simulation does not live here.** A simulation runs against a frozen SDCPN
 * snapshot and has no need for the live document. To run one, call
 * {@link createSimulation} directly with `instance.handle.doc()` (or any other
 * SDCPN value). The host owns the simulation's lifecycle.
 */
export type Petrinaut = MutationHelperFunctions & {
  readonly handle: PetrinautDocHandle;

  /** Current SDCPN snapshot store. Falls back to an empty SDCPN until the handle is ready. */
  readonly definition: ReadableStore<SDCPN>;

  /** Patch event stream. Only fires for handles that produce patches. */
  readonly patches: EventStream<PetrinautPatch[]>;

  /** Apply a mutation to the document via the underlying handle. No-op if read-only. */
  mutate(this: void, fn: (draft: SDCPN) => void): void;

  readonly readonly: boolean;

  dispose(this: void): void;
};

export type CreatePetrinautConfig = {
  document: PetrinautDocHandle;
  readonly?: boolean;
};

function createDefinitionStore(
  handle: PetrinautDocHandle,
): ReadableStore<SDCPN> {
  const listeners = new Set<(value: SDCPN) => void>();

  const unsubscribe = handle.subscribe((event) => {
    for (const listener of listeners) {
      listener(event.next);
    }
  });

  return {
    get: () => handle.doc() ?? EMPTY_SDCPN,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          // Keep the upstream subscription alive — disposed at instance.dispose().
          void unsubscribe;
        }
      };
    },
  };
}

function createPatchStream(
  handle: PetrinautDocHandle,
): EventStream<PetrinautPatch[]> {
  const listeners = new Set<(event: PetrinautPatch[]) => void>();

  handle.subscribe((event) => {
    if (!event.patches) {
      return;
    }
    for (const listener of listeners) {
      listener(event.patches);
    }
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createPetrinaut(config: CreatePetrinautConfig): Petrinaut {
  const { document: handle, readonly = false } = config;

  const disposers: Array<() => void> = [];

  const definition = createDefinitionStore(handle);
  const patches = createPatchStream(handle);
  const mutate = (fn: (draft: SDCPN) => void) => {
    if (readonly) {
      return;
    }
    handle.change(fn);
  };
  const actions = createPetrinautActions(mutate);

  return {
    ...actions,
    handle,
    definition,
    patches,
    mutate,
    readonly,
    dispose() {
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },
  };
}
