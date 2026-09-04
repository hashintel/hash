import { describe, expect, it } from "vitest";

import {
  makeOptimizationInput,
  makeTrials,
  optimizedBindingSets,
} from "../optimizations-story-fixtures";
import { describeDisplayedSteps } from "./steps-table";

const input = makeOptimizationInput(optimizedBindingSets.base);

describe("describeDisplayedSteps", () => {
  it("says nothing while every received step is shown", () => {
    expect(describeDisplayedSteps(makeTrials(input, 200))).toBeNull();
  });

  it("notes the steps left out once more than 200 have arrived", () => {
    expect(describeDisplayedSteps(makeTrials(input, 201))).toBe(
      "Showing the latest 200 of 201 received steps.",
    );
  });
});
