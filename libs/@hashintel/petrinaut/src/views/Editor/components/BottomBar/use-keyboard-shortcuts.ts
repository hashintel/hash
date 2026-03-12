import { use, useEffect } from "react";

import type { CursorMode, EditorState } from "../../../../state/editor-context";
import { UndoRedoContext } from "../../../../state/undo-redo-context";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

export function useKeyboardShortcuts(
  mode: EditorMode,
  onEditionModeChange: (mode: EditorEditionMode) => void,
  onCursorModeChange: (mode: CursorMode) => void,
) {
  const undoRedo = use(UndoRedoContext);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;

      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest(".monaco-editor") !== null ||
        target.closest("#sentry-feedback") !== null;

      // Handle undo/redo shortcuts, but let inputs handle their own undo/redo.
      if (
        undoRedo &&
        !isInputFocused &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (event.shiftKey) {
          undoRedo.redo();
        } else {
          undoRedo.undo();
        }
        return;
      }

      if (isInputFocused) {
        return;
      }

      // Check that no modifier keys are pressed
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }

      // Switch modes based on key
      switch (event.key.toLowerCase()) {
        // If escape is pressed, switch to cursor mode (keep current cursor)
        case "escape":
          event.preventDefault();
          onEditionModeChange("cursor");
          break;
        case "v":
          event.preventDefault();
          onCursorModeChange("select");
          onEditionModeChange("cursor");
          break;
        case "h":
          event.preventDefault();
          onCursorModeChange("pan");
          onEditionModeChange("cursor");
          break;
        case "n":
          if (mode === "edit") {
            event.preventDefault();
            onEditionModeChange("add-place");
          }
          break;
        case "t":
          if (mode === "edit") {
            event.preventDefault();
            onEditionModeChange("add-transition");
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode, onEditionModeChange, onCursorModeChange, undoRedo]);
}
