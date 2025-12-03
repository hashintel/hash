import { css } from "@hashintel/ds-helpers/css";
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
import { ParametersSection } from "./parameters-section";
import { SimulationStateSection } from "./simulation-state-section";
import { TypesSection } from "./types-section";

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
  const globalMode = useEditorStore((state) => state.globalMode);
  const isOpen = useEditorStore((state) => state.isLeftSidebarOpen);
  const setLeftSidebarOpen = useEditorStore(
    (state) => state.setLeftSidebarOpen,
  );

  return (
    <div
      style={{
        position: "fixed",
        top: isOpen ? 0 : 12,
        left: isOpen ? 0 : 12,
        bottom: isOpen ? 0 : "auto",
        padding: 12,
        height: isOpen ? "100%" : "auto",
        zIndex: 1000,
        display: "flex",
      }}
    >
      <div
        className={css({
          borderRadius: "[16px]",
          height: isOpen ? "[100%]" : "auto",
          width: isOpen ? "[320px]" : "auto",
          backgroundColor: "[rgba(255, 255, 255, 0.7)]",
          boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          backdropFilter: "[blur(12px)]",
        })}
        style={{
          padding: isOpen ? 16 : "8px 12px",
          position: "relative",
          display: "flex",
          flexDirection: isOpen ? "column" : "row",
          gap: isOpen ? 16 : 8,
          alignItems: isOpen ? "stretch" : "center",
        }}
      >
        {/* Header with Menu, Title, and Toggle button */}
        <div
          style={{
            display: "flex",
            flexDirection: isOpen ? "column" : "row",
            gap: isOpen ? 12 : 8,
            paddingBottom: isOpen ? 12 : 0,
            borderBottom: isOpen ? "1px solid rgba(0, 0, 0, 0.1)" : "none",
            alignItems: isOpen ? "stretch" : "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <HamburgerMenu menuItems={menuItems} />
            <div
              style={{
                flex: isOpen ? 1 : "0 0 auto",
                minWidth: isOpen ? 0 : 120,
              }}
            >
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
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "spacing.1",
                background: "[rgba(255, 255, 255, 0.5)]",
                borderRadius: "radius.2",
                cursor: "pointer",
                flexShrink: 0,
                _hover: {
                  backgroundColor: "[rgba(255, 255, 255, 0.8)]",
                },
              })}
              style={{ width: 28, height: 28 }}
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
            {/* Simulation State Section - only in Simulate mode */}
            {globalMode === "simulate" && <SimulationStateSection />}

            {/* Types Section - only in Edit mode */}
            {globalMode === "edit" && <TypesSection />}

            {/* Differential Equations Section - only in Edit mode */}
            {globalMode === "edit" && <DifferentialEquationsSection />}

            {/* Parameters Section */}
            <ParametersSection />

            {/* Nodes Section */}
            <NodesSection />
          </>
        )}
      </div>
    </div>
  );
};
