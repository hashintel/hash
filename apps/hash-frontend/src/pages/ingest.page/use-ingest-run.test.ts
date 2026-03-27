import { describe, expect, it } from "vitest";

import {
  recoverDoneStateFromStreamError,
  shouldFetchResults,
} from "./use-ingest-run";

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
