import {
  applyOutlierSelectionToNode,
  applyOutlierSelectionToStep,
} from "./outlier-selection";
import { procurementNodeObservationsForBasis } from "./procurement-observations";
import { computeStats, percentileOf, round } from "./stats";
import { cutoffForRange, type TimeRange } from "./time-range";

import type { ProcurementBasis } from "./procurement-basis-context";
import type {
  StepDetail,
  GraphNode,
  Observation,
  MonthlyBucket,
  StepStats,
  YieldData,
  ConsumptionData,
  ComponentConsumption,
  YieldSummary,
  ConsumptionSummary,
  TimingSeries,
} from "./types";

function pctExceeding(
  values: number[],
  threshold: number | null,
): number | null {
  if (threshold == null || values.length === 0) {
    return null;
  }
  return round(
    (100 * values.filter((value) => value > threshold).length) / values.length,
  );
}

function pctExceedingForObservations(
  observations: Observation[],
  plan: number | null,
): number | null {
  return pctExceeding(
    observations.map((observation) => observation.value),
    plan,
  );
}

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

function filterObservationsByCutoff(
  obs: Observation[],
  monthly: MonthlyBucket[],
  cutoff: string,
): {
  observations: Observation[];
  values: number[];
  monthly: MonthlyBucket[];
  stats: StepStats;
} {
  const filtered = obs.filter(
    (observation) => observation.date.slice(0, 7) >= cutoff,
  );
  const values = filtered.map((observation) => observation.value);
  return {
    observations: filtered,
    values,
    monthly: monthly.filter((month) => month.month >= cutoff),
    stats: computeStats(values),
  };
}

function filterYieldData(yd: YieldData, cutoff: string): YieldData {
  const row = filterObservationsByCutoff(yd.observations, yd.monthly, cutoff);
  return {
    ...yd,
    values: row.values,
    observations: row.observations,
    monthly: row.monthly,
    stats: row.stats,
  };
}

function filterComponentReconciliationCounts(
  comp: ComponentConsumption,
  cutoff: string,
): Partial<ComponentConsumption> {
  const rows = comp.detail_rows?.rows ?? [];
  if (!rows.length) {
    return {};
  }

  const windowRows = rows.filter((row) => {
    const rawDate = row.finish_date;
    return typeof rawDate === "string" && rawDate.slice(0, 7) >= cutoff;
  });
  const orderIds = new Set<string>();
  const planned = new Set<string>();
  const consumed = new Set<string>();
  const offBom = new Set<string>();
  const plannedNotConsumed = new Set<string>();
  const unplanned = new Set<string>();

  for (const row of windowRows) {
    const aufnr =
      typeof row.aufnr === "string" || typeof row.aufnr === "number"
        ? String(row.aufnr)
        : null;
    if (!aufnr) {
      continue;
    }
    orderIds.add(aufnr);
    const status = String(row.status ?? "");
    if (row.planned_qty != null) {
      planned.add(aufnr);
    }
    if (row.actual_qty != null) {
      consumed.add(aufnr);
    }
    if (status === "off-BOM") {
      offBom.add(aufnr);
    }
    if (status === "planned, not consumed") {
      plannedNotConsumed.add(aufnr);
    }
    if (status === "unplanned") {
      unplanned.add(aufnr);
    }
  }

  return {
    n_reconciliation_events: orderIds.size,
    n_orders_planned: planned.size,
    n_orders_consumed: consumed.size,
    n_orders_off_bom: offBom.size,
    n_orders_planned_not_consumed: plannedNotConsumed.size,
    n_orders_unplanned: unplanned.size,
  };
}

function filterComponentConsumption(
  comp: ComponentConsumption,
  cutoff: string,
): ComponentConsumption {
  const row = filterObservationsByCutoff(
    comp.observations,
    comp.monthly,
    cutoff,
  );
  return {
    ...comp,
    ...filterComponentReconciliationCounts(comp, cutoff),
    values: row.values,
    observations: row.observations,
    monthly: row.monthly,
    stats: row.stats,
  };
}

function weightedVarianceFromObservations(obs: Observation[]): number | null {
  const totals = obs.reduce(
    (acc, observation) => {
      acc.actual += observation.actual_qty ?? 0;
      acc.expected += observation.expected_qty ?? 0;
      return acc;
    },
    { actual: 0, expected: 0 },
  );
  if (totals.expected <= 0) {
    return null;
  }
  return round(((totals.actual - totals.expected) / totals.expected) * 100);
}

function filterConsumptionData(
  cd: ConsumptionData,
  cutoff: string,
): ConsumptionData {
  const components = cd.components.map((column) =>
    filterComponentConsumption(column, cutoff),
  );
  const aggObs = cd.aggregate.observations.filter(
    (observation) => observation.date.slice(0, 7) >= cutoff,
  );
  const aggValues = aggObs.map((observation) => observation.value);
  const monthly = cd.aggregate.monthly.filter((month) => month.month >= cutoff);

  // Window the raw per-order rows so the off-BOM / substitution callouts are
  // window-aware (matching how weighted_variance_pct is recomputed above). The
  // off_bom_components list stays as the backend all-time reference because the
  // per-component series is matched-only and would under-count unplanned rows.
  const allOrders = cd.aggregate.orders;
  let windowed: Partial<ConsumptionData["aggregate"]> = {};
  if (allOrders) {
    const windowOrders = allOrders.filter(
      (observation) => observation.date.slice(0, 7) >= cutoff,
    );
    let nOffBom = 0;
    let nPnc = 0;
    let nUnplanned = 0;
    let nSub = 0;
    for (const observation of windowOrders) {
      if (observation.off_bom) {
        nOffBom += 1;
      }
      if (observation.planned_not_consumed) {
        nPnc += 1;
      }
      if (observation.unplanned) {
        nUnplanned += 1;
      }
      if (observation.substitution) {
        nSub += 1;
      }
    }
    windowed = {
      orders: windowOrders,
      n_orders: windowOrders.length,
      n_orders_off_bom: nOffBom,
      n_orders_planned_not_consumed: nPnc,
      n_orders_unplanned: nUnplanned,
      n_orders_substitution: nSub,
    };
  }

  return {
    components,
    aggregate: {
      ...cd.aggregate,
      values: aggValues,
      observations: aggObs,
      monthly,
      stats: computeStats(aggValues),
      weighted_variance_pct: weightedVarianceFromObservations(aggObs),
      ...windowed,
    },
  };
}

/**
 * Procurement step counterpart of {@link applyProcurementBasisToNode}. When the
 * basis is "complete", promotes the full-receipt series to the headline
 * (durations/observations/monthly/stats) and parks the first-receipt series in
 * `complete_timing` so the slideover's secondary cell shows the *other* basis.
 * No-op for any other basis / non-procurement step / step without
 * `complete_timing`.
 */
export function applyProcurementBasisToStep(
  step: StepDetail,
  basis: ProcurementBasis,
): StepDetail {
  if (
    basis !== "complete" ||
    step.type !== "procurement" ||
    !step.complete_timing
  ) {
    return step;
  }
  const comp = step.complete_timing;
  const first: TimingSeries = {
    label: "First receipt",
    observations: step.observations,
    monthly: step.monthly,
    stats: step.stats,
  };
  const values = comp.observations.map((observation) => observation.value);
  return {
    ...step,
    durations: values,
    observations: comp.observations,
    monthly: comp.monthly,
    stats: comp.stats,
    pct_exceeding_plan: pctExceedingForObservations(
      comp.observations,
      step.plan,
    ),
    complete_timing: first,
  };
}

/** Outlier selection followed by date-range windowing (for raw, unprocessed steps). */

/**
 * Window an (already outlier-selected) step to a `TimeRange`, recomputing
 * stats/cost/yield/consumption for the window. Does not re-run outlier
 * selection, so callers that pre-applied it are not double-processed.
 */

function filterTimingSeries(ts: TimingSeries, cutoff: string): TimingSeries {
  const { observations, monthly, stats } = filterObservationsByCutoff(
    ts.observations,
    ts.monthly,
    cutoff,
  );
  return { ...ts, observations, monthly, stats };
}

/**
 * Recompute a production node's `yield_summary` from its windowed (and, when the
 * caller pre-applied it, outlier-filtered) yield series. Returns undefined when
 * the node carries no series (e.g. non-production nodes), so the caller leaves
 * the node's summary untouched. Empty windows collapse the summary to null so
 * the badge hides.
 */ export function windowStepToRange(
  selectedStep: StepDetail,
  range: TimeRange,
): StepDetail {
  const cutoff = cutoffForRange(range);
  const hasObservations = selectedStep.observations.length > 0;
  if (!hasObservations) {
    return selectedStep;
  }
  const filtered = selectedStep.observations.filter(
    (observation: Observation) => observation.date.slice(0, 7) >= cutoff,
  );
  const values = filtered.map((observation: Observation) => observation.value);
  const stats = computeStats(values);
  const filteredMonthly: MonthlyBucket[] = selectedStep.monthly.filter(
    (month) => month.month >= cutoff,
  );
  const filteredYield = selectedStep.yield_data
    ? filterYieldData(selectedStep.yield_data, cutoff)
    : selectedStep.yield_data;
  const filteredConsumption = selectedStep.consumption_data
    ? filterConsumptionData(selectedStep.consumption_data, cutoff)
    : selectedStep.consumption_data;
  const filteredCompleteTiming = selectedStep.complete_timing
    ? filterTimingSeries(selectedStep.complete_timing, cutoff)
    : selectedStep.complete_timing;
  return {
    ...selectedStep,
    durations: values,
    observations: filtered,
    monthly: filteredMonthly,
    stats,
    cost: selectedStep.cost,
    pct_exceeding_plan: pctExceedingForObservations(
      filtered,
      selectedStep.plan,
    ),
    yield_data: filteredYield,
    consumption_data: filteredConsumption,
    complete_timing: filteredCompleteTiming,
  };
}
/** Window a secondary {@link TimingSeries} to a cutoff month, recomputing stats. */ export function filterStepByDateRange(
  step: StepDetail,
  range: TimeRange,
  excludeOutliers = true,
  basis: ProcurementBasis = "first",
): StepDetail {
  return windowStepToRange(
    applyOutlierSelectionToStep(
      applyProcurementBasisToStep(step, basis),
      excludeOutliers,
    ),
    range,
  );
}
function recomputeYieldSummary(
  series: GraphNode["yield_series"],
  cutoff: string,
): YieldSummary | null | undefined {
  if (!series) {
    return undefined;
  }
  const obs = series.observations.filter(
    (observation) => observation.date.slice(0, 7) >= cutoff,
  );
  if (obs.length === 0) {
    return null;
  }
  const stats = computeStats(obs.map((observation) => observation.value));
  return {
    median: stats.median ?? 0,
    mean: stats.mean ?? 0,
    reference: series.reference,
    n: stats.n,
  };
}

/** Consumption counterpart of {@link recomputeYieldSummary}. */
function recomputeConsumptionSummary(
  series: GraphNode["consumption_series"],
  cutoff: string,
): ConsumptionSummary | null | undefined {
  if (!series) {
    return undefined;
  }
  const obs = series.observations.filter(
    (observation) => observation.date.slice(0, 7) >= cutoff,
  );
  if (obs.length === 0) {
    return null;
  }
  const stats = computeStats(obs.map((observation) => observation.value));
  return {
    median_variance: stats.median ?? 0,
    mean_variance: stats.mean ?? 0,
    weighted_variance: weightedVarianceFromObservations(obs),
    n_components: series.n_components,
    n: stats.n,
  };
}

/**
 * Select a procurement node's headline timing basis from the combined
 * first/last receipt observations. Applied before outlier selection + windowing
 * so the entire downstream pipeline operates on the selected basis.
 */
export function applyProcurementBasisToNode(
  node: GraphNode,
  basis: ProcurementBasis,
): GraphNode {
  if (node.type !== "procurement" || !node.procurement_observations) {
    return node;
  }
  const observations = procurementNodeObservationsForBasis(
    node.procurement_observations,
    basis,
  );
  const values = observations.map((observation) => observation.value);
  return {
    ...node,
    observations,
    monthly: buildMonthlyFromObservations(observations),
    stats: computeStats(values),
    pct_exceeding_plan: pctExceedingForObservations(observations, node.plan),
  };
}

/** Outlier selection followed by date-range windowing (for raw, unprocessed nodes). */

/**
 * Window an (already outlier-selected) node to a `TimeRange`. Does not re-run
 * outlier selection, so pre-applied nodes are not double-processed.
 */
export function windowGraphNodeToRange(
  selectedNode: GraphNode,
  range: TimeRange,
): GraphNode {
  const cutoff = cutoffForRange(range);
  const obs = selectedNode.observations ?? [];
  if (obs.length === 0) {
    return selectedNode;
  }

  const filtered = obs.filter(
    (observation: Observation) => observation.date.slice(0, 7) >= cutoff,
  );
  const values = filtered.map((observation: Observation) => observation.value);
  const stats = computeStats(values);
  const filteredMonthly = (selectedNode.monthly ?? []).filter(
    (month) => month.month >= cutoff,
  );

  // Recompute the R:/C: badge summaries from the windowed series when present;
  // `undefined` means "no series shipped" -> keep the node's existing summary.
  const yieldSummary = recomputeYieldSummary(selectedNode.yield_series, cutoff);
  const consumptionSummary = recomputeConsumptionSummary(
    selectedNode.consumption_series,
    cutoff,
  );

  return {
    ...selectedNode,
    stats,
    observations: filtered,
    monthly: filteredMonthly,
    cost: selectedNode.cost,
    pct_exceeding_plan: pctExceedingForObservations(
      filtered,
      selectedNode.plan,
    ),
    ...(yieldSummary !== undefined ? { yield_summary: yieldSummary } : {}),
    ...(consumptionSummary !== undefined
      ? { consumption_summary: consumptionSummary }
      : {}),
  };
}
export function filterGraphNodeByDateRange(
  node: GraphNode,
  range: TimeRange,
  excludeOutliers = true,
  basis: ProcurementBasis = "first",
): GraphNode {
  return windowGraphNodeToRange(
    applyOutlierSelectionToNode(
      applyProcurementBasisToNode(node, basis),
      excludeOutliers,
    ),
    range,
  );
}
