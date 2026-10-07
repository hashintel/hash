import { expect, test } from "vitest";

import { queryBasis } from "../src/agents/chat-agent/guidance/manual/tools/query-basis-tool.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const browser = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
    incarnationId: "incarnation",
  },
};
const definition = {
  places: [
    {
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};
const snapshot = {
  v: 1,
  conversationId: "conversation",
  offset: "1",
  settlements: [],
  messages: [
    {
      id: "user-1",
      role: "user",
      purpose: "user",
      display: "visible",
      parts: [{ type: "text", text: "Cases wait in a queue.", state: "done" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "ledger_commit",
          toolCallId: "ledger-1",
          state: "output-available",
          input: {
            entries: [
              [
                "entity/create",
                {
                  name: "The queue",
                  kind: "location",
                  origin: "stated",
                  status: "confirmed",
                },
              ],
              [
                "claim/create",
                {
                  text: "Cases wait in a queue.",
                  entities: ["$0"],
                  origin: "stated",
                  status: "confirmed",
                },
              ],
            ],
          },
          output: {
            status: "recorded",
            commitId: "ledger-1",
            revision: 1,
            ids: ["e1", "c1"],
          },
        },
        {
          type: "dynamic-tool",
          toolName: "addPlace",
          toolCallId: "add-queue",
          state: "output-available",
          input: { id: "queue", name: "Queue" },
          output: {
            brunchBrowserResult: true,
            output: { title: "Added place Queue", applied: true },
            metadata: {
              documentRevision: { before: "revision-1", after: "revision-2" },
            },
          },
        },
        {
          type: "dynamic-tool",
          toolName: "getLatestNetDefinition",
          toolCallId: "read-queue",
          state: "output-available",
          input: {},
          output: {
            brunchBrowserResult: true,
            output: { title: "Queue", definition },
            metadata: { documentRevision: { before: "revision-2" } },
          },
        },
      ],
    },
  ],
} as FlueConversationSnapshot;

test("the manual arm's query_basis attributes a net change to its own ledger2 revision and records", () => {
  expect(
    queryBasis({ snapshot, browser, query: { kind: "place", name: "Queue" } }),
  ).toMatchObject({
    disposition: "basis-absent",
    target: { id: "queue" },
    changes: [
      {
        toolCallId: "add-queue",
        petrinautRevisionId: "revision-2",
        ledgerRevision: 1,
        recordsCommittedThisTurn: ["e1", "c1"],
      },
    ],
  });
});
