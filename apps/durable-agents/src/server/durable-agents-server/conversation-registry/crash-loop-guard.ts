/**
 * The host's crash-loop guard. The server opens every Harness with no restart
 * limit, so a waiting browser call outlives any number of restarts; that
 * also lifts Pi Durable's own bound on work that crashes its process. So
 * when a conversation is opened, before its scheduling starts, its live
 * tasks are inspected, and one that open counted `limit` or more restarts in
 * a row aborts the conversation's work: the run ends `aborted`, as
 * `pi.live.runFailure` shows.
 *
 * Pi Durable's abort takes no reason, so before it the guard appends a
 * `CrashLoopEntry` to the transcript: a bookkeeping entry, with no model
 * message, naming the inputs the abort ends and the tasks it aborted for.
 * That entry is what tells this abort from a user's stop, to the client's
 * stream (an `error` chunk instead of an `abort`) and to a later reader.
 *
 * Exempt: a `pi.tool` task waiting on a browser call that is still `pending`
 * or `claimed`. Its invocation is cut off on every restart by design.
 */
import {
  type Conversation,
  defineEntry,
  type EntryRecord,
  type Harness,
  LiveDoc,
  type SubmissionId,
  type TaskId,
  type TaskInspection,
} from "@earendil-works/pi-durable";

import { BrowserCallsDoc } from "../../../browser-call/browser-call";

import type { Context } from "@earendil-works/chord";

/** A task the guard aborted for: its ID, kind and restart count. */
export type CrashLoopingTask = {
  readonly id: TaskId;
  readonly kind: string;
  readonly restarts: number;
};

/** What one guard's abort ended, and why. */
export type CrashLoopAbort = {
  readonly tasks: readonly CrashLoopingTask[];
  /** The inputs the abort settled `unanswered`: the run's, then the queued ones. */
  readonly inputs: readonly SubmissionId[];
  /** The input the run was answering, which a client reconnecting to the conversation follows. */
  readonly running?: SubmissionId;
};

/** The transcript's record of a crash-loop abort, appended just before it. */
export const CrashLoopEntry = defineEntry<{
  readonly inputs: number[];
  readonly tasks: { id: number; kind: string; restarts: number }[];
}>("durable-agents.crash-loop");

/** Why the stream of an input a crash-loop abort ended errors. */
export const crashLoopErrorText =
  "The turn stopped because the server failed repeatedly.";

/** Whether `entries` record a crash-loop abort of input `submission`. */
export const stoppedByCrashLoop = (
  entries: readonly EntryRecord[],
  submission: SubmissionId,
): boolean =>
  entries.some(
    (entry) =>
      CrashLoopEntry.is(entry) && entry.data.inputs.includes(submission),
  );

/** The tasks waiting on a browser call nobody has answered yet: the owners of their `BrowserCall` tasks. */
const browserCallWaiters = async (
  harness: Harness,
  root: Conversation,
  tasks: readonly TaskInspection[],
  context: Context,
) => {
  const calls =
    (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
  const openCalls = new Set<number>(
    Object.values(calls)
      .filter(({ status }) => status === "pending" || status === "claimed")
      .map(({ task }) => task),
  );
  return new Set<number>(
    tasks.flatMap(({ record }) =>
      openCalls.has(record.id) && record.owner !== undefined
        ? [record.owner]
        : [],
    ),
  );
};

/**
 * Abort `root`'s work when a live task reached `limit` restarts, before the
 * Harness schedules anything. Returns what it aborted, or `undefined` when
 * it did nothing.
 */
export const guardCrashLoops = async (
  harness: Harness,
  root: Conversation,
  limit: number,
  context: Context,
): Promise<CrashLoopAbort | undefined> => {
  if (!Number.isFinite(limit)) return undefined;
  const { tasks, submissions } = await harness.inspect(context);
  const looping = tasks.filter(({ record }) => (record.restarts ?? 0) >= limit);
  if (looping.length === 0) return undefined;
  const waiters = await browserCallWaiters(harness, root, tasks, context);
  const offending = looping
    .filter(
      ({ record }) => !(record.kind === "pi.tool" && waiters.has(record.id)),
    )
    .map(({ record }) => ({
      id: record.id,
      kind: record.kind,
      restarts: record.restarts ?? 0,
    }));
  if (offending.length === 0) return undefined;
  const live = await harness.snapshot(LiveDoc, root.id, context);
  const running = live?.run?.inputs.at(0);
  const inputs = submissions
    .filter(
      ({ conversationId, type }) =>
        conversationId === root.id && type !== "write",
    )
    .map(({ id }) => id);
  await root.commit(
    (tx) =>
      tx.appendEntry(CrashLoopEntry, root.id, {
        data: {
          inputs: [...inputs],
          tasks: offending.map(({ id, kind, restarts }) => ({
            id,
            kind,
            restarts,
          })),
        },
      }),
    context,
  );
  // The run first, so it ends `aborted`; then whatever its abort did not reach, such as background work.
  await root.abort(context);
  for (const { id } of offending) {
    // Each abort waits for the one before; most find their task already terminal.
    // eslint-disable-next-line no-await-in-loop
    await harness.abortTask(id, context);
  }
  return { tasks: offending, inputs, running };
};
