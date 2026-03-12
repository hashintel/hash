import { use, useEffect, useEffectEvent } from "react";

import type { CursorMode, EditorState } from "../../../../state/editor-context";
import { EditorContext } from "../../../../state/editor-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { UndoRedoContext } from "../../../../state/undo-redo-context";
import { useIsReadOnly } from "../../../../state/use-is-read-only";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

export function useKeyboardShortcuts(
  mode: EditorMode,
  onEditionModeChange: (mode: EditorEditionMode) => void,
  onCursorModeChange: (mode: CursorMode) => void,
) {
  const undoRedo = use(UndoRedoContext);
  const {
    selection,
    hasSelection,
    clearSelection,
    isSearchOpen,
    setSearchOpen,
    searchInputRef,
  } = use(EditorContext);
  const { deleteItemsByIds, readonly } = use(SDCPNContext);
  const isSimulationReadOnly = useIsReadOnly();
  const isReadonly = isSimulationReadOnly || readonly;

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
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

    // Open search with Ctrl/Cmd+F, or focus input if already open
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (isSearchOpen) {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else {
        setSearchOpen(true);
      }
      return;
    }

    // Escape closes search when it's open
    if (event.key === "Escape" && isSearchOpen) {
      event.preventDefault();
      setSearchOpen(false);
      return;
    }

    if (isInputFocused) {
      return;
    }

    // Delete selected items with Backspace or Delete
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      !isReadonly &&
      hasSelection
    ) {
      event.preventDefault();
      deleteItemsByIds(selection);
      clearSelection();
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
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
