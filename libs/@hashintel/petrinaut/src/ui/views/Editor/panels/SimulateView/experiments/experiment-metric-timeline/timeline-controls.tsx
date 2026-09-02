/**
 * The footer under a metric chart: how runs are aggregated (distribution
 * metrics only) and how the series is traced or aggregated over time.
 */
import { Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type {
  DistributionView,
  RunAggregation,
  TimeAggregation,
  TimeTrace,
} from "./shared/distribution-math";
import type { MetricFrame } from "./shared/metric-frames";
import type { MetricViewSettings } from "./view-state";

const footerStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "4",
  flexWrap: "wrap",
  marginTop: "1",
  paddingTop: "2.5",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  fontSize: "xs",
  color: "neutral.s80",
});

const blockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const blockRightStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "2",
});

const controlStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const labelStyle = css({
  color: "neutral.s90",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

const selectStyle = css({
  width: "[144px]",
});

const runAggregationOptions: { value: RunAggregation; text: string }[] = [
  { value: "mean", text: "Average" },
  { value: "median", text: "Median" },
  { value: "min", text: "Minimum" },
  { value: "max", text: "Maximum" },
  { value: "p10", text: "10th percentile" },
  { value: "p25", text: "25th percentile" },
  { value: "p75", text: "75th percentile" },
  { value: "p90", text: "90th percentile" },
];

const distributionViewOptions: { value: DistributionView; text: string }[] = [
  { value: "heatmap", text: "Heatmap" },
  { value: "bands", text: "Percentile lines" },
];

const timeTraceOptions: { value: TimeTrace; text: string }[] = [
  { value: "value", text: "Value" },
  { value: "minToDate", text: "Minimum to date" },
  { value: "maxToDate", text: "Maximum to date" },
];

const timeAggregationOptions: { value: TimeAggregation; text: string }[] = [
  { value: "mean", text: "Average" },
  { value: "min", text: "Minimum" },
  { value: "max", text: "Maximum" },
  { value: "sum", text: "Sum" },
];

export const TimelineControls = ({
  outputType,
  value,
  onChange,
}: {
  outputType: MetricFrame["outputType"];
  value: MetricViewSettings;
  onChange: (settings: MetricViewSettings) => void;
}) => (
  <div className={footerStyle}>
    {outputType === "distribution" ? (
      <div className={blockStyle}>
        <div className={controlStyle}>
          <span className={labelStyle}>Aggregate runs</span>
          <Toggle
            value={value.aggregateRuns}
            onChange={(aggregateRuns) => onChange({ ...value, aggregateRuns })}
            size="xs"
          />
        </div>
        {value.aggregateRuns ? (
          <Select
            required
            value={value.runAggregation}
            onChange={(runAggregation) =>
              onChange({ ...value, runAggregation })
            }
            items={runAggregationOptions}
            size="xs"
            className={selectStyle}
          />
        ) : (
          <Select
            required
            value={value.distributionView}
            onChange={(distributionView) =>
              onChange({ ...value, distributionView })
            }
            items={distributionViewOptions}
            size="xs"
            className={selectStyle}
          />
        )}
      </div>
    ) : null}
    <div className={blockRightStyle}>
      <div className={controlStyle}>
        <span className={labelStyle}>Aggregate over time</span>
        <Toggle
          value={value.aggregateTime}
          onChange={(aggregateTime) => onChange({ ...value, aggregateTime })}
          size="xs"
        />
      </div>
      {value.aggregateTime ? (
        <Select
          required
          value={value.timeAggregation}
          onChange={(timeAggregation) =>
            onChange({ ...value, timeAggregation })
          }
          items={timeAggregationOptions}
          size="xs"
          className={selectStyle}
        />
      ) : (
        <Select
          required
          value={value.timeTrace}
          onChange={(timeTrace) => onChange({ ...value, timeTrace })}
          items={timeTraceOptions}
          size="xs"
          className={selectStyle}
        />
      )}
    </div>
  </div>
);
