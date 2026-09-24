import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  applyPetrinautConstructionToolName,
  declarePetrinautProjectionToolName,
  draftPetrinautExperimentToolName,
  layoutPetrinautNetToolName,
  deriveMutationEffects,
  expectedNodeDefinition,
  mutatePetrinetInputSchema,
  mutatePetrinautNetToolName,
  readPetrinautNetToolName,
  type ConstructionMutationAttempt,
  type ConstructionMutationName,
  type ConstructionMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { createDeclarePetrinautProjectionTool } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolResultSignal } from "@hashintel/brunch-agent-transport-aisdk";
import {
  createExperimentToolName,
  getLatestNetDefinitionToolName,
} from "@hashintel/petrinaut-core";

import { AWAITING_CLIENT } from "../src/conversation/client-tools.ts";
import { verifyMutationResults } from "../src/conversation/mutation-delivery.ts";
import { deriveNetFreshness } from "../src/conversation/net-freshness.ts";
import * as netLedger from "../src/conversation/net-ledger.ts";
import { queryWorkpiece } from "../src/conversation/why.ts";

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

const experimentInput = {
  name: "Baseline",
  scenarioId: "scenario-1",
  scenarioParameterValues: {},
  runCount: 10,
  seed: 42,
  dt: 0.1,
  maxTime: 10,
  metricIds: ["throughput"],
  execution: { mode: "simulate" as const },
};
const experimentTurn = (
  toolCallId: string,
  status: "complete" | "cancelled" | "error" = "complete",
): FlueConversationMessage[] => {
  const output = {
    status,
    experimentId: status === "error" ? null : "experiment-1",
    name: experimentInput.name,
    ...(status === "complete" ? {} : { message: `${status} terminal result` }),
    runsCompleted: status === "complete" ? 10 : 3,
    metrics: [
      {
        id: "throughput",
        label: "Throughput",
        value: status === "complete" ? 4 : null,
      },
    ],
  };
  return [
    assistantCall(toolCallId, createExperimentToolName, experimentInput),
    resultDelivery(toolCallId, createExperimentToolName, output, {
      experimentRecord: {
        toolCallId,
        binding,
        input: experimentInput,
        source: {
          ...observationOf(emptyNet),
          revisionId: "source-revision",
        },
        output,
      },
    }),
  ];
};

const canonicalMutationTurn = (
  toolCallId: string,
  pre: SDCPN = emptyNet,
  canonicalInput = oneHopNet.places[0]!,
) => {
  const request: ConstructionMutationRequest = {
    toolCallId,
    toolName: "addPlace",
    input: canonicalInput,
    binding,
    requestedBaseHash: sha256Of(pre),
  };
  const post = expectedNodeDefinition(request, pre);
  const preObservation = {
    ...observationOf(pre),
    revisionId: `${toolCallId}-pre`,
  };
  const postObservation = {
    ...observationOf(post),
    revisionId: `${toolCallId}-post`,
  };
  const record = {
    toolCallId,
    toolName: "addPlace",
    binding,
    input: canonicalInput,
    pre: preObservation,
    post: postObservation,
    outcome: "applied" as const,
    effects: deriveMutationEffects(request, pre, post),
    settlement: {
      status: "settled" as const,
      revisionId: `${toolCallId}-post`,
    },
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

const canonicalTracerMutationTurn = (
  toolCallId: string,
  toolName: Extract<
    ConstructionMutationName,
    "addPlace" | "addTransition" | "addArc"
  >,
  pre: SDCPN,
  canonicalInput: ConstructionMutationRequest["input"],
) => {
  const request = {
    toolCallId,
    toolName,
    input: canonicalInput,
    binding,
    requestedBaseHash: sha256Of(pre),
  } as ConstructionMutationRequest;
  const post =
    toolName === "addArc"
      ? (() => {
          const next = structuredClone(pre);
          const transition = next.transitions.find(
            ({ id }) =>
              id === (canonicalInput as { transitionId: string }).transitionId,
          );
          if (!transition)
            throw new Error("Missing tracer transition fixture.");
          const arc = canonicalInput as {
            arcDirection: "input" | "output";
            placeId: string;
            weight: number;
            type: "standard";
          };
          transition[
            arc.arcDirection === "input" ? "inputArcs" : "outputArcs"
          ].push({ placeId: arc.placeId, weight: arc.weight, type: arc.type });
          return next;
        })()
      : expectedNodeDefinition(request, pre);
  const preObservation = {
    ...observationOf(pre),
    revisionId: `${toolCallId}-pre`,
  };
  const postObservation = {
    ...observationOf(post),
    revisionId: `${toolCallId}-post`,
  };
  const output = { applied: true };
  const record = {
    toolCallId,
    toolName,
    binding,
    input: canonicalInput,
    pre: preObservation,
    post: postObservation,
    outcome: "applied" as const,
    effects: deriveMutationEffects(request, pre, post),
    settlement: {
      status: "settled" as const,
      revisionId: postObservation.revisionId,
    },
    diagnostics: { status: "not-required" as const },
    output,
  };
  return {
    post,
    messages: [
      assistantCall(toolCallId, toolName, canonicalInput),
      resultDelivery(toolCallId, toolName, output, {
        canonicalMutationRecord: record,
      }),
    ] satisfies FlueConversationMessage[],
  };
};

const canonicalNoOpTurn = (toolCallId: string, definition: SDCPN) => {
  const canonicalInput = definition.places[0]!;
  const observation = {
    ...observationOf(definition),
    revisionId: `${toolCallId}-revision`,
  };
  const request: ConstructionMutationRequest = {
    toolCallId,
    toolName: "addPlace",
    input: canonicalInput,
    binding,
    requestedBaseHash: observation.sha256,
  };
  const output = { applied: false, placeId: canonicalInput.id };
  const record = {
    toolCallId,
    toolName: "addPlace",
    binding,
    input: canonicalInput,
    pre: observation,
    post: observation,
    outcome: "no-op" as const,
    effects: deriveMutationEffects(request, definition, definition),
    settlement: { status: "not-required" as const },
    diagnostics: { status: "not-required" as const },
    output,
  };
  return [
    assistantCall(toolCallId, "addPlace", canonicalInput),
    resultDelivery(toolCallId, "addPlace", output, {
      canonicalMutationRecord: record,
    }),
  ];
};

const ledgerMarkdown = "# Ledger\n\nRepresent the receiving process.";
const ledgerRevision = {
  revisionId: "ledger-revision",
  sha256: createHash("sha256").update(ledgerMarkdown).digest("hex"),
  markdown: ledgerMarkdown,
  ordinal: 1,
};
const settlementTurn = (): FlueConversationMessage => ({
  id: "assistant-ledger-revision",
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  parts: [
    {
      type: "dynamic-tool",
      toolCallId: ledgerRevision.revisionId,
      toolName: "mutate_workpiece",
      state: "output-available",
      input: { markdown: ledgerMarkdown, baseRevisionId: null },
      output: {
        revisionId: ledgerRevision.revisionId,
        sha256: ledgerRevision.sha256,
        ordinal: ledgerRevision.ordinal,
      },
    },
  ],
});
const declarationTurn = async (
  id: string,
  operations: Array<{
    operationId: string;
    toolName: "addPlace" | "addTransition" | "addArc";
    intendedEffect: string;
    intendedTarget: string;
    expectedImpact: string[];
    evidence?: { excerpts: string[]; rationale: string };
  }>,
): Promise<FlueConversationMessage> => {
  const result = await createDeclarePetrinautProjectionTool(ledgerRevision).run(
    {
      data: { operations },
    } as never,
  );
  return {
    id: `assistant-${id}`,
    role: "assistant",
    purpose: "assistant",
    display: "visible",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: id,
        toolName: declarePetrinautProjectionToolName,
        state: "output-available",
        input: { operations },
        output: result.output,
      },
    ],
  };
};

const deepConstructionTurn = (options?: { declared?: boolean }) => {
  const toolCallId = "deep-construction";
  const canonical = canonicalMutationTurn(toolCallId);
  const modelInput = {
    operations: [
      {
        operationId: "deep-place",
        toolName: "addPlace" as const,
        intendedEffect: "Represent received work.",
        intendedTarget: "Received",
        expectedImpact: ["the Received place definition"],
        ...(options?.declared
          ? {
              evidence: {
                excerpts: ["Represent the receiving process."],
                rationale: "The settled Ledger names the represented process.",
              },
            }
          : {}),
        input: oneHopNet.places[0]!,
      },
    ],
  };
  const output = {
    execution: "ordered-stop" as const,
    disposition: "complete" as const,
    outcomes: [
      {
        index: 0,
        operationId: "deep-place",
        toolName: "addPlace" as const,
        status: "applied" as const,
        effects: [
          ...canonical.record.effects.created,
          ...canonical.record.effects.updated,
          ...canonical.record.effects.deleted,
          ...canonical.record.effects.derived,
        ],
      },
    ],
    finalObservation: {
      disposition: "observed" as const,
      documentRevision: canonical.record.post.revisionId,
      definitionHash: canonical.record.post.sha256,
    },
    diagnostics: { disposition: "not-required" as const },
    layout: {
      requested: false as const,
      disposition: "not-requested" as const,
    },
  };
  const basis = options?.declared
    ? {
        kind: "declared" as const,
        revisionId: ledgerRevision.revisionId,
        sha256: ledgerRevision.sha256,
        locators: [
          {
            start: ledgerMarkdown.indexOf("Represent the receiving process."),
            end:
              ledgerMarkdown.indexOf("Represent the receiving process.") +
              "Represent the receiving process.".length,
          },
        ],
        rationale: "The settled Ledger names the represented process.",
        scope: "operation" as const,
      }
    : {
        kind: "absent" as const,
        reason: "No exact Ledger excerpt was supplied for this operation.",
      };
  return [
    assistantCall(toolCallId, applyPetrinautConstructionToolName, modelInput),
    resultDelivery(toolCallId, applyPetrinautConstructionToolName, output, {
      deepConstructionRecord: {
        toolCallId,
        binding,
        input: modelInput,
        authority: {
          status: "verified",
          base: canonical.record.pre,
          ledger: {
            revisionId: ledgerRevision.revisionId,
            sha256: ledgerRevision.sha256,
            ordinal: ledgerRevision.ordinal,
          },
          bases: [basis],
        },
        attempts: [canonical.record],
        output,
      },
    }),
  ] satisfies FlueConversationMessage[];
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

  test.each(["complete", "cancelled", "error"] as const)(
    "records a verified terminal %s experiment without a mutation event or freshness change",
    async (status) => {
      const turn = experimentTurn(`experiment-${status}`, status);
      const snapshot = snapshotOf([
        ...canonicalReadTurn("experiment-source-read", emptyNet),
        ...turn,
      ]);
      const events = await deriveNetLedger(snapshot, browser);
      expect(events).toMatchObject([
        { kind: "read", toolCallId: "experiment-source-read" },
        {
          kind: "experiment",
          toolCallId: `experiment-${status}`,
          source: { revisionId: "source-revision", sha256: sha256Of(emptyNet) },
          output: { status },
        },
      ]);
      expect(events.some((event) => event.kind === "mutation")).toBe(false);
      await expect(deriveNetFreshness(snapshot, browser)).resolves.toEqual({
        kind: "current",
        hash: sha256Of(emptyNet),
      });

      const deliveryText = turn[1]?.parts[0];
      if (deliveryText?.type !== "text")
        throw new Error("Missing delivery fixture.");
      await expect(
        verifyMutationResults({
          body: JSON.stringify({
            results: JSON.parse(deliveryText.text) as unknown,
            context: "Current Petrinaut diagnostics are settled.",
          }),
          snapshot,
          binding,
        }),
      ).resolves.toBeUndefined();
    },
  );

  test("keeps missing, tampered, mismatched and duplicate experiment records unrecorded and refuses duplicate delivery", async () => {
    const turn = experimentTurn("experiment-refused");
    const missing = structuredClone(turn);
    const missingText = missing[1]?.parts[0];
    if (missingText?.type === "text") {
      const deliveries: unknown = JSON.parse(missingText.text);
      if (
        !Array.isArray(deliveries) ||
        typeof deliveries[0] !== "object" ||
        deliveries[0] === null
      )
        throw new Error("Malformed delivery fixture.");
      delete (deliveries[0] as Record<string, unknown>).metadata;
      missingText.text = JSON.stringify(deliveries);
    }
    const tampered = structuredClone(turn);
    const tamperedText = tampered[1]?.parts[0];
    if (tamperedText?.type === "text")
      tamperedText.text = tamperedText.text.replace(
        sha256Of(emptyNet),
        "0".repeat(64),
      );
    const mismatched = structuredClone(turn);
    const mismatchedText = mismatched[1]?.parts[0];
    if (mismatchedText?.type === "text")
      mismatchedText.text = mismatchedText.text.replace(
        '"runCount":10',
        '"runCount":11',
      );
    for (const messages of [
      missing,
      tampered,
      mismatched,
      [...turn, turn[1]!],
      [...turn, mismatched[1]!],
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Independent refusal cases.
      const events = await deriveNetLedger(snapshotOf(messages), browser);
      expect(events).toMatchObject([
        { kind: "unrecorded", toolCallId: "experiment-refused" },
      ]);
    }

    const duplicateSnapshot = snapshotOf([...turn, turn[1]!]);
    const deliveryText = turn[1]?.parts[0];
    if (deliveryText?.type !== "text")
      throw new Error("Missing delivery fixture.");
    await expect(
      verifyMutationResults({
        body: deliveryText.text,
        snapshot: duplicateSnapshot,
        binding,
      }),
    ).rejects.toThrow(/already has a result delivery/iu);
  });

  test("admits all six direct scenario and metric results without sidecars and projects each as unrecorded", async () => {
    const scenario = {
      id: "baseline",
      name: "Baseline",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    };
    const metric = { id: "throughput", name: "Throughput", code: "return 1;" };
    const calls = [
      { toolCallId: "scenario-add", toolName: "addScenario", input: scenario },
      { toolCallId: "metric-add", toolName: "addMetric", input: metric },
      {
        toolCallId: "scenario-update",
        toolName: "updateScenario",
        input: {
          scenarioId: scenario.id,
          update: { name: "Updated baseline" },
        },
      },
      {
        toolCallId: "metric-update",
        toolName: "updateMetric",
        input: { metricId: metric.id, update: { name: "Updated throughput" } },
      },
      {
        toolCallId: "scenario-remove",
        toolName: "removeScenario",
        input: { scenarioId: scenario.id },
      },
      {
        toolCallId: "metric-remove",
        toolName: "removeMetric",
        input: { metricId: metric.id },
      },
    ] as const;
    const messages: FlueConversationMessage[] = [];
    for (const { toolCallId, toolName, input } of calls) {
      const call = assistantCall(toolCallId, toolName, input);
      const delivery = resultDelivery(toolCallId, toolName, { applied: true });
      messages.push(call, delivery);
      const text = delivery.parts[0];
      if (text?.type !== "text") throw new Error("Missing delivery fixture.");
      // eslint-disable-next-line no-await-in-loop -- Each delivery is verified against the history accumulated so far.
      await expect(
        verifyMutationResults({
          body: text.text,
          snapshot: snapshotOf(messages),
          binding,
        }),
      ).resolves.toBeUndefined();
    }
    const events = await deriveNetLedger(snapshotOf(messages), browser);
    expect(events).toEqual(
      calls.map(({ toolCallId, toolName }, index) => ({
        kind: "unrecorded",
        toolCallId,
        toolName,
        position: { messageIndex: index * 2, partIndex: 0 },
        reason:
          "The canonical mutation result carries no canonical mutation record.",
      })),
    );
  });

  test("accepts unrecorded canonical mutations outside the host-recorded names and keeps them unrecorded in the ledger", async () => {
    const parameterInput = {
      id: "bloom-rate",
      name: "Bloom rate",
      value: 0.4,
    };
    const output = { parameterId: parameterInput.id };
    const messages = [
      assistantCall("parameter-1", "addParameter", parameterInput),
      resultDelivery("parameter-1", "addParameter", output),
    ];
    const snapshot = snapshotOf(messages);
    const deliveryText = messages[1]?.parts[0];
    if (deliveryText?.type !== "text")
      throw new Error("Missing delivery fixture.");

    await expect(
      verifyMutationResults({ body: deliveryText.text, snapshot, binding }),
    ).resolves.toBeUndefined();
    await expect(deriveNetLedger(snapshot, browser)).resolves.toMatchObject([
      { kind: "unrecorded", toolCallId: "parameter-1" },
    ]);
    await expect(
      verifyMutationResults({
        body: deliveryText.text,
        snapshot: snapshotOf([...messages, messages[1]!]),
        binding,
      }),
    ).rejects.toThrow(/already has a result delivery/iu);

    const placeInput = oneHopNet.places[0]!;
    const nestedPlaceInput = {
      ...placeInput,
      targetSubnetId: "subnet-1",
    };
    const nestedPlace = [
      assistantCall("nested-place-1", "addPlace", nestedPlaceInput),
      resultDelivery("nested-place-1", "addPlace", {
        placeId: nestedPlaceInput.id,
      }),
    ];
    const nestedPlaceText = nestedPlace[1]?.parts[0];
    if (nestedPlaceText?.type !== "text")
      throw new Error("Missing delivery fixture.");
    await expect(
      verifyMutationResults({
        body: nestedPlaceText.text,
        snapshot: snapshotOf(nestedPlace),
        binding,
      }),
    ).resolves.toBeUndefined();
    await expect(
      deriveNetLedger(snapshotOf(nestedPlace), browser),
    ).resolves.toMatchObject([
      { kind: "unrecorded", toolCallId: "nested-place-1" },
    ]);
    await expect(
      verifyMutationResults({
        body: nestedPlaceText.text,
        snapshot: snapshotOf([...nestedPlace, nestedPlace[1]!]),
        binding,
      }),
    ).rejects.toThrow(/already has a result delivery/iu);

    const unrecordedPlace = [
      assistantCall("place-1", "addPlace", placeInput),
      resultDelivery("place-1", "addPlace", { placeId: placeInput.id }),
    ];
    const placeText = unrecordedPlace[1]?.parts[0];
    if (placeText?.type !== "text")
      throw new Error("Missing delivery fixture.");
    await expect(
      verifyMutationResults({
        body: placeText.text,
        snapshot: snapshotOf(unrecordedPlace),
        binding,
      }),
    ).rejects.toThrow(/requires a canonical mutation record/iu);
  });

  test("does not consume or break a pending mutation declaration", async () => {
    const mutation = canonicalMutationTurn("after-experiment");
    const events = await deriveNetLedger(
      snapshotOf([
        settlementTurn(),
        await declarationTurn("experiment-declaration", [
          {
            operationId: "after-experiment-operation",
            toolName: "addPlace",
            intendedEffect: "Create Received after the run.",
            intendedTarget: "Received",
            expectedImpact: ["place:received"],
          },
        ]),
        ...experimentTurn("intervening-experiment"),
        ...mutation.messages,
      ]),
      browser,
    );
    expect(events).toMatchObject([
      { kind: "experiment", toolCallId: "intervening-experiment" },
      {
        kind: "mutation",
        toolCallId: "after-experiment",
        provenance: {
          standing: "declared-projection",
          operationId: "after-experiment-operation",
        },
      },
    ]);
  });

  test("validates a distinct draft continuation against the issued semantic input without a mutation record", async () => {
    const issued = {
      experiment: experimentInput,
      declarations: [{ subject: "result", statement: "No guarantee." }],
      unsupported: [],
    };
    const issuedCall = assistantCall(
      "draft-delivery",
      draftPetrinautExperimentToolName,
      issued,
    );
    const deliver = (
      results: { toolCallId: string; toolName: string; output: unknown }[],
    ) =>
      verifyMutationResults({
        body: clientToolResultSignal(results).body,
        snapshot: snapshotOf([
          issuedCall,
          ...results.map((result) =>
            resultDelivery(result.toolCallId, result.toolName, result.output),
          ),
        ]),
        binding,
      });
    const valid = {
      toolCallId: "draft-delivery",
      toolName: draftPetrinautExperimentToolName,
      output: { status: "drafted", summary: "Ready", diagnostics: [] },
    };
    await expect(deliver([valid])).resolves.toBeUndefined();
    await expect(
      deliver([
        {
          ...valid,
          output: { status: "running", summary: "", diagnostics: [] },
        },
      ]),
    ).rejects.toThrow(/Invalid option/u);
    await expect(
      deliver([{ ...valid, toolName: createExperimentToolName }]),
    ).rejects.toThrow(/matching admitted/u);
    await expect(deliver([valid, valid])).rejects.toThrow(/duplicate result/u);
    const forgedInput = snapshotOf([
      assistantCall("draft-delivery", draftPetrinautExperimentToolName, {
        ...issued,
        observation: { toolCallId: "read", baseHash: "x" },
      }),
      resultDelivery(
        "draft-delivery",
        draftPetrinautExperimentToolName,
        valid.output,
      ),
    ]);
    await expect(
      verifyMutationResults({
        body: clientToolResultSignal([valid]).body,
        snapshot: forgedInput,
        binding,
      }),
    ).rejects.toThrow(/Unrecognized key/u);
  });

  test("ignores the reviewed draft as a document cause, retaining verified canonical experiments", async () => {
    const snapshot = snapshotOf([
      ...canonicalReadTurn("read-draft", emptyNet),
      ...experimentTurn("canonical-experiment"),
      assistantCall("draft-1", draftPetrinautExperimentToolName),
      resultDelivery("draft-1", draftPetrinautExperimentToolName, {
        status: "drafted",
        summary: "Ready",
        diagnostics: [],
      }),
    ]);
    expect(
      (await deriveNetLedger(snapshot, browser)).map(({ kind }) => kind),
    ).toEqual(["read", "experiment"]);
    await expect(
      netLedger.verifiedDraftReadBefore(snapshot, browser, "draft-1"),
    ).resolves.toMatchObject({ sha256: sha256Of(emptyNet) });
    const unverifiedExperiment = snapshotOf([
      ...canonicalReadTurn("read-draft", emptyNet),
      assistantCall(
        "unverified-experiment",
        createExperimentToolName,
        experimentInput,
      ),
      resultDelivery("unverified-experiment", createExperimentToolName, {
        status: "complete",
      }),
      assistantCall("draft-1", draftPetrinautExperimentToolName),
    ]);
    expect(
      (await deriveNetLedger(unverifiedExperiment, browser)).map(
        ({ kind }) => kind,
      ),
    ).toEqual(["read", "unrecorded"]);
    await expect(
      netLedger.verifiedDraftReadBefore(
        unverifiedExperiment,
        browser,
        "draft-1",
      ),
    ).rejects.toThrow(/latest verified canonical net read/u);
    await expect(
      netLedger.verifiedDraftReadBefore(snapshot, browser, "missing"),
    ).rejects.toThrow(/absent or ambiguous/u);
    await expect(
      netLedger.verifiedDraftReadBefore(
        snapshot,
        { binding: { ...binding, conversationId: "other" } },
        "draft-1",
      ),
    ).rejects.toThrow(/latest verified canonical net read/u);
    const duplicateRead = snapshotOf([
      ...canonicalReadTurn("read-draft", emptyNet),
      resultDelivery("read-draft", getLatestNetDefinitionToolName, {
        title: "Net",
        definition: emptyNet,
      }),
      assistantCall("draft-1", draftPetrinautExperimentToolName),
    ]);
    await expect(
      netLedger.verifiedDraftReadBefore(duplicateRead, browser, "draft-1"),
    ).rejects.toThrow(/latest verified canonical net read/u);
    const staleRead = snapshotOf([
      ...canonicalReadTurn("read-draft", emptyNet),
      ...mutationTurn("later-mutation", emptyNet, oneHopNet),
      assistantCall("draft-1", draftPetrinautExperimentToolName),
    ]);
    await expect(
      netLedger.verifiedDraftReadBefore(staleRead, browser, "draft-1"),
    ).rejects.toThrow(/latest verified canonical net read/u);
    const harmlessReads = snapshotOf([
      ...canonicalReadTurn("read-draft", emptyNet),
      assistantCall("diagnostics", "getNetCompilationErrors"),
      assistantCall("documentation", "readPetrinautDoc"),
      assistantCall("draft-1", draftPetrinautExperimentToolName),
    ]);
    await expect(
      netLedger.verifiedDraftReadBefore(harmlessReads, browser, "draft-1"),
    ).resolves.toMatchObject({ sha256: sha256Of(emptyNet) });
    await Promise.all(
      [
        "applyAutoLayout",
        "setNetTitle",
        "createExperiment",
        "mutate_petrinaut_net",
      ].map((toolName) => {
        const unknownChange = snapshotOf([
          ...canonicalReadTurn("read-draft", emptyNet),
          assistantCall("unrecorded-change", toolName),
          assistantCall("draft-1", draftPetrinautExperimentToolName),
        ]);
        return expect(
          netLedger.verifiedDraftReadBefore(unknownChange, browser, "draft-1"),
        ).rejects.toThrow(/latest verified canonical net read/u);
      }),
    );
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
        postRevisionId: "canonical-add-post",
      },
    ]);
  });

  test("records one verified deep outer call and exposes only its applied step as a cause", async () => {
    const snapshot = snapshotOf([
      settlementTurn(),
      ...deepConstructionTurn({ declared: true }),
    ]);
    const events = await deriveNetLedger(snapshot, browser);
    expect(events).toMatchObject([
      {
        kind: "construction",
        toolCallId: "deep-construction",
        disposition: "complete",
        authority: { status: "verified" },
        steps: [
          {
            operationId: "deep-place",
            expectedImpact: ["the Received place definition"],
            impactAssessment: "owner-adjudication-required",
            basis: { kind: "declared" },
            attempt: { outcome: "applied" },
          },
        ],
      },
    ]);
    const explanation = await queryWorkpiece({
      snapshot,
      current: ledgerRevision,
      browser,
      query: { kind: "place", name: "place-1", field: "entity" },
    });
    expect(explanation).toMatchObject({
      disposition: "partially-supported",
      appliedChanges: [
        {
          toolCallId: "deep-construction",
          basis: { kind: "declared" },
          declaration: {
            operationId: "deep-place",
            expectedImpact: ["the Received place definition"],
            impactAssessment: "owner-adjudication-required",
          },
        },
      ],
    });
  });

  test("reports verified deep provenance with an explicitly absent basis", async () => {
    const snapshot = snapshotOf([settlementTurn(), ...deepConstructionTurn()]);
    const explanation = await queryWorkpiece({
      snapshot,
      current: ledgerRevision,
      browser,
      query: { kind: "place", name: "place-1", field: "entity" },
    });
    expect(explanation).toMatchObject({
      disposition: "basis-absent",
      appliedChanges: [
        {
          toolCallId: "deep-construction",
          basis: {
            kind: "absent",
            reason: "No exact Ledger excerpt was supplied for this operation.",
          },
        },
      ],
    });
  });

  test("keeps duplicate and conflicting deep deliveries unrecorded", async () => {
    const turn = deepConstructionTurn();
    const duplicate = await deriveNetLedger(
      snapshotOf([settlementTurn(), ...turn, turn[1]!]),
      browser,
    );
    expect(duplicate).toMatchObject([
      { kind: "unrecorded", toolCallId: "deep-construction" },
    ]);
    expect(
      duplicate[0]?.kind === "unrecorded" ? duplicate[0].reason : "",
    ).toMatch(/duplicate/iu);
    const conflictingDelivery = structuredClone(turn[1]!);
    if (conflictingDelivery.parts[0]?.type === "text")
      conflictingDelivery.parts[0].text =
        conflictingDelivery.parts[0].text.replace(
          '"disposition":"complete"',
          '"disposition":"refused"',
        );
    const conflicting = await deriveNetLedger(
      snapshotOf([settlementTurn(), ...turn, conflictingDelivery]),
      browser,
    );
    expect(conflicting).toMatchObject([
      { kind: "unrecorded", toolCallId: "deep-construction" },
    ]);
    expect(
      conflicting[0]?.kind === "unrecorded" ? conflicting[0].reason : "",
    ).toMatch(/conflict/iu);
  });

  test("correlates the complete addPlace → addTransition → addArc tracer over one evolving definition", async () => {
    const placeInput = {
      ...oneHopNet.places[0]!,
      id: "queue",
      name: "Queue",
    };
    const transitionInput = {
      id: "serve",
      name: "Serve",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate" as const,
      lambdaCode: "",
      transitionKernelCode: "",
      x: 100,
      y: 0,
    };
    const arcInput = {
      transitionId: "serve",
      arcDirection: "input" as const,
      placeId: "queue",
      weight: 1,
      type: "standard" as const,
    };
    const operations = [
      {
        operationId: "declare-queue",
        toolName: "addPlace" as const,
        intendedEffect: "Create the Queue place.",
        intendedTarget: "Queue",
        expectedImpact: ["place:queue"],
        evidence: {
          excerpts: ["Represent the receiving process."],
          rationale: "The Ledger establishes the process being represented.",
        },
      },
      {
        operationId: "declare-serve",
        toolName: "addTransition" as const,
        intendedEffect: "Create the Serve transition.",
        intendedTarget: "Serve",
        expectedImpact: ["transition:serve"],
      },
      {
        operationId: "declare-queue-serve",
        toolName: "addArc" as const,
        intendedEffect: "Connect Queue as an input to Serve.",
        intendedTarget: "Queue → Serve",
        expectedImpact: ["arc:queue-serve"],
      },
    ];
    const place = canonicalTracerMutationTurn(
      "tracer-place",
      "addPlace",
      emptyNet,
      placeInput,
    );
    const transition = canonicalTracerMutationTurn(
      "tracer-transition",
      "addTransition",
      place.post,
      transitionInput,
    );
    const arc = canonicalTracerMutationTurn(
      "tracer-arc",
      "addArc",
      transition.post,
      arcInput,
    );
    const events = await deriveNetLedger(
      snapshotOf([
        settlementTurn(),
        await declarationTurn("tracer-declaration", operations),
        ...place.messages,
        ...transition.messages,
        ...arc.messages,
      ]),
      browser,
    );
    const mutations = events.filter((event) => event.kind === "mutation");
    expect(
      mutations.map((event) => ({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        operationId:
          event.provenance.standing === "declared-projection"
            ? event.provenance.operationId
            : undefined,
        standing: event.provenance.standing,
        createdEffects: event.effects?.created.length,
      })),
    ).toEqual([
      {
        toolCallId: "tracer-place",
        toolName: "addPlace",
        operationId: "declare-queue",
        standing: "declared-projection",
        createdEffects: 7,
      },
      {
        toolCallId: "tracer-transition",
        toolName: "addTransition",
        operationId: "declare-serve",
        standing: "declared-projection",
        createdEffects: 9,
      },
      {
        toolCallId: "tracer-arc",
        toolName: "addArc",
        operationId: "declare-queue-serve",
        standing: "declared-projection",
        createdEffects: 1,
      },
    ]);
    expect(mutations.map((event) => event.post?.sha256)).toEqual([
      sha256Of(place.post),
      sha256Of(transition.post),
      sha256Of(arc.post),
    ]);
    expect(arc.post.transitions[0]?.inputArcs).toEqual([
      { placeId: "queue", weight: 1, type: "standard" },
    ]);
  });

  test("correlates repeated-rank operations without weakening ordered matching", async () => {
    const placeInputs = [
      { ...oneHopNet.places[0]!, id: "received", name: "Received", x: 0 },
      { ...oneHopNet.places[0]!, id: "queued", name: "Queued", x: 20 },
      { ...oneHopNet.places[0]!, id: "done", name: "Done", x: 40 },
    ];
    const operations = placeInputs.map((place, index) => ({
      operationId: `operation-${index + 1}`,
      toolName: "addPlace" as const,
      intendedEffect: `Create ${place.id}.`,
      intendedTarget: place.id,
      expectedImpact: [`definition:${place.id}`],
      ...(index === 0
        ? {
            evidence: {
              excerpts: ["Represent the receiving process."],
              rationale: "The settled Ledger names the represented process.",
            },
          }
        : {}),
    }));
    const first = canonicalMutationTurn(
      "canonical-1",
      emptyNet,
      placeInputs[0],
    );
    const second = canonicalMutationTurn(
      "canonical-2",
      first.post,
      placeInputs[1],
    );
    const third = canonicalMutationTurn(
      "canonical-3",
      second.post,
      placeInputs[2],
    );
    const events = await deriveNetLedger(
      snapshotOf([
        settlementTurn(),
        await declarationTurn("declaration", operations),
        ...first.messages,
        ...second.messages,
        ...third.messages,
      ]),
      browser,
    );
    const mutations = events.filter((event) => event.kind === "mutation");
    expect(mutations).toHaveLength(3);
    expect(
      mutations.map((event) =>
        event.provenance.standing === "declared-projection"
          ? event.provenance.operationId
          : event.provenance.standing,
      ),
    ).toEqual(["operation-1", "operation-2", "operation-3"]);
    expect(mutations[0]).toMatchObject({
      outcome: "applied",
      provenance: {
        intendedEffect: "Create received.",
        intendedTarget: "received",
        expectedImpact: ["definition:received"],
        basis: { kind: "declared" },
        impactAssessment: "owner-adjudication-required",
      },
    });
    expect(mutations[0]?.effects?.created.length).toBeGreaterThan(0);
    expect(mutations[1]).toMatchObject({
      provenance: { basis: { kind: "absent" } },
    });
  });

  test("carries a correlated direct declaration through the why boundary", async () => {
    const operation = {
      operationId: "why-operation",
      toolName: "addPlace" as const,
      intendedEffect: "Represent received work.",
      intendedTarget: "Received",
      expectedImpact: ["the Received place definition"],
      evidence: {
        excerpts: ["Represent the receiving process."],
        rationale: "The passage establishes the represented process.",
      },
    };
    const mutation = canonicalMutationTurn("canonical-why");
    const snapshot = snapshotOf([
      settlementTurn(),
      await declarationTurn("why-declaration", [operation]),
      ...mutation.messages,
    ]);
    const explanation = await queryWorkpiece({
      snapshot,
      current: ledgerRevision,
      browser,
      query: { kind: "place", name: "place-1", field: "entity" },
    });
    expect(explanation).toMatchObject({
      disposition: "partially-supported",
      appliedChanges: [
        {
          toolCallId: "canonical-why",
          operation: "addPlace",
          basis: { kind: "declared" },
          declaration: {
            operationId: "why-operation",
            intendedEffect: "Represent received work.",
            intendedTarget: "Received",
            expectedImpact: ["the Received place definition"],
            impactAssessment: "owner-adjudication-required",
          },
        },
      ],
      quality: {
        sourceRelevance: "unassessed",
        semanticUtility: "owner-adjudication-required",
      },
    });
  });

  test("keeps no-op observations while leaving expected impact unassessed", async () => {
    const operation = {
      operationId: "no-op-operation",
      toolName: "addPlace" as const,
      intendedEffect: "Ensure Received exists.",
      intendedTarget: "Received",
      expectedImpact: ["place definition might change"],
    };
    const events = await deriveNetLedger(
      snapshotOf([
        settlementTurn(),
        await declarationTurn("no-op-declaration", [operation]),
        ...canonicalNoOpTurn("canonical-no-op", oneHopNet),
      ]),
      browser,
    );
    expect(events).toMatchObject([
      {
        kind: "mutation",
        outcome: "no-op",
        effects: { created: [], updated: [], deleted: [], derived: [] },
        provenance: {
          operationId: "no-op-operation",
          expectedImpact: ["place definition might change"],
          impactAssessment: "owner-adjudication-required",
        },
      },
    ]);
  });

  test("does not reassign declarations across missing, mismatched, or intervening boundaries", async () => {
    const placeOperation = (operationId: string) => ({
      operationId,
      toolName: "addPlace" as const,
      intendedEffect: `Create ${operationId}.`,
      intendedTarget: operationId,
      expectedImpact: [`impact:${operationId}`],
    });
    const transitionMismatch = {
      ...placeOperation("expects-transition"),
      toolName: "addTransition" as const,
    };
    const mutation = canonicalMutationTurn("canonical-boundary");
    const cases = [
      [settlementTurn(), ...mutation.messages],
      [
        settlementTurn(),
        await declarationTurn("mismatched", [transitionMismatch]),
        ...mutation.messages,
      ],
      [
        settlementTurn(),
        await declarationTurn("superseded", [placeOperation("old")]),
        await declarationTurn("replacement", [placeOperation("new")]),
        ...mutation.messages,
      ],
      [
        settlementTurn(),
        await declarationTurn("before-settlement", [
          placeOperation("before-settlement"),
        ]),
        settlementTurn(),
        ...mutation.messages,
      ],
    ];
    const standings = [];
    for (const messages of cases) {
      // eslint-disable-next-line no-await-in-loop -- Independent boundary cases.
      const events = await deriveNetLedger(snapshotOf(messages), browser);
      const event = events.find((entry) => entry.kind === "mutation");
      standings.push(event?.provenance);
    }
    expect(standings[0]).toMatchObject({
      standing: "temporal/basis-absent",
    });
    expect(standings[1]).toMatchObject({
      standing: "temporal/basis-absent",
    });
    expect(standings[2]).toMatchObject({
      standing: "declared-projection",
      operationId: "new",
    });
    expect(standings[3]).toMatchObject({
      standing: "temporal/basis-absent",
    });
  });

  test("does not donate an expected addTransition declaration to a later addArc or addPlace", async () => {
    const placeInput = {
      ...oneHopNet.places[0]!,
      id: "queue",
      name: "Queue",
    };
    const transitionInput = {
      id: "serve",
      name: "Serve",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate" as const,
      lambdaCode: "",
      transitionKernelCode: "",
      x: 100,
      y: 0,
    };
    const place = canonicalTracerMutationTurn(
      "mismatch-setup-place",
      "addPlace",
      emptyNet,
      placeInput,
    );
    const transition = canonicalTracerMutationTurn(
      "mismatch-setup-transition",
      "addTransition",
      place.post,
      transitionInput,
    );
    const arc = canonicalTracerMutationTurn(
      "mismatch-arc",
      "addArc",
      transition.post,
      {
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
        weight: 1,
        type: "standard",
      },
    );
    const laterPlace = canonicalTracerMutationTurn(
      "mismatch-later-place",
      "addPlace",
      arc.post,
      { ...placeInput, id: "complete", name: "Complete" },
    );
    const events = await deriveNetLedger(
      snapshotOf([
        settlementTurn(),
        ...place.messages,
        ...transition.messages,
        await declarationTurn("expects-transition-only", [
          {
            operationId: "expected-transition",
            toolName: "addTransition",
            intendedEffect: "Create another transition.",
            intendedTarget: "Another transition",
            expectedImpact: ["transition:another"],
          },
        ]),
        ...arc.messages,
        ...laterPlace.messages,
      ]),
      browser,
    );
    const mismatched = events.filter(
      (
        event,
      ): event is Extract<netLedger.NetLedgerEvent, { kind: "mutation" }> =>
        event.kind === "mutation" &&
        (event.toolCallId === "mismatch-arc" ||
          event.toolCallId === "mismatch-later-place"),
    );
    expect(
      mismatched.map((event) => [event.toolName, event.provenance.standing]),
    ).toEqual([
      ["addArc", "temporal/basis-absent"],
      ["addPlace", "temporal/basis-absent"],
    ]);
  });

  test("does not let a failed or ambiguous canonical call become a cause or donate its declaration", async () => {
    const operation = {
      operationId: "ambiguous-operation",
      toolName: "addPlace" as const,
      intendedEffect: "Create Received.",
      intendedTarget: "Received",
      expectedImpact: ["Received definition"],
    };
    const ambiguous = canonicalMutationTurn("canonical-ambiguous");
    const later = canonicalMutationTurn("canonical-later");
    const events = await deriveNetLedger(
      snapshotOf([
        settlementTurn(),
        await declarationTurn("ambiguous-declaration", [operation]),
        ...ambiguous.messages,
        ambiguous.messages[1]!,
        ...later.messages,
      ]),
      browser,
    );
    expect(events).toMatchObject([
      { kind: "unrecorded", toolCallId: "canonical-ambiguous" },
      {
        kind: "mutation",
        toolCallId: "canonical-later",
        provenance: { standing: "temporal/basis-absent" },
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
