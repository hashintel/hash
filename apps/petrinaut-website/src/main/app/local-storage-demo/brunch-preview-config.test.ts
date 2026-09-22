import { describe, expect, test } from "vitest";

import {
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
} from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  createBrunchPreviewConversationId,
  parseBrunchEvaluationMode,
  resolveBrunchPreviewConfig,
} from "./brunch-preview-config";

describe("Brunch preview host configuration", () => {
  test("keeps the local generic chat fallback voice-free", () => {
    expect(resolveBrunchPreviewConfig(undefined)).toEqual({
      chatEndpoint: "/api/chat",
      isBrunchConfigured: false,
      evaluationMode: "I",
      serverMode: INTEGRATED_BRUNCH_MODE,
    });
  });

  test("uses an explicitly configured Brunch transport endpoint", () => {
    expect(
      resolveBrunchPreviewConfig("  https://brunch.test/api/petrinaut/chat  "),
    ).toEqual({
      chatEndpoint: "https://brunch.test/api/petrinaut/chat",
      isBrunchConfigured: true,
      evaluationMode: "I",
      serverMode: INTEGRATED_BRUNCH_MODE,
    });
  });

  test.each([
    ["F", STOCK_OVER_FLUE_MODE],
    ["I", INTEGRATED_BRUNCH_MODE],
    ["A", BRUNCH_DECLARED_PROJECTION_MODE],
    ["B", BRUNCH_DEEP_CONSTRUCTION_MODE],
  ] as const)(
    "maps evaluation override %s to its exact server mode",
    (mode, serverMode) => {
      expect(resolveBrunchPreviewConfig("/agents/chat", mode)).toMatchObject({
        evaluationMode: mode,
        serverMode,
      });
    },
  );

  test("defaults only blank overrides to product I and rejects mislabeled evidence", () => {
    expect(parseBrunchEvaluationMode(undefined)).toBe("I");
    expect(parseBrunchEvaluationMode("   ")).toBe("I");
    expect(parseBrunchEvaluationMode(" a ")).toBe("A");
    expect(() => parseBrunchEvaluationMode(" x ")).toThrow(
      /VITE_BRUNCH_EVALUATION_MODE/u,
    );
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
