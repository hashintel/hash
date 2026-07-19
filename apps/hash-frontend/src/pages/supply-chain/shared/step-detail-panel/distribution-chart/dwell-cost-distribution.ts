import { computeMonthlyCost } from "../../cost";

import type { StepDetail } from "../../types";

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function observationKey(date: string, value: number): string {
  return `${date.slice(0, 10)}::${value}`;
}

export function dwellCostDistributionValues(
  step: StepDetail,
  waccRate: number,
  storageCost: number,
): number[] {
  const detailRows = step.detail_rows;
  const dateColumn = step.ref_date_col;
  const valueColumn = step.value_col;
  if (!detailRows || !dateColumn || !valueColumn) {
    return [];
  }

  const remainingObservations = new Map<string, number>();
  for (const observation of step.observations) {
    const key = observationKey(observation.date, observation.value);
    remainingObservations.set(key, (remainingObservations.get(key) ?? 0) + 1);
  }

  return detailRows.rows.flatMap((row) => {
    const date = row[dateColumn];
    const duration = numberValue(row[valueColumn]);
    const kgDays = numberValue(row.kg_days);
    if (typeof date !== "string" || duration == null || kgDays == null) {
      return [];
    }

    const key = observationKey(date, duration);
    const remaining = remainingObservations.get(key) ?? 0;
    if (remaining === 0) {
      return [];
    }
    remainingObservations.set(key, remaining - 1);

    const cost = computeMonthlyCost(
      kgDays,
      step.cost?.unit_price,
      waccRate,
      storageCost,
    );
    return cost == null ? [] : [cost];
  });
}
