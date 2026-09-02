import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/**
 * One combination's objective: the metric's value on its last frame that
 * carries samples — a distribution frame reduces to the mean of its bins, a
 * scalar frame to its frame value. A terminating net finishes its runs
 * before `maxTime`, so trailing frames legitimately hold no samples.
 */
export const sweepCellObjective = (
  frames: readonly MonteCarloUserDefinedMetricFrame[],
  metricId: string,
): number | null => {
  for (let index = frames.length - 1; index >= 0; index--) {
    const frame = frames[index]!;
    if (frame.metricId !== metricId) {
      continue;
    }
    if (frame.outputType === "scalar") {
      if (frame.frameValue !== null) {
        return frame.frameValue;
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
      return sum / weight;
    }
  }
  return null;
};
