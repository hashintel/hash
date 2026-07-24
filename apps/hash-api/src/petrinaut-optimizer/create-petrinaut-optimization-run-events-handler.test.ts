import { describe, expect, it } from "vitest";

import { createPetrinautOptimizationRunEventsHandler } from "./create-petrinaut-optimization-run-events-handler";
import {
  callOptimizationRunHandler,
  createRecordingLogger,
  unexpectedFetch,
} from "./shared/optimization-run-test-harness";

import type { FakeResponse } from "./shared/optimization-run-test-harness";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";

const createHandler = ({
  fetchImpl = unexpectedFetch,
  logger = createRecordingLogger().logger,
  origin = new URL("http://petrinaut-opt:4004"),
}: {
  fetchImpl?: PetrinautOptimizerFetch;
  logger?: ReturnType<typeof createRecordingLogger>["logger"];
  origin?: URL | null;
} = {}) =>
  createPetrinautOptimizationRunEventsHandler({
    fetchImpl,
    logger,
    origin,
  });

describe("createPetrinautOptimizationRunEventsHandler", () => {
  it("requires authentication", async () => {
    const result = await callOptimizationRunHandler({
      authenticated: false,
      handler: createHandler(),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Authentication required" },
      statusCode: 401,
    });
  });

  it("rejects an invalid replay cursor", async () => {
    const handler = createHandler();

    for (const cursor of ["-1", "abc", "1.5", ["1", "2"]]) {
      const result = await callOptimizationRunHandler({
        handler,
        params: { runId: "run-1" },
        query: { cursor },
      });
      expect(result).toMatchObject({
        body: { error: "Invalid optimization cursor" },
        statusCode: 400,
      });
    }
  });

  it("replays sequenced events as NDJSON with the account tag forwarded", async () => {
    let upstreamRequest:
      | { accountId: unknown; requestId: unknown; url: string }
      | undefined;
    const upstream = [
      'id: 3\ndata: {"step":1,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n',
      ": heartbeat\n\n",
      "id: 4\nevent: done\ndata: {}\n\n",
    ].join("");
    const { entries, logger } = createRecordingLogger();
    const handler = createHandler({
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        upstreamRequest = {
          accountId: headers.get("x-hash-account-id"),
          requestId: headers.get("x-hash-request-id"),
          url: input.toString(),
        };
        return new Response(upstream, {
          headers: {
            "content-type": "text/event-stream",
            "x-optimization-run-id": "run-1",
            "x-requested-trials": "2",
          },
        });
      },
      logger,
    });

    const result = await callOptimizationRunHandler({
      handler,
      params: { runId: "run-1" },
      query: { cursor: "2" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Optimization-Run-ID": "run-1",
    });
    // No synthetic started event, upstream sequence numbers visible as
    // `seq`, and `best` stays null: the browser retains its own best.
    expect(result.output).toEqual([
      '{"type":"trial","trial":1,"parameters":{"rate":0.8},"objective":4,"state":"complete","best":null,"seq":3}\n',
      '{"type":"complete","requestedTrials":2,"completedTrials":1,"prunedTrials":0,"failedTrials":0,"best":null,"seq":4}\n',
    ]);
    expect(upstreamRequest?.url).toBe(
      "http://petrinaut-opt:4004/optimize/runs/run-1/events?cursor=2",
    );
    expect(upstreamRequest?.requestId).toBe("request-id-1");
    expect(upstreamRequest?.accountId).toBe("user-1");

    // The attachment lifecycle is logged with its correlation identifiers.
    expect(entries).toContainEqual({
      level: "info",
      message: "Petrinaut optimization run attachment finished",
      metadata: {
        durationMs: expect.any(Number),
        optimizationRunId: "run-1",
        outcome: "completed",
        requestId: "request-id-1",
        userId: "user-1",
      },
    });
  });

  it("defaults to a full replay when no cursor is supplied", async () => {
    let upstreamUrl: string | undefined;
    const handler = createHandler({
      fetchImpl: async (input) => {
        upstreamUrl = input.toString();
        return new Response("id: 1\nevent: done\ndata: {}\n\n", {
          headers: {
            "content-type": "text/event-stream",
            "x-requested-trials": "2",
          },
        });
      },
    });

    const result = await callOptimizationRunHandler({
      handler,
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(200);
    expect(upstreamUrl).toBe(
      "http://petrinaut-opt:4004/optimize/runs/run-1/events?cursor=0",
    );
  });

  it("forwards a cancelled run's terminal frame", async () => {
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          new Response("id: 5\nevent: cancelled\ndata: {}\n\n", {
            headers: { "content-type": "text/event-stream" },
          }),
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.output).toEqual([
      '{"type":"error","code":"optimization_cancelled","message":"The optimization was cancelled","retryable":false,"seq":5}\n',
    ]);
  });

  it("forwards a superseded attachment's terminal event", async () => {
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          new Response("event: superseded\ndata: {}\n\n", {
            headers: { "content-type": "text/event-stream" },
          }),
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.output).toEqual([
      '{"type":"error","code":"attachment_superseded","message":"Another consumer attached to this optimization run","retryable":false}\n',
    ]);
  });

  it("passes through the optimizer's 404 for unknown or foreign runs", async () => {
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "optimization run not found: run-1" },
            { status: 404 },
          ),
      }),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Optimization run not found" },
      statusCode: 404,
    });
  });

  it("commits the terminal write even when the client vanishes mid-drain", async () => {
    const terminalLine =
      '{"type":"complete","requestedTrials":2,"completedTrials":0,"prunedTrials":0,"failedTrials":0,"best":null,"seq":4}\n';
    const handler = createHandler({
      fetchImpl: async () =>
        new Response("id: 4\nevent: done\ndata: {}\n\n", {
          headers: {
            "content-type": "text/event-stream",
            "x-requested-trials": "2",
          },
        }),
    });

    let activeResponse: FakeResponse | undefined;
    const first = await callOptimizationRunHandler({
      handler,
      params: { runId: "run-1" },
      onResponse: (response) => {
        activeResponse = response;
      },
      writeReturns: (value) => {
        if (value.includes('"type":"complete"')) {
          // The terminal write is committed to the buffer, but the client
          // disconnects before it ever drains.
          setImmediate(() => {
            activeResponse!.destroyed = true;
            activeResponse!.emit("close");
          });
          return false;
        }
        return true;
      },
    });

    // The terminal line was committed exactly once — the failure path must
    // not append a second terminal event after the client vanished.
    expect(first.output).toEqual([terminalLine]);

    // A later attachment simply replays from the optimizer's retained log.
    const second = await callOptimizationRunHandler({
      handler,
      params: { runId: "run-1" },
    });
    expect(second.statusCode).toBe(200);
    expect(second.output).toEqual([terminalLine]);
  });

  it("writes a retryable terminal line after a mid-stream failure", async () => {
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          // The stream ends without a terminal event (e.g. the attachment
          // was superseded or the optimizer restarted mid-flight).
          new Response(
            'id: 3\ndata: {"step":1,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          ),
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(200);
    // A retryable NodeAPI-authored terminal line tells the browser the run
    // may still be live: re-attach using the last seen `seq` as the cursor.
    expect(result.output.at(-1)).toBe(
      '{"type":"error","code":"upstream_stream_error","message":"The optimizer stream ended unexpectedly","retryable":true}\n',
    );
  });
});
