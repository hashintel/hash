/**
 * A copy of Brunch's `hashSessionActor`
 * (`apps/brunch-agent/src/server/http/hash-session-actor.ts`) for probe H0a.
 * This app may not import another workspace by a relative path, and
 * `@apps/brunch-agent` exports no such module, so the probe carries its own
 * copy. Constants, query, schemas and status codes are unchanged; Brunch's
 * logger is replaced by `stderr`, the context variable is typed on the
 * handler rather than by augmenting `hono`, and the handler returns `next()`
 * for this app's `noImplicitReturns`.
 */
import { createHash } from "node:crypto";

import * as v from "valibot";

import type { Context, MiddlewareHandler } from "hono";

export type HashSessionVariables = {
  /** The actor key the session resolved to. */
  hashSessionActorKey: string;
};

/**
 * HASH's Kratos session cookie, the only cookie Brunch reads or passes on.
 */
export const hashSessionCookie = "ory_kratos_session";

const cacheTtlMs = 30_000;

const sessionCheckTimeoutMs = 5_000;

export const sessionAccountQuery =
  "query brunchSessionActor { sessionAccount { webId accountSignupComplete } }";

const sessionRefusalSchema = v.object({
  errors: v.pipe(
    v.array(v.object({ extensions: v.object({ code: v.string() }) })),
    v.someItem((error) => error.extensions.code === "FORBIDDEN"),
  ),
});

const sessionAccountAnswerSchema = v.object({
  data: v.object({
    sessionAccount: v.object({
      webId: v.pipe(v.string(), v.minLength(1)),
      accountSignupComplete: v.boolean(),
    }),
  }),
});

export type SessionActorCache = Map<
  string,
  { readonly actorKey: string; readonly expiresAt: number }
>;

const warn = (message: string, details?: Record<string, unknown>) => {
  process.stderr.write(
    `${message}${details ? ` ${JSON.stringify(details)}` : ""}\n`,
  );
};

/**
 * The session cookie's pair, alone. Every other cookie the browser sends to
 * Brunch's host stays out of the hash-api call.
 */
export const sessionCookiePair = (context: Context): string | undefined => {
  const prefix = `${hashSessionCookie}=`;
  return (context.req.header("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix) && part.length > prefix.length);
};

const cacheKey = (cookiePair: string) =>
  createHash("sha256").update(cookiePair).digest("hex");

type Resolution =
  | { readonly kind: "actor"; readonly actorKey: string }
  | { readonly kind: "signup-incomplete" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable" };

const hashActorKey = (webId: string) => `hash:${webId}`;

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
      body: JSON.stringify({ query: sessionAccountQuery }),
      redirect: "manual",
      signal: AbortSignal.timeout(sessionCheckTimeoutMs),
    });
  } catch (error) {
    warn("[brunch] HASH session check failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { kind: "unavailable" };
  }
  const body: unknown =
    response.status === 200
      ? await response.json().catch(() => undefined)
      : undefined;
  if (body === undefined) {
    warn("[brunch] HASH session check answered unexpectedly", {
      status: response.status,
    });
    return { kind: "unavailable" };
  }
  if (v.is(sessionRefusalSchema, body)) return { kind: "unauthenticated" };
  const answer = v.safeParse(sessionAccountAnswerSchema, body);
  if (!answer.success) {
    warn("[brunch] HASH session check named no account");
    return { kind: "unavailable" };
  }
  const { webId, accountSignupComplete } = answer.output.data.sessionAccount;
  return accountSignupComplete
    ? { kind: "actor", actorKey: hashActorKey(webId) }
    : { kind: "signup-incomplete" };
};

export const hashSessionActor = ({
  apiOrigin,
  cache = new Map(),
}: {
  readonly apiOrigin: string | undefined;
  readonly cache?: SessionActorCache;
}): MiddlewareHandler<{ Variables: HashSessionVariables }> => {
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
    return next();
  };
};
