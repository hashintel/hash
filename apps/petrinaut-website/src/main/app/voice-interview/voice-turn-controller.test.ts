import { describe, expect, test, vi } from "vitest";

import { VoiceError } from "../../../voice-diagnostics";
import { VoiceTurnController } from "./voice-turn-controller";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";
import type { RealtimeBrunchBridgeEvent } from "./realtime-brunch-bridge";

const createHarness = () => {
  let epoch = 0;
  let sessionListener:
    | ((event: OpenAIRealtimeSessionEvent) => void)
    | undefined;
  let bridgeListener: ((event: RealtimeBrunchBridgeEvent) => void) | undefined;
  const session = {
    cancelOutput: vi.fn(),
    connect: vi.fn(async () => ++epoch),
    disconnect: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(),
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
  const controller = new VoiceTurnController({ bridge, session, submitText });

  return {
    bridge,
    controller,
    emitBridge: (event: RealtimeBrunchBridgeEvent) => bridgeListener?.(event),
    emitSession: (event: OpenAIRealtimeSessionEvent) =>
      sessionListener?.(event),
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
  source: "brunch-ask",
  text,
});

describe("VoiceTurnController", () => {
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

  test("keeps capture active while the interviewer speaks and interrupts automatically", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emitSession({
      connectionEpoch: 1,
      responseId: "response-1",
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
      output: "interrupted",
    });
    expect(harness.session.cancelOutput).not.toHaveBeenCalled();
  });

  test("represents submitting and output independently without closing capture", async () => {
    const harness = createHarness();
    await harness.controller.start();

    harness.emitBridge({
      answer: "The supervisor approves it.",
      callId: "call-1",
      type: "submission-started",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastAnswerDelivery: "pending",
      lastCommittedText: "The supervisor approves it.",
      microphoneEnabled: true,
      output: "waiting-for-tool",
    });
    harness.emitBridge({
      answer: "The supervisor approves it.",
      callId: "call-1",
      type: "submission-accepted",
    });
    harness.emitBridge({
      callId: "call-1",
      segments: [question("ask-2", "Who acts next?")],
      type: "canonical-response-ready",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "listening",
      lastAnswerDelivery: "delivered",
      microphoneEnabled: true,
      output: "waiting-for-tool",
    });
    expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalledWith(
      false,
    );
  });

  test("restores submission state when resumed before Brunch releases the turn", async () => {
    const harness = createHarness();
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      callId: "call-1",
      type: "submission-started",
    });

    harness.controller.pause();
    harness.controller.resume();

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastAnswerDelivery: "pending",
      microphoneEnabled: true,
    });

    harness.emitBridge({
      answer: "The supervisor approves it.",
      callId: "call-1",
      type: "submission-accepted",
    });
    harness.emitBridge({
      callId: "call-1",
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
      status: "ready",
    });
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      callId: "call-1",
      type: "submission-started",
    });

    harness.controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question("ask-2", "Who acts next?")],
      status: "ready",
    });
    harness.emitBridge({
      answer: "The supervisor approves it.",
      callId: "call-1",
      type: "submission-accepted",
    });
    harness.emitBridge({
      callId: "call-1",
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
      callId: "call-1",
      type: "submission-started",
    });

    harness.controller.pause();
    harness.emitBridge({
      callId: "call-1",
      segments: [question("ask-2", "Who acts next?")],
      type: "canonical-response-ready",
    });

    expect(harness.controller.getSnapshot()).toMatchObject({
      input: "paused",
      microphoneEnabled: false,
      output: "interrupted",
    });
    expect(harness.session.cancelOutput).toHaveBeenCalledTimes(2);

    harness.controller.resume();
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
      callId: "call-1",
      type: "submission-started",
    });
    harness.emitBridge({
      callId: "call-1",
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

    harness.controller.resume();
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

    harness.controller.resume();
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
      status: "ready",
    });
    await harness.controller.start();
    harness.emitBridge({
      answer: "The supervisor approves it.",
      callId: "call-1",
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
      callId: "call-1",
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
