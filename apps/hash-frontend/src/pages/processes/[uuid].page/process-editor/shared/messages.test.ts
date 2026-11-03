import { describe, expect, it } from "vitest";

import { isEditorToHostMessage, isHostToEditorMessage } from "./messages";

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

describe("isEditorToHostMessage", () => {
  it("accepts known editor message kinds", () => {
    expect(isEditorToHostMessage({ kind: "dirtyChanged", isDirty: true })).toBe(
      true,
    );
  });

  it("rejects unknown editor message kinds", () => {
    expect(isEditorToHostMessage({ kind: "notAnEditorMessage" })).toBe(false);
  });
});
