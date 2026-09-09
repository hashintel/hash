import { describe, expect, it } from "vitest";

import {
  sirConstrainedOptimizationInput,
  sirOptimizationInput,
} from "../../sir-optimization-input.fixtures";
import {
  constraintNameIn,
  parameterConstraintOutcome,
  stateConstraintMetrics,
  stateConstraintResults,
} from "./trial-constraints";

describe("parameterConstraintOutcome", () => {
  it("is null for a study without parameter constraints", () => {
    expect(
      parameterConstraintOutcome(sirOptimizationInput, {
        population: 1_000,
        infected_ratio: 0.05,
      }),
    ).toBeNull();
  });

  it("reports each margin and names the first constraint a draw breaks", () => {
    const feasible = parameterConstraintOutcome(
      sirConstrainedOptimizationInput,
      { population: 1_000, infected_ratio: 0.05 },
    );
    expect(feasible).toMatchObject({
      results: [{ constraintId: "ratio-cap" }],
      infeasible: null,
    });
    expect(feasible?.results[0]?.margin).toBeCloseTo(0.05);

    const infeasible = parameterConstraintOutcome(
      sirConstrainedOptimizationInput,
      { population: 1_000, infected_ratio: 0.15 },
    );
    expect(infeasible).toMatchObject({
      results: [{ constraintId: "ratio-cap" }],
      infeasible: "ratio-cap",
    });
    expect(infeasible?.results[0]?.margin).toBeCloseTo(-0.05);
  });
});

describe("constraintNameIn", () => {
  it("prefers the authored name and falls back to the id", () => {
    expect(constraintNameIn(sirConstrainedOptimizationInput, "ratio-cap")).toBe(
      "Ratio under a tenth",
    );
    expect(constraintNameIn(sirConstrainedOptimizationInput, "other")).toBe(
      "other",
    );
  });
});

describe("stateConstraintMetrics", () => {
  it("is empty without state constraints and compiles one min-aggregated indicator per state constraint", () => {
    expect(stateConstraintMetrics(sirOptimizationInput)).toEqual([]);
    const metrics = stateConstraintMetrics(sirConstrainedOptimizationInput);
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      id: "infected-cap",
      label: "Infected under 900",
      aggregateTime: "min",
    });
    expect(metrics[0]?.artifact.placeNames).toEqual(["Infected"]);
    expect(metrics[0]?.artifact.source).toContain("? 1 : 0");
  });
});

describe("stateConstraintResults", () => {
  it("counts the runs each constraint held on, a missing value counting as failed", () => {
    const runResults = new Map<number, Readonly<Record<string, number>>>([
      [0, { "infected-cap": 1, objective: 0.2 }],
      [1, { "infected-cap": 0, objective: 0.4 }],
      [2, { objective: 0.3 }],
      [3, { "infected-cap": 1, objective: 0.1 }],
    ]);
    expect(
      stateConstraintResults(sirConstrainedOptimizationInput, runResults),
    ).toEqual([{ constraintId: "infected-cap", runsPassed: 2, runsTotal: 4 }]);
  });

  it("reports nothing when the batch has no run axis", () => {
    expect(
      stateConstraintResults(sirConstrainedOptimizationInput, new Map()),
    ).toEqual([]);
  });
});
