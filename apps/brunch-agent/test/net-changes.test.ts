import { createHash } from "node:crypto";

import { expect, test } from "vitest";

import {
  isAppliedChange,
  latestNetReadBefore,
  latestSettledWorkpieceBefore,
  netCalls,
} from "../src/conversation/net-changes.ts";
import { queryWorkpiece } from "../src/conversation/why.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const markdown = "# Queue\nA person described the waiting step.";
const current = {
  revisionId: "ledger-1",
  sha256: createHash("sha256").update(markdown).digest("hex"),
  ordinal: 1,
  markdown,
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
const browser = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
    incarnationId: "incarnation",
  },
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
      parts: [{ type: "text", text: "Add a queue.", state: "done" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "mutate_workpiece",
          toolCallId: "ledger-1",
          state: "output-available",
          input: { markdown },
          output: {
            revisionId: "ledger-1",
            sha256: current.sha256,
            ordinal: 1,
            disposition: "applied",
          },
        },
      ],
    },
    {
      id: "assistant-2",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
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
          toolName: "addPlace",
          toolCallId: "noop",
          state: "output-available",
          input: { id: "queue", name: "Queue" },
          output: {
            brunchBrowserResult: true,
            output: { applied: false, reason: "Unchanged" },
            metadata: { documentRevision: { before: "revision-2" } },
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
        {
          type: "dynamic-tool",
          toolName: "draft_petrinaut_experiment",
          toolCallId: "draft",
          state: "output-available",
          input: {},
          output: { brunchBrowserResult: true, output: { prepared: true } },
        },
      ],
    },
  ],
} as FlueConversationSnapshot;

test("credits only canonical applied calls with a settled revision, in history order", () => {
  const calls = netCalls(snapshot);
  expect(calls.map(({ toolCallId }) => toolCallId)).toEqual([
    "add-queue",
    "noop",
    "read-queue",
  ]);
  expect(
    calls.filter(isAppliedChange).map(({ revisionAfter }) => revisionAfter),
  ).toEqual(["revision-2"]);
  expect(latestNetReadBefore(snapshot, "draft")?.toolCallId).toBe("read-queue");
});

test("why locates the latest read element and relates the applied call to its current workpiece revision and user turn", () => {
  expect(
    queryWorkpiece({
      snapshot,
      current,
      browser,
      query: { kind: "place", name: "Queue" },
    }),
  ).toMatchObject({
    disposition: "basis-absent",
    target: { id: "queue" },
    readToolCallId: "read-queue",
    changes: [
      {
        toolCallId: "add-queue",
        petrinautRevisionId: "revision-2",
        workpieceRevisionId: "ledger-1",
        workpieceRevisionTurns: {
          revisionId: "ledger-1",
          startTurn: 1,
          endTurn: 1,
          userMessageIds: ["user-1"],
        },
      },
    ],
  });
  expect(
    queryWorkpiece({
      snapshot,
      current,
      browser,
      query: { kind: "place", name: "Missing" },
    }).disposition,
  ).toBe("not-found");
});

test("why refuses to answer from a read that a later applied change made stale", () => {
  const later = {
    id: "assistant-later",
    role: "assistant",
    purpose: "assistant",
    display: "visible",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "updatePlace",
        toolCallId: "rename-queue",
        state: "output-available",
        input: { id: "queue", name: "Backlog" },
        output: {
          brunchBrowserResult: true,
          output: { applied: true },
          metadata: {
            documentRevision: { before: "revision-2", after: "revision-3" },
          },
        },
      },
    ],
  };
  expect(
    queryWorkpiece({
      snapshot: {
        ...snapshot,
        messages: [...snapshot.messages, later],
      } as FlueConversationSnapshot,
      current,
      browser,
      query: { kind: "place", name: "Queue" },
    }),
  ).toMatchObject({
    disposition: "stale-read",
    readToolCallId: "read-queue",
    changes: [],
  });
});

test("a refused workpiece write does not displace the latest settled revision for draft or attribution", () => {
  const refused = {
    id: "assistant-refusal",
    role: "assistant",
    purpose: "assistant",
    display: "visible",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "mutate_workpiece",
        toolCallId: "refused-ledger",
        state: "output-available",
        input: { markdown: "# Refused" },
        output: { disposition: "refused", applied: false },
      },
    ],
  };
  const withRefusal = {
    ...snapshot,
    messages: [
      ...snapshot.messages.slice(0, 2),
      refused,
      ...snapshot.messages.slice(2),
    ],
  } as FlueConversationSnapshot;
  expect(latestSettledWorkpieceBefore(withRefusal, "draft")?.revisionId).toBe(
    "ledger-1",
  );
  expect(
    queryWorkpiece({
      snapshot: withRefusal,
      current,
      browser,
      query: { kind: "place", id: "queue" },
    }).changes[0]?.workpieceRevisionId,
  ).toBe("ledger-1");
});

test("why matches a root arc to canonical addArc by transition, direction and place, and to a batch deletion by its generated ID", () => {
  const arcDefinition = {
    ...definition,
    transitions: [
      {
        id: "serve",
        name: "Serve",
        inputArcs: [{ placeId: "queue", weight: 1, type: "standard" }],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 0,
        y: 0,
      },
    ],
  };
  const arcCall = {
    type: "dynamic-tool",
    toolName: "addArc",
    toolCallId: "add-arc",
    state: "output-available",
    input: {
      transitionId: "serve",
      arcDirection: "input",
      placeId: "queue",
      weight: 1,
      type: "standard",
      targetSubnetId: null,
    },
    output: {
      brunchBrowserResult: true,
      output: { applied: true },
      metadata: {
        documentRevision: { before: "revision-2", after: "revision-3" },
      },
    },
  };
  const deletion = (toolCallId: string, arcId: string, after: string) => ({
    type: "dynamic-tool",
    toolName: "deleteItemsByIds",
    toolCallId,
    state: "output-available",
    input: { items: [{ type: "arc", id: arcId }] },
    output: {
      brunchBrowserResult: true,
      output: { applied: true },
      metadata: { documentRevision: { before: "revision-2", after } },
    },
  });
  const priorMessage = snapshot.messages.at(-1);
  if (!priorMessage || priorMessage.role !== "assistant")
    throw new Error("Missing canonical calls");
  const arcSnapshot = {
    ...snapshot,
    messages: [
      ...snapshot.messages.slice(0, -1),
      {
        ...priorMessage,
        parts: [
          ...priorMessage.parts.slice(0, 2),
          deletion("delete-other-arc", "$A_place:other___serve", "revision-2a"),
          deletion("delete-arc", "$A_place:queue___serve", "revision-2b"),
          arcCall,
          {
            ...priorMessage.parts[2],
            output: {
              brunchBrowserResult: true,
              output: { title: "Queue", definition: arcDefinition },
              metadata: { documentRevision: { before: "revision-3" } },
            },
          },
          ...priorMessage.parts.slice(3),
        ],
      },
    ],
  } as FlueConversationSnapshot;
  expect(
    queryWorkpiece({
      snapshot: arcSnapshot,
      current,
      browser,
      query: {
        kind: "arc",
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
      },
    }),
  ).toMatchObject({
    target: { id: "serve:input:queue" },
    changes: [
      { toolCallId: "delete-arc", operation: "deleteItemsByIds" },
      {
        toolCallId: "add-arc",
        operation: "addArc",
        petrinautRevisionId: "revision-3",
        workpieceRevisionId: "ledger-1",
        workpieceRevisionTurns: { userMessageIds: ["user-1"] },
      },
    ],
  });
});
