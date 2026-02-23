import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from "react-icons/tb";

import { GlassPanel } from "../../../../components/glass-panel";
import type { MenuItem } from "../../../../components/menu";
import { ProportionalSubViewsContainer } from "../../../../components/sub-view/vertical-sub-views-container";
import {
  LEFT_SIDEBAR_SUBVIEWS,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { EditorContext } from "../../../../state/editor-context";
import { FloatingTitle } from "./floating-title";
import { HamburgerMenu } from "./hamburger-menu";

const outerContainerStyle = cva({
  base: {
    position: "absolute",
    zIndex: 1002,
    display: "flex",
  },
  variants: {
    isOpen: {
      true: {
        top: "[0]",
        left: "[0]",
        bottom: "[0]",
        height: "[100%]",
      },
      false: {
        bottom: "[auto]",
        height: "[auto]",
      },
    },
  },
});

const panelContentStyle = cva({
  base: {
    display: "flex",
  },
  variants: {
    isOpen: {
      true: {
        height: "[100%]",
        padding: "[16px]",
        paddingBottom: "[0]",
        flexDirection: "column",
        gap: "[4px]",
        alignItems: "stretch",
      },
      false: {
        height: "auto",
        width: "auto",
        padding: "[8px 12px]",
        flexDirection: "row",
        gap: "[8px]",
        alignItems: "center",
      },
    },
  },
});

const headerStyle = cva({
  base: {
    display: "flex",
  },
  variants: {
    isOpen: {
      true: {
        flexDirection: "column",
        gap: "[12px]",
        paddingBottom: "[12px]",
        marginBottom: "[12px]",
        borderBottom: "[1px solid rgba(0, 0, 0, 0.1)]",
        alignItems: "stretch",
      },
      false: {
        flexDirection: "row",
        gap: "[8px]",
        paddingBottom: "[0]",
        borderBottom: "none",
        alignItems: "center",
      },
    },
  },
});

const headerInnerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const titleContainerStyle = cva({
  base: {},
  variants: {
    isOpen: {
      true: {
        flex: "[1]",
        minWidth: "[0]",
      },
      false: {
        flex: "[0 0 auto]",
        minWidth: "[120px]",
      },
    },
  },
});

const glassPanelBaseStyle = cva({
  base: {},
  variants: {
    isOpen: {
      true: {
        borderRightWidth: "thin",
      },
      false: {
        borderWidth: "thin",
      },
    },
  },
});

const toggleButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1",
  background: "[rgba(255, 255, 255, 0.5)]",
  borderRadius: "sm",
  cursor: "pointer",
  flexShrink: 0,
  width: "[28px]",
  height: "[28px]",
  _hover: {
    backgroundColor: "[rgba(255, 255, 255, 0.8)]",
  },
});

interface LeftSideBarProps {
  hideNetManagementControls: boolean;
  menuItems: MenuItem[];
  title: string;
  onTitleChange: (value: string) => void;
}

/**
 * LeftSideBar displays the menu, title, and tools.
 * When collapsed: shows a horizontal bar with menu, title, and toggle button.
 * When open: shows the full sidebar with tools and content.
 * Resizable from the right edge when open.
 */
export const LeftSideBar: React.FC<LeftSideBarProps> = ({
  hideNetManagementControls,
  menuItems,
  title,
  onTitleChange,
}) => {
  const {
    isLeftSidebarOpen: isOpen,
    setLeftSidebarOpen,
    leftSidebarWidth,
    setLeftSidebarWidth,
  } = use(EditorContext);

  return (
    <div
      className={outerContainerStyle({ isOpen })}
      style={{
        padding: PANEL_MARGIN,
        ...(isOpen ? {} : { top: PANEL_MARGIN, left: PANEL_MARGIN }),
      }}
    >
      <GlassPanel
        className={glassPanelBaseStyle({ isOpen })}
        style={isOpen ? { width: leftSidebarWidth } : undefined}
        contentClassName={panelContentStyle({ isOpen })}
        resizable={
          isOpen
            ? {
                edge: "right",
                size: leftSidebarWidth,
                onResize: setLeftSidebarWidth,
                minSize: MIN_LEFT_SIDEBAR_WIDTH,
                maxSize: MAX_LEFT_SIDEBAR_WIDTH,
              }
            : undefined
        }
      >
        {/* Header with Menu, Title, and Toggle button */}
        <div className={headerStyle({ isOpen })}>
          <div className={headerInnerStyle}>
            <HamburgerMenu menuItems={menuItems} />
            <div className={titleContainerStyle({ isOpen })}>
              {!hideNetManagementControls && (
                <FloatingTitle
                  value={title}
                  onChange={onTitleChange}
                  placeholder="Process"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(!isOpen)}
              aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
              className={toggleButtonStyle}
            >
              {isOpen ? (
                <TbLayoutSidebarLeftCollapse size={18} />
              ) : (
                <TbLayoutSidebarRightCollapse size={18} />
              )}
            </button>
          </div>
        </div>

        {/* Content sections - only visible when open */}
        {isOpen && (
          <ProportionalSubViewsContainer subViews={LEFT_SIDEBAR_SUBVIEWS} />
        )}
      </GlassPanel>
    </div>
  );
};
