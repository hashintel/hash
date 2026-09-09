import { describe, expect, it } from "vitest";

import {
  bindingStepRate,
  constraintAlpha,
  formatRate,
  passThresholdPercent,
  stepConstraintRates,
  stepVerdict,
  studyConstraintRates,
} from "./constraint-rates";

import type {
  PetrinautOptimizationTrialConstraints,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core/optimization";

const trial = (
  index: number,
  constraints?: PetrinautOptimizationTrialConstraints,
  state: PetrinautOptimizationTrialEvent["state"] = "complete",
): PetrinautOptimizationTrialEvent => ({
  type: "trial",
  trial: index,
  parameters: {},
  objective: state === "complete" ? 1 : null,
  state,
  best: null,
  ...(constraints ? { constraints } : {}),
});

const queue = (runsPassed: number, runsTotal = 60) => ({
  constraintId: "queue",
  runsPassed,
  runsTotal,
});
const stock = (runsPassed: number, runsTotal = 60) => ({
  constraintId: "stock",
  runsPassed,
  runsTotal,
});

describe("constraintAlpha", () => {
  it("defaults to 0.05 and reads the manifest's policy otherwise", () => {
    expect(constraintAlpha({})).toBe(0.05);
    expect(constraintAlpha({ constraintPolicy: { alpha: 0.2 } })).toBe(0.2);
    expect(passThresholdPercent(0.05)).toBe(95);
    expect(passThresholdPercent(0.2)).toBe(80);
  });
});

describe("stepConstraintRates and stepVerdict", () => {
  it("passes a constraint at or above 1 - alpha of its runs, exactly at the threshold included", () => {
    const rates = stepConstraintRates(
      trial(0, { parameters: [], state: [queue(57), stock(56)] }),
      0.05,
    );
    expect(rates).toEqual([
      { constraintId: "queue", runsPassed: 57, runsTotal: 60, passed: true },
      { constraintId: "stock", runsPassed: 56, runsTotal: 60, passed: false },
    ]);
  });

  it("reads one word per step", () => {
    expect(stepVerdict(trial(0), 0.05)).toBe("unconstrained");
    expect(
      stepVerdict(
        trial(1, { parameters: [], state: [queue(60), stock(58)] }),
        0.05,
      ),
    ).toBe("clear");
    expect(
      stepVerdict(trial(2, { parameters: [], state: [queue(52)] }), 0.05),
    ).toBe("limited");
    expect(
      stepVerdict(
        trial(
          3,
          {
            parameters: [{ constraintId: "order", margin: -1 }],
            state: [],
            infeasible: "order",
          },
          "pruned",
        ),
        0.05,
      ),
    ).toBe("infeasible");
    // Parameter constraints alone, all satisfied: the step is clear.
    expect(
      stepVerdict(
        trial(4, {
          parameters: [{ constraintId: "order", margin: 2 }],
          state: [],
        }),
        0.05,
      ),
    ).toBe("clear");
  });

  it("names the binding constraint: the lowest pass rate in the step", () => {
    expect(
      bindingStepRate(
        trial(0, { parameters: [], state: [queue(59), stock(52)] }),
        0.05,
      ),
    ).toMatchObject({ constraintId: "stock", runsPassed: 52 });
    expect(bindingStepRate(trial(1), 0.05)).toBeNull();
    expect(
      bindingStepRate(trial(2, { parameters: [], state: [] }), 0.05),
    ).toBeNull();
  });
});

describe("studyConstraintRates", () => {
  it("counts clear steps over simulated ones, infeasible draws apart, and the same per constraint", () => {
    const trials = [
      trial(0, { parameters: [], state: [queue(60), stock(60)] }),
      trial(1, { parameters: [], state: [queue(52), stock(60)] }),
      trial(2, { parameters: [], state: [], infeasible: "order" }, "pruned"),
      trial(3, { parameters: [], state: [queue(58), stock(50)] }),
      // A batch that failed observed nothing per run and counts nowhere.
      trial(4, { parameters: [], state: [] }, "pruned"),
      trial(5, { parameters: [], state: [queue(60), stock(57)] }),
    ];
    expect(studyConstraintRates(trials, 0.05)).toEqual({
      stepsClear: 2,
      stepsSimulated: 4,
      infeasibleDraws: 1,
      perConstraint: [
        { constraintId: "queue", stepsPassed: 3, stepsSimulated: 4 },
        { constraintId: "stock", stepsPassed: 3, stepsSimulated: 4 },
      ],
    });
  });

  it("is empty for a study without constraints", () => {
    expect(studyConstraintRates([trial(0), trial(1)], 0.05)).toEqual({
      stepsClear: 0,
      stepsSimulated: 0,
      infeasibleDraws: 0,
      perConstraint: [],
    });
  });

  it("follows the alpha it is given", () => {
    const trials = [trial(0, { parameters: [], state: [queue(52)] })];
    expect(studyConstraintRates(trials, 0.05).stepsClear).toBe(0);
    expect(studyConstraintRates(trials, 0.2).stepsClear).toBe(1);
  });
});

describe("formatRate", () => {
  it("prints the fraction with the percentage beside it", () => {
    expect(formatRate(52, 60)).toBe("52 / 60 · 87%");
    expect(formatRate(14, 20)).toBe("14 / 20 · 70%");
    expect(formatRate(0, 0)).toBe("0 / 0");
  });
});
