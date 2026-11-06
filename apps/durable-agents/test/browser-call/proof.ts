/**
 * Proofs 1 and 3 of the durable-agents spike: a browser tool call survives a
 * `SIGKILL` and a long absence, and a panel joining late renders it from
 * committed state.
 *
 * Usage: `turbo run proof:browser-call --filter @apps/durable-agents`.
 * No model is called (a scripted faux model answers); it takes a few seconds.
 *
 * Without arguments this is the driver. It runs two server processes over one
 * SQLite file: the first issues the call and is killed while the call is
 * pending; the second opens the file with its Harness clock 15 minutes ahead,
 * resumes, lets a "browser" claim and finish the call, and waits for the run
 * to answer. The driver checks the brief's pass criteria and exits non-zero
 * when one fails.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  type EntryRecord,
  Harness,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

import { browserToolMutatesDocument } from "@hashintel/brunch-agent";

import {
  BrowserCallsDoc,
  browserCallExtension,
  browserToolName,
} from "../../src/browser-call/browser-call";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../scripted-model";
import { actAsBrowser } from "./proof/browser";
import { fakeClock } from "./proof/fake-clock";
import { type PanelView, panelView } from "./proof/panel-view";

import type { Models } from "@earendil-works/pi-ai/models";

const context = BACKGROUND_CONTEXT;
const print = (text: string) => process.stdout.write(`${text}\n`);
const absenceMs = 15 * 60_000;
const title = "Dryer queue";
const answer = "Renamed the net to Dryer queue.";

// ─── Server processes ────────────────────────────────────────────────────────

/** One line the driver parses; everything else a server prints is shown as is. */
const report = (event: string, data: unknown) =>
  process.stdout.write(`@@${JSON.stringify({ event, data })}\n`);

const open = async (
  file: string,
  models: Models,
  clock: ReturnType<typeof fakeClock>,
) => {
  const registry = createRegistry();
  registry.install(browserCallExtension);
  return Harness.open(
    await openNodeSqliteStorage(file),
    { models, registry, now: clock.now, setTimer: clock.setTimer },
    context,
  );
};

/** Live tasks as an operator would list them. */
const tasks = async (harness: Harness) =>
  (await harness.inspect(context)).tasks.map(({ record, state }) => ({
    id: record.id,
    kind: record.kind,
    owner: record.owner ?? null,
    status: record.state.status,
    restarts: record.restarts ?? 0,
    until: state.kind === "sleeping" ? state.until : undefined,
    on: state.kind === "waiting" ? state.on : undefined,
  }));

/** Poll `check` every 10 ms for up to 5 s. */
const until = async (
  check: () => Promise<boolean>,
  triesLeft = 500,
): Promise<void> => {
  if (await check()) return;
  if (triesLeft === 0)
    throw new Error("Timed out waiting for the browser call.");
  await new Promise((resolve) => setTimeout(resolve, 10));
  return until(check, triesLeft - 1);
};

/** The call is issued, its task waits on its doorbell, and the doorbell sleeps. */
const callIsParked = async (harness: Harness) => {
  const live = await tasks(harness);
  return (
    live.some(
      ({ kind, status }) =>
        kind === "brunch.browser-call" && status === "waiting",
    ) &&
    live.some(
      ({ kind, status }) =>
        kind === "brunch.browser-call.doorbell" && status === "sleeping",
    ) &&
    live.some(({ kind, status }) => kind === "pi.tool" && status === "running")
  );
};

const issue = async (file: string) => {
  const clock = fakeClock(0);
  const { models, model, state } = scriptedModel([
    fauxAssistantMessage(fauxToolCall(browserToolName, { title }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(answer),
  ]);
  const harness = await open(file, models, clock);
  const root = await harness.root(context, { agent: { model } });
  const submission = await root.submit(
    { type: "input", content: "Call the net Dryer queue.", requestId: "proof" },
    context,
  );
  await until(() => callIsParked(harness));
  const calls = (await harness.snapshot(BrowserCallsDoc, root.id, context))
    ?.calls;
  report("issued", {
    conversationId: root.id,
    submissionId: submission.id,
    clock: clock.now(),
    requests: state.callCount,
    records: Object.values(calls ?? {}),
    tasks: await tasks(harness),
    wake: harness.wake(),
    view: await panelView(harness, root, context),
  });
  // Hold the storage open, mid-call, until the driver kills this process.
  setInterval(() => undefined, 60_000);
};

const transcriptOf = async (harness: Harness, conversationId: ConversationId) =>
  (
    await (await harness.conversation(conversationId, context))!.entries(
      { order: "ascending" },
      100,
      undefined,
      context,
    )
  ).items;

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

const resume = async (
  file: string,
  conversationId: ConversationId,
  submissionId: SubmissionId,
) => {
  const clock = fakeClock(absenceMs);
  // Only the answer after the browser result is left to give.
  const { models, state } = scriptedModel([fauxAssistantMessage(answer)]);
  const harness = await open(file, models, clock);
  const root = (await harness.conversation(conversationId, context))!;
  const reopened = await panelView(harness, root, context);
  harness.resume();
  // Reported either way, so a call that does not park again fails a criterion instead of the run.
  const parked = await until(() => callIsParked(harness)).then(
    () => true,
    () => false,
  );
  // Time for anything the restart would wrongly start, such as a model request, to start.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const calls = (await harness.snapshot(BrowserCallsDoc, root.id, context))
    ?.calls;
  report("resumed", {
    parked,
    clock: clock.now(),
    requests: state.callCount,
    records: Object.values(calls ?? {}),
    tasks: await tasks(harness),
    reopened,
    view: await panelView(harness, root, context),
  });

  const pending = Object.values(calls ?? {}).find(
    ({ status }) => status === "pending",
  );
  if (pending !== undefined)
    report(
      "browser",
      await actAsBrowser(harness, conversationId, pending.toolCallId, context),
    );

  const settled = await (await harness.submission(submissionId, context))!.wait(
    context,
  );
  const transcript = (await transcriptOf(harness, conversationId))
    .filter(({ kind }) => kind !== "pi.system")
    .map((entry) => {
      const message = entry.model?.[0];
      return {
        kind: entry.kind,
        toolCalls:
          message?.role === "assistant"
            ? message.content.flatMap((part) =>
                part.type === "toolCall"
                  ? [
                      {
                        id: part.id,
                        name: part.name,
                        arguments: part.arguments,
                      },
                    ]
                  : [],
              )
            : undefined,
        toolCallId:
          message?.role === "toolResult" ? message.toolCallId : undefined,
        isError: message?.role === "toolResult" ? message.isError : undefined,
        text: textOf(entry),
      };
    });
  report("done", {
    settled: { status: settled.status },
    requests: state.callCount,
    records: Object.values(
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {},
    ),
    tasks: await tasks(harness),
    transcript,
  });
  await harness.close(context);
};

// ─── Driver ─────────────────────────────────────────────────────────────────

type Reports = Record<string, Record<string, unknown>>;

/** Run one server process, echo its output, and collect its reports; `killOn` SIGKILLs it at that report. */
const runServer = (label: string, args: string[], killOn?: string) =>
  new Promise<{ reports: Reports; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [...process.execArgv, fileURLToPath(import.meta.url), ...args],
        { stdio: ["ignore", "pipe", "inherit"] },
      );
      const reports: Reports = {};
      createInterface({ input: child.stdout }).on("line", (line) => {
        if (!line.startsWith("@@")) {
          print(`  [${label}] ${line}`);
          return;
        }
        const { event, data } = JSON.parse(line.slice(2)) as {
          event: string;
          data: Record<string, unknown>;
        };
        reports[event] = data;
        print(`  [${label}] reported ${event}`);
        if (event === killOn) {
          print(`  [${label}] SIGKILL pid ${child.pid}`);
          child.kill("SIGKILL");
        }
      });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal === null && code !== 0)
          reject(new Error(`${label} exited with ${code}`));
        else resolve({ reports, signal });
      });
    },
  );

const show = (heading: string, value: unknown) =>
  print(`\n${heading}\n${JSON.stringify(value, null, 2)}`);

const drive = async () => {
  const directory = await mkdtemp(join(tmpdir(), "durable-agents-browser-"));
  const file = join(directory, "session.sqlite");
  const results: { criterion: string; pass: boolean }[] = [];
  const check = (criterion: string, pass: boolean) => {
    results.push({ criterion, pass });
    print(`${pass ? "PASS" : "FAIL"}  ${criterion}`);
  };
  try {
    print(
      `Tool ${browserToolName}: browserToolMutatesDocument = ${browserToolMutatesDocument(browserToolName)}`,
    );
    print(`SQLite storage: ${file}\n`);

    print("(a, b) Server 1 issues the call; the driver kills it mid-call");
    const first = await runServer("server-1", ["issue", file], "issued");
    const issued = first.reports.issued!;
    show("Server 1, call issued and unclaimed: records", issued.records);
    show("Server 1: live tasks", issued.tasks);
    show("Server 1: harness.wake() while the call waits", issued.wake);
    show(
      "Proof 3, panel view in server 1 (call pending, unclaimed)",
      issued.view,
    );

    print(
      `\n(c) Absence: server 2's Harness clock (HarnessOptions.now/setTimer, fake) starts ${absenceMs / 60_000} minutes ahead of server 1's`,
    );
    print("(d) Server 2 reopens the storage and resumes");
    const second = await runServer("server-2", [
      "resume",
      file,
      String(issued.conversationId),
      String(issued.submissionId),
    ]);
    const { resumed, browser, done } = second.reports;
    show("Server 2, after resume, before any claim: records", resumed!.records);
    show("Server 2: live tasks", resumed!.tasks);
    show(
      "Proof 3, panel view in server 2 after reopen, before resume",
      resumed!.reopened,
    );
    show(
      "Proof 3, panel view in server 2 after resume, before any claim",
      resumed!.view,
    );
    show("(e) Browser: claim and finish", browser);
    show("(f) Server 2: settlement and transcript", {
      settled: done!.settled,
      transcript: done!.transcript,
      records: done!.records,
      liveTasks: done!.tasks,
    });

    print("\nCriteria");
    const issuedView = issued.view as PanelView;
    const resumedView = resumed!.view as PanelView;
    const issuedCall = issuedView.tools.at(0);
    const resumedCall = resumedView.tools.at(0);
    const issuedRecord = (issued.records as { issuedAt: number }[]).at(0);
    const transcript = done!.transcript as {
      kind: string;
      toolCallId?: string;
      isError?: boolean;
      text: string;
    }[];
    const toolResults = transcript.filter(
      ({ kind }) => kind === "pi.tool-result",
    );
    const toolResult = toolResults.at(0);
    const browserTasks = (records: unknown) =>
      (records as { task: number }[]).map(({ task }) => task);

    check(
      "(b) server 1 was killed with SIGKILL mid-call",
      first.signal === "SIGKILL",
    );
    check(
      "(a) server 1 issued one call, unclaimed, after one model request",
      issued.requests === 1 &&
        issuedCall?.browserCall?.status === "pending" &&
        issuedView.tools.length === 1,
    );
    check(
      "(c) server 2's Harness clock is at least 10 minutes past the issue",
      Number(resumed!.clock) - (issuedRecord?.issuedAt ?? Infinity) >=
        10 * 60_000,
    );
    check(
      "(d) after restart the same tool call ID is pending, not interrupted",
      resumed!.parked === true &&
        resumedCall?.callId === issuedCall?.callId &&
        resumedCall?.browserCall?.status === "pending" &&
        resumedCall.slot === "running" &&
        !resumedView.transcript.some(({ kind }) => kind === "pi.tool-result"),
    );
    check(
      "(d) no duplicate issue: one call record, the same browser-call task",
      isDeepStrictEqual(
        browserTasks(resumed!.records),
        browserTasks(issued.records),
      ) && (resumed!.records as unknown[]).length === 1,
    );
    check(
      "(d) no model request after restart before the claim",
      resumed!.requests === 0,
    );
    check(
      "(e) the browser claimed once and finished the call",
      browser?.finished === "settled" && browser.secondClaim === null,
    );
    check(
      "(f) the submission settles done after one more model request",
      (done!.settled as { status: string }).status === "done" &&
        done!.requests === 1,
    );
    check(
      "(f) exactly two assistant entries and one tool result",
      transcript.filter(({ kind }) => kind === "pi.assistant").length === 2 &&
        toolResults.length === 1,
    );
    check(
      "(f) the tool result is the browser's result for the same call, not an error",
      toolResult?.toolCallId === issuedCall?.callId &&
        toolResult?.isError === false &&
        isDeepStrictEqual(JSON.parse(toolResult.text), browser?.output),
    );
    // Since 1.5.0 a reopened Harness shows the tool slot `pending` until `resume()` reserves its task again; the rest of the
    // view, the browser call's record included, is as committed.
    const withoutSlots = (view: PanelView) => ({
      ...view,
      tools: view.tools.map(({ slot: _slot, ...tool }) => tool),
    });
    check(
      "Proof 3: the panel views before the kill and after reopen agree (call ID, arguments, pending, entries)",
      isDeepStrictEqual(issuedView, resumedView) &&
        isDeepStrictEqual(
          withoutSlots(issuedView),
          withoutSlots(resumed!.reopened as PanelView),
        ) &&
        isDeepStrictEqual(issuedCall?.arguments, { title }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const failed = results.filter(({ pass }) => !pass).length;
  print(
    failed === 0
      ? `\nAll ${results.length} criteria pass.`
      : `\n${failed} of ${results.length} criteria fail.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
};

const [role, ...args] = process.argv.slice(2);
if (role === "issue") await issue(args[0]!);
else if (role === "resume")
  await resume(
    args[0]!,
    Number(args[1]) as ConversationId,
    Number(args[2]) as SubmissionId,
  );
else await drive();
