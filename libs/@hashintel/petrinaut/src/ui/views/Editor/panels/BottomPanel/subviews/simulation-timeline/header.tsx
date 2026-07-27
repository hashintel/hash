import { use, useEffect, useState } from "react";

import { Button, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  EditorContext,
  type TimelineChartType,
  type TimelineView,
} from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { SegmentGroup } from "../../../../../../components/segment-group";
import { CreateMetricDrawer } from "../../../SimulateView/metrics/create-metric-drawer";
import { ViewMetricDrawer } from "../../../SimulateView/metrics/view-metric-drawer";

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

function viewToSelectValue(view: TimelineView): string {
  switch (view.kind) {
    case "per-place":
      return PER_PLACE_VALUE;
    case "per-type":
      return PER_TYPE_VALUE;
    case "per-transition":
      return PER_TRANSITION_VALUE;
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
  return { kind: "metric", metricId: value };
}

const TimelineChartTypeSelector: React.FC = () => {
  const { timelineChartType: chartType, setTimelineChartType: setChartType } =
    use(EditorContext);

  return (
    <SegmentGroup
      value={chartType}
      options={CHART_TYPE_OPTIONS}
      onChange={(value) => setChartType(value as TimelineChartType)}
      size="xs"
    />
  );
};

const TimelineViewPicker: React.FC = () => {
  const { timelineView, setTimelineView, setGlobalMode, setSimulateViewMode } =
    use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { metrics = [] },
  } = use(SDCPNContext);
  const colorsEnabled = extensions.colors;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    if (!colorsEnabled && timelineView.kind === "per-type") {
      setTimelineView({ kind: "per-place" });
    }
  }, [colorsEnabled, setTimelineView, timelineView.kind]);

  const selectedMetric =
    timelineView.kind === "metric"
      ? metrics.find((m) => m.id === timelineView.metricId)
      : undefined;

  const options = [
    { value: PER_PLACE_VALUE, text: "Tokens per place" },
    ...(colorsEnabled
      ? [{ value: PER_TYPE_VALUE, text: "Tokens per type" }]
      : []),
    { value: PER_TRANSITION_VALUE, text: "Transition firings" },
    ...metrics.map((m) => ({ value: m.id, text: m.name })),
  ];
  const selectedValue =
    colorsEnabled || timelineView.kind !== "per-type"
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
          onClick={() => setIsCreateOpen(true)}
        />
        <Button
          size="xs"
          variant="ghost"
          aria-label="Manage metrics"
          tooltip="Manage Metrics"
          iconName="list"
          onClick={() => {
            setSimulateViewMode("metrics");
            setGlobalMode("simulate");
          }}
        />
      </div>
      <CreateMetricDrawer
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
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
