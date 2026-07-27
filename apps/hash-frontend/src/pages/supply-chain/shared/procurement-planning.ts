import { percentileOf, round } from "./stats";

import type { Observation } from "./types";

export interface ProcurementPlanningSummary {
  pctExceedingPlan: number | null;
  meanVariancePct: number | null;
  medianVariancePct: number | null;
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

/** Compare a procurement profile's observations with its node-level parameter. */
export function summarizeProcurementPlanning(
  observations: Observation[] | null | undefined,
  planDays: number | null | undefined,
): ProcurementPlanningSummary {
  const input = observations ?? [];
  const hasPlan = planDays != null;
  const plan = planDays ?? 0;
  const planned = hasPlan ? input : [];
  const percentageResiduals =
    hasPlan && plan > 0
      ? planned.map((observation) => ((observation.value - plan) / plan) * 100)
      : [];

  return {
    pctExceedingPlan:
      planned.length > 0
        ? round(
            (planned.filter((observation) => observation.value > plan).length /
              planned.length) *
              100,
          )
        : null,
    meanVariancePct: mean(percentageResiduals),
    medianVariancePct: median(percentageResiduals),
  };
}
