import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef } from "react";
import { FaXmark } from "react-icons/fa6";

import { GlassPanel } from "../../../../components/glass-panel";
import { IconButton } from "../../../../components/icon-button";
import {
  HorizontalTabsContent,
  HorizontalTabsHeader,
  HorizontalTabsHeaderAction,
} from "../../../../components/sub-view/horizontal/horizontal-tabs-container";
import {
  MAX_BOTTOM_PANEL_HEIGHT,
  MIN_BOTTOM_PANEL_HEIGHT,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import {
  BOTTOM_PANEL_SUBVIEWS,
  SIMULATION_ONLY_SUBVIEWS,
} from "../../../../constants/ui-subviews";
import { SimulationContext } from "../../../../simulation/context";
import {
  type BottomPanelTab,
  EditorContext,
} from "../../../../state/editor-context";
import { UserSettingsContext } from "../../../../state/user-settings-context";

const glassPanelBaseStyle = css({
  position: "absolute",
  zIndex: 1001,
  borderTopWidth: "thin",
  boxSizing: "border-box",
});

const panelStyle = cva({
  base: {},
  variants: {
    open: {
      true: {},
      false: {
        transform: "translateY(100%)",
        pointerEvents: "none",
      },
    },
    animating: {
      true: {
        transition:
          "[width 150ms ease-in-out, opacity 150ms ease-in-out, height 150ms ease-in-out, top 150ms ease-in-out, left 150ms ease-in-out, right 150ms ease-in-out, bottom 150ms ease-in-out, transform 150ms ease-in-out]",
      },
    },
  },
});

const panelContainerStyle = css({
  display: "flex",
  flexDirection: "column",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "[6px]",
  flexShrink: 0,
});

const headerRightStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
});

/**
 * BottomPanel shows tabs for Diagnostics and Simulation Settings.
 * Positioned at the bottom of the viewport.
 * When LeftSideBar is visible, positioned to its right. Otherwise full-width.
 * Resizable from the top edge.
 */
export const BottomPanel: React.FC = () => {
  const {
    isBottomPanelOpen: isOpen,
    setBottomPanelOpen,
    isLeftSidebarOpen,
    isSearchOpen,
    leftSidebarWidth,
    bottomPanelHeight: panelHeight,
    setBottomPanelHeight,
    activeBottomPanelTab: activeTab,
    setActiveBottomPanelTab: setActiveTab,
    toggleBottomPanel,
    isPanelAnimating,
  } = use(EditorContext);

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

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId as BottomPanelTab);
  };

  // Calculate left position based on left sidebar visibility.
  // The sidebar is visible when explicitly opened OR when search is active.
  const isSidebarVisible = isLeftSidebarOpen || isSearchOpen;
  const leftOffset = isSidebarVisible
    ? leftSidebarWidth + PANEL_MARGIN * 2
    : PANEL_MARGIN;

  const { keepPanelsMounted } = use(UserSettingsContext);

  if (!isOpen && !isPanelAnimating && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelBaseStyle,
        panelStyle({ open: isOpen, animating: isPanelAnimating }),
      )}
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
          <IconButton
            size="xxs"
            variant="ghost"
            onClick={toggleBottomPanel}
            aria-label="Close panel"
          >
            <FaXmark size={14} />
          </IconButton>
        </div>
      </div>

      {/* Scrollable content */}
      <HorizontalTabsContent subViews={subViews} activeTabId={activeTab} />
    </GlassPanel>
  );
};
