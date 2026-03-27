import { describe, expect, it } from "vitest";

import {
  getIngestNavigationAction,
  getIngestPath,
  getIngestResetNavigationAction,
  getIngestResumeNavigationAction,
} from "./navigation";

describe("getIngestPath", () => {
  it("includes the runId query once a run has started", () => {
    expect(getIngestPath({ runId: "run-123" })).toBe("/ingest?runId=run-123");
  });

  it("returns the base ingest path when no runId exists", () => {
    expect(getIngestPath()).toBe("/ingest");
  });
});

describe("getIngestNavigationAction", () => {
  it("replaces the ingest URL with the started runId while streaming", () => {
    expect(
      getIngestNavigationAction({
        phase: "streaming",
        runStatus: {
          runId: "run-123",
          status: "running",
          phase: "upload",
        },
      }),
    ).toEqual({
      kind: "replace",
      path: "/ingest?runId=run-123",
    });
  });

  it("keeps terminal succeeded runs navigating to results", () => {
    expect(
      getIngestNavigationAction({
        phase: "done",
        runStatus: {
          runId: "run-456",
          status: "succeeded",
        },
      }),
    ).toEqual({
      kind: "push",
      path: "/ingest/results?runId=run-456",
    });
  });

  it("keeps failed runs on the ingest page", () => {
    expect(
      getIngestNavigationAction({
        phase: "done",
        runStatus: {
          runId: "run-789",
          status: "failed",
          error: "pipeline failed",
        },
      }),
    ).toBeNull();
  });
});

describe("getIngestResetNavigationAction", () => {
  it("clears a stale runId from the ingest URL when resetting a failed run", () => {
    expect(
      getIngestResetNavigationAction(
        {
          phase: "done",
          runStatus: {
            runId: "run-789",
            status: "failed",
            error: "pipeline failed",
          },
        },
        { runId: "run-789" },
      ),
    ).toEqual({
      kind: "replace",
      path: "/ingest",
    });
  });

  it("clears a stale runId from the ingest URL when resetting after an error", () => {
    expect(
      getIngestResetNavigationAction(
        {
          phase: "error",
          message: "Lost connection to progress stream",
        },
        { runId: "run-789" },
      ),
    ).toEqual({
      kind: "replace",
      path: "/ingest",
    });
  });

  it("does not affect succeeded runs", () => {
    expect(
      getIngestResetNavigationAction(
        {
          phase: "done",
          runStatus: {
            runId: "run-456",
            status: "succeeded",
          },
        },
        { runId: "run-456" },
      ),
    ).toBeNull();
  });
});

describe("getIngestResumeNavigationAction", () => {
  it("clears a stale runId from the ingest URL when resume discovers a missing run", () => {
    expect(
      getIngestResumeNavigationAction("cleared-missing-run", {
        runId: "missing-run",
      }),
    ).toEqual({
      kind: "replace",
      path: "/ingest",
    });
  });

  it("does not clear the URL for non-notfound resume failures", () => {
    expect(
      getIngestResumeNavigationAction("failed", {
        runId: "missing-run",
      }),
    ).toBeNull();
  });

  it("does not clear the URL for a superseded resume", () => {
    expect(
      getIngestResumeNavigationAction("superseded", {
        runId: "missing-run",
      }),
    ).toBeNull();
  });
});
