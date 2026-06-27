import { computePeriodCost } from "./cost";
import { type BaseMeasure, statOf } from "./measure-context";
import { computeStats } from "./stats";
import {
  type TimeRange,
  cutoffForRange,
  monthKeyMonthsAgo,
  rangeMonths,
} from "./time-range";

import type { MonthlyBucket, Observation, SiteNode, StepStats } from "./types";

export { rangeMonths };

/**
 * Current/previous period boundaries (YYYY-MM) for a range, anchored to today.
 * The previous window is the equal-length span immediately before the current one.
 * Single source of truth for the period-over-period comparisons across the app.
 */
export function periodCutoffs(range: TimeRange): {
  currentFrom: string;
  previousFrom: string;
  previousTo: string;
} {
  const months = rangeMonths(range);
  const currentFrom = cutoffForRange(range);
  const previousTo = monthKeyMonthsAgo(months);
  const previousFrom = monthKeyMonthsAgo(months * 2 - 1);

  return { currentFrom, previousFrom, previousTo };
}

/** Median of a list of values (null on empty). */
export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) {
    throw new Error("Median index was outside the provided series");
  }
  if (sorted.length % 2 === 1) {
    return upper;
  }
  const lower = sorted[mid - 1];
  if (lower === undefined) {
    throw new Error("Median lower index was outside the provided series");
  }
  return (lower + upper) / 2;
}

/** Percentage change current-vs-previous (null when undefined or previous is zero). */
export function percentChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current == null || previous == null || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

export type TrendDirection = "improving" | "worsening" | "flat" | "unknown";

/** Classify a percentage change: <5% magnitude is flat, null is unknown. */
export function trendDirection(pctChange: number | null): TrendDirection {
  if (pctChange == null || Math.abs(pctChange) < 5) {
    return pctChange == null ? "unknown" : "flat";
  }
  return pctChange > 0 ? "worsening" : "improving";
}

export interface BaseMeasureTrend {
  pctChange: number | null;
  /** The current-window value of the selected base measure. */
  currentValue: number | null;
  /** The previous-window value of the selected base measure. */
  previousValue: number | null;
  currentN: number;
  previousN: number;
  direction: TrendDirection;
}

/** Timing trend (current vs previous window) for the selected base measure. */
export function computeTrend(
  observations: Observation[],
  range: TimeRange,
  measure: BaseMeasure = "median",
): BaseMeasureTrend {
  const { currentFrom, previousFrom, previousTo } = periodCutoffs(range);
  const currentValues = observations
    .filter((observation) => observation.date.slice(0, 7) >= currentFrom)
    .map((observation) => observation.value);
  const previousValues = observations
    .filter((observation) => {
      const month = observation.date.slice(0, 7);
      return month >= previousFrom && month <= previousTo;
    })
    .map((observation) => observation.value);
  const currentValue = statOf(currentValues, measure);
  const previousValue = statOf(previousValues, measure);
  const pctChange = percentChange(currentValue, previousValue);

  return {
    pctChange,
    currentValue,
    previousValue,
    currentN: currentValues.length,
    previousN: previousValues.length,
    direction: trendDirection(pctChange),
  };
}

export interface TimingTrend {
  pctChange: number | null;
  currentValue: number | null;
  previousValue: number | null;
  currentN: number;
  previousN: number;
}

/** Timing trend for a site node's shipped observations, for the selected measure. */
export function computeTimingTrend(
  node: SiteNode,
  timeRange: TimeRange,
  measure: BaseMeasure = "median",
): TimingTrend {
  const trend = computeTrend(node.observations ?? [], timeRange, measure);
  return {
    pctChange: trend.pctChange,
    currentValue: trend.currentValue,
    previousValue: trend.previousValue,
    currentN: trend.currentN,
    previousN: trend.previousN,
  };
}

export interface CostTrend {
  pctChange: number | null;
  currentTotal: number | null;
  previousTotal: number | null;
  currentN: number;
  previousN: number;
}

/** Carrying-cost trend for a site node over the current vs previous window. */
export function computeCostTrend(
  node: SiteNode,
  timeRange: TimeRange,
  waccRate: number,
  storageCost: number,
): CostTrend {
  const monthly =
    node.monthly?.filter((month) => month.total_kg_days != null) ?? [];
  if (monthly.length === 0) {
    return {
      pctChange: null,
      currentTotal: null,
      previousTotal: null,
      currentN: 0,
      previousN: 0,
    };
  }
  const { currentFrom, previousFrom, previousTo } = periodCutoffs(timeRange);
  const sumCost = (from: string, to?: string) => {
    const buckets = monthly.filter(
      (month) => month.month >= from && (to == null || month.month <= to),
    );
    if (buckets.length === 0) {
      return { total: null as number | null, n: 0 };
    }
    const total = computePeriodCost(
      buckets,
      node.cost?.unit_price,
      waccRate,
      storageCost,
    );
    return { total, n: buckets.reduce((sum, month) => sum + month.n, 0) };
  };
  const current = sumCost(currentFrom);
  const previous = sumCost(previousFrom, previousTo);
  return {
    pctChange: percentChange(current.total, previous.total),
    currentTotal: current.total,
    previousTotal: previous.total,
    currentN: current.n,
    previousN: previous.n,
  };
}

export interface PeriodComparison {
  medianPctChange: number | null;
  statDeltas: Record<string, number | null>;
  previousStats: StepStats | null;
  currentRange: { from: string; to: string } | null;
  previousRange: { from: string; to: string } | null;
}

/** Full stat-by-stat deltas (mean/median/std/p75/p95/max) current vs previous. */
export function computePeriodDeltas(
  observations: Observation[],
  range: TimeRange,
): PeriodComparison {
  const { currentFrom, previousFrom, previousTo } = periodCutoffs(range);

  const currentObs = observations.filter(
    (observation) => observation.date.slice(0, 7) >= currentFrom,
  );
  const prevObs = observations.filter((observation) => {
    const month = observation.date.slice(0, 7);
    return month >= previousFrom && month <= previousTo;
  });

  const currentStats = computeStats(
    currentObs.map((observation) => observation.value),
  );
  const prevStats = computeStats(
    prevObs.map((observation) => observation.value),
  );

  const pctDelta = (curr: number, prev: number) => {
    if (prev === 0) {
      return null;
    }
    return ((curr - prev) / prev) * 100;
  };

  const hasPrev = prevStats.n > 0;
  const hasCurrent = currentStats.n > 0;

  const now = new Date().toISOString().slice(0, 7);
  const currentRange = hasCurrent ? { from: currentFrom, to: now } : null;
  const previousRange = hasPrev ? { from: previousFrom, to: previousTo } : null;

  if (!hasCurrent || !hasPrev) {
    return {
      medianPctChange: null,
      statDeltas: {},
      previousStats: hasPrev ? prevStats : null,
      currentRange,
      previousRange,
    };
  }

  const keys: (keyof StepStats)[] = [
    "min",
    "mean",
    "median",
    "std",
    "p75",
    "p95",
    "max",
  ];

  const statDeltas: Record<string, number | null> = {};
  for (const key of keys) {
    statDeltas[key] = pctDelta(
      currentStats[key] as number,
      prevStats[key] as number,
    );
  }

  return {
    medianPctChange: statDeltas.median ?? null,
    statDeltas,
    previousStats: prevStats,
    currentRange,
    previousRange,
  };
}

/** Carrying-cost delta (current vs previous window) from unfiltered monthly cost buckets. */
export function computeCostComparison(
  unfilteredCostMonthly: MonthlyBucket[] | undefined,
  unitPrice: number | null | undefined,
  waccRate: number,
  storageCost: number,
  range: TimeRange,
): { delta: number | null; previousTotal: number | null } {
  if (!unfilteredCostMonthly || unfilteredCostMonthly.length === 0) {
    return { delta: null, previousTotal: null };
  }
  const { currentFrom, previousFrom, previousTo } = periodCutoffs(range);
  const currentMonths = unfilteredCostMonthly.filter(
    (month) => month.month >= currentFrom,
  );
  const prevMonths = unfilteredCostMonthly.filter(
    (month) => month.month >= previousFrom && month.month <= previousTo,
  );

  if (currentMonths.length === 0 || prevMonths.length === 0) {
    return { delta: null, previousTotal: null };
  }

  const currentTotal = computePeriodCost(
    currentMonths,
    unitPrice,
    waccRate,
    storageCost,
  );
  const prevTotal = computePeriodCost(
    prevMonths,
    unitPrice,
    waccRate,
    storageCost,
  );
  if (prevTotal === 0) {
    return { delta: null, previousTotal: prevTotal };
  }
  return {
    delta: ((currentTotal - prevTotal) / prevTotal) * 100,
    previousTotal: prevTotal,
  };
}
