/**
 * The words for a metric chart's view settings: the labels its menu offers
 * and the one line that reads the current choice back under the title.
 */
import type {
  DistributionView,
  RunAggregation,
  TimeAggregation,
  TimeTrace,
} from "./shared/distribution-math";
import type { MetricFrame } from "./shared/metric-frames";
import type { MetricViewSettings } from "./view-state";

export const RUN_AGGREGATION_LABELS: Record<RunAggregation, string> = {
  mean: "Average",
  median: "Median",
  min: "Minimum",
  max: "Maximum",
  p10: "10th percentile",
  p25: "25th percentile",
  p75: "75th percentile",
  p90: "90th percentile",
};

export const DISTRIBUTION_VIEW_LABELS: Record<DistributionView, string> = {
  heatmap: "Heatmap",
  bands: "Percentile lines",
};

export const TIME_TRACE_LABELS: Record<TimeTrace, string> = {
  value: "Value",
  minToDate: "Minimum to date",
  maxToDate: "Maximum to date",
};

export const TIME_AGGREGATION_LABELS: Record<TimeAggregation, string> = {
  mean: "Average",
  min: "Minimum",
  max: "Maximum",
  sum: "Sum",
};

const lowerFirst = (label: string): string =>
  label.charAt(0).toLowerCase() + label.slice(1);

/** How the runs collapse into the series: "median over runs", "heatmap". */
const describeRunsView = (settings: MetricViewSettings): string =>
  settings.aggregateRuns
    ? `${lowerFirst(RUN_AGGREGATION_LABELS[settings.runAggregation])} over runs`
    : lowerFirst(DISTRIBUTION_VIEW_LABELS[settings.distributionView]);

/** How the series reads along time: "value over time", "maximum to date", "sum over time". */
const describeTimeView = (settings: MetricViewSettings): string => {
  if (settings.aggregateTime) {
    return `${lowerFirst(TIME_AGGREGATION_LABELS[settings.timeAggregation])} over time`;
  }
  return settings.timeTrace === "value"
    ? "value over time"
    : lowerFirst(TIME_TRACE_LABELS[settings.timeTrace]);
};

/**
 * "median over runs · value over time"; a scalar metric has no runs to
 * collapse, so it names only the time part.
 */
export const describeMetricView = (
  settings: MetricViewSettings,
  outputType: MetricFrame["outputType"],
): string =>
  outputType === "distribution"
    ? `${describeRunsView(settings)} · ${describeTimeView(settings)}`
    : describeTimeView(settings);
