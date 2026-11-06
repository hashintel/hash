/**
 * Probe: a read-only viewer of a Postgres session another Harness drives
 * (`HarnessOptions.readOnly`, Pi Durable 1.5.0).
 *
 * The owner opens a fresh schema and takes one input; the model calls the
 * waiting `setNetTitle`, so the owner's `pi.tool` task is running. A second
 * Harness opens the same schema read-only, on its own pool, and is checked
 * against the owner. Then the browser finishes the call through the owner,
 * the run answers, and the probe records how the viewer learns of those
 * commits: through its live watch, through fresh reads, or only by reopening.
 * Both Harnesses run in this process on separate pools, so they share
 * nothing but the database.
 *
 * Usage: `turbo run probe:postgres-viewer --filter @apps/durable-agents`, with
 * the compose Postgres up. No model is called; it takes a few seconds.
 * Required criteria are PASS or FAIL; the observations about how the viewer
 * sees later commits are reported as SEEN or NOT SEEN.
 */
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  type ConversationId,
  createRegistry,
  Harness,
  ReadOnlySession,
} from "@earendil-works/pi-durable";
import { Pool } from "pg";

import {
  BrowserCallsDoc,
  browserCallExtension,
  browserToolName,
} from "../../src/browser-call/browser-call";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";
import { actAsBrowser } from "../browser-call/proof/browser";
import { panelView } from "../browser-call/proof/panel-view";
import { print, until } from "../browser-call/proof/server-process";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../scripted-model";

import type { Models } from "@earendil-works/pi-ai/models";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const answer = "Renamed the net to Dryer queue.";

const open = async (schema: string, models: Models, readOnly: boolean) => {
  const registry = createRegistry();
  registry.install(browserCallExtension);
  return Harness.open(
    await openPostgresStorage({ pool: poolConfig, schema }),
    { models, registry, readOnly },
    context,
  );
};

const kinds = async (conversation: Conversation) =>
  (
    await conversation.entries({ order: "ascending" }, 100, undefined, context)
  ).items
    .filter(({ kind }) => kind !== "pi.system")
    .map(({ kind }) => kind);

const rejection = async (operation: () => unknown) => {
  try {
    await operation();
    return "accepted";
  } catch (error) {
    return error instanceof ReadOnlySession ? "ReadOnlySession" : String(error);
  }
};

const main = async () => {
  const schema = `pi_durable_probe_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ ...poolConfig, max: 1 });
  const results: { criterion: string; pass: boolean; required: boolean }[] = [];
  const check = (criterion: string, pass: boolean, required = true) => {
    results.push({ criterion, pass, required });
    print(
      `${required ? (pass ? "PASS" : "FAIL") : pass ? "SEEN" : "NOT SEEN"}  ${criterion}`,
    );
  };
  const show = (heading: string, value: unknown) =>
    print(`\n${heading}\n${JSON.stringify(value, null, 2)}`);
  try {
    const { models, model } = scriptedModel([
      fauxAssistantMessage(
        fauxToolCall(browserToolName, { title: "Dryer queue" }),
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage(answer),
    ]);
    const owner = await open(schema, models, false);
    const root = await owner.root(context, { agent: { model } });
    const submission = await root.submit(
      { type: "input", content: "Call the net Dryer queue." },
      context,
    );
    // Parked: the tool task runs, waiting on the call's task, whose doorbell sleeps.
    await until(async () => {
      const live = (await owner.inspect(context)).tasks.map(
        ({ record }) => record,
      );
      return (
        live.some(
          ({ kind, state }) => kind === "pi.tool" && state.status === "running",
        ) &&
        live.some(
          ({ kind, state }) =>
            kind === "brunch.browser-call.doorbell" &&
            state.status === "sleeping",
        )
      );
    });
    const ownerView = await panelView(owner, root, context);

    // The viewer opens while the owner's tool task is running.
    const viewer = await open(schema, scriptedModel([]).models, true);
    const viewed = (await viewer.conversation(
      root.id as ConversationId,
      context,
    ))!;
    const viewerView = await panelView(viewer, viewed, context);
    show("Owner's panel view", ownerView);
    if (!isDeepStrictEqual(viewerView, ownerView))
      show("Viewer's panel view", viewerView);
    const withoutSlots = (view: typeof ownerView) => ({
      ...view,
      tools: view.tools.map(({ slot: _slot, ...tool }) => tool),
    });
    check(
      "the viewer, opened mid-call, renders the owner's view: entries, tool call and arguments, pending call",
      isDeepStrictEqual(withoutSlots(viewerView), withoutSlots(ownerView)) &&
        viewerView.tools[0]?.browserCall?.status === "pending",
    );
    check(
      `the viewer shows the owner's running tool as running (owner: ${ownerView.tools[0]?.slot}, viewer: ${viewerView.tools[0]?.slot})`,
      viewerView.tools[0]?.slot === ownerView.tools[0]?.slot,
      false,
    );
    const writes = {
      submit: await rejection(() =>
        viewed.submit({ type: "input", content: "From the viewer." }, context),
      ),
      resume: await rejection(() => viewer.resume()),
      commit: await rejection(() =>
        viewer.commit(async (tx) => {
          const browserCalls = await tx.doc(BrowserCallsDoc, root.id);
          browserCalls.calls = {};
        }, context),
      ),
    };
    show("Viewer write attempts", writes);
    check(
      "the viewer's submit, resume and a document write reject with ReadOnlySession",
      writes.submit === "ReadOnlySession" &&
        writes.resume === "ReadOnlySession" &&
        writes.commit === "ReadOnlySession",
    );
    check("the viewer's wake is inactive", viewer.wake().active === false);

    // A live watch on the viewer, counting what it is told while the owner finishes the call.
    const watch = await viewed.watch(context);
    let watchCalls = 0;
    watch.start(async () => {
      watchCalls++;
    });
    const viewerCallsBefore = await viewer.snapshot(
      BrowserCallsDoc,
      root.id,
      context,
    );

    const browser = await actAsBrowser(
      owner,
      root.id,
      ownerView.tools[0]!.callId,
      context,
    );
    const settled = await submission.wait(context);
    const ownerKinds = await kinds(root);
    check(
      "the owner's run completes after the viewer opened: done, tool result, answer",
      browser.finished === "settled" &&
        settled.status === "done" &&
        isDeepStrictEqual(ownerKinds, [
          "pi.user",
          "pi.assistant",
          "pi.tool-result",
          "pi.assistant",
        ]),
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const watchedKinds = watch.value.entries
      .filter(({ kind }) => kind !== "pi.system")
      .map(({ kind }) => kind);
    await watch.stop();
    const freshKinds = await kinds(viewed);
    const freshCall = Object.values(
      (await viewer.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {},
    )[0]?.status;
    show("Viewer after the owner's later commits", {
      watchCalls,
      watchedKinds,
      freshEntryKinds: freshKinds,
      callBefore: Object.values(viewerCallsBefore?.calls ?? {})[0]?.status,
      callNow: freshCall,
    });
    check(
      "the viewer's live watch receives the owner's later commits",
      watchCalls > 0 && isDeepStrictEqual(watchedKinds, ownerKinds),
      false,
    );
    check(
      "the viewer's fresh entry read sees the owner's later entries",
      isDeepStrictEqual(freshKinds, ownerKinds),
      false,
    );
    check(
      "the viewer's document snapshot sees the call settled",
      freshCall === "settled",
      false,
    );
    await viewer.close(context);

    const reopened = await open(schema, scriptedModel([]).models, true);
    const reopenedKinds = await kinds(
      (await reopened.conversation(root.id, context))!,
    );
    check(
      "a reopened viewer sees everything the owner committed",
      isDeepStrictEqual(reopenedKinds, ownerKinds),
    );
    await reopened.close(context);
    await owner.close(context);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
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

await main();
