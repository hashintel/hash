import { describe, expect, test, vi } from "vitest";

import {
  createVoiceMessageId,
  VoiceTurnController,
} from "./voice-turn-controller";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";

const createHarness = () => {
  let epoch = 0;
  let listener: ((event: OpenAIRealtimeSessionEvent) => void) | undefined;
  const session = {
    connect: vi.fn(async () => ++epoch),
    disconnect: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(),
    subscribe: vi.fn((next: (event: OpenAIRealtimeSessionEvent) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  };
  const submitText = vi.fn(async () => ({ kind: "message" as const }));
  const playback = {
    cancel: vi.fn(),
    play: vi.fn(
      async (
        _segment: CanonicalSpeechSegment,
        events: { onPlaying?: () => void } = {},
      ) => {
        events.onPlaying?.();
      },
    ),
  };
  const controller = new VoiceTurnController({
    conversationId: "preview/net 1",
    playback,
    session,
    submitText,
  });

  return {
    controller,
    emit: (event: OpenAIRealtimeSessionEvent) => listener?.(event),
    playback,
    session,
    submitText,
  };
};

const key = (connectionEpoch: number, itemId: string, contentIndex = 0) => ({
  connectionEpoch,
  contentIndex,
  itemId,
});

const canonicalSegment = (
  id: string,
  text = `Canonical text for ${id}`,
): CanonicalSpeechSegment => ({
  contentHash: "fnv1a32:12345678",
  id,
  messageId: "assistant-1",
  partId: "text:0",
  source: "assistant-text",
  text,
});

const updateChatStatus = (
  controller: VoiceTurnController,
  status: "ready" | "submitted" | "streaming" | "error",
) => controller.updateChat({ canonicalSegments: [], status });

describe("VoiceTurnController", () => {
  test("does not surface an unrelated Brunch error before voice starts", async () => {
    const harness = createHarness();

    harness.controller.updateChat({
      canonicalSegments: [],
      status: "error",
    });

    expect(harness.controller.getSnapshot().phase).toBe("idle");
    expect(harness.playback.cancel).not.toHaveBeenCalled();

    await harness.controller.start();
    expect(harness.controller.getSnapshot()).toMatchObject({
      errorMessage: "Wait for Brunch to finish before starting voice input.",
      phase: "recoverable-error",
    });
  });

  test("refuses to open the microphone while Brunch is busy", async () => {
    const harness = createHarness();
    updateChatStatus(harness.controller, "streaming");

    await harness.controller.start();

    expect(harness.session.connect).not.toHaveBeenCalled();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot()).toMatchObject({
      errorMessage: "Wait for Brunch to finish before starting voice input.",
      phase: "recoverable-error",
    });
  });

  test("keeps the microphone closed if Brunch becomes busy while connecting", async () => {
    const harness = createHarness();

    const starting = harness.controller.start();
    updateChatStatus(harness.controller, "streaming");
    expect(harness.controller.getSnapshot().phase).toBe("connecting");
    await starting;

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot().phase).toBe("waiting");

    updateChatStatus(harness.controller, "ready");

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(harness.controller.getSnapshot().phase).toBe("listening");
  });

  test("preserves a Brunch error that occurs while voice is connecting", async () => {
    const harness = createHarness();
    let finishConnection: (() => void) | undefined;
    harness.session.connect.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishConnection = () => resolve(1);
        }),
    );

    const starting = harness.controller.start();
    updateChatStatus(harness.controller, "error");
    finishConnection?.();
    await starting;

    expect(harness.session.disconnect).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot()).toMatchObject({
      errorMessage:
        "Brunch could not complete the current turn. Use the composer to retry.",
      phase: "recoverable-error",
    });
  });

  test("pauses an open microphone for a non-voice Brunch turn", async () => {
    const harness = createHarness();
    await harness.controller.start();

    updateChatStatus(harness.controller, "submitted");

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot().phase).toBe("waiting");

    updateChatStatus(harness.controller, "ready");

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(harness.controller.getSnapshot().phase).toBe("listening");
  });

  test("does not start a second connection from a non-idle transition", async () => {
    const harness = createHarness();

    await harness.controller.start();
    await harness.controller.start();

    expect(harness.session.connect).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().phase).toBe("listening");
  });

  test("submits one completed transcript through the composer and keeps partials display-only", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emit({
      key: key(1, "item-a"),
      text: "The ",
      type: "partial",
    });
    harness.emit({
      key: key(1, "item-a"),
      text: "support",
      type: "partial",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      partialText: "The support",
      phase: "transcribing",
    });
    expect(harness.submitText).not.toHaveBeenCalled();

    harness.emit({
      key: key(1, "item-a"),
      text: "The support lead triages it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());

    expect(harness.submitText).toHaveBeenCalledWith({
      id: createVoiceMessageId("preview/net 1", key(1, "item-a")),
      text: "The support lead triages it.",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot()).toMatchObject({
      lastCommittedText: "The support lead triages it.",
      partialText: "",
      phase: "waiting",
    });

    updateChatStatus(harness.controller, "ready");
    expect(harness.controller.getSnapshot().phase).toBe("waiting");
    updateChatStatus(harness.controller, "streaming");
    updateChatStatus(harness.controller, "ready");
    expect(harness.controller.getSnapshot().phase).toBe("listening");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
  });

  test("queues a late finalized transcript until Brunch is ready", async () => {
    const harness = createHarness();
    await harness.controller.start();
    updateChatStatus(harness.controller, "streaming");
    expect(harness.controller.getSnapshot().phase).toBe("waiting");

    harness.emit({
      connectionEpoch: 1,
      itemId: "late-item",
      type: "input-committed",
    });
    harness.emit({
      key: key(1, "late-item"),
      text: "The support lead triages it.",
      type: "completed",
    });

    expect(harness.submitText).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      lastCommittedText: "The support lead triages it.",
      partialText: "",
      phase: "waiting",
    });

    updateChatStatus(harness.controller, "ready");

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    expect(harness.submitText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "The support lead triages it." }),
    );
  });

  test("preserves the first pending transcript while Brunch is busy", async () => {
    const harness = createHarness();
    await harness.controller.start();
    updateChatStatus(harness.controller, "streaming");

    harness.emit({
      connectionEpoch: 1,
      itemId: "first-item",
      type: "input-committed",
    });
    harness.emit({
      key: key(1, "first-item"),
      text: "The support lead triages it.",
      type: "completed",
    });
    harness.emit({
      connectionEpoch: 1,
      itemId: "second-item",
      type: "input-committed",
    });
    harness.emit({
      key: key(1, "second-item"),
      text: "The incident manager closes it.",
      type: "completed",
    });

    updateChatStatus(harness.controller, "ready");

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    expect(harness.submitText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "The support lead triages it." }),
    );
    expect(harness.controller.getSnapshot().lastCommittedText).toBe(
      "The support lead triages it.",
    );
  });

  test("retries a finalized transcript rejected by a concurrent Brunch turn", async () => {
    const harness = createHarness();
    harness.submitText.mockImplementationOnce(async () => {
      updateChatStatus(harness.controller, "streaming");
      throw new Error("Brunch became busy");
    });
    await harness.controller.start();

    harness.emit({
      key: key(1, "racing-item"),
      text: "The incident manager owns it.",
      type: "completed",
    });

    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("waiting"),
    );
    expect(harness.controller.getSnapshot().errorMessage).toBe("");

    updateChatStatus(harness.controller, "ready");

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledTimes(2));
    expect(harness.submitText).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "The incident manager owns it." }),
    );
  });

  test("closes the microphone when a partial transcript arrives", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emit({
      key: key(1, "item-a"),
      text: "The support",
      type: "partial",
    });

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot().phase).toBe("transcribing");
  });

  test("ignores duplicate, stale, and out-of-order completed items", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emit({
      key: key(2, "stale"),
      text: "Stale",
      type: "completed",
    });
    harness.emit({ key: key(1, "item-a"), text: "First", type: "partial" });
    harness.emit({
      key: key(1, "item-b"),
      text: "Out of order",
      type: "completed",
    });
    harness.emit({
      key: key(1, "item-a"),
      text: "Accepted final",
      type: "completed",
    });
    harness.emit({
      key: key(1, "item-a"),
      text: "Duplicate final",
      type: "completed",
    });

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    expect(harness.submitText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Accepted final" }),
    );
  });

  test("does not let a late duplicate block the next listening turn", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      key: key(1, "item-a"),
      text: "First final",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    updateChatStatus(harness.controller, "streaming");
    updateChatStatus(harness.controller, "ready");

    harness.emit({
      key: key(1, "item-a"),
      text: "Late duplicate",
      type: "completed",
    });
    harness.emit({
      key: key(1, "item-b"),
      text: "Second final",
      type: "completed",
    });

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledTimes(2));
    expect(harness.submitText).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "Second final" }),
    );
  });

  test("closes the listening window when VAD commits an item", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emit({
      connectionEpoch: 1,
      itemId: "item-a",
      type: "input-committed",
    });

    expect(harness.controller.getSnapshot().phase).toBe("transcribing");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("reopens listening after an empty completed transcript", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      connectionEpoch: 1,
      itemId: "empty-item",
      type: "input-committed",
    });

    harness.emit({
      key: key(1, "empty-item"),
      text: "   ",
      type: "completed",
    });

    expect(harness.submitText).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      partialText: "",
      phase: "listening",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
  });

  test("keeps the microphone closed when Brunch becomes busy before an empty transcript completes", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      connectionEpoch: 1,
      itemId: "empty-item",
      type: "input-committed",
    });
    updateChatStatus(harness.controller, "streaming");

    harness.emit({
      key: key(1, "empty-item"),
      text: "   ",
      type: "completed",
    });

    expect(harness.submitText).not.toHaveBeenCalled();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot().phase).toBe("waiting");

    updateChatStatus(harness.controller, "ready");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(harness.controller.getSnapshot().phase).toBe("listening");
  });

  test("queues an in-flight transcript when Brunch becomes busy", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      connectionEpoch: 1,
      itemId: "item-a",
      type: "input-committed",
    });
    harness.emit({
      key: key(1, "item-a"),
      text: "The support",
      type: "partial",
    });

    updateChatStatus(harness.controller, "streaming");

    expect(harness.controller.getSnapshot().phase).toBe("transcribing");
    harness.emit({
      key: key(1, "item-a"),
      text: "The support lead triages it.",
      type: "completed",
    });

    expect(harness.submitText).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      lastCommittedText: "The support lead triages it.",
      phase: "waiting",
    });

    updateChatStatus(harness.controller, "ready");

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    expect(harness.submitText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "The support lead triages it." }),
    );
  });

  test("finishes an in-flight transcript when a ready chat update arrives", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      connectionEpoch: 1,
      itemId: "item-a",
      type: "input-committed",
    });
    harness.emit({
      key: key(1, "item-a"),
      text: "The support",
      type: "partial",
    });

    harness.controller.updateChat({
      canonicalSegments: [
        canonicalSegment("canonical-speech:ready:text%3A0:fnv1a32:12345678"),
      ],
      status: "ready",
    });

    expect(harness.controller.getSnapshot().phase).toBe("transcribing");
    expect(harness.playback.play).not.toHaveBeenCalled();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );

    harness.emit({
      key: key(1, "item-a"),
      text: "The support lead triages it.",
      type: "completed",
    });

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    expect(harness.submitText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "The support lead triages it." }),
    );
  });

  test("starts queued speech after an empty transcript finishes", async () => {
    const harness = createHarness();
    const response = canonicalSegment(
      "canonical-speech:queued:text%3A0:fnv1a32:12345678",
    );
    await harness.controller.start();
    harness.emit({
      connectionEpoch: 1,
      itemId: "empty-item",
      type: "input-committed",
    });
    harness.controller.updateChat({
      canonicalSegments: [response],
      status: "ready",
    });

    expect(harness.controller.getSnapshot().phase).toBe("transcribing");
    expect(harness.playback.play).not.toHaveBeenCalled();

    harness.emit({
      key: key(1, "empty-item"),
      text: "   ",
      type: "completed",
    });

    await vi.waitFor(() =>
      expect(harness.playback.play).toHaveBeenCalledWith(
        response,
        expect.any(Object),
      ),
    );
    expect(harness.session.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  test("rejects events from a stopped epoch after reconnect", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({ key: key(1, "old"), text: "Old", type: "partial" });

    await harness.controller.end();
    expect(harness.controller.getSnapshot()).toMatchObject({
      partialText: "",
      phase: "idle",
    });
    await harness.controller.start();
    harness.emit({
      key: key(1, "old"),
      text: "Stale final",
      type: "completed",
    });

    expect(harness.submitText).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().phase).toBe("listening");
    expect(harness.session.connect).toHaveBeenCalledTimes(2);
    expect(harness.session.disconnect).toHaveBeenCalledOnce();
  });

  test("discards a partial when voice ends before completion", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      key: key(1, "unfinished"),
      text: "Not finalized",
      type: "partial",
    });

    await harness.controller.end();
    harness.emit({
      key: key(1, "unfinished"),
      text: "Late final",
      type: "completed",
    });

    expect(harness.submitText).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      partialText: "",
      phase: "idle",
    });
  });

  test("does not retract a finalized turn when voice ends during delivery", async () => {
    const harness = createHarness();
    let finishDelivery: (() => void) | undefined;
    harness.submitText.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelivery = () => resolve({ kind: "message" as const });
        }),
    );
    await harness.controller.start();

    harness.emit({
      key: key(1, "accepted"),
      text: "Accepted final",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    await harness.controller.end();
    finishDelivery?.();
    await Promise.resolve();

    expect(harness.submitText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Accepted final" }),
    );
    expect(harness.controller.getSnapshot()).toMatchObject({
      lastCommittedText: "Accepted final",
      phase: "idle",
    });
  });

  test("keeps the microphone closed and exposes recoverable failures", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emit({
      message: "The voice connection failed. Try reconnecting.",
      type: "error",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      errorMessage: "The voice connection failed. Try reconnecting.",
      phase: "recoverable-error",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("does not let a late delivery overwrite a connection failure", async () => {
    const harness = createHarness();
    let finishDelivery: (() => void) | undefined;
    harness.submitText.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelivery = () => resolve({ kind: "message" as const });
        }),
    );
    await harness.controller.start();
    harness.emit({
      key: key(1, "item-a"),
      text: "The support lead triages it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());

    harness.emit({
      message: "The voice connection failed. Try reconnecting.",
      type: "error",
    });
    finishDelivery?.();
    await Promise.resolve();

    expect(harness.controller.getSnapshot()).toMatchObject({
      errorMessage: "The voice connection failed. Try reconnecting.",
      phase: "recoverable-error",
    });
  });

  test("submits corrections as new explicit text turns", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      key: key(1, "item-a"),
      text: "The support lead closes it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    updateChatStatus(harness.controller, "streaming");
    updateChatStatus(harness.controller, "ready");

    await harness.controller.submitCorrection(
      "The incident manager closes it.",
    );

    expect(harness.submitText).toHaveBeenCalledTimes(2);
    expect(harness.submitText).toHaveBeenLastCalledWith({
      target: "message",
      text: 'Correction to my previous voice answer "The support lead closes it.": The incident manager closes it.',
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("seeds finalized history without replaying it when voice starts or reconnects", async () => {
    const harness = createHarness();
    const history = canonicalSegment(
      "canonical-speech:history:text%3A0:fnv1a32:12345678",
    );
    harness.controller.updateChat({
      canonicalSegments: [history],
      status: "ready",
    });

    await harness.controller.start();
    await harness.controller.reconnect();

    expect(harness.playback.play).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().phase).toBe("listening");
  });

  test("speaks a finalized segment that arrives while voice is connecting", async () => {
    const harness = createHarness();
    const response = canonicalSegment(
      "canonical-speech:connecting:text%3A0:fnv1a32:12345678",
    );

    const starting = harness.controller.start();
    expect(harness.controller.getSnapshot().phase).toBe("connecting");
    harness.controller.updateChat({
      canonicalSegments: [response],
      status: "ready",
    });

    expect(harness.playback.play).not.toHaveBeenCalled();
    await starting;
    await vi.waitFor(() =>
      expect(harness.playback.play).toHaveBeenCalledWith(
        response,
        expect.any(Object),
      ),
    );
  });

  test("queues canonical speech before an atomic ready update can reopen the microphone", async () => {
    const harness = createHarness();
    let finishPlayback: (() => void) | undefined;
    harness.playback.play.mockImplementationOnce(async (_segment, events) => {
      events?.onPlaying?.();
      await new Promise<void>((resolve) => {
        finishPlayback = resolve;
      });
    });
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer"),
      text: "A finalized answer",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    harness.controller.updateChat({
      canonicalSegments: [],
      status: "streaming",
    });
    const response = canonicalSegment(
      "canonical-speech:response:text%3A0:fnv1a32:12345678",
    );

    harness.controller.updateChat({
      canonicalSegments: [response],
      status: "ready",
    });

    expect(harness.playback.play).toHaveBeenCalledOnce();
    expect(harness.playback.play.mock.calls[0]?.[0]).toBe(response);
    expect(typeof harness.playback.play.mock.calls[0]?.[1]?.onPlaying).toBe(
      "function",
    );
    expect(harness.controller.getSnapshot().phase).toBe("playing");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );

    finishPlayback?.();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("listening"),
    );
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
  });

  test("shows waiting after speech drains while Brunch is still busy", async () => {
    const harness = createHarness();
    let finishPlayback: (() => void) | undefined;
    harness.playback.play.mockImplementationOnce(async (_segment, events) => {
      events?.onPlaying?.();
      await new Promise<void>((resolve) => {
        finishPlayback = resolve;
      });
    });
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer"),
      text: "A finalized answer",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());

    harness.controller.updateChat({
      canonicalSegments: [
        canonicalSegment(
          "canonical-speech:busy-response:text%3A0:fnv1a32:12345678",
        ),
      ],
      status: "streaming",
    });

    expect(harness.controller.getSnapshot().phase).toBe("playing");
    finishPlayback?.();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("waiting"),
    );
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );

    updateChatStatus(harness.controller, "ready");
    expect(harness.controller.getSnapshot().phase).toBe("listening");
  });

  test("speaks finalized segments in order and reopens only after the queue drains", async () => {
    const harness = createHarness();
    const playbackResolvers: Array<() => void> = [];
    harness.playback.play.mockImplementation(async (_segment, events) => {
      events?.onPlaying?.();
      await new Promise<void>((resolve) => playbackResolvers.push(resolve));
    });
    await harness.controller.start();
    const first = canonicalSegment(
      "canonical-speech:first:text%3A0:fnv1a32:12345678",
    );
    const second = canonicalSegment(
      "canonical-speech:second:text%3A0:fnv1a32:12345678",
    );

    harness.controller.updateChat({
      canonicalSegments: [first],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.playback.play).toHaveBeenCalledOnce(),
    );
    harness.controller.updateChat({
      canonicalSegments: [first, second],
      status: "ready",
    });
    expect(harness.playback.play).toHaveBeenCalledOnce();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );

    playbackResolvers.shift()?.();
    await vi.waitFor(() =>
      expect(harness.playback.play).toHaveBeenCalledTimes(2),
    );
    expect(harness.playback.play).toHaveBeenNthCalledWith(
      2,
      second,
      expect.any(Object),
    );
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );

    playbackResolvers.shift()?.();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("listening"),
    );
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
  });

  test("keeps the microphone closed and visible text available when speech fails", async () => {
    const harness = createHarness();
    harness.playback.play.mockRejectedValueOnce(
      new Error(
        "The response could not be spoken. Read the visible text instead.",
      ),
    );
    await harness.controller.start();
    const response = canonicalSegment(
      "canonical-speech:failed:text%3A0:fnv1a32:12345678",
      "The visible response remains available.",
    );

    harness.controller.updateChat({
      canonicalSegments: [response],
      status: "ready",
    });

    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot()).toMatchObject({
        errorMessage:
          "The response could not be spoken. Read the visible text instead.",
        phase: "recoverable-error",
      }),
    );
    expect(response.text).toBe("The visible response remains available.");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("does not overwrite a speech failure when delivery resolves later", async () => {
    const harness = createHarness();
    let finishDelivery: (() => void) | undefined;
    const delivery = new Promise<{ kind: "message" }>((resolve) => {
      finishDelivery = () => resolve({ kind: "message" });
    });
    harness.submitText.mockImplementationOnce(() => delivery);
    harness.playback.play.mockRejectedValueOnce(
      new Error(
        "The response could not be spoken. Read the visible text instead.",
      ),
    );
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer"),
      text: "A finalized answer",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    harness.controller.updateChat({
      canonicalSegments: [],
      status: "streaming",
    });
    harness.controller.updateChat({
      canonicalSegments: [
        canonicalSegment("canonical-speech:failed:text%3A0:fnv1a32:12345678"),
      ],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("recoverable-error"),
    );

    finishDelivery?.();
    await delivery;
    await Promise.resolve();

    expect(harness.controller.getSnapshot()).toMatchObject({
      errorMessage:
        "The response could not be spoken. Read the visible text instead.",
      phase: "recoverable-error",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("cancels speech synchronously and rejects stale playback events when voice ends", async () => {
    const harness = createHarness();
    let playbackEvents: { onPlaying?: () => void } | undefined;
    let finishPlayback: (() => void) | undefined;
    harness.playback.play.mockImplementationOnce(async (_segment, events) => {
      playbackEvents = events;
      await new Promise<void>((resolve) => {
        finishPlayback = resolve;
      });
    });
    await harness.controller.start();
    harness.controller.updateChat({
      canonicalSegments: [
        canonicalSegment("canonical-speech:stale:text%3A0:fnv1a32:12345678"),
      ],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.playback.play).toHaveBeenCalledOnce(),
    );

    const ending = harness.controller.end();
    expect(harness.playback.cancel).toHaveBeenCalledOnce();
    playbackEvents?.onPlaying?.();
    finishPlayback?.();
    await ending;

    expect(harness.controller.getSnapshot().phase).toBe("idle");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });
});
