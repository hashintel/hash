/**
 * Load probe of the durable agents server (the stack-independent part of
 * Gate 2): many concurrent conversations on two server instances sharing the
 * compose Postgres, steady and through a rolling restart.
 *
 * Usage: `turbo run probe:load --filter @apps/durable-agents`, with the
 * compose Postgres up. No model is called: each server process runs the
 * scripted workload model (`probe/workload.ts`) with 200–800 ms of latency
 * per response. It takes about a minute in all.
 *
 * Without arguments this is the driver; with `serve` it is a server process
 * (`probe/server.ts`), on the wiring `src/main.ts` runs. Each scenario:
 *
 * - starts servers A and B, each on its own free port, and a router that
 *   gives each conversation to one of them by a hash of its ID;
 * - runs 20 users with 3 conversations each, every conversation 3 turns of
 *   1–2 browser calls (claimed, started and answered by a scripted browser
 *   with think time) and an answer, through `DefaultChatTransport`;
 * - `sigterm` and `sigkill`: once a third of the turns are done, starts B′,
 *   remaps B's conversations to it, then signals B 100 ms later, while B is
 *   still mid-turn on many of them; clients reconnect with
 *   `reconnectToStream` when a stream drops, and retry failed requests;
 * - stops every server, reads every conversation back with a read-only
 *   Harness, prints its results and criteria, and drops its schemas.
 *
 * Exits non-zero when a required criterion fails: steady and SIGTERM, every
 * turn completes, with no duplicates and no stranded call; SIGKILL, no
 * duplicates, and every lost turn explained by what is stored.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { conversationSchema } from "../../src/server/conversation-storage";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { print } from "../browser-call/proof/server-process";
import {
  type ClientTurn,
  createErrorCounts,
  createRouter,
  runConversation,
  seededRandom,
  type Timing,
} from "./probe/client";
import { serve } from "./probe/server";
import { type LoadServer, spawnLoadServer } from "./probe/server-process";
import {
  readStoredConversation,
  type StoredConversation,
} from "./probe/stored";
import { browserCallsOf, type TurnPlan } from "./probe/workload";

const users = 20;
const conversationsPerUser = 3;
const turnsPerConversation = 3;
const latencyMs = [200, 800] as const;
const timing: Timing = {
  browserThinkMs: [100, 400],
  userThinkMs: [300, 1_200],
  turnTimeoutMs: 90_000,
};
/** Conversations start spread over this long, as users arrive. */
const arrivalSpreadMs = 2_000;
/** Between remapping B's conversations to B′ and signalling B: short, so B is still mid-turn on many of them. */
const drainMs = 100;
/** How long a SIGTERMed server may take to stop before it is killed. */
const stopTimeoutMs = 20_000;
const workloadSeed = 7;
const claimBeforeIssue =
  'POST /conversations/:id/browser-calls/:call 404 {"error":"not-issued"}';

type ScenarioName = "steady" | "sigterm" | "sigkill";
type Scenario = {
  readonly name: ScenarioName;
  readonly restartSignal?: NodeJS.Signals;
};

const scenarios: readonly Scenario[] = [
  { name: "steady" },
  { name: "sigterm", restartSignal: "SIGTERM" },
  { name: "sigkill", restartSignal: "SIGKILL" },
];

const poolConfig = postgresConfigFromEnvironment();
const script = fileURLToPath(import.meta.url);

const percentile = (values: readonly number[], fraction: number) => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[
      Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
    ] ?? Number.NaN
  );
};

const ms = (value: number) =>
  Number.isNaN(value) ? "n/a" : `${value.toFixed(value < 10 ? 1 : 0)} ms`;
const mib = (bytes: number | undefined) =>
  bytes === undefined ? "n/a" : `${(bytes / 2 ** 20).toFixed(0)} MiB`;

const table = (rows: readonly (readonly [string, string])[]) => {
  const width = Math.max(...rows.map(([name]) => name.length));
  for (const [name, value] of rows) print(`  ${name.padEnd(width)}  ${value}`);
};

/** The same plans every scenario: per conversation, each turn's browser calls. */
const workload = (runId: string) => {
  const random = seededRandom(workloadSeed);
  return Array.from({ length: users * conversationsPerUser }, (_, index) => {
    const conversationId = `load-${runId}-u${Math.floor(index / conversationsPerUser)}-c${index % conversationsPerUser}`;
    const plans: TurnPlan[] = Array.from(
      { length: turnsPerConversation },
      (_unused, turn) => ({
        conversationId,
        turn: turn + 1,
        calls: random() < 0.5 ? 1 : 2,
      }),
    );
    return { conversationId, plans, seed: workloadSeed * 1_000 + index };
  });
};

/** Peak Postgres connections of this run's server processes, by `application_name`, sampled until stopped. */
const sampleConnections = (monitor: Pool, prefix: string) => {
  const peak = { total: 0, byProcess: new Map<string, number>() };
  const state = { running: true };
  const loop = (async () => {
    while (state.running) {
      try {
        // Each sample follows the one before.
        // eslint-disable-next-line no-await-in-loop
        const { rows } = await monitor.query<{
          application_name: string;
          connections: string;
        }>(
          `SELECT application_name, count(*) AS connections FROM pg_stat_activity
            WHERE application_name LIKE $1 GROUP BY application_name`,
          [`${prefix}%`],
        );
        let total = 0;
        for (const row of rows) {
          const count = Number(row.connections);
          total += count;
          peak.byProcess.set(
            row.application_name,
            Math.max(peak.byProcess.get(row.application_name) ?? 0, count),
          );
        }
        peak.total = Math.max(peak.total, total);
      } catch {
        // A missed sample only lowers the peak's resolution.
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(50);
    }
  })();
  return async () => {
    state.running = false;
    await loop;
    return peak;
  };
};

/** SIGTERM `server`, falling back to SIGKILL after `stopTimeoutMs`; how it ended. */
const stopServer = async (server: LoadServer, signal: NodeJS.Signals) => {
  const started = performance.now();
  server.kill(signal);
  const ended = await Promise.race([
    server.exited,
    sleep(stopTimeoutMs).then(() => undefined),
  ]);
  if (ended === undefined) {
    server.kill("SIGKILL");
    const killed = await server.exited;
    return { ...killed, timedOut: true, stopMs: performance.now() - started };
  }
  return { ...ended, timedOut: false, stopMs: performance.now() - started };
};

type Criterion = { readonly criterion: string; readonly pass: boolean };

const runScenario = async (scenario: Scenario) => {
  const runId = randomUUID().replaceAll("-", "").slice(0, 8);
  const prefix = `durable-agents-load-${runId}`;
  const conversations = workload(runId);
  const schemas = conversations.map(({ conversationId }) =>
    conversationSchema(conversationId),
  );
  const totalTurns = conversations.length * turnsPerConversation;
  const admin = new Pool({
    ...poolConfig,
    max: 4,
    application_name: `durable-agents-load-driver-${runId}`,
  });
  const servers: LoadServer[] = [];
  const stops: { label: string; how: string }[] = [];
  const router = createRouter();
  const errors = createErrorCounts();

  print(
    `\n=== Scenario ${scenario.name} (run ${runId}): ${users} users, ${conversations.length} conversations, ${totalTurns} turns`,
  );

  const start = (label: string) => {
    const server = spawnLoadServer(script, label, [
      "serve",
      // Postgres keeps `application_name` ASCII.
      `${prefix}-${label.replace("′", "-prime")}`,
      String(latencyMs[0]),
      String(latencyMs[1]),
    ]);
    servers.push(server);
    return server;
  };

  try {
    const [serverA, serverB] = [start("A"), start("B")];
    const [listeningA, listeningB] = await Promise.all([
      serverA.listening,
      serverB.listening,
    ]);
    router.set("A", `http://127.0.0.1:${listeningA.port}`);
    router.set("B", `http://127.0.0.1:${listeningB.port}`);
    const rssBefore = new Map<string, number>([
      ["A", listeningA.rssBytes],
      ["B", listeningB.rssBytes],
    ]);
    const stopSampling = sampleConnections(admin, prefix);

    let completedTurns = 0;
    let reachThreshold: () => void = () => {};
    const thresholdReached = new Promise<void>((resolve) => {
      reachThreshold = resolve;
    });
    const onTurn = (_turn: ClientTurn) => {
      completedTurns += 1;
      if (completedTurns >= Math.ceil(totalTurns / 3)) reachThreshold();
    };

    const restart = async () => {
      if (scenario.restartSignal === undefined) return undefined;
      await thresholdReached;
      print(`  ${completedTurns} turns done: starting B′`);
      const replacement = start("B′");
      const listening = await replacement.listening;
      rssBefore.set("B′", listening.rssBytes);
      router.set("B", `http://127.0.0.1:${listening.port}`);
      print(
        `  B's conversations remapped to B′; ${scenario.restartSignal} B in ${drainMs} ms`,
      );
      await sleep(drainMs);
      const atSignal = serverB.stats();
      print(
        `  B at the signal (its last report): ${atSignal?.modelInFlight ?? "?"} model calls in flight, ${atSignal?.fenceFailures ?? "?"} fence failures so far`,
      );
      const stopped = await stopServer(serverB, scenario.restartSignal);
      const how = `${stopped.signal ?? `exit ${stopped.code}`} after ${ms(stopped.stopMs)}${stopped.timedOut ? " (SIGTERM timed out; killed)" : ""}`;
      stops.push({ label: "B", how });
      print(`  B stopped: ${how}`);
      return stopped;
    };

    const started = performance.now();
    const clients = Promise.all(
      conversations.map(async ({ conversationId, plans, seed }) => {
        const random = seededRandom(seed);
        await sleep(random() * arrivalSpreadMs);
        return runConversation({
          conversationId,
          plans,
          router,
          errors,
          random,
          timing,
          onTurn,
        });
      }),
    );
    // A run whose turns all end before the threshold still restarts, late.
    clients.finally(reachThreshold).catch(() => {});
    const [results, restarted] = await Promise.all([clients, restart()]);
    const wallMs = performance.now() - started;
    // Let the last stats line land before reading RSS after.
    await sleep(300);
    const running = servers.filter((server) => server.isRunning());
    const rssAfter = new Map(
      running.map((server) => [server.label, server.stats()?.rssBytes]),
    );
    await Promise.all(
      running.map(async (server) => {
        const stopped = await stopServer(server, "SIGTERM");
        stops.push({
          label: server.label,
          how: `${stopped.signal ?? `exit ${stopped.code}`} after ${ms(stopped.stopMs)}${stopped.timedOut ? " (SIGTERM timed out; killed)" : ""}`,
        });
      }),
    );
    const connections = await stopSampling();

    // Read back what is stored, ten conversations at a time.
    const stored: StoredConversation[] = [];
    for (let index = 0; index < conversations.length; index += 10) {
      // Batches bound the reader's connections.
      // eslint-disable-next-line no-await-in-loop
      const batch = await Promise.all(
        conversations
          .slice(index, index + 10)
          .map(({ conversationId }) =>
            readStoredConversation(admin, conversationId),
          ),
      );
      stored.push(...batch);
    }

    // Turns, from storage.
    const clientTurns = results.flatMap(({ turns }) => turns);
    const turnRows = conversations.flatMap(({ conversationId, plans }) => {
      const conversation = stored.find(
        (each) => each.conversationId === conversationId,
      );
      return plans.map((plan) => {
        const turn = conversation?.turns.get(plan.turn);
        const client = clientTurns.find(
          (each) =>
            each.plan.conversationId === conversationId &&
            each.plan.turn === plan.turn,
        );
        const duplicateResults = [...(turn?.toolResults.values() ?? [])].filter(
          (count) => count > 1,
        ).length;
        return {
          plan,
          turn,
          client,
          conversation,
          completed: (turn?.answers ?? 0) >= 1,
          duplicated:
            (turn?.answers ?? 0) > 1 ||
            (turn?.userInputs ?? 0) > 1 ||
            duplicateResults > 0,
          duplicateResults,
          extraToolCalls: Math.max(
            0,
            (turn?.toolCalls.length ?? 0) - browserCallsOf(plan),
          ),
        };
      });
    });
    const completed = turnRows.filter(({ completed: done }) => done).length;
    const lost = turnRows.filter(({ completed: done }) => !done);
    const duplicated = turnRows.filter(({ duplicated: dup }) => dup);
    const stillRunning = stored.filter(({ running: live }) => live).length;

    // Browser calls, from storage.
    const calls = stored.flatMap(({ calls: each }) => each);
    const callsByStatus = new Map<string, number>();
    for (const call of calls)
      callsByStatus.set(call.status, (callsByStatus.get(call.status) ?? 0) + 1);
    const stranded = calls.filter(({ status }) =>
      ["pending", "claimed", "finished", "failed"].includes(status),
    );
    const browserOutcomes = new Map<string, number>();
    for (const { outcome } of results.flatMap(
      ({ browserCalls }) => browserCalls,
    ))
      browserOutcomes.set(outcome, (browserOutcomes.get(outcome) ?? 0) + 1);

    // Servers.
    const stats = servers.map((server) => ({
      label: server.label,
      stats: server.stats(),
      waits: server.requestWaitsMs(),
      output: server.output(),
    }));
    const allWaits = stats.flatMap(({ waits }) => waits);
    const sum = (pick: (each: (typeof stats)[number]) => number) =>
      stats.reduce((total, each) => total + pick(each), 0);
    const clientOutcomes = new Map<string, number>();
    for (const { outcome } of clientTurns)
      clientOutcomes.set(outcome, (clientOutcomes.get(outcome) ?? 0) + 1);
    const latencies = clientTurns.map(({ latencyMs: latency }) => latency);
    const commitErrors = new Map<string, number>();
    for (const { label, stats: each } of stats)
      for (const [kind, count] of Object.entries(each?.commitErrors ?? {}))
        commitErrors.set(`${label}: ${kind}`, count);
    const poolTimeouts = [...commitErrors.entries()]
      .filter(([kind]) =>
        kind.includes("timeout exceeded when trying to connect"),
      )
      .reduce((total, [, count]) => total + count, 0);

    print(`\nResults: ${scenario.name}`);
    table([
      ["wall time", ms(wallMs)],
      ["turns planned", String(totalTurns)],
      ["turns completed (stored answer)", String(completed)],
      ["turns lost (no stored answer)", String(lost.length)],
      ["turns duplicated", String(duplicated.length)],
      [
        "  tool calls with more than one result",
        String(
          turnRows.reduce((total, row) => total + row.duplicateResults, 0),
        ),
      ],
      [
        "  turns with more than one answer",
        String(turnRows.filter(({ turn }) => (turn?.answers ?? 0) > 1).length),
      ],
      [
        "  turns with more than one user input",
        String(
          turnRows.filter(({ turn }) => (turn?.userInputs ?? 0) > 1).length,
        ),
      ],
      [
        "turns with extra tool calls (re-issued)",
        String(
          turnRows.filter(({ extraToolCalls }) => extraToolCalls > 0).length,
        ),
      ],
      ["runs still live at the end", String(stillRunning)],
      [
        "client outcomes",
        [...clientOutcomes]
          .map(([kind, count]) => `${kind} ${count}`)
          .join(", "),
      ],
      [
        "client saw the answer",
        `${clientTurns.filter(({ answerSeen }) => answerSeen).length} of ${clientTurns.length}`,
      ],
      [
        "client streams dropped and reconnected",
        String(clientTurns.reduce((total, { drops }) => total + drops, 0)),
      ],
      [
        "browser calls stored",
        [...callsByStatus]
          .map(([status, count]) => `${status} ${count}`)
          .join(", ") || "none",
      ],
      ["browser calls stranded", String(stranded.length)],
      [
        "changes refused by net freshness",
        String(
          turnRows
            .flatMap(({ turn }) => turn?.errors ?? [])
            .filter((error) => error.includes("no current view of the net"))
            .length,
        ),
      ],
      [
        "browser player outcomes",
        [...browserOutcomes]
          .map(([kind, count]) => `${kind} ${count}`)
          .join(", "),
      ],
      [
        "fence failures (commits refused)",
        stats
          .map(
            ({ label, stats: each }) =>
              `${label} ${each?.fenceFailures ?? "?"}`,
          )
          .join(", "),
      ],
      [
        "conversations written (taken over, for B′)",
        stats
          .map(
            ({ label, stats: each }) =>
              `${label} ${each?.conversationsWritten ?? "?"}`,
          )
          .join(", "),
      ],
      [
        "ownership lost on acquire (reopens)",
        stats
          .map(
            ({ label, stats: each }) =>
              `${label} ${each?.ownershipLost ?? "?"}`,
          )
          .join(", "),
      ],
      [
        "model calls",
        stats
          .map(
            ({ label, stats: each }) => `${label} ${each?.modelCalls ?? "?"}`,
          )
          .join(", "),
      ],
      [
        "model calls in flight, peak",
        stats
          .map(
            ({ label, stats: each }) =>
              `${label} ${each?.peakModelInFlight ?? "?"}`,
          )
          .join(", "),
      ],
      [
        "requests waiting for the model, peak",
        stats
          .map(
            ({ label, stats: each }) =>
              `${label} ${each?.peakRequestsWaiting ?? "?"}`,
          )
          .join(", "),
      ],
      [
        "request wait p50 / p95 / max",
        `${ms(percentile(allWaits, 0.5))} / ${ms(percentile(allWaits, 0.95))} / ${ms(Math.max(...allWaits))} (${allWaits.length} requests)`,
      ],
      [
        "model calls resumed without a request commit",
        String(sum(({ stats: each }) => each?.unmatchedModelCalls ?? 0)),
      ],
      [
        "turn latency p50 / p95 / max",
        `${ms(percentile(latencies, 0.5))} / ${ms(percentile(latencies, 0.95))} / ${ms(Math.max(...latencies))}`,
      ],
      [
        "Postgres connections, peak",
        `${connections.total} (${[...connections.byProcess].map(([name, count]) => `${name.slice(prefix.length + 1).replace("-prime", "′")} ${count}`).join(", ")})`,
      ],
      [
        "pool clients, peak / waiting peak",
        stats
          .map(
            ({ label, stats: each }) =>
              `${label} ${each?.peakPoolTotal ?? "?"}/${each?.peakPoolWaiting ?? "?"}`,
          )
          .join(", "),
      ],
      [
        "pool connection timeouts",
        `${poolTimeouts} (the pool sets no connectionTimeoutMillis)`,
      ],
      [
        "RSS before → after",
        servers
          .map(
            ({ label }) =>
              `${label} ${mib(rssBefore.get(label))} → ${mib(rssAfter.get(label) ?? servers.find((server) => server.label === label)?.stats()?.rssBytes)}`,
          )
          .join(", "),
      ],
      [
        "server stops",
        stops.map(({ label, how }) => `${label}: ${how}`).join("; "),
      ],
    ]);
    print("  errors by kind (client requests and streams):");
    for (const [kind, count] of errors.entries())
      print(
        `    ${String(count).padStart(5)}  ${kind}${kind === claimBeforeIssue ? " (a claim before the call's issue commit; retried, as the panel does)" : ""}`,
      );
    if (errors.entries().length === 0) print("    none");
    print("  server commit errors other than fence failures:");
    for (const [kind, count] of commitErrors)
      print(`    ${String(count).padStart(5)}  ${kind}`);
    if (commitErrors.size === 0) print("    none");
    const serverLines = stats.flatMap(({ label, output }) =>
      output.map((line) => `${label}: ${line}`),
    );
    print(
      `  server output lines (stderr and stray stdout): ${serverLines.length}`,
    );
    for (const line of serverLines.slice(0, 10))
      print(`    ${line.slice(0, 200)}`);

    const explanationOf = (row: (typeof turnRows)[number]) => {
      const reasons = [
        ...(row.turn?.errors ?? []),
        ...(row.conversation?.runFailure === undefined
          ? []
          : [`run failure ${row.conversation.runFailure}`]),
      ];
      return reasons.length === 0 ? undefined : reasons.join("; ");
    };
    if (lost.length > 0) {
      print("  lost turns:");
      for (const row of lost.slice(0, 20))
        print(
          `    ${row.plan.conversationId} turn ${row.plan.turn}: client ${row.client?.outcome ?? "?"} (${(row.client?.errorTexts ?? []).join("; ").slice(0, 120)}); stored: ${explanationOf(row) ?? "no error stored"}`,
        );
    }
    if (duplicated.length > 0) {
      print("  duplicated turns:");
      for (const row of duplicated.slice(0, 20))
        print(
          `    ${row.plan.conversationId} turn ${row.plan.turn}: answers ${row.turn?.answers}, inputs ${row.turn?.userInputs}, results ${JSON.stringify([...(row.turn?.toolResults ?? [])])}`,
        );
    }
    if (stranded.length > 0) {
      print("  stranded calls:");
      for (const call of stranded.slice(0, 20))
        print(
          `    ${call.toolCallId}: ${call.status}, started ${String(call.started)}`,
        );
    }

    const criteria: Criterion[] =
      scenario.name === "sigkill"
        ? [
            { criterion: "no duplicated turns", pass: duplicated.length === 0 },
            {
              criterion: `every lost turn is explained by what is stored (${lost.length} lost)`,
              pass: lost.every((row) => explanationOf(row) !== undefined),
            },
          ]
        : [
            {
              criterion: "every turn completes",
              pass: completed === totalTurns && stillRunning === 0,
            },
            { criterion: "no duplicated turns", pass: duplicated.length === 0 },
            {
              criterion: "no stranded browser calls",
              pass: stranded.length === 0,
            },
          ];
    if (scenario.restartSignal !== undefined && restarted === undefined)
      criteria.push({ criterion: "the rolling restart ran", pass: false });
    return criteria;
  } finally {
    for (const server of servers) server.kill("SIGKILL");
    await Promise.allSettled(servers.map(({ exited }) => exited));
    await admin.query(
      `DROP SCHEMA IF EXISTS ${schemas.map((schema) => `"${schema}"`).join(", ")} CASCADE`,
    );
    const left = (
      await admin.query(
        "SELECT count(*) AS left FROM pg_namespace WHERE nspname = ANY($1)",
        [schemas],
      )
    ).rows[0] as { left: string } | undefined;
    print(
      `  schemas dropped: ${schemas.length}; left behind: ${left?.left ?? "?"}`,
    );
    await admin.end();
  }
};

const drive = async () => {
  const summary: { scenario: string; criteria: readonly Criterion[] }[] = [];
  for (const scenario of scenarios) {
    // Scenarios run one after another, each on its own servers.
    // eslint-disable-next-line no-await-in-loop
    const criteria = await runScenario(scenario).catch((error: unknown) => {
      print(`  scenario ${scenario.name} failed: ${String(error)}`);
      return [
        { criterion: `the scenario ran (${String(error)})`, pass: false },
      ];
    });
    summary.push({ scenario: scenario.name, criteria });
  }
  print("\nCriteria");
  for (const { scenario, criteria } of summary)
    for (const { criterion, pass } of criteria)
      print(`  ${pass ? "PASS" : "FAIL"}  ${scenario}: ${criterion}`);
  const failed = summary
    .flatMap(({ criteria }) => criteria)
    .filter(({ pass }) => !pass).length;
  print(
    failed === 0
      ? "\nAll required criteria pass."
      : `\n${failed} required criteria fail.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
};

const [role, applicationName, minLatency, maxLatency] = process.argv.slice(2);
if (role === "serve")
  await serve({
    applicationName: applicationName ?? "durable-agents-load",
    minLatencyMs: Number(minLatency),
    maxLatencyMs: Number(maxLatency),
  });
else await drive();
