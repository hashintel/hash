import {
  createPetrinautActions,
  type MutationHelperFunctions,
} from "./actions";
import {
  type CommandHelperFunctions,
  createPetrinautCommands,
} from "./commands";
import { resolvePetrinautHandleCapabilities } from "./extensions";

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
  const handleCapabilities = resolvePetrinautHandleCapabilities(
    handle.capabilities,
  );
  const capabilities: ResolvedPetrinautHandleCapabilities = {
    ...handleCapabilities,
    readonly: readonly || handleCapabilities.readonly,
  };

  const disposers: Array<() => void> = [];

  const definition = createDefinitionStore(handle);
  const patches = createPatchStream(handle);

  const mutate = (fn: (draft: SDCPN) => void) => {
    if (capabilities.readonly) {
      return;
    }
    handle.change(fn);
  };

  const mutations = createPetrinautActions(mutate, capabilities.extensions);
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
    dispose() {
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },
  };
}
