import { css, cva } from "@hashintel/ds-helpers/css";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from "react-icons/tb";

import type { MenuItem } from "../../../../components/menu";
import { useEditorStore } from "../../../../state/editor-provider";
import { DifferentialEquationsSection } from "./differential-equations-section";
import { FloatingTitle } from "./floating-title";
import { HamburgerMenu } from "./hamburger-menu";
import { NodesSection } from "./nodes-section";
import { TypesSection } from "./types-section";

const outerContainerStyle = cva({
  base: {
    position: "fixed",
    padding: "[12px]",
    zIndex: 1000,
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
        top: "[12px]",
        left: "[12px]",
        bottom: "[auto]",
        height: "[auto]",
      },
    },
  },
});

const panelStyle = cva({
  base: {
    borderRadius: "[12px]",
    backgroundColor: "[rgba(255, 255, 255, 0.7)]",
    boxShadow: "[0 3px 13px rgba(0, 0, 0, 0.1)]",
    border: "[1px solid rgba(255, 255, 255, 0.8)]",
    backdropFilter: "[blur(12px)]",
    position: "relative",
    display: "flex",
  },
  variants: {
    isOpen: {
      true: {
        height: "[100%]",
        width: "[320px]",
        padding: "[16px]",
        flexDirection: "column",
        gap: "[16px]",
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

const toggleButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "spacing.1",
  background: "[rgba(255, 255, 255, 0.5)]",
  borderRadius: "radius.2",
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
 */
export const LeftSideBar: React.FC<LeftSideBarProps> = ({
  hideNetManagementControls,
  menuItems,
  title,
  onTitleChange,
}) => {
  const isOpen = useEditorStore((state) => state.isLeftSidebarOpen);
  const setLeftSidebarOpen = useEditorStore(
    (state) => state.setLeftSidebarOpen
  );

  return (
    <div className={outerContainerStyle({ isOpen })}>
      <div className={panelStyle({ isOpen })}>
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
          <>
            {/* Types Section - only in Edit mode */}
            <TypesSection />

            {/* Differential Equations Section - only in Edit mode */}
            <DifferentialEquationsSection />

            {/* Nodes Section */}
            <NodesSection />
          </>
        )}
      </div>
    </div>
  );
};
