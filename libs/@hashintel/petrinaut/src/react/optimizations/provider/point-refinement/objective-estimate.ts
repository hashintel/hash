import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** The objective's mean over a point's runs and how sure that mean is. */
export type ObjectiveEstimate = {
  runs: number;
  mean: number;
  /** Standard error of the mean; infinite with a single run. */
  standardError: number;
};

/**
 * Standard errors the point's mean must fall short of the best by before the
 * ladder stops: 2.5 leaves under a 1% chance of giving up on a point that
 * could in fact beat it.
 */
const STOP_MARGIN_STANDARD_ERRORS = 2.5;

/**
 * The estimate from `metricId`'s last distribution frame with samples among
 * `frames` — the frame the objective is read from — or null without one.
 */
export const estimateObjective = (
  frames: readonly MonteCarloUserDefinedMetricFrame[],
  metricId: string,
): ObjectiveEstimate | null => {
  for (let index = frames.length - 1; index >= 0; index--) {
    const frame = frames[index]!;
    if (frame.metricId !== metricId || frame.outputType !== "distribution") {
      continue;
    }
    let runs = 0;
    let sum = 0;
    for (const [value, frequency] of frame.bins) {
      runs += frequency;
      sum += value * frequency;
    }
    if (runs === 0) {
      continue;
    }
    const mean = sum / runs;
    if (runs < 2) {
      return { runs, mean, standardError: Number.POSITIVE_INFINITY };
    }
    let squares = 0;
    for (const [value, frequency] of frame.bins) {
      squares += frequency * (value - mean) ** 2;
    }
    return {
      runs,
      mean,
      standardError: Math.sqrt(squares / (runs - 1) / runs),
    };
  }
  return null;
};

/**
 * Whether refining a point further is pointless: its mean sits more than
 * the margin below (maximizing) or above (minimizing) the study's best, so
 * more runs would only sharpen a value that cannot win. Never true without a
 * best, or while a single run leaves the error unbounded.
 */
export const shouldStopRefining = ({
  direction,
  best,
  mean,
  standardError,
}: {
  direction: "maximize" | "minimize";
  best: number | null;
  mean: number;
  standardError: number;
}): boolean => {
  if (best === null || !Number.isFinite(standardError)) {
    return false;
  }
  const margin = STOP_MARGIN_STANDARD_ERRORS * standardError;
  return direction === "maximize" ? mean + margin < best : mean - margin > best;
};
