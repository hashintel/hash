import { describe, expect, it } from "vitest";

import { createPetrinautOptimizerClient } from "@local/petrinaut-optimizer-client";

import { createPetrinautOptimizationRunHandler } from "./create-petrinaut-optimization-run-handler";
import {
  callOptimizationRunHandler,
  createRecordingLogger,
  unexpectedFetch,
  validOptimizationInput,
} from "./shared/optimization-run-test-harness";

import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { EventEmitter } from "node:events";

const createHandler = ({
  fetchImpl = unexpectedFetch,
  logger = createRecordingLogger().logger,
  origin = new URL("http://petrinaut-opt:4004"),
}: {
  fetchImpl?: PetrinautOptimizerFetch;
  logger?: ReturnType<typeof createRecordingLogger>["logger"];
  origin?: URL | null;
} = {}) =>
  createPetrinautOptimizationRunHandler({
    client: createPetrinautOptimizerClient(
      origin ?? "http://petrinaut-optimizer.invalid",
      fetchImpl,
    ),
    logger,
    origin,
  });

describe("createPetrinautOptimizationRunHandler", () => {
  it("requires authentication", async () => {
    const result = await callOptimizationRunHandler({
      authenticated: false,
      body: {},
      handler: createHandler(),
    });

    expect(result).toMatchObject({
      body: { error: "Authentication required" },
      statusCode: 401,
    });
  });

  it("reports an unconfigured optimizer", async () => {
    const result = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler: createHandler({ origin: null }),
    });

    expect(result).toMatchObject({
      body: { error: "Petrinaut optimizer is not configured" },
      statusCode: 503,
    });
  });

  it("validates the public optimization request without logging it", async () => {
    const { entries, logger } = createRecordingLogger();
    const result = await callOptimizationRunHandler({
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
      handler: createHandler({ logger }),
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

    // The failure is logged with only issue counts and schema paths — never
    // the validation messages or the manifest, which can embed user code.
    expect(entries).toEqual([
      {
        level: "warn",
        message: "Petrinaut optimization request failed validation",
        metadata: {
          issueCount: 1,
          issuePaths: ["scenario.parameterBindings.rate.domain.scale"],
          issuePathsTruncated: false,
          requestId: "request-id-1",
          userId: "user-1",
        },
      },
    ]);
    const loggedText = JSON.stringify(entries);
    expect(loggedText).not.toContain("return 1;");
    expect(loggedText).not.toContain("petrinaut-optimization");
  });

  it("forwards the manifest with the account tag and returns the run id", async () => {
    let upstreamRequest:
      | {
          accountId: unknown;
          body: string | undefined;
          requestId: unknown;
          url: string;
        }
      | undefined;
    const { entries, logger } = createRecordingLogger();
    const handler = createHandler({
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        upstreamRequest = {
          accountId: headers.get("x-hash-account-id"),
          body: typeof init?.body === "string" ? init.body : undefined,
          requestId: headers.get("x-hash-request-id"),
          url: input.toString(),
        };
        return Response.json(
          { run_id: "run-1" },
          { status: 201, headers: { "x-optimization-run-id": "run-1" } },
        );
      },
      logger,
    });

    const result = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler,
    });

    expect(result.statusCode).toBe(201);
    expect(result.body).toEqual({ runId: "run-1" });
    expect(result.headers).toMatchObject({ "X-Optimization-Run-ID": "run-1" });
    expect(upstreamRequest?.url).toBe(
      "http://petrinaut-opt:4004/optimize/runs",
    );
    expect(upstreamRequest?.accountId).toBe("user-1");
    expect(upstreamRequest?.requestId).toBe("request-id-1");
    expect(JSON.parse(upstreamRequest?.body ?? "null")).toEqual(
      validOptimizationInput,
    );
    expect(entries).toEqual([
      {
        level: "info",
        message: "Petrinaut optimization run requested",
        metadata: {
          bodyBytes: expect.any(Number),
          requestId: "request-id-1",
          requestedTrials: 2,
          userId: "user-1",
        },
      },
      {
        level: "info",
        message: "Petrinaut optimization run created",
        metadata: {
          durationMs: expect.any(Number),
          optimizationRunId: "run-1",
          requestId: "request-id-1",
          userId: "user-1",
        },
      },
    ]);
    // The manifest itself — including user-authored code — is never logged.
    const loggedText = JSON.stringify(entries);
    expect(loggedText).not.toContain("return 1;");
    expect(loggedText).not.toContain("petrinaut-optimization");
  });

  it("forwards the optimizer's 429 detail and Retry-After", async () => {
    const result = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "An optimization is already running for this account" },
            { status: 429, headers: { "retry-after": "30" } },
          ),
      }),
    });

    // The optimizer's server-authored detail distinguishes account
    // single-flight from service capacity, so it is forwarded verbatim.
    expect(result).toMatchObject({
      body: { error: "An optimization is already running for this account" },
      headers: { "Retry-After": "30" },
      statusCode: 429,
    });
  });

  it("correlates an upstream failure with the optimizer run id", async () => {
    const { entries, logger } = createRecordingLogger();
    const result = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "failed to initialise optimization" },
            { status: 500, headers: { "x-optimization-run-id": "run-err-9" } },
          ),
        logger,
      }),
    });

    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({ error: "Petrinaut optimization failed" });
    expect(result.headers).toMatchObject({
      "X-Optimization-Run-ID": "run-err-9",
    });
    const failure = entries.find(
      (entry) => entry.message === "Petrinaut optimization run creation failed",
    );
    expect(failure?.metadata).toMatchObject({
      optimizationRunId: "run-err-9",
      outcome: "upstream-error",
    });
  });

  describe("client disconnects", () => {
    it("abandons a create whose client disconnects mid-round-trip", async () => {
      const { entries, logger } = createRecordingLogger();
      let abortObserved = false;
      const handler = createHandler({
        fetchImpl: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            const abort = () => {
              abortObserved = true;
              reject(new DOMException("Aborted", "AbortError"));
            };
            // Real fetch rejects a signal that aborted before the call too.
            if (init?.signal?.aborted) {
              abort();
              return;
            }
            init?.signal?.addEventListener("abort", abort, { once: true });
          }),
        logger,
      });

      const result = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler,
        onRequest: (request) => request.emit("aborted"),
      });

      // No response is written to the vanished client…
      expect(abortObserved).toBe(true);
      expect(result.body).toBeUndefined();
      expect(result.response.headersSent).toBe(false);
      // …and the outcome is a disconnect, not an upstream error.
      expect(entries.at(-1)).toEqual({
        level: "info",
        message: "Petrinaut optimization run creation finished",
        metadata: {
          durationMs: expect.any(Number),
          outcome: "client-disconnected",
          requestId: "request-id-1",
          userId: "user-1",
        },
      });
    });

    it("cancels a run created for a client that already disconnected", async () => {
      const { entries, logger } = createRecordingLogger();
      const calls: { accountId: unknown; method: string; url: string }[] = [];
      let resolveCreate: (() => void) | undefined;
      const handler = createHandler({
        fetchImpl: async (input, init) => {
          const method = init?.method ?? "GET";
          calls.push({
            accountId: new Headers(init?.headers).get("x-hash-account-id"),
            method,
            url: input.toString(),
          });
          if (method === "DELETE") {
            return new Response(null, { status: 204 });
          }
          // Admit the run only after the client has already vanished.
          await new Promise<void>((resolve) => {
            resolveCreate = resolve;
          });
          return Response.json(
            { run_id: "run-orphan" },
            { status: 201, headers: { "x-optimization-run-id": "run-orphan" } },
          );
        },
        logger,
      });

      let activeRequest: EventEmitter | undefined;
      const resultPromise = callOptimizationRunHandler({
        body: validOptimizationInput,
        handler,
        onRequest: (request) => {
          activeRequest = request;
        },
      });
      // Reach the pending upstream create, disconnect, then let it resolve.
      await new Promise(setImmediate);
      activeRequest!.emit("aborted");
      resolveCreate?.();
      const result = await resultPromise;

      // The orphaned run is cancelled upstream on the account's behalf, so
      // the optimizer frees its single-flight immediately.
      expect(calls).toEqual([
        {
          accountId: "user-1",
          method: "POST",
          url: "http://petrinaut-opt:4004/optimize/runs",
        },
        {
          accountId: "user-1",
          method: "DELETE",
          url: "http://petrinaut-opt:4004/optimize/runs/run-orphan",
        },
      ]);
      expect(result.body).toBeUndefined();
      expect(result.response.headersSent).toBe(false);
      expect(entries.at(-1)).toEqual({
        level: "info",
        message: "Petrinaut optimization run creation finished",
        metadata: {
          durationMs: expect.any(Number),
          optimizationRunId: "run-orphan",
          outcome: "client-disconnected",
          requestId: "request-id-1",
          userId: "user-1",
        },
      });
    });
  });
});
