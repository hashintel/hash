import { describe, expect, it } from "vitest";

import { isHostToEditorMessage } from "./messages";

describe("isHostToEditorMessage", () => {
  it("accepts known host message kinds", () => {
    expect(isHostToEditorMessage({ kind: "setReadonly", readonly: true })).toBe(
      true,
    );
  });

  it("rejects unknown host message kinds", () => {
    expect(isHostToEditorMessage({ kind: "notAHostMessage" })).toBe(false);
  });
});
