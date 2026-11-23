import { use, useEffect, useEffectEvent } from "react";

import { ActiveNetContext } from "../../../../../react/document/active-net-context";
import { UndoRedoContext } from "../../../../../react/document/undo-redo-context";
import { useComposesOnly } from "../../../../../react/document/use-composes-only";
import { useDocumentId } from "../../../../../react/document/use-document";
import { useIsReadOnly } from "../../../../../react/editing/use-is-read-only";
import { useMutationRefusal } from "../../../../../react/editing/use-mutation-refusal";
import { usePetrinautCommands } from "../../../../../react/editing/use-petrinaut-commands";
import { usePetrinautMutations } from "../../../../../react/editing/use-petrinaut-mutations";
import { useReadOnlyFeedback } from "../../../../../react/editing/use-read-only-feedback";
import { useReadOnlyReason } from "../../../../../react/editing/use-read-only-reason";
import {
  useEditorActions,
  useEditorFields,
} from "../../../../../react/state/editor-context";
import {
  copySelectionToClipboard,
  pasteFromClipboard,
} from "../../../../clipboard/clipboard";

import type { SelectionItem } from "@hashintel/petrinaut-core";

export const useKeyboardShortcuts = () => {
  const undoRedo = use(UndoRedoContext);
  const { globalMode, selection, hasSelection, isSearchOpen, searchInputRef } =
    useEditorFields(
      "globalMode",
      "selection",
      "hasSelection",
      "isSearchOpen",
      "searchInputRef",
    );
  const {
    clearSelection,
    setSelection,
    setSearchOpen,
    setEditionMode,
    setCursorMode,
  } = useEditorActions();
  const { activeNet } = use(ActiveNetContext);
  const petriNetId = useDocumentId();
  const { deleteItemsByIds } = usePetrinautMutations();
  const { applyClipboardPaste } = usePetrinautCommands();
  const mutationRefusal = useMutationRefusal();
  const isReadonly = useIsReadOnly();
  const composesOnly = useComposesOnly();
  // Only a document the host made read-only has nothing to undo: Actual mode
  // and an active simulation keep it. Simulate mode hides the bar, and this
  // binding with it.
  const undoBlocked = useReadOnlyReason()?.kind === "host-readonly";
  const notifyReadOnly = useReadOnlyFeedback();

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
      !isInputFocused &&
      (undoBlocked || undoRedo !== null) &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      if (undoBlocked) {
        notifyReadOnly();
        return;
      }
      if (event.shiftKey) {
        undoRedo?.redo();
      } else {
        undoRedo?.undo();
      }
      return;
    }

    // Open search with Ctrl/Cmd+F, or focus input if already open.
    // Skip when focus is inside Monaco or another input so their native find works.
    if (
      !isInputFocused &&
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      if (isSearchOpen) {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else {
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

    if (!isInputFocused && (event.metaKey || event.ctrlKey)) {
      const key = event.key.toLowerCase();

      if (key === "c" && hasSelection) {
        event.preventDefault();
        void copySelectionToClipboard(activeNet, selection, petriNetId);
        return;
      }

      if (key === "v") {
        event.preventDefault();
        if (isReadonly) {
          notifyReadOnly();
          return;
        }
        void pasteFromClipboard(applyClipboardPaste).then((newItemIds) => {
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
        for (const place of activeNet.places) {
          items.set(place.id, { type: "place", id: place.id });
        }
        for (const transition of activeNet.transitions) {
          items.set(transition.id, {
            type: "transition",
            id: transition.id,
          });
        }
        for (const instance of activeNet.componentInstances) {
          items.set(instance.id, {
            type: "componentInstance",
            id: instance.id,
          });
        }
        setSelection(items);
        return;
      }
    }

    if (isInputFocused) {
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && hasSelection) {
      event.preventDefault();
      if (isReadonly) {
        notifyReadOnly();
        return;
      }
      const input = { items: Array.from(selection.values()) };
      // What the host's rules refuse stays in the document, and selected.
      const refused = mutationRefusal("deleteItemsByIds", input) !== null;
      deleteItemsByIds(input);
      if (!refused) {
        clearSelection();
      }
      return;
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    switch (event.key.toLowerCase()) {
      // If escape is pressed, switch to cursor mode (keep current cursor)
      case "escape":
        event.preventDefault();
        clearSelection();
        setEditionMode("cursor");
        break;
      case "v":
        event.preventDefault();
        setCursorMode("select");
        setEditionMode("cursor");
        break;
      case "h":
        event.preventDefault();
        setCursorMode("pan");
        setEditionMode("cursor");
        break;
      case "n":
      case "t":
        // An editor that only composes has no place or transition to add.
        if (composesOnly) {
          break;
        }
        if (isReadonly) {
          event.preventDefault();
          notifyReadOnly();
        } else if (globalMode === "edit") {
          event.preventDefault();
          setEditionMode(
            event.key.toLowerCase() === "n" ? "add-place" : "add-transition",
          );
        }
        break;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
};
