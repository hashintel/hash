import { createHash } from "node:crypto";

import { expect, test } from "vitest";

import {
  deriveMutationEffects,
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
  type ConstructionMutationAttempt,
  type ConstructionMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolResultSignal } from "@hashintel/brunch-agent-transport-aisdk";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import { AWAITING_CLIENT } from "../src/conversation/client-tools.ts";
import { deriveNetFreshness } from "../src/conversation/net-freshness.ts";

import type {
  FlueConversationMessage,
  FlueConversationSnapshot,
} from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import type { SDCPN } from "@hashintel/petrinaut-core";

const binding = {
  conversationId: "conversation-freshness",
  documentId: "document-freshness",
  incarnationId: "incarnation-freshness",
};
const browser: BrowserContext = { binding, construction: true };

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};
const oneHopPlace: SDCPN["places"][number] = {
  id: "place-1",
  name: "Received",
  x: 0,
  y: 0,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
};
const oneHopNet: SDCPN = {
  ...emptyNet,
  places: [oneHopPlace],
};
const sha256Of = (definition: SDCPN): string =>
  createHash("sha256").update(JSON.stringify(definition)).digest("hex");
const observationOf = (definition: SDCPN) => ({
  definition,
  sha256: sha256Of(definition),
});

const assistantCall = (
  toolCallId: string,
  toolName: string,
  input: unknown = {},
): FlueConversationMessage => ({
  id: `assistant-${toolCallId}`,
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  parts: [
    {
      type: "dynamic-tool",
      toolCallId,
      toolName,
      state: "output-available",
      input,
      output: { awaiting: AWAITING_CLIENT },
    },
  ],
});

const resultDelivery = (
  toolCallId: string,
  toolName: string,
  output: unknown,
  metadata?: unknown,
): FlueConversationMessage => {
  const signal = clientToolResultSignal([
    {
      toolCallId,
      toolName,
      output,
      ...(metadata === undefined ? {} : { metadata }),
    },
  ]);
  return {
    id: `dispatch-${toolCallId}`,
    role: "system",
    purpose: "dispatch",
    display: "hidden",
    signal: { tagName: signal.tagName },
    parts: [{ type: "text", text: signal.body, state: "done" }],
  };
};

const readTurn = (
  toolCallId: string,
  definition: SDCPN,
): FlueConversationMessage[] => [
  assistantCall(toolCallId, getLatestNetDefinitionToolName),
  resultDelivery(
    toolCallId,
    getLatestNetDefinitionToolName,
    { title: "Net", definition },
    {
      observation: { toolCallId, binding, observed: observationOf(definition) },
    },
  ),
];

const mutationTurn = (
  toolCallId: string,
  pre: SDCPN,
  post: SDCPN | undefined,
  alterAttempt?: (
    attempt: ConstructionMutationAttempt,
  ) => ConstructionMutationAttempt,
  outcome: ConstructionMutationAttempt["outcome"] = post === undefined
    ? "unknown"
    : "applied",
  omittedOperationStatus?: "applied" | "unattempted",
): FlueConversationMessage[] => {
  const operationId = "add-place";
  const batch = mutatePetrinetInputSchema.parse({
    observation: { toolCallId: "read-1", baseHash: sha256Of(pre) },
    bases: [
      {
        basisId: "absent-basis",
        basis: { kind: "absent", reason: "Freshness test fixture." },
      },
    ],
    operations: [
      {
        operationId,
        basisId: "absent-basis",
        type: "addPlace",
        input: oneHopPlace,
      },
      ...(omittedOperationStatus
        ? [
            {
              operationId: "add-omitted-place",
              basisId: "absent-basis",
              type: "addPlace" as const,
              input: { ...oneHopPlace, id: "place-2", name: "Omitted" },
            },
          ]
        : []),
    ],
  });
  const attempts: ConstructionMutationAttempt[] = [];
  if (post !== undefined) {
    const request: ConstructionMutationRequest = {
      toolCallId: `${toolCallId}:${operationId}`,
      toolName: "addPlace",
      input: oneHopPlace,
      binding,
      requestedBaseHash: sha256Of(pre),
      observationToolCallId: batch.observation.toolCallId,
    };
    const attempt: ConstructionMutationAttempt = {
      request,
      binding,
      outcome,
      pre: observationOf(pre),
      post: observationOf(post),
      effects: deriveMutationEffects(request, pre, post),
    };
    attempts.push(alterAttempt?.(attempt) ?? attempt);
  }
  return [
    assistantCall(toolCallId, mutatePetrinetToolName, batch),
    resultDelivery(
      toolCallId,
      mutatePetrinetToolName,
      {
        execution: "ordered-stop",
        toolCallId,
        observationToolCallId: batch.observation.toolCallId,
        preHash: sha256Of(pre),
        postHash: sha256Of(post ?? pre),
        outcomes: [
          outcome === "applied" || outcome === "no-op"
            ? {
                index: 0,
                operationId,
                basisId: "absent-basis",
                status: outcome,
                preHash: sha256Of(pre),
                postHash: sha256Of(post ?? pre),
                effects: [],
              }
            : outcome === "failed"
              ? {
                  index: 0,
                  operationId,
                  basisId: "absent-basis",
                  status: outcome,
                  preHash: sha256Of(pre),
                  postHash: sha256Of(post ?? pre),
                  error: "Browser rejected the mutation.",
                }
              : {
                  index: 0,
                  operationId,
                  basisId: "absent-basis",
                  status: "unknown",
                  preHash: sha256Of(pre),
                  ...(post === undefined ? {} : { postHash: sha256Of(post) }),
                  error: "The final browser state is unknown.",
                },
          ...(omittedOperationStatus
            ? [
                omittedOperationStatus === "applied"
                  ? {
                      index: 1,
                      operationId: "add-omitted-place",
                      basisId: "absent-basis",
                      status: "applied" as const,
                      preHash: sha256Of(post ?? pre),
                      postHash: sha256Of(post ?? pre),
                      effects: [],
                    }
                  : {
                      index: 1,
                      operationId: "add-omitted-place",
                      basisId: "absent-basis",
                      status: "unattempted" as const,
                    },
              ]
            : []),
        ],
      },
      {
        mutationRecord: {
          outcome,
          attempts,
        },
      },
    ),
  ];
};

const snapshotOf = (
  messages: readonly FlueConversationMessage[],
): FlueConversationSnapshot => ({
  v: 1,
  conversationId: binding.conversationId,
  offset: "offset",
  messages: [...messages],
  settlements: [],
});

test("an empty history has never been read", async () => {
  expect(await deriveNetFreshness(snapshotOf([]), browser)).toEqual({
    kind: "never-read",
  });
});

test("one verified read is current", async () => {
  expect(
    await deriveNetFreshness(snapshotOf(readTurn("read-1", emptyNet)), browser),
  ).toEqual({ kind: "current", hash: sha256Of(emptyNet) });
});

test("an applied mutation with a different post hash makes the last read stale", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn("mutate-1", emptyNet, oneHopNet),
      ]),
      browser,
    ),
  ).toEqual({
    kind: "stale",
    lastReadHash: sha256Of(emptyNet),
    lastKnownHash: sha256Of(oneHopNet),
  });
});

test("a re-read after the mutation is current again", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn("mutate-1", emptyNet, oneHopNet),
        ...readTurn("read-2", oneHopNet),
      ]),
      browser,
    ),
  ).toEqual({ kind: "current", hash: sha256Of(oneHopNet) });
});

test("a mutation without a verifiable record leaves the current net unrecorded", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn("mutate-1", emptyNet, undefined),
      ]),
      browser,
    ),
  ).toEqual({
    kind: "stale",
    lastReadHash: sha256Of(emptyNet),
    lastKnownHash: undefined,
  });
});

test("a mutation whose declared effects do not verify leaves the current net unrecorded", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn("mutate-1", emptyNet, oneHopNet, (attempt) => ({
          ...attempt,
          effects: { created: [], updated: [], deleted: [], derived: [] },
        })),
      ]),
      browser,
    ),
  ).toEqual({
    kind: "stale",
    lastReadHash: sha256Of(emptyNet),
    lastKnownHash: undefined,
  });
});

test.each([
  {
    outcome: "no-op" as const,
    alterAttempt: (attempt: ConstructionMutationAttempt) => attempt,
  },
  {
    outcome: "failed" as const,
    alterAttempt: (attempt: ConstructionMutationAttempt) => ({
      ...attempt,
      error: "Browser rejected the mutation.",
    }),
  },
])(
  "a verified $outcome mutation retains its unchanged post as the current net",
  async ({ outcome, alterAttempt }) => {
    expect(
      await deriveNetFreshness(
        snapshotOf([
          ...readTurn("read-1", emptyNet),
          ...mutationTurn(
            "mutate-1",
            emptyNet,
            emptyNet,
            alterAttempt,
            outcome,
          ),
        ]),
        browser,
      ),
    ).toEqual({ kind: "current", hash: sha256Of(emptyNet) });
  },
);

test("an impossible stale batch record leaves the current net unrecorded", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn(
          "mutate-1",
          emptyNet,
          emptyNet,
          (attempt) => ({
            ...attempt,
            request: {
              ...attempt.request,
              requestedBaseHash: "f".repeat(64),
            },
          }),
          "stale",
        ),
      ]),
      browser,
    ),
  ).toEqual({
    kind: "stale",
    lastReadHash: sha256Of(emptyNet),
    lastKnownHash: undefined,
  });
});

test("a mutation record for another document incarnation leaves the current net unrecorded", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn("mutate-1", emptyNet, oneHopNet, (attempt) => ({
          ...attempt,
          binding: { ...binding, incarnationId: "another-incarnation" },
        })),
      ]),
      browser,
    ),
  ).toEqual({
    kind: "stale",
    lastReadHash: sha256Of(emptyNet),
    lastKnownHash: undefined,
  });
});

test("a mutation record that omits an issued operation leaves the current net unrecorded", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn(
          "mutate-1",
          emptyNet,
          oneHopNet,
          undefined,
          "applied",
          "applied",
        ),
      ]),
      browser,
    ),
  ).toEqual({
    kind: "stale",
    lastReadHash: sha256Of(emptyNet),
    lastKnownHash: undefined,
  });
});

test("an explicitly unattempted suffix retains the committed prefix hash", async () => {
  expect(
    await deriveNetFreshness(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        ...mutationTurn(
          "mutate-1",
          emptyNet,
          oneHopNet,
          undefined,
          "applied",
          "unattempted",
        ),
      ]),
      browser,
    ),
  ).toEqual({
    kind: "stale",
    lastReadHash: sha256Of(emptyNet),
    lastKnownHash: sha256Of(oneHopNet),
  });
});

test("an unverifiable observation is not a read", async () => {
  const toolCallId = "read-forged";
  expect(
    await deriveNetFreshness(
      snapshotOf([
        assistantCall(toolCallId, getLatestNetDefinitionToolName),
        resultDelivery(
          toolCallId,
          getLatestNetDefinitionToolName,
          { title: "Net", definition: emptyNet },
          {
            observation: {
              toolCallId,
              binding,
              observed: { definition: emptyNet, sha256: "0".repeat(64) },
            },
          },
        ),
      ]),
      browser,
    ),
  ).toEqual({ kind: "never-read" });
});

test("a read belonging to another document incarnation is not a read", async () => {
  expect(
    await deriveNetFreshness(snapshotOf(readTurn("read-1", emptyNet)), {
      binding: { ...binding, incarnationId: "another-incarnation" },
      construction: true,
    }),
  ).toEqual({ kind: "never-read" });
});
