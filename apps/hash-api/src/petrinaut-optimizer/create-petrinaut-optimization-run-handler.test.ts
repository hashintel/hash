import { describe, expect, it } from "vitest";

import { createPetrinautOptimizationHandler } from "./create-petrinaut-optimization-handler";
import { createPetrinautOptimizationRunHandler } from "./create-petrinaut-optimization-run-handler";
import { createOptimizationAccountOccupancy } from "./shared/optimization-account-occupancy";
import { createOptimizationRunOwners } from "./shared/optimization-run-owners";
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
  runOwners = createOptimizationRunOwners(),
  occupancy = createOptimizationAccountOccupancy(runOwners),
}: {
  fetchImpl?: PetrinautOptimizerFetch;
  logger?: ReturnType<typeof createRecordingLogger>["logger"];
  origin?: URL | null;
  runOwners?: ReturnType<typeof createOptimizationRunOwners>;
  occupancy?: ReturnType<typeof createOptimizationAccountOccupancy>;
} = {}) =>
  createPetrinautOptimizationRunHandler({
    fetchImpl,
    logger,
    occupancy,
    origin,
    runOwners,
  });

/**
 * Route upstream calls by path: status probes answer with `statusPhase`
 * (or 404 when null), and run creations answer with sequential run ids.
 */
const createUpstreamFake = ({
  statusPhase = "running",
}: {
  statusPhase?: string | null;
} = {}) => {
  const calls: { method: string; url: string }[] = [];
  const fetchImpl: PetrinautOptimizerFetch = async (input, init) => {
    const url = input.toString();
    calls.push({ method: init?.method ?? "GET", url });
    if (url.includes("/status/")) {
      return statusPhase === null
        ? Response.json(
            { detail: "optimization run not found" },
            {
              status: 404,
            },
          )
        : Response.json({ phase: statusPhase, detail: null });
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    const runId = `run-${calls.filter((call) => call.method === "POST").length}`;
    return Response.json(
      { run_id: runId },
      { status: 201, headers: { "x-optimization-run-id": runId } },
    );
  };
  return { calls, fetchImpl };
};

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
        const url = input.toString();
        if (url.includes("/status/")) {
          // The owned run is genuinely still optimizing.
          return Response.json({ phase: "running", detail: null });
        }
        upstreamRequest = {
          body: typeof init?.body === "string" ? init.body : undefined,
          requestId: new Headers(init?.headers).get("x-hash-request-id"),
          url,
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

    // A second create for the same account is rejected while the run lives:
    // the liveness probe confirms it is still running.
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
    const { fetchImpl } = createUpstreamFake();
    const handler = createHandler({ fetchImpl, runOwners });

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

  describe("stale ownership resolution", () => {
    it("releases a terminal owned run and admits the create", async () => {
      const { entries, logger } = createRecordingLogger();
      const runOwners = createOptimizationRunOwners();
      // A run remembered by NodeAPI that the optimizer has since finished.
      runOwners.register("run-stale", {
        accountId: "user-1",
        requestedTrials: 2,
      });
      const { calls, fetchImpl } = createUpstreamFake({ statusPhase: "idle" });
      const handler = createHandler({ fetchImpl, logger, runOwners });

      const result = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler,
      });

      expect(result.statusCode).toBe(201);
      expect(result.body).toEqual({ runId: "run-1" });
      expect(calls[0]).toEqual({
        method: "GET",
        url: "http://petrinaut-opt:4004/status/run-stale",
      });
      expect(runOwners.get("run-stale")).toBeUndefined();
      expect(runOwners.get("run-1")).toMatchObject({ accountId: "user-1" });
      expect(entries).toContainEqual({
        level: "info",
        message: "Petrinaut optimization run ownership released: stale",
        metadata: {
          optimizationRunId: "run-stale",
          reason: "terminal-phase",
          requestId: "request-id-1",
          userId: "user-1",
        },
      });
    });

    it("releases an owned run the optimizer no longer knows", async () => {
      const runOwners = createOptimizationRunOwners();
      runOwners.register("run-stale", {
        accountId: "user-1",
        requestedTrials: 2,
      });
      const { fetchImpl } = createUpstreamFake({ statusPhase: null });
      const handler = createHandler({ fetchImpl, runOwners });

      const result = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler,
      });

      expect(result.statusCode).toBe(201);
      expect(runOwners.get("run-stale")).toBeUndefined();
    });

    it("preserves the 429 while the owned run still reports running", async () => {
      const runOwners = createOptimizationRunOwners();
      runOwners.register("run-live", {
        accountId: "user-1",
        requestedTrials: 2,
      });
      const { calls, fetchImpl } = createUpstreamFake({
        statusPhase: "running",
      });
      const handler = createHandler({ fetchImpl, runOwners });

      const result = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler,
      });

      expect(result.statusCode).toBe(429);
      expect(result.body).toEqual({
        error: "An optimization is already running for this account",
      });
      // Only the probe reached upstream; no run was created.
      expect(calls).toEqual([
        { method: "GET", url: "http://petrinaut-opt:4004/status/run-live" },
      ]);
      expect(runOwners.get("run-live")).toBeDefined();
    });

    it("fails closed when the liveness probe cannot reach the optimizer", async () => {
      const runOwners = createOptimizationRunOwners();
      runOwners.register("run-live", {
        accountId: "user-1",
        requestedTrials: 2,
      });
      const handler = createHandler({
        fetchImpl: async () => {
          throw new Error("connection refused");
        },
        runOwners,
      });

      const result = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler,
      });

      expect(result.statusCode).toBe(429);
      expect(runOwners.get("run-live")).toBeDefined();
    });
  });

  describe("client disconnects", () => {
    it("abandons a create whose client disconnects mid-round-trip", async () => {
      const { entries, logger } = createRecordingLogger();
      const runOwners = createOptimizationRunOwners();
      let abortObserved = false;
      const handler = createHandler({
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
        logger,
        runOwners,
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

      // The account slot is free again immediately.
      const { fetchImpl } = createUpstreamFake();
      const second = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler: createHandler({ fetchImpl, runOwners }),
      });
      expect(second.statusCode).toBe(201);
    });

    it("cancels a run created for a client that already disconnected", async () => {
      const { entries, logger } = createRecordingLogger();
      const runOwners = createOptimizationRunOwners();
      const calls: { method: string; url: string }[] = [];
      let resolveCreate: (() => void) | undefined;
      const handler = createHandler({
        fetchImpl: async (input, init) => {
          const method = init?.method ?? "GET";
          calls.push({ method, url: input.toString() });
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
        runOwners,
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

      // The orphaned run is cancelled upstream and never owned by anyone.
      expect(calls).toEqual([
        { method: "POST", url: "http://petrinaut-opt:4004/optimize/runs" },
        {
          method: "DELETE",
          url: "http://petrinaut-opt:4004/optimize/runs/run-orphan",
        },
      ]);
      expect(runOwners.hasLiveRunForAccount("user-1")).toBe(false);
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

  describe("cross-family single-flight", () => {
    it("rejects a detached create while a legacy stream is active", async () => {
      const runOwners = createOptimizationRunOwners();
      const occupancy = createOptimizationAccountOccupancy(runOwners);
      const logger = createRecordingLogger().logger;
      let releaseLegacy: (() => void) | undefined;
      const legacyHandler = createPetrinautOptimizationHandler({
        fetchImpl: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            releaseLegacy = () =>
              reject(new DOMException("Aborted", "AbortError"));
            init?.signal?.addEventListener("abort", () => releaseLegacy?.(), {
              once: true,
            });
          }),
        logger,
        occupancy,
        origin: new URL("http://petrinaut-opt:4004"),
      });
      const runHandler = createHandler({ logger, occupancy, runOwners });

      let legacyRequest: EventEmitter | undefined;
      const legacyPromise = callOptimizationRunHandler({
        body: validOptimizationInput,
        handler: legacyHandler,
        onRequest: (request) => {
          legacyRequest = request;
        },
      });
      // Let the legacy stream reach its pending upstream fetch.
      await new Promise(setImmediate);

      const result = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler: runHandler,
      });
      expect(result.statusCode).toBe(429);
      expect(result.body).toEqual({
        error: "An optimization is already running for this account",
      });

      legacyRequest!.emit("aborted");
      await legacyPromise;
    });

    it("rejects a legacy stream while the account owns a detached run", async () => {
      const runOwners = createOptimizationRunOwners();
      const occupancy = createOptimizationAccountOccupancy(runOwners);
      runOwners.register("run-1", {
        accountId: "user-1",
        requestedTrials: 2,
      });
      const legacyHandler = createPetrinautOptimizationHandler({
        fetchImpl: unexpectedFetch,
        logger: createRecordingLogger().logger,
        occupancy,
        origin: new URL("http://petrinaut-opt:4004"),
      });

      const result = await callOptimizationRunHandler({
        body: validOptimizationInput,
        handler: legacyHandler,
      });

      expect(result.statusCode).toBe(429);
      expect(result.body).toEqual({
        error: "An optimization is already running for this account",
      });
    });
  });
});
