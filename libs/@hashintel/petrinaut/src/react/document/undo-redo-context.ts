import { createContext } from "react";

import type { ReadableStore } from "@hashintel/petrinaut-core";

/** The steps the editor can go back to, oldest first, and the one it is at. */
export type UndoHistory = {
  readonly entries: readonly { readonly timestamp: string }[];
  readonly currentIndex: number;
};

/**
 * Undo and redo over the document's history.
 *
 * Every edit adds a step. What changes with a step is held in stores, so
 * reading this context re-renders nothing: a reader that only acts calls
 * `undo` or `redo`, and the one that lists the steps subscribes to `history`
 * while it shows them.
 */
export type UndoRedoContextValue = {
  undo: () => void;
  redo: () => void;
  goToIndex: (index: number) => void;
  canUndo: ReadableStore<boolean>;
  canRedo: ReadableStore<boolean>;
  history: ReadableStore<UndoHistory>;
};

export const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);
