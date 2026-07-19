import { describe, expect, it, vi } from "vitest";

import { createPetrinautOptimizationRun } from "./create-optimization-run.js";
import { PetrinautOptimizerHttpError } from "./optimizer-http.js";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

const input = {
  objective: { direction: "maximize" },
  study: { trials: 2 },
} as PetrinautOptimizationInput;

describe("createPetrinautOptimizationRun", () => {
  it("posts the manifest and returns the created run id", async () => {
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { run_id: "run-42" },
        { status: 201, headers: { "x-optimization-run-id": "run-42" } },
      ),
    );

    await expect(
      createPetrinautOptimizationRun({
        endpoint: "http://petrinaut-opt.test",
        fetchImpl,
        input,
        requestId: "request-123",
        signal,
      }),
    ).resolves.toEqual({ runId: "run-42" });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/optimize/runs"),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-hash-request-id": "request-123",
        },
        body: JSON.stringify(input),
        signal,
      },
    );
  });

  it("preserves the busy status and Retry-After of an optimizer 429", async () => {
    const result = createPetrinautOptimizationRun({
      endpoint: "http://petrinaut-opt.test",
      fetchImpl: async () =>
        Response.json(
          { detail: "The optimizer is busy" },
          { status: 429, headers: { "retry-after": "30" } },
        ),
      input,
    });

    await expect(result).rejects.toBeInstanceOf(PetrinautOptimizerHttpError);
    await expect(result).rejects.toMatchObject({
      message: "The optimizer is busy",
      retryAfter: "30",
      status: 429,
    });
  });

  it("captures the run id from a failed optimizer response", async () => {
    await expect(
      createPetrinautOptimizationRun({
        endpoint: "http://petrinaut-opt.test",
        fetchImpl: async () =>
          Response.json(
            { detail: "failed to initialise optimization" },
            { status: 500, headers: { "x-optimization-run-id": "run-err-7" } },
          ),
        input,
      }),
    ).rejects.toMatchObject({
      optimizationRunId: "run-err-7",
      status: 500,
    });
  });

  it("rejects a successful response without a valid run id", async () => {
    await expect(
      createPetrinautOptimizationRun({
        endpoint: "http://petrinaut-opt.test",
        fetchImpl: async () => Response.json({}, { status: 201 }),
        input,
      }),
    ).rejects.toThrow("invalid run id");
    await expect(
      createPetrinautOptimizationRun({
        endpoint: "http://petrinaut-opt.test",
        fetchImpl: async () => new Response("created", { status: 201 }),
        input,
      }),
    ).rejects.toThrow("invalid run id");
  });
});
