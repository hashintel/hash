import { Menu, type MenuItem } from "@hashintel/ds-components";

import {
  type CursorMode,
  type EditorState,
} from "../../../../../react/state/editor-context";
import { ToolbarMenuTrigger } from "./toolbar-menu-trigger";

type EditorEditionMode = EditorState["editionMode"];

/** Picks between the select and pan cursors, and returns to cursor mode. */
export const CursorModeDropdown: React.FC<{
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
  cursorMode: CursorMode;
  onCursorModeChange: (mode: CursorMode) => void;
}> = ({ editionMode, onEditionModeChange, cursorMode, onCursorModeChange }) => {
  const handleCursorChange = (mode: CursorMode) => {
    onCursorModeChange(mode);
    onEditionModeChange("cursor");
  };

  const items: MenuItem[] = [
    {
      id: "select",
      icon: "cursor",
      text: "Select",
      suffix: "V",
      tone: cursorMode === "select" ? "brand" : "neutral",
      selected: cursorMode === "select",
      onClick: () => handleCursorChange("select"),
    },
    {
      id: "pan",
      icon: "hand",
      text: "Pan",
      suffix: "H",
      tone: cursorMode === "pan" ? "brand" : "neutral",
      selected: cursorMode === "pan",
      onClick: () => handleCursorChange("pan"),
    },
  ];

  return (
    <Menu
      trigger={
        <ToolbarMenuTrigger
          icon={cursorMode === "pan" ? "hand" : "cursor"}
          isActive={editionMode === "cursor"}
          ariaLabel="Cursor mode"
        />
      }
      items={items}
      position="top"
    />
  );
};
