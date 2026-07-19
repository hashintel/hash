import { describe, expect, it, vi } from "vitest";

import { cancelPetrinautOptimizationRun } from "./cancel-optimization-run.js";
import { PetrinautOptimizerHttpError } from "./optimizer-http.js";

describe("cancelPetrinautOptimizationRun", () => {
  it("cancels the run over DELETE with the correlation header", async () => {
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(new Response(null, { status: 204 })),
    );

    await expect(
      cancelPetrinautOptimizationRun({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        fetchImpl,
        requestId: "request-123",
        signal,
      }),
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/optimize/runs/run-42"),
      {
        method: "DELETE",
        headers: { "x-hash-request-id": "request-123" },
        signal,
      },
    );
  });

  it("treats an unknown or expired run as already cancelled", async () => {
    await expect(
      cancelPetrinautOptimizationRun({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        fetchImpl: async () =>
          Response.json(
            { detail: "optimization run not found: run-42" },
            { status: 404 },
          ),
      }),
    ).resolves.toBeUndefined();
  });

  it("surfaces any other upstream failure", async () => {
    const result = cancelPetrinautOptimizationRun({
      endpoint: "http://petrinaut-opt.test",
      runId: "run-42",
      fetchImpl: async () =>
        Response.json({ detail: "cancellation failed" }, { status: 500 }),
    });

    await expect(result).rejects.toBeInstanceOf(PetrinautOptimizerHttpError);
    await expect(result).rejects.toMatchObject({
      message: "cancellation failed",
      status: 500,
    });
  });

  it("escapes the run id in the DELETE URL", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(new Response(null, { status: 204 })),
    );

    await cancelPetrinautOptimizationRun({
      endpoint: "http://petrinaut-opt.test",
      runId: "run/../42",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/optimize/runs/run%2F..%2F42"),
      expect.anything(),
    );
  });
});
