import { describe, expect, it } from "vitest";

import { computePeriodCost } from "./cost";
import {
  scopeDwellNodeToProduct,
  scopeDwellStepToProduct,
} from "./product-dwell-scope";

import type { DetailRows, GraphNode, StepDetail, StepStats } from "./types";

const zeroStats: StepStats = {
  n: 0,
  mean: 0,
  median: 0,
  std: 0,
  min: 0,
  max: 0,
  p25: 0,
  p75: 0,
  p85: 0,
  p95: 0,
};

const dwellRows: DetailRows = {
  columns: [
    {
      key: "batch",
      source_field: null,
      source_table: null,
      label: "Batch",
    },
    {
      key: "consumption_date",
      source_field: null,
      source_table: null,
      label: "Consumption Date",
    },
    {
      key: "dwell_days",
      source_field: null,
      source_table: null,
      label: "Dwell Days",
      unit: "d",
    },
    {
      key: "kg_days",
      source_field: null,
      source_table: null,
      label: "Inventory kg-days",
      unit: "kg·d",
    },
    {
      key: "cons_matnr",
      source_field: null,
      source_table: null,
      label: "Consuming Material",
    },
    {
      key: "cons_material_name",
      source_field: null,
      source_table: null,
      label: "Consuming Material Name",
    },
    {
      key: "cons_in_current_recipe",
      source_field: null,
      source_table: null,
      label: "In Current Recipe",
    },
  ],
  rows: [
    {
      batch: "A",
      consumption_date: "2026-01-10",
      dwell_days: 10,
      kg_days: 100,
      cons_matnr: "FG-1",
      cons_material_name: "Finished Good",
      cons_in_current_recipe: 1,
    },
    {
      batch: "B",
      consumption_date: "2026-01-20",
      dwell_days: 20,
      kg_days: 400,
      cons_matnr: "INT-1",
      cons_material_name: "In-scope Intermediate",
      cons_in_current_recipe: 1,
    },
    {
      batch: "C",
      consumption_date: "2026-02-05",
      dwell_days: 50,
      kg_days: 1000,
      cons_matnr: "FG-2",
      cons_material_name: "Other Finished Good",
      cons_in_current_recipe: 0,
    },
  ],
};

function dwellStep(overrides: Partial<StepDetail> = {}): StepDetail {
  return {
    id: "raw_dwell",
    label: "Raw Material Dwell",
    type: "raw_material_dwell",
    durations: [10, 20, 50],
    observations: [
      { date: "2026-01-10", value: 10 },
      { date: "2026-01-20", value: 20 },
      { date: "2026-02-05", value: 50 },
    ],
    monthly: [
      {
        month: "2026-01",
        mean: 15,
        median: 15,
        n: 2,
        total_kg_days: 500,
      },
      {
        month: "2026-02",
        mean: 50,
        median: 50,
        n: 1,
        total_kg_days: 1000,
      },
    ],
    stats: { ...zeroStats, n: 3, mean: 26.7, median: 20 },
    plan: 15,
    plan_note: null,
    cost: { unit_price: 2, currency: "EUR" },
    detail_rows: dwellRows,
    ref_date_col: "consumption_date",
    value_col: "dwell_days",
    ...overrides,
  };
}

function dwellNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "raw_dwell",
    label: "Raw Material Dwell",
    type: "raw_material_dwell",
    material: "RAW-1",
    plant: "PL-A",
    observations: [
      { date: "2026-01-10", value: 10 },
      { date: "2026-01-20", value: 20 },
      { date: "2026-02-05", value: 50 },
    ],
    monthly: [
      {
        month: "2026-01",
        mean: 15,
        median: 15,
        n: 2,
        total_kg_days: 500,
      },
      {
        month: "2026-02",
        mean: 50,
        median: 50,
        n: 1,
        total_kg_days: 1000,
      },
    ],
    stats: { ...zeroStats, n: 3, mean: 26.7, median: 20 },
    plan: 15,
    plan_note: null,
    cost: { unit_price: 2, currency: "EUR" },
    ...overrides,
  };
}

describe("scopeDwellStepToProduct", () => {
  it("keeps the finished good and in-scope intermediates, then recomputes timing and kg-days", () => {
    const scoped = scopeDwellStepToProduct(dwellStep(), {
      productMaterial: "FG-1",
      productName: "Finished Good",
    });

    expect(scoped.detail_rows?.rows.map((row) => row.batch)).toEqual([
      "A",
      "B",
    ]);
    expect(scoped.observations).toEqual([
      { date: "2026-01-10", value: 10 },
      { date: "2026-01-20", value: 20 },
    ]);
    expect(scoped.stats).toMatchObject({ n: 2, mean: 15, median: 15 });
    // kg-days spread across the months each batch was held (receipt -> consumption),
    // matching the generator's balance-walk monthly rather than the consumption
    // month alone. A (kg 100, dwell 10, to 2026-01-10): Dec 10 + Jan 90; B (kg 400,
    // dwell 20, to 2026-01-20): Dec 20 + Jan 380. Timing stats stay keyed by the
    // consumption month, so 2025-12 carries cost but no observations.
    expect(scoped.monthly).toEqual([
      { month: "2025-12", mean: 0, median: 0, n: 0, total_kg_days: 30 },
      { month: "2026-01", mean: 15, median: 15, n: 2, total_kg_days: 470 },
    ]);
    expect(scoped.pct_exceeding_plan).toBe(50);
  });

  it("keeps consumption into the current finished good even when it is off the current BOM", () => {
    const step = dwellStep({
      detail_rows: {
        ...dwellRows,
        rows: [
          {
            batch: "OFFBOM",
            consumption_date: "2026-01-15",
            dwell_days: 30,
            kg_days: 300,
            cons_matnr: "FG-1",
            cons_material_name: "Finished Good",
            // Intermediate dropped from FG-1's live BOM, but the consumption
            // into FG-1 still happened -- it must remain in FG-1's view.
            cons_in_current_recipe: 0,
          },
          {
            batch: "OTHER",
            consumption_date: "2026-01-25",
            dwell_days: 40,
            kg_days: 800,
            cons_matnr: "FG-2",
            cons_material_name: "Other Finished Good",
            cons_in_current_recipe: 0,
          },
        ],
      },
    });

    const scoped = scopeDwellStepToProduct(step, {
      productMaterial: "FG-1",
      productName: "Finished Good",
    });

    expect(scoped.detail_rows?.rows.map((row) => row.batch)).toEqual([
      "OFFBOM",
    ]);
    expect(scoped.stats).toMatchObject({ n: 1 });
  });

  it("falls back to direct finished-good matches when recipe membership is absent", () => {
    const rowsWithoutMembership = dwellRows.rows.map(
      ({ cons_in_current_recipe: _recipeMembership, ...row }) => row,
    );
    const scoped = scopeDwellStepToProduct(
      dwellStep({
        detail_rows: {
          columns: dwellRows.columns.filter(
            (column) => column.key !== "cons_in_current_recipe",
          ),
          rows: rowsWithoutMembership,
        },
      }),
      { productMaterial: "FG-1" },
    );

    expect(scoped.detail_rows?.rows.map((row) => row.batch)).toEqual(["A"]);
    // A (kg 100, dwell 10, to 2026-01-10) spreads to Dec 10 + Jan 90; the total
    // carried kg-days is preserved.
    expect(
      scoped.monthly.reduce(
        (sum, month) => sum + (month.total_kg_days ?? 0),
        0,
      ),
    ).toBe(100);
  });

  it("leaves non-dwell steps unchanged", () => {
    const step = dwellStep({ type: "production" });

    expect(scopeDwellStepToProduct(step, { productMaterial: "FG-1" })).toBe(
      step,
    );
  });

  it("drives different product costs for a shared raw material", () => {
    const step = dwellStep({
      detail_rows: {
        ...dwellRows,
        rows: [
          {
            batch: "A",
            consumption_date: "2026-01-10",
            dwell_days: 10,
            kg_days: 100,
            cons_matnr: "FG-1",
            cons_material_name: "Product One",
            cons_in_current_recipe: null,
          },
          {
            batch: "B",
            consumption_date: "2026-01-20",
            dwell_days: 20,
            kg_days: 700,
            cons_matnr: "FG-2",
            cons_material_name: "Product Two",
            cons_in_current_recipe: null,
          },
        ],
      },
    });

    const productOne = scopeDwellStepToProduct(step, {
      productMaterial: "FG-1",
    });
    const productTwo = scopeDwellStepToProduct(step, {
      productMaterial: "FG-2",
    });

    expect(
      computePeriodCost(productOne.monthly, step.cost?.unit_price, 0.1, 0.4),
    ).not.toBe(
      computePeriodCost(productTwo.monthly, step.cost?.unit_price, 0.1, 0.4),
    );
  });

  it("recomputes graph node kg-days from scoped step detail rows", () => {
    const scoped = scopeDwellNodeToProduct(dwellNode(), dwellStep(), {
      productMaterial: "FG-1",
      productName: "Finished Good",
    });

    expect(scoped.observations).toEqual([
      { date: "2026-01-10", value: 10 },
      { date: "2026-01-20", value: 20 },
    ]);
    expect(scoped.monthly).toEqual([
      { month: "2025-12", mean: 0, median: 0, n: 0, total_kg_days: 30 },
      { month: "2026-01", mean: 15, median: 15, n: 2, total_kg_days: 470 },
    ]);
    expect(scoped.stats).toMatchObject({ n: 2, mean: 15, median: 15 });
  });

  it("drops open carry rows from a product's cost, rows and stats", () => {
    const step = dwellStep({
      detail_rows: {
        columns: [
          ...dwellRows.columns,
          {
            key: "carry_status",
            source_field: null,
            source_table: null,
            label: "Carry Status",
          },
        ],
        rows: [
          {
            batch: "A",
            consumption_date: "2026-01-10",
            dwell_days: 10,
            kg_days: 100,
            cons_matnr: "FG-1",
            cons_material_name: "Finished Good",
            cons_in_current_recipe: 1,
            carry_status: "consumed",
          },
          {
            batch: "OPEN",
            consumption_date: null,
            dwell_days: null,
            kg_days: 9999,
            cons_matnr: null,
            cons_material_name: null,
            cons_in_current_recipe: null,
            carry_status: "open (not dispatched)",
          },
        ],
      },
    });

    const scoped = scopeDwellStepToProduct(step, {
      productMaterial: "FG-1",
      productName: "Finished Good",
    });

    expect(scoped.detail_rows?.rows.map((row) => row.batch)).toEqual(["A"]);
    // Only the realized A row counts (open dropped); its kg-days spread Dec 10 +
    // Jan 90.
    expect(scoped.monthly).toEqual([
      { month: "2025-12", mean: 0, median: 0, n: 0, total_kg_days: 10 },
      { month: "2026-01", mean: 10, median: 10, n: 1, total_kg_days: 90 },
    ]);
  });

  it("keeps every realized row across products in site context", () => {
    const scoped = scopeDwellStepToProduct(
      dwellStep(),
      {},
      { scopeToProduct: false },
    );

    // Every finished good's realized rows are retained (no product filter),
    // so the site slideover carry matches the site's realized dwell.
    expect(scoped.detail_rows?.rows.map((row) => row.batch)).toEqual([
      "A",
      "B",
      "C",
    ]);
    // All three realized rows spread across their held months:
    //   A (kg 100, dwell 10, to 2026-01-10): Dec 10, Jan 90
    //   B (kg 400, dwell 20, to 2026-01-20): Dec 20, Jan 380
    //   C (kg 1000, dwell 50, to 2026-02-05): Dec 300, Jan 620, Feb 80
    // Timing stats stay keyed by the consumption month.
    expect(scoped.monthly).toEqual([
      { month: "2025-12", mean: 0, median: 0, n: 0, total_kg_days: 330 },
      { month: "2026-01", mean: 15, median: 15, n: 2, total_kg_days: 1090 },
      { month: "2026-02", mean: 50, median: 50, n: 1, total_kg_days: 80 },
    ]);
  });

  it("keeps all realized post-QA rows (no consuming-material columns)", () => {
    const postQaStep = dwellStep({
      type: "post_qa_ship",
      ref_date_col: "dispatch_date",
      value_col: "post_qa_ship_days",
      detail_rows: {
        columns: [
          {
            key: "batch",
            source_field: null,
            source_table: null,
            label: "Batch",
          },
          {
            key: "dispatch_date",
            source_field: null,
            source_table: null,
            label: "Exit Date",
          },
          {
            key: "post_qa_ship_days",
            source_field: null,
            source_table: null,
            label: "Post-QA Days",
          },
          {
            key: "kg_days",
            source_field: null,
            source_table: null,
            label: "kg-Days",
          },
          {
            key: "carry_status",
            source_field: null,
            source_table: null,
            label: "Carry Status",
          },
        ],
        rows: [
          {
            batch: "D1",
            dispatch_date: "2026-03-04",
            post_qa_ship_days: 12,
            kg_days: 240,
            carry_status: "dispatched",
          },
          {
            batch: "OPEN",
            dispatch_date: null,
            post_qa_ship_days: null,
            kg_days: 5000,
            carry_status: "open (not dispatched)",
          },
        ],
      },
    });

    const scoped = scopeDwellStepToProduct(postQaStep, {
      productMaterial: "FG-1",
      productName: "Finished Good",
    });

    expect(scoped.detail_rows?.rows.map((row) => row.batch)).toEqual(["D1"]);
    // D1 (kg 240, dwell 12, dispatched 2026-03-04) spreads over [2026-02-20,
    // 2026-03-04): Feb 9 days = 180, Mar 3 days = 60.
    expect(scoped.monthly).toEqual([
      { month: "2026-02", mean: 0, median: 0, n: 0, total_kg_days: 180 },
      { month: "2026-03", mean: 12, median: 12, n: 1, total_kg_days: 60 },
    ]);
  });

  it("scopes in and accrues open carry across months when includeOpenCarry is set", () => {
    const postQaStep = dwellStep({
      type: "post_qa_ship",
      ref_date_col: "dispatch_date",
      value_col: "post_qa_ship_days",
      // Global data horizon: open carry accrues over [horizon-open_days+1, horizon].
      data_horizon: "2026-03-15",
      detail_rows: {
        columns: [
          {
            key: "batch",
            source_field: null,
            source_table: null,
            label: "Batch",
          },
          {
            key: "dispatch_date",
            source_field: null,
            source_table: null,
            label: "Exit Date",
          },
          {
            key: "post_qa_ship_days",
            source_field: null,
            source_table: null,
            label: "Post-QA Days",
          },
          {
            key: "kg_days",
            source_field: null,
            source_table: null,
            label: "kg-Days",
          },
          {
            key: "open_qty",
            source_field: null,
            source_table: null,
            label: "Open Qty",
          },
          {
            key: "open_days",
            source_field: null,
            source_table: null,
            label: "Open Days",
          },
          {
            key: "carry_status",
            source_field: null,
            source_table: null,
            label: "Carry Status",
          },
        ],
        rows: [
          {
            batch: "D1",
            dispatch_date: "2026-03-04",
            post_qa_ship_days: 12,
            kg_days: 240,
            open_qty: null,
            open_days: null,
            carry_status: "dispatched",
          },
          {
            batch: "OPEN",
            dispatch_date: null,
            post_qa_ship_days: null,
            kg_days: 440,
            open_qty: 10,
            open_days: 44,
            carry_status: "open (not dispatched)",
          },
        ],
      },
    });

    const scoped = scopeDwellStepToProduct(
      postQaStep,
      { productMaterial: "FG-1", productName: "Finished Good" },
      { includeOpenCarry: true },
    );

    // The open row is retained in the table...
    expect(scoped.detail_rows?.rows.map((row) => row.batch)).toEqual([
      "D1",
      "OPEN",
    ]);
    // ...but contributes no dwell-duration observation (timing stays realized-only).
    expect(scoped.observations).toEqual([{ date: "2026-03-04", value: 12 }]);
    expect(scoped.stats).toMatchObject({ n: 1, mean: 12, median: 12 });
    // Open carry (open_qty 10 over [2026-01-31, 2026-03-15]) accrues per month:
    // Jan 1d=10, Feb 28d=280, Mar 15d=150. The realized D1 row (kg 240, dwell 12)
    // now spreads too, over [2026-02-20, 2026-03-04): Feb 180 + Mar 60. So the
    // months combine to Jan 10, Feb 280+180=460, Mar 150+60=210.
    expect(scoped.monthly).toEqual([
      { month: "2026-01", mean: 0, median: 0, n: 0, total_kg_days: 10 },
      { month: "2026-02", mean: 0, median: 0, n: 0, total_kg_days: 460 },
      { month: "2026-03", mean: 12, median: 12, n: 1, total_kg_days: 210 },
    ]);
  });
});
