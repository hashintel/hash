/**
 * The durable agents server: Brunch's chat surface on Pi Durable, speaking AI
 * SDK's UI message stream protocol, so the stock `DefaultChatTransport` (with
 * `api` at this app's `/chat`) is its client.
 *
 * - `POST /chat` takes `DefaultChatTransport`'s body (`id`, `messages`,
 *   `trigger`, `messageId`), submits the last user message once per message id
 *   as a `brunch.user` or `brunch.ledger-comments` input (`brunchUserInput`),
 *   with the version-load note when it carries a new load, and answers with
 *   that submission's UI message stream. It is the only
 *   route that creates a conversation, and only when `admitNewConversation`
 *   lets the request.
 * - `GET /chat/:id/stream` (the transport's `reconnectToStream`) answers 204
 *   when the conversation is idle, else the running input's stream from the
 *   committed view on; 404 for an unknown conversation. The first one after
 *   the crash-loop guard ended a run, while that is still the conversation's
 *   last run, follows the ended input instead, so the client sees its turn
 *   end in an `error`.
 * - `POST /chat/:id/abort` stops the conversation; AI SDK's `stop()` only
 *   drops the client's fetch, so a client calls it itself. 404 for an unknown
 *   conversation.
 * - `GET /chat/:id/messages` answers the conversation's history as AI SDK
 *   `UIMessage[]` (`historyHandler`), projected with the live stream's own
 *   options; 404 for an unknown conversation.
 *
 * Each conversation is its own Harness on its own storage (see
 * `createConversationRegistry`), checked to still own that storage before
 * every request. The server's limits (`DurableAgentsServerLimits`) bound a
 * run's tool rounds, the process's model requests in flight, how long a turn
 * runs with nobody watching, and how often a task may crash its process.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { LiveDoc, type SubmissionId } from "@earendil-works/pi-durable";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { createAbandonedTurns } from "./durable-agents-server/abandoned-turns";
import {
  type ConversationRegistryOptions,
  type CrashLoopingTask,
  createConversationRegistry,
  type OpenConversation,
} from "./durable-agents-server/conversation-registry";
import { historyHandler } from "./durable-agents-server/history";
import { createRequestSlots } from "./durable-agents-server/request-slots";
import { followSubmission } from "./durable-agents-server/submission-stream";
import { brunchUserInput } from "./durable-agents-server/user-input";
import { contentWithVersionLoadNote } from "./durable-agents-server/version-load";

import type { Context } from "@earendil-works/chord";

export type {
  CrashLoopingTask,
  OpenConversation,
} from "./durable-agents-server/conversation-registry";
export type { RequestSlotsState } from "./durable-agents-server/request-slots";

/** Why a chat request is refused before its submission. */
export type ChatRefusal = {
  readonly status: 400 | 404 | 409;
  readonly error: string;
};

export type DurableAgentsServerLimits = {
  /** Tool rounds one run takes at most; a run that reaches it fails with `turn_limit`. */
  readonly maxTurns: number;
  /** Model requests in flight at once in this process, across conversations; more wait for a slot. */
  readonly maxConcurrentRequests: number;
  /** How long a running turn may go with no client stream and no claimed browser call before it is aborted. */
  readonly abandonedTurnMs: number;
  /** Restarts in a row after which a task's conversation work is aborted on open; `Infinity` never. */
  readonly crashLoopRestarts: number;
};

export const defaultServerLimits: DurableAgentsServerLimits = {
  // HA-3: the model issues one tool call per response, so a realistic HASH net build takes about one round per element.
  maxTurns: 100,
  maxConcurrentRequests: 16,
  abandonedTurnMs: 10 * 60_000,
  crashLoopRestarts: 5,
};

export type DurableAgentsServerOptions = ConversationRegistryOptions & {
  /** Tools the browser runs; their calls stream for the client's `onToolCall`. */
  readonly clientToolNames: ReadonlySet<string>;
  /** Of those, the ones streamed as dynamic tools; the live stream and the history route agree. */
  readonly dynamicClientToolNames?: ReadonlySet<string>;
  /**
   * Runs on a `POST /chat` that names a conversation that does not exist,
   * before anything is created, with the request's whole body. A refusal
   * answers the request and creates nothing. Absent, every chat request
   * creates its conversation.
   */
  readonly admitNewConversation?: (
    body: Readonly<Record<string, unknown>>,
  ) => ChatRefusal | undefined;
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
  /** Any of the limits, over `defaultServerLimits`. */
  readonly limits?: Partial<DurableAgentsServerLimits>;
  /** Told when opening a conversation aborted its work for a crash loop. */
  readonly onCrashLoop?: (
    conversationId: string,
    tasks: readonly CrashLoopingTask[],
  ) => void;
  /**
   * Whether a request's error means the server is unavailable for now, such
   * as a storage connection that did not come in time: answered 503 with
   * `Retry-After` instead of 500.
   */
  readonly isUnavailable?: (error: unknown) => boolean;
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

/** The user message a submit-message request sends: the last message, its text parts joined, as an input. */
const userInput = (messages: readonly UIMessage[]) => {
  const message = messages.at(-1);
  if (message?.role !== "user") return undefined;
  const text = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  return { requestId: message.id, ...brunchUserInput(text) };
};

const unknownConversation = "Unknown conversation.";

/** What a 503 tells the client to wait before it tries again, in seconds. */
export const unavailableRetryAfterSeconds = 1;

export const createDurableAgentsServer = (
  options: DurableAgentsServerOptions,
) => {
  const context = options.context ?? BACKGROUND_CONTEXT;
  const limits = { ...defaultServerLimits, ...options.limits };
  const requestSlots = createRequestSlots(limits.maxConcurrentRequests);
  const turns = createAbandonedTurns({
    timeoutMs: limits.abandonedTurnMs,
    // Only called once a conversation is open, after the registry exists.
    ifOwned: (conversationId) => conversations.ifOwned(conversationId),
    context,
  });
  const conversations = createConversationRegistry(
    options,
    {
      maxTurns: limits.maxTurns,
      crashLoopRestarts: limits.crashLoopRestarts,
      requestSlots,
      onOpen: (conversationId, crashLoop) => {
        turns.opened(conversationId);
        crashLoopEnded.delete(conversationId);
        if (crashLoop === undefined) return;
        if (crashLoop.running !== undefined)
          crashLoopEnded.set(conversationId, crashLoop.running);
        options.onCrashLoop?.(conversationId, crashLoop.tasks);
      },
    },
    context,
  );
  /** Per conversation, the input its crash-loop guard ended on open here, until a reconnect follows it. */
  const crashLoopEnded = new Map<string, SubmissionId>();
  const projection = {
    clientToolNames: options.clientToolNames,
    dynamicClientToolNames: options.dynamicClientToolNames,
  };
  const app = new Hono();

  // Hono's own handler, but a request the server could not serve for now is a 503 the client may retry.
  app.onError((error, ctx) => {
    if (options.isUnavailable?.(error) === true) {
      ctx.header("Retry-After", String(unavailableRetryAfterSeconds));
      return ctx.text("The server is busy; try again shortly.", 503);
    }
    if (error instanceof HTTPException) return error.getResponse();
    // oxlint-disable-next-line no-console -- As Hono's default handler, which this one replaces.
    console.error(error);
    return ctx.text("Internal Server Error", 500);
  });

  /** A client stream of `submission`, counted as watching the conversation until it ends. */
  const follow = async (
    conversationId: string,
    { root }: OpenConversation,
    submission: Parameters<typeof followSubmission>[1],
  ) => {
    const detach = turns.attach(conversationId);
    try {
      return createUIMessageStreamResponse({
        stream: await followSubmission(
          root,
          submission,
          projection,
          context,
          detach,
        ),
      });
    } catch (error) {
      detach();
      throw error;
    }
  };

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
    let conversation = await conversations.acquire(body.id);
    if (conversation === undefined) {
      const refusal = options.admitNewConversation?.(body);
      if (refusal !== undefined) return ctx.text(refusal.error, refusal.status);
      conversation = await conversations.create(body.id);
    }
    const refusal = await options.admitChat?.(conversation, body);
    if (refusal !== undefined) return ctx.text(refusal.error, refusal.status);
    const { harness, root } = conversation;
    // A repeated message id finds the submission it made the first time and writes nothing, so a late retry
    // cannot move the version-load document back.
    const submissionId = await root.commit(async (tx) => {
      const existing = await tx.submissionByRequest(root.id, input.requestId);
      if (existing !== undefined) return existing.id;
      return root.submit(tx, {
        type: "input",
        content: await contentWithVersionLoadNote(tx, root.id, input),
        entry: input.entry,
        requestId: input.requestId,
        whenBusy: "followUp",
      });
    }, context);
    const submission = await harness.submission(submissionId, context);
    if (submission === undefined)
      throw new Error(`Submission ${submissionId} is missing.`);
    return follow(body.id, conversation, submission);
  });

  /** Follow the input the running run answers, from the committed view; 204 when idle. */
  app.get("/chat/:id/stream", async (ctx) => {
    const conversationId = ctx.req.param("id");
    const conversation = await conversations.acquire(conversationId);
    if (conversation === undefined) return ctx.text(unknownConversation, 404);
    const { harness, root } = conversation;
    const live = await harness.snapshot(LiveDoc, root.id, context);
    const ended = crashLoopEnded.get(conversationId);
    crashLoopEnded.delete(conversationId);
    // Idle after a crash-loop abort that is still the last run's end: follow the input it ended, once.
    const followed =
      live?.run?.inputs.at(0) ??
      (ended !== undefined && live?.runFailure?.inputs.includes(ended) === true
        ? ended
        : undefined);
    const submission =
      followed === undefined
        ? undefined
        : await harness.submission(followed, context);
    if (submission === undefined) return ctx.body(null, 204);
    return follow(conversationId, conversation, submission);
  });

  /** Stop the conversation: withdraw queued inputs and abort its current work. */
  app.post("/chat/:id/abort", async (ctx) => {
    const conversation = await conversations.acquire(ctx.req.param("id"));
    if (conversation === undefined) return ctx.text(unknownConversation, 404);
    await conversation.root.abort(context);
    return ctx.body(null, 204);
  });

  /** The conversation's history, as the live stream projects it. */
  app.get(
    "/chat/:id/messages",
    historyHandler({ conversations, context, ...projection }),
  );

  return {
    app,
    conversations,
    requestSlots: { state: requestSlots.state },
    close: async () => {
      turns.close();
      await conversations.close();
    },
  };
};
