import { describe, expect, it, vi } from "vitest";

import {
  createPetrinautOptOptimization,
  decodePetrinautOptStream,
} from "./petrinaut-opt-optimization";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

const streamChunks = (...chunks: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const events = [];
  for await (const event of decodePetrinautOptStream(stream, {
    objective: { metricId: "profit", direction: "maximize" },
    study: { trials: 2, sampler: "tpe" },
  })) {
    events.push(event);
  }
  return events;
};

describe("decodePetrinautOptStream", () => {
  it("adapts chunked trials, heartbeats, and completion", async () => {
    const events = await collect(
      streamChunks(
        ': heartbeat\n\ndata: {"step":0,"params":{"workers":',
        '2},"metric":10,"state":"COMPLETE"}\n\n',
        'data: {"step":1,"params":{"workers":3},"metric":null,',
        '"state":"PRUNED"}\n\nevent: done\ndata: {}\n\n',
      ),
    );

    expect(events).toEqual([
      { type: "started", requestedTrials: 2 },
      {
        type: "trial",
        trial: 0,
        parameters: { workers: 2 },
        objective: 10,
        state: "complete",
        best: { trial: 0, parameters: { workers: 2 }, objective: 10 },
      },
      {
        type: "trial",
        trial: 1,
        parameters: { workers: 3 },
        objective: null,
        state: "pruned",
        best: { trial: 0, parameters: { workers: 2 }, objective: 10 },
      },
      {
        type: "complete",
        requestedTrials: 2,
        completedTrials: 1,
        prunedTrials: 1,
        failedTrials: 0,
        best: { trial: 0, parameters: { workers: 2 }, objective: 10 },
      },
    ]);
  });

  it("adapts terminal optimizer errors", async () => {
    const events = await collect(
      streamChunks('event: error\ndata: {"message":"study failed"}\n\n'),
    );

    expect(events).toEqual([
      { type: "started", requestedTrials: 2 },
      {
        type: "error",
        code: "optimization_failed",
        message: "study failed",
        retryable: false,
      },
    ]);
  });

  it("rejects a stream without a terminal event", async () => {
    await expect(
      collect(
        streamChunks(
          'data: {"step":0,"params":{},"metric":1,"state":"COMPLETE"}\n\n',
        ),
      ),
    ).rejects.toThrow("without returning a terminal event");
  });
});

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
