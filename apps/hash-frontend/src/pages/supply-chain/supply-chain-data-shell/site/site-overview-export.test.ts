import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SITE_OVERVIEW_EXPORT_COLUMNS,
  buildSiteOverviewCsv,
  buildSiteOverviewExportRows,
} from "./site-overview-export";

import type { StatusStore } from "../../shared/status";
import type { SiteNode, StepStats } from "../../shared/types";
import type { DwellRow, PlanningRow } from "./shared/row-types";
import type { EntityId } from "@blockprotocol/type-system";

const stats: StepStats = {
  n: 2,
  mean: 15,
  median: 15,
  std: 5,
  min: 10,
  max: 20,
  p25: 12.5,
  p75: 17.5,
  p85: 18.5,
  p95: 19.5,
};
const currentStats: StepStats = {
  n: 1,
  mean: 20,
  median: 20,
  std: 0,
  min: 20,
  max: 20,
  p25: 20,
  p75: 20,
  p85: 20,
  p95: 20,
};

const baseNode: SiteNode = {
  id: "raw_dwell_MAT-1",
  label: "Raw material dwell",
  type: "raw_material_dwell",
  material: "MAT-1",
  material_name: "Material One",
  plant: "SITE-1",
  stats,
  plan: 12,
  plan_note: "Target",
  cost: { unit_price: 100.123, currency: "GBP" },
  material_value: {
    unit_cost: 50,
    currency: "JPY",
    unit_cost_source: "test",
    uom: "KG",
    monthly: [],
  },
  observations: [
    { date: "2026-03-01", value: 10 },
    { date: "2026-06-01", value: 20 },
  ],
  mean_observations: [
    { date: "2026-03-01", value: 10 },
    { date: "2026-06-01", value: 20 },
  ],
  products: [{ id: "product-1", name: "Product, One" }],
};

const dwellRow: DwellRow = {
  ...baseNode,
  stats: currentStats,
  periodCost: 250,
  previousPeriodCost: 200,
  previousCostN: 1,
  costTrendPct: 25,
  trendPct: 100,
  previousValue: 10,
  previousTrendN: 1,
};

const planningRow: PlanningRow = {
  ...baseNode,
  id: "prod_duration_MAT-1",
  label: "Production",
  type: "production",
  stats: currentStats,
  periodMaterialValue: 5000.123,
  deviationPct: 25,
  trendPct: 100,
  previousValue: 10,
  previousTrendN: 1,
};

describe("site overview export", () => {
  afterEach(() => vi.useRealTimers());

  it("exports dwell and planning rows with every measure and status history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const statusHistory: StatusStore = {
      "site-1::dwell::raw_dwell_MAT-1": [
        {
          entityId: "web~status-2" as EntityId,
          at: "2026-07-02T10:00:00.000Z",
          user: "Second",
          category: "Investigation update" as const,
          text: "",
          tokens: [
            { tokenType: "text" as const, text: "Later, with comma " },
            {
              tokenType: "mention" as const,
              mentionType: "user" as const,
              entityId: "web~alex" as EntityId,
            },
          ],
        },
        {
          entityId: "web~status-1" as EntityId,
          at: "2026-07-01T10:00:00.000Z",
          user: "First",
          category: "Investigation started" as const,
          text: "",
          tokens: [],
        },
      ],
    };

    const input = {
      dwellRows: [dwellRow],
      historicalNodes: [baseNode, planningRow],
      mentionShortnamesByEntityId: new Map([["web~alex" as EntityId, "alex"]]),
      planningRows: [planningRow],
      products: [{ id: "product-1", material: "FG-1", name: "Product, One" }],
      settings: {
        currency: "GBP",
        excludeLowSamples: true,
        excludeOutliers: true,
        procurementBasis: "first" as const,
        storageCost: 0.2,
        timeRange: "3m" as const,
        waccRate: 0.1,
      },
      siteId: "site-1",
      statusHistory,
    };
    const rows = buildSiteOverviewExportRows(input);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      category: "Dwell",
      step_type: "Raw material dwell",
      material_name: "Material One",
      material: "MAT-1",
      plant: "SITE-1",
      opportunity_status: "Investigating",
      latest_status_category: "Investigation update",
      mean_current: 20,
      mean_previous: 10,
      mean_trend_percent: 100,
      mean_trend_direction: "worsening",
      mean_deviation_percent: 66.7,
      median_current: 20,
      p75_current: 20,
      p95_current: 20,
      period_dwell_cost: 250,
      previous_period_dwell_cost: 200,
      dwell_cost_trend_percent: 25,
      dwell_cost_currency: "GBP",
      analysis_currency: "GBP",
      low_samples_excluded: "Yes",
      unit_price: 100.123,
      unit_price_currency: "GBP",
      material_value_currency: "JPY",
      previous_sample_count: 1,
    });
    expect(rows[0]?.comments).toContain("First");
    expect(rows[0]?.comments).toContain("Later, with comma @alex");
    expect(rows[0]?.comments?.toString().indexOf("First")).toBeLessThan(
      rows[0]?.comments?.toString().indexOf("Second") ?? 0,
    );
    expect(rows[1]).toMatchObject({
      category: "Planning",
      period_material_value: 5000.123,
    });

    const csv = buildSiteOverviewCsv(input);
    expect(csv).toContain("Mean current (days)");
    expect(csv).toContain("P95 trend (%)");
    expect(csv).toContain("Material value currency");
    expect(csv).not.toContain("P95 current samples");
    expect(csv).toContain('"Product, One"');
    expect(csv).toContain("Later, with comma @alex");
    expect(
      buildSiteOverviewCsv({
        ...input,
        mentionShortnamesByEntityId: new Map(),
      }),
    ).toContain("Later, with comma @web~alex");
  });

  it("orders and trims columns for spreadsheet review", () => {
    const labels = SITE_OVERVIEW_EXPORT_COLUMNS.map((column) => column.label);

    expect(labels.slice(0, 5)).toEqual([
      "Category",
      "Step type",
      "Material name",
      "Material number",
      "Plant",
    ]);
    expect(labels).not.toEqual(
      expect.arrayContaining([
        "Step",
        "Step ID",
        "Site",
        "Product IDs",
        "Planning profile ID",
        "Observation grain",
      ]),
    );
    expect(labels.indexOf("P95 vs plan (%)")).toBe(
      labels.indexOf("Plan (days)") + 1,
    );
    expect(labels.indexOf("Outliers excluded from mean")).toBe(
      labels.indexOf("Mean vs plan (%)") + 1,
    );
    expect(labels.slice(-9)).toEqual([
      "Procurement timing basis",
      "Low samples excluded",
      "WACC (%)",
      "Storage cost per tonne per day",
      "Analysis currency",
      "Period material value",
      "Material value currency",
      "Unit price",
      "Unit price currency",
    ]);
  });
});
