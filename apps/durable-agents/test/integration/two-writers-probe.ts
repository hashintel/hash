/**
 * Probe: two writable Harnesses on one Postgres schema, the case Pi
 * Durable's "one process owns a storage" contract leaves unguarded.
 *
 * Harness A takes one input; the model calls the waiting `setNetTitle`, so
 * A's `pi.tool` task is running. Harness B then opens the same schema
 * writable on its own pool and resumes, as a second server would after a
 * routing mistake or a failover that did not stop A. The browser finishes
 * the call through B. Then A and B each take one more input at once. Both
 * Harnesses run in this process on separate pools, so they share nothing
 * but the database.
 *
 * The probe reports what each Harness and the storage end up with; a fresh
 * read-only Harness reads the stored transcript at the end.
 *
 * Usage: `turbo run probe:two-writers --filter @apps/durable-agents`, with
 * the compose Postgres up. No model is called; it takes a few seconds.
 */
import { randomUUID } from "node:crypto";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { Pool } from "pg";

import {
  browserCallExtension,
  browserToolName,
} from "../../src/browser-call/browser-call";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";
import { actAsBrowser } from "../browser-call/proof/browser";
import { print, until } from "../browser-call/proof/server-process";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../scripted-model";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();

const open = async (
  schema: string,
  responses: FauxResponseStep[],
  readOnly = false,
) => {
  const { models, model, state } = scriptedModel(responses);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  const harness = await Harness.open(
    await openPostgresStorage({ pool: poolConfig, schema }),
    { models, registry, readOnly },
    context,
  );
  return { harness, model, state };
};

/** How a Harness's session ended so far, without waiting for it. */
const sessionState = async (harness: Harness) => {
  const ended = await Promise.race([
    harness.closed.then((end) => end),
    new Promise<undefined>((resolve) => setTimeout(resolve, 50)),
  ]);
  if (ended === undefined) return "open";
  const error = (ended as { error?: unknown }).error;
  const cause = error instanceof Error ? error.cause : undefined;
  return `${(ended as { kind: string }).kind}: ${String(error)}${cause instanceof Error ? ` (cause: ${cause.message})` : ""}`;
};

const liveTasks = async (harness: Harness) =>
  (await harness.inspect(context)).tasks.map(
    ({ record }) =>
      `${record.id} ${record.kind} ${record.state.status} restarts=${record.restarts ?? 0}`,
  );

const settleWithin = async (promise: Promise<unknown>, ms: number) =>
  Promise.race([
    promise.then(
      (value) => ({ settled: value }),
      (error: unknown) => ({ rejected: String(error) }),
    ),
    new Promise((resolve) => setTimeout(() => resolve("still waiting"), ms)),
  ]);

const main = async () => {
  const schema = `pi_durable_probe_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ ...poolConfig, max: 1 });
  const show = (heading: string, value: unknown) =>
    print(`\n${heading}\n${JSON.stringify(value, null, 2)}`);
  try {
    const a = await open(schema, [
      fauxAssistantMessage(
        fauxToolCall(browserToolName, { title: "Dryer queue" }),
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage("A: renamed the net."),
      fauxAssistantMessage("A: second answer."),
    ]);
    const rootA = await a.harness.root(context, { agent: { model: a.model } });
    const first = await rootA.submit(
      { type: "input", content: "Call the net Dryer queue." },
      context,
    );
    await until(async () =>
      (await a.harness.inspect(context)).tasks.some(
        ({ record }) =>
          record.kind === "brunch.browser-call.doorbell" &&
          record.state.status === "sleeping",
      ),
    );
    show("A, call parked: live tasks", await liveTasks(a.harness));

    const b = await open(schema, [
      fauxAssistantMessage("B: renamed the net."),
      fauxAssistantMessage("B: second answer."),
    ]);
    b.harness.resume();
    await new Promise((resolve) => setTimeout(resolve, 500));
    show("After B opens and resumes", {
      a: {
        session: await sessionState(a.harness),
        tasks: await liveTasks(a.harness).catch(String),
      },
      b: {
        session: await sessionState(b.harness),
        tasks: await liveTasks(b.harness).catch(String),
      },
    });

    const rootB = (await b.harness.conversation(rootA.id, context))!;
    const callId = (await rootB.watch(context)).value.docs["pi.live"] as {
      tools?: { callId: string }[];
    };
    const browser = await actAsBrowser(
      b.harness,
      rootA.id,
      callId.tools![0]!.callId,
      context,
    ).catch((error: unknown) => String(error));
    const firstSettled = await settleWithin(first.wait(context), 3000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    show("After the browser finishes through B", {
      browser,
      firstSubmissionOnA: firstSettled,
      a: {
        session: await sessionState(a.harness),
        requests: a.state.callCount,
      },
      b: {
        session: await sessionState(b.harness),
        requests: b.state.callCount,
      },
    });

    const both = await Promise.all([
      settleWithin(
        rootA
          .submit(
            { type: "input", content: "A asks again.", whenBusy: "followUp" },
            context,
          )
          .then((submission) => submission.wait(context)),
        3000,
      ),
      settleWithin(
        rootB
          .submit(
            { type: "input", content: "B asks again.", whenBusy: "followUp" },
            context,
          )
          .then((submission) => submission.wait(context)),
        3000,
      ),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    show("After A and B each take one more input", {
      a: {
        submission: both[0],
        session: await sessionState(a.harness),
        requests: a.state.callCount,
      },
      b: {
        submission: both[1],
        session: await sessionState(b.harness),
        requests: b.state.callCount,
      },
    });

    await Promise.allSettled([
      a.harness.close(context),
      b.harness.close(context),
    ]);
    const reader = await open(schema, [], true);
    const stored = (
      await (await reader.harness.conversation(rootA.id, context))!.entries(
        { order: "ascending" },
        100,
        undefined,
        context,
      )
    ).items
      .filter(({ kind }) => kind !== "pi.system")
      .map((entry) => {
        const message = entry.model?.[0];
        const text =
          message === undefined
            ? ""
            : typeof message.content === "string"
              ? message.content
              : message.content
                  .map((part) =>
                    part.type === "text" ? part.text : `[${part.type}]`,
                  )
                  .join("");
        return `${entry.id} ${entry.kind} ${text.slice(0, 90)}`;
      });
    show("Stored transcript, read afterwards", stored);
    show("Stored live tasks, read afterwards", await liveTasks(reader.harness));
    await reader.harness.close(context);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
};

await main();
