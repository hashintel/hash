/**
 * Hono middleware that names the HASH agent route's actor from the caller's
 * own Kratos session, which hash-api forwards and asserts nothing beside.
 * Brunch asks Kratos who the session belongs to and takes the graph actor
 * HASH provisioned into the identity's public metadata, so a request can only
 * ever act as the user who made it.
 */
import { createHash } from "node:crypto";

import * as v from "valibot";

import { hashSessionCredential } from "@hashintel/brunch-agent";

import { logger } from "../logger.ts";

import type { Context, MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    /** The actor key the session credential resolved to. */
    hashSessionActorKey: string;
  }
}

/**
 * How long a resolved session is reused. A logout or revoked session reaches
 * Brunch this much later at most, in exchange for one Kratos call per
 * credential per window rather than one per request.
 */
const cacheTtlMs = 30_000;

/** A Kratos answer that never comes bounds the request rather than hanging it. */
const whoamiTimeoutMs = 5_000;

/** The part of Kratos's `/sessions/whoami` answer that names the actor. */
const vKratosWhoami = v.object({
  active: v.literal(true),
  identity: v.object({
    metadata_public: v.object({
      graph_actor_id: v.pipe(v.string(), v.nonEmpty()),
    }),
  }),
});

type SessionCredential = {
  readonly header: "cookie" | typeof hashSessionCredential.tokenHeader;
  readonly value: string;
};

export type SessionActorCache = Map<
  string,
  { readonly actorKey: string; readonly expiresAt: number }
>;

/**
 * The session credential a request carries: the token header, else the
 * session cookie's pair alone. Every other cookie stays out of the Kratos
 * call.
 */
const requestCredential = (context: Context): SessionCredential | undefined => {
  const token = context.req.header(hashSessionCredential.tokenHeader)?.trim();
  if (token) return { header: hashSessionCredential.tokenHeader, value: token };
  const prefix = `${hashSessionCredential.cookie}=`;
  const pair = (context.req.header("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix) && part.length > prefix.length);
  return pair === undefined ? undefined : { header: "cookie", value: pair };
};

/** Keys the cache by digest, so a full session is never held as a key. */
const cacheKey = ({ header, value }: SessionCredential) =>
  createHash("sha256").update(`${header}\0${value}`).digest("hex");

type Resolution =
  | { readonly kind: "actor"; readonly actorKey: string }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable" };

const askKratos = async (
  whoamiUrl: URL,
  { header, value }: SessionCredential,
): Promise<Resolution> => {
  let response: Response;
  try {
    response = await fetch(whoamiUrl, {
      headers: { [header]: value, accept: "application/json" },
      // Following a redirect would hand the session to its target.
      redirect: "manual",
      signal: AbortSignal.timeout(whoamiTimeoutMs),
    });
  } catch (error) {
    logger.warn("[brunch] Kratos session check failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { kind: "unavailable" };
  }
  // 403 means the session still needs a second factor: not yet signed in.
  if (response.status === 401 || response.status === 403)
    return { kind: "unauthenticated" };
  if (response.status !== 200) {
    logger.warn("[brunch] Kratos session check answered unexpectedly", {
      status: response.status,
    });
    return { kind: "unavailable" };
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (body === undefined) {
    logger.warn("[brunch] Kratos session check answered without JSON");
    return { kind: "unavailable" };
  }
  const parsed = v.safeParse(vKratosWhoami, body);
  return parsed.success
    ? {
        kind: "actor",
        actorKey: `hash:${parsed.output.identity.metadata_public.graph_actor_id}`,
      }
    : { kind: "unauthenticated" };
};

/**
 * Resolves the request's session to its actor key and puts it on the context
 * for the ownership guard: 401 without a credential, for one Kratos refuses
 * or names no graph actor, and for every request when Kratos's address is
 * not configured; 503 when Kratos can't answer. Failures are never cached.
 */
export const hashSessionActor = ({
  kratosPublicUrl,
  cache = new Map(),
}: {
  /** Unset or empty refuses the whole route. */
  readonly kratosPublicUrl: string | undefined;
  readonly cache?: SessionActorCache;
}): MiddlewareHandler => {
  const whoamiUrl = kratosPublicUrl
    ? new URL("sessions/whoami", `${kratosPublicUrl.replace(/\/+$/u, "")}/`)
    : undefined;
  return async (context, next) => {
    const credential = requestCredential(context);
    if (!whoamiUrl || !credential)
      return context.json({ error: "unauthorized" }, 401);
    const key = cacheKey(credential);
    const now = Date.now();
    const cached = cache.get(key);
    let actorKey: string;
    if (cached !== undefined && cached.expiresAt > now) {
      actorKey = cached.actorKey;
    } else {
      const resolution = await askKratos(whoamiUrl, credential);
      if (resolution.kind === "unavailable")
        return context.json({ error: "session check unavailable" }, 503);
      if (resolution.kind === "unauthenticated")
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
