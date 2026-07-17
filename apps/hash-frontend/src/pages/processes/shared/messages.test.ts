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

  it("rejects unknown host message kinds", () => {
    expect(isHostToIframeMessage({ kind: "notAHostMessage" })).toBe(false);
  });
});
