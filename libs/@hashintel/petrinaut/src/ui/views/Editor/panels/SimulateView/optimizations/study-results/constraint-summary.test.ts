import { describe, expect, it } from "vitest";

import {
  fakeConstrainedStudyInput,
  fakeConstrainedStudyTrials,
} from "../optimizations-story-fixtures";
import { describeStep } from "./constraint-summary";

import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

const optimization = { input: fakeConstrainedStudyInput };

const trial = (
  overrides: Partial<PetrinautOptimizationTrialEvent>,
): PetrinautOptimizationTrialEvent => ({
  ...fakeConstrainedStudyTrials.trials[0]!,
  trial: 2,
  state: "complete",
  ...overrides,
});

describe("describeStep", () => {
  it("gives a parameter-only complete step its verdict alone, with nothing to add", () => {
    expect(
      describeStep(
        optimization,
        trial({
          constraints: {
            parameters: [{ constraintId: "rate-cap", margin: 1 }],
            state: [],
          },
        }),
        0.05,
      ),
    ).toEqual({ verdict: "Step 3: clear", detail: "" });
  });

  it("appends the state a step that did not complete ended in", () => {
    expect(
      describeStep(
        optimization,
        trial({
          state: "failed",
          objective: null,
          constraints: { parameters: [], state: [] },
        }),
        0.05,
      ),
    ).toEqual({ verdict: "Step 3: clear", detail: " · failed" });
  });

  it("names the binding constraint with its pass rate", () => {
    expect(
      describeStep(
        optimization,
        trial({
          constraints: {
            parameters: [],
            state: [
              { constraintId: "stock-cap", runsPassed: 51, runsTotal: 60 },
            ],
          },
        }),
        0.05,
      ),
    ).toEqual({
      verdict: "Step 3: limited",
      detail: " · 51 / 60 runs passed · 85% · Finished goods under 500",
    });
  });

  it("names the constraint an infeasible draw broke", () => {
    expect(
      describeStep(
        optimization,
        trial({
          state: "pruned",
          objective: null,
          constraints: {
            parameters: [{ constraintId: "rate-cap", margin: -4 }],
            state: [],
            infeasible: "rate-cap",
          },
        }),
        0.05,
      ),
    ).toEqual({
      verdict: "Step 3: infeasible",
      detail: " · Production rate under 320",
    });
  });
});
