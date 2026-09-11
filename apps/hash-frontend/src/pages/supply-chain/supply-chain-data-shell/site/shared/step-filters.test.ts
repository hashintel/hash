import { describe, expect, it } from "vitest";

import {
  applyStepFilters,
  applyVendorStepFilters,
  buildStepFilterContext,
  buildStepFilterOptions,
  type ActiveStepFilter,
  type FilterableStepRow,
  type StepFilterContext,
} from "./step-filters";

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

const context = (rows: FilterableStepRow[]): StepFilterContext =>
  buildStepFilterContext({
    rows,
    measure: "median",
    timeRange: "12m",
    waccRate: 0.1,
    storageCost: 0.4,
    siteId: "site-1",
    statusHistory: {},
  });

const filter = (
  filterKey: ActiveStepFilter["filterKey"],
  operatorKey: string,
  value: unknown,
): ActiveStepFilter => ({ filterKey, value: { key: operatorKey, value } });

const rowsAfter = (
  rows: FilterableStepRow[],
  filters: ActiveStepFilter[],
  filterContext: StepFilterContext,
): FilterableStepRow[] => applyStepFilters(rows, filters, filterContext).rows;

describe("applyStepFilters", () => {
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
      rowsAfter(rows, [filter("carryingCost", "gte", 1_000)], ctx),
    ).toEqual([dwell]);
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
    const application = applyStepFilters(
      [dwell],
      [
        filter("deviationPct", "gte", 0),
        filter("stepType", "isAnyOf", ["raw_material_dwell"]),
      ],
      ctx,
    );
    expect(application.rows).toEqual([dwell]);
    expect(application.skippedKeys).toEqual(["deviationPct"]);
  });
});

describe("applyVendorStepFilters", () => {
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
  const zeta = vendor({ vendor_id: "V2", vendor_name: "Zeta" });

  it("applies vendor-capable filters and skips the rest", () => {
    const application = applyVendorStepFilters(
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
    const application = applyVendorStepFilters(
      [acme, zeta],
      [filter("material", "isAnyOf", ["MAT-A"])],
      context([]),
    );
    expect(application.rows).toEqual([acme]);
    expect(application.skippedKeys).toEqual([]);
  });
});

describe("buildStepFilterOptions", () => {
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
    const options = buildStepFilterOptions(rows);
    expect(options.supplierItems.map((item) => item.value)).toEqual([
      "Acme",
      "Zeta",
    ]);
    expect(options.materialItems).toEqual([
      { value: "MAT-B", text: "Material B" },
    ]);
    expect(options.productItems).toEqual([
      { value: "prod-2", text: "Product 2" },
    ]);
  });
});
