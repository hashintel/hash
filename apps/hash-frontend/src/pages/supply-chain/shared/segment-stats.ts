import { computeIqrFences } from "./outlier-selection/iqr";

import type { BatchTimelineSegment } from "./types";

/**
 * Shared pipeline-segment statistics: validity filtering, optional Tukey IQR
 * trimming for the mean, and nearest-rank percentiles over the full series.
 */
export const segmentStats = (
  rawValues: Array<number | null | undefined>,
  excludeOutliers: boolean,
): BatchTimelineSegment | null => {
  const values = rawValues.filter(
    (value): value is number => value != null && value >= 0 && value <= 730,
  );
  if (values.length === 0) {
    return null;
  }
  let meanValues = values;
  if (excludeOutliers) {
    const fences = computeIqrFences(values);
    if (fences) {
      meanValues = values.filter(
        (value) => value >= fences.lower && value <= fences.upper,
      );
    }
    if (meanValues.length === 0) {
      return null;
    }
  }

  values.sort((left, right) => left - right);
  const mean =
    meanValues.reduce((sum, value) => sum + value, 0) / meanValues.length;
  const midpoint = Math.floor(values.length / 2);
  const upper = values[midpoint];
  if (upper === undefined) {
    return null;
  }
  const lower = values[Math.max(midpoint - 1, 0)] ?? upper;
  const median = values.length % 2 === 0 ? (lower + upper) / 2 : upper;
  const p25 = values[Math.floor(values.length * 0.25)];
  const p75 = values[Math.floor(values.length * 0.75)];
  const p95 =
    values[Math.min(Math.floor(values.length * 0.95), values.length - 1)];
  if (p25 === undefined || p75 === undefined || p95 === undefined) {
    return null;
  }
  return { label: "", mean, median, p25, p75, p95, n: values.length };
};
