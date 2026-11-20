import { describe, expect, it } from "vitest";

import { assessConvergence, convergenceWindow } from "./convergence";

import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

const completed = (
  objectives: readonly (number | null)[],
): PetrinautOptimizationTrialEvent[] =>
  objectives.map((objective, index) => ({
    type: "trial",
    trial: index,
    parameters: {},
    objective,
    state: objective === null ? "pruned" : "complete",
    best: null,
    seq: index + 2,
  }));

describe("convergenceWindow", () => {
  it("is a tenth of the requested steps, five at least", () => {
    expect(convergenceWindow(30)).toBe(5);
    expect(convergenceWindow(120)).toBe(12);
  });
});

describe("assessConvergence", () => {
  it("is too early below one window of completed steps", () => {
    expect(assessConvergence(completed([1, 2, null, 3]), "maximize", 30)).toBe(
      "too-early",
    );
  });

  it("is improving while the best moved inside the window", () => {
    expect(
      assessConvergence(completed([1, 2, 3, 4, 5, 6, 7]), "maximize", 30),
    ).toBe("improving");
  });

  it("is converging once a whole window passed without a better step", () => {
    expect(
      assessConvergence(completed([5, 9, 8, 7, 6, 5, 4]), "maximize", 30),
    ).toBe("converging");
  });

  it("reads the direction: a lower value improves a minimizing study", () => {
    expect(
      assessConvergence(completed([5, 4, 6, 7, 8, 9, 3]), "minimize", 30),
    ).toBe("improving");
    expect(
      assessConvergence(completed([3, 4, 6, 7, 8, 9, 5]), "minimize", 30),
    ).toBe("converging");
  });

  it("ignores pruned steps when counting stagnation", () => {
    expect(
      assessConvergence(
        completed([5, null, null, null, null, null, 4, 3, 2, 1, 0]),
        "maximize",
        30,
      ),
    ).toBe("converging");
  });
});
