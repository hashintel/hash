import { describe, expect, it } from "vitest";

import {
  applicableFilterKeys,
  STEP_FILTER_DEFINITIONS,
  STEP_FILTER_MENUS,
  supplyChainFilterLabel,
  applySupplyChainFilters,
  applyVendorSupplyChainFilters,
  buildSupplyChainFilterContext,
  buildSupplyChainFilterOptions,
  vendorApplicableFilterKeys,
  type ActiveSupplyChainFilter,
  type FilterableStepRow,
  type SupplyChainFilterContext,
  type SupplyChainFilterOptions,
  type SupplyChainFilterView,
} from "./supply-chain-filters";

import type {
  StepStats,
  StepType,
  VendorOtifStats,
} from "../../../shared/types";

const stats = (overrides: Partial<StepStats> = {}): StepStats => ({
  n: 20,
  mean: 10,
  median: 8,
  std: 2,
  min: 4,
  max: 30,
  p25: 6,
  p75: 12,
  p85: 14,
  p95: 24,
  ...overrides,
});

const row = (
  overrides: Partial<FilterableStepRow> & { id: string; type: StepType },
): FilterableStepRow => ({
  label: overrides.id,
  material: null,
  plant: "PLA",
  stats: stats(),
  plan: null,
  plan_note: null,
  cost: null,
  products: [],
  ...overrides,
});

const context = (rows: FilterableStepRow[]): SupplyChainFilterContext =>
  buildSupplyChainFilterContext({
    rows,
    measure: "median",
    timeRange: "12m",
    waccRate: 0.1,
    storageCost: 0.4,
    siteId: "site-1",
    statusHistory: {},
  });

const filter = (
  filterKey: ActiveSupplyChainFilter["filterKey"],
  operatorKey: string,
  value: unknown,
): ActiveSupplyChainFilter => ({
  filterKey,
  value: { key: operatorKey, value },
});

const rowsAfter = (
  rows: FilterableStepRow[],
  filters: ActiveSupplyChainFilter[],
  filterContext: SupplyChainFilterContext,
  view: SupplyChainFilterView = "planning",
): FilterableStepRow[] =>
  applySupplyChainFilters(rows, filters, filterContext, view).rows;

describe("applySupplyChainFilters", () => {
  const procurement = row({
    id: "procurement_mat-a",
    type: "procurement",
    material: "MAT-A",
    supplier_name: "Acme",
    plan: 10,
    stats: stats({ median: 15 }),
    planning_warnings: [{ code: "x", level: "warning", text: "conflict" }],
  });
  const dwell = row({
    id: "raw_material_dwell_mat-a",
    type: "raw_material_dwell",
    material: "MAT-A",
    periodCost: 5_000,
    products: [{ id: "prod-1", name: "Product 1" }],
  });
  const production = row({
    id: "prod_duration_fg",
    type: "production",
    material: "FG",
    previousValue: 12,
    plan: 10,
  });
  const rows = [procurement, dwell, production];

  it("returns rows unchanged with no filters or with an uncommitted chip", () => {
    const ctx = context(rows);
    expect(rowsAfter(rows, [], ctx)).toEqual(rows);
    expect(
      rowsAfter(rows, [{ filterKey: "stepType", value: null }], ctx),
    ).toEqual(rows);
  });

  it("filters by step type, with isNoneOf inverting", () => {
    const ctx = context(rows);
    expect(
      rowsAfter(rows, [filter("stepType", "isAnyOf", ["procurement"])], ctx),
    ).toEqual([procurement]);
    expect(
      rowsAfter(rows, [filter("stepType", "isNoneOf", ["procurement"])], ctx),
    ).toEqual([dwell, production]);
  });

  it("compares the selected measure with number operators, between order-agnostic", () => {
    const ctx = context(rows);
    expect(rowsAfter(rows, [filter("measureValue", "gte", 10)], ctx)).toEqual([
      procurement,
    ]);
    expect(
      rowsAfter(rows, [filter("measureValue", "between", [16, 5])], ctx),
    ).toEqual([procurement, dwell, production]);
  });

  it("excludes rows lacking the filtered property, deriving deviation from plan", () => {
    const ctx = context(rows);
    // procurement: (15-10)/10 = +50%; production: (8-10)/10 = -20%; dwell: no plan
    expect(rowsAfter(rows, [filter("deviationPct", "gte", 0)], ctx)).toEqual([
      procurement,
    ]);
    expect(rowsAfter(rows, [filter("deviationPct", "lte", 0)], ctx)).toEqual([
      production,
    ]);
  });

  it("treats presence filters as total: 'none' matches rows without the property", () => {
    const ctx = context(rows);
    expect(
      rowsAfter(rows, [filter("planningWarnings", "has", null)], ctx),
    ).toEqual([procurement]);
    expect(
      rowsAfter(rows, [filter("planningWarnings", "none", null)], ctx),
    ).toEqual([dwell, production]);
  });

  it("matches suppliers on non-procurement rows through their material", () => {
    const ctx = context(rows);
    expect(
      rowsAfter(rows, [filter("supplier", "isAnyOf", ["Acme"])], ctx),
    ).toEqual([procurement, dwell]);
  });

  it("only evaluates carrying cost on dwell-type rows", () => {
    const ctx = context(rows);
    expect(
      rowsAfter(rows, [filter("carryingCost", "gte", 1_000)], ctx, "dwell"),
    ).toEqual([dwell]);
  });

  it("filters dwell rows by their inventory-policy quantities", () => {
    const inventoryPolicy = {
      material: "MAT-P",
      plant: "PLA",
      minimum_order_qty: 1_000,
      order_multiple_qty: null,
      order_uom: null,
      minimum_order_source: null,
      safety_stock_qty: 100,
      safety_stock_uom: null,
      safety_stock_source: null,
      warnings: [],
    };
    const dwellWithPolicy = row({
      id: "raw_material_dwell_mat-p",
      type: "raw_material_dwell",
      material: "MAT-P",
      inventory_policy: inventoryPolicy,
    });
    const policyRows = [dwellWithPolicy, dwell];
    const ctx = context(policyRows);
    expect(
      rowsAfter(policyRows, [filter("moq", "gte", 500)], ctx, "dwell"),
    ).toEqual([dwellWithPolicy]);
    expect(
      rowsAfter(policyRows, [filter("safetyStock", "lte", 50)], ctx, "dwell"),
    ).toEqual([]);
  });

  it("filters planning rows by their planned days", () => {
    const ctx = context(rows);
    // dwell has no plan, so it is excluded rather than passed through.
    expect(rowsAfter(rows, [filter("plan", "gte", 5)], ctx)).toEqual([
      procurement,
      production,
    ]);
  });

  it("filters trend rows by their previous-period value", () => {
    const ctx = context(rows);
    expect(
      rowsAfter(rows, [filter("previousValue", "gte", 10)], ctx, "trends"),
    ).toEqual([production]);
  });

  it("derives P95 vs plan for the opportunities view", () => {
    const ctx = context(rows);
    // procurement and production: (24 - 10) / 10 = +140%; dwell has no plan.
    expect(
      rowsAfter(
        rows,
        [filter("p95DeviationPct", "gte", 100)],
        ctx,
        "opportunities",
      ),
    ).toEqual([procurement, production]);
  });

  it("detects steps that crossed their plan this period", () => {
    const ctx = context(rows);
    // production: previous 12 > plan 10, so it did not cross this period
    expect(rowsAfter(rows, [filter("crossedPlan", "yes", null)], ctx)).toEqual(
      [],
    );
    const crossed = row({
      id: "prod_duration_fg2",
      type: "production",
      plan: 10,
      previousValue: 9,
      stats: stats({ median: 11 }),
    });
    expect(
      rowsAfter([crossed], [filter("crossedPlan", "yes", null)], ctx),
    ).toEqual([crossed]);
  });

  it("skips filters no row is applicable to and reports them", () => {
    const ctx = context([dwell]);
    // The dwell view offers moq, but this row has no inventory policy.
    const application = applySupplyChainFilters(
      [dwell],
      [
        filter("moq", "gte", 1),
        filter("stepType", "isAnyOf", ["raw_material_dwell"]),
      ],
      ctx,
      "dwell",
    );
    expect(application.rows).toEqual([dwell]);
    expect(application.skippedKeys).toEqual(["moq"]);
  });

  it("skips filters the view does not offer, even when rows could match", () => {
    const ctx = context(rows);
    // Every row has stats.n, but the planning table shows no sample count.
    const onPlanning = applySupplyChainFilters(
      rows,
      [filter("observations", "gte", 21)],
      ctx,
      "planning",
    );
    expect(onPlanning.rows).toEqual(rows);
    expect(onPlanning.skippedKeys).toEqual(["observations"]);
    // The trend table has a Samples column, so the same filter applies there.
    const onTrends = applySupplyChainFilters(
      rows,
      [filter("observations", "gte", 21)],
      ctx,
      "trends",
    );
    expect(onTrends.rows).toEqual([]);
    expect(onTrends.skippedKeys).toEqual([]);
  });
});

describe("applyVendorSupplyChainFilters", () => {
  const vendor = (
    overrides: Partial<VendorOtifStats> & { vendor_id: string },
  ): VendorOtifStats => ({
    vendor_name: null,
    n_lines: 10,
    n_late: 2,
    on_time_pct: 80,
    in_full_pct: 90,
    otif_pct: 75,
    mean_days_late_all: 1,
    mean_days_late_when_late: 4,
    median_days_late_when_late: 3,
    max_days_late: 9,
    fill_rate_pct: null,
    late_buckets: {
      ge_1d_pct: null,
      ge_3d_pct: null,
      ge_7d_pct: null,
      ge_14d_pct: null,
    },
    ...overrides,
  });

  const acme = vendor({
    vendor_id: "V1",
    vendor_name: "Acme",
    materials: [
      {
        matnr: "MAT-A",
        name: "Material A",
        n_lines: 5,
        on_time_pct: null,
        otif_pct: null,
      },
    ],
  });
  const zeta = vendor({
    vendor_id: "V2",
    vendor_name: "Zeta",
    otif_pct: 95,
    max_days_late: 2,
  });

  it("filters vendors on supplier-performance metrics", () => {
    const ctx = context([]);
    expect(
      applyVendorSupplyChainFilters(
        [acme, zeta],
        [filter("maxDelay", "gte", 5)],
        ctx,
      ).rows,
    ).toEqual([acme]);
    expect(
      applyVendorSupplyChainFilters(
        [acme, zeta],
        [filter("otifPct", "gte", 90)],
        ctx,
      ).rows,
    ).toEqual([zeta]);
    expect(
      applyVendorSupplyChainFilters(
        [acme, zeta],
        [filter("materialsCount", "gte", 1)],
        ctx,
      ).rows,
    ).toEqual([acme]);
  });

  it("applies vendor-capable filters and skips the rest", () => {
    const application = applyVendorSupplyChainFilters(
      [acme, zeta],
      [
        filter("supplier", "isAnyOf", ["Acme"]),
        filter("measureValue", "gte", 1),
      ],
      context([]),
    );
    expect(application.rows).toEqual([acme]);
    expect(application.skippedKeys).toEqual(["measureValue"]);
  });

  it("matches vendors by supplied material", () => {
    const application = applyVendorSupplyChainFilters(
      [acme, zeta],
      [filter("material", "isAnyOf", ["MAT-A"])],
      context([]),
    );
    expect(application.rows).toEqual([acme]);
    expect(application.skippedKeys).toEqual([]);
  });
});

describe("applicableFilterKeys", () => {
  it("offers only filters some row carries the property for", () => {
    const dwellOnly = [
      row({
        id: "raw_material_dwell_mat-a",
        type: "raw_material_dwell",
        material: "MAT-A",
        periodCost: 5_000,
      }),
    ];
    const keys = applicableFilterKeys(dwellOnly, context(dwellOnly), "dwell");
    expect(keys.has("stepType")).toBe(true);
    expect(keys.has("carryingCost")).toBe(true);
    // No plan or inventory policy on any row: those filters are data-gated off.
    expect(keys.has("deviationPct")).toBe(false);
    expect(keys.has("moq")).toBe(false);
  });

  it("offers the view's own filters for an empty table", () => {
    const dwellKeys = applicableFilterKeys([], context([]), "dwell");
    expect(dwellKeys.has("moq")).toBe(true);
    expect(dwellKeys.has("costTrendPct")).toBe(true);
    expect(dwellKeys.has("statusAge")).toBe(true);
    // Not dwell-view filters, even though an empty table data-gates nothing.
    expect(dwellKeys.has("basis")).toBe(false);
    expect(dwellKeys.has("materialValue")).toBe(false);
    expect(dwellKeys.has("deviationPct")).toBe(false);

    const planningKeys = applicableFilterKeys([], context([]), "planning");
    expect(planningKeys.has("plan")).toBe(true);
    expect(planningKeys.has("deviationPct")).toBe(true);
    expect(planningKeys.has("observations")).toBe(false);

    const opportunityKeys = applicableFilterKeys(
      [],
      context([]),
      "opportunities",
    );
    expect(opportunityKeys.has("p95DeviationPct")).toBe(true);
    expect(opportunityKeys.has("stepType")).toBe(false);
  });
});

describe("STEP_FILTER_MENUS", () => {
  it("lists every filter definition in at least one view's menu", () => {
    const menuKeys = new Set(
      Object.values(STEP_FILTER_MENUS).flatMap((menu) =>
        menu.flatMap((menuGroup) => menuGroup.keys),
      ),
    );
    for (const definition of STEP_FILTER_DEFINITIONS) {
      expect(menuKeys.has(definition.key), definition.key).toBe(true);
    }
  });

  it("offers exactly the vendor-capable filters on the suppliers view", () => {
    const supplierMenuKeys = new Set(
      STEP_FILTER_MENUS.suppliers.flatMap((menuGroup) => menuGroup.keys),
    );
    expect(supplierMenuKeys).toEqual(vendorApplicableFilterKeys());
  });
});

describe("vendorApplicableFilterKeys", () => {
  it("offers only vendor-capable filters", () => {
    expect([...vendorApplicableFilterKeys()].sort()).toEqual([
      "lateLines",
      "lines",
      "material",
      "materialsCount",
      "maxDelay",
      "meanDelayAll",
      "meanDelayWhenLate",
      "onTimePct",
      "otifPct",
      "supplier",
    ]);
  });
});

describe("supplyChainFilterLabel", () => {
  const display: SupplyChainFilterOptions = {
    materialItems: [],
    productItems: [],
    supplierItems: [],
    currency: "CHF",
    timeRange: "12m",
    measure: "p95",
  };

  const labelOf = (key: string) =>
    supplyChainFilterLabel(
      STEP_FILTER_DEFINITIONS.find((definition) => definition.key === key)!,
      display,
    );

  it("resolves unit-aware labels from the display context", () => {
    expect(labelOf("carryingCost")).toBe("Carrying cost (12m)");
    expect(labelOf("materialValue")).toBe("Material value (12m)");
    expect(labelOf("measureValue")).toBe("Observed days (P95)");
    expect(labelOf("stepType")).toBe("Step type");
  });

  it("carries the currency in the input placeholder, not the label", () => {
    const carryingCost = STEP_FILTER_DEFINITIONS.find(
      (definition) => definition.key === "carryingCost",
    )!;
    const [firstOperator] = carryingCost.operators(display);
    expect(firstOperator?.input).toMatchObject({ placeholder: "CHF" });
  });
});

describe("buildSupplyChainFilterOptions", () => {
  it("derives sorted, deduplicated items from the row union", () => {
    const rows = [
      row({
        id: "procurement_b",
        type: "procurement",
        material: "MAT-B",
        material_name: "Material B",
        supplier_name: "Zeta",
      }),
      row({
        id: "procurement_b2",
        type: "procurement",
        material: "MAT-B",
        supplier_name: "Acme",
        products: [{ id: "prod-2", name: "Product 2" }],
      }),
    ];
    const options = buildSupplyChainFilterOptions(rows, {
      currency: "CHF",
      timeRange: "12m",
      measure: "median",
    });
    expect(options.supplierItems.map((item) => item.value)).toEqual([
      "Acme",
      "Zeta",
    ]);
    expect(options.materialItems).toEqual([
      { value: "MAT-B", text: "Material B MAT-B" },
    ]);
    expect(options.productItems).toEqual([
      { value: "prod-2", text: "Product 2" },
    ]);
  });

  it("derives material names from step labels when material_name is absent", () => {
    const rows = [
      row({
        id: "procurement_ha",
        type: "procurement",
        material: "90000100001",
        label: "Procurement: Highland Arabica",
      }),
      // A location-scoped step's label suffix names a hub, not the material.
      row({
        id: "dest_dwell_hub1",
        type: "destination_dwell",
        material: "90000300001",
        label: "Destination Dwell: HUB-1",
      }),
    ];
    const options = buildSupplyChainFilterOptions(rows, {
      currency: "CHF",
      timeRange: "12m",
      measure: "median",
    });
    expect(options.materialItems).toEqual([
      { value: "90000300001", text: "90000300001" },
      { value: "90000100001", text: "Highland Arabica 90000100001" },
    ]);
  });
});
