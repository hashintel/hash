import {
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

export interface PetrinautDocHandle {
  readonly id: DocumentId;
  readonly state: ReadableStore<DocHandleState>;
  whenReady(): Promise<void>;
  doc(): SDCPN | undefined;
  change(fn: (draft: SDCPN) => void): void;
  subscribe(listener: (event: DocChangeEvent) => void): () => void;
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

export function createJsonDocHandle(opts: {
  id?: DocumentId;
  initial: SDCPN;
}): PetrinautDocHandle {
  const id = opts.id ?? generateId();
  const stateStore = createReadableStore<DocHandleState>("ready");
  const subscribers = new Set<(event: DocChangeEvent) => void>();

  let current: SDCPN = opts.initial;

  return {
    id,
    state: stateStore,
    whenReady: () => Promise.resolve(),
    doc: () => current,
    change(fn) {
      const [next, patches] = produceWithPatches(current, (draft) => {
        fn(draft as SDCPN);
      });
      if (patches.length === 0) {
        return;
      }
      current = next as SDCPN;
      const event: DocChangeEvent = {
        next: current,
        patches: patches.map(fromImmerPatch),
        source: "local",
      };
      for (const subscriber of subscribers) {
        subscriber(event);
      }
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  };
}
