import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from "react-icons/tb";

import type { MenuItem } from "../../../../components/menu";
import { EditorContext } from "../../../../state/editor-context";
import { FloatingTitle } from "../../panels/LeftSideBar/floating-title";
import { HamburgerMenu } from "../../panels/LeftSideBar/hamburger-menu";

const topBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[12px]",
  padding: "[16px]",
  backgroundColor: "[white]",
  borderBottomWidth: "thin",
  borderColor: "neutral.s40",
  flexShrink: 0,
  zIndex: 1003,
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

const sidebarToggleStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  border: "[1px solid]",
  borderColor: "neutral.s40",
  borderRadius: "[6px]",
  backgroundColor: "[white]",
  cursor: "pointer",
  flexShrink: 0,
  _hover: {
    backgroundColor: "neutral.s10",
  },
});

interface TopBarProps {
  menuItems: MenuItem[];
  title: string;
  onTitleChange: (value: string) => void;
  hideNetManagementControls: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  menuItems,
  title,
  onTitleChange,
  hideNetManagementControls,
}) => {
  const { isLeftSidebarOpen, setLeftSidebarOpen } = use(EditorContext);

  return (
    <div className={topBarStyle}>
      <div className={leftSectionStyle}>
        <button
          type="button"
          onClick={() => setLeftSidebarOpen(!isLeftSidebarOpen)}
          aria-label={isLeftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className={sidebarToggleStyle}
        >
          {isLeftSidebarOpen ? (
            <TbLayoutSidebarLeftCollapse size={16} />
          ) : (
            <TbLayoutSidebarRightCollapse size={16} />
          )}
        </button>
        <HamburgerMenu menuItems={menuItems} />
        {!hideNetManagementControls && (
          <FloatingTitle
            value={title}
            onChange={onTitleChange}
            placeholder="Process"
          />
        )}
      </div>

      {/* Center section - mode switcher (placeholder for now) */}
      <div />

      <div className={rightSectionStyle}>
        {/* Right section - version info, save button, etc. (placeholder for now) */}
      </div>
    </div>
  );
};
