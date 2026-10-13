import { expect, test } from "vitest";

import { queryBasis } from "../src/agents/petrinaut/tools/query-basis.ts";

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

test("query_basis attributes a net change to the Ledger revision and records", () => {
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
        recordsCommittedThisTurn: [
          {
            id: "e1",
            type: "entity",
            name: "The queue",
            kind: "location",
            origin: "stated",
            status: "confirmed",
          },
          {
            id: "c1",
            type: "claim",
            text: "Cases wait in a queue.",
            entities: ["e1"],
            origin: "stated",
            status: "confirmed",
          },
        ],
      },
    ],
  });
});

test("query_basis returns a reflection committed this turn with its text and net elements", () => {
  const [user, assistant] = snapshot.messages;
  const [commit, ...calls] = assistant?.parts ?? [];
  const reflectionCommit = {
    type: "dynamic-tool",
    toolName: "ledger_commit",
    toolCallId: "ledger-2",
    state: "output-available",
    input: {
      entries: [
        [
          "reflection/create",
          {
            text: "The Queue place holds waiting cases.",
            netElements: [{ kind: "place", id: "queue" }],
            claims: ["c1"],
          },
        ],
      ],
    },
    output: {
      status: "recorded",
      commitId: "ledger-2",
      revision: 2,
      ids: ["r1"],
    },
  };
  const withReflection = {
    ...snapshot,
    messages: [
      user,
      { ...assistant, parts: [commit, reflectionCommit, ...calls] },
    ],
  } as FlueConversationSnapshot;

  const [change] = queryBasis({
    snapshot: withReflection,
    browser,
    query: { kind: "place", name: "Queue" },
  }).changes;
  expect(change).toMatchObject({ toolCallId: "add-queue", ledgerRevision: 2 });
  expect(change?.recordsCommittedThisTurn.map(({ id }) => id)).toEqual([
    "e1",
    "c1",
    "r1",
  ]);
  expect(change?.recordsCommittedThisTurn.at(-1)).toEqual({
    id: "r1",
    type: "reflection",
    text: "The Queue place holds waiting cases.",
    netElements: [{ kind: "place", id: "queue" }],
    claims: ["c1"],
  });
});
