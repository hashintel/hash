import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import {
  forwardPetrinautOptimizationStream,
  getPetrinautOptimizerOrigin,
  PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
  PETRINAUT_OPTIMIZER_OPTIMIZE_PATH,
  PETRINAUT_OPTIMIZER_STATUS_PATH,
  setupPetrinautOptimizerHandler,
} from "./setup-petrinaut-optimizer-handler";

import type { Express, Request, Response as ExpressResponse } from "express";

const logger = { warn: () => undefined };

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

type Handler = (request: Request, response: ExpressResponse) => Promise<void>;

const callHandler = async ({
  authenticated = true,
  fetchImpl,
  origin,
  path = PETRINAUT_OPTIMIZER_STATUS_PATH,
}: {
  authenticated?: boolean;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  origin: URL | null;
  path?: string;
}) => {
  let handler: Handler | undefined;
  let registeredPath: string | undefined;
  const app = {
    get: (routePath: string, routeHandler: Handler) => {
      if (routePath === path) {
        registeredPath = routePath;
        handler = routeHandler;
      }
    },
    post: () => undefined,
  } as unknown as Express;

  setupPetrinautOptimizerHandler(app, { fetchImpl, logger, origin });

  let statusCode = 200;
  let body: unknown;
  const response = {
    json: (value: unknown) => {
      body = value;
      return response;
    },
    status: (value: number) => {
      statusCode = value;
      return response;
    },
  } as unknown as ExpressResponse;
  const request = {
    user: authenticated ? ({} as NonNullable<Request["user"]>) : undefined,
  } as Request;

  await handler?.(request, response);

  return { body, registeredPath, statusCode };
};

describe("getPetrinautOptimizerOrigin", () => {
  it("allows the optimizer to be unconfigured", () => {
    expect(getPetrinautOptimizerOrigin({})).toBeNull();
  });

  it("constructs an HTTP origin from the configured host and port", () => {
    expect(
      getPetrinautOptimizerOrigin({
        HASH_PETRINAUT_OPT_HOST: "petrinaut-opt",
        HASH_PETRINAUT_OPT_PORT: "4004",
      })?.href,
    ).toBe("http://petrinaut-opt:4004/");
  });

  it("rejects partial configuration", () => {
    expect(() =>
      getPetrinautOptimizerOrigin({ HASH_PETRINAUT_OPT_HOST: "localhost" }),
    ).toThrow("must be set together");
  });
});

describe(PETRINAUT_OPTIMIZER_CAPABILITIES_PATH, () => {
  it("requires authentication", async () => {
    await expect(
      callHandler({
        authenticated: false,
        origin: null,
        path: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      }),
    ).resolves.toEqual({
      body: { error: "Authentication required" },
      registeredPath: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      statusCode: 401,
    });
  });

  it("reports whether the optimizer is deliberately configured", async () => {
    await expect(
      callHandler({
        origin: null,
        path: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      }),
    ).resolves.toEqual({
      body: { optimization: false },
      registeredPath: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      statusCode: 200,
    });

    await expect(
      callHandler({
        origin: new URL("http://petrinaut-opt:4004"),
        path: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      }),
    ).resolves.toEqual({
      body: { optimization: true },
      registeredPath: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      statusCode: 200,
    });
  });
});

describe(PETRINAUT_OPTIMIZER_OPTIMIZE_PATH, () => {
  const callOptimizationHandler = async ({
    authenticated = true,
    body,
    fetchImpl,
    onRequest,
    origin = new URL("http://petrinaut-opt:4004"),
  }: {
    authenticated?: boolean;
    body: unknown;
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
    onRequest?: (request: EventEmitter) => void;
    origin?: URL | null;
  }) => {
    let handler: Handler | undefined;
    let registeredPath: string | undefined;
    const app = {
      get: () => undefined,
      post: (path: string, routeHandler: Handler) => {
        registeredPath = path;
        handler = routeHandler;
      },
    } as unknown as Express;
    setupPetrinautOptimizerHandler(app, { fetchImpl, logger, origin });

    let statusCode = 200;
    let responseBody: unknown;
    const responseHeaders: Record<string, string> = {};
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
      end() {
        writableEnded = true;
      },
      flushHeaders() {
        headersSent = true;
      },
      json: (value: unknown) => {
        responseBody = value;
        headersSent = true;
        writableEnded = true;
        return response;
      },
      set: (headers: Record<string, string>) => {
        Object.assign(responseHeaders, headers);
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

    const handlerPromise = handler?.(request, response);
    onRequest?.(request as unknown as EventEmitter);
    await handlerPromise;
    return {
      body: responseBody,
      output,
      registeredPath,
      responseHeaders,
      statusCode,
    };
  };

  it("requires authentication", async () => {
    await expect(
      callOptimizationHandler({ authenticated: false, body: {} }),
    ).resolves.toEqual({
      body: { error: "Authentication required" },
      output: [],
      registeredPath: PETRINAUT_OPTIMIZER_OPTIMIZE_PATH,
      responseHeaders: {},
      statusCode: 401,
    });
  });

  it("validates the public optimization request", async () => {
    const result = await callOptimizationHandler({ body: {} });

    expect(result.registeredPath).toBe(PETRINAUT_OPTIMIZER_OPTIMIZE_PATH);
    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      error: "Invalid optimization request",
    });
  });

  it("rejects a missing request body", async () => {
    const result = await callOptimizationHandler({ body: undefined });

    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({ error: "Invalid optimization request" });
  });

  it("proxies a valid request and adapts optimizer SSE to canonical NDJSON", async () => {
    const requests: Array<{ body: string | undefined; url: string }> = [];
    const upstream = [
      'data: {"step":0,"params":{"rate":0.4},"init_state":{},"metric":2,"state":"COMPLETE"}\n\n',
      ": heartbeat\n\n",
      'data: {"step":1,"params":{"rate":0.8},"init_state":{},"metric":4,"state":"COMPLETE"}\n\n',
      "event: done\ndata: {}\n\n",
    ].join("");

    const result = await callOptimizationHandler({
      body: validOptimizationInput,
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          url: input.toString(),
        });
        return new Response(upstream, {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.responseHeaders).toMatchObject({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    expect(result.output).toEqual([
      '{"type":"started","requestedTrials":2}\n',
      '{"type":"trial","trial":0,"parameters":{"rate":0.4},"objective":2,"state":"complete","best":{"trial":0,"parameters":{"rate":0.4},"objective":2}}\n',
      '{"type":"trial","trial":1,"parameters":{"rate":0.8},"objective":4,"state":"complete","best":{"trial":1,"parameters":{"rate":0.8},"objective":4}}\n',
      '{"type":"complete","requestedTrials":2,"completedTrials":2,"prunedTrials":0,"failedTrials":0,"best":{"trial":1,"parameters":{"rate":0.8},"objective":4}}\n',
    ]);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe("http://petrinaut-opt:4004/optimize/all");
    expect(JSON.parse(request?.body ?? "null")).toEqual(validOptimizationInput);
  });

  it("aborts a disconnected request and releases its user slot", async () => {
    let abortObserved = false;
    const disconnected = await callOptimizationHandler({
      body: validOptimizationInput,
      fetchImpl: async (_input, init) => {
        const signal = init?.signal;
        if (!signal) {
          throw new Error("Expected an upstream abort signal");
        }
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              abortObserved = signal.aborted;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      },
      onRequest: (request) => request.emit("aborted"),
    });

    expect(abortObserved).toBe(true);
    expect(disconnected.output).toEqual([]);

    const second = await callOptimizationHandler({
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

describe("forwardPetrinautOptimizationStream", () => {
  it("handles arbitrary SSE chunk boundaries and emits canonical NDJSON", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"step":0,"params":{"rate":0.4},',
      '"init_state":{},"metric":null,"state":"PRUNED"}\n\n',
      "event: done\ndata: {}\n\n",
    ];
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    const output: string[] = [];
    const response = {
      write: (chunk: string) => {
        output.push(chunk);
        return true;
      },
    } as unknown as ExpressResponse;

    await forwardPetrinautOptimizationStream(upstream, response, {
      requestedTrials: 2,
    });

    expect(output).toEqual([
      '{"type":"started","requestedTrials":2}\n',
      '{"type":"trial","trial":0,"parameters":{"rate":0.4},"objective":null,"state":"pruned","best":null}\n',
      '{"type":"complete","requestedTrials":2,"completedTrials":0,"prunedTrials":1,"failedTrials":0,"best":null}\n',
    ]);
  });

  it("selects the lowest completed objective for a minimization", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"step":0,"params":{"rate":0.8},"metric":4,"state":"COMPLETE"}\n\n' +
              'data: {"step":1,"params":{"rate":0.4},"metric":2,"state":"COMPLETE"}\n\n' +
              "event: done\ndata: {}\n\n",
          ),
        );
        controller.close();
      },
    });
    const output: string[] = [];
    const response = {
      write: (chunk: string) => {
        output.push(chunk);
        return true;
      },
    } as unknown as ExpressResponse;

    await forwardPetrinautOptimizationStream(upstream, response, {
      direction: "minimize",
      requestedTrials: 2,
    });

    expect(output).toEqual([
      '{"type":"started","requestedTrials":2}\n',
      '{"type":"trial","trial":0,"parameters":{"rate":0.8},"objective":4,"state":"complete","best":{"trial":0,"parameters":{"rate":0.8},"objective":4}}\n',
      '{"type":"trial","trial":1,"parameters":{"rate":0.4},"objective":2,"state":"complete","best":{"trial":1,"parameters":{"rate":0.4},"objective":2}}\n',
      '{"type":"complete","requestedTrials":2,"completedTrials":2,"prunedTrials":0,"failedTrials":0,"best":{"trial":1,"parameters":{"rate":0.4},"objective":2}}\n',
    ]);
  });

  it("accepts Python's error state as terminal without a done event", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"state":"ERROR","message":"scenario failed"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const output: string[] = [];
    const response = {
      write: (chunk: string) => {
        output.push(chunk);
        return true;
      },
    } as unknown as ExpressResponse;

    await forwardPetrinautOptimizationStream(upstream, response, {
      requestedTrials: 2,
    });

    expect(output).toEqual([
      '{"type":"started","requestedTrials":2}\n',
      '{"type":"error","code":"optimization_failed","message":"scenario failed","retryable":false}\n',
    ]);
  });

  it("treats heartbeat chunks as upstream activity", async () => {
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      },
    });
    const response = {
      write: () => true,
    } as unknown as ExpressResponse;
    let activityCount = 0;

    await forwardPetrinautOptimizationStream(upstream, response, {
      onActivity: () => {
        activityCount += 1;
      },
    });

    expect(activityCount).toBe(2);
  });

  it("rejects invalid upstream events", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"step":0,"params":{},"metric":1,"state":"UNKNOWN"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const response = {
      write: () => true,
    } as unknown as ExpressResponse;

    await expect(
      forwardPetrinautOptimizationStream(upstream, response),
    ).rejects.toThrow("invalid trial state");
  });

  it("rejects a stream that ends without a terminal event", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"step":0,"params":{},"metric":1,"state":"COMPLETE"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const response = {
      write: () => true,
    } as unknown as ExpressResponse;

    await expect(
      forwardPetrinautOptimizationStream(upstream, response),
    ).rejects.toThrow("without returning a terminal event");
  });

  it("rejects data after a terminal event", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            "event: done\ndata: {}\n\n" +
              'data: {"step":0,"params":{},"metric":1,"state":"COMPLETE"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const response = {
      write: () => true,
    } as unknown as ExpressResponse;

    await expect(
      forwardPetrinautOptimizationStream(upstream, response),
    ).rejects.toThrow("after a terminal event");
  });
});

describe(PETRINAUT_OPTIMIZER_STATUS_PATH, () => {
  it("requires authentication", async () => {
    const result = await callHandler({ authenticated: false, origin: null });

    expect(result).toEqual({
      body: { error: "Authentication required" },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 401,
    });
  });

  it("returns 503 when the optimizer is not configured", async () => {
    const result = await callHandler({ origin: null });

    expect(result).toEqual({
      body: { error: "Petrinaut optimizer is not configured" },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 503,
    });
  });

  it("returns a sanitized idle status when there are no runs", async () => {
    const result = await callHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async () => Response.json([]),
    });

    expect(result).toEqual({
      body: { phase: "idle", detail: null, updated_at: null },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 200,
    });
  });

  it("summarizes optimizer status without exposing another run's details", async () => {
    const requestedUrls: string[] = [];
    const result = await callHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async (input) => {
        requestedUrls.push(input.toString());
        return Response.json([
          {
            run_id: "run-1",
            phase: "error",
            detail: "private failure details",
            updated_at: "2026-07-16T10:00:00Z",
          },
          {
            run_id: "run-2",
            phase: "running",
            detail: "private model name",
            updated_at: "2026-07-16T10:01:00Z",
          },
        ]);
      },
    });

    expect(result).toEqual({
      body: {
        phase: "running",
        detail: null,
        updated_at: "2026-07-16T10:01:00Z",
      },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 200,
    });
    expect(requestedUrls).toEqual(["http://petrinaut-opt:4004/status"]);
  });

  it("rejects an invalid optimizer status", async () => {
    const result = await callHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async () =>
        Response.json([{ run_id: "run-1", phase: "unknown" }]),
    });

    expect(result).toEqual({
      body: { error: "Petrinaut optimizer is unavailable" },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 503,
    });
  });
});
