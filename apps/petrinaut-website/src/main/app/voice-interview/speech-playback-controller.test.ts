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
  const revokeObjectURL = vi.fn();
  const controller = new SpeechPlaybackController({
    createAudio,
    createObjectURL,
    fetch,
    revokeObjectURL,
  });
  return {
    audio,
    controller,
    createAudio,
    createObjectURL,
    fetch,
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
      headers: { "content-type": "application/json" },
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
      "The response could not be spoken. Read the visible text instead.",
    );
    await expect(harness.controller.play(segment)).rejects.toThrow(
      "The response could not be spoken. Read the visible text instead.",
    );
    await expect(harness.controller.play(segment)).rejects.toThrow(
      "The response could not be spoken. Read the visible text instead.",
    );
    expect(harness.createAudio).not.toHaveBeenCalled();
  });

  test("rejects text that does not match its canonical fingerprint", async () => {
    const harness = createHarness();

    await expect(
      harness.controller.play({ ...segment, text: "Tampered text" }),
    ).rejects.toThrow(
      "The response could not be spoken. Read the visible text instead.",
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
  });

  test("turns audio startup and playback errors into the visible-text fallback", async () => {
    const harness = createHarness();
    harness.audio.audio.play.mockRejectedValueOnce(
      new DOMException("blocked", "NotAllowedError"),
    );

    await expect(harness.controller.play(segment)).rejects.toThrow(
      "The response could not be spoken. Read the visible text instead.",
    );
    expect(harness.revokeObjectURL).toHaveBeenCalledOnce();

    const secondHarness = createHarness();
    const playback = secondHarness.controller.play(segment);
    await vi.waitFor(() =>
      expect(secondHarness.audio.audio.play).toHaveBeenCalledOnce(),
    );
    secondHarness.audio.emit("error");
    await expect(playback).rejects.toThrow(
      "The response could not be spoken. Read the visible text instead.",
    );
    expect(secondHarness.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
