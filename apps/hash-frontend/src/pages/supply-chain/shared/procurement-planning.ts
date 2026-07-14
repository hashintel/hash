import { percentileOf, round } from "./stats";

import type { Observation } from "./types";

export interface ProcurementPlanningSummary {
  observationCount: number;
  plannedCount: number;
  matchedCount: number;
  fallbackCount: number;
  coveragePct: number | null;
  matchedCoveragePct: number | null;
  pctExceedingPlan: number | null;
  meanVarianceDays: number | null;
  medianVarianceDays: number | null;
  meanVariancePct: number | null;
  medianVariancePct: number | null;
  applicablePlan: number | null;
  planMin: number | null;
  planMax: number | null;
}

/** Zero is a configured parameter and remains displayable even though % variance is undefined. */
export function shouldShowProcurementPlanningRow(
  plan: number | null | undefined,
  observationCount: number,
): boolean {
  return plan != null && observationCount > 0;
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return round(
    percentileOf(
      [...values].sort((a, b) => a - b),
      50,
    ),
  );
}

/**
 * Compare each procurement observation with its own applicable parameter.
 */
export function summarizeProcurementPlanning(
  observations: Observation[] | null | undefined,
): ProcurementPlanningSummary {
  const input = observations ?? [];
  const planned = input.flatMap((observation) => {
    const plan = observation.plan_days;
    return plan == null ? [] : [{ observation, plan }];
  });
  const residuals = planned.map(
    ({ observation, plan }) =>
      observation.variance_days ?? observation.value - plan,
  );
  const percentageResiduals = planned.flatMap(({ observation, plan }) =>
    plan > 0 ? [((observation.value - plan) / plan) * 100] : [],
  );
  const plans = planned.map(({ plan }) => plan);
  const distinctPlans = new Set(plans);
  const matchedCount = planned.filter(
    ({ observation }) => observation.plan_provenance === "profile",
  ).length;
  const fallbackCount = planned.filter(
    ({ observation }) => observation.plan_provenance === "fallback",
  ).length;

  return {
    observationCount: input.length,
    plannedCount: planned.length,
    matchedCount,
    fallbackCount,
    coveragePct:
      input.length > 0 ? round((planned.length / input.length) * 100) : null,
    matchedCoveragePct:
      planned.length > 0 ? round((matchedCount / planned.length) * 100) : null,
    pctExceedingPlan:
      planned.length > 0
        ? round(
            (planned.filter(({ observation, plan }) => observation.value > plan)
              .length /
              planned.length) *
              100,
          )
        : null,
    meanVarianceDays: mean(residuals),
    medianVarianceDays: median(residuals),
    meanVariancePct: mean(percentageResiduals),
    medianVariancePct: median(percentageResiduals),
    applicablePlan: distinctPlans.size === 1 ? (plans[0] ?? null) : null,
    planMin: plans.length > 0 ? Math.min(...plans) : null,
    planMax: plans.length > 0 ? Math.max(...plans) : null,
  };
}
