import { use } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  EditorContext,
  type SimulateViewMode,
} from "../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { ExperimentsView } from "./experiments/experiments-view";
import { MetricsView } from "./metrics/metrics-view";
import { ScenariosView } from "./scenarios/scenarios-view";
import { StatusViewsView } from "./status-views/status-views-view";

import type { SegmentedControlItem } from "@hashintel/ds-components";
import type { ComponentType } from "react";

// -- Layout styles -------------------------------------------------------------

const containerStyle = css({
  display: "flex",
  flexDirection: "row",
  width: "full",
  height: "full",
  backgroundColor: "neutral.s00",
});

const sidebarStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  padding: "[12px]",
  backgroundColor: "neutral.s00",
  borderRightWidth: "[1px]",
  borderRightStyle: "solid",
  borderRightColor: "neutral.s40",
  flexShrink: 0,
});

// -- Mode options --------------------------------------------------------------

const modeOptions: SegmentedControlItem<SimulateViewMode>[] = [
  {
    value: "experiments",
    iconName: "flask",
    tooltip: "Experiments",
    tooltipOptions: { position: "right" },
  },
  {
    value: "scenarios",
    iconName: "layer",
    tooltip: "Scenarios",
    tooltipOptions: { position: "right" },
  },
  {
    value: "metrics",
    iconName: "chartBarSimple",
    tooltip: "Metrics",
    tooltipOptions: { position: "right" },
  },
  {
    value: "status-views",
    iconName: "squareCheck",
    tooltip: "Status views",
    tooltipOptions: { position: "right" },
  },
];

const views = {
  experiments: ExperimentsView,
  scenarios: ScenariosView,
  metrics: MetricsView,
  "status-views": StatusViewsView,
} satisfies Record<SimulateViewMode, ComponentType>;

/**
 * Metrics live inside Experiments, and a stored Status views mode whose tab
 * is not offered falls back to Experiments.
 */
const visibleSimulateView = (
  mode: SimulateViewMode,
  enableStatusViews: boolean,
): SimulateViewMode =>
  mode === "metrics" || (mode === "status-views" && !enableStatusViews)
    ? "experiments"
    : mode;

// -- Component -----------------------------------------------------------------

export const SimulateViewTabs = () => {
  const { simulateViewMode: mode, setSimulateViewMode: setMode } =
    use(EditorContext);
  const { enableStatusViews } = use(UserSettingsContext);
  const visibleModeOptions = modeOptions.filter(
    (option) =>
      option.value !== "metrics" &&
      (option.value !== "status-views" || enableStatusViews),
  );
  return (
    <nav aria-label="Simulation views" className={sidebarStyle}>
      <SegmentedControl
        value={visibleSimulateView(mode, enableStatusViews)}
        items={visibleModeOptions}
        onChange={setMode}
        layout="vertical"
        size="sm"
      />
    </nav>
  );
};

export const SimulateView = () => {
  const { simulateViewMode: mode } = use(EditorContext);
  const { enableStatusViews } = use(UserSettingsContext);
  const ActiveView = views[visibleSimulateView(mode, enableStatusViews)];
  return (
    <div className={containerStyle}>
      <ActiveView />
    </div>
  );
};
