import { describe, expect, it, vi } from "vitest";

import { createServicePetrinautOptimization } from "./service-optimization.js";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

const input = {
  objective: { direction: "maximize" },
  study: { trials: 2 },
} as PetrinautOptimizationInput;

const endpoint = () => new URL("/api/petrinaut-opt/", "http://localhost/");

describe("createServicePetrinautOptimization", () => {
  it("creates, attaches to, and cancels runs via the endpoint", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          Response.json({ run_id: "run-1" }, { status: 201 }),
        );
      }
      if (init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(
        new Response("id: 1\nevent: done\ndata: {}\n\n", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "x-requested-trials": "2",
          },
        }),
      );
    });
    const optimization = createServicePetrinautOptimization({
      endpoint,
      fetchImpl,
    });

    const { runId } = await optimization.createOptimizationRun(input);
    expect(runId).toBe("run-1");

    for await (const _event of optimization.attachOptimizationRun(runId)) {
      // Exhaust the stream so the shared client performs the request.
    }

    await optimization.cancelOptimizationRun(runId);

    const calledUrls = fetchImpl.mock.calls.map(([url]) => url.toString());
    expect(calledUrls).toEqual([
      expect.stringContaining("/api/petrinaut-opt/optimize/runs"),
      expect.stringContaining("/api/petrinaut-opt/optimize/runs/run-1/events"),
      expect.stringContaining("/api/petrinaut-opt/optimize/runs/run-1"),
    ]);
  });

  it("classifies a body that dies mid-stream as a network failure", async () => {
    // A dropped connection surfaces as a `TypeError` from the body reader,
    // after the response headers already arrived. Classifying that as
    // `protocol` would blame the optimizer for a transport problem.
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
              controller.error(new TypeError("network error"));
            },
          }),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      ),
    );
    const optimization = createServicePetrinautOptimization({
      endpoint,
      fetchImpl,
    });

    const onAttached = vi.fn();
    const error = await (async () => {
      try {
        for await (const _event of optimization.attachOptimizationRun("run-1", {
          onAttached,
        })) {
          // The stream fails before producing any event.
        }
        return null;
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(onAttached).toHaveBeenCalled();
    expect(error).toBeInstanceOf(TypeError);
    expect(error).toHaveProperty("category", "network");
  });
});
