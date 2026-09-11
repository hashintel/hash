import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import { applyAutoLayoutToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolResultSignal } from "@hashintel/brunch-agent-transport-aisdk";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

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
const browser: BrowserContext = { binding, construction: true };

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
  assistantCall(toolCallId, getLatestNetDefinitionToolName),
  resultDelivery(
    toolCallId,
    getLatestNetDefinitionToolName,
    { title: "Net", definition },
    { observation: { toolCallId, binding, observed } },
  ),
];

const mutationTurn = (
  toolCallId: string,
  pre: SDCPN,
  post: SDCPN | undefined,
): FlueConversationMessage[] => [
  assistantCall(toolCallId, "mutate_petrinet", { operations: [] }),
  resultDelivery(
    toolCallId,
    "mutate_petrinet",
    { outcome: post === undefined ? "unknown" : "applied" },
    {
      mutationRecord: {
        outcome: post === undefined ? "unknown" : "applied",
        attempts:
          post === undefined
            ? []
            : [
                {
                  outcome: "applied",
                  pre: observationOf(pre),
                  post: observationOf(post),
                },
              ],
      },
    },
  ),
];

const layoutTurn = (
  toolCallId: string,
  pre: SDCPN,
  post: SDCPN,
): FlueConversationMessage[] => [
  assistantCall(toolCallId, applyAutoLayoutToolName, { askUserFirst: false }),
  resultDelivery(
    toolCallId,
    applyAutoLayoutToolName,
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
      toolName: "mutate_petrinet",
      outcome: "applied",
      postHash: sha256Of(oneHopNet),
    });
    expect(events[2]).toMatchObject({
      kind: "layout",
      pre: { sha256: sha256Of(oneHopNet) },
      post: { sha256: sha256Of(movedNet) },
    });
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
      assistantCall("read-elsewhere", getLatestNetDefinitionToolName),
      resultDelivery(
        "read-elsewhere",
        getLatestNetDefinitionToolName,
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

  test("takes no live observation: the fold depends on history and the binding alone", async () => {
    expect(deriveNetLedger.length).toBe(2);
    const events = await deriveNetLedger(fullHistory(), browser);
    // A different context object with the same binding is the same fold; the
    // construction flag and any live document state are not inputs.
    const again = await deriveNetLedger(fullHistory(), {
      binding: { ...binding },
      requestedBaseHash: "f".repeat(64),
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
