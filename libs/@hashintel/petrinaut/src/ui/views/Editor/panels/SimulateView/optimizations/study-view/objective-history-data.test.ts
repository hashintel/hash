import { describe, expect, it } from "vitest";

import {
  buildObjectiveHistory,
  toObjectiveHistoryData,
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

describe("toObjectiveHistoryData", () => {
  it("aligns steps, objectives and the best so far, with infeasible steps in their own series", () => {
    const points = buildObjectiveHistory(
      [trial(0, 3), trial(1, null, "pruned"), trial(2, 5)],
      "maximize",
    );
    const infeasible = points.map((point, index) =>
      index === 2 ? { ...point, feasibility: "infeasible" as const } : point,
    );
    expect(toObjectiveHistoryData(infeasible)).toEqual([
      [1, 2, 3],
      [3, null, null],
      [3, 3, 5],
      [null, null, 5],
    ]);
  });
});
