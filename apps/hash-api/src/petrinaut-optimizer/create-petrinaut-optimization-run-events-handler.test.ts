import { describe, expect, it } from "vitest";

import { createPetrinautOptimizationRunEventsHandler } from "./create-petrinaut-optimization-run-events-handler";
import { createOptimizationRunOwners } from "./shared/optimization-run-owners";
import {
  callOptimizationRunHandler,
  createRecordingLogger,
  unexpectedFetch,
} from "./shared/optimization-run-test-harness";

import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";

const createHandler = ({
  fetchImpl = unexpectedFetch,
  logger = createRecordingLogger().logger,
  origin = new URL("http://petrinaut-opt:4004"),
  runOwners = createOptimizationRunOwners(),
}: {
  fetchImpl?: PetrinautOptimizerFetch;
  logger?: ReturnType<typeof createRecordingLogger>["logger"];
  origin?: URL | null;
  runOwners?: ReturnType<typeof createOptimizationRunOwners>;
} = {}) =>
  createPetrinautOptimizationRunEventsHandler({
    fetchImpl,
    logger,
    origin,
    runOwners,
  });

/** Register run-1 as owned by the given account with two requested trials. */
const ownersWithRun = (accountId = "user-1") => {
  const runOwners = createOptimizationRunOwners();
  runOwners.register("run-1", { accountId, requestedTrials: 2 });
  return runOwners;
};

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

  it("answers 404 for a run NodeAPI does not know", async () => {
    const result = await callOptimizationRunHandler({
      handler: createHandler(),
      params: { runId: "run-unknown" },
    });

    expect(result).toMatchObject({
      body: { error: "Optimization run not found" },
      statusCode: 404,
    });
  });

  it("answers 404 rather than 403 for another account's run", async () => {
    const { entries, logger } = createRecordingLogger();
    const result = await callOptimizationRunHandler({
      handler: createHandler({ logger, runOwners: ownersWithRun("user-2") }),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Optimization run not found" },
      statusCode: 404,
    });
    expect(entries).toContainEqual({
      level: "warn",
      message: "Petrinaut optimization run attach rejected",
      metadata: {
        optimizationRunId: "run-1",
        reason: "not-owner",
        requestId: "request-id-1",
        userId: "user-1",
      },
    });
  });

  it("rejects an invalid replay cursor", async () => {
    const handler = createHandler({ runOwners: ownersWithRun() });

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

  it("replays sequenced events as NDJSON and releases terminal ownership", async () => {
    let upstreamRequest: { requestId: unknown; url: string } | undefined;
    const upstream = [
      'id: 3\ndata: {"step":1,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n',
      ": heartbeat\n\n",
      "id: 4\nevent: done\ndata: {}\n\n",
    ].join("");
    const { entries, logger } = createRecordingLogger();
    const runOwners = ownersWithRun();
    const handler = createHandler({
      fetchImpl: async (input, init) => {
        upstreamRequest = {
          requestId: new Headers(init?.headers).get("x-hash-request-id"),
          url: input.toString(),
        };
        return new Response(upstream, {
          headers: {
            "content-type": "text/event-stream",
            "x-optimization-run-id": "run-1",
          },
        });
      },
      logger,
      runOwners,
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

    // Forwarding the terminal event released the ownership entry, so a
    // subsequent attach answers 404 even though the optimizer could still
    // replay the finished log — the browser already holds every event.
    expect(runOwners.get("run-1")).toBeUndefined();
    const second = await callOptimizationRunHandler({
      handler,
      params: { runId: "run-1" },
    });
    expect(second.statusCode).toBe(404);

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
          headers: { "content-type": "text/event-stream" },
        });
      },
      runOwners: ownersWithRun(),
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

  it("forwards a cancelled run's terminal frame and releases ownership", async () => {
    const runOwners = ownersWithRun();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          new Response("id: 5\nevent: cancelled\ndata: {}\n\n", {
            headers: { "content-type": "text/event-stream" },
          }),
        runOwners,
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.output).toEqual([
      '{"type":"error","code":"optimization_cancelled","message":"The optimization was cancelled","retryable":false,"seq":5}\n',
    ]);
    expect(runOwners.get("run-1")).toBeUndefined();
  });

  it("drops the stale ownership entry when the optimizer forgot the run", async () => {
    const runOwners = ownersWithRun();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "optimization run not found: run-1" },
            { status: 404 },
          ),
        runOwners,
      }),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Optimization run not found" },
      statusCode: 404,
    });
    expect(runOwners.get("run-1")).toBeUndefined();
  });

  it("keeps ownership after a mid-stream failure so the browser can re-attach", async () => {
    const runOwners = ownersWithRun();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          // The stream ends without a terminal event (e.g. the attachment
          // was superseded or the optimizer restarted mid-flight).
          new Response(
            'id: 3\ndata: {"step":1,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          ),
        runOwners,
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(200);
    // A retryable NodeAPI-authored terminal line tells the browser the run
    // may still be live: re-attach using the last seen `seq` as the cursor.
    expect(result.output.at(-1)).toBe(
      '{"type":"error","code":"upstream_stream_error","message":"The optimizer stream ended unexpectedly","retryable":true}\n',
    );
    expect(runOwners.get("run-1")).toMatchObject({ accountId: "user-1" });
  });
});
