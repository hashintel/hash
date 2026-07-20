import { use, useEffect, useRef } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { ActualModeContext } from "../../../../../react/actual-mode-context";
import { SimulationContext } from "../../../../../react/simulation/context";
import {
  type BottomPanelTab,
  EditorContext,
} from "../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
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
  ACTUAL_BOTTOM_PANEL_SUBVIEWS,
  BOTTOM_PANEL_SUBVIEWS,
  SIMULATION_ONLY_SUBVIEWS,
} from "../../../../constants/ui-subviews";

const glassPanelBaseStyle = css({
  position: "absolute",
  zIndex: "[calc(var(--z-index-sticky) - 2)]",
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

/**
 * The header is a size container (its width is imposed by the panel, so
 * inline-size containment is safe): descendants use
 * `@container bottom-panel-header (…)` to adapt to the panel width rather
 * than the viewport.
 */
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "[8px]",
  padding: "[6px]",
  flexShrink: 0,
  containerType: "inline-size",
  containerName: "bottom-panel-header",
});

/**
 * High flex-shrink so the header actions give up slack before the tabs do:
 * in practice only the Timeline metric picker can shrink (down to its
 * min-width) — every other control bottoms out at its content size — after
 * which remaining deficit compresses the tabs.
 */
const headerRightStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  flexShrink: "[10]",
});

const getBottomPanelSubViews = ({
  isActualMode,
  isSimulationActive,
}: {
  isActualMode: boolean;
  isSimulationActive: boolean;
}) =>
  isActualMode
    ? ACTUAL_BOTTOM_PANEL_SUBVIEWS
    : [
        ...BOTTOM_PANEL_SUBVIEWS,
        ...(isSimulationActive ? SIMULATION_ONLY_SUBVIEWS : []),
      ];

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
    globalMode,
  } = use(EditorContext);

  // Simulation state for conditional subviews
  const { state: simulationState } = use(SimulationContext);
  const actualMode = use(ActualModeContext);
  const isActualMode = globalMode === "actual";
  const isSimulationActive =
    !isActualMode &&
    (simulationState === "Running" ||
      simulationState === "Paused" ||
      simulationState === "Complete");
  const isActualTimelineActive =
    isActualMode &&
    actualMode.available &&
    actualMode.initialState !== null &&
    (actualMode.status === "streaming" || actualMode.status === "complete");

  // Track previous run states to detect when a timeline becomes available.
  const prevSimulationActiveRef = useRef(false);
  const prevActualTimelineActiveRef = useRef(false);

  // Dynamically compute subviews based on available execution modes.
  const subViews = getBottomPanelSubViews({
    isActualMode,
    isSimulationActive,
  });

  // Automatically open bottom panel and switch to the relevant timeline when a
  // run starts, and fall back to diagnostics when the active timeline disappears.
  useEffect(() => {
    const wasSimulationActive = prevSimulationActiveRef.current;
    const wasActualTimelineActive = prevActualTimelineActiveRef.current;
    prevSimulationActiveRef.current = isSimulationActive;
    prevActualTimelineActiveRef.current = isActualTimelineActive;

    if (isActualTimelineActive && !wasActualTimelineActive) {
      setBottomPanelOpen(true);
      setActiveTab("actual-timeline");
    } else if (!isActualMode && isSimulationActive && !wasSimulationActive) {
      setBottomPanelOpen(true);
      setActiveTab("simulation-timeline");
    }

    if (
      !isSimulationActive &&
      wasSimulationActive &&
      activeTab === "simulation-timeline"
    ) {
      setActiveTab("diagnostics");
    }

    if (
      !isActualMode &&
      !isActualTimelineActive &&
      wasActualTimelineActive &&
      activeTab === "actual-timeline"
    ) {
      // Only fall back to diagnostics when leaving Actual mode entirely; while
      // still in Actual mode the timeline tab stays valid even without data.
      setActiveTab("diagnostics");
    }
  }, [
    activeTab,
    isActualMode,
    isActualTimelineActive,
    isSimulationActive,
    setActiveTab,
    setBottomPanelOpen,
  ]);

  useEffect(() => {
    const availableSubViews = getBottomPanelSubViews({
      isActualMode,
      isSimulationActive,
    });

    if (!availableSubViews.some((subView) => subView.id === activeTab)) {
      const fallbackTab = availableSubViews[0]?.id as
        | BottomPanelTab
        | undefined;

      if (fallbackTab) {
        setActiveTab(fallbackTab);
      }
    }
  }, [activeTab, isActualMode, isSimulationActive, setActiveTab]);

  const renderedActiveTab =
    subViews.find((subView) => subView.id === activeTab)?.id ??
    subViews[0]?.id ??
    activeTab;

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
          activeTabId={renderedActiveTab}
          onTabChange={handleTabChange}
        />
        <div className={headerRightStyle}>
          <HorizontalTabsHeaderAction
            subViews={subViews}
            activeTabId={renderedActiveTab}
          />
          {!isActualMode && (
            <Button
              size="xxs"
              variant="ghost"
              onClick={toggleBottomPanel}
              aria-label="Close panel"
              tooltip="Close panel"
              iconName="close"
            />
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <HorizontalTabsContent
        subViews={subViews}
        activeTabId={renderedActiveTab}
      />
    </GlassPanel>
  );
};
