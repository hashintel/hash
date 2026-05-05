import type {
  HistoryEntry,
  PetrinautHistory,
  ReadableStore,
} from "../core/handle";
import type { UndoRedoContextValue } from "./state/undo-redo-context";
import { useStore } from "./use-store";

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
 */
export function useHandleHistoryAsUndoRedo(
  history: PetrinautHistory | undefined,
): UndoRedoContextValue | undefined {
  const canUndo = useStore(history?.canUndo ?? EMPTY_BOOL_STORE);
  const canRedo = useStore(history?.canRedo ?? EMPTY_BOOL_STORE);
  const entries = useStore(history?.entries ?? EMPTY_ENTRIES_STORE);
  const currentIndex = useStore(history?.currentIndex ?? EMPTY_INDEX_STORE);

  if (!history) {
    return undefined;
  }

  return {
    canUndo,
    canRedo,
    history: entries.map((e) => ({ timestamp: e.timestamp })),
    currentIndex,
    undo: () => {
      history.undo();
    },
    redo: () => {
      history.redo();
    },
    goToIndex: (index: number) => {
      history.goToIndex(index);
    },
  };
}
