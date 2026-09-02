import { describe, expect, test, vi } from "vitest";

import {
  assemblePreparedInterviewSpeech,
  createRealtimeSubmissionId,
  RealtimeBrunchBridge,
  type RealtimeBrunchBridgeEvent,
} from "./realtime-brunch-bridge";

import type {
  CanonicalSpeechSegment,
  InterviewSpeechSource,
} from "./canonical-speech";
import type {
  InterviewSpeechPreparationRequest,
  InterviewSpeechPreparationResult,
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";

const segment = (
  id: string,
  text: string,
  source: CanonicalSpeechSegment["source"] = "brunch-ask",
): CanonicalSpeechSegment => ({
  contentHash: "fnv1a32:12345678",
  id,
  messageId: `message-${id}`,
  partId: id,
  source,
  text,
});

const speechSource = ({
  context = [],
  messageId = "message-current-turn",
  question = null,
}: {
  readonly context?: readonly CanonicalSpeechSegment[];
  readonly messageId?: string;
  readonly question?: CanonicalSpeechSegment | null;
}): InterviewSpeechSource => {
  const contextSegments = context.map((contextSegment) => ({
    ...contextSegment,
    messageId,
  }));
  const questionSegment = question ? { ...question, messageId } : null;
  return {
    contextSegments,
    fullResponseSegments: [
      ...contextSegments,
      ...(questionSegment ? [questionSegment] : []),
    ],
    messageId,
    questionSegment,
  };
};

const createHarness = () => {
  let listener: ((event: OpenAIRealtimeSessionEvent) => void) | undefined;
  const session = {
    prepareInterviewSpeech: vi.fn(
      async (
        request: InterviewSpeechPreparationRequest,
      ): Promise<InterviewSpeechPreparationResult> => ({
        context: "Prepared concise context.",
        kind: "prepared",
        sourceSegmentIds: request.sourceSegmentIds,
      }),
    ),
    speakCanonical: vi.fn(),
    speakPrepared: vi.fn(),
    subscribe: vi.fn((next: (event: OpenAIRealtimeSessionEvent) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  };
  const submitInterviewAnswer = vi.fn(
    async (): Promise<
      | { kind: "interactive-tool"; toolCallId: string }
      | { kind: "message"; messageId: string }
    > => ({
      kind: "interactive-tool",
      toolCallId: "ask-current",
    }),
  );
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

const transcriptKey = (
  connectionEpoch: number,
  itemId = "user-item-1",
  contentIndex = 0,
): OpenAIRealtimeTranscriptKey => ({ connectionEpoch, contentIndex, itemId });

const transcriptCompleted = (
  connectionEpoch: number,
  text = "The supervisor approves it.",
  itemId = "user-item-1",
): OpenAIRealtimeSessionEvent => ({
  key: transcriptKey(connectionEpoch, itemId),
  text,
  type: "completed",
});

const transcriptFailed = (
  connectionEpoch: number,
  itemId = "user-item-1",
): Extract<OpenAIRealtimeSessionEvent, { type: "transcription-failed" }> => ({
  key: transcriptKey(connectionEpoch, itemId),
  type: "transcription-failed",
});

const submitTranscript = (
  harness: ReturnType<typeof createHarness>,
  connectionEpoch = 1,
  text = "The supervisor approves it.",
  itemId = "user-item-1",
) => {
  harness.emit(transcriptCompleted(connectionEpoch, text, itemId));
};

describe("RealtimeBrunchBridge", () => {
  test("prepares only context and appends the exact canonical question", async () => {
    const harness = createHarness();
    const context = segment(
      "context",
      "This complete canonical explanation is deliberately long enough to be condensed before automatic speech.",
      "assistant-text",
    );
    const question = segment(
      "ask-current",
      "Who approves it: the manager or quality lead?",
    );
    const source = speechSource({ context: [context], question });
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...source.fullResponseSegments],
      status: "ready",
    });

    harness.bridge.start(4);

    await vi.waitFor(() =>
      expect(harness.session.speakPrepared).toHaveBeenCalledOnce(),
    );
    const preparationRequest =
      harness.session.prepareInterviewSpeech.mock.calls[0]?.[0];
    expect(typeof preparationRequest?.cacheKey).toBe("string");
    expect(preparationRequest).toEqual({
      cacheKey: preparationRequest?.cacheKey,
      contextText: [context.text],
      contextWordBudget: 42,
      sourceSegmentIds: [context.id],
    });
    expect(
      JSON.stringify(harness.session.prepareInterviewSpeech.mock.calls),
    ).not.toContain(question.text);
    expect(harness.session.speakPrepared).toHaveBeenCalledWith([
      "Prepared concise context.",
      question.text,
    ]);
    expect(source.fullResponseSegments.map(({ text }) => text)).toEqual([
      context.text,
      question.text,
    ]);
    expect(JSON.stringify(harness.events)).not.toContain(
      "Prepared concise context.",
    );
  });

  test("skips preparation when a turn contains only a protected question", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    const source = speechSource({ question });
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...source.fullResponseSegments],
      status: "ready",
    });

    harness.bridge.start(4);

    await vi.waitFor(() =>
      expect(harness.session.speakPrepared).toHaveBeenCalledWith([
        question.text,
      ]),
    );
    expect(harness.session.prepareInterviewSpeech).not.toHaveBeenCalled();
  });

  test("prepares every human-facing segment in a standalone completion", async () => {
    const harness = createHarness();
    const first = segment("first", "First result.", "assistant-text");
    const second = segment("second", "Second result.", "assistant-text");
    const source = speechSource({ context: [first, second] });
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: false,
      canonicalSegments: [...source.fullResponseSegments],
      status: "ready",
    });

    harness.bridge.start(4);

    await vi.waitFor(() =>
      expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          contextText: [first.text, second.text],
          contextWordBudget: 50,
        }),
      ),
    );
    expect(harness.session.speakPrepared).toHaveBeenCalledWith([
      "Prepared concise context.",
    ]);
  });

  test.each([
    "empty-context",
    "invalid-output",
    "provider-error",
    "timeout",
    "interrupted",
  ] as const)(
    "reads complete canonical speech after %s fallback",
    async (reason) => {
      const harness = createHarness();
      const context = segment("context", "Complete context.", "assistant-text");
      const question = segment("ask-current", "Exact question?");
      const source = speechSource({ context: [context], question });
      harness.session.prepareInterviewSpeech.mockResolvedValueOnce({
        kind: "fallback",
        reason,
        sourceSegmentIds: [context.id],
      });
      harness.bridge.updateChat({
        automaticSource: source,
        canAcceptInterviewAnswer: true,
        canonicalSegments: [...source.fullResponseSegments],
        status: "ready",
      });

      harness.bridge.start(4);

      await vi.waitFor(() =>
        expect(harness.session.speakPrepared).toHaveBeenCalledWith([
          context.text,
          question.text,
        ]),
      );
    },
  );

  test("assembles prepared context with the protected question identity", () => {
    const context = segment("context", "Complete context.", "assistant-text");
    const question = segment("ask-current", "Exact question?");
    const source = speechSource({ context: [context], question });

    expect(
      assemblePreparedInterviewSpeech({
        preparation: {
          context: "Prepared context.",
          kind: "prepared",
          sourceSegmentIds: [context.id],
        },
        source,
      }),
    ).toEqual({
      mode: "realtime-processed",
      sourceSegmentIds: [context.id, question.id],
      text: ["Prepared context.", question.text],
    });
  });

  test("reuses prepared context only while its epoch, content, and budget match", async () => {
    const harness = createHarness();
    const context = segment("context", "Complete context.", "assistant-text");
    const question = segment("ask-current", "Exact question?");
    const source = speechSource({ context: [context], question });
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...source.fullResponseSegments],
      status: "ready",
    });

    harness.bridge.start(4);
    await vi.waitFor(() =>
      expect(harness.session.speakPrepared).toHaveBeenCalledOnce(),
    );
    harness.bridge.start(4);
    await vi.waitFor(() =>
      expect(harness.session.speakPrepared).toHaveBeenCalledTimes(2),
    );
    expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledOnce();

    const changedContext = { ...context, contentHash: "fnv1a32:changed" };
    const changedContentSource = speechSource({
      context: [changedContext],
      question,
    });
    harness.bridge.updateChat({
      automaticSource: changedContentSource,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...changedContentSource.fullResponseSegments],
      status: "ready",
    });
    harness.bridge.start(4);
    await vi.waitFor(() =>
      expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledTimes(2),
    );

    const longerQuestion = { ...question, text: "What is the exact question?" };
    const changedBudgetSource = speechSource({
      context: [changedContext],
      question: longerQuestion,
    });
    harness.bridge.updateChat({
      automaticSource: changedBudgetSource,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...changedBudgetSource.fullResponseSegments],
      status: "ready",
    });
    harness.bridge.start(4);
    await vi.waitFor(() =>
      expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledTimes(3),
    );

    harness.bridge.start(5);
    await vi.waitFor(() =>
      expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledTimes(4),
    );
    harness.bridge.stop();
    harness.bridge.start(5);
    await vi.waitFor(() =>
      expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledTimes(5),
    );
  });

  test("does not cache fallback or deliver preparation cancelled by lifecycle", async () => {
    const harness = createHarness();
    const context = segment("context", "Complete context.", "assistant-text");
    const question = segment("ask-current", "Exact question?");
    const source = speechSource({ context: [context], question });
    let finishPreparation:
      | ((result: InterviewSpeechPreparationResult) => void)
      | undefined;
    harness.session.prepareInterviewSpeech.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreparation = resolve;
        }),
    );
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...source.fullResponseSegments],
      status: "ready",
    });
    harness.bridge.start(4);

    harness.bridge.cancelPendingSpeech();
    finishPreparation?.({
      kind: "fallback",
      reason: "interrupted",
      sourceSegmentIds: [context.id],
    });
    await Promise.resolve();

    expect(harness.session.speakPrepared).not.toHaveBeenCalled();
    harness.bridge.start(4);
    await vi.waitFor(() =>
      expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledTimes(2),
    );
  });

  test("speaks nothing when preparation is cancelled after a transcript submission", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(7);
    harness.session.speakCanonical.mockClear();
    submitTranscript(harness, 7);
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [question],
      status: "streaming",
    });

    let finishPreparation:
      | ((result: InterviewSpeechPreparationResult) => void)
      | undefined;
    harness.session.prepareInterviewSpeech.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreparation = resolve;
        }),
    );
    const acknowledgement = segment(
      "acknowledgement",
      "Thanks. I have recorded that.",
      "assistant-text",
    );
    const nextQuestion = segment(
      "ask-next",
      "Who is informed next?",
      "brunch-ask",
    );
    const source = speechSource({
      context: [acknowledgement],
      question: nextQuestion,
    });
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question, ...source.fullResponseSegments],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledOnce(),
    );

    expect(harness.events).toContainEqual({
      segments: source.fullResponseSegments,
      type: "canonical-response-ready",
    });

    harness.bridge.cancelPendingSpeech();
    finishPreparation?.({
      context: "Prepared concise context.",
      kind: "prepared",
      sourceSegmentIds: [acknowledgement.id],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.session.speakPrepared).not.toHaveBeenCalled();
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events.some((event) => event.type === "error")).toBe(false);
  });

  test("speaks the current canonical turn without replaying history", () => {
    const harness = createHarness();
    const historical = segment(
      "history",
      "Do not replay this.",
      "assistant-text",
    );
    const preamble = {
      ...segment("preamble", "Thanks. One more question.", "assistant-text"),
      messageId: "message-current-turn",
    };
    const question = {
      ...segment("ask-current", "What happens after approval?"),
      messageId: "message-current-turn",
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [historical, preamble, question],
      status: "ready",
    });

    harness.bridge.start(4);

    expect(harness.session.speakCanonical).toHaveBeenCalledOnce();
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([
      preamble,
      question,
    ]);
  });

  test("submits the completed transcript verbatim, preserves ask correlation, and waits for canonical Brunch output", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(7);
    harness.session.speakCanonical.mockClear();

    harness.emit({
      key: transcriptKey(7),
      text: "The supervisor",
      type: "partial",
    });
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    submitTranscript(harness, 7);

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
      id: createRealtimeSubmissionId(transcriptKey(7)),
      text: "The supervisor approves it.",
    });

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [question],
      status: "streaming",
    });
    const acknowledgement = segment(
      "acknowledgement",
      "Thanks. I have recorded that.",
      "assistant-text",
    );
    const nextQuestion = segment(
      "ask-next",
      "Who is informed next?",
      "brunch-ask",
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question, acknowledgement, nextQuestion],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([
      acknowledgement,
      nextQuestion,
    ]);
    expect(harness.events).toEqual([
      { answer: "The supervisor approves it.", type: "submission-started" },
      { answer: "The supervisor approves it.", type: "submission-accepted" },
      {
        segments: [acknowledgement, nextQuestion],
        type: "canonical-response-ready",
      },
    ]);
  });

  test("delivers Brunch responses to transcript submissions through prepared speech", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(7);
    harness.session.speakCanonical.mockClear();
    submitTranscript(harness, 7);
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [question],
      status: "streaming",
    });

    const acknowledgement = segment(
      "acknowledgement",
      "Thanks. I have recorded that.",
      "assistant-text",
    );
    const nextQuestion = segment("ask-next", "Who is informed next?");
    const source = speechSource({
      context: [acknowledgement],
      question: nextQuestion,
    });
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question, ...source.fullResponseSegments],
      status: "ready",
    });

    await vi.waitFor(() =>
      expect(harness.session.speakPrepared).toHaveBeenCalledOnce(),
    );
    expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledOnce();
    expect(harness.session.prepareInterviewSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        contextText: [acknowledgement.text],
        sourceSegmentIds: [acknowledgement.id],
      }),
    );
    expect(harness.session.speakPrepared).toHaveBeenCalledWith([
      "Prepared concise context.",
      nextQuestion.text,
    ]);
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events.map(({ type }) => type)).toEqual([
      "submission-started",
      "submission-accepted",
      "speech-delivery-pending",
      "canonical-response-ready",
    ]);
  });

  test("falls back to exact canonical content once when preparation fails after a transcript submission", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(7);
    harness.session.speakCanonical.mockClear();
    submitTranscript(harness, 7);
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [question],
      status: "streaming",
    });

    harness.session.prepareInterviewSpeech.mockResolvedValueOnce({
      kind: "fallback",
      reason: "timeout",
      sourceSegmentIds: ["acknowledgement"],
    });
    const acknowledgement = segment(
      "acknowledgement",
      "Thanks. I have recorded that.",
      "assistant-text",
    );
    const nextQuestion = segment("ask-next", "Who is informed next?");
    const source = speechSource({
      context: [acknowledgement],
      question: nextQuestion,
    });
    harness.bridge.updateChat({
      automaticSource: source,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question, ...source.fullResponseSegments],
      status: "ready",
    });

    await vi.waitFor(() =>
      expect(harness.session.speakPrepared).toHaveBeenCalledOnce(),
    );
    expect(harness.session.speakPrepared).toHaveBeenCalledWith([
      acknowledgement.text,
      nextQuestion.text,
    ]);
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events.some((event) => event.type === "error")).toBe(false);
  });

  test("normalizes transcript whitespace before submitting", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);

    submitTranscript(harness, 3, "  The   supervisor\napproves it.  ");

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
        id: createRealtimeSubmissionId(transcriptKey(3)),
        text: "The supervisor approves it.",
      }),
    );
  });

  test("does not submit empty or whitespace-only transcripts", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);

    submitTranscript(harness, 3, "", "silent-item");
    submitTranscript(harness, 3, "  \n\t ", "noise-item");
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      { reason: "empty", type: "transcript-rejected" },
      { reason: "empty", type: "transcript-rejected" },
    ]);

    submitTranscript(harness, 3, "A real answer.", "spoken-item");
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
        id: createRealtimeSubmissionId(transcriptKey(3, "spoken-item")),
        text: "A real answer.",
      }),
    );
  });

  test("submits duplicate completion events exactly once", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);

    submitTranscript(harness, 3);
    submitTranscript(harness, 3);
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "submitted",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        segment("ask-current", "Question"),
        segment("ask-next", "Next question"),
      ],
      status: "ready",
    });
    submitTranscript(harness, 3);
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.events).toContainEqual({
      reason: "duplicate",
      type: "transcript-rejected",
    });
    expect(
      harness.events.filter(
        (event) =>
          event.type === "transcript-rejected" && event.reason === "duplicate",
      ),
    ).toHaveLength(2);
    expect(harness.events.some((event) => event.type === "error")).toBe(false);
  });

  test("ignores stale connection-epoch transcripts", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(1);
    harness.bridge.stop();
    harness.bridge.start(2);

    submitTranscript(harness, 1, "Stale answer");
    harness.emit(transcriptFailed(1, "stale-failed"));
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([]);

    submitTranscript(harness, 2, "Current answer");
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
        id: createRealtimeSubmissionId(transcriptKey(2)),
        text: "Current answer",
      }),
    );
  });

  test("returns to listening after a failed transcription", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);

    harness.emit(transcriptFailed(3, "failed-item"));
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      { reason: "failed", type: "transcript-rejected" },
    ]);

    submitTranscript(harness, 3, "Retried answer.", "retry-item");
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
        id: createRealtimeSubmissionId(transcriptKey(3, "retry-item")),
        text: "Retried answer.",
      }),
    );
  });

  test("never submits fabricated continue_interview arguments", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);

    harness.emit({
      callId: "call-1",
      connectionEpoch: 3,
      delta: '{"answer":"hi"}',
      itemId: "function-item-1",
      responseId: "response-1",
      type: "tool-arguments-delta",
    } as unknown as OpenAIRealtimeSessionEvent);
    harness.emit({
      arguments: '{"answer":"hi"}',
      callId: "call-1",
      connectionEpoch: 3,
      itemId: "function-item-1",
      name: "continue_interview",
      responseId: "response-1",
      type: "tool-arguments-done",
    } as unknown as OpenAIRealtimeSessionEvent);
    harness.emit({
      connectionEpoch: 3,
      responseId: "response-1",
      status: "completed",
      type: "response-terminal",
    });
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([]);
  });

  test("ignores transcripts while an answer is in flight or Brunch cannot accept input", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "Question");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(3);

    submitTranscript(harness, 3, "First answer.", "first-item");
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    submitTranscript(harness, 3, "Overlapping answer.", "second-item");
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.events.at(-1)).toEqual({
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [question],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [question, segment("ask-next", "Next question")],
      status: "ready",
    });
    submitTranscript(harness, 3, "Too early.", "third-item");
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.events.at(-1)).toEqual({
      reason: "unavailable",
      type: "transcript-rejected",
    });
    expect(harness.events.some((event) => event.type === "error")).toBe(false);
  });

  test("rejects transcripts over the answer limit", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);

    submitTranscript(harness, 3, "a".repeat(32_001));
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      { reason: "too-long", type: "transcript-rejected" },
    ]);
  });

  test("uses the first spoken turn to start Brunch when no question exists", async () => {
    const harness = createHarness();
    harness.submitInterviewAnswer.mockResolvedValueOnce({
      kind: "message",
      messageId: "message-kickoff",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready",
    });
    harness.bridge.start(7);

    submitTranscript(harness, 7, "Battery charger workflow");

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
        id: createRealtimeSubmissionId(transcriptKey(7)),
        text: "Battery charger workflow",
      }),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "submitted",
    });
    const firstQuestion = segment(
      "ask-first",
      "What starts the battery charger workflow?",
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [firstQuestion],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([
      firstQuestion,
    ]);
    expect(harness.events.map(({ type }) => type)).toEqual([
      "submission-started",
      "submission-accepted",
      "canonical-response-ready",
    ]);
  });

  test("requires a correlated Brunch busy cycle before accepting new canonical segments", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(7);
    harness.session.speakCanonical.mockClear();
    submitTranscript(harness, 7);
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const unrelated = segment(
      "unrelated",
      "An unrelated canonical update.",
      "assistant-text",
    );

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question, unrelated],
      status: "ready",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [question, unrelated],
      status: "submitted",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question, unrelated],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([unrelated]);
  });

  test("rejects a composer result that does not match the pending brunch_ask", async () => {
    const harness = createHarness();
    harness.submitInterviewAnswer.mockResolvedValueOnce({
      kind: "interactive-tool",
      toolCallId: "another-ask",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(5);
    harness.session.speakCanonical.mockClear();

    submitTranscript(harness, 5);

    await vi.waitFor(() =>
      expect(harness.events.at(-1)).toMatchObject({ type: "error" }),
    );
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.session.speakPrepared).not.toHaveBeenCalled();
  });

  test("speaks new canonical text turns without a Realtime tool result", () => {
    const harness = createHarness();
    const question = segment("ask-current", "Question");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(8);
    harness.session.speakCanonical.mockClear();
    const response = segment(
      "typed-response",
      "Canonical response",
      "assistant-text",
    );

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question, response],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([response]);
  });
});
