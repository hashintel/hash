/**
 * The transcript's record of a crash-loop abort: a bookkeeping entry, with no
 * model message, that the crash-loop guard appends just before it aborts a
 * conversation's work, naming the inputs the abort ends and the tasks it
 * aborted for. Pi Durable's abort takes no reason, so this entry is what
 * tells such an abort from a user's stop, to a client's stream and to a
 * later reader.
 */
import {
  defineEntry,
  type EntryRecord,
  type SubmissionId,
  type TaskId,
} from "@earendil-works/pi-durable";

/** A task the guard aborted for: its ID, kind and restart count. */
export type CrashLoopingTask = {
  readonly id: TaskId;
  readonly kind: string;
  readonly restarts: number;
};

/**
 * The transcript's record of a crash-loop abort, appended just before it.
 * The guard appends it raw, where Pi asks a busy conversation for a write
 * submission; that is safe only because the guard runs before `resume()`.
 */
export const CrashLoopEntry = defineEntry<{
  readonly inputs: SubmissionId[];
  readonly tasks: CrashLoopingTask[];
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
