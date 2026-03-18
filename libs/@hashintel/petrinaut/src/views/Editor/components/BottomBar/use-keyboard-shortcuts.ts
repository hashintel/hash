import { use, useEffect, useEffectEvent } from "react";

import {
  copySelectionToClipboard,
  pasteFromClipboard,
} from "../../../../clipboard/clipboard";
import type { CursorMode, EditorState } from "../../../../state/editor-context";
import { EditorContext } from "../../../../state/editor-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import type { SelectionItem } from "../../../../state/selection";
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
    setSelection,
    isSearchOpen,
    setSearchOpen,
    searchInputRef,
    setLeftSidebarOpen,
  } = use(EditorContext);
  const {
    deleteItemsByIds,
    petriNetDefinition,
    petriNetId,
    mutatePetriNetDefinition,
  } = use(SDCPNContext);
  const isReadonly = useIsReadOnly();

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

    // Open search with Ctrl/Cmd+F, or focus input if already open.
    // Skip when focus is inside Monaco or another input so their native find works.
    if (
      !isInputFocused &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      if (isSearchOpen) {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else {
        setLeftSidebarOpen(true);
        setSearchOpen(true);
      }
      return;
    }

    // Escape closes search only when the search input itself is focused
    if (
      event.key === "Escape" &&
      isSearchOpen &&
      document.activeElement === searchInputRef.current
    ) {
      event.preventDefault();
      searchInputRef.current?.blur();
      setSearchOpen(false);
      return;
    }

    // Handle copy/paste/select-all shortcuts (Cmd/Ctrl + C/V/A)
    if (!isInputFocused && (event.metaKey || event.ctrlKey)) {
      const key = event.key.toLowerCase();

      if (key === "c" && hasSelection) {
        event.preventDefault();
        void copySelectionToClipboard(
          petriNetDefinition,
          selection,
          petriNetId,
        );
        return;
      }

      if (key === "v" && !isReadonly) {
        event.preventDefault();
        void pasteFromClipboard(mutatePetriNetDefinition).then((newItemIds) => {
          if (newItemIds && newItemIds.length > 0) {
            setSelection(
              new Map(
                newItemIds.map((item) => [item.id, item as SelectionItem]),
              ),
            );
          }
        });
        return;
      }

      if (key === "a") {
        event.preventDefault();
        const items = new Map<string, SelectionItem>();
        for (const place of petriNetDefinition.places) {
          items.set(place.id, { type: "place", id: place.id });
        }
        for (const transition of petriNetDefinition.transitions) {
          items.set(transition.id, {
            type: "transition",
            id: transition.id,
          });
        }
        setSelection(items);
        return;
      }
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
        clearSelection();
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
