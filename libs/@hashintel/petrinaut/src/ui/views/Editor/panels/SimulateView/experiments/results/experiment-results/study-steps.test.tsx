/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  fakeShortStudyInput,
  fakeShortStudyTrials,
  makeOptimizationRecord,
} from "../../study-fixtures";
import { StudySteps } from "./study-steps";

afterEach(cleanup);

describe("StudySteps", () => {
  it("stars the study's best step and no other", () => {
    const { trials } = fakeShortStudyTrials;
    render(
      <StudySteps
        optimization={makeOptimizationRecord({
          input: fakeShortStudyInput,
          trials,
          best: { trial: 1, parameters: trials[1]!.parameters, objective: 1 },
          status: "running",
        })}
      />,
    );

    // Step numbers are shown from 1, so trial 1 reads "2".
    expect(
      screen.getAllByTitle("Best step").map((star) => star.textContent),
    ).toEqual(["2"]);
  });

  it("stars no step before the study has a best one", () => {
    render(
      <StudySteps
        optimization={makeOptimizationRecord({
          input: fakeShortStudyInput,
          trials: fakeShortStudyTrials.trials,
          best: null,
          status: "running",
        })}
      />,
    );

    expect(screen.queryByTitle("Best step")).toBeNull();
  });
});
