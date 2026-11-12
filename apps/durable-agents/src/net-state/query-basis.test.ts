/**
 * `query_basis`, ported from Brunch's
 * `apps/brunch-agent/src/agents/petrinaut/tools/query-basis.test.ts`: the
 * same cases over browser-call records and a Ledger history in place of a
 * Flue snapshot, then a stale read, then the tool itself on a Harness, then
 * the HASH agent's `ledger_query_basis` over HASH's merged updates.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
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
  hashProcessEditorId,
  type LedgerHistoryMessage,
  petrinautContextualUserMessageBody,
  queryBasisToolDescription,
} from "@hashintel/brunch-agent";
import { toPetrinautId } from "@hashintel/petrinaut-core";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import { createHostBinding } from "../agent/host-binding";
import {
  bindBrowserDocument,
  BrowserBindingDoc,
  browserCallExtension,
  type BrowserCallRecord,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../browser-call/browser-call";
import { reportHandEdit } from "../browser-call/hand-edit";
import { createHashBrowserToolsExtension } from "../browser-call/hash-browser-tools";
import { createLedgerExtension } from "../ledger";
import { brunchUserInput } from "../server/durable-agents-server/user-input";
import { netCalls } from "./net-changes";
import {
  createQueryBasisTool,
  queryBasis,
  queryBasisExtension,
  type Selector,
} from "./query-basis";

import type { VisibleNetView } from "./visible-net-view";
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

/**
 * The net with one input arc into `serve`, from `placeId`, under the IDs the
 * document stores: HASH's parsed input converts the model's IDs to them.
 */
const arcNet = (placeId: string) => ({
  ...definition,
  places: ["queue", "buffer"].map((id) => ({
    id,
    name: id,
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
  })),
  transitions: [
    {
      id: toPetrinautId("serve"),
      name: "Serve",
      inputArcs: [
        { placeId: toPetrinautId(placeId), weight: 1, type: "standard" },
      ],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
});
/** HASH's merged arc update, retargeting `serve`'s input arc from the queue to the buffer and reweighting it. */
const retargetInput = {
  editor_id: hashProcessEditorId,
  transitionId: "serve",
  arcDirection: "input",
  placeId: "queue",
  newPlaceId: "buffer",
  weight: 2,
};
const arcTo = (placeId: string): Selector => ({
  kind: "arc",
  transitionId: "serve",
  arcDirection: "input",
  placeId,
});

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
const query = (
  steps: readonly Step[],
  selector: Selector,
  netView: VisibleNetView["state"] = "current",
) => {
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
    netView,
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

  test("reports a stale read when the model's view is stale, as freshness decides it (H8)", async () => {
    const queue = { kind: "place", name: "Queue" } as const;
    expect(
      await query([user, commit, add, read], queue, "stale"),
    ).toMatchObject({
      disposition: "stale-read",
      target: undefined,
      readToolCallId: "read-queue",
      basis: undefined,
      changes: [],
    });
    expect(
      await query([user, commit, add, read], queue, "current"),
    ).toMatchObject({ disposition: "basis-absent" });
  });

  test("attributes a HASH merged arc update to the arc it retargeted, per canonical call (§3.1)", async () => {
    const getNet = netCall(
      "get-net",
      "petrinaut_get_net",
      { editor_id: hashProcessEditorId },
      { definition: arcNet("queue") },
      { documentRevision: { before: "revision-1" } },
    );
    const retarget = netCall(
      "arc-moved",
      "petrinaut_update_arc",
      retargetInput,
      { applied: true },
      {
        documentRevision: { before: "revision-1", after: "revision-2" },
        readBack: arcNet("buffer"),
      },
    );
    expect(
      await query([user, commit, getNet, retarget], arcTo("buffer")),
    ).toMatchObject({
      disposition: "basis-absent",
      readToolCallId: "arc-moved",
      changes: [
        {
          toolCallId: "arc-moved",
          operation: "petrinaut_update_arc",
          petrinautRevisionId: "revision-2",
        },
      ],
    });
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

  /**
   * The HASH agent's Ledger, browser tools and `ledger_query_basis` on one
   * Harness over its host binding, bound to the editor.
   */
  const openAgent = async (responses: FauxResponseStep[]) => {
    const { models, model } = scriptedModel(responses);
    const host = createHostBinding();
    const ledgerTools = createLedgerExtension(host);
    const browserTools = createHashBrowserToolsExtension(host);
    const queryBasisTools = queryBasisExtension(host, {
      name: brunchTools.ledgerQueryBasis,
      description: queryBasisToolDescription,
    });
    const registry = createRegistry();
    registry.install(ledgerTools);
    registry.install(browserCallExtension);
    registry.install(browserTools);
    registry.install(queryBasisTools);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    host.bind(harness);
    const root = await harness.root(context, {
      agent: {
        model,
        extensions: [ledgerTools, browserTools, queryBasisTools],
      },
    });
    await harness.commit(
      (tx) => bindBrowserDocument(tx, root.id, binding),
      context,
    );
    return { harness, root };
  };

  /** The tool result of `toolCallId`, its text parsed. */
  const resultOf = (entries: readonly EntryRecord[], toolCallId: string) => {
    const result = entries
      .flatMap(({ model: messages }) => messages ?? [])
      .find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === toolCallId,
      );
    if (result?.role !== "toolResult")
      throw new Error(`No result for ${toolCallId}.`);
    const text = result.content.flatMap((part) =>
      part.type === "text" ? [part.text] : [],
    )[0];
    return {
      isError: result.isError,
      output: JSON.parse(text ?? "null") as unknown,
    };
  };

  const allEntriesOf = async (root: Conversation) =>
    (await root.entries({ order: "ascending" }, 100, undefined, context)).items;

  const words = "Cases wait in a queue.";
  const getNetInput = { editor_id: hashProcessEditorId, detail: "full" };
  /** The queue's ID as the document stores it: HASH's parsed input converts the model's. */
  const queueId = toPetrinautId("queue");

  test.each([
    [
      "a brunch.user entry's userText",
      "brunch.user",
      {
        type: "input",
        ...brunchUserInput(
          petrinautContextualUserMessageBody({
            userText: words,
            diagnosticsContext: "Net check: 2 warnings.",
            submissionContext: { interviewBudget: { questions: 3 } },
          }),
        ),
      },
    ],
    [
      "an old pi.user entry's text",
      "pi.user",
      { type: "input", content: words },
    ],
  ] as const)(
    "reads the records, rewinds the Ledger to each change's issue, and quotes the USER's words from %s",
    async (_, userKind, input) => {
      const place = {
        editor_id: hashProcessEditorId,
        id: "queue",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      };
      const { harness, root } = await openAgent([
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
        browserCall("read-1", "petrinaut_get_net", getNetInput),
        browserCall("add-queue", "petrinaut_create_place", place),
        browserCall("read-queue", "petrinaut_get_net", getNetInput),
        ledgerCall("ledger-2", [
          [
            "reflection/create",
            {
              text: "The Queue place holds waiting cases.",
              netElements: [{ kind: "place", id: queueId }],
              claims: ["c1"],
            },
          ],
        ]),
        browserCall("query-1", brunchTools.ledgerQueryBasis, {
          selector: { kind: "place", name: "Queue" },
        }),
        fauxAssistantMessage("The queue rests on what you said."),
      ]);
      const submission = await root.submit(input, context);
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
        {
          title: "Queue",
          definition: {
            ...definition,
            places: [{ ...definition.places[0], id: queueId }],
          },
        },
        { documentRevision: { before: "revision-2" } },
      );
      expect((await submission.wait(context)).status).toBe("done");

      const entries = await allEntriesOf(root);
      const result = resultOf(entries, "query-1");
      expect(result.isError).toBe(false);
      const userEntry = entries.find(({ kind }) => kind === userKind);
      expect(userEntry).toBeDefined();
      expect(result.output).toMatchObject({
        binding,
        disposition: "basis-declared",
        target: { id: queueId },
        readToolCallId: "read-queue",
        // Revision 2 (the reflection) committed after the change was issued.
        changes: [
          {
            toolCallId: "add-queue",
            operation: "petrinaut_create_place",
            petrinautRevisionId: "revision-2",
            ledgerRevision: 1,
          },
        ],
        basis: {
          reflections: [{ id: "r1" }],
          claims: [{ id: "c1" }],
          turns: [{ id: String(userEntry?.id), excerpt: words }],
        },
      });
      await harness.close(context);
    },
  );

  const queue = { kind: "place", name: "Queue" } as const;
  const queueDefinition = { title: "Queue", definition };

  describe("runs sequentially: one round answers from the reads issued before it (fold 3b)", () => {
    test.each([
      ["[read, query_basis]", ["read-1", "query-1"], "basis-absent"],
      ["[query_basis, read]", ["query-1", "read-1"], "not-found"],
    ] as const)("%s answers %s", async (_, order, disposition) => {
      const call = {
        "read-1": fauxToolCall("petrinaut_get_net", getNetInput, {
          id: "read-1",
        }),
        "query-1": fauxToolCall(
          brunchTools.ledgerQueryBasis,
          { selector: queue },
          { id: "query-1" },
        ),
      };
      const { harness, root } = await openAgent([
        fauxAssistantMessage(
          order.map((id) => call[id]),
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("Done."),
      ]);
      const submission = await root.submit(
        { type: "input", content: "Why the queue?" },
        context,
      );
      await answer(harness, root.id, "read-1", queueDefinition, {
        documentRevision: { before: "revision-2" },
      });
      expect((await submission.wait(context)).status).toBe("done");
      const entries = await allEntriesOf(root);
      expect(resultOf(entries, "query-1")).toMatchObject({
        isError: false,
        output: { disposition },
      });
      expect(JSON.stringify(entries)).not.toContain("Dependent call refused");
      await harness.close(context);
    });
  });

  describe("a hand edit after the model's view answers stale-read (H8)", () => {
    test.each([
      [
        "view revision-2, then a note naming revision-3",
        "revision-3",
        "stale-read",
      ],
      [
        "view revision-2, then a note naming revision-2",
        "revision-2",
        "basis-absent",
      ],
    ] as const)("%s: %s", async (_, edited, disposition) => {
      const { harness, root } = await openAgent([
        browserCall("read-1", "petrinaut_get_net", getNetInput),
        browserCall("query-1", brunchTools.ledgerQueryBasis, {
          selector: queue,
        }),
        fauxAssistantMessage("Done."),
      ]);
      const submission = await root.submit(
        { type: "input", content: "Why the queue?" },
        context,
      );
      await vi.waitFor(async () => {
        const calls = (
          await harness.snapshot(BrowserCallsDoc, root.id, context)
        )?.calls;
        expect(calls?.["read-1"]?.status).toBe("pending");
      });
      // The panel reports while the read waits: queued, placed after the round's results.
      const bound = await harness.snapshot(BrowserBindingDoc, root.id, context);
      expect(
        await reportHandEdit(
          harness,
          root.id,
          {
            binding: bound?.binding ?? "",
            episode: "episode-1",
            seq: 0,
            revision: edited,
          },
          context,
        ),
      ).toMatchObject({ status: "admitted" });
      await answer(harness, root.id, "read-1", queueDefinition, {
        documentRevision: { before: "revision-2" },
      });
      expect((await submission.wait(context)).status).toBe("done");
      const entries = await allEntriesOf(root);
      const kinds = entries.map(({ kind }) => kind);
      // The note sits between the read's result and the query's request.
      expect(kinds.indexOf("brunch.hand-edit")).toBeGreaterThan(
        entries.findIndex(
          ({ model: messages }) =>
            messages?.[0]?.role === "toolResult" &&
            messages[0].toolCallId === "read-1",
        ),
      );
      expect(resultOf(entries, "query-1")).toMatchObject({
        isError: false,
        output: { disposition, readToolCallId: "read-1" },
      });
      await harness.close(context);
    });
  });

  describe("mounted as the HASH agent's ledger_query_basis", () => {
    const getNet = () =>
      fauxToolCall("petrinaut_get_net", getNetInput, { id: "read-1" });
    const queryCall = (selector: Selector) =>
      fauxToolCall(
        brunchTools.ledgerQueryBasis,
        { selector },
        { id: "query-1" },
      );

    test("carries its name and the library's description", () => {
      const host = createHostBinding();
      expect(
        createQueryBasisTool(host, {
          name: brunchTools.ledgerQueryBasis,
          description: queryBasisToolDescription,
        }),
      ).toMatchObject({
        name: "ledger_query_basis",
        description: queryBasisToolDescription,
        executionMode: "sequential",
      });
      // Unnamed, it keeps Brunch's website name.
      expect(createQueryBasisTool(host)).toMatchObject({
        name: "query_basis",
        description: queryBasisToolDescription,
      });
    });

    test("[petrinaut_get_net, petrinaut_update_arc retargeting the arc], then a query for the new arc, lists the merged update (§3.1)", async () => {
      const { harness, root } = await openAgent([
        fauxAssistantMessage(getNet(), { stopReason: "toolUse" }),
        browserCall("arc-moved", "petrinaut_update_arc", retargetInput),
        fauxAssistantMessage(queryCall(arcTo("buffer")), {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage("Done."),
      ]);
      const submission = await root.submit(
        { type: "input", content: "Why does Serve take from the buffer?" },
        context,
      );
      await answer(
        harness,
        root.id,
        "read-1",
        { definition: arcNet("queue") },
        { documentRevision: { before: "revision-1" } },
      );
      await answer(
        harness,
        root.id,
        "arc-moved",
        { applied: true },
        {
          documentRevision: { before: "revision-1", after: "revision-2" },
          readBack: arcNet("buffer"),
        },
      );
      expect((await submission.wait(context)).status).toBe("done");
      expect(resultOf(await allEntriesOf(root), "query-1")).toMatchObject({
        isError: false,
        output: {
          disposition: "basis-absent",
          readToolCallId: "arc-moved",
          changes: [
            {
              toolCallId: "arc-moved",
              operation: "petrinaut_update_arc",
              petrinautRevisionId: "revision-2",
            },
          ],
        },
      });
      await harness.close(context);
    });

    describe("runs sequentially beside petrinaut_get_net (§3.6)", () => {
      test.each([
        ["[read, ledger_query_basis]", ["read-1", "query-1"], "basis-absent"],
        ["[ledger_query_basis, read]", ["query-1", "read-1"], "not-found"],
      ] as const)("%s answers %s", async (_, order, disposition) => {
        const call = {
          "read-1": getNet(),
          "query-1": queryCall(queue),
        };
        const { harness, root } = await openAgent([
          fauxAssistantMessage(
            order.map((id) => call[id]),
            { stopReason: "toolUse" },
          ),
          fauxAssistantMessage("Done."),
        ]);
        const submission = await root.submit(
          { type: "input", content: "Why the queue?" },
          context,
        );
        await answer(harness, root.id, "read-1", queueDefinition, {
          documentRevision: { before: "revision-2" },
        });
        expect((await submission.wait(context)).status).toBe("done");
        const entries = await allEntriesOf(root);
        expect(resultOf(entries, "query-1")).toMatchObject({
          isError: false,
          output: { disposition },
        });
        expect(JSON.stringify(entries)).not.toContain("Dependent call refused");
        await harness.close(context);
      });
    });
  });
});
