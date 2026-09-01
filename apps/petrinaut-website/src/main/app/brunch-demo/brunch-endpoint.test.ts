import { describe, expect, it } from "vitest";

import { getBrunchEndpoint } from "./brunch-endpoint";

const baseUrl = "https://demo.petrinaut.org/brunch";

describe("getBrunchEndpoint", () => {
  it("returns a friendly error when the endpoint is missing", () => {
    expect(getBrunchEndpoint({ baseUrl, search: {} })).toEqual({
      ok: false,
      error: "Missing Brunch stream endpoint. Add ?sse=<url>.",
    });
  });

  it("distinguishes an empty endpoint from a missing one", () => {
    expect(getBrunchEndpoint({ baseUrl, search: { sse: "" } })).toEqual({
      ok: false,
      error: "Brunch endpoint is empty.",
    });
    expect(getBrunchEndpoint({ baseUrl, search: { sse: "   " } })).toEqual({
      ok: false,
      error: "Brunch endpoint is empty.",
    });
  });

  it("resolves a relative endpoint and retains the run id", () => {
    expect(
      getBrunchEndpoint({
        baseUrl,
        search: { runId: "run-1", sse: "/events" },
      }),
    ).toEqual({
      ok: true,
      endpoint: "https://demo.petrinaut.org/events",
      runId: "run-1",
    });
  });

  it("adds HTTP for loopback endpoints without a protocol", () => {
    expect(
      getBrunchEndpoint({
        baseUrl,
        search: { sse: "localhost:4000/events" },
      }),
    ).toEqual({
      ok: true,
      endpoint: "http://localhost:4000/events",
      runId: undefined,
    });
  });

  it("rejects endpoints that do not use HTTP", () => {
    expect(
      getBrunchEndpoint({
        baseUrl,
        search: { sse: "file:///tmp/events" },
      }),
    ).toEqual({
      ok: false,
      error: 'Brunch endpoint must use http(s), received "file:".',
    });
  });
});
