/** Hono middleware that keeps a caller's secret to that caller's own agent route. */
import { createHash, timingSafeEqual } from "node:crypto";

import { brunchCallerAuthorization } from "@hashintel/brunch-agent";

import type { Context, MiddlewareHandler } from "hono";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether the request presents `secret` under the HASH caller's scheme.
 * Compares fixed-length digests, so neither the secret's length nor its
 * content shows in the timing, and a value of another length cannot throw.
 * An unset or empty secret matches nothing.
 */
const presentsHashSecret = (
  context: Context,
  secret: string | undefined,
): boolean => {
  if (!secret) return false;
  const value = context.req.header(brunchCallerAuthorization.header) ?? "";
  const separator = value.indexOf(" ");
  if (
    separator < 0 ||
    value.slice(0, separator).toLowerCase() !==
      brunchCallerAuthorization.hashScheme.toLowerCase()
  )
    return false;
  return timingSafeEqual(digest(value.slice(separator + 1)), digest(secret));
};

/**
 * On the HASH agent's route, refuses any request without hash-api's secret;
 * on every other agent route, refuses a request that presents it. Other
 * routes otherwise pass unchanged.
 */
export const hashCallerGuard =
  ({
    secret,
    hashRoute,
  }: {
    /** hash-api's secret; unset or empty refuses the whole HASH route. */
    readonly secret: string | undefined;
    readonly hashRoute: boolean;
  }): MiddlewareHandler =>
  async (context, next) => {
    const presented = presentsHashSecret(context, secret);
    if (hashRoute && !presented)
      return context.json({ error: "unauthorized" }, 401);
    if (!hashRoute && presented)
      return context.json({ error: "forbidden" }, 403);
    await next();
  };
