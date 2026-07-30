import { computeIqrFences, partitionByFences } from "./outlier-selection/iqr";
import { computeStats, round } from "./stats";

import type {
  GraphNode,
  StepDetail,
  Observation,
  MonthlyBucket,
  TimingSeries,
} from "./types";

/**
 * Apply the client-side Tukey 1.5x IQR outlier rule to a graph node.
 *
 * When `excludeOutliers` is true, fences are computed from the shipped
 * `observations`, and only the overall/monthly mean is recomputed from kept
 * points. Raw observations, sample size and percentile statistics are retained.
 * `excluded_count`/`excluded_pct` describe the full-series exclusion. When
 * false (or with too few points), the base series is returned unchanged.
 */

/**
 * Recompute only the per-month mean from kept observations. Median, sample size,
 * percentile inputs and non-timing columns remain raw.
 */
function rebuildMonthlyTiming(
  original: MonthlyBucket[],
  keptObs: Observation[],
): MonthlyBucket[] {
  if (original.length === 0) {
    return original;
  }
  const byMonth = new Map<string, number[]>();
  for (const observation of keptObs) {
    const month = observation.date.slice(0, 7);
    const arr = byMonth.get(month);
    if (arr) {
      arr.push(observation.value);
    } else {
      byMonth.set(month, [observation.value]);
    }
  }
  return original.map((bucket) => {
    const vals = byMonth.get(bucket.month);
    if (!vals || vals.length === 0) {
      return { ...bucket, mean: null };
    }
    const sorted = [...vals].sort((left, right) => left - right);
    return {
      ...bucket,
      mean: round(
        sorted.reduce((left, right) => left + right, 0) / sorted.length,
      ),
    };
  });
}

/**
 * A series shaped like the per-family blocks shipped on a step
 * (`yield_data`, `consumption_data.aggregate`, each consumption component):
 * a raw observation series plus the precomputed views derived from it.
 */ export function applyOutlierSelectionToNode(
  node: GraphNode,
  excludeOutliers: boolean,
): GraphNode {
  if (!excludeOutliers) {
    return { ...node, excluded_count: 0, excluded_pct: 0 };
  } // Timing series (durations). Does not short-circuit the per-observation
  // yield/consumption series passes below (a node may have no timing outliers
  // but still carry yield/consumption outliers, or vice versa).
  const observations = node.observations ?? [];
  let timing: Partial<GraphNode> = {};
  let excludedCount = 0;
  if (observations.length > 0) {
    const { kept, excluded } = partitionByFences(
      observations,
      computeIqrFences(observations.map((observation) => observation.value)),
    );
    if (excluded.length > 0) {
      timing = {
        mean_observations: kept,
        stats: {
          ...node.stats,
          mean: computeStats(kept.map((observation) => observation.value)).mean,
        },
        monthly: node.monthly
          ? rebuildMonthlyTiming(node.monthly, kept)
          : node.monthly,
      };
      excludedCount = excluded.length;
    }
  }
  return {
    ...node,
    ...timing,
    excluded_count: excludedCount,
    excluded_pct:
      observations.length > 0
        ? round((100 * excludedCount) / observations.length)
        : 0,
  };
}
/**
 * Outlier-filter a secondary {@link TimingSeries} (e.g. procurement's
 * full-receipt lead time) over its own value distribution, recomputing
 * only its mean from the kept points. Returned unchanged when there is
 * nothing to exclude. Independent of the headline series so the two can have
 * different fences.
 */ function applyOutlierToTimingSeries(ts: TimingSeries): TimingSeries {
  const observations = ts.observations;
  if (observations.length === 0) {
    return ts;
  }
  const { kept, excluded } = partitionByFences(
    observations,
    computeIqrFences(observations.map((observation) => observation.value)),
  );
  if (excluded.length === 0) {
    return ts;
  }
  return {
    ...ts,
    mean_observations: kept,
    monthly: rebuildMonthlyTiming(ts.monthly, kept),
    stats: {
      ...ts.stats,
      mean: computeStats(kept.map((observation) => observation.value)).mean,
    },
  };
}
/** Step-level counterpart of {@link applyOutlierSelectionToNode}. */ export function applyOutlierSelectionToStep(
  step: StepDetail,
  excludeOutliers: boolean,
): StepDetail {
  if (!excludeOutliers) {
    return { ...step, excluded_count: 0, excluded_pct: 0 };
  } // Timing series (durations). May have nothing to exclude even when the
  // yield/consumption families do, so the per-family passes below run
  // independently of this one.
  const observations = step.observations;
  let timing: Partial<StepDetail> = {};
  let excludedCount = 0;
  if (observations.length > 0) {
    const { kept, excluded } = partitionByFences(
      observations,
      computeIqrFences(observations.map((observation) => observation.value)),
    );
    if (excluded.length > 0) {
      const values = kept.map((observation) => observation.value);
      timing = {
        mean_observations: kept,
        monthly: rebuildMonthlyTiming(step.monthly, kept),
        stats: { ...step.stats, mean: computeStats(values).mean },
      };
      excludedCount = excluded.length;
    }
  }
  return {
    ...step,
    ...timing,
    complete_timing: step.complete_timing
      ? applyOutlierToTimingSeries(step.complete_timing)
      : step.complete_timing,
    excluded_count: excludedCount,
    excluded_pct:
      observations.length > 0
        ? round((100 * excludedCount) / observations.length)
        : 0,
  };
}
