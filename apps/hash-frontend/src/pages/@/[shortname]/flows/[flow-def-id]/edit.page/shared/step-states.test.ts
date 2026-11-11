import { describe, expect, it } from "vitest";

import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { actionStep } from "./step-fixtures";
import { getBarSegments, getStepRunMarks } from "./step-states";

import type { ItemCounts } from "./step-states";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

/** Find suppliers, then for each supplier fetch a certificate and send it. */
const steps: StepDefinition<string>[] = [
  actionStep("find"),
  {
    kind: "for-each",
    stepId: "eachSupplier",
    description: "",
    over: { kind: "step-output", stepId: "find", outputName: "entities" },
    steps: [actionStep("fetch"), actionStep("send")],
    collect: { stepId: "send", outputName: "message", as: "messages" },
  },
];

const stepRun = (
  stepId: string,
  status: FlowStepStatus,
): FlowRunStepRunState => ({
  attempt: 1,
  inputs: [],
  logs: [],
  scheduledAt: "2026-11-10T09:00:00.000Z",
  status,
  stepId,
  stepType: "getFileFromUrlAction",
});

const itemRun = (stepId: string, index: number, status: FlowStepStatus) =>
  stepRun(generateStepRunId(stepId, index), status);

const forEachStarted = (itemCount: number): FlowRunEvent => ({
  kind: "forEachStarted",
  position: "10.0",
  occurredAt: "2026-11-10T09:00:01.000Z",
  stepRun: { stepId: "eachSupplier", itemPath: [] },
  itemCount,
});

const counts = (partial: Partial<ItemCounts>): ItemCounts => ({
  done: 0,
  failed: 0,
  needsReview: 0,
  running: 0,
  skipped: 0,
  notReached: 0,
  ...partial,
});

const marksOf = (
  stepRuns: FlowRunStepRunState[],
  { itemCount, live }: { itemCount?: number; live: boolean },
) =>
  getStepRunMarks({
    steps,
    stepRuns,
    events: itemCount === undefined ? [] : [forEachStarted(itemCount)],
    live,
  });

describe("getStepRunMarks", () => {
  it("shows steps with no run, and those inside a for-each step not started yet, as not reached", () => {
    const marks = marksOf([], { live: true });

    expect(marks.get("find")?.state).toBe("notReached");
    expect(marks.get("eachSupplier")?.state).toBe("notReached");
    expect(marks.get("fetch")?.state).toBe("notReached");
  });

  it("counts a live for-each step's items done and failed so far, keeping it running", () => {
    const marks = marksOf(
      [
        stepRun("find", FlowStepStatus.Completed),
        itemRun("fetch", 0, FlowStepStatus.Completed),
        itemRun("send", 0, FlowStepStatus.Completed),
        itemRun("fetch", 1, FlowStepStatus.Failed),
        itemRun("send", 1, FlowStepStatus.Skipped),
        itemRun("fetch", 2, FlowStepStatus.Completed),
        itemRun("send", 2, FlowStepStatus.Started),
      ],
      { itemCount: 4, live: true },
    );

    expect(marks.get("eachSupplier")).toEqual({
      state: "running",
      items: counts({ done: 1, failed: 1, running: 1, notReached: 1 }),
    });
    expect(marks.get("fetch")).toEqual({
      state: "running",
      items: counts({ done: 2, failed: 1, notReached: 1 }),
    });
    expect(marks.get("send")).toEqual({
      state: "running",
      items: counts({ done: 1, skipped: 1, running: 1, notReached: 1 }),
    });
  });

  it("shows a for-each step that started its items, none of them yet, as running while its run is live", () => {
    const marks = marksOf([stepRun("find", FlowStepStatus.Completed)], {
      itemCount: 3,
      live: true,
    });

    expect(marks.get("eachSupplier")?.state).toBe("running");
    /* Its steps haven't run for any item yet. */
    expect(marks.get("fetch")?.state).toBe("notReached");
  });

  it("shows a finished for-each step with some failed items as done with failures, though their later steps never started", () => {
    const marks = marksOf(
      [
        itemRun("fetch", 0, FlowStepStatus.Completed),
        itemRun("send", 0, FlowStepStatus.Completed),
        /* `send` waits on the failed `fetch` for this item, so it never runs. */
        itemRun("fetch", 1, FlowStepStatus.TimedOut),
        itemRun("fetch", 2, FlowStepStatus.Completed),
        itemRun("send", 2, FlowStepStatus.Completed),
      ],
      { itemCount: 3, live: false },
    );

    expect(marks.get("eachSupplier")).toEqual({
      state: "doneWithFailures",
      items: counts({ done: 2, failed: 1 }),
    });
    expect(marks.get("fetch")?.state).toBe("doneWithFailures");
    expect(marks.get("send")?.state).toBe("done");
  });

  it("shows a for-each step whose every item failed as failed", () => {
    const marks = marksOf([itemRun("fetch", 0, FlowStepStatus.Failed)], {
      itemCount: 1,
      live: false,
    });

    expect(marks.get("eachSupplier")?.state).toBe("failed");
    expect(marks.get("send")?.state).toBe("notReached");
  });

  it("shows a for-each step as needing review while an item waits on a person, even with failed items", () => {
    const marks = marksOf(
      [
        itemRun("fetch", 0, FlowStepStatus.Failed),
        itemRun("fetch", 1, FlowStepStatus.InformationRequired),
      ],
      { itemCount: 2, live: true },
    );

    expect(marks.get("eachSupplier")?.state).toBe("needsReview");
  });

  it("shows a cancelled step as not reached, and a for-each step cancelled part way as skipped", () => {
    const marks = marksOf(
      [
        stepRun("find", FlowStepStatus.Cancelled),
        itemRun("fetch", 0, FlowStepStatus.Completed),
        itemRun("send", 0, FlowStepStatus.Completed),
        itemRun("fetch", 1, FlowStepStatus.CancelRequested),
      ],
      { itemCount: 2, live: false },
    );

    expect(marks.get("find")).toEqual({ state: "notReached", items: null });
    expect(marks.get("eachSupplier")).toEqual({
      state: "skipped",
      items: counts({ done: 1, notReached: 1 }),
    });
    expect(marks.get("send")?.state).toBe("skipped");
  });

  it("shows a for-each step whose run stopped before every item finished as skipped", () => {
    const marks = marksOf(
      [
        itemRun("fetch", 0, FlowStepStatus.Completed),
        itemRun("send", 0, FlowStepStatus.Completed),
        itemRun("fetch", 1, FlowStepStatus.Completed),
      ],
      { itemCount: 3, live: false },
    );

    expect(marks.get("eachSupplier")).toEqual({
      state: "skipped",
      items: counts({ done: 1, skipped: 1, notReached: 1 }),
    });
    expect(marks.get("send")?.state).toBe("skipped");
  });

  it("shows a for-each step with no items as done, and its steps as skipped", () => {
    const marks = marksOf([], { itemCount: 0, live: false });

    expect(marks.get("eachSupplier")?.state).toBe("done");
    expect(marks.get("fetch")?.state).toBe("skipped");
  });
});

describe("getBarSegments", () => {
  it("splits the bar of a step that runs per item by its items, in proportion", () => {
    expect(
      getBarSegments({
        state: "running",
        items: counts({ notReached: 5, done: 12, running: 1, failed: 2 }),
      }),
    ).toEqual([
      { state: "done", weight: 12 },
      { state: "failed", weight: 2 },
      { state: "running", weight: 1 },
      { state: "notReached", weight: 5 },
    ]);
  });

  it("splits the bar of a step done with failures into equal halves, however few failed", () => {
    expect(
      getBarSegments({
        state: "doneWithFailures",
        items: counts({ done: 99, failed: 1 }),
      }),
    ).toEqual([
      { state: "done", weight: 1 },
      { state: "failed", weight: 1 },
    ]);
  });
});
