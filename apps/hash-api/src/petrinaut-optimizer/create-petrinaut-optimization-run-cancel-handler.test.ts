import { describe, expect, it } from "vitest";

import { createPetrinautOptimizerClient } from "@local/petrinaut-optimizer-client";

import { createPetrinautOptimizationRunCancelHandler } from "./create-petrinaut-optimization-run-cancel-handler";
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
}: {
  fetchImpl?: PetrinautOptimizerFetch;
  logger?: ReturnType<typeof createRecordingLogger>["logger"];
  origin?: URL | null;
} = {}) =>
  createPetrinautOptimizationRunCancelHandler({
    client: createPetrinautOptimizerClient(
      origin ?? "http://petrinaut-optimizer.invalid",
      fetchImpl,
    ),
    logger,
    origin,
  });

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

  it("forwards the cancel with the account tag and answers 204", async () => {
    let upstreamRequest:
      | {
          accountId: unknown;
          method: string | undefined;
          requestId: unknown;
          url: string;
        }
      | undefined;
    const { entries, logger } = createRecordingLogger();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async (input, init) => {
          const headers = new Headers(init?.headers);
          upstreamRequest = {
            accountId: headers.get("x-hash-account-id"),
            method: init?.method,
            requestId: headers.get("x-hash-request-id"),
            url: input.toString(),
          };
          return new Response(null, { status: 204 });
        },
        logger,
      }),
      params: { runId: "run-1" },
    });

    expect(result.statusCode).toBe(204);
    expect(upstreamRequest).toEqual({
      accountId: "user-1",
      method: "DELETE",
      requestId: "request-id-1",
      url: "http://petrinaut-opt:4004/optimize/runs/run-1",
    });
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

  it("passes through the optimizer's 404 for unknown or foreign runs", async () => {
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          Response.json(
            { detail: "optimization run not found: run-1" },
            { status: 404 },
          ),
      }),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Optimization run not found" },
      statusCode: 404,
    });
  });

  it("maps an upstream cancellation failure to 502", async () => {
    const { entries, logger } = createRecordingLogger();
    const result = await callOptimizationRunHandler({
      handler: createHandler({
        fetchImpl: async () =>
          Response.json({ detail: "cancellation failed" }, { status: 500 }),
        logger,
      }),
      params: { runId: "run-1" },
    });

    expect(result).toMatchObject({
      body: { error: "Petrinaut optimization failed" },
      statusCode: 502,
    });
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
