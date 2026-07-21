import { describe, expect, it, vi } from "vitest";

import { decodePetrinautOptimizerStream } from "./decode-optimization-stream.js";

/** Create a byte stream with caller-controlled SSE chunk boundaries. */
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

/** Collect every canonical event emitted for an upstream test stream. */
const collect = async (
  stream: ReadableStream<Uint8Array>,
  options: {
    direction?: "maximize" | "minimize";
    maxEventBytes?: number;
    onActivity?: () => void;
  } = {},
) => {
  const events = [];
  for await (const event of decodePetrinautOptimizerStream(stream, {
    direction: options.direction ?? "maximize",
    requestedTrials: 2,
    ...(options.maxEventBytes === undefined
      ? {}
      : { maxEventBytes: options.maxEventBytes }),
    ...(options.onActivity ? { onActivity: options.onActivity } : {}),
  })) {
    events.push(event);
  }
  return events;
};

describe("decodePetrinautOptimizerStream", () => {
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

  it("selects the lowest completed objective for minimization", async () => {
    const events = await collect(
      streamChunks(
        'data: {"step":0,"params":{"rate":0.8},"metric":4,"state":"COMPLETE"}\n\n',
        'data: {"step":1,"params":{"rate":0.4},"metric":2,"state":"COMPLETE"}\n\n',
        "event: done\ndata: {}\n\n",
      ),
      { direction: "minimize" },
    );

    expect(events.at(-1)).toEqual({
      type: "complete",
      requestedTrials: 2,
      completedTrials: 2,
      prunedTrials: 0,
      failedTrials: 0,
      best: { trial: 1, parameters: { rate: 0.4 }, objective: 2 },
    });
  });

  it("adapts named and state-based terminal optimizer errors", async () => {
    await expect(
      collect(
        streamChunks('event: error\ndata: {"message":"study failed"}\n\n'),
      ),
    ).resolves.toEqual([
      { type: "started", requestedTrials: 2 },
      {
        type: "error",
        code: "optimization_failed",
        message: "study failed",
        retryable: false,
      },
    ]);
    await expect(
      collect(
        streamChunks('data: {"state":"ERROR","message":"scenario failed"}\n\n'),
      ),
    ).resolves.toEqual([
      { type: "started", requestedTrials: 2 },
      {
        type: "error",
        code: "optimization_failed",
        message: "scenario failed",
        retryable: false,
      },
    ]);
  });

  it("reports every upstream chunk as activity, including heartbeats", async () => {
    const onActivity = vi.fn();

    await collect(
      streamChunks(": heartbeat\n\n", "event: done\ndata: {}\n\n"),
      { onActivity },
    );

    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid, oversized, unterminated, and post-terminal data", async () => {
    await expect(
      collect(
        streamChunks(
          'data: {"step":0,"params":{},"metric":1,"state":"UNKNOWN"}\n\n',
        ),
      ),
    ).rejects.toThrow("invalid trial state");
    await expect(
      collect(streamChunks('event: done\ndata: {"large":true}\n\n'), {
        maxEventBytes: 2,
      }),
    ).rejects.toThrow("oversized event");
    await expect(
      collect(
        streamChunks(
          'data: {"step":0,"params":{},"metric":1,"state":"COMPLETE"}\n\n',
        ),
      ),
    ).rejects.toThrow("without returning a terminal event");
    await expect(
      collect(
        streamChunks(
          "event: done\ndata: {}\n\n" +
            'data: {"step":0,"params":{},"metric":1,"state":"COMPLETE"}\n\n',
        ),
      ),
    ).rejects.toThrow("after a terminal event");
  });

  it("cancels upstream when its consumer stops after the started event", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const events = decodePetrinautOptimizerStream(stream, {
      direction: "maximize",
      requestedTrials: 1,
    })[Symbol.asyncIterator]();

    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "started", requestedTrials: 1 },
    });
    await events.return?.();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects an oversized event before it is terminated", async () => {
    await expect(
      collect(streamChunks(`data: ${"x".repeat(20)}`), { maxEventBytes: 8 }),
    ).rejects.toThrow("oversized event");
  });
});
