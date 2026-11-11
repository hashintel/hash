/**
 * `query_basis`, ported from Brunch's
 * `apps/brunch-agent/src/agents/petrinaut/tools/query-basis.test.ts`: the
 * same cases over browser-call records and a Ledger history in place of a
 * Flue snapshot, then a stale read, then the tool itself on a Harness.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  type EntryRecord,
  Harness,
  type JsonObject,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { describe, expect, test, vi } from "vitest";

import {
  brunchTools,
  foldCommits,
  type LedgerHistoryMessage,
} from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallRecord,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../browser-call/browser-call";
import { petrinautBrowserToolsExtension } from "../browser-call/petrinaut-browser-tools";
import { ledgerExtension } from "../ledger";
import { netCalls } from "./net-changes";
import { queryBasis, queryBasisExtension, type Selector } from "./query-basis";

import type { JsonValue } from "@earendil-works/chord";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;

const binding = {
  conversationId: "conversation",
  documentId: "document",
  incarnationId: "incarnation",
};
const definition = {
  places: [
    {
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};
const [queue] = definition.places;

/** A browser call as its settled record holds it. */
type NetStep = {
  readonly kind: "call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly output: unknown;
  readonly metadata: unknown;
};
type Step =
  | NetStep
  | { readonly kind: "ledger"; readonly message: LedgerHistoryMessage };

const netCall = (
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  metadata: unknown,
): Step => ({ kind: "call", toolCallId, toolName, input, output, metadata });

const turn = (id: string, text: string): Step => ({
  kind: "ledger",
  message: { id, role: "user", parts: [{ type: "text", text }] },
});

const committed = (
  toolCallId: string,
  revision: number,
  entries: unknown[],
  ids: string[],
): Step => ({
  kind: "ledger",
  message: {
    id: toolCallId,
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "ledger_commit",
        toolCallId,
        state: "output-available",
        input: { entries },
        output: { status: "recorded", commitId: toolCallId, revision, ids },
      },
    ],
  },
});

const user = turn("user-1", "Cases wait in a queue.");
const commit = committed(
  "ledger-1",
  1,
  [
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
  ["e1", "c1"],
);
const add = netCall(
  "add-queue",
  "addPlace",
  { id: "queue", name: "Queue" },
  { title: "Added place Queue", applied: true },
  { documentRevision: { before: "revision-1", after: "revision-2" } },
);
const read = netCall(
  "read-queue",
  "getLatestNetDefinition",
  {},
  { title: "Queue", definition },
  { documentRevision: { before: "revision-2" } },
);
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

/**
 * `steps` in transcript order, one entry each: the records and Ledger history
 * they leave, and the Ledger as of each call's entry, as `snapshotAsOf` reads it.
 */
const query = (steps: readonly Step[], selector: Selector) => {
  const calls: Record<string, BrowserCallRecord> = {};
  const ledger: { entry: number; message: LedgerHistoryMessage }[] = [];
  for (const [entry, step] of steps.entries()) {
    if (step.kind === "ledger") ledger.push({ entry, message: step.message });
    else
      calls[step.toolCallId] = {
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        input: step.input as BrowserCallRecord["input"],
        status: "settled",
        issuedAt: 0,
        expiresAt: 0,
        task: 0,
        doorbell: null,
        capability: null,
        claimed: true,
        output: step.output as BrowserCallRecord["output"],
        metadata: step.metadata as BrowserCallRecord["metadata"],
        issuedEntry: entry,
        callIndex: 0,
      };
  }
  return queryBasis({
    calls: netCalls(calls),
    ledger: { messages: ledger.map(({ message }) => message) },
    binding,
    query: selector,
    ledgerRevisionAt: async ({ issuedEntry }) =>
      foldCommits({
        messages: ledger
          .filter(({ entry }) => entry < issuedEntry)
          .map(({ message }) => message),
      }).revision,
  });
};

describe("query_basis", () => {
  test("reports no recorded basis for an element no reflection names", async () => {
    expect(
      await query([user, commit, add, read], { kind: "place", name: "Queue" }),
    ).toMatchObject({
      binding,
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

  test("returns the reflection naming an element, what it rests on, and its turns", async () => {
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
    const result = await query(
      [
        user,
        commit,
        add,
        queueReflection,
        read,
        turn("user-2", "It is first come, first served."),
        laterTurn,
      ],
      { kind: "place", name: "Queue" },
    );
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

  test("marks a claim the basis rests on that a later claim replaced", async () => {
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
    expect(
      (
        await query(
          [
            user,
            commit,
            add,
            queueReflection,
            read,
            turn("user-2", "Actually, two queues."),
            correction,
          ],
          { kind: "place", name: "Queue" },
        )
      ).basis?.superseded,
    ).toEqual({ c1: "c2" });
  });

  test("matches a reflection that names an arc by Petrinaut's generated arc ID", async () => {
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
    const readArc = netCall(
      "read-queue",
      "getLatestNetDefinition",
      {},
      { title: "Queue", definition: withArc },
      { documentRevision: { before: "revision-2" } },
    );
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
    expect(
      await query([user, commit, arcReflection, readArc], {
        kind: "arc",
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
      }),
    ).toMatchObject({
      disposition: "basis-declared",
      target: { id: "$A_place:queue___serve" },
      basis: { reflections: [{ id: "r1" }] },
    });
  });

  test("finds an element inside a subnet and the call that added it there", async () => {
    const intoSubnet = netCall(
      "add-triage",
      "addPlace",
      { id: "triage", name: "Triage", targetSubnetId: "intake" },
      { title: "Added place Triage", applied: true },
      { documentRevision: { before: "revision-1", after: "revision-2" } },
    );
    const readWithSubnet = netCall(
      "read-queue",
      "getLatestNetDefinition",
      {},
      {
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
      { documentRevision: { before: "revision-2" } },
    );
    expect(
      await query([user, commit, intoSubnet, readWithSubnet], {
        kind: "place",
        name: "Triage",
      }),
    ).toMatchObject({
      disposition: "basis-absent",
      target: { id: "triage" },
      changes: [
        { toolCallId: "add-triage", petrinautRevisionId: "revision-2" },
      ],
    });
  });

  test("answers from the read-back of a change made after the latest read", async () => {
    const dryer = { ...queue, id: "dryer", name: "Dryer" };
    const addDryer = netCall(
      "add-dryer",
      "addPlace",
      { id: "dryer", name: "Dryer" },
      { title: "Added place Dryer", applied: true },
      {
        documentRevision: { before: "revision-2", after: "revision-3" },
        readBack: { ...definition, places: [queue, dryer] },
      },
    );
    expect(
      await query([user, commit, add, read, addDryer], {
        kind: "place",
        name: "Dryer",
      }),
    ).toMatchObject({
      disposition: "basis-absent",
      target: { id: "dryer" },
      readToolCallId: "add-dryer",
      changes: [{ toolCallId: "add-dryer", petrinautRevisionId: "revision-3" }],
    });
  });

  test("reports a stale read when the net changed after the latest view without a read-back", async () => {
    const addDryer = netCall(
      "add-dryer",
      "addPlace",
      { id: "dryer", name: "Dryer" },
      { title: "Added place Dryer", applied: true },
      { documentRevision: { before: "revision-2", after: "revision-3" } },
    );
    expect(
      await query([user, commit, add, read, addDryer], {
        kind: "place",
        name: "Queue",
      }),
    ).toMatchObject({
      disposition: "stale-read",
      target: undefined,
      readToolCallId: "read-queue",
      basis: undefined,
      changes: [],
    });
    // A change the browser left unapplied moved nothing.
    const declined = netCall(
      "add-dryer",
      "addPlace",
      { id: "dryer", name: "Dryer" },
      { applied: false },
      { documentRevision: { before: "revision-2", after: "revision-3" } },
    );
    expect(
      await query([user, commit, add, read, declined], {
        kind: "place",
        name: "Queue",
      }),
    ).toMatchObject({ disposition: "basis-absent" });
  });
});

describe("the query_basis tool", () => {
  const ledgerCall = (id: string, entries: JsonValue[]): FauxResponseStep =>
    fauxAssistantMessage(
      fauxToolCall(brunchTools.ledgerCommit, { entries }, { id }),
      { stopReason: "toolUse" },
    );
  const browserCall = (
    id: string,
    toolName: string,
    args: JsonObject = {},
  ): FauxResponseStep =>
    fauxAssistantMessage(fauxToolCall(toolName, args, { id }), {
      stopReason: "toolUse",
    });

  /** The browser's side: claim the issued call and finish it. */
  const answer = async (
    harness: Harness,
    conversationId: ConversationId,
    toolCallId: string,
    output: BrowserCallResult["output"],
    metadata: BrowserCallResult["metadata"],
  ) => {
    await vi.waitFor(async () => {
      const calls = (
        await harness.snapshot(BrowserCallsDoc, conversationId, context)
      )?.calls;
      expect(calls?.[toolCallId]?.status).toBe("pending");
    });
    const claim = await claimBrowserCall(
      harness,
      conversationId,
      toolCallId,
      context,
    );
    if (claim === undefined)
      throw new Error(`${toolCallId} was not claimable.`);
    await finishBrowserCall(
      harness,
      {
        conversationId,
        toolCallId,
        toolName: claim.toolName,
        capability: claim.capability,
        canonicalInput: claim.input,
        output,
        metadata,
      },
      context,
    );
  };

  test("reads the records, rewinds the Ledger to each change's issue, and quotes the USER's words", async () => {
    const place = {
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    };
    const { models, model } = scriptedModel([
      ledgerCall("ledger-1", [
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
      ]),
      browserCall("read-1", "readNetOutline"),
      browserCall("add-queue", "addPlace", place),
      browserCall("read-queue", "getLatestNetDefinition"),
      ledgerCall("ledger-2", [
        [
          "reflection/create",
          {
            text: "The Queue place holds waiting cases.",
            netElements: [{ kind: "place", id: "queue" }],
            claims: ["c1"],
          },
        ],
      ]),
      browserCall("query-1", brunchTools.queryBasis, {
        selector: { kind: "place", name: "Queue" },
      }),
      fauxAssistantMessage("The queue rests on what you said."),
    ]);
    const registry = createRegistry();
    registry.install(ledgerExtension);
    registry.install(browserCallExtension);
    registry.install(petrinautBrowserToolsExtension);
    registry.install(queryBasisExtension);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    const root = await harness.root(context, {
      agent: {
        model,
        extensions: [
          ledgerExtension,
          petrinautBrowserToolsExtension,
          queryBasisExtension,
        ],
      },
    });
    await harness.commit(
      (tx) => bindBrowserDocument(tx, root.id, binding),
      context,
    );
    const submission = await root.submit(
      { type: "input", content: "Cases wait in a queue." },
      context,
    );
    await answer(
      harness,
      root.id,
      "read-1",
      { title: "Net" },
      { documentRevision: { before: "revision-1" } },
    );
    await answer(
      harness,
      root.id,
      "add-queue",
      { title: "Added place Queue", applied: true },
      { documentRevision: { before: "revision-1", after: "revision-2" } },
    );
    await answer(
      harness,
      root.id,
      "read-queue",
      { title: "Queue", definition: { ...definition, places: [place] } },
      { documentRevision: { before: "revision-2" } },
    );
    expect((await submission.wait(context)).status).toBe("done");

    const entries: readonly EntryRecord[] = (
      await root.entries({ order: "ascending" }, 100, undefined, context)
    ).items;
    const result = entries
      .flatMap(({ model: messages }) => messages ?? [])
      .find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "query-1",
      );
    if (result?.role !== "toolResult")
      throw new Error("No query_basis result.");
    expect(result.isError).toBe(false);
    const text = result.content.flatMap((part) =>
      part.type === "text" ? [part.text] : [],
    )[0];
    const userEntry = entries.find(({ kind }) => kind === "pi.user");
    expect(JSON.parse(text ?? "null")).toMatchObject({
      binding,
      disposition: "basis-declared",
      target: { id: "queue" },
      readToolCallId: "read-queue",
      // Revision 2 (the reflection) committed after the change was issued.
      changes: [
        {
          toolCallId: "add-queue",
          operation: "addPlace",
          petrinautRevisionId: "revision-2",
          ledgerRevision: 1,
        },
      ],
      basis: {
        reflections: [{ id: "r1" }],
        claims: [{ id: "c1" }],
        turns: [
          { id: String(userEntry?.id), excerpt: "Cases wait in a queue." },
        ],
      },
    });
    await harness.close(context);
  });
});
