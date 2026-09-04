import { describe, expect, test, vi } from "vitest";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";

import {
  createRealtimeSubmissionId,
  RealtimeBrunchBridge,
  type RealtimeBrunchBridgeEvent,
} from "./realtime-brunch-bridge";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";

const segment = (
  id: string,
  text: string,
  submissionId?: string,
): CanonicalSpeechSegment => ({
  contentHash: "fnv1a32:12345678",
  id,
  messageId: `message-${id}`,
  partId: id,
  source: "assistant-text",
  ...(submissionId === undefined ? {} : { submissionIds: [submissionId] }),
  text,
});

const transcriptKey = (
  connectionEpoch: number,
  itemId = "user-item-1",
  contentIndex = 0,
): OpenAIRealtimeTranscriptKey => ({ connectionEpoch, contentIndex, itemId });

const completedTranscript = (
  connectionEpoch: number,
  text = "The supervisor approves it.",
  itemId = "user-item-1",
  contentIndex = 0,
): Extract<OpenAIRealtimeSessionEvent, { readonly text: string }> => ({
  key: transcriptKey(connectionEpoch, itemId, contentIndex),
  text,
  type: "completed",
});

const failedTranscript = (
  connectionEpoch: number,
  itemId = "user-item-1",
): Extract<OpenAIRealtimeSessionEvent, { type: "transcription-failed" }> => ({
  key: transcriptKey(connectionEpoch, itemId),
  type: "transcription-failed",
});

const completedResponseMessage = (
  messageId: string,
  submissionId: string,
  index: number,
) => ({
  messageId,
  position: { batch: 1, index },
  submissionId,
});

const createHarness = () => {
  let listener: ((event: OpenAIRealtimeSessionEvent) => void) | undefined;
  const session = {
    speakCanonical: vi.fn(),
    subscribe: vi.fn((next: (event: OpenAIRealtimeSessionEvent) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  };
  const submitInterviewAnswer = vi.fn<
    ConstructorParameters<
      typeof RealtimeBrunchBridge
    >[0]["submitInterviewAnswer"]
  >(async (input) => {
    input.onAdmission("submission-voice-1");
    return {
      kind: "message",
      messageId: input.id,
      submissionId: "submission-voice-1",
    };
  });
  const bridge = new RealtimeBrunchBridge({
    session,
    submitInterviewAnswer,
  });
  const events: RealtimeBrunchBridgeEvent[] = [];
  bridge.subscribe((event) => events.push(event));

  return {
    bridge,
    emit: (event: OpenAIRealtimeSessionEvent) => listener?.(event),
    events,
    session,
    submitInterviewAnswer,
  };
};

const startReady = (
  harness: ReturnType<typeof createHarness>,
  connectionEpoch = 3,
): void => {
  harness.bridge.updateChat({
    canAcceptInterviewAnswer: true,
    canonicalSegments: [],
    status: "ready",
  });
  harness.bridge.start(connectionEpoch);
};

describe("RealtimeBrunchBridge", () => {
  test("rehydrates settled canonical speech without submission or playback", () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        segment("settled", "Already delivered.", "submission-settled"),
      ],
      status: "ready",
    });

    harness.bridge.start(9);

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events).toEqual([]);
  });

  test("submits only a completed transcript through the user admission target", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    const key = transcriptKey(7);

    harness.emit({ key, text: "The supervisor", type: "partial" });
    harness.emit({
      arguments: '{"answer":"Fabricated answer"}',
      callId: "legacy-call",
      connectionEpoch: 7,
      itemId: "legacy-item",
      name: "continue_interview",
      responseId: "legacy-response",
      type: "tool-arguments-done",
    } as unknown as OpenAIRealtimeSessionEvent);
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.emit(completedTranscript(7, "  The   supervisor\napproves it.  "));

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const deliveryId = createRealtimeSubmissionId(key);
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        admissionTarget: { kind: "user", messageId: deliveryId },
        id: deliveryId,
        text: "The supervisor approves it.",
      }),
    );
    expect(harness.events).toContainEqual({
      answer: "The supervisor approves it.",
      deliveryId,
      type: "submission-started",
    });
    expect(JSON.stringify(harness.events)).not.toContain("Fabricated answer");
  });

  test("rejects unfinished input invalidated by output and accepts fresh input", async () => {
    const harness = createHarness();
    startReady(harness);

    harness.emit({
      connectionEpoch: 3,
      itemId: "item-before-output",
      type: "input-speech-started",
    });
    harness.emit({
      connectionEpoch: 3,
      responseId: "response-output",
      speechRequestId: "speech-output",
      type: "output-started",
    });
    harness.emit(
      completedTranscript(3, "This completed too late.", "item-before-output"),
    );

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.emit({
      connectionEpoch: 3,
      responseId: "response-output",
      type: "output-stopped",
    });
    harness.emit({
      connectionEpoch: 3,
      itemId: "item-after-output",
      type: "input-speech-started",
    });
    harness.emit(completedTranscript(3, "This is fresh.", "item-after-output"));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "This is fresh." }),
    );

    harness.emit(completedTranscript(3, "Stale replay.", "item-before-output"));
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
  });

  test("rejects unfinished input as soon as canonical speech is requested", async () => {
    const harness = createHarness();
    startReady(harness);

    harness.emit({
      connectionEpoch: 3,
      itemId: "item-before-request",
      type: "input-speech-started",
    });
    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-request",
      type: "canonical-speech-requested",
    });
    harness.emit(
      completedTranscript(
        3,
        "This completed before output started.",
        "item-before-request",
      ),
    );

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.emit(
      completedTranscript(
        3,
        "The stale item cannot recover authority.",
        "item-before-request",
      ),
    );
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.bridge.completeTurnHandoff();
    harness.emit({
      connectionEpoch: 3,
      itemId: "item-after-handoff",
      type: "input-speech-started",
    });
    harness.emit(
      completedTranscript(3, "This is fresh.", "item-after-handoff"),
    );

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "This is fresh." }),
    );
  });

  test("derives stable delivery identity from epoch, item, and content index", () => {
    expect(
      createRealtimeSubmissionId(transcriptKey(12, "item/with spaces", 4)),
    ).toBe("voice-realtime:12:item%2Fwith%20spaces:4");
  });

  test("submits duplicate completed transcript events exactly once", async () => {
    const harness = createHarness();
    startReady(harness);
    const transcript = completedTranscript(3);

    harness.emit(transcript);
    harness.emit(transcript);

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.events).toContainEqual({
      reason: "duplicate",
      type: "transcript-rejected",
    });
  });

  test.each([
    ["", "empty"],
    [" \n\t ", "empty"],
    ["a".repeat(32_001), "over-limit"],
  ] as const)(
    "rejects an invalid completed transcript as %s",
    (text, reason) => {
      const harness = createHarness();
      startReady(harness);

      harness.emit(completedTranscript(3, text));

      expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
      expect(harness.events).toEqual([{ reason, type: "transcript-rejected" }]);
    },
  );

  test("rejects a failed transcript and accepts the next keyed turn", async () => {
    const harness = createHarness();
    startReady(harness);

    harness.emit(failedTranscript(3, "failed-item"));
    expect(harness.events).toEqual([
      { reason: "failed", type: "transcript-rejected" },
    ]);

    harness.emit(completedTranscript(3, "Retried answer.", "retry-item"));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Retried answer." }),
      ),
    );
  });

  test("rejects completed transcripts while the shared submission path is unavailable", () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.bridge.start(3);

    harness.emit(completedTranscript(3));

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      { reason: "unavailable", type: "transcript-rejected" },
    ]);
  });

  test("ignores transcripts from an inactive connection epoch", () => {
    const harness = createHarness();
    startReady(harness, 2);

    harness.emit(completedTranscript(1, "Stale answer"));
    harness.emit(failedTranscript(1, "stale-failed"));

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([]);
  });

  test("correlates the admitted submission with exact canonical response segments", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const input = harness.submitInterviewAnswer.mock.calls[0]?.[0];
    expect(input).toBeDefined();

    input?.onAdmission("submission-voice-1");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "submitted",
    });
    const unrelated = segment(
      "unrelated",
      "Do not speak this.",
      "submission-other",
    );
    const correlated = segment(
      "correlated",
      "Speak this canonical response.",
      "submission-voice-1",
    );
    const correlatedQuestion: CanonicalSpeechSegment = {
      ...segment(
        "correlated-question",
        "Which operator confirms the batch?",
        "submission-voice-1",
      ),
      messageId: correlated.messageId,
      source: "assistant-question",
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [unrelated, correlated],
      questionSegment: correlatedQuestion,
      status: "ready",
    });

    const deliveryId = createRealtimeSubmissionId(transcriptKey(7));
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([correlated]);
    expect(harness.events.map(({ type }) => type)).toEqual([
      "submission-started",
      "submission-admitted",
      "submission-accepted",
      "canonical-text-ready",
      "submission-settled",
      "canonical-response-ready",
    ]);
    expect(harness.events.at(-1)).toEqual({
      deliveryId,
      questionSegment: correlatedQuestion,
      segments: [correlated],
      type: "canonical-response-ready",
    });
  });

  test("speaks a completed canonical segment while chat remains streaming and settles separately", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const correlated = segment(
      "correlated",
      "Speak this committed response.",
      "submission-voice-1",
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [correlated],
      status: "streaming",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(correlated.messageId, "submission-voice-1", 1),
    );

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([correlated]);
    expect(harness.events.map(({ type }) => type)).not.toContain(
      "submission-settled",
    );
    expect(harness.events.map(({ type }) => type)).not.toContain(
      "canonical-response-ready",
    );

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [correlated],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledOnce();
    expect(harness.events.slice(-2).map(({ type }) => type)).toEqual([
      "submission-settled",
      "canonical-response-ready",
    ]);
  });

  test("does not let a completed reasoning-only or tool-only step authorize later text", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });

    const messageId = "reasoning-or-tool-message";
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.bridge.notifyResponseMessageStarted({
      messageId,
      position: { batch: 1, index: 2 },
      submissionId: "submission-voice-1",
    });
    const laterText = {
      ...segment(
        "not-yet-completed",
        "Do not let the earlier completion authorize this text.",
      ),
      messageId,
      submissionIds: ["submission-voice-1"],
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [laterText],
      status: "streaming",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(messageId, "submission-voice-1", 3),
    );
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([laterText]);
  });

  test("speaks later continuation segments once and in canonical order", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    const first = {
      ...segment("first", "First committed segment."),
      messageId: "assistant-response",
      submissionIds: ["submission-voice-1"],
    };
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [first],
      status: "streaming",
    });
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-voice-1", 1),
    );

    const second = {
      ...segment("second", "Second committed segment."),
      messageId: first.messageId,
      submissionIds: ["submission-voice-1", "submission-continuation"],
    };
    const third = {
      ...segment("third", "Third committed segment."),
      messageId: first.messageId,
      submissionIds: ["submission-voice-1", "submission-continuation"],
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [first, second, third],
      status: "streaming",
    });
    expect(harness.session.speakCanonical).toHaveBeenCalledTimes(1);

    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-continuation", 2),
    );

    const fourth = {
      ...segment("fourth", "Fourth committed segment."),
      messageId: first.messageId,
      submissionIds: ["submission-voice-1", "submission-continuation"],
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [first, second, third, fourth],
      status: "streaming",
    });
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-continuation", 3),
    );

    expect(harness.session.speakCanonical.mock.calls).toEqual([
      [[first]],
      [[second, third]],
      [[fourth]],
    ]);
  });

  test("does not start speech cancelled while its correlated response is pending", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });

    harness.bridge.cancelPendingSpeech();

    const correlated = segment(
      "correlated",
      "Retain this without speaking it.",
      "submission-voice-1",
    );
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(correlated.messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [correlated],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [correlated],
      status: "ready",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events.at(-1)).toMatchObject({
      segments: [correlated],
      speechCancelled: true,
      type: "canonical-response-ready",
    });
  });

  test("does not speak a completed segment from an aborted submission", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const aborted = segment(
      "aborted",
      "Never speak an aborted response.",
      "submission-voice-1",
    );
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(aborted.messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [aborted],
      settlements: [{ outcome: "aborted", submissionId: "submission-voice-1" }],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [aborted],
      settlements: [{ outcome: "aborted", submissionId: "submission-voice-1" }],
      status: "ready",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events.at(-1)).toEqual({
      deliveryId: createRealtimeSubmissionId(transcriptKey(7)),
      outcome: "aborted",
      type: "submission-stopped",
    });
  });

  test("rejects a path-B result that does not preserve the delivery identity", async () => {
    const harness = createHarness();
    harness.submitInterviewAnswer.mockResolvedValueOnce({
      kind: "message",
      messageId: "different-message",
      submissionId: "submission-voice-1",
    });
    startReady(harness);

    harness.emit(completedTranscript(3));

    await vi.waitFor(() =>
      expect(harness.events).toContainEqual(
        expect.objectContaining({
          code: "interview-correlation",
          type: "error",
        }),
      ),
    );
  });

  test.each([
    {
      code: "admission-rejected",
      failure: { kind: "rejected", status: 403 } as const,
      message: "Brunch rejected the message before admission (HTTP 403).",
    },
    {
      code: "admission-conflict",
      failure: {
        kind: "submission-conflict",
        status: 409,
        submissionId: "submission-existing",
      } as const,
      message:
        "The delivery key already belongs to admitted submission submission-existing; the changed payload was not admitted.",
    },
    {
      code: "admission-ambiguous",
      failure: { kind: "ambiguous" } as const,
      message:
        "Brunch may have accepted the message, but admission could not be confirmed. Reopen the conversation before trying again.",
    },
    {
      code: "admission-aborted",
      failure: { kind: "aborted" } as const,
      message: "The local chat submission was cancelled.",
    },
  ])(
    "preserves a $failure.kind admission outcome",
    async ({ code, failure, message }) => {
      const harness = createHarness();
      harness.submitInterviewAnswer.mockRejectedValueOnce(
        new FlueChatAdmissionError(failure),
      );
      startReady(harness);

      harness.emit(completedTranscript(3));

      await vi.waitFor(() =>
        expect(harness.events).toContainEqual({
          code,
          failure,
          message,
          type: "error",
        }),
      );
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    },
  );

  test("requires a shared chat busy cycle before accepting new canonical text", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit(completedTranscript(3));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const response = segment(
      "response",
      "Canonical response.",
      "submission-voice-1",
    );

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [response],
      status: "ready",
    });
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [response],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [response],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([response]);
  });
});
