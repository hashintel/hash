import { use, useEffect, useState } from "react";

import { Button, SegmentedControl, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../../../../../react/simulation/context";
import {
  EditorContext,
  type TimelineChartType,
  type TimelineView,
} from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { ViewMetricDrawer } from "../../../SimulateView/metrics/view-metric-drawer";
import { placesWithDynamics } from "./series-config/solver-error";
import { useMetricShapes } from "./use-metric-shapes";

import type { MetricShape } from "@hashintel/petrinaut-core";

const CHART_TYPE_OPTIONS = [
  { value: "run", label: "Run" },
  { value: "stacked", label: "Stacked" },
];

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const metricPickerLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a100",
  letterSpacing: "[0.5px]",
  flexShrink: 0,
  // On narrow panels, drop the label before the tabs start truncating.
  "@container bottom-panel-header (max-width: 860px)": {
    display: "none",
  },
});

// Sentinel values for the native views in the picker. Metric ids are UUIDs
// (or `metric__*` in examples) so these cannot collide.
const PER_PLACE_VALUE = "__per_place__";
const PER_TYPE_VALUE = "__per_type__";
const PER_TRANSITION_VALUE = "__per_transition__";
const SOLVER_ERROR_VALUE = "__solver_error__";

function viewToSelectValue(view: TimelineView): string {
  switch (view.kind) {
    case "per-place":
      return PER_PLACE_VALUE;
    case "per-type":
      return PER_TYPE_VALUE;
    case "per-transition":
      return PER_TRANSITION_VALUE;
    case "solver-error":
      return SOLVER_ERROR_VALUE;
    case "metric":
      return view.metricId;
  }
}

function selectValueToView(value: string): TimelineView {
  if (value === PER_PLACE_VALUE) {
    return { kind: "per-place" };
  }
  if (value === PER_TYPE_VALUE) {
    return { kind: "per-type" };
  }
  if (value === PER_TRANSITION_VALUE) {
    return { kind: "per-transition" };
  }
  if (value === SOLVER_ERROR_VALUE) {
    return { kind: "solver-error" };
  }
  return { kind: "metric", metricId: value };
}

const TimelineChartTypeSelector: React.FC = () => {
  const { timelineChartType: chartType, setTimelineChartType: setChartType } =
    use(EditorContext);

  return (
    <SegmentedControl
      value={chartType}
      items={CHART_TYPE_OPTIONS}
      onChange={(value) => setChartType(value as TimelineChartType)}
      size="xs"
    />
  );
};

export const TimelineViewPicker: React.FC = () => {
  const { navigateTo, setSimulateDrawer, timelineView, setTimelineView } =
    use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { metrics = [], places },
  } = use(SDCPNContext);
  const { engine, eventSolver } = use(SimulationContext);
  const colorsEnabled = extensions.colors;
  const metricShapes = useMetricShapes();
  // Only an event-driven run on the adaptive solver records the error, and
  // only for places it integrates.
  const solverErrorAvailable =
    engine === "event-driven" &&
    eventSolver.kind === "adaptive" &&
    placesWithDynamics(places).length > 0;

  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    if (!colorsEnabled && timelineView.kind === "per-type") {
      setTimelineView({ kind: "per-place" });
    }
    if (!solverErrorAvailable && timelineView.kind === "solver-error") {
      setTimelineView({ kind: "per-place" });
    }
  }, [colorsEnabled, setTimelineView, solverErrorAvailable, timelineView.kind]);

  const selectedMetric =
    timelineView.kind === "metric"
      ? metrics.find((m) => m.id === timelineView.metricId)
      : undefined;

  // One group per kind of series: the native views, then the metrics by the
  // shape their code gives them, with the not yet compiled ones on their own.
  const metricsOfShape = (shape: MetricShape | null) =>
    metrics
      .filter((m) => (metricShapes[m.id] ?? null) === shape)
      .map((m) => ({ value: m.id, text: m.name }));
  const metricGroups = [
    {
      id: "discrete",
      label: "Discrete metrics",
      items: metricsOfShape("discrete"),
    },
    {
      id: "continuous",
      label: "Continuous metrics",
      items: metricsOfShape("continuous"),
    },
    { id: "metrics", label: "Metrics", items: metricsOfShape(null) },
  ].filter((group) => group.items.length > 0);
  const options = [
    {
      id: "tokens",
      label: "Tokens",
      items: [
        { value: PER_PLACE_VALUE, text: "Tokens per place" },
        ...(colorsEnabled
          ? [{ value: PER_TYPE_VALUE, text: "Tokens per type" }]
          : []),
      ],
    },
    {
      id: "transitions",
      label: "Transitions",
      items: [{ value: PER_TRANSITION_VALUE, text: "Transition firings" }],
    },
    ...metricGroups,
    ...(solverErrorAvailable
      ? [
          {
            id: "solver",
            label: "Solver",
            items: [{ value: SOLVER_ERROR_VALUE, text: "Accumulated error" }],
          },
        ]
      : []),
  ];
  const selectedValue =
    (colorsEnabled || timelineView.kind !== "per-type") &&
    (solverErrorAvailable || timelineView.kind !== "solver-error")
      ? viewToSelectValue(timelineView)
      : PER_PLACE_VALUE;

  return (
    <>
      <span className={metricPickerLabelStyle}>Metric</span>
      <Select
        size="xs"
        required
        width="fitContent"
        value={selectedValue}
        items={options}
        onChange={(value) => setTimelineView(selectValueToView(value))}
      />
      <div style={{ display: "flex" }}>
        {selectedMetric && (
          <Button
            size="xs"
            variant="ghost"
            aria-label="Edit metric"
            tooltip="Edit Metric"
            iconName="pencil"
            onClick={() => setIsViewOpen(true)}
          />
        )}
        <Button
          size="xs"
          variant="ghost"
          aria-label="Create metric"
          tooltip="Create Metric"
          iconName="plus"
          onClick={() => setSimulateDrawer({ type: "create-metric" })}
        />
        <Button
          size="xs"
          variant="ghost"
          aria-label="Manage metrics"
          tooltip="Manage Metrics"
          iconName="list"
          onClick={() => {
            navigateTo({
              globalMode: "simulate",
              simulateViewMode: "metrics",
            });
          }}
        />
      </div>
      <ViewMetricDrawer
        // Gate on the metric existing — the picker can swap to a non-metric
        // view while the drawer is open, and we don't want an empty overlay.
        open={isViewOpen && !!selectedMetric}
        onClose={() => setIsViewOpen(false)}
        metric={selectedMetric}
      />
    </>
  );
};

export const TimelineHeaderActions: React.FC = () => (
  <div className={headerActionsStyle}>
    <TimelineViewPicker />
    <TimelineChartTypeSelector />
  </div>
);
