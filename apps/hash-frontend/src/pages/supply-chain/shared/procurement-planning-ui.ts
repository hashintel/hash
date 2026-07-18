import { formatNumber } from "./cost";

import type {
  PlanningWarning,
  ProcurementPlanningAlternative,
  ProcurementPlanningSource,
} from "./types";

const PROCUREMENT_LABEL_SEPARATOR = " — ";

export function procurementStepDisplayLabel(
  label: string,
  presentation: "compact" | "qualified",
): string {
  if (presentation === "compact") {
    return label.split(PROCUREMENT_LABEL_SEPARATOR)[0] ?? label;
  }
  return label.split(PROCUREMENT_LABEL_SEPARATOR).join(" / ");
}

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
