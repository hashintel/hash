/**
 * One submission's answer as an AI SDK UI message chunk stream, projected on
 * the server from the conversation's watched view. The stream starts from the
 * committed view, so a follow that attaches mid-run replays what the run
 * committed so far under the same message id, then follows it to its end.
 *
 * A response's stored entries project through the same writer
 * (`projectResponseEntries`), with the same message ID and hand-edit parts,
 * so a reopened conversation shows each response as its stream did.
 */
import { withAbortSignal, type Context } from "@earendil-works/chord/context";
import {
  type Conversation,
  type ConversationView,
  type Cursor,
  type EntryRecord,
  LiveDoc,
  type RunFailure,
  type Submission,
} from "@earendil-works/pi-durable";

import {
  crashLoopErrorText,
  stoppedByCrashLoop,
} from "./shared/crash-loop-entry";
import {
  createViewProjector,
  projectResponseEntries,
  type ProjectionOptions,
  type UnseenEntries,
} from "./submission-stream/view-projector";

import type { UIMessageChunk } from "ai";

export {
  handEditPartId,
  handEditPartType,
  type ProjectionOptions,
  projectResponseEntries,
  responseMessageId,
} from "./submission-stream/view-projector";

/** The conversation's committed entries after `after`, through `through`, page by page. */
const entriesBetween = async (
  conversation: Conversation,
  { after, through }: UnseenEntries,
  context: Context,
): Promise<EntryRecord[]> => {
  const entries: EntryRecord[] = [];
  let cursor: Cursor | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop -- Each page starts at the previous cursor.
    const page = await conversation.entries(
      { minEntryId: after, maxEntryId: through, order: "ascending" },
      100,
      cursor,
      context,
    );
    for (const entry of page.items) {
      if (entry.id !== after) entries.push(entry);
    }
    cursor = page.next;
  } while (cursor !== undefined);
  return entries;
};

/** Replay the failed input's committed response, including abort cleanup, without a live watch or browser work. */
export const replayCrashLoop = async (
  root: Conversation,
  submission: Submission,
  failedRun: RunFailure["taskId"],
  options: ProjectionOptions,
  context: Context,
): Promise<ReadableStream<UIMessageChunk> | undefined> => {
  const record = await submission.status(context);
  if (
    record.type !== "input" ||
    record.status !== "unanswered" ||
    record.reason !== "aborted" ||
    record.entry === undefined
  )
    return undefined;
  const input = record.entry;
  // Read both on Pi's mutation line: a later run may start between scan
  // pages, but its entries must never be part of this response.
  const last = await root.commit(async (tx) => {
    const live = await tx.doc(LiveDoc, root.id);
    if (live.run !== undefined || live.runFailure?.taskId !== failedRun)
      return undefined;
    return tx.latestEntryId(root.id);
  }, context);
  if (last === undefined) return undefined;

  const entries = await entriesBetween(
    root,
    { after: input, through: last },
    context,
  );
  // The marker classifies the failure, but Pi can commit partial output
  // and tool results after it while aborting the run.
  if (!stoppedByCrashLoop(entries, record.id)) return undefined;
  const projected = projectResponseEntries(input, entries, {
    ...options,
    clientToolNames: new Set(),
  });
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of projected.chunks) controller.enqueue(chunk);
      controller.enqueue({ type: "error", errorText: crashLoopErrorText });
      controller.close();
    },
  });
};

/**
 * Follow `submission` on `conversation` until it settles, the client cancels,
 * or the Harness closes. A live follower that loses its Harness reports an
 * interrupted stream, distinct from the submission's own terminal outcome.
 */
export const followSubmission = async (
  conversation: Conversation,
  submission: Submission,
  options: ProjectionOptions,
  context: Context,
  /** Called once when the stream ends, however it ends: settled, cancelled, or its Harness closed. */
  onEnd?: () => void,
  signal?: AbortSignal,
): Promise<ReadableStream<UIMessageChunk>> => {
  const detached = () =>
    new ReadableStream<UIMessageChunk>({
      start: (controller) => controller.close(),
    });
  if (signal?.aborted === true) {
    onEnd?.();
    return detached();
  }
  const record = await submission.status(context);
  // The first window starts at the input only when at most Pi's window maximum follows it; the projector reads what it skips.
  const watch = await conversation.watch(
    signal === undefined ? context : withAbortSignal(signal, context),
    record.type === "input" && record.entry !== undefined
      ? { from: record.entry }
      : undefined,
  );
  let ended = false;
  const isEnded = () => ended;
  let disconnect: (() => void) | undefined;
  const stop = () => {
    ended = true;
    if (disconnect !== undefined)
      signal?.removeEventListener("abort", disconnect);
    onEnd?.();
    return watch.stop();
  };
  return new ReadableStream<UIMessageChunk>({
    start: async (controller) => {
      const end = (error?: unknown) => {
        if (ended) return;
        void stop().catch(() => {});
        if (error === undefined) controller.close();
        else controller.error(error);
      };
      disconnect = () => end();
      if (signal?.aborted === true) {
        disconnect();
        return;
      }
      signal?.addEventListener("abort", disconnect, { once: true });
      const projector = createViewProjector(options, (chunk) => {
        if (!ended) controller.enqueue(chunk);
      });
      const accept = async (view: ConversationView) => {
        if (isEnded()) return;
        const status = await submission.status(context);
        if (isEnded()) return;
        const frame = { submission: status, view };
        const unseen = projector.unseen(frame);
        const skipped =
          unseen === undefined
            ? []
            : await entriesBetween(conversation, unseen, context);
        if (isEnded()) return;
        projector.accept(frame, skipped);
        if (projector.isFinished()) end();
      };
      try {
        await accept(watch.value);
        if (ended) return;
        // Durable serializes the listener and folds commits made while it runs.
        watch.start(async (call) => {
          if (call.kind === "value") await accept(call.value);
        });
        const interrupted = () =>
          end(
            new TypeError(
              "The chat stream ended before the turn settled; reconnect to resume.",
            ),
          );
        void watch.closed.then(interrupted, interrupted);
      } catch (error) {
        end(error);
      }
    },
    cancel: async () => {
      if (!ended) await stop();
    },
  });
};
