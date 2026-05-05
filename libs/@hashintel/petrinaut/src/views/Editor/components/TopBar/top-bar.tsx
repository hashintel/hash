import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { FaBars } from "react-icons/fa6";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from "react-icons/tb";

import { IconButton } from "../../../../components/icon-button";
import { Menu, type MenuItem } from "../../../../components/menu";
import {
  EditorContext,
  type EditorState,
} from "../../../../state/editor-context";
import { UndoRedoContext } from "../../../../state/undo-redo-context";
import { FloatingTitle } from "./floating-title";
import { ModeSelector } from "./mode-selector";
import { VersionHistoryButton } from "./version-history-button";

const topBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[12px]",
  height: "16",
  boxSizing: "border-box",
  padding: "[16px]",
  backgroundColor: "neutral.s00",
  outlineWidth: "[1px]",
  outlineStyle: "solid",
  outlineColor: "neutral.s40",
  flexShrink: 0,
  zIndex: 999,
});

const leftSectionStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  flex: "[1 0 0]",
  minWidth: "[0]",
});

const rightSectionStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  flex: "[1 0 0]",
  justifyContent: "flex-end",
  minWidth: "[0]",
});

interface TopBarProps {
  menuItems: MenuItem[];
  title: string;
  onTitleChange: (value: string) => void;
  hideNetManagementControls: boolean;
  mode: EditorState["globalMode"];
  onModeChange: (mode: EditorState["globalMode"]) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  menuItems,
  title,
  onTitleChange,
  hideNetManagementControls,
  mode,
  onModeChange,
}) => {
  const { isLeftSidebarOpen, setLeftSidebarOpen, setSearchOpen } =
    use(EditorContext);
  const undoRedo = use(UndoRedoContext);

  return (
    <div className={topBarStyle}>
      <div className={leftSectionStyle}>
        <IconButton
          size="xs"
          variant="ghost"
          onClick={() => {
            setLeftSidebarOpen(!isLeftSidebarOpen);
            if (isLeftSidebarOpen) {
              setSearchOpen(false);
            }
          }}
          aria-label={isLeftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isLeftSidebarOpen ? (
            <TbLayoutSidebarLeftCollapse size={16} />
          ) : (
            <TbLayoutSidebarRightCollapse size={16} />
          )}
        </IconButton>

        <Menu
          trigger={
            <IconButton aria-label="Menu" size="sm" variant="ghost">
              <FaBars />
            </IconButton>
          }
          items={menuItems}
          animated
        />

        {!hideNetManagementControls && (
          <FloatingTitle
            value={title}
            onChange={onTitleChange}
            placeholder="Process"
          />
        )}
      </div>

      {/* Center section - mode switcher */}
      <ModeSelector mode={mode} onChange={onModeChange} />

      <div className={rightSectionStyle}>
        {undoRedo && <VersionHistoryButton />}
      </div>
    </div>
  );
};
