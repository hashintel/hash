import {
  applyPatches,
  enablePatches,
  type Patch as ImmerPatch,
  produceWithPatches,
} from "immer";

import {
  resolvePetrinautHandleCapabilities,
  sanitizeSDCPNForExtensions,
  stripDisabledExtensionData,
  type PetrinautHandleCapabilities,
} from "../../extensions";
import { createReadableStore } from "../../store";
import { normalizeSDCPN } from "../../types/sdcpn-input";

import type { SDCPN } from "../../types/sdcpn";
import type { SDCPNInput } from "../../types/sdcpn-input";
import type {
  DocChangeEvent,
  DocHandleState,
  DocumentId,
  HistoryEntry,
  PetrinautDocHandle,
  PetrinautHistory,
  PetrinautPatch,
} from "../types";

enablePatches();

function fromImmerPatch(patch: ImmerPatch): PetrinautPatch {
  return {
    op: patch.op,
    path: patch.path as (string | number)[],
    value: patch.value,
  };
}

let idCounter = 0;
function generateId(): DocumentId {
  idCounter += 1;
  return `petrinaut-doc-${Date.now()}-${idCounter}`;
}

type HistoryStackEntry = {
  forward: ImmerPatch[];
  inverse: ImmerPatch[];
  timestamp: string;
};

const DEFAULT_HISTORY_LIMIT = 50;

export type CreateJsonDocHandleOptions = {
  id?: DocumentId;
  /**
   * Initial document. Accepts a loose {@link SDCPNInput} — extension fields
   * (`colorId`, `lambdaCode`, arc `type`/`weight`, the `types` /
   * `parameters` / `differentialEquations` arrays, ...) may be omitted and are
   * filled with plain-net defaults via {@link normalizeSDCPN}. A complete
   * {@link SDCPN} is a valid input too.
   */
  initial: SDCPNInput;
  capabilities?: PetrinautHandleCapabilities;
  /**
   * Maximum number of history checkpoints retained. Older entries are dropped
   * once the limit is exceeded. Pass `0` to disable history entirely.
   * @default 50
   */
  historyLimit?: number;
};

/**
 * Create an in-memory JSON-backed Petrinaut document handle.
 *
 * Petrinaut is built around the `PetrinautDocHandle` contract so hosts can
 * provide different document backends, such as local JSON state, collaborative
 * documents, or read-only mirrors. This implementation is the small default
 * handle used by tests, stories, examples, and simple local editing flows. It
 * stores the current SDCPN snapshot in memory, publishes local change events
 * with Immer patches, exposes optional undo/redo history, and honors handle
 * capabilities such as `readonly`.
 */
export function createJsonDocHandle(
  opts: CreateJsonDocHandleOptions,
): PetrinautDocHandle {
  const id = opts.id ?? generateId();
  const historyLimit = opts.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const capabilities = opts.capabilities;
  const resolvedCapabilities = resolvePetrinautHandleCapabilities(capabilities);
  const stateStore = createReadableStore<DocHandleState>("ready");
  const subscribers = new Set<(event: DocChangeEvent) => void>();

  let current: SDCPN = sanitizeSDCPNForExtensions(
    normalizeSDCPN(opts.initial),
    resolvedCapabilities.extensions,
  );

  const stack: HistoryStackEntry[] = [];
  /**
   * Index of the most recently applied entry. -1 means we are at the initial
   * state (before any mutation). After undo, index decreases; after redo,
   * index increases. New mutations truncate the stack past the index.
   */
  let cursor = -1;

  const initialEntry: HistoryEntry = { timestamp: new Date().toISOString() };
  const entriesStore = createReadableStore<readonly HistoryEntry[]>([
    initialEntry,
  ]);
  const currentIndexStore = createReadableStore<number>(0);
  const canUndoStore = createReadableStore<boolean>(false);
  const canRedoStore = createReadableStore<boolean>(false);

  function refreshHistoryStores(): void {
    const entries: HistoryEntry[] = [initialEntry];
    for (const entry of stack) {
      entries.push({ timestamp: entry.timestamp });
    }
    entriesStore.set(entries);
    currentIndexStore.set(cursor + 1);
    canUndoStore.set(cursor >= 0);
    canRedoStore.set(cursor < stack.length - 1);
  }

  function emit(event: DocChangeEvent): void {
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }

  function applyPatchesAndSanitize(patchesToApply: ImmerPatch[]): ImmerPatch[] {
    const [next, patches] = produceWithPatches(current, () => {
      const patched = applyPatches(current, patchesToApply) as SDCPN;
      return sanitizeSDCPNForExtensions(
        patched,
        resolvedCapabilities.extensions,
      );
    });
    current = next as SDCPN;
    return patches;
  }

  function recordChange(forward: ImmerPatch[], inverse: ImmerPatch[]): void {
    if (historyLimit <= 0) {
      return;
    }
    // Truncate any redo entries past the cursor.
    if (cursor < stack.length - 1) {
      stack.length = cursor + 1;
    }
    stack.push({ forward, inverse, timestamp: new Date().toISOString() });
    cursor = stack.length - 1;

    // Enforce the limit by dropping oldest entries.
    if (stack.length > historyLimit) {
      const drop = stack.length - historyLimit;
      stack.splice(0, drop);
      cursor -= drop;
    }
    refreshHistoryStores();
  }

  const history: PetrinautHistory = {
    canUndo: canUndoStore,
    canRedo: canRedoStore,
    entries: entriesStore,
    currentIndex: currentIndexStore,
    undo() {
      if (cursor < 0) {
        return false;
      }
      const entry = stack[cursor]!;
      const patches = applyPatchesAndSanitize(entry.inverse);
      cursor -= 1;
      refreshHistoryStores();
      emit({
        next: current,
        patches: patches.map(fromImmerPatch),
        source: "local",
      });
      return true;
    },
    redo() {
      if (cursor >= stack.length - 1) {
        return false;
      }
      cursor += 1;
      const entry = stack[cursor]!;
      const patches = applyPatchesAndSanitize(entry.forward);
      refreshHistoryStores();
      emit({
        next: current,
        patches: patches.map(fromImmerPatch),
        source: "local",
      });
      return true;
    },
    goToIndex(index) {
      // entries is initial + N entries; valid indexes are 0..stack.length.
      const targetCursor = index - 1;
      if (targetCursor < -1 || targetCursor > stack.length - 1) {
        return false;
      }
      if (targetCursor === cursor) {
        return false;
      }
      const collected: ImmerPatch[] = [];
      if (targetCursor < cursor) {
        // Roll backward, applying inverses from cursor down to targetCursor+1.
        for (let i = cursor; i > targetCursor; i--) {
          collected.push(...stack[i]!.inverse);
        }
      } else {
        // Roll forward, applying forwards from cursor+1 up to targetCursor.
        for (let i = cursor + 1; i <= targetCursor; i++) {
          collected.push(...stack[i]!.forward);
        }
      }
      const patches = applyPatchesAndSanitize(collected);
      cursor = targetCursor;
      refreshHistoryStores();
      emit({
        next: current,
        patches: patches.map(fromImmerPatch),
        source: "local",
      });
      return true;
    },
    clear() {
      stack.length = 0;
      cursor = -1;
      refreshHistoryStores();
    },
  };

  return {
    id,
    capabilities,
    state: stateStore,
    whenReady: () => Promise.resolve(),
    doc: () => current,
    change(fn) {
      if (resolvedCapabilities.readonly) {
        return;
      }
      const [next, patches, inversePatches] = produceWithPatches(
        current,
        (draft) => {
          fn(draft as SDCPN);
          stripDisabledExtensionData(
            draft as SDCPN,
            resolvedCapabilities.extensions,
          );
        },
      );
      if (patches.length === 0) {
        return;
      }
      current = next as SDCPN;
      recordChange(patches, inversePatches);
      emit({
        next: current,
        patches: patches.map(fromImmerPatch),
        source: "local",
      });
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    history: historyLimit > 0 ? history : undefined,
  };
}
