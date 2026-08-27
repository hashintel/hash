import { describe, expect, test, vi } from "vitest";

import { VoiceError } from "../../../voice-diagnostics";
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
    commitInput: vi.fn(),
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
  const latencyEvents: Array<{
    elapsedMs: number;
    name: string;
    questionId: string;
  }> = [];
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
    now: (() => {
      let now = 1_000;
      return () => {
        now += 100;
        return now;
      };
    })(),
    onLatencyEvent: (event) => latencyEvents.push(event),
    playback,
    session,
    submitText,
  });

  return {
    controller,
    emit: (event: OpenAIRealtimeSessionEvent) => listener?.(event),
    latencyEvents,
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
  test("speaks a pending interview question and opens capture before generic chat settlement", async () => {
    const harness = createHarness();
    let finishPlayback: (() => void) | undefined;
    harness.playback.play.mockImplementationOnce(
      async (_segment, events = {}) => {
        events.onPlaying?.();
        await new Promise<void>((resolve) => {
          finishPlayback = resolve;
        });
      },
    );
    const question = {
      ...canonicalSegment("ask-1", "What happens after approval?"),
      source: "brunch-ask" as const,
    };

    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "streaming",
    });
    await harness.controller.start();

    expect(harness.playback.play).toHaveBeenCalledWith(
      question,
      expect.any(Object),
    );
    expect(harness.controller.getSnapshot()).toMatchObject({
      currentQuestion: "What happens after approval?",
      microphoneEnabled: false,
      phase: "playing",
    });

    finishPlayback?.();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot()).toMatchObject({
        microphoneEnabled: true,
        phase: "listening",
      }),
    );
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
  });

  test("cancels playback completely before enabling the microphone to interrupt", async () => {
    const order: string[] = [];
    const harness = createHarness();
    harness.playback.cancel.mockImplementation(() => order.push("cancel"));
    harness.session.setMicrophoneEnabled.mockImplementation((enabled) => {
      if (enabled) order.push("microphone-on");
    });
    harness.playback.play.mockImplementationOnce(
      async (_segment, events = {}) => {
        events.onPlaying?.();
        await new Promise(() => undefined);
      },
    );
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        {
          ...canonicalSegment("ask-1"),
          source: "brunch-ask" as const,
        },
      ],
      status: "streaming",
    });
    await harness.controller.start();

    harness.controller.interruptAndSpeak();

    expect(order.slice(-2)).toEqual(["cancel", "microphone-on"]);
    expect(harness.controller.getSnapshot()).toMatchObject({
      microphoneEnabled: true,
      phase: "listening",
    });
  });

  test("closes the microphone before committing when the expert is done speaking", async () => {
    const order: string[] = [];
    const harness = createHarness();
    harness.session.setMicrophoneEnabled.mockImplementation((enabled) => {
      if (!enabled) order.push("microphone-off");
    });
    harness.session.commitInput.mockImplementation(() => order.push("commit"));
    await harness.controller.start();
    order.length = 0;

    harness.controller.doneSpeaking();

    expect(order).toEqual(["microphone-off", "commit"]);
    expect(harness.controller.getSnapshot()).toMatchObject({
      microphoneEnabled: false,
      phase: "transcribing",
    });
  });

  test("records answer-to-question visibility and speech latency", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer-1"),
      text: "Approval sends it to dispatch.",
      type: "completed",
    });
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        {
          ...canonicalSegment("ask-next"),
          source: "brunch-ask" as const,
        },
      ],
      status: "streaming",
    });

    await vi.waitFor(() =>
      expect(harness.latencyEvents.map(({ name }) => name)).toEqual([
        "question-visible",
        "question-spoken-started",
        "question-spoken",
        "answer-ready",
      ]),
    );
    expect(harness.latencyEvents.every(({ elapsedMs }) => elapsedMs >= 0)).toBe(
      true,
    );
  });

  test("pauses without ending the connection and redoes an answer as an explicit correction", async () => {
    const harness = createHarness();
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        {
          ...canonicalSegment("ask-1"),
          source: "brunch-ask" as const,
        },
      ],
      status: "ready",
    });
    await harness.controller.start();

    harness.controller.pause();
    expect(harness.controller.getSnapshot()).toMatchObject({
      microphoneEnabled: false,
      phase: "paused",
    });
    expect(harness.session.disconnect).not.toHaveBeenCalled();

    harness.controller.resume();
    harness.emit({
      key: key(1, "answer-1"),
      text: "The operator approves it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    updateChatStatus(harness.controller, "streaming");
    updateChatStatus(harness.controller, "ready");
    harness.controller.redoAnswer();
    expect(harness.controller.getSnapshot().phase).toBe("listening");
    harness.emit({
      key: key(1, "answer-2"),
      text: "The shift lead approves it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledTimes(2));
    expect(harness.submitText).toHaveBeenLastCalledWith({
      target: "message",
      text: 'Correction to my previous voice answer "The operator approves it.": The shift lead approves it.',
    });
  });

  test("keeps redo disabled while the previous answer is pending", async () => {
    const harness = createHarness();
    let finishDelivery: (() => void) | undefined;
    harness.submitText.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelivery = () => resolve({ kind: "message" as const });
        }),
    );
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        {
          ...canonicalSegment("ask-pending-redo"),
          source: "brunch-ask" as const,
        },
      ],
      status: "ready",
    });
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer-pending-redo"),
      text: "The operator approves it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());

    harness.controller.redoAnswer();

    expect(harness.controller.getSnapshot()).toMatchObject({
      microphoneEnabled: false,
      phase: "delivering",
    });
    finishDelivery?.();
  });

  test("holds queued question speech while paused and starts it on resume", async () => {
    const harness = createHarness();
    let finishPlayback: (() => void) | undefined;
    harness.playback.play.mockImplementationOnce(
      async (_segment, events = {}) => {
        events.onPlaying?.();
        await new Promise<void>((resolve) => {
          finishPlayback = resolve;
        });
      },
    );
    await harness.controller.start();
    harness.controller.pause();
    const question = {
      ...canonicalSegment("ask-paused"),
      source: "brunch-ask" as const,
    };

    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "streaming",
    });

    expect(harness.playback.play).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      microphoneEnabled: false,
      phase: "paused",
    });

    harness.controller.resume();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("playing"),
    );
    expect(harness.playback.play).toHaveBeenCalledWith(
      question,
      expect.any(Object),
    );

    finishPlayback?.();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot()).toMatchObject({
        microphoneEnabled: true,
        phase: "listening",
      }),
    );
  });

  test("answers a new question normally after redo was armed", async () => {
    const harness = createHarness();
    const firstQuestion = {
      ...canonicalSegment("ask-first"),
      source: "brunch-ask" as const,
    };
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [firstQuestion],
      status: "ready",
    });
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer-first"),
      text: "The operator approves it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    updateChatStatus(harness.controller, "streaming");
    updateChatStatus(harness.controller, "ready");
    harness.controller.redoAnswer();

    const nextQuestion = {
      ...canonicalSegment("ask-next"),
      source: "brunch-ask" as const,
    };
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [firstQuestion, nextQuestion],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot()).toMatchObject({
        currentQuestion: nextQuestion.text,
        phase: "listening",
      }),
    );
    const nextAnswerKey = key(1, "answer-next");
    harness.emit({
      key: nextAnswerKey,
      text: "The supervisor dispatches it.",
      type: "completed",
    });

    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledTimes(2));
    expect(harness.submitText).toHaveBeenLastCalledWith({
      id: createVoiceMessageId("preview/net 1", nextAnswerKey),
      text: "The supervisor dispatches it.",
    });
  });

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
      errorMessage: "Wait for the current response to finish before starting.",
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
      errorMessage: "Wait for the current response to finish before starting.",
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
        "The interview could not complete that turn. Use the composer to retry.",
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
      code: "network",
      message:
        "The voice connection could not be reached. Check your connection, then reconnect voice input.",
      requestId: "voice-request-network",
      type: "error",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      errorCode: "network",
      errorMessage:
        "The voice connection could not be reached. Check your connection, then reconnect voice input.",
      errorRequestId: "voice-request-network",
      phase: "recoverable-error",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("reconnects to a pending question without waiting for generic chat settlement", async () => {
    const harness = createHarness();
    const question = {
      ...canonicalSegment("ask-reconnect", "What happens after approval?"),
      source: "brunch-ask" as const,
    };
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "streaming",
    });
    await harness.controller.start();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("listening"),
    );
    harness.emit({
      code: "network",
      message: "The voice connection failed. Try reconnecting.",
      requestId: "voice-request-reconnect",
      type: "error",
    });

    await harness.controller.reconnect();

    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot()).toMatchObject({
        currentQuestion: "What happens after approval?",
        microphoneEnabled: true,
        phase: "listening",
      }),
    );
    expect(harness.playback.play).toHaveBeenCalledTimes(2);
    expect(harness.session.connect).toHaveBeenCalledTimes(2);
  });

  test("replays a pending question after ending and restarting", async () => {
    const harness = createHarness();
    const question = {
      ...canonicalSegment("ask-restart", "What happens after approval?"),
      source: "brunch-ask" as const,
    };
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    await harness.controller.start();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("listening"),
    );

    await harness.controller.end();
    await harness.controller.start();

    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot()).toMatchObject({
        currentQuestion: "What happens after approval?",
        microphoneEnabled: true,
        phase: "listening",
      }),
    );
    expect(harness.playback.play).toHaveBeenCalledTimes(2);
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
      code: "network",
      message: "The voice connection failed. Try reconnecting.",
      requestId: "voice-request-late-delivery",
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

  test("ignores a typed correction while the previous answer is still pending", async () => {
    const harness = createHarness();
    let finishDelivery: (() => void) | undefined;
    harness.submitText
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishDelivery = () => resolve({ kind: "message" as const });
          }),
      )
      .mockRejectedValueOnce(new Error("A queued answer already exists"));
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer-pending"),
      text: "The support lead closes it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    expect(harness.controller.getSnapshot().phase).toBe("delivering");

    await harness.controller.submitCorrection(
      "The incident manager closes it.",
    );

    expect(harness.submitText).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().phase).toBe("delivering");
    finishDelivery?.();
  });

  test("ignores a typed correction while answer capacity is unavailable", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emit({
      key: key(1, "answer-before-capacity-closes"),
      text: "The support lead closes it.",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());
    updateChatStatus(harness.controller, "streaming");
    updateChatStatus(harness.controller, "ready");
    harness.controller.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "ready",
    });
    expect(harness.controller.getSnapshot().phase).toBe("listening");

    await harness.controller.submitCorrection(
      "The incident manager closes it.",
    );

    expect(harness.submitText).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().phase).toBe("listening");
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
      new VoiceError("speech", "network", "voice-request-speech"),
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
        errorCode: "network",
        errorMessage:
          "The speech service could not be reached. Read the visible response instead.",
        errorRequestId: "voice-request-speech",
        phase: "recoverable-error",
      }),
    );
    expect(response.text).toBe("The visible response remains available.");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("does not let late delivery completion overwrite active speech", async () => {
    const harness = createHarness();
    let finishDelivery: (() => void) | undefined;
    let finishPlayback: (() => void) | undefined;
    harness.submitText.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelivery = () => resolve({ kind: "message" as const });
        }),
    );
    harness.playback.play.mockImplementationOnce(async (_segment, events) => {
      events?.onPlaying?.();
      await new Promise<void>((resolve) => {
        finishPlayback = resolve;
      });
    });
    await harness.controller.start();
    harness.emit({
      key: key(1, "deferred-delivery"),
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
        canonicalSegment("canonical-speech:deferred:text%3A0:fnv1a32:12345678"),
      ],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("playing"),
    );

    finishDelivery?.();
    await Promise.resolve();

    expect(harness.controller.getSnapshot().phase).toBe("playing");
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );

    finishPlayback?.();
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("listening"),
    );
  });

  test("does not let late delivery completion clear a speech failure", async () => {
    const harness = createHarness();
    let finishDelivery: (() => void) | undefined;
    harness.submitText.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelivery = () => resolve({ kind: "message" as const });
        }),
    );
    harness.playback.play.mockRejectedValueOnce(
      new VoiceError("speech", "network", "voice-request-speech-failure"),
    );
    await harness.controller.start();
    harness.emit({
      key: key(1, "deferred-delivery"),
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
        canonicalSegment(
          "canonical-speech:failed-deferred:text%3A0:fnv1a32:12345678",
        ),
      ],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot()).toMatchObject({
        errorCode: "network",
        errorRequestId: "voice-request-speech-failure",
        phase: "recoverable-error",
      }),
    );

    finishDelivery?.();
    await Promise.resolve();

    expect(harness.controller.getSnapshot()).toMatchObject({
      errorCode: "network",
      errorRequestId: "voice-request-speech-failure",
      phase: "recoverable-error",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });

  test("does not flush a pending transcript after speech fails", async () => {
    const harness = createHarness();
    harness.playback.play.mockRejectedValueOnce(
      new VoiceError("speech", "network", "voice-request-pending-speech"),
    );
    await harness.controller.start();
    updateChatStatus(harness.controller, "streaming");
    harness.emit({
      key: key(1, "pending-answer"),
      text: "A pending finalized answer",
      type: "completed",
    });
    expect(harness.submitText).not.toHaveBeenCalled();

    harness.controller.updateChat({
      canonicalSegments: [
        canonicalSegment(
          "canonical-speech:pending-failed:text%3A0:fnv1a32:12345678",
        ),
      ],
      status: "streaming",
    });
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("recoverable-error"),
    );

    updateChatStatus(harness.controller, "ready");
    await Promise.resolve();

    expect(harness.submitText).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      errorCode: "network",
      errorRequestId: "voice-request-pending-speech",
      phase: "recoverable-error",
    });
  });

  test("does not overwrite a speech failure when delivery rejects while Brunch is busy", async () => {
    const harness = createHarness();
    let rejectDelivery: (() => void) | undefined;
    const delivery = new Promise<never>((_resolve, reject) => {
      rejectDelivery = () => reject(new Error("Brunch became busy"));
    });
    harness.submitText.mockImplementationOnce(() => delivery);
    harness.playback.play.mockRejectedValueOnce(
      new VoiceError("speech", "network", "voice-request-in-flight-speech"),
    );
    await harness.controller.start();
    harness.emit({
      key: key(1, "in-flight-answer"),
      text: "An in-flight finalized answer",
      type: "completed",
    });
    await vi.waitFor(() => expect(harness.submitText).toHaveBeenCalledOnce());

    harness.controller.updateChat({
      canonicalSegments: [
        canonicalSegment(
          "canonical-speech:in-flight-failed:text%3A0:fnv1a32:12345678",
        ),
      ],
      status: "streaming",
    });
    await vi.waitFor(() =>
      expect(harness.controller.getSnapshot().phase).toBe("recoverable-error"),
    );

    rejectDelivery?.();
    await expect(delivery).rejects.toThrow("Brunch became busy");
    await Promise.resolve();

    expect(harness.controller.getSnapshot()).toMatchObject({
      errorCode: "network",
      errorRequestId: "voice-request-in-flight-speech",
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
