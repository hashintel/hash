/**
 * Experimental radix-colors based color token generator.
 *
 * This follows the park-ui pattern of importing colors directly from @radix-ui/colors
 * and generating semantic tokens with variant structures (solid, subtle, surface, outline, plain).
 *
 * Run with: tsx scripts/generate-colors-radix.ts
 */

import fs from "node:fs";
import { join } from "node:path";
import * as radixColors from "@radix-ui/colors";

// Configuration
const OUTPUT_DIR = "src/theme/colors";

/**
 * Neutral colors (grays) get special treatment for solid variants.
 */
const NEUTRAL_COLORS = [
  "gray",
  "mauve",
  "slate",
  "sage",
  "olive",
  "sand",
] as const;

/**
 * Bright colors need dark foreground text on solid backgrounds.
 */
const BRIGHT_COLORS = ["amber", "yellow", "lime", "mint", "sky"] as const;

/**
 * Colors to include in generation. Add/remove as needed.
 * Using a subset that aligns with HASH brand needs.
 */
const INCLUDED_COLORS = [
  // Neutrals
  "gray",
  "slate",
  // Brand colors
  "blue",
  "cyan",
  "teal",
  // Semantic colors
  "red",
  "orange",
  "yellow",
  "green",
  // Accent colors
  "purple",
  "pink",
] as const;

type ColorName = string;
type ColorScale = Record<string, string>;
type ColorTokens = Record<string, unknown>;
type ColorPalette = { name: ColorName; tokens: ColorTokens };

/**
 * Check if a color name is valid for extraction from radix-colors.
 * Filters out uppercase variants and 'default' export.
 */
function isValidColorName(colorName: string): boolean {
  return !/[A-Z]/.test(colorName) && colorName !== "default";
}

/**
 * Get all valid color names from radix-colors that we want to include.
 */
function getColorNames(): ColorName[] {
  const allColors = Object.keys(radixColors).filter(isValidColorName);
  // Filter to only included colors
  return allColors.filter((name) =>
    INCLUDED_COLORS.some((included) => name === included),
  );
}

/**
 * Normalize color name for output (gray stays gray, not neutral like park-ui).
 */
function normalizeColorName(colorName: ColorName): ColorName {
  return colorName;
}

/**
 * Check if color is a neutral (gray-like) color.
 */
function isNeutralColor(color: string): boolean {
  return NEUTRAL_COLORS.includes(color as (typeof NEUTRAL_COLORS)[number]);
}

/**
 * Check if color is a bright color needing dark foreground.
 */
function isBrightColor(color: string): boolean {
  return BRIGHT_COLORS.includes(color as (typeof BRIGHT_COLORS)[number]);
}

/**
 * Extract light and dark color scales from radix-colors.
 */
function getColorTokens(color: string): {
  light: ColorScale;
  dark: ColorScale;
} {
  const light: ColorScale = {};
  const dark: ColorScale = {};

  Object.keys(radixColors)
    .filter((key) => key.startsWith(color) && !/\d/.test(key))
    .forEach((key) => {
      const scale = (radixColors as Record<string, Record<string, string>>)[
        key
      ];
      const target = key.includes("Dark") ? dark : light;

      Object.keys(scale).forEach((scaleKey) => {
        // Extract just the number or "a" + number from keys like "gray1", "grayA1"
        const tokenName = scaleKey.replace(color, "").toLowerCase();
        target[tokenName] = scale[scaleKey];
      });
    });

  return { light, dark };
}

/**
 * Generate base tokens (0-12 and a0-a12) for a color.
 * Step 0 is pure white (light) / black (dark) for true background color.
 * Step a0 is fully transparent.
 */
function generateBaseTokens(
  light: ColorScale,
  dark: ColorScale,
): Record<string, unknown> {
  const tokens: Record<string, unknown> = {};

  // Step 0: pure white in light mode, pure black in dark mode
  tokens[0] = {
    value: { _light: "#ffffff", _dark: "#000000" },
  };
  // Step a0: fully transparent
  tokens.a0 = {
    value: { _light: "transparent", _dark: "transparent" },
  };

  for (let i = 1; i <= 12; i++) {
    tokens[i] = {
      value: { _light: light[i], _dark: dark[i] },
    };
    tokens[`a${i}`] = {
      value: { _light: light[`a${i}`], _dark: dark[`a${i}`] },
    };
  }

  return tokens;
}

/**
 * Semantic token structure: {property}.{variant}.{state}
 *
 * Properties: bg, fg, bd (border)
 * Variants: solid, surface, muted, subtle (for bg/bd), link/muted/subtle (for fg)
 * States: DEFAULT, hover, active, pressed, disabled
 */

/**
 * Helper to create a semantic token value.
 */
function tv(name: string, step: string | number) {
  return {
    value: {
      _light: `{colors.${name}.${step}}`,
      _dark: `{colors.${name}.${step}}`,
    },
  };
}

/**
 * Helper for static values (like white for solid fg).
 */
function staticVal(light: string, dark: string) {
  return { value: { _light: light, _dark: dark } };
}

/**
 * Create bg (background) tokens for a palette.
 */
function createBgTokens(name: string, isBright: boolean) {
  return {
    solid: {
      DEFAULT: tv(name, 9),
      hover: tv(name, 10),
      active: tv(name, 10),
      disabled: tv(name, 6),
    },
    surface: {
      DEFAULT: tv(name, "a2"),
      hover: tv(name, "a3"),
      active: tv(name, "a4"),
      disabled: tv(name, "a2"),
    },
    muted: {
      DEFAULT: tv(name, 3),
      hover: tv(name, 4),
      active: tv(name, 5),
      disabled: tv(name, 2),
    },
    subtle: {
      DEFAULT: tv(name, "a3"),
      hover: tv(name, "a4"),
      active: tv(name, "a5"),
      disabled: tv(name, "a2"),
    },
  };
}

/**
 * Create fg (foreground/text) tokens for a palette.
 */
function createFgTokens(name: string, isBright: boolean) {
  // For solid backgrounds, use white (or dark text for bright colors)
  const solidFg = isBright
    ? staticVal("{colors.gray.12}", "{colors.gray.1}")
    : staticVal("white", "white");

  return {
    // High contrast text on solid bg
    solid: {
      DEFAULT: solidFg,
    },
    // Default readable text
    DEFAULT: tv(name, 12),
    // Secondary/muted text
    muted: {
      DEFAULT: tv(name, 11),
      hover: tv(name, 12),
      disabled: tv(name, 9),
    },
    // Tertiary/subtle text
    subtle: {
      DEFAULT: tv(name, 10),
      hover: tv(name, 11),
      disabled: tv(name, 8),
    },
    // Link text
    link: {
      DEFAULT: tv(name, 11),
      hover: tv(name, 12),
      active: tv(name, 11),
      disabled: tv(name, 9),
    },
  };
}

/**
 * Create bd (border) tokens for a palette.
 */
function createBdTokens(name: string) {
  return {
    solid: {
      DEFAULT: tv(name, 7),
      hover: tv(name, 8),
      active: tv(name, 8),
      disabled: tv(name, 5),
    },
    subtle: {
      DEFAULT: tv(name, 6),
      hover: tv(name, 7),
      active: tv(name, 7),
      disabled: tv(name, 4),
    },
    muted: {
      DEFAULT: tv(name, "a6"),
      hover: tv(name, "a7"),
      active: tv(name, "a7"),
      disabled: tv(name, "a4"),
    },
  };
}

/**
 * Generate all semantic tokens for a color including property-first variants.
 */
function generateSemanticTokens(color: string): ColorTokens {
  const { light, dark } = getColorTokens(color);
  const baseTokens = generateBaseTokens(light, dark);

  // For variant tokens, use the normalized name
  const name = isNeutralColor(color) ? "gray" : color;
  const isBright = isBrightColor(color);

  // Property-first semantic tokens: bg, fg, bd
  const semanticTokens = {
    bg: createBgTokens(name, isBright),
    fg: createFgTokens(name, isBright),
    bd: createBdTokens(name),
  };

  return {
    ...baseTokens,
    ...semanticTokens,
  };
}

/**
 * Create a color palette object.
 */
function createColorPalette(colorName: ColorName): ColorPalette {
  const normalizedName = normalizeColorName(colorName);
  const tokens = generateSemanticTokens(colorName);

  return {
    name: normalizedName,
    tokens,
  };
}

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Format tokens as TypeScript object literal string.
 */
function formatTokensForOutput(tokens: ColorTokens): string {
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
 * Generate file content for a color palette.
 */
function generateFileContent(palette: ColorPalette): string {
  const tokens = formatTokensForOutput(palette.tokens);

  return `import { defineSemanticTokens } from "@pandacss/dev";

export const ${palette.name} = defineSemanticTokens.colors(${tokens});
`;
}

/**
 * Write a color palette file.
 */
function writeColorFile(palette: ColorPalette): void {
  const filePath = join(process.cwd(), OUTPUT_DIR, `${palette.name}.gen.ts`);
  const content = generateFileContent(palette);

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created ${palette.name}.gen.ts`);
}

/**
 * Generate static tokens for black and white (non-semantic).
 */
function generateStaticColorTokens(): string {
  return `import { defineTokens } from "@pandacss/dev";

const black = defineTokens.colors({
  DEFAULT: { value: "#000000" },
  a1: { value: "rgba(0, 0, 0, 0.05)" },
  a2: { value: "rgba(0, 0, 0, 0.1)" },
  a3: { value: "rgba(0, 0, 0, 0.15)" },
  a4: { value: "rgba(0, 0, 0, 0.2)" },
  a5: { value: "rgba(0, 0, 0, 0.3)" },
  a6: { value: "rgba(0, 0, 0, 0.4)" },
  a7: { value: "rgba(0, 0, 0, 0.5)" },
  a8: { value: "rgba(0, 0, 0, 0.6)" },
  a9: { value: "rgba(0, 0, 0, 0.7)" },
  a10: { value: "rgba(0, 0, 0, 0.8)" },
  a11: { value: "rgba(0, 0, 0, 0.9)" },
  a12: { value: "rgba(0, 0, 0, 0.95)" },
});

const white = defineTokens.colors({
  DEFAULT: { value: "#ffffff" },
  a1: { value: "rgba(255, 255, 255, 0.05)" },
  a2: { value: "rgba(255, 255, 255, 0.1)" },
  a3: { value: "rgba(255, 255, 255, 0.15)" },
  a4: { value: "rgba(255, 255, 255, 0.2)" },
  a5: { value: "rgba(255, 255, 255, 0.3)" },
  a6: { value: "rgba(255, 255, 255, 0.4)" },
  a7: { value: "rgba(255, 255, 255, 0.5)" },
  a8: { value: "rgba(255, 255, 255, 0.6)" },
  a9: { value: "rgba(255, 255, 255, 0.7)" },
  a10: { value: "rgba(255, 255, 255, 0.8)" },
  a11: { value: "rgba(255, 255, 255, 0.9)" },
  a12: { value: "rgba(255, 255, 255, 0.95)" },
});

export const staticColors = { black, white };
`;
}

/**
 * Generate the barrel file that exports all colors.
 * Aliases are composed in main.ts, not generated here.
 */
function writeBarrelFile(colorNames: string[]): void {
  const filePath = join(process.cwd(), "src/theme/colors.gen.ts");

  const imports = colorNames
    .map((name) => `import { ${name} } from "./colors/${name}.gen";`)
    .join("\n");

  const staticImport = `import { staticColors } from "./colors/static.gen";`;

  const colorExports = colorNames.join(",\n  ");

  const content = `${imports}
${staticImport}

/** Semantic color palettes with light/dark mode and variant tokens. */
export const palettes = {
  ${colorExports},
};

/** Static color tokens (black, white with alpha scales). */
export { staticColors };

/** Re-export individual palettes for direct import. */
export { ${colorExports} };
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created colors.gen.ts (barrel file)`);
}

/**
 * Write static colors file.
 */
function writeStaticColorsFile(): void {
  const filePath = join(process.cwd(), OUTPUT_DIR, "static.gen.ts");
  const content = generateStaticColorTokens();

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created static.gen.ts`);
}

/**
 * Main entry point.
 */
function main(): void {
  console.log("🎨 Generating radix-based color tokens (experimental)...\n");

  const outputPath = join(process.cwd(), OUTPUT_DIR);
  fs.rmSync(outputPath, { recursive: true, force: true });
  fs.mkdirSync(outputPath, { recursive: true });

  // Generate static colors (black, white)
  writeStaticColorsFile();

  // Generate semantic color palettes
  const colorNames = getColorNames();
  console.log(`\n📦 Generating ${colorNames.length} color palettes:`);

  const palettes = colorNames.map(createColorPalette);
  palettes.forEach(writeColorFile);

  // Generate barrel file
  console.log("\n📦 Generating barrel file:");
  writeBarrelFile(colorNames);

  console.log(`\n✅ Generated ${colorNames.length} color palettes`);
}

main();
