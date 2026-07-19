import { describe, expect, it } from "vitest";

import { createPetrinautOptimizationRunCancelHandler } from "./create-petrinaut-optimization-run-cancel-handler";
import { createOptimizationRunOwners } from "./shared/optimization-run-owners";
import {
  callOptimizationRunHandler,
  createRecordingLogger,
  unexpectedFetch,
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
  createPetrinautOptimizationRunCancelHandler({
    fetchImpl,
    logger,
    origin,
    runOwners,
  });

/** Register run-1 as owned by the given account with two requested trials. */
const ownersWithRun = (accountId = "user-1") => {
  const runOwners = createOptimizationRunOwners();
  runOwners.register("run-1", { accountId, requestedTrials: 2 });
  return runOwners;
};

describe("createPetrinautOptimizationRunCancelHandler", () => {
  it("requires authentication", async () => {
    const result = await callOptimizationRunHandler({
      authenticated: false,
      handler: createHandler(),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Authentication required" },
      statusCode: 401,
    });
  });

  it("answers 404 for a run NodeAPI does not know", async () => {
    const result = await callOptimizationRunHandler({
      handler: createHandler(),
      params: { runId: "run-unknown" },
    });

    expect(result).toMatchObject({
      body: { error: "Optimization run not found" },
      statusCode: 404,
    });
  });

  it("answers 404 rather than 403 for another account's run", async () => {
    const runOwners = ownersWithRun("user-2");
    const result = await callOptimizationRunHandler({
      handler: createHandler({ runOwners }),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Optimization run not found" },
      statusCode: 404,
    });
    // The other account's ownership entry is untouched.
    expect(runOwners.get("run-1")).toMatchObject({ accountId: "user-2" });
  });

  it("cancels the run upstream and releases its ownership", async () => {
    let upstreamRequest:
      | { method: string | undefined; requestId: unknown; url: string }
      | undefined;
    const { entries, logger } = createRecordingLogger();
    const runOwners = ownersWithRun();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async (input, init) => {
          upstreamRequest = {
            method: init?.method,
            requestId: new Headers(init?.headers).get("x-hash-request-id"),
            url: input.toString(),
          };
          return new Response(null, { status: 204 });
        },
        logger,
        runOwners,
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(204);
    expect(upstreamRequest).toEqual({
      method: "DELETE",
      requestId: "request-id-1",
      url: "http://petrinaut-opt:4004/optimize/runs/run-1",
    });
    expect(runOwners.get("run-1")).toBeUndefined();
    expect(entries).toContainEqual({
      level: "info",
      message: "Petrinaut optimization run cancelled",
      metadata: {
        durationMs: expect.any(Number),
        optimizationRunId: "run-1",
        requestId: "request-id-1",
        userId: "user-1",
      },
    });
  });

  it("treats an upstream 404 as an already-cancelled run", async () => {
    const runOwners = ownersWithRun();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "optimization run not found: run-1" },
            { status: 404 },
          ),
        runOwners,
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(204);
    expect(runOwners.get("run-1")).toBeUndefined();
  });

  it("keeps ownership when the upstream cancellation fails", async () => {
    const { entries, logger } = createRecordingLogger();
    const runOwners = ownersWithRun();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          Response.json({ detail: "cancellation failed" }, { status: 500 }),
        logger,
        runOwners,
      }),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Petrinaut optimization failed" },
      statusCode: 502,
    });
    // The owner can retry the cancel: the entry must survive the failure.
    expect(runOwners.get("run-1")).toMatchObject({ accountId: "user-1" });
    expect(entries).toContainEqual({
      level: "warn",
      message: "Petrinaut optimization run cancellation failed",
      metadata: expect.objectContaining({
        optimizationRunId: "run-1",
        outcome: "upstream-error",
        userId: "user-1",
      }),
    });
  });
});
