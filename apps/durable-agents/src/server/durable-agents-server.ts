/**
 * The durable agents server: Brunch's chat surface on Pi Durable, speaking AI
 * SDK's UI message stream protocol, so the stock `DefaultChatTransport` (with
 * `api` at this app's `/chat`) is its client.
 *
 * - `POST /chat` takes `DefaultChatTransport`'s body (`id`, `messages`,
 *   `trigger`, `messageId`), submits the last user message once per message id,
 *   and answers with that submission's UI message stream.
 * - `GET /chat/:id/stream` (the transport's `reconnectToStream`) answers 204
 *   when the conversation is idle, else the running input's stream from the
 *   committed view on.
 * - `POST /chat/:id/abort` stops the conversation; AI SDK's `stop()` only
 *   drops the client's fetch, so a client calls it itself.
 *
 * Each conversation is its own Harness on its own storage (see
 * `createConversationRegistry`), checked to still own that storage before
 * every request.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { LiveDoc, type SubmissionId } from "@earendil-works/pi-durable";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { Hono } from "hono";

import {
  type ConversationRegistryOptions,
  createConversationRegistry,
  type OpenConversation,
} from "./durable-agents-server/conversation-registry";
import { followSubmission } from "./durable-agents-server/submission-stream";

import type { Context } from "@earendil-works/chord";

export type { OpenConversation } from "./durable-agents-server/conversation-registry";

/** Why a chat request is refused before its submission. */
export type ChatRefusal = {
  readonly status: 400 | 409;
  readonly error: string;
};

export type DurableAgentsServerOptions = ConversationRegistryOptions & {
  /** Tools the browser runs; their calls stream for the client's `onToolCall`. */
  readonly clientToolNames: ReadonlySet<string>;
  /**
   * Runs on every `POST /chat` before its submission, with the request's
   * whole body, so a host can check or record what its client sends beside
   * the messages (AI SDK's `body` option), such as the browser's document
   * binding. A refusal answers the request instead of submitting.
   */
  readonly admitChat?: (
    conversation: OpenConversation,
    body: Readonly<Record<string, unknown>>,
  ) => Promise<ChatRefusal | undefined>;
  readonly context?: Context;
};

/** What `DefaultChatTransport` POSTs, as far as this server reads it. */
type ChatRequestBody = {
  readonly id: string;
  readonly messages: readonly UIMessage[];
  readonly trigger: "submit-message" | "regenerate-message";
  readonly messageId?: string;
};

const isChatRequestBody = (body: unknown): body is ChatRequestBody => {
  if (typeof body !== "object" || body === null) return false;
  const { id, messages, trigger } = body as Record<string, unknown>;
  return (
    typeof id === "string" &&
    id.length > 0 &&
    Array.isArray(messages) &&
    (trigger === "submit-message" || trigger === "regenerate-message")
  );
};

/** The user message a submit-message request sends: the last message, with its text parts joined. */
const userInput = (messages: readonly UIMessage[]) => {
  const message = messages.at(-1);
  if (message?.role !== "user") return undefined;
  const content = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  return { requestId: message.id, content };
};

export const createDurableAgentsServer = (
  options: DurableAgentsServerOptions,
) => {
  const context = options.context ?? BACKGROUND_CONTEXT;
  const conversations = createConversationRegistry(options, context);
  const projection = { clientToolNames: options.clientToolNames };
  const app = new Hono();

  /** Admit the last user message, once per message id, and stream its answer. */
  app.post("/chat", async (ctx) => {
    const body: unknown = await ctx.req.json().catch(() => undefined);
    if (!isChatRequestBody(body)) {
      return ctx.text("Expected an AI SDK chat request.", 400);
    }
    if (body.trigger === "regenerate-message") {
      return ctx.text("Regenerating a message is not supported.", 400);
    }
    const input = userInput(body.messages);
    if (input === undefined) {
      return ctx.text("The last message must be a user message.", 400);
    }
    const conversation = await conversations.acquire(body.id);
    const refusal = await options.admitChat?.(conversation, body);
    if (refusal !== undefined) return ctx.text(refusal.error, refusal.status);
    const { root } = conversation;
    // A repeated message id finds the submission it made the first time.
    const submission = await root.submit(
      {
        type: "input",
        content: input.content,
        requestId: input.requestId,
        whenBusy: "followUp",
      },
      context,
    );
    return createUIMessageStreamResponse({
      stream: await followSubmission(root, submission, projection, context),
    });
  });

  /** Follow the input the running run answers, from the committed view; 204 when idle. */
  app.get("/chat/:id/stream", async (ctx) => {
    const { harness, root } = await conversations.acquire(ctx.req.param("id"));
    const live = await harness.snapshot(LiveDoc, root.id, context);
    const running = live?.run?.inputs.at(0) as SubmissionId | undefined;
    const submission =
      running === undefined
        ? undefined
        : await harness.submission(running, context);
    if (submission === undefined) return ctx.body(null, 204);
    return createUIMessageStreamResponse({
      stream: await followSubmission(root, submission, projection, context),
    });
  });

  /** Stop the conversation: withdraw queued inputs and abort its current work. */
  app.post("/chat/:id/abort", async (ctx) => {
    const { root } = await conversations.acquire(ctx.req.param("id"));
    await root.abort(context);
    return ctx.body(null, 204);
  });

  return { app, conversations, close: conversations.close };
};
