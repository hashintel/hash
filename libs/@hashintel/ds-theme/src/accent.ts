/**
 * Accent color system utilities.
 *
 * This module provides utilities for dynamic accent color switching via
 * CSS custom property remapping. Components can use `data-accent` attributes
 * to override the inherited colorPalette.
 *
 * @example
 * ```tsx
 * // In a component
 * <div data-accent="blue">
 *   <Button /> // Uses blue accent
 *   <div data-accent="status.error">
 *     <Alert /> // Uses red (status.error) accent
 *   </div>
 * </div>
 * ```
 */

/** All palette names that can be used as accent values */
export const ACCENT_PALETTES = [
  "gray",
  "slate",
  "blue",
  "cyan",
  "teal",
  "red",
  "orange",
  "yellow",
  "green",
  "purple",
  "pink",
] as const;

/** Status aliases that map to color palettes */
export const ACCENT_STATUS_MAP = {
  "status.info": "blue",
  "status.success": "green",
  "status.warning": "orange",
  "status.error": "red",
} as const;

/** Neutral alias */
export const ACCENT_NEUTRAL = "neutral";

export type AccentPalette = (typeof ACCENT_PALETTES)[number];
export type AccentStatus = keyof typeof ACCENT_STATUS_MAP;
export type AccentValue = AccentPalette | AccentStatus | "neutral";

/** Solid scale steps (0-12) */
const SOLID_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Alpha scale steps (a0-a12) */
const ALPHA_STEPS = [
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "a8",
  "a9",
  "a10",
  "a11",
  "a12",
] as const;

/** Semantic variant token paths */
const VARIANT_PATHS = [
  "solid.bg",
  "solid.bg.hover",
  "solid.fg",
  "subtle.bg",
  "subtle.bg.hover",
  "subtle.bg.active",
  "subtle.fg",
  "surface.bg",
  "surface.bg.active",
  "surface.border",
  "surface.border.hover",
  "surface.fg",
  "outline.bg.hover",
  "outline.bg.active",
  "outline.border",
  "outline.fg",
  "plain.bg.hover",
  "plain.bg.active",
  "plain.fg",
] as const;

/**
 * Convert a token path to a CSS variable name.
 * e.g., "solid.bg.hover" -> "solid-bg-hover"
 */
const pathToVarSuffix = (path: string): string => path.replace(/\./g, "-");

/**
 * Generate CSS rules for a single accent palette.
 * Maps accent variables to the target palette's variables.
 *
 * This uses the `--colors-accent-*` naming convention to match the
 * semantic tokens defined in main.ts.
 */
const generatePaletteRule = (
  accentValue: string,
  targetPalette: string,
): string => {
  const solidVars = SOLID_STEPS.map(
    (step) =>
      `--colors-accent-${step}: var(--colors-${targetPalette}-${step});`,
  );

  const alphaVars = ALPHA_STEPS.map(
    (step) =>
      `--colors-accent-${step}: var(--colors-${targetPalette}-${step});`,
  );

  const variantVars = VARIANT_PATHS.map((path) => {
    const suffix = pathToVarSuffix(path);
    return `--colors-accent-${suffix}: var(--colors-${targetPalette}-${suffix});`;
  });

  const allVars = [...solidVars, ...alphaVars, ...variantVars].join("\n    ");

  return `[data-accent="${accentValue}"] {\n    ${allVars}\n  }`;
};

/**
 * Generate all CSS rules for the data-accent attribute system.
 *
 * This creates CSS that remaps the colorPalette CSS variables based on
 * the data-accent attribute value, enabling dynamic accent switching.
 *
 * @returns CSS string to be injected into globalCss or a style tag
 *
 * @example
 * ```ts
 * // In panda.config.ts or a style injection
 * const accentCSS = generateAccentCSS();
 * // Returns rules like:
 * // [data-accent="blue"] { --colors-color-palette-9: var(--colors-blue-9); ... }
 * // [data-accent="status.error"] { --colors-color-palette-9: var(--colors-red-9); ... }
 * ```
 */
export const generateAccentCSS = (): string => {
  const rules: string[] = [];

  // Direct palette mappings (e.g., data-accent="blue")
  for (const palette of ACCENT_PALETTES) {
    rules.push(generatePaletteRule(palette, palette));
  }

  // Neutral alias (maps to gray)
  rules.push(generatePaletteRule("neutral", "gray"));

  // Status aliases (e.g., data-accent="status.info" -> blue)
  for (const [status, palette] of Object.entries(ACCENT_STATUS_MAP)) {
    rules.push(generatePaletteRule(status, palette));
  }

  return rules.join("\n\n  ");
};

/**
 * Get the resolved palette name for an accent value.
 * Useful for programmatic palette lookups.
 */
export const resolveAccentPalette = (accent: AccentValue): AccentPalette => {
  if (accent === "neutral") return "gray";
  if (accent in ACCENT_STATUS_MAP) {
    return ACCENT_STATUS_MAP[accent as AccentStatus];
  }
  return accent as AccentPalette;
};
