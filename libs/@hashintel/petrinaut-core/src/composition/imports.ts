/**
 * Imports: the libraries a document names, and what a host resolves them to.
 * Resolving is the one thing here that takes time. It happens in the store
 * below and nowhere else: every reader takes the states the store holds, as
 * they stand.
 */

import {
  resolveLibrary,
  type Library,
  type ResolvedLibraries,
  type ResolvedLibrary,
} from "./libraries";

import type { ReadableStore } from "../store";
import type { SDCPN } from "../types/sdcpn";

export type ImportState =
  | { status: "resolving" }
  | { status: "resolved"; library: ResolvedLibrary }
  /** `message` says why, for a user: the host's own words, or what is wrong with the library. */
  | { status: "failed"; message: string };

/** The state of each import an instance resolves, by the import's id. */
export type ImportStates = ReadonlyMap<string, ImportState>;

/**
 * What a host resolves the import `id` to: the whole library, or `undefined`
 * for one it does not know. A promise, or the value itself for a library
 * already in memory, which then resolves at once.
 */
export type ResolveImport = (
  id: string,
) => Library | undefined | PromiseLike<Library | undefined>;

/** The libraries among `states` that resolved, for `resolveComponent`. */
export const resolvedLibraries = (states: ImportStates): ResolvedLibraries =>
  new Map(
    [...states].flatMap(([id, state]) =>
      state.status === "resolved" ? [[id, state.library] as const] : [],
    ),
  );

/** Whether an import of the document is still resolving. */
export const isResolvingImports = (
  sdcpn: Pick<SDCPN, "imports">,
  states: ImportStates,
): boolean =>
  (sdcpn.imports ?? []).some(
    ({ id }) => states.get(id)?.status === "resolving",
  );

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isPromiseLike = <Value>(
  value: Value | PromiseLike<Value>,
): value is PromiseLike<Value> =>
  typeof value === "object" && value !== null && "then" in value;

/**
 * Resolves the imports of a document, and the libraries a host offers beside
 * them, each once: when the store is created, and for an import that joins
 * the document later, when it does. An import the document drops keeps its
 * state, so bringing it back resolves nothing again.
 *
 * The document is observed only while the store has subscribers. A read
 * looks at the document as it stands, so it is never behind it.
 */
export const createImportStore = ({
  definition,
  resolveImport,
  offered,
}: {
  definition: ReadableStore<Pick<SDCPN, "imports">>;
  resolveImport: ResolveImport | undefined;
  /** The ids of the libraries the host offers, whether a document imports them or not. */
  offered: readonly string[];
}): { store: ReadableStore<ImportStates>; dispose: () => void } => {
  let states: ImportStates = new Map();
  const listeners = new Set<(states: ImportStates) => void>();
  let stopObserving: (() => void) | undefined;
  let disposed = false;

  /** `announce` is false for a state set while the store is being read. */
  const set = (id: string, state: ImportState, announce: boolean): void => {
    if (disposed) {
      return;
    }
    states = new Map(states).set(id, state);
    if (announce) {
      for (const listener of listeners) {
        listener(states);
      }
    }
  };

  const failed = (message: string): ImportState => ({
    status: "failed",
    message,
  });

  const settled = (id: string, library: Library | undefined): ImportState => {
    if (library === undefined) {
      return failed(`The application does not know the library \`${id}\`.`);
    }
    try {
      return { status: "resolved", library: resolveLibrary(id, library) };
    } catch (error) {
      return failed(messageOf(error));
    }
  };

  const resolve = (id: string, announce: boolean): void => {
    if (!resolveImport) {
      set(id, failed("The application resolves no imports."), announce);
      return;
    }
    let result: ReturnType<ResolveImport>;
    try {
      result = resolveImport(id);
    } catch (error) {
      set(id, failed(messageOf(error)), announce);
      return;
    }
    if (!isPromiseLike(result)) {
      set(id, settled(id, result), announce);
      return;
    }
    set(id, { status: "resolving" }, announce);
    result.then(
      (library) => set(id, settled(id, library), true),
      (error: unknown) => set(id, failed(messageOf(error)), true),
    );
  };

  const resolveUnseen = (
    sdcpn: Pick<SDCPN, "imports">,
    announce: boolean,
  ): void => {
    const ids = [...offered, ...(sdcpn.imports ?? []).map(({ id }) => id)];
    for (const id of ids) {
      if (!states.has(id)) {
        resolve(id, announce);
      }
    }
  };

  resolveUnseen(definition.get(), false);

  return {
    store: {
      get() {
        resolveUnseen(definition.get(), false);
        return states;
      },
      subscribe(listener) {
        if (disposed) {
          return () => {};
        }
        listeners.add(listener);
        stopObserving ??= definition.subscribe((sdcpn) =>
          resolveUnseen(sdcpn, true),
        );
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) {
            stopObserving?.();
            stopObserving = undefined;
          }
        };
      },
    },
    dispose: () => {
      disposed = true;
      stopObserving?.();
      stopObserving = undefined;
      listeners.clear();
    },
  };
};
