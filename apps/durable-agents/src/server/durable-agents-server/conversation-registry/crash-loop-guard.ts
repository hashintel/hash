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
 * `CrashLoopEntry` to the transcript, naming the inputs the abort ends and
 * the tasks it aborted for: what tells this abort from a user's stop, to the
 * client's stream (an `error` chunk instead of an `abort`) and to a later
 * reader.
 *
 * Exempt: a `pi.tool` task waiting on a browser call that is still `pending`
 * or `claimed`. Its invocation is cut off on every restart by design, and
 * Pi keeps counting those restarts, so once the call has an outcome the task
 * is charged only the restarts after it.
 *
 * A task already marked for abort can loop too, when its abort handler is
 * cut off on every open. Pi Durable 1.5.2 gives the host no way to fault
 * such a task: an abort re-marks only an unmarked task, and the restart
 * limit that would fault it is off here. So the guard records that loop
 * once: when the newest `CrashLoopEntry` already names every such task, it
 * appends nothing and aborts nothing, and the abort handler runs again on
 * every open. A finite `restartLimit`, and with it Pi's fault, returns once
 * Pi's tools can park instead of holding an invocation while they wait.
 */
import {
  type Conversation,
  type Cursor,
  type Harness,
  LiveDoc,
  type SubmissionId,
  type TaskInspection,
} from "@earendil-works/pi-durable";

import {
  BrowserCallsDoc,
  isAwaitingBrowser,
} from "../../../browser-call/browser-call";
import {
  CrashLoopEntry,
  type CrashLoopingTask,
} from "../shared/crash-loop-entry";

import type { Context } from "@earendil-works/chord/context";

/** What one guard's abort ended, and why. */
export type CrashLoopAbort = {
  readonly tasks: readonly CrashLoopingTask[];
  /** The inputs the abort settled `unanswered`: the run's, then the queued ones. */
  readonly inputs: readonly SubmissionId[];
  /** The input the run was answering, which a client reconnecting to the conversation follows. */
  readonly running?: SubmissionId;
};

/**
 * How the browser calls of `root` bear on their owners' restarts. `waiting`:
 * the tasks waiting on a call nobody has answered yet, the owners of their
 * `BrowserCall` tasks. `restartsAtOutcome`: per task owning an answered
 * call that recorded it (`ownerAtOutcome`), its restart count when its
 * latest outcome was committed.
 */
const browserCallWaiters = async (
  harness: Harness,
  root: Conversation,
  tasks: readonly TaskInspection[],
  context: Context,
) => {
  const calls = Object.values(
    (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {},
  );
  const openCalls = new Set<number>(
    calls.filter(isAwaitingBrowser).map(({ task }) => task),
  );
  const waiting = new Set<number>(
    tasks.flatMap(({ record }) =>
      openCalls.has(record.id) && record.owner !== undefined
        ? [record.owner]
        : [],
    ),
  );
  const restartsAtOutcome = new Map<number, number>();
  for (const { ownerAtOutcome } of calls) {
    if (ownerAtOutcome === undefined) continue;
    const { task, restarts } = ownerAtOutcome;
    restartsAtOutcome.set(
      task,
      Math.max(restarts, restartsAtOutcome.get(task) ?? 0),
    );
  }
  return { waiting, restartsAtOutcome };
};

/** Marked by an abort request, which Pi does not mark again; a `restart` mark it replaces. */
const markedForAbort = ({
  abortRequested,
  abortReason,
}: TaskInspection["record"]) => abortRequested && abortReason === undefined;

/** The IDs of the tasks `root`'s newest `CrashLoopEntry` names; none without one. */
const lastRecordedLoop = async (root: Conversation, context: Context) => {
  let cursor: Cursor | undefined;
  do {
    // Each page continues from the one before.
    // eslint-disable-next-line no-await-in-loop
    const page = await root.entries(
      { order: "descending" },
      100,
      cursor,
      context,
    );
    const entry = page.items.find((item) => CrashLoopEntry.is(item));
    if (entry !== undefined)
      return new Set<number>(entry.data.tasks.map(({ id }) => id));
    cursor = page.next;
  } while (cursor !== undefined);
  return new Set<number>();
};

/**
 * Abort `root`'s work when a live task was charged `limit` restarts, before
 * the Harness schedules anything. A task is charged its restart count,
 * except a `pi.tool` task that owns a browser call: none while the call is
 * `pending` or `claimed`, and once the call has an outcome, only the
 * restarts since it (all of them on a call that did not record its count).
 * The tasks it reports carry their full count. Returns what it aborted, or
 * `undefined` when it did nothing, as when every such task is marked for
 * abort and the newest `CrashLoopEntry` names it.
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
  const { waiting, restartsAtOutcome } = await browserCallWaiters(
    harness,
    root,
    tasks,
    context,
  );
  const charged = ({ id, kind, restarts = 0 }: TaskInspection["record"]) => {
    if (kind !== "pi.tool") return restarts;
    if (waiting.has(id)) return 0;
    return Math.max(0, restarts - (restartsAtOutcome.get(id) ?? 0));
  };
  const offendingRecords = looping
    .map(({ record }) => record)
    .filter((record) => charged(record) >= limit);
  if (offendingRecords.length === 0) return undefined;
  const recorded = offendingRecords.some(markedForAbort)
    ? await lastRecordedLoop(root, context)
    : new Set<number>();
  if (
    offendingRecords.every(
      (record) => markedForAbort(record) && recorded.has(record.id),
    )
  )
    return undefined;
  const offending = offendingRecords.map((record) => ({
    id: record.id,
    kind: record.kind,
    restarts: record.restarts ?? 0,
  }));
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
