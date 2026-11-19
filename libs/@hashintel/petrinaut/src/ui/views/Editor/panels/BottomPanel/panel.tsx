import { use, useEffect, useRef } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { ActualModeContext } from "../../../../../react/actual-mode-context";
import { SimulationContext } from "../../../../../react/simulation/context";
import {
  type BottomPanelTab,
  EditorContext,
} from "../../../../../react/state/editor-context";
import { useIsPanelAnimating } from "../../../../../react/state/panel-animation-context";
import { usePanelSizes } from "../../../../../react/state/panel-sizes-context";
import { useComposesOnly } from "../../../../../react/state/use-composes-only";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
import {
  HorizontalTabPanel,
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
  COMPILATION_SUBVIEWS,
  SIMULATION_ONLY_SUBVIEWS,
} from "../../../../constants/ui-subviews";
import { styleRef } from "../../../../lib/readings";
import { usePluginBottomPanelViews } from "../../../../plugins/plugin-outlets";
import { fallbackBottomPanelTab } from "./fallback-tab";
import { diagnosticsSubView } from "./subviews/diagnostics";

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
        // One `transition`, not the three properties it stands for: Panda
        // writes each of those with a custom property beside it, which every
        // element in the panel inherits. Switching this variant on or off
        // then restyles the whole panel.
        transition:
          "[width 150ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), height 150ms cubic-bezier(0.16, 1, 0.3, 1), top 150ms cubic-bezier(0.16, 1, 0.3, 1), left 150ms cubic-bezier(0.16, 1, 0.3, 1), right 150ms cubic-bezier(0.16, 1, 0.3, 1), bottom 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)]",
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
  composesOnly,
  isActualMode,
  isSimulationActive,
  showCompilationOutput,
}: {
  composesOnly: boolean;
  isActualMode: boolean;
  isSimulationActive: boolean;
  showCompilationOutput: boolean;
}) =>
  // An editor that only composes has problems to show and nothing to run.
  composesOnly
    ? [diagnosticsSubView]
    : isActualMode
      ? ACTUAL_BOTTOM_PANEL_SUBVIEWS
      : [
          ...BOTTOM_PANEL_SUBVIEWS,
          ...(isSimulationActive ? SIMULATION_ONLY_SUBVIEWS : []),
          ...(showCompilationOutput ? COMPILATION_SUBVIEWS : []),
        ];

/**
 * BottomPanel shows tabs for Diagnostics and Simulation Settings, then the
 * tabs plugins add.
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
    activeBottomPanelTab: activeTab,
    setActiveBottomPanelTab: setActiveTab,
    toggleBottomPanel,
    globalMode,
  } = use(EditorContext);
  const isPanelAnimating = useIsPanelAnimating();

  const {
    keepPanelsMounted,
    showCompilationOutput,
    setBottomPanelHeight: saveHeight,
  } = use(UserSettingsContext);
  const composesOnly = useComposesOnly();

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
    composesOnly,
    isActualMode,
    isSimulationActive,
    showCompilationOutput,
  });
  const pluginViews = usePluginBottomPanelViews();
  const tabs = [...subViews, ...pluginViews];

  // The tab drawn is already the fallback on the render that loses the
  // active one; an effect below then stores it.
  const renderedActiveTab =
    fallbackBottomPanelTab(
      activeTab,
      tabs.map((tab) => tab.id as BottomPanelTab),
    ) ?? activeTab;
  const activePluginView = pluginViews.find(
    (view) => view.id === renderedActiveTab,
  );

  // Automatically open bottom panel and switch to the relevant timeline when a
  // run starts. The effect below stores the tab shown when one disappears.
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
    if (renderedActiveTab !== activeTab) {
      setActiveTab(renderedActiveTab);
    }
  }, [activeTab, renderedActiveTab, setActiveTab]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId as BottomPanelTab);
  };

  // Calculate left position based on left sidebar visibility.
  // The sidebar is visible when explicitly opened OR when search is active.
  const isSidebarVisible = isLeftSidebarOpen || isSearchOpen;
  const { leftSidebarWidth, bottomPanelHeight } = usePanelSizes();

  if (!isOpen && !isPanelAnimating && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelBaseStyle,
        panelStyle({ open: isOpen, animating: isPanelAnimating }),
      )}
      ref={styleRef({
        left: () =>
          isSidebarVisible
            ? leftSidebarWidth.get() + PANEL_MARGIN * 2
            : PANEL_MARGIN,
        height: bottomPanelHeight,
      })}
      style={{ bottom: PANEL_MARGIN, right: PANEL_MARGIN }}
      contentClassName={panelContainerStyle}
      resizable={{
        edge: "top",
        getSize: () => bottomPanelHeight.get(),
        onResize: (height) => bottomPanelHeight.set(height),
        onResizeEnd: () => saveHeight(bottomPanelHeight.get()),
        minSize: MIN_BOTTOM_PANEL_HEIGHT,
        maxSize: MAX_BOTTOM_PANEL_HEIGHT,
      }}
    >
      {/* Tab Header */}
      <div className={headerStyle}>
        <HorizontalTabsHeader
          subViews={tabs}
          activeTabId={renderedActiveTab}
          onTabChange={handleTabChange}
        />
        <div className={headerRightStyle}>
          {activePluginView ? (
            activePluginView.headerAction
          ) : (
            <HorizontalTabsHeaderAction
              subViews={subViews}
              activeTabId={renderedActiveTab}
            />
          )}
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
      {activePluginView ? (
        <HorizontalTabPanel tabId={activePluginView.id}>
          {activePluginView.content}
        </HorizontalTabPanel>
      ) : (
        <HorizontalTabsContent
          subViews={subViews}
          activeTabId={renderedActiveTab}
        />
      )}
    </GlassPanel>
  );
};
