import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createPetrinautOptimizationHandler } from "./create-petrinaut-optimization-handler";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { Request, Response as ExpressResponse } from "express";

const validOptimizationInput = {
  kind: "petrinaut-optimization",
  version: 1,
  name: "Optimize rate",
  model: {
    title: "Example",
    definition: {
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      subnets: [],
      componentInstances: [],
      scenarios: [
        {
          id: "baseline",
          name: "Baseline",
          scenarioParameters: [
            { identifier: "rate", type: "real", default: 0.5 },
          ],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        },
      ],
      metrics: [{ id: "profit", name: "Profit", code: "return 1;" }],
    },
  },
  scenario: {
    id: "baseline",
    parameterBindings: {
      rate: {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: 0.1,
          maximum: 1,
          scale: "linear",
        },
      },
    },
  },
  objective: { metricId: "profit", direction: "maximize" },
  execution: { seed: 42, dt: 0.1, maxTime: 10 },
  study: { trials: 2, sampler: "tpe" },
};

const logger = { warn: () => undefined } as unknown as Pick<Logger, "warn">;
const unexpectedFetch = async (): Promise<Response> => {
  throw new Error("Unexpected upstream request");
};

/** Mutable fake Express response the backpressure tests can drive. */
type FakeResponse = EventEmitter & ExpressResponse & { destroyed: boolean };

const callHandler = async ({
  authenticated = true,
  body,
  fetchImpl = unexpectedFetch,
  handler,
  onRequest,
  onResponse,
  writeReturns,
}: {
  authenticated?: boolean;
  body: unknown;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** Reuse one handler across calls to observe its slot bookkeeping. */
  handler?: ReturnType<typeof createPetrinautOptimizationHandler>;
  onRequest?: (request: EventEmitter) => void;
  onResponse?: (response: FakeResponse) => void;
  /** Decide each write's backpressure result; defaults to no backpressure. */
  writeReturns?: (value: string) => boolean;
}) => {
  let statusCode = 200;
  let bodyResult: unknown;
  const headers: Record<string, string> = {};
  const output: string[] = [];
  let headersSent = false;
  let writableEnded = false;
  let writableNeedDrain = false;
  const responseEmitter = new EventEmitter();
  // `Object.assign` would copy getter *values*, freezing them at `false`.
  Object.defineProperties(responseEmitter, {
    headersSent: { get: () => headersSent },
    writableEnded: { get: () => writableEnded },
    writableNeedDrain: { get: () => writableNeedDrain },
  });
  // Clear the drain flag without registering a listener, so the tests can
  // assert that the handler leaves no listeners of its own behind.
  const originalEmit = responseEmitter.emit.bind(responseEmitter);
  responseEmitter.emit = (eventName: string | symbol, ...args: unknown[]) => {
    if (eventName === "drain") {
      writableNeedDrain = false;
    }
    return originalEmit(eventName, ...args);
  };
  const response = Object.assign(responseEmitter, {
    destroyed: false,
    end: () => {
      writableEnded = true;
    },
    flushHeaders: () => {
      headersSent = true;
    },
    json: (value: unknown) => {
      bodyResult = value;
      headersSent = true;
      writableEnded = true;
      return response;
    },
    set: (value: Record<string, string>) => {
      Object.assign(headers, value);
      return response;
    },
    status: (value: number) => {
      statusCode = value;
      return response;
    },
    write: (value: string) => {
      headersSent = true;
      output.push(value);
      const flushed = writeReturns?.(value) ?? true;
      if (!flushed) {
        writableNeedDrain = true;
      }
      return flushed;
    },
  }) as unknown as FakeResponse;
  const request = Object.assign(new EventEmitter(), {
    body,
    user: authenticated
      ? ({ accountId: "user-1" } as NonNullable<Request["user"]>)
      : undefined,
  }) as unknown as Request;
  const activeHandler =
    handler ??
    createPetrinautOptimizationHandler({
      fetchImpl,
      logger,
      origin: new URL("http://petrinaut-opt:4004"),
    });

  const handlerPromise = activeHandler(request, response, () => undefined);
  onRequest?.(request);
  onResponse?.(response);
  await handlerPromise;

  return { body: bodyResult, headers, output, response, statusCode };
};

describe("createPetrinautOptimizationHandler", () => {
  it("requires authentication", async () => {
    const result = await callHandler({ authenticated: false, body: {} });

    expect(result).toMatchObject({
      body: { error: "Authentication required" },
      statusCode: 401,
    });
  });

  it("validates the public optimization request", async () => {
    const result = await callHandler({
      body: {
        ...validOptimizationInput,
        scenario: {
          ...validOptimizationInput.scenario,
          parameterBindings: {
            rate: {
              kind: "optimize",
              domain: {
                kind: "continuous",
                minimum: 0.1,
                maximum: 1,
                scale: "sqrt",
              },
            },
          },
        },
      },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({
      code: "invalid_optimization_request",
      details: {
        issues: [
          {
            message: expect.any(String),
            path: "scenario.parameterBindings.rate.domain.scale",
          },
        ],
        truncated: false,
      },
      error: "Invalid optimization request",
    });
  });

  it("preserves an upstream optimizer busy response", async () => {
    const result = await callHandler({
      body: validOptimizationInput,
      fetchImpl: async () =>
        Response.json(
          { detail: "The optimizer is busy" },
          { status: 429, headers: { "retry-after": "10" } },
        ),
    });

    expect(result).toMatchObject({
      body: { error: "Petrinaut optimizer is busy" },
      headers: { "Retry-After": "10" },
      statusCode: 429,
    });
  });

  it("keeps a quiet downstream optimization stream alive", async () => {
    vi.useFakeTimers();
    let activeRequest: EventEmitter | undefined;

    try {
      const resultPromise = callHandler({
        body: validOptimizationInput,
        fetchImpl: async (_input, init) =>
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener(
                  "abort",
                  () =>
                    controller.error(new DOMException("Aborted", "AbortError")),
                  { once: true },
                );
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
        onRequest: (request) => {
          activeRequest = request;
        },
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(25_000);
      activeRequest?.emit("aborted");

      const result = await resultPromise;
      expect(result.output).toContain("\n");
    } finally {
      vi.useRealTimers();
    }
  });

  it("proxies optimizer SSE as canonical NDJSON", async () => {
    let upstreamRequest: { body: string | undefined; url: string } | undefined;
    const upstream = [
      'data: {"step":0,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n',
      ": heartbeat\n\n",
      'data: {"step":1,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n',
      "event: done\ndata: {}\n\n",
    ].join("");

    const result = await callHandler({
      body: validOptimizationInput,
      fetchImpl: async (input, init) => {
        upstreamRequest = {
          body: typeof init?.body === "string" ? init.body : undefined,
          url: input.toString(),
        };
        return new Response(upstream, {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    expect(result.output).toEqual([
      '{"type":"started","requestedTrials":2}\n',
      '{"type":"trial","trial":0,"parameters":{"rate":0.4},"objective":2,"state":"complete","best":{"trial":0,"parameters":{"rate":0.4},"objective":2}}\n',
      '{"type":"trial","trial":1,"parameters":{"rate":0.8},"objective":4,"state":"complete","best":{"trial":1,"parameters":{"rate":0.8},"objective":4}}\n',
      '{"type":"complete","requestedTrials":2,"completedTrials":2,"prunedTrials":0,"failedTrials":0,"best":{"trial":1,"parameters":{"rate":0.8},"objective":4}}\n',
    ]);
    expect(upstreamRequest?.url).toBe("http://petrinaut-opt:4004/optimize/all");
    expect(JSON.parse(upstreamRequest?.body ?? "null")).toEqual(
      validOptimizationInput,
    );
  });

  it("preserves an upstream busy response without a Retry-After header", async () => {
    const result = await callHandler({
      body: validOptimizationInput,
      fetchImpl: async () =>
        Response.json({ detail: "The optimizer is busy" }, { status: 429 }),
    });

    expect(result.statusCode).toBe(429);
    expect(result.body).toEqual({ error: "Petrinaut optimizer is busy" });
    expect(result.headers).not.toHaveProperty("Retry-After");
  });

  it("cleans up backpressure listeners and survives a late close", async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) =>
      unhandledRejections.push(reason);
    process.on("unhandledRejection", onUnhandledRejection);
    let activeResponse: FakeResponse | undefined;

    try {
      const upstream = [
        'data: {"step":0,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n',
        'data: {"step":1,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n',
        "event: done\ndata: {}\n\n",
      ].join("");

      const result = await callHandler({
        body: validOptimizationInput,
        fetchImpl: async () =>
          new Response(upstream, {
            headers: { "content-type": "text/event-stream" },
          }),
        onResponse: (response) => {
          activeResponse = response;
        },
        writeReturns: (value) => {
          if (value.includes('"trial":0')) {
            // Backpressure this write, then let the buffer drain shortly
            // after the handler has started waiting.
            setImmediate(() => activeResponse?.emit("drain"));
            return false;
          }
          return true;
        },
      });

      expect(result.statusCode).toBe(200);
      expect(result.output).toHaveLength(4);
      expect(result.response.listenerCount("drain")).toBe(0);
      expect(result.response.listenerCount("close")).toBe(0);

      // The response closing after completion must not trip the listener
      // that lost the earlier drain/close race.
      result.response.emit("close");
      await new Promise(setImmediate);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("stops a backpressured stream when the client closes and frees the slot", async () => {
    const handler = createPetrinautOptimizationHandler({
      fetchImpl: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"step":0,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n',
                ),
              );
              init?.signal?.addEventListener(
                "abort",
                () =>
                  controller.error(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      logger,
      origin: new URL("http://petrinaut-opt:4004"),
    });
    let activeResponse: FakeResponse | undefined;

    const first = await callHandler({
      body: validOptimizationInput,
      handler,
      onResponse: (response) => {
        activeResponse = response;
      },
      writeReturns: (value) => {
        if (value.includes('"trial":0')) {
          setImmediate(() => {
            if (activeResponse) {
              activeResponse.destroyed = true;
              activeResponse.emit("close");
            }
          });
          return false;
        }
        return true;
      },
    });

    expect(first.statusCode).toBe(200);
    expect(first.response.listenerCount("drain")).toBe(0);
    expect(first.response.listenerCount("close")).toBe(0);

    // The same user must be admitted again: the slot was released.
    const second = await callHandler({
      body: validOptimizationInput,
      handler,
      writeReturns: (value) => {
        if (value.includes('"trial":0')) {
          setImmediate(() => {
            activeResponse!.destroyed = true;
            activeResponse!.emit("close");
          });
          return false;
        }
        return true;
      },
      onResponse: (response) => {
        activeResponse = response;
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.body).toBeUndefined();
  });

  it("breaks a backpressured wait on timeout instead of holding the slot", async () => {
    vi.useFakeTimers();

    try {
      const handler = createPetrinautOptimizationHandler({
        fetchImpl: async (_input, init) =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"step":0,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n',
                  ),
                );
                init?.signal?.addEventListener(
                  "abort",
                  () =>
                    controller.error(new DOMException("Aborted", "AbortError")),
                  { once: true },
                );
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
        logger,
        origin: new URL("http://petrinaut-opt:4004"),
      });

      const firstPromise = callHandler({
        body: validOptimizationInput,
        handler,
        // The client never drains and never disconnects.
        writeReturns: (value) => !value.includes('"trial":0'),
      });

      // The 5 minute idle timeout aborts the stalled stream.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
      const first = await firstPromise;

      expect(first.statusCode).toBe(200);
      expect(first.output.at(-1)).toContain('"code":"optimization_timeout"');
      expect(first.response.writableEnded).toBe(true);
      expect(first.response.listenerCount("drain")).toBe(0);
      expect(first.response.listenerCount("close")).toBe(0);
      // Heartbeats must not stuff a buffer that already needs draining.
      expect(first.output.filter((frame) => frame === "\n")).toHaveLength(0);

      // The user slot must be free again after the timeout teardown.
      const secondPromise = callHandler({
        body: validOptimizationInput,
        handler,
        writeReturns: (value) => !value.includes('"trial":0'),
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
      const second = await secondPromise;
      expect(second.statusCode).toBe(200);
      expect(second.body).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a single terminal event when a timeout hits the final write", async () => {
    vi.useFakeTimers();

    try {
      const upstream = [
        'data: {"step":0,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n',
        "event: done\ndata: {}\n\n",
      ].join("");

      const resultPromise = callHandler({
        body: validOptimizationInput,
        fetchImpl: async () =>
          new Response(upstream, {
            headers: { "content-type": "text/event-stream" },
          }),
        // The final complete event is committed to the buffer, but the
        // client never drains it before the idle timeout fires.
        writeReturns: (value) => !value.includes('"type":"complete"'),
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
      const result = await resultPromise;

      const terminalEvents = result.output.filter(
        (frame) =>
          frame.includes('"type":"complete"') ||
          frame.includes('"type":"error"'),
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0]).toContain('"type":"complete"');
      expect(result.response.writableEnded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts disconnected requests and releases the user slot", async () => {
    let abortObserved = false;
    await callHandler({
      body: validOptimizationInput,
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              abortObserved = true;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }),
      onRequest: (request) => request.emit("aborted"),
    });

    expect(abortObserved).toBe(true);

    const second = await callHandler({
      body: validOptimizationInput,
      fetchImpl: async () =>
        new Response('event: error\ndata: {"message":"failed"}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
    });
    expect(second.statusCode).toBe(200);
    expect(second.output).toHaveLength(2);
  });
});
