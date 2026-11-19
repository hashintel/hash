/**
 * Obligation 1 of the storage-unit probe: fork a conversation to a new owner
 * within one Harness, while the source has a browser call pending, and see
 * what each of the successor's documents does under fork.
 *
 * Runs on `MemoryStorage`; with `STORAGE_UNIT_PG=1` also on the successor's
 * `PostgresStorage` in a throwaway schema on the compose Postgres, which it
 * drops. Faux model only.
 */
import { setTimeout as sleep } from "node:timers/promises";

import {
  AgentDoc,
  type Conversation,
  type ConversationId,
  defineDoc,
  type EntryRecord,
  type Harness,
  type JsonObject,
  LiveDoc,
  MemoryStorage,
  ProviderDoc,
  type Storage,
} from "@earendil-works/pi-durable";
import { Pool } from "pg";
import { afterAll, describe, expect, test } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent";

import {
  BrowserBindingDoc,
  BrowserCallsDoc,
  claimBrowserCallAs,
  finishBrowserCall,
  startBrowserCall,
} from "../../../src/browser-call/browser-call";
import { LedgerDoc } from "../../../src/ledger-doc/ledger-doc";
import { createRequestSlots } from "../../../src/server/durable-agents-server/request-slots";
import { VersionLoadDoc } from "../../../src/server/durable-agents-server/version-load";
import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../../src/storage/postgres/postgres-storage";
import { loadModelStep } from "../../load/probe/workload";
import { scriptedModel } from "../../scripted-model";
import {
  bindingFor,
  boundConversation,
  context,
  openAgentHarness,
} from "./agent-harness";

/**
 * The conversation's owner as a host document: who the conversation acts
 * for. `initial` on fork, so a fork never inherits its source's owner; the
 * fork's `init` writes the new one in the creating commit.
 */
const OwnerDoc = defineDoc<{ userId?: string }>({
  kind: "probe.owner",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({}),
  checkpointWhen: () => false,
});

const allEntries = async (conversation: Conversation) => {
  const entries: EntryRecord[] = [];
  let cursor: Parameters<Conversation["entries"]>[2];
  do {
    // Each page follows the one before.
    // eslint-disable-next-line no-await-in-loop
    const page = await conversation.entries(
      { order: "ascending" },
      100,
      cursor,
      context,
    );
    entries.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  return entries;
};

const until = async <T>(read: () => Promise<T | undefined>, what: string) => {
  for (let tries = 0; tries < 500; tries++) {
    // Each read follows the one before.
    // eslint-disable-next-line no-await-in-loop
    const value = await read();
    if (value !== undefined) return value;
    // eslint-disable-next-line no-await-in-loop
    await sleep(10);
  }
  throw new Error(`Timed out waiting for ${what}.`);
};

const pendingCall = (harness: Harness, conversationId: ConversationId) =>
  until(async () => {
    const calls =
      (await harness.snapshot(BrowserCallsDoc, conversationId, context))
        ?.calls ?? {};
    return Object.values(calls).find(({ status }) => status === "pending");
  }, "a pending browser call");

type StorageCase = {
  readonly name: string;
  readonly open: () => Promise<Storage>;
  readonly cleanup: () => Promise<void>;
};

const memoryCase: StorageCase = {
  name: "MemoryStorage",
  open: () => Promise.resolve(new MemoryStorage()),
  cleanup: () => Promise.resolve(),
};

const postgresCase = (): StorageCase => {
  const schema = `durable_unitprobe_fork_${Date.now().toString(36)}`;
  const pool = new Pool({ ...postgresConfigFromEnvironment(), max: 4 });
  return {
    name: "PostgresStorage",
    open: () => openPostgresStorage({ pool, schema }),
    cleanup: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    },
  };
};

const cases: StorageCase[] = [
  memoryCase,
  ...(process.env.STORAGE_UNIT_PG === "1" ? [postgresCase()] : []),
];

afterAll(async () => {
  await Promise.all(cases.map(({ cleanup }) => cleanup()));
});

describe.each(cases)("fork to a new owner on $name", (storageCase) => {
  test("a fork gets its own owner and agent, shares history to the fork point, and leaves the source and its pending call alone", async () => {
    const step = loadModelStep({
      onCall: () => () => {},
      latencyMs: () => 0,
    });
    const { models, model } = scriptedModel(
      Array.from({ length: 50 }, () => step),
    );
    const { harness, agent } = await openAgentHarness({
      storage: await storageCase.open(),
      models,
      model,
      slots: createRequestSlots(8),
    });
    harness.resume();
    try {
      const sourceName = "fork-source";
      const source = await harness.createConversation(
        boundConversation(agent, sourceName, async (tx, id) => {
          const owner = await tx.doc(OwnerDoc, id);
          owner.userId = "alice";
        }),
        context,
      );

      // Before the turn: one Ledger message and a version load the source was told of.
      await source.commit(async (tx) => {
        const ledgerDoc = await tx.doc(LedgerDoc, source.id);
        ledgerDoc.messages.push({
          id: "ledger-before-fork",
          role: "user",
          parts: [{ type: "text", text: "" }],
        });
        const versionLoad = await tx.doc(VersionLoadDoc, source.id);
        versionLoad.announced = "version-1";
      }, context);

      // Turn 1 reads the net first: the call waits for the browser.
      const turn = await source.submit(
        {
          type: "input",
          content: `[load ${sourceName} turn=1 calls=0] Read the net.`,
          requestId: "turn-1",
        },
        context,
      );
      const call = await pendingCall(harness, source.id);
      const { issuedEntry } = call;
      expect(issuedEntry).toBeDefined();
      const forkAt = issuedEntry!;

      // After the fork point: more Ledger, a newer version load.
      await source.commit(async (tx) => {
        const ledgerDoc = await tx.doc(LedgerDoc, source.id);
        ledgerDoc.messages.push({
          id: "ledger-after-fork-point",
          role: "user",
          parts: [{ type: "text", text: "" }],
        });
        const versionLoad = await tx.doc(VersionLoadDoc, source.id);
        versionLoad.announced = "version-2";
      }, context);

      const sourceBefore = await allEntries(source);
      const sourceLiveAtFork = await harness.snapshot(
        LiveDoc,
        source.id,
        context,
      );
      expect(sourceLiveAtFork?.run).toBeDefined();

      // Fork to Bob, at the assistant entry whose call is still pending.
      const fork = await source.fork(
        forkAt,
        {
          ownership: { kind: "ownerless" },
          agent: { instructions: "Forked for bob.", maxTurns: 7 },
          init: async (tx, id) => {
            const owner = await tx.doc(OwnerDoc, id);
            owner.userId = "bob";
          },
        },
        context,
      );

      // Owner: each its own.
      expect(
        (await harness.snapshot(OwnerDoc, source.id, context))?.userId,
      ).toBe("alice");
      expect((await harness.snapshot(OwnerDoc, fork.id, context))?.userId).toBe(
        "bob",
      );

      // Agent: the fork's change applied over the source's agent as of the fork entry; the source's untouched.
      const sourceAgent = await source.agent(context);
      const forkAgent = await fork.agent(context);
      expect(sourceAgent.instructions).toBeUndefined();
      expect(sourceAgent.maxTurns).toBe(100);
      expect(forkAgent.instructions).toBe("Forked for bob.");
      expect(forkAgent.maxTurns).toBe(7);
      expect(forkAgent.model).toEqual(sourceAgent.model);
      expect(forkAgent.extensions.map(({ name }) => name)).toEqual(
        sourceAgent.extensions.map(({ name }) => name),
      );
      expect(
        (await harness.snapshot(AgentDoc, fork.id, context)) !== undefined,
      ).toBe(true);

      // History: the fork sees the source's entries through the fork point, no further.
      const forkEntries = await allEntries(fork);
      const throughForkPoint = sourceBefore.filter(({ id }) => id <= forkAt);
      expect(forkEntries.map(({ id }) => id)).toEqual(
        throughForkPoint.map(({ id }) => id),
      );
      expect(forkEntries.at(-1)?.id).toBe(forkAt);

      // Documents under fork.
      const ledger = async (id: ConversationId) =>
        (await harness.snapshot(LedgerDoc, id, context))?.messages.map(
          (message) => message.id,
        );
      // LedgerDoc: rewindable, `asOf` the fork entry.
      expect(await ledger(source.id)).toEqual([
        "ledger-before-fork",
        "ledger-after-fork-point",
      ]);
      expect(await ledger(fork.id)).toEqual(["ledger-before-fork"]);
      // VersionLoadDoc: latest, `current`: the fork takes the source's newest, announced after its fork point.
      expect(
        (await harness.snapshot(VersionLoadDoc, fork.id, context))?.announced,
      ).toBe("version-2");
      // BrowserBindingDoc: latest, `current`: the fork is bound to the source's document.
      expect(
        (await harness.snapshot(BrowserBindingDoc, fork.id, context))?.binding,
      ).toBe(canonicalContent(bindingFor(sourceName)));
      // BrowserCallsDoc: latest, `initial`: the pending call is not the fork's.
      const forkCalls = await harness.snapshot(
        BrowserCallsDoc,
        fork.id,
        context,
      );
      expect(Object.keys(forkCalls?.calls ?? {})).toEqual([]);
      // LiveDoc: latest, `initial`: the fork is idle, although the source is mid-run.
      expect(
        (await harness.snapshot(LiveDoc, fork.id, context))?.run,
      ).toBeUndefined();
      // ProviderDoc: `initial`, a fresh provider session.
      expect(
        (await harness.snapshot(ProviderDoc, fork.id, context))?.sessionId,
      ).not.toBe(
        (await harness.snapshot(ProviderDoc, source.id, context))?.sessionId,
      );
      // No task of the source moved to the fork.
      const inspection = await harness.inspect(context);
      const forkTasks = inspection.tasks.filter(
        (task) => task.record.conversationId === fork.id,
      );
      expect(forkTasks).toEqual([]);

      // The pending call can't be claimed through the fork, even with the inherited binding.
      const claimant = {
        claimant: "tab-bob",
        binding: canonicalContent(bindingFor(sourceName)),
      };
      expect(
        (
          await claimBrowserCallAs(
            harness,
            fork.id,
            call.toolCallId,
            claimant,
            context,
          )
        ).status,
      ).toBe("not-issued");

      // The fork's context: the inherited tool call has no result.
      const forkContext = await fork.context(context);
      const forkRoles = forkContext.messages.map(({ role }) => role);

      // Bob's own turn on the fork: it runs on its own, while the source still waits.
      const forkTurn = await fork.submit(
        {
          type: "input",
          content: "Bob's question about the net.",
          requestId: "bob-1",
        },
        context,
      );
      const forkSettled = await forkTurn.wait(context);
      const forkAfter = await allEntries(fork);
      const forkOwn = forkAfter.filter(({ id }) => id > forkAt);
      expect(forkOwn.length).toBeGreaterThan(0);
      expect(
        forkOwn.every(({ conversationId }) => conversationId === fork.id),
      ).toBe(true);
      const forkContextAfter = await fork.context(context);

      // The source's call is still pending, and still its own browser's to finish.
      expect(
        (await harness.snapshot(BrowserCallsDoc, source.id, context))?.calls[
          call.toolCallId
        ]?.status,
      ).toBe("pending");
      const claimed = await claimBrowserCallAs(
        harness,
        source.id,
        call.toolCallId,
        { ...claimant, claimant: "tab-alice" },
        context,
      );
      if (claimed.status !== "claimed") throw new Error(claimed.status);
      const proof = {
        capability: claimed.claim.capability,
        binding: claimed.claim.binding,
      };
      expect(
        await startBrowserCall(
          harness,
          source.id,
          call.toolCallId,
          proof,
          context,
        ),
      ).toBe("started");
      expect(
        await finishBrowserCall(
          harness,
          {
            conversationId: source.id,
            ...proof,
            toolCallId: call.toolCallId,
            toolName: claimed.claim.toolName,
            canonicalInput: claimed.claim.input as JsonObject,
            output: {
              title: "Fork net",
              definition: {
                places: [],
                transitions: [],
                types: [],
                parameters: [],
                differentialEquations: [],
              },
            },
            metadata: { documentRevision: { before: "revision-1" } },
          },
          context,
        ),
      ).toBe("settled");
      const sourceSettled = await turn.wait(context);

      // The source: none of the fork's entries, its own history intact.
      const sourceAfter = await allEntries(source);
      expect(
        sourceAfter.some(({ conversationId }) => conversationId === fork.id),
      ).toBe(false);
      expect(
        sourceAfter.slice(0, sourceBefore.length).map(({ id }) => id),
      ).toEqual(sourceBefore.map(({ id }) => id));
      // Diverged: after the fork point the two share no entry.
      const sourceOwnAfterFork = new Set(
        sourceAfter.filter(({ id }) => id > forkAt).map(({ id }) => id),
      );
      expect(forkOwn.some(({ id }) => sourceOwnAfterFork.has(id))).toBe(false);
      // The fork's documents stayed its own while the source finished its call.
      expect(
        Object.keys(
          (await harness.snapshot(BrowserCallsDoc, fork.id, context))?.calls ??
            {},
        ),
      ).toEqual([]);
      expect(await ledger(fork.id)).toEqual(["ledger-before-fork"]);

      // Evidence for the findings doc.
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            storage: storageCase.name,
            forkAt,
            sourceEntriesBefore: sourceBefore.map(({ id, kind }) => [id, kind]),
            forkEntriesAtCreation: forkEntries.map(({ id, kind }) => [
              id,
              kind,
            ]),
            forkContextRolesBeforeTurn: forkRoles,
            forkContextRolesAfterTurn: forkContextAfter.messages.map(
              ({ role }) => role,
            ),
            forkToolResultText: forkContextAfter.messages
              .filter(({ role }) => role === "toolResult")
              .map((message) =>
                message.role === "toolResult"
                  ? message.content
                      .flatMap((part) =>
                        part.type === "text" ? [part.text] : [],
                      )
                      .join("")
                  : "",
              ),
            forkOwnEntries: forkOwn.map(({ id, kind }) => [id, kind]),
            forkSettled: forkSettled.status,
            sourceSettled: sourceSettled.status,
            sourceEntriesAfter: sourceAfter.map(({ id, kind }) => [id, kind]),
          },
          null,
          1,
        ),
      );
    } finally {
      await harness.close(context);
    }
  }, 60_000);
});
