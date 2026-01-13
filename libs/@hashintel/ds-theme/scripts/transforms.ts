/**
 * Transform utilities for converting Figma variable exports to Panda CSS token format.
 */

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

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
 */
export function transformSpacingScale(
  scale: Record<string, { value: number }>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(scale).map(([step, { value }]) => [
      step,
      { value: `${value}px` },
    ]),
  );
}

/**
 * Transform radius scale values to Panda token format.
 * Handles numeric values (with px suffix), 9999 as pill radius, and reference strings.
 */
export function transformRadiusScale(
  scale: Record<string, { value: number | string }>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(scale).map(([step, { value }]) => {
      const tokenValue =
        typeof value === "string"
          ? value
          : value === 9999
            ? "9999px"
            : `${value}px`;
      return [step, { value: tokenValue }];
    }),
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

/**
 * Transform a component radius reference from Figma format to Panda format.
 * Converts "{radius.4}" to "{radii.md.4}".
 */
export function transformRadiusReference(value: number | string): string {
  if (typeof value === "string") {
    return value.replace(/\{radius\.(\d+)\}/g, "{radii.md.$1}");
  }
  return `${value}px`;
}
