/**
 * @layerRoot ui.views.editor.bottom-panel
 * @role Shows diagnostics, compilation, simulation settings and the timeline of a run or a recording as tabs under the canvas
 *
 * The Timeline tabs are a layer of their own in `subviews/timeline/`, which
 * the preview imports too.
 */

import { use, useEffect } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useComposesOnly } from "../../../../../react/document/use-composes-only";
import { ActualModeContext } from "../../../../../react/host/actual-mode-context";
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
import { useUserSettings } from "../../../../../react/state/user-settings-context";
import { usePluginBottomPanelViews } from "../../../../plugins/use-plugin-bottom-panel-views";
import { KeptState } from "../../../../shared/kept-state";
import { PANEL_MARGIN } from "../../../../shared/ui-constants";
import { DockedPanel } from "../../shared/docked-panel";
import { fallbackBottomPanelTab } from "./fallback-tab";
import {
  actualEventsSubView,
  actualTimelineSubView,
  compilationSubView,
  diagnosticsSubView,
  eventTimelineSubView,
  simulationSettingsSubView,
} from "./sub-views";
import { BottomPanelTabs } from "./tabs";
import { useOpenTimelineOnRunStart } from "./use-open-timeline-on-run-start";

const glassPanelBaseStyle = css({
  position: "absolute",
  zIndex: "[calc(var(--z-index-sticky) - 2)]",
  borderTopWidth: "thin",
  boxSizing: "border-box",
});

const panelContainerStyle = css({
  display: "flex",
  flexDirection: "column",
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
  const showCompilationOutput = useUserSettings(
    (settings) => settings.showCompilationOutput,
  );
  const composesOnly = useComposesOnly();
  const pluginViews = usePluginBottomPanelViews();
  const { leftSidebarWidth } = usePanelSizes();

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

  return (
    // Above the panel, which unmounts when it closes: what the tab holds is
    // there when the panel opens again. A tab starts afresh each time it is
    // picked.
    <KeptState scope={renderedActiveTab}>
      <DockedPanel
        panel="bottomPanel"
        isOpen={isOpen}
        className={glassPanelBaseStyle}
        contentClassName={panelContainerStyle}
        style={{ bottom: PANEL_MARGIN, right: PANEL_MARGIN }}
        // The panel starts beside the left sidebar, as far as that is in view.
        boundStyle={{
          left: () =>
            PANEL_MARGIN +
            shown.leftSidebar.get() * (leftSidebarWidth.get() + PANEL_MARGIN),
        }}
      >
        <BottomPanelTabs
          tabs={tabs}
          activeTabId={renderedActiveTab}
          onTabChange={(tabId) => setActiveTab(tabId as BottomPanelTab)}
          padded={!activeSubView?.noPadding}
          actions={
            <>
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
            </>
          }
        >
          {activePluginView?.content}
          {Content && <Content />}
        </BottomPanelTabs>
      </DockedPanel>
    </KeptState>
  );
};
