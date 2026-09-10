import { describe, expect, it } from "vitest";

import { fakeConstrainedStudyInput } from "../optimizations-story-fixtures";
import { describeStep } from "./constraint-summary";

import type {
  PetrinautOptimizationTrialConstraints,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";

const trial = (
  constraints: PetrinautOptimizationTrialConstraints | undefined,
  state: PetrinautOptimizationTrialEvent["state"] = "complete",
): PetrinautOptimizationTrialEvent => ({
  type: "trial",
  trial: 2,
  parameters: {},
  objective: state === "complete" ? 1 : null,
  state,
  best: null,
  ...(constraints ? { constraints } : {}),
});

describe("describeStep", () => {
  it("has no detail when the head says it all: a clear step with no run rates, an unconstrained step", () => {
    expect(
      describeStep(
        fakeConstrainedStudyInput,
        trial({ parameters: [], state: [] }),
        0.05,
      ),
    ).toEqual({ verdict: "clear", head: "Step 3: clear", detail: null });
    expect(
      describeStep(fakeConstrainedStudyInput, trial(undefined), 0.05),
    ).toEqual({
      verdict: "unconstrained",
      head: "Step 3: unconstrained",
      detail: null,
    });
  });

  it("names the binding constraint with its runs passed, and the state of a step that did not complete", () => {
    expect(
      describeStep(
        fakeConstrainedStudyInput,
        trial({
          parameters: [],
          state: [{ constraintId: "stock-cap", runsPassed: 51, runsTotal: 60 }],
        }),
        0.05,
      ),
    ).toEqual({
      verdict: "limited",
      head: "Step 3: limited",
      detail: "51 / 60 runs passed · 85% · Finished goods under 500",
    });
    expect(
      describeStep(
        fakeConstrainedStudyInput,
        trial({ parameters: [], state: [] }, "pruned"),
        0.05,
      ).detail,
    ).toBe("pruned");
  });

  it("names the constraint an infeasible draw broke", () => {
    expect(
      describeStep(
        fakeConstrainedStudyInput,
        trial({ parameters: [], state: [], infeasible: "stock-cap" }, "pruned"),
        0.05,
      ),
    ).toEqual({
      verdict: "infeasible",
      head: "Step 3: infeasible",
      detail: "Finished goods under 500",
    });
  });
});
