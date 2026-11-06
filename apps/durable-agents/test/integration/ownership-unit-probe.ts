/**
 * Probe: the ownership unit for durable Brunch conversations on Postgres (OD4, A3). Many conversations in one schema
 * behind one Harness, or one schema, storage and Harness per conversation, or a middle point.
 *
 * Layouts, each holding `conversationCount` existing conversations:
 * - A: one schema of all of them, one Harness.
 * - B: a schema each, each with its own Harness and storage; measured twice, with a `pg` pool per storage (as
 *   `openPostgresStorage` builds by default) and with one pool shared by every storage.
 * - C: `groupCount` schemas of `conversationCount / groupCount` conversations each.
 *
 * For each: the time to create the schemas and conversations, the time to cold-open a Harness on an existing schema,
 * and `turnCount` concurrent scripted turns on as many conversations (input, one `ledger_commit` call, an answer):
 * wall time, turn and storage-commit latency, peak connections, and errors. A last check opens every B schema at
 * once, to see whether a pool per storage fits the server's `max_connections`; it stops short of exhausting it,
 * because other work shares the database.
 *
 * Usage: `turbo run probe:ownership-unit --filter @apps/durable-agents`, with the compose Postgres up. No model is
 * called; it takes a minute or two. Every schema it creates starts with `pi_durable_own_<run>_` and is dropped at the
 * end; the counts of such schemas before and after are printed.
 */
/* oxlint-disable eslint/no-await-in-loop -- Setup and the capacity check open schemas in bounded batches on purpose. */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  fauxAssistantMessage,
  type FauxResponseFactory,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { type ConversationId, type Harness } from "@earendil-works/pi-durable";
import { Pool, type PoolConfig } from "pg";

import { brunchTools } from "@hashintel/brunch-agent";

import { openHarness } from "../../src/harness";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import {
  openPostgresStorage,
  type PostgresStorage,
} from "../../src/storage/postgres/postgres-storage";
import { print } from "../browser-call/proof/server-process";
import { scriptedModel } from "../scripted-model";

const context = BACKGROUND_CONTEXT;
const conversationCount = 500;
const groupCount = 10;
const turnCount = 30;
const setupConcurrency = 10;
const turnTimeoutMs = 60_000;
/** Connections the capacity check leaves free for other work on the database. */
const connectionHeadroom = 15;

const runId = randomUUID().replaceAll("-", "").slice(0, 8);
const schemaPrefix = `pi_durable_own_${runId}_`;
const applicationName = `ownership-probe-${runId}`;
const baseConfig = postgresConfigFromEnvironment();
const poolConfig: PoolConfig = {
  ...baseConfig,
  application_name: applicationName,
};

type PoolMode = "private" | "shared";

type Layout = {
  readonly key: string;
  readonly label: string;
  readonly schemas: readonly string[];
  readonly perSchema: number;
};

type Samples = { values: number[] | undefined };

const elapsed = (start: number) => performance.now() - start;

const percentile = (values: readonly number[], fraction: number) => {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  ]!;
};

const ms = (value: number) =>
  Number.isNaN(value) ? "n/a" : `${value.toFixed(value < 10 ? 1 : 0)} ms`;

const table = (rows: readonly (readonly [string, string])[]) => {
  const width = Math.max(...rows.map(([name]) => name.length));
  for (const [name, value] of rows) {
    print(`  ${name.padEnd(width)}  ${value}`);
  }
};

const ledgerArgs = {
  entries: [
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
};

/** One model step for any conversation: a `ledger_commit` call, or the answer once its result is in. */
const respond: FauxResponseFactory = (transcript) =>
  transcript.messages.at(-1)?.role === "toolResult"
    ? fauxAssistantMessage("Recorded the dryer.")
    : fauxAssistantMessage(
        fauxToolCall(brunchTools.ledgerCommit, ledgerArgs, {
          id: `call-${randomUUID()}`,
        }),
        { stopReason: "toolUse" },
      );

const modelsFor = (turns: number) =>
  scriptedModel(Array.from({ length: turns * 2 }, () => respond));

/** A Harness on `schema` whose storage commits' latencies land in `samples` while it collects. */
const open = async (
  schema: string,
  pool: Pool | PoolConfig,
  turns: number,
  samples: Samples = { values: undefined },
) => {
  const storage = await openPostgresStorage({ pool, schema });
  const commit = storage.commit.bind(storage);
  storage.commit = async (...args: Parameters<PostgresStorage["commit"]>) => {
    const start = performance.now();
    try {
      return await commit(...args);
    } finally {
      samples.values?.push(elapsed(start));
    }
  };
  return openHarness(storage, { models: modelsFor(turns).models }, context);
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/** Peak connections this probe holds (open, and not idle), and the database's total, while it runs. */
const sampleConnections = (monitor: Pool) => {
  const peak = { open: 0, busy: 0, database: 0 };
  const state = { running: true };
  const loop = (async () => {
    while (state.running) {
      const row = (
        await monitor.query<{ open: string; busy: string; database: string }>(
          `SELECT count(*) FILTER (WHERE application_name = $1) AS open,
                  count(*) FILTER (WHERE application_name = $1 AND state <> 'idle') AS busy,
                  count(*) AS database
             FROM pg_stat_activity WHERE datname = current_database()`,
          [applicationName],
        )
      ).rows[0];
      if (row !== undefined) {
        peak.open = Math.max(peak.open, Number(row.open));
        peak.busy = Math.max(peak.busy, Number(row.busy));
        peak.database = Math.max(peak.database, Number(row.database));
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  })();
  return async () => {
    state.running = false;
    await loop;
    return peak;
  };
};

const inBatches = async <T, R>(
  items: readonly T[],
  size: number,
  run: (item: T, index: number) => Promise<R>,
) => {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(
      ...(await Promise.all(
        items
          .slice(start, start + size)
          .map((item, offset) => run(item, start + offset)),
      )),
    );
  }
  return results;
};

/** Create every schema of `layout` with its conversations; returns each schema's conversation IDs. */
const setUp = async (layout: Layout, monitor: Pool) => {
  const stop = sampleConnections(monitor);
  const start = performance.now();
  const { model } = modelsFor(0);
  const ids = await inBatches(
    layout.schemas,
    setupConcurrency,
    async (schema) => {
      const harness = await open(schema, poolConfig, 0);
      try {
        return await Promise.all(
          Array.from({ length: layout.perSchema }, async () => {
            const conversation = await harness.createConversation(
              { ownership: { kind: "ownerless" }, agent: { model } },
              context,
            );
            return conversation.id;
          }),
        );
      } finally {
        await harness.close(context);
      }
    },
  );
  const wall = elapsed(start);
  return { ids, wall, peak: await stop() };
};

/** Median time to open a Harness on an existing schema and get one conversation handle, over `schemas`. */
const coldOpen = async (
  schemas: readonly string[],
  firstIds: readonly ConversationId[],
  pool: Pool | PoolConfig,
) => {
  const opens: number[] = [];
  const firstReads: number[] = [];
  for (const [index, schema] of schemas.entries()) {
    const start = performance.now();
    const harness = await open(schema, pool, 0);
    opens.push(elapsed(start));
    const readStart = performance.now();
    await harness.conversation(firstIds[index]!, context);
    firstReads.push(elapsed(readStart));
    await harness.close(context);
  }
  return {
    open: percentile(opens, 0.5),
    firstRead: percentile(firstReads, 0.5),
  };
};

/** `turnCount` concurrent turns, spread over `targets`' schemas. */
const runTurns = async (
  targets: readonly {
    readonly schema: string;
    readonly conversations: readonly ConversationId[];
  }[],
  pool: Pool | PoolConfig,
  monitor: Pool,
) => {
  const commits: Samples = { values: undefined };
  const openStart = performance.now();
  const harnesses = await Promise.all(
    targets.map(async ({ schema, conversations }) => ({
      harness: await open(schema, pool, conversations.length, commits),
      conversations,
    })),
  );
  const openWall = elapsed(openStart);
  const turnLatencies: number[] = [];
  const errors: string[] = [];
  const commitLatencies: number[] = [];
  commits.values = commitLatencies;
  const stop = sampleConnections(monitor);
  const start = performance.now();
  await Promise.all(
    harnesses.flatMap(({ harness, conversations }) =>
      conversations.map(async (id) => {
        const turnStart = performance.now();
        try {
          const conversation = await harness.conversation(id, context);
          if (conversation === undefined) {
            throw new Error(`conversation ${id} is missing`);
          }
          const submission = await conversation.submit(
            { type: "input", content: "We have one dryer." },
            context,
          );
          const settled = await withTimeout(
            submission.wait(context),
            turnTimeoutMs,
          );
          if (settled.status !== "done") {
            throw new Error(`turn settled ${settled.status}`);
          }
          turnLatencies.push(elapsed(turnStart));
          const kinds = (
            await conversation.entries(
              { order: "ascending" },
              100,
              undefined,
              context,
            )
          ).items
            .filter(({ kind }) => kind !== "pi.system")
            .map(({ kind }) => kind);
          if (
            kinds.join(",") !==
            "pi.user,pi.assistant,pi.tool-result,pi.assistant"
          ) {
            throw new Error(`unexpected transcript ${kinds.join(",")}`);
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }),
    ),
  );
  const wall = elapsed(start);
  const peak = await stop();
  commits.values = undefined;
  await Promise.all(harnesses.map(({ harness }) => harness.close(context)));
  return { openWall, wall, turnLatencies, commitLatencies, errors, peak };
};

const report = (
  label: string,
  setup: Awaited<ReturnType<typeof setUp>> | undefined,
  cold: Awaited<ReturnType<typeof coldOpen>>,
  turns: Awaited<ReturnType<typeof runTurns>>,
  harnessCount: number,
) => {
  print(`\n${label}`);
  table([
    ...(setup === undefined
      ? []
      : ([
          [
            "setup: create all",
            `${ms(setup.wall)} (${ms(setup.wall / conversationCount)} per conversation)`,
          ],
          [
            "setup: peak connections",
            `${setup.peak.open} open, ${setup.peak.busy} busy`,
          ],
        ] as const)),
    ["cold open: Harness.open", ms(cold.open)],
    ["cold open: first conversation()", ms(cold.firstRead)],
    [`turns: open ${harnessCount} Harness(es)`, ms(turns.openWall)],
    [`turns: ${turnCount} concurrent, wall`, ms(turns.wall)],
    [
      "turns: latency p50 / p95",
      `${ms(percentile(turns.turnLatencies, 0.5))} / ${ms(percentile(turns.turnLatencies, 0.95))}`,
    ],
    [
      `commits: ${turns.commitLatencies.length}, latency p50 / p95`,
      `${ms(percentile(turns.commitLatencies, 0.5))} / ${ms(percentile(turns.commitLatencies, 0.95))}`,
    ],
    [
      "turns: peak connections",
      `${turns.peak.open} open, ${turns.peak.busy} busy (database total ${turns.peak.database})`,
    ],
    [
      "turns: errors",
      turns.errors.length === 0
        ? "none"
        : `${turns.errors.length}: ${[...new Set(turns.errors)].join("; ")}`,
    ],
  ]);
};

/** Open every schema at once and keep it open, stopping before the database runs out of connections. */
const capacity = async (
  schemas: readonly string[],
  pool: Pool | PoolConfig,
  monitor: Pool,
  maxConnections: number,
) => {
  const harnesses: Harness[] = [];
  const memoryBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  let stoppedAt: string | undefined;
  try {
    for (let index = 0; index < schemas.length; index += setupConcurrency) {
      const total = Number(
        (
          await monitor.query<{ total: string }>(
            "SELECT count(*) AS total FROM pg_stat_activity",
          )
        ).rows[0]?.total,
      );
      if (total + setupConcurrency * 2 > maxConnections - connectionHeadroom) {
        stoppedAt = `stopped at ${harnesses.length} open: ${total} of ${maxConnections} server connections in use`;
        break;
      }
      harnesses.push(
        ...(await Promise.all(
          schemas
            .slice(index, index + setupConcurrency)
            .map((schema) => open(schema, pool, 0)),
        )),
      );
    }
  } catch (error) {
    stoppedAt = `failed at ${harnesses.length} open: ${error instanceof Error ? error.message : String(error)}`;
  }
  const wall = elapsed(start);
  const heapMb = (process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024;
  const held = Number(
    (
      await monitor.query<{ open: string }>(
        "SELECT count(*) AS open FROM pg_stat_activity WHERE application_name = $1",
        [applicationName],
      )
    ).rows[0]?.open,
  );
  await Promise.all(harnesses.map((harness) => harness.close(context)));
  return { opened: harnesses.length, wall, heapMb, held, stoppedAt };
};

const countProbeSchemas = async (admin: Pool) => {
  const row = (
    await admin.query<{ mine: string; probes: string; total: string }>(
      `SELECT count(*) FILTER (WHERE nspname LIKE $1) AS mine,
              count(*) FILTER (WHERE nspname LIKE 'pi\\_durable\\_%') AS probes,
              count(*) AS total
         FROM pg_namespace`,
      [`${schemaPrefix.replaceAll("_", "\\_")}%`],
    )
  ).rows[0];
  return `${row?.mine} of this run, ${row?.probes} pi_durable_*, ${row?.total} in all`;
};

const main = async () => {
  const admin = new Pool({
    ...baseConfig,
    application_name: `${applicationName}-admin`,
    max: 4,
  });
  const monitor = new Pool({
    ...baseConfig,
    application_name: `${applicationName}-monitor`,
    max: 1,
  });
  const shared = new Pool({ ...poolConfig, max: 10 });
  shared.on("error", () => {});
  const perGroup = conversationCount / groupCount;
  const layouts = {
    a: {
      key: "a",
      label: `A: one schema of ${conversationCount} conversations, one Harness`,
      schemas: [`${schemaPrefix}a`],
      perSchema: conversationCount,
    },
    b: {
      key: "b",
      label: `B: ${conversationCount} schemas of one conversation, a Harness each`,
      schemas: Array.from(
        { length: conversationCount },
        (_value, index) => `${schemaPrefix}b_${index}`,
      ),
      perSchema: 1,
    },
    c: {
      key: "c",
      label: `C: ${groupCount} schemas of ${perGroup} conversations, a Harness each`,
      schemas: Array.from(
        { length: groupCount },
        (_value, index) => `${schemaPrefix}c_${index}`,
      ),
      perSchema: perGroup,
    },
  } satisfies Record<string, Layout>;
  try {
    const maxConnections = Number(
      (await admin.query<{ max_connections: string }>("SHOW max_connections"))
        .rows[0]?.max_connections,
    );
    print(`Run ${runId}. max_connections = ${maxConnections}`);
    print(`Probe schemas before: ${await countProbeSchemas(admin)}`);
    print(
      `Default pg pool size 10 per storage; shared pool size 10. Setup opens ${setupConcurrency} schemas at a time.`,
    );

    // A: one schema, one Harness; turns on its first `turnCount` conversations.
    const setupA = await setUp(layouts.a, monitor);
    const idsA = setupA.ids[0]!;
    const coldA = await coldOpen(
      [layouts.a.schemas[0]!, layouts.a.schemas[0]!, layouts.a.schemas[0]!],
      [idsA[0]!, idsA[1]!, idsA[2]!],
      poolConfig,
    );
    const turnsA = await runTurns(
      [
        {
          schema: layouts.a.schemas[0]!,
          conversations: idsA.slice(0, turnCount),
        },
      ],
      poolConfig,
      monitor,
    );
    report(layouts.a.label, setupA, coldA, turnsA, 1);

    // B: a schema each; pool per storage on schemas 0–29, one shared pool on 30–59.
    const setupB = await setUp(layouts.b, monitor);
    const firstIdsB = setupB.ids.map((ids) => ids[0]!);
    const targetsB = (offset: number) =>
      layouts.b.schemas
        .slice(offset, offset + turnCount)
        .map((schema, index) => ({
          schema,
          conversations: [firstIdsB[offset + index]!],
        }));
    const coldSchemas = layouts.b.schemas.slice(-3);
    const coldIds = firstIdsB.slice(-3);
    for (const mode of ["private", "shared"] as const satisfies PoolMode[]) {
      const pool = mode === "private" ? poolConfig : shared;
      const cold = await coldOpen(coldSchemas, coldIds, pool);
      const turns = await runTurns(
        targetsB(mode === "private" ? 0 : turnCount),
        pool,
        monitor,
      );
      report(
        `${layouts.b.label}, ${mode === "private" ? "a pg pool per storage" : "one shared pg pool of 10"}`,
        mode === "private" ? setupB : undefined,
        cold,
        turns,
        turnCount,
      );
    }

    // C: groups; `turnCount / groupCount` turns in each group.
    const setupC = await setUp(layouts.c, monitor);
    const coldC = await coldOpen(
      layouts.c.schemas.slice(0, 3),
      setupC.ids.slice(0, 3).map((ids) => ids[0]!),
      poolConfig,
    );
    const turnsC = await runTurns(
      layouts.c.schemas.map((schema, index) => ({
        schema,
        conversations: setupC.ids[index]!.slice(0, turnCount / groupCount),
      })),
      poolConfig,
      monitor,
    );
    report(layouts.c.label, setupC, coldC, turnsC, groupCount);

    // B at full width: every schema open at once.
    print(`\nB: all ${conversationCount} schemas open at once`);
    for (const mode of ["private", "shared"] as const satisfies PoolMode[]) {
      const result = await capacity(
        layouts.b.schemas,
        mode === "private" ? poolConfig : shared,
        monitor,
        maxConnections,
      );
      table([
        [
          mode === "private"
            ? "a pg pool per storage"
            : "one shared pg pool of 10",
          `${result.opened} of ${conversationCount} opened in ${ms(result.wall)}; ${result.held} connections held after opening; heap change ${result.heapMb.toFixed(0)} MB (one GC-noisy sample)${result.stoppedAt === undefined ? "" : `; ${result.stoppedAt}`}`,
        ],
      ]);
    }
  } finally {
    await shared.end();
    const leftovers = (
      await admin.query<{ nspname: string }>(
        "SELECT nspname FROM pg_namespace WHERE nspname LIKE $1",
        [`${schemaPrefix.replaceAll("_", "\\_")}%`],
      )
    ).rows.map(({ nspname }) => nspname);
    await inBatches(leftovers, 4, (schema) =>
      admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`),
    );
    print(`\nDropped ${leftovers.length} schemas.`);
    print(`Probe schemas after: ${await countProbeSchemas(admin)}`);
    await Promise.all([admin.end(), monitor.end()]);
  }
};

await main();
