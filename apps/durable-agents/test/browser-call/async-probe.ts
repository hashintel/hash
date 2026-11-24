/* oxlint-disable eslint/no-await-in-loop -- Server processes run one after another. */
/**
 * Probe: does an asynchronous browser call let the Harness go idle while the
 * browser is away, and survive repeated kills, where the waiting tool call
 * cannot? Both variants run the same sequence over SQLite:
 *
 * 1. Server 1 takes one input; the model calls `setNetTitle`. The sync tool
 *    waits for the browser; the async tool returns "started" and the run
 *    answers. Server 1 reports `harness.wake()` and is SIGKILLed.
 * 2. Five more servers each reopen the file on a clock 15 minutes ahead,
 *    resume, report, and are SIGKILLed: six kills in all, one past the
 *    default `restartLimit` of 5.
 * 3. A last server resumes, a "browser" claims and finishes the call, and the
 *    run that delivers the result answers.
 *
 * A third variant, `sync-unlimited`, runs the waiting tool with
 * `settings.restartLimit: Infinity`, to see whether the waiting call then
 * survives every kill.
 *
 * Usage: `turbo run probe:async-browser-call --filter @apps/durable-agents`.
 * No model is called (a scripted faux model answers); it takes about 30 s.
 * Async and sync-unlimited criteria must pass; sync lines characterise the
 * waiting tool's behaviour under the same kills and are reported, not required.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  type EntryRecord,
  Harness,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

import {
  asyncBrowserCallExtension,
  browserResultEntryKind,
  finishAsyncBrowserCall,
} from "../../src/browser-call/async-browser-call";
import {
  type BrowserCallRecord,
  BrowserCallsDoc,
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
} from "../../src/browser-call/browser-call";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../scripted-model";
import { actAsBrowser } from "./proof/browser";
import { fakeClock } from "./proof/fake-clock";
import { print, report, runServer, until } from "./proof/server-process";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

type Variant = "sync" | "async" | "sync-unlimited";

/** Both sync variants run the waiting tool; they differ only in `restartLimit`. */
const waits = (variant: Variant) => variant !== "async";

const context = BACKGROUND_CONTEXT;
const absenceMs = 15 * 60_000;
const kills = 6;
const title = "Dryer queue";
const waiting =
  "I've asked the panel to rename the net; I'll confirm when it reports back.";
const answer = "Renamed the net to Dryer queue.";
const script = fileURLToPath(import.meta.url);

// ─── Server processes ────────────────────────────────────────────────────────

const open = async (
  file: string,
  variant: Variant,
  offsetMs: number,
  responses: FauxResponseStep[],
) => {
  const clock = fakeClock(offsetMs);
  const { models, model, state } = scriptedModel(responses);
  const registry = createRegistry();
  registry.install(
    waits(variant) ? browserCallExtension : asyncBrowserCallExtension,
  );
  const harness = await Harness.open(
    await openNodeSqliteStorage(file),
    {
      models,
      registry,
      now: clock.now,
      setTimer: clock.setTimer,
      ...(variant === "sync-unlimited"
        ? { settings: { restartLimit: Infinity } }
        : {}),
    },
    context,
  );
  return { harness, model, state, clock };
};

const tasks = async (harness: Harness) =>
  (await harness.inspect(context)).tasks.map(({ record, state }) => ({
    id: record.id,
    kind: record.kind,
    status: record.state.status,
    restarts: record.restarts ?? 0,
    scheduler: state.kind,
  }));

const records = async (harness: Harness, conversationId: ConversationId) =>
  Object.values(
    (await harness.snapshot(BrowserCallsDoc, conversationId, context))?.calls ??
      {},
  );

const textOf = (entry: EntryRecord) =>
  (entry.model ?? [])
    .flatMap((message) =>
      typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          ),
    )
    .join("");

const transcript = async (harness: Harness, conversationId: ConversationId) =>
  (
    await (await harness.conversation(conversationId, context))!.entries(
      { order: "ascending" },
      100,
      undefined,
      context,
    )
  ).items
    .filter(({ kind }) => kind !== "pi.system")
    .map((entry) => {
      const message = entry.model?.[0];
      return {
        kind: entry.kind,
        role: message?.role,
        toolCalls:
          message?.role === "assistant"
            ? message.content.flatMap((part) =>
                part.type === "toolCall" ? [part.name] : [],
              )
            : undefined,
        isError: message?.role === "toolResult" ? message.isError : undefined,
        text: textOf(entry).slice(0, 140),
      };
    });

/** Settle time for anything a reopen would wrongly start, such as a model request. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

/** The sync tool's call is back to waiting: its `pi.tool` task runs again. */
const toolRunning = async (harness: Harness) =>
  (await tasks(harness)).some(
    ({ kind, status }) => kind === "pi.tool" && status === "running",
  );

const issue = async (file: string, variant: Variant) => {
  const { harness, model, state } = await open(file, variant, 0, [
    fauxAssistantMessage(fauxToolCall(browserToolName, { title }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(waits(variant) ? answer : waiting),
  ]);
  const root = await harness.root(context, { agent: { model } });
  const submission = await root.submit(
    { type: "input", content: "Call the net Dryer queue.", requestId: "probe" },
    context,
  );
  const settled =
    variant === "async"
      ? (await submission.wait(context)).status
      : await until(() => toolRunning(harness)).then(() => "waiting");
  report("issued", {
    conversationId: root.id,
    submissionId: submission.id,
    settled,
    requests: state.callCount,
    records: await records(harness, root.id),
    tasks: await tasks(harness),
    wake: harness.wake(),
    transcript: await transcript(harness, root.id),
  });
  setInterval(() => undefined, 60_000);
};

const reopen = async (
  file: string,
  variant: Variant,
  conversationId: ConversationId,
) => {
  // No answers: a model request here is a criterion failure, counted and reported.
  const { harness, state } = await open(file, variant, absenceMs, []);
  harness.resume();
  if (waits(variant))
    await until(() => toolRunning(harness)).catch(() => undefined);
  await settle();
  report("reopened", {
    requests: state.callCount,
    records: await records(harness, conversationId),
    tasks: await tasks(harness),
    wake: harness.wake(),
    transcript: await transcript(harness, conversationId),
  });
  setInterval(() => undefined, 60_000);
};

const finish = async (
  file: string,
  variant: Variant,
  conversationId: ConversationId,
  submissionId: SubmissionId,
) => {
  const { harness, state } = await open(file, variant, absenceMs, [
    fauxAssistantMessage(answer),
  ]);
  harness.resume();
  if (waits(variant))
    await until(() => toolRunning(harness)).catch(() => undefined);
  await settle();
  const before = {
    requests: state.callCount,
    records: await records(harness, conversationId),
    wake: harness.wake(),
    toolResults: (await transcript(harness, conversationId)).filter(
      ({ kind }) => kind === "pi.tool-result",
    ).length,
  };
  const pending = (before.records as BrowserCallRecord[]).find(
    ({ status }) => status === "pending",
  );
  let browser: unknown = null;
  let waitFor: SubmissionId | undefined = waits(variant)
    ? submissionId
    : undefined;
  if (pending !== undefined && waits(variant)) {
    browser = await actAsBrowser(
      harness,
      conversationId,
      pending.toolCallId,
      context,
    );
  } else if (pending !== undefined) {
    const claim = (await claimBrowserCall(
      harness,
      conversationId,
      pending.toolCallId,
      context,
    ))!;
    const output = { applied: true, title: claim.input.title ?? null };
    const finished = await finishAsyncBrowserCall(
      harness,
      {
        conversationId,
        toolCallId: pending.toolCallId,
        toolName: claim.toolName,
        capability: claim.capability,
        canonicalInput: claim.input,
        output,
      },
      context,
    );
    browser = { output, finished };
    if (finished.status === "settled") waitFor = finished.submissionId;
  }
  const settled =
    waitFor === undefined
      ? null
      : (await (await harness.submission(waitFor, context))!.wait(context))
          .status;
  await settle();
  report("done", {
    before,
    browser,
    settled,
    requests: state.callCount,
    records: await records(harness, conversationId),
    tasks: await tasks(harness),
    wake: harness.wake(),
    transcript: await transcript(harness, conversationId),
  });
  await harness.close(context);
};

// ─── Driver ─────────────────────────────────────────────────────────────────

type Wake = { active: boolean; at?: number };
type TaskRow = { kind: string; status: string; restarts: number };
type Row = {
  kind: string;
  role?: string;
  toolCalls?: string[];
  isError?: boolean;
  text: string;
};

const runVariant = async (variant: Variant) => {
  const directory = await mkdtemp(join(tmpdir(), `durable-agents-${variant}-`));
  const file = join(directory, "session.sqlite");
  try {
    print(`\n=== ${variant} ===`);
    const issued = (
      await runServer(
        script,
        `${variant} server-1`,
        ["issue", file, variant],
        "issued",
      )
    ).reports.issued!;
    const conversationId = String(issued.conversationId);
    const rounds = [];
    for (let round = 2; round <= kills; round++) {
      rounds.push(
        (
          await runServer(
            script,
            `${variant} server-${round}`,
            ["reopen", file, variant, conversationId],
            "reopened",
          )
        ).reports.reopened!,
      );
    }
    const done = (
      await runServer(script, `${variant} server-${kills + 1}`, [
        "finish",
        file,
        variant,
        conversationId,
        String(issued.submissionId),
      ])
    ).reports.done!;
    return { issued, rounds, done };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const drive = async () => {
  const results: { criterion: string; pass: boolean; required: boolean }[] = [];
  const check = (criterion: string, pass: boolean, required = true) => {
    results.push({ criterion, pass, required });
    print(
      `${required ? (pass ? "PASS" : "FAIL") : pass ? "SEEN" : "NOT SEEN"}  ${criterion}`,
    );
  };
  const show = (heading: string, value: unknown) =>
    print(`\n${heading}\n${JSON.stringify(value, null, 2)}`);

  const sync = await runVariant("sync");
  const async_ = await runVariant("async");
  const unlimited = await runVariant("sync-unlimited");

  for (const [variant, run] of [
    ["sync", sync],
    ["async", async_],
    ["sync-unlimited", unlimited],
  ] as const) {
    show(`${variant}: server 1 wake, tasks, records`, {
      wake: run.issued.wake,
      tasks: run.issued.tasks,
      records: run.issued.records,
    });
    show(
      `${variant}: per reopen (kills 2..${kills}): wake, requests, restarts by task kind`,
      run.rounds.map((round) => ({
        wake: round.wake,
        requests: round.requests,
        restarts: (round.tasks as TaskRow[]).map(
          ({ kind, status, restarts }) => `${kind}:${status}:${restarts}`,
        ),
        record: (round.records as BrowserCallRecord[]).map(
          ({ status }) => status,
        ),
      })),
    );
    show(`${variant}: last server, before the browser`, run.done.before);
    show(`${variant}: browser`, run.done.browser);
    show(`${variant}: transcript at the end`, run.done.transcript);
    show(`${variant}: wake at the end`, run.done.wake);
  }

  print("\nAsync criteria");
  const issuedRecord = (async_.issued.records as BrowserCallRecord[])[0];
  const issuedWake = async_.issued.wake as Wake;
  check(
    "server 1: the run settles done after two model requests, the call pending",
    async_.issued.settled === "done" &&
      async_.issued.requests === 2 &&
      issuedRecord?.status === "pending",
  );
  check(
    "server 1: wake is inactive while the call is pending, due at its expiry",
    issuedWake.active === false && issuedWake.at === issuedRecord?.expiresAt,
  );
  check(
    `reopens 2..${kills}: wake inactive, no model request, call pending, no task restarted`,
    async_.rounds.every(
      (round) =>
        (round.wake as Wake).active === false &&
        round.requests === 0 &&
        (round.records as BrowserCallRecord[])[0]?.status === "pending" &&
        (round.tasks as TaskRow[]).every(({ restarts }) => restarts === 0),
    ),
  );
  const asyncBefore = async_.done.before as { requests: number; wake: Wake };
  check(
    `last server: no model request before the browser acts (after ${kills} kills)`,
    asyncBefore.requests === 0 && asyncBefore.wake.active === false,
  );
  const asyncBrowser = async_.done.browser as {
    finished: { status: string; submissionId?: number };
  };
  check(
    "the finish commits the result and admits it as input in one commit",
    asyncBrowser.finished.status === "settled" &&
      typeof asyncBrowser.finished.submissionId === "number",
  );
  check(
    "the delivering run settles done after one model request",
    async_.done.settled === "done" && async_.done.requests === 1,
  );
  const rows = async_.done.transcript as Row[];
  check(
    "transcript: user, tool call, started result, waiting answer, browser result, final answer",
    JSON.stringify(rows.map(({ kind }) => kind)) ===
      JSON.stringify([
        "pi.user",
        "pi.assistant",
        "pi.tool-result",
        "pi.assistant",
        browserResultEntryKind,
        "pi.assistant",
      ]) &&
      rows[2]?.isError === false &&
      rows[4]?.role === "user" &&
      rows[5]?.text === answer,
  );
  check(
    "the end: the record is settled and wake has nothing left to do",
    (async_.done.records as BrowserCallRecord[])[0]?.status === "settled" &&
      (async_.done.wake as Wake).active === false &&
      (async_.done.wake as Wake).at === undefined,
  );

  print("\nSync characterisation (reported, not required)");
  check(
    "server 1: wake is active while the tool waits",
    (sync.issued.wake as Wake).active,
    false,
  );
  const toolRestarts = sync.rounds.map(
    (round) =>
      (round.tasks as TaskRow[]).find(({ kind }) => kind === "pi.tool")
        ?.restarts ?? null,
  );
  print(
    `  pi.tool restarts after each reopen: ${JSON.stringify(toolRestarts)}`,
  );
  const syncRows = sync.done.transcript as Row[];
  const toolResult = syncRows.find(({ kind }) => kind === "pi.tool-result");
  check(
    `after ${kills} kills the waiting call ended with an error result before the browser acted`,
    toolResult?.isError === true && sync.done.browser === null,
    false,
  );
  if (toolResult !== undefined)
    print(`  sync tool result: ${JSON.stringify(toolResult)}`);

  print("\nSync-unlimited criteria (restartLimit: Infinity)");
  print(
    `  pi.tool restarts after each reopen: ${JSON.stringify(
      unlimited.rounds.map(
        (round) =>
          (round.tasks as TaskRow[]).find(({ kind }) => kind === "pi.tool")
            ?.restarts ?? null,
      ),
    )}`,
  );
  print(
    `  wake after each reopen: ${JSON.stringify(
      unlimited.rounds.map((round) => round.wake),
    )}`,
  );
  const unlimitedBefore = unlimited.done.before as {
    requests: number;
    records: BrowserCallRecord[];
    wake: Wake;
    toolResults: number;
  };
  check(
    `after ${kills} kills the call is still pending, no tool result, no model request`,
    unlimitedBefore.records[0]?.status === "pending" &&
      unlimitedBefore.toolResults === 0 &&
      unlimitedBefore.requests === 0 &&
      unlimited.rounds.every(
        (round) =>
          round.requests === 0 &&
          (round.records as BrowserCallRecord[])[0]?.status === "pending",
      ),
  );
  const unlimitedBrowser = unlimited.done.browser as {
    finished?: unknown;
  } | null;
  check(
    "the browser claims and finishes the call",
    unlimitedBrowser !== null &&
      unlimitedBrowser.finished !== undefined &&
      (unlimited.done.records as BrowserCallRecord[])[0]?.status === "settled",
  );
  check(
    "the run settles done after one more model request",
    unlimited.done.settled === "done" && unlimited.done.requests === 1,
  );
  const unlimitedRows = unlimited.done.transcript as Row[];
  check(
    "transcript: user, tool call, browser's tool result, answer",
    JSON.stringify(unlimitedRows.map(({ kind }) => kind)) ===
      JSON.stringify([
        "pi.user",
        "pi.assistant",
        "pi.tool-result",
        "pi.assistant",
      ]) &&
      unlimitedRows[1]?.toolCalls?.[0] === browserToolName &&
      unlimitedRows[2]?.isError === false &&
      unlimitedRows[3]?.text === answer,
  );
  print(
    `  wake at the end: ${JSON.stringify(unlimited.done.wake)}; seen active while waiting: ${String(
      unlimited.rounds.every((round) => (round.wake as Wake).active),
    )}`,
  );

  const failed = results.filter(
    ({ required, pass }) => required && !pass,
  ).length;
  const required = results.filter(
    ({ required: isRequired }) => isRequired,
  ).length;
  print(
    failed === 0
      ? `\nAll ${required} required criteria pass.`
      : `\n${failed} of ${required} required criteria fail.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
};

const [role, file, variant, ...args] = process.argv.slice(2);
if (role === "issue") await issue(file!, variant as Variant);
else if (role === "reopen")
  await reopen(file!, variant as Variant, Number(args[0]) as ConversationId);
else if (role === "finish")
  await finish(
    file!,
    variant as Variant,
    Number(args[0]) as ConversationId,
    Number(args[1]) as SubmissionId,
  );
else await drive();
