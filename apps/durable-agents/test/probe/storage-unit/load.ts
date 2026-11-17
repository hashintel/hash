/**
 * Storage-unit load probe (obligation 3): K concurrent conversations, each
 * running turns whose browser calls wait for a scripted browser, all in one
 * Harness and schema (`web`) against one Harness and schema each
 * (`conversation`, as today), on the compose Postgres.
 *
 * Usage, from `apps/durable-agents`:
 *
 *   yarn tsx test/probe/storage-unit/load.ts [--k 8,32,64] [--profile realistic|hot]
 *     [--modes web,conversation] [--kill]
 *
 * The driver plays the users and their browsers (the load probe's workload
 * and fake net); a child process (`load/serve.ts`) owns the Harnesses, so its
 * CPU and memory are the owning process's, and `--kill` can SIGKILL it once a
 * third of the turns are done and start a new one on the same schemas. Turns
 * are submitted with a request ID and resent after a restart; browser ops are
 * retried. At the end the server counts, from the stored entries, each turn's
 * user messages, answers and tool results, and the driver drops the schemas.
 */
import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
  type BrowserCallClaim,
  canonicalContent,
  type NetStructure,
} from "@hashintel/brunch-agent";

import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import { seededRandom } from "../../load/probe/client";
import {
  browserCallsOf,
  loadReadToolName,
  type TurnPlan,
  userText,
} from "../../load/probe/workload";
import { bindingFor } from "./agent-harness";
import { schemaPrefix, serve } from "./load/serve";

import type {
  Event,
  Mode,
  Request,
  RequestBody,
  ServeConfig,
  ServerStats,
  TurnCount,
} from "./load/protocol";

type Profile = {
  readonly latencyMs: readonly [number, number];
  readonly browserThinkMs: readonly [number, number];
  readonly userThinkMs: readonly [number, number];
  readonly turns: number;
  readonly arrivalSpreadMs: number;
};

const profiles: Readonly<Record<string, Profile>> = {
  // The load probe's timing (`test/load/probe.ts`).
  realistic: {
    latencyMs: [200, 800],
    browserThinkMs: [100, 400],
    userThinkMs: [300, 1_200],
    turns: 3,
    arrivalSpreadMs: 2_000,
  },
  // Everything fast, so the commit path is what a turn waits on.
  hot: {
    latencyMs: [5, 20],
    browserThinkMs: [5, 20],
    userThinkMs: [5, 20],
    turns: 5,
    arrivalSpreadMs: 200,
  },
};

const turnTimeoutMs = 120_000;
const script = fileURLToPath(import.meta.url);
const print = (line: string) => process.stdout.write(`${line}\n`);

const percentile = (values: readonly number[], fraction: number) => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[
      Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
    ] ?? Number.NaN
  );
};
const round = (value: number) => Math.round(value * 10) / 10;
const between = (
  random: () => number,
  [low, high]: readonly [number, number],
) => low + random() * (high - low);

class ServerGone extends Error {}

/** The server process the driver talks to now, replaced on a restart. */
const createServerLink = (config: ServeConfig) => {
  let rid = 0;
  type Current = {
    readonly child: ChildProcess;
    readonly ready: Promise<Extract<Event, { t: "ready" }>>;
    readonly pending: Map<
      number,
      {
        resolve: (value: { value: unknown; ms: number }) => void;
        reject: (error: Error) => void;
      }
    >;
    alive: boolean;
    stats?: ServerStats;
    cpuAtReady?: number;
  };
  let current: Current | undefined;
  const commits: (readonly [number, number])[] = [];
  const children: Current[] = [];
  const onEvent: ((event: Event) => void)[] = [];

  const spawnServer = () => {
    const child = fork(script, ["serve", JSON.stringify(config)], {
      execArgv: process.execArgv,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let readyResolve: (
      event: Extract<Event, { t: "ready" }>,
    ) => void = () => {};
    let readyReject: (error: Error) => void = () => {};
    const ready = new Promise<Extract<Event, { t: "ready" }>>(
      (resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      },
    );
    ready.catch(() => {});
    const entry: Current = { child, ready, pending: new Map(), alive: true };
    child.on("message", (message) => {
      const event = message as Event;
      if (event.t === "ready") readyResolve(event);
      else if (event.t === "reply") {
        const waiter = entry.pending.get(event.rid);
        entry.pending.delete(event.rid);
        if (event.ok) waiter?.resolve({ value: event.value, ms: event.ms });
        else waiter?.reject(new Error(String(event.value)));
      } else if (event.t === "stats") {
        entry.stats = event.stats;
        entry.cpuAtReady ??= event.stats.cpuMicros;
        commits.push(...event.stats.commits);
      }
      for (const listener of onEvent) listener(event);
    });
    child.on("error", () => {
      entry.alive = false;
    });
    child.on("exit", () => {
      entry.alive = false;
      readyReject(new ServerGone("exited before ready"));
      for (const waiter of entry.pending.values())
        waiter.reject(new ServerGone("server gone"));
      entry.pending.clear();
    });
    current = entry;
    children.push(entry);
    return entry;
  };

  /** Send `request` to the server now, once ready; rejects `ServerGone` if it dies first. */
  const call = async (
    request: RequestBody,
  ): Promise<{ value: unknown; ms: number }> => {
    for (;;) {
      const entry = current;
      if (entry === undefined) throw new Error("No server.");
      try {
        // A dead server's replacement may still be opening.
        // eslint-disable-next-line no-await-in-loop
        await entry.ready;
      } catch {
        // eslint-disable-next-line no-await-in-loop
        await sleep(20);
        continue;
      }
      if (!entry.alive) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(20);
        continue;
      }
      rid += 1;
      const id = rid;
      try {
        // eslint-disable-next-line no-await-in-loop
        return await new Promise<{ value: unknown; ms: number }>(
          (resolve, reject) => {
            entry.pending.set(id, { resolve, reject });
            // A server killed under the send fails it: the request goes to its replacement.
            entry.child.send({ ...request, rid: id } as Request, (error) => {
              if (error === null) return;
              entry.pending.delete(id);
              reject(new ServerGone(error.message));
            });
          },
        );
      } catch (error) {
        if (!(error instanceof ServerGone)) throw error;
        // eslint-disable-next-line no-await-in-loop
        await sleep(20);
      }
    }
  };

  return {
    spawnServer,
    call,
    current: () => current,
    children: () => children,
    commits: () => commits,
    on: (listener: (event: Event) => void) => onEvent.push(listener),
  };
};

/** The fake net of `test/load/probe/client.ts`: revisions from a counter. */
const createFakeNet = () => {
  let revision = 1;
  const places: NetStructure["places"] = [];
  const structure = (): NetStructure => ({
    places: [...places],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  });
  return (toolName: string, input: unknown) => {
    const before = `revision-${revision}`;
    if (toolName === loadReadToolName)
      return {
        output: { title: "Load net", definition: structure() },
        metadata: { documentRevision: { before } },
      };
    places.push(input as NetStructure["places"][number]);
    revision += 1;
    const fields = input as { id?: unknown };
    return {
      output: {
        ok: true,
        id: typeof fields.id === "string" ? fields.id : null,
      },
      metadata: {
        documentRevision: { before, after: `revision-${revision}` },
        readBack: structure(),
      },
    };
  };
};

type ScenarioResult = Record<string, unknown>;

const runScenario = async (
  mode: Mode,
  k: number,
  profileName: string,
  kill: boolean,
): Promise<ScenarioResult> => {
  const profile = profiles[profileName];
  if (profile === undefined) throw new Error(`No profile ${profileName}.`);
  const runId = randomUUID().replaceAll("-", "").slice(0, 8);
  const names = Array.from({ length: k }, (_, index) => `c${index}`);
  const config: ServeConfig = {
    mode,
    runId,
    names,
    latencyMs: profile.latencyMs,
    requestSlots: 64,
    poolMax: 32,
  };
  const random = seededRandom(11);
  const plans = new Map(
    names.map((name) => [
      name,
      Array.from({ length: profile.turns }, (_, turn): TurnPlan => ({
        conversationId: name,
        turn: turn + 1,
        calls: random() < 0.5 ? 1 : 2,
      })),
    ]),
  );
  const totalTurns = k * profile.turns;
  const link = createServerLink(config);
  const admin = new Pool({ ...postgresConfigFromEnvironment(), max: 2 });

  const turnLatencies: number[] = [];
  const opLatencies: Record<string, number[]> = {
    claim: [],
    start: [],
    finish: [],
  };
  const failures: string[] = [];
  let completedTurns = 0;
  let reachThird: () => void = () => {};
  const third = new Promise<void>((resolve) => {
    reachThird = resolve;
  });

  // Conversations mid-turn, and when each first showed progress after a restart.
  const inTurn = new Set<string>();
  let restartedAt: number | undefined;
  const firstEventAfterRestart = new Map<string, number>();
  const turnDoneAfterRestart = new Map<string, number>();
  const noteProgress = (name: string) => {
    if (restartedAt === undefined || firstEventAfterRestart.has(name)) return;
    firstEventAfterRestart.set(name, performance.now() - restartedAt);
  };

  const played = new Map<string, Promise<void>>();
  const nets = new Map(names.map((name) => [name, createFakeNet()]));

  const op = async (request: RequestBody) => {
    const reply = await link.call(request);
    opLatencies[request.op]?.push(reply.ms);
    return reply.value;
  };

  /** Claim, start and answer one call, as the load probe's browser does, across restarts. */
  const playCall = async (name: string, callId: string) => {
    const binding = canonicalContent(bindingFor(name));
    const claimant = `tab-${name}`;
    let claim: BrowserCallClaim | undefined;
    const deadline = performance.now() + turnTimeoutMs;
    while (claim === undefined) {
      // eslint-disable-next-line no-await-in-loop
      const outcome = (await op({
        op: "claim",
        name,
        callId,
        claimant,
        binding,
      })) as { status: string; claim?: BrowserCallClaim };
      if (outcome.status === "claimed") claim = outcome.claim;
      else if (outcome.status === "not-issued" && performance.now() < deadline)
        // eslint-disable-next-line no-await-in-loop
        await sleep(20);
      else {
        failures.push(`claim ${name} ${callId} ${outcome.status}`);
        return;
      }
    }
    const proof = { capability: claim!.capability, binding };
    await sleep(between(random, profile.browserThinkMs) / 2);
    const started = await op({ op: "start", name, callId, ...proof });
    if (started !== "started") {
      failures.push(`start ${name} ${callId} ${String(started)}`);
      return;
    }
    await sleep(between(random, profile.browserThinkMs) / 2);
    const result = nets.get(name)!(claim!.toolName, claim!.input);
    const finished = await op({
      op: "finish",
      name,
      callId,
      ...proof,
      toolName: claim!.toolName,
      canonicalInput: claim!.input,
      ...result,
    });
    if (finished !== "settled")
      failures.push(`finish ${name} ${callId} ${String(finished)}`);
  };

  link.on((event) => {
    if (process.env.PROBE_DEBUG === "1" && event.t !== "stats")
      print(`  debug ${JSON.stringify(event)}`);
    if (event.t === "call") {
      noteProgress(event.name);
      const key = `${event.name}/${event.callId}`;
      if (!played.has(key)) played.set(key, playCall(event.name, event.callId));
    } else if (event.t === "model") noteProgress(event.name);
  });

  const runUser = async (name: string, delayMs: number) => {
    await sleep(delayMs);
    for (const plan of plans.get(name) ?? []) {
      // A user reads the answer before the next message.
      // eslint-disable-next-line no-await-in-loop
      await sleep(between(random, profile.userThinkMs));
      const started = performance.now();
      inTurn.add(name);
      // eslint-disable-next-line no-await-in-loop
      const status = await link
        .call({
          op: "submit",
          name,
          requestId: `turn-${plan.turn}`,
          text: userText(plan),
        })
        .then(
          ({ value }) => String(value),
          (error: unknown) => `error ${String(error)}`,
        );
      inTurn.delete(name);
      if (restartedAt !== undefined && !turnDoneAfterRestart.has(name))
        turnDoneAfterRestart.set(name, performance.now() - restartedAt);
      turnLatencies.push(performance.now() - started);
      if (status !== "done")
        failures.push(`turn ${name} ${plan.turn} ${status}`);
      completedTurns += 1;
      if (completedTurns >= Math.ceil(totalTurns / 3)) reachThird();
    }
  };

  const wallStarted = performance.now();
  let killInfo: Record<string, unknown> | undefined;
  try {
    const first = link.spawnServer();
    const ready = await first.ready;
    const readyAt = performance.now();
    const users = Promise.all(
      names.map((name, index) =>
        runUser(name, (profile.arrivalSpreadMs * index) / k),
      ),
    );
    const killer = (async () => {
      if (!kill) return;
      await third;
      const midTurn = [...inTurn];
      const turnsDoneAtKill = completedTurns;
      const killedAt = performance.now();
      first.alive = false;
      first.child.kill("SIGKILL");
      await new Promise<void>((resolve) => {
        if (first.child.exitCode !== null || first.child.signalCode !== null)
          resolve();
        else first.child.once("exit", () => resolve());
      });
      restartedAt = performance.now();
      const second = link.spawnServer();
      const secondReady = await second.ready;
      const readyMs = performance.now() - restartedAt;
      // Wait for every conversation mid-turn at the kill to show progress and finish its turn.
      const waitStarted = performance.now();
      while (
        midTurn.some(
          (name) =>
            !firstEventAfterRestart.has(name) ||
            !turnDoneAfterRestart.has(name),
        ) &&
        performance.now() - waitStarted < turnTimeoutMs
      )
        // eslint-disable-next-line no-await-in-loop
        await sleep(20);
      const firstEvents = midTurn.map(
        (name) => firstEventAfterRestart.get(name) ?? Number.NaN,
      );
      const turnDone = midTurn.map(
        (name) => turnDoneAfterRestart.get(name) ?? Number.NaN,
      );
      killInfo = {
        turnsDoneAtKill,
        midTurnAtKill: midTurn.length,
        killToExitMs: round(restartedAt - killedAt),
        reopenOpenMs: round(secondReady.openMs),
        reopenResumeMs: round(secondReady.resumeMs),
        restartToReadyMs: round(readyMs),
        firstProgressP50Ms: round(percentile(firstEvents, 0.5)),
        firstProgressMaxMs: round(Math.max(...firstEvents)),
        midTurnDoneP50Ms: round(percentile(turnDone, 0.5)),
        midTurnDoneMaxMs: round(Math.max(...turnDone)),
      };
    })();
    await Promise.all([users, killer]);
    await Promise.all(played.values());
    const wallMs = performance.now() - readyAt;

    const verified = (await link.call({ op: "verify" })).value as Record<
      string,
      TurnCount
    >;
    let lost = 0;
    let duplicated = 0;
    let done = 0;
    for (const name of names) {
      const counts = verified[name];
      for (const plan of plans.get(name) ?? []) {
        const turn = String(plan.turn);
        const users = counts?.users[turn] ?? 0;
        const answers = counts?.answers[turn] ?? 0;
        const results = counts?.toolResults[turn] ?? 0;
        if (answers === 0) lost += 1;
        else done += 1;
        if (users > 1 || answers > 1 || results > browserCallsOf(plan))
          duplicated += 1;
      }
    }
    // Stats of the server(s): the last one's stats before close.
    const statsBefore = link.current()?.stats;
    await link.call({ op: "close" }).catch(() => undefined);
    await new Promise<void>((resolve) => {
      const entry = link.current();
      if (entry === undefined || !entry.alive) resolve();
      else entry.child.once("exit", () => resolve());
    });
    const servers = link.children();
    const cpuMicros = servers.reduce(
      (sum, entry) =>
        sum + ((entry.stats?.cpuMicros ?? 0) - (entry.cpuAtReady ?? 0)),
      0,
    );
    const peakRss = Math.max(
      ...servers.map((entry) => entry.stats?.rssBytes ?? 0),
      ready.rssBytes,
    );
    const commits = link.commits();
    const commitMs = commits.map(([duration]) => duration);
    const batches = commits.reduce((sum, [, count]) => sum + count, 0);
    const last = link.current()?.stats ?? statsBefore;
    return {
      mode,
      k,
      profile: profileName,
      kill,
      turns: totalTurns,
      done,
      lost,
      duplicated,
      failures: failures.slice(0, 10),
      failureCount: failures.length,
      turnP50Ms: round(percentile(turnLatencies, 0.5)),
      turnP95Ms: round(percentile(turnLatencies, 0.95)),
      opP50Ms: Object.fromEntries(
        Object.entries(opLatencies).map(([name, values]) => [
          name,
          round(percentile(values, 0.5)),
        ]),
      ),
      opP95Ms: Object.fromEntries(
        Object.entries(opLatencies).map(([name, values]) => [
          name,
          round(percentile(values, 0.95)),
        ]),
      ),
      storageCommits: commits.length,
      storageBatches: batches,
      batchesPerCommit: round(batches / Math.max(1, commits.length)),
      storageCommitP50Ms: round(percentile(commitMs, 0.5)),
      storageCommitP95Ms: round(percentile(commitMs, 0.95)),
      peakPoolTotal: Math.max(
        ...servers.map((entry) => entry.stats?.peakPoolTotal ?? 0),
      ),
      peakPoolWaiting: Math.max(
        ...servers.map((entry) => entry.stats?.peakPoolWaiting ?? 0),
      ),
      poolTimeouts: servers.reduce(
        (sum, entry) => sum + (entry.stats?.poolTimeouts ?? 0),
        0,
      ),
      commitErrors: last?.commitErrors ?? {},
      openMs: round(ready.openMs),
      resumeMs: round(ready.resumeMs),
      cpuSeconds: round(cpuMicros / 1e6),
      cpuPercentOfWall: round((cpuMicros / 1e3 / wallMs) * 100),
      peakRssMiB: round(peakRss / 2 ** 20),
      wallMs: round(wallMs),
      ...(killInfo === undefined ? {} : { killInfo }),
    };
  } finally {
    for (const entry of link.children())
      if (entry.alive) entry.child.kill("SIGKILL");
    const { rows } = await admin.query<{ nspname: string }>(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE $1",
      [`${schemaPrefix(runId)}\\_%`],
    );
    for (const { nspname } of rows)
      // Each drop takes its own catalog locks.
      // eslint-disable-next-line no-await-in-loop
      await admin.query(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
    await admin.end();
    print(
      `  dropped ${rows.length} schema(s) of run ${runId} (${round(performance.now() - wallStarted)} ms total)`,
    );
  }
};

const argument = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const main = async () => {
  if (process.argv[2] === "serve") {
    await serve(JSON.parse(process.argv[3] ?? "{}") as ServeConfig);
    return;
  }
  const ks = (argument("k") ?? "8,32,64").split(",").map(Number);
  const profileName = argument("profile") ?? "realistic";
  const modes = (argument("modes") ?? "web,conversation").split(",") as Mode[];
  const kill = process.argv.includes("--kill");
  for (const k of ks)
    for (const mode of modes) {
      print(`=== ${mode} K=${k} ${profileName}${kill ? " SIGKILL" : ""}`);
      // Scenarios run one at a time, so they don't share the database.
      // eslint-disable-next-line no-await-in-loop
      const result = await runScenario(mode, k, profileName, kill);
      print(`@@result ${JSON.stringify(result)}`);
    }
};

await main();
