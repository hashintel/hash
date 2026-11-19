/**
 * The replay tails of `BrowserCallsDoc` and `LedgerDoc` on Postgres, after a
 * conversation's worth of changes: 100 browser calls through their five
 * updates each (issued, claimed, started, finished, settled), and 500
 * `ledger_commit` calls, each change in its own commit.
 *
 * Pi Durable calls a document that never checkpoints a definition bug: every
 * read replays its whole delta tail. `BrowserCallsDoc` stores a base every 32
 * changes: a read replays at most 31 deltas, and `PostgresStorage` keeps at
 * most 32 revisions of the latest-history document, deleting what a base
 * supersedes. The rewindable `LedgerDoc` keeps every revision, so
 * `snapshotAsOf` still reads any entry; it stores a base every 128 changes
 * and replays at most 127 deltas from the newest base before the entry.
 */
import { randomUUID } from "node:crypto";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  type DocumentPoint,
  type EntryId,
  type Harness,
} from "@earendil-works/pi-durable";
import { Pool } from "pg";
import { afterAll, expect, test } from "vitest";

import {
  type BrowserCallRecord,
  BrowserCallsDoc,
} from "../../src/browser-call/browser-call";
import { openHarness } from "../../src/harness";
import { LedgerDoc } from "../../src/ledger";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import {
  openPostgresStorage,
  type PostgresStorage,
} from "../../src/storage/postgres/postgres-storage";
import { scriptedModel } from "../scripted-model";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
afterAll(() => admin.end());

/** Revisions `BrowserCallsDoc` keeps at most: a base and the deltas after it. */
const browserCallsMaxRevisions = 32;
const ledgerMaxReplayedDeltas = 127;

const browserCalls = 100;
const ledgerCommits = 500;

const openOn = async (schema: string) =>
  openHarness(
    await openPostgresStorage({ pool: poolConfig, schema }),
    { models: scriptedModel([]).models },
    context,
  );

/** One document's stored revisions, by the kind `PostgresStorage` encodes. */
const revisions = async (schema: string, kind: string) => {
  const { rows } = await admin.query<{
    bases: string;
    deltas: string;
  }>(
    `SELECT count(*) FILTER (WHERE r.kind = 'base') AS bases,
        count(*) FILTER (WHERE r.kind = 'delta') AS deltas
      FROM "${schema}".documents d JOIN "${schema}".document_revisions r ON r.document_id = d.id
      WHERE d.kind = $1`,
    [JSON.stringify(kind)],
  );
  const [row] = rows;
  return {
    bases: Number(row?.bases),
    deltas: Number(row?.deltas),
  };
};

/** The deltas a read of the document replays after its newest base, at `at`. */
const replayedDeltas = async (
  storage: PostgresStorage,
  kind: string,
  conversationId: ConversationId,
  at: DocumentPoint,
) => {
  const address = {
    kind,
    scope: { kind: "conversation" as const, conversationId },
  };
  const record = await storage.findDocument(address, "current", context);
  if (record === undefined) throw new Error(`No ${kind} document.`);
  return (await storage.document(record.id, at, context))?.deltasSinceBase;
};

const withSchema = async (run: (schema: string) => Promise<void>) => {
  const schema = `pi_durable_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await run(schema);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
};

/** A call's record as each of its updates leaves it, sized like a Petrinaut edit and its result. */
const callStages = (index: number): Partial<BrowserCallRecord>[] => [
  {
    status: "pending",
    input: {
      operations: Array.from({ length: 6 }, (_, operation) => ({
        kind: "addPlace",
        id: `place-${index}-${operation}`,
        label: `Place ${operation} of change ${index}`,
      })),
    },
  },
  {
    status: "claimed",
    capability: `capability-${index}`,
    claimed: true,
    claimant: "tab-1",
  },
  { started: true },
  {
    status: "finished",
    output: {
      applied: true,
      revision: "f".repeat(64),
      places: Array.from({ length: 20 }, (_, place) => ({
        id: `place-${index}-${place}`,
        label: `Place ${place}`,
        tokens: place,
      })),
    },
    metadata: { durationMs: 120 },
  },
  { status: "settled" },
];

const runBrowserCalls = async (harness: Harness) => {
  const root = await harness.root(context);
  for (let index = 0; index < browserCalls; index++) {
    const toolCallId = `call-${index}`;
    for (const stage of callStages(index)) {
      // eslint-disable-next-line no-await-in-loop -- Each update is its own commit, as a call's are.
      await root.commit(async (tx) => {
        const { calls } = await tx.doc(BrowserCallsDoc, root.id);
        calls[toolCallId] = {
          toolCallId,
          toolName: "petrinaut_apply",
          input: {},
          status: "pending",
          issuedAt: index,
          expiresAt: index + 60_000,
          task: index,
          doorbell: null,
          capability: null,
          claimed: false,
          output: null,
          metadata: null,
          binding: "binding",
          ...calls[toolCallId],
          ...stage,
        };
      }, context);
    }
  }
  return root.id;
};

const runLedgerCommits = async (harness: Harness) => {
  const root = await harness.root(context);
  const entries: EntryId[] = [];
  for (let index = 0; index < ledgerCommits; index++) {
    // eslint-disable-next-line no-await-in-loop -- Each Ledger commit is its own commit, as a turn's are.
    const entry = await root.commit(async (tx) => {
      const ledger = await tx.doc(LedgerDoc, root.id);
      const toolCallId = `ledger-${index}`;
      ledger.messages.push({
        id: toolCallId,
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "ledger_commit",
            toolCallId,
            state: "output-available",
            input: {
              entries: [
                [
                  "entity/create",
                  {
                    name: `Resource ${index}`,
                    kind: "resource",
                    origin: "stated",
                    status: "confirmed",
                    description: `The resource the USER named in exchange ${index}.`,
                  },
                ],
              ],
            },
            output: {
              status: "recorded",
              exchanges: index + 1,
              records: [`e${index}`],
            },
          },
        ],
      });
      return tx.appendEntry(root.id, { kind: "test.mark" });
    }, context);
    entries.push(entry.id);
  }
  return { conversationId: root.id, entries };
};

test(`BrowserCallsDoc keeps at most ${browserCallsMaxRevisions} revisions across ${browserCalls} calls`, async () => {
  await withSchema(async (schema) => {
    const harness = await openOn(schema);
    const conversationId = await runBrowserCalls(harness);
    await harness.close(context);

    const stored = await revisions(schema, BrowserCallsDoc.definition.kind);
    const storage = await openPostgresStorage({
      pool: poolConfig,
      schema,
      readOnly: true,
    });
    const replay = await replayedDeltas(
      storage,
      BrowserCallsDoc.definition.kind,
      conversationId,
      "current",
    );
    await storage.close(context);
    const reopened = await openOn(schema);
    try {
      const snapshot = await reopened.snapshot(
        BrowserCallsDoc,
        conversationId,
        context,
      );
      expect(Object.values(snapshot?.calls ?? {})).toHaveLength(browserCalls);
      expect(
        Object.values(snapshot?.calls ?? {}).every(
          ({ status }) => status === "settled",
        ),
      ).toBe(true);
      expect(stored.bases + stored.deltas).toBeLessThanOrEqual(
        browserCallsMaxRevisions,
      );
      expect(replay).toBeLessThan(browserCallsMaxRevisions);
    } finally {
      await reopened.close(context);
    }
  });
});

test(`LedgerDoc replays at most ${ledgerMaxReplayedDeltas} deltas across ${ledgerCommits} commits, and still reads every entry`, async () => {
  await withSchema(async (schema) => {
    const harness = await openOn(schema);
    const { conversationId, entries } = await runLedgerCommits(harness);
    await harness.close(context);

    const stored = await revisions(schema, LedgerDoc.definition.kind);
    const middle = Math.floor(entries.length / 2);
    const middleEntry = entries[middle]!;
    const latestEntry = entries.at(-1)!;
    const storage = await openPostgresStorage({
      pool: poolConfig,
      schema,
      readOnly: true,
    });
    const middleSeq = (await storage.entry(middleEntry, context))?.commitSeq;
    if (middleSeq === undefined) throw new Error(`No entry ${middleEntry}.`);
    const latestReplay = await replayedDeltas(
      storage,
      LedgerDoc.definition.kind,
      conversationId,
      "current",
    );
    const middleReplay = await replayedDeltas(
      storage,
      LedgerDoc.definition.kind,
      conversationId,
      middleSeq,
    );
    await storage.close(context);
    const reopened = await openOn(schema);
    try {
      const latest = await reopened.snapshotAsOf(
        LedgerDoc,
        conversationId,
        latestEntry,
        context,
      );
      const atMiddle = await reopened.snapshotAsOf(
        LedgerDoc,
        conversationId,
        middleEntry,
        context,
      );
      expect(latest?.messages).toHaveLength(ledgerCommits);
      expect(atMiddle?.messages).toHaveLength(middle + 1);
      // Rewindable: every revision stays addressable.
      expect(stored.bases + stored.deltas).toBeGreaterThanOrEqual(
        ledgerCommits,
      );
      expect(latestReplay).toBeLessThanOrEqual(ledgerMaxReplayedDeltas);
      expect(middleReplay).toBeLessThanOrEqual(ledgerMaxReplayedDeltas);
      // Bases bound replay; a never-checkpointing Ledger stores one, at its creation.
      expect(stored.bases).toBeGreaterThan(1);
    } finally {
      await reopened.close(context);
    }
  });
});
