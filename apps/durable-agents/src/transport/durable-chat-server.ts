/**
 * Spike: an HTTP face for one open Harness, enough for an AI SDK
 * `ChatTransport` to follow a submission. Submitting answers with the
 * submission's frames; reattaching follows the conversation's running input.
 * Each frame is the whole watched view (see `ChatFrame`).
 */
import {
  type ConversationId,
  type Harness,
  type LiveState,
  type Submission,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { Hono } from "hono";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";

import type { ChatFrame, SubmitBody } from "./shared/chat-frame";
import type { Context } from "@earendil-works/chord";

const isSettled = (frame: ChatFrame): boolean => {
  const { submission, view } = frame;
  if (submission.status === "unanswered") return true;
  // The answer's frame must carry the answer entry itself.
  return (
    submission.status === "done" &&
    view.entries.some((entry) => entry.id === submission.answer)
  );
};

/** Stream `submission`'s frames until it settles or the client leaves. */
const followSubmission = async (
  stream: SSEStreamingApi,
  harness: Harness,
  conversationId: ConversationId,
  submission: Submission,
  context: Context,
): Promise<void> => {
  const conversation = await harness.conversation(conversationId, context);
  if (conversation === undefined) throw new Error("Unknown conversation.");
  const watch = await conversation.watch(context);
  const { promise: ended, resolve: end } = Promise.withResolvers<void>();
  stream.onAbort(end);

  const send = async (view: ChatFrame["view"]): Promise<void> => {
    const frame: ChatFrame = {
      submission: await submission.status(context),
      view,
    };
    await stream.writeSSE({ data: JSON.stringify(frame) });
    if (isSettled(frame)) end();
  };

  await send(watch.value);
  // Durable serializes the listener and folds commits made while it runs.
  watch.start(async (call) => {
    if (call.kind !== "value" || stream.aborted) return;
    await send(call.value);
  });
  void watch.closed.then(() => end());
  await ended;
  await watch.stop();
};

/** Durable IDs are numbers; the route carries them as decimal text. */
const conversationIdParam = (param: string) => Number(param) as ConversationId;

export const createDurableChatServer = (harness: Harness, context: Context) => {
  const app = new Hono();

  /** Admit one user input and follow it. A repeated `requestId` follows the original. */
  app.post("/conversations/:conversationId/messages", async (ctx) => {
    const conversationId = conversationIdParam(ctx.req.param("conversationId"));
    const body = await ctx.req.json<SubmitBody>();
    const conversation = await harness.conversation(conversationId, context);
    if (conversation === undefined) return ctx.notFound();
    const submission = await conversation.submit(
      { type: "input", content: body.content, requestId: body.requestId },
      context,
    );
    return streamSSE(ctx, (stream) =>
      followSubmission(stream, harness, conversationId, submission, context),
    );
  });

  /** Follow the input the running run is answering; 204 when idle. */
  app.get("/conversations/:conversationId/stream", async (ctx) => {
    const conversationId = conversationIdParam(ctx.req.param("conversationId"));
    const conversation = await harness.conversation(conversationId, context);
    if (conversation === undefined) return ctx.notFound();
    const watch = await conversation.watch(context, { min: 1, max: 1 });
    const live = watch.value.docs["pi.live"] as LiveState | undefined;
    await watch.stop();
    const running = live?.run?.inputs.at(0) as SubmissionId | undefined;
    const submission =
      running === undefined
        ? undefined
        : await harness.submission(running, context);
    if (submission === undefined) return ctx.body(null, 204);
    return streamSSE(ctx, (stream) =>
      followSubmission(stream, harness, conversationId, submission, context),
    );
  });

  /** Stop: abort the conversation's current work. */
  app.post("/conversations/:conversationId/abort", async (ctx) => {
    const conversationId = conversationIdParam(ctx.req.param("conversationId"));
    const conversation = await harness.conversation(conversationId, context);
    if (conversation === undefined) return ctx.notFound();
    await conversation.abort(context);
    return ctx.body(null, 204);
  });

  return app;
};
