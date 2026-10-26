import { describe, expect, it } from "vitest";

import { StatusCode } from "@local/status";

import { toStepErrors, unknownErrorMessage } from "./run-events.js";
import { generateStepRunId } from "./step-run-id.js";

describe("toStepErrors", () => {
  it("gives each step error's step run, and its message or a default one", () => {
    expect(
      toStepErrors([
        {
          code: StatusCode.Internal,
          message: "No output",
          contents: [{ stepId: "count" }],
        },
        {
          code: StatusCode.NotFound,
          contents: [{ stepId: generateStepRunId("double", 2) }],
        },
      ]),
    ).toStrictEqual([
      {
        stepRun: { stepId: "count", itemPath: [] },
        error: { message: "No output" },
      },
      {
        stepRun: { stepId: "double", itemPath: [2] },
        error: { message: unknownErrorMessage },
      },
    ]);
  });

  it("leaves out a step error without a step id", () => {
    expect(
      toStepErrors([
        { code: StatusCode.Internal, message: "No step", contents: [] },
      ]),
    ).toStrictEqual([]);
  });
});
