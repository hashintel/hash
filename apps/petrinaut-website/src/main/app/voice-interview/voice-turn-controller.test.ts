import { describe, expect, test, vi } from "vitest";

import { VoiceError } from "../../../voice-diagnostics";
import { VoiceTurnController } from "./voice-turn-controller";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";
import type { RealtimeBrunchBridgeEvent } from "./realtime-brunch-bridge";
import type { VoiceLatencyEvent } from "./voice-turn-controller";

const createHarness = () => {
  let epoch = 0;
  let now = 0;
  let sessionListener:
    | ((event: OpenAIRealtimeSessionEvent) => void)
    | undefined;
  let bridgeListener: ((event: RealtimeBrunchBridgeEvent) => void) | undefined;
  const session = {
    cancelOutput: vi.fn<() => Promise<void>>(async () => undefined),
    connect: vi.fn(async () => ++epoch),
    disconnect: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(),
    speakCanonical: vi.fn(),
    subscribe: vi.fn(
      (listener: (event: OpenAIRealtimeSessionEvent) => void) => {
        sessionListener = listener;
        return () => {
          sessionListener = undefined;
        };
      },
    ),
  };
  const bridge = {
    cancelPendingSpeech: vi.fn(),
    completeTurnHandoff: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    subscribe: vi.fn((listener: (event: RealtimeBrunchBridgeEvent) => void) => {
      bridgeListener = listener;
      return () => {
        bridgeListener = undefined;
      };
    }),
    updateChat: vi.fn(),
  };
  const submitText = vi.fn(async () => ({ kind: "message" as const }));
  const latencyEvents: VoiceLatencyEvent[] = [];
  const controller = new VoiceTurnController({
    bridge,
    now: () => now,
    onLatencyEvent: (event) => latencyEvents.push(event),
    session,
    submitText,
  });

  return {
    advanceTime: (elapsedMs: number) => {
      now += elapsedMs;
    },
    bridge,
    controller,
    emitBridge: (event: RealtimeBrunchBridgeEvent) => bridgeListener?.(event),
    emitSession: (event: OpenAIRealtimeSessionEvent) =>
      sessionListener?.(event),
    latencyEvents,
    session,
    submitText,
  };
};

const question = (
  id: string,
  text = "What happens after approval?",
): CanonicalSpeechSegment => ({
  contentHash: "fnv1a32:12345678",
  id,
  messageId: `message-${id}`,
  partId: id,
  source: "assistant-text",
  text,
});

const markedQuestion = (
  id: string,
  text = "What happens after approval?",
): CanonicalSpeechSegment => ({
  ...question(id, text),
  source: "assistant-question",
});

describe("VoiceTurnController", () => {
  test("records the content-free Voice lifecycle once in causal order", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emitBridge({
      answer: "Private finalized answer",
      deliveryId: "call-opaque",
      type: "submission-started",
    });
    harness.advanceTime(10);
    harness.emitBridge({
      deliveryId: "call-opaque",
      submissionId: "submission-opaque",
      type: "submission-admitted",
    });
    harness.emitBridge({
      deliveryId: "call-opaque",
      submissionId: "submission-opaque",
      type: "submission-admitted",
    });
    harness.advanceTime(10);
    harness.emitBridge({
      answer: "Private finalized answer",
      deliveryId: "call-opaque",
      type: "submission-accepted",
    });
    harness.emitBridge({
      deliveryId: "call-opaque",
      type: "canonical-text-ready",
    });
    harness.advanceTime(10);
    harness.emitBridge({
      deliveryId: "call-opaque",
      type: "submission-settled",
    });
    harness.advanceTime(10);
    harness.emitSession({
      connectionEpoch: 1,
      speechRequestId: "speech-opaque",
      type: "canonical-speech-requested",
    });
    harness.emitSession({
      connectionEpoch: 1,
      speechRequestId: "speech-duplicate",
      type: "canonical-speech-requested",
    });
    harness.advanceTime(10);
    const outputStarted: OpenAIRealtimeSessionEvent = {
      connectionEpoch: 1,
      responseId: "response-opaque",
      speechRequestId: "speech-opaque",
      type: "output-started",
    };
    harness.emitSession(outputStarted);
    harness.emitSession(outputStarted);

    expect(harness.latencyEvents).toEqual([
      {
        correlationId: "call-opaque",
        elapsedMs: 10,
        name: "submission-admitted",
      },
      {
        correlationId: "call-opaque",
        elapsedMs: 20,
        name: "first-canonical-text",
      },
      {
        correlationId: "call-opaque",
        elapsedMs: 30,
        name: "submission-settled",
      },
      {
        correlationId: "call-opaque",
        elapsedMs: 40,
        name: "first-tts-request",
      },
      {
        correlationId: "call-opaque",
        elapsedMs: 50,
        name: "first-tts-audio",
      },
    ]);
    expect(JSON.stringify(harness.latencyEvents)).not.toContain(
      "Private finalized answer",
    );

    await harness.controller.end();
    harness.emitBridge({
      deliveryId: "call-opaque",
      type: "submission-settled",
    });
    harness.emitSession(outputStarted);
    expect(harness.latencyEvents).toHaveLength(5);
  });

  test("opens a continuous microphone before starting canonical question speech", async () => {
    const harness = createHarness();
    const order: string[] = [];
    harness.session.setMicrophoneEnabled.mockImplementation((enabled) => {
      if (enabled) order.push("microphone-on");
    });
    harness.bridge.start.mockImplementation(() => order.push("bridge-start"));
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-1")],
      questionSegment: markedQuestion("ask-1"),
      status: "ready",
    });

    await harness.controller.start();

    expect(order).toEqual(["microphone-on", "bridge-start"]);
    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "connected",
      currentQuestion: "What happens after approval?",
      input: "listening",
      microphoneEnabled: true,
      output: "idle",
    });
  });

  test("tracks assistant playback without admitting automatic barge-in", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-1",
      speechRequestId: "speech-1",
      type: "output-started",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
      output: "speaking",
    });

    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-user",
      type: "input-speech-started",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      microphoneEnabled: true,
      output: "speaking",
    });
    expect(harness.session.cancelOutput).not.toHaveBeenCalled();
  });

  test("clears pre-output capture and only commits fresh post-handoff input", async () => {
    const harness = createHarness();
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-late-transcript")],
      questionSegment: markedQuestion("ask-late-transcript"),
      status: "ready",
    });
    await harness.controller.start();
    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-before-output",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-before-output",
      },
      text: "Pre-output partial",
      type: "partial",
    });
    expect(harness.controller.getSnapshot().partialText).toBe(
      "Pre-output partial",
    );

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-output",
      speechRequestId: "speech-output",
      type: "output-started",
    });
    harness.emitSession({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-before-output",
      },
      text: "This completed too late.",
      type: "completed",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      lastCommittedText: "",
      partialText: "",
    });

    await harness.controller.takeTurn();
    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-after-handoff",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-after-handoff",
      },
      text: "Fresh post-handoff answer.",
      type: "completed",
    });
    harness.emitBridge({
      answer: "Fresh post-handoff answer.",
      deliveryId: "fresh-delivery",
      type: "submission-started",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastCommittedText: "Fresh post-handoff answer.",
      partialText: "",
    });
  });

  test("clears capture when canonical speech is requested before output starts", async () => {
    const harness = createHarness();
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-request")],
      questionSegment: markedQuestion("ask-request"),
      status: "ready",
    });
    await harness.controller.start();
    harness.emitBridge({
      deliveryId: "voice-request",
      segments: [question("ask-request")],
      type: "canonical-response-ready",
    });
    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-before-request",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-before-request",
      },
      text: "Provisional pre-request words",
      type: "partial",
    });

    harness.emitSession({
      connectionEpoch: 1,
      speechRequestId: "speech-request",
      type: "canonical-speech-requested",
    });

    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot()).toMatchObject({
      canTakeTurn: true,
      lastCommittedText: "",
      partialText: "",
    });
    harness.emitSession({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-before-request",
      },
      text: "This completed before output started.",
      type: "completed",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      lastCommittedText: "",
      partialText: "",
    });
    expect(harness.submitText).not.toHaveBeenCalled();

    await harness.controller.takeTurn();
    expect(harness.bridge.completeTurnHandoff).toHaveBeenCalledOnce();
    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-after-handoff",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-after-handoff",
      },
      text: "Fresh post-handoff answer.",
      type: "completed",
    });
    harness.emitBridge({
      answer: "Fresh post-handoff answer.",
      deliveryId: "fresh-delivery",
      type: "submission-started",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastCommittedText: "Fresh post-handoff answer.",
      partialText: "",
    });
  });

  test("hands off an active response once and applies the latest mute preference after cancellation", async () => {
    const harness = createHarness();
    let finishCancellation: (() => void) | undefined;
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-handoff")],
      questionSegment: markedQuestion("ask-handoff"),
      status: "ready",
    });
    await harness.controller.start();
    harness.session.cancelOutput.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCancellation = resolve;
        }),
    );
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-handoff",
      speechRequestId: "speech-handoff",
      type: "output-started",
    });
    harness.session.cancelOutput.mockClear();

    expect(harness.controller.getSnapshot().canTakeTurn).toBe(true);
    const handoff = harness.controller.takeTurn();
    const repeatedHandoff = harness.controller.takeTurn();

    expect(repeatedHandoff).toBe(handoff);
    expect(harness.bridge.cancelPendingSpeech).toHaveBeenCalledOnce();
    expect(harness.session.cancelOutput).toHaveBeenCalledOnce();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.controller.getSnapshot()).toMatchObject({
      canTakeTurn: false,
      output: "cancelling",
    });

    harness.session.setMicrophoneEnabled.mockClear();
    harness.controller.setMicrophoneMuted(true);
    harness.controller.setMicrophoneMuted(false);
    expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().microphoneEnabled).toBe(true);

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-handoff",
      type: "output-interrupted",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-handoff",
      status: "cancelled",
      type: "response-terminal",
    });
    expect(harness.controller.getSnapshot().output).toBe("cancelling");

    finishCancellation?.();
    await handoff;

    expect(harness.session.setMicrophoneEnabled).toHaveBeenCalledOnce();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(harness.controller.getSnapshot()).toMatchObject({
      canTakeTurn: false,
      microphoneEnabled: true,
      output: "interrupted",
    });
  });

  test("keeps the user turn when cancelled pending speech settles later", async () => {
    const harness = createHarness();
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-handoff")],
      questionSegment: markedQuestion("ask-handoff"),
      status: "ready",
    });
    await harness.controller.start();
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-handoff",
      speechRequestId: "speech-handoff",
      type: "output-started",
    });

    await harness.controller.takeTurn();
    harness.session.setMicrophoneEnabled.mockClear();
    harness.emitBridge({
      deliveryId: "voice-1",
      segments: [question("ask-late", "Retained late response")],
      speechCancelled: true,
      type: "canonical-response-ready",
    });

    expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
      output: "interrupted",
    });
  });

  test("replays exact canonical response segments but does not infer a question from the final segment", async () => {
    const harness = createHarness();
    const context = question("context", "Approval is required before release.");
    const nextQuestion = question("ask-replay", "Who approves release?");
    await harness.controller.start();

    harness.emitBridge({
      deliveryId: "voice-1",
      segments: [context, nextQuestion],
      type: "canonical-response-ready",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      speechRequestId: "speech-source",
      type: "output-started",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      type: "output-stopped",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      canReadFullResponse: false,
      canRepeatQuestion: false,
    });
    harness.controller.readFullResponse();
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "unrelated-response",
      status: "completed",
      type: "response-terminal",
    });
    expect(harness.controller.getSnapshot().canRepeatQuestion).toBe(false);

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      status: "completed",
      type: "response-terminal",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      canReadFullResponse: true,
      canRepeatQuestion: false,
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.controller.readFullResponse();
    expect(harness.session.speakCanonical).toHaveBeenCalledOnce();
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([
      context,
      nextQuestion,
    ]);
  });

  test("repeats only the exact Brunch-marked question after replay settles", async () => {
    const harness = createHarness();
    const context = question("context", "Approval is required before release.");
    const finalProse = question(
      "response-prose",
      "The approver is recorded. I can explain the escalation path.",
    );
    const exactQuestion: CanonicalSpeechSegment = {
      ...question("marked-question", "Who approves release?"),
      messageId: finalProse.messageId,
      source: "assistant-question",
    };
    await harness.controller.start();

    harness.emitBridge({
      deliveryId: "voice-1",
      questionSegment: exactQuestion,
      segments: [context, finalProse],
      type: "canonical-response-ready",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      speechRequestId: "speech-source",
      type: "output-started",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      type: "output-stopped",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      status: "completed",
      type: "response-terminal",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      canReadFullResponse: true,
      canRepeatQuestion: true,
    });

    harness.controller.repeatQuestion();

    expect(harness.session.speakCanonical).toHaveBeenCalledOnce();
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([
      exactQuestion,
    ]);
  });

  test("disables replay while the user is capturing input", async () => {
    const harness = createHarness();
    const segment = question("ask-capture");
    await harness.controller.start();
    harness.emitBridge({
      deliveryId: "voice-1",
      segments: [segment],
      type: "canonical-response-ready",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      speechRequestId: "speech-source",
      type: "output-started",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      type: "output-stopped",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-source",
      status: "completed",
      type: "response-terminal",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      canReadFullResponse: true,
      canRepeatQuestion: false,
    });

    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-user",
      type: "input-speech-started",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      canReadFullResponse: false,
      canRepeatQuestion: false,
    });
  });

  test("keeps capture closed from submission until canonical output settles", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.session.setMicrophoneEnabled.mockClear();

    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-started",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastAnswerDelivery: "pending",
      lastCommittedText: "The supervisor approves it.",
      microphoneEnabled: true,
      output: "waiting-for-tool",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-accepted",
    });
    harness.emitBridge({
      deliveryId: "call-1",
      segments: [question("ask-2", "Who acts next?")],
      type: "canonical-response-ready",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      lastAnswerDelivery: "delivered",
      microphoneEnabled: true,
      output: "waiting-for-tool",
    });
    expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);

    harness.emitSession({
      connectionEpoch: 1,
      speechRequestId: "speech-next",
      type: "canonical-speech-requested",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-next",
      speechRequestId: "speech-next",
      type: "output-started",
    });
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-next",
      status: "completed",
      type: "response-terminal",
    });
    expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-next",
      type: "output-stopped",
    });
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
  });

  test("returns to listening after a durably stopped turn without speaking", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emitBridge({
      answer: "Stop this one.",
      deliveryId: "voice-1",
      type: "submission-started",
    });
    harness.emitBridge({
      answer: "Stop this one.",
      deliveryId: "voice-1",
      type: "submission-accepted",
    });
    harness.advanceTime(40);
    harness.emitBridge({ deliveryId: "voice-1", type: "submission-settled" });
    harness.emitBridge({
      deliveryId: "voice-1",
      outcome: "aborted",
      type: "submission-stopped",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      lastAnswerDelivery: "delivered",
      output: "idle",
    });
    expect(harness.latencyEvents).toContainEqual({
      correlationId: "voice-1",
      elapsedMs: 40,
      name: "submission-settled",
    });
  });

  test("restores submission state when resumed before Brunch releases the turn", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-started",
    });

    harness.controller.pause();
    await harness.controller.resume();

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastAnswerDelivery: "pending",
      microphoneEnabled: true,
    });

    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-accepted",
    });
    harness.emitBridge({
      deliveryId: "call-1",
      segments: [question("ask-2", "Who acts next?")],
      type: "canonical-response-ready",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      lastAnswerDelivery: "delivered",
    });
  });

  test("does not bind an accepted answer to a question that arrived during submission", async () => {
    const harness = createHarness();
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-1")],
      questionSegment: markedQuestion("ask-1"),
      status: "ready",
    });
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-started",
    });

    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-2", "Who acts next?")],
      questionSegment: markedQuestion("ask-2", "Who acts next?"),
      status: "ready",
    });
    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-accepted",
    });
    harness.emitBridge({
      deliveryId: "call-1",
      segments: [question("ask-2", "Who acts next?")],
      type: "canonical-response-ready",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      canReviseLastAnswer: false,
      currentQuestion: "Who acts next?",
      input: "listening",
      lastAnswerDelivery: "delivered",
    });
    await expect(
      harness.controller.submitCorrection("A corrected answer"),
    ).resolves.toBe(false);
    expect(harness.submitText).not.toHaveBeenCalled();
  });

  test("cancels pending output when a paused Brunch response arrives", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-started",
    });

    harness.controller.pause();
    harness.emitBridge({
      deliveryId: "call-1",
      segments: [question("ask-2", "Who acts next?")],
      type: "canonical-response-ready",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "paused",
      microphoneEnabled: false,
      output: "interrupted",
    });
    expect(harness.session.cancelOutput).toHaveBeenCalledTimes(2);

    await harness.controller.resume();
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
    });
  });

  test("keeps partial transcripts display-only and capture active", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-1",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-1" },
      text: "The supervisor",
      type: "partial",
    });
    harness.emitSession({
      key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-1" },
      text: " approves it",
      type: "partial",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
      partialText: "The supervisor approves it",
    });
    expect(harness.submitText).not.toHaveBeenCalled();
  });

  test.each(["empty", "failed"] as const)(
    "reports a recoverable not-heard notice for a %s transcript",
    async (reason) => {
      const harness = createHarness();
      await harness.controller.start();
      harness.emitSession({
        connectionEpoch: 1,
        itemId: "item-1",
        type: "input-speech-started",
      });
      harness.emitSession({
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-1" },
        text: "Provisional words",
        type: "partial",
      });

      harness.emitBridge({ reason, type: "transcript-rejected" });

      expect(harness.controller.getSnapshot()).toMatchObject({
        input: "listening",
        inputNotice: "not-heard",
        partialText: "",
      });
      expect(harness.submitText).not.toHaveBeenCalled();
    },
  );

  test("keeps completed display transcripts until submission and rejects late events", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-1",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-1" },
      text: "First answer",
      type: "partial",
    });
    harness.emitBridge({
      answer: "First answer",
      deliveryId: "call-1",
      type: "submission-started",
    });
    harness.emitBridge({
      deliveryId: "call-1",
      segments: [question("ask-2", "Who acts next?")],
      type: "canonical-response-ready",
    });

    harness.emitSession({
      key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-1" },
      text: "Late previous answer",
      type: "partial",
    });
    expect(harness.controller.getSnapshot().partialText).toBe("");

    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-2",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-2" },
      text: "Second answer",
      type: "partial",
    });
    harness.emitSession({
      key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-2" },
      text: "Second answer complete",
      type: "completed",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      lastCommittedText: "First answer",
      partialText: "Second answer complete",
    });
  });

  test("rejects a stale transcription failure after reconnect", async () => {
    const harness = createHarness();
    await harness.controller.start();
    await harness.controller.reconnect();
    harness.emitSession({
      connectionEpoch: 2,
      itemId: "reused-item-id",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: {
        connectionEpoch: 2,
        contentIndex: 0,
        itemId: "reused-item-id",
      },
      text: "Current answer",
      type: "partial",
    });

    harness.emitSession({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "reused-item-id",
      },
      type: "transcription-failed",
    });

    expect(harness.controller.getSnapshot().partialText).toBe("Current answer");
  });

  test("pauses and resumes input without ending the connection", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-1",
      speechRequestId: "speech-1",
      type: "output-started",
    });

    harness.controller.pause();

    expect(harness.session.cancelOutput).toHaveBeenCalledOnce();
    expect(harness.session.disconnect).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "connected",
      input: "paused",
      microphoneEnabled: false,
      output: "interrupted",
    });

    await harness.controller.resume();
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
    });
  });

  test("mutes capture without interrupting what the interviewer is saying", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-1",
      speechRequestId: "speech-1",
      type: "output-started",
    });

    harness.controller.setMicrophoneMuted(true);

    expect(harness.session.cancelOutput).not.toHaveBeenCalled();
    expect(harness.bridge.stop).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: false,
      microphoneLevel: 0,
      output: "speaking",
    });

    harness.emitSession({ level: 0.8, type: "microphone-level" });
    expect(harness.controller.getSnapshot().microphoneLevel).toBe(0);

    harness.controller.setMicrophoneMuted(false);
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
    });
  });

  test("ignores muting while the session is paused", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.controller.pause();
    harness.session.setMicrophoneEnabled.mockClear();

    harness.controller.setMicrophoneMuted(false);

    expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "paused",
      microphoneEnabled: false,
    });
  });

  test("latches pause while connecting and requires an explicit resume", async () => {
    const harness = createHarness();
    let finishConnection: ((epoch: number) => void) | undefined;
    harness.session.connect.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishConnection = resolve;
        }),
    );

    const start = harness.controller.start();
    harness.controller.pause();
    finishConnection?.(1);
    await start;

    expect(harness.bridge.start).not.toHaveBeenCalled();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);
    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "connected",
      input: "paused",
      microphoneEnabled: false,
      output: "idle",
    });

    await harness.controller.resume();
    expect(harness.bridge.start).toHaveBeenCalledWith(1);
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
    });
  });

  test("cancels output that starts while paused without exposing speaking", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.controller.pause();
    harness.session.cancelOutput.mockClear();
    const observedOutputs: string[] = [];
    harness.controller.subscribe(({ output }) => observedOutputs.push(output));

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-after-pause",
      speechRequestId: "speech-after-pause",
      type: "output-started",
    });

    expect(harness.session.cancelOutput).toHaveBeenCalledOnce();
    expect(observedOutputs).not.toContain("speaking");
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "paused",
      microphoneEnabled: false,
      output: "interrupted",
    });
  });

  test("ends all media and rejects events from the previous epoch", async () => {
    const harness = createHarness();
    await harness.controller.start();
    await harness.controller.end();
    harness.emitSession({
      connectionEpoch: 1,
      responseId: "stale-response",
      speechRequestId: "stale-speech",
      type: "output-started",
    });

    expect(harness.bridge.stop).toHaveBeenCalled();
    expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(harness.session.disconnect).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "idle",
      input: "paused",
      microphoneEnabled: false,
      output: "idle",
    });
  });

  test("queues a restart until teardown completes", async () => {
    const harness = createHarness();
    await harness.controller.start();
    let finishDisconnect: (() => void) | undefined;
    harness.session.disconnect.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishDisconnect = () => resolve(undefined);
        }),
    );

    const ending = harness.controller.end();
    const restarting = harness.controller.start();

    expect(harness.controller.getSnapshot().connection).toBe("idle");
    expect(harness.session.connect).toHaveBeenCalledOnce();
    finishDisconnect?.();
    await Promise.all([ending, restarting]);

    expect(harness.session.connect).toHaveBeenCalledTimes(2);
    expect(harness.controller.getSnapshot().connection).toBe("connected");
  });

  test("cancels a queued restart when voice is ended again", async () => {
    const harness = createHarness();
    await harness.controller.start();
    let finishDisconnect: (() => void) | undefined;
    harness.session.disconnect.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishDisconnect = () => resolve(undefined);
        }),
    );

    const firstEnd = harness.controller.end();
    const restarting = harness.controller.start();
    const secondEnd = harness.controller.end();
    finishDisconnect?.();
    await Promise.all([firstEnd, restarting, secondEnd]);

    expect(harness.session.connect).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().connection).toBe("idle");
  });

  test("reconnects with a new epoch", async () => {
    const harness = createHarness();
    await harness.controller.start();

    await harness.controller.reconnect();

    expect(harness.session.connect).toHaveBeenCalledTimes(2);
    expect(harness.bridge.start).toHaveBeenLastCalledWith(2);
    expect(harness.controller.getSnapshot().connection).toBe("connected");
  });

  test("keeps an unanswered question visible after reconnecting", async () => {
    const harness = createHarness();
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        question("ask-reconnect", "What happens after approval?"),
      ],
      questionSegment: markedQuestion(
        "ask-reconnect",
        "What happens after approval?",
      ),
      status: "ready",
    });
    await harness.controller.start();
    harness.emitSession({
      code: "network",
      message: "Voice connection unavailable.",
      requestId: "request-reconnect",
      type: "error",
    });

    await harness.controller.reconnect();

    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "connected",
      currentQuestion: "What happens after approval?",
    });
    expect(harness.session.connect).toHaveBeenCalledTimes(2);
  });

  test("keeps a question pending when answer submission fails before acceptance", async () => {
    const harness = createHarness();
    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        question("ask-failed-delivery", "What happens after approval?"),
      ],
      questionSegment: markedQuestion(
        "ask-failed-delivery",
        "What happens after approval?",
      ),
      status: "ready",
    });
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "call-1",
      type: "submission-started",
    });
    harness.emitBridge({
      code: "interview-submission",
      message: "Answer submission failed.",
      type: "error",
    });

    await harness.controller.reconnect();

    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "connected",
      currentQuestion: "What happens after approval?",
    });
    expect(harness.session.connect).toHaveBeenCalledTimes(2);
  });

  test.each([
    {
      code: "admission-rejected" as const,
      failure: { kind: "rejected", status: 403 } as const,
      message: "Brunch rejected the message before admission (HTTP 403).",
    },
    {
      code: "admission-conflict" as const,
      failure: {
        kind: "submission-conflict",
        status: 409,
        submissionId: "submission-existing",
      } as const,
      message:
        "The delivery key already belongs to admitted submission submission-existing; the changed payload was not admitted.",
    },
    {
      code: "admission-ambiguous" as const,
      failure: { kind: "ambiguous" } as const,
      message:
        "Brunch may have accepted the message, but admission could not be confirmed. Reopen the conversation before trying again.",
    },
    {
      code: "admission-aborted" as const,
      failure: { kind: "aborted" } as const,
      message: "The local chat submission was cancelled.",
    },
  ])("surfaces $failure.kind admission safely", async (admissionFailure) => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      deliveryId: "voice-turn-1",
      type: "submission-started",
    });

    harness.emitBridge({ ...admissionFailure, type: "error" });

    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "error",
      errorCode: admissionFailure.code,
      errorMessage: admissionFailure.message,
      lastAnswerDelivery: "failed",
    });
  });

  test("clears a provisional transcript when the interview fails", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitSession({
      connectionEpoch: 1,
      itemId: "item-1",
      type: "input-speech-started",
    });
    harness.emitSession({
      key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-1" },
      text: "Battery charger workflow",
      type: "partial",
    });
    expect(harness.controller.getSnapshot().partialText).toBe(
      "Battery charger workflow",
    );

    harness.emitBridge({
      code: "interview-correlation",
      message: "The interview could not continue.",
      type: "error",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      connection: "error",
      errorCode: "interview-correlation",
      microphoneEnabled: false,
      partialText: "",
    });
  });

  test("fails closed on session, bridge, and startup failures", async () => {
    const sessionFailure = createHarness();
    await sessionFailure.controller.start();
    sessionFailure.emitSession({
      code: "network",
      message: "Voice connection unavailable.",
      requestId: "request-1",
      type: "error",
    });
    expect(sessionFailure.controller.getSnapshot()).toMatchObject({
      connection: "error",
      errorCode: "network",
      input: "paused",
      microphoneEnabled: false,
    });

    const bridgeFailure = createHarness();
    await bridgeFailure.controller.start();
    bridgeFailure.emitBridge({
      answer: "Pending answer",
      deliveryId: "call-1",
      type: "submission-started",
    });
    bridgeFailure.emitBridge({
      code: "interview-correlation",
      message: "Stale tool call.",
      type: "error",
    });
    expect(bridgeFailure.controller.getSnapshot()).toMatchObject({
      connection: "error",
      errorCode: "interview-correlation",
      errorMessage: "Stale tool call.",
      lastAnswerDelivery: "failed",
    });

    const startupFailure = createHarness();
    startupFailure.session.connect.mockRejectedValueOnce(
      new VoiceError("connection", "microphone-permission", "request-2"),
    );
    await startupFailure.controller.start();
    expect(startupFailure.controller.getSnapshot()).toMatchObject({
      connection: "error",
      errorCode: "microphone-permission",
      errorRequestId: "request-2",
    });
  });
});
