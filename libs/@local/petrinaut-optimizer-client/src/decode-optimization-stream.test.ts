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
    maxEventBytes?: number;
    onActivity?: () => void;
  } = {},
) => {
  const events = [];
  for await (const event of decodePetrinautOptimizerStream(stream, {
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
      {
        type: "trial",
        trial: 0,
        parameters: { workers: 2 },
        objective: 10,
        state: "complete",
        // A consumer may attach past a cursor and so never observe the whole
        // study; it retains its own running best, and the decoder never
        // aggregates one.
        best: null,
      },
      {
        type: "trial",
        trial: 1,
        parameters: { workers: 3 },
        objective: null,
        state: "pruned",
        best: null,
      },
      {
        type: "complete",
        requestedTrials: 2,
        completedTrials: 1,
        prunedTrials: 1,
        failedTrials: 0,
        best: null,
      },
    ]);
  });

  it("adapts named and state-based terminal optimizer errors", async () => {
    await expect(
      collect(
        streamChunks('event: error\ndata: {"message":"study failed"}\n\n'),
      ),
    ).resolves.toEqual([
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

  it("cancels upstream when its consumer stops mid-stream", async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"step":0,"params":{},"metric":1,"state":"COMPLETE"}\n\n',
          ),
        );
        // Deliberately left open: the consumer walks away mid-stream.
      },
      cancel,
    });
    const events = decodePetrinautOptimizerStream(stream, {
      requestedTrials: 1,
    })[Symbol.asyncIterator]();

    await expect(events.next()).resolves.toMatchObject({
      done: false,
      value: { type: "trial", trial: 0 },
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
      {
        type: "trial",
        trial: 0,
        parameters: { workers: 2 },
        objective: 10,
        state: "complete",
        best: null,
        seq: 1,
      },
      {
        type: "complete",
        requestedTrials: 2,
        completedTrials: 1,
        prunedTrials: 0,
        failedTrials: 0,
        best: null,
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

  it("adapts a superseded frame to a terminal, non-retryable attachment error", async () => {
    const events = await collect(
      streamChunks("event: superseded\ndata: {}\n\n"),
    );

    expect(events).toEqual([
      {
        type: "error",
        code: "attachment_superseded",
        message: "Another consumer attached to this optimization run",
        retryable: false,
      },
    ]);
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
});
