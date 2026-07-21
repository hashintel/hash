import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import {
  EditorContext,
  type SimulateViewMode,
} from "../../../../../react/state/editor-context";
import { SegmentGroup } from "../../../../components/segment-group";
import { ExperimentsView } from "./experiments/experiments-view";
import { MetricsView } from "./metrics/metrics-view";
import { OptimizationsView } from "./optimizations/optimizations-view";
import { ScenariosView } from "./scenarios/scenarios-view";

import type { SegmentOption } from "../../../../components/segment-group";
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

const modeOptions: SegmentOption[] = [
  {
    value: "experiments",
    label: "Experiments",
    icon: <Icon name="flask" size="sm" />,
    hideLabel: true,
    tooltip: "Experiments",
    tooltipOptions: { position: "right" },
  },
  {
    value: "scenarios",
    label: "Scenarios",
    icon: <Icon name="layer" size="sm" />,
    hideLabel: true,
    tooltip: "Scenarios",
    tooltipOptions: { position: "right" },
  },
  {
    value: "optimizations",
    label: "Optimizations",
    icon: <Icon name="sliders" size="sm" />,
    hideLabel: true,
    tooltip: "Optimizations",
    tooltipOptions: { position: "right" },
  },
  {
    value: "metrics",
    label: "Metrics",
    icon: <Icon name="chartBarSimple" size="sm" />,
    hideLabel: true,
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
        <SegmentGroup
          value={visibleMode}
          options={visibleModeOptions}
          onChange={(value) => setMode(value as SimulateViewMode)}
          orientation="vertical"
          size="sm"
        />
      </div>

      <ActiveView />
    </div>
  );
};
