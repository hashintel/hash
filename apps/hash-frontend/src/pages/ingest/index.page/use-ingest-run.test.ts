import { afterEach, describe, expect, it, vi } from "vitest";

import { followRunEvents, getRunStatusFromStreamEvent } from "./use-ingest-run";

import type { RunStatus } from "../shared/types";

const encoder = new TextEncoder();

const sseResponse = (body: string) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

const followUntilTerminal = async (runId: string, path: string) => {
  const runStatuses: RunStatus[] = [];

  await followRunEvents({
    runId,
    path,
    signal: new AbortController().signal,
    onRunStatus: (runStatus) => {
      runStatuses.push(runStatus);
      return runStatus.status === "succeeded" || runStatus.status === "failed"
        ? "stop"
        : undefined;
    },
  });

  return runStatuses;
};

describe("getRunStatusFromStreamEvent", () => {
  it("maps progress payloads under any event name", () => {
    expect(
      getRunStatusFromStreamEvent("run-1", "phase-progress", {
        status: "running",
        phase: "discovery",
        step: "entity-resolution",
        counts: { pages: 3, chunks: 12 },
      }),
    ).toMatchObject({
      runId: "run-1",
      status: "running",
      phase: "discovery",
      step: "entity-resolution",
      counts: { pages: 3, chunks: 12 },
    });
  });

  it("reads the event kind from the payload of unnamed events", () => {
    expect(
      getRunStatusFromStreamEvent("run-1", undefined, {
        event: "run-failed",
        error: "pipeline failed",
      }),
    ).toMatchObject({ status: "failed", error: "pipeline failed" });
  });

  it("ignores payloads for a different run", () => {
    expect(
      getRunStatusFromStreamEvent("run-1", undefined, {
        runId: "run-2",
        status: "running",
      }),
    ).toBeNull();
  });
});

describe("followRunEvents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows progress to a terminal status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          sseResponse(
            'event: phase-progress\ndata: {"status":"running","phase":"discovery"}\n\n' +
              'event: phase-progress\ndata: {"status":"succeeded","phase":"results"}\n\n',
          ),
        ),
      ),
    );

    expect(await followUntilTerminal("run-1", "/events")).toEqual([
      expect.objectContaining({ status: "running", phase: "discovery" }),
      expect.objectContaining({ status: "succeeded", phase: "results" }),
    ]);
  });

  it("reconnects with Last-Event-ID when a connection drops mid-run", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        sseResponse('id: 7\ndata: {"status":"running","phase":"upload"}\n\n'),
      )
      .mockResolvedValueOnce(
        sseResponse('id: 8\ndata: {"event":"run-succeeded"}\n\n'),
      );
    vi.stubGlobal("fetch", fetchMock);

    expect(await followUntilTerminal("run-1", "/events?after=0")).toEqual([
      expect.objectContaining({ status: "running" }),
      expect.objectContaining({ status: "succeeded" }),
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/ingest/run-1/events",
      expect.objectContaining({
        headers: expect.objectContaining({ "Last-Event-ID": "7" }),
      }),
    );
  });

  it("fails when a connection closes without delivering events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(sseResponse(""))),
    );

    await expect(followUntilTerminal("run-1", "/events")).rejects.toThrow(
      "Lost connection to the progress stream",
    );
  });
});
