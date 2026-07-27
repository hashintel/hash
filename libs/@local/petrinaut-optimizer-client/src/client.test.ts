import { describe, expect, it, vi } from "vitest";

import { createPetrinautOptimizerClient } from "./client.js";

describe("createPetrinautOptimizerClient", () => {
  it("decomposes requests into the injected (url, init) fetch shape", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(Response.json({ run_id: "run-1" }, { status: 201 })),
    );
    const client = createPetrinautOptimizerClient(
      "http://petrinaut-opt.test",
      fetchImpl,
    );

    const { data, response } = await client.POST("/optimize/runs", {
      body: { name: "study" },
      headers: {
        "x-hash-account-id": "user-1",
        "x-hash-request-id": "request-1",
      },
    });

    expect(response.status).toBe(201);
    expect(data?.run_id).toBe("run-1");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://petrinaut-opt.test/optimize/runs");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ name: "study" });
    const headers = new Headers(init?.headers);
    expect(headers.get("x-hash-account-id")).toBe("user-1");
    expect(headers.get("x-hash-request-id")).toBe("request-1");
  });

  it("keeps an endpoint's path prefix when building URLs", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    const client = createPetrinautOptimizerClient(
      "http://localhost:5173/api/petrinaut-opt",
      fetchImpl,
    );

    await client.DELETE("/optimize/runs/{run_id}", {
      params: { path: { run_id: "run 1" } },
    });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://localhost:5173/api/petrinaut-opt/optimize/runs/run%201",
    );
  });
});
