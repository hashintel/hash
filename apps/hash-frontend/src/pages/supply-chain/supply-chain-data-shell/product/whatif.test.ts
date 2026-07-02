import { describe, expect, it } from "vitest";

import {
  aggregateSimulation,
  formatNextBottleneck,
  leverSegmentFor,
  selectTopLevers,
} from "./whatif";

import type { BatchRow, GraphNode, StepType } from "../../shared/types";

describe("leverSegmentFor", () => {
  it("maps every step type to its pipeline segment", () => {
    const cases: Array<[StepType, string]> = [
      ["procurement", "procurement"],
      ["raw_material_dwell", "procurement"],
      ["intermediate_dwell", "production"],
      ["production", "production"],
      ["qa_hold", "qa_hold"],
      ["post_qa_ship", "transit"],
      ["transit", "transit"],
      ["destination_dwell", "transit"],
    ];

    for (const [type, segment] of cases) {
      expect(leverSegmentFor(type)).toBe(segment);
    }
  });
});

describe("formatNextBottleneck", () => {
  it("returns null with no chains", () => {
    expect(formatNextBottleneck(null)).toBeNull();
    expect(formatNextBottleneck([])).toBeNull();
  });

  it("renders a single confident chain (>=70% share), stripping the type prefix", () => {
    const out = formatNextBottleneck([
      { label: "Production: Foo", step_id: "s", share: 0.8 },
    ]);
    expect(out).toEqual({
      mode: "single",
      text: "Foo",
      entries: [{ label: "Foo", share: 0.8 }],
    });
  });

  it("renders the top two when no chain is confident", () => {
    const out = formatNextBottleneck([
      { label: "A: x", step_id: "a", share: 0.5 },
      { label: "B: y", step_id: "b", share: 0.3 },
    ]);
    expect(out?.mode).toBe("mixed");
    expect(out?.text).toBe("x 50% / y 30%");
  });
});

describe("aggregateSimulation (baseline, no levers)", () => {
  it("sums the four segments and reports zero savings", () => {
    const batch: BatchRow = {
      batch: "B1",
      route: null,
      n_traced_materials: null,
      earliest_po_date: null,
      earliest_gr_date: null,
      earliest_production_start: null,
      fg_receipt_date: null,
      qa_release_date: null,
      delivery_date: null,
      delivery_source: null,
      seg_proc_to_prodstart: 5,
      seg_prodstart_to_prodfinish: 10,
      seg_prodfinish_to_qa: 3,
      seg_qa_to_customer: 7,
      total_days: null,
      total_from_po: null,
      step_contributions: { upstream_chains: [], post_production: {} },
    };
    const result = aggregateSimulation([], [batch], {}, [], null, {
      waccRate: 0.1,
      storageCost: 0.336,
    });
    expect(result.baselineMean).toBe(25);
    expect(result.simulatedMean).toBe(25);
    expect(result.daysSaved).toBe(0);
    expect(result.batchesTotal).toBe(1);
    expect(result.simulatedStagesMean).toHaveLength(4);
    const prod = result.simulatedStagesMean.find(
      (step) => step.type === "production",
    );
    expect(prod?.mean).toBe(10);
  });
});

function baseBatch(overrides: Partial<BatchRow>): BatchRow {
  return {
    batch: "B1",
    route: null,
    n_traced_materials: null,
    earliest_po_date: null,
    earliest_gr_date: null,
    earliest_production_start: null,
    fg_receipt_date: null,
    qa_release_date: null,
    delivery_date: null,
    delivery_source: null,
    seg_proc_to_prodstart: 0,
    seg_prodstart_to_prodfinish: 0,
    seg_prodfinish_to_qa: 0,
    seg_qa_to_customer: 0,
    total_days: null,
    total_from_po: null,
    step_contributions: { upstream_chains: [], post_production: {} },
    ...overrides,
  };
}

function baseNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: "ship",
    label: "Post QA Ship",
    type: "post_qa_ship",
    material: null,
    plant: "P1",
    stats: {
      n: 3,
      mean: 5.3,
      median: 4,
      std: 3.4,
      min: 2,
      max: 10,
      p25: 3,
      p75: 7,
      p85: 8.2,
      p95: 9.4,
    },
    plan: null,
    plan_note: null,
    pct_exceeding_plan: null,
    cost: null,
    binding: {
      all: {
        binding_share: 1,
        mean_slack: null,
        next_bottleneck_days: null,
        expected_marginal_per_day: 1,
      },
    },
    observations: [],
    in_current_recipe: true,
    ...overrides,
  };
}

const shipLever = {
  stepId: "ship",
  label: "Post QA Ship",
  stepType: "post_qa_ship" as const,
  median: 4,
  p25: 3,
  p75: 7,
  p95: 9.4,
  max: 10,
  mean: 5.3,
  bindingShare: 1,
  meanSlack: null,
  nextBottleneckDays: null,
  nextBottleneckChains: null,
  expectedMarginalPerDay: 1,
  currency: "CHF",
  inCurrentRecipe: true,
};

describe("selectTopLevers", () => {
  it("sorts explicit non-current recipe steps after current/unknown steps", () => {
    const batch = baseBatch({
      step_contributions: {
        upstream_chains: [],
        post_production: { stale: 10, current: 8 },
      },
    });
    const stale = baseNode({
      id: "stale",
      label: "Old Recipe Step",
      binding: {
        all: {
          binding_share: 1,
          mean_slack: null,
          next_bottleneck_days: null,
          expected_marginal_per_day: 1,
        },
      },
      in_current_recipe: false,
    });
    const current = baseNode({
      id: "current",
      label: "Current Step",
      binding: {
        all: {
          binding_share: 0.5,
          mean_slack: null,
          next_bottleneck_days: null,
          expected_marginal_per_day: 1,
        },
      },
      in_current_recipe: true,
    });

    const levers = selectTopLevers([stale, current], [batch], null, {
      maxN: 2,
    });

    expect(levers.map((line) => line.stepId)).toEqual(["current", "stale"]);
    const staleLever = levers[1];
    expect(staleLever).toBeDefined();
    expect(staleLever!.inCurrentRecipe).toBe(false);
  });
});

describe("aggregateSimulation (cap levers)", () => {
  it("treats a max cap as uncapped", () => {
    const batch = baseBatch({
      seg_qa_to_customer: 10,
      step_contributions: {
        upstream_chains: [],
        post_production: { ship: 10 },
      },
    });

    const result = aggregateSimulation(
      [],
      [batch],
      { ship: 10 },
      [shipLever],
      null,
      { waccRate: 0.1, storageCost: 0.336 },
    );

    expect(result.baselineMean).toBe(10);
    expect(result.simulatedMean).toBe(10);
    expect(result.daysSaved).toBe(0);
    expect(result.batchesAffected).toBe(0);
  });

  it("caps serial post-production durations above the selected threshold", () => {
    const batch = baseBatch({
      seg_qa_to_customer: 10,
      step_contributions: {
        upstream_chains: [],
        post_production: { ship: 10 },
      },
    });

    const result = aggregateSimulation(
      [],
      [batch],
      { ship: 6 },
      [shipLever],
      null,
      { waccRate: 0.1, storageCost: 0.336 },
    );

    expect(result.baselineMean).toBe(10);
    expect(result.simulatedMean).toBe(6);
    expect(result.daysSaved).toBe(4);
    expect(
      result.simulatedStagesMean.find((step) => step.type === "transit")?.mean,
    ).toBe(6);
  });

  it("supports excluding a serial step with a 0d cap", () => {
    const batch = baseBatch({
      seg_qa_to_customer: 10,
      step_contributions: {
        upstream_chains: [],
        post_production: { ship: 10 },
      },
    });

    const result = aggregateSimulation(
      [],
      [batch],
      { ship: 0 },
      [shipLever],
      null,
      { waccRate: 0.1, storageCost: 0.336 },
    );

    expect(result.baselineMean).toBe(10);
    expect(result.simulatedMean).toBe(0);
    expect(result.daysSaved).toBe(10);
    expect(
      result.simulatedStagesMean.find((step) => step.type === "transit")?.mean,
    ).toBe(0);
  });

  it("recomputes upstream longest-chain totals after capping", () => {
    const batch = baseBatch({
      seg_prodstart_to_prodfinish: 10,
      step_contributions: {
        upstream_chains: [
          {
            chain_id: "binding",
            total_days: 10,
            production_days: 10,
            earliest_event_date: null,
            steps: [{ step_id: "bind", duration: 10, type: "production" }],
          },
          {
            chain_id: "next",
            total_days: 8,
            production_days: 8,
            earliest_event_date: null,
            steps: [{ step_id: "next", duration: 8, type: "production" }],
          },
        ],

        post_production: {},
      },
    });
    const bindLever = {
      ...shipLever,
      stepId: "bind",
      label: "Binding Production",
      stepType: "production" as const,
      max: 10,
      median: 10,
      p25: 6,
      p75: 10,
      p95: 10,
    };

    const result = aggregateSimulation(
      [],
      [batch],
      { bind: 6 },
      [bindLever],
      null,
      { waccRate: 0.1, storageCost: 0.336 },
    );

    expect(result.baselineMean).toBe(10);
    expect(result.simulatedMean).toBe(8);
    expect(result.daysSaved).toBe(2);
    expect(
      result.simulatedStagesMean.find((step) => step.type === "production")
        ?.mean,
    ).toBe(8);
  });

  it("uses observed tail mass above the cap for cost saving", () => {
    const node = baseNode({
      cost: { unit_price: 0, currency: "CHF" },
      monthly: [
        {
          month: "2026-01",
          mean: 5.3,
          median: 4,
          n: 3,
          total_kg_days: 160,
        },
      ],

      observations: [
        { date: "2026-01-01", value: 2 },
        { date: "2026-01-02", value: 4 },
        { date: "2026-01-03", value: 10 },
      ],
    });

    const result = aggregateSimulation(
      [node],
      [],
      { ship: 4 },
      [shipLever],
      null,
      { waccRate: 0, storageCost: 1000 },
    );

    expect(result.costSavingAnnualised).toBe(60);
  });
});
