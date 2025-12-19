import { css, cva } from "@hashintel/ds-helpers/css";
import { FaXmark } from "react-icons/fa6";

import { GlassPanel } from "../../../../components/glass-panel";
import {
  MAX_BOTTOM_PANEL_HEIGHT,
  MIN_BOTTOM_PANEL_HEIGHT,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { useEditorStore } from "../../../../state/editor-provider";
import type { BottomPanelTab } from "../../../../state/editor-store";
import { DiagnosticsContent } from "./diagnostics-content";
import { ParametersContent } from "./parameters-content";
import { SimulationSettingsContent } from "./simulation-settings-content";

const panelContainerStyle = css({
  display: "flex",
  flexDirection: "column",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "[2px]",
  flexShrink: 0,
});

const tabsContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
});

const closeButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[22px]",
  height: "[22px]",
  border: "none",
  borderRadius: "[5px]",
  background: "[transparent]",
  color: "core.gray.50",
  cursor: "pointer",
  transition: "[all 0.15s ease]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.08)]",
    color: "core.gray.80",
  },
});

const tabButtonStyle = cva({
  base: {
    fontSize: "[11px]",
    fontWeight: "[500]",
    padding: "[4px 10px]",
    textTransform: "uppercase",
    borderRadius: "[3px]",
    border: "none",
    cursor: "pointer",
    transition: "[all 0.3s ease]",
    background: "[transparent]",
  },
  variants: {
    active: {
      true: {
        opacity: "[1]",
        backgroundColor: "[rgba(0, 0, 0, 0.08)]",
        color: "core.gray.90",
      },
      false: {
        opacity: "[0.6]",
        color: "core.gray.60",
        _hover: {
          opacity: "[1]",
          backgroundColor: "[rgba(0, 0, 0, 0.04)]",
          color: "core.gray.80",
        },
      },
    },
  },
});

const contentStyle = css({
  fontSize: "[12px]",
  padding: "[12px 12px]",
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
  const isOpen = useEditorStore((state) => state.isBottomPanelOpen);
  const isLeftSidebarOpen = useEditorStore((state) => state.isLeftSidebarOpen);
  const leftSidebarWidth = useEditorStore((state) => state.leftSidebarWidth);
  const panelHeight = useEditorStore((state) => state.bottomPanelHeight);
  const setBottomPanelHeight = useEditorStore(
    (state) => state.setBottomPanelHeight,
  );
  const activeTab = useEditorStore((state) => state.activeBottomPanelTab);
  const setActiveTab = useEditorStore((state) => state.setActiveBottomPanelTab);
  const toggleBottomPanel = useEditorStore((state) => state.toggleBottomPanel);

  if (!isOpen) {
    return null;
  }

  // Calculate left position based on left sidebar state
  // Add sidebar padding (12px each side) when sidebar is open
  const leftOffset = isLeftSidebarOpen
    ? leftSidebarWidth + PANEL_MARGIN * 2
    : PANEL_MARGIN;

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
        onResize: setBottomPanelHeight,
        minSize: MIN_BOTTOM_PANEL_HEIGHT,
        maxSize: MAX_BOTTOM_PANEL_HEIGHT,
      }}
    >
      {/* Tab Header */}
      <div className={headerStyle}>
        <div className={tabsContainerStyle}>
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
        <button
          type="button"
          onClick={toggleBottomPanel}
          className={closeButtonStyle}
          aria-label="Close panel"
        >
          <FaXmark size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className={contentStyle}>{renderContent()}</div>
    </GlassPanel>
  );
};
