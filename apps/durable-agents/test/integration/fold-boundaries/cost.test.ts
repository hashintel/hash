/**
 * U0b: what the two new mechanisms' context reads cost on Postgres.
 *
 * For conversations of 500, 1,500 and 5,000 entries, each in its own schema,
 * this measures through a freshly opened Harness (the host binding's path,
 * `Conversation.context()`, which scans the visible range on every call):
 *
 * - `context()` and `context({ at })` (at the entry before the newest);
 * - one prune decision: `context()` plus `pruneEdits` (the hook's work before
 *   its write), on a context with one read-back to prune;
 * - one section render with no compaction head (one read, renders nothing);
 * - one section render after a real manual compaction (two reads: the
 *   post-head context, then the pre-compaction context at the entry before
 *   the head), which restores the view.
 *
 * Numbers are printed (`U0b …` lines), not judged: the design's trigger is a
 * p95 above 20 ms at 1,500 entries, against the load probe's turn p95 of
 * about 3.9 s.
 *
 * The history is appended directly, a turn per commit, in the shape the real
 * agent leaves: a user message, two change rounds and a read, each result
 * stored with a 4 KiB net, and the two prune writes per turn that replace the
 * earlier read-backs. The reads scan the same rows a run-built conversation
 * would; building it through model turns would make the build quadratic.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import {
  type Conversation,
  type EntryDraft,
  type EntryId,
  type Harness,
  type Tx,
} from "@earendil-works/pi-durable";
import { Pool } from "pg";
import { afterAll, describe, expect, test } from "vitest";

import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../../src/storage/postgres/postgres-storage";
import {
  compactionHead,
  context,
  fauxAssistantMessage,
  netAt,
  openFoldHarness,
  pruneEdits,
  renderChange,
  renderNetView,
  renderRead,
  scriptedModel,
} from "../../platform/fold-boundaries/support";

import type { Message } from "@earendil-works/pi-ai";

const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
afterAll(() => admin.end());

const sizes = [500, 1500, 5000] as const;
const padding = 4096;
const samples = 40;
const warmup = 3;
const loadProbeTurnP95Ms = 3900;

// ─── The history ─────────────────────────────────────────────────────────────

const user = (text: string): EntryDraft => ({
  kind: "probe.user",
  model: [{ role: "user", content: text, timestamp: 0 }],
});

const callEntry = (
  toolName: string,
  id: string,
  args: Record<string, string>,
): EntryDraft => ({
  kind: "probe.assistant",
  model: [
    fauxAssistantMessage(fauxToolCall(toolName, args, { id }), {
      stopReason: "toolUse",
    }),
  ],
});

const resultMessage = (
  toolName: string,
  id: string,
  text: string,
): Message => ({
  role: "toolResult",
  toolCallId: id,
  toolName,
  content: [{ type: "text", text }],
  isError: false,
  timestamp: 0,
});

const result = (toolName: string, id: string, text: string): EntryDraft => ({
  kind: "probe.tool-result",
  model: [resultMessage(toolName, id, text)],
});

const changeText = (revision: string) =>
  renderChange({ ok: true }, netAt(revision, padding), revision);

/** The prune write for change `id`'s result entry `target`: its bare output. */
const prune = (
  target: EntryId,
  id: string,
  assistant: EntryId,
): EntryDraft => ({
  kind: "brunch.prune",
  data: { assistant },
  edits: [
    {
      target,
      action: "replace",
      messages: [resultMessage("change", id, JSON.stringify({ ok: true }))],
    },
  ],
});

/** One full turn: ten entries, two of them prune writes. */
const appendTurn = async (tx: Tx, conversation: Conversation, turn: number) => {
  const append = (draft: EntryDraft) => tx.appendEntry(conversation.id, draft);
  const a = `t${turn}a`;
  const b = `t${turn}b`;
  const r = `t${turn}r`;
  await append(user(`Turn ${turn}: change the net twice, then read it.`));
  await append(callEntry("change", a, { revision: `${a}` }));
  const resultA = await append(result("change", a, changeText(a)));
  const callB = await append(callEntry("change", b, { revision: `${b}` }));
  const resultB = await append(result("change", b, changeText(b)));
  await append(prune(resultA.id, a, callB.id));
  const callR = await append(callEntry("readNet", r, { revision: r }));
  await append(result("readNet", r, renderRead(netAt(r, padding), r)));
  await append(prune(resultB.id, b, callR.id));
  await append({
    kind: "probe.assistant",
    model: [fauxAssistantMessage(`Turn ${turn} done.`)],
  });
};

/** The tail: two unpruned read-backs (one to prune), then a text exchange with no net event. */
const tailEntries = (): EntryDraft[] => [
  user("Last: change the net twice."),
  callEntry("change", "z1", { revision: "Z1" }),
  result("change", "z1", changeText("Z1")),
  callEntry("change", "z2", { revision: "Z2" }),
  result("change", "z2", changeText("Z2")),
  user("Thanks."),
  { kind: "probe.assistant", model: [fauxAssistantMessage("You're welcome.")] },
];

/** Append `size` entries: full turns, user notes to make up the count, then the tail. */
const build = async (
  harness: Harness,
  conversation: Conversation,
  size: number,
) => {
  const tail = tailEntries();
  const turns = Math.floor((size - tail.length) / 10);
  const notes = size - tail.length - turns * 10;
  for (let turn = 0; turn < turns; turn++)
    // Each turn is one commit, in order.
    // eslint-disable-next-line no-await-in-loop
    await harness.commit((tx) => appendTurn(tx, conversation, turn), context);
  await harness.commit(async (tx) => {
    for (let note = 0; note < notes; note++)
      // eslint-disable-next-line no-await-in-loop
      await tx.appendEntry(conversation.id, user(`Note ${note}.`));
    for (const draft of tail)
      // eslint-disable-next-line no-await-in-loop
      await tx.appendEntry(conversation.id, draft);
  }, context);
};

// ─── Timing ──────────────────────────────────────────────────────────────────

const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? Number.NaN;

const round = (ms: number) => Math.round(ms * 100) / 100;

/** Time `run` `samples` times after `warmup` untimed runs, one at a time. */
const measure = async (run: () => Promise<unknown>) => {
  for (let index = 0; index < warmup; index++)
    // Sequential by design: concurrent reads would measure contention.
    // eslint-disable-next-line no-await-in-loop
    await run();
  const times: number[] = [];
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    // eslint-disable-next-line no-await-in-loop
    await run();
    times.push(performance.now() - start);
  }
  const sorted = times.toSorted((left, right) => left - right);
  return {
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1) ?? Number.NaN),
  };
};

type Row = {
  size: number;
  metric: string;
  p50: number;
  p95: number;
  max: number;
};
const rows: Row[] = [];

describe("U0b: context reads on Postgres", () => {
  test.each(sizes)(
    "%i entries",
    async (size) => {
      const schema = `pi_durable_test_fold_${randomUUID().replaceAll("-", "")}`;
      try {
        // Build with one Harness, measure with another: the reads are the host's, from a fresh process state.
        const builder = scriptedModel();
        const built = await openFoldHarness(
          await openPostgresStorage({ pool: poolConfig, schema }),
          builder,
        );
        const buildStart = performance.now();
        const builtRoot = await built.harness.root(context, {
          agent: { model: builder.model },
        });
        await build(built.harness, builtRoot, size);
        const buildMs = performance.now() - buildStart;
        await built.harness.close(context);

        const faux = scriptedModel();
        const probe = await openFoldHarness(
          await openPostgresStorage({ pool: poolConfig, schema }),
          faux,
        );
        try {
          const root = await probe.harness.root(context);
          const coldStart = performance.now();
          const view = await root.context(context);
          const coldMs = performance.now() - coldStart;
          expect(view.entries).toHaveLength(size);
          const bytes = JSON.stringify(view.entries).length;
          const newest = view.entries.at(-1)!.id;
          const at = (newest - 1) as EntryId;

          const record = (
            metric: string,
            stats: Awaited<ReturnType<typeof measure>>,
          ) => rows.push({ size, metric, ...stats });

          record("context()", await measure(() => root.context(context)));
          record(
            "context({ at })",
            await measure(() => root.context(context, { at })),
          );
          expect(pruneEdits(await root.context(context))).toHaveLength(1);
          record(
            "prune decision",
            await measure(async () => pruneEdits(await root.context(context))),
          );
          const held = await root.context(context);
          record(
            "  of which pruneEdits on a held view",
            await measure(async () => pruneEdits(held)),
          );
          expect(await renderNetView(root, context)).toBeUndefined();
          record(
            "section render, no head (1 read)",
            await measure(() => renderNetView(root, context)),
          );

          const task = await root.compact(undefined, context);
          expect(
            (await probe.harness.waitForTask(task, context)).state.outcome,
          ).toMatchObject({ status: "completed" });
          await compactionHead(root);
          expect(await renderNetView(root, context)).toContain(
            '<net-view revision="Z2">',
          );
          record(
            "section render, after compaction (2 reads)",
            await measure(() => renderNetView(root, context)),
          );

          process.stdout.write(
            `U0b ${size} entries: built in ${Math.round(buildMs)} ms; ${Math.round(bytes / 1024)} KiB of entries in the visible range; cold context() ${round(coldMs)} ms\n`,
          );
        } finally {
          await probe.harness.close(context);
        }
      } finally {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    },
    600_000,
  );

  afterAll(() => {
    process.stdout.write(
      `U0b (ms, ${samples} samples after ${warmup} warmup; load probe turn p95 ≈ ${loadProbeTurnP95Ms} ms)\n`,
    );
    for (const row of rows)
      process.stdout.write(
        `U0b ${String(row.size).padStart(5)} | ${row.metric.padEnd(44)} | p50 ${String(row.p50).padStart(8)} | p95 ${String(row.p95).padStart(8)} | max ${String(row.max).padStart(8)} | p95/turn ${((row.p95 / loadProbeTurnP95Ms) * 100).toFixed(2)}%\n`,
      );
  });
});
