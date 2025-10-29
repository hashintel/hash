import { useEffect } from "react";

import type { EditorState } from "../../../../state/editor-store";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

export function useKeyboardShortcuts(
  mode: EditorMode,
  onEditionModeChange: (mode: EditorEditionMode) => void,
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
        target.closest(".monaco-editor") !== null;

      if (isInputFocused) {
        return;
      }

      // Check that no modifier keys are pressed
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }

      // Switch modes based on key
      switch (event.key.toLowerCase()) {
        // If escape is pressed, switch to select mode
        case "escape":
          event.preventDefault();
          onEditionModeChange("select");
          break;
        case "v":
          event.preventDefault();
          onEditionModeChange("select");
          break;
        case "h":
          event.preventDefault();
          onEditionModeChange("pan");
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
  }, [mode, onEditionModeChange]);
}
