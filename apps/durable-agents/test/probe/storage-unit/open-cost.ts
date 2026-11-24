/**
 * Storage-unit open-cost probe (obligation 4): what it costs to open one
 * Harness holding N stored conversations, short histories each, with or
 * without A conversations active (a browser call waiting), against opening
 * one single-conversation Harness as today.
 *
 * Usage, from `apps/durable-agents`:
 *
 *   yarn tsx test/probe/storage-unit/open-cost.ts [--n 100,1000,5000] [--active 0,16]
 *
 * For each (N, A) it seeds a schema in this process (N conversations, one
 * answered turn each; A of them then start a turn whose net read waits for a
 * browser that never comes), closes it, and measures in a fresh child
 * process (`--expose-gc`): `openPostgresStorage` + `Harness.open`,
 * `resume()`, the scheduler's first pass (until every waiting call's tasks
 * are back to waiting), memory after a GC, and a first read and a first turn
 * on an idle conversation. Then it drops the schema.
 */
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { type ConversationId, defineDoc } from "@earendil-works/pi-durable";
import { Pool } from "pg";

import { BrowserCallsDoc } from "../../../src/browser-call/browser-call";
import { createRequestSlots } from "../../../src/server/durable-agents-server/request-slots";
import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../../src/storage/postgres/postgres-storage";
import { loadModelStep } from "../../load/probe/workload";
import { scriptedModel } from "../../scripted-model";
import { boundConversation, context, openAgentHarness } from "./agent-harness";

const script = fileURLToPath(import.meta.url);
const print = (line: string) => process.stdout.write(`${line}\n`);
const round = (value: number) => Math.round(value * 10) / 10;
const mib = (bytes: number) => round(bytes / 2 ** 20);

const IdsDoc = defineDoc<{ ids: number[]; active: number[] }>({
  kind: "probe.ids",
  version: 1,
  scope: "session",
  initial: () => ({ ids: [], active: [] }),
  checkpointWhen: () => false,
});

const models = () => {
  const step = loadModelStep({ onCall: () => () => {}, latencyMs: () => 0 });
  return scriptedModel(Array.from({ length: 50_000 }, () => step));
};

const until = async (check: () => Promise<boolean>, timeoutMs: number) => {
  const started = performance.now();
  // Each check follows the one before.
  // eslint-disable-next-line no-await-in-loop
  while (!(await check())) {
    if (performance.now() - started > timeoutMs) return false;
    // eslint-disable-next-line no-await-in-loop
    await sleep(5);
  }
  return true;
};

/** Seed `schema` with `n` idle conversations and `active` more with a waiting browser call. */
const seed = async (pool: Pool, schema: string, n: number, active: number) => {
  const { models: seededModels, model } = models();
  const { harness, agent } = await openAgentHarness({
    storage: await openPostgresStorage({ pool, schema }),
    models: seededModels,
    model,
    slots: createRequestSlots(64),
  });
  harness.resume();
  const started = performance.now();
  const chunk = 200;
  for (let from = 0; from < n + active; from += chunk) {
    // Chunks one after another, each chunk's conversations at once.
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      Array.from(
        { length: Math.min(chunk, n + active - from) },
        async (_, offset) => {
          const index = from + offset;
          const isActive = index >= n;
          const name = `c${index}`;
          const conversation = await harness.createConversation(
            boundConversation(agent, name, async (tx, id) => {
              const ids = await tx.doc(IdsDoc);
              (isActive ? ids.active : ids.ids).push(id);
            }),
            context,
          );
          const answered = await conversation.submit(
            {
              type: "input",
              content: `Hello from ${name}.`,
              requestId: "seed",
            },
            context,
          );
          await answered.wait(context);
          if (isActive) {
            await conversation.submit(
              {
                type: "input",
                content: `[load ${name} turn=1 calls=0] Read the net.`,
                requestId: "active",
              },
              context,
            );
            await until(
              async () =>
                Object.keys(
                  (
                    await harness.snapshot(
                      BrowserCallsDoc,
                      conversation.id,
                      context,
                    )
                  )?.calls ?? {},
                ).length > 0,
              30_000,
            );
          }
        },
      ),
    );
  }
  const seedMs = performance.now() - started;
  await harness.close(context);
  const { rows } = await pool.query<{ bytes: string }>(
    `SELECT coalesce(sum(pg_total_relation_size(c.oid)), 0) AS bytes
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r'`,
    [schema],
  );
  return { seedMs, schemaBytes: Number(rows[0]?.bytes ?? 0) };
};

type Measured = Record<string, number | string | boolean>;

/** In a fresh process: open the seeded schema and measure. */
const measure = async (schema: string, gcs: () => void): Promise<Measured> => {
  gcs();
  const rssBase = process.memoryUsage().rss;
  const heapBase = process.memoryUsage().heapUsed;
  const pool = new Pool({ ...postgresConfigFromEnvironment(), max: 8 });
  const { models: openModels, model } = models();
  const openStarted = performance.now();
  const storage = await openPostgresStorage({ pool, schema });
  const storageMs = performance.now() - openStarted;
  const { harness } = await openAgentHarness({
    storage,
    models: openModels,
    model,
    slots: createRequestSlots(64),
  });
  const openMs = performance.now() - openStarted;
  gcs();
  const heapAfterOpen = process.memoryUsage().heapUsed;
  const inspected = await harness.inspect(context);
  const liveTasks = inspected.tasks.length;
  const resumeStarted = performance.now();
  harness.resume();
  const resumeCallMs = performance.now() - resumeStarted;
  // The first scheduling pass: no live task left pending (a waiting call's tool task runs, holding its wait).
  const settled = await until(async () => {
    const { tasks } = await harness.inspect(context);
    return tasks.every(({ state }) => state.kind !== "pending");
  }, 60_000);
  const resumeSettledMs = performance.now() - resumeStarted;
  gcs();
  const heapAfterResume = process.memoryUsage().heapUsed;
  const rssAfterResume = process.memoryUsage().rss;

  const ids = (await harness.snapshot(IdsDoc, context))?.ids ?? [];
  const idle = ids[Math.floor(ids.length / 2)] as ConversationId | undefined;
  let firstReadMs = Number.NaN;
  let firstTurnMs = Number.NaN;
  if (idle !== undefined) {
    const readStarted = performance.now();
    const conversation = await harness.conversation(idle, context);
    await conversation?.entries({}, 50, undefined, context);
    firstReadMs = performance.now() - readStarted;
    const turnStarted = performance.now();
    const submission = await conversation?.submit(
      {
        type: "input",
        content: "Once more.",
        requestId: `measure-${randomUUID()}`,
      },
      context,
    );
    await submission?.wait(context);
    firstTurnMs = performance.now() - turnStarted;
  }
  await harness.close(context);
  await pool.end();
  return {
    liveTasks,
    storageOpenMs: round(storageMs),
    harnessOpenMs: round(openMs),
    resumeCallMs: round(resumeCallMs),
    resumeSettled: settled,
    resumeSettledMs: round(resumeSettledMs),
    heapBaseMiB: mib(heapBase),
    heapAfterOpenMiB: mib(heapAfterOpen),
    heapAfterResumeMiB: mib(heapAfterResume),
    rssBaseMiB: mib(rssBase),
    rssAfterResumeMiB: mib(rssAfterResume),
    idleFirstReadMs: round(firstReadMs),
    idleFirstTurnMs: round(firstTurnMs),
  };
};

const measureInChild = (schema: string) =>
  new Promise<Measured>((resolve, reject) => {
    const child = fork(script, ["measure", schema], {
      execArgv: [...process.execArgv, "--expose-gc"],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    child.on("message", (message) => resolve(message as Measured));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`measure exited ${code}`));
    });
  });

const argument = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const main = async () => {
  if (process.argv[2] === "measure") {
    const gc = (globalThis as { gc?: () => void }).gc;
    const result = await measure(process.argv[3] ?? "", () => gc?.());
    process.send?.(result);
    process.disconnect();
    return;
  }
  const ns = (argument("n") ?? "100,1000,5000").split(",").map(Number);
  const actives = (argument("active") ?? "0,16").split(",").map(Number);
  const pool = new Pool({ ...postgresConfigFromEnvironment(), max: 8 });
  const runId = randomUUID().replaceAll("-", "").slice(0, 8);
  try {
    // Today's unit: one conversation's own schema, opened five times, each in a fresh process.
    const single = `durable_unitprobe_${runId}_single`;
    await seed(pool, single, 1, 0);
    const singles: Measured[] = [];
    for (let i = 0; i < 5; i++)
      // eslint-disable-next-line no-await-in-loop
      singles.push(await measureInChild(single));
    await pool.query(`DROP SCHEMA IF EXISTS "${single}" CASCADE`);
    print(`@@result ${JSON.stringify({ n: 1, active: 0, runs: singles })}`);

    for (const n of ns)
      for (const active of actives) {
        const schema = `durable_unitprobe_${runId}_n${n}_a${active}`;
        try {
          // eslint-disable-next-line no-await-in-loop
          const seeded = await seed(pool, schema, n, active);
          // Two measurements: the first warms Postgres's caches.
          // eslint-disable-next-line no-await-in-loop
          const first = await measureInChild(schema);
          // eslint-disable-next-line no-await-in-loop
          const second = await measureInChild(schema);
          print(
            `@@result ${JSON.stringify({
              n,
              active,
              seedMs: round(seeded.seedMs),
              schemaMiB: mib(seeded.schemaBytes),
              runs: [first, second],
            })}`,
          );
        } finally {
          // eslint-disable-next-line no-await-in-loop
          await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        }
      }
  } finally {
    const { rows } = await pool.query<{ nspname: string }>(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE $1",
      [`durable_unitprobe_${runId}%`],
    );
    for (const { nspname } of rows)
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
    await pool.end();
  }
};

await main();
