import { describe, expect, it } from "vitest";

import { getIngestPageNavigationAction, getIngestPath } from "./navigation";

describe("getIngestPath", () => {
  it("includes the runId query once a run has started", () => {
    expect(getIngestPath({ runId: "run-123" })).toBe("/ingest?runId=run-123");
  });

  it("returns the base ingest path when no runId exists", () => {
    expect(getIngestPath()).toBe("/ingest");
  });
});

describe("getIngestPageNavigationAction", () => {
  it("replaces the ingest URL with the started runId while streaming", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "state",
        currentRunId: undefined,
        state: {
          phase: "streaming",
          runStatus: {
            runId: "run-123",
            status: "running",
            phase: "upload",
          },
        },
      }),
    ).toEqual({
      kind: "replace",
      path: "/ingest?runId=run-123",
    });
  });

  it("does not replace the URL when the current runId already matches the streaming run", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "state",
        currentRunId: "run-123",
        state: {
          phase: "streaming",
          runStatus: {
            runId: "run-123",
            status: "running",
            phase: "upload",
          },
        },
      }),
    ).toBeNull();
  });

  it("keeps terminal succeeded runs navigating to results", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "state",
        currentRunId: "run-456",
        state: {
          phase: "done",
          runStatus: {
            runId: "run-456",
            status: "succeeded",
          },
        },
      }),
    ).toEqual({
      kind: "push",
      path: "/ingest/results?runId=run-456",
    });
  });

  it("keeps failed runs on the ingest page", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "state",
        currentRunId: "run-789",
        state: {
          phase: "done",
          runStatus: {
            runId: "run-789",
            status: "failed",
            error: "pipeline failed",
          },
        },
      }),
    ).toBeNull();
  });

  it("clears a stale runId from the ingest URL when resetting a failed run", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "reset",
        currentRunId: "run-789",
        state: {
          phase: "done",
          runStatus: {
            runId: "run-789",
            status: "failed",
            error: "pipeline failed",
          },
        },
      }),
    ).toEqual({
      kind: "replace",
      path: "/ingest",
    });
  });

  it("clears a stale runId from the ingest URL when resetting after an error", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "reset",
        currentRunId: "run-789",
        state: {
          phase: "error",
          message: "Lost connection to progress stream",
        },
      }),
    ).toEqual({
      kind: "replace",
      path: "/ingest",
    });
  });

  it("does not affect succeeded runs", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "reset",
        currentRunId: "run-456",
        state: {
          phase: "done",
          runStatus: {
            runId: "run-456",
            status: "succeeded",
          },
        },
      }),
    ).toBeNull();
  });

  it("clears a stale runId from the ingest URL when resume discovers a missing run", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "resume",
        currentRunId: "missing-run",
        resumeOutcome: "cleared-missing-run",
      }),
    ).toEqual({
      kind: "replace",
      path: "/ingest",
    });
  });

  it("does not clear the URL for non-notfound resume failures", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "resume",
        currentRunId: "missing-run",
        resumeOutcome: "failed",
      }),
    ).toBeNull();
  });

  it("does not clear the URL for a superseded resume", () => {
    expect(
      getIngestPageNavigationAction({
        kind: "resume",
        currentRunId: "missing-run",
        resumeOutcome: "superseded",
      }),
    ).toBeNull();
  });
});
