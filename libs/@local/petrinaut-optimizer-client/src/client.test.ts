import { describe, expect, it, vi } from "vitest";

import { createPetrinautOptimizerClient } from "./client.js";

describe("createPetrinautOptimizerClient", () => {
  it("calls the injected fetch with the (url, init) shape", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(Response.json({ run_id: "run-1" }, { status: 201 })),
    );
    const client = createPetrinautOptimizerClient(
      "http://petrinaut-opt.test",
      fetchImpl,
    );

    const created = await client.postOptimizeRuns(
      { name: "study" },
      {
        headers: {
          "x-hash-account-id": "user-1",
          "x-hash-request-id": "request-1",
        },
      },
    );

    expect(created.status).toBe(201);
    expect(created.data).toEqual({ run_id: "run-1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://petrinaut-opt.test/optimize/runs");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ name: "study" });
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-hash-account-id")).toBe("user-1");
    expect(headers.get("x-hash-request-id")).toBe("request-1");
  });

  it("keeps an endpoint's path prefix and encodes path parameters", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    const client = createPetrinautOptimizerClient(
      "http://localhost:5173/api/petrinaut-opt",
      fetchImpl,
    );

    const cancelled = await client.deleteOptimizeRun("run 1/../x?y");

    expect(cancelled.status).toBe(204);
    expect(cancelled.data).toBeUndefined();
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://localhost:5173/api/petrinaut-opt/optimize/runs/run%201%2F..%2Fx%3Fy",
    );
  });

  it("types declared error bodies and surfaces undeclared ones as text", async () => {
    const fetchImpl = vi
      .fn<(url: string | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json(
          { detail: "An optimization is already running for this account" },
          { status: 429, headers: { "retry-after": "30" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response("Internal Server Error", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
      );
    const client = createPetrinautOptimizerClient(
      "http://petrinaut-opt.test",
      fetchImpl,
    );

    const busy = await client.postOptimizeRuns({});
    expect(busy.status).toBe(429);
    if (busy.status === 429) {
      expect(busy.data.detail).toBe(
        "An optimization is already running for this account",
      );
    }
    expect(busy.headers.get("retry-after")).toBe("30");

    const crashed = await client.postOptimizeRuns({});
    expect(crashed).toMatchObject({
      data: "Internal Server Error",
      status: 500,
    });
  });
});
