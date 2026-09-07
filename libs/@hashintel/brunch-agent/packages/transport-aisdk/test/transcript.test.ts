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
  hiddenToolNames: new Set(["brunch_mark_question"]),
};

test("retains Voice origins from folded continuation messages", () => {
  const messages: FlueConversationSnapshot["messages"] = [];
  for (const ordinal of [1, 2]) {
    messages.push(
      {
        id: `assistant-${ordinal}`,
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: `tool-${ordinal}`,
            toolName: "readPetrinautDoc",
            state: "output-available",
            input: { doc: "ai-assistant" },
            output: { awaiting: "client" },
          },
        ],
      },
      {
        id: `signal-${ordinal}`,
        role: "system",
        purpose: "dispatch",
        display: "hidden",
        signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
        parts: [
          {
            type: "text",
            state: "done",
            text: JSON.stringify([
              {
                toolCallId: `tool-${ordinal}`,
                output: "A spoken answer",
                source: "voice",
              },
            ]),
          },
        ],
      },
    );
  }
  expect(snapshotToUiMessages({ messages }, projectionOptions)).toMatchObject([
    {
      id: "assistant-1",
      metadata: { source: "voice", voiceToolCallIds: ["tool-1", "tool-2"] },
    },
  ]);
});

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

test("keeps a pending client tool on the final assistant message", () => {
  const snapshot: FlueConversationSnapshot = {
    ...snapshotWithPendingClientTool,
    messages: [
      ...snapshotWithPendingClientTool.messages,
      {
        id: "assistant-waiting",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [
          {
            type: "text",
            text: "Waiting for the browser.",
            state: "done",
          },
        ],
      },
    ],
  };

  expect(snapshotToUiMessages(snapshot, projectionOptions)).toEqual([
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
        {
          type: "text",
          text: "Waiting for the browser.",
          state: "done",
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

test("reconstructs durable voice provenance for each browser result", () => {
  const snapshot: FlueConversationSnapshot = {
    ...snapshotWithPendingClientTool,
    messages: [
      {
        ...snapshotWithPendingClientTool.messages[0]!,
        parts: [
          ...snapshotWithPendingClientTool.messages[0]!.parts,
          {
            type: "dynamic-tool",
            toolCallId: "tool-doc-2",
            toolName: "readPetrinautDoc",
            state: "output-available",
            input: { doc: "ai-assistant" },
            output: { awaiting: "client" },
          },
        ],
      },
      {
        id: "signal-voice-results",
        role: "system",
        purpose: "dispatch",
        display: "hidden",
        signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
        parts: [
          {
            type: "text",
            text: JSON.stringify([
              {
                toolCallId: "tool-doc-1",
                toolName: "readPetrinautDoc",
                output: "First guide",
                source: "voice",
              },
              {
                toolCallId: "tool-doc-2",
                toolName: "readPetrinautDoc",
                output: "Second guide",
                source: "voice",
              },
            ]),
            state: "done",
          },
        ],
      },
    ],
  };

  expect(snapshotToUiMessages(snapshot, projectionOptions)).toEqual([
    expect.objectContaining({
      id: "assistant-1",
      metadata: {
        source: "voice",
        voiceToolCallIds: ["tool-doc-1", "tool-doc-2"],
      },
    }),
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

test("folds a client-tool continuation into the assistant message it resumed", () => {
  const snapshot: FlueConversationSnapshot = {
    ...snapshotWithPendingClientTool,
    messages: [
      {
        id: "user-1",
        role: "user",
        purpose: "user",
        display: "visible",
        parts: [{ type: "text", text: "Read the guide.", state: "done" }],
      },
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
            text: '[{"toolCallId":"tool-doc-1","toolName":"readPetrinautDoc","output":"The guide."}]',
            state: "done",
          },
        ],
      },
      {
        id: "assistant-2",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [{ type: "text", text: "The guide says hello.", state: "done" }],
      },
      {
        id: "user-2",
        role: "user",
        purpose: "user",
        display: "visible",
        parts: [{ type: "text", text: "Thanks.", state: "done" }],
      },
      {
        id: "assistant-3",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [{ type: "text", text: "You are welcome.", state: "done" }],
      },
    ],
  };

  expect(snapshotToUiMessages(snapshot, projectionOptions)).toEqual([
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Read the guide.", state: "done" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-readPetrinautDoc",
          toolCallId: "tool-doc-1",
          state: "output-available",
          input: { doc: "ai-assistant" },
          output: "The guide.",
        },
        { type: "text", text: "The guide says hello.", state: "done" },
      ],
    },
    {
      id: "user-2",
      role: "user",
      parts: [{ type: "text", text: "Thanks.", state: "done" }],
    },
    {
      id: "assistant-3",
      role: "assistant",
      parts: [{ type: "text", text: "You are welcome.", state: "done" }],
    },
  ]);
});

test("hides a question-marker tool while retaining its durable data", () => {
  const question = "Which line should run this order?";
  const snapshot: FlueConversationSnapshot = {
    v: 1,
    conversationId: "conversation-1",
    offset: "0",
    messages: [
      {
        id: "assistant-question",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tool-question-1",
            toolName: "brunch_mark_question",
            state: "output-available",
            input: { question },
            output: { marked: true },
          },
          {
            type: "data-brunch-question",
            data: { question, toolCallId: "tool-question-1" },
          },
          { type: "text", text: question, state: "done" },
        ],
      },
    ],
    settlements: [],
  };

  expect(snapshotToUiMessages(snapshot, projectionOptions)).toEqual([
    {
      id: "assistant-question",
      role: "assistant",
      parts: [
        {
          type: "data-brunch-question",
          data: { question, toolCallId: "tool-question-1" },
        },
        { type: "text", text: question, state: "done" },
      ],
    },
  ]);
});
