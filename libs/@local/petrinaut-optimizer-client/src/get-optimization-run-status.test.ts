import { describe, expect, it, vi } from "vitest";

import { getPetrinautOptimizationRunStatus } from "./get-optimization-run-status.js";
import { PetrinautOptimizerHttpError } from "./optimizer-http.js";

describe("getPetrinautOptimizationRunStatus", () => {
  it("reads the run's phase and detail with the correlation header", async () => {
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async () =>
      Response.json({
        run_id: "run-42",
        phase: "running",
        detail: null,
        updated_at: "2026-07-19T00:00:00Z",
      }),
    );

    await expect(
      getPetrinautOptimizationRunStatus({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        fetchImpl,
        requestId: "request-123",
        signal,
      }),
    ).resolves.toEqual({ phase: "running", detail: null });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/status/run-42"),
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-hash-request-id": "request-123",
        },
        signal,
      },
    );
  });

  it("reads terminal phases with their detail", async () => {
    await expect(
      getPetrinautOptimizationRunStatus({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        fetchImpl: async () =>
          Response.json({
            run_id: "run-42",
            phase: "idle",
            detail: "optimization run cancelled",
          }),
      }),
    ).resolves.toEqual({ phase: "idle", detail: "optimization run cancelled" });
  });

  it("escapes the run id in the status URL", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ phase: "done" }));

    await getPetrinautOptimizationRunStatus({
      endpoint: "http://petrinaut-opt.test",
      runId: "run/../42",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://petrinaut-opt.test/status/run%2F..%2F42"),
      expect.anything(),
    );
  });

  it("surfaces an unknown run as an HTTP error", async () => {
    const result = getPetrinautOptimizationRunStatus({
      endpoint: "http://petrinaut-opt.test",
      runId: "run-unknown",
      fetchImpl: async () =>
        Response.json(
          { detail: "optimization run not found: run-unknown" },
          { status: 404 },
        ),
    });

    await expect(result).rejects.toBeInstanceOf(PetrinautOptimizerHttpError);
    await expect(result).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an unrecognized status payload", async () => {
    await expect(
      getPetrinautOptimizationRunStatus({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        fetchImpl: async () => Response.json({ phase: "paused" }),
      }),
    ).rejects.toThrow("invalid run status");
    await expect(
      getPetrinautOptimizationRunStatus({
        endpoint: "http://petrinaut-opt.test",
        runId: "run-42",
        fetchImpl: async () => new Response("running", { status: 200 }),
      }),
    ).rejects.toThrow("invalid run status");
  });
});
