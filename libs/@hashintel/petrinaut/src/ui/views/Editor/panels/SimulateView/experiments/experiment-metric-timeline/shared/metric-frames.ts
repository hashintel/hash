/**
 * The frame types the timeline's modules share, and the bin-value summary
 * the y scale and the heatmap both read, computed once per frames array.
 */
import type { ExperimentRecord } from "../../../../../../../../react/experiments/context";

export type MetricFrame = ExperimentRecord["metricFrames"][number];
export type ScalarMetricFrame = Extract<MetricFrame, { outputType: "scalar" }>;
export type DistributionMetricFrame = Extract<
  MetricFrame,
  { outputType: "distribution" }
>;
export type DistributionBins = DistributionMetricFrame["bins"];

export const isScalarMetricFrame = (
  frame: MetricFrame,
): frame is ScalarMetricFrame => frame.outputType === "scalar";

export const isDistributionMetricFrame = (
  frame: MetricFrame,
): frame is DistributionMetricFrame => frame.outputType === "distribution";

export const distributionFramesFrom = (
  frames: readonly MetricFrame[],
): DistributionMetricFrame[] => frames.filter(isDistributionMetricFrame);

export const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(3);

/**
 * Distinct bin values are collected up to one more than this, so a consumer
 * that resolves at most this many can tell "more" from "exactly this many".
 */
export const MAX_RESOLVED_BIN_VALUES = 512;

export type BinValueSummary = {
  /** Lowest and highest bin value over every frame. */
  min: number;
  max: number;
  /** Distinct bin values ascending, capped; see `MAX_RESOLVED_BIN_VALUES`. */
  distinctValues: readonly number[];
};

/** `null` when no frame has a bin. */
export const summarizeBinValues = (
  frames: readonly { bins: DistributionBins }[],
): BinValueSummary | null => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const distinct = new Set<number>();
  for (const frame of frames) {
    for (const [value] of frame.bins) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (distinct.size <= MAX_RESOLVED_BIN_VALUES) {
        distinct.add(value);
      }
    }
  }
  if (!Number.isFinite(min)) {
    return null;
  }
  return {
    min,
    max,
    distinctValues: [...distinct].sort((left, right) => left - right),
  };
};

const summaries = new WeakMap<readonly MetricFrame[], BinValueSummary | null>();

/**
 * `summarizeBinValues` over the distribution frames, computed once per
 * `frames` identity: a streamed publish is one array, read by the y-scale
 * range and the heatmap raster alike.
 */
export const binValueSummary = (
  frames: readonly MetricFrame[],
): BinValueSummary | null => {
  let summary = summaries.get(frames);
  if (summary === undefined) {
    summary = summarizeBinValues(distributionFramesFrom(frames));
    summaries.set(frames, summary);
  }
  return summary;
};
