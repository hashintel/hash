import { describe, expect, it } from "vitest";

import {
  getResumeFailureResolution,
  IngestRunStatusError,
  loadIngestRunStatus,
  loadResumeTargetForRun,
  recoverDoneStateFromStreamError,
  shouldFetchResults,
  statusFromEvent,
} from "./use-ingest-run";

describe("loadIngestRunStatus", () => {
  it("preserves a not-found status for missing runs", async () => {
    await expect(
      loadIngestRunStatus("missing-run", () =>
        Promise.resolve(new Response(null, { status: 404 })),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "IngestRunStatusError",
        status: 404,
      }),
    );
  });
});

describe("loadResumeTargetForRun", () => {
  it("restores queued or running runs into streaming state and resumes replay from the beginning", async () => {
    const restoredTarget = await loadResumeTargetForRun("run-queued", () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            runId: "run-queued",
            status: "queued",
            phase: "upload",
            step: "received",
          }),
        ),
      ),
    );

    expect(restoredTarget).toEqual({
      state: {
        phase: "streaming",
        runStatus: {
          runId: "run-queued",
          status: "queued",
          phase: "upload",
          step: "received",
        },
      },
      streamPath: "/api/ingest/run-queued/events?after=0",
    });
  });

  it("restores failed runs into done state without resuming replay", async () => {
    const restoredTarget = await loadResumeTargetForRun("run-failed", () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            runId: "run-failed",
            status: "failed",
            error: "pipeline failed",
          }),
        ),
      ),
    );

    expect(restoredTarget).toEqual({
      state: {
        phase: "done",
        runStatus: {
          runId: "run-failed",
          status: "failed",
          error: "pipeline failed",
        },
      },
      streamPath: null,
    });
  });
});

describe("statusFromEvent", () => {
  it("maps replayed non-terminal events into visible streaming progress", () => {
    expect(
      statusFromEvent("run-queued", "phase-start", {
        status: "running",
        phase: "discovery",
        step: "entity-resolution",
        counts: { pages: 3, chunks: 12 },
      }),
    ).toMatchObject({
      runId: "run-queued",
      status: "running",
      phase: "discovery",
      step: "entity-resolution",
      counts: { pages: 3, chunks: 12 },
    });
  });
});

describe("getResumeFailureResolution", () => {
  it("returns idle state and clears the runId for missing runs", () => {
    expect(
      getResumeFailureResolution(
        new IngestRunStatusError("Failed to load run status: 404", 404),
      ),
    ).toEqual({
      nextState: { phase: "idle" },
      clearRunId: true,
    });
  });

  it("keeps non-notfound failures visible to the user", () => {
    expect(
      getResumeFailureResolution(
        new IngestRunStatusError("Failed to load run status: 500", 500),
      ),
    ).toEqual({
      nextState: {
        phase: "error",
        message: "Failed to load run status: 500",
      },
      clearRunId: false,
    });
  });
});

describe("recoverDoneStateFromStreamError", () => {
  it("returns a done state for succeeded runs", async () => {
    const recoveredState = await recoverDoneStateFromStreamError(
      "run-123",
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              runId: "run-123",
              status: "succeeded",
              phase: "results",
            }),
          ),
        ),
    );

    if (!recoveredState) {
      throw new Error("Expected a done state for a succeeded run");
    }

    expect(recoveredState).toEqual({
      phase: "done",
      runStatus: {
        runId: "run-123",
        status: "succeeded",
        phase: "results",
      },
    });
    expect(shouldFetchResults(recoveredState)).toBe(true);
  });

  it("returns a done state for failed runs", async () => {
    const recoveredState = await recoverDoneStateFromStreamError(
      "run-456",
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              runId: "run-456",
              status: "failed",
              error: "pipeline failed",
            }),
          ),
        ),
    );

    if (!recoveredState) {
      throw new Error("Expected a done state for a failed run");
    }

    expect(recoveredState).toEqual({
      phase: "done",
      runStatus: {
        runId: "run-456",
        status: "failed",
        error: "pipeline failed",
      },
    });
    expect(shouldFetchResults(recoveredState)).toBe(false);
  });

  it("keeps streaming runs pending", async () => {
    const recoveredState = await recoverDoneStateFromStreamError(
      "run-789",
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              runId: "run-789",
              status: "running",
              phase: "discovery",
            }),
          ),
        ),
    );

    expect(recoveredState).toBeNull();
  });
});
