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
 *
 * A chat request carries its browser's document binding beside the messages
 * (`body: { binding }` on the transport, Brunch's `BrowserContext["binding"]`).
 * Only a request with a valid binding creates a conversation, bound to it
 * before the submission, so the calls its turn issues are claimable by that
 * binding; a malformed binding is refused with 400, a different binding
 * later with 409, and a request without one leaves its conversation as it
 * is (and creates none: 404). Save's description names the bound document:
 * the agent's bound Save is installed on every open, before scheduling
 * resumes, and right after the binding's commit, before the submission.
 *
 * Limits come from the environment (`limitsFromEnvironment`) unless given.
 * A request that cannot get a pool connection within the pool's
 * `connectionTimeoutMillis` is answered 503 with `Retry-After`.
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
  canonicalContent,
  vSdcpnInitialData,
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
  createDurableAgentsServer,
  type DurableAgentsServerLimits,
  type DurableAgentsServerOptions,
  type OpenConversation,
} from "./durable-agents-server";
import { limitsFromEnvironment } from "./start-durable-agents-server/limits-from-environment";
import { serveNode } from "./start-durable-agents-server/serve-node";

import type { Pool } from "pg";

/** Where the browser-call routes are mounted: `<prefix>/:conversationId/browser-calls/:callId`. */
export const browserCallsPrefix = "/conversations";

export type StartDurableAgentsServerOptions = {
  /** 0 listens on any free port; the result says which. */
  readonly port: number;
  readonly hostname?: string;
  /** The process's one pool; every conversation's schema is opened on it. */
  readonly pool: Pool;
  readonly models: HarnessOptions["models"];
  /** The model a new conversation's agent starts with. */
  readonly model: ModelRef;
  readonly settings?: HarnessOptions["settings"];
  /** Any of the limits, over the environment's (`limitsFromEnvironment`). */
  readonly limits?: Partial<DurableAgentsServerLimits>;
  /** Told when opening a conversation aborted its work for a crash loop. */
  readonly onCrashLoop?: DurableAgentsServerOptions["onCrashLoop"];
};

/** A chat body's `binding`: absent leaves the conversation as it is. */
const bindingOf = (
  body: Readonly<Record<string, unknown>>,
): BrowserContext["binding"] | "invalid" | undefined => {
  if (body.binding === undefined) return undefined;
  const parsed = v.safeParse(vSdcpnInitialData, {
    binding: body.binding,
  });
  return parsed.success && parsed.output !== undefined
    ? parsed.output.binding
    : "invalid";
};

const malformedBinding: ChatRefusal = {
  status: 400,
  error: "Expected a Brunch document binding.",
};

/** A new conversation needs the binding its browser calls are issued to. */
const admitNewConversation = (
  body: Readonly<Record<string, unknown>>,
): ChatRefusal | undefined => {
  const binding = bindingOf(body);
  if (binding === "invalid") return malformedBinding;
  if (binding === undefined)
    return {
      status: 404,
      error: "Unknown conversation; a document binding creates one.",
    };
  return undefined;
};

/**
 * Bind an unbound conversation to the request's binding, then install the
 * bound Save before the submission; refuse a different binding.
 */
const admitBinding = async (
  conversation: OpenConversation,
  body: Readonly<Record<string, unknown>>,
  installBoundSave: HashAgent["installBoundSave"],
): Promise<ChatRefusal | undefined> => {
  const { harness, root } = conversation;
  const binding = bindingOf(body);
  if (binding === undefined) return undefined;
  if (binding === "invalid") return malformedBinding;
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
    // Before scheduling resumes, so no request after a reopen offers the placeholder Save.
    afterBind: installBoundSave,
    clientToolNames,
    admitNewConversation,
    admitChat: (conversation, body) =>
      admitBinding(conversation, body, installBoundSave),
    limits: { ...limitsFromEnvironment(process.env), ...options.limits },
    onCrashLoop: options.onCrashLoop,
    isUnavailable: isPoolConnectTimeout,
  });
  server.app.route(
    browserCallsPrefix,
    createBrowserCallRouter({
      resolveHarness: async (conversationId) =>
        (await server.conversations.acquire(conversationId))?.harness,
    }),
  );
  /**
   * The H7 seam: HASH's entry (credentialed CORS, the body limit, the session
   * actor, ownership by instance ID, the turn limit on `POST /chat`) mounts
   * here, as `app.use` before the `route` below, so it runs in front of every
   * route the process serves: the chat, browser-call and history routes. The
   * inner app keeps its `onError`, so a storage timeout is still a 503.
   */
  const app = new Hono();
  app.route("/", server.app);
  const listener = await serveNode(app.fetch, {
    port: options.port,
    hostname: options.hostname,
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
