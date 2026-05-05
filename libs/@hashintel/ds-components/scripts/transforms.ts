/**
 * Transform utilities for converting Figma variable exports to Panda CSS token format.
 */

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Check if a property key should be skipped during token generation.
 *
 * Rules:
 * - Always skip keys containing "-delete" (Figma deleted items marker)
 * - Skip keys starting with "_" or "-" at the category/property level
 * - But NOT inside `value: { ... }` objects where they are Panda CSS conditions
 *
 * @param key - The property key to check
 * @param isInsideValue - Whether this key is inside a `value` object (default: false)
 */
export function shouldSkipKey(key: string, isInsideValue = false): boolean {
  if (key.includes("-delete")) return true;
  if (isInsideValue) return false;
  return key.startsWith("_") || key.startsWith("-");
}

/**
 * Clean a description string from Figma export.
 * Removes leading weird characters and newlines before the actual description.
 */
export function cleanDescription(description: string): string {
  // Remove leading non-printable chars, braces with content like "{gray-300}", and newlines
  return description.replace(/^\{[^}]*\}\s*\n?/, "").trim();
}

/**
 * Transform a property key for Panda CSS compatibility.
 * Converts "default" to "DEFAULT" (Panda's special nested default token key).
 */
export function transformPropertyKey(key: string): string {
  return key === "default" ? "DEFAULT" : key;
}

/**
 * Convert a token object into a TypeScript object-literal string.
 * Handles proper key quoting for non-identifier keys.
 */
export function formatTokensForOutput(tokens: Record<string, unknown>): string {
  const formatValue = (value: unknown): string => {
    if (value === undefined) {
      return "undefined";
    }

    if (typeof value !== "object" || value === null) {
      return JSON.stringify(value) ?? "undefined";
    }

    if (Array.isArray(value)) {
      return `[${value.map((v) => formatValue(v)).join(", ")}]`;
    }

    const entries = Object.entries(value);
    const formatted = entries
      .map(([key, val]) => {
        const keyStr = VALID_IDENTIFIER_RE.test(key)
          ? key
          : JSON.stringify(key);
        return `${keyStr}: ${formatValue(val)}`;
      })
      .join(", ");

    return `{ ${formatted} }`;
  };

  return formatValue(tokens);
}

/**
 * Transform spacing scale values to Panda token format.
 * Adds "px" suffix to numeric values.
 * Skips keys containing "-delete" (Figma deleted items).
 */
export function transformSpacingScale(
  scale: Record<string, { value: number }>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(scale)
      .filter(([step]) => !shouldSkipKey(step))
      .map(([step, { value }]) => [step, { value: `${value}px` }]),
  );
}

/**
 * Transform a line height reference from Figma format to Panda format.
 * Converts "{size.3xl}" to "{fontSizes.3xl}".
 */
export function transformLineHeightReference(value: number | string): string {
  if (typeof value === "string") {
    return value.replace(/\{size\.([^}]+)\}/g, "{fontSizes.$1}");
  }
  return `${value}px`;
}
