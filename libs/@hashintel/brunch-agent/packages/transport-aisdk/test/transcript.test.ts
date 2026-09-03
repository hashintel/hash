import { expect, test } from "vitest";

import { CLIENT_TOOL_RESULT_SIGNAL, snapshotToUiMessages } from "../src";

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

const projectionOptions = {
  clientToolNames: new Set(["readPetrinautDoc"]),
};

test("leaves an unfinished client tool available to run", () => {
  expect(
    snapshotToUiMessages(snapshotWithPendingClientTool, projectionOptions),
  ).toEqual([
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

test("uses a recorded browser result even when it is null", () => {
  const snapshot: FlueConversationSnapshot = {
    ...snapshotWithPendingClientTool,
    messages: [
      ...snapshotWithPendingClientTool.messages,
      {
        id: "signal-1",
        role: "system",
        purpose: "dispatch",
        display: "hidden",
        signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
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

  expect(snapshotToUiMessages(snapshot, projectionOptions)[0]?.parts).toEqual([
    {
      type: "tool-readPetrinautDoc",
      toolCallId: "tool-doc-1",
      state: "output-available",
      input: { doc: "ai-assistant" },
      output: null,
    },
  ]);
});

test("keeps Flue data parts on the AI SDK message", () => {
  const snapshot: FlueConversationSnapshot = {
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
          {
            type: "data-orderCard",
            data: { orderId: "42", status: "loaded" },
          },
        ],
      },
    ],
    settlements: [],
  };

  expect(snapshotToUiMessages(snapshot, projectionOptions)).toEqual([
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
