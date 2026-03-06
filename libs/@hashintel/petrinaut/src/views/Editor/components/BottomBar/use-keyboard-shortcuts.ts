import { useEffect } from "react";

import type { CursorMode, EditorState } from "../../../../state/editor-context";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

export function useKeyboardShortcuts(
  mode: EditorMode,
  onEditionModeChange: (mode: EditorEditionMode) => void,
  onCursorModeChange: (mode: CursorMode) => void,
) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't trigger if focus is in an input, textarea, contentEditable, or Monaco editor
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        // Check if we're inside a Monaco editor
        target.closest(".monaco-editor") !== null ||
        target.closest("#sentry-feedback") !== null;

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
  }, [mode, onEditionModeChange, onCursorModeChange]);
}
