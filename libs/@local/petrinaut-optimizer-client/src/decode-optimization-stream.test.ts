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
    direction?: "maximize" | "minimize" | null;
    emitSyntheticStarted?: boolean;
    maxEventBytes?: number;
    onActivity?: () => void;
  } = {},
) => {
  const events = [];
  for await (const event of decodePetrinautOptimizerStream(stream, {
    // `null` requests attachment-style decoding without a direction.
    ...(options.direction === null
      ? {}
      : { direction: options.direction ?? "maximize" }),
    requestedTrials: 2,
    ...(options.emitSyntheticStarted === undefined
      ? {}
      : { emitSyntheticStarted: options.emitSyntheticStarted }),
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

  it("surfaces SSE frame ids as canonical sequence numbers", async () => {
    const events = await collect(
      streamChunks(
        'id: 1\ndata: {"step":0,"params":{"workers":2},"metric":10,"state":"COMPLETE"}\n\n',
        "id: 2\nevent: done\ndata: {}\n\n",
      ),
    );

    expect(events).toEqual([
      // The synthetic started event predates upstream bytes, so it has no seq.
      { type: "started", requestedTrials: 2 },
      {
        type: "trial",
        trial: 0,
        parameters: { workers: 2 },
        objective: 10,
        state: "complete",
        best: { trial: 0, parameters: { workers: 2 }, objective: 10 },
        seq: 1,
      },
      {
        type: "complete",
        requestedTrials: 2,
        completedTrials: 1,
        prunedTrials: 0,
        failedTrials: 0,
        best: { trial: 0, parameters: { workers: 2 }, objective: 10 },
        seq: 2,
      },
    ]);
  });

  it("rejects non-decimal SSE frame ids", async () => {
    await expect(
      collect(streamChunks("id: not-a-number\nevent: done\ndata: {}\n\n")),
    ).rejects.toThrow("invalid event id");
    // An explicit empty id line must not silently become NaN or 0.
    await expect(
      collect(streamChunks("id:\nevent: done\ndata: {}\n\n")),
    ).rejects.toThrow("invalid event id");
    // `Number()` would coerce exponent notation; the protocol never uses it.
    await expect(
      collect(streamChunks("id: 1e2\nevent: done\ndata: {}\n\n")),
    ).rejects.toThrow("invalid event id");
  });

  it("adapts a cancelled frame to a terminal cancellation error", async () => {
    const events = await collect(
      streamChunks(
        'id: 1\ndata: {"step":0,"params":{"workers":2},"metric":10,"state":"COMPLETE"}\n\n',
        "id: 2\nevent: cancelled\ndata: {}\n\n",
      ),
    );

    expect(events.at(-1)).toEqual({
      type: "error",
      code: "optimization_cancelled",
      message: "The optimization was cancelled",
      retryable: false,
      seq: 2,
    });
  });

  it("treats a cancelled frame as terminal", async () => {
    await expect(
      collect(
        streamChunks(
          "id: 1\nevent: cancelled\ndata: {}\n\n" +
            'id: 2\ndata: {"step":0,"params":{},"metric":1,"state":"COMPLETE"}\n\n',
        ),
      ),
    ).rejects.toThrow("after a terminal event");
  });

  it("decodes attachments without a synthetic started event or a best", async () => {
    const events = await collect(
      streamChunks(
        'id: 3\ndata: {"step":2,"params":{"rate":0.4},"metric":2,"state":"COMPLETE"}\n\n',
        "id: 4\nevent: done\ndata: {}\n\n",
      ),
      { direction: null, emitSyntheticStarted: false },
    );

    expect(events).toEqual([
      {
        type: "trial",
        trial: 2,
        parameters: { rate: 0.4 },
        objective: 2,
        state: "complete",
        // Without a direction, best-so-far aggregation is skipped: a replay
        // past a cursor cannot know the true running best, so the consumer's
        // retained best stays authoritative.
        best: null,
        seq: 3,
      },
      {
        type: "complete",
        requestedTrials: 2,
        completedTrials: 1,
        prunedTrials: 0,
        failedTrials: 0,
        best: null,
        seq: 4,
      },
    ]);
  });
});
