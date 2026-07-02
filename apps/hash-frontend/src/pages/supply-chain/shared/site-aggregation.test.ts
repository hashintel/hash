import { describe, expect, it } from "vitest";

import {
  computeNodePeriodCost,
  countBadPlanningParams,
  deduplicateNodes,
  topDwellCosts,
  topPlanningMismatches,
} from "./site-aggregation";

import type {
  CostData,
  GraphData,
  GraphNode,
  MonthlyBucket,
  Product,
  SiteData,
  SiteNode,
  StepStats,
} from "./types";

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

function stats(count: number, median: number): StepStats {
  return { ...zeroStats, n: count, median, mean: median };
}

function cost(unitPrice: number | null): CostData {
  return { unit_price: unitPrice, currency: "EUR" };
}

function kgDayMonth(month: string, totalKgDays: number): MonthlyBucket {
  return { month, mean: null, median: null, n: 1, total_kg_days: totalKgDays };
}

function node(overrides: Partial<GraphNode>): GraphNode {
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
    ...overrides,
  };
}

function siteNode(overrides: Partial<SiteNode>): SiteNode {
  return { ...node({}), products: [{ id: "p1", name: "P1" }], ...overrides };
}

describe("deduplicateNodes", () => {
  it("merges shared raw-material nodes across products by material, plant, type, and series", () => {
    const shared = node({
      id: "rm",
      type: "raw_material_dwell",
      material: "MAT-1",
      plant: "PL-A",
    });
    const productA: Product = { id: "pa", name: "Product A", material: "FG-A" };
    const productB: Product = { id: "pb", name: "Product B", material: "FG-B" };
    const graphA: GraphData = {
      product_id: "pa",
      product_name: "Product A",
      nodes: [
        shared,
        node({ id: "prodA", type: "production", material: "FG-A" }),
      ],

      edges: [],
      pipeline_summary: {},
    };
    const graphB: GraphData = {
      product_id: "pb",
      product_name: "Product B",
      nodes: [
        shared,
        node({ id: "prodB", type: "production", material: "FG-B" }),
      ],

      edges: [],
      pipeline_summary: {},
    };
    const site: SiteData = {
      graphs: [
        { product: productA, graph: graphA },
        { product: productB, graph: graphB },
      ],
    };

    const result = deduplicateNodes(site);
    const rm = result.find((row) => row.id === "rm");
    expect(rm).toBeDefined();
    expect(rm?.products.map((product) => product.id).sort()).toEqual([
      "pa",
      "pb",
    ]);
    // The two product-specific production nodes stay distinct.
    expect(result.filter((row) => row.type === "production")).toHaveLength(2);
  });

  it("merges duplicated intermediate dwell rows used by multiple products", () => {
    const monthly = [kgDayMonth("2026-01", 10000)];
    const sharedA = node({
      id: "im-a",
      label: "Intermediate Dwell: MN-L Wet Cake",
      type: "intermediate_dwell",
      material: "MN-L Wet Cake",
      plant: "PL-A",
      stats: stats(10, 23.5),
      cost: cost(100),
      monthly,
    });
    const sharedB = { ...sharedA, id: "im-b" };
    const productA: Product = { id: "pa", name: "Product A", material: "FG-A" };
    const productB: Product = { id: "pb", name: "Product B", material: "FG-B" };
    const site: SiteData = {
      graphs: [
        {
          product: productA,
          graph: {
            product_id: "pa",
            product_name: "Product A",
            nodes: [sharedA],
            edges: [],
            pipeline_summary: {},
          },
        },
        {
          product: productB,
          graph: {
            product_id: "pb",
            product_name: "Product B",
            nodes: [sharedB],
            edges: [],
            pipeline_summary: {},
          },
        },
      ],
    };

    const result = deduplicateNodes(site);

    expect(result).toHaveLength(1);
    const deduplicated = result[0];
    expect(deduplicated).toBeDefined();
    expect(deduplicated!.products.map((product) => product.id).sort()).toEqual([
      "pa",
      "pb",
    ]);
    expect(computeNodePeriodCost(deduplicated!, 0.1, 0.336)).toBeCloseTo(
      computeNodePeriodCost({ ...sharedA, products: [productA] }, 0.1, 0.336),
      6,
    );
  });

  it("keeps genuinely different dwell series separate even when material matches", () => {
    const base = node({
      id: "im-a",
      label: "Intermediate Dwell: Shared Material",
      type: "intermediate_dwell",
      material: "Shared Material",
      plant: "PL-A",
      stats: stats(10, 20),
      cost: cost(100),
      monthly: [kgDayMonth("2026-01", 10000)],
    });
    const different = {
      ...base,
      id: "im-b",
      stats: stats(8, 12),
      monthly: [kgDayMonth("2026-01", 3000)],
    };
    const productA: Product = { id: "pa", name: "Product A", material: "FG-A" };
    const productB: Product = { id: "pb", name: "Product B", material: "FG-B" };
    const site: SiteData = {
      graphs: [
        {
          product: productA,
          graph: {
            product_id: "pa",
            product_name: "Product A",
            nodes: [base],
            edges: [],
            pipeline_summary: {},
          },
        },
        {
          product: productB,
          graph: {
            product_id: "pb",
            product_name: "Product B",
            nodes: [different],
            edges: [],
            pipeline_summary: {},
          },
        },
      ],
    };

    expect(deduplicateNodes(site)).toHaveLength(2);
  });

  it("aggregates product-scoped raw-material dwell series at site level", () => {
    const productA: Product = { id: "pa", name: "Product A", material: "FG-A" };
    const productB: Product = { id: "pb", name: "Product B", material: "FG-B" };
    const rawA = node({
      id: "raw-a",
      type: "raw_material_dwell",
      material: "MAT-1",
      plant: "PL-A",
      stats: stats(1, 10),
      cost: cost(100),
      observations: [{ date: "2026-01-10", value: 10 }],
      monthly: [kgDayMonth("2026-01", 1000)],
    });
    const rawB = node({
      id: "raw-b",
      type: "raw_material_dwell",
      material: "MAT-1",
      plant: "PL-A",
      stats: stats(1, 30),
      cost: cost(100),
      observations: [{ date: "2026-01-20", value: 30 }],
      monthly: [kgDayMonth("2026-01", 3000)],
    });
    const site: SiteData = {
      graphs: [
        {
          product: productA,
          graph: {
            product_id: "pa",
            product_name: "Product A",
            nodes: [rawA],
            edges: [],
            pipeline_summary: {},
          },
        },
        {
          product: productB,
          graph: {
            product_id: "pb",
            product_name: "Product B",
            nodes: [rawB],
            edges: [],
            pipeline_summary: {},
          },
        },
      ],
    };

    const result = deduplicateNodes(site);

    expect(result).toHaveLength(1);
    expect(result[0]?.stats).toMatchObject({ n: 2, mean: 20, median: 20 });
    expect(result[0]?.monthly).toEqual([
      { month: "2026-01", mean: 20, median: 20, n: 2, total_kg_days: 4000 },
    ]);
    expect(result[0]?.products.map((product) => product.id).sort()).toEqual([
      "pa",
      "pb",
    ]);
  });
});

describe("computeNodePeriodCost", () => {
  it("sums monthly kg-day cost using unit price + params", () => {
    const count = siteNode({
      cost: cost(100),
      monthly: [kgDayMonth("2026-01", 1000), kgDayMonth("2026-02", 500)],
    });
    const wacc = 0.1;
    const storage = 0.336;
    const rate = 100 * (wacc / 365) + storage / 1000;
    expect(computeNodePeriodCost(count, wacc, storage)).toBeCloseTo(
      1500 * rate,
      6,
    );
  });

  it("is zero with no monthly data", () => {
    expect(
      computeNodePeriodCost(siteNode({ cost: cost(100) }), 0.1, 0.336),
    ).toBe(0);
  });
});

describe("site rollups", () => {
  const dwellBig = siteNode({
    id: "d1",
    type: "intermediate_dwell",
    stats: stats(10, 30),
    cost: cost(100),
    monthly: [kgDayMonth("2026-01", 10000)],
  });
  const dwellSmall = siteNode({
    id: "d2",
    type: "post_qa_ship",
    stats: stats(10, 5),
    cost: cost(10),
    monthly: [kgDayMonth("2026-01", 100)],
  });

  it("ranks dwell nodes by period cost", () => {
    const top = topDwellCosts([dwellBig, dwellSmall], 0.1, 0.336, 5);
    expect(top.map((threshold) => threshold.id)).toEqual(["d1", "d2"]);
    const first = top[0];
    const second = top[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first!.periodCost).toBeGreaterThan(second!.periodCost);
  });

  it("ranks planning mismatches by deviation vs plan", () => {
    const over = siteNode({ id: "o", stats: stats(5, 30), plan: 10 }); // +200%
    const under = siteNode({ id: "u", stats: stats(5, 12), plan: 10 }); // +20%
    const top = topPlanningMismatches([under, over], 5);
    const topMismatch = top[0];
    expect(topMismatch).toBeDefined();
    expect(topMismatch!.id).toBe("o");
    expect(topMismatch!.deviationPct).toBeCloseTo(200, 6);
  });

  it("counts nodes whose median exceeds plan by >20%", () => {
    const bad = siteNode({ id: "b", stats: stats(5, 13), plan: 10 }); // 1.3x
    const ok = siteNode({ id: "k", stats: stats(5, 11), plan: 10 }); // 1.1x
    expect(countBadPlanningParams([bad, ok])).toBe(1);
  });
});
