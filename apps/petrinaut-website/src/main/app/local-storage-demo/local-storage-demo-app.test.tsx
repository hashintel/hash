/**
 * @vitest-environment jsdom
 */
import { isValidElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { VoiceInterviewControl } from "../voice-interview/voice-interview-control";
import { getBrunchVoiceMode } from "./local-storage-demo-app";

const defaultTransportOptions = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("./brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));

vi.mock("@hashintel/petrinaut/ui", () => ({
  DefaultChatTransport: class {
    public constructor(options: unknown) {
      defaultTransportOptions.current = options;
    }
  },
  Petrinaut: () => null,
  WalkthroughProvider: ({ children }: { children: ReactNode }) => children,
  definePetrinautAiInteractiveTool: (definition: unknown) => definition,
}));

describe("local storage demo Brunch voice integration", () => {
  test("does not install voice on the generic local chat fallback", () => {
    expect(getBrunchVoiceMode(null)).toBeUndefined();
  });

  test("installs the app-owned voice control for a configured Brunch transport", () => {
    const config = { available: true as const, connectionTimeoutMs: 15_000 };
    const voiceMode = getBrunchVoiceMode(config);
    const control = voiceMode?.({
      canAcceptVoiceInput: true,
      conversationId: "petrinaut-preview:net-1",
      inputMode: "text",
      isAiAssistantOpen: true,
      messages: [],
      registerVoiceModeControls: vi.fn(() => () => undefined),
      setInputMode: vi.fn(),
      setVoiceActive: vi.fn(),
      status: "ready",
      stop: vi.fn(async () => undefined),
      submitText: vi.fn(async () => ({
        kind: "message" as const,
        messageId: "message-1",
      })),
      submitVoiceInput: vi.fn(async () => ({
        kind: "message" as const,
        messageId: "voice-message-1",
      })),
    });

    expect(isValidElement(control)).toBe(true);
    if (!isValidElement(control)) {
      throw new Error("Expected the configured composer control to render.");
    }
    expect(control).toMatchObject({
      props: { config },
      type: VoiceInterviewControl,
    });
  });

  test("correlates the existing Brunch transport request", () => {
    const options = defaultTransportOptions.current as {
      readonly headers: () => Record<string, string>;
    };

    expect(options.headers()["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
