import { describe, expect, it } from "vitest";

import { computeMonthlyCost, costRatePerKgDay } from "./cost";
import { computeNodePeriodCost } from "./site-aggregation";

import type { CostData, MonthlyBucket, SiteNode, StepStats } from "./types";

// Characterization tests pinning the CURRENT carrying-cost period-summation
// behaviour before the ~10 duplicated reduce copies are collapsed into a single
// lib/cost.computePeriodCost helper (Batch 3). The new helper MUST reproduce
// this golden total exactly.

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

function cost(unitPrice: number | null): CostData {
  return { unit_price: unitPrice, currency: "EUR" };
}

function kgDayMonth(month: string, totalKgDays: number): MonthlyBucket {
  return { month, mean: null, median: null, n: 1, total_kg_days: totalKgDays };
}

function siteNode(overrides: Partial<SiteNode>): SiteNode {
  return {
    id: "n",
    label: "Node",
    type: "intermediate_dwell",
    material: null,
    plant: "PL-A",
    stats: zeroStats,
    plan: null,
    plan_note: null,
    pct_exceeding_plan: null,
    cost: null,
    products: [{ id: "p1", name: "P1" }],
    ...overrides,
  };
}

describe("carrying-cost period summation characterization", () => {
  const wacc = 0.1;
  const storage = 0.336;
  const unitPrice = 100;
  const months = [
    kgDayMonth("2025-11", 1000),
    kgDayMonth("2025-12", 500),
    kgDayMonth("2026-01", 2500),
  ];

  it("sums Sigma(total_kg_days * rate) across monthly buckets", () => {
    const rate = costRatePerKgDay(unitPrice, wacc, storage);
    const expected = (1000 + 500 + 2500) * rate;
    const node = siteNode({ cost: cost(unitPrice), monthly: months });
    expect(computeNodePeriodCost(node, wacc, storage)).toBeCloseTo(expected, 6);
  });

  it("equals the per-bucket computeMonthlyCost sum (invariant the dedup must preserve)", () => {
    const node = siteNode({ cost: cost(unitPrice), monthly: months });
    const manual = months.reduce(
      (sum, month) =>
        sum +
        (computeMonthlyCost(
          month.total_kg_days ?? null,
          unitPrice,
          wacc,
          storage,
        ) ?? 0),
      0,
    );
    expect(computeNodePeriodCost(node, wacc, storage)).toBeCloseTo(manual, 6);
  });

  it("is zero when the node has no unit price", () => {
    const node = siteNode({ cost: cost(null), monthly: months });
    expect(computeNodePeriodCost(node, wacc, storage)).toBe(0);
  });
});
