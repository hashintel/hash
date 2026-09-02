import { expect, test } from "vitest";

import { ASK_TOOL_NAME } from "@hashintel/brunch-agent/client-tools";

import {
  formatFlueTranscript,
  snapshotToUiMessages,
} from "../src/flue-transcript.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const snapshotWithPendingClientTool: FlueConversationSnapshot = {
  v: 1,
  conversationId: "conversation-1",
  offset: "0",
  messages: [
    {
      id: "assistant-1",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "tool-doc-1",
          toolName: "readPetrinautDoc",
          state: "output-available",
          input: { doc: "ai-assistant" },
          output: { awaiting: "client" },
        },
      ],
    },
  ],
  settlements: [],
};

const snapshotWithCompletedClientTool: FlueConversationSnapshot = {
  ...snapshotWithPendingClientTool,
  messages: [
    ...snapshotWithPendingClientTool.messages,
    {
      id: "signal-1",
      role: "system",
      purpose: "dispatch",
      display: "hidden",
      signal: { tagName: "client-tool-result" },
      parts: [
        {
          type: "text",
          text: '[{"toolCallId":"tool-doc-1","toolName":"readPetrinautDoc","output":null}]',
          state: "done",
        },
      ],
    },
  ],
};

const snapshotWithPendingAsk: FlueConversationSnapshot = {
  ...snapshotWithPendingClientTool,
  messages: [
    {
      id: "assistant-ask",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "tool-ask-1",
          toolName: ASK_TOOL_NAME,
          state: "input-available",
          input: { question: "What happens after approval?" },
        },
      ],
    },
  ],
};

const snapshotWithDataPart: FlueConversationSnapshot = {
  v: 1,
  conversationId: "conversation-1",
  offset: "0",
  messages: [
    {
      id: "assistant-1",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
        { type: "text", text: "Here is the order.", state: "done" },
        { type: "data-orderCard", data: { orderId: "42", status: "loaded" } },
      ],
    },
  ],
  settlements: [],
};

test("history reconstruction leaves an unfinished client tool available to run", () => {
  expect(snapshotToUiMessages(snapshotWithPendingClientTool)).toEqual([
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-readPetrinautDoc",
          toolCallId: "tool-doc-1",
          state: "input-available",
          input: { doc: "ai-assistant" },
        },
      ],
    },
  ]);
});

test("history reconstructs brunch asks as dynamic tools", () => {
  expect(snapshotToUiMessages(snapshotWithPendingAsk)).toEqual([
    {
      id: "assistant-ask",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: ASK_TOOL_NAME,
          toolCallId: "tool-ask-1",
          state: "input-available",
          input: { question: "What happens after approval?" },
        },
      ],
    },
  ]);
});

test("history reconstruction uses the browser result even when it is null", () => {
  const [message] = snapshotToUiMessages(snapshotWithCompletedClientTool);
  expect(message?.parts).toEqual([
    {
      type: "tool-readPetrinautDoc",
      toolCallId: "tool-doc-1",
      state: "output-available",
      input: { doc: "ai-assistant" },
      output: null,
    },
  ]);
});

test("history reconstruction keeps Flue data-* parts on the AI SDK message", () => {
  expect(snapshotToUiMessages(snapshotWithDataPart)).toEqual([
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "text", text: "Here is the order.", state: "done" },
        { type: "data-orderCard", data: { orderId: "42", status: "loaded" } },
      ],
    },
  ]);
});

test("the human transcript names Flue data parts instead of omitting them", () => {
  expect(formatFlueTranscript(snapshotWithDataPart)).toContain(
    '- data orderCard: {"orderId":"42","status":"loaded"}',
  );
});
