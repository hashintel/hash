import type {
  PetrinautDocHandle,
  PetrinautPatch,
  ReadableStore,
} from "./handle";
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

export type Petrinaut = {
  readonly handle: PetrinautDocHandle;

  /** Current SDCPN snapshot store. Falls back to {@link EMPTY_SDCPN} until the handle is ready. */
  readonly definition: ReadableStore<SDCPN>;

  /** Patch event stream. Only fires for handles that produce patches. */
  readonly patches: EventStream<PetrinautPatch[]>;

  /** Apply a mutation to the document via the underlying handle. No-op if read-only. */
  mutate(fn: (draft: SDCPN) => void): void;

  readonly readonly: boolean;

  dispose(): void;
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

  return {
    handle,
    definition,
    patches,
    mutate(fn) {
      if (readonly) {
        return;
      }
      handle.change(fn);
    },
    readonly,
    dispose() {
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },
  };
}
