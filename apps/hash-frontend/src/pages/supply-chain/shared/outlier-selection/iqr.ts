import type { Observation } from "../types";

/** Tukey fence multiplier for the standard 1.5x IQR outlier rule. */
export const IQR_K = 1.5;

export interface IqrFences {
  lower: number;
  upper: number;
}

function percentile(sorted: number[], percentileRank: number): number {
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

/**
 * Tukey fences `[Q1 - k*IQR, Q3 + k*IQR]` (quartiles via linear interpolation,
 * matching `computeStats`). Returns `null` for fewer than 4 points, where the
 * quartile spread is too unstable to flag outliers reliably.
 */
export function computeIqrFences(
  values: number[],
  multiplier = IQR_K,
): IqrFences | null {
  if (values.length < 4) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  return { lower: q1 - multiplier * iqr, upper: q3 + multiplier * iqr };
}

/**
 * Split observations into those inside the fences (`kept`) and outside
 * (`excluded`). With `null` fences (too few points) everything is kept.
 */
export function partitionByFences(
  observations: Observation[],
  fences: IqrFences | null,
): { kept: Observation[]; excluded: Observation[] } {
  if (!fences) {
    return { kept: [...observations], excluded: [] };
  }
  const kept: Observation[] = [];
  const excluded: Observation[] = [];
  for (const observation of observations) {
    if (
      observation.value >= fences.lower &&
      observation.value <= fences.upper
    ) {
      kept.push(observation);
    } else {
      excluded.push(observation);
    }
  }
  return { kept, excluded };
}
