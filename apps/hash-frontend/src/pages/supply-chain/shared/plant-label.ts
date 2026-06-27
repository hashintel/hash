/**
 * Compact, display-friendly plant labels for tight UI surfaces (the E2E route
 * picker and the coverage line).
 *
 * Plant names are resolved at runtime from the loaded data (the generator
 * ships the full description, e.g. a corporate legal name plus the plant code).
 * This helper only trims generic corporate/legal boilerplate so the displayed
 * string is shorter -- it contains no hardcoded, site- or client-specific data.
 */

/** Generic corporate/legal form tokens stripped from plant descriptions. */
const BOILERPLATE =
  /\b(corp|co|inc|llc|ltd|gmbh|ag|kg|kk|sa|bv|nv|plc|pte|the)\b\.?/gi;

/**
 * Return a short `"Name (CODE)"` label for a plant by trimming generic
 * corporate boilerplate from the data-provided `fullLabel`. Falls back to the
 * bare uppercase code when there is no usable name (e.g. unresolved data).
 */
export function shortPlantLabel(
  code: string,
  fullLabel?: string | null,
): string {
  const codeU = code.toUpperCase();

  if (fullLabel) {
    const name = fullLabel
      // Drop a trailing "(CODE)" suffix the generator appended.
      .replace(new RegExp(`\\s*\\(${codeU}\\)\\s*$`, "i"), "")
      .replace(BOILERPLATE, " ")
      .replace(/\s+([,.)])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (name) {
      return `${name} (${codeU})`;
    }
  }

  return codeU;
}
