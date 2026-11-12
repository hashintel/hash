/* oxlint-disable eslint/no-await-in-loop -- Turns and commits run in order. */
/**
 * Proof 2: the Brunch Ledger as a rewindable Pi Durable document. Faux-model
 * turns call `ledger_commit`; the Ledger is read back current, as of an entry,
 * from a fork, after reopen, and after a crash between the Ledger edit and the
 * tool result.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  type ConversationId,
  defineDoc,
  type DocumentId,
  type EntryRecord,
  type Harness,
  MemoryStorage,
  type Storage,
  type StorageWrite,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import { openHarness } from "../harness";
import { foldLedger, LedgerDoc } from "../ledger";

import type { LedgerAppendOutput } from "./ledger-doc";

const context = BACKGROUND_CONTEXT;

/** One `ledger_commit` per call, each a different kind of record. */
const queues = {
  "call-1": [
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ],
  "call-2": [
    [
      "claim/create",
      {
        text: "There is one dryer, held by each batch while drying.",
        entities: ["e1"],
        origin: "stated",
        status: "confirmed",
      },
    ],
  ],
  "call-3": [
    [
      "obligation/create",
      { text: "Reproduce a batch waiting for the dryer.", claims: ["c1"] },
    ],
  ],
  "call-4": [
    [
      "reflection/create",
      { text: "The dryer is the bottleneck c1 implies.", claims: ["c1"] },
    ],
  ],
};

type CallId = keyof typeof queues;

/** A turn whose model commits `callId`'s queue, then answers. */
const commitTurn = (callId: CallId) => [
  fauxAssistantMessage(
    fauxToolCall(
      brunchTools.ledgerCommit,
      { entries: queues[callId] },
      { id: callId },
    ),
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(`Recorded ${callId}.`),
];

const runTurn = async (conversation: Conversation, content: string) =>
  (await conversation.submit({ type: "input", content }, context)).wait(
    context,
  );

/** A turn as `POST /chat` admits it: a `brunch.user` input. */
const runBrunchUserTurn = async (conversation: Conversation, text: string) =>
  (
    await conversation.submit(
      {
        type: "input",
        content: text,
        entry: {
          kind: "brunch.user",
          data: { body: "ordinary", userText: text },
        },
      },
      context,
    )
  ).wait(context);

/** A host write that places a user-role message, as a hand-edit note does, or none, as a prune write does. */
const hostWrite = async (conversation: Conversation, kind: string) =>
  (
    await conversation.submit(
      {
        type: "write",
        entry: {
          kind,
          data: { note: kind },
          ...(kind === "brunch.hand-edit"
            ? {
                model: [
                  {
                    role: "user" as const,
                    content: '<hand-edit revision="R2">Edited.</hand-edit>',
                    timestamp: 0,
                  },
                ],
              }
            : {}),
        },
      },
      context,
    )
  ).wait(context);

const transcript = async (conversation: Conversation) =>
  (await conversation.entries({ order: "ascending" }, 200, undefined, context))
    .items;

/** The `ledger_commit` results in a transcript, by call ID, with the receipt the model read. */
const results = (entries: readonly EntryRecord[]) =>
  entries.flatMap((entry) => {
    const message = entry.model?.[0];
    if (entry.kind !== "pi.tool-result" || message?.role !== "toolResult")
      return [];
    const [content] = message.content;
    // An error result, such as `interrupted`, carries the Harness's diagnostic text instead.
    const receipt =
      !message.isError && content?.type === "text"
        ? (JSON.parse(content.text) as LedgerAppendOutput)
        : undefined;
    return [
      {
        entryId: entry.id,
        callId: message.toolCallId,
        isError: message.isError,
        receipt,
      },
    ];
  });

const ledgerOf = async (harness: Harness, id: ConversationId) =>
  foldLedger(await harness.snapshot(LedgerDoc, id, context));

/** The transcript's recorded receipts and the Ledger's accepted commits name the same calls at the same revisions. */
const expectAgreement = (
  entries: readonly EntryRecord[],
  ledger: ReturnType<typeof foldLedger>,
) =>
  expect(
    results(entries).flatMap(({ callId, receipt }) =>
      receipt?.status === "recorded" ? [[callId, receipt.revision]] : [],
    ),
  ).toEqual(
    ledger.commits.map(({ commitId, revision }) => [commitId, revision]),
  );

/**
 * `storage` with each commit's writes logged, and in `calls` the index of the storage call that carried it (1.5.0
 * stores a group of commits per call). A call holding a commit `crashOn` matches, the first time, throws before
 * reaching storage, so none of its commits is stored.
 */
const instrumented = (
  storage: Storage,
  log: (readonly StorageWrite[])[],
  crashOn?: (writes: readonly StorageWrite[]) => boolean,
  calls: number[] = [],
): Storage => {
  let crashed = false;
  let call = 0;
  const commit: Storage["commit"] = async (batches, receive, commitContext) => {
    if (!crashed && batches.some((writes) => crashOn?.(writes) === true)) {
      crashed = true;
      throw new Error("Injected crash: this commit never reached storage");
    }
    for (const writes of batches) {
      log.push(writes);
      calls.push(call);
    }
    call++;
    return storage.commit(batches, receive, commitContext);
  };
  return new Proxy(storage, {
    get: (target, property) => {
      if (property === "commit") return commit;
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function"
        ? (value as (...args: never[]) => unknown).bind(target)
        : value;
    },
  });
};

/** The call whose result entry a commit appends, if it appends one. */
const resultIn = (writes: readonly StorageWrite[]) =>
  writes.flatMap((write) =>
    write.type === "entry" &&
    write.value.kind === "pi.tool-result" &&
    write.value.model?.[0]?.role === "toolResult"
      ? [write.value.model[0].toolCallId]
      : [],
  )[0];

/** Whether a commit creates, copies or changes a Ledger document; records the IDs of those it creates. */
const editsLedger = (
  writes: readonly StorageWrite[],
  ledgerIds: Set<DocumentId>,
) =>
  writes.some((write) => {
    if (
      (write.type === "document.create" || write.type === "document.copy") &&
      write.record.kind === LedgerDoc.definition.kind
    ) {
      ledgerIds.add(write.record.id);
      return true;
    }
    return write.type === "document.change" && ledgerIds.has(write.id);
  });

describe("the Ledger as a rewindable document (proof 2)", () => {
  let directory: string;
  let file: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "durable-agents-ledger-"));
    file = join(directory, "session.sqlite");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("commits accumulate, rewind, fork and survive reopen", async () => {
    const log: (readonly StorageWrite[])[] = [];
    const calls: number[] = [];
    const { models, model } = scriptedModel([
      ...commitTurn("call-1"),
      ...commitTurn("call-2"),
      ...commitTurn("call-3"),
      ...commitTurn("call-4"),
    ]);
    const harness = await openHarness(
      instrumented(await openNodeSqliteStorage(file), log, undefined, calls),
      { models },
      context,
    );
    const root = await harness.root(context, { agent: { model } });
    for (const content of ["We have a dryer.", "One dryer.", "Check it."])
      expect((await runTurn(root, content)).status).toBe("done");

    const rootEntries = await transcript(root);
    const [first, second, third] = results(rootEntries);
    expect(
      [first, second, third].map((result) => result?.receipt),
    ).toMatchObject([
      { status: "recorded", revision: 1, ids: ["e1"], exchanges: 1 },
      { status: "recorded", revision: 2, ids: ["c1"], exchanges: 2 },
      { status: "recorded", revision: 3, ids: ["o1"], exchanges: 3 },
    ]);

    // After turn 3: all three.
    const current = await ledgerOf(harness, root.id);
    expect(current.commits.map(({ commitId }) => commitId)).toEqual([
      "call-1",
      "call-2",
      "call-3",
    ]);
    expect(current.state.entities.map(({ address }) => address)).toEqual([
      "e1",
    ]);
    expect(current.state.claims.map(({ address }) => address)).toEqual(["c1"]);
    expect(current.state.obligations.map(({ address }) => address)).toEqual([
      "o1",
    ]);
    // Turns anchor to the USER entry each commit follows, as Brunch anchors to the USER message.
    const userIds = rootEntries
      .filter(({ kind }) => kind === "pi.user")
      .map(({ id }) => String(id));
    expect(current.state.claims[0]?.turn).toBe(userIds[1]);
    expectAgreement(rootEntries, current);

    // As of turn 1's result entry: one.
    const asOfTurn1 = foldLedger(
      await harness.snapshotAsOf(LedgerDoc, root.id, first!.entryId, context),
    );
    expect(asOfTurn1.commits.map(({ commitId }) => commitId)).toEqual([
      "call-1",
    ]);
    expect(asOfTurn1.state.claims).toEqual([]);

    // A fork at turn 2's result entry: two; a fourth commit there leaves the parent at three.
    const fork = await root.fork(
      second!.entryId,
      { ownership: { kind: "ownerless" } },
      context,
    );
    expect(
      (await ledgerOf(harness, fork.id)).commits.map(
        ({ commitId }) => commitId,
      ),
    ).toEqual(["call-1", "call-2"]);
    expect((await runTurn(fork, "Reflect on it.")).status).toBe("done");
    const forkEntries = await transcript(fork);
    expect(results(forkEntries).at(-1)?.receipt).toMatchObject({
      status: "recorded",
      revision: 3,
      ids: ["r1"],
      exchanges: 3,
    });
    const forked = await ledgerOf(harness, fork.id);
    expect(forked.commits.map(({ commitId }) => commitId)).toEqual([
      "call-1",
      "call-2",
      "call-4",
    ]);
    expect(forked.state.obligations).toEqual([]);
    expectAgreement(forkEntries, forked);
    const parent = await ledgerOf(harness, root.id);
    expect(parent.commits.map(({ commitId }) => commitId)).toEqual([
      "call-1",
      "call-2",
      "call-3",
    ]);
    expect(parent.state.reflections).toEqual([]);

    // The storage writes: each call's Ledger edit and its result entry are separate commits, the edit first.
    const ledgerIds = new Set<DocumentId>();
    const edits = log.flatMap((writes, index) =>
      editsLedger(writes, ledgerIds) &&
      !writes.some((write) => write.type === "document.copy")
        ? [index]
        : [],
    );
    const resultCommits = (
      ["call-1", "call-2", "call-3", "call-4"] as const
    ).map((callId) => log.findIndex((writes) => resultIn(writes) === callId));
    process.stdout.write(
      `${["call-1", "call-2", "call-3", "call-4"]
        .map(
          (callId, index) =>
            `${callId}: Ledger edit in commit #${edits[index]} (storage call ${calls[edits[index]!]}), result entry in commit #${resultCommits[index]} (storage call ${calls[resultCommits[index]!]})`,
        )
        .join("\n")}\n`,
    );
    expect(edits).toHaveLength(4);
    for (const [index, resultCommit] of resultCommits.entries()) {
      expect(edits[index]).toBeLessThan(resultCommit);
      expect(editsLedger(log[resultCommit]!, ledgerIds)).toBe(false);
    }

    // Reopen: the same reads from the file.
    await harness.close(context);
    const reopened = await openHarness(
      await openNodeSqliteStorage(file),
      { models: scriptedModel([]).models },
      context,
    );
    try {
      expect(await ledgerOf(reopened, root.id)).toEqual(parent);
      expect(await ledgerOf(reopened, fork.id)).toEqual(forked);
      expect(
        foldLedger(
          await reopened.snapshotAsOf(
            LedgerDoc,
            root.id,
            first!.entryId,
            context,
          ),
        ),
      ).toEqual(asOfTurn1);
    } finally {
      await reopened.close(context);
    }
  });

  test("a crash between the Ledger edit and the result commit converges on resume", async () => {
    const log: (readonly StorageWrite[])[] = [];
    const { models, model } = scriptedModel(commitTurn("call-1").slice(0, 1));
    const crashing = await openHarness(
      instrumented(
        await openNodeSqliteStorage(file),
        log,
        (writes) => resultIn(writes) === "call-1",
      ),
      { models },
      context,
    );
    const root = await crashing.root(context, { agent: { model } });
    await expect(runTurn(root, "We have a dryer.")).rejects.toThrow(
      "Session failed after a storage error",
    );
    expect(await crashing.closed).toMatchObject({ kind: "failed" });
    const ledgerIds = new Set<DocumentId>();
    expect(log.some((writes) => editsLedger(writes, ledgerIds))).toBe(true);

    const rerunLog: (readonly StorageWrite[])[] = [];
    const answer = scriptedModel([fauxAssistantMessage("Recorded call-1.")]);
    const reopened = await openHarness(
      instrumented(await openNodeSqliteStorage(file), rerunLog),
      { models: answer.models },
      context,
    );
    try {
      const reopenedRoot = await reopened.root(context);
      // Before resume: the Ledger holds the commit, the transcript has no result yet.
      const before = await ledgerOf(reopened, root.id);
      expect(before.commits.map(({ commitId }) => commitId)).toEqual([
        "call-1",
      ]);
      expect(results(await transcript(reopenedRoot))).toEqual([]);

      // Resume: the replay-safe call reruns, finds its commit, and returns the receipt it was given.
      await reopened.waitForIdle(context);
      const after = await transcript(reopenedRoot);
      expect(results(after)).toMatchObject([
        {
          callId: "call-1",
          isError: false,
          receipt: { status: "recorded", revision: 1, ids: ["e1"] },
        },
      ]);
      expect(after.at(-1)?.kind).toBe("pi.assistant");
      expect(answer.state.callCount).toBe(1);
      const ledger = await ledgerOf(reopened, root.id);
      expect(ledger).toEqual(before);
      expectAgreement(after, ledger);
      expect(rerunLog.some((writes) => editsLedger(writes, ledgerIds))).toBe(
        false,
      );
    } finally {
      await reopened.close(context);
    }
  });

  test("turns open on brunch.user and old pi.user inputs, never on host notes or prune writes (proof 14)", async () => {
    const { models, model } = scriptedModel([
      ...commitTurn("call-1"),
      ...commitTurn("call-2"),
    ]);
    const harness = await openHarness(new MemoryStorage(), { models }, context);
    try {
      const root = await harness.root(context, { agent: { model } });
      // A conversation admitted before `brunch.user`, continued after it.
      expect((await runTurn(root, "We have a dryer.")).status).toBe("done");
      await hostWrite(root, "brunch.hand-edit");
      await hostWrite(root, "brunch.prune");
      expect((await runBrunchUserTurn(root, "One dryer.")).status).toBe("done");

      const entries = await transcript(root);
      const idsOf = (kind: string) =>
        entries
          .filter((entry) => entry.kind === kind)
          .map(({ id }) => String(id));
      expect(idsOf("brunch.hand-edit")).toHaveLength(1);
      expect(idsOf("brunch.prune")).toHaveLength(1);
      const stored = await harness.snapshot(LedgerDoc, root.id, context);
      expect(
        stored?.messages.flatMap(({ id, role }) =>
          role === "user" ? [id] : [],
        ),
      ).toEqual([...idsOf("pi.user"), ...idsOf("brunch.user")]);
      const ledger = foldLedger(stored);
      expect(ledger.state.entities[0]?.turn).toBe(idsOf("pi.user")[0]);
      expect(ledger.state.claims[0]?.turn).toBe(idsOf("brunch.user")[0]);
      expectAgreement(entries, ledger);
    } finally {
      await harness.close(context);
    }
  });

  test("control: a fork copies a `current` document's latest value and an `asOf` one's value at the fork", async () => {
    const counter = (fork: "current" | "asOf") =>
      defineDoc<{ count: number }>({
        kind: `test.counter.${fork}`,
        version: 1,
        scope: "conversation",
        history: "rewindable",
        fork,
        initial: () => ({ count: 0 }),
        checkpointWhen: () => false,
      });
    const current = counter("current");
    const asOf = counter("asOf");
    const harness = await openHarness(
      new MemoryStorage(),
      { models: scriptedModel([]).models },
      context,
    );
    try {
      const root = await harness.root(context);
      const marks = [];
      for (let i = 0; i < 3; i++)
        marks.push(
          await root.commit(async (tx) => {
            const [latest, atFork] = await Promise.all([
              tx.doc(current, root.id),
              tx.doc(asOf, root.id),
            ]);
            latest.count += 1;
            atFork.count += 1;
            return tx.appendEntry(root.id, { kind: "test.mark" });
          }, context),
        );
      const fork = await root.fork(
        marks[1]!.id,
        { ownership: { kind: "ownerless" } },
        context,
      );
      expect(await harness.snapshot(current, fork.id, context)).toEqual({
        count: 3,
      });
      expect(await harness.snapshot(asOf, fork.id, context)).toEqual({
        count: 2,
      });
    } finally {
      await harness.close(context);
    }
  });
});
