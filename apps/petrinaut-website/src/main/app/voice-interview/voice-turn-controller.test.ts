import { describe, expect, test, vi } from "vitest";

import {
  createVoiceMessageId,
  VoiceTurnController,
} from "./voice-turn-controller";

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
  const controller = new VoiceTurnController({
    conversationId: "preview/net 1",
    session,
    submitText,
  });

  return {
    controller,
    emit: (event: OpenAIRealtimeSessionEvent) => listener?.(event),
    session,
    submitText,
  };
};

const key = (connectionEpoch: number, itemId: string, contentIndex = 0) => ({
  connectionEpoch,
  contentIndex,
  itemId,
});

describe("VoiceTurnController", () => {
  test("refuses to open the microphone while Brunch is busy", async () => {
    const harness = createHarness();
    harness.controller.updateChatStatus("streaming");

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
    harness.controller.updateChatStatus("streaming");
    await starting;

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot().phase).toBe("waiting");

    harness.controller.updateChatStatus("ready");

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(harness.controller.getSnapshot().phase).toBe("listening");
  });

  test("pauses an open microphone for a non-voice Brunch turn", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.controller.updateChatStatus("submitted");

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot().phase).toBe("waiting");

    harness.controller.updateChatStatus("ready");

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

    harness.controller.updateChatStatus("ready");
    expect(harness.controller.getSnapshot().phase).toBe("waiting");
    harness.controller.updateChatStatus("streaming");
    harness.controller.updateChatStatus("ready");
    expect(harness.controller.getSnapshot().phase).toBe("listening");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
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
    harness.controller.updateChatStatus("streaming");
    harness.controller.updateChatStatus("ready");

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
    harness.controller.updateChatStatus("streaming");

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

    harness.controller.updateChatStatus("ready");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(harness.controller.getSnapshot().phase).toBe("listening");
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
    harness.controller.updateChatStatus("streaming");
    harness.controller.updateChatStatus("ready");

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
});
