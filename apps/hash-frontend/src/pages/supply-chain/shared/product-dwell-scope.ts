import { isDwellType } from "./categories";
import { computeStats } from "./stats";

import type {
  DetailRows,
  GraphNode,
  MonthlyBucket,
  Observation,
  StepDetail,
  StepType,
} from "./types";

interface DwellProductScope {
  productMaterial?: string | null;
  productName?: string | null;
}

/**
 * Dwell steps specific to a single finished good, so their open carry is
 * confidently attributable on that FG's product view (unlike shared raw /
 * intermediate dwell, where open stock can't be pinned to one product).
 */
const FG_SPECIFIC_DWELL_TYPES: StepType[] = [
  "post_qa_ship",
  "destination_dwell",
];

/** Whether a product-scoped dwell view should scope its open carry in. */
export function dwellStepScopesOpenCarryOnProduct(type: StepType): boolean {
  return FG_SPECIFIC_DWELL_TYPES.includes(type);
}

const DWELL_KG_DAYS_KEY = "kg_days";
const CARRY_STATUS_KEY = "carry_status";
const OPEN_QTY_KEY = "open_qty";
const OPEN_DAYS_KEY = "open_days";
const CONSUMING_MATERIAL_KEY = "cons_matnr";
const CONSUMING_MATERIAL_NAME_KEY = "cons_material_name";
const CURRENT_RECIPE_KEY = "cons_in_current_recipe";

const MS_PER_DAY = 86_400_000;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

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

function hasColumn(
  detailRows: DetailRows,
  key: string | null | undefined,
): boolean {
  return !!key && detailRows.columns.some((column) => column.key === key);
}

/**
 * A carry step is rows-scopable when it carries its canonical timing columns
 * (`ref_date_col` / `value_col`) plus `kg_days`, so realized cost, timing and
 * stats can all be rebuilt from the detail rows.
 */
function canScopeDwellRows(
  detailRows: DetailRows,
  dateCol: string | null | undefined,
  valueCol: string | null | undefined,
): boolean {
  return (
    hasColumn(detailRows, dateCol) &&
    hasColumn(detailRows, valueCol) &&
    hasColumn(detailRows, DWELL_KG_DAYS_KEY)
  );
}

/**
 * Whether the step's rows carry consuming-material / recipe columns. Only then
 * does the row set span multiple finished goods (raw + intermediate dwell) and
 * need per-product scoping; post-QA / destination rows are already FG-specific.
 */
function hasProductScopeColumns(detailRows: DetailRows): boolean {
  return (
    hasColumn(detailRows, CURRENT_RECIPE_KEY) ||
    hasColumn(detailRows, CONSUMING_MATERIAL_KEY) ||
    hasColumn(detailRows, CONSUMING_MATERIAL_NAME_KEY)
  );
}

function isOpenCarryRow(row: DetailRows["rows"][number]): boolean {
  const status = stringValue(row[CARRY_STATUS_KEY]);
  return status != null && status.toLowerCase().startsWith("open");
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
  hasProductCols: boolean,
  scopeToProduct: boolean,
  includeOpenCarry: boolean,
): boolean {
  // Open (undispatched / unconsumed) inventory has no completed dwell event, so
  // it never contributes to the timing series. It IS carried cost though: site
  // views always surface it, and FG-specific product views (post-QA / dest,
  // where it's confidently attributable) scope it in too. Shared raw/intermediate
  // product views still drop it (we can't consistently attribute open stock to one FG).
  if (isOpenCarryRow(row)) {
    return includeOpenCarry;
  }

  if (!scopeToProduct || !hasProductCols) {
    // Site context (no single product), or post-QA / destination rows that are
    // already specific to one finished good: keep every realized row.
    return true;
  }

  // A row that produces the current finished good always belongs to its view,
  // regardless of whether the dwelling material is still on that product's
  // *current* BOM. Recipes drift over time (an intermediate can be dropped from
  // the live BOM while historical consumption into that finished good remains),
  if (matchesCurrentProduct(row, scope)) {
    return true;
  }

  // Multi-level: consumption into an on-recipe sub-intermediate of this product
  // (the dwelling material is a current-BOM component of the consuming material),
  // even when the consuming material is not the finished good itself.
  const recipeMembership = recipeMembershipValue(row[CURRENT_RECIPE_KEY]);
  if (recipeMembership === true) {
    return true;
  }
  return false;
}

/**
 * Accrue one open-carry row's kg-days into calendar-month buckets:
 * the open interval is `[horizon - open_days + 1, horizon]` (inclusive)
 * and each day carries `open_qty` kg. This reproduces the site's monthly
 * open split from the row alone. Open carry has no completed dwell duration,
 * so it never touches the timing series -- only `total_kg_days`.
 */
function accrueOpenCarryByMonth(
  row: DetailRows["rows"][number],
  horizon: string,
  kgDaysByMonth: Map<string, number>,
): void {
  const openDays = numberValue(row[OPEN_DAYS_KEY]);
  const openQty =
    numberValue(row[OPEN_QTY_KEY]) ??
    (openDays && openDays > 0
      ? (numberValue(row[DWELL_KG_DAYS_KEY]) ?? 0) / openDays
      : null);

  if (openDays == null || openDays <= 0 || openQty == null || openQty <= 0) {
    return;
  }

  const end = new Date(`${horizon.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) {
    return;
  }

  const cursor = new Date(end.getTime() - (openDays - 1) * MS_PER_DAY);
  while (cursor.getTime() <= end.getTime()) {
    const monthEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
    );
    const intervalEnd = monthEnd.getTime() < end.getTime() ? monthEnd : end;
    const days =
      Math.round((intervalEnd.getTime() - cursor.getTime()) / MS_PER_DAY) + 1;
    const month = monthKey(cursor);
    kgDaysByMonth.set(month, (kgDaysByMonth.get(month) ?? 0) + openQty * days);
    cursor.setTime(intervalEnd.getTime() + MS_PER_DAY);
  }
}

/**
 * Spread a realized row's carried kg-days across the calendar months the stock
 * was actually held: the interval `[end - dwellDays, end)` (i.e. `dwellDays`
 * days ending the day before the consumption/exit date), each day carrying
 * `kg_days / dwellDays` kg.
 */
function spreadHeldKgDaysByMonth(
  endDate: Date,
  dwellDays: number,
  dailyKgDays: number,
  kgDaysByMonth: Map<string, number>,
): void {
  const cursor = new Date(endDate.getTime() - dwellDays * MS_PER_DAY);
  while (cursor.getTime() < endDate.getTime()) {
    const monthBoundary = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
    const intervalEnd =
      monthBoundary.getTime() < endDate.getTime() ? monthBoundary : endDate;
    const days = Math.round(
      (intervalEnd.getTime() - cursor.getTime()) / MS_PER_DAY,
    );
    const month = monthKey(cursor);
    kgDaysByMonth.set(
      month,
      (kgDaysByMonth.get(month) ?? 0) + dailyKgDays * days,
    );
    cursor.setTime(intervalEnd.getTime());
  }
}

function monthlyFromDwellRows(
  rows: DetailRows["rows"],
  dateCol: string,
  valueCol: string,
  horizon: string | null | undefined,
): MonthlyBucket[] {
  const valuesByMonth = new Map<string, number[]>();
  const kgDaysByMonth = new Map<string, number>();

  for (const row of rows) {
    if (isOpenCarryRow(row)) {
      // Kept only when open carry is included (see shouldKeepDwellRow); accrue
      // its carried kg-days per month, contributing nothing to timing.
      if (horizon) {
        accrueOpenCarryByMonth(row, horizon, kgDaysByMonth);
      }
      continue;
    }
    const date = stringValue(row[dateCol]);
    if (!date) {
      continue;
    }
    const month = date.slice(0, 7);
    const value = numberValue(row[valueCol]);
    if (value != null) {
      const monthValues = valuesByMonth.get(month);
      if (monthValues) {
        monthValues.push(value);
      } else {
        valuesByMonth.set(month, [value]);
      }
    }

    // Carrying kg-days accrue over the months the stock was held (receipt/
    // release -> consumption/exit), not the single end month. `value` is the
    // dwell-days for the row, so `kg_days / value` is the constant daily carry.
    const kgDays = numberValue(row[DWELL_KG_DAYS_KEY]) ?? 0;
    const endDate = new Date(`${date.slice(0, 10)}T00:00:00Z`);
    if (
      kgDays > 0 &&
      value != null &&
      value > 0 &&
      !Number.isNaN(endDate.getTime())
    ) {
      spreadHeldKgDaysByMonth(endDate, value, kgDays / value, kgDaysByMonth);
    } else {
      kgDaysByMonth.set(month, (kgDaysByMonth.get(month) ?? 0) + kgDays);
    }
  }

  return [...new Set([...valuesByMonth.keys(), ...kgDaysByMonth.keys()])]
    .sort((leftMonth, rightMonth) => leftMonth.localeCompare(rightMonth))
    .map((month) => {
      const stats = computeStats(valuesByMonth.get(month) ?? []);
      return {
        month,
        mean: stats.mean,
        median: stats.median,
        n: stats.n,
        total_kg_days: kgDaysByMonth.get(month) ?? 0,
      };
    });
}

function observationsFromDwellRows(
  rows: DetailRows["rows"],
  dateCol: string,
  valueCol: string,
): Observation[] {
  return rows.flatMap((row) => {
    const date = stringValue(row[dateCol]);
    const value = numberValue(row[valueCol]);
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
  {
    scopeToProduct = true,
    includeOpenCarry = false,
  }: { scopeToProduct?: boolean; includeOpenCarry?: boolean } = {},
): StepDetail {
  if (!isDwellType(step.type) || !step.detail_rows) {
    return step;
  }
  const dateCol = step.ref_date_col;
  const valueCol = step.value_col;
  if (!canScopeDwellRows(step.detail_rows, dateCol, valueCol)) {
    return step;
  }

  const hasProductCols = hasProductScopeColumns(step.detail_rows);
  const scopedRows = step.detail_rows.rows.filter((row) =>
    shouldKeepDwellRow(
      row,
      scope,
      hasProductCols,
      scopeToProduct,
      includeOpenCarry,
    ),
  );
  const observations = observationsFromDwellRows(
    scopedRows,
    dateCol!,
    valueCol!,
  ).sort((left, right) => left.date.localeCompare(right.date));
  const values = observations.map((observation) => observation.value);

  return {
    ...step,
    detail_rows: {
      ...step.detail_rows,
      rows: scopedRows,
    },
    observations,
    durations: values,
    monthly: monthlyFromDwellRows(
      scopedRows,
      dateCol!,
      valueCol!,
      includeOpenCarry ? step.data_horizon : null,
    ),
    stats: computeStats(values),
    pct_exceeding_plan: pctExceedingPlan(observations, step.plan),
  };
}

export function scopeDwellNodeToProduct(
  node: GraphNode,
  step: StepDetail,
  scope: DwellProductScope,
  { includeOpenCarry = false }: { includeOpenCarry?: boolean } = {},
): GraphNode {
  if (!isDwellType(node.type) || !step.detail_rows) {
    return node;
  }
  const dateCol = step.ref_date_col;
  const valueCol = step.value_col;
  if (!canScopeDwellRows(step.detail_rows, dateCol, valueCol)) {
    return node;
  }

  const hasProductCols = hasProductScopeColumns(step.detail_rows);
  const scopedRows = step.detail_rows.rows.filter((row) =>
    shouldKeepDwellRow(row, scope, hasProductCols, true, includeOpenCarry),
  );
  const observations = observationsFromDwellRows(
    scopedRows,
    dateCol!,
    valueCol!,
  ).sort((left, right) => left.date.localeCompare(right.date));
  const values = observations.map((observation) => observation.value);

  return {
    ...node,
    observations,
    monthly: monthlyFromDwellRows(
      scopedRows,
      dateCol!,
      valueCol!,
      includeOpenCarry ? step.data_horizon : null,
    ),
    stats: computeStats(values),
    pct_exceeding_plan: pctExceedingPlan(observations, node.plan),
  };
}
