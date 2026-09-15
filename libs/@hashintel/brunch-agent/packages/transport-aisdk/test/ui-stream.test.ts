import { expect, test } from "vitest";

import { createFlueUiStream } from "../src";

import type { ConversationStreamChunk } from "@flue/sdk";
import type { UIMessageChunk } from "ai";

const position = (index: number) => ({ batch: 1, index });

const project = (
  chunks: readonly ConversationStreamChunk[],
  hiddenToolNames: ReadonlySet<string> = new Set(),
): UIMessageChunk[] => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["readPetrinautDoc"]),
    hiddenToolNames,
    write: (chunk) => written.push(chunk),
  });
  for (const chunk of chunks) projector.accept(chunk);
  return written;
};

test("withholds opted-in browser input until server validation succeeds and surfaces its rejection", () => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["addArc"]),
    validatedClientToolNames: new Set(["addArc"]),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  const call = {
    type: "tool-input" as const,
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "arc-1",
    toolName: "addArc",
    input: { weight: 1 },
    position: position(1),
  };
  projector.accept(call);
  expect(written.some((chunk) => chunk.type === "tool-input-available")).toBe(
    false,
  );
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-1",
    toolCallId: "arc-1",
    errorText: "Unknown settled revision",
    position: position(2),
  });
  expect(written.some((chunk) => chunk.type === "tool-input-available")).toBe(
    false,
  );
  expect(written).toContainEqual({
    type: "tool-output-error",
    toolCallId: "arc-1",
    errorText: "Unknown settled revision",
    providerExecuted: true,
  });
  projector.accept({ ...call, toolCallId: "arc-2", position: position(3) });
  projector.accept({
    type: "tool-output",
    conversationId: "conversation-1",
    toolCallId: "arc-2",
    output: { awaiting: "client" },
    position: position(4),
  });
  expect(written).toContainEqual({
    type: "tool-input-available",
    toolCallId: "arc-2",
    toolName: "addArc",
    input: { weight: 1 },
  });
});

test("projects data and metadata onto the AI SDK stream", () => {
  const written = project([
    {
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "message-1",
      submissionId: "submission-1",
      turnId: "turn-1",
      position: position(0),
    },
    {
      type: "message-metadata",
      conversationId: "conversation-1",
      messageId: "message-1",
      metadata: { elapsedMs: 17 },
      position: position(1),
    },
    {
      type: "data-part",
      conversationId: "conversation-1",
      messageId: "message-1",
      name: "orderCard",
      data: { orderId: "42", status: "loaded" },
      position: position(2),
    },
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "completed",
      position: position(3),
    },
  ]);

  expect(written).toContainEqual({
    type: "message-metadata",
    messageMetadata: { elapsedMs: 17 },
  });
  expect(written).toContainEqual({
    type: "data-orderCard",
    data: { orderId: "42", status: "loaded" },
  });
});

test("hides an implementation tool while preserving its data marker", () => {
  const written = project(
    [
      {
        type: "message-started",
        conversationId: "conversation-1",
        messageId: "message-1",
        submissionId: "submission-1",
        turnId: "turn-1",
        position: position(0),
      },
      {
        type: "tool-input",
        conversationId: "conversation-1",
        messageId: "message-1",
        toolCallId: "tool-question-1",
        toolName: "brunch_mark_question",
        input: { question: "Which line should run this order?" },
        position: position(1),
      },
      {
        type: "data-part",
        conversationId: "conversation-1",
        messageId: "message-1",
        name: "brunch-question",
        data: {
          question: "Which line should run this order?",
          toolCallId: "tool-question-1",
        },
        position: position(2),
      },
      {
        type: "tool-output",
        conversationId: "conversation-1",
        toolCallId: "tool-question-1",
        output: { marked: true },
        position: position(3),
      },
      {
        type: "submission-settled",
        conversationId: "conversation-1",
        submissionId: "submission-1",
        outcome: "completed",
        position: position(4),
      },
    ],
    new Set(["brunch_mark_question"]),
  );

  expect(written).toContainEqual({
    type: "data-brunch-question",
    data: {
      question: "Which line should run this order?",
      toolCallId: "tool-question-1",
    },
  });
  expect(
    written.some(
      (chunk) =>
        chunk.type === "tool-input-available" ||
        chunk.type === "tool-output-available" ||
        chunk.type === "tool-output-error",
    ),
  ).toBe(false);
});

test("ignores observation catch-up chunks in a submission stream", () => {
  const written = project([
    {
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "message-1",
      submissionId: "submission-1",
      turnId: "turn-1",
      position: position(0),
    },
    {
      type: "stream-checkpoint",
      incarnation: "incarnation-1",
    },
    {
      type: "conversation-reset",
      conversationId: "conversation-1",
      snapshot: {
        v: 1,
        conversationId: "conversation-1",
        offset: "0",
        messages: [],
        settlements: [],
      },
      position: position(1),
    },
    {
      type: "message-appended",
      conversationId: "conversation-1",
      message: {
        id: "user-1",
        role: "user",
        purpose: "user",
        display: "visible",
        parts: [{ type: "text", text: "Hello.", state: "done" }],
      },
      position: position(2),
    },
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "completed",
      position: position(3),
    },
  ]);

  expect(written.map((chunk) => chunk.type)).toEqual([
    "start",
    "start-step",
    "finish-step",
    "finish",
  ]);
});

test("maps client-tool input before exposing it to the AI SDK", () => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["addArc"]),
    mapClientToolInput: ({ input }) => ({ ...(input as object), weight: 1 }),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "call-1",
    toolName: "addArc",
    input: { weight: "1" },
    position: position(1),
  });

  expect(written).toContainEqual({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "addArc",
    input: { weight: 1 },
  });
});

test("withholds a rejected mutate_petrinet until server validation and marks both start and release dynamic", () => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["mutate_petrinet"]),
    dynamicClientToolNames: new Set(["mutate_petrinet"]),
    validatedClientToolNames: new Set(["mutate_petrinet"]),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  const rejected = {
    type: "tool-input" as const,
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "batch-1",
    toolName: "mutate_petrinet",
    input: { operations: [] },
    position: position(1),
  };
  projector.accept(rejected);
  expect(written).toContainEqual({
    type: "tool-input-start",
    toolCallId: "batch-1",
    toolName: "mutate_petrinet",
    dynamic: true,
  });
  expect(written.some((chunk) => chunk.type === "tool-input-available")).toBe(
    false,
  );
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-1",
    toolCallId: "batch-1",
    errorText: "Invalid mutate_petrinet arguments",
    position: position(2),
  });
  expect(written.some((chunk) => chunk.type === "tool-input-available")).toBe(
    false,
  );
  expect(written).toContainEqual({
    type: "tool-output-error",
    toolCallId: "batch-1",
    errorText: "Invalid mutate_petrinet arguments",
    providerExecuted: true,
  });
  projector.accept({
    ...rejected,
    toolCallId: "batch-2",
    input: { operations: [{ operationId: "add-queue" }] },
    position: position(3),
  });
  projector.accept({
    type: "tool-output",
    conversationId: "conversation-1",
    toolCallId: "batch-2",
    output: { awaiting: "client" },
    position: position(4),
  });
  const available = written.filter(
    (chunk) => chunk.type === "tool-input-available",
  );
  expect(available).toEqual([
    {
      type: "tool-input-available",
      toolCallId: "batch-2",
      toolName: "mutate_petrinet",
      input: { operations: [{ operationId: "add-queue" }] },
      dynamic: true,
    },
  ]);
});

test("marks host-defined client tools as dynamic for the AI SDK", () => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["mutate_petrinet"]),
    dynamicClientToolNames: new Set(["mutate_petrinet"]),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "call-1",
    toolName: "mutate_petrinet",
    input: { operations: [] },
    position: position(1),
  });

  expect(written).toContainEqual({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "mutate_petrinet",
    input: { operations: [] },
    dynamic: true,
  });
});

test("keeps a pending client tool in the final projected step", () => {
  const written = project([
    {
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "assistant-tool-call",
      submissionId: "submission-1",
      turnId: "turn-tool-call",
      position: position(0),
    },
    {
      type: "tool-input",
      conversationId: "conversation-1",
      messageId: "assistant-tool-call",
      toolCallId: "call-1",
      toolName: "readPetrinautDoc",
      input: { doc: "ai-assistant" },
      position: position(1),
    },
    {
      type: "message-completed",
      conversationId: "conversation-1",
      messageId: "assistant-tool-call",
      position: position(2),
    },
    {
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "assistant-waiting",
      submissionId: "submission-1",
      turnId: "turn-waiting",
      position: position(3),
    },
    {
      type: "message-delta",
      conversationId: "conversation-1",
      messageId: "assistant-waiting",
      kind: "text",
      delta: "Waiting for the browser.",
      position: position(4),
    },
    {
      type: "message-completed",
      conversationId: "conversation-1",
      messageId: "assistant-waiting",
      position: position(5),
    },
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "completed",
      position: position(6),
    },
  ]);

  expect(written).toEqual([
    { type: "start", messageId: "assistant-tool-call" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: "readPetrinautDoc",
      input: { doc: "ai-assistant" },
    },
    { type: "finish-step" },
    { type: "finish", finishReason: "tool-calls" },
  ]);
});

test.each([
  {
    error: new Error("Elicitor failed.", {
      cause: "The requested field is required.",
    }),
    expected: "Elicitor failed.\nCaused by: The requested field is required.",
    shape: "Error with cause",
  },
  {
    error: "The elicitor rejected the answer.",
    expected: "The elicitor rejected the answer.",
    shape: "string",
  },
  {
    error: { field: "answer", reason: "Required" },
    expected: '{"field":"answer","reason":"Required"}',
    shape: "plain object",
  },
  {
    error: 503,
    expected: "The chat turn failed.",
    shape: "unsupported value",
  },
  {
    error: "",
    expected: "The chat turn failed.",
    shape: "empty string",
  },
])("preserves a failed submission's $shape error", ({ error, expected }) => {
  const written = project([
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "failed",
      error,
      position: position(0),
    },
  ]);

  expect(written).toEqual([{ type: "error", errorText: expected }]);
  expect(written).not.toContainEqual({
    type: "error",
    errorText: "[object Object]",
  });
});

test("bounds cyclic failed-submission objects", () => {
  const cyclicError: Record<string, unknown> = { reason: "Recursive failure" };
  cyclicError.self = cyclicError;
  cyclicError.payload = "x".repeat(20_000);

  const written = project([
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "failed",
      error: cyclicError,
      position: position(0),
    },
  ]);

  const failure = written.find((chunk) => chunk.type === "error");
  expect(failure?.errorText).toContain('"self":"[Circular]"');
  expect(failure?.errorText.length).toBeLessThanOrEqual(10_000);
});

test("reports server tool failures to the diagnostic callback, hidden tools included, before projection drops them", () => {
  const written: UIMessageChunk[] = [];
  const reported: Parameters<
    NonNullable<Parameters<typeof createFlueUiStream>[0]["onToolOutputError"]>
  >[0][] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["readPetrinautDoc"]),
    hiddenToolNames: new Set(["brunch_question"]),
    onToolOutputError: (event) => reported.push(event),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "visible-1",
    toolName: "query_workpiece",
    input: {},
    position: position(1),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "hidden-1",
    toolName: "brunch_question",
    input: {},
    position: position(2),
  });
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-1",
    toolCallId: "visible-1",
    errorText: "Unknown governing revision",
    position: position(3),
  });
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-1",
    toolCallId: "hidden-1",
    errorText: "Question marker rejected",
    position: position(4),
  });

  expect(reported).toEqual([
    {
      submissionId: "submission-1",
      toolCallId: "visible-1",
      toolName: "query_workpiece",
      errorText: "Unknown governing revision",
      hidden: false,
    },
    {
      submissionId: "submission-1",
      toolCallId: "hidden-1",
      toolName: "brunch_question",
      errorText: "Question marker rejected",
      hidden: true,
    },
  ]);
  // The UI projection is unchanged: the hidden tool still never reaches it.
  const errorChunks = written.filter(
    (chunk) => chunk.type === "tool-output-error",
  );
  expect(errorChunks).toEqual([
    {
      type: "tool-output-error",
      toolCallId: "visible-1",
      errorText: "Unknown governing revision",
      providerExecuted: true,
    },
  ]);
  expect(
    written.some(
      (chunk) => "toolCallId" in chunk && chunk.toolCallId === "hidden-1",
    ),
  ).toBe(false);
});

test("does not report tool failures from another submission", () => {
  const reported: unknown[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(),
    onToolOutputError: (event) => reported.push(event),
    write: () => {},
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-9",
    submissionId: "submission-other",
    turnId: "turn-9",
    position: position(0),
  });
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-1",
    toolCallId: "other-1",
    errorText: "not ours",
    position: position(1),
  });
  expect(reported).toEqual([]);
});
