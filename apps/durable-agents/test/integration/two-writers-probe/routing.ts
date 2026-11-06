/**
 * Routing scenarios for the two-writers probe: one conversation whose
 * requests a load balancer spreads over two server instances, each a
 * Harness over the same Postgres schema with the newest-opener-wins fence.
 *
 * An instance is the host around a Harness: it opens on its first request,
 * and when its Session has failed it reopens, taking ownership back, before
 * serving. A request whose Session fails under it is retried once on a fresh
 * Harness. Requests are a submit, a browser claim, or a browser finish; the
 * scenario picks the instance for each one.
 *
 * The driver plays the user and the browser. It learns of an issued call and
 * of an answer by reading the schema through a read-only storage, as a panel
 * would through whichever instance streams to it, so its waiting takes no
 * ownership. Every commit an instance's storage stores or the fence refuses
 * is counted per instance.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  type EntryRecord,
  Harness,
  type JsonObject,
  type Storage,
} from "@earendil-works/pi-durable";
import { Pool } from "pg";

import {
  type BrowserCallRecord,
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../../../src/browser-call/browser-call";
import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import {
  openPostgresStorage,
  type PostgresStorage,
} from "../../../src/storage/postgres/postgres-storage";
import { print } from "../../browser-call/proof/server-process";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../scripted-model";

import type { FauxResponseFactory } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const fenced = "is owned by a storage opened later";
const turns = 3;
/** `BrowserCallsDoc`'s kind; the token does not expose it at runtime. */
const browserCallsKind = "brunch.browser-calls";
/** How long the user or browser waits for the next thing it expects. */
const patienceMs = 2000;
const alternatingRepetitions = 5;

type InstanceName = "A" | "B";
type ModelMessage = NonNullable<EntryRecord["model"]>[number];
type RequestKind = "submit" | "claim" | "finish";

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Poll `check` every 10 ms until it holds or `ms` pass; whether it held. */
const holdsWithin = async (
  check: () => Promise<boolean>,
  ms: number,
): Promise<boolean> => {
  const deadline = performance.now() + ms;
  while (performance.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- Polling is sequential.
    if (await check()) return true;
    // eslint-disable-next-line no-await-in-loop -- Polling is sequential.
    await delay(10);
  }
  return false;
};

const textOf = (message: ModelMessage | undefined) => {
  if (message === undefined) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => (part.type === "text" ? part.text : `[${part.type}]`))
    .join("");
};

const turnOf = (text: string) => Number(/Turn (\d+)/.exec(text)?.[1] ?? 0);

/**
 * The model for any turn either instance may run, read off the context: a
 * user input asks for the browser tool, a tool result gets an answer naming
 * the instance that wrote it.
 */
const respond =
  (instance: InstanceName): FauxResponseFactory =>
  (transcript) => {
    const last = transcript.messages.at(-1);
    if (last?.role === "toolResult") {
      return fauxAssistantMessage(
        `${instance} answered turn ${turnOf(textOf(last))}.`,
      );
    }
    return fauxAssistantMessage(
      fauxToolCall(browserToolName, { title: `Turn ${turnOf(textOf(last))}` }),
      { stopReason: "toolUse" },
    );
  };

/** `storage` with every commit it stores or the fence refuses reported. */
const countCommits = (
  storage: PostgresStorage,
  onStored: (seqs: number[]) => void,
  onFenced: () => void,
): Storage =>
  new Proxy(storage, {
    get: (target, property) => {
      if (property === "commit") {
        return async (
          ...[batches, receive, commitContext]: Parameters<Storage["commit"]>
        ) => {
          const seqs: number[] = [];
          try {
            const result = await target.commit(
              batches,
              (batchIndex, seq) => {
                seqs.push(seq);
                receive(batchIndex, seq);
              },
              commitContext,
            );
            if (result.stored > 0) onStored(seqs);
            return result;
          } catch (error) {
            if (String(error).includes(fenced)) onFenced();
            throw error;
          }
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

type Served<T> = { ok: true; value: T } | { ok: false; error: string };

/** A server instance: the host's handling of its Harness's lifecycle. `opens` numbers opens across instances. */
const createInstance = (
  name: InstanceName,
  schema: string,
  opens: { next: () => number; latest: () => number },
) => {
  const { models, model, state } = scriptedModel(
    Array.from({ length: 30 }, () => respond(name)),
  );
  let harness: Harness | undefined;
  let failed = false;
  let ownOpen = 0;
  const stats = {
    opens: 0,
    reopens: 0,
    fenceFailures: 0,
    otherFailures: 0,
    commitsStored: 0,
    commitsFenced: 0,
    /** Commit sequence numbers this instance stored, the database's order of commits. */
    firstSeq: undefined as number | undefined,
    lastSeq: undefined as number | undefined,
    requests: 0,
    retries: 0,
    refused: 0,
  };

  const open = async () => {
    if (harness !== undefined) {
      await harness.close(context).catch(() => {});
      stats.reopens++;
    }
    const registry = createRegistry();
    registry.install(browserCallExtension);
    const storage = countCommits(
      await openPostgresStorage({ pool: poolConfig, schema }),
      (seqs) => {
        stats.commitsStored++;
        for (const seq of seqs) {
          stats.firstSeq = Math.min(stats.firstSeq ?? seq, seq);
          stats.lastSeq = Math.max(stats.lastSeq ?? seq, seq);
        }
      },
      () => {
        stats.commitsFenced++;
      },
    );
    const opened = await Harness.open(storage, { models, registry }, context);
    stats.opens++;
    ownOpen = opens.next();
    harness = opened;
    failed = false;
    void opened.closed.then((end) => {
      if (end.kind !== "failed" || harness !== opened) return;
      failed = true;
      if (String(end.error).includes(fenced)) stats.fenceFailures++;
      else stats.otherFailures++;
    });
    opened.resume();
    return opened;
  };

  const attempt = async <T>(
    run: (current: Harness) => Promise<T>,
  ): Promise<Served<T>> => {
    const current = harness === undefined || failed ? await open() : harness;
    try {
      return { ok: true, value: await run(current) };
    } catch (error) {
      // The Session's end may settle just after the rejection it causes.
      await Promise.race([current.closed, delay(200)]);
      return { ok: false, error: String(error) };
    }
  };

  /** Serve one request: reopen if the Session failed, and retry once if it fails underneath. */
  const serve = async <T>(
    run: (current: Harness) => Promise<T>,
  ): Promise<Served<T> & { retried: boolean }> => {
    stats.requests++;
    const first = await attempt(run);
    if (first.ok || !failed) {
      if (!first.ok) stats.refused++;
      return { ...first, retried: false };
    }
    stats.retries++;
    const second = await attempt(run);
    if (!second.ok) stats.refused++;
    return { ...second, retried: true };
  };

  const sessionState = async () => {
    if (harness === undefined) return "never opened";
    const end = await Promise.race([harness.closed, delay(50)]);
    if (end === undefined) return "open";
    return end.kind === "failed" ? `failed: ${String(end.error)}` : "closed";
  };

  return {
    name,
    model,
    stats,
    open,
    serve,
    sessionState,
    /** Open and not failed, but another storage opened since: it no longer owns the schema and does not know it. */
    stale: () => harness !== undefined && !failed && ownOpen < opens.latest(),
    modelRequests: () => state.callCount,
    close: async () => {
      await harness?.close(context).catch(() => {});
    },
  };
};

type Instance = ReturnType<typeof createInstance>;

type Scenario = {
  name: string;
  /** The instance request `index` (0-based; submit, claim, finish per turn) goes to. */
  route: (index: number) => InstanceName;
  /** Open an instance before request `index`, as a deploy starting it would. */
  openBefore?: { index: number; instance: InstanceName };
  /** How many times the user or browser sends a refused request again, as a new request the router places. */
  resends?: number;
};

/** What the stored conversation and both instances end up with. */
export type ScenarioReport = Awaited<ReturnType<typeof runScenario>>;

const runScenario = async (scenario: Scenario) => {
  const schema = `pi_durable_probe_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ ...poolConfig, max: 1 });
  let openCount = 0;
  const opens = { next: () => ++openCount, latest: () => openCount };
  const instances: Record<InstanceName, Instance> = {
    A: createInstance("A", schema, opens),
    B: createInstance("B", schema, opens),
  };
  // Read-only: takes no ownership. Created first, so it also creates the schema.
  const observer = await openPostgresStorage({
    pool: poolConfig,
    schema,
    readOnly: true,
  });
  const log: string[] = [];
  const submitOutcomes: string[] = [];
  let conversationId: ConversationId | undefined;
  /** A's stored commits as the deploy starts opening B, and once B's open resolved. */
  let commitsByAAtBOpen: { starting: number; opened: number } | undefined;

  const storedCalls = async (): Promise<BrowserCallRecord[]> => {
    if (conversationId === undefined) return [];
    const found = await observer.findDocument(
      {
        kind: browserCallsKind,
        scope: { kind: "conversation", conversationId },
      },
      "current",
      context,
    );
    if (found === undefined) return [];
    const stored = await observer.document(found.id, "current", context);
    const calls = (stored?.value.calls ?? {}) as Record<
      string,
      BrowserCallRecord
    >;
    return Object.values(calls);
  };
  const storedEntries = async () =>
    conversationId === undefined
      ? []
      : (
          await observer.scanEntries(
            { conversationId, order: "ascending" },
            500,
            undefined,
            context,
          )
        ).items.filter(({ kind }) => kind !== "pi.system");
  const answered = async (turn: number) =>
    (await storedEntries()).some(
      (entry) =>
        entry.kind === "pi.assistant" &&
        textOf(entry.model?.[0]).includes(`answered turn ${turn}.`),
    );

  const started = performance.now();
  let index = 0;
  let resent = 0;
  /** Requests refused by a stale Harness that never met the fence: answered from its own memory. */
  let refusedByStaleHarness = 0;
  const send = async <T>(
    kind: RequestKind,
    turn: number,
    run: (current: Harness) => Promise<T>,
  ): Promise<Served<T>> => {
    if (scenario.openBefore?.index === index) {
      const starting = instances.A.stats.commitsStored;
      await instances[scenario.openBefore.instance].open();
      commitsByAAtBOpen = { starting, opened: instances.A.stats.commitsStored };
      log.push(`   ${scenario.openBefore.instance} opens`);
    }
    const instance = instances[scenario.route(index)];
    const opensBefore = instance.stats.opens;
    const staleBefore = instance.stale();
    const fencedBefore = {
      A: instances.A.stats.fenceFailures,
      B: instances.B.stats.fenceFailures,
    };
    const served = await instance.serve(run);
    if (!served.ok && instance.stale()) refusedByStaleHarness++;
    const fencedNow = (name: InstanceName) =>
      instances[name].stats.fenceFailures - fencedBefore[name];
    const notes = [
      staleBefore ? "stale when addressed" : "",
      instance.stats.opens > opensBefore
        ? `opened ${instance.stats.opens - opensBefore}x`
        : "",
      served.retried ? "retried" : "",
      fencedNow("A") + fencedNow("B") > 0
        ? `Sessions fenced: A ${fencedNow("A")}, B ${fencedNow("B")}`
        : "",
    ].filter((note) => note !== "");
    log.push(
      `#${index + 1} ${kind} turn ${turn} -> ${instance.name}: ${served.ok ? "ok" : `REFUSED (${served.error.slice(0, 120)})`}${notes.length > 0 ? ` [${notes.join("; ")}]` : ""}`,
    );
    index++;
    return served;
  };
  const request = async <T>(
    kind: RequestKind,
    turn: number,
    run: (current: Harness) => Promise<T>,
    resendsLeft = scenario.resends ?? 0,
  ): Promise<Served<T>> => {
    const served = await send(kind, turn, run);
    if (served.ok || resendsLeft === 0) return served;
    resent++;
    return request(kind, turn, run, resendsLeft - 1);
  };

  /** One turn: the user sends and waits for the call, the browser claims and finishes it, the user waits for the answer. */
  const runTurn = async (turn: number) => {
    const submitted = await request("submit", turn, async (current) => {
      const conversation =
        conversationId === undefined
          ? await current.root(context, {
              agent: { model: instances.A.model },
            })
          : await current.conversation(conversationId, context);
      if (conversation === undefined) throw new Error("No conversation.");
      conversationId = conversation.id;
      const submission = await conversation.submit(
        {
          type: "input",
          content: `Turn ${turn}: rename the net.`,
          requestId: `turn-${turn}`,
          whenBusy: "followUp",
        },
        context,
      );
      void submission.wait(context).then(
        (record) => submitOutcomes.push(`turn ${turn}: ${record.status}`),
        (error: unknown) =>
          submitOutcomes.push(`turn ${turn}: rejected ${String(error)}`),
      );
    });
    if (!submitted.ok) return;
    let call: BrowserCallRecord | undefined;
    const issued = await holdsWithin(async () => {
      call = (await storedCalls()).find(
        (record) => record.input.title === `Turn ${turn}`,
      );
      return call?.status === "pending";
    }, patienceMs);
    if (!issued || call === undefined) {
      log.push(`   turn ${turn}: no pending call within ${patienceMs} ms`);
      return;
    }
    const toolCallId = call.toolCallId;

    const claimed = await request("claim", turn, async (current) => {
      const claim = await claimBrowserCall(
        current,
        conversationId!,
        toolCallId,
        context,
      );
      if (claim === undefined) throw new Error("Not claimable.");
      return claim;
    });
    if (!claimed.ok) return;
    const claim = claimed.value;
    const finished = await request("finish", turn, async (current) => {
      const outcome = await finishBrowserCall(
        current,
        {
          conversationId: conversationId!,
          toolCallId,
          toolName: claim.toolName,
          capability: claim.capability,
          canonicalInput: claim.input,
          output: { applied: true, title: claim.input.title ?? null },
        },
        context,
      );
      if (outcome !== "settled") throw new Error(`Finish: ${outcome}.`);
    });
    if (!finished.ok) return;

    if (!(await holdsWithin(() => answered(turn), patienceMs))) {
      log.push(`   turn ${turn}: no answer within ${patienceMs} ms`);
    }
  };

  try {
    for (let turn = 1; turn <= turns; turn++) {
      // eslint-disable-next-line no-await-in-loop -- A turn follows the one before.
      await runTurn(turn);
    }
    const wallMs = Math.round(performance.now() - started);
    // Let anything still running in either instance land or fail.
    await delay(300);
    const sessions = {
      A: await instances.A.sessionState(),
      B: await instances.B.sessionState(),
    };
    const commitsByABeforeClose = instances.A.stats.commitsStored;
    const fenceFailuresBeforeClose =
      instances.A.stats.fenceFailures + instances.B.stats.fenceFailures;
    await Promise.all([instances.A.close(), instances.B.close()]);
    const commitsByAAfterClose = instances.A.stats.commitsStored;

    const entries = await storedEntries();
    const calls = await storedCalls();
    const liveTasks =
      conversationId === undefined
        ? []
        : (
            await observer.scanTasks(
              { conversationId },
              500,
              undefined,
              context,
            )
          ).items.filter(({ state }) => state.status !== "terminal");

    const results = new Map<string, number>();
    for (const entry of entries) {
      const message = entry.model?.[0];
      if (message?.role === "toolResult") {
        results.set(
          message.toolCallId,
          (results.get(message.toolCallId) ?? 0) + 1,
        );
      }
    }
    const toolCalls = entries.flatMap((entry) => {
      const message = entry.model?.[0];
      return message?.role === "assistant"
        ? message.content.filter((part) => part.type === "toolCall")
        : [];
    });
    const completed = Array.from(
      { length: turns },
      (_, offset) => offset + 1,
    ).filter((turn) =>
      entries.some(
        (entry) =>
          entry.kind === "pi.assistant" &&
          textOf(entry.model?.[0]).includes(`answered turn ${turn}.`),
      ),
    ).length;

    const transcript = entries.map(
      (entry) =>
        `${entry.id} ${entry.kind} ${textOf(entry.model?.[0]).slice(0, 60)}`,
    );
    const consistent =
      entries.length === turns * 4 &&
      Array.from({ length: turns }, (_, offset) => offset).every((offset) => {
        const turn = offset + 1;
        const [user, call, result, answer] = entries
          .slice(offset * 4, offset * 4 + 4)
          .map((entry) => entry.model?.[0]);
        const toolCall =
          call?.role === "assistant"
            ? call.content.find((part) => part.type === "toolCall")
            : undefined;
        return (
          user?.role === "user" &&
          textOf(user).startsWith(`Turn ${turn}:`) &&
          toolCall !== undefined &&
          (toolCall.arguments as JsonObject).title === `Turn ${turn}` &&
          result?.role === "toolResult" &&
          result.toolCallId === toolCall.id &&
          answer?.role === "assistant" &&
          textOf(answer).includes(`answered turn ${turn}.`)
        );
      });

    const perInstance = (instance: Instance) => ({
      ...instance.stats,
      modelRequests: instance.modelRequests(),
    });
    return {
      scenario: scenario.name,
      log,
      numbers: {
        turnsCompleted: completed,
        turnsLost: turns - completed,
        inputsRefused: log.filter(
          (line) => line.includes(" submit ") && line.includes("REFUSED"),
        ).length,
        requestsRefused: instances.A.stats.refused + instances.B.stats.refused,
        requestsResent: resent,
        refusedByStaleHarness,
        toolCallsIssued: toolCalls.length,
        toolCallsWithMoreThanOneResult: [...results.values()].filter(
          (count) => count > 1,
        ).length,
        browserCallsStranded: calls.filter(({ status }) => status !== "settled")
          .length,
        liveTasksLeft: liveTasks.length,
        reopens: instances.A.stats.reopens + instances.B.stats.reopens,
        fenceFailures: fenceFailuresBeforeClose,
        fenceFailuresOnClose:
          instances.A.stats.fenceFailures +
          instances.B.stats.fenceFailures -
          fenceFailuresBeforeClose,
        wallMs,
        modelRequests: {
          A: instances.A.modelRequests(),
          B: instances.B.modelRequests(),
        },
      },
      instances: { A: perInstance(instances.A), B: perInstance(instances.B) },
      sessionsAtEnd: sessions,
      submissionOutcomes: submitOutcomes,
      browserCalls: calls.map(
        ({ toolCallId, status, input }) =>
          `${toolCallId} ${JSON.stringify(input.title)} ${status}`,
      ),
      transcript,
      transcriptConsistent: consistent,
      commitsByAAfterBOpened:
        commitsByAAtBOpen === undefined
          ? undefined
          : {
              whileBOpened:
                commitsByAAtBOpen.opened - commitsByAAtBOpen.starting,
              afterBOpenedBeforeClose:
                commitsByABeforeClose - commitsByAAtBOpen.opened,
              afterBOpenedIncludingClose:
                commitsByAAfterClose - commitsByAAtBOpen.opened,
            },
      /** Whether every commit A stored precedes every commit B stored, in the database's commit order. */
      aCommitsPrecedeB:
        instances.A.stats.lastSeq === undefined ||
        instances.B.stats.firstSeq === undefined ||
        instances.A.stats.lastSeq < instances.B.stats.firstSeq,
    };
  } finally {
    await Promise.allSettled([
      instances.A.close(),
      instances.B.close(),
      observer.close(context),
    ]);
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
};

/** Run the affinity, alternating and rolling-deploy scenarios; required criteria go to `check`. */
export const runRoutingScenarios = async ({
  check,
  show,
}: {
  check: (criterion: string, pass: boolean) => void;
  show: (heading: string, value: unknown) => void;
}) => {
  const report = (outcome: ScenarioReport) => {
    print(`\n=== Scenario: ${outcome.scenario} ===`);
    for (const line of outcome.log) print(line);
    show(`${outcome.scenario}: numbers`, outcome.numbers);
    show(`${outcome.scenario}: detail`, {
      instances: outcome.instances,
      sessionsAtEnd: outcome.sessionsAtEnd,
      submissionOutcomes: outcome.submissionOutcomes,
      browserCalls: outcome.browserCalls,
      transcriptConsistent: outcome.transcriptConsistent,
      commitsByAAfterBOpened: outcome.commitsByAAfterBOpened,
      aCommitsPrecedeB: outcome.aCommitsPrecedeB,
      transcript: outcome.transcript,
    });
  };

  const affinity = await runScenario({
    name: "affinity",
    route: () => "A",
  });
  report(affinity);
  // Timing decides whether a stale instance meets the fence or answers from memory, so these run several times.
  const alternatingRuns: ScenarioReport[] = [];
  for (const variant of [
    { name: "alternating", resends: 0 },
    { name: "alternating, refused requests sent again", resends: 2 },
  ]) {
    for (let run = 1; run <= alternatingRepetitions; run++) {
      // eslint-disable-next-line no-await-in-loop -- Runs share the Postgres server; one at a time.
      const outcome = await runScenario({
        name: `${variant.name} (run ${run})`,
        route: (index) => (index % 2 === 0 ? "A" : "B"),
        resends: variant.resends,
      });
      if (run === 1) report(outcome);
      else {
        print(`\n=== Scenario: ${outcome.scenario} ===`);
        for (const line of outcome.log) print(line);
      }
      alternatingRuns.push(outcome);
    }
  }
  const rolling = await runScenario({
    name: "rolling deploy",
    // A serves turn 1 and turn 2's submit and claim; B opens with turn 2's call claimed and unfinished.
    route: (index) => (index < 5 ? "A" : "B"),
    openBefore: { index: 5, instance: "B" },
  });
  report(rolling);

  print("");
  check(
    "Affinity: all three turns complete with no fence failures",
    affinity.numbers.turnsCompleted === turns &&
      affinity.numbers.fenceFailures === 0,
  );
  check(
    "Rolling deploy: all three turns complete and the stored transcript is consistent",
    rolling.numbers.turnsCompleted === turns && rolling.transcriptConsistent,
  );
  check(
    "Rolling deploy: A stores no commit once B has opened, and every commit A stored precedes B's in commit order",
    rolling.commitsByAAfterBOpened?.afterBOpenedIncludingClose === 0 &&
      rolling.aCommitsPrecedeB,
  );
  for (const outcome of alternatingRuns) {
    print(
      `OBSERVED  ${outcome.scenario}: ${JSON.stringify(outcome.numbers)} transcriptConsistent=${String(outcome.transcriptConsistent)}`,
    );
  }
};
