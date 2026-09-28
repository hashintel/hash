import { describe, expect, expectTypeOf, it } from "vitest";

import {
  consumeIngestRunEventStream,
  type DoneIngestRunState,
  getResumeAttemptDisposition,
  getResumeFailureResolution,
  getRunStatusFromStreamEvent,
  getStateForRunStatus,
  IngestRunStatusError,
  loadIngestRunStatus,
  loadResumeTargetForRun,
  parseSseFrameBuffer,
  recoverDoneStateFromStreamError,
  shouldFetchResults,
  type StreamingIngestRunState,
} from "./use-ingest-run";

const encoder = new TextEncoder();

const createSseStream = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

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

describe("ingest run state types", () => {
  it("narrows streaming state to active statuses only", () => {
    expectTypeOf<
      StreamingIngestRunState["runStatus"]["status"]
    >().toEqualTypeOf<"queued" | "running">();
  });

  it("narrows done state to terminal statuses only", () => {
    expectTypeOf<DoneIngestRunState["runStatus"]["status"]>().toEqualTypeOf<
      "succeeded" | "failed"
    >();
  });
});

describe("getRunStatusFromStreamEvent", () => {
  it("maps replayed non-terminal events into visible streaming progress", () => {
    expect(
      getRunStatusFromStreamEvent("run-queued", "phase-start", {
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

  it("maps default message events into visible streaming progress", () => {
    expect(
      getRunStatusFromStreamEvent("run-queued", "message", {
        status: "running",
        phase: "discovery",
        step: "entity-resolution",
      }),
    ).toMatchObject({
      runId: "run-queued",
      status: "running",
      phase: "discovery",
      step: "entity-resolution",
    });
  });

  it("maps default message terminal payloads into terminal run state", () => {
    const runStatus = getRunStatusFromStreamEvent("run-queued", "message", {
      status: "succeeded",
      phase: "results",
    });

    if (!runStatus) {
      throw new Error("Expected a terminal run status from the stream event");
    }

    expect(runStatus).toEqual(
      expect.objectContaining({
        runId: "run-queued",
        status: "succeeded",
        phase: "results",
      }),
    );
    const doneState = getStateForRunStatus(runStatus);
    expect(doneState.phase).toBe("done");
    expect(shouldFetchResults(doneState)).toBe(true);
    if (shouldFetchResults(doneState)) {
      expectTypeOf(doneState.runStatus.status).toEqualTypeOf<"succeeded">();
    }
  });

  it("ignores payloads for a different run when a payload runId is present", () => {
    expect(
      getRunStatusFromStreamEvent("run-queued", "message", {
        runId: "run-other",
        status: "running",
        phase: "discovery",
      }),
    ).toBeNull();
  });
});

describe("parseSseFrameBuffer", () => {
  it("parses arbitrary custom event names from raw SSE frames", () => {
    expect(
      parseSseFrameBuffer(
        'event: phase-progress\ndata: {"status":"running","phase":"discovery"}\n\n',
      ),
    ).toEqual({
      messages: [
        {
          event: "phase-progress",
          data: '{"status":"running","phase":"discovery"}',
        },
      ],
      remainder: "",
    });
  });
});

describe("consumeIngestRunEventStream", () => {
  it("updates progress from a valid payload delivered under an unknown event name", async () => {
    const runStatuses: unknown[] = [];

    await consumeIngestRunEventStream({
      runId: "run-123",
      stream: createSseStream(
        'event: phase-progress\ndata: {"status":"running","phase":"discovery","step":"entity-resolution"}\n\n',
      ),
      onRunStatus: (runStatus) => {
        runStatuses.push(runStatus);
      },
    });

    expect(runStatuses).toEqual([
      expect.objectContaining({
        runId: "run-123",
        status: "running",
        phase: "discovery",
        step: "entity-resolution",
      }),
    ]);
  });

  it("completes from a terminal payload delivered under an unknown event name", async () => {
    const runStatuses: unknown[] = [];

    await consumeIngestRunEventStream({
      runId: "run-999",
      stream: createSseStream(
        'event: phase-progress\ndata: {"status":"succeeded","phase":"results"}\n\n',
      ),
      onRunStatus: (runStatus) => {
        runStatuses.push(runStatus);
      },
    });

    expect(runStatuses).toEqual([
      expect.objectContaining({
        runId: "run-999",
        status: "succeeded",
        phase: "results",
      }),
    ]);
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

describe("getResumeAttemptDisposition", () => {
  it("treats a resume as superseded when a newer session generation has taken over", () => {
    expect(
      getResumeAttemptDisposition({
        expectedRunId: "run-123",
        currentResumingRunId: "run-123",
        expectedSessionGeneration: 1,
        currentSessionGeneration: 2,
      }),
    ).toBe("superseded");
  });

  it("treats a resume as superseded when the pending resume id has been cleared", () => {
    expect(
      getResumeAttemptDisposition({
        expectedRunId: "run-123",
        currentResumingRunId: null,
        expectedSessionGeneration: 1,
        currentSessionGeneration: 1,
      }),
    ).toBe("superseded");
  });

  it("keeps a resume current when its run and session generation still match", () => {
    expect(
      getResumeAttemptDisposition({
        expectedRunId: "run-123",
        currentResumingRunId: "run-123",
        expectedSessionGeneration: 2,
        currentSessionGeneration: 2,
      }),
    ).toBe("apply");
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
