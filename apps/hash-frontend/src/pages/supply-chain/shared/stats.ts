import type { StepStats } from "./types";

/** Round to one decimal place (the app's canonical display precision). */
export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Percentile of a pre-sorted array via linear interpolation. */
export function percentileOf(sorted: number[], percentileRank: number): number {
  if (sorted.length === 0) {
    throw new Error("Cannot compute a percentile of an empty series");
  }
  const count = sorted.length;
  const idx = (percentileRank / 100) * (count - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const low = sorted[lo];
  const high = sorted[hi];
  if (low === undefined || high === undefined) {
    throw new Error("Percentile index was outside the provided series");
  }
  if (lo === hi) {
    return low;
  }
  return low + (high - low) * (idx - lo);
}

/** Summary statistics (mean/median/std/percentiles) over a value set. */
export function computeStats(values: number[]): StepStats {
  if (values.length === 0) {
    return {
      n: 0,
      mean: 0,
      median: 0,
      std: 0,
      min: 0,
      max: 0,
      p25: 0,
      p75: 0,
      p85: 0,
      p95: 0,
    };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  if (min === undefined || max === undefined) {
    throw new Error("Cannot compute stats for an empty series");
  }
  const mean = sorted.reduce((left, right) => left + right, 0) / count;
  const variance =
    sorted.reduce((left, right) => left + (right - mean) ** 2, 0) / count;
  return {
    n: count,
    mean: round(mean),
    median: round(percentileOf(sorted, 50)),
    std: round(Math.sqrt(variance)),
    min,
    max,
    p25: round(percentileOf(sorted, 25)),
    p75: round(percentileOf(sorted, 75)),
    p85: round(percentileOf(sorted, 85)),
    p95: round(percentileOf(sorted, 95)),
  };
}
