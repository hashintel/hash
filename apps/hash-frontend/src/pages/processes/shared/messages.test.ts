import { describe, expect, it } from "vitest";

import { isHostToIframeMessage } from "./messages";

describe("isHostToIframeMessage", () => {
  it("validates optimizer capability messages", () => {
    expect(
      isHostToIframeMessage({
        kind: "setCapabilities",
        capabilities: { optimization: true },
      }),
    ).toBe(true);
    expect(
      isHostToIframeMessage({
        kind: "setCapabilities",
        capabilities: { optimization: "yes" },
      }),
    ).toBe(false);
    expect(
      isHostToIframeMessage({
        kind: "setCapabilities",
        capabilities: { optimization: true, unexpected: true },
      }),
    ).toBe(false);
  });

  it("accepts detached-run creation replies", () => {
    expect(
      isHostToIframeMessage({
        kind: "optimizationCreateResult",
        requestId: "req-1",
        ok: true,
        runId: "run-1",
      }),
    ).toBe(true);
  });

  it("rejects unknown host message kinds", () => {
    expect(isHostToIframeMessage({ kind: "notAHostMessage" })).toBe(false);
  });
});
