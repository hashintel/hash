/**
 * Builders turning streamed metric frames into uPlot data arrays, one per
 * way the timeline can display a series.
 */
import {
  bandValueFromBins,
  distributionBandSeries,
} from "../shared/distribution-bands";
import {
  aggregateDistributionBins,
  applyTimeTrace,
} from "../shared/distribution-math";
import {
  isDistributionMetricFrame,
  isScalarMetricFrame,
} from "../shared/metric-frames";

import type {
  DistributionView,
  RunAggregation,
  TimeTrace,
} from "../shared/distribution-math";
import type {
  DistributionBins,
  DistributionMetricFrame,
  MetricFrame,
  ScalarMetricFrame,
} from "../shared/metric-frames";
import type uPlot from "uplot";

function buildScalarMetricTimelineData(
  frames: readonly ScalarMetricFrame[],
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  const time: number[] = [];
  const values: (number | null)[] = [];

  for (const frame of frames) {
    time.push(frame.time);
    values.push(frame.value);
  }

  return [time, applyTimeTrace(values, timeTrace)] as uPlot.AlignedData;
}

function buildDistributionSingleData(
  frames: readonly DistributionMetricFrame[],
  runAggregation: RunAggregation,
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  const time: number[] = [];
  const values: (number | null)[] = [];

  for (const frame of frames) {
    time.push(frame.time);
    values.push(aggregateDistributionBins(frame.bins, runAggregation));
  }

  return [time, applyTimeTrace(values, timeTrace)] as uPlot.AlignedData;
}

function buildDistributionHeatmapData(
  frames: readonly DistributionMetricFrame[],
): uPlot.AlignedData {
  // The heatmap plugin paints the distribution; the series only carries the
  // x positions.
  const time = frames.map((frame) => frame.time);

  return [time, time.map(() => null)] as uPlot.AlignedData;
}

function buildDistributionBandsData(
  frames: readonly DistributionMetricFrame[],
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  const time: number[] = [];
  const columns = distributionBandSeries.map(() => [] as (number | null)[]);

  for (const frame of frames) {
    time.push(frame.time);
    distributionBandSeries.forEach((band, index) => {
      columns[index]!.push(bandValueFromBins(frame.bins, band.fraction));
    });
  }

  return [
    time,
    ...columns.map((column) => applyTimeTrace(column, timeTrace)),
  ] as uPlot.AlignedData;
}

export function buildMetricTimelineData(
  frames: readonly MetricFrame[],
  outputType: MetricFrame["outputType"],
  aggregateRuns: boolean,
  runAggregation: RunAggregation,
  distributionView: DistributionView,
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  if (outputType !== "distribution") {
    return buildScalarMetricTimelineData(
      frames.filter(isScalarMetricFrame),
      timeTrace,
    );
  }

  const distributionFrames = frames.filter(isDistributionMetricFrame);

  if (aggregateRuns) {
    return buildDistributionSingleData(
      distributionFrames,
      runAggregation,
      timeTrace,
    );
  }

  return distributionView === "heatmap"
    ? buildDistributionHeatmapData(distributionFrames)
    : buildDistributionBandsData(distributionFrames, timeTrace);
}

/** A vertical bar chart's data: bin value on x, aggregated frequency on y. */
export function buildDistributionBarData(
  bins: DistributionBins,
): uPlot.AlignedData {
  const values: number[] = [];
  const frequencies: number[] = [];

  for (const [value, frequency] of bins) {
    values.push(value);
    frequencies.push(frequency);
  }

  return [values, frequencies] as uPlot.AlignedData;
}
