import { describe, expect, it } from "vitest";

import { getIngestNavigationAction, getIngestPath } from "./navigation";

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
