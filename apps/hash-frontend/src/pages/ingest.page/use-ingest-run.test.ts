import { describe, expect, it } from "vitest";

import {
  loadResumeTargetForRun,
  recoverDoneStateFromStreamError,
  shouldFetchResults,
} from "./use-ingest-run";

describe("loadResumeTargetForRun", () => {
  it("restores queued or running runs into streaming state and resumes the stream", async () => {
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
      shouldStartStream: true,
    });
  });

  it("restores failed runs into done state without resuming the stream", async () => {
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
      shouldStartStream: false,
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
