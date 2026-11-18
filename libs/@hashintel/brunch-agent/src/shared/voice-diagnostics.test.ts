import { describe, expect, test } from "vitest";

import { resolveVoiceRequestId } from "./voice-diagnostics";

const generatedRequestId = "00000000-0000-4000-8000-000000000099";

describe("resolveVoiceRequestId", () => {
  test.each([
    "00000000-0000-4000-8000-000000000001",
    "ABCDEF01-2345-4ABC-BDEF-0123456789AB",
  ])("preserves a valid UUID-v4 request ID: %s", (requestId) => {
    expect(resolveVoiceRequestId(requestId, () => generatedRequestId)).toBe(
      requestId,
    );
  });

  test.each([
    "00000000-0000-5000-8000-000000000001",
    "00000000-0000-4000-7000-000000000001",
    "g0000000-0000-4000-8000-000000000001",
    "000000000000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000001-extra",
  ])("replaces an invalid request ID: %s", (requestId) => {
    expect(resolveVoiceRequestId(requestId, () => generatedRequestId)).toBe(
      generatedRequestId,
    );
  });
});
