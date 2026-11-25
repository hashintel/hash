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
  distributionFramesFrom,
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
} from "../shared/metric-frames";
import type uPlot from "uplot";

/** A frame as one number: a scalar's value, or a distribution's runs reduced to one. */
export const frameScalar = (
  frame: MetricFrame,
  runAggregation: RunAggregation,
): number | null =>
  frame.outputType === "scalar"
    ? frame.value
    : aggregateDistributionBins(frame.bins, runAggregation);

const buildLineData = (
  frames: readonly MetricFrame[],
  runAggregation: RunAggregation,
  timeTrace: TimeTrace,
): uPlot.AlignedData =>
  [
    frames.map((frame) => frame.time),
    applyTimeTrace(
      frames.map((frame) => frameScalar(frame, runAggregation)),
      timeTrace,
    ),
  ] as uPlot.AlignedData;

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
    return buildLineData(
      frames.filter(isScalarMetricFrame),
      runAggregation,
      timeTrace,
    );
  }

  const distributionFrames = distributionFramesFrom(frames);

  if (aggregateRuns) {
    return buildLineData(distributionFrames, runAggregation, timeTrace);
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
