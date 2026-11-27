import { use, useEffect, useEffectEvent } from "react";

import { useCommand } from "../../../react/commands/command-registry";
import { UndoRedoContext } from "../../../react/document/undo-redo-context";
import { useComposesOnly } from "../../../react/document/use-composes-only";
import { useIsReadOnly } from "../../../react/editing/use-is-read-only";
import {
  useEditorActions,
  useEditorFields,
} from "../../../react/state/editor-context";
import {
  autoLayoutShortcut,
  useAutoLayoutAndFrame,
} from "./shared/use-auto-layout-and-frame";
import { useCreateEmptyNet } from "./shared/use-create-empty-net";

interface EditorCommandsProps {
  /** Whether the editor, and not its host, starts a net. */
  canStartNet: boolean;
  onToggleAiAssistant?: () => void;
}

/**
 * The editor's palette commands. The `shortcut` strings are display metadata;
 * the keyboard handler still binds the keys.
 */
const useEditorCommands = ({
  canStartNet,
  onToggleAiAssistant,
}: EditorCommandsProps): void => {
  const { globalMode, editViewMode, isLeftSidebarOpen } = useEditorFields(
    "globalMode",
    "editViewMode",
    "isLeftSidebarOpen",
  );
  const {
    setCursorMode,
    setEditionMode,
    setSearchOpen,
    toggleBottomPanel,
    setLeftSidebarOpen,
  } = useEditorActions();
  const undoRedo = use(UndoRedoContext);
  const createEmptyNet = useCreateEmptyNet();
  const autoLayoutAndFrame = useAutoLayoutAndFrame();
  const isReadOnly = useIsReadOnly();
  const canEditNet =
    globalMode === "edit" && editViewMode === "canvas" && !isReadOnly;
  const composesOnly = useComposesOnly();
  const canDrawNet = canEditNet && !composesOnly;
  const runAutoLayout = () => {
    void autoLayoutAndFrame();
  };

  useCommand(
    {
      id: "petrinaut.ai-assistant.toggle",
      label: "Toggle AI assistant",
      category: "Editor",
      keywords: ["chat", "focus", "panel", "open", "close"],
      shortcut: "mod+shift+k",
      run: () => onToggleAiAssistant?.(),
    },
    { when: onToggleAiAssistant !== undefined },
  );

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      onToggleAiAssistant &&
      !event.defaultPrevented &&
      !event.isComposing &&
      !event.repeat &&
      !event.altKey &&
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "k"
    ) {
      event.preventDefault();
      event.stopPropagation();
      onToggleAiAssistant();
      return;
    }

    const target = event.target;
    const isEditingText =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest(
          'input, textarea, [contenteditable]:not([contenteditable="false"]), .monaco-editor, #sentry-feedback, [role="dialog"]',
        ) !== null);
    if (
      canEditNet &&
      !isEditingText &&
      !event.defaultPrevented &&
      !event.isComposing &&
      !event.repeat &&
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "l"
    ) {
      event.preventDefault();
      event.stopPropagation();
      runAutoLayout();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  // Listed whenever the document handle provides history; like the
  // shortcut, they no-op on empty history.
  useCommand(
    {
      id: "petrinaut.edit.undo",
      label: "Undo",
      category: "Edit",
      shortcut: "mod+z",
      run: () => undoRedo?.undo(),
    },
    { when: undoRedo !== null },
  );
  useCommand(
    {
      id: "petrinaut.edit.redo",
      label: "Redo",
      category: "Edit",
      shortcut: "mod+shift+z",
      run: () => undoRedo?.redo(),
    },
    { when: undoRedo !== null },
  );

  useCommand({
    id: "petrinaut.tool.select",
    label: "Switch to the Select tool",
    category: "Canvas",
    keywords: ["cursor", "pointer"],
    shortcut: "v",
    run: () => {
      setCursorMode("select");
      setEditionMode("cursor");
    },
  });
  useCommand({
    id: "petrinaut.tool.pan",
    label: "Switch to the Pan tool",
    category: "Canvas",
    keywords: ["hand", "move"],
    shortcut: "h",
    run: () => {
      setCursorMode("pan");
      setEditionMode("cursor");
    },
  });
  useCommand(
    {
      id: "petrinaut.tool.add-place",
      label: "Add a place",
      category: "Canvas",
      keywords: ["node", "create"],
      shortcut: "n",
      run: () => setEditionMode("add-place"),
    },
    { when: canDrawNet },
  );
  useCommand(
    {
      id: "petrinaut.tool.add-transition",
      label: "Add a transition",
      category: "Canvas",
      keywords: ["node", "create"],
      shortcut: "t",
      run: () => setEditionMode("add-transition"),
    },
    { when: canDrawNet },
  );
  useCommand(
    {
      id: "petrinaut.net.new",
      label: "Start a blank net",
      category: "Net",
      keywords: ["new", "file", "empty"],
      run: createEmptyNet,
    },
    { when: canStartNet },
  );
  useCommand(
    {
      id: "petrinaut.net.auto-layout",
      label: "Auto-layout the net",
      category: "Net",
      keywords: ["arrange", "tidy", "layout"],
      shortcut: autoLayoutShortcut,
      run: runAutoLayout,
    },
    { when: canEditNet },
  );

  useCommand({
    id: "petrinaut.search.open",
    label: "Search the net",
    category: "Editor",
    keywords: ["find"],
    shortcut: "mod+f",
    run: () => setSearchOpen(true),
  });
  useCommand({
    id: "petrinaut.left-sidebar.toggle",
    label: "Toggle the left sidebar",
    category: "Editor",
    keywords: ["panel"],
    run: () => setLeftSidebarOpen(!isLeftSidebarOpen),
  });
  useCommand({
    id: "petrinaut.bottom-panel.toggle",
    label: "Toggle the bottom panel",
    category: "Editor",
    keywords: ["timeline", "settings"],
    run: () => toggleBottomPanel(),
  });
};

/**
 * Declares the editor's commands from a null-rendering leaf, so the context
 * subscriptions behind them (undo/redo, the active net and the host's net
 * management change on every document mutation) re-render this leaf and not
 * the `EditorView` tree.
 */
export const EditorCommands = (props: EditorCommandsProps) => {
  useEditorCommands(props);
  return null;
};
