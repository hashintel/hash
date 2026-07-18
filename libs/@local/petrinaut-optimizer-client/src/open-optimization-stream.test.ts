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
          { headers: { "content-type": "text/event-stream" } },
        ),
      ),
    );

    const events = await openPetrinautOptimizationStream({
      endpoint: "http://petrinaut-opt.test/optimize/all",
      fetchImpl,
      input,
      onActivity,
      signal,
    });

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
