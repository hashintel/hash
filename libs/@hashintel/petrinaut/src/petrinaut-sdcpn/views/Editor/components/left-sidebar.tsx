import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import {
  FaChevronDown,
  FaChevronRight,
  FaCircle,
  FaSquare,
} from "react-icons/fa6";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from "react-icons/tb";

import type { MenuItem } from "../../../components/menu";
import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNStore } from "../../../state/sdcpn-provider";
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
  // Local state for collapsible layers section
  const [isLayersExpanded, setIsLayersExpanded] = useState(true);

  // Get SDCPN data
  const places = useSDCPNStore((state) => state.sdcpn.places);
  const transitions = useSDCPNStore((state) => state.sdcpn.transitions);

  // Get selection state
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);
  const setSelectedItemIds = useEditorStore(
    (state) => state.setSelectedItemIds,
  );
  const addSelectedItemId = useEditorStore((state) => state.addSelectedItemId);
  const removeSelectedItemId = useEditorStore(
    (state) => state.removeSelectedItemId,
  );

  const handleLayerClick = (
    id: string,
    event:
      | React.MouseEvent<HTMLDivElement>
      | React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const hasModifier =
      event.shiftKey ||
      ("metaKey" in event && event.metaKey) ||
      ("ctrlKey" in event && event.ctrlKey);

    if (hasModifier) {
      // Multi-select: toggle the item
      if (selectedItemIds.has(id)) {
        removeSelectedItemId(id);
      } else {
        addSelectedItemId(id);
      }
    } else {
      // Single select: replace selection
      setSelectedItemIds(new Set([id]));
    }
  };

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

        {/* Layers Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flex: 1,
            minHeight: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setIsLayersExpanded(!isLayersExpanded)}
            className={css({
              display: "flex",
              alignItems: "center",
              fontWeight: 600,
              fontSize: "[13px]",
              color: "[#333]",
              paddingBottom: "[4px]",
              cursor: "pointer",
              background: "[transparent]",
              border: "none",
              padding: "spacing.1",
              borderRadius: "radius.4",
              _hover: {
                backgroundColor: "[rgba(0, 0, 0, 0.05)]",
              },
            })}
            style={{ gap: 6 }}
          >
            {isLayersExpanded ? (
              <FaChevronDown size={10} />
            ) : (
              <FaChevronRight size={10} />
            )}
            Layers
          </button>

          {/* Layers List */}
          {isLayersExpanded && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                overflowY: "auto",
                flex: 1,
              }}
            >
              {/* Places */}
              {places.map((place) => {
                const isSelected = selectedItemIds.has(place.id);
                return (
                  <div
                    key={place.id}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => handleLayerClick(place.id, event)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleLayerClick(place.id, event);
                      }
                    }}
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "spacing.2",
                      padding: "spacing.2",
                      paddingX: "spacing.3",
                      borderRadius: "radius.4",
                      cursor: "default",
                      transition: "[all 0.15s ease]",
                      backgroundColor: isSelected
                        ? "core.blue.20"
                        : "[transparent]",
                      _hover: {
                        backgroundColor: isSelected
                          ? "core.blue.30"
                          : "[rgba(0, 0, 0, 0.05)]",
                      },
                    })}
                    style={{ padding: "4px 9px", gap: 6 }}
                  >
                    <FaCircle
                      size={12}
                      style={{
                        color: isSelected ? "#3b82f6" : "#9ca3af",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: isSelected ? "#1e40af" : "#374151",
                        fontWeight: isSelected ? 500 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {place.name || `Place ${place.id}`}
                    </span>
                  </div>
                );
              })}

              {/* Transitions */}
              {transitions.map((transition) => {
                const isSelected = selectedItemIds.has(transition.id);
                return (
                  <div
                    key={transition.id}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => handleLayerClick(transition.id, event)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleLayerClick(transition.id, event);
                      }
                    }}
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "spacing.2",
                      borderRadius: "radius.4",
                      cursor: "default",
                      transition: "[all 0.15s ease]",
                      backgroundColor: isSelected
                        ? "core.blue.20"
                        : "[transparent]",
                      _hover: {
                        backgroundColor: isSelected
                          ? "core.blue.30"
                          : "[rgba(0, 0, 0, 0.05)]",
                      },
                    })}
                    style={{ padding: "4px 9px", gap: 6 }}
                  >
                    <FaSquare
                      size={12}
                      style={{
                        color: isSelected ? "#3b82f6" : "#9ca3af",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: isSelected ? "#1e40af" : "#374151",
                        fontWeight: isSelected ? 500 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {transition.name || `Transition ${transition.id}`}
                    </span>
                  </div>
                );
              })}

              {/* Empty state */}
              {places.length === 0 && transitions.length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                    padding: "spacing.4",
                    textAlign: "center",
                  }}
                >
                  No layers yet
                </div>
              )}
            </div>
          )}
        </div>
      </RefractivePane>
    </div>
  );
};
