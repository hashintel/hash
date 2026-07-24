import { describe, expect, it, vi } from "vitest";

import { attachPetrinautOptimizationRunStream } from "./attach-optimization-run.js";
import { PetrinautOptimizerHttpError } from "./optimizer-http.js";

/** Collect every event returned by one attached optimization stream. */
const collect = async (events: AsyncIterable<unknown>): Promise<unknown[]> => {
  const collected = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
};

describe("attachPetrinautOptimizationRunStream", () => {
  it("attaches with a cursor and returns sequenced canonical events", async () => {
    const onActivity = vi.fn();
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(
          'id: 3\ndata: {"step":2,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n' +
            "id: 4\nevent: done\ndata: {}\n\n",
          {
            headers: {
              "content-type": "text/event-stream",
              "x-optimization-run-id": "run-42",
              "x-requested-trials": "3",
            },
          },
        ),
      ),
    );

    const { events, optimizationRunId } =
      await attachPetrinautOptimizationRunStream({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        cursor: 2,
        fetchImpl,
        onActivity,
        requestId: "request-123",
        signal,
      });

    expect(optimizationRunId).toBe("run-42");
    // No synthetic started event: the run started before this attachment,
    // and `best` stays null because no direction was supplied.
    await expect(collect(events)).resolves.toEqual([
      {
        type: "trial",
        trial: 2,
        parameters: { rate: 0.4 },
        objective: 2,
        state: "complete",
        best: null,
        seq: 3,
      },
      {
        type: "complete",
        requestedTrials: 3,
        completedTrials: 1,
        prunedTrials: 0,
        failedTrials: 0,
        best: null,
        seq: 4,
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/optimize/runs/run-42/events?cursor=2"),
      {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          "x-hash-request-id": "request-123",
        },
        signal,
      },
    );
    expect(onActivity).toHaveBeenCalledOnce();
  });

  it("omits the cursor parameter for a full replay", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response("id: 1\nevent: done\ndata: {}\n\n", {
          headers: {
            "content-type": "text/event-stream",
            "x-requested-trials": "3",
          },
        }),
      ),
    );

    const { events } = await attachPetrinautOptimizationRunStream({
      endpoint: "http://petrinaut-opt.test",
      runId: "run-42",
      fetchImpl,
    });
    await collect(events);

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/optimize/runs/run-42/events"),
      expect.anything(),
    );
  });

  it("aggregates a best-so-far when a direction is supplied", async () => {
    const { events } = await attachPetrinautOptimizationRunStream({
      endpoint: "http://petrinaut-opt.test",
      runId: "run-42",
      direction: "minimize",
      fetchImpl: async () =>
        new Response(
          'id: 1\ndata: {"step":0,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n' +
            'id: 2\ndata: {"step":1,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n' +
            "id: 3\nevent: done\ndata: {}\n\n",
          {
            headers: {
              "content-type": "text/event-stream",
              "x-requested-trials": "3",
            },
          },
        ),
    });

    const collected = await collect(events);
    expect(collected.at(-1)).toEqual({
      type: "complete",
      requestedTrials: 3,
      completedTrials: 2,
      prunedTrials: 0,
      failedTrials: 0,
      best: { trial: 1, parameters: { rate: 0.4 }, objective: 2 },
      seq: 3,
    });
  });

  it("adapts a cancelled run's terminal frame", async () => {
    const { events } = await attachPetrinautOptimizationRunStream({
      endpoint: "http://petrinaut-opt.test",
      runId: "run-42",
      fetchImpl: async () =>
        new Response("id: 1\nevent: cancelled\ndata: {}\n\n", {
          headers: {
            "content-type": "text/event-stream",
            "x-requested-trials": "3",
          },
        }),
    });

    await expect(collect(events)).resolves.toEqual([
      {
        type: "error",
        code: "optimization_cancelled",
        message: "The optimization was cancelled",
        retryable: false,
        seq: 1,
      },
    ]);
  });

  it("escapes the run id in the events URL", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response("id: 1\nevent: done\ndata: {}\n\n", {
          headers: {
            "content-type": "text/event-stream",
            "x-requested-trials": "3",
          },
        }),
      ),
    );

    const { events } = await attachPetrinautOptimizationRunStream({
      endpoint: "http://petrinaut-opt.test",
      runId: "run/../42",
      fetchImpl,
    });
    await collect(events);

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/optimize/runs/run%2F..%2F42/events"),
      expect.anything(),
    );
  });

  it("surfaces an unknown or expired run as an HTTP error", async () => {
    const result = attachPetrinautOptimizationRunStream({
      endpoint: "http://petrinaut-opt.test",
      runId: "run-unknown",
      fetchImpl: async () =>
        Response.json(
          { detail: "optimization run not found: run-unknown" },
          { status: 404 },
        ),
    });

    await expect(result).rejects.toBeInstanceOf(PetrinautOptimizerHttpError);
    await expect(result).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a successful response without a body", async () => {
    await expect(
      attachPetrinautOptimizationRunStream({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        fetchImpl: async () => new Response(null, { status: 200 }),
      }),
    ).rejects.toThrow("Petrinaut optimizer returned an empty response");
  });
});
