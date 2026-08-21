import { use } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import {
  EditorContext,
  type SimulateViewMode,
} from "../../../../../react/state/editor-context";
import { ExperimentsView } from "./experiments/experiments-view";
import { MetricsView } from "./metrics/metrics-view";
import { OptimizationsView } from "./optimizations/optimizations-view";
import { ScenariosView } from "./scenarios/scenarios-view";

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
    value: "optimizations",
    iconName: "sliders",
    tooltip: "Optimizations",
    tooltipOptions: { position: "right" },
  },
  {
    value: "metrics",
    iconName: "chartBarSimple",
    tooltip: "Metrics",
    tooltipOptions: { position: "right" },
  },
];

const views = {
  experiments: ExperimentsView,
  scenarios: ScenariosView,
  metrics: MetricsView,
  optimizations: OptimizationsView,
} satisfies Record<SimulateViewMode, ComponentType>;

// -- Component -----------------------------------------------------------------

export const SimulateView = () => {
  const optimization = use(PetrinautOptimizationContext);
  const { simulateViewMode: mode, setSimulateViewMode: setMode } =
    use(EditorContext);
  const visibleModeOptions = modeOptions.filter(
    (option) =>
      option.value !== "metrics" &&
      (option.value !== "optimizations" || optimization !== null),
  );
  const visibleMode =
    mode === "metrics" || (mode === "optimizations" && !optimization)
      ? "experiments"
      : mode;
  const ActiveView = views[visibleMode];

  return (
    <div className={containerStyle}>
      <div className={sidebarStyle}>
        <SegmentedControl
          value={visibleMode}
          items={visibleModeOptions}
          onChange={setMode}
          layout="vertical"
          size="sm"
        />
      </div>

      <ActiveView />
    </div>
  );
};
