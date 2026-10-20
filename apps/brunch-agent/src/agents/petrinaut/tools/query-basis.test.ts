import { expect, test } from "vitest";

import { queryBasis } from "./query-basis.ts";

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

const [user, assistant] = snapshot.messages;
const [commit, add, read] = assistant?.parts ?? [];
const committed = (
  toolCallId: string,
  revision: number,
  entries: unknown[],
  ids: string[],
) => ({
  type: "dynamic-tool",
  toolName: "ledger_commit",
  toolCallId,
  state: "output-available",
  input: { entries },
  output: { status: "recorded", commitId: toolCallId, revision, ids },
});
const queueReflection = committed(
  "ledger-2",
  2,
  [
    [
      "reflection/create",
      {
        text: "The Queue place holds waiting cases.",
        netElements: [{ kind: "place", id: "queue" }],
        claims: ["c1"],
      },
    ],
  ],
  ["r1"],
);

test("query_basis reports no recorded basis for an element no reflection names", () => {
  expect(
    queryBasis({ snapshot, browser, query: { kind: "place", name: "Queue" } }),
  ).toMatchObject({
    disposition: "basis-absent",
    target: { id: "queue" },
    basis: undefined,
    changes: [
      {
        toolCallId: "add-queue",
        petrinautRevisionId: "revision-2",
        ledgerRevision: 1,
      },
    ],
  });
});

test("query_basis returns the reflection naming an element, what it rests on, and its turns", () => {
  const laterTurn = committed(
    "ledger-3",
    3,
    [
      [
        "claim/create",
        {
          text: "The queue is first come, first served.",
          entities: ["e1"],
          origin: "stated",
          status: "confirmed",
        },
      ],
    ],
    ["c2"],
  );
  const history = {
    ...snapshot,
    messages: [
      user,
      { ...assistant, parts: [commit, add, queueReflection, read] },
      { ...user, id: "user-2" },
      { ...assistant, id: "assistant-2", parts: [laterTurn] },
    ],
  } as FlueConversationSnapshot;

  const result = queryBasis({
    snapshot: history,
    browser,
    query: { kind: "place", name: "Queue" },
  });
  expect(result).toMatchObject({
    disposition: "basis-declared",
    changes: [{ toolCallId: "add-queue", ledgerRevision: 1 }],
  });
  // A later claim about the same entity is not part of the basis.
  expect(result.basis).toEqual({
    reflections: [
      {
        id: "r1",
        text: "The Queue place holds waiting cases.",
        netElements: [{ kind: "place", id: "queue" }],
        claims: ["c1"],
        turn: "user-1",
      },
    ],
    obligations: [],
    claims: [
      {
        id: "c1",
        text: "Cases wait in a queue.",
        entities: ["e1"],
        origin: "stated",
        status: "confirmed",
        turn: "user-1",
      },
    ],
    entities: [
      {
        id: "e1",
        name: "The queue",
        kind: "location",
        origin: "stated",
        status: "confirmed",
        turn: "user-1",
      },
    ],
    superseded: {},
    turns: [{ id: "user-1", excerpt: "Cases wait in a queue." }],
  });
});

test("query_basis marks a claim the basis rests on that a later claim replaced", () => {
  const correction = committed(
    "ledger-3",
    3,
    [
      [
        "claim/create",
        {
          text: "Cases wait in two queues.",
          entities: ["e1"],
          origin: "stated",
          status: "confirmed",
          supersedes: ["c1"],
        },
      ],
    ],
    ["c2"],
  );
  const history = {
    ...snapshot,
    messages: [
      user,
      { ...assistant, parts: [commit, add, queueReflection, read] },
      { ...user, id: "user-2" },
      { ...assistant, id: "assistant-2", parts: [correction] },
    ],
  } as FlueConversationSnapshot;

  expect(
    queryBasis({
      snapshot: history,
      browser,
      query: { kind: "place", name: "Queue" },
    }).basis?.superseded,
  ).toEqual({ c1: "c2" });
});

test("query_basis matches a reflection that names an arc by Petrinaut's generated arc ID", () => {
  const [queue] = definition.places;
  const withArc = {
    ...definition,
    places: [queue, { ...queue, id: "served", name: "Served" }],
    transitions: [
      {
        id: "serve",
        name: "Serve",
        inputArcs: [{ placeId: "queue", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "served", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 0,
        y: 0,
      },
    ],
  };
  const readArc = {
    ...read,
    output: {
      brunchBrowserResult: true,
      output: { title: "Queue", definition: withArc },
      metadata: { documentRevision: { before: "revision-2" } },
    },
  };
  const arcReflection = committed(
    "ledger-2",
    2,
    [
      [
        "reflection/create",
        {
          text: "Serving takes the oldest waiting case.",
          netElements: [{ kind: "arc", id: "$A_place:queue___serve" }],
          claims: ["c1"],
        },
      ],
    ],
    ["r1"],
  );
  const history = {
    ...snapshot,
    messages: [user, { ...assistant, parts: [commit, arcReflection, readArc] }],
  } as FlueConversationSnapshot;

  expect(
    queryBasis({
      snapshot: history,
      browser,
      query: {
        kind: "arc",
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
      },
    }),
  ).toMatchObject({
    disposition: "basis-declared",
    target: { id: "$A_place:queue___serve" },
    basis: { reflections: [{ id: "r1" }] },
  });
});

test("query_basis finds an element inside a subnet and the call that added it there", () => {
  const [queue] = definition.places;
  const intoSubnet = {
    ...add,
    toolCallId: "add-triage",
    input: { id: "triage", name: "Triage", targetSubnetId: "intake" },
  };
  const readWithSubnet = {
    ...read,
    output: {
      brunchBrowserResult: true,
      output: {
        title: "Queue",
        definition: {
          ...definition,
          subnets: [
            {
              id: "intake",
              name: "Intake",
              places: [{ ...queue, id: "triage", name: "Triage" }],
              transitions: [],
              types: [],
              parameters: [],
              differentialEquations: [],
            },
          ],
        },
      },
      metadata: { documentRevision: { before: "revision-2" } },
    },
  };
  const history = {
    ...snapshot,
    messages: [
      user,
      { ...assistant, parts: [commit, intoSubnet, readWithSubnet] },
    ],
  } as FlueConversationSnapshot;

  expect(
    queryBasis({
      snapshot: history,
      browser,
      query: { kind: "place", name: "Triage" },
    }),
  ).toMatchObject({
    disposition: "basis-absent",
    target: { id: "triage" },
    changes: [{ toolCallId: "add-triage", petrinautRevisionId: "revision-2" }],
  });
});

test("query_basis answers from the read-back of a change made after the latest read", () => {
  const [queue] = definition.places;
  const dryer = { ...queue, id: "dryer", name: "Dryer" };
  const build = {
    id: "assistant-build",
    role: "assistant",
    purpose: "assistant",
    display: "visible",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "addPlace",
        toolCallId: "add-dryer",
        state: "output-available",
        input: { id: "dryer", name: "Dryer" },
        output: {
          brunchBrowserResult: true,
          output: { title: "Added place Dryer", applied: true },
          metadata: {
            documentRevision: { before: "revision-2", after: "revision-3" },
            readBack: { ...definition, places: [queue, dryer] },
          },
        },
      },
    ],
  };
  const history = {
    ...snapshot,
    messages: [...snapshot.messages, build],
  } as FlueConversationSnapshot;

  expect(
    queryBasis({
      snapshot: history,
      browser,
      query: { kind: "place", name: "Dryer" },
    }),
  ).toMatchObject({
    disposition: "basis-absent",
    target: { id: "dryer" },
    readToolCallId: "add-dryer",
    changes: [{ toolCallId: "add-dryer", petrinautRevisionId: "revision-3" }],
  });
});
