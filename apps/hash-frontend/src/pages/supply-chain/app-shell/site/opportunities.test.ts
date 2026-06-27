import { describe, expect, it } from "vitest";

import { buildSiteOpportunities, statusCommentRequired } from "./opportunities";

import type { StepStats } from "../../shared/types";
import type { DwellRow, PlanningRow } from "./shared/row-types";

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

function stats(overrides: Partial<StepStats>): StepStats {
  return { ...zeroStats, ...overrides };
}

function dwell(overrides: Partial<DwellRow>): DwellRow {
  return {
    id: "dwell",
    label: "Dwell step",
    type: "intermediate_dwell",
    material: null,
    plant: "PL-A",
    stats: stats({ n: 20, median: 10, p95: 18 }),
    plan: null,
    plan_note: null,
    pct_exceeding_plan: null,
    cost: { unit_price: 100, currency: "EUR" },
    products: [{ id: "p1", name: "Product 1" }],
    periodCost: 1000,
    costTrendPct: null,
    previousPeriodCost: null,
    previousCostN: 0,
    trendPct: null,
    previousValue: null,
    previousTrendN: 0,
    ...overrides,
  };
}

function planning(overrides: Partial<PlanningRow>): PlanningRow {
  return {
    id: "plan",
    label: "Planning step",
    type: "production",
    material: null,
    plant: "PL-A",
    stats: stats({ n: 20, median: 12, p95: 24 }),
    plan: 10,
    plan_note: null,
    pct_exceeding_plan: 30,
    cost: null,
    products: [{ id: "p1", name: "Product 1" }],
    deviationPct: 20,
    trendPct: null,
    previousValue: null,
    previousTrendN: 0,
    ...overrides,
  };
}

describe("buildSiteOpportunities", () => {
  const build = (input: {
    dwellRows?: DwellRow[];
    planningRows?: PlanningRow[];
  }) =>
    buildSiteOpportunities({
      siteId: "site-a",
      dwellRows: input.dwellRows ?? [],
      planningRows: input.planningRows ?? [],
      timeRange: "12m",
      currency: "EUR",
      briefHref: (type, node, kind) =>
        `/brief/${type}/${node.id}${kind ? `?op=${kind}` : ""}`,
    });

  it("creates dwell opportunities only above the dwell-days and 5k cost thresholds", () => {
    const opportunities = build({
      dwellRows: [
        dwell({
          id: "high",
          stats: stats({ n: 20, median: 8, p95: 20 }),
          periodCost: 6000,
        }),
        dwell({
          id: "short",
          stats: stats({ n: 20, median: 6, p95: 7 }),
          periodCost: 9000,
        }),
        dwell({
          id: "below-min",
          stats: stats({ n: 20, median: 12, p95: 20 }),
          periodCost: 4000,
        }),
        dwell({
          id: "free",
          stats: stats({ n: 20, median: 12, p95: 20 }),
          periodCost: 0,
        }),
      ],
    });

    expect(opportunities.map((opportunity) => opportunity.id)).toEqual([
      "site-a::dwell_cost::12m::high-p1",
    ]);
    const opportunity = opportunities[0];
    expect(opportunity).toBeDefined();
    expect(opportunity!.briefHref).toBe("/brief/dwell/high?op=dwell_cost");
    expect(opportunity!.confidenceLabel).toBe("Good sample");
  });

  it("classifies planning over and under opportunities using P95 vs plan", () => {
    const opportunities = build({
      planningRows: [
        planning({
          id: "over",
          plan: 10,
          stats: stats({ n: 20, median: 8, p95: 11.5 }),
        }),
        planning({
          id: "under",
          plan: 10,
          stats: stats({ n: 20, median: 6, p95: 8.5 }),
        }),
        planning({
          id: "ok",
          plan: 10,
          stats: stats({ n: 20, median: 9, p95: 10.5 }),
        }),
      ],
    });

    expect(opportunities.map((opportunity) => opportunity.kind).sort()).toEqual(
      ["planning_over", "planning_under"],
    );
    expect(
      opportunities.find((opportunity) => opportunity.kind === "planning_over")
        ?.briefHref,
    ).toBe("/brief/planning/over?op=planning_over");
    expect(
      opportunities.find((opportunity) => opportunity.kind === "planning_over")
        ?.currentSampleN,
    ).toBe(20);
  });

  it("uses current sample size for planning confidence", () => {
    const opportunities = build({
      planningRows: [
        planning({
          id: "plan-prev-low",
          previousTrendN: 1,
          plan: 10,
          stats: stats({ n: 20, median: 8, p95: 13 }),
        }),
      ],
    });

    expect(
      opportunities.find((opportunity) => opportunity.kind === "planning_over")
        ?.confidenceLabel,
    ).toBe("Good sample");
  });
});

describe("status helpers", () => {
  it("requires comments except for investigation started", () => {
    expect(statusCommentRequired("Investigation started")).toBe(false);
    expect(statusCommentRequired("Investigation update")).toBe(true);
    expect(statusCommentRequired("Investigation concluded")).toBe(true);
    expect(statusCommentRequired("Rejected (infeasible)")).toBe(true);
    expect(statusCommentRequired("Rejected (data issue)")).toBe(true);
  });
});
