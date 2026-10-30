import { readFileSync } from "node:fs";

import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import { buildFlowRunEvents } from "./build-flow-run-events.js";
import { pageFlowRunEvents } from "./page-flow-run-events.js";

import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";

const loadRun = (fixtureName: string) => {
  const { describe: description, history } = JSON.parse(
    readFileSync(
      new URL(
        `../../../tests/fixtures/flow-run-histories/${fixtureName}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { describe: { runId: string }; history: Record<string, unknown> };

  return {
    runId: description.runId,
    events: buildFlowRunEvents(
      proto.temporal.api.history.v1.History.fromObject(history).events,
    ),
  };
};

const positionsOf = (events: FlowRunEvent[]) =>
  events.map(({ position }) => position);

describe("pageFlowRunEvents", () => {
  const run = loadRun("succeeds");

  it("pages through a run, with each page after the last one's end", () => {
    const first = pageFlowRunEvents({ ...run, first: 3 });
    expect(positionsOf(first.events)).toStrictEqual(["1.0", "35.0", "36.0"]);
    expect(first).toMatchObject({
      hasNextPage: true,
      runId: run.runId,
      restarted: false,
      keptUpTo: null,
    });

    const second = pageFlowRunEvents({
      ...run,
      after: first.endCursor,
      first: 3,
    });
    expect(positionsOf(second.events)).toStrictEqual(["41.0", "51.0", "52.0"]);
    expect(second.hasNextPage).toBe(true);

    const last = pageFlowRunEvents({
      ...run,
      after: second.endCursor,
      first: 3,
    });
    expect(positionsOf(last.events)).toStrictEqual(["57.0", "78.0"]);
    expect(last.hasNextPage).toBe(false);

    const afterLast = pageFlowRunEvents({ ...run, after: last.endCursor });
    expect(afterLast).toStrictEqual({
      events: [],
      endCursor: last.endCursor,
      hasNextPage: false,
      runId: run.runId,
      restarted: false,
      keptUpTo: null,
    });
  });

  it("ends a page exactly at the run's last event without a next page", () => {
    const page = pageFlowRunEvents({ ...run, first: 8 });
    expect(page.events).toHaveLength(8);
    expect(page.hasNextPage).toBe(false);
  });

  it("returns 500 events by default and at most 2,000", () => {
    const events = Array.from({ length: 2_500 }, (_, index): FlowRunEvent => ({
      kind: "runReset",
      fromRunId: "unrelated",
      position: `${index + 1}.0`,
      occurredAt: "2026-10-21T00:00:00.000Z",
    }));

    expect(pageFlowRunEvents({ events, runId: run.runId }).events).toHaveLength(
      500,
    );
    expect(
      pageFlowRunEvents({ events, runId: run.runId, first: 5_000 }).events,
    ).toHaveLength(2_000);
  });

  it("refuses a page of fewer than one event, and a cursor it didn't make", () => {
    expect(() => pageFlowRunEvents({ ...run, first: 0 })).toThrow();
    expect(() =>
      pageFlowRunEvents({ ...run, after: "not-a-cursor" }),
    ).toThrow();
  });

  it("returns an empty page with no cursor for a run with no events", () => {
    expect(pageFlowRunEvents({ events: [], runId: run.runId })).toStrictEqual({
      events: [],
      endCursor: null,
      hasNextPage: false,
      runId: run.runId,
      restarted: false,
      keptUpTo: null,
    });
  });

  it("restarts from the first event for a cursor from a run the current one doesn't come from", () => {
    const otherRun = loadRun("progress-logs");
    const { endCursor } = pageFlowRunEvents({ ...otherRun, first: 3 });

    const page = pageFlowRunEvents({ ...run, after: endCursor, first: 2 });

    expect(positionsOf(page.events)).toStrictEqual(["1.0", "35.0"]);
    expect(page).toMatchObject({ restarted: true, keptUpTo: null });
  });

  describe("after a reset", () => {
    const baseRun = loadRun("reset-base-run");
    const resetRun = loadRun("reset");

    const baseRunCursorAt = (position: string) => {
      const count =
        baseRun.events.findIndex((event) => event.position === position) + 1;
      return pageFlowRunEvents({ ...baseRun, first: count }).endCursor;
    };

    it("carries on from a cursor at the last event the reset kept", () => {
      const page = pageFlowRunEvents({
        ...resetRun,
        after: baseRunCursorAt("40.0"),
      });

      expect(positionsOf(page.events)).toStrictEqual([
        "43.0",
        "47.0",
        "49.0",
        "70.0",
      ]);
      expect(page).toMatchObject({
        runId: resetRun.runId,
        restarted: false,
        keptUpTo: null,
      });
    });

    it("carries on from a cursor before it", () => {
      const page = pageFlowRunEvents({
        ...resetRun,
        after: baseRunCursorAt("36.0"),
        first: 2,
      });

      expect(positionsOf(page.events)).toStrictEqual(["40.0", "43.0"]);
      expect(page.restarted).toBe(false);
    });

    it("restarts after the last kept event for a cursor past the reset point", () => {
      const page = pageFlowRunEvents({
        ...resetRun,
        after: baseRunCursorAt("44.0"),
        first: 2,
      });

      expect(positionsOf(page.events)).toStrictEqual(["43.0", "47.0"]);
      expect(page).toMatchObject({ restarted: true, keptUpTo: "40.0" });

      const next = pageFlowRunEvents({ ...resetRun, after: page.endCursor });
      expect(positionsOf(next.events)).toStrictEqual(["49.0", "70.0"]);
      expect(next.restarted).toBe(false);
    });
  });
});
