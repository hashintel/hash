/**
 * What the timeline shows, derived from its frames and view settings. Pure,
 * so the component only holds state and renders.
 */
import {
  aggregateDistributionBins,
  aggregateDistributionOverTime,
  reduceOverTime,
} from "./shared/distribution-math";
import { distributionFramesFrom } from "./shared/metric-frames";
import {
  buildDistributionBarData,
  buildMetricTimelineData,
} from "./view-state/plot-data";

import type {
  DistributionView,
  MetricDisplayMode,
  RunAggregation,
  TimeAggregation,
  TimeTrace,
} from "./shared/distribution-math";
import type { MetricFrame } from "./shared/metric-frames";
import type { PointerPosition } from "./shared/pointer-position";
import type uPlot from "uplot";

export type MetricViewSettings = {
  aggregateRuns: boolean;
  runAggregation: RunAggregation;
  distributionView: DistributionView;
  aggregateTime: boolean;
  timeTrace: TimeTrace;
  timeAggregation: TimeAggregation;
};

export const DEFAULT_METRIC_VIEW_SETTINGS: MetricViewSettings = {
  aggregateRuns: false,
  runAggregation: "mean",
  distributionView: "heatmap",
  aggregateTime: false,
  timeTrace: "value",
  timeAggregation: "mean",
};

export type MetricViewState = {
  displayMode: MetricDisplayMode;
  /** The percentile-lines legend is shown under the chart. */
  showsBandLegend: boolean;
  /** What the "number" display shows; null outside it or with nothing to reduce. */
  aggregateNumber: number | null;
  plotData: uPlot.AlignedData;
  hasPlotData: boolean;
  /** A plot is mounted: there is data, or axes to keep up without any. */
  canPlot: boolean;
};

export const deriveMetricViewState = ({
  frames,
  outputType,
  settings,
  keepsAxesWhileEmpty,
}: {
  frames: readonly MetricFrame[];
  outputType: MetricFrame["outputType"];
  settings: MetricViewSettings;
  /**
   * A pinned time domain draws real axes with no data at all, so the chart
   * mounts before the first frame streams and nothing shifts when data
   * lands; an empty re-stream keeps the plot mounted the same way.
   */
  keepsAxesWhileEmpty: boolean;
}): MetricViewState => {
  const {
    aggregateRuns,
    runAggregation,
    distributionView,
    aggregateTime,
    timeTrace,
    timeAggregation,
  } = settings;
  const isDistribution = outputType === "distribution";
  // A scalar series (a scalar metric, or a distribution with runs aggregated)
  // collapses to one number over time; an unaggregated distribution
  // collapses to one aggregated distribution.
  const scalarLike = !isDistribution || aggregateRuns;
  const displayMode: MetricDisplayMode = aggregateTime
    ? scalarLike
      ? "number"
      : "distribution"
    : "chart";
  const showsBandLegend =
    displayMode === "chart" &&
    isDistribution &&
    !aggregateRuns &&
    distributionView === "bands";
  const aggregateNumber =
    displayMode === "number"
      ? reduceOverTime(
          frames.map((frame) =>
            frame.outputType === "scalar"
              ? frame.value
              : aggregateDistributionBins(frame.bins, runAggregation),
          ),
          timeAggregation,
        )
      : null;
  const plotData =
    displayMode === "distribution"
      ? buildDistributionBarData(
          aggregateDistributionOverTime(
            distributionFramesFrom(frames),
            timeAggregation,
          ),
        )
      : buildMetricTimelineData(
          frames,
          outputType,
          aggregateRuns,
          runAggregation,
          distributionView,
          timeTrace,
        );
  const hasPlotData = plotData[0]!.length > 0;
  return {
    displayMode,
    showsBandLegend,
    aggregateNumber,
    plotData,
    hasPlotData,
    canPlot: displayMode !== "number" && (hasPlotData || keepsAxesWhileEmpty),
  };
};

export type FrameSelection = {
  /** Where the frame sat when picked; checked first, so the lookup is O(1). */
  index: number;
  frameNumber: number;
  pointer: PointerPosition;
};

/**
 * The picked frame as its latest delivery: a re-stream replaces frame
 * objects, and until the frame re-arrives there is nothing to show.
 */
export const selectedFrameFrom = (
  frames: readonly MetricFrame[],
  selection: FrameSelection,
): MetricFrame | null => {
  const atIndex = frames[selection.index];
  if (atIndex?.frameNumber === selection.frameNumber) {
    return atIndex;
  }
  return (
    frames.find((frame) => frame.frameNumber === selection.frameNumber) ?? null
  );
};
