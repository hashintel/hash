import { Kbd, Menu, type MenuItem } from "@hashintel/ds-components";

import {
  type CursorMode,
  useEditorActions,
  useEditorFields,
} from "../../../../../react/state/editor-context";
import { ToolbarMenuTrigger } from "./toolbar-menu-trigger";

/** Picks between the select and pan cursors, and returns to cursor mode. */
export const CursorModeDropdown = () => {
  const { editionMode, cursorMode } = useEditorFields(
    "editionMode",
    "cursorMode",
  );
  const { setCursorMode, setEditionMode } = useEditorActions();
  const handleCursorChange = (mode: CursorMode) => {
    setCursorMode(mode);
    setEditionMode("cursor");
  };

  const items: MenuItem[] = [
    {
      id: "select",
      icon: "cursor",
      text: "Select",
      suffix: <Kbd keys="v" />,
      tone: cursorMode === "select" ? "brand" : "neutral",
      selected: cursorMode === "select",
      onClick: () => handleCursorChange("select"),
    },
    {
      id: "pan",
      icon: "hand",
      text: "Pan",
      suffix: <Kbd keys="h" />,
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
          aria-label="Cursor mode"
        />
      }
      items={items}
      position="top"
    />
  );
};
