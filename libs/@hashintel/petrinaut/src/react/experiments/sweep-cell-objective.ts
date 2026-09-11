import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** A metric's value at one combination, with the runs that reported it. */
export type SweepCellSample = { value: number; runs: number };

/**
 * One combination's objective: the metric's value on its last frame that
 * carries samples — a distribution frame reduces to the mean of its bins, a
 * scalar frame to its frame value — and the runs sampled on that frame. A
 * terminating net finishes its runs before `maxTime`, so trailing frames
 * legitimately hold no samples; runs that ended earlier or errored are
 * absent from that frame, so for a net whose runs end at different times the
 * value weights the longest-lived runs, and `runs` counts those alone.
 */
export const sweepCellSample = (
  frames: readonly MonteCarloUserDefinedMetricFrame[],
  metricId: string,
): SweepCellSample | null => {
  for (let index = frames.length - 1; index >= 0; index--) {
    const frame = frames[index]!;
    if (frame.metricId !== metricId) {
      continue;
    }
    if (frame.outputType === "scalar") {
      if (frame.frameValue !== null) {
        return { value: frame.frameValue, runs: frame.runSampleCount };
      }
      continue;
    }
    let weight = 0;
    let sum = 0;
    for (const [value, frequency] of frame.bins) {
      weight += frequency;
      sum += value * frequency;
    }
    if (weight > 0) {
      return { value: sum / weight, runs: frame.runSampleCount };
    }
  }
  return null;
};

/** The combination's objective alone. */
export const sweepCellObjective = (
  frames: readonly MonteCarloUserDefinedMetricFrame[],
  metricId: string,
): number | null => sweepCellSample(frames, metricId)?.value ?? null;
