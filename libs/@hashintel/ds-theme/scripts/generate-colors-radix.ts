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
 * Create solid variant tokens for buttons, badges, etc.
 */
function createSolidVariant(name: string, isBright: boolean) {
  return {
    bg: {
      DEFAULT: {
        value: { _light: `{colors.${name}.9}`, _dark: `{colors.${name}.9}` },
      },
      hover: {
        value: { _light: `{colors.${name}.10}`, _dark: `{colors.${name}.10}` },
      },
    },
    fg: {
      DEFAULT: {
        value: isBright
          ? { _light: "{colors.gray.12}", _dark: "{colors.gray.1}" }
          : { _light: "white", _dark: "white" },
      },
    },
  };
}

/**
 * Create subtle variant tokens for light backgrounds.
 */
function createSubtleVariant(name: string, shade: string) {
  return {
    bg: {
      DEFAULT: {
        value: { _light: `{colors.${name}.a3}`, _dark: `{colors.${name}.a3}` },
      },
      hover: {
        value: { _light: `{colors.${name}.a4}`, _dark: `{colors.${name}.a4}` },
      },
      active: {
        value: { _light: `{colors.${name}.a5}`, _dark: `{colors.${name}.a5}` },
      },
    },
    fg: {
      DEFAULT: {
        value: {
          _light: `{colors.${name}.${shade}}`,
          _dark: `{colors.${name}.${shade}}`,
        },
      },
    },
  };
}

/**
 * Create surface variant tokens for cards, panels.
 */
function createSurfaceVariant(name: string, shade: string) {
  return {
    bg: {
      DEFAULT: {
        value: { _light: `{colors.${name}.a2}`, _dark: `{colors.${name}.a2}` },
      },
      active: {
        value: { _light: `{colors.${name}.a3}`, _dark: `{colors.${name}.a3}` },
      },
    },
    border: {
      DEFAULT: {
        value: { _light: `{colors.${name}.a6}`, _dark: `{colors.${name}.a6}` },
      },
      hover: {
        value: { _light: `{colors.${name}.a7}`, _dark: `{colors.${name}.a7}` },
      },
    },
    fg: {
      DEFAULT: {
        value: {
          _light: `{colors.${name}.${shade}}`,
          _dark: `{colors.${name}.${shade}}`,
        },
      },
    },
  };
}

/**
 * Create outline variant tokens for outlined buttons/inputs.
 */
function createOutlineVariant(name: string, shade: string) {
  return {
    bg: {
      hover: {
        value: { _light: `{colors.${name}.a2}`, _dark: `{colors.${name}.a2}` },
      },
      active: {
        value: { _light: `{colors.${name}.a3}`, _dark: `{colors.${name}.a3}` },
      },
    },
    border: {
      DEFAULT: {
        value: { _light: `{colors.${name}.a7}`, _dark: `{colors.${name}.a7}` },
      },
    },
    fg: {
      DEFAULT: {
        value: {
          _light: `{colors.${name}.${shade}}`,
          _dark: `{colors.${name}.${shade}}`,
        },
      },
    },
  };
}

/**
 * Create plain/ghost variant tokens for text-only buttons.
 */
function createPlainVariant(name: string, shade: string) {
  return {
    bg: {
      hover: {
        value: { _light: `{colors.${name}.a3}`, _dark: `{colors.${name}.a3}` },
      },
      active: {
        value: { _light: `{colors.${name}.a4}`, _dark: `{colors.${name}.a4}` },
      },
    },
    fg: {
      DEFAULT: {
        value: {
          _light: `{colors.${name}.${shade}}`,
          _dark: `{colors.${name}.${shade}}`,
        },
      },
    },
  };
}

/**
 * Generate all semantic tokens for a color including variants.
 */
function generateSemanticTokens(color: string): ColorTokens {
  const { light, dark } = getColorTokens(color);
  const baseTokens = generateBaseTokens(light, dark);

  // For variant tokens, use the normalized name
  const name = isNeutralColor(color) ? "gray" : color;
  const isBright = isBrightColor(color);
  // Neutrals use a12 for high contrast, others use a11
  const shade = name === "gray" ? "a12" : "a11";

  const variantTokens = {
    solid: createSolidVariant(name, isBright),
    subtle: createSubtleVariant(name, shade),
    surface: createSurfaceVariant(name, shade),
    outline: createOutlineVariant(name, shade),
    plain: createPlainVariant(name, shade),
  };

  return {
    ...baseTokens,
    ...variantTokens,
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
 */
function writeBarrelFile(colorNames: string[]): void {
  const filePath = join(process.cwd(), "src/theme/colors.gen.ts");

  const imports = colorNames
    .map((name) => `import { ${name} } from "./colors/${name}.gen";`)
    .join("\n");

  const staticImport = `import { staticColors } from "./colors/static.gen";`;
  const aliasesImport = `import { globalAliases } from "./colors/aliases.gen";`;

  const colorExports = colorNames.join(",\n  ");

  const content = `${imports}
${staticImport}
${aliasesImport}

/** Semantic color palettes with light/dark mode and variant tokens. */
export const semanticColorPalettes = {
  ${colorExports},
};

/** Static color tokens (black, white with alpha scales). */
export { staticColors };

/** Global semantic color aliases (fg, canvas, border, error). */
export { globalAliases };

/** Combined colors for Panda preset theme.tokens.colors. */
export const coreColors = staticColors;

/** Combined colors for Panda preset theme.semanticTokens.colors. */
export const colors = {
  ...semanticColorPalettes,
  ...globalAliases,
  // Alias gray as neutral for component APIs
  neutral: gray,
};
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
 * Generate global semantic aliases (fg, bg, border, canvas, error).
 * Canvas uses step 0 for pure white/black backgrounds.
 */
function generateGlobalAliases(): string {
  return `import { defineSemanticTokens } from "@pandacss/dev";

/**
 * Global semantic color aliases following park-ui conventions.
 * These provide app-level semantic meaning on top of color palettes.
 * Canvas uses step 0 for pure white (light) / black (dark) backgrounds.
 */
export const globalAliases = defineSemanticTokens.colors({
  fg: {
    DEFAULT: { value: { _light: "{colors.gray.12}", _dark: "{colors.gray.12}" } },
    muted: { value: { _light: "{colors.gray.11}", _dark: "{colors.gray.11}" } },
    subtle: { value: { _light: "{colors.gray.10}", _dark: "{colors.gray.10}" } },
  },
  canvas: { value: { _light: "{colors.gray.0}", _dark: "{colors.gray.0}" } },
  border: { value: { _light: "{colors.gray.4}", _dark: "{colors.gray.4}" } },
  error: { value: { _light: "{colors.red.9}", _dark: "{colors.red.9}" } },
});
`;
}

/**
 * Write global aliases file.
 */
function writeGlobalAliasesFile(): void {
  const filePath = join(process.cwd(), OUTPUT_DIR, "aliases.gen.ts");
  const content = generateGlobalAliases();

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created aliases.gen.ts`);
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

  // Generate global aliases
  console.log("\n🎯 Generating global aliases:");
  writeGlobalAliasesFile();

  // Generate barrel file
  console.log("\n📦 Generating barrel file:");
  writeBarrelFile(colorNames);

  console.log(`\n✅ Generated ${colorNames.length} color palettes + aliases`);
}

main();
