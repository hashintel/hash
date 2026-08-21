import { expect, test } from "bun:test";

import { createFlueReplyProjector } from "../src/index.ts";

import type { HarnessReplyEvent } from "@brunch/core";

const position = (batch: number, index: number) => ({ batch, index });

test("projects one Flue submission into stable substrate-neutral reply events", () => {
  const emitted: HarnessReplyEvent[] = [];
  const projector = createFlueReplyProjector({
    submissionId: "submission-1436",
    emit: (event) => emitted.push(event),
  });
  const chunks = [
    {
      type: "message-started",
      conversationId: "conversation-1436",
      messageId: "message-1436",
      submissionId: "submission-1436",
      turnId: "turn-1436",
      position: position(1, 0),
    },
    {
      type: "message-delta",
      conversationId: "conversation-1436",
      messageId: "message-1436",
      kind: "reasoning",
      delta: "Checking the process boundary.",
      position: position(1, 1),
    },
    {
      type: "message-delta",
      conversationId: "conversation-1436",
      messageId: "message-1436",
      kind: "text",
      delta: "What outcome should the process achieve?",
      position: position(1, 2),
    },
    {
      type: "tool-input",
      conversationId: "conversation-1436",
      messageId: "message-1436",
      toolCallId: "tool-1436",
      toolName: "bl_sweep",
      input: {},
      position: position(1, 3),
    },
    {
      type: "tool-output",
      conversationId: "conversation-1436",
      toolCallId: "tool-1436",
      output: { status: "no-settled-range" },
      position: position(1, 4),
    },
    {
      type: "message-completed",
      conversationId: "conversation-1436",
      messageId: "message-1436",
      position: position(1, 5),
    },
    {
      type: "submission-settled",
      conversationId: "conversation-1436",
      submissionId: "submission-1436",
      outcome: "completed",
      position: position(1, 6),
    },
  ] as const;

  for (const chunk of chunks) projector.accept(chunk);

  expect(emitted).toEqual([
    { type: "response-start", messageId: "message-1436" },
    { type: "turn-start", turnId: "turn-1436" },
    {
      type: "part-start",
      kind: "reasoning",
      partId: "message-1436:reasoning:1",
    },
    {
      type: "part-delta",
      kind: "reasoning",
      partId: "message-1436:reasoning:1",
      delta: "Checking the process boundary.",
    },
    { type: "part-end", kind: "reasoning", partId: "message-1436:reasoning:1" },
    { type: "part-start", kind: "text", partId: "message-1436:text:2" },
    {
      type: "part-delta",
      kind: "text",
      partId: "message-1436:text:2",
      delta: "What outcome should the process achieve?",
    },
    { type: "part-end", kind: "text", partId: "message-1436:text:2" },
    {
      type: "tool-input",
      toolCallId: "tool-1436",
      toolName: "bl_sweep",
      input: {},
      execution: "server",
    },
    {
      type: "tool-output",
      toolCallId: "tool-1436",
      output: { status: "no-settled-range" },
      execution: "server",
    },
    { type: "turn-finish", turnId: "turn-1436" },
    {
      type: "response-finish",
      terminalState: "completed",
      finishReason: "stop",
    },
  ]);
});

test("ignores replayed chunks belonging to a different submission", () => {
  const emitted: HarnessReplyEvent[] = [];
  const projector = createFlueReplyProjector({
    submissionId: "submission-current",
    emit: (event) => emitted.push(event),
  });

  projector.accept({
    type: "message-started",
    conversationId: "conversation-1436",
    messageId: "message-old",
    submissionId: "submission-old",
    turnId: "turn-old",
    position: position(1, 0),
  });
  projector.accept({
    type: "message-delta",
    conversationId: "conversation-1436",
    messageId: "message-old",
    kind: "text",
    delta: "Old response.",
    position: position(1, 1),
  });
  projector.accept({
    type: "submission-settled",
    conversationId: "conversation-1436",
    submissionId: "submission-old",
    outcome: "completed",
    position: position(1, 2),
  });

  expect(emitted).toEqual([]);
});

test("projects a failed server tool through the substrate-neutral terminal outcome", () => {
  const emitted: HarnessReplyEvent[] = [];
  const projector = createFlueReplyProjector({
    submissionId: "submission-tool-failed",
    emit: (event) => emitted.push(event),
  });

  projector.accept({
    type: "message-started",
    conversationId: "conversation-tool-failed",
    messageId: "message-tool-failed",
    submissionId: "submission-tool-failed",
    turnId: "turn-tool-failed",
    position: position(1, 0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-tool-failed",
    messageId: "message-tool-failed",
    toolCallId: "tool-failed",
    toolName: "bl_sweep",
    input: {},
    position: position(1, 1),
  });
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-tool-failed",
    toolCallId: "tool-failed",
    errorText: "Sweep persistence failed.",
    position: position(1, 2),
  });
  projector.accept({
    type: "submission-settled",
    conversationId: "conversation-tool-failed",
    submissionId: "submission-tool-failed",
    outcome: "failed",
    position: position(1, 3),
  });

  expect(emitted).toEqual([
    { type: "response-start", messageId: "message-tool-failed" },
    { type: "turn-start", turnId: "turn-tool-failed" },
    {
      type: "tool-input",
      toolCallId: "tool-failed",
      toolName: "bl_sweep",
      input: {},
      execution: "server",
    },
    {
      type: "tool-output-error",
      toolCallId: "tool-failed",
      errorText: "Sweep persistence failed.",
      execution: "server",
    },
    { type: "turn-finish", turnId: "turn-tool-failed" },
    {
      type: "response-finish",
      terminalState: "failed",
      finishReason: "error",
    },
  ]);
});
