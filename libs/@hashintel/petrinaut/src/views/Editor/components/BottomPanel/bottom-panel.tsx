import { css, cva } from "@hashintel/ds-helpers/css";
import { useCallback, useRef, useState } from "react";

import { useEditorStore } from "../../../../state/editor-provider";
import { DiagnosticsContent } from "./diagnostics-content";
import { ParametersContent } from "./parameters-content";
import { SimulationSettingsContent } from "./simulation-settings-content";

// Position offsets (accounting for sidebar padding/margins)
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const LEFT_SIDEBAR_WIDTH = 344; // 320px + 24px padding
const PANEL_MARGIN = 12;

type BottomPanelTab = "diagnostics" | "simulation-settings" | "parameters";

const panelContainerStyle = css({
  borderRadius: "[12px]",
  backgroundColor: "[rgba(255, 255, 255, 0.7)]",
  boxShadow: "[0 3px 13px rgba(0, 0, 0, 0.1)]",
  border: "[1px solid rgba(255, 255, 255, 0.8)]",
  backdropFilter: "[blur(12px)]",
  display: "flex",
  flexDirection: "column",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  borderBottom: "[1px solid rgba(0, 0, 0, 0.1)]",
  padding: "[4px 8px]",
  flexShrink: 0,
});

const tabButtonStyle = cva({
  base: {
    fontSize: "[12px]",
    fontWeight: "[500]",
    padding: "[6px 12px]",
    borderRadius: "[6px]",
    border: "none",
    cursor: "pointer",
    transition: "[all 0.15s ease]",
    background: "[transparent]",
  },
  variants: {
    active: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.08)]",
        color: "core.gray.90",
      },
      false: {
        color: "core.gray.60",
        _hover: {
          backgroundColor: "[rgba(0, 0, 0, 0.04)]",
          color: "core.gray.80",
        },
      },
    },
  },
});

const contentStyle = css({
  fontSize: "[12px]",
  padding: "[8px 16px]",
  flex: "[1]",
  overflowY: "auto",
});

const tabs: { id: BottomPanelTab; label: string }[] = [
  { id: "diagnostics", label: "Diagnostics" },
  { id: "parameters", label: "Global Parameters" },
  { id: "simulation-settings", label: "Simulation Settings" },
];

/**
 * BottomPanel shows tabs for Diagnostics, Simulation Settings, and Parameters.
 * Positioned at the bottom of the viewport.
 * When LeftSideBar is visible, positioned to its right. Otherwise full-width.
 * Resizable from the top edge.
 */
export const BottomPanel: React.FC = () => {
  const isOpen = useEditorStore((state) => state.isDiagnosticsPanelOpen);
  const isLeftSidebarOpen = useEditorStore((state) => state.isLeftSidebarOpen);
  const panelHeight = useEditorStore((state) => state.diagnosticsPanelHeight);
  const setDiagnosticsPanelHeight = useEditorStore(
    (state) => state.setDiagnosticsPanelHeight
  );

  const [activeTab, setActiveTab] = useState<BottomPanelTab>("diagnostics");

  // Resize handling
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(panelHeight);

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      resizeStartYRef.current = event.clientY;
      resizeStartHeightRef.current = panelHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        // Dragging up increases height (negative deltaY = increase)
        const deltaY = resizeStartYRef.current - moveEvent.clientY;
        const newHeight = Math.max(
          MIN_HEIGHT,
          Math.min(MAX_HEIGHT, resizeStartHeightRef.current + deltaY)
        );
        setDiagnosticsPanelHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight, setDiagnosticsPanelHeight]
  );

  if (!isOpen) {
    return null;
  }

  // Calculate left position based on left sidebar state
  const leftOffset = isLeftSidebarOpen ? LEFT_SIDEBAR_WIDTH : PANEL_MARGIN;

  const renderContent = () => {
    switch (activeTab) {
      case "diagnostics":
        return <DiagnosticsContent />;
      case "simulation-settings":
        return <SimulationSettingsContent />;
      case "parameters":
        return <ParametersContent />;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: PANEL_MARGIN,
        left: leftOffset,
        right: PANEL_MARGIN,
        height: panelHeight,
        zIndex: 999,
        padding: 4,
      }}
      className={panelContainerStyle}
    >
      {/* Resize handle at top */}
      <button
        type="button"
        aria-label="Resize panel"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            setDiagnosticsPanelHeight(Math.min(MAX_HEIGHT, panelHeight + 10));
          } else if (event.key === "ArrowDown") {
            setDiagnosticsPanelHeight(Math.max(MIN_HEIGHT, panelHeight - 10));
          }
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 9,
          cursor: "ns-resize",
          zIndex: 1001,
          background: "transparent",
          border: "none",
          padding: 0,
          borderRadius: "12px 12px 0 0",
        }}
      />

      {/* Tab Header */}
      <div className={headerStyle}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={tabButtonStyle({ active: activeTab === tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className={contentStyle}>{renderContent()}</div>
    </div>
  );
};
