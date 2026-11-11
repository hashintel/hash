import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "../../../../../../../graphql/api-types.gen";
import {
  countRunsByTab,
  filterRuns,
  getRunDuration,
  sortRuns,
  toRunRow,
} from "./run-list";

import type { RunRow, RunSummary } from "./run-list";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";

const webId = "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11" as WebId;

const now = new Date("2026-11-09T12:00:00Z");

const openInputRequest: ExternalInputRequest = {
  requestId: "request-1",
  stepId: "sign-off",
  type: "human-input",
  data: { questions: ["Do these certificates look right?"] },
  raisedAt: "2026-11-09T08:01:00Z",
};

/** A run, by the last characters of its uuid, as summarized by the API. */
const summary = (
  idEnd: string,
  overrides: Partial<RunSummary> = {},
): RunSummary => ({
  flowRunEntityId:
    `${webId}~7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e${idEnd}` as EntityId,
  flowScheduleId: null,
  webId,
  status: FlowRunStatus.Completed,
  startedAt: "2026-11-09T08:00:00Z",
  closedAt: "2026-11-09T08:05:00Z",
  openInputRequests: [],
  ...overrides,
});

const row = (idEnd: string, overrides: Partial<RunSummary> = {}): RunRow =>
  toRunRow(summary(idEnd, overrides), "acme");

const idsOf = (rows: RunRow[]) => rows.map(({ shortId }) => shortId);

describe("toRunRow", () => {
  it("names a run by the end of its uuid", () => {
    expect(row("2f3a4b").shortId).toBe("2f3a4b");
  });

  it("shows a running run waiting on a person as needing review", () => {
    expect(
      row("aaaaaa", {
        status: FlowRunStatus.Running,
        closedAt: null,
        openInputRequests: [openInputRequest],
      }).state,
    ).toBe("needsReview");
    expect(
      row("bbbbbb", { status: FlowRunStatus.Running, closedAt: null }).state,
    ).toBe("running");
  });

  it("keeps a running run waiting only on web pages as running", () => {
    expect(
      row("aaaaaa", {
        status: FlowRunStatus.Running,
        closedAt: null,
        openInputRequests: [
          {
            requestId: "request-2",
            stepId: "fetch-pages",
            type: "get-urls-html-content",
            data: { urls: ["https://example.com"] },
            raisedAt: "2026-11-09T08:01:00Z",
          },
        ],
      }).state,
    ).toBe("running");
  });

  it("shows a cancelled or terminated run as cancelled", () => {
    expect(
      [FlowRunStatus.Cancelled, FlowRunStatus.Terminated].map(
        (status) => row("aaaaaa", { status }).state,
      ),
    ).toEqual(["cancelled", "cancelled"]);
  });

  it("takes a run with a schedule to have been triggered by it", () => {
    expect(
      row("aaaaaa", { flowScheduleId: "5c1e" as EntityUuid }).trigger,
    ).toBe("scheduled");
    expect(row("bbbbbb").trigger).toBe("manual");
  });
});

describe("getRunDuration", () => {
  it("counts a running run to now, but not a stopped run with no end recorded", () => {
    const startedAt = "2026-11-09T11:00:00Z";

    expect(
      getRunDuration(
        row("aaaaaa", {
          status: FlowRunStatus.Running,
          startedAt,
          closedAt: null,
        }),
        now,
      ),
    ).toBe(60 * 60_000);
    expect(
      getRunDuration(
        row("bbbbbb", {
          status: FlowRunStatus.Unknown,
          startedAt,
          closedAt: null,
        }),
        now,
      ),
    ).toBeNull();
  });
});

describe("countRunsByTab", () => {
  it("counts each status in its tab, and an unknown one in All only", () => {
    const rows = [
      row("000001", { status: FlowRunStatus.Running, closedAt: null }),
      row("000002", {
        status: FlowRunStatus.Running,
        closedAt: null,
        openInputRequests: [openInputRequest],
      }),
      row("000003", { status: FlowRunStatus.ContinuedAsNew }),
      row("000004", { status: FlowRunStatus.Completed }),
      row("000005", { status: FlowRunStatus.Failed }),
      row("000006", { status: FlowRunStatus.TimedOut }),
      row("000007", { status: FlowRunStatus.Cancelled }),
      row("000008", { status: FlowRunStatus.Terminated }),
      row("000009", { status: FlowRunStatus.Unknown }),
      row("000010", { status: FlowRunStatus.Unspecified }),
    ];

    expect(countRunsByTab(rows)).toEqual({
      all: 10,
      running: 3,
      completed: 1,
      failed: 4,
    });
  });
});

describe("filterRuns", () => {
  it("keeps runs that match every filter set", () => {
    const rows = [
      row("000001", { status: FlowRunStatus.Failed }),
      row("000002", {
        status: FlowRunStatus.Failed,
        flowScheduleId: "5c1e" as EntityUuid,
      }),
      row("000003", { status: FlowRunStatus.TimedOut }),
      row("000004", { status: FlowRunStatus.Completed }),
    ];

    expect(
      idsOf(
        filterRuns(rows, { states: ["failed", "timedOut"], trigger: "manual" }),
      ),
    ).toEqual(["000001", "000003"]);
    expect(idsOf(filterRuns(rows, { states: [], trigger: null }))).toEqual(
      idsOf(rows),
    );
  });
});

describe("sortRuns", () => {
  const early = row("000001", {
    startedAt: "2026-11-09T08:00:00Z",
    closedAt: "2026-11-09T11:00:00Z",
  });
  const running = row("000002", {
    status: FlowRunStatus.Running,
    startedAt: "2026-11-09T09:00:00Z",
    closedAt: null,
  });
  const late = row("000003", {
    status: FlowRunStatus.Failed,
    startedAt: "2026-11-09T10:00:00Z",
    closedAt: "2026-11-09T10:01:00Z",
  });
  const rows = [early, running, late];

  it("puts the newest run first by default", () => {
    expect(
      idsOf(sortRuns(rows, { key: "started", direction: "DESCENDING" }, now)),
    ).toEqual(["000003", "000002", "000001"]);
  });

  it("puts a run that hasn't ended after every run that has, oldest end first", () => {
    expect(
      idsOf(sortRuns(rows, { key: "ended", direction: "ASCENDING" }, now)),
    ).toEqual(["000003", "000001", "000002"]);
  });

  it("counts a running run's duration to now", () => {
    /* 3h, 3h for the running run, and 1m: the tie goes to the newer run. */
    expect(
      idsOf(sortRuns(rows, { key: "duration", direction: "DESCENDING" }, now)),
    ).toEqual(["000002", "000001", "000003"]);
  });

  it("puts failed runs first when sorting by status", () => {
    expect(
      idsOf(sortRuns(rows, { key: "status", direction: "ASCENDING" }, now)),
    ).toEqual(["000003", "000002", "000001"]);
  });
});
