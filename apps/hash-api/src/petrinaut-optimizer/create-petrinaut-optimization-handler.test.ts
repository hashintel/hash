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

const callHandler = async ({
  authenticated = true,
  body,
  fetchImpl = unexpectedFetch,
  onRequest,
}: {
  authenticated?: boolean;
  body: unknown;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  onRequest?: (request: EventEmitter) => void;
}) => {
  let statusCode = 200;
  let bodyResult: unknown;
  const headers: Record<string, string> = {};
  const output: string[] = [];
  let headersSent = false;
  let writableEnded = false;
  const response = Object.assign(new EventEmitter(), {
    destroyed: false,
    get headersSent() {
      return headersSent;
    },
    get writableEnded() {
      return writableEnded;
    },
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
      return true;
    },
  }) as unknown as ExpressResponse;
  const request = Object.assign(new EventEmitter(), {
    body,
    user: authenticated
      ? ({ accountId: "user-1" } as NonNullable<Request["user"]>)
      : undefined,
  }) as unknown as Request;
  const handler = createPetrinautOptimizationHandler({
    fetchImpl,
    logger,
    origin: new URL("http://petrinaut-opt:4004"),
  });

  const handlerPromise = handler(request, response, () => undefined);
  onRequest?.(request);
  await handlerPromise;

  return { body: bodyResult, headers, output, statusCode };
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
