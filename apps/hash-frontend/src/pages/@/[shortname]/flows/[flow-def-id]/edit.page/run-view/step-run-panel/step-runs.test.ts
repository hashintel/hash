import { describe, expect, it } from "vitest";

import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { actionStep } from "../../shared/step-fixtures";
import {
  getCommonInputs,
  getLastError,
  getRunsOfStep,
  getTimeSpan,
  sortInputs,
} from "./step-runs";

import type { ItemRun } from "./step-runs";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type {
  ForEachStepDefinition,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

const stepRun = (
  stepId: string,
  overrides: Partial<FlowRunStepRunState> = {},
): FlowRunStepRunState => ({
  stepId,
  stepType: "getFileFromUrlAction",
  status: FlowStepStatus.Completed,
  scheduledAt: "2026-11-05T14:00:00.000Z",
  startedAt: "2026-11-05T14:00:01.000Z",
  closedAt: "2026-11-05T14:00:05.000Z",
  attempt: 1,
  inputs: [],
  logs: [],
  ...overrides,
});

const itemRuns = (...stepRuns: FlowRunStepRunState[]): ItemRun[] =>
  stepRuns.map((run, itemIndex) => ({ itemIndex, stepRun: run }));

const text = (inputName: string, value: string): StepInput => ({
  inputName,
  payload: { kind: "Text", value },
});

const forEach: ForEachStepDefinition<string> = {
  kind: "for-each",
  stepId: "each",
  description: "",
  over: { kind: "flow-input", inputName: "urls" },
  steps: [actionStep("fetch"), actionStep("save")],
  collect: { stepId: "save", outputName: "file", as: "files" },
};

describe("getRunsOfStep", () => {
  /* Latest first, as step runs are read from a run's events. */
  const stepRuns = new Map(
    [
      stepRun("after"),
      stepRun("save~0"),
      stepRun("fetch~1"),
      stepRun("fetch~0"),
      stepRun("fetchAgain"),
    ].map((run) => [run.stepId, run]),
  );

  it("gives a step outside a for-each step its own run, and not a step whose id starts the same", () => {
    expect(
      getRunsOfStep(
        actionStep("fetch"),
        new Map([
          ["fetch", stepRun("fetch")],
          ["fetchAgain", stepRun("fetchAgain")],
        ]),
      ).map(({ itemIndex, stepRun: { stepId } }) => [itemIndex, stepId]),
    ).toEqual([[null, "fetch"]]);
  });

  it("gives a step inside a for-each step its run for each item, in item order", () => {
    expect(
      getRunsOfStep(actionStep("fetch"), stepRuns).map(
        ({ itemIndex, stepRun: { stepId } }) => [itemIndex, stepId],
      ),
    ).toEqual([
      [0, "fetch~0"],
      [1, "fetch~1"],
    ]);
  });

  it("gives a for-each step its steps' runs for every item", () => {
    expect(
      getRunsOfStep(forEach, stepRuns).map(({ stepRun: { stepId } }) => stepId),
    ).toEqual(["save~0", "fetch~0", "fetch~1"]);
  });

  it("gives a skipped for-each step its own run first", () => {
    expect(
      getRunsOfStep(
        forEach,
        new Map([
          ["fetch~0", stepRun("fetch~0")],
          ["each", stepRun("each", { status: FlowStepStatus.Skipped })],
        ]),
      ).map(({ itemIndex, stepRun: { stepId } }) => [itemIndex, stepId]),
    ).toEqual([
      [null, "each"],
      [0, "fetch~0"],
    ]);
  });
});

describe("getTimeSpan", () => {
  it("runs from the first scheduled to the last close, across a run's attempts", () => {
    expect(
      getTimeSpan(
        itemRuns(
          stepRun("fetch~0", {
            scheduledAt: "2026-11-05T14:00:03.000Z",
            startedAt: "2026-11-05T14:00:03.500Z",
            closedAt: "2026-11-05T14:00:09.000Z",
          }),
          /* Retried: its latest attempt started well after it was scheduled. */
          stepRun("fetch~1", {
            scheduledAt: "2026-11-05T14:00:02.000Z",
            startedAt: "2026-11-05T14:00:07.000Z",
            closedAt: "2026-11-05T14:00:08.000Z",
            attempt: 3,
          }),
          /* Not started, so not counted. */
          stepRun("fetch~2", {
            scheduledAt: "2026-11-05T14:00:01.000Z",
            startedAt: undefined,
            closedAt: "2026-11-05T14:00:05.000Z",
            status: FlowStepStatus.Skipped,
          }),
        ),
      ),
    ).toEqual({
      startedAt: "2026-11-05T14:00:02.000Z",
      closedAt: "2026-11-05T14:00:09.000Z",
    });
  });

  it("has no end while any run is open, or before any has started", () => {
    expect(
      getTimeSpan(
        itemRuns(stepRun("fetch~0"), stepRun("fetch~1", { closedAt: "" })),
      ).closedAt,
    ).toBeNull();
    expect(
      getTimeSpan(
        itemRuns(stepRun("fetch", { startedAt: undefined, closedAt: "" })),
      ),
    ).toEqual({ startedAt: null, closedAt: null });
  });
});

describe("getCommonInputs", () => {
  it("keeps the inputs every item got the same, and names those that differ or some items lack", () => {
    expect(
      getCommonInputs(
        itemRuns(
          stepRun("fetch~0", {
            inputs: [
              text("url", "a.pdf"),
              text("folder", "In"),
              text("note", "x"),
            ],
          }),
          stepRun("fetch~1", {
            inputs: [text("folder", "In"), text("url", "b.pdf")],
          }),
        ),
      ),
    ).toEqual({ common: [text("folder", "In")], varying: ["url", "note"] });
  });

  it("leaves out items that were skipped, which got no inputs", () => {
    expect(
      getCommonInputs(
        itemRuns(
          stepRun("fetch~0", {
            status: FlowStepStatus.Skipped,
            inputs: [],
          }),
          stepRun("fetch~1", { inputs: [text("url", "b.pdf")] }),
        ),
      ),
    ).toEqual({ common: [text("url", "b.pdf")], varying: [] });
  });
});

describe("getLastError", () => {
  it("gives the error of the run that failed last, its action's error status before a failed attempt's", () => {
    expect(
      getLastError(
        itemRuns(
          stepRun("fetch~0", {
            status: FlowStepStatus.Failed,
            closedAt: "2026-11-05T14:00:09.000Z",
            lastFailure: { message: "Timed out" },
            errorStatus: { message: "Not found" },
          }),
          stepRun("fetch~1", {
            status: FlowStepStatus.Failed,
            closedAt: "2026-11-05T14:00:04.000Z",
            lastFailure: { message: "Bad gateway" },
          }),
        ),
      ),
    ).toEqual({ error: { message: "Not found" }, context: "Item 1" });
  });

  it("gives a run being retried its last attempt's error, and none to runs without one", () => {
    expect(
      getLastError([
        {
          itemIndex: null,
          stepRun: stepRun("fetch", {
            status: FlowStepStatus.Started,
            closedAt: "",
            attempt: 2,
            lastFailure: { message: "Timed out" },
          }),
        },
      ]),
    ).toEqual({
      error: { message: "Timed out" },
      context: "Attempt 1 failed, retrying",
    });
    expect(getLastError(itemRuns(stepRun("fetch~0")))).toBeNull();
  });

  it("doesn't say a run waiting on a person is retrying", () => {
    expect(
      getLastError([
        {
          itemIndex: null,
          stepRun: stepRun("fetch", {
            status: FlowStepStatus.InformationRequired,
            closedAt: "",
            attempt: 2,
            lastFailure: { message: "Timed out" },
          }),
        },
      ]),
    ).toEqual({ error: { message: "Timed out" }, context: null });
  });

  it("doesn't say a run that gave up after its attempts is retrying", () => {
    expect(
      getLastError([
        {
          itemIndex: null,
          stepRun: stepRun("fetch", {
            status: FlowStepStatus.Failed,
            attempt: 3,
            lastFailure: { message: "Timed out" },
          }),
        },
      ]),
    ).toEqual({ error: { message: "Timed out" }, context: null });
  });

  it("times a run still open by when it started, against one that closed", () => {
    expect(
      getLastError(
        itemRuns(
          stepRun("fetch~0", {
            status: FlowStepStatus.Failed,
            startedAt: "2026-11-05T14:00:02.000Z",
            closedAt: "2026-11-05T14:00:06.000Z",
            errorStatus: { message: "Not found" },
          }),
          stepRun("fetch~1", {
            status: FlowStepStatus.Started,
            startedAt: "2026-11-05T14:00:08.000Z",
            closedAt: "",
            attempt: 2,
            lastFailure: { message: "Timed out" },
          }),
        ),
      ),
    ).toEqual({
      error: { message: "Timed out" },
      context: "Item 2, attempt 1 failed, retrying",
    });
  });
});

describe("sortInputs", () => {
  it("puts inputs in the action's order, and those it doesn't list after, as they came", () => {
    expect(
      sortInputs(
        [
          text("extra", "a"),
          text("url", "b"),
          text("unknown", "c"),
          text("description", "d"),
        ],
        ["description", "url"],
      ).map(({ inputName }) => inputName),
    ).toEqual(["description", "url", "extra", "unknown"]);
  });
});
