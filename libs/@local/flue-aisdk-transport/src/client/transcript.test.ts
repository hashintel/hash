import { expect, test } from "vitest";

import { snapshotToUiMessages } from "./transcript";

import type { MetadataProjectionInput } from "./shared/metadata-projection";
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
          toolName: "render_widget",
          state: "output-available",
          input: { title: "t" },
          output: { hostEnvelope: true, output: "Shown" },
        },
      ],
    },
  ],
  settlements: [],
};

const projectionOptions = {
  clientToolNames: new Set(["render_widget"]),
  mapToolOutput: (output: unknown) =>
    typeof output === "object" &&
    output !== null &&
    "hostEnvelope" in output &&
    "output" in output
      ? output.output
      : output,
  projectMetadata: ({ agentMetadata }: MetadataProjectionInput) =>
    agentMetadata,
};

test("projects each assistant response from its agent metadata and outcome", () => {
  const snapshot: FlueConversationSnapshot = {
    ...snapshotWithPendingClientTool,
    messages: [
      {
        id: "partial",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "stopped-turn",
        metadata: { model: "m" },
        parts: [{ type: "text", state: "done", text: "Partial reply" }],
      },
      {
        id: "next-user",
        role: "user",
        purpose: "user",
        display: "visible",
        submissionId: "answering-turn",
        parts: [{ type: "text", state: "done", text: "Continue" }],
      },
      {
        id: "answer",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "answering-turn",
        parts: [{ type: "text", state: "done", text: "Answer" }],
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
      {
        submissionId: "stopped-answer",
        outcome: "aborted",
        answeredBySubmissionId: "answering-turn",
      },
      { submissionId: "answering-turn", outcome: "completed" },
      { submissionId: "next-turn", outcome: "completed" },
    ],
  };
  const inputs: MetadataProjectionInput[] = [];
  const projected = snapshotToUiMessages(snapshot, {
    ...projectionOptions,
    projectMetadata: (input) => {
      inputs.push(input);
      return input.outcome;
    },
  });

  expect(inputs).toEqual([
    { agentMetadata: { model: "m" }, outcome: "aborted" },
    { agentMetadata: undefined, outcome: "aborted" },
    { agentMetadata: undefined, outcome: "completed" },
  ]);
  expect(projected.map(({ id, metadata }) => [id, metadata])).toEqual([
    ["partial", "aborted"],
    ["next-user", undefined],
    ["answer", "aborted"],
    ["complete", "completed"],
  ]);
});

test("rehydrates host-defined client tools as dynamic", () => {
  expect(
    snapshotToUiMessages(snapshotWithPendingClientTool, {
      ...projectionOptions,
      dynamicClientToolNames: new Set(["render_widget"]),
    }),
  ).toEqual([
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "render_widget",
          toolCallId: "tool-doc-1",
          state: "output-available",
          input: { title: "t" },
          output: "Shown",
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
            toolCallId: "tool-lookup-1",
            toolName: "lookup",
            state: "input-available",
            input: { q: "x" },
          },
        ],
      },
    ],
  };

  expect(snapshotToUiMessages(snapshot, projectionOptions)[0]?.parts).toEqual([
    {
      type: "tool-lookup",
      toolCallId: "tool-lookup-1",
      state: "input-available",
      input: { q: "x" },
      providerExecuted: true,
    },
  ]);
});
