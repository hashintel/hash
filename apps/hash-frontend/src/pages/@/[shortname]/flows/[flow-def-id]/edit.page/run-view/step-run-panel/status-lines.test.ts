import { describe, expect, it } from "vitest";

import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getItemCount, getStatusLine } from "./status-lines";

import type {
  ItemCounts,
  StepRunMark,
  StepState,
} from "../../shared/step-states";
import type { ItemRun } from "./step-runs";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";

/** Local times, as the lines show them. */
const at = (hours: number, minutes: number, seconds = 0) =>
  new Date(2026, 10, 5, hours, minutes, seconds).toISOString();

const now = new Date(2026, 10, 5, 15, 0);

const run = (
  itemIndex: number | null,
  overrides: Partial<FlowRunStepRunState> = {},
): ItemRun => ({
  itemIndex,
  stepRun: {
    stepId: "fetch",
    stepType: "getFileFromUrlAction",
    status: FlowStepStatus.Completed,
    scheduledAt: at(14, 2),
    startedAt: at(14, 2),
    closedAt: at(14, 3, 5),
    attempt: 1,
    inputs: [],
    logs: [],
    ...overrides,
  },
});

const counts = (overrides: Partial<ItemCounts>): ItemCounts => ({
  done: 0,
  failed: 0,
  needsReview: 0,
  running: 0,
  skipped: 0,
  notReached: 0,
  ...overrides,
});

const statusLine = (
  runs: ItemRun[],
  {
    mark = { state: "done", items: null },
    live = false,
    perItem = false,
    running = false,
    askedAt = null,
  }: {
    mark?: StepRunMark;
    live?: boolean;
    perItem?: boolean;
    running?: boolean;
    askedAt?: string | null;
  } = {},
) => getStatusLine({ mark, live, runs, perItem, running, askedAt, now });

describe("getStatusLine", () => {
  it("says how long a step took and when it started, after its state", () => {
    expect(statusLine([run(null)])).toEqual({
      state: "done",
      word: "Done",
      facts: ["1m 05s", "Today, 14:02"],
      notes: [],
    });
  });

  it("counts a step still running up to now", () => {
    expect(
      statusLine([run(null, { closedAt: "" })], {
        mark: { state: "running", items: null },
        live: true,
        running: true,
      }).facts,
    ).toEqual(["58m 00s", "Today, 14:02"]);
  });

  it("counts a step run per item up to now while it runs, with how many items have finished", () => {
    expect(
      statusLine([run(0)], {
        mark: {
          state: "running",
          items: counts({ done: 10, failed: 1, skipped: 1, running: 8 }),
        },
        live: true,
        perItem: true,
        running: true,
      }).facts,
    ).toEqual(["12 of 20", "58m 00s", "Today, 14:02"]);
  });

  it("reads as done with how many items failed, for a step done with failures", () => {
    expect(
      statusLine([run(0), run(1, { status: FlowStepStatus.Failed })], {
        mark: {
          state: "doneWithFailures",
          items: counts({ done: 18, failed: 2 }),
        },
        perItem: true,
      }),
    ).toMatchObject({
      word: "Done",
      facts: ["2 of 20 failed", "1m 05s", "Today, 14:02"],
    });
  });

  it("says when a step that hasn't started was scheduled, or skipped", () => {
    expect(
      statusLine([run(null, { startedAt: undefined, closedAt: "" })]).facts,
    ).toEqual(["Today, 14:02"]);
  });

  it("reads as waiting for a step not reached while its run is live, and as skipped once it has ended", () => {
    const mark: StepRunMark = { state: "notReached", items: null };

    expect(statusLine([], { mark, live: true }).word).toBe("Waiting");
    expect(statusLine([], { mark, live: false }).word).toBe("Skipped");
  });

  it("says when a step waiting on a person asked, in place of its timing, and that it's waiting", () => {
    expect(
      statusLine([run(null, { closedAt: "" })], {
        mark: { state: "needsReview", items: null },
        live: true,
        running: true,
        askedAt: at(14, 10),
      }),
    ).toEqual({
      state: "needsReview",
      word: "Needs review",
      facts: ["Asked Today, 14:10"],
      notes: ["Waiting on a person to answer"],
    });
  });

  it("counts a step's attempts once it was retried", () => {
    expect(statusLine([run(null, { attempt: 3 })]).notes).toEqual([
      "3 attempts",
    ]);
  });

  it("counts the items retried, not the runs, for a step run per item", () => {
    expect(
      statusLine(
        [
          run(0, { attempt: 2 }),
          run(0, { stepId: "save~0", attempt: 2 }),
          run(1, { attempt: 1 }),
        ],
        { perItem: true },
      ).notes,
    ).toEqual(["1 item retried"]);
  });

  it("says how long a step that timed out ran for", () => {
    expect(
      statusLine(
        [run(null, { status: FlowStepStatus.TimedOut, closedAt: at(14, 32) })],
        { mark: { state: "failed", items: null } },
      ).notes,
    ).toEqual(["Timed out after 30m 00s"]);
  });
});

describe("getItemCount", () => {
  const count = (state: StepState, items: Partial<ItemCounts>) =>
    getItemCount(state, counts(items));

  it("counts the items that failed, or else those skipped", () => {
    expect(count("done", { done: 18, skipped: 2 })).toBe("2 of 20 skipped");
    expect(count("doneWithFailures", { done: 17, failed: 2, skipped: 1 })).toBe(
      "2 of 20 failed",
    );
  });

  it("has no count for a step whose items all went well, waits on a person, or has none", () => {
    expect(count("done", { done: 20 })).toBeNull();
    expect(count("needsReview", { done: 3, needsReview: 1 })).toBeNull();
    expect(count("done", {})).toBeNull();
  });
});
