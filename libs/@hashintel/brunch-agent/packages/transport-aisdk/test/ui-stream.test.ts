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
