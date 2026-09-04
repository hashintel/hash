import { expect, test } from "vitest";

import { createFlueUiStream } from "../src";

import type { ConversationStreamChunk } from "@flue/sdk";
import type { UIMessageChunk } from "ai";

const position = (index: number) => ({ batch: 1, index });

const project = (
  chunks: readonly ConversationStreamChunk[],
): UIMessageChunk[] => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["readPetrinautDoc"]),
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
