import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDwellOpportunityBrief,
  buildPlanningOpportunityBrief,
  computeTrend,
} from "./opportunity-utils";

import type {
  DetailRows,
  Observation,
  SiteNode,
  StepDetail,
  StepStats,
} from "../../shared/types";

const baseStats: StepStats = {
  n: 20,
  mean: 12,
  median: 10,
  std: 2,
  min: 5,
  max: 25,
  p25: 8,
  p75: 14,
  p85: 18,
  p95: 22,
};

function step(overrides: Partial<StepDetail>): StepDetail {
  return {
    id: "step-1",
    label: "Step 1",
    type: "production",
    durations: [8, 10, 12],
    observations: [
      { date: "2025-08-01", value: 9 },
      { date: "2026-02-01", value: 12 },
    ],

    monthly: [
      { month: "2026-01", mean: null, median: null, n: 2, total_kg_days: 1000 },
    ],

    stats: baseStats,
    plan: 12,
    plan_note: null,
    pct_exceeding_plan: 35,
    cost: { unit_price: 100, currency: "EUR" },
    ...overrides,
  };
}

describe("opportunity brief helpers", () => {
  it("adds trigger, confidence, and recommended actions to dwell briefs", () => {
    const brief = buildDwellOpportunityBrief(
      step({ type: "qa_hold" }),
      step({ type: "qa_hold" }),
      "12m",
      {
        waccRate: 0.1,
        storageCost: 0.336,
      },
    );

    expect(brief.opportunityTrigger.label).toBe("High dwell cost");
    expect(brief.opportunityTrigger.reason).toContain("carry cost");
    expect(brief.confidence.label).toBe("Warning");
    expect(brief.recommendedActions[0]?.text).toContain(
      "longest release delays",
    );
    expect(brief.recommendedActions.map((action) => action.kind)).toEqual([
      "evidence",
      "evidence",
      "process",
      "planning",
    ]);
    expect(brief.diagnosis[0]).toContain("check whether retests");
    expect(
      brief.evidenceFlags.some((flag) => flag.label === "Wide distribution"),
    ).toBe(false);
    expect(brief.distributionInsight).toContain(
      "Estimated 95th-percentile dwell is",
    );
  });

  it("builds ordered dwell cap scenarios from observed dwell values", () => {
    const brief = buildDwellOpportunityBrief(
      step({
        stats: { ...baseStats, mean: 14, median: 10, p25: 8, p95: 22 },
        observations: [
          { date: "2026-01-01", value: 6 },
          { date: "2026-01-02", value: 10 },
          { date: "2026-01-03", value: 20 },
          { date: "2026-01-04", value: 30 },
        ],
      }),
      step({ observations: [] }),
      "12m",
      { waccRate: 0.1, storageCost: 0.336 },
    );

    expect(brief.scenarios.map((scenario) => scenario.label)).toEqual([
      "Moderate",
      "Stretch",
    ]);
    const moderateScenario = brief.scenarios[0];
    const stretchScenario = brief.scenarios[1];
    expect(moderateScenario).toBeDefined();
    expect(stretchScenario).toBeDefined();
    expect(moderateScenario!.targetDays).toBe(10);
    expect(stretchScenario!.targetDays).toBe(8);
    expect(stretchScenario!.reductionPct).toBeGreaterThanOrEqual(
      moderateScenario!.reductionPct,
    );
    expect(brief.scenarios.every((scenario) => !scenario.approximate)).toBe(
      true,
    );
  });

  it("foregrounds planning distribution metrics versus plan", () => {
    const brief = buildPlanningOpportunityBrief(
      step({
        plan: 10,
        stats: { ...baseStats, mean: 11, median: 8, p95: 15 },
        pct_exceeding_plan: 35,
      }),
      step({
        plan: 10,
        stats: { ...baseStats, mean: 11, median: 8, p95: 15 },
        pct_exceeding_plan: 35,
      }),
      "12m",
      "planning_over",
    );

    expect(brief.p95Days).toBe(15);
    expect(brief.medianDays).toBe(8);
    expect(brief.meanDays).toBe(11);
    expect(brief.medianDeviationPct).toBeCloseTo(-20, 6);
    expect(brief.meanDeviationPct).toBeCloseTo(10, 6);
    expect(brief.p95DeviationPct).toBeCloseTo(50, 6);
    expect(brief.nExceedingPlan).toBe(7);
    expect(brief.calibrationDirection).toBe("increase");
    expect(brief.opportunityTrigger.primaryMetric).toContain("+50%");
    expect(brief.diagnosis[0]).toContain("below the observed high-percentile");
    expect(brief.diagnosis.some((line) => line.includes("trend"))).toBe(true);
    expect(brief.recommendedActions[0]?.text).toContain(
      "longest normalized durations",
    );
  });

  it("labels conservative planning candidates as tighten opportunities", () => {
    const brief = buildPlanningOpportunityBrief(
      step({ plan: 20, stats: { ...baseStats, median: 8, p95: 14 } }),
      step({ plan: 20, stats: { ...baseStats, median: 8, p95: 14 } }),
      "12m",
    );

    expect(brief.p95DeviationPct).toBeCloseTo(-30, 6);
    expect(brief.calibrationDirection).toBe("tighten");
    expect(brief.opportunityTrigger.label).toBe(
      "Conservative planning parameter",
    );
  });

  it("keeps high outlier exclusion as confidence context when retained observations are enough", () => {
    const brief = buildDwellOpportunityBrief(
      step({
        excluded_pct: 35,
        stats: { ...baseStats, n: 60 },
        observations: [
          { date: new Date().toISOString().slice(0, 10), value: 9 },
        ],
      }),
      step({ observations: [] }),
      "12m",
      { waccRate: 0.1, storageCost: 0.336 },
    );

    expect(brief.confidence.label).toBe("High");
    expect(brief.confidence.explanation).toContain("Outlier-sensitive");
  });
});

function detailRows(
  keys: string[],
  rows: Record<string, string | number | null>[],
): DetailRows {
  return {
    columns: keys.map((key) => ({
      key,
      source_field: null,
      source_table: null,
      label: key,
    })),
    rows,
  };
}

describe("dwell detail-row analytics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("derives receipt->first-consumption dwell per batch for lot-based dwell stages", () => {
    const rows = [
      {
        batch: "A",
        consumption_date: "2026-01-10",
        dwell_days: 5,
        kg_days: 100,
      },
      {
        batch: "A",
        consumption_date: "2026-02-10",
        dwell_days: 35,
        kg_days: 700,
      },
      {
        batch: "B",
        consumption_date: "2026-01-15",
        dwell_days: 8,
        kg_days: 160,
      },
      {
        batch: "B",
        consumption_date: "2026-03-15",
        dwell_days: 60,
        kg_days: 1200,
      },
      {
        batch: "C",
        consumption_date: "2026-01-20",
        dwell_days: 11,
        kg_days: 220,
      },
      {
        batch: "D",
        consumption_date: "2026-02-01",
        dwell_days: 6,
        kg_days: 120,
      },
      {
        batch: "D",
        consumption_date: "2026-02-20",
        dwell_days: 20,
        kg_days: 400,
      },
    ];

    const step2 = step({
      type: "raw_material_dwell",
      stats: { ...baseStats, median: 15 },
      detail_rows: detailRows(
        ["batch", "consumption_date", "dwell_days", "kg_days"],
        rows,
      ),
    });
    const brief = buildDwellOpportunityBrief(step2, step2, "12m", {
      waccRate: 0.1,
      storageCost: 0.336,
    });
    const fu = brief.firstUseDwell;
    expect(fu).not.toBeNull();
    // First draw per batch: A=5, B=8, C=11, D=6 (later tranches ignored).
    expect(fu?.nBatches).toBe(4);
    expect(fu?.medianDays).toBe(7);
    expect(fu?.meanDays).toBe(7.5);
    expect(fu?.overallMedianDays).toBe(15);
    expect(fu?.structuralDays).toBe(8);
    expect(fu?.firstUseSharePct).toBeCloseTo(46.67, 1);
    expect(fu?.note).toContain("depletion");
  });

  it("flags ordering-too-early when first-use dominates dwell", () => {
    const rows = [
      { batch: "A", consumption_date: "2026-01-10", dwell_days: 9 },
      { batch: "B", consumption_date: "2026-01-15", dwell_days: 10 },
      { batch: "C", consumption_date: "2026-01-20", dwell_days: 11 },
    ];

    const step2 = step({
      type: "raw_material_dwell",
      stats: { ...baseStats, median: 11 },
      detail_rows: detailRows(
        ["batch", "consumption_date", "dwell_days"],
        rows,
      ),
    });
    const brief = buildDwellOpportunityBrief(step2, step2, "12m", {
      waccRate: 0.1,
      storageCost: 0.336,
    });
    expect(brief.firstUseDwell?.firstUseSharePct).toBeGreaterThanOrEqual(60);
    expect(brief.firstUseDwell?.note).toContain("ahead of first need");
  });

  it("uses the true first draw but windows on the first-use date", () => {
    // Batch A is first consumed in 2024 (before the 12m window) -> excluded
    // entirely; its in-window 2026 tranche must NOT be counted as a 40d first use.
    const rows = [
      { batch: "A", consumption_date: "2024-01-10", dwell_days: 3 },
      { batch: "A", consumption_date: "2026-02-10", dwell_days: 40 },
      { batch: "B", consumption_date: "2026-01-15", dwell_days: 8 },
      { batch: "C", consumption_date: "2026-01-20", dwell_days: 12 },
      { batch: "D", consumption_date: "2026-01-25", dwell_days: 10 },
    ];

    const step2 = step({
      type: "raw_material_dwell",
      stats: { ...baseStats, median: 15 },
      detail_rows: detailRows(
        ["batch", "consumption_date", "dwell_days"],
        rows,
      ),
    });
    const brief = buildDwellOpportunityBrief(step2, step2, "12m", {
      waccRate: 0.1,
      storageCost: 0.336,
    });
    expect(brief.firstUseDwell?.nBatches).toBe(3);
    expect(brief.firstUseDwell?.p95Days).toBeLessThan(40);
  });

  it("returns null first-use for non-tranche dwell stages", () => {
    const step2 = step({
      type: "post_qa_ship",
      detail_rows: detailRows(
        ["batch", "consumption_date", "dwell_days"],
        [
          { batch: "A", consumption_date: "2026-01-10", dwell_days: 5 },
          { batch: "B", consumption_date: "2026-01-11", dwell_days: 6 },
          { batch: "C", consumption_date: "2026-01-12", dwell_days: 7 },
        ],
      ),
    });
    expect(
      buildDwellOpportunityBrief(step2, step2, "12m", {
        waccRate: 0.1,
        storageCost: 0.336,
      }).firstUseDwell,
    ).toBeNull();
  });

  it("splits dwell impact by consuming material", () => {
    const rows = [
      {
        batch: "A",
        consumption_date: "2026-01-10",
        dwell_days: 5,
        kg_days: 100,
        cons_matnr: "M1",
        cons_material_name: "Mat One",
      },
      {
        batch: "B",
        consumption_date: "2026-01-11",
        dwell_days: 6,
        kg_days: 300,
        cons_matnr: "M2",
        cons_material_name: "Mat Two",
      },
      {
        batch: "C",
        consumption_date: "2026-01-12",
        dwell_days: 7,
        kg_days: 100,
        cons_matnr: "M1",
        cons_material_name: "Mat One",
      },
    ];

    const step2 = step({
      type: "raw_material_dwell",
      detail_rows: detailRows(
        [
          "batch",
          "consumption_date",
          "dwell_days",
          "kg_days",
          "cons_matnr",
          "cons_material_name",
        ],

        rows,
      ),
    });
    const brief = buildDwellOpportunityBrief(step2, step2, "12m", {
      waccRate: 0.1,
      storageCost: 0.336,
    });
    expect(brief.perProductImpact).toHaveLength(2);
    const topImpact = brief.perProductImpact[0];
    expect(topImpact).toBeDefined();
    expect(topImpact!.label).toBe("Mat Two");
    expect(topImpact!.kgDays).toBe(300);
    expect(topImpact!.sharePct).toBeCloseTo(60, 6);
  });
});

describe("end-to-end leverage and planning calibration", () => {
  it("summarises end-to-end leverage from the node binding score", () => {
    const siteNode = {
      binding: {
        all: {
          binding_share: 0.4,
          mean_slack: null,
          next_bottleneck_days: 3,
          expected_marginal_per_day: 0.15,
          next_bottleneck_chains: [
            { label: "Production", step_id: "prod", share: 0.5 },
          ],
        },
      },
    } as unknown as SiteNode;
    const step2 = step({ type: "raw_material_dwell" });
    const brief = buildDwellOpportunityBrief(
      step2,
      step2,
      "12m",
      { waccRate: 0.1, storageCost: 0.336 },
      { siteNode },
    );
    expect(brief.e2eLeverage?.bindingSharePct).toBeCloseTo(40, 6);
    expect(brief.e2eLeverage?.expectedMarginalPerDay).toBeCloseTo(0.15, 6);
    expect(brief.e2eLeverage?.nextBottleneckDays).toBe(3);
    expect(brief.e2eLeverage?.nextBottleneckLabel).toBe("Production");
  });

  it("quantifies calibration buffer and residual late-event risk", () => {
    const step2 = step({
      type: "procurement",
      plan: 20,
      durations: [5, 10, 15, 25],
      observations: [
        {
          date: "2026-01-01",
          value: 5,
        },
        {
          date: "2026-02-01",
          value: 25,
        },
      ],
      stats: { ...baseStats, median: 10, p75: 15, p85: 18, p95: 22 },
    });
    const brief = buildPlanningOpportunityBrief(step2, step2, "12m");
    const p95 = brief.calibrationImpact.find((row) => row.label === "P95");
    expect(p95?.days).toBe(22);
    expect(p95?.bufferDaysVsPlan).toBeCloseTo(-2, 6);
    expect(p95?.pctExceeding).toBeCloseTo(25, 6);
    const median = brief.calibrationImpact.find(
      (row) => row.label === "Median",
    );
    expect(median?.bufferDaysVsPlan).toBeCloseTo(10, 6);
    expect(median?.pctExceeding).toBeCloseTo(50, 6);
  });
});

function obs(month: string, value: number): Observation {
  return { date: `${month}-15`, value };
}

describe("computeTrend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("compares current vs previous period medians (3m window)", () => {
    // now=2026-06 -> current >= 2026-04; previous = 2026-01..2026-03
    const observations: Observation[] = [
      obs("2025-12", 30),
      obs("2026-01", 50),
      obs("2026-03", 10),
      obs("2026-04", 20),
    ];

    const trend = computeTrend(observations, "3m");
    expect(trend.currentValue).toBe(20);
    expect(trend.previousValue).toBe(30);
    expect(trend.currentN).toBe(1);
    expect(trend.previousN).toBe(2);
    expect(trend.pctChange).toBeCloseTo(-33.333333, 6);
    expect(trend.direction).toBe("improving");
  });

  it("reports unknown direction when a period has no data", () => {
    const trend = computeTrend([obs("2026-04", 20)], "3m");
    expect(trend.previousN).toBe(0);
    expect(trend.pctChange).toBeNull();
    expect(trend.direction).toBe("unknown");
  });
});
