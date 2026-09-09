import { describe, expect, it } from "vitest";

import {
  buildObjectiveHistory,
  toObjectiveHistoryData,
  trialFeasibility,
} from "./objective-history-data";

import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

const trial = (
  index: number,
  objective: number | null,
  state: PetrinautOptimizationTrialEvent["state"] = "complete",
): PetrinautOptimizationTrialEvent => ({
  type: "trial",
  trial: index,
  parameters: {},
  objective,
  state,
  best: null,
  seq: index + 2,
});

describe("buildObjectiveHistory", () => {
  it("keeps the best so far monotone in the maximize direction", () => {
    const points = buildObjectiveHistory(
      [trial(0, 3), trial(1, 5), trial(2, 4), trial(3, 9)],
      "maximize",
    );
    expect(points.map((point) => point.bestSoFar)).toEqual([3, 5, 5, 9]);
    expect(points.map((point) => point.step)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the best so far monotone in the minimize direction", () => {
    const points = buildObjectiveHistory(
      [trial(0, 3), trial(1, 5), trial(2, 1), trial(3, 2)],
      "minimize",
    );
    expect(points.map((point) => point.bestSoFar)).toEqual([3, 3, 1, 1]);
  });

  it("gives a pruned step no objective and carries the previous best through it", () => {
    const points = buildObjectiveHistory(
      [trial(0, 3), trial(1, null, "pruned"), trial(2, 7, "failed")],
      "maximize",
    );
    expect(points[1]).toEqual({
      step: 2,
      objective: null,
      bestSoFar: 3,
      feasibility: "unknown",
    });
    // A failed step's objective, if any, does not count either.
    expect(points[2]?.objective).toBeNull();
    expect(points[2]?.bestSoFar).toBe(3);
  });

  it("has no best before the first completed step", () => {
    const points = buildObjectiveHistory(
      [trial(0, null, "pruned"), trial(1, 2)],
      "maximize",
    );
    expect(points[0]?.bestSoFar).toBeNull();
    expect(points[1]?.bestSoFar).toBe(2);
  });

  it("reads parallel steps in step order, whatever order they landed in", () => {
    const points = buildObjectiveHistory(
      [trial(2, 4), trial(0, 3), trial(1, 5)],
      "maximize",
    );
    expect(points.map((point) => point.step)).toEqual([1, 2, 3]);
    expect(points.map((point) => point.bestSoFar)).toEqual([3, 5, 5]);
  });
});

describe("buildObjectiveHistory with feasibility", () => {
  it("never lets an infeasible step become the best so far", () => {
    const points = buildObjectiveHistory(
      [trial(0, 3), trial(1, 9), trial(2, 5)],
      "maximize",
      (candidate) => (candidate.trial === 1 ? "infeasible" : "feasible"),
    );
    expect(points.map((point) => point.bestSoFar)).toEqual([3, 3, 5]);
    expect(points.map((point) => point.feasibility)).toEqual([
      "feasible",
      "infeasible",
      "feasible",
    ]);
    // The infeasible step keeps its own objective for the chart to draw.
    expect(points[1]?.objective).toBe(9);
  });
});

describe("toObjectiveHistoryData", () => {
  it("aligns steps, objectives and the best so far, with infeasible steps in their own series", () => {
    const points = buildObjectiveHistory(
      [trial(0, 3), trial(1, null, "pruned"), trial(2, 5)],
      "maximize",
      (candidate) => (candidate.trial === 2 ? "infeasible" : "unknown"),
    );
    expect(toObjectiveHistoryData(points)).toEqual([
      [1, 2, 3],
      [3, null, null],
      [3, 3, 3],
      [null, null, 5],
    ]);
  });
});

describe("trialFeasibility", () => {
  it("reads infeasible off a pruned draw's constraints, feasible off a step that simulated, unknown without results", () => {
    expect(trialFeasibility(trial(0, 3))).toBe("unknown");
    expect(
      trialFeasibility({
        ...trial(1, null, "pruned"),
        constraints: {
          parameters: [{ constraintId: "order", margin: -1 }],
          state: [],
          infeasible: "order",
        },
      }),
    ).toBe("infeasible");
    // A limited step keeps its colour: nothing is excluded from the objective.
    expect(
      trialFeasibility({
        ...trial(2, 5),
        constraints: {
          parameters: [],
          state: [{ constraintId: "queue", runsPassed: 40, runsTotal: 60 }],
        },
      }),
    ).toBe("feasible");
  });

  it("is what buildObjectiveHistory reads by default", () => {
    const points = buildObjectiveHistory(
      [
        trial(0, 3),
        {
          ...trial(1, null, "pruned"),
          constraints: { parameters: [], state: [], infeasible: "order" },
        },
      ],
      "maximize",
    );
    expect(points.map((point) => point.feasibility)).toEqual([
      "unknown",
      "infeasible",
    ]);
  });
});
