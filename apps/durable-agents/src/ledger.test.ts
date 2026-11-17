/**
 * The HASH agent's Ledger tools (`hash-agent-port.md` §3.8, §3.11): HASH's
 * append schema, `ledger_query`, and fold 7, where `ledger_commit` with
 * `endTurn` ends the turn once the exchange has replied, with no further
 * model request.
 *
 * The Harness is opened as the server's conversation registry opens one,
 * with the Ledger extension built over its host binding.
 */
import {
  CompactionEntry,
  type Conversation,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryRecord,
  type Extension,
  Harness,
  type JsonObject,
  LiveDoc,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { bool, obj, str } from "@earendil-works/pi-schema";
import { expect, test } from "vitest";

import {
  brunchSignals,
  brunchTools,
  commitToolDescription,
  compileToolDescription,
  hashEvidencedDescription,
  ledgerCommentsMessage,
} from "@hashintel/brunch-agent";

import { scriptedModel } from "../test/platform/compaction-placement/support";
import {
  changeText,
  createPlaceToolName,
  expectI1,
  openHarness,
  prunedChangeText,
} from "../test/platform/hash-port/support";
import {
  allEntries,
  context,
  fauxAssistantMessage,
  fauxToolCall,
  holdTool,
  kindsOf,
  recordingModel,
  resultEntry,
  textOf,
} from "../test/platform/support";
import { readBackPruningExtension } from "./agent/hash-agent/read-back-pruning";
import { createHostBinding } from "./agent/host-binding";
import { bindBrowserDocument } from "./browser-call/browser-call";
import { createLedgerExtension, foldLedger, LedgerDoc } from "./ledger";
import { followSubmission } from "./server/durable-agents-server/submission-stream";

import type { HostBinding } from "./agent/host-binding";
import type { LedgerAppendOutput } from "./ledger-doc/ledger-doc";
import type { Message } from "@earendil-works/pi-ai";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const dryer = {
  name: "Dryer",
  kind: "resource",
  origin: "stated",
  status: "confirmed",
};

/** A queue the Ledger records. */
const recordable = [["entity/create", dryer]];

/** A queue the Ledger refuses: it references an entity that does not exist. */
const refusable = [
  [
    "claim/create",
    {
      text: "The dryer holds one batch.",
      entities: ["e9"],
      origin: "stated",
      status: "confirmed",
    },
  ],
];

const commit = (id: string, entries: unknown[], endTurn?: boolean) =>
  fauxToolCall(
    brunchTools.ledgerCommit,
    { entries, ...(endTurn === undefined ? {} : { endTurn }) } as JsonObject,
    { id },
  );

/** One response: optional text, then the calls, in order. */
const response = (
  text: string | undefined,
  ...toolCalls: ReturnType<typeof fauxToolCall>[]
): FauxResponseStep =>
  fauxAssistantMessage(
    [
      ...(text === undefined ? [] : [{ type: "text" as const, text }]),
      ...toolCalls,
    ],
    toolCalls.length > 0 ? { stopReason: "toolUse" } : {},
  );

/** A net read that never asks to end the run. */
const getNetToolName = "petrinaut_get_net";

/** A net change that renders its read-back and can ask to end the run, which no browser tool does. */
const createPlaceTool = defineTool({
  name: createPlaceToolName,
  description: "Stand-in: creates a place and reads the net back.",
  parameters: obj({ before: str(), after: str(), endTurn: bool() }),
  execute: async ({ before, after, endTurn }) => ({
    output: [{ type: "text", text: changeText(before, after) }],
    ...(endTurn ? { control: { terminate: true } } : {}),
  }),
});

const standInsExtension = defineExtension({
  name: "test.hash-net-stand-ins",
  tools: [
    createPlaceTool,
    defineTool({
      name: getNetToolName,
      description: "Stand-in: reads the net.",
      parameters: obj({}),
      execute: async () => ({ output: [{ type: "text", text: "{}" }] }),
    }),
  ],
});

const extensionsOver = (host: HostBinding): readonly Extension[] => [
  createLedgerExtension(host),
  standInsExtension,
  readBackPruningExtension(host),
];

/** A conversation whose model answers with `responses`, and a helper that runs one turn of it. */
const conversation = async (responses: readonly FauxResponseStep[]) => {
  const { models, model, requests } = recordingModel(responses);
  const { harness, host } = await openHarness(
    new MemoryStorage(),
    models,
    extensionsOver,
  );
  const root = await harness.root(context, {
    agent: { model, extensions: extensionsOver(host) },
  });
  const turn = async (content: string) =>
    (await root.submit({ type: "input", content }, context)).wait(context);
  return { harness, root, requests, turn };
};

/** The receipt `ledger_commit` call `callId` returned. */
const receiptOf = async (
  root: Awaited<ReturnType<typeof conversation>>["root"],
  callId: string,
) => {
  const message = resultEntry(await allEntries(root), callId)?.model?.[0];
  return message?.role === "toolResult"
    ? (JSON.parse(textOf(message)) as LedgerAppendOutput)
    : undefined;
};

test("ledger_commit offers HASH's append schema with Brunch's description, and ledger_query Brunch's map description", async () => {
  const { harness, root } = await conversation([]);
  try {
    const { tools } = await root.agent(context);
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const commitTool = byName.get(brunchTools.ledgerCommit);
    expect(commitTool?.description).toBe(commitToolDescription);
    expect(JSON.stringify(commitTool?.parameters)).toContain(
      JSON.stringify(hashEvidencedDescription),
    );
    expect(JSON.stringify(commitTool?.parameters)).toContain('"endTurn"');
    expect(byName.get(brunchTools.ledgerQuery)?.description).toBe(
      compileToolDescription,
    );
  } finally {
    await harness.close(context);
  }
});

test("a reply and a recorded ledger_commit with endTurn end the turn with no further request", async () => {
  const { harness, root, requests, turn } = await conversation([
    response("Noted the dryer.", commit("commit-1", recordable, true)),
  ]);
  try {
    expect((await turn("We have a dryer.")).status).toBe("done");
    expect(requests).toHaveLength(1);
    expect(await receiptOf(root, "commit-1")).toMatchObject({
      status: "recorded",
    });
    expect(kindsOf(await allEntries(root)).slice(-2)).toEqual([
      "pi.assistant(commit-1)",
      "pi.tool-result(commit-1)",
    ]);
  } finally {
    await harness.close(context);
  }
});

test("whitespace-only text is no reply: the turn stays open", async () => {
  const { harness, requests, turn } = await conversation([
    response(" \n\t", commit("commit-1", recordable, true)),
    response("Noted the dryer."),
  ]);
  try {
    expect((await turn("We have a dryer.")).status).toBe("done");
    expect(requests).toHaveLength(2);
  } finally {
    await harness.close(context);
  }
});

test("a sibling call that does not end the run keeps the turn open", async () => {
  const { harness, requests, turn } = await conversation([
    fauxAssistantMessage(
      [
        { type: "text", text: "Noted the dryer." },
        fauxToolCall(
          brunchTools.ledgerCommit,
          { entries: recordable, endTurn: true } as JsonObject,
          { id: "commit-1" },
        ),
        fauxToolCall(getNetToolName, {}, { id: "read-1" }),
      ],
      { stopReason: "toolUse" },
    ),
    response("Here is the net."),
  ]);
  try {
    expect((await turn("We have a dryer.")).status).toBe("done");
    expect(requests).toHaveLength(2);
  } finally {
    await harness.close(context);
  }
});

test("a repaired commit ends the turn on the reply written beside the refused one", async () => {
  const { harness, root, requests, turn } = await conversation([
    response("Noted.", commit("commit-1", refusable, true)),
    response(undefined, commit("commit-2", recordable, true)),
  ]);
  try {
    expect((await turn("We have a dryer.")).status).toBe("done");
    expect(await receiptOf(root, "commit-1")).toMatchObject({
      status: "refused",
    });
    expect(await receiptOf(root, "commit-2")).toMatchObject({
      status: "recorded",
    });
    // A refusal keeps the turn open for its repair; the repair ends it.
    expect(requests).toHaveLength(2);
  } finally {
    await harness.close(context);
  }
});

/**
 * One turn that streams its reply, "Noted.", to the client beside a refused
 * commit, then repairs the commit in a later round. A held call keeps the run
 * open between them while `during` acts on the reply's entry; what it writes
 * is placed when the call is released, before the repair's request. The
 * model's fourth answer is there only to show the repair left the turn open.
 */
const repairAfterDeliveredReply = async (
  during: (target: {
    readonly harness: Harness;
    readonly root: Conversation;
    readonly reply: EntryRecord;
  }) => Promise<void>,
) => {
  const model = scriptedModel();
  const held = holdTool();
  model.script(
    response("Noted.", commit("commit-1", refusable, true)),
    response(undefined, fauxToolCall(held.tool.name, {}, { id: "hold-1" })),
    response(undefined, commit("commit-2", recordable, true)),
    response("Noted the dryer."),
  );
  const host = createHostBinding();
  const extensions = [
    createLedgerExtension(host),
    defineExtension({ name: "test.hold", tools: [held.tool] }),
  ];
  const registry = createRegistry();
  for (const extension of extensions) registry.install(extension);
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models: model.models,
      registry,
      settings: { compaction: { keepRecentTokens: 1 } },
    },
    context,
  );
  host.bind(harness);
  let consumed: Promise<void> | undefined;
  try {
    const root = await harness.root(context, {
      agent: { model: model.model, extensions },
    });
    const submission = await root.submit(
      { type: "input", content: "We have a dryer." },
      context,
    );
    const stream = await followSubmission(
      root,
      submission,
      { clientToolNames: new Set<string>() },
      context,
    );
    const delivered = Promise.withResolvers<void>();
    let received = "";
    consumed = (async () => {
      for await (const chunk of stream) {
        if (chunk.type !== "text-delta") continue;
        received += chunk.delta;
        if (received.includes("Noted.")) delivered.resolve();
      }
    })();
    // Awaited in `finally`; this only keeps an early rejection attached.
    consumed.catch(() => undefined);
    await Promise.all([held.started, delivered.promise]);
    const deliveredText = received;

    const reply = (await allEntries(root)).find((entry) =>
      entry.model?.some(
        (message) =>
          message.role === "assistant" && textOf(message) === "Noted.",
      ),
    );
    if (reply === undefined) throw new Error("The reply was not committed.");
    const first = (await harness.snapshot(LiveDoc, root.id, context))?.run
      ?.first;

    await during({ harness, root, reply });
    held.release();
    const status = (await submission.wait(context)).status;
    await consumed;

    const entries = await allEntries(root);
    const repair = resultEntry(entries, "commit-2");
    if (repair === undefined) throw new Error("The repair did not run.");
    return {
      status,
      deliveredText,
      reply,
      first,
      entries,
      atRepair: await root.context(context, { at: repair.id }),
      refused: await receiptOf(root, "commit-1"),
      repaired: await receiptOf(root, "commit-2"),
      requests: model.requests,
      summaries: model.summaries,
    };
  } finally {
    held.release();
    await harness.close(context);
    await consumed?.catch(() => undefined);
  }
};

/** Compact `root` while its run is busy; the summary is placed at the run's next boundary. */
const compactMidRun = async (harness: Harness, root: Conversation) => {
  const task = await root.compact(undefined, context);
  expect((await harness.waitForTask(task, context)).state.outcome.status).toBe(
    "completed",
  );
};

/** A write that omits `target`'s contribution to model context. */
const omitFromContext = (root: Conversation, target: EntryRecord) =>
  root.submit(
    {
      type: "write",
      entry: {
        kind: "test.omit",
        edits: [{ target: target.id, action: "omit" }],
      },
    },
    context,
  );

const replyInRequest = (messages: readonly Message[] | undefined) =>
  (messages ?? []).some(
    (message) => message.role === "assistant" && textOf(message) === "Noted.",
  );

test.each([false, true])(
  "a reply delivered earlier in the run still ends the turn when native compaction has cut it (compacted: %s)",
  async (compact) => {
    const run = await repairAfterDeliveredReply(async ({ harness, root }) => {
      if (compact) await compactMidRun(harness, root);
    });
    expect(run.status).toBe("done");
    expect(run.deliveredText).toBe("Noted.");
    expect(run.reply.model?.[0]).toMatchObject({
      role: "assistant",
      stopReason: "toolUse",
    });
    expect(run.first).toBeDefined();
    expect(run.reply.id).toBeGreaterThanOrEqual(run.first ?? Infinity);
    expect(run.refused).toMatchObject({ status: "refused" });
    expect(run.repaired).toMatchObject({ status: "recorded" });
    expect(run.summaries).toHaveLength(compact ? 1 : 0);
    expect(CompactionEntry.is(run.atRepair.head)).toBe(compact);
    expect(run.atRepair.entries.some(({ id }) => id === run.reply.id)).toBe(
      !compact,
    );
    // The repair's request carried the reply only when nothing cut it.
    expect(replyInRequest(run.requests[2])).toBe(!compact);
    expect(run.requests).toHaveLength(3);
  },
  15_000,
);

test.each([
  { compaction: "none", placed: ["test.omit"] },
  { compaction: "after the edit", placed: ["test.omit", CompactionEntry.kind] },
  {
    compaction: "before the edit",
    placed: [CompactionEntry.kind, "test.omit"],
  },
] as const)(
  "a reply a context edit omitted does not end the turn (compaction: $compaction)",
  async ({ compaction, placed }) => {
    const compact = compaction !== "none";
    const run = await repairAfterDeliveredReply(
      async ({ harness, root, reply }) => {
        if (compaction === "before the edit") {
          await compactMidRun(harness, root);
        }
        await omitFromContext(root, reply);
        if (compaction === "after the edit") {
          await compactMidRun(harness, root);
        }
      },
    );
    expect(run.status).toBe("done");
    expect(run.deliveredText).toBe("Noted.");
    expect(run.repaired).toMatchObject({ status: "recorded" });
    expect(run.summaries).toHaveLength(compact ? 1 : 0);
    expect(CompactionEntry.is(run.atRepair.head)).toBe(compact);
    expect(
      run.entries.flatMap(({ kind }) =>
        kind === "test.omit" || kind === CompactionEntry.kind ? [kind] : [],
      ),
    ).toEqual(placed);
    expect(replyInRequest(run.requests[2])).toBe(false);
    expect(run.requests).toHaveLength(4);
  },
  15_000,
);

test("an earlier exchange's reply is not this exchange's", async () => {
  const { harness, requests, turn } = await conversation([
    response("Hello."),
    response(undefined, commit("commit-1", recordable, true)),
    response("Noted the dryer."),
  ]);
  try {
    expect((await turn("Hi.")).status).toBe("done");
    expect((await turn("We have a dryer.")).status).toBe("done");
    expect(requests).toHaveLength(3);
  } finally {
    await harness.close(context);
  }
});

test("a prune write in the terminating round lands once, and the next run's requests are the committed context (I1)", async () => {
  const { harness, root, requests, turn } = await conversation([
    response(
      undefined,
      fauxToolCall(
        createPlaceToolName,
        { before: "R0", after: "R1", endTurn: false },
        { id: "c0" },
      ),
    ),
    // The reply, then a change that asks to end the run and the commit.
    response(
      "Added the washer.",
      fauxToolCall(
        createPlaceToolName,
        { before: "R1", after: "R2", endTurn: true },
        { id: "c1" },
      ),
      commit("commit-1", recordable, true),
    ),
    response("You're welcome."),
  ]);
  try {
    await harness.commit(
      (tx) =>
        bindBrowserDocument(tx, root.id, {
          conversationId: "conversation",
          documentId: "net-1",
        }),
      context,
    );
    expect((await turn("Add a washer.")).status).toBe("done");
    expect(requests).toHaveLength(2);
    const entries = await allEntries(root);
    expect(kindsOf(entries).slice(-4)).toEqual([
      "pi.assistant(c1,commit-1)",
      "pi.tool-result(c1)",
      "pi.tool-result(commit-1)",
      "brunch.prune",
    ]);
    const prunes = entries.filter(({ kind }) => kind === "brunch.prune");
    // The first round had one read-back, so only the terminating round prunes.
    expect(prunes).toHaveLength(1);
    expect(prunes[0]?.data).toEqual({
      assistant: entries.find(
        (entry) => kindsOf([entry])[0] === "pi.assistant(c1,commit-1)",
      )?.id,
    });
    expect(prunes[0]?.edits?.map(({ target }) => target)).toEqual([
      resultEntry(entries, "c0")?.id,
    ]);

    expect((await turn("Thanks.")).status).toBe("done");
    expect(requests).toHaveLength(3);
    const after = await allEntries(root);
    await expectI1(root, after, requests);
    const results = Object.fromEntries(
      (requests[2] ?? []).flatMap((message) =>
        message.role === "toolResult"
          ? [[message.toolCallId, textOf(message)]]
          : [],
      ),
    );
    expect(results.c0).toBe(prunedChangeText);
    expect(results.c1).toBe(changeText("R1", "R2"));
  } finally {
    await harness.close(context);
  }
});

test("ledger_query after a commit in the same round shows it", async () => {
  const { harness, root, turn } = await conversation([
    response(
      undefined,
      commit("commit-1", recordable),
      fauxToolCall(brunchTools.ledgerQuery, {}, { id: "query-1" }),
    ),
    response("Recorded the dryer."),
  ]);
  try {
    expect((await turn("We have a dryer.")).status).toBe("done");
    const message = resultEntry(await allEntries(root), "query-1")?.model?.[0];
    const output = JSON.parse(textOf(message)) as {
      revision: number;
      map: string;
      rejected: string[];
    };
    expect(output.revision).toBe(1);
    expect(output.rejected).toEqual([]);
    expect(output.map).toContain("Dryer");
  } finally {
    await harness.close(context);
  }
});

test("ledger_query shows Ledger comments before any commit follows them", async () => {
  const { harness, root, requests } = await conversation([
    response(undefined, commit("commit-1", recordable)),
    response("Recorded the dryer."),
    response(
      undefined,
      fauxToolCall(brunchTools.ledgerQuery, {}, { id: "query-1" }),
    ),
    response("I see your comment."),
  ]);
  try {
    expect(
      (
        await (
          await root.submit({ type: "input", content: "A dryer." }, context)
        ).wait(context)
      ).status,
    ).toBe("done");
    const comments = [
      { id: "n1", records: ["e1"], text: "It is a tumble dryer." },
    ];
    const { body } = ledgerCommentsMessage(comments);
    expect(
      (
        await (
          await root.submit(
            {
              type: "input",
              content: body,
              entry: { kind: brunchSignals.ledgerComments, data: { comments } },
            },
            context,
          )
        ).wait(context)
      ).status,
    ).toBe("done");
    expect(requests).toHaveLength(4);
    const message = resultEntry(await allEntries(root), "query-1")?.model?.[0];
    expect(textOf(message)).toContain("It is a tumble dryer.");
    // The stored Ledger has no commit after the comments, so it does not hold them yet.
    expect(
      foldLedger(await harness.snapshot(LedgerDoc, root.id, context)).state
        .comments,
    ).toEqual([]);
  } finally {
    await harness.close(context);
  }
});
