import { describe, expect, it } from "vitest";

import {
  STATUS_OPTIONS,
  statusCommentRequired,
  statusKey,
} from "../../shared/status";
import { buildSiteOpportunities } from "./opportunities";

import type { StatusOption } from "../../shared/status";
import type { StepStats } from "../../shared/types";
import type { DwellRow, PlanningRow } from "./shared/row-types";
import type { OpportunityStatusCategoryDataType } from "@local/hash-isomorphic-utils/system-types/opportunitystatusupdate";

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

  it("treats ambiguous, wrong-basis, and fallback procurement parameters like exact matches", () => {
    const opportunities = build({
      planningRows: [
        planning({
          id: "mat-a-buy",
          label: "Material — Supplier A — Buy",
          type: "procurement",
          material: "MAT",
          supplier_id: "A",
          receipt_basis: "ordinary",
          plan_match_status: "matched",
          plan: 10,
          stats: stats({ n: 20, median: 12, p95: 16 }),
        }),
        planning({
          id: "mat-b-consignment",
          label: "Material — Supplier B — Consignment",
          type: "procurement",
          material: "MAT",
          supplier_id: "B",
          receipt_basis: "consignment",
          plan_match_status: "ambiguous",
          plan: 10,
          stats: stats({ n: 20, median: 20, p95: 30 }),
        }),
        planning({
          id: "mat-c-wrong-basis",
          type: "procurement",
          plan_match_status: "matched_wrong_basis",
          plan: 10,
          stats: stats({ n: 20, median: 15, p95: 20 }),
        }),
        planning({
          id: "mat-d-fallback",
          type: "procurement",
          plan_match_status: "missing_profile",
          plan: 10,
          stats: stats({ n: 20, median: 14, p95: 18 }),
        }),
      ],
    });

    expect(opportunities.map(({ stepId }) => stepId).sort()).toEqual([
      "mat-a-buy",
      "mat-b-consignment",
      "mat-c-wrong-basis",
      "mat-d-fallback",
    ]);
    expect(
      opportunities.every(
        ({ confidenceLabel }) => confidenceLabel === "Good sample",
      ),
    ).toBe(true);
    expect(
      opportunities.find(({ stepId }) => stepId === "mat-a-buy")?.title,
    ).toBe("Material / Supplier A / Buy");
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

  it("keeps STATUS_OPTIONS in sync with the generated data-type enum", () => {
    // Compile-time guarantee that the UI option union and the generated
    // ontology enum are identical in both directions.
    type AssertEqual<A, B> = [A] extends [B]
      ? [B] extends [A]
        ? true
        : never
      : never;
    const _optionsMatchDataType: AssertEqual<
      StatusOption,
      OpportunityStatusCategoryDataType
    > = true;
    expect(_optionsMatchDataType).toBe(true);

    expect([...STATUS_OPTIONS]).toEqual([
      "Investigation started",
      "Investigation update",
      "Investigation concluded",
      "Rejected (infeasible)",
      "Rejected (data issue)",
    ]);
  });
});

describe("statusKey", () => {
  it("is stable for the same site + node regardless of unrelated stats", () => {
    const node = dwell({ id: "step-1", stats: stats({ n: 5, median: 3 }) });
    const sameNodeDifferentStats = dwell({
      id: "step-1",
      stats: stats({ n: 999, median: 100, p95: 200 }),
      periodCost: 123456,
    });

    expect(statusKey("site-a", node)).toBe(
      statusKey("site-a", sameNodeDifferentStats),
    );
  });

  it("does not embed the time range (unlike the opportunity id)", () => {
    const node = dwell({ id: "step-1" });
    const key = statusKey("site-a", node);

    expect(key).toBe("site-a::dwell::step-1");
    for (const range of ["3m", "6m", "12m", "24m"]) {
      expect(key).not.toContain(range);
    }
  });

  it("keys location-agnostic steps on node.id alone (shared across products)", () => {
    // Production is keyed on the *produced thing*, which lives in `node.id`
    // (e.g. `prod_duration_green_blend`). The `products` array lists the
    // finished goods that consume this production, and must not be part of the
    // key -- it drifts as the product mix changes.
    const greenBlendProduction = planning({
      id: "prod_duration_green_blend",
      type: "production",
      products: [{ id: "p1", name: "Product 1" }],
    });

    // Same produced thing consumed by a different finished good -> same key.
    expect(
      statusKey("site-a", {
        ...greenBlendProduction,
        products: [{ id: "p2", name: "Product 2" }],
      }),
    ).toBe(statusKey("site-a", greenBlendProduction));
    expect(statusKey("site-a", greenBlendProduction)).toBe(
      "site-a::planning::prod_duration_green_blend",
    );

    // Different produced thing -> different key, without embedding any product.
    expect(
      statusKey(
        "site-a",
        planning({
          id: "prod_duration_harbor_dark_roast",
          type: "production",
          products: [{ id: "p1", name: "Product 1" }],
        }),
      ),
    ).not.toBe(statusKey("site-a", greenBlendProduction));

    // Intermediate dwell keys on the material dwelling (in `node.id`); the
    // consuming finished good is deliberately shared, not part of the key.
    const imDwell = dwell({
      id: "intermed_dwell_green_blend",
      type: "intermediate_dwell",
      products: [{ id: "p1", name: "Product 1" }],
    });
    expect(
      statusKey("site-a", {
        ...imDwell,
        products: [{ id: "p2", name: "Product 2" }],
      }),
    ).toBe(statusKey("site-a", imDwell));
    expect(statusKey("site-a", imDwell)).toBe(
      "site-a::dwell::intermed_dwell_green_blend",
    );
  });

  it("disambiguates location-scoped steps (transit, destination dwell) by product", () => {
    // Transit ids are lane-scoped (`transit_pla_hub1`) with the finished good
    // only in `products`, so the product must be appended. Transit is a
    // planning-category step.
    const transit = planning({
      id: "transit_pla_hub1",
      type: "transit",
      products: [{ id: "p1", name: "Product 1" }],
    });
    expect(statusKey("site-a", transit)).toBe(
      "site-a::planning::transit_pla_hub1-p1",
    );
    expect(
      statusKey("site-a", {
        ...transit,
        products: [{ id: "p2", name: "Product 2" }],
      }),
    ).toBe("site-a::planning::transit_pla_hub1-p2");

    // Destination dwell ids are hub-scoped (`dest_dwell_hub1`); the thing
    // dwelling is the finished good, so the product must be appended. It is a
    // dwell-category step.
    const destDwell = dwell({
      id: "dest_dwell_hub1",
      type: "destination_dwell",
      products: [{ id: "p1", name: "Product 1" }],
    });
    expect(statusKey("site-a", destDwell)).toBe(
      "site-a::dwell::dest_dwell_hub1-p1",
    );
    expect(
      statusKey("site-a", {
        ...destDwell,
        products: [{ id: "p2", name: "Product 2" }],
      }),
    ).toBe("site-a::dwell::dest_dwell_hub1-p2");
  });

  it("disambiguates post-QA dwell status by product", () => {
    const postQaDwell = dwell({
      id: "post-qa",
      type: "post_qa_ship",
      products: [{ id: "p1", name: "Product 1" }],
    });

    expect(statusKey("site-a", postQaDwell)).toBe("site-a::dwell::post-qa-p1");
    expect(
      statusKey("site-a", {
        ...postQaDwell,
        products: [{ id: "p2", name: "Product 2" }],
      }),
    ).toBe("site-a::dwell::post-qa-p2");
  });

  it("disambiguates production -> QA release (qa_hold) status by product", () => {
    const qaHold = planning({
      id: "prod-to-qa",
      type: "qa_hold",
      products: [{ id: "p1", name: "Product 1" }],
    });

    // qa_hold is a planning-category step, so it lives under `::planning::`, but
    // it is a single-finished-good step so the product is part of the key.
    expect(statusKey("site-a", qaHold)).toBe("site-a::planning::prod-to-qa-p1");
    expect(
      statusKey("site-a", {
        ...qaHold,
        products: [{ id: "p2", name: "Product 2" }],
      }),
    ).toBe("site-a::planning::prod-to-qa-p2");
  });

  it("distinguishes dwell and planning nodes", () => {
    expect(statusKey("site-a", dwell({ id: "x" }))).toContain("::dwell::");
    expect(statusKey("site-a", planning({ id: "x" }))).toContain(
      "::planning::",
    );
  });
});
