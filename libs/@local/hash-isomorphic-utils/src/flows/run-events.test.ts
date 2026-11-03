import { describe, expect, it } from "vitest";

import { StatusCode } from "@local/status";

import { FlowRunStatus } from "../graphql/api-types.gen.js";
import {
  getOpenInputRequests,
  toStepErrors,
  unknownErrorMessage,
} from "./run-events.js";
import { generateStepRunId } from "./step-run-id.js";

import type { FlowRunEvent } from "./run-events.js";

const question: FlowRunEvent = {
  kind: "inputRequested",
  position: "2.0",
  occurredAt: "2026-10-26T10:01:00.000Z",
  stepRun: { stepId: "1", itemPath: [] },
  request: {
    requestId: "question",
    stepId: "1",
    type: "human-input",
    data: { questions: ["Which one?"] },
  },
};

describe("getOpenInputRequests", () => {
  it("gives a request until it's answered", () => {
    expect(getOpenInputRequests([question])).toStrictEqual([
      {
        ...question.request,
        raisedAt: question.occurredAt,
      },
    ]);

    expect(
      getOpenInputRequests([
        question,
        {
          kind: "inputResolved",
          position: "3.0",
          occurredAt: "2026-10-26T10:02:00.000Z",
          requestId: "question",
          response: {
            requestId: "question",
            type: "human-input",
            data: { answers: ["This one"] },
          },
        },
      ]),
    ).toStrictEqual([]);
  });

  it("gives none once the run has finished", () => {
    expect(
      getOpenInputRequests([
        question,
        {
          kind: "runFinished",
          position: "4.0",
          occurredAt: "2026-10-26T10:03:00.000Z",
          status: FlowRunStatus.Cancelled,
        },
      ]),
    ).toStrictEqual([]);
  });
});

describe("toStepErrors", () => {
  it("gives each step error's step run, its code, and its message or a default one", () => {
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
        error: { message: "No output", code: StatusCode.Internal },
      },
      {
        stepRun: { stepId: "double", itemPath: [2] },
        error: { message: unknownErrorMessage, code: StatusCode.NotFound },
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
