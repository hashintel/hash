import { AnalysisArgError } from "./errors";

import type { WebId } from "@blockprotocol/type-system";

/**
 * Build a storage key for a web-scoped artifact, with the `webId` as the first
 * path segment followed by a namespace and any further parts.
 *
 * Putting the web id first makes it a tenant-isolation prefix: the analysis
 * gateway authorises a resolved key by an exact segment-0 match (see
 * `resolve-analysis.ts`), and storage policies/lifecycle rules can be scoped to
 * a `{webId}/` prefix. All artifact keys MUST be built through this helper so
 * that invariant holds.
 */
export const webScopedKey = (
  webId: WebId,
  namespace: string,
  ...parts: string[]
): string => [webId, namespace, ...parts].join("/");

/**
 * Slugs are the only values interpolated into storage keys from client input.
 * Restricting them to `[a-z0-9_-]` (and a bounded length) prevents path
 * traversal and key-injection regardless of the underlying storage provider.
 */
const SLUG_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/;

export const isValidSlug = (value: unknown): value is string =>
  typeof value === "string" && SLUG_PATTERN.test(value);

/**
 * Read a required slug argument, throwing {@link AnalysisArgError} if it is
 * missing or fails validation.
 */
export const requireSlugArg = (
  args: Record<string, unknown>,
  key: string,
): string => {
  const value = args[key];
  if (!isValidSlug(value)) {
    throw new AnalysisArgError(
      `Argument "${key}" must be a slug matching ${SLUG_PATTERN.source}`,
    );
  }
  return value;
};

/** Read an optional slug argument; returns `undefined` if absent. */
export const optionalSlugArg = (
  args: Record<string, unknown>,
  key: string,
): string | undefined => {
  if (args[key] === undefined || args[key] === null) {
    return undefined;
  }
  return requireSlugArg(args, key);
};
