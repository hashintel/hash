import {
  isDwellType,
  STEP_TYPE_LABELS,
  STEP_TYPE_ORDER,
} from "../../../shared/categories";
import {
  computePeriodCost,
  computePeriodMaterialValue,
} from "../../../shared/cost";
import {
  MEASURE_LABELS,
  selectStat,
  type BaseMeasure,
} from "../../../shared/measure-context";
import { combinedSampleTier } from "../../../shared/sample-confidence";
import {
  STATUS_LABELS_IN_ORDER,
  statusKey,
  statusLabelForNode,
  type StatusStore,
} from "../../../shared/status";
import { trendToneFor } from "../../../shared/trend-tone";
import { siteNodeDisplayLabel } from "./helpers";
import {
  materialFilterItemRenderer,
  materialFilterSelectedRenderer,
} from "./supply-chain-filters/material-filter-item";
import {
  matchesNumberOperator,
  matchesSelectionOperator,
  matchesStringOperator,
  numberOperators,
  numberOperatorsFor,
  pickMultiSelectOperators,
  pickOperators,
  pickSingleSelectOperators,
  stringOperators,
  type SupplyChainFilterOperator,
} from "./supply-chain-filters/operators";

import type { TimeRange } from "../../../shared/time-range";
import type {
  SiteNode,
  StepType,
  VendorOtifStats,
} from "../../../shared/types";
import type { MultiSelectItem } from "@hashintel/ds-components";

/**
 * A single filter vocabulary shared by the opportunities, dwell, planning,
 * trend, and supplier tables, so a filter set applied on one table carries to
 * the others unchanged.
 *
 * `STEP_FILTER_MENUS` is the authoritative per-view layout: groups mirror the
 * view's table columns left-to-right, and filters kept for cross-view
 * continuity without a column of their own sit in the nearest related group.
 * Membership doubles as availability: a view whose menu omits a filter
 * neither offers it nor applies it — a chip carried over from another view
 * renders disabled there, even if its rows could match.
 *
 * The supplier table's rows are vendors, not step nodes, so only filters that
 * define a `vendor` predicate apply there.
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

export interface SupplyChainFilterContext {
  measure: BaseMeasure;
  timeRange: TimeRange;
  waccRate: number;
  storageCost: number;
  siteId: string;
  statusHistory: StatusStore;
  suppliersByMaterial: Map<string, Set<string>>;
}

/**
 * Data-derived select item lists plus the display context — currency,
 * analysis window, active measure — that unit-aware labels and input
 * placeholders resolve against.
 */
export interface SupplyChainFilterOptions {
  materialItems: MultiSelectItem[];
  productItems: MultiSelectItem[];
  supplierItems: MultiSelectItem[];
  currency: string | null;
  timeRange: TimeRange;
  measure: BaseMeasure;
}

export interface SupplyChainFilterValue {
  key: string;
  value: unknown;
}

/** The five filterable views; the tab views match the `Tab` union. */
export type SupplyChainFilterView =
  | "dwell"
  | "planning"
  | "trends"
  | "suppliers"
  | "opportunities";

export interface ActiveSupplyChainFilter {
  filterKey: SupplyChainFilterKey;
  value: SupplyChainFilterValue | null;
}

interface SupplyChainFilterDefinition {
  key: string;
  /** Static, or resolved against the display context for unit-aware labels. */
  label: string | ((options: SupplyChainFilterOptions) => string);
  operators: (options: SupplyChainFilterOptions) => SupplyChainFilterOperator[];
  matches: (
    row: FilterableStepRow,
    value: SupplyChainFilterValue,
    context: SupplyChainFilterContext,
  ) => boolean;
  /**
   * Whether a row carries the property this filter tests. A filter is skipped
   * (and its chip disabled) on tables where no row does.
   */
  isApplicable: (
    row: FilterableStepRow,
    context: SupplyChainFilterContext,
  ) => boolean;
  /** Supplier-table evaluation; filters without one are skipped there. */
  vendor?: (
    vendor: VendorOtifStats,
    value: SupplyChainFilterValue,
    context: SupplyChainFilterContext,
  ) => boolean;
}

const supplierLabelOf = (row: FilterableStepRow): string =>
  row.supplier_name ?? row.supplier_id ?? "Unknown";

export const buildSupplyChainFilterContext = ({
  rows,
  measure,
  timeRange,
  waccRate,
  storageCost,
  siteId,
  statusHistory,
}: Omit<SupplyChainFilterContext, "suppliersByMaterial"> & {
  rows: FilterableStepRow[];
}): SupplyChainFilterContext => {
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

/**
 * Step types whose label reads "<Step kind>: <material name>", so the suffix
 * names the row's own material. The location-scoped types (qa/ship/transit/
 * destination) are excluded: their label suffix names a plant, lane, or hub.
 */
const MATERIAL_TITLED_TYPES: StepType[] = [
  "procurement",
  "raw_material_dwell",
  "intermediate_dwell",
  "production",
];

/**
 * Best-effort display name for a row's material: the explicit `material_name`
 * when present, else the label suffix — current artifacts omit
 * `material_name`, leaving the label as the only source of the human name.
 */
const materialDisplayNameOf = (row: FilterableStepRow): string | null => {
  if (row.material_name) {
    return row.material_name;
  }
  if (!MATERIAL_TITLED_TYPES.includes(row.type)) {
    return null;
  }
  const separatorIndex = row.label.indexOf(": ");
  if (separatorIndex === -1) {
    return null;
  }
  const name = row.label.slice(separatorIndex + 2).trim();
  return name.length > 0 ? name : null;
};

export const buildSupplyChainFilterOptions = (
  rows: FilterableStepRow[],
  display: Pick<SupplyChainFilterOptions, "currency" | "timeRange" | "measure">,
): SupplyChainFilterOptions => {
  const materials = new Map<string, string>();
  const products = new Map<string, string>();
  const suppliers = new Map<string, string>();
  for (const row of rows) {
    if (row.material) {
      const existing = materials.get(row.material);
      // Explicit names win; a derived name only replaces the matnr fallback.
      if (row.material_name) {
        materials.set(row.material, row.material_name);
      } else if (existing === undefined || existing === row.material) {
        materials.set(row.material, materialDisplayNameOf(row) ?? row.material);
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
    ...display,
    // The matnr rides inside `text` so the dropdown search matches it; the
    // material renderers split name and matnr back apart for display.
    materialItems: [...materials.entries()]
      .map(([value, name]) => ({
        value,
        text: name === value ? value : `${name} ${value}`,
      }))
      .sort((left, right) => left.text.localeCompare(right.text)),
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

const measureValueOf = (
  row: FilterableStepRow,
  context: SupplyChainFilterContext,
): number | null => selectStat(row.stats, context.measure);

const materialValueOf = (
  row: FilterableStepRow,
  context: SupplyChainFilterContext,
): number | null =>
  row.periodMaterialValue !== undefined
    ? row.periodMaterialValue
    : computePeriodMaterialValue(row.material_value, context.timeRange);

const carryingCostOf = (
  row: FilterableStepRow,
  context: SupplyChainFilterContext,
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

const deviationPctOf = (
  row: FilterableStepRow,
  context: SupplyChainFilterContext,
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
  context: SupplyChainFilterContext,
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

/** P95 against plan: the planning opportunities' impact value. */
const p95DeviationPctOf = (row: FilterableStepRow): number | null =>
  row.plan != null && row.plan > 0 && row.stats.p95 != null
    ? ((row.stats.p95 - row.plan) / row.plan) * 100
    : null;

const trendDirectionOf = (row: FilterableStepRow): string | null => {
  const tone = trendToneFor(row.trendPct);
  if (tone == null) {
    return null;
  }
  return tone === "up" ? "worsening" : tone === "down" ? "improving" : "flat";
};

const crossedPlanOf = (
  row: FilterableStepRow,
  context: SupplyChainFilterContext,
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
  context: SupplyChainFilterContext,
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
  context: SupplyChainFilterContext,
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

const NUMBER_OPERATOR_KEYS = ["gte", "lte", "between"] as const;

const allNumberOperators = () =>
  pickOperators(numberOperators, NUMBER_OPERATOR_KEYS);

/** Number operators whose empty inputs show "days". */
const dayNumberOperators = () =>
  pickOperators(numberOperatorsFor("days"), NUMBER_OPERATOR_KEYS);

/** Number operators whose empty inputs show the active currency code. */
const currencyNumberOperators = (options: SupplyChainFilterOptions) =>
  pickOperators(
    numberOperatorsFor(options.currency ?? undefined),
    NUMBER_OPERATOR_KEYS,
  );

/** "(12m)" suffix for period-scoped metrics; the currency itself lives in
 * the input placeholder rather than the label to avoid stating it twice. */
const periodSuffix = (options: SupplyChainFilterOptions): string =>
  ` (${options.timeRange})`;

/** Resolve a definition's label against the display context. */
export const supplyChainFilterLabel = (
  definition: Pick<SupplyChainFilterDefinition, "label">,
  options: SupplyChainFilterOptions,
): string =>
  typeof definition.label === "function"
    ? definition.label(options)
    : definition.label;

export const STEP_FILTER_DEFINITIONS = [
  // Scope
  {
    key: "stepName",
    label: "Step name",
    operators: () =>
      pickOperators(stringOperators, ["contains", "notContains", "is"]),
    matches: (row, value) =>
      matchesStringOperator(value.key, siteNodeDisplayLabel(row), value.value),
    isApplicable: () => true,
  },
  {
    key: "stepType",
    label: "Step type",
    operators: () =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], stepTypeItems, {
        overflow: "summary",
      }),
    matches: (row, value) =>
      matchesSelectionOperator(value.key, [row.type], value.value),
    isApplicable: () => true,
  },
  {
    key: "material",
    label: "Material",
    operators: (options) =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], options.materialItems, {
        searchable: true,
        overflow: "summary",
        // Dropdown rows show the matnr in small text under the name; the
        // chip's selected values show the name alone.
        renderItem: materialFilterItemRenderer(options.materialItems),
        renderSelectedItem: materialFilterSelectedRenderer(
          options.materialItems,
        ),
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
    operators: (options) =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], options.productItems, {
        searchable: true,
        overflow: "summary",
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
    operators: (options) =>
      pickMultiSelectOperators(["isAnyOf", "isNoneOf"], options.supplierItems, {
        searchable: true,
        overflow: "summary",
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
    label: "Basis",
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
    label: (options) => `Observed days (${MEASURE_LABELS[options.measure]})`,
    operators: dayNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        measureValueOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => measureValueOf(row, context) != null,
  },
  {
    key: "previousValue",
    label: (options) => `Previous days (${MEASURE_LABELS[options.measure]})`,
    operators: dayNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.previousValue, value.value),
    isApplicable: (row) => row.previousValue != null,
  },
  {
    key: "materialValue",
    label: (options) => `Material value${periodSuffix(options)}`,
    operators: currencyNumberOperators,
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
    label: (options) => `Carrying cost${periodSuffix(options)}`,
    operators: currencyNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        carryingCostOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => carryingCostOf(row, context) != null,
  },
  // Policy quantities are in each row's own order UOM, so the inputs are unitless.
  {
    key: "moq",
    label: "MOQ",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(
        value.key,
        row.inventory_policy?.minimum_order_qty,
        value.value,
      ),
    isApplicable: (row) => row.inventory_policy?.minimum_order_qty != null,
  },
  {
    key: "safetyStock",
    label: "Safety stock",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(
        value.key,
        row.inventory_policy?.safety_stock_qty,
        value.value,
      ),
    isApplicable: (row) => row.inventory_policy?.safety_stock_qty != null,
  },
  // Statistics
  {
    key: "sampleConfidence",
    label: "Sample confidence",
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
    label: "Samples",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.stats.n, value.value),
    isApplicable: () => true,
  },
  // Planning
  {
    key: "plan",
    label: "Planned days",
    operators: dayNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.plan, value.value),
    isApplicable: (row) => row.plan != null,
  },
  {
    key: "deviationPct",
    label: "Deviation %",
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
    key: "p95DeviationPct",
    label: "P95 vs plan %",
    // Matches the planning opportunities' displayed impact value.
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, p95DeviationPctOf(row), value.value),
    isApplicable: (row) => p95DeviationPctOf(row) != null,
  },
  {
    key: "exceedingPlan",
    label: "% exceeding plan",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.pct_exceeding_plan, value.value),
    isApplicable: (row) => row.pct_exceeding_plan != null,
  },
  {
    key: "planningWarnings",
    label: "Planning warnings",
    operators: () => [
      { key: "has", label: "present", input: null },
      { key: "none", label: "none", input: null },
    ],
    matches: (row, value) => {
      const hasWarnings = (row.planning_warnings?.length ?? 0) > 0;
      return value.key === "has" ? hasWarnings : !hasWarnings;
    },
    // Only procurement steps can carry warnings, so the filter is meaningless on tables without any.
    isApplicable: (row) => row.type === "procurement",
  },
  // Change
  {
    key: "trendPct",
    label: "Trend %",
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.trendPct, value.value),
    isApplicable: (row) => row.trendPct != null,
  },
  {
    key: "trendDirection",
    label: "Trend direction",
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
    key: "costTrendPct",
    label: "Cost trend %",
    // The trend glyph stacked under the dwell table's Cost column.
    operators: allNumberOperators,
    matches: (row, value) =>
      matchesNumberOperator(value.key, row.costTrendPct, value.value),
    isApplicable: (row) => row.costTrendPct != null,
  },
  {
    key: "crossedPlan",
    label: "Crossed plan this period",
    // "no" includes rows without a plan or previous period.
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
    label: "Status age",
    operators: dayNumberOperators,
    matches: (row, value, context) =>
      matchesNumberOperator(
        value.key,
        statusAgeDaysOf(row, context),
        value.value,
      ),
    isApplicable: (row, context) => statusAgeDaysOf(row, context) != null,
  },
  // Supplier performance: vendor-only metrics matching the supplier table's
  // columns. Only the suppliers view lists them, so the step-row predicates
  // are inert (`isApplicable` false keeps a stray chip disabled elsewhere).
  {
    key: "materialsCount",
    label: "Materials count",
    operators: allNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(
        value.key,
        vendor.materials?.length ?? 0,
        value.value,
      ),
  },
  {
    key: "lines",
    label: "Lines",
    operators: allNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(value.key, vendor.n_lines, value.value),
  },
  {
    key: "lateLines",
    label: "Late lines",
    operators: allNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(value.key, vendor.n_late, value.value),
  },
  {
    key: "onTimePct",
    label: "On-time %",
    operators: allNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(value.key, vendor.on_time_pct, value.value),
  },
  {
    key: "otifPct",
    label: "OTIF %",
    operators: allNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(value.key, vendor.otif_pct, value.value),
  },
  {
    key: "meanDelayAll",
    label: "Mean delay (all)",
    operators: dayNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(value.key, vendor.mean_days_late_all, value.value),
  },
  {
    key: "meanDelayWhenLate",
    label: "Mean delay when late",
    operators: dayNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(
        value.key,
        vendor.mean_days_late_when_late,
        value.value,
      ),
  },
  {
    key: "maxDelay",
    label: "Max delay",
    operators: dayNumberOperators,
    matches: () => true,
    isApplicable: () => false,
    vendor: (vendor, value) =>
      matchesNumberOperator(value.key, vendor.max_days_late, value.value),
  },
] as const satisfies readonly SupplyChainFilterDefinition[];

export type SupplyChainFilterKey =
  (typeof STEP_FILTER_DEFINITIONS)[number]["key"];

export interface SupplyChainFilterMenuGroup {
  /** Menu heading; omit to list the keys ungrouped (used where a heading would just repeat a filter's own label). */
  group?: string;
  keys: ReadonlyArray<SupplyChainFilterKey>;
}

/**
 * Add-menu layout per view: groups in display order, mirroring the view's
 * table columns left-to-right; filters kept for cross-view continuity that
 * have no column sit in the nearest related group. Within a group the menu
 * renders filters alphabetized by their resolved labels, so key order here
 * only documents association. Membership is authoritative: a view offers,
 * and applies, exactly the filters its layout lists (see the module doc).
 */
export const STEP_FILTER_MENUS: Record<
  SupplyChainFilterView,
  ReadonlyArray<SupplyChainFilterMenuGroup>
> = {
  dwell: [
    { group: "Step", keys: ["stepName", "stepType", "product"] },
    { group: "Supplier", keys: ["material", "supplier"] },
    {
      group: "Observed days",
      keys: ["measureValue", "trendPct", "trendDirection"],
    },
    { group: "Inventory policy", keys: ["moq", "safetyStock"] },
    { group: "Cost", keys: ["carryingCost", "costTrendPct"] },
    { group: "Samples", keys: ["observations", "sampleConfidence"] },
    { group: "Status", keys: ["status", "statusAge"] },
  ],
  planning: [
    { group: "Step", keys: ["stepName", "stepType", "product"] },
    { group: "Supplier", keys: ["material", "supplier", "basis"] },
    { group: "Value", keys: ["materialValue"] },
    {
      group: "Plan",
      keys: [
        "plan",
        "measureValue",
        "deviationPct",
        "deviationDirection",
        "exceedingPlan",
        "crossedPlan",
        "planningWarnings",
      ],
    },
    // The low-sample badge renders inside the Trend cell, so the sample
    // filter sits with the trend ones here.
    {
      group: "Trend",
      keys: ["trendPct", "trendDirection", "sampleConfidence"],
    },
    { keys: ["status", "statusAge"] },
  ],
  trends: [
    { group: "Step", keys: ["stepName", "stepType", "product"] },
    { group: "Supplier", keys: ["material", "supplier", "basis"] },
    { group: "Days", keys: ["measureValue", "previousValue"] },
    {
      group: "Trend",
      keys: [
        "trendPct",
        "trendDirection",
        "deviationPct",
        "deviationDirection",
        "exceedingPlan",
        "crossedPlan",
      ],
    },
    { group: "Samples", keys: ["observations", "sampleConfidence"] },
    { keys: ["status"] },
  ],
  suppliers: [
    { group: "Vendor", keys: ["supplier"] },
    { group: "Materials", keys: ["material", "materialsCount"] },
    { group: "Lines", keys: ["lines", "lateLines"] },
    { group: "Reliability", keys: ["onTimePct", "otifPct"] },
    {
      group: "Delays",
      keys: ["meanDelayAll", "meanDelayWhenLate", "maxDelay"],
    },
  ],
  opportunities: [
    { group: "Step", keys: ["stepName", "product"] },
    { group: "Supplier", keys: ["material", "supplier", "basis"] },
    // The displayed impact values first, then the step metrics behind them:
    // observed days (in the evidence tooltip) and the worsening-step gate.
    {
      group: "Impact",
      keys: ["carryingCost", "p95DeviationPct", "measureValue", "trendPct"],
    },
    {
      group: "Sample",
      keys: ["sampleConfidence", "observations", "planningWarnings"],
    },
    { keys: ["status"] },
  ],
};

const menuFilterKeys = (
  menu: ReadonlyArray<SupplyChainFilterMenuGroup>,
): ReadonlySet<SupplyChainFilterKey> =>
  new Set(menu.flatMap((menuGroup) => menuGroup.keys));

/** Flattened menu membership per view, for availability checks. */
const viewFilterKeys: Record<
  SupplyChainFilterView,
  ReadonlySet<SupplyChainFilterKey>
> = {
  dwell: menuFilterKeys(STEP_FILTER_MENUS.dwell),
  planning: menuFilterKeys(STEP_FILTER_MENUS.planning),
  trends: menuFilterKeys(STEP_FILTER_MENUS.trends),
  suppliers: menuFilterKeys(STEP_FILTER_MENUS.suppliers),
  opportunities: menuFilterKeys(STEP_FILTER_MENUS.opportunities),
};

const definitionByKey = new Map<string, SupplyChainFilterDefinition>(
  STEP_FILTER_DEFINITIONS.map((definition) => [definition.key, definition]),
);

/** Definition lookup for rendering a chip's label and operators. */
export const supplyChainFilterDefinition = (key: SupplyChainFilterKey) =>
  definitionByKey.get(key);

export interface SupplyChainFilterApplication<Item> {
  rows: Item[];
  skippedKeys: SupplyChainFilterKey[];
}

const resolveActiveFilters = (filters: ActiveSupplyChainFilter[]) =>
  filters.flatMap((filter) => {
    if (!filter.value) {
      return [];
    }
    const definition = definitionByKey.get(filter.filterKey);
    return definition
      ? [{ key: filter.filterKey, definition, value: filter.value }]
      : [];
  });

export const applySupplyChainFiltersBy = <Item>(
  items: Item[],
  rowOf: (item: Item) => FilterableStepRow,
  filters: ActiveSupplyChainFilter[],
  context: SupplyChainFilterContext,
  view: SupplyChainFilterView,
): SupplyChainFilterApplication<Item> => {
  const active = resolveActiveFilters(filters);
  if (active.length === 0) {
    return { rows: items, skippedKeys: [] };
  }
  const applied: typeof active = [];
  const skippedKeys: SupplyChainFilterKey[] = [];
  for (const entry of active) {
    if (
      viewFilterKeys[view].has(entry.key) &&
      (items.length === 0 ||
        items.some((item) =>
          entry.definition.isApplicable(rowOf(item), context),
        ))
    ) {
      applied.push(entry);
    } else {
      skippedKeys.push(entry.key);
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

export const applySupplyChainFilters = <Row extends FilterableStepRow>(
  rows: Row[],
  filters: ActiveSupplyChainFilter[],
  context: SupplyChainFilterContext,
  view: SupplyChainFilterView,
): SupplyChainFilterApplication<Row> =>
  applySupplyChainFiltersBy(rows, (row) => row, filters, context, view);

/**
 * Filter keys a view offers in its add-filter menu: the view's own filters,
 * narrowed to those at least one of its rows carries the property for. An
 * empty table applies no data-narrowing (mirroring apply's empty-table
 * behaviour). Pass the view's full row set, not its filtered rows, so one
 * active filter cannot hide the others.
 */
export const applicableFilterKeys = (
  rows: FilterableStepRow[],
  context: SupplyChainFilterContext,
  view: SupplyChainFilterView,
): Set<SupplyChainFilterKey> =>
  new Set(
    [...viewFilterKeys[view]].filter((key) => {
      const definition = definitionByKey.get(key);
      return (
        !!definition &&
        (rows.length === 0 ||
          rows.some((row) => definition.isApplicable(row, context)))
      );
    }),
  );

/** Supplier-table variant: only filters with a `vendor` predicate apply. */
export const vendorApplicableFilterKeys = (): Set<SupplyChainFilterKey> =>
  new Set(
    [...definitionByKey.values()]
      .filter((definition) => definition.vendor)
      .map((definition) => definition.key as SupplyChainFilterKey),
  );

export const applyVendorSupplyChainFilters = (
  vendors: VendorOtifStats[],
  filters: ActiveSupplyChainFilter[],
  context: SupplyChainFilterContext,
): SupplyChainFilterApplication<VendorOtifStats> => {
  const active = resolveActiveFilters(filters);
  if (active.length === 0) {
    return { rows: vendors, skippedKeys: [] };
  }
  const applied = active.filter((entry) => entry.definition.vendor);
  const skippedKeys = active
    .filter((entry) => !entry.definition.vendor)
    .map((entry) => entry.key);
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
