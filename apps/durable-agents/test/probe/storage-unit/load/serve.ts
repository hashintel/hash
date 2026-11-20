/**
 * The storage-unit load probe's server process: it owns the Harnesses, on
 * the compose Postgres, and serves the driver's users and browsers over IPC.
 *
 * - `web`: one Harness on one schema, every conversation created in it
 *   (`createConversation`), found again after a restart through a session
 *   document that maps names to conversation IDs.
 * - `conversation`: one Harness and schema per conversation, its root, as the
 *   successor runs today.
 *
 * Both share one pool and one request-slot limit, with the HASH agent's
 * extensions and the load workload's scripted model. It wraps
 * `PostgresStorage.prototype.commit` to time every storage commit.
 */
import { performance } from "node:perf_hooks";

import {
  type Conversation,
  type ConversationId,
  defineDoc,
  type EntryRecord,
  type Harness,
} from "@earendil-works/pi-durable";
import { Pool } from "pg";

import {
  bindBrowserDocument,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCallAs,
  finishBrowserCall,
  startBrowserCall,
} from "../../../../src/browser-call/browser-call";
import { createRequestSlots } from "../../../../src/server/durable-agents-server/request-slots";
import {
  isPoolConnectTimeout,
  postgresConfigFromEnvironment,
} from "../../../../src/storage/postgres/postgres-config";
import {
  openPostgresStorage,
  PostgresStorage,
} from "../../../../src/storage/postgres/postgres-storage";
import {
  answerText,
  loadModelStep,
  messageText,
  planOf,
} from "../../../load/probe/workload";
import { scriptedModel } from "../../../scripted-model";
import {
  type AgentHarness,
  bindingFor,
  boundConversation,
  context,
  openAgentHarness,
} from "../agent-harness";

import type {
  Event,
  Request,
  ServeConfig,
  ServerStats,
  TurnCount,
} from "./protocol";

/** Names to conversation IDs, in the web's one Harness. */
const DirectoryDoc = defineDoc<{ byName: Record<string, number> }>({
  kind: "probe.directory",
  version: 1,
  scope: "session",
  initial: () => ({ byName: {} }),
  checkpointWhen: () => false,
});

export const schemaPrefix = (runId: string) => `durable_unitprobe_${runId}`;

const send = (event: Event) => {
  process.send?.(event);
};

type Served = {
  readonly harness: Harness;
  readonly conversation: Conversation;
};

export const serve = async (config: ServeConfig) => {
  const commits: [number, number][] = [];
  const commitErrors: Record<string, number> = {};
  let poolTimeouts = 0;
  /* oxlint-disable typescript/unbound-method -- The original is called with its storage. */
  const commit = PostgresStorage.prototype.commit;
  /* oxlint-enable typescript/unbound-method */
  PostgresStorage.prototype.commit = async function timedCommit(
    this: PostgresStorage,
    ...args: Parameters<PostgresStorage["commit"]>
  ) {
    const started = performance.now();
    try {
      const result = await commit.apply(this, args);
      commits.push([performance.now() - started, args[0].length]);
      return result;
    } catch (error) {
      if (isPoolConnectTimeout(error)) poolTimeouts += 1;
      const message = (
        error instanceof Error ? error.message : String(error)
      ).replaceAll(/durable_unitprobe_\w+/gu, "<schema>");
      commitErrors[message] = (commitErrors[message] ?? 0) + 1;
      throw error;
    }
  };

  const step = loadModelStep({
    onCall: (name) => {
      send({ t: "model", name });
      return () => {};
    },
    latencyMs: () =>
      config.latencyMs[0] +
      Math.random() * (config.latencyMs[1] - config.latencyMs[0]),
  });
  const { models, model } = scriptedModel(
    Array.from({ length: 200_000 }, () => step),
  );
  const pool = new Pool({
    ...postgresConfigFromEnvironment(),
    max: config.poolMax,
    connectionTimeoutMillis: 10_000,
    application_name: `${schemaPrefix(config.runId)}-${process.pid}`,
  });
  pool.on("error", () => {});
  const slots = createRequestSlots(config.requestSlots);
  const prefix = schemaPrefix(config.runId);

  const openStarted = performance.now();
  const served = new Map<string, Served>();
  const harnesses: AgentHarness[] = [];
  if (config.mode === "web") {
    const opened = await openAgentHarness({
      storage: await openPostgresStorage({ pool, schema: `${prefix}_web` }),
      models,
      model,
      slots,
    });
    harnesses.push(opened);
    const { harness, agent } = opened;
    const directory =
      (await harness.snapshot(DirectoryDoc, context))?.byName ?? {};
    await Promise.all(
      config.names.map(async (name) => {
        const known = directory[name];
        const conversation =
          known === undefined
            ? await harness.createConversation(
                boundConversation(agent, name, async (tx, id) => {
                  const directoryDoc = await tx.doc(DirectoryDoc);
                  directoryDoc.byName[name] = id;
                }),
                context,
              )
            : await harness.conversation(known as ConversationId, context);
        if (conversation === undefined)
          throw new Error(`No conversation ${name}.`);
        served.set(name, { harness, conversation });
      }),
    );
  } else {
    await Promise.all(
      config.names.map(async (name, index) => {
        const opened = await openAgentHarness({
          storage: await openPostgresStorage({
            pool,
            schema: `${prefix}_c${index}`,
          }),
          models,
          model,
          slots,
        });
        harnesses.push(opened);
        const conversation = await opened.harness.root(context, {
          agent: opened.agent,
          init: (tx, id) => bindBrowserDocument(tx, id, bindingFor(name)),
        });
        served.set(name, { harness: opened.harness, conversation });
      }),
    );
  }
  const openMs = performance.now() - openStarted;

  // Tell the driver of every pending call, the ones already pending at open first.
  const announced = new Set<string>();
  const announce = (
    name: string,
    calls: Readonly<Record<string, { status: string; toolCallId: string }>>,
  ) => {
    for (const record of Object.values(calls)) {
      if (record.status !== "pending") continue;
      const key = `${name}/${record.toolCallId}`;
      if (announced.has(key)) continue;
      announced.add(key);
      send({ t: "call", name, callId: record.toolCallId });
    }
  };
  await Promise.all(
    [...served.entries()].map(async ([name, { harness, conversation }]) => {
      // Observing needs the document to exist: reading it in a commit creates it.
      await harness.commit(async (tx) => {
        await tx.doc(BrowserCallsDoc, conversation.id);
      }, context);
      const observation = await harness.observeDoc(
        BrowserCallsDoc,
        conversation.id,
        {
          advance: (call) => {
            if (call.kind === "value") announce(name, call.value.calls);
          },
          end: () => {},
        },
        context,
      );
      if (observation === undefined)
        throw new Error(`No browser calls document for ${name}.`);
      announce(name, observation.value.calls);
    }),
  );

  const resumeStarted = performance.now();
  for (const { harness } of harnesses) harness.resume();
  const resumeMs = performance.now() - resumeStarted;

  let peakPoolTotal = 0;
  let peakPoolWaiting = 0;
  const sampler = setInterval(() => {
    peakPoolTotal = Math.max(peakPoolTotal, pool.totalCount);
    peakPoolWaiting = Math.max(peakPoolWaiting, pool.waitingCount);
  }, 5);
  const report = () => {
    const cpu = process.cpuUsage();
    const memory = process.memoryUsage();
    const stats: ServerStats = {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      cpuMicros: cpu.user + cpu.system,
      poolTotal: pool.totalCount,
      poolWaiting: pool.waitingCount,
      peakPoolTotal,
      peakPoolWaiting,
      commits: commits.splice(0),
      commitErrors: { ...commitErrors },
      poolTimeouts,
    };
    send({ t: "stats", stats });
  };
  const reporter = setInterval(report, 200);

  send({
    t: "ready",
    openMs,
    resumeMs,
    rssBytes: process.memoryUsage().rss,
  });

  const target = (name: string) => {
    const found = served.get(name);
    if (found === undefined) throw new Error(`Unknown conversation ${name}.`);
    return found;
  };

  const entriesOf = async (conversation: Conversation) => {
    const entries: EntryRecord[] = [];
    let cursor: Parameters<Conversation["entries"]>[2];
    do {
      // Each page follows the one before.
      // eslint-disable-next-line no-await-in-loop
      const page = await conversation.entries(
        { order: "ascending" },
        200,
        cursor,
        context,
      );
      entries.push(...page.items);
      cursor = page.next;
    } while (cursor !== undefined);
    return entries;
  };

  /** Per turn of the conversation: its user messages, answers and tool results, from the stored entries. */
  const countTurns = async (conversation: Conversation): Promise<TurnCount> => {
    const users: Record<string, number> = {};
    const answers: Record<string, number> = {};
    const toolResults: Record<string, number> = {};
    let turn: string | undefined;
    let plan: ReturnType<typeof planOf>;
    for (const entry of await entriesOf(conversation))
      for (const message of entry.model ?? []) {
        if (message.role === "user") {
          const next = planOf(messageText(message));
          if (next === undefined) continue;
          plan = next;
          turn = String(next.turn);
          users[turn] = (users[turn] ?? 0) + 1;
        } else if (turn !== undefined && plan !== undefined) {
          if (message.role === "toolResult")
            toolResults[turn] = (toolResults[turn] ?? 0) + 1;
          else if (messageText(message) === answerText(plan))
            answers[turn] = (answers[turn] ?? 0) + 1;
        }
      }
    return { users, answers, toolResults };
  };

  const handle = async (request: Request): Promise<unknown> => {
    switch (request.op) {
      case "submit": {
        const { conversation } = target(request.name);
        const submission = await conversation.submit(
          {
            type: "input",
            content: request.text,
            requestId: request.requestId,
          },
          context,
        );
        return (await submission.wait(context)).status;
      }
      case "claim": {
        const { harness, conversation } = target(request.name);
        return claimBrowserCallAs(
          harness,
          conversation.id,
          request.callId,
          { claimant: request.claimant, binding: request.binding },
          context,
          Date.now,
        );
      }
      case "start": {
        const { harness, conversation } = target(request.name);
        return startBrowserCall(
          harness,
          conversation.id,
          request.callId,
          { capability: request.capability, binding: request.binding },
          context,
          Date.now,
        );
      }
      case "finish": {
        const { harness, conversation } = target(request.name);
        return finishBrowserCall(
          harness,
          {
            conversationId: conversation.id,
            capability: request.capability,
            binding: request.binding,
            toolCallId: request.callId,
            toolName: request.toolName,
            canonicalInput: request.canonicalInput,
            output: request.output,
            metadata: request.metadata,
          } as BrowserCallResult,
          context,
          Date.now,
        );
      }
      case "verify": {
        const counts: Record<string, TurnCount> = {};
        await Promise.all(
          [...served.entries()].map(async ([name, { conversation }]) => {
            counts[name] = await countTurns(conversation);
          }),
        );
        return counts;
      }
      case "close": {
        clearInterval(sampler);
        clearInterval(reporter);
        report();
        await Promise.all(
          harnesses.map(({ harness }) => harness.close(context)),
        );
        await pool.end();
        setImmediate(() => process.exit(0));
        return "closed";
      }
    }
  };

  process.on("message", (message) => {
    const request = message as Request;
    const started = performance.now();
    void handle(request).then(
      (value) =>
        send({
          t: "reply",
          rid: request.rid,
          ok: true,
          value,
          ms: performance.now() - started,
        }),
      (error: unknown) =>
        send({
          t: "reply",
          rid: request.rid,
          ok: false,
          value: error instanceof Error ? error.message : String(error),
          ms: performance.now() - started,
        }),
    );
  });
};
