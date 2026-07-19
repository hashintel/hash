import { describe, expect, it } from "vitest";

import { createPetrinautOptimizationRunHandler } from "./create-petrinaut-optimization-run-handler";
import { createOptimizationRunOwners } from "./shared/optimization-run-owners";
import {
  callOptimizationRunHandler,
  createRecordingLogger,
  unexpectedFetch,
  validOptimizationInput,
} from "./shared/optimization-run-test-harness";

import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";

const createHandler = ({
  fetchImpl = unexpectedFetch,
  logger = createRecordingLogger().logger,
  origin = new URL("http://petrinaut-opt:4004"),
  runOwners = createOptimizationRunOwners(),
}: {
  fetchImpl?: PetrinautOptimizerFetch;
  logger?: ReturnType<typeof createRecordingLogger>["logger"];
  origin?: URL | null;
  runOwners?: ReturnType<typeof createOptimizationRunOwners>;
} = {}) =>
  createPetrinautOptimizationRunHandler({
    fetchImpl,
    logger,
    origin,
    runOwners,
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

  it("creates a detached run, records its owner, and enforces single-flight", async () => {
    let upstreamRequest:
      | { body: string | undefined; requestId: unknown; url: string }
      | undefined;
    let nextRunId = 1;
    const { entries, logger } = createRecordingLogger();
    const runOwners = createOptimizationRunOwners();
    const handler = createHandler({
      fetchImpl: async (input, init) => {
        upstreamRequest = {
          body: typeof init?.body === "string" ? init.body : undefined,
          requestId: new Headers(init?.headers).get("x-hash-request-id"),
          url: input.toString(),
        };
        const runId = `run-${nextRunId++}`;
        return Response.json(
          { run_id: runId },
          { status: 201, headers: { "x-optimization-run-id": runId } },
        );
      },
      logger,
      runOwners,
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
    expect(upstreamRequest?.requestId).toBe("request-id-1");
    expect(JSON.parse(upstreamRequest?.body ?? "null")).toEqual(
      validOptimizationInput,
    );
    expect(runOwners.get("run-1")).toMatchObject({
      accountId: "user-1",
      requestedTrials: 2,
    });
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

    // A second create for the same account is rejected while the run lives.
    const second = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler,
    });
    expect(second.statusCode).toBe(429);
    expect(second.body).toEqual({
      error: "An optimization is already running for this account",
    });
    expect(entries).toContainEqual({
      level: "warn",
      message: "Petrinaut optimization run rejected: account busy",
      metadata: { requestId: "request-id-1", userId: "user-1" },
    });

    // A different account is not affected by user-1's live run.
    const otherAccount = await callOptimizationRunHandler({
      accountId: "user-2",
      body: validOptimizationInput,
      handler,
    });
    expect(otherAccount.statusCode).toBe(201);
    expect(otherAccount.body).toEqual({ runId: "run-2" });
  });

  it("admits an account again once its run's ownership is released", async () => {
    const runOwners = createOptimizationRunOwners();
    let nextRunId = 1;
    const handler = createHandler({
      fetchImpl: async () =>
        Response.json({ run_id: `run-${nextRunId++}` }, { status: 201 }),
      runOwners,
    });

    const first = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler,
    });
    expect(first.statusCode).toBe(201);

    runOwners.release("run-1");

    const second = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler,
    });
    expect(second.statusCode).toBe(201);
    expect(second.body).toEqual({ runId: "run-2" });
  });

  it("rejects concurrent creates while the first is still in flight", async () => {
    const runOwners = createOptimizationRunOwners();
    let releaseFirst: (() => void) | undefined;
    const handler = createHandler({
      fetchImpl: async () =>
        new Promise<Response>((resolve) => {
          releaseFirst = () =>
            resolve(Response.json({ run_id: "run-1" }, { status: 201 }));
        }),
      runOwners,
    });

    const firstPromise = callOptimizationRunHandler({
      body: validOptimizationInput,
      handler,
    });
    // Let the first request reach the pending upstream fetch.
    await new Promise(setImmediate);

    const second = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler,
    });
    expect(second.statusCode).toBe(429);
    expect(second.body).toEqual({
      error: "An optimization is already running for this account",
    });

    releaseFirst?.();
    const first = await firstPromise;
    expect(first.statusCode).toBe(201);
  });

  it("preserves an upstream optimizer busy response", async () => {
    const result = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "The optimizer is busy" },
            { status: 429, headers: { "retry-after": "30" } },
          ),
      }),
    });

    expect(result).toMatchObject({
      body: { error: "Petrinaut optimizer is busy" },
      headers: { "Retry-After": "30" },
      statusCode: 429,
    });
  });

  it("correlates an upstream failure with the optimizer run id", async () => {
    const { entries, logger } = createRecordingLogger();
    const runOwners = createOptimizationRunOwners();
    const result = await callOptimizationRunHandler({
      body: validOptimizationInput,
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "failed to initialise optimization" },
            { status: 500, headers: { "x-optimization-run-id": "run-err-9" } },
          ),
        logger,
        runOwners,
      }),
    });

    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({ error: "Petrinaut optimization failed" });
    expect(result.headers).toMatchObject({
      "X-Optimization-Run-ID": "run-err-9",
    });
    // A failed creation must not hold the account's single-flight slot.
    expect(runOwners.hasLiveRunForAccount("user-1")).toBe(false);
    const failure = entries.find(
      (entry) => entry.message === "Petrinaut optimization run creation failed",
    );
    expect(failure?.metadata).toMatchObject({
      optimizationRunId: "run-err-9",
      outcome: "upstream-error",
    });
  });
});
