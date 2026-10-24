import { applyPatches, enablePatches, freeze, produce } from "immer";

import { RustDocument } from "../../rust/pkg/petrinaut_core.js";
import {
  resolvePetrinautHandleCapabilities,
  sanitizeSDCPNForExtensions,
} from "../extensions";
import { generatePetrinautId, toPetrinautId } from "../petrinaut-id";
import { createReadableStore } from "../store";
import { normalizeSDCPN } from "../types/sdcpn-input";

import type { MutationActionInput } from "../action-schemas";
import type {
  CreateJsonDocHandleOptions,
  DocChangeEvent,
  DocHandleState,
  HistoryEntry,
  PetrinautDocHandle,
  PetrinautHistory,
  PetrinautPatch,
} from "../handle";
import type { SDCPN } from "../types/sdcpn";

enablePatches();

const json = (value: unknown): string =>
  JSON.stringify(value, (key, item: unknown) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new TypeError(
        `Rust documents cannot patch reserved property ${key}.`,
      );
    }
    if (
      (typeof item === "number" && !Number.isFinite(item)) ||
      typeof item === "bigint" ||
      typeof item === "function" ||
      typeof item === "symbol"
    ) {
      throw new TypeError(
        "Rust documents require JSON values and finite numbers.",
      );
    }
    return item;
  });

type NativeMutation = "commitNodePositions" | "updatePlace" | "removePlace";
type RustCommand =
  | {
      [Name in NativeMutation]: {
        type: Name;
        input: MutationActionInput<Name>;
      };
    }[NativeMutation]
  | {
      type: "addPlace";
      input: {
        targetSubnetId?: string | null;
        place: Omit<MutationActionInput<"addPlace">, "targetSubnetId">;
      };
    };

export const createRustDocHandle = (
  options: CreateJsonDocHandleOptions,
): PetrinautDocHandle & {
  execute(command: RustCommand): void;
  dispose(): void;
} => {
  const historyLimit = options.historyLimit ?? 50;
  if (
    !Number.isInteger(historyLimit) ||
    historyLimit < 0 ||
    historyLimit > 0xffff_ffff
  ) {
    throw new RangeError(
      "historyLimit must be an integer between 0 and 4294967295.",
    );
  }
  const capabilities = resolvePetrinautHandleCapabilities(options.capabilities);
  const document = new RustDocument(
    json(
      sanitizeSDCPNForExtensions(
        normalizeSDCPN(options.initial),
        capabilities.extensions,
      ),
    ),
    historyLimit,
    new Date().toISOString(),
    capabilities.readonly,
    json(capabilities.extensions),
  );
  let current = freeze(JSON.parse(document.snapshot()) as SDCPN, true);
  let disposed = false;
  let changing = false;
  const listeners = new Set<(event: DocChangeEvent) => void>();
  const state = createReadableStore<DocHandleState>("ready");
  const entries = createReadableStore<readonly HistoryEntry[]>([]);
  const currentIndex = createReadableStore(0);
  const canUndo = createReadableStore(false);
  const canRedo = createReadableStore(false);

  const assertReady = () => {
    if (disposed) {
      throw new Error("Rust Petrinaut instance has been disposed.");
    }
    if (changing) {
      throw new Error("Nested document changes are not supported.");
    }
  };
  const refreshHistory = () => {
    const history = JSON.parse(document.history()) as {
      entries: HistoryEntry[];
      currentIndex: number;
    };
    if (
      history.entries.length !== entries.get().length ||
      history.entries.some(
        (entry, index) => entry.timestamp !== entries.get()[index]?.timestamp,
      )
    ) {
      entries.set(history.entries);
    }
    currentIndex.set(history.currentIndex);
    canUndo.set(history.currentIndex > 0);
    canRedo.set(history.currentIndex < history.entries.length - 1);
  };
  const publish = (serializedPatches: string) => {
    const patches = JSON.parse(serializedPatches) as PetrinautPatch[];
    if (patches.length > 0) {
      current = applyPatches(current, patches);
    }
    refreshHistory();
    if (patches.length > 0) {
      const event: DocChangeEvent = { next: current, patches, source: "local" };
      for (const listener of listeners) {
        listener(event);
      }
    }
  };
  const goToIndex = (index: number): boolean => {
    assertReady();
    if (
      capabilities.readonly ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= entries.get().length ||
      index === currentIndex.get()
    ) {
      return false;
    }
    publish(document.goToIndex(index));
    return true;
  };
  refreshHistory();
  const history: PetrinautHistory = {
    entries,
    currentIndex,
    canUndo,
    canRedo,
    undo: () => goToIndex(currentIndex.get() - 1),
    redo: () => goToIndex(currentIndex.get() + 1),
    goToIndex,
    clear() {
      assertReady();
      document.clearHistory(new Date().toISOString());
      refreshHistory();
    },
  };
  return {
    id:
      options.id === undefined
        ? generatePetrinautId()
        : toPetrinautId(options.id),
    capabilities: options.capabilities,
    state,
    whenReady: () =>
      disposed
        ? Promise.reject(
            new Error("Rust Petrinaut instance has been disposed."),
          )
        : Promise.resolve(),
    doc: () => (disposed ? undefined : current),
    history: historyLimit > 0 ? history : undefined,
    change(fn) {
      assertReady();
      if (capabilities.readonly) {
        return;
      }
      changing = true;
      let patches: string;
      try {
        const next = produce(current, (draft) => {
          fn(draft as SDCPN);
        });
        if (next === current) {
          return;
        }
        patches = document.commit(json(next), new Date().toISOString());
      } finally {
        changing = false;
      }
      publish(patches);
    },
    execute(command) {
      assertReady();
      if (capabilities.readonly) {
        return;
      }
      publish(document.execute(json(command), new Date().toISOString()));
    },
    subscribe(listener) {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      assertReady();
      disposed = true;
      listeners.clear();
      document.free();
      state.set("unavailable");
    },
  };
};
