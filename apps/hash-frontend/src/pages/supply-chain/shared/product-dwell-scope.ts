import { isDwellType } from "./categories";
import { computeStats } from "./stats";

import type {
  DetailRows,
  GraphNode,
  MonthlyBucket,
  Observation,
  StepDetail,
} from "./types";

interface DwellProductScope {
  productMaterial?: string | null;
  productName?: string | null;
}

const DWELL_DATE_KEY = "consumption_date";
const DWELL_VALUE_KEY = "dwell_days";
const DWELL_KG_DAYS_KEY = "kg_days";
const CONSUMING_MATERIAL_KEY = "cons_matnr";
const CONSUMING_MATERIAL_NAME_KEY = "cons_material_name";
const CURRENT_RECIPE_KEY = "cons_in_current_recipe";

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function recipeMembershipValue(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === 0 || value === "0") {
    return false;
  }
  return null;
}

function hasColumn(detailRows: DetailRows, key: string): boolean {
  return detailRows.columns.some((column) => column.key === key);
}

function canScopeDwellRows(detailRows: DetailRows): boolean {
  return (
    hasColumn(detailRows, DWELL_DATE_KEY) &&
    hasColumn(detailRows, DWELL_VALUE_KEY) &&
    hasColumn(detailRows, DWELL_KG_DAYS_KEY) &&
    (hasColumn(detailRows, CURRENT_RECIPE_KEY) ||
      hasColumn(detailRows, CONSUMING_MATERIAL_KEY) ||
      hasColumn(detailRows, CONSUMING_MATERIAL_NAME_KEY))
  );
}

function matchesCurrentProduct(
  row: DetailRows["rows"][number],
  scope: DwellProductScope,
): boolean {
  const productMaterial = stringValue(scope.productMaterial);
  const productName = stringValue(scope.productName);
  const consumingMaterial = stringValue(row[CONSUMING_MATERIAL_KEY]);
  const consumingMaterialName = stringValue(row[CONSUMING_MATERIAL_NAME_KEY]);

  return (
    (productMaterial != null && consumingMaterial === productMaterial) ||
    (productName != null && consumingMaterialName === productName)
  );
}

function shouldKeepDwellRow(
  row: DetailRows["rows"][number],
  scope: DwellProductScope,
): boolean {
  const recipeMembership = recipeMembershipValue(row[CURRENT_RECIPE_KEY]);
  if (recipeMembership === false) {
    return false;
  }
  if (recipeMembership === true) {
    return true;
  }
  return matchesCurrentProduct(row, scope);
}

function monthlyFromDwellRows(rows: DetailRows["rows"]): MonthlyBucket[] {
  const valuesByMonth = new Map<string, number[]>();
  const kgDaysByMonth = new Map<string, number>();

  for (const row of rows) {
    const date = stringValue(row[DWELL_DATE_KEY]);
    const value = numberValue(row[DWELL_VALUE_KEY]);
    if (!date || value == null) {
      continue;
    }
    const month = date.slice(0, 7);
    const monthValues = valuesByMonth.get(month);
    if (monthValues) {
      monthValues.push(value);
    } else {
      valuesByMonth.set(month, [value]);
    }
    kgDaysByMonth.set(
      month,
      (kgDaysByMonth.get(month) ?? 0) +
        (numberValue(row[DWELL_KG_DAYS_KEY]) ?? 0),
    );
  }

  return [...valuesByMonth.entries()]
    .sort(([leftMonth], [rightMonth]) => leftMonth.localeCompare(rightMonth))
    .map(([month, values]) => {
      const stats = computeStats(values);
      return {
        month,
        mean: stats.mean,
        median: stats.median,
        n: stats.n,
        total_kg_days: kgDaysByMonth.get(month) ?? 0,
      };
    });
}

function observationsFromDwellRows(rows: DetailRows["rows"]): Observation[] {
  return rows.flatMap((row) => {
    const date = stringValue(row[DWELL_DATE_KEY]);
    const value = numberValue(row[DWELL_VALUE_KEY]);
    if (!date || value == null) {
      return [];
    }
    return [{ date, value }];
  });
}

function pctExceedingPlan(
  observations: Observation[],
  plan: number | null,
): number | null {
  if (plan == null || observations.length === 0) {
    return null;
  }
  return (
    Math.round(
      (1000 *
        observations.filter((observation) => observation.value > plan).length) /
        observations.length,
    ) / 10
  );
}

/**
 * Scope dwell detail rows to the active product contract. Product-specific step
 * artifacts can contain material-pool evidence, so this rebuilds every timing
 * field from retained rows instead of only trimming the table payload.
 */
export function scopeDwellStepToProduct(
  step: StepDetail,
  scope: DwellProductScope,
): StepDetail {
  if (!isDwellType(step.type) || !step.detail_rows) {
    return step;
  }
  if (!canScopeDwellRows(step.detail_rows)) {
    return step;
  }

  const scopedRows = step.detail_rows.rows.filter((row) =>
    shouldKeepDwellRow(row, scope),
  );
  const observations = observationsFromDwellRows(scopedRows).sort(
    (left, right) => left.date.localeCompare(right.date),
  );
  const values = observations.map((observation) => observation.value);

  return {
    ...step,
    detail_rows: {
      ...step.detail_rows,
      rows: scopedRows,
    },
    observations,
    durations: values,
    monthly: monthlyFromDwellRows(scopedRows),
    stats: computeStats(values),
    pct_exceeding_plan: pctExceedingPlan(observations, step.plan),
  };
}

export function scopeDwellNodeToProduct(
  node: GraphNode,
  step: StepDetail,
  scope: DwellProductScope,
): GraphNode {
  if (!isDwellType(node.type) || !step.detail_rows) {
    return node;
  }
  if (!canScopeDwellRows(step.detail_rows)) {
    return node;
  }

  const scopedRows = step.detail_rows.rows.filter((row) =>
    shouldKeepDwellRow(row, scope),
  );
  const observations = observationsFromDwellRows(scopedRows).sort(
    (left, right) => left.date.localeCompare(right.date),
  );
  const values = observations.map((observation) => observation.value);

  return {
    ...node,
    observations,
    monthly: monthlyFromDwellRows(scopedRows),
    stats: computeStats(values),
    pct_exceeding_plan: pctExceedingPlan(observations, node.plan),
  };
}
