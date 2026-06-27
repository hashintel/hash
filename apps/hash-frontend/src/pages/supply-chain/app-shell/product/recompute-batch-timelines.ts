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
 * waterfall matches the backend's batch-timeline numbers. When `excludeOutliers`
 * is set, the segment's per-batch values are first trimmed with the shared
 * Tukey 1.5x IQR rule (same definition as the node/step series) so the
 * waterfall + E2E totals honour the outlier toggle.
 */
function segStats(
  batches: BatchRow[],
  key: BatchSegmentKey,
  excludeOutliers: boolean,
): BatchTimelineSegment | null {
  let vals = batches
    .map((batch) => batch[key])
    .filter(
      (value): value is number => value != null && value >= 0 && value <= 730,
    );
  if (vals.length === 0) {
    return null;
  }
  if (excludeOutliers) {
    const fences = computeIqrFences(vals);
    if (fences) {
      vals = vals.filter(
        (value) => value >= fences.lower && value <= fences.upper,
      );
    }
    if (vals.length === 0) {
      return null;
    }
  }
  vals.sort((left, right) => left - right);
  const mean = vals.reduce((sum, value) => sum + value, 0) / vals.length;
  const midpoint = Math.floor(vals.length / 2);
  const upper = vals[midpoint];
  if (upper === undefined) {
    throw new Error("Segment statistics were missing a midpoint value");
  }
  const median =
    vals.length % 2 === 0
      ? (() => {
          const lower = vals[midpoint - 1];
          if (lower === undefined) {
            throw new Error(
              "Segment statistics were missing a lower midpoint value",
            );
          }
          return (lower + upper) / 2;
        })()
      : upper;
  const p25 = vals[Math.floor(vals.length * 0.25)];
  const p75 = vals[Math.floor(vals.length * 0.75)];
  if (p25 === undefined || p75 === undefined) {
    throw new Error("Segment statistics percentile value missing");
  }
  return { label: "", mean, median, p25, p75, n: vals.length };
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
    let totalMean = 0;
    let totalMedian = 0;
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
      totalMean += seg.mean;
      totalMedian += seg.median;
    }
    if (totalMean > 0) {
      for (const step of stages) {
        step.pct_of_total = (step.mean / totalMean) * 100;
      }
    }
    pipeline[routeCode] = {
      label: routeData.label,
      stages,
      total_mean: totalMean,
      total_median: totalMedian,
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
