import { use } from "react";

import { useCommand } from "../../../react/commands/command-registry";
import { EditorContext } from "../../../react/state/editor-context";
import { UndoRedoContext } from "../../../react/state/undo-redo-context";
import { useEffectiveGlobalMode } from "../../../react/state/use-effective-global-mode";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";

/**
 * The editor's palette commands. A no-op unless the host mounted a
 * `CommandRegistryProvider`. The `shortcut` strings are display metadata;
 * the keyboard handler still binds the keys.
 */
function useEditorCommands(): void {
  const {
    setCursorMode,
    setEditionMode,
    setSearchOpen,
    toggleBottomPanel,
    isLeftSidebarOpen,
    setLeftSidebarOpen,
  } = use(EditorContext);
  const undoRedo = use(UndoRedoContext);
  const mode = useEffectiveGlobalMode();
  const isReadOnly = useIsReadOnly();
  const canEditNet = mode === "edit" && !isReadOnly;

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
    { when: canEditNet },
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
    label: isLeftSidebarOpen
      ? "Hide the left sidebar"
      : "Show the left sidebar",
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
}

/**
 * Declares the editor's commands from a null-rendering leaf, so the context
 * subscriptions behind them (undo/redo changes on every document mutation)
 * re-render this leaf and not the `EditorView` tree.
 */
export const EditorCommands: React.FC = () => {
  useEditorCommands();
  return null;
};
