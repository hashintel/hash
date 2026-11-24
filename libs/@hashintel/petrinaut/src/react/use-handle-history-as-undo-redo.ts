import { useState } from "react";

import {
  historyFloor,
  markCurrentEntry,
} from "./use-handle-history-as-undo-redo/history-floor";
import { useStore } from "./use-store";

import type { UndoRedoContextValue } from "./state/undo-redo-context";
import type {
  HistoryEntry,
  PetrinautHistory,
  ReadableStore,
} from "@hashintel/petrinaut-core";

function constStore<T>(value: T): ReadableStore<T> {
  return {
    get: () => value,
    subscribe: () => () => {},
  };
}

const EMPTY_BOOL_STORE = constStore(false);
const EMPTY_ENTRIES_STORE = constStore<readonly HistoryEntry[]>([]);
const EMPTY_INDEX_STORE = constStore(0);

/**
 * Adapt a {@link PetrinautHistory} (Core handle's optional history surface)
 * into the legacy {@link UndoRedoContextValue} shape consumed by the editor's
 * top bar / version-history button / keyboard shortcuts.
 *
 * With `sinceTaken`, the history is the part from the entry it was at when
 * the editor took it: an undo or a jump goes no further back, and the older
 * entries are not listed. An editor that only composes asks for this, since
 * undoing an older change would make a change it is refused. The handle's
 * own history is left whole.
 */
export function useHandleHistoryAsUndoRedo(
  history: PetrinautHistory | undefined,
  { sinceTaken }: { sinceTaken: boolean },
): UndoRedoContextValue | undefined {
  const canUndo = useStore(history?.canUndo ?? EMPTY_BOOL_STORE);
  const canRedo = useStore(history?.canRedo ?? EMPTY_BOOL_STORE);
  const entries = useStore(history?.entries ?? EMPTY_ENTRIES_STORE);
  const currentIndex = useStore(history?.currentIndex ?? EMPTY_INDEX_STORE);

  // Where the history was when the editor took it, marked again when the
  // editor is handed another history or starts to scope the one it has.
  const scoped = sinceTaken ? history : undefined;
  const takenNow = () => ({
    scoped,
    start: scoped ? markCurrentEntry(scoped) : null,
  });
  const [taken, setTaken] = useState(takenNow);
  if (taken.scoped !== scoped) {
    setTaken(takenNow());
  }

  if (!history) {
    return undefined;
  }

  const floor = historyFloor(entries, taken.start);
  // Asked of the history as it is when the user acts: a second undo can come
  // before the first has rendered.
  const floorNow = () => historyFloor(history.entries.get(), taken.start);

  return {
    canUndo: canUndo && currentIndex > floor,
    canRedo,
    history: entries.slice(floor).map((e) => ({ timestamp: e.timestamp })),
    currentIndex: currentIndex - floor,
    undo: () => {
      if (history.currentIndex.get() > floorNow()) {
        history.undo();
      }
    },
    redo: () => {
      history.redo();
    },
    goToIndex: (index: number) => {
      if (index >= 0) {
        history.goToIndex(index + floorNow());
      }
    },
  };
}
