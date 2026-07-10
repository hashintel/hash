import {
  deriveProcurementTimingFromRows,
  isProcurementNodeObservation,
  procurementNodeObservationsForBasis,
} from "./procurement-observations";
import { computeStats, percentileOf, round } from "./stats";

import type {
  GraphData,
  RawGraphData,
  GraphNode,
  StepDetail,
  StepDetailWire,
  Observation,
  StepStats,
  MonthlyBucket,
  ProcurementNodeObservation,
} from "./types";

/**
 * Load-time contract normalization.
 *
 * The wire ships a slim payload: a single canonical observation series per
 * family, with the `stats` block and per-month timing left off (a fixed
 * mean/median/p95 can't respect the client's window/outlier toggles, which
 * recompute on every change). These helpers refill `stats`/`monthly` from
 * `observations` on load so downstream read sites can treat them as always
 * present.
 */

function hasStats(step: StepStats | null | undefined): step is StepStats {
  return !!step && typeof step.n === "number";
}

function statsFromObservations(
  obs: Observation[] | undefined | null,
): StepStats {
  return computeStats((obs ?? []).map((observation) => observation.value));
}

function pctExceeding(
  obs: Observation[] | undefined | null,
  threshold: number | null | undefined,
): number | null {
  if (threshold == null) {
    return null;
  }
  const values = (obs ?? []).map((observation) => observation.value);
  if (values.length === 0) {
    return null;
  }
  return round(
    (100 * values.filter((value) => value > threshold).length) / values.length,
  );
}

/** A series block shaped like `yield_data` / a consumption component / aggregate. */
interface SeriesLike {
  observations?: Observation[];
  stats?: StepStats;
}

function ensureSeriesStats<T extends SeriesLike>(
  series: T | null | undefined,
): T | null | undefined {
  if (!series || hasStats(series.stats)) {
    return series;
  }
  return { ...series, stats: statsFromObservations(series.observations) };
}

/**
 * Rebuild a secondary {@link TimingSeries}' `monthly`/`stats` from its
 * `observations` when absent. The wire ships these series observations-only;
 * precomputed monthly/stats can't respect the window/outlier toggles, so the
 * client always derives them. No-op when both are already present.
 */

/** Group an observation set into per-month timing buckets (records-derive). */
function buildMonthlyFromObservations(obs: Observation[]): MonthlyBucket[] {
  const byMonth = new Map<string, number[]>();
  for (const observation of obs) {
    const month = observation.date.slice(0, 7);
    const arr = byMonth.get(month);
    if (arr) {
      arr.push(observation.value);
    } else {
      byMonth.set(month, [observation.value]);
    }
  }
  return [...byMonth.keys()].sort().map((month) => {
    const sorted = [...(byMonth.get(month) ?? [])].sort(
      (left, right) => left - right,
    );
    return {
      month,
      mean: round(
        sorted.reduce((left, right) => left + right, 0) / sorted.length,
      ),
      median: round(percentileOf(sorted, 50)),
      n: sorted.length,
    };
  });
}

/**
 * Single-source records derive. When a step ships only the canonical
 * `detail_rows` (+ `value_col`/`ref_date_col`) and no precomputed timing series,
 * rehydrate observations/durations/monthly/stats from the rows. A strict no-op
 * whenever `observations` are already present.
 */
function ensureTimingSeriesStats<
  T extends {
    observations?: Observation[];
    monthly?: MonthlyBucket[];
    stats?: StepStats | null;
  },
>(ts: T | null | undefined): T | null | undefined {
  if (!ts) {
    return ts;
  }
  if (ts.monthly && ts.monthly.length > 0 && hasStats(ts.stats)) {
    return ts;
  }
  const obs = ts.observations ?? [];
  return {
    ...ts,
    monthly: buildMonthlyFromObservations(obs),
    stats: computeStats(obs.map((observation) => observation.value)),
  };
}

function normalizeProcurementNode(node: GraphNode): GraphNode {
  if (node.type !== "procurement") {
    return node;
  }
  const raw =
    node.procurement_observations ??
    ((node.observations as unknown[] | undefined)?.every(
      isProcurementNodeObservation,
    )
      ? (node.observations as unknown as ProcurementNodeObservation[])
      : undefined);
  if (!raw || raw.length === 0) {
    return node;
  }
  const observations = procurementNodeObservationsForBasis(raw, "first");
  return {
    ...node,
    procurement_observations: raw,
    observations,
    monthly: buildMonthlyFromObservations(observations),
  };
}

/** Fill a graph node's `stats` from its observations when absent. */
export function ensureNodeStats(node: GraphNode): GraphNode {
  const normalized = normalizeProcurementNode(node);
  const observations = normalized.observations ?? [];
  const withMonthly =
    normalized.monthly && normalized.monthly.length > 0
      ? normalized
      : { ...normalized, monthly: buildMonthlyFromObservations(observations) };
  const base = hasStats(withMonthly.stats)
    ? withMonthly
    : { ...withMonthly, stats: statsFromObservations(observations) };
  return {
    ...base,
    pct_exceeding_plan: pctExceeding(base.observations, base.plan),
  };
}

/** Normalize every node in a product graph (+ default the client-derived pipeline_summary). */
export function ensureGraphStats(graph: RawGraphData): GraphData {
  return {
    ...graph,
    pipeline_summary: graph.pipeline_summary ?? {},
    nodes: graph.nodes.map(ensureNodeStats),
  };
}

/**
 * Fill per-month timing percentiles from observations onto existing monthly
 * buckets, preserving every other column (notably the carrying-cost
 * `total_kg_days`). Dwell steps ship slimmed buckets ({month, n, total_kg_days})
 * and rely on this to rebuild the timing percentiles on load. Buckets with no
 * matching observations (e.g. dwell carry-over months) are left untouched.
 * When there are no buckets at all, falls back to building them from scratch.
 */
function fillMonthlyTiming(
  monthly: MonthlyBucket[] | undefined,
  obs: Observation[],
): MonthlyBucket[] {
  if (!monthly || monthly.length === 0) {
    return buildMonthlyFromObservations(obs);
  }
  const byMonth = new Map<string, number[]>();
  for (const observation of obs) {
    const month = observation.date.slice(0, 7);
    const arr = byMonth.get(month);
    if (arr) {
      arr.push(observation.value);
    } else {
      byMonth.set(month, [observation.value]);
    }
  }
  return monthly.map((bucket) => {
    const vals = byMonth.get(bucket.month);
    if (!vals || vals.length === 0) {
      return bucket;
    }
    const sorted = [...vals].sort((left, right) => left - right);
    return {
      ...bucket,
      mean: round(
        sorted.reduce((left, right) => left + right, 0) / sorted.length,
      ),
      median: round(percentileOf(sorted, 50)),
    };
  });
}

export function deriveTimingFromRecords(step: StepDetail): StepDetail;
export function deriveTimingFromRecords(step: StepDetailWire): StepDetailWire;
export function deriveTimingFromRecords(step: StepDetailWire): StepDetailWire {
  const existingObservations = step.observations ?? [];
  if (existingObservations.length > 0) {
    return step;
  }
  const valueCol = step.value_col;
  const dateCol = step.ref_date_col;
  const rows = step.detail_rows?.rows;
  if (!valueCol || !dateCol || !rows || rows.length === 0) {
    return step;
  }
  if (step.type === "procurement") {
    const derived = deriveProcurementTimingFromRows(rows);
    if (derived) {
      const values = derived.first.map((observation) => observation.value);
      const completeValues = derived.complete.map(
        (observation) => observation.value,
      );
      return {
        ...step,
        observations: derived.first,
        durations: values,
        monthly: buildMonthlyFromObservations(derived.first),
        stats: computeStats(values),
        complete_timing: {
          label: "Full receipt",
          observations: derived.complete,
          monthly: buildMonthlyFromObservations(derived.complete),
          stats: computeStats(completeValues),
        },
      };
    }
  }

  const obs: Observation[] = [];
  for (const row of rows) {
    const day = row[dateCol];
    const value = row[valueCol];
    if (typeof value === "number" && typeof day === "string") {
      obs.push({ date: day, value });
    }
  }
  if (obs.length === 0) {
    return step;
  }
  obs.sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  );
  const values = obs.map((observation) => observation.value);
  return {
    ...step,
    observations: obs,
    durations: values,
    monthly: buildMonthlyFromObservations(obs),
    stats: computeStats(values),
  };
}

/**
 * Fill a step's timing + yield/consumption `stats` from observations when
 * absent, and guarantee the post-load timing invariant. The wire ships only the
 * records-derivable fields (dwell steps keep observations + monthly for
 * total_kg_days; pure-timing steps ship neither and rely on
 * {@link deriveTimingFromRecords}); `durations` is never shipped. This restores
 * `observations`/`durations`/`monthly`/`stats` so every downstream consumer can
 * keep reading them directly.
 */
export function ensureStepStats(step: StepDetailWire): StepDetail {
  const derived = deriveTimingFromRecords(step);
  const observations: Observation[] = derived.observations ?? [];
  const durations: number[] =
    derived.durations ?? observations.map((observation) => observation.value);
  const base = {
    ...derived,
    observations,
    durations,
    monthly: fillMonthlyTiming(derived.monthly, observations),
  };
  const next: StepDetail = hasStats(base.stats)
    ? {
        ...base,
        stats: base.stats,
        pct_exceeding_plan: pctExceeding(base.observations, base.plan),
      }
    : {
        ...base,
        stats: statsFromObservations(base.observations),
        pct_exceeding_plan: pctExceeding(base.observations, base.plan),
      };

  if (next.yield_data) {
    next.yield_data = ensureSeriesStats(next.yield_data) ?? next.yield_data;
  }
  if (next.consumption_data) {
    const agg =
      ensureSeriesStats(next.consumption_data.aggregate) ??
      next.consumption_data.aggregate;
    const components = next.consumption_data.components.map(
      (column) => ensureSeriesStats(column) ?? column,
    );
    next.consumption_data = {
      ...next.consumption_data,
      aggregate: agg,
      components,
    };
  }
  if (next.complete_timing) {
    next.complete_timing =
      ensureTimingSeriesStats(next.complete_timing) ?? next.complete_timing;
  }
  return next;
}
