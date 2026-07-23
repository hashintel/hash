/**
 * Test-only fakes shared by the detached-run handler suites.
 *
 * The harness provides a
 * recording logger, an EventEmitter-based Express request/response pair with
 * caller-controlled backpressure, and a driver that runs one handler call.
 */
import { EventEmitter } from "node:events";

import type { Logger } from "@local/hash-backend-utils/logger";
import type {
  Request,
  RequestHandler,
  Response as ExpressResponse,
} from "express";

export const validOptimizationInput = {
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

export type RecordedLog = {
  level: "info" | "warn";
  message: string;
  metadata: Record<string, unknown>;
};

/** Build a logger fake that records request-scoped structured logs. */
export const createRecordingLogger = () => {
  const entries: RecordedLog[] = [];
  const record =
    (level: "info" | "warn", childMetadata: Record<string, unknown>) =>
    (message: string, metadata?: Record<string, unknown>) => {
      entries.push({
        level,
        message,
        metadata: { ...childMetadata, ...metadata },
      });
    };
  const logger = {
    child: (childMetadata: Record<string, string>) => ({
      info: record("info", childMetadata),
      warn: record("warn", childMetadata),
    }),
    info: record("info", {}),
    warn: record("warn", {}),
  } as unknown as Pick<Logger, "child" | "info" | "warn">;
  return { entries, logger };
};

export const unexpectedFetch = async (): Promise<Response> => {
  throw new Error("Unexpected upstream request");
};

/** Mutable fake Express response the backpressure tests can drive. */
export type FakeResponse = EventEmitter &
  ExpressResponse & { destroyed: boolean };

/** Drive one handler invocation against fake Express request/response. */
export const callOptimizationRunHandler = async ({
  accountId = "user-1",
  authenticated = true,
  body,
  handler,
  onRequest,
  onResponse,
  params = {},
  query = {},
  writeReturns,
}: {
  accountId?: string;
  authenticated?: boolean;
  body?: unknown;
  handler: RequestHandler;
  onRequest?: (request: EventEmitter) => void;
  onResponse?: (response: FakeResponse) => void;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
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
    get: (name: string) =>
      name.toLowerCase() === "x-hash-request-id" ? "request-id-1" : undefined,
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
    params,
    query,
    user: authenticated
      ? ({ accountId } as NonNullable<Request["user"]>)
      : undefined,
  }) as unknown as Request;

  const handlerPromise = handler(request, response, () => undefined);
  onRequest?.(request);
  onResponse?.(response);
  await handlerPromise;

  return { body: bodyResult, headers, output, response, statusCode };
};
