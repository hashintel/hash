/**
 * @vitest-environment jsdom
 */
import { isValidElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { VoiceInterviewControl } from "../voice-interview/voice-interview-control";
import { getBrunchVoiceComposerControl } from "./local-storage-demo-app";

vi.mock("@hashintel/petrinaut/ui", () => ({
  DefaultChatTransport: class {},
  Petrinaut: () => null,
  WalkthroughProvider: ({ children }: { children: ReactNode }) => children,
  definePetrinautAiInteractiveTool: (definition: unknown) => definition,
}));

describe("local storage demo Brunch voice integration", () => {
  test("does not install voice on the generic local chat fallback", () => {
    expect(getBrunchVoiceComposerControl(false)).toBeUndefined();
  });

  test("installs the app-owned voice control for a configured Brunch transport", () => {
    const renderControl = getBrunchVoiceComposerControl(true);
    const control = renderControl?.({
      conversationId: "petrinaut-preview:net-1",
      messages: [],
      status: "ready",
      stop: vi.fn(async () => undefined),
      submitText: vi.fn(async () => ({
        kind: "message" as const,
        messageId: "message-1",
      })),
    });

    expect(isValidElement(control)).toBe(true);
    if (!isValidElement(control)) {
      throw new Error("Expected the configured composer control to render.");
    }
    expect(control.type).toBe(VoiceInterviewControl);
  });
});
