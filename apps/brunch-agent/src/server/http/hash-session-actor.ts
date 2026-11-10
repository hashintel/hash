/**
 * Hono middleware that names the HASH agent route's actor from the caller's
 * own HASH session. The browser sends its session cookie to Brunch, which
 * forwards it to hash-api's `me` query and takes the user, and whether their
 * signup is complete, only from hash-api's answer. Brunch never talks to
 * Kratos, and nothing between the browser and Brunch claims an identity, so a
 * request can only ever act as the user who made it.
 */
import { createHash } from "node:crypto";

import * as v from "valibot";

import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { logger } from "../logger.ts";

import type { Context, MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    /** The actor key the session resolved to. */
    hashSessionActorKey: string;
  }
}

/**
 * HASH's Kratos session cookie, the only cookie Brunch reads or passes on.
 */
export const hashSessionCookie = "ory_kratos_session";

/**
 * How long a resolved session is reused. A logout or revoked session reaches
 * Brunch this much later at most, in exchange for one hash-api call per
 * session per window rather than one per request: a turn makes about twenty
 * requests, and each `me` costs hash-api a Kratos session check and two graph
 * queries.
 */
const cacheTtlMs = 30_000;

/** An answer that never comes bounds the request rather than hanging it. */
const meTimeoutMs = 5_000;

/**
 * The user entity alone: its record id names the user's web, which is their
 * actor, and its properties say whether signup is complete.
 */
const meQuery =
  "query brunchSessionActor { me { subgraph { roots vertices } } }";

const shortnameUrl = systemPropertyTypes.shortname.propertyTypeBaseUrl;
const displayNameUrl =
  blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl;

const vMeSubgraph = v.object({
  roots: v.tuple([v.object({ baseId: v.string(), revisionId: v.string() })]),
  vertices: v.record(v.string(), v.record(v.string(), v.unknown())),
});

const vUserVertex = v.object({
  kind: v.literal("entity"),
  inner: v.object({
    metadata: v.object({
      recordId: v.object({
        // `<webId>~<entityUuid>`, optionally `~<draftId>`.
        entityId: v.pipe(v.string(), v.regex(/^[^~]+~[^~]+/u)),
      }),
    }),
    properties: v.record(v.string(), v.unknown()),
  }),
});

/** hash-api refuses `me` with this code when the request has no session. */
const vMeRefusal = v.object({
  errors: v.pipe(
    v.array(v.object({ extensions: v.object({ code: v.string() }) })),
    v.someItem((error) => error.extensions.code === "FORBIDDEN"),
  ),
});

const vMeAnswer = v.object({
  data: v.object({ me: v.object({ subgraph: vMeSubgraph }) }),
});

export type SessionActorCache = Map<
  string,
  { readonly actorKey: string; readonly expiresAt: number }
>;

/**
 * The session cookie's pair, alone. Every other cookie the browser sends to
 * Brunch's host stays out of the hash-api call.
 */
const sessionCookiePair = (context: Context): string | undefined => {
  const prefix = `${hashSessionCookie}=`;
  return (context.req.header("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix) && part.length > prefix.length);
};

/** Keys the cache by digest, so a full session is never held as a key. */
const cacheKey = (cookiePair: string) =>
  createHash("sha256").update(cookiePair).digest("hex");

type Resolution =
  | { readonly kind: "actor"; readonly actorKey: string }
  | { readonly kind: "signup-incomplete" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable" };

/**
 * hash-api's own rule for a complete signup (`getUserFromEntity` in
 * `apps/hash-api/src/graph/knowledge/system-types/user.ts`): the user entity
 * has both a shortname and a display name.
 */
const isAccountSignupComplete = (properties: Record<string, unknown>) =>
  !!properties[shortnameUrl] && !!properties[displayNameUrl];

/**
 * The actor of a user entity, as hash-api names it: a user's web id is their
 * user id, which Brunch prefixes to keep HASH users apart from other actors.
 */
const hashActorKey = (entityId: string) => `hash:${entityId.split("~")[0]}`;

const askHashApi = async (
  graphqlUrl: URL,
  cookiePair: string,
): Promise<Resolution> => {
  let response: Response;
  try {
    response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: cookiePair,
      },
      body: JSON.stringify({ query: meQuery }),
      // Following a redirect would hand the session to its target.
      redirect: "manual",
      signal: AbortSignal.timeout(meTimeoutMs),
    });
  } catch (error) {
    logger.warn("[brunch] HASH session check failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { kind: "unavailable" };
  }
  const body: unknown =
    response.status === 200
      ? await response.json().catch(() => undefined)
      : undefined;
  if (body === undefined) {
    logger.warn("[brunch] HASH session check answered unexpectedly", {
      status: response.status,
    });
    return { kind: "unavailable" };
  }
  if (v.is(vMeRefusal, body)) return { kind: "unauthenticated" };
  const answer = v.safeParse(vMeAnswer, body);
  const [root] = answer.success ? answer.output.data.me.subgraph.roots : [];
  const vertex =
    answer.success && root !== undefined
      ? v.safeParse(
          vUserVertex,
          answer.output.data.me.subgraph.vertices[root.baseId]?.[
            root.revisionId
          ],
        )
      : undefined;
  if (!vertex?.success) {
    logger.warn("[brunch] HASH session check named no user entity");
    return { kind: "unavailable" };
  }
  const { metadata, properties } = vertex.output.inner;
  return isAccountSignupComplete(properties)
    ? { kind: "actor", actorKey: hashActorKey(metadata.recordId.entityId) }
    : { kind: "signup-incomplete" };
};

/**
 * Resolves the request's session to its actor key and puts it on the context
 * for the ownership guard and the identity route: 401 without a session
 * cookie, for one hash-api doesn't sign in, for an account that hasn't
 * completed signup, and for every request when hash-api's address is not
 * configured; 503 when hash-api can't answer. Only a complete account's
 * answer is cached, so finishing signup takes effect on the next request.
 */
export const hashSessionActor = ({
  apiOrigin,
  cache = new Map(),
}: {
  /** hash-api's origin. Unset or empty refuses the whole route. */
  readonly apiOrigin: string | undefined;
  readonly cache?: SessionActorCache;
}): MiddlewareHandler => {
  const graphqlUrl = apiOrigin
    ? new URL("graphql", `${apiOrigin.replace(/\/+$/u, "")}/`)
    : undefined;
  return async (context, next) => {
    const cookiePair = sessionCookiePair(context);
    if (!graphqlUrl || !cookiePair)
      return context.json({ error: "unauthorized" }, 401);
    const key = cacheKey(cookiePair);
    const now = Date.now();
    const cached = cache.get(key);
    let actorKey: string;
    if (cached !== undefined && cached.expiresAt > now) {
      actorKey = cached.actorKey;
    } else {
      const resolution = await askHashApi(graphqlUrl, cookiePair);
      if (resolution.kind === "unavailable")
        return context.json({ error: "session check unavailable" }, 503);
      // An account mid-signup is refused exactly as an anonymous caller is,
      // as hash-api treats it outside GraphQL.
      if (resolution.kind !== "actor")
        return context.json({ error: "unauthorized" }, 401);
      for (const [entryKey, entry] of cache)
        if (entry.expiresAt <= now) cache.delete(entryKey);
      cache.set(key, {
        actorKey: resolution.actorKey,
        expiresAt: now + cacheTtlMs,
      });
      actorKey = resolution.actorKey;
    }
    context.set("hashSessionActorKey", actorKey);
    await next();
  };
};
