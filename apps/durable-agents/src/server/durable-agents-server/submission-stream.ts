/**
 * One submission's answer as an AI SDK UI message chunk stream, projected on
 * the server from the conversation's watched view. The stream starts from the
 * committed view, so a follow that attaches mid-run replays what the run
 * committed so far under the same message id, then follows it to its end.
 */
import {
  type Conversation,
  type ConversationView,
  type Submission,
} from "@earendil-works/pi-durable";

import {
  createViewProjector,
  type ProjectionOptions,
} from "./submission-stream/view-projector";

import type { Context } from "@earendil-works/chord";
import type { UIMessageChunk } from "ai";

export { responseMessageId } from "./submission-stream/view-projector";

/**
 * Follow `submission` on `conversation` until it settles, the client cancels,
 * or the Harness closes. A Harness that closes mid-run (its ownership moved,
 * or it failed) ends the stream without a `finish`, so the client can
 * reconnect to whichever instance owns the conversation now.
 */
export const followSubmission = async (
  conversation: Conversation,
  submission: Submission,
  options: ProjectionOptions,
  context: Context,
  /** Called once when the stream ends, however it ends: settled, cancelled, or its Harness closed. */
  onEnd?: () => void,
): Promise<ReadableStream<UIMessageChunk>> => {
  const record = await submission.status(context);
  // From the input on, so a long transcript does not push the anchor out of the first window.
  const watch = await conversation.watch(
    context,
    record.type === "input" && record.entry !== undefined
      ? { from: record.entry }
      : undefined,
  );
  let ended = false;
  let reported = false;
  const reportEnd = () => {
    if (reported) return;
    reported = true;
    onEnd?.();
  };

  return new ReadableStream<UIMessageChunk>({
    start: async (controller) => {
      const end = () => {
        if (ended) return;
        ended = true;
        controller.close();
        void watch.stop();
        reportEnd();
      };
      const projector = createViewProjector(options, (chunk) => {
        if (!ended) controller.enqueue(chunk);
      });
      const accept = async (view: ConversationView) => {
        if (ended) return;
        projector.accept({
          submission: await submission.status(context),
          view,
        });
        if (projector.isFinished()) end();
      };

      try {
        await accept(watch.value);
      } catch (error) {
        reportEnd();
        throw error;
      }
      if (ended) return;
      // Durable serializes the listener and folds commits made while it runs.
      watch.start(async (call) => {
        if (call.kind === "value") await accept(call.value);
      });
      void watch.closed.then(end);
    },
    cancel: async () => {
      ended = true;
      reportEnd();
      await watch.stop();
    },
  });
};
