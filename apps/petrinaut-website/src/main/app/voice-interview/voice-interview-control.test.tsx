/**
 * @vitest-environment jsdom
 */
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  loadOpenAIVoiceConfig,
  VoiceInterviewControl,
  VoiceInterviewControlView,
} from "./voice-interview-control";

describe("voice interview control", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("loads only a schema-valid, available server configuration", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: true, connectionTimeoutMs: 15_000 }),
    );

    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toEqual({
      available: true,
      connectionTimeoutMs: 15_000,
    });
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/voice/config");
    expect(request).toMatchObject({
      cache: "no-store",
      method: "GET",
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);

    fetch.mockResolvedValueOnce(
      Response.json({ available: false, connectionTimeoutMs: 15_000 }),
    );
    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toBeNull();
    fetch.mockResolvedValueOnce(
      Response.json({ available: true, connectionTimeoutMs: "15000" }),
    );
    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toBeNull();
  });

  test("renders an accessible idle voice action and live status", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        correction=""
        onCorrectionChange={vi.fn()}
        onEnd={vi.fn()}
        onReconnect={vi.fn()}
        onStart={vi.fn()}
        onSubmitCorrection={vi.fn()}
        snapshot={{
          errorMessage: "",
          lastCommittedText: "",
          partialText: "",
          phase: "idle",
        }}
      />,
    );

    expect(html).toContain("Start voice input");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Voice input is off.");
  });

  test("labels the half-duplex listening state and keeps partial text visibly provisional", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        correction="The incident manager closes it."
        onCorrectionChange={vi.fn()}
        onEnd={vi.fn()}
        onReconnect={vi.fn()}
        onStart={vi.fn()}
        onSubmitCorrection={vi.fn()}
        snapshot={{
          errorMessage: "",
          lastCommittedText: "The support lead closes it.",
          partialText: "The next activity",
          phase: "listening",
        }}
      />,
    );

    expect(html).toContain("Microphone on. Listening.");
    expect(html).toContain("Live transcript (not sent)");
    expect(html).toContain("The next activity");
    expect(html).toContain(
      "Microphone on. Listening. Live transcript (not sent): The next activity",
    );
    expect(html).toContain("End voice input");
    expect(html).toContain("Correct last voice answer");
    expect(html).toContain("Send correction");
  });

  test("offers reconnection without reopening the microphone after failure", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        correction=""
        onCorrectionChange={vi.fn()}
        onEnd={vi.fn()}
        onReconnect={vi.fn()}
        onStart={vi.fn()}
        onSubmitCorrection={vi.fn()}
        snapshot={{
          errorMessage: "Microphone access is required.",
          lastCommittedText: "",
          partialText: "",
          phase: "recoverable-error",
        }}
      />,
    );

    expect(html).toContain("Microphone off. Microphone access is required.");
    expect(html).toContain("Reconnect voice input");
  });

  test("remains interactive after Strict Mode replays its effects", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: true, connectionTimeoutMs: 15_000 }),
    );
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <VoiceInterviewControl
              conversationId="petrinaut-preview:net-1"
              messages={[]}
              status="ready"
              stop={vi.fn(async () => undefined)}
              submitText={vi.fn(async () => ({
                kind: "message" as const,
                messageId: "message-1",
              }))}
              submitVoiceInput={vi.fn(async () => ({
                kind: "message" as const,
                messageId: "voice-message-1",
              }))}
            />
          </StrictMode>,
        );
      });

      const startButton = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Start voice input"]',
      );
      expect(startButton).not.toBeNull();

      await act(async () => {
        startButton!.click();
      });

      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(container.textContent).toContain(
        "Microphone access is required to start voice input.",
      );
      expect(
        container.querySelector('button[aria-label="Reconnect voice input"]'),
      ).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
