import { describe, expect, test } from "vitest";

import {
  createBrunchPreviewConversationId,
  resolveBrunchPreviewConfig,
} from "./brunch-preview-config";

describe("Brunch preview host configuration", () => {
  test("keeps the local generic chat fallback voice-free", () => {
    expect(resolveBrunchPreviewConfig(undefined)).toEqual({
      chatEndpoint: "/api/chat",
      isBrunchConfigured: false,
    });
  });

  test("uses an explicitly configured Brunch transport endpoint", () => {
    expect(
      resolveBrunchPreviewConfig("  https://brunch.test/api/petrinaut/chat  "),
    ).toEqual({
      chatEndpoint: "https://brunch.test/api/petrinaut/chat",
      isBrunchConfigured: true,
    });
  });

  test("derives a stable preview conversation identity from the saved net", () => {
    expect(createBrunchPreviewConversationId("net-123")).toBe(
      "petrinaut-preview:net-123",
    );
    expect(createBrunchPreviewConversationId("net-123")).toBe(
      "petrinaut-preview:net-123",
    );
  });
});
