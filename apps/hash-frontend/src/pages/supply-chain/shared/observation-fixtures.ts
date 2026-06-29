import { computeStats } from "./stats";

import type {
  GraphNode,
  MonthlyBucket,
  Observation,
  StepDetail,
  StepStats,
  TimingSeries,
} from "./types";

/** Shared fixtures for the stats / outlier-selection / range-filter tests. */

export const emptyStats: StepStats = {
  n: 0,
  mean: 0,
  median: 0,
  std: 0,
  min: 0,
  max: 0,
  p25: 0,
  p75: 0,
  p85: 0,
  p95: 0,
};

export function obs(month: string, value: number): Observation {
  return { date: `${month}-15`, value };
}

export function bucket(month: string): MonthlyBucket {
  return { month, mean: null, median: null, n: 1 };
}

export function stepFrom(observations: Observation[]): StepDetail {
  const months = [
    ...new Set(observations.map((observation) => observation.date.slice(0, 7))),
  ].sort();
  const values = observations.map((observation) => observation.value);
  return {
    id: "s1",
    label: "Step",
    type: "transit",
    durations: values,
    observations,
    monthly: months.map(bucket),
    stats: computeStats(values),
    plan: null,
    plan_note: null,
    pct_exceeding_plan: null,
    cost: null,
  };
}

export function timingSeriesFrom(
  observations: Observation[],
  label = "Full receipt (PO complete)",
): TimingSeries {
  const months = [
    ...new Set(observations.map((observation) => observation.date.slice(0, 7))),
  ].sort();
  return {
    label,
    observations,
    monthly: months.map(bucket),
    stats: computeStats(observations.map((observation) => observation.value)),
  };
}

export function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "n1",
    label: "Node",
    type: "intermediate_dwell",
    material: null,
    plant: "PL-A",
    stats: emptyStats,
    plan: null,
    plan_note: null,
    pct_exceeding_plan: null,
    cost: null,
    observations: [
      obs("2026-01", 10),
      obs("2026-02", 12),
      obs("2026-03", 11),
      obs("2026-04", 13),
    ],

    monthly: [
      bucket("2026-01"),
      bucket("2026-02"),
      bucket("2026-03"),
      bucket("2026-04"),
    ],

    ...overrides,
  };
}
