import { computeIqrFences } from "../../shared/outlier-selection/iqr";

import type {
  BatchRow,
  BatchSegmentKey,
  BatchTimelineSegment,
  BatchTimelines,
  PipelineSummary,
  StepType,
} from "../../shared/types";

/**
 * Summary statistics for one batch segment over a filtered batch set.
 * Uses nearest-rank percentiles (no interpolation/rounding) so the pipeline
 * waterfall matches the backend's batch-timeline numbers. When
 * `excludeOutliers` is set, only the mean excludes values outside the shared
 * Tukey 1.5x IQR fences; the sample size, median and percentiles continue to
 * describe the full series.
 */
function segStats(
  batches: BatchRow[],
  key: BatchSegmentKey,
  excludeOutliers: boolean,
): BatchTimelineSegment | null {
  const values = batches
    .map((batch) => batch[key])
    .filter(
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
    throw new Error("Segment statistics were missing a midpoint value");
  }
  const median =
    values.length % 2 === 0
      ? (() => {
          const lower = values[midpoint - 1];
          if (lower === undefined) {
            throw new Error(
              "Segment statistics were missing a lower midpoint value",
            );
          }
          return (lower + upper) / 2;
        })()
      : upper;
  const p25 = values[Math.floor(values.length * 0.25)];
  const p75 = values[Math.floor(values.length * 0.75)];
  if (p25 === undefined || p75 === undefined) {
    throw new Error("Segment statistics percentile value missing");
  }
  return { label: "", mean, median, p25, p75, n: values.length };
}

/** Pipeline stages in display order: segment key, label, and step type. */
const SEG_DEFS: Array<[BatchSegmentKey, string, StepType]> = [
  [
    "seg_proc_to_prodstart",
    "Procurement \u2192 Production Start",
    "procurement",
  ],

  [
    "seg_prodstart_to_prodfinish",
    "Production Start \u2192 Production Finish",
    "production",
  ],

  ["seg_prodfinish_to_qa", "Production Finish \u2192 QA Release", "qa_hold"],
  ["seg_qa_to_customer", "QA Release \u2192 Customer", "transit"],
];

/** Every segment recomputed for the segments map (includes the two totals). */
const RECOMPUTE_SEG_DEFS: Array<[BatchSegmentKey, string]> = [
  ["seg_proc_to_prodstart", "Procurement \u2192 Production Start"],
  ["seg_prodstart_to_prodfinish", "Production Start \u2192 Production Finish"],
  ["seg_prodfinish_to_qa", "Production Finish \u2192 QA Release"],
  ["seg_qa_to_customer", "QA Release \u2192 Customer"],
  ["total_days", "Total (GR to Delivery)"],
  ["total_from_po", "Total (PO to Delivery)"],
];

/**
 * Recompute batch-timeline segments and the derived per-route pipeline summary
 * from a date-filtered batch set, preserving the original route labels and
 * detail-column metadata.
 */
export function recomputeBatchTimelines(
  filteredBatches: BatchRow[],
  original: BatchTimelines,
  excludeOutliers = false,
): { timelines: BatchTimelines; pipeline: Record<string, PipelineSummary> } {
  const segments: Record<string, BatchTimelineSegment> = {};
  for (const [key, label] of RECOMPUTE_SEG_DEFS) {
    const step = segStats(filteredBatches, key, excludeOutliers);
    if (step) {
      segments[key] = { ...step, label };
    }
  }

  const tracedCount = filteredBatches.filter(
    (batch) =>
      batch.earliest_gr_date != null || batch.earliest_production_start != null,
  ).length;

  // Per-route breakdown
  const perRoute: Record<
    string,
    { label: string; segments: Record<string, BatchTimelineSegment> }
  > = {};
  const coverageByRoute: Record<string, { traced: number; total: number }> = {};
  const byRoute = new Map<string, BatchRow[]>();
  for (const batch of filteredBatches) {
    const row = batch.route;
    if (!row) {
      continue;
    }
    const existing = byRoute.get(row);
    if (existing) {
      existing.push(batch);
    } else {
      byRoute.set(row, [batch]);
    }
  }
  for (const [route, rows] of byRoute) {
    const routeSegs: Record<string, BatchTimelineSegment> = {};
    for (const [key, label] of RECOMPUTE_SEG_DEFS.filter(
      ([key2]) => key2 !== "total_from_po",
    )) {
      const step = segStats(rows, key, excludeOutliers);
      if (step) {
        routeSegs[key] = { ...step, label };
      }
    }
    const origRoute = original.per_route[route];
    perRoute[route] = { label: origRoute?.label ?? route, segments: routeSegs };
    coverageByRoute[route] = {
      traced: rows.filter(
        (batch) =>
          batch.earliest_gr_date != null ||
          batch.earliest_production_start != null,
      ).length,
      total: rows.length,
    };
  }

  // Build pipeline summary from filtered data
  const pipeline: Record<string, PipelineSummary> = {};
  for (const [routeCode, routeData] of Object.entries(perRoute)) {
    const stages = [];
    let stageMeanTotal = 0;
    let stageMedianTotal = 0;
    for (const [segId, segLabel, segType] of SEG_DEFS) {
      const seg = routeData.segments[segId];
      if (!seg) {
        continue;
      }
      stages.push({
        id: segId,
        label: segLabel,
        type: segType,
        mean: seg.mean,
        median: seg.median,
        pct_of_total: 0,
      });
      stageMeanTotal += seg.mean;
      stageMedianTotal += seg.median;
    }
    if (stageMeanTotal > 0) {
      for (const step of stages) {
        step.pct_of_total = (step.mean / stageMeanTotal) * 100;
      }
    }
    const totalDays = routeData.segments.total_days;
    pipeline[routeCode] = {
      label: routeData.label,
      stages,
      total_mean: totalDays?.mean ?? stageMeanTotal,
      total_median: totalDays?.median ?? stageMedianTotal,
    };
  }

  return {
    timelines: {
      batches: filteredBatches,
      segments,
      per_route: perRoute,
      coverage: { traced: tracedCount, total: filteredBatches.length },
      coverage_by_route: coverageByRoute,
      detail_columns: original.detail_columns,
    },
    pipeline,
  };
}
