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
    expect(scoped.monthly).toEqual([
      {
        month: "2026-01",
        mean: 15,
        median: 15,
        n: 2,
        total_kg_days: 500,
      },
    ]);
    expect(scoped.pct_exceeding_plan).toBe(50);
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
    expect(scoped.monthly[0]?.total_kg_days).toBe(100);
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
      {
        month: "2026-01",
        mean: 15,
        median: 15,
        n: 2,
        total_kg_days: 500,
      },
    ]);
    expect(scoped.stats).toMatchObject({ n: 2, mean: 15, median: 15 });
  });
});
