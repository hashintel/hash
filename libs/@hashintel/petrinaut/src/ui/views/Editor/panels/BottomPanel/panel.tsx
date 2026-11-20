import { use, useEffect } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { ActualModeContext } from "../../../../../react/actual-mode-context";
import {
  SimulationContext,
  type SimulationState,
} from "../../../../../react/simulation/context";
import {
  type BottomPanelTab,
  EditorPublishedContext,
  useEditorActions,
  useEditorFields,
} from "../../../../../react/state/editor-context";
import { usePanelPresence } from "../../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../../react/state/panel-sizes-context";
import { useComposesOnly } from "../../../../../react/state/use-composes-only";
import { useUserSettingsFields } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
import {
  HorizontalTabPanel,
  HorizontalTabsHeader,
} from "../../../../components/sub-view/horizontal/horizontal-tabs-container";
import {
  MAX_BOTTOM_PANEL_HEIGHT,
  MIN_BOTTOM_PANEL_HEIGHT,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { styleRef, useReading } from "../../../../lib/readings";
import { usePluginBottomPanelViews } from "../../../../plugins/plugin-outlets";
import { slideFromEdge } from "../../shared/slide-from-edge";
import { fallbackBottomPanelTab } from "./fallback-tab";
import {
  actualEventsSubView,
  actualTimelineSubView,
  compilationSubView,
  diagnosticsSubView,
  eventTimelineSubView,
  simulationSettingsSubView,
} from "./sub-views";
import { useOpenTimelineOnRunStart } from "./use-open-timeline-on-run-start";

const glassPanelBaseStyle = css({
  position: "absolute",
  zIndex: "[calc(var(--z-index-sticky) - 2)]",
  borderTopWidth: "thin",
  boxSizing: "border-box",
});

// Where the panel is comes from its presence value; this is only what a
// closed panel must not do.
const closedPanelStyle = css({
  pointerEvents: "none",
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

/** A run with a timeline to show: one that is going, paused or finished. */
const runExists = (state: SimulationState) =>
  state === "Running" || state === "Paused" || state === "Complete";

const getBottomPanelSubViews = ({
  composesOnly,
  isActualMode,
  hasRun,
  showCompilationOutput,
}: {
  composesOnly: boolean;
  isActualMode: boolean;
  hasRun: boolean;
  showCompilationOutput: boolean;
}) =>
  // An editor that only composes has problems to show and nothing to run.
  composesOnly
    ? [diagnosticsSubView]
    : isActualMode
      ? [actualTimelineSubView, actualEventsSubView]
      : [
          diagnosticsSubView,
          simulationSettingsSubView,
          ...(hasRun ? [eventTimelineSubView] : []),
          ...(showCompilationOutput ? [compilationSubView] : []),
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
    activeBottomPanelTab: activeTab,
    globalMode,
  } = useEditorFields(
    "isBottomPanelOpen",
    "activeBottomPanelTab",
    "globalMode",
  );
  const { setActiveBottomPanelTab: setActiveTab, toggleBottomPanel } =
    useEditorActions();
  const publishedEditor = use(EditorPublishedContext);
  const { shown } = usePanelPresence();
  // Still sliding out, where a closed panel is not kept mounted.
  const isInView = useReading(() => shown.bottomPanel.get() > 0);

  const {
    keepPanelsMounted,
    showCompilationOutput,
    setBottomPanelHeight: saveHeight,
  } = useUserSettingsFields(
    "keepPanelsMounted",
    "showCompilationOutput",
    "setBottomPanelHeight",
  );
  const composesOnly = useComposesOnly();
  const pluginViews = usePluginBottomPanelViews();
  const { leftSidebarWidth, bottomPanelHeight } = usePanelSizes();

  const { state: simulationState } = use(SimulationContext);
  const actualMode = use(ActualModeContext);
  const isActualMode = globalMode === "actual";
  const hasRun = !isActualMode && runExists(simulationState);
  const isActualTimelineActive =
    isActualMode &&
    actualMode.available &&
    actualMode.initialState !== null &&
    (actualMode.status === "streaming" || actualMode.status === "complete");

  useOpenTimelineOnRunStart(
    isActualTimelineActive
      ? "actual-timeline"
      : hasRun
        ? "simulation-timeline"
        : null,
  );

  const subViews = getBottomPanelSubViews({
    composesOnly,
    isActualMode,
    hasRun,
    showCompilationOutput,
  });
  const tabs = [...subViews, ...pluginViews];

  // The tab drawn is already the fallback on the render that loses the
  // active one; the effect below then stores it.
  const renderedActiveTab =
    fallbackBottomPanelTab(
      activeTab,
      tabs.map((tab) => tab.id as BottomPanelTab),
    ) ?? activeTab;
  const activePluginView = pluginViews.find(
    (view) => view.id === renderedActiveTab,
  );
  const activeSubView = subViews.find((view) => view.id === renderedActiveTab);
  const HeaderAction = activeSubView?.headerAction;
  const Content = activeSubView?.component;

  useEffect(() => {
    // A render caused by another context reads the editor's state of the
    // commit before. A tab picked in that update is stored by now, and stays.
    const storedTab = publishedEditor?.get().activeBottomPanelTab ?? activeTab;
    if (renderedActiveTab !== activeTab && storedTab === activeTab) {
      setActiveTab(renderedActiveTab);
    }
  }, [activeTab, publishedEditor, renderedActiveTab, setActiveTab]);

  if (!isOpen && !isInView && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(glassPanelBaseStyle, !isOpen && closedPanelStyle)}
      // The panel starts beside the left sidebar, as far as that is in view.
      ref={styleRef({
        left: () =>
          PANEL_MARGIN +
          shown.leftSidebar.get() * (leftSidebarWidth.get() + PANEL_MARGIN),
        height: bottomPanelHeight,
        transform: () => slideFromEdge("bottom", shown.bottomPanel.get()),
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
          onTabChange={(tabId) => setActiveTab(tabId as BottomPanelTab)}
        />
        <div className={headerRightStyle}>
          {activePluginView?.headerAction}
          {HeaderAction && <HeaderAction />}
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

      {/* Scrollable content: a plugin's, or the component of an own tab */}
      <HorizontalTabPanel
        // A new element between a plugin's tab and an own one, so the scroll
        // offset of the one does not carry over to the other.
        key={activePluginView ? "plugin" : "own"}
        tabId={renderedActiveTab}
        padded={!activeSubView?.noPadding}
      >
        {activePluginView?.content}
        {Content && <Content />}
      </HorizontalTabPanel>
    </GlassPanel>
  );
};
