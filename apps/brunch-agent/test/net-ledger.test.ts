import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  draftPetrinautExperimentToolName,
  layoutPetrinautNetToolName,
  deriveMutationEffects,
  expectedNodeDefinition,
  mutatePetrinetInputSchema,
  mutatePetrinautNetToolName,
  readPetrinautNetToolName,
  type ConstructionMutationAttempt,
  type ConstructionMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolResultSignal } from "@hashintel/brunch-agent-transport-aisdk";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core";

import { AWAITING_CLIENT } from "../src/conversation/client-tools.ts";
import * as netLedger from "../src/conversation/net-ledger.ts";

import type {
  FlueConversationMessage,
  FlueConversationSnapshot,
} from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import type { SDCPN } from "@hashintel/petrinaut-core";

const { deriveNetLedger } = netLedger;

/**
 * The ledger is a deterministic projection over canonical Flue history and
 * nothing more. These tests pin the authority constraints the owner set before
 * any consumer moved onto it:
 *
 * - recomputable and unpersisted;
 * - no new event identities;
 * - missing or ambiguous records preserved as such, never repaired;
 * - live Petrinaut observation kept separate from recorded history;
 * - Flue history remains canonical, in its own order.
 */

const binding = {
  conversationId: "conversation-ledger",
  documentId: "document-ledger",
  incarnationId: "incarnation-ledger",
};
const browser: BrowserContext = { binding };

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};
const oneHopNet: SDCPN = {
  ...emptyNet,
  places: [
    {
      id: "place-1",
      name: "Received",
      x: 0,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
  ],
};
const movedNet: SDCPN = {
  ...oneHopNet,
  places: [{ ...oneHopNet.places[0]!, x: 120, y: 40 }],
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
  observed = observationOf(definition),
): FlueConversationMessage[] => [
  assistantCall(toolCallId, readPetrinautNetToolName),
  resultDelivery(
    toolCallId,
    readPetrinautNetToolName,
    { title: "Net", definition },
    { observation: { toolCallId, binding, observed } },
  ),
];

const mutationTurn = (
  toolCallId: string,
  pre: SDCPN,
  post: SDCPN | undefined,
  outcome: ConstructionMutationAttempt["outcome"] = post === undefined
    ? "unknown"
    : "applied",
): FlueConversationMessage[] => {
  const operationId = "add-place";
  const batch = mutatePetrinetInputSchema.parse({
    observation: { toolCallId: "read-1", baseHash: sha256Of(pre) },
    bases: [
      {
        basisId: "absent-basis",
        basis: { kind: "absent", reason: "Ledger test fixture." },
      },
    ],
    operations: [
      {
        operationId,
        basisId: "absent-basis",
        type: "addPlace",
        input: oneHopNet.places[0],
      },
    ],
  });
  const attempts: ConstructionMutationAttempt[] = [];
  if (post !== undefined) {
    const request: ConstructionMutationRequest = {
      toolCallId: `${toolCallId}:${operationId}`,
      toolName: "addPlace",
      input: oneHopNet.places[0]!,
      binding,
      observationToolCallId: batch.observation.toolCallId,
      requestedBaseHash: batch.observation.baseHash,
    };
    attempts.push({
      request,
      binding,
      outcome,
      pre: observationOf(pre),
      post: observationOf(post),
      effects: deriveMutationEffects(request, pre, post),
      ...(outcome === "unknown"
        ? { error: "The final browser state is unknown." }
        : {}),
    });
  }
  return [
    assistantCall(toolCallId, mutatePetrinautNetToolName, batch),
    resultDelivery(
      toolCallId,
      mutatePetrinautNetToolName,
      {
        execution: "ordered-stop",
        toolCallId,
        observationToolCallId: batch.observation.toolCallId,
        preHash: sha256Of(pre),
        postHash: sha256Of(post ?? pre),
        outcomes: [
          outcome === "unknown"
            ? {
                index: 0,
                operationId,
                basisId: "absent-basis",
                status: "unknown",
                preHash: sha256Of(pre),
                ...(post === undefined ? {} : { postHash: sha256Of(post) }),
                error: "The final browser state is unknown.",
              }
            : {
                index: 0,
                operationId,
                basisId: "absent-basis",
                status: "applied",
                preHash: sha256Of(pre),
                postHash: sha256Of(post ?? pre),
                effects: [],
              },
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

const canonicalReadTurn = (
  toolCallId: string,
  definition: SDCPN,
): FlueConversationMessage[] => [
  assistantCall(toolCallId, getLatestNetDefinitionToolName),
  resultDelivery(
    toolCallId,
    getLatestNetDefinitionToolName,
    { title: "Net", definition },
    {
      observation: {
        toolCallId,
        binding,
        observed: observationOf(definition),
      },
    },
  ),
];

const canonicalMutationTurn = (toolCallId: string) => {
  const canonicalInput = oneHopNet.places[0]!;
  const request: ConstructionMutationRequest = {
    toolCallId,
    toolName: "addPlace",
    input: canonicalInput,
    binding,
    requestedBaseHash: sha256Of(emptyNet),
  };
  const post = expectedNodeDefinition(request, emptyNet);
  const preObservation = {
    ...observationOf(emptyNet),
    revisionId: "revision-1",
  };
  const postObservation = {
    ...observationOf(post),
    revisionId: "revision-2",
  };
  const record = {
    toolCallId,
    toolName: "addPlace",
    binding,
    input: canonicalInput,
    pre: preObservation,
    post: postObservation,
    outcome: "applied" as const,
    effects: deriveMutationEffects(request, emptyNet, post),
    settlement: { status: "settled" as const, revisionId: "revision-2" },
    diagnostics: { status: "not-required" as const },
    output: { placeId: canonicalInput.id },
  };
  return {
    post,
    record,
    messages: [
      assistantCall(toolCallId, "addPlace", canonicalInput),
      resultDelivery(toolCallId, "addPlace", record.output, {
        canonicalMutationRecord: record,
      }),
    ] satisfies FlueConversationMessage[],
  };
};

const layoutTurn = (
  toolCallId: string,
  pre: SDCPN,
  post: SDCPN,
): FlueConversationMessage[] => [
  assistantCall(toolCallId, layoutPetrinautNetToolName, {
    askUserFirst: false,
  }),
  resultDelivery(
    toolCallId,
    layoutPetrinautNetToolName,
    { commitCount: 1 },
    {
      layoutRecord: {
        toolCallId,
        binding,
        pre: observationOf(pre),
        post: observationOf(post),
        effects: [],
      },
    },
  ),
];

const snapshotOf = (
  messages: readonly FlueConversationMessage[],
): FlueConversationSnapshot => ({
  v: 1,
  conversationId: binding.conversationId,
  offset: "offset",
  messages: [...messages],
  settlements: [],
});

const userTurn = (id: string, text: string): FlueConversationMessage => ({
  id,
  role: "user",
  purpose: "user",
  display: "visible",
  parts: [{ type: "text", text, state: "done" }],
});

const fullHistory = () =>
  snapshotOf([
    userTurn("user-1", "Build the receiving dock."),
    ...readTurn("read-1", emptyNet),
    ...mutationTurn("mutate-1", emptyNet, oneHopNet),
    ...layoutTurn("layout-1", oneHopNet, movedNet),
    ...readTurn("read-2", movedNet),
  ]);

/** Every tool call the assistant made, keyed by id, with where it sits in history. */
const assistantCallsOf = (snapshot: FlueConversationSnapshot) => {
  const calls = new Map<string, { messageIndex: number; partIndex: number }>();
  snapshot.messages.forEach((message, messageIndex) => {
    if (message.role !== "assistant") return;
    message.parts.forEach((part, partIndex) => {
      if (part.type === "dynamic-tool")
        calls.set(part.toolCallId, { messageIndex, partIndex });
    });
  });
  return calls;
};

describe("the net ledger is a projection over Flue history", () => {
  test("folds reads, mutations and layout in history order with verified hashes", async () => {
    const events = await deriveNetLedger(fullHistory(), browser);
    expect(events.map((event) => [event.kind, event.toolCallId])).toEqual([
      ["read", "read-1"],
      ["mutation", "mutate-1"],
      ["layout", "layout-1"],
      ["read", "read-2"],
    ]);
    expect(events[0]).toMatchObject({
      kind: "read",
      observation: { sha256: sha256Of(emptyNet) },
    });
    expect(events[1]).toMatchObject({
      kind: "mutation",
      toolName: "mutate_petrinaut_net",
      outcome: "applied",
      postHash: sha256Of(oneHopNet),
    });
    expect(events[2]).toMatchObject({
      kind: "layout",
      pre: { sha256: sha256Of(oneHopNet) },
      post: { sha256: sha256Of(movedNet) },
    });
  });

  test("recognizes canonical reads and verified canonical mutation records", async () => {
    const mutation = canonicalMutationTurn("canonical-add");
    const events = await deriveNetLedger(
      snapshotOf([
        ...canonicalReadTurn("canonical-read", emptyNet),
        ...mutation.messages,
      ]),
      browser,
    );
    expect(events).toMatchObject([
      {
        kind: "read",
        toolCallId: "canonical-read",
        observation: { sha256: sha256Of(emptyNet) },
      },
      {
        kind: "mutation",
        toolCallId: "canonical-add",
        toolName: "addPlace",
        outcome: "applied",
        postHash: sha256Of(mutation.post),
        postRevisionId: "revision-2",
      },
    ]);
  });

  test("keeps duplicate, mismatched and tampered canonical deliveries unrecorded", async () => {
    const mutation = canonicalMutationTurn("canonical-add");
    const cases: FlueConversationMessage[][] = [
      [...mutation.messages, mutation.messages[1]!],
      [
        mutation.messages[0]!,
        resultDelivery("canonical-add", "addPlace", mutation.record.output, {
          canonicalMutationRecord: {
            ...mutation.record,
            input: { ...mutation.record.input, name: "Different" },
          },
        }),
      ],
      [
        mutation.messages[0]!,
        resultDelivery(
          "canonical-add",
          "addPlace",
          { placeId: "different-output" },
          { canonicalMutationRecord: mutation.record },
        ),
      ],
      [
        mutation.messages[0]!,
        resultDelivery("canonical-add", "addPlace", mutation.record.output, {
          canonicalMutationRecord: {
            ...mutation.record,
            settlement: {
              status: "failed",
              revisionId: "revision-2",
              error: "Persistence failed",
            },
          },
        }),
      ],
    ];
    for (const messages of cases) {
      // eslint-disable-next-line no-await-in-loop -- Each independent history is one boundary case.
      const events = await deriveNetLedger(snapshotOf(messages), browser);
      expect(events).toMatchObject([
        { kind: "unrecorded", toolCallId: "canonical-add" },
      ]);
    }
  });

  test("is recomputable: the same history yields the same events, and the module holds no state", async () => {
    const first = await deriveNetLedger(fullHistory(), browser);
    const other = await deriveNetLedger(
      snapshotOf(readTurn("elsewhere", oneHopNet)),
      browser,
    );
    const second = await deriveNetLedger(fullHistory(), browser);
    expect(second).toEqual(first);
    expect(other).toHaveLength(1);
    // Nothing exported is a store, cache or registry: functions and nothing else.
    for (const [name, value] of Object.entries(netLedger)) {
      expect(typeof value, name).toBe("function");
    }
  });

  test("does not write to the history it reads", async () => {
    const snapshot = fullHistory();
    const before = JSON.stringify(snapshot);
    await deriveNetLedger(snapshot, browser);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  test("ignores a completed experiment draft because it cannot change the net", async () => {
    const events = await deriveNetLedger(
      snapshotOf([
        ...readTurn("read-1", emptyNet),
        assistantCall("draft-1", draftPetrinautExperimentToolName),
        resultDelivery("draft-1", draftPetrinautExperimentToolName, {
          status: "drafted",
          summary: "Prepared only",
          diagnostics: [],
        }),
      ]),
      browser,
    );

    expect(events.map((event) => [event.kind, event.toolCallId])).toEqual([
      ["read", "read-1"],
    ]);
  });

  test("introduces no identities: every event names a tool call the assistant made, at its own position", async () => {
    const snapshot = fullHistory();
    const calls = assistantCallsOf(snapshot);
    const events = await deriveNetLedger(snapshot, browser);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(calls.has(event.toolCallId), event.toolCallId).toBe(true);
      expect(event.position).toEqual(calls.get(event.toolCallId));
      // No field other than toolCallId and position identifies the event.
      const identifierLike = Object.keys(event).filter((key) =>
        /id$|Id$|^id$|key$|Key$/u.test(key),
      );
      expect(identifierLike.sort()).toEqual(["toolCallId"]);
    }
  });

  test("preserves missing and ambiguous records as unrecorded events with the reason, never repaired or dropped", async () => {
    const snapshot = snapshotOf([
      ...readTurn("read-1", emptyNet),
      // A mutation whose result never arrived.
      assistantCall("mutate-lost", "mutate_petrinet", { operations: [] }),
      // A mutation delivered twice with different outcomes.
      ...mutationTurn("mutate-twice", emptyNet, oneHopNet),
      resultDelivery(
        "mutate-twice",
        "mutate_petrinet",
        { outcome: "unknown" },
        { mutationRecord: { outcome: "unknown", attempts: [] } },
      ),
      // A mutation whose record cannot vouch for a post observation.
      ...mutationTurn("mutate-unvouched", emptyNet, undefined),
      // A read whose observation hash does not match its definition.
      ...readTurn("read-forged", oneHopNet, {
        definition: oneHopNet,
        sha256: "0".repeat(64),
      }),
      // A read recorded for another document incarnation.
      assistantCall("read-elsewhere", readPetrinautNetToolName),
      resultDelivery(
        "read-elsewhere",
        readPetrinautNetToolName,
        { title: "Net", definition: oneHopNet },
        {
          observation: {
            toolCallId: "read-elsewhere",
            binding: { ...binding, incarnationId: "another" },
            observed: observationOf(oneHopNet),
          },
        },
      ),
    ]);
    const events = await deriveNetLedger(snapshot, browser);
    expect(events.map((event) => [event.kind, event.toolCallId])).toEqual([
      ["read", "read-1"],
      ["unrecorded", "mutate-lost"],
      ["unrecorded", "mutate-twice"],
      ["unrecorded", "mutate-unvouched"],
      ["unrecorded", "read-forged"],
      ["unrecorded", "read-elsewhere"],
    ]);
    for (const event of events.slice(1)) {
      expect(event.kind).toBe("unrecorded");
      if (event.kind !== "unrecorded") continue;
      expect(event.reason.length).toBeGreaterThan(0);
    }
    const reasons = events.flatMap((event) =>
      event.kind === "unrecorded" ? [event.reason] : [],
    );
    expect(reasons[0]).toMatch(/no .*result|not delivered/iu);
    expect(reasons[1]).toMatch(/conflict/iu);
    expect(reasons[2]).toMatch(/vouch|post/iu);
    expect(reasons[3]).toMatch(/hash/iu);
    expect(reasons[4]).toMatch(/incarnation|conversation/iu);
  });

  test.each([
    { toolName: mutatePetrinautNetToolName, aggregate: true },
    { toolName: "legacy_mutation_tool", aggregate: false },
  ])(
    "preserves an unknown aggregate from $toolName as unrecorded despite its verified post",
    async ({ toolName, aggregate }) => {
      const turn = aggregate
        ? mutationTurn("mutate-unknown", emptyNet, oneHopNet, "unknown")
        : [
            assistantCall("mutate-unknown", toolName),
            resultDelivery(
              "mutate-unknown",
              toolName,
              { finalState: "unknown" },
              {
                mutationRecord: {
                  outcome: "unknown",
                  attempts: [
                    {
                      outcome: "applied",
                      post: observationOf(oneHopNet),
                    },
                  ],
                },
              },
            ),
          ];
      await expect(
        deriveNetLedger(snapshotOf(turn), browser),
      ).resolves.toMatchObject([
        { kind: "unrecorded", toolCallId: "mutate-unknown" },
      ]);
    },
  );

  test("takes no live observation: the fold depends on history and the binding alone", async () => {
    expect(deriveNetLedger.length).toBe(2);
    const events = await deriveNetLedger(fullHistory(), browser);
    // A different context object with the same binding is the same fold; the
    // construction flag and any live document state are not inputs.
    const again = await deriveNetLedger(fullHistory(), {
      binding: { ...binding },
    });
    expect(again).toEqual(events);
    for (const event of events) {
      expect(Object.keys(event)).not.toContain("live");
      expect(Object.keys(event)).not.toContain("current");
    }
  });

  test("keeps Flue history canonical: event order is history order, not reordered or deduplicated", async () => {
    const forward = fullHistory();
    const events = await deriveNetLedger(forward, browser);
    const calls = assistantCallsOf(forward);
    const positions = events.map((event) => calls.get(event.toolCallId)!);
    for (let index = 1; index < positions.length; index++) {
      const previous = positions[index - 1]!;
      const next = positions[index]!;
      expect(
        next.messageIndex > previous.messageIndex ||
          (next.messageIndex === previous.messageIndex &&
            next.partIndex > previous.partIndex),
      ).toBe(true);
    }
    // The same read repeated is two events, not one.
    const repeated = await deriveNetLedger(
      snapshotOf([
        ...readTurn("read-a", emptyNet),
        ...readTurn("read-b", emptyNet),
      ]),
      browser,
    );
    expect(repeated.map((event) => event.toolCallId)).toEqual([
      "read-a",
      "read-b",
    ]);
  });
});
