/**
 * Replace any whitespace with a single space, and omit leading and trailing whitespace.
 *
 * Useful for normalizing strings for comparison, and cleaning up what are expected to be single-line strings
 * to avoid unusual / hidden whitespace causing unexpected differences.
 */
export const normalizeWhitespace = (string: string) =>
  string.replace(/\s+/g, " ").trim();
