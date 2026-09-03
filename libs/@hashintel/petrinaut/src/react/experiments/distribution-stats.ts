/**
 * Summary statistics of a metric's latest distribution frame — what a
 * streaming readout shows while runs accumulate.
 */
import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

export type DistributionStats = {
  /** Runs contributing to the distribution. */
  runs: number;
  mean: number;
  median: number;
};

/**
 * Mean and median of `metricId`'s final distribution frame among `frames`,
 * or null when the metric has no distribution frame yet.
 */
export function distributionStats(
  frames: readonly MonteCarloUserDefinedMetricFrame[],
  metricId: string,
): DistributionStats | null {
  for (let index = frames.length - 1; index >= 0; index--) {
    const frame = frames[index]!;
    if (frame.metricId !== metricId || frame.outputType !== "distribution") {
      continue;
    }
    let weight = 0;
    let sum = 0;
    for (const [value, frequency] of frame.bins) {
      weight += frequency;
      sum += value * frequency;
    }
    if (weight === 0) {
      return null;
    }
    const half = weight / 2;
    let cumulative = 0;
    let median = frame.bins[0]?.[0] ?? 0;
    for (const [value, frequency] of frame.bins) {
      cumulative += frequency;
      if (cumulative >= half) {
        median = value;
        break;
      }
    }
    return { runs: weight, mean: sum / weight, median };
  }
  return null;
}
