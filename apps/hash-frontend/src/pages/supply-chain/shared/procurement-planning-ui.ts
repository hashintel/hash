import { formatNumber } from "./cost";

import type {
  PlanningWarning,
  ProcurementPlanningAlternative,
  ProcurementPlanningSource,
} from "./types";

function planningValueLabel(value: number | null): string {
  return value == null
    ? "–"
    : `${formatNumber(value, { maximumFractionDigits: 1 })} days`;
}

export function procurementPlanningTooltipLines(
  source: ProcurementPlanningSource | null | undefined,
  alternatives: ProcurementPlanningAlternative[] | null | undefined,
): string[] {
  const lines: string[] = [];
  if (source?.label) {
    lines.push(
      `Applicable — ${source.label}: ${planningValueLabel(source.plan_days)}`,
    );
  }

  const seen = new Set<string>();
  for (const alternative of alternatives ?? []) {
    const key = `${alternative.label}\u0000${String(alternative.plan_days)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    lines.push(
      `Alternative — ${alternative.label}: ${planningValueLabel(alternative.plan_days)}`,
    );
  }
  return lines;
}

export function planningWarningTexts(
  warnings: PlanningWarning[] | null | undefined,
): string[] {
  return Array.from(
    new Set(
      (warnings ?? [])
        .filter(({ level }) => level === "warning")
        .map(({ text }) => text)
        .filter(Boolean),
    ),
  );
}

export function observedSpreadNote(values: number[]): string | null {
  const vals = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const count = vals.length;
  if (count < 10) {
    return null;
  }
  const percentile = (product: number) => {
    const idx = Math.min(
      count - 1,
      Math.max(0, Math.round((product / 100) * (count - 1))),
    );
    const value = vals[idx];
    if (value === undefined) {
      throw new Error(
        "Percentile index was outside the observed spread series",
      );
    }
    return value;
  };
  const median = percentile(50);
  const p25 = percentile(25);
  const p75 = percentile(75);
  const fmtDays = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: Number.isInteger(value) ? 0 : 1 })}d`;
  return `Median ${fmtDays(median)} · middle 50% of events: ${fmtDays(p25)}–${fmtDays(p75)} · n=${count}`;
}
