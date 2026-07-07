import { createContext } from "react";

export type UndoRedoContextValue = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: Array<{ timestamp: string }>;
  currentIndex: number;
  goToIndex: (index: number) => void;
};

export const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);
