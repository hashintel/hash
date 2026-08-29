import { use, useEffect, useEffectEvent } from "react";

import { UndoRedoContext } from "./undo-redo-context";

/**
 * Binds Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo) for views that don't
 * mount the canvas BottomBar, which owns the full editor shortcut set.
 * Inputs, textareas and code editors are left alone so their native undo
 * stacks keep working.
 */
export function useUndoRedoShortcuts() {
  const undoRedo = use(UndoRedoContext);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      !undoRedo ||
      !(event.metaKey || event.ctrlKey) ||
      event.key.toLowerCase() !== "z"
    ) {
      return;
    }
    const target = event.target as HTMLElement;
    const isInputFocused =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest(".monaco-editor") !== null;
    if (isInputFocused) {
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      undoRedo.redo();
    } else {
      undoRedo.undo();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
