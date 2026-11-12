/**
 * U0a: the read-back pruning hook and the `net_view` section (probe-local
 * stand-ins over a per-Harness host binding) across a real process kill.
 *
 * A child process (`process-kill/child.ts`) runs the scenario over Postgres or
 * a SQLite file, parks at one of four points and is SIGKILLed there:
 *
 * (i)   the round is terminal, before the prune write;
 * (ii)  the prune write is admitted, before the boundary placed it;
 * (iii) a threshold compaction's head is placed, before the first request is
 *       prepared (the section is parked mid-render, inside `prepare`);
 * (iv)  a threshold compaction is summarizing.
 *
 * This process then opens a fresh Harness over the same storage, with a fresh
 * host binding bound right after open, and recovers the in-flight input. On
 * reopen: exactly one prune entry; the section restores the last visible view
 * (after a manual compaction for (i) and (ii), after the threshold one for
 * (iii) and (iv)); and I1: every request this process's model answered equals
 * the committed effective context as of the newest entry before its answer.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CompactionEntry, type SubmissionId } from "@earendil-works/pi-durable";
import { Pool } from "pg";
import { afterAll, describe, expect, test } from "vitest";

import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import {
  answers,
  committedContextBefore,
  fauxAssistantMessage,
  netAt,
  openFoldHarness,
  pruneKind,
  restoredSection,
  sectionsOf,
  visibleNetView,
} from "../../platform/fold-boundaries/support";
import { allEntries, kindsOf } from "../../platform/support";
import { runChildToKillPoint } from "./process-kill/child-process";
import {
  compactionPolicy,
  context,
  type KillPoint,
  killPoints,
  model,
  openStorage,
  type StorageSpec,
} from "./process-kill/scenario";

const admin = new Pool({ ...postgresConfigFromEnvironment(), max: 1 });
afterAll(() => admin.end());

/** A fresh storage location and its cleanup. */
const location = async (
  kind: StorageSpec["kind"],
): Promise<{ spec: StorageSpec; drop: () => Promise<void> }> => {
  if (kind === "postgres") {
    const schema = `pi_durable_test_fold_${randomUUID().replaceAll("-", "")}`;
    return {
      spec: { kind, schema },
      drop: async () => {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      },
    };
  }
  const directory = await mkdtemp(join(tmpdir(), "durable-fold-kill-"));
  return {
    spec: { kind, file: join(directory, "session.sqlite") },
    drop: () => rm(directory, { recursive: true, force: true }),
  };
};

const r2Body = JSON.stringify(netAt("R2"));
const compacting = (point: KillPoint) =>
  point === "head" || point === "summarizing";

/** What the child had done when it parked, by point. */
const parkedShape: Record<
  KillPoint,
  { requests: number; summaries: number; submissions: number }
> = {
  // c0's and c1's requests answered; c1's round terminal; no write yet.
  terminal: { requests: 2, summaries: 0, submissions: 0 },
  // The same, with c1's prune write admitted (queued).
  admitted: { requests: 2, summaries: 0, submissions: 1 },
  // The whole history (three requests) and the summary; the run's request not yet prepared.
  head: { requests: 3, summaries: 1, submissions: 1 },
  // The whole history; the summary requested, not answered.
  summarizing: { requests: 3, summaries: 1, submissions: 1 },
};

const threshold = { reason: "threshold" };

/** What recovery in this process did, by point. */
const recoveryShape: Record<KillPoint, Record<string, unknown>> = {
  terminal: {
    head: null,
    summaries: 0,
    hookCalls: 1,
    submissions: 1,
    reusedChildSubmission: false,
  },
  admitted: {
    head: null,
    summaries: 0,
    hookCalls: 1,
    submissions: 1,
    reusedChildSubmission: true,
  },
  head: {
    head: threshold,
    summaries: 0,
    hookCalls: 0,
    submissions: 0,
    reusedChildSubmission: false,
  },
  summarizing: {
    head: threshold,
    summaries: 1,
    hookCalls: 0,
    submissions: 0,
    reusedChildSubmission: false,
  },
};

describe.each(["postgres", "sqlite"] as const)(
  "U0a: process kill on %s, reopened with a fresh host binding",
  (kind) => {
    test.each(killPoints)(
      "killed at %s: one prune entry, the section restores R2, I1 holds",
      async (point) => {
        const { spec, drop } = await location(kind);
        try {
          const { parked, signal } = await runChildToKillPoint(point, spec);
          expect(signal).toBe("SIGKILL");
          expect({
            requests: parked.requests,
            summaries: parked.summaries,
            submissions: parked.submissions.length,
          }).toEqual(parkedShape[point]);

          const faux = model();
          const compaction = compactionPolicy(compacting(point));
          const probe = await openFoldHarness(await openStorage(spec), faux, {
            compaction,
          });
          try {
            faux.script(
              fauxAssistantMessage(compacting(point) ? "Added." : "Done."),
            );
            const recovered = await probe.harness.submission(
              parked.input as SubmissionId,
              context,
            );
            expect((await recovered!.wait(context)).status).toBe("done");
            compaction.enabled = false;
            const root = await probe.harness.root(context);
            const { head } = await root.context(context);
            // (i)/(ii): recovery reran the tools phase, so afterTools ran again for c1's round, once, and
            // (ii)'s write deduplicated to the child's submission. (iii)/(iv): the hook ran in the child;
            // (iv) summarizes again here, (iii) placed its head before the kill.
            expect({
              head: CompactionEntry.is(head) ? head.data : null,
              summaries: faux.summaries.length,
              hookCalls: probe.calls.length,
              submissions: probe.submissions.length,
              reusedChildSubmission:
                probe.submissions.length > 0 &&
                probe.submissions.every((id) =>
                  parked.submissions.includes(id),
                ),
            }).toEqual(recoveryShape[point]);

            if (!compacting(point)) {
              // The restored view is checked after a compaction this process drives.
              const task = await root.compact(undefined, context);
              const outcome = (await probe.harness.waitForTask(task, context))
                .state.outcome;
              if (outcome.status !== "completed")
                throw new Error(`Compaction ended ${outcome.status}.`);
              faux.script(fauxAssistantMessage("Okay."));
              const next = await root.submit(
                { type: "input", content: "Next." },
                context,
              );
              const settled = await next.wait(context);
              if (settled.status !== "done")
                throw new Error(`The next run ended ${settled.status}.`);
            }

            const entries = await allEntries(root);
            process.stdout.write(
              `U0a ${kind} ${point}: ${JSON.stringify(kindsOf(entries))}\n`,
            );
            expect(
              entries.filter(({ kind }) => kind === pruneKind),
            ).toHaveLength(1);
            const last = faux.requests.at(-1)!;
            expect(sectionsOf(last)).toEqual([restoredSection("R2", r2Body)]);
            const answered = answers(entries);
            expect(
              visibleNetView(
                await committedContextBefore(root, answered.at(-1)!.id),
              ),
            ).toMatchObject({
              state: "current",
              revision: "R2",
              kind: "section",
            });
            // I1 for every request this process answered: the newest answers, in order.
            const mine = answered.slice(-faux.requests.length);
            expect(mine).toHaveLength(faux.requests.length);
            for (const [index, answer] of mine.entries())
              expect(faux.requests[index]).toEqual(
                // Sequential reads keep the failure message tied to its request.
                // eslint-disable-next-line no-await-in-loop
                (await committedContextBefore(root, answer.id)).messages,
              );
            expect(probe.trace.errors).toEqual([]);
            expect(
              probe.reports.filter(({ kind }) => kind === "extension_error"),
            ).toEqual([]);
          } finally {
            await probe.harness.close(context);
          }
        } finally {
          await drop();
        }
      },
    );
  },
);
