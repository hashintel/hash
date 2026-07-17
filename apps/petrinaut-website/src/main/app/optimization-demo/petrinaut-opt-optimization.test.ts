import { describe, expect, it, vi } from "vitest";

import { createPetrinautOptOptimization } from "./petrinaut-opt-optimization";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

/** Create an upstream byte stream from complete SSE chunks. */
const streamChunks = (...chunks: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    /** Enqueue the requested chunks and close the synthetic stream. */
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

describe("createPetrinautOptOptimization", () => {
  it("posts the manifest through the development proxy", async () => {
    const input = {
      objective: { direction: "maximize" },
      study: { trials: 2 },
    } as PetrinautOptimizationInput;
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(streamChunks("event: done\ndata: {}\n\n"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    const optimization = createPetrinautOptOptimization(fetchImpl);

    const events = [];
    for await (const event of optimization.optimize(input, { signal })) {
      events.push(event);
    }

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/petrinaut-opt/optimize/all",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        signal,
      }),
    );
    expect(events).toEqual([
      { type: "started", requestedTrials: 2 },
      {
        type: "complete",
        requestedTrials: 2,
        completedTrials: 0,
        prunedTrials: 0,
        failedTrials: 0,
        best: null,
      },
    ]);
  });
});
