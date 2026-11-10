/**
 * The durable agents server as one process serves it: the chat surface
 * (`createDurableAgentsServer`) with the minimal Petrinaut agent, every
 * conversation in its own Postgres schema on the process's shared pool, and
 * the browser-call routes beside it, served on Node's `http`.
 *
 * - `POST /chat`, `GET /chat/:id/stream`, `POST /chat/:id/abort`: the chat
 *   surface, whose client is AI SDK's stock `DefaultChatTransport`.
 * - `POST /conversations/:id/browser-calls/:callId` (claim) and its `/start`,
 *   `/lease`, `/result` and `/fail`: the browser half of a waiting call.
 *
 * A chat request carries its browser's document binding beside the messages
 * (`body: { binding }` on the transport, Brunch's `BrowserContext["binding"]`).
 * Only a request with a valid binding creates a conversation, bound to it
 * before the submission, so the calls its turn issues are claimable by that
 * binding; a malformed binding is refused with 400, a different binding
 * later with 409, and a request without one leaves its conversation as it
 * is (and creates none: 404).
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
import * as v from "valibot";

import {
  type BrowserContext,
  canonicalContent,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent";

import { createPetrinautAgent } from "../agent/petrinaut-agent";
import {
  BrowserBindingDoc,
  bindBrowserDocument,
} from "../browser-call/browser-call";
import { createBrowserCallRouter } from "../browser-call/browser-call-router";
import { petrinautBrowserTools } from "../browser-call/petrinaut-browser-tools";
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
  const parsed = v.safeParse(sdcpnInitialDataSchema, {
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

/** Bind an unbound conversation to the request's binding; refuse a different one. */
const admitBinding = async (
  { harness, root }: OpenConversation,
  body: Readonly<Record<string, unknown>>,
): Promise<ChatRefusal | undefined> => {
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
  return bound
    ? undefined
    : {
        status: 409,
        error: "The conversation is bound to a different document.",
      };
};

export const startDurableAgentsServer = async (
  options: StartDurableAgentsServerOptions,
) => {
  const { agent, extensions } = createPetrinautAgent();
  const server = createDurableAgentsServer({
    openStorage: postgresConversationStorage(options.pool),
    storageExists: postgresConversationExists(options.pool),
    createRegistry: () => {
      const registry = createRegistry();
      for (const extension of extensions) registry.install(extension);
      return registry;
    },
    models: options.models,
    agent: { ...agent, model: options.model },
    settings: options.settings,
    clientToolNames: new Set(petrinautBrowserTools.map(({ name }) => name)),
    admitNewConversation,
    admitChat: admitBinding,
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
  const listener = await serveNode(server.app.fetch, {
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
