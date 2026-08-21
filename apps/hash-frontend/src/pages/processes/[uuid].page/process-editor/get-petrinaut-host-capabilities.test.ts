import { describe, expect, it } from "vitest";

import { getPetrinautHostCapabilities } from "./get-petrinaut-host-capabilities";

const endpoint = "http://node-api.test/api/petrinaut-optimizer/capabilities";

describe("getPetrinautHostCapabilities", () => {
  it("returns the explicit authenticated host capability", async () => {
    let request: { input: string | URL; init?: RequestInit } | undefined;

    await expect(
      getPetrinautHostCapabilities({
        endpoint,
        fetchImpl: (input, init) => {
          request = { input, init };
          return Promise.resolve(Response.json({ optimization: false }));
        },
      }),
    ).resolves.toEqual({ optimization: false });

    expect(request).toMatchObject({
      input: endpoint,
      init: {
        credentials: "include",
        headers: { accept: "application/json" },
      },
    });
  });

  it("keeps optimization visible when the capability request fails", async () => {
    await expect(
      getPetrinautHostCapabilities({
        endpoint,
        fetchImpl: () => Promise.resolve(new Response(null, { status: 503 })),
      }),
    ).resolves.toEqual({ optimization: true });

    await expect(
      getPetrinautHostCapabilities({
        endpoint,
        fetchImpl: () =>
          Promise.reject(new Error("NodeAPI is temporarily unreachable")),
      }),
    ).resolves.toEqual({ optimization: true });
  });

  it("keeps optimization visible for an invalid capability response", async () => {
    await expect(
      getPetrinautHostCapabilities({
        endpoint,
        fetchImpl: () => Promise.resolve(Response.json({ optimization: "no" })),
      }),
    ).resolves.toEqual({ optimization: true });
  });
});
