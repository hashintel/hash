import { AnalysisArgError } from "./errors";

import type { WebId } from "@blockprotocol/type-system";

/**
 * Top-level storage prefix for all analysis artifacts.
 */
const ANALYSIS_STORAGE_PREFIX = "analysis";

/**
 * Build a storage key for a web-scoped artifact, with the analysis prefix first,
 * then the `webId`, namespace, and any further parts.
 *
 * Keeping the web id in a fixed segment makes it a tenant-isolation prefix: the
 * analysis gateway authorises a resolved key by an exact match on that segment
 * (see `resolve-analysis.ts`), and storage policies/lifecycle rules can be
 * scoped to an `analysis/{webId}/` prefix. All artifact keys MUST be built
 * through this helper so that invariant holds.
 */
export const webScopedKey = (
  webId: WebId,
  namespace: string,
  ...parts: string[]
): string => [ANALYSIS_STORAGE_PREFIX, webId, namespace, ...parts].join("/");

export const isWebScopedKeyForWeb = (key: string, webId: WebId): boolean => {
  const [prefix, scopedWebId] = key.split("/");
  return prefix === ANALYSIS_STORAGE_PREFIX && scopedWebId === webId;
};

/**
 * Slugs are the only values interpolated into storage keys from client input.
 * Restricting them to a bounded set of non-separator characters prevents path
 * traversal and key-injection regardless of the underlying storage provider.
 */
const SLUG_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_.=-]{0,127}$/;

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
