import { computeIqrFences, partitionByFences } from "./outlier-selection/iqr";
import { computeStats, percentileOf, round } from "./stats";

import type {
  GraphNode,
  StepDetail,
  Observation,
  MonthlyBucket,
  StepStats,
  YieldData,
  ConsumptionData,
  ComponentConsumption,
  TimingSeries,
} from "./types";

/**
 * Apply the client-side Tukey 1.5x IQR outlier rule to a graph node.
 *
 * When `excludeOutliers` is true, fences are computed from the shipped
 * `observations`, out-of-bound points are dropped, and `stats`/`monthly` are
 * recomputed from the kept series (cost columns on each monthly bucket are
 * preserved -- inventory kg-days are independent of duration outliers).
 * `excluded_count`/`excluded_pct` describe the full-series exclusion. When
 * false (or with too few points), the base series is returned unchanged.
 */

/**
 * Recompute per-month timing values (mean/median/n) from a kept observation set,
 * preserving each bucket's non-timing columns (kg-days, qty, variance). Months
 * with no kept observations keep their bucket with null timing and `n = 0`.
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
      return { ...bucket, mean: null, median: null, n: 0 };
    }
    const sorted = [...vals].sort((left, right) => left - right);
    return {
      ...bucket,
      mean: round(
        sorted.reduce((left, right) => left + right, 0) / sorted.length,
      ),
      median: round(percentileOf(sorted, 50)),
      n: sorted.length,
    };
  });
}

/** Drop Tukey-IQR outliers from a bare observation array (over its own values). */ function outlierFilterObservations(
  obs: Observation[],
): Observation[] {
  if (obs.length === 0) {
    return obs;
  }
  const { kept } = partitionByFences(
    obs,
    computeIqrFences(obs.map((observation) => observation.value)),
  );
  return kept;
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
        stats: computeStats(kept.map((observation) => observation.value)),
        observations: kept,
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
    yield_series: node.yield_series
      ? {
          ...node.yield_series,
          observations: outlierFilterObservations(
            node.yield_series.observations,
          ),
        }
      : node.yield_series,
    consumption_series: node.consumption_series
      ? {
          ...node.consumption_series,
          observations: outlierFilterObservations(
            node.consumption_series.observations,
          ),
        }
      : node.consumption_series,
    excluded_count: excludedCount,
    excluded_pct:
      observations.length > 0
        ? round((100 * excludedCount) / observations.length)
        : 0,
  };
}
interface SeriesLike {
  values: number[];
  observations: Observation[];
  monthly: MonthlyBucket[];
  stats: StepStats;
}
/**
 * Drop Tukey-IQR outliers from one family series (computed over its own value
 * distribution) and recompute `values`/`stats`/`monthly` from the kept points.
 * Returns the series unchanged when there is nothing to exclude. Non-timing
 * monthly columns (kg-days, qty, variance) are preserved via the spread in
 * {@link rebuildMonthlyTiming}.
 */ function applyOutlierToSeries<T extends SeriesLike>(series: T): T {
  const observations = series.observations;
  if (observations.length === 0) {
    return series;
  }
  const { kept, excluded } = partitionByFences(
    observations,
    computeIqrFences(observations.map((observation) => observation.value)),
  );
  if (excluded.length === 0) {
    return series;
  }
  const values = kept.map((observation) => observation.value);
  return {
    ...series,
    values,
    observations: kept,
    monthly: rebuildMonthlyTiming(series.monthly, kept),
    stats: computeStats(values),
  };
}
/** Outlier-filter the yield series (receipt-ratio %) in place of its raw points. */ function applyOutlierToYield(
  yd: YieldData,
): YieldData {
  return applyOutlierToSeries(yd);
}
/**
 * Outlier-filter the consumption block: each component series and the aggregate
 * series are partitioned independently. Downstream windowing recomputes the
 * aggregate `weighted_variance_pct` from whatever observations remain, so
 * dropping outlier points here makes that window-aware metric outlier-aware too.
 */ function applyOutlierToConsumption(cd: ConsumptionData): ConsumptionData {
  const components = cd.components.map((column) =>
    applyOutlierToSeries<ComponentConsumption>(column),
  );
  const aggregate = applyOutlierToSeries(cd.aggregate);
  return { ...cd, components, aggregate };
}
/**
 * Outlier-filter a secondary {@link TimingSeries} (e.g. procurement's
 * full-receipt lead time) over its own value distribution, recomputing
 * `monthly`/`stats` from the kept points. Returned unchanged when there is
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
    observations: kept,
    monthly: rebuildMonthlyTiming(ts.monthly, kept),
    stats: computeStats(kept.map((observation) => observation.value)),
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
        durations: values,
        observations: kept,
        monthly: rebuildMonthlyTiming(step.monthly, kept),
        stats: computeStats(values),
      };
      excludedCount = excluded.length;
    }
  }
  return {
    ...step,
    ...timing,
    yield_data: step.yield_data
      ? applyOutlierToYield(step.yield_data)
      : step.yield_data,
    consumption_data: step.consumption_data
      ? applyOutlierToConsumption(step.consumption_data)
      : step.consumption_data,
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
