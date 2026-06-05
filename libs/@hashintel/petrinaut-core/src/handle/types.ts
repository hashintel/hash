import type { PetrinautHandleCapabilities } from "../extensions";
import type { ReadableStore } from "../store";
import type { SDCPN } from "../types/sdcpn";

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
  readonly capabilities?: PetrinautHandleCapabilities;
  readonly state: ReadableStore<DocHandleState>;
  whenReady(): Promise<void>;
  doc(): SDCPN | undefined;
  change(fn: (draft: SDCPN) => void): void;
  subscribe(listener: (event: DocChangeEvent) => void): () => void;
  /**
   * Optional. Present on handles that track local history (Immer-backed,
   * Automerge-backed, ...). Read-only mirror handles omit it.
   */
  readonly history?: PetrinautHistory;
}
