import { describe, expect, test, vi } from "vitest";

import {
  createRealtimeSubmissionId,
  RealtimeBrunchBridge,
  type RealtimeBrunchBridgeEvent,
} from "./realtime-brunch-bridge";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";

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

const createHarness = () => {
  let listener: ((event: OpenAIRealtimeSessionEvent) => void) | undefined;
  const session = {
    completeFunctionCall: vi.fn(),
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
  >(async () => ({
    kind: "interactive-tool",
    toolCallId: "ask-current",
  }));
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

  test("rehydrates the settled Voice turn without resubmission or playback", () => {
    const harness = createHarness();
    const settledResponse = {
      ...segment(
        "settled-response",
        "This canonical response was already delivered.",
        "assistant-text",
      ),
      submissionId: "submission-settled",
    };

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [settledResponse],
      status: "ready",
    });
    harness.bridge.start(9);

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.session.completeFunctionCall).not.toHaveBeenCalled();
    expect(harness.events).toEqual([]);
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
        [acknowledgement, nextQuestion],
      ),
    );
    expect(harness.events.map(({ type }) => type)).toEqual([
      "submission-started",
      "submission-accepted",
      "canonical-response-ready",
    ]);
  });

  test("admits one finalized Realtime answer through Flue once", async () => {
    const harness = createHarness();
    harness.submitInterviewAnswer.mockResolvedValueOnce({
      kind: "message",
      messageId: "message-kickoff",
      submissionId: "submission-voice-1",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready",
    });
    harness.bridge.start(7);

    harness.emit(toolDone(7, '{"answer":"Battery charger workflow"}'));
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
    const unrelated = {
      ...segment("unrelated", "Do not speak this response."),
      submissionId: "submission-other",
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [unrelated],
      status: "ready",
    });
    expect(harness.session.completeFunctionCall).not.toHaveBeenCalled();
    const firstQuestion = {
      ...segment("ask-first", "What starts the battery charger workflow?"),
      submissionId: "submission-voice-1",
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [unrelated, firstQuestion],
      status: "ready",
    });

    expect(harness.session.completeFunctionCall).toHaveBeenCalledWith(
      "call-1",
      [firstQuestion],
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
      [unrelated],
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
