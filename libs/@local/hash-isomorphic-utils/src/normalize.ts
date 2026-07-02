/**
 * Replace any whitespace with a single space, and omit leading and trailing whitespace.
 *
 * Useful for normalizing strings for comparison, and cleaning up what are expected to be single-line strings
 * to avoid unusual / hidden whitespace causing unexpected differences.
 */
export const normalizeWhitespace = (string: string) =>
  string.replace(/\s+/g, " ").trim();

/**
 * Canonical form of an email address for case-insensitive comparison.
 *
 * Kratos lowercases the login identifier but leaves the trait and
 * `verifiable_addresses[].value` in the casing typed at signup, so emails read
 * back from Kratos are inconsistently cased.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
