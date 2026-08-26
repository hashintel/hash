import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import {
  loadOpenAIVoiceConfig,
  VoiceInterviewControlView,
} from "./voice-interview-control";

describe("voice interview control", () => {
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
});
