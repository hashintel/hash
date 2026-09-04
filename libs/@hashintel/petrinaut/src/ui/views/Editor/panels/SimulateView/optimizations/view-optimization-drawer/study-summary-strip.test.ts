import { describe, expect, it } from "vitest";

import {
  makeOptimizationInput,
  makeOptimizationRecord,
  optimizedBindingSets,
} from "../optimizations-story-fixtures";
import { describeStepProgress } from "./study-summary-strip";

const input = makeOptimizationInput(optimizedBindingSets.base);

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

  it("names the runs per step and the steps at once only above one", () => {
    expect(
      describeStepProgress({
        ...makeOptimizationRecord({ input, parallelism: 2 }),
        completedTrials: 3,
        prunedTrials: 1,
        failedTrials: 0,
        input: {
          ...input,
          execution: { ...input.execution, seedsPerTrial: 3 },
        },
      }),
    ).toBe("4 / 30 · 3 runs each · 2 at once");
  });

  it("names the runs per step alone when steps run one at a time", () => {
    expect(
      describeStepProgress({
        ...makeOptimizationRecord({ input }),
        input: {
          ...input,
          execution: { ...input.execution, seedsPerTrial: 6 },
        },
      }),
    ).toBe("0 / 30 · 6 runs each");
  });
});
