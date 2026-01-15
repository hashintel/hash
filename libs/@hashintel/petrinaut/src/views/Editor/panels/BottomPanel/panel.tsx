import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useEffect, useRef } from "react";
import { FaXmark } from "react-icons/fa6";

import { GlassPanel } from "../../../../components/glass-panel";
import {
  HorizontalTabsContent,
  HorizontalTabsHeader,
  HorizontalTabsHeaderAction,
} from "../../../../components/sub-view/horizontal-tabs-container";
import {
  BOTTOM_PANEL_SUBVIEWS,
  MAX_BOTTOM_PANEL_HEIGHT,
  MIN_BOTTOM_PANEL_HEIGHT,
  PANEL_MARGIN,
  SIMULATION_ONLY_SUBVIEWS,
} from "../../../../constants/ui";
import { use } from "react";

import type { BottomPanelTab } from "../../../../state/editor-provider";
import { useEditorStore } from "../../../../state/editor-provider";
import { SimulationContext } from "../../../../state/simulation-provider";

const glassPanelBaseStyle = css({
  position: "fixed",
  zIndex: 999,
  padding: "[4px]",
});

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

const headerRightStyle = css({
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
  color: "gray.50",
  cursor: "pointer",
  transition: "[all 0.15s ease]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.08)]",
    color: "gray.80",
  },
});

/**
 * BottomPanel shows tabs for Diagnostics and Simulation Settings.
 * Positioned at the bottom of the viewport.
 * When LeftSideBar is visible, positioned to its right. Otherwise full-width.
 * Resizable from the top edge.
 */
export const BottomPanel: React.FC = () => {
  const isOpen = useEditorStore((state) => state.isBottomPanelOpen);
  const setBottomPanelOpen = useEditorStore(
    (state) => state.setBottomPanelOpen,
  );
  const isLeftSidebarOpen = useEditorStore((state) => state.isLeftSidebarOpen);
  const leftSidebarWidth = useEditorStore((state) => state.leftSidebarWidth);
  const panelHeight = useEditorStore((state) => state.bottomPanelHeight);
  const setBottomPanelHeight = useEditorStore(
    (state) => state.setBottomPanelHeight,
  );
  const activeTab = useEditorStore((state) => state.activeBottomPanelTab);
  const setActiveTab = useEditorStore((state) => state.setActiveBottomPanelTab);
  const toggleBottomPanel = useEditorStore((state) => state.toggleBottomPanel);

  // Simulation state for conditional subviews
  const { state: simulationState } = use(SimulationContext);
  const isSimulationActive =
    simulationState === "Running" ||
    simulationState === "Paused" ||
    simulationState === "Complete";

  // Track previous simulation state to detect when simulation starts
  const prevSimulationActiveRef = useRef(isSimulationActive);

  // Dynamically compute subviews based on simulation state
  const subViews = isSimulationActive
    ? [...BOTTOM_PANEL_SUBVIEWS, ...SIMULATION_ONLY_SUBVIEWS]
    : BOTTOM_PANEL_SUBVIEWS;

  // Automatically open bottom panel and switch to timeline when simulation starts,
  // and fall back to diagnostics when simulation stops
  useEffect(() => {
    const wasActive = prevSimulationActiveRef.current;
    prevSimulationActiveRef.current = isSimulationActive;

    // Simulation just started (transition from inactive to active)
    if (isSimulationActive && !wasActive) {
      setBottomPanelOpen(true);
      setActiveTab("simulation-timeline");
    }

    // Simulation just stopped (transition from active to inactive)
    // If the current tab is simulation-only, fall back to diagnostics
    if (
      !isSimulationActive &&
      wasActive &&
      activeTab === "simulation-timeline"
    ) {
      setActiveTab("diagnostics");
    }
  }, [isSimulationActive, setBottomPanelOpen, setActiveTab, activeTab]);

  // Handler for tab change that casts string to BottomPanelTab
  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId as BottomPanelTab);
    },
    [setActiveTab],
  );

  if (!isOpen) {
    return null;
  }

  // Calculate left position based on left sidebar state
  // Add sidebar padding (12px each side) when sidebar is open
  const leftOffset = isLeftSidebarOpen
    ? leftSidebarWidth + PANEL_MARGIN * 2
    : PANEL_MARGIN;

  return (
    <GlassPanel
      className={glassPanelBaseStyle}
      style={{
        bottom: PANEL_MARGIN,
        left: leftOffset,
        right: PANEL_MARGIN,
        height: panelHeight,
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
        <HorizontalTabsHeader
          subViews={subViews}
          activeTabId={activeTab}
          onTabChange={handleTabChange}
        />
        <div className={headerRightStyle}>
          <HorizontalTabsHeaderAction
            subViews={subViews}
            activeTabId={activeTab}
          />
          <button
            type="button"
            onClick={toggleBottomPanel}
            className={closeButtonStyle}
            aria-label="Close panel"
          >
            <FaXmark size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <HorizontalTabsContent subViews={subViews} activeTabId={activeTab} />
    </GlassPanel>
  );
};
