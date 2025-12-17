import { css, cva } from "@hashintel/ds-helpers/css";
import { useState } from "react";

import { GlassPanel } from "../../../../components/glass-panel";
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

  if (!isOpen) {
    return null;
  }

  // Calculate left position based on left sidebar state
  const leftOffset = isLeftSidebarOpen ? LEFT_SIDEBAR_WIDTH : PANEL_MARGIN;

  function renderContent() {
    switch (activeTab) {
      case "diagnostics":
        return <DiagnosticsContent />;
      case "simulation-settings":
        return <SimulationSettingsContent />;
      case "parameters":
        return <ParametersContent />;
    }
  }

  return (
    <GlassPanel
      style={{
        position: "fixed",
        bottom: PANEL_MARGIN,
        left: leftOffset,
        right: PANEL_MARGIN,
        height: panelHeight,
        zIndex: 999,
        padding: 4,
      }}
      contentClassName={panelContainerStyle}
      resizable={{
        edge: "top",
        size: panelHeight,
        onResize: setDiagnosticsPanelHeight,
        minSize: MIN_HEIGHT,
        maxSize: MAX_HEIGHT,
      }}
    >
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
    </GlassPanel>
  );
};
