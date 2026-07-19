import { describe, expect, it, vi } from "vitest";

import {
  openPetrinautOptimizationStream,
  PetrinautOptimizerHttpError,
} from "./open-optimization-stream.js";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

const input = {
  objective: { direction: "maximize" },
  study: { trials: 2 },
} as PetrinautOptimizationInput;

/** Collect every event returned by one opened optimization stream. */
const collect = async (events: AsyncIterable<unknown>): Promise<unknown[]> => {
  const collected = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
};

describe("openPetrinautOptimizationStream", () => {
  it("posts the manifest and returns canonical optimization events", async () => {
    const onActivity = vi.fn();
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(
          'data: {"step":0,"params":{"rate":0.4},"metric":2,"state":"COMPLETE"}\n\n' +
            "event: done\ndata: {}\n\n",
          {
            headers: {
              "content-type": "text/event-stream",
              "x-optimization-run-id": "run-42",
            },
          },
        ),
      ),
    );

    const { events, optimizationRunId } = await openPetrinautOptimizationStream(
      {
        endpoint: "http://petrinaut-opt.test/optimize/all",
        fetchImpl,
        input,
        onActivity,
        signal,
      },
    );

    expect(optimizationRunId).toBe("run-42");
    await expect(collect(events)).resolves.toEqual([
      { type: "started", requestedTrials: 2 },
      {
        type: "trial",
        trial: 0,
        parameters: { rate: 0.4 },
        objective: 2,
        state: "complete",
        best: { trial: 0, parameters: { rate: 0.4 }, objective: 2 },
      },
      {
        type: "complete",
        requestedTrials: 2,
        completedTrials: 1,
        prunedTrials: 0,
        failedTrials: 0,
        best: { trial: 0, parameters: { rate: 0.4 }, objective: 2 },
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://petrinaut-opt.test/optimize/all",
      {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
        signal,
      },
    );
    expect(onActivity).toHaveBeenCalledOnce();
  });

  it("forwards the request id header and reads the missing run id as null", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response("event: done\ndata: {}\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    const { events, optimizationRunId } = await openPetrinautOptimizationStream(
      {
        endpoint: "http://petrinaut-opt.test/optimize/all",
        fetchImpl,
        input,
        requestId: "request-123",
      },
    );
    await collect(events);

    expect(optimizationRunId).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://petrinaut-opt.test/optimize/all",
      expect.objectContaining({
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
          "x-hash-request-id": "request-123",
        },
      }),
    );
  });

  it("surfaces a FastAPI error message", async () => {
    const result = openPetrinautOptimizationStream({
      endpoint: "/optimize/all",
      fetchImpl: async () =>
        Response.json(
          { detail: "Invalid optimization manifest" },
          { status: 422, headers: { "retry-after": "5" } },
        ),
      input,
    });

    await expect(result).rejects.toBeInstanceOf(PetrinautOptimizerHttpError);
    await expect(result).rejects.toMatchObject({
      message: "Invalid optimization manifest",
      retryAfter: "5",
      status: 422,
    });
  });

  it("captures the run id from a failed optimizer response", async () => {
    const result = openPetrinautOptimizationStream({
      endpoint: "/optimize/all",
      fetchImpl: async () =>
        Response.json(
          { detail: "failed to initialise optimization" },
          { status: 500, headers: { "x-optimization-run-id": "run-err-7" } },
        ),
      input,
    });

    await expect(result).rejects.toMatchObject({
      optimizationRunId: "run-err-7",
      status: 500,
    });
  });

  it("preserves the busy status and Retry-After of an optimizer 429", async () => {
    const result = openPetrinautOptimizationStream({
      endpoint: "/optimize/all",
      fetchImpl: async () =>
        Response.json(
          {
            detail:
              "The optimizer is already running its maximum number of studies",
          },
          { status: 429, headers: { "retry-after": "30" } },
        ),
      input,
    });

    await expect(result).rejects.toBeInstanceOf(PetrinautOptimizerHttpError);
    await expect(result).rejects.toMatchObject({
      message: "The optimizer is already running its maximum number of studies",
      retryAfter: "30",
      status: 429,
    });
  });

  it("reports a null Retry-After when the optimizer 429 omits the header", async () => {
    const result = openPetrinautOptimizationStream({
      endpoint: "/optimize/all",
      fetchImpl: async () => Response.json({ detail: "busy" }, { status: 429 }),
      input,
    });

    await expect(result).rejects.toMatchObject({
      retryAfter: null,
      status: 429,
    });
  });

  it("falls back to the upstream status for an unstructured error", async () => {
    await expect(
      openPetrinautOptimizationStream({
        endpoint: "/optimize/all",
        fetchImpl: async () => new Response("failure", { status: 500 }),
        input,
      }),
    ).rejects.toThrow("Petrinaut optimizer returned status 500");
  });

  it("rejects a successful response without a body", async () => {
    await expect(
      openPetrinautOptimizationStream({
        endpoint: "/optimize/all",
        fetchImpl: async () => new Response(null, { status: 200 }),
        input,
      }),
    ).rejects.toThrow("Petrinaut optimizer returned an empty response");
  });
});
