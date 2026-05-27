import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  EditorContext,
  type SimulateViewMode,
} from "../../../../../react/state/editor-context";
import { SegmentGroup } from "../../../../components/segment-group";
import { ExperimentsView } from "./experiments/experiments-view";
import { MetricsView } from "./metrics/metrics-view";
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
    value: "scenarios",
    label: "Scenarios",
    icon: <Icon name="layer" size="sm" />,
    hideLabel: true,
    tooltip: "Scenarios",
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
  {
    value: "experiments",
    label: "Experiments",
    icon: <Icon name="flask" size="sm" />,
    hideLabel: true,
    tooltip: "Experiments",
    tooltipOptions: { position: "right" },
  },
];

const views = {
  scenarios: ScenariosView,
  metrics: MetricsView,
  experiments: ExperimentsView,
} satisfies Record<SimulateViewMode, ComponentType>;

// -- Component -----------------------------------------------------------------

export const SimulateView = () => {
  const { simulateViewMode: mode, setSimulateViewMode: setMode } =
    use(EditorContext);
  const ActiveView = views[mode];

  return (
    <div className={containerStyle}>
      <div className={sidebarStyle}>
        <SegmentGroup
          value={mode}
          options={modeOptions}
          onChange={(value) => setMode(value as SimulateViewMode)}
          orientation="vertical"
          size="sm"
        />
      </div>

      <ActiveView />
    </div>
  );
};
