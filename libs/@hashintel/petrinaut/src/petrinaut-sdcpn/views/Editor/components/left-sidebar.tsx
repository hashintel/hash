import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from "react-icons/tb";

import type { MenuItem } from "../../../components/menu";
import { FloatingTitle } from "./floating-title";
import { HamburgerMenu } from "./hamburger-menu";

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
  // Collapsed state: horizontal bar at top left
  if (!isOpen) {
    return (
      <div
        style={{
          position: "fixed",
          top: "24px",
          left: "24px",
          zIndex: 1000,
        }}
      >
        <RefractivePane
          radius={12}
          blur={7}
          specularOpacity={0.2}
          scaleRatio={1}
          bezelWidth={65}
          glassThickness={120}
          refractiveIndex={1.5}
          className={css({
            backgroundColor: "[rgba(255, 255, 255, 0.7)]",
            boxShadow: "0 3px 13px rgba(0, 0, 0, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
          })}
          style={{
            borderRadius: 12,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <HamburgerMenu menuItems={menuItems} />
          <FloatingTitle
            value={title}
            onChange={onTitleChange}
            placeholder="Process"
          />
          <button
            type="button"
            onClick={onToggle}
            aria-label="Open sidebar"
            className={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "spacing.2",
              borderRadius: "radius.2",
              cursor: "pointer",
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

        {/* Tools Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
              Tools
            </div>
            <div style={{ fontSize: 14, color: "#666" }}>
              Editor tools and options
            </div>
          </div>

          {/* Placeholder content - can be expanded later */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                Select Mode
              </div>
              <div style={{ fontSize: 14 }}>Click to select elements</div>
            </div>

            <div>
              <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                Add Place
              </div>
              <div style={{ fontSize: 14 }}>Create new places</div>
            </div>

            <div>
              <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                Add Transition
              </div>
              <div style={{ fontSize: 14 }}>Create new transitions</div>
            </div>
          </div>
        </div>
      </RefractivePane>
    </div>
  );
};
