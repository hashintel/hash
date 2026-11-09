/**
 * The host's crash-loop guard. The server opens every Harness with no restart
 * limit, so a waiting browser call outlives any number of restarts; that
 * also lifts Pi Durable's own bound on work that crashes its process. So
 * when a conversation is opened, before its scheduling starts, its live
 * tasks are inspected, and one that open counted `limit` or more restarts in
 * a row aborts the conversation's work: the run ends `aborted`, as the
 * stream and `pi.live.runFailure` show.
 *
 * Exempt: a `pi.tool` task waiting on a browser call that is still `pending`
 * or `claimed`. Its invocation is cut off on every restart by design.
 */
import { BrowserCallsDoc } from "../../../browser-call/browser-call";

import type { Context } from "@earendil-works/chord";
import type {
  Conversation,
  Harness,
  TaskId,
  TaskInspection,
} from "@earendil-works/pi-durable";

/** A task the guard aborted for: its ID, kind and restart count. */
export type CrashLoopingTask = {
  readonly id: TaskId;
  readonly kind: string;
  readonly restarts: number;
};

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
 * Harness schedules anything. Returns the tasks it aborted for (none when
 * it did nothing).
 */
export const guardCrashLoops = async (
  harness: Harness,
  root: Conversation,
  limit: number,
  context: Context,
): Promise<readonly CrashLoopingTask[]> => {
  if (!Number.isFinite(limit)) return [];
  const { tasks } = await harness.inspect(context);
  const looping = tasks.filter(({ record }) => (record.restarts ?? 0) >= limit);
  if (looping.length === 0) return [];
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
  if (offending.length === 0) return [];
  // The run first, so it ends `aborted`; then whatever its abort did not reach, such as background work.
  await root.abort(context);
  for (const { id } of offending) {
    // Each abort waits for the one before; most find their task already terminal.
    // eslint-disable-next-line no-await-in-loop
    await harness.abortTask(id, context);
  }
  return offending;
};
