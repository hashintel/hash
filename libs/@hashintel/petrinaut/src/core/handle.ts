import {
  applyPatches,
  enablePatches,
  type Patch as ImmerPatch,
  produceWithPatches,
} from "immer";

import type { SDCPN } from "./types/sdcpn";

enablePatches();

export type DocumentId = string;

export type DocHandleState = "loading" | "ready" | "deleted" | "unavailable";

export type PetrinautPatch = {
  op: "add" | "remove" | "replace";
  path: (string | number)[];
  value?: unknown;
};

export type DocChangeEvent = {
  next: SDCPN;
  patches?: PetrinautPatch[];
  source?: "local" | "remote";
};

export type ReadableStore<T> = {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
};

export type HistoryEntry = {
  timestamp: string;
};

export interface PetrinautHistory {
  /** Apply the most recent inverse patches. Returns true if anything was undone. */
  undo(): boolean;
  /** Re-apply the most recently undone patches. Returns true if anything was redone. */
  redo(): boolean;
  /** Jump to an arbitrary point in history. Returns true if the index changed. */
  goToIndex(index: number): boolean;
  /** Drop the entire history. */
  clear(): void;

  readonly canUndo: ReadableStore<boolean>;
  readonly canRedo: ReadableStore<boolean>;

  /**
   * Ordered timestamps of the history checkpoints. Index 0 is the initial
   * state; index N is the state after the Nth mutation.
   */
  readonly entries: ReadableStore<readonly HistoryEntry[]>;

  /** Position of the current state within {@link entries}. */
  readonly currentIndex: ReadableStore<number>;
}

export interface PetrinautDocHandle {
  readonly id: DocumentId;
  readonly state: ReadableStore<DocHandleState>;
  whenReady(): Promise<void>;
  doc(): SDCPN | undefined;
  change(fn: (draft: SDCPN) => void): void;
  subscribe(listener: (event: DocChangeEvent) => void): () => void;
  /**
   * Optional. Present on handles that track local history (Immer-backed,
   * Automerge-backed, …). Read-only mirror handles omit it.
   */
  readonly history?: PetrinautHistory;
}

function createReadableStore<T>(initial: T): ReadableStore<T> & {
  set(next: T): void;
} {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, current)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}

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
  initial: SDCPN;
  /**
   * Maximum number of history checkpoints retained. Older entries are dropped
   * once the limit is exceeded. Pass `0` to disable history entirely.
   * @default 50
   */
  historyLimit?: number;
};

export function createJsonDocHandle(
  opts: CreateJsonDocHandleOptions,
): PetrinautDocHandle {
  const id = opts.id ?? generateId();
  const historyLimit = opts.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const stateStore = createReadableStore<DocHandleState>("ready");
  const subscribers = new Set<(event: DocChangeEvent) => void>();

  let current: SDCPN = opts.initial;

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
      current = applyPatches(current, entry.inverse) as SDCPN;
      cursor -= 1;
      refreshHistoryStores();
      emit({
        next: current,
        patches: entry.inverse.map(fromImmerPatch),
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
      current = applyPatches(current, entry.forward) as SDCPN;
      refreshHistoryStores();
      emit({
        next: current,
        patches: entry.forward.map(fromImmerPatch),
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
      current = applyPatches(current, collected) as SDCPN;
      cursor = targetCursor;
      refreshHistoryStores();
      emit({
        next: current,
        patches: collected.map(fromImmerPatch),
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
    state: stateStore,
    whenReady: () => Promise.resolve(),
    doc: () => current,
    change(fn) {
      const [next, patches, inversePatches] = produceWithPatches(
        current,
        (draft) => {
          fn(draft as SDCPN);
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
