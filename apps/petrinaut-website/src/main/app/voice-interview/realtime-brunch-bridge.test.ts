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
    completeFunctionCall: vi.fn(),
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

const toolDelta = (
  connectionEpoch: number,
  delta: string,
): Extract<OpenAIRealtimeSessionEvent, { type: "tool-arguments-delta" }> => ({
  callId: "call-1",
  connectionEpoch,
  delta,
  itemId: "function-item-1",
  responseId: "response-1",
  type: "tool-arguments-delta",
});

const toolDone = (
  connectionEpoch: number,
  argumentsJson = '{"answer":"The supervisor approves it."}',
): Extract<OpenAIRealtimeSessionEvent, { type: "tool-arguments-done" }> => ({
  arguments: argumentsJson,
  callId: "call-1",
  connectionEpoch,
  itemId: "function-item-1",
  name: "continue_interview",
  responseId: "response-1",
  type: "tool-arguments-done",
});

const responseTerminal = (
  connectionEpoch: number,
  status: "cancelled" | "completed" | "failed" | "incomplete",
  responseId = "response-1",
): Extract<OpenAIRealtimeSessionEvent, { type: "response-terminal" }> => ({
  connectionEpoch,
  responseId,
  status,
  type: "response-terminal",
});

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

  test("completes a function call without speech when preparation is cancelled", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(7);
    harness.emit(toolDone(7));
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

    harness.bridge.cancelPendingSpeech();
    finishPreparation?.({
      context: "Prepared concise context.",
      kind: "prepared",
      sourceSegmentIds: [acknowledgement.id],
    });

    await vi.waitFor(() =>
      expect(harness.session.completeFunctionCall).toHaveBeenCalledWith(
        "call-1",
        [acknowledgement.text, nextQuestion.text],
        { speakResponse: false },
      ),
    );
    expect(harness.session.speakPrepared).not.toHaveBeenCalled();
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

  test("streams and validates one tool call, preserves ask correlation, and waits for canonical Brunch output", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(7);
    harness.session.speakCanonical.mockClear();

    harness.emit(toolDelta(7, '{"answer":"The supervisor'));
    harness.emit(toolDelta(7, ' approves it."}'));
    harness.emit(toolDone(7));

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
      id: createRealtimeSubmissionId(7, "call-1"),
      text: "The supervisor approves it.",
    });
    expect(harness.session.completeFunctionCall).not.toHaveBeenCalled();

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

    await vi.waitFor(() =>
      expect(harness.session.completeFunctionCall).toHaveBeenCalledWith(
        "call-1",
        [acknowledgement.text, nextQuestion.text],
      ),
    );
    expect(harness.events.map(({ type }) => type)).toEqual([
      "submission-started",
      "submission-accepted",
      "canonical-response-ready",
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

    harness.emit(toolDone(7, '{"answer":"Battery charger workflow"}'));

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
        id: createRealtimeSubmissionId(7, "call-1"),
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

    expect(harness.session.completeFunctionCall).toHaveBeenCalledWith(
      "call-1",
      [firstQuestion.text],
    );
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
    harness.emit(toolDone(7));
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

    expect(harness.session.completeFunctionCall).not.toHaveBeenCalled();

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

    expect(harness.session.completeFunctionCall).toHaveBeenCalledWith(
      "call-1",
      [unrelated.text],
    );
  });

  test("rejects streamed arguments whose response or item identity changes", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);
    harness.emit(toolDelta(3, '{"answer":"Answer"}'));

    harness.emit({
      ...toolDone(3, '{"answer":"Answer"}'),
      responseId: "response-2",
    });
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      expect.objectContaining({
        code: "interview-correlation",
        type: "error",
      }),
    ]);
  });

  test("rejects concurrent argument streams before either can submit", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);
    harness.emit(toolDelta(3, '{"answer":"First"}'));

    harness.emit({
      ...toolDelta(3, '{"answer":"Second"}'),
      callId: "call-2",
      itemId: "function-item-2",
    });

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      expect.objectContaining({ type: "error" }),
    ]);
  });

  test("discards a cancelled argument stream without poisoning the next answer", async () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);
    harness.emit(toolDelta(3, '{"answer":"Cancelled"}'));
    harness.emit(responseTerminal(3, "cancelled"));
    harness.emit(toolDone(3, '{"answer":"Cancelled"}'));

    harness.emit({
      ...toolDelta(3, '{"answer":"Accepted"}'),
      callId: "call-2",
      itemId: "function-item-2",
      responseId: "response-2",
    });
    harness.emit({
      ...toolDone(3, '{"answer":"Accepted"}'),
      callId: "call-2",
      itemId: "function-item-2",
      responseId: "response-2",
    });

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith({
      id: createRealtimeSubmissionId(3, "call-2"),
      text: "Accepted",
    });
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
  });

  test("rejects an unfinished argument stream from a completed response", () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);
    harness.emit(toolDelta(3, '{"answer":"Incomplete'));

    harness.emit(responseTerminal(3, "completed"));

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      expect.objectContaining({
        code: "interview-correlation",
        type: "error",
      }),
    ]);
  });

  test("rejects duplicate, stale, overlapping, and malformed calls without another Brunch submission", async () => {
    const harness = createHarness();
    const question = segment("ask-current", "What happens after approval?");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [question],
      status: "ready",
    });
    harness.bridge.start(2);

    harness.emit(toolDone(1));
    harness.emit(toolDelta(2, '{"answer":"The supervisor approves it."}'));
    harness.emit(toolDone(2));
    harness.emit(toolDone(2));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );

    harness.emit({
      ...toolDone(2, '{"answer":"Overlapping"}'),
      callId: "call-2",
      itemId: "function-item-2",
    });

    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.events.at(-1)).toMatchObject({ type: "error" });
  });

  test.each([
    ["wrong tool", { ...toolDone(3), name: "invent_question" }],
    ["invalid JSON", toolDone(3, "not-json")],
    ["extra property", toolDone(3, '{"answer":"Valid","extra":true}')],
    ["empty answer", toolDone(3, '{"answer":"   "}')],
  ])("rejects %s arguments", async (_label, event) => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [segment("ask-current", "Question")],
      status: "ready",
    });
    harness.bridge.start(3);

    harness.emit(event);
    await Promise.resolve();

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      expect.objectContaining({ type: "error" }),
    ]);
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

    harness.emit(toolDone(5));

    await vi.waitFor(() =>
      expect(harness.events.at(-1)).toMatchObject({ type: "error" }),
    );
    expect(harness.session.completeFunctionCall).not.toHaveBeenCalled();
  });

  test("speaks new canonical text turns without creating a Realtime tool result", () => {
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
    expect(harness.session.completeFunctionCall).not.toHaveBeenCalled();
  });
});
