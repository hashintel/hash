import { describe, expect, it } from "vitest";

import {
  makeOptimizationInput,
  makeOptimizationRecord,
  makeTrials,
  optimizedBindingSets,
} from "../experiments/study-fixtures";
import {
  describeStepProgress,
  describeStudyProgress,
} from "./describe-study-progress";
import { formatNumber } from "./format-value";

const input = makeOptimizationInput(optimizedBindingSets.base);
const { trials } = makeTrials(input, 12);

const settled = {
  input,
  trials: trials.slice(0, 4),
  best: { trial: 2, parameters: {}, objective: 650.5 },
};
const best = `best step so far: step 3 (${formatNumber(650.5)})`;

describe("describeStudyProgress", () => {
  it("names the step in flight and the best step so far while running", () => {
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ ...settled, status: "running" }),
      ),
    ).toBe(`Step 5 of 30 · ${best}`);
  });

  it("says how the study ended once settled: stopped, failed or finished", () => {
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ ...settled, status: "cancelled" }),
      ),
    ).toBe(`Stopped after 4 of 30 steps · ${best}`);
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ ...settled, status: "error" }),
      ),
    ).toBe(`Failed after 4 of 30 steps · ${best}`);
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ ...settled, trials, status: "complete" }),
      ),
    ).toBe(`Finished 12 of 30 steps · ${best}`);
    expect(
      describeStudyProgress({
        ...makeOptimizationRecord({ ...settled, status: "complete" }),
        completedTrials: 30,
        prunedTrials: 0,
      }),
    ).toBe(`Finished 30 steps · ${best}`);
  });

  it("admits there is no best step yet", () => {
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ input, status: "initializing" }),
      ),
    ).toBe("Starting · no best step yet");
  });
});

describe("describeStepProgress", () => {
  it("counts the finished steps of every state over the requested ones", () => {
    expect(
      describeStepProgress({
        ...makeOptimizationRecord({ input }),
        completedTrials: 3,
        prunedTrials: 1,
        failedTrials: 2,
      }),
    ).toBe("6 / 30");
  });

  it("names the runs per step only above one", () => {
    expect(
      describeStepProgress({
        ...makeOptimizationRecord({ input }),
        completedTrials: 3,
        prunedTrials: 1,
        failedTrials: 0,
        input: {
          ...input,
          execution: { ...input.execution, seedsPerTrial: 3 },
        },
      }),
    ).toBe("4 / 30 · 3 runs each");
  });
});
