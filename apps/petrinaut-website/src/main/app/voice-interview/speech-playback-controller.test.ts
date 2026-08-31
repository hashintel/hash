import { describe, expect, test, vi } from "vitest";

import { SpeechPlaybackController } from "./speech-playback-controller";

import type { CanonicalSpeechSegment } from "./canonical-speech";

const segment: CanonicalSpeechSegment = {
  contentHash: "fnv1a32:69f1e741",
  id: "canonical-speech:assistant-1:text%3A0:fnv1a32:69f1e741",
  messageId: "assistant-1",
  partId: "text:0",
  source: "assistant-text",
  text: "  Preserve this exact canonical text.  ",
};

const createAudioHarness = () => {
  const listeners = new Map<string, Set<() => void>>();
  const audio = {
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const typeListeners = listeners.get(type) ?? new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    }),
    pause: vi.fn(),
    play: vi.fn(async () => undefined),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  return {
    audio,
    emit: (type: "ended" | "error") => {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
  };
};

const createHarness = (
  fetch: typeof globalThis.fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Promise.resolve(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "audio/mpeg" },
      }),
    ),
  ),
) => {
  const audio = createAudioHarness();
  const createAudio = vi.fn(() => audio.audio);
  const createObjectURL = vi.fn(() => "blob:canonical-speech");
  const reportDiagnostic = vi.fn();
  const revokeObjectURL = vi.fn();
  const controller = new SpeechPlaybackController({
    createAudio,
    createObjectURL,
    createRequestId: () => "voice-speech-request",
    fetch,
    now: () => 100,
    reportDiagnostic,
    revokeObjectURL,
  });
  return {
    audio,
    controller,
    createAudio,
    createObjectURL,
    fetch,
    reportDiagnostic,
    revokeObjectURL,
  };
};

describe("SpeechPlaybackController", () => {
  test("posts the exact canonical text and resolves after audio playback ends", async () => {
    const harness = createHarness();
    const onPlaying = vi.fn();

    const playback = harness.controller.play(segment, { onPlaying });
    await vi.waitFor(() => expect(harness.createAudio).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(onPlaying).toHaveBeenCalledOnce());

    expect(harness.fetch).toHaveBeenCalledOnce();
    const [url, request] = vi.mocked(harness.fetch).mock.calls[0]!;
    expect(url).toBe("/api/voice/speech");
    expect(request).toMatchObject({
      body: JSON.stringify({ segmentId: segment.id, text: segment.text }),
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-request-id": "voice-speech-request",
      },
      method: "POST",
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(harness.createAudio).toHaveBeenCalledWith("blob:canonical-speech");
    expect(harness.audio.audio.play).toHaveBeenCalledOnce();

    harness.audio.emit("ended");
    await expect(playback).resolves.toBeUndefined();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith(
      "blob:canonical-speech",
    );
    expect(harness.reportDiagnostic.mock.calls).toEqual([
      [
        {
          durationMs: 0,
          operation: "speech",
          outcome: "success",
          requestId: "voice-speech-request",
          stage: "browser",
        },
      ],
      [
        {
          durationMs: 0,
          operation: "speech",
          outcome: "success",
          requestId: "voice-speech-request",
          stage: "playback",
        },
      ],
    ]);
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      segment.text,
    );
  });

  test("rejects failed and non-audio speech responses without creating audio", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("failed", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ not: "audio" }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "audio/wav" },
        }),
      );
    const harness = createHarness(fetch);

    await expect(harness.controller.play(segment)).rejects.toThrow(
      "The speech service returned an invalid response. Read the visible response instead.",
    );
    await expect(harness.controller.play(segment)).rejects.toThrow(
      "The speech service returned an invalid response. Read the visible response instead.",
    );
    await expect(harness.controller.play(segment)).rejects.toThrow(
      "The speech service returned an invalid response. Read the visible response instead.",
    );
    expect(harness.createAudio).not.toHaveBeenCalled();
  });

  test("rejects untrusted server-only diagnostics and request references", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("private provider response", {
          headers: {
            "x-petrinaut-voice-error": "microphone-permission",
            "x-request-id": "private transcript used as a request id",
          },
          status: 502,
        }),
    );
    const harness = createHarness(fetch);

    await expect(harness.controller.play(segment)).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-speech-request",
    });
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private transcript used as a request id",
    );
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private provider response",
    );
  });

  test("rejects text that does not match its canonical fingerprint", async () => {
    const harness = createHarness();

    await expect(
      harness.controller.play({ ...segment, text: "Tampered text" }),
    ).rejects.toThrow(
      "The speech service returned an invalid response. Read the visible response instead.",
    );

    expect(harness.fetch).not.toHaveBeenCalled();
  });

  test("aborts synthesis and ignores a response from a canceled generation", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const harness = createHarness(fetch);

    const playback = harness.controller.play(segment);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    harness.controller.cancel();

    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    resolveFetch?.(
      new Response(new Uint8Array([1]), {
        headers: { "content-type": "audio/mpeg" },
      }),
    );
    await Promise.resolve();
    expect(harness.createAudio).not.toHaveBeenCalled();
    expect(harness.reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "request-aborted",
        outcome: "aborted",
        requestId: "voice-speech-request",
        stage: "browser",
      }),
    );
  });

  test("pauses active audio, revokes its URL, and rejects stale completion on cancel", async () => {
    const harness = createHarness();
    const playback = harness.controller.play(segment);
    await vi.waitFor(() => expect(harness.audio.audio.play).toHaveBeenCalled());

    harness.controller.cancel();
    harness.audio.emit("ended");

    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.audio.audio.pause).toHaveBeenCalledOnce();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith(
      "blob:canonical-speech",
    );
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: "request-aborted",
        outcome: "aborted",
        stage: "playback",
      }),
    );
  });

  test("turns audio startup and playback errors into the visible-text fallback", async () => {
    const harness = createHarness();
    harness.audio.audio.play.mockRejectedValueOnce(
      new DOMException("blocked", "NotAllowedError"),
    );

    await expect(harness.controller.play(segment)).rejects.toThrow(
      "The speech service returned an invalid response. Read the visible response instead.",
    );
    expect(harness.revokeObjectURL).toHaveBeenCalledOnce();

    const secondHarness = createHarness();
    const playback = secondHarness.controller.play(segment);
    await vi.waitFor(() =>
      expect(secondHarness.audio.audio.play).toHaveBeenCalledOnce(),
    );
    secondHarness.audio.emit("error");
    await expect(playback).rejects.toThrow(
      "The speech service returned an invalid response. Read the visible response instead.",
    );
    expect(secondHarness.revokeObjectURL).toHaveBeenCalledOnce();
  });

  test("revokes the object URL when the audio element cannot be created", async () => {
    const harness = createHarness();
    harness.createAudio.mockImplementationOnce(() => {
      throw new Error("audio construction failed");
    });

    await expect(harness.controller.play(segment)).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-speech-request",
    });

    expect(harness.revokeObjectURL).toHaveBeenCalledWith(
      "blob:canonical-speech",
    );
  });

  test("classifies browser network failures without leaking diagnostics", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("private browser network detail");
    });
    const harness = createHarness(fetch);

    await expect(harness.controller.play(segment)).rejects.toMatchObject({
      code: "network",
      message:
        "The speech service could not be reached. Read the visible response instead.",
      requestId: "voice-speech-request",
    });
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private browser network detail",
    );
  });
});
