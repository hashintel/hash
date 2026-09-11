import {
  isDwellType,
  STEP_TYPE_LABELS,
  STEP_TYPE_ORDER,
} from "../../../shared/categories";
import {
  computePeriodCost,
  computePeriodMaterialValue,
} from "../../../shared/cost";
import { selectStat, type BaseMeasure } from "../../../shared/measure-context";
import { combinedSampleTier } from "../../../shared/sample-confidence";
import {
  STATUS_LABELS_IN_ORDER,
  statusKey,
  statusLabelForNode,
  type StatusStore,
} from "../../../shared/status";
import {
  cutoffForRange,
  rangeMonths,
  type TimeRange,
} from "../../../shared/time-range";
import { trendToneFor } from "../../../shared/trend-tone";
import { siteNodeDisplayLabel } from "./helpers";
import {
  matchesNumberOperator,
  matchesSelectionOperator,
  matchesStringOperator,
  numberOperators,
  pickMultiSelectOperators,
  pickOperators,
  pickSingleSelectOperators,
  stringOperators,
  type StepFilterOperator,
} from "./step-filters/operators";

import type { SiteNode, VendorOtifStats } from "../../../shared/types";
import type { MultiSelectItem } from "@hashintel/ds-components";

/**
 * One merged filter vocabulary shared by the opportunities, dwell, planning,
 * trend, and supplier tables, so a filter set applied on one table carries to
 * the others unchanged.
 *
 * Applicability is decided per table: a filter is applied only when at least
 * one of the table's rows carries the property it tests (`isApplicable`);
 * otherwise it is skipped there and reported via `skippedKeys` so the UI can
 * mark its chip as disabled. Within an applicable table, rows that lack the
 * property (e.g. plan deviation on an unplanned step) are excluded while the
 * filter is active — except for presence-style filters (planning warnings,
 * crossed plan), which are total and treat absence as "no".
 *
 * The supplier table's rows are vendors, not step nodes, so only filters that
 * define a `vendor` predicate (supplier, material) apply there.
 */

/**
 * Union row shape the filters evaluate against: a site node plus whichever
 * precomputed fields the dwell/planning/trend row variants carry. Anything
 * missing is derived on demand (see the *Of helpers below).
 */
export type FilterableStepRow = SiteNode & {
  periodCost?: number;
  costTrendPct?: number | null;
  periodMaterialValue?: number | null;
  deviationPct?: number | null;
  trendPct?: number | null;
  previousValue?: number | null;
  previousTrendN?: number;
};

export interface StepFilterContext {
  measure: BaseMeasure;
  timeRange: TimeRange;
  waccRate: number;
  storageCost: number;
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  statusHistory: StatusStore;
  /**
   * material -> supplier labels across every step row. Procurement rows carry
   * their supplier directly; dwell/trend rows for the same material match
   * through this map so the supplier filter is meaningful on every tab.
   */
  suppliersByMaterial: Map<string, Set<string>>;
}

/** Data-derived select item lists, built once from the union of table rows. */
export interface StepFilterOptions {
  materialItems: MultiSelectItem[];
  productItems: MultiSelectItem[];
  supplierItems: MultiSelectItem[];
}

/** A committed (operator, value) pair; `value` is null for input-less operators. */
export interface StepFilterValue {
  key: string;
  value: unknown;
}

export interface ActiveStepFilter {
  filterKey: StepFilterKey;
  /** Null while the chip has been added but no operator/value committed yet. */
  value: StepFilterValue | null;
}

interface StepFilterDefinition {
  key: string;
  label: string;
  /** Add-filter menu group. */
  group: string;
  operators: (options: StepFilterOptions) => StepFilterOperator[];
  matches: (
    row: FilterableStepRow,
    value: StepFilterValue,
    context: StepFilterContext,
  ) => boolean;
  /**
   * Whether a row carries the property this filter tests. A filter is skipped
   * (and its chip disabled) on tables where no row does.
   */
  isApplicable: (row: FilterableStepRow, context: StepFilterContext) => boolean;
  /** Supplier-table evaluation; filters without one are skipped there. */
  vendor?: (
    vendor: VendorOtifStats,
    value: StepFilterValue,
    context: StepFilterContext,
  ) => boolean;
}

const supplierLabelOf = (row: FilterableStepRow): string =>
  row.supplier_name ?? row.supplier_id ?? "Unknown";

export const buildStepFilterContext = ({
  rows,
  measure,
  timeRange,
  waccRate,
  storageCost,
  siteId,
  statusHistory,
}: Omit<StepFilterContext, "suppliersByMaterial"> & {
  rows: FilterableStepRow[];
}): StepFilterContext => {
  const suppliersByMaterial = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.type !== "procurement" || !row.material) {
      continue;
    }
    const suppliers = suppliersByMaterial.get(row.material) ?? new Set();
    suppliers.add(supplierLabelOf(row));
    suppliersByMaterial.set(row.material, suppliers);
  }
  return {
    measure,
    timeRange,
    waccRate,
    storageCost,
    siteId,
    statusHistory,
    suppliersByMaterial,
  };
};

const sortedItems = (byValue: Map<string, string>): MultiSelectItem[] =>
  [...byValue.entries()]
    .map(([value, text]) => ({ value, text }))
    .sort((left, right) => left.text.localeCompare(right.text));

export const buildStepFilterOptions = (
  rows: FilterableStepRow[],
): StepFilterOptions => {
  const materials = new Map<string, string>();
  const products = new Map<string, string>();
  const suppliers = new Map<string, string>();
  for (const row of rows) {
    if (row.material) {
      // Keep a named entry once seen; later rows may only carry the bare code.
      const existing = materials.get(row.material);
      if (!existing || existing === row.material) {
        materials.set(row.material, row.material_name ?? row.material);
      }
    }
    for (const product of row.products) {
      products.set(product.id, product.name);
    }
    if (row.type === "procurement") {
      const label = supplierLabelOf(row);
      suppliers.set(label, label);
    }
  }
  return {
    materialItems: sortedItems(materials),
    productItems: sortedItems(products),
    supplierItems: sortedItems(suppliers),
  };
};

// ── Static option lists ─────────────────────────────────────────────────────

const stepTypeItems: MultiSelectItem[] = STEP_TYPE_ORDER.map((type) => ({
  value: type,
  text: STEP_TYPE_LABELS[type],
}));

const basisItems: MultiSelectItem[] = [
  { value: "ordinary", text: "Buy" },
  { value: "consignment", text: "Consignment" },
  { value: "subcontract", text: "Subcontract" },
  { value: "mixed", text: "Mixed" },
  { value: "unknown", text: "Unknown" },
];

const sampleTierItems: MultiSelectItem[] = [
  { value: "good", text: "Good" },
  { value: "limited", text: "Limited" },
  { value: "low", text: "Low" },
];

const statusItems: MultiSelectItem[] = STATUS_LABELS_IN_ORDER.map((label) => ({
  value: label,
  text: label,
}));

const deviationDirectionItems: MultiSelectItem[] = [
  { value: "over", text: "Over plan" },
  { value: "under", text: "Under plan" },
  { value: "onPlan", text: "On plan" },
];

const trendDirectionItems: MultiSelectItem[] = [
  { value: "worsening", text: "Worsening" },
  { value: "improving", text: "Improving" },
  { value: "flat", text: "Flat" },
];

// ── Derived row values ──────────────────────────────────────────────────────

const DAYS_PER_MONTH = 30.44;

const daysInRange = (timeRange: TimeRange): number =>
  rangeMonths(timeRange) * DAYS_PER_MONTH;

const measureValueOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => selectStat(row.stats, context.measure);

const materialValueOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null =>
  row.periodMaterialValue !== undefined
    ? row.periodMaterialValue
    : computePeriodMaterialValue(row.material_value, context.timeRange);

const carryingCostOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => {
  if (!isDwellType(row.type)) {
    return null;
  }
  if (row.periodCost !== undefined) {
    return row.periodCost;
  }
  if (!row.monthly || row.cost?.unit_price == null) {
    return null;
  }
  return computePeriodCost(
    row.monthly,
    row.cost.unit_price,
    context.waccRate,
    context.storageCost,
  );
};

const dailyConsumptionOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => {
  const monthly = row.material_value?.monthly;
  if (!monthly) {
    return null;
  }
  const cutoff = cutoffForRange(context.timeRange);
  const quantity = monthly.reduce(
    (sum, bucket) => (bucket.month >= cutoff ? sum + bucket.quantity : sum),
    0,
  );
  return quantity > 0 ? quantity / daysInRange(context.timeRange) : null;
};

/**
 * Days on hand beyond what the inventory policy forces: cycle stock from the
 * MOQ averages out to half an order, safety stock is held in full, and both
 * convert to days through the observed consumption rate. Positive = stock the
 * policy does not explain.
 */
const excessVsPolicyOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => {
  const policy = row.inventory_policy;
  const daysOnHand = measureValueOf(row, context);
  if (!policy || daysOnHand == null) {
    return null;
  }
  const minimumOrderQty = policy.minimum_order_qty ?? 0;
  const safetyStockQty = policy.safety_stock_qty ?? 0;
  if (minimumOrderQty <= 0 && safetyStockQty <= 0) {
    return null;
  }
  const dailyConsumption = dailyConsumptionOf(row, context);
  if (dailyConsumption == null) {
    return null;
  }
  const policyImpliedDays =
    (minimumOrderQty / 2 + safetyStockQty) / dailyConsumption;
  return daysOnHand - policyImpliedDays;
};

const tailRatioOf = (row: FilterableStepRow): number | null => {
  const { median, p95 } = row.stats;
  return median != null && median > 0 && p95 != null ? p95 / median : null;
};

const variabilityOf = (row: FilterableStepRow): number | null => {
  const { mean, std } = row.stats;
  return mean != null && mean > 0 && std != null ? std / mean : null;
};

const deviationPctOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => {
  if (row.deviationPct !== undefined) {
    return row.deviationPct;
  }
  const observed = measureValueOf(row, context);
  if (row.plan == null || row.plan <= 0 || observed == null) {
    return null;
  }
  return ((observed - row.plan) / row.plan) * 100;
};

/** Deviations within ±1% count as on plan. */
const ON_PLAN_BAND_PCT = 1;

const deviationDirectionOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): string | null => {
  const deviation = deviationPctOf(row, context);
  if (deviation == null) {
    return null;
  }
  if (Math.abs(deviation) < ON_PLAN_BAND_PCT) {
    return "onPlan";
  }
  return deviation > 0 ? "over" : "under";
};

const bufferReleasableOf = (row: FilterableStepRow): number | null =>
  row.plan != null && row.stats.p85 != null
    ? Math.max(0, row.plan - row.stats.p85)
    : null;

const changeDaysOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => {
  const current = measureValueOf(row, context);
  return current != null && row.previousValue != null
    ? current - row.previousValue
    : null;
};

const valueWeightedChangeOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => {
  const change = changeDaysOf(row, context);
  const value = materialValueOf(row, context);
  return change != null && value != null
    ? change * (value / daysInRange(context.timeRange))
    : null;
};

const trendDirectionOf = (row: FilterableStepRow): string | null => {
  const tone = trendToneFor(row.trendPct);
  if (tone == null) {
    return null;
  }
  return tone === "up" ? "worsening" : tone === "down" ? "improving" : "flat";
};

const crossedPlanOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): boolean => {
  const current = measureValueOf(row, context);
  return (
    row.plan != null &&
    row.previousValue != null &&
    current != null &&
    row.previousValue <= row.plan &&
    current > row.plan
  );
};

const supplierValuesOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): string[] => {
  if (row.type === "procurement") {
    return [supplierLabelOf(row)];
  }
  return row.material
    ? [...(context.suppliersByMaterial.get(row.material) ?? [])]
    : [];
};

const statusAgeDaysOf = (
  row: FilterableStepRow,
  context: StepFilterContext,
): number | null => {
  const entries = context.statusHistory[statusKey(context.siteId, row)];
  if (!entries || entries.length === 0) {
    return null;
  }
  const latest = Math.max(...entries.map((entry) => Date.parse(entry.at)));
  return Number.isFinite(latest)
    ? (Date.now() - latest) / (24 * 60 * 60 * 1000)
    : null;
};

// ── Filter definitions ──────────────────────────────────────────────────────

const allNumberOperators = () =>
  pickOperators(numberOperators, ["gte", "lte", "between"]);

export const STEP_FILTER_DEFINITIONS = [
  // Scope
  {
    key: "stepName",
    label: "Step name",
    group: "Scope",
    operators: () =>
      pickOperators(stringOperators, ["contains", "notContains", "is"]),
    matches: (row, value) =>
      matchesStringOperator(value.key, siteNodeDisplayLabel(row), value.value),
    isApplicable: () => true,
  },
  {
    key: "stepType",
    label: "Step type",
    group: "Scope",
    operators: () =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], stepTypeItems),
    matches: (row, value) =>
      matchesSelectionOperator(value.key, [row.type], value.value),
    isApplicable: () => true,
  },
  {
    key: "material",
    label: "Material",
    group: "Scope",
    operators: (options) =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], options.materialItems, {
        searchable: true,
      }),
    matches: (row, value) =>
      matchesSelectionOperator(
        value.key,
        row.material ? [row.material] : null,
        value.value,
      ),
    isApplicable: (row) => !!row.material,
    vendor: (vendor, value) =>
      matchesSelectionOperator(
        value.key,
        vendor.materials?.map((material) => material.matnr) ?? [],
        value.value,
      ),
  },
  {
    key: "product",
    label: "Product",
    group: "Scope",
    operators: (options) =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], options.productItems, {
        searchable: true,
      }),
    matches: (row, value) =>
      matchesSelectionOperator(
        value.key,
        row.products.map((product) => product.id),
        value.value,
      ),
    isApplicable: (row) => row.products.length > 0,
  },
  {
    key: "supplier",
    label: "Supplier",
    group: "Scope",
    operators: (options) =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], options.supplierItems, {
        searchable: true,
      }),
    matches: (row, value, context) =>
      matchesSelectionOperator(
        value.key,
        supplierValuesOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => supplierValuesOf(row, context).length > 0,
    // Option values are supplier labels from graph rows; vendor rows match on
    // either their name or id so the two datasets line up best-effort.
    vendor: (vendor, value) =>
      matchesSelectionOperator(
        value.key,
        [vendor.vendor_name, vendor.vendor_id].filter(
          (entry): entry is string => entry != null,
        ),
        value.value,
      ),
  },
  {
    key: "basis",
    label: "Receipt basis",
    group: "Scope",
    operators: () =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], basisItems),
    matches: (row, value) =>
      matchesSelectionOperator(
        value.key,
        row.type === "procurement" ? [row.receipt_basis ?? "unknown"] : null,
        value.value,
      ),
    isApplicable: (row) => row.type === "procurement",
  },
  // Magnitude
  {
    key: "measureValue",
    label: "Observed days",
    group: "Magnitude",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        measureValueOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => measureValueOf(row, context) != null,
  },
  {
    key: "materialValue",
    label: "Material value",
    group: "Magnitude",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        materialValueOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => materialValueOf(row, context) != null,
  },
  {
    key: "carryingCost",
    label: "Carrying cost",
    group: "Magnitude",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        carryingCostOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => carryingCostOf(row, context) != null,
  },
  {
    key: "excessVsPolicy",
    label: "Excess vs policy (days)",
    group: "Magnitude",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        excessVsPolicyOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => excessVsPolicyOf(row, context) != null,
  },
  // Statistics
  {
    key: "sampleConfidence",
    label: "Sample confidence",
    group: "Statistics",
    operators: () =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], sampleTierItems),
    matches: (row, value) =>
      matchesSelectionOperator(
        value.key,
        [combinedSampleTier(row.stats.n, row.previousTrendN)],
        value.value,
      ),
    isApplicable: () => true,
  },
  {
    key: "observations",
    label: "Observations",
    group: "Statistics",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.stats.n, value.value),
    isApplicable: () => true,
  },
  {
    key: "tailRatio",
    label: "Tail ratio (P95 ÷ median)",
    group: "Statistics",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, tailRatioOf(row), value.value),
    isApplicable: (row) => tailRatioOf(row) != null,
  },
  {
    key: "variability",
    label: "Variability (CV)",
    group: "Statistics",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, variabilityOf(row), value.value),
    isApplicable: (row) => variabilityOf(row) != null,
  },
  // Planning
  {
    key: "deviationPct",
    label: "Deviation %",
    group: "Planning",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        deviationPctOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => deviationPctOf(row, context) != null,
  },
  {
    key: "deviationDirection",
    label: "Deviation direction",
    group: "Planning",
    operators: () =>
      pickSingleSelectOperators(["is", "isNot"], deviationDirectionItems),
    matches: (row, value, context) => {
      const direction = deviationDirectionOf(row, context);
      return matchesSelectionOperator(
        value.key,
        direction ? [direction] : null,
        value.value,
      );
    },
    isApplicable: (row, context) => deviationPctOf(row, context) != null,
  },
  {
    key: "exceedingPlan",
    label: "% exceeding plan",
    group: "Planning",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.pct_exceeding_plan, value.value),
    isApplicable: (row) => row.pct_exceeding_plan != null,
  },
  {
    key: "bufferReleasable",
    label: "Buffer releasable (days)",
    group: "Planning",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, bufferReleasableOf(row), value.value),
    isApplicable: (row) => bufferReleasableOf(row) != null,
  },
  {
    key: "planningWarnings",
    label: "Planning warnings",
    group: "Planning",
    // Presence check with total semantics: rows without the property are "none".
    operators: () => [
      { key: "has", label: "present", input: null },
      { key: "none", label: "none", input: null },
    ],
    matches: (row, value) => {
      const hasWarnings = (row.planning_warnings?.length ?? 0) > 0;
      return value.key === "has" ? hasWarnings : !hasWarnings;
    },
    // Only procurement steps can carry warnings, so the filter is meaningless
    // on tables without any.
    isApplicable: (row) => row.type === "procurement",
  },
  // Change
  {
    key: "trendPct",
    label: "Trend %",
    group: "Change",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.trendPct, value.value),
    isApplicable: (row) => row.trendPct != null,
  },
  {
    key: "trendDirection",
    label: "Trend direction",
    group: "Change",
    operators: () =>
      pickSingleSelectOperators(["is", "isNot"], trendDirectionItems),
    matches: (row, value) => {
      const direction = trendDirectionOf(row);
      return matchesSelectionOperator(
        value.key,
        direction ? [direction] : null,
        value.value,
      );
    },
    isApplicable: (row) => row.trendPct != null,
  },
  {
    key: "changeDays",
    label: "Change (days)",
    group: "Change",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(value.key, changeDaysOf(row, context), value.value),
    isApplicable: (row, context) => changeDaysOf(row, context) != null,
  },
  {
    key: "valueWeightedChange",
    label: "Value-weighted change",
    group: "Change",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        valueWeightedChangeOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => valueWeightedChangeOf(row, context) != null,
  },
  {
    key: "crossedPlan",
    label: "Crossed plan this period",
    group: "Change",
    // Total semantics: "no" includes rows without a plan or previous period.
    operators: () => [
      { key: "yes", label: "yes", input: null },
      { key: "no", label: "no", input: null },
    ],
    matches: (row, value, context) => {
      const crossed = crossedPlanOf(row, context);
      return value.key === "yes" ? crossed : !crossed;
    },
    isApplicable: (row) => row.plan != null && row.previousValue != null,
  },
  // Workflow
  {
    key: "status",
    label: "Status",
    group: "Workflow",
    operators: () =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], statusItems),
    matches: (row, value, context) =>
      matchesSelectionOperator(
        value.key,
        [statusLabelForNode(context.siteId, row, context.statusHistory)],
        value.value,
      ),
    isApplicable: () => true,
  },
  {
    key: "statusAge",
    label: "Status age (days)",
    group: "Workflow",
    operators: allNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        statusAgeDaysOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => statusAgeDaysOf(row, context) != null,
  },
] as const satisfies readonly StepFilterDefinition[];

export type StepFilterKey = (typeof STEP_FILTER_DEFINITIONS)[number]["key"];

const definitionByKey = new Map<string, StepFilterDefinition>(
  STEP_FILTER_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export interface StepFilterApplication<Item> {
  rows: Item[];
  /**
   * Active filters skipped because no row of this table carries the property
   * they test. The UI shows these chips as disabled.
   */
  skippedKeys: StepFilterKey[];
}

const resolveActiveFilters = (filters: ActiveStepFilter[]) =>
  filters.flatMap((filter) => {
    if (!filter.value) {
      return [];
    }
    const definition = definitionByKey.get(filter.filterKey);
    return definition ? [{ definition, value: filter.value }] : [];
  });

/**
 * Apply the active filters to items whose step row is reached via `rowOf`
 * (identity for the step tables, `opportunity.node` for opportunities). A
 * filter no row is applicable to is skipped and reported instead of applied;
 * an empty table skips nothing.
 */
export const applyStepFiltersBy = <Item>(
  items: Item[],
  rowOf: (item: Item) => FilterableStepRow,
  filters: ActiveStepFilter[],
  context: StepFilterContext,
): StepFilterApplication<Item> => {
  const active = resolveActiveFilters(filters);
  if (active.length === 0) {
    return { rows: items, skippedKeys: [] };
  }
  const applied: typeof active = [];
  const skippedKeys: StepFilterKey[] = [];
  for (const entry of active) {
    if (
      items.length === 0 ||
      items.some((item) => entry.definition.isApplicable(rowOf(item), context))
    ) {
      applied.push(entry);
    } else {
      skippedKeys.push(entry.definition.key as StepFilterKey);
    }
  }
  const rows =
    applied.length === 0
      ? items
      : items.filter((item) =>
          applied.every(({ definition, value }) =>
            definition.matches(rowOf(item), value, context),
          ),
        );
  return { rows, skippedKeys };
};

export const applyStepFilters = <Row extends FilterableStepRow>(
  rows: Row[],
  filters: ActiveStepFilter[],
  context: StepFilterContext,
): StepFilterApplication<Row> =>
  applyStepFiltersBy(rows, (row) => row, filters, context);

/**
 * Supplier-table variant: vendor rows are not step nodes, so only filters
 * that define a `vendor` predicate apply; every other active filter is
 * skipped and reported.
 */
export const applyVendorStepFilters = (
  vendors: VendorOtifStats[],
  filters: ActiveStepFilter[],
  context: StepFilterContext,
): StepFilterApplication<VendorOtifStats> => {
  const active = resolveActiveFilters(filters);
  if (active.length === 0) {
    return { rows: vendors, skippedKeys: [] };
  }
  const applied = active.filter((entry) => entry.definition.vendor);
  const skippedKeys = active
    .filter((entry) => !entry.definition.vendor)
    .map((entry) => entry.definition.key as StepFilterKey);
  const rows =
    applied.length === 0
      ? vendors
      : vendors.filter((vendor) =>
          applied.every(({ definition, value }) =>
            definition.vendor?.(vendor, value, context),
          ),
        );
  return { rows, skippedKeys };
};
