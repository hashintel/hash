import { describe, expect, it } from "vitest";

import { isHostToIframeMessage } from "./messages";

describe("isHostToIframeMessage", () => {
  it("accepts known host message kinds", () => {
    expect(isHostToIframeMessage({ kind: "setReadonly", readonly: true })).toBe(
      true,
    );
  });

  it("rejects unknown host message kinds", () => {
    expect(isHostToIframeMessage({ kind: "notAHostMessage" })).toBe(false);
  });
});
