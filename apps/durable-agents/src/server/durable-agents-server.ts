/**
 * The durable agents server: Brunch's chat surface on Pi Durable, speaking AI
 * SDK's UI message stream protocol, so the stock `DefaultChatTransport` (with
 * `api` at this app's `/chat`) is its client.
 *
 * - `POST /chat` takes `DefaultChatTransport`'s body (`id`, `messages`,
 *   `trigger`, `messageId`), submits the last user message once per message id
 *   as a `brunch.user` or `brunch.ledger-comments` input (`brunchUserInput`),
 *   recording a new version load it carries for the `version_load` section
 *   in the same commit (`version-load.ts`), and answers with
 *   that submission's UI message stream; 409 when the message id is the
 *   request ID of a submission other than an input. It is the only
 *   route that creates a conversation, and only when `admitNewConversation`
 *   lets the request.
 * - `GET /chat/:id/stream` (the transport's `reconnectToStream`) answers 204
 *   when the conversation is idle, else the running input's stream from the
 *   committed view on. A reconnect that reopens an owner can follow work it
 *   recovered even if it settled during open; 404 for an unknown conversation.
 *   If the last run ended in a crash loop, reconnect replays that failed input
 *   under the same message ID, until a newer run starts.
 * - `POST /chat/:id/abort` stops the conversation; AI SDK's `stop()` only
 *   drops the client's fetch, so a client calls it itself. 404 for an unknown
 *   conversation.
 * - `GET /chat/:id/messages` answers the conversation's history as AI SDK
 *   `UIMessage[]` (`historyHandler`), projected with the live stream's own
 *   options; 404 for an unknown conversation.
 * - Any `HEAD` request is answered 405, on these routes and on any mounted
 *   on `app` later.
 *
 * Each conversation is its own Harness on its own storage (see
 * `createConversationRegistry`), checked to still own that storage before
 * every request. The server's limits (`DurableAgentsServerLimits`) bound a
 * run's tool rounds, the process's model requests in flight, how long a turn
 * runs with nobody watching, and how often a task may crash its process.
 */
import {
  BACKGROUND_CONTEXT,
  type Context,
} from "@earendil-works/chord/context";
import { LiveDoc, type SubmissionId } from "@earendil-works/pi-durable";
import {
  createUIMessageStreamResponse,
  type TextUIPart,
  type UIMessage,
} from "ai";
import { type Context as HonoContext, Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { createAbandonedTurns } from "./durable-agents-server/abandoned-turns";
import {
  type ConversationRegistryOptions,
  type ConversationSeed,
  type CrashLoopingTask,
  createConversationRegistry,
  type OpenConversation,
} from "./durable-agents-server/conversation-registry";
import { historyHandler } from "./durable-agents-server/history";
import { queuedInputRecorder } from "./durable-agents-server/queued-input";
import { createRequestSlots } from "./durable-agents-server/request-slots";
import {
  followSubmission,
  replayCrashLoop,
} from "./durable-agents-server/submission-stream";
import {
  brunchUserInput,
  type ChatInput,
} from "./durable-agents-server/user-input";
import { recordVersionLoad } from "./durable-agents-server/version-load";

import type { InputRequest } from "./durable-agents-server/shared/input-entry";

export type {
  ConversationSeed,
  CrashLoopingTask,
  OpenConversation,
} from "./durable-agents-server/conversation-registry";
export type { RequestSlotsState } from "./durable-agents-server/request-slots";

/** Why a chat request is refused before its submission. */
export type ChatRefusal = {
  readonly status: 400 | 404 | 409 | 413;
  readonly error: string;
};

/** The longest message id a chat request may send: the request ID its input is admitted under. */
const maxRequestIdLength = 256;

/** The most text a chat request's message may carry, across its text parts, in UTF-16 code units. */
const maxUserTextLength = 100_000;

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
   * before anything is created, with the request's whole body and the
   * request. A refusal answers the request and creates nothing; a seed is
   * written in the commit that creates the conversation. Absent, every chat
   * request creates its conversation.
   */
  readonly admitNewConversation?: (
    body: Readonly<Record<string, unknown>>,
    request: HonoContext,
  ) => ChatRefusal | ConversationSeed | undefined;
  /**
   * Runs on every route that names a conversation, once it is open and before
   * the route reads or writes it (on `POST /chat` also after creating it,
   * before `admitChat`), so a host can check the request against what the
   * conversation records, such as who owns it. A response refuses the
   * request and is its answer.
   */
  readonly admitConversation?: (
    conversation: OpenConversation,
    request: HonoContext,
  ) => Promise<Response | undefined>;
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
  /**
   * Told once per crash-loop abort this process performs, as soon as the
   * guard has aborted, even when the rest of that open fails.
   */
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

/**
 * What `DefaultChatTransport` POSTs, as far as this server reads it. Its
 * messages stay unread until `userInput` reads the last one.
 */
type ChatRequestBody = {
  readonly id: string;
  readonly messages: readonly unknown[];
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

/** The text a message part adds: a `TextUIPart`'s text; any other part, or one whose text is not a string, adds none. */
const partText = (part: unknown): TextUIPart["text"] | undefined =>
  typeof part === "object" &&
  part !== null &&
  "type" in part &&
  part.type === ("text" satisfies TextUIPart["type"]) &&
  "text" in part &&
  typeof part.text === "string"
    ? part.text
    : undefined;

/**
 * The user message a submit-message request sends: the last message, its
 * text parts joined, as an input. Only what this reads of the last message is
 * checked: it is refused when it is not a user message, or is one without a
 * string `id` and a list of `parts`, with 400; when its id is longer than
 * `maxRequestIdLength`, with 400; and when its text is longer than
 * `maxUserTextLength`, with 413.
 */
const userInput = (
  messages: readonly unknown[],
): (ChatInput & { readonly requestId: UIMessage["id"] }) | ChatRefusal => {
  const message = messages.at(-1);
  if (
    typeof message !== "object" ||
    message === null ||
    !("role" in message) ||
    message.role !== ("user" satisfies UIMessage["role"])
  )
    return { status: 400, error: "The last message must be a user message." };
  if (
    !("id" in message) ||
    typeof message.id !== "string" ||
    !("parts" in message) ||
    !Array.isArray(message.parts)
  )
    return {
      status: 400,
      error: "The last message must have a string id and a list of parts.",
    };
  if (message.id.length > maxRequestIdLength)
    return {
      status: 400,
      error: `The last message's id must be at most ${maxRequestIdLength} characters.`,
    };
  const parts: readonly unknown[] = message.parts;
  const text = parts.flatMap((part) => partText(part) ?? []).join("");
  if (text.length > maxUserTextLength)
    return {
      status: 413,
      error: `The message must be at most ${maxUserTextLength} characters.`,
    };
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
  const { now } = options;
  const turns = createAbandonedTurns({
    timeoutMs: limits.abandonedTurnMs,
    now,
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
      onOpen: (conversationId) => turns.opened(conversationId),
      onCrashLoop: (conversationId, { tasks }) =>
        options.onCrashLoop?.(conversationId, tasks),
    },
    context,
  );
  const projection = {
    clientToolNames: options.clientToolNames,
    dynamicClientToolNames: options.dynamicClientToolNames,
  };
  const app = new Hono();

  // Hono answers HEAD with the GET route, which would follow a turn or open a conversation; no HEAD route matches.
  app.use("*", async (ctx, next) =>
    ctx.req.method === "HEAD" ? ctx.body(null, 405) : next(),
  );

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
    { root }: OpenConversation,
    submission: Parameters<typeof followSubmission>[1],
    signal: AbortSignal,
    detach: () => void,
  ) =>
    createUIMessageStreamResponse({
      stream: await followSubmission(
        root,
        submission,
        projection,
        context,
        detach,
        signal,
      ),
    });

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
    if ("error" in input) return ctx.text(input.error, input.status);
    const detach = turns.attach(body.id);
    let following = false;
    try {
      let conversation = await conversations.acquire(body.id);
      if (conversation === undefined) {
        const admission = options.admitNewConversation?.(body, ctx);
        if (admission !== undefined && "error" in admission)
          return ctx.text(admission.error, admission.status);
        conversation = await conversations.create(body.id, admission);
      }
      const refused = await options.admitConversation?.(conversation, ctx);
      if (refused !== undefined) return refused;
      const refusal = await options.admitChat?.(conversation, body);
      if (refusal !== undefined) return ctx.text(refusal.error, refusal.status);
      const { harness, root } = conversation;
      // A repeated message id finds its original submission and records no version load.
      // Admission deliberately does not use the response's cancellation signal.
      const submissionId = await root.commit(async (tx) => {
        const existing = await tx.submissionByRequest(root.id, input.requestId);
        // Pi refuses a request ID of another submission type with an untyped error; this is its check.
        if (existing !== undefined)
          return existing.type === "input" ? existing.id : undefined;
        const recordQueued = await queuedInputRecorder(tx, root.id);
        const request: InputRequest = { requestId: input.requestId };
        const submitted = await root.submit(tx, {
          type: "input",
          content: input.content,
          // The entry keeps its request ID, which history names its message by.
          entry: { ...input.entry, data: { ...input.entry.data, ...request } },
          requestId: input.requestId,
          whenBusy: "followUp",
        });
        await recordVersionLoad(tx, root.id, input, submitted);
        await recordQueued(input, input.requestId, submitted);
        return submitted;
      }, context);
      if (submissionId === undefined)
        return ctx.text(
          "The message id already names a submission that is not a chat message.",
          409,
        );
      const submission = await harness.submission(submissionId, context);
      if (submission === undefined)
        throw new Error(`Submission ${submissionId} is missing.`);
      const response = await follow(
        conversation,
        submission,
        ctx.req.raw.signal,
        detach,
      );
      following = true;
      return response;
    } finally {
      if (!following) detach();
    }
  });

  /** Follow the input the running run answers, from the committed view; 204 when idle. */
  app.get("/chat/:id/stream", async (ctx) => {
    const conversationId = ctx.req.param("id");
    // A reconnect invalidates an abandonment check before starting its own reads.
    const detach = turns.attach(conversationId);
    let following = false;
    try {
      let recoveringInput: SubmissionId | undefined;
      const conversation = await conversations.acquire(
        conversationId,
        (input) => {
          recoveringInput = input;
        },
      );
      if (conversation === undefined) return ctx.text(unknownConversation, 404);
      const refused = await options.admitConversation?.(conversation, ctx);
      if (refused !== undefined) return refused;
      const { harness, root } = conversation;
      // The opening reconnect has already selected its input. Other requests
      // select independently and do not inherit that owner's recovery result.
      const live =
        recoveringInput === undefined
          ? await harness.snapshot(LiveDoc, root.id, context)
          : undefined;
      const failure =
        live?.run === undefined && live?.runFailure?.reason === "aborted"
          ? live.runFailure
          : undefined;
      const followed =
        recoveringInput ?? live?.run?.inputs.at(0) ?? failure?.inputs.at(0);
      if (followed === undefined) return ctx.body(null, 204);
      const submission = await harness.submission(followed, context);
      if (submission === undefined) return ctx.body(null, 204);
      if (failure !== undefined) {
        const stream = await replayCrashLoop(
          root,
          submission,
          failure.taskId,
          projection,
          context,
        );
        if (stream === undefined) return ctx.body(null, 204);
        const current = await harness.snapshot(LiveDoc, root.id, context);
        if (
          current?.run !== undefined ||
          current?.runFailure?.taskId !== failure.taskId
        ) {
          await stream.cancel();
          return ctx.body(null, 204);
        }
        return createUIMessageStreamResponse({ stream });
      }
      const response = await follow(
        conversation,
        submission,
        ctx.req.raw.signal,
        detach,
      );
      following = true;
      return response;
    } finally {
      if (!following) detach();
    }
  });

  /** Stop the conversation: withdraw queued inputs and abort its current work. */
  app.post("/chat/:id/abort", async (ctx) => {
    const conversation = await conversations.acquire(ctx.req.param("id"));
    if (conversation === undefined) return ctx.text(unknownConversation, 404);
    const refused = await options.admitConversation?.(conversation, ctx);
    if (refused !== undefined) return refused;
    await conversation.root.abort(context);
    return ctx.body(null, 204);
  });

  /** The conversation's history, as the live stream projects it. */
  app.get(
    "/chat/:id/messages",
    historyHandler({
      conversations,
      admit: options.admitConversation,
      context,
      ...projection,
    }),
  );

  return {
    app,
    conversations,
    /** The Harness clock, for the browser-call routes mounted beside the app. */
    now,
    requestSlots: { state: requestSlots.state },
    close: async () => {
      turns.close();
      await conversations.close();
    },
  };
};
