import { describe, expect, it } from "vitest";

import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getItemCountsLine, getStatusLines } from "./status-lines";

import type { ItemCounts } from "../../shared/step-states";
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

const lines = (
  runs: ItemRun[],
  { perItem = false, running = false, waitingOnPerson = false } = {},
) => getStatusLines({ runs, perItem, running, waitingOnPerson, now });

describe("getStatusLines", () => {
  it("says how long a step took and when it started", () => {
    expect(lines([run(null)])).toEqual(["1m 05s · Today, 14:02"]);
  });

  it("counts a step still running up to now", () => {
    expect(lines([run(null, { closedAt: "" })])).toEqual([
      "58m 00s · Today, 14:02",
    ]);
  });

  it("counts a step run per item up to now while it runs, though every item's run so far has closed", () => {
    expect(lines([run(0)], { perItem: true, running: true })).toEqual([
      "58m 00s · Today, 14:02",
    ]);
  });

  it("says when a step that hasn't started was scheduled, or skipped", () => {
    expect(lines([run(null, { startedAt: undefined, closedAt: "" })])).toEqual([
      "Today, 14:02",
    ]);
  });

  it("counts a step's attempts once it was retried, and that it's waiting on a person", () => {
    expect(
      lines([run(null, { attempt: 3 })], { waitingOnPerson: true }),
    ).toEqual([
      "1m 05s · Today, 14:02",
      "3 attempts",
      "Waiting on a person to answer",
    ]);
  });

  it("counts the items retried, not the runs, for a step run per item", () => {
    expect(
      lines(
        [
          run(0, { attempt: 2 }),
          run(0, { stepId: "save~0", attempt: 2 }),
          run(1, { attempt: 1 }),
        ],
        { perItem: true },
      ),
    ).toEqual(["1m 05s · Today, 14:02", "1 item retried"]);
  });
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

describe("getItemCountsLine", () => {
  it("counts the items done out of all of them, and those failed if any have", () => {
    expect(getItemCountsLine(counts({ done: 17, failed: 2, running: 1 }))).toBe(
      "17 of 20 items done · 2 failed",
    );
    expect(getItemCountsLine(counts({ done: 1 }))).toBe("1 of 1 item done");
  });

  it("has no line while there are no items", () => {
    expect(getItemCountsLine(counts({}))).toBeNull();
  });
});
