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
import { v4 as uuidv4 } from "uuid";

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
  // Local state for collapsible sections
  const [isNodesExpanded, setIsNodesExpanded] = useState(true);
  const [isTypesExpanded, setIsTypesExpanded] = useState(true);
  const [isDifferentialEquationsExpanded, setIsDifferentialEquationsExpanded] =
    useState(true);
  const [isParametersExpanded, setIsParametersExpanded] = useState(true);

  // Get SDCPN data
  const places = useSDCPNStore((state) => state.sdcpn.places);
  const transitions = useSDCPNStore((state) => state.sdcpn.transitions);
  const types = useSDCPNStore((state) => state.sdcpn.types);
  const differentialEquations = useSDCPNStore(
    (state) => state.sdcpn.differentialEquations
  );
  const parameters = useSDCPNStore((state) => state.sdcpn.parameters);

  // Store actions
  const addType = useSDCPNStore((state) => state.addType);
  const removeType = useSDCPNStore((state) => state.removeType);
  const addDifferentialEquation = useSDCPNStore(
    (state) => state.addDifferentialEquation
  );
  const removeDifferentialEquation = useSDCPNStore(
    (state) => state.removeDifferentialEquation
  );
  const addParameter = useSDCPNStore((state) => state.addParameter);
  const removeParameter = useSDCPNStore((state) => state.removeParameter);

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

        {/* Types Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingBottom: 16,
            borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={() => setIsTypesExpanded(!isTypesExpanded)}
              className={css({
                display: "flex",
                alignItems: "center",
                fontWeight: 600,
                fontSize: "[13px]",
                color: "[#333]",
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
              {isTypesExpanded ? (
                <FaChevronDown size={10} />
              ) : (
                <FaChevronRight size={10} />
              )}
              Types
            </button>
            <button
              type="button"
              onClick={() => {
                const newType = {
                  id: `type__${Date.now()}`,
                  name: "New Type",
                  iconId: "circle",
                  colorCode: "#3b82f6",
                  elements: [],
                };
                addType(newType);
              }}
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "spacing.1",
                borderRadius: "radius.2",
                cursor: "pointer",
                fontSize: "[18px]",
                color: "core.gray.60",
                _hover: {
                  backgroundColor: "[rgba(0, 0, 0, 0.05)]",
                  color: "core.gray.90",
                },
              })}
              style={{ width: 24, height: 24 }}
              aria-label="Add type"
            >
              +
            </button>
          </div>

          {isTypesExpanded && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {types.map((type) => (
                <div
                  key={type.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 9px",
                    borderRadius: 4,
                    backgroundColor: "transparent",
                  }}
                  className={css({
                    _hover: {
                      backgroundColor: "[rgba(0, 0, 0, 0.05)]",
                    },
                  })}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      backgroundColor: type.colorCode,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: "#374151",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {type.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete type "${type.name}"? All places using this type will have their type set to null.`,
                        )
                      ) {
                        removeType(type.id);
                      }
                    }}
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "spacing.1",
                      borderRadius: "radius.2",
                      cursor: "pointer",
                      fontSize: "[14px]",
                      color: "core.gray.50",
                      _hover: {
                        backgroundColor: "[rgba(255, 0, 0, 0.1)]",
                        color: "[#ef4444]",
                      },
                    })}
                    style={{ width: 20, height: 20 }}
                    aria-label={`Delete ${type.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {types.length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                    padding: "spacing.4",
                    textAlign: "center",
                  }}
                >
                  No types yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Differential Equations Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setIsDifferentialEquationsExpanded(
                  !isDifferentialEquationsExpanded
                )
              }
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
              {isDifferentialEquationsExpanded ? (
                <FaChevronDown size={10} />
              ) : (
                <FaChevronRight size={10} />
              )}
              Differential Equations
            </button>
            <button
              type="button"
              onClick={() => {
                const name = `Equation ${differentialEquations.length + 1}`;
                addDifferentialEquation({
                  id: uuidv4(),
                  name,
                  typeId: types.length > 0 ? types[0]!.id : "",
                  code: `// dx/dt = ...\nreturn 0;`,
                });
              }}
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "spacing.1",
                borderRadius: "radius.2",
                cursor: "pointer",
                fontSize: "[14px]",
                color: "core.gray.50",
                background: "[transparent]",
                border: "none",
                _hover: {
                  backgroundColor: "[rgba(59, 130, 246, 0.1)]",
                  color: "[#3b82f6]",
                },
              })}
              style={{ width: 20, height: 20 }}
              aria-label="Add differential equation"
            >
              +
            </button>
          </div>
          {isDifferentialEquationsExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {differentialEquations.map((eq) => (
                <div
                  key={eq.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    fontSize: 13,
                    borderRadius: 4,
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{eq.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete equation "${eq.name}"? Any places referencing this equation will have their differential equation reset.`,
                        )
                      ) {
                        removeDifferentialEquation(eq.id);
                      }
                    }}
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "spacing.1",
                      borderRadius: "radius.2",
                      cursor: "pointer",
                      fontSize: "[14px]",
                      color: "core.gray.50",
                      _hover: {
                        backgroundColor: "[rgba(255, 0, 0, 0.1)]",
                        color: "[#ef4444]",
                      },
                    })}
                    style={{ width: 20, height: 20 }}
                    aria-label={`Delete ${eq.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {differentialEquations.length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                    padding: "spacing.4",
                    textAlign: "center",
                  }}
                >
                  No differential equations yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Parameters Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={() => setIsParametersExpanded(!isParametersExpanded)}
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
              {isParametersExpanded ? (
                <FaChevronDown size={10} />
              ) : (
                <FaChevronRight size={10} />
              )}
              Parameters
            </button>
            <button
              type="button"
              onClick={() => {
                const name = `param${parameters.length + 1}`;
                addParameter({
                  id: uuidv4(),
                  name: `Parameter ${parameters.length + 1}`,
                  variableName: name,
                  type: "real",
                  defaultValue: "0",
                });
              }}
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "spacing.1",
                borderRadius: "radius.2",
                cursor: "pointer",
                fontSize: "[14px]",
                color: "core.gray.50",
                background: "[transparent]",
                border: "none",
                _hover: {
                  backgroundColor: "[rgba(59, 130, 246, 0.1)]",
                  color: "[#3b82f6]",
                },
              })}
              style={{ width: 20, height: 20 }}
              aria-label="Add parameter"
            >
              +
            </button>
          </div>
          {isParametersExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {parameters.map((param) => (
                <div
                  key={param.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    fontSize: 13,
                    borderRadius: 4,
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>
                      {param.name} ({param.variableName})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(`Delete parameter "${param.name}"?`)
                      ) {
                        removeParameter(param.id);
                      }
                    }}
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "spacing.1",
                      borderRadius: "radius.2",
                      cursor: "pointer",
                      fontSize: "[14px]",
                      color: "core.gray.50",
                      _hover: {
                        backgroundColor: "[rgba(255, 0, 0, 0.1)]",
                        color: "[#ef4444]",
                      },
                    })}
                    style={{ width: 20, height: 20 }}
                    aria-label={`Delete ${param.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {parameters.length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                    padding: "spacing.4",
                    textAlign: "center",
                  }}
                >
                  No parameters yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nodes Section */}
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
            onClick={() => setIsNodesExpanded(!isNodesExpanded)}
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
            {isNodesExpanded ? (
              <FaChevronDown size={10} />
            ) : (
              <FaChevronRight size={10} />
            )}
            Nodes
          </button>

          {/* Nodes List */}
          {isNodesExpanded && (
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
                  No nodes yet
                </div>
              )}
            </div>
          )}
        </div>
      </RefractivePane>
    </div>
  );
};
