/**
 * HASH's entry to the durable agents server: what a HASH page's request
 * passes before any route reads it, in Brunch's HASH route's order.
 *
 * 1. Credentialed CORS for the exact origins configured, allowing
 *    `Content-Type` and the conversation and web headers, with preflights
 *    cached for ten minutes. It runs first, so the refusals after it are
 *    readable by the page.
 * 2. The session actor (`hashSessionActor`): 401 without a complete HASH
 *    account's session, 503 when hash-api cannot answer. The byte limit on
 *    bodies runs before all of this, in `serveNode`.
 * 3. `GET /agents/hash/identity`, which answers the session's
 *    `{ actorKey }`, uncached, and needs no conversation.
 * 4. Ownership, on every route that names a conversation: the instance ID it
 *    names (`POST /chat`'s body `id`, else the `:id` of `/chat/:id/…` and of
 *    the browser-call routes) must be `flueConversationIdWeb` of the
 *    session's actor and the raw conversation ID in `brunchHeaders.conversation`,
 *    and `brunchHeaders.web` must name a web. 401 without either header, 400
 *    for one longer than 256 characters, 403 for another instance; a chat
 *    body's binding naming another conversation than the header is also 403.
 * 5. The turn limit (`hashTurnLimit`), on `POST /chat` alone.
 *
 * All of these refuse a request before the server's routes, so before it
 * counts as watching a turn. Behind them, the server asks the entry twice:
 * a new conversation records its actor and web (`ConversationActorDoc`) in
 * its creating commit (`recordActor`), and every route that opens a
 * conversation refuses with 403 a request whose actor or web is not the
 * recorded one, or a conversation with none recorded (`admitConversation`).
 */
import { timingSafeEqual } from "node:crypto";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { cors } from "hono/cors";

import {
  brunchHeaders,
  brunchRoutes,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";
import {
  hashSessionActor,
  hashTurnLimit,
  type SessionActorCache,
  type SessionCheckWarning,
  type TurnWindows,
} from "@hashintel/brunch-agent/server";

import { ConversationActorDoc } from "./hash-entry/conversation-actor-doc";

import type { Environment } from "../../shared/integer-from-environment";
import type {
  ConversationSeed,
  OpenConversation,
} from "../durable-agents-server";
import type { Context, Hono, MiddlewareHandler } from "hono";

/** Where the entry checks a request's session, and whose pages may send it. */
export type HashEntryConfig = {
  /** hash-api's origin, whose GraphQL `sessionAccount` resolves the session cookie. */
  readonly apiOrigin: string;
  /** The exact origins whose pages may send the session cookie and read the answers. */
  readonly allowedOrigins: readonly string[];
};

export type HashEntryOptions = HashEntryConfig & {
  /** Told when hash-api could not answer a session check, without the session. */
  readonly logWarning: SessionCheckWarning;
  readonly sessionCache?: SessionActorCache;
  readonly turnWindows?: TurnWindows;
};

const variables = {
  apiOrigin: "API_ORIGIN",
  allowedOrigins: "BRUNCH_HASH_CORS_ALLOWED_ORIGINS",
} as const satisfies Record<keyof HashEntryConfig, string>;

/** The longest conversation or web header the entry reads. */
const maxHeaderLength = 256;

const unauthorized = { error: "unauthorized" } as const;
const forbidden = { error: "forbidden" } as const;

// Exact origins only, checked before WHATWG URL parsing forgives a malformed one.
const exactHttpOriginPattern =
  /^https?:\/\/(?:\[[0-9a-f:.]+\]|[^\s:/?#@\\*]+)(?::[0-9]+)?\/?$/iu;

/** `value` as an HTTP(S) origin; `undefined` when it is anything more or less. */
const originOf = (value: string): string | undefined => {
  if (!exactHttpOriginPattern.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.username === "" && url.password === "" && url.origin !== "null"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The entry's configuration from the process environment, both required:
 * `API_ORIGIN`, hash-api's origin, and `BRUNCH_HASH_CORS_ALLOWED_ORIGINS`,
 * comma-separated exact HTTP(S) origins (no wildcards, as Brunch's HASH
 * route reads them). Anything else throws.
 */
export const hashEntryFromEnvironment = (
  environment: Environment,
): HashEntryConfig => {
  const apiOrigin = originOf(environment[variables.apiOrigin]?.trim() ?? "");
  if (apiOrigin === undefined)
    throw new Error(
      `Set ${variables.apiOrigin} to hash-api's HTTP(S) origin; HASH's entry checks sessions there.`,
    );
  const entries = (environment[variables.allowedOrigins] ?? "")
    .split(",")
    .map((entry) => entry.trim());
  const allowedOrigins = entries.map(originOf);
  if (
    entries.every((entry) => entry === "") ||
    allowedOrigins.some((origin) => origin === undefined)
  )
    throw new Error(
      `Set ${variables.allowedOrigins} to comma-separated exact HTTP(S) origins: the HASH pages that may call with their session.`,
    );
  return {
    apiOrigin,
    allowedOrigins: [...new Set(allowedOrigins as string[])],
  };
};

/** Whether `instanceId` is the instance of `conversationId` for `actorKey`, compared in constant time. */
const ownsInstance = async (
  actorKey: string,
  conversationId: string,
  instanceId: string,
) => {
  const expected = Buffer.from(
    await flueConversationIdWeb({ actorKey, conversationId }),
  );
  const named = Buffer.from(instanceId);
  return named.length === expected.length && timingSafeEqual(named, expected);
};

/** A header's trimmed value; `undefined` when absent or blank. */
const headerOf = (request: Context, name: string) => {
  const value = request.req.header(name)?.trim();
  return value === undefined || value === "" ? undefined : value;
};

/** The conversation `binding.conversationId` of a chat body names, when it names one. */
const boundConversationOf = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("binding" in body))
    return undefined;
  const { binding } = body;
  return typeof binding === "object" &&
    binding !== null &&
    "conversationId" in binding
    ? binding.conversationId
    : undefined;
};

export const createHashEntry = ({
  apiOrigin,
  allowedOrigins,
  browserCallsPrefix,
  logWarning,
  sessionCache,
  turnWindows,
}: HashEntryOptions & {
  /** Where the browser-call routes are mounted: `<prefix>/:id/browser-calls/…`. */
  readonly browserCallsPrefix: string;
}) => {
  const credentialedCors = cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      brunchHeaders.conversation,
      brunchHeaders.web,
    ],
    credentials: true,
    maxAge: 600,
  });
  /** CORS for a cross-origin request; an `OPTIONS` that is no preflight goes on to the session check. */
  const entryCors: MiddlewareHandler = (request, next) =>
    request.req.method === "OPTIONS" &&
    (headerOf(request, "origin") === undefined ||
      headerOf(request, "access-control-request-method") === undefined)
      ? next()
      : credentialedCors(request, next);

  /** Ownership of the instance `instanceOf` reads from the request. */
  const ownership =
    (instanceOf: (request: Context) => Promise<unknown>): MiddlewareHandler =>
    async (request, next) => {
      const actorKey = request.get("hashSessionActorKey");
      const conversationId = headerOf(request, brunchHeaders.conversation);
      const webId = headerOf(request, brunchHeaders.web);
      if (conversationId === undefined || webId === undefined)
        return request.json(unauthorized, 401);
      if (
        conversationId.length > maxHeaderLength ||
        webId.length > maxHeaderLength
      )
        return request.json({ error: "invalid-header" }, 400);
      const instanceId = await instanceOf(request);
      if (
        typeof instanceId !== "string" ||
        !(await ownsInstance(actorKey, conversationId, instanceId))
      )
        return request.json(forbidden, 403);
      return next();
    };

  const chatBodyOwnership = ownership(async (request) => {
    // A clone, so the route still reads the whole body.
    const body: unknown = await request.req.raw
      .clone()
      .json()
      .catch(() => undefined);
    const bound = boundConversationOf(body);
    if (
      bound !== undefined &&
      bound !== headerOf(request, brunchHeaders.conversation)
    )
      return undefined;
    return typeof body === "object" && body !== null && "id" in body
      ? body.id
      : undefined;
  });
  const chatOwnership: MiddlewareHandler = (request, next) =>
    request.req.method === "POST" ? chatBodyOwnership(request, next) : next();
  const routeOwnership = ownership(async (request) => request.req.param("id"));

  return {
    /**
     * Mount the entry on `app`, before the routes it guards: every request
     * `app` serves passes it.
     */
    mount: (app: Hono) => {
      app.use(
        "*",
        entryCors,
        hashSessionActor({ apiOrigin, cache: sessionCache, logWarning }),
      );
      app.get(brunchRoutes.hashIdentity, (request) => {
        // The answer names the session's user, so no cache may keep it.
        request.header("Cache-Control", "no-store");
        return request.json({ actorKey: request.get("hashSessionActorKey") });
      });
      app.use("/chat", chatOwnership);
      app.use("/chat/:id/*", routeOwnership);
      app.use(`${browserCallsPrefix}/:id/*`, routeOwnership);
      app.use(
        "/chat",
        hashTurnLimit({
          isTurnSubmission: (request) =>
            request.req.method === "POST" && request.req.path === "/chat",
          windows: turnWindows,
        }),
      );
    },
    /** What a new conversation's creating commit records of the request: its session's actor and its web. */
    recordActor:
      (request: Context): NonNullable<ConversationSeed["record"]> =>
      async (tx, conversationId) => {
        const actor = await tx.doc(ConversationActorDoc, conversationId);
        actor.actorKey = request.get("hashSessionActorKey");
        actor.webId = headerOf(request, brunchHeaders.web) ?? null;
      },
    /** Refuse a request whose session's actor or web is not the one the conversation recorded. */
    admitConversation: async (
      { harness, root }: Pick<OpenConversation, "harness" | "root">,
      request: Context,
    ): Promise<Response | undefined> => {
      const actor = await harness.snapshot(
        ConversationActorDoc,
        root.id,
        BACKGROUND_CONTEXT,
      );
      // The session's actor and a web header are strings, so an unrecorded `null` never matches.
      return actor !== undefined &&
        actor.actorKey === request.get("hashSessionActorKey") &&
        actor.webId === headerOf(request, brunchHeaders.web)
        ? undefined
        : request.json(forbidden, 403);
    },
  };
};

export type HashEntry = ReturnType<typeof createHashEntry>;
