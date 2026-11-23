import { useState } from "react";

import { deriveStore } from "./use-handle-history-as-undo-redo/derive-store";
import {
  historyFloor,
  markCurrentEntry,
} from "./use-handle-history-as-undo-redo/history-floor";

import type { UndoRedoContextValue } from "./undo-redo-context";
import type { PetrinautHistory } from "@hashintel/petrinaut-core";

/**
 * Adapt a {@link PetrinautHistory} (Core handle's optional history surface)
 * into the {@link UndoRedoContextValue} the editor's top bar, version-history
 * button and keyboard shortcuts read.
 *
 * It subscribes to nothing itself: the flags and the list it hands out are
 * stores derived from the handle's, so an edit renders only the reader that
 * shows what the edit changed.
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

  const { entries, currentIndex, canUndo, canRedo } = history;
  // Asked of the history as it is when the user acts: a second undo can come
  // before the first has rendered.
  const floorNow = () => historyFloor(entries.get(), taken.start);

  return {
    canUndo: deriveStore(
      { canUndo, currentIndex, entries },
      (now) =>
        now.canUndo &&
        now.currentIndex > historyFloor(now.entries, taken.start),
    ),
    canRedo,
    history: deriveStore({ entries, currentIndex }, (now) => {
      const floor = historyFloor(now.entries, taken.start);
      return {
        entries: now.entries.slice(floor),
        currentIndex: now.currentIndex - floor,
      };
    }),
    undo: () => {
      if (currentIndex.get() > floorNow()) {
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
