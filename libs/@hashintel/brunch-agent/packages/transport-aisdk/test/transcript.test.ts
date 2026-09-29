import { expect, test } from "vitest";

import { snapshotToUiMessages } from "../src";

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
          output: { brunchBrowserResult: true, output: "Page text" },
        },
      ],
    },
  ],
  settlements: [],
};

const projectionOptions = {
  clientToolNames: new Set(["readPetrinautDoc"]),
};

test("marks only the durably aborted assistant response stopped after reopen", () => {
  const snapshot: FlueConversationSnapshot = {
    ...snapshotWithPendingClientTool,
    messages: [
      {
        id: "partial",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "stopped-turn",
        parts: [{ type: "text", state: "done", text: "Partial reply" }],
      },
      {
        id: "next-user",
        role: "user",
        purpose: "user",
        display: "visible",
        parts: [{ type: "text", state: "done", text: "Continue" }],
      },
      {
        id: "complete",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "next-turn",
        parts: [{ type: "text", state: "done", text: "Complete reply" }],
      },
    ],
    settlements: [
      { submissionId: "stopped-turn", outcome: "aborted" },
      { submissionId: "next-turn", outcome: "completed" },
    ],
  };
  const projected = snapshotToUiMessages(snapshot, projectionOptions);
  expect(projected.find(({ id }) => id === "partial")?.metadata).toEqual({
    stopped: true,
  });
  expect(
    projected.find(({ id }) => id === "complete")?.metadata,
  ).toBeUndefined();
  expect(
    projected.find(({ id }) => id === "next-user")?.metadata,
  ).toBeUndefined();
});

test("rehydrates host-defined client tools as dynamic", () => {
  expect(
    snapshotToUiMessages(snapshotWithPendingClientTool, {
      ...projectionOptions,
      dynamicClientToolNames: new Set(["readPetrinautDoc"]),
    }),
  ).toEqual([
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "readPetrinautDoc",
          toolCallId: "tool-doc-1",
          state: "output-available",
          input: { doc: "ai-assistant" },
          output: "Page text",
          providerExecuted: true,
        },
      ],
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

test("keeps a rehydrated server tool provider-executed while it still runs", () => {
  const snapshot: FlueConversationSnapshot = {
    ...snapshotWithPendingClientTool,
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tool-sweep-1",
            toolName: "brunch_sweep",
            state: "input-available",
            input: { range: "all" },
          },
        ],
      },
    ],
  };

  expect(snapshotToUiMessages(snapshot, projectionOptions)[0]?.parts).toEqual([
    {
      type: "tool-brunch_sweep",
      toolCallId: "tool-sweep-1",
      state: "input-available",
      input: { range: "all" },
      providerExecuted: true,
    },
  ]);
});
