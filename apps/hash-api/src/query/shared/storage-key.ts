import { QueryArgError } from "./errors";

/**
 * Slugs are the only values interpolated into storage keys from client input.
 * Restricting them to `[a-z0-9_-]` (and a bounded length) prevents path
 * traversal and key-injection regardless of the underlying storage provider.
 */
const SLUG_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/;

export const isValidSlug = (value: unknown): value is string =>
  typeof value === "string" && SLUG_PATTERN.test(value);

/**
 * Read a required slug argument, throwing {@link QueryArgError} if it is missing
 * or fails validation.
 */
export const requireSlugArg = (
  args: Record<string, unknown>,
  key: string,
): string => {
  const value = args[key];
  if (!isValidSlug(value)) {
    throw new QueryArgError(
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
