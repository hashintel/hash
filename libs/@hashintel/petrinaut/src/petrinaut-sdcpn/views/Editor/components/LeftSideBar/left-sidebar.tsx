import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
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
  isOpen: boolean;
  onToggle: () => void;
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
  isOpen,
  onToggle,
  menuItems,
  title,
  onTitleChange,
}) => {
  const globalMode = useEditorStore((state) => state.globalMode);

  // Collapsed state: horizontal bar at top left
  if (!isOpen) {
    return (
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 1000,
        }}
      >
        <RefractivePane
          radius={16}
          blur={7}
          specularOpacity={0.2}
          scaleRatio={1}
          bezelWidth={65}
          glassThickness={120}
          refractiveIndex={1.5}
          className={css({
            backgroundColor: "[rgba(255, 255, 255, 0.7)]",
            boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
          })}
          style={{
            borderRadius: 16,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <HamburgerMenu menuItems={menuItems} />
          <div style={{ minWidth: 120 }}>
            <FloatingTitle
              value={title}
              onChange={onTitleChange}
              placeholder="Process"
            />
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
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
            <TbLayoutSidebarRightCollapse size={18} />
          </button>
        </RefractivePane>
      </div>
    );
  }

  // Open state: full sidebar
  return (
    <div
      style={{
        display: "flex",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        padding: "12px",
        height: "100%",
        zIndex: 1000,
      }}
    >
      <RefractivePane
        radius={16}
        blur={7}
        specularOpacity={0.2}
        scaleRatio={1}
        bezelWidth={65}
        glassThickness={120}
        refractiveIndex={1.5}
        className={css({
          height: "[100%]",
          width: "[320px]",
          backgroundColor: "[rgba(255, 255, 255, 0.7)]",
          boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
        })}
        style={{
          borderRadius: 16,
          padding: 16,
          overflowY: "auto",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header with Menu, Title, and Collapse button */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingBottom: 12,
            borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
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
            <div style={{ flex: 1 }}>
              <FloatingTitle
                value={title}
                onChange={onTitleChange}
                placeholder="Process"
              />
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
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
              <TbLayoutSidebarLeftCollapse size={18} />
            </button>
          </div>
        </div>

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
      </RefractivePane>
    </div>
  );
};
