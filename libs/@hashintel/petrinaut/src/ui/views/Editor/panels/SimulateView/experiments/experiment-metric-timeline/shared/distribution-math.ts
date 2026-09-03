/**
 * Pure statistics over metric frames — reducing a frame's bins to one
 * number and reducing a series over time — and the vocabulary of views the
 * timeline offers over them.
 */
import type {
  DistributionBins,
  DistributionMetricFrame,
} from "./metric-frames";

export type RunAggregation =
  | "mean"
  | "median"
  | "min"
  | "max"
  | "p10"
  | "p25"
  | "p75"
  | "p90";

/** Which spread view an unaggregated distribution series uses. */
export type DistributionView = "heatmap" | "bands";

/** How each frame's plotted value relates to the frames before it. */
export type TimeTrace = "value" | "minToDate" | "maxToDate";

/** How a series is reduced to a single value when aggregating over time. */
export type TimeAggregation = "mean" | "min" | "max" | "sum";

/** "number" shows one aggregate; the other two share one uPlot instance. */
export type MetricDisplayMode = "chart" | "distribution" | "number";

export function sampleCountFromBins(bins: DistributionBins): number {
  return bins.reduce((sum, [, frequency]) => sum + frequency, 0);
}

export function meanFromBins(bins: DistributionBins): number | null {
  const sampleCount = sampleCountFromBins(bins);
  if (sampleCount === 0) {
    return null;
  }

  return (
    bins.reduce((sum, [value, frequency]) => sum + value * frequency, 0) /
    sampleCount
  );
}

function minFromBins(bins: DistributionBins): number | null {
  return bins[0]?.[0] ?? null;
}

function maxFromBins(bins: DistributionBins): number | null {
  return bins.at(-1)?.[0] ?? null;
}

export function percentileFromBins(
  bins: DistributionBins,
  fraction: number,
): number | null {
  const sampleCount = sampleCountFromBins(bins);
  if (sampleCount === 0) {
    return null;
  }

  const target = fraction * sampleCount;
  let cumulative = 0;

  for (const [value, frequency] of bins) {
    cumulative += frequency;
    if (cumulative >= target) {
      return value;
    }
  }

  return bins.at(-1)?.[0] ?? null;
}

export function aggregateDistributionBins(
  bins: DistributionBins,
  aggregation: RunAggregation,
): number | null {
  switch (aggregation) {
    case "mean":
      return meanFromBins(bins);
    case "median":
      return percentileFromBins(bins, 0.5);
    case "min":
      return minFromBins(bins);
    case "max":
      return maxFromBins(bins);
    case "p10":
      return percentileFromBins(bins, 0.1);
    case "p25":
      return percentileFromBins(bins, 0.25);
    case "p75":
      return percentileFromBins(bins, 0.75);
    case "p90":
      return percentileFromBins(bins, 0.9);
  }
}

export function applyTimeTrace(
  values: readonly (number | null)[],
  trace: TimeTrace,
): (number | null)[] {
  if (trace === "value") {
    return [...values];
  }

  let accumulated: number | null = null;

  return values.map((value) => {
    if (value !== null) {
      accumulated =
        accumulated === null
          ? value
          : trace === "minToDate"
            ? Math.min(accumulated, value)
            : Math.max(accumulated, value);
    }

    return accumulated;
  });
}

export function reduceOverTime(
  values: readonly (number | null)[],
  aggregation: TimeAggregation,
): number | null {
  let count = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;

  for (const value of values) {
    if (value !== null) {
      count++;
      sum += value;
      min = min === null ? value : Math.min(min, value);
      max = max === null ? value : Math.max(max, value);
    }
  }

  if (count === 0) {
    return null;
  }

  switch (aggregation) {
    case "mean":
      return sum / count;
    case "min":
      return min;
    case "max":
      return max;
    case "sum":
      return sum;
  }
}

// Aggregating a series of distributions over time yields a single
// distribution: for each value, its frequency across every frame is reduced
// with the chosen aggregator (sum pools all runs, mean is the per-frame
// average, min/max are the smallest/largest frequency ever seen).
export function aggregateDistributionOverTime(
  frames: readonly DistributionMetricFrame[],
  aggregation: TimeAggregation,
): DistributionBins {
  const frameCount = frames.length;
  if (frameCount === 0) {
    return [];
  }

  const perValue = new Map<
    number,
    { sum: number; min: number; max: number; present: number }
  >();

  for (const frame of frames) {
    for (const [value, frequency] of frame.bins) {
      const entry = perValue.get(value) ?? {
        sum: 0,
        min: Infinity,
        max: 0,
        present: 0,
      };
      entry.sum += frequency;
      entry.min = Math.min(entry.min, frequency);
      entry.max = Math.max(entry.max, frequency);
      entry.present += 1;
      perValue.set(value, entry);
    }
  }

  const bins: [number, number][] = [];
  for (const [value, entry] of perValue) {
    let frequency: number;
    switch (aggregation) {
      case "sum":
        frequency = entry.sum;
        break;
      case "mean":
        frequency = entry.sum / frameCount;
        break;
      // A value absent from some frames implicitly had a frequency of 0 there.
      case "min":
        frequency = entry.present < frameCount ? 0 : entry.min;
        break;
      case "max":
        frequency = entry.max;
        break;
    }
    bins.push([value, frequency]);
  }

  return bins.sort(([a], [b]) => a - b);
}
