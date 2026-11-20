/**
 * The durable agents server as one process serves it: the chat surface
 * (`createDurableAgentsServer`) with Brunch's HASH agent (`createHashAgent`),
 * every conversation in its own Postgres schema on the process's shared pool,
 * and the browser-call routes beside it, served on Node's `http`.
 *
 * - `POST /chat`, `GET /chat/:id/stream`, `POST /chat/:id/abort`: the chat
 *   surface, whose client is AI SDK's stock `DefaultChatTransport`.
 * - `GET /chat/:id/messages`: the conversation's history for a panel that
 *   opens it.
 * - `POST /conversations/:id/browser-calls/:callId` (claim) and its `/start`,
 *   `/lease`, `/result` and `/fail`: the browser half of a waiting call.
 * - `POST /conversations/:id/browser-calls/hand-edits`: the panel's report of
 *   a hand edit, admitted as a `brunch.hand-edit` note the model reads.
 * - `GET /health`: the process's liveness, outside HASH's entry.
 *
 * A chat request carries its browser's document binding beside the messages
 * (`body: { binding }` on the transport, Brunch's `BrowserContext["binding"]`).
 * Only a request with a valid binding creates a conversation, bound to it in
 * the commit that creates it, so the calls its turn issues are claimable by
 * that binding; a malformed binding is refused with 400, a different binding
 * later with 409, and a request without one leaves a bound conversation as
 * it is, is refused with 409 by an unbound one (which a binding binds), and
 * creates none (404). Save's description names the bound document: the
 * agent's bound Save is installed on every open, before scheduling resumes,
 * and right after a binding's own commit, before the submission.
 *
 * With `hashEntry`, HASH's entry (`createHashEntry`) runs in front of every
 * route but `/health`: credentialed CORS, the session actor, the identity route, ownership
 * by instance ID and the turn limit on `POST /chat`; a new conversation
 * records its actor and web in its creating commit, and every route that
 * opens a conversation, the browser-call routes included, refuses another.
 *
 * Limits come from the environment (`limitsFromEnvironment`) unless given.
 * A request that cannot get a pool connection within the pool's
 * `connectionTimeoutMillis` is answered 503 with `Retry-After`. A request
 * body over `serveNode`'s `defaultMaxBodyBytes` is answered 413 before it is
 * read, and before the entry, so without CORS headers.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  type HarnessOptions,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { Hono } from "hono";
import * as v from "valibot";

import {
  type BrowserContext,
  brunchRoutes,
  canonicalContent,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent";

import { createHashAgent, type HashAgent } from "../agent/hash-agent";
import {
  BrowserBindingDoc,
  bindBrowserDocument,
} from "../browser-call/browser-call";
import { createBrowserCallRouter } from "../browser-call/browser-call-router";
import { isPoolConnectTimeout } from "../storage/postgres/postgres-config";
import {
  postgresConversationStorage,
  postgresConversationExists,
} from "./conversation-storage";
import {
  type ChatRefusal,
  type ConversationSeed,
  createDurableAgentsServer,
  type DurableAgentsServerLimits,
  type DurableAgentsServerOptions,
  type OpenConversation,
} from "./durable-agents-server";
import {
  createHashEntry,
  type HashEntryOptions,
} from "./start-durable-agents-server/hash-entry";
import { limitsFromEnvironment } from "./start-durable-agents-server/limits-from-environment";
import { serveNode } from "./start-durable-agents-server/serve-node";

import type { Pool } from "pg";

/** Where the browser-call routes are mounted: `<prefix>/:conversationId/browser-calls/:callId`. */
export const browserCallsPrefix = "/conversations";

export type StartDurableAgentsServerOptions = {
  /** 0 listens on any free port; the result says which. */
  readonly port: number;
  /** Loopback when absent. */
  readonly hostname?: string;
  /** Whether a proxy in front sets `Host` and `X-Forwarded-Proto` (`serveNode`'s `trustProxy`). */
  readonly trustProxy?: boolean;
  /** Told each error the Node adapter answered 500 for, outside the app's own handler. */
  readonly onServeError?: (error: unknown) => void;
  /** The process's one pool; every conversation's schema is opened on it. */
  readonly pool: Pool;
  readonly models: HarnessOptions["models"];
  /** The model a new conversation's agent starts with. */
  readonly model: ModelRef;
  readonly settings?: HarnessOptions["settings"];
  /** Any of the limits, over the environment's (`limitsFromEnvironment`). */
  readonly limits?: Partial<DurableAgentsServerLimits>;
  /**
   * Told once per crash-loop abort this process performs, as soon as the
   * guard has aborted, even when the rest of that open fails. A process that
   * dies between the guard's commit and this report never tells it; the
   * conversation's `CrashLoopEntry` is the durable record.
   */
  readonly onCrashLoop?: DurableAgentsServerOptions["onCrashLoop"];
  /** Told each of Pi Durable's reports, with the conversation whose Harness made it. */
  readonly onReport?: DurableAgentsServerOptions["onReport"];
  /** Told when a stopped conversation's work fails to unwind after its stop answered. */
  readonly onStopError?: DurableAgentsServerOptions["onStopError"];
  /**
   * HASH's entry in front of every route (`createHashEntry`); `null` serves
   * without it, every request trusted, as a test or probe on loopback does.
   */
  readonly hashEntry: HashEntryOptions | null;
};

/** The longest of a binding's IDs: each is stored in the conversation's binding document. */
const maxBindingIdLength = 256;

/** A chat body's `binding`: absent leaves the conversation as it is; one with a longer ID is malformed. */
const bindingOf = (
  body: Readonly<Record<string, unknown>>,
): BrowserContext["binding"] | "invalid" | undefined => {
  if (body.binding === undefined) return undefined;
  const parsed = v.safeParse(sdcpnInitialDataSchema, {
    binding: body.binding,
  });
  if (!parsed.success || parsed.output === undefined) return "invalid";
  const { binding } = parsed.output;
  return [
    binding.conversationId,
    binding.documentId,
    binding.incarnationId,
  ].every((id) => id === undefined || id.length <= maxBindingIdLength)
    ? binding
    : "invalid";
};

const malformedBinding: ChatRefusal = {
  status: 400,
  error: "Expected a Brunch document binding.",
};

const unboundConversation: ChatRefusal = {
  status: 409,
  error: "The conversation is unbound; a document binding binds it.",
};

/** A new conversation needs the binding its browser calls are issued to, which its creating commit writes. */
export const admitNewConversation = (
  body: Readonly<Record<string, unknown>>,
): ChatRefusal | Required<Pick<ConversationSeed, "binding">> => {
  const binding = bindingOf(body);
  if (binding === "invalid") return malformedBinding;
  if (binding === undefined)
    return {
      status: 404,
      error: "Unknown conversation; a document binding creates one.",
    };
  return { binding };
};

/**
 * Bind an unbound conversation to the request's binding, then install the
 * bound Save before the submission; refuse a different binding, and a
 * request without one while the conversation is unbound.
 */
const admitBinding = async (
  conversation: OpenConversation,
  body: Readonly<Record<string, unknown>>,
  installBoundSave: HashAgent["installBoundSave"],
): Promise<ChatRefusal | undefined> => {
  const { harness, root } = conversation;
  const binding = bindingOf(body);
  if (binding === "invalid") return malformedBinding;
  if (binding === undefined) {
    const stored = (
      await harness.snapshot(BrowserBindingDoc, root.id, BACKGROUND_CONTEXT)
    )?.binding;
    return stored === undefined || stored === null
      ? unboundConversation
      : undefined;
  }
  const bound = await harness.commit(async (tx) => {
    const current = (await tx.doc(BrowserBindingDoc, root.id)).binding;
    if (current === null) {
      await bindBrowserDocument(tx, root.id, binding);
      return true;
    }
    return current === canonicalContent(binding);
  }, BACKGROUND_CONTEXT);
  if (!bound)
    return {
      status: 409,
      error: "The conversation is bound to a different document.",
    };
  await installBoundSave(conversation, BACKGROUND_CONTEXT);
  return undefined;
};

export const startDurableAgentsServer = async (
  options: StartDurableAgentsServerOptions,
) => {
  const { agent, extensions, clientToolNames, installBoundSave } =
    createHashAgent();
  const entry =
    options.hashEntry === null
      ? undefined
      : createHashEntry({ ...options.hashEntry, browserCallsPrefix });
  const server = createDurableAgentsServer({
    openStorage: postgresConversationStorage(options.pool),
    storageExists: postgresConversationExists(options.pool),
    // Each conversation's Harness gets the agent's extensions over its own host binding.
    createRegistry: (host) => {
      const registry = createRegistry();
      for (const extension of extensions(host)) registry.install(extension);
      return registry;
    },
    models: options.models,
    agent: { ...agent, model: options.model },
    settings: options.settings,
    now: Date.now,
    // Before scheduling resumes, so no request after a reopen offers the placeholder Save.
    afterBind: installBoundSave,
    clientToolNames,
    // The panel runs a static client tool part itself; a browser call runs only through the browser-call routes.
    dynamicClientToolNames: clientToolNames,
    admitNewConversation: (body, request) => {
      const admission = admitNewConversation(body);
      return "error" in admission || entry === undefined
        ? admission
        : { ...admission, record: entry.recordActor(request) };
    },
    admitConversation: entry?.admitConversation,
    admitChat: (conversation, body) =>
      admitBinding(conversation, body, installBoundSave),
    limits: { ...limitsFromEnvironment(process.env), ...options.limits },
    onCrashLoop: options.onCrashLoop,
    onReport: options.onReport,
    onStopError: options.onStopError,
    isUnavailable: isPoolConnectTimeout,
  });
  server.app.route(
    browserCallsPrefix,
    createBrowserCallRouter({
      resolveHarness: async (conversationId, request) => {
        const conversation = await server.conversations.acquire(conversationId);
        if (conversation === undefined) return undefined;
        return (
          (await entry?.admitConversation(conversation, request)) ??
          conversation.harness
        );
      },
      now: server.now,
    }),
  );
  // The entry is mounted before the server's routes, so it runs in front of
  // each of them; the server's app keeps its `onError`, so a storage timeout
  // is still a 503.
  const app = new Hono();
  // Ahead of the entry, so a load balancer's probe needs no session.
  app.get(brunchRoutes.health, (request) =>
    request.json({ status: "pass" }, 200, {
      "cache-control": "no-store",
      "content-type": "application/health+json",
    }),
  );
  entry?.mount(app);
  app.route("/", server.app);
  const listener = await serveNode(app.fetch, {
    port: options.port,
    hostname: options.hostname,
    trustProxy: options.trustProxy,
    onError: options.onServeError,
  });
  return {
    port: listener.port,
    /** Stop serving, then close every conversation's Harness. The pool stays the caller's. */
    close: async () => {
      await listener.close();
      await server.close();
    },
  };
};
