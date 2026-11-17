import {
  createPetrinautActions,
  type MutationHelperFunctions,
} from "./actions";
import {
  type CommandHelperFunctions,
  createPetrinautCommands,
} from "./commands";
import {
  createImportStore,
  resolvedLibraries,
  type ImportStates,
  type ResolveImport,
} from "./composition/imports";
import {
  resolvePetrinautHandleCapabilities,
  sanitizeSDCPNForExtensions,
  stripDisabledExtensionData,
} from "./extensions";

import type {
  PetrinautExtensionSettings,
  ResolvedPetrinautHandleCapabilities,
} from "./extensions";
import type { PetrinautDocHandle, PetrinautPatch } from "./handle";
import type { ReadableStore } from "./store";
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

export type PetrinautMutations = MutationHelperFunctions;
export type PetrinautCommands = CommandHelperFunctions;

/**
 * The live document instance. Owns the handle, mutations, commands, and
 * patch stream.
 *
 * Mutations and commands are namespaced:
 *
 * - `instance.mutations` — atomic, schema-driven operations keyed by
 *   `mutationActionInputSchemas`. This is the AI-safe surface; the AI tool
 *   bundle is derived from these schemas.
 * - `instance.commands` — composite host operations (clipboard paste,
 *   auto-layout). Only the subset registered in `aiCommandActionInputSchemas`
 *   is exposed to the AI.
 *
 * There is no top-level `mutate` escape hatch — every write must flow
 * through a typed helper so it is schema-validated.
 *
 * **Simulation does not live here.** A simulation runs against a frozen SDCPN
 * snapshot and has no need for the live document. To run one, call
 * {@link createSimulation} directly with `instance.handle.doc()` (or any other
 * SDCPN value). The host owns the simulation's lifecycle.
 */
export type Petrinaut = {
  readonly handle: PetrinautDocHandle;

  /** Current SDCPN snapshot store. Falls back to an empty SDCPN until the handle is ready. */
  readonly definition: ReadableStore<SDCPN>;

  /** Patch event stream. Only fires for handles that produce patches. */
  readonly patches: EventStream<PetrinautPatch[]>;

  readonly capabilities: ResolvedPetrinautHandleCapabilities;

  readonly extensions: PetrinautExtensionSettings;

  /** Atomic, schema-driven mutations. */
  readonly mutations: PetrinautMutations;

  /** Composite host operations (clipboard paste, auto-layout, ...). */
  readonly commands: PetrinautCommands;

  readonly readonly: boolean;

  /**
   * The state of each import of the document, and of each library the host
   * offers, by its id: resolving, resolved with its library, or failed with
   * the reason. Read it as it stands: nothing else here waits for a library.
   */
  readonly imports: ReadableStore<ImportStates>;

  /** The ids of the libraries the host offers to place components from. */
  readonly libraries: readonly string[];

  dispose(this: void): void;
};

export type CreatePetrinautConfig = {
  document: PetrinautDocHandle;
  readonly?: boolean;
  /**
   * Resolves an import of the document to its library. Called once per
   * import, when the instance is created and when an import joins the
   * document. Without it, every import fails to resolve.
   */
  resolveImport?: ResolveImport;
  /**
   * The ids of the libraries on offer: each is resolved through
   * `resolveImport` whether a document imports it yet or not.
   */
  libraries?: readonly string[];
};

function createDefinitionStore(
  handle: PetrinautDocHandle,
  extensions: PetrinautExtensionSettings,
): { store: ReadableStore<SDCPN>; dispose: () => void } {
  const listeners = new Set<(value: SDCPN) => void>();
  let latestSource: SDCPN | undefined;
  let latestSanitized: SDCPN | undefined;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  const observeHandle = () => {
    if (unsubscribe !== undefined || disposed) {
      return;
    }
    unsubscribe = handle.subscribe((event) => {
      latestSource = event.next;
      const sanitized = sanitizeSDCPNForExtensions(event.next, extensions);
      latestSanitized = sanitized;
      for (const listener of listeners) {
        listener(sanitized);
      }
    });
  };

  const read = (): SDCPN => {
    const source = handle.doc() ?? EMPTY_SDCPN;
    if (latestSource !== source || latestSanitized === undefined) {
      latestSource = source;
      latestSanitized = sanitizeSDCPNForExtensions(source, extensions);
    }
    return latestSanitized;
  };

  return {
    store: {
      get: read,
      subscribe(listener) {
        if (disposed) {
          return () => {};
        }
        listeners.add(listener);
        observeHandle();
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) {
            unsubscribe?.();
            unsubscribe = undefined;
          }
        };
      },
    },
    dispose: () => {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      listeners.clear();
    },
  };
}

function createPatchStream(handle: PetrinautDocHandle): {
  stream: EventStream<PetrinautPatch[]>;
  dispose: () => void;
} {
  const listeners = new Set<(event: PetrinautPatch[]) => void>();
  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  const observeHandle = () => {
    if (unsubscribe !== undefined || disposed) {
      return;
    }
    unsubscribe = handle.subscribe((event) => {
      if (!event.patches) {
        return;
      }
      for (const listener of listeners) {
        listener(event.patches);
      }
    });
  };

  return {
    stream: {
      subscribe(listener) {
        if (disposed) {
          return () => {};
        }
        listeners.add(listener);
        observeHandle();
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) {
            unsubscribe?.();
            unsubscribe = undefined;
          }
        };
      },
    },
    dispose: () => {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      listeners.clear();
    },
  };
}

export function createPetrinaut(config: CreatePetrinautConfig): Petrinaut {
  const {
    document: handle,
    readonly = false,
    resolveImport,
    libraries = [],
  } = config;
  const handleCapabilities = resolvePetrinautHandleCapabilities(
    handle.capabilities,
  );
  const capabilities: ResolvedPetrinautHandleCapabilities = {
    ...handleCapabilities,
    readonly: readonly || handleCapabilities.readonly,
  };

  const definitionResource = createDefinitionStore(
    handle,
    capabilities.extensions,
  );
  const patchesResource = createPatchStream(handle);
  const definition = definitionResource.store;
  const patches = patchesResource.stream;
  const importsResource = createImportStore({
    definition,
    resolveImport,
    offered: libraries,
  });
  const imports = importsResource.store;
  const disposers: Array<() => void> = [
    importsResource.dispose,
    definitionResource.dispose,
    patchesResource.dispose,
  ];
  const shouldSanitizeAfterMutation =
    capabilities.disabledExtensions.length > 0;

  const mutate = (fn: (draft: SDCPN) => void) => {
    if (capabilities.readonly) {
      return;
    }
    handle.change((draft) => {
      fn(draft);
      if (shouldSanitizeAfterMutation) {
        stripDisabledExtensionData(draft, capabilities.extensions);
      }
    });
  };

  const mutations = createPetrinautActions(mutate, capabilities.extensions, {
    sanitizeAfterMutation: false,
    libraries: () => resolvedLibraries(imports.get()),
  });
  const commands = createPetrinautCommands(
    mutate,
    () => definition.get(),
    capabilities.extensions,
  );

  return {
    handle,
    definition,
    patches,
    capabilities,
    extensions: capabilities.extensions,
    mutations,
    commands,
    readonly: capabilities.readonly,
    imports,
    libraries,
    dispose() {
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },
  };
}
