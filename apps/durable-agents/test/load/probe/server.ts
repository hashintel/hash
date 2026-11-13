/**
 * One server process of the load probe: the real wiring
 * (`startDurableAgentsServer`, as `src/main.ts` runs it) on the compose
 * Postgres, on a free port, with the workload's scripted model and its
 * latency, and SIGTERM handled as `src/main.ts` handles it.
 *
 * It measures itself, without changing the server: the model step counts
 * the calls in flight; the pool says how many clients wait for a
 * connection; and `PostgresStorage`'s prototype is wrapped to count fence
 * failures (a commit refused because a later opener owns the schema),
 * ownership checks that find the schema moved (each makes the registry
 * reopen the conversation), and when each generation's request phase is
 * committed. The time from that commit to the model call is the request's
 * wait, the request slot's queue included.
 *
 * Reports, as `@@` lines: `listening` with its port, `stats` every
 * `statsIntervalMs` with what changed, then `stopped` once SIGTERM closed it.
 */
import { performance } from "node:perf_hooks";

import { Pool } from "pg";

import { conversationSchema } from "../../../src/server/conversation-storage";
import { startDurableAgentsServer } from "../../../src/server/start-durable-agents-server";
import { poolLimitsFromEnvironment } from "../../../src/server/start-durable-agents-server/limits-from-environment";
import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import { PostgresStorage } from "../../../src/storage/postgres/postgres-storage";
import { report } from "../../browser-call/proof/server-process";
import { scriptedModel } from "../../scripted-model";
import { loadModelStep } from "./workload";

import type { StorageWrite } from "@earendil-works/pi-durable";

export const statsIntervalMs = 100;

/** What a server process reports in each `stats` line: totals and peaks so far, and the waits since the last line. */
export type ServerStats = {
  readonly rssBytes: number;
  readonly modelCalls: number;
  readonly modelInFlight: number;
  readonly peakModelInFlight: number;
  /** Requests whose request phase is committed and whose model call has not started. */
  readonly peakRequestsWaiting: number;
  /** Model calls with no request-phase commit before them in this process: a resumed request. */
  readonly unmatchedModelCalls: number;
  /** Milliseconds from request-phase commit to model call, since the last report. */
  readonly newRequestWaitsMs: readonly number[];
  readonly poolTotal: number;
  readonly peakPoolTotal: number;
  readonly peakPoolWaiting: number;
  readonly fenceFailures: number;
  /** Ownership checks that found the schema owned elsewhere. */
  readonly ownershipLost: number;
  /** Conversations this process committed to: the ones it served, taken over ones included. */
  readonly conversationsWritten: number;
  /** Commit errors other than fence failures, by message. */
  readonly commitErrors: Readonly<Record<string, number>>;
};

/** The schema a storage writes, from its private table names. */
const schemaOf = (storage: PostgresStorage) => {
  const { tables } = storage as unknown as {
    readonly tables: { readonly durableMetadata: string };
  };
  return /^"([^"]+)"/u.exec(tables.durableMetadata)?.[1] ?? "?";
};

const fenceMessage = "is owned by a storage opened later";

/** A request-phase checkpoint of a generation task, as one write of a commit carries it. */
const requestPhaseOf = (write: StorageWrite) => {
  if (write.type !== "task" || write.value.kind !== "pi.generation")
    return undefined;
  const { state } = write.value;
  if (state.status !== "pending" && state.status !== "running")
    return undefined;
  const checkpoint = state.checkpoint as { phase?: unknown; attempt?: unknown };
  return checkpoint.phase === "request"
    ? `${String(write.value.id)}/${String(checkpoint.attempt)}`
    : undefined;
};

const createStats = () => {
  let modelCalls = 0;
  let modelInFlight = 0;
  let peakModelInFlight = 0;
  let peakRequestsWaiting = 0;
  let unmatchedModelCalls = 0;
  let newRequestWaitsMs: number[] = [];
  let fenceFailures = 0;
  let ownershipLost = 0;
  const written = new Set<string>();
  const commitErrors: Record<string, number> = {};
  /** Per schema, the newest request-phase commit not yet followed by its model call: one generation at a time. */
  const requested = new Map<string, number>();
  const seenRequests = new Set<string>();

  const requestCommitted = (schema: string, key: string) => {
    if (seenRequests.has(`${schema}/${key}`)) return;
    seenRequests.add(`${schema}/${key}`);
    requested.set(schema, performance.now());
    peakRequestsWaiting = Math.max(peakRequestsWaiting, requested.size);
  };

  const modelCall = (conversationId: string) => {
    const schema = conversationSchema(conversationId);
    const since = requested.get(schema);
    requested.delete(schema);
    if (since === undefined) unmatchedModelCalls += 1;
    else newRequestWaitsMs.push(performance.now() - since);
    modelCalls += 1;
    modelInFlight += 1;
    peakModelInFlight = Math.max(peakModelInFlight, modelInFlight);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      modelInFlight -= 1;
    };
  };

  const instrumentStorage = () => {
    // Prototype methods take `this`; the wrappers keep the originals' contract.
    /* oxlint-disable typescript/unbound-method -- Each original is called with its storage below. */
    const commit = PostgresStorage.prototype.commit;
    const isOwner = PostgresStorage.prototype.isOwner;
    /* oxlint-enable typescript/unbound-method */
    PostgresStorage.prototype.commit = async function commitObserved(
      this: PostgresStorage,
      ...args: Parameters<PostgresStorage["commit"]>
    ) {
      try {
        const result = await commit.apply(this, args);
        written.add(schemaOf(this));
        for (const batch of args[0])
          for (const write of batch) {
            const key = requestPhaseOf(write);
            if (key !== undefined) requestCommitted(schemaOf(this), key);
          }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(fenceMessage)) fenceFailures += 1;
        else {
          const kind = message.replaceAll(
            /durable_chat_[0-9a-f]+/gu,
            "<schema>",
          );
          commitErrors[kind] = (commitErrors[kind] ?? 0) + 1;
        }
        throw error;
      }
    };
    PostgresStorage.prototype.isOwner = async function isOwnerObserved(
      this: PostgresStorage,
    ) {
      const owner = await isOwner.apply(this);
      if (!owner) ownershipLost += 1;
      return owner;
    };
  };

  let peakPoolTotal = 0;
  let peakPoolWaiting = 0;
  const samplePool = (pool: Pool) => {
    peakPoolTotal = Math.max(peakPoolTotal, pool.totalCount);
    peakPoolWaiting = Math.max(peakPoolWaiting, pool.waitingCount);
  };

  const take = (pool: Pool): ServerStats => {
    samplePool(pool);
    const waits = newRequestWaitsMs;
    newRequestWaitsMs = [];
    return {
      rssBytes: process.memoryUsage().rss,
      modelCalls,
      modelInFlight,
      peakModelInFlight,
      peakRequestsWaiting,
      unmatchedModelCalls,
      newRequestWaitsMs: waits,
      poolTotal: pool.totalCount,
      peakPoolTotal,
      peakPoolWaiting,
      fenceFailures,
      ownershipLost,
      conversationsWritten: written.size,
      commitErrors: { ...commitErrors },
    };
  };

  return { instrumentStorage, modelCall, samplePool, take };
};

export type ServeOptions = {
  readonly applicationName: string;
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
};

export const serve = async ({
  applicationName,
  minLatencyMs,
  maxLatencyMs,
}: ServeOptions) => {
  const stats = createStats();
  stats.instrumentStorage();
  const step = loadModelStep({
    onCall: stats.modelCall,
    latencyMs: () =>
      minLatencyMs + Math.random() * (maxLatencyMs - minLatencyMs),
  });
  // One step per model request; far more than a scenario makes.
  const { models, model } = scriptedModel(
    Array.from({ length: 50_000 }, () => step),
  );
  // The pool's size and wait from the environment, as `src/main.ts` builds it.
  const pool = new Pool({
    ...postgresConfigFromEnvironment(),
    ...poolLimitsFromEnvironment(process.env),
    application_name: applicationName,
  });
  const server = await startDurableAgentsServer({
    port: 0,
    hostname: "127.0.0.1",
    pool,
    models,
    model,
  });
  report("listening", {
    port: server.port,
    pid: process.pid,
    rssBytes: process.memoryUsage().rss,
  });
  const poolSampler = setInterval(() => stats.samplePool(pool), 10);
  const reporter = setInterval(
    () => report("stats", stats.take(pool)),
    statsIntervalMs,
  );

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(poolSampler);
    clearInterval(reporter);
    report("stats", stats.take(pool));
    await server.close();
    await pool.end();
  };
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void stop().then(
        () => {
          report("stopped", { rssBytes: process.memoryUsage().rss });
          process.exit(0);
        },
        (error: unknown) => {
          process.stderr.write(`${String(error)}\n`);
          process.exit(1);
        },
      );
    });
  }
};
