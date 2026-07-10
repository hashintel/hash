import { createContext, useContext } from "react";

import { percentileOf } from "./stats";

import type { StepStats } from "./types";

/**
 * The base statistic used as the "headline" timing measure across the app:
 * product step-card headline + over/under badge, site planning deviation /
 * bad-param count / planning + dwell "Observed" columns, and timing trends.
 *
 * Maps 1:1 to `StepStats` keys. Defaults to `median`. Does NOT affect the mini
 * box-plot (shows mean+median) or the named stat tables in the slideover, which
 * always show explicit stats.
 */
export type BaseMeasure = "median" | "mean" | "p75" | "p95";

export const BASE_MEASURES: readonly BaseMeasure[] = [
  "median",
  "mean",
  "p75",
  "p95",
];

/** Short label for the toolbar control + tooltips. */
export const MEASURE_LABELS: Record<BaseMeasure, string> = {
  median: "Median",
  mean: "Mean",
  p75: "P75",
  p95: "P95",
};

interface MeasureCtx {
  measure: BaseMeasure;
  setMeasure: (measure: BaseMeasure) => void;
}

export const MeasureContext = createContext<MeasureCtx>({
  measure: "median",
  setMeasure: () => {},
});

export function useBaseMeasure() {
  return useContext(MeasureContext);
}

/** The percentile (0..100) for a percentile-style measure, else null. */
function measurePercentile(measure: BaseMeasure): number | null {
  switch (measure) {
    case "p75":
      return 75;
    case "p95":
      return 95;
    default:
      return null;
  }
}

/** Read the selected measure off a precomputed `StepStats` block. */
export function selectStat(
  stats: StepStats | null | undefined,
  measure: BaseMeasure,
): number | null {
  if (!stats) {
    return null;
  }
  return stats[measure] ?? null;
}

/**
 * Compute the selected measure directly from a raw value list. Mirrors the
 * rounding/interpolation in `computeStats` so the result matches the
 * `StepStats` field for the same values. Returns null for an empty list.
 */
export function statOf(values: number[], measure: BaseMeasure): number | null {
  if (values.length === 0) {
    return null;
  }
  if (measure === "mean") {
    return values.reduce((left, right) => left + right, 0) / values.length;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const percentileRank = measurePercentile(measure);
  if (percentileRank != null) {
    return percentileOf(sorted, percentileRank);
  }
  return percentileOf(sorted, 50);
}
