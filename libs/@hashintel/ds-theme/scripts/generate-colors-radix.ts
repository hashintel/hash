/**
 * Radix-colors based color token generator.
 *
 * Generates base color scales (s00-s120 with half-steps, a00-a120 with half-steps)
 * from @radix-ui/colors, interpolating midpoints in OKLCH color space.
 * Semantic tokens (bg, fg, bd) are composed per palette for colorPalette support.
 *
 * Run with: tsx scripts/generate-colors-radix.ts
 */

import fs from "node:fs";
import { join } from "node:path";
import Color from "colorjs.io";
import * as radixColors from "@radix-ui/colors";
import { withSemantics, type PaletteKind } from "../src/theme/utils";

const OUTPUT_DIR = "src/theme/colors";

/**
 * Colors to include in generation. Add/remove as needed.
 */
const INCLUDED_COLORS = [
  "gray",
  "blue",
  "green",
  "orange",
  "yellow",
  "red",
  "purple",
  "pink",
] as const;

/** Map radix color names to output names. Unmapped names use themselves. */
const OUTPUT_NAMES: Record<string, string> = {
  gray: "neutral",
};

/** Colors whose step-9 is bright enough to need dark foreground text. */
const BRIGHT_COLORS: readonly string[] = ["yellow", "orange"];

/** Neutral/gray-scale colors that use black/white for solid backgrounds. */
const NEUTRAL_COLORS: readonly string[] = ["gray"];

function getPaletteKind(radixName: string): PaletteKind {
  if (NEUTRAL_COLORS.includes(radixName)) return "neutral";
  if (BRIGHT_COLORS.includes(radixName)) return "bright";
  return "normal";
}

type ColorName = string;
type ColorScale = Record<string, string>;
type ColorTokens = Record<string, unknown>;
type ColorPalette = { name: ColorName; tokens: ColorTokens };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toHex(color: Color): string {
  const r = clamp(Math.round(color.srgb.r * 255), 0, 255);
  const g = clamp(Math.round(color.srgb.g * 255), 0, 255);
  const b = clamp(Math.round(color.srgb.b * 255), 0, 255);
  const a = clamp(color.alpha, 0, 1);
  const rr = r.toString(16).padStart(2, "0");
  const gg = g.toString(16).padStart(2, "0");
  const bb = b.toString(16).padStart(2, "0");
  if (a >= 0.999) {
    return `#${rr}${gg}${bb}`;
  }
  const aa = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${rr}${gg}${bb}${aa}`;
}

function toRgba(color: Color): string {
  const r = clamp(Math.round(color.srgb.r * 255), 0, 255);
  const g = clamp(Math.round(color.srgb.g * 255), 0, 255);
  const b = clamp(Math.round(color.srgb.b * 255), 0, 255);
  const a = clamp(Math.round(color.alpha * 1000) / 1000, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function interpolateColor(colorA: string, colorB: string): string {
  let a: Color;
  const b = new Color(colorB);

  if (colorA === "transparent" || colorA === "rgba(0, 0, 0, 0)") {
    a = new Color(b);
    a.alpha = 0;
  } else {
    a = new Color(colorA);
  }

  const mid = a.mix(b, 0.5, { space: "oklch" });
  return toHex(mid);
}

function interpolateColorRgba(colorA: string, colorB: string): string {
  let a: Color;
  const b = new Color(colorB);

  if (colorA === "transparent" || colorA === "rgba(0, 0, 0, 0)") {
    a = new Color(b);
    a.alpha = 0;
  } else {
    a = new Color(colorA);
  }

  const mid = a.mix(b, 0.5, { space: "oklch" });
  return toRgba(mid);
}

/**
 * Check if a color name is valid for extraction from radix-colors.
 */
function isValidColorName(colorName: string): boolean {
  return !/[A-Z]/.test(colorName) && colorName !== "default";
}

/**
 * Get all valid color names from radix-colors that we want to include.
 */
function getColorNames(): ColorName[] {
  const allColors = Object.keys(radixColors).filter(isValidColorName);
  return allColors.filter((name) =>
    INCLUDED_COLORS.some((included) => name === included),
  );
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
 * Generate base tokens (s00-s120 with half-steps, a00-a120 with half-steps) for a color.
 * Step s00 is pure white (light) / black (dark) for true background color.
 * Step a00 is fully transparent.
 * Half-steps (s05, s15, ..., s115) are interpolated in OKLCH between adjacent steps.
 */
function generateBaseTokens(
  light: ColorScale,
  dark: ColorScale,
): Record<string, unknown> {
  const tokens: Record<string, unknown> = {};

  const lightValues: string[] = ["#ffffff"];
  const darkValues: string[] = ["#000000"];
  const lightAlphaValues: string[] = ["transparent"];
  const darkAlphaValues: string[] = ["transparent"];

  for (let i = 1; i <= 12; i++) {
    lightValues.push(light[i]!);
    darkValues.push(dark[i]!);
    lightAlphaValues.push(light[`a${i}`]!);
    darkAlphaValues.push(dark[`a${i}`]!);
  }

  // Solid tokens: s00, s05, s10, s15, ..., s115, s120
  for (let i = 0; i <= 12; i++) {
    const key = `s${String(i * 10).padStart(2, "0")}`;
    tokens[key] = {
      value: { _light: lightValues[i], _dark: darkValues[i] },
    };

    if (i < 12) {
      const halfKey = `s${String(i * 10 + 5).padStart(2, "0")}`;
      tokens[halfKey] = {
        value: {
          _light: interpolateColor(lightValues[i]!, lightValues[i + 1]!),
          _dark: interpolateColor(darkValues[i]!, darkValues[i + 1]!),
        },
      };
    }
  }

  // Alpha tokens: a00, a05, a10, a15, ..., a115, a120
  for (let i = 0; i <= 12; i++) {
    const key = `a${String(i * 10).padStart(2, "0")}`;
    tokens[key] = {
      value: { _light: lightAlphaValues[i], _dark: darkAlphaValues[i] },
    };

    if (i < 12) {
      const halfKey = `a${String(i * 10 + 5).padStart(2, "0")}`;
      tokens[halfKey] = {
        value: {
          _light: interpolateColor(
            lightAlphaValues[i]!,
            lightAlphaValues[i + 1]!,
          ),
          _dark: interpolateColor(darkAlphaValues[i]!, darkAlphaValues[i + 1]!),
        },
      };
    }
  }

  return tokens;
}

/**
 * Generate tokens for a color (just the base scale).
 */
function generateColorTokens(color: string, outputName: string, kind: PaletteKind): ColorTokens {
  const { light, dark } = getColorTokens(color);
  const baseTokens = generateBaseTokens(light, dark);
  return withSemantics(outputName, baseTokens, kind);
}

/**
 * Create a color palette object.
 */
function createColorPalette(colorName: ColorName): ColorPalette {
  const outputName = OUTPUT_NAMES[colorName] ?? colorName;
  const kind = getPaletteKind(colorName);
  return {
    name: outputName,
    tokens: generateColorTokens(colorName, outputName, kind),
  };
}

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function tokenKeySortOrder(key: string): number {
  const alphaMatch = key.match(/^a(\d+)$/);
  if (alphaMatch) {
    return 20000 + Number(alphaMatch[1]);
  }
  const solidMatch = key.match(/^s(\d+)$/);
  if (solidMatch) {
    return 10000 + Number(solidMatch[1]);
  }
  return 30000;
}

/**
 * Format tokens as TypeScript object literal string.
 */
function formatTokensForOutput(tokens: ColorTokens): string {
  const formatValue = (value: unknown, sortKeys = false): string => {
    if (value === undefined) {
      return "undefined";
    }

    if (typeof value !== "object" || value === null) {
      return JSON.stringify(value) ?? "undefined";
    }

    if (Array.isArray(value)) {
      return `[${value.map((v) => formatValue(v)).join(", ")}]`;
    }

    let entries = Object.entries(value);
    if (sortKeys) {
      entries = entries.sort(
        ([a], [b]) => tokenKeySortOrder(a) - tokenKeySortOrder(b),
      );
    }
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

  return formatValue(tokens, true);
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
 * Scales use a00-a120 with half-steps (a05, a15, ..., a115) interpolated in OKLCH.
 */
function generateStaticColorTokens(): string {
  const blackAlphas = [
    0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95,
  ];
  const whiteAlphas = [
    0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95,
  ];

  function buildStaticLines(
    r: number,
    g: number,
    b: number,
    alphas: number[],
  ): string {
    const lines: string[] = [];
    for (let i = 0; i < alphas.length; i++) {
      const key = `a${String(i * 10).padStart(2, "0")}`;
      const a = alphas[i]!;
      if (a === 0) {
        lines.push(`  ${key}: { value: "rgba(${r}, ${g}, ${b}, 0)" },`);
      } else {
        lines.push(`  ${key}: { value: "rgba(${r}, ${g}, ${b}, ${a})" },`);
      }

      if (i < alphas.length - 1) {
        const halfKey = `a${String(i * 10 + 5).padStart(2, "0")}`;
        const currentVal = `rgba(${r}, ${g}, ${b}, ${a})`;
        const nextVal = `rgba(${r}, ${g}, ${b}, ${alphas[i + 1]})`;
        const mid = interpolateColorRgba(
          a === 0 ? "transparent" : currentVal,
          nextVal,
        );
        lines.push(`  ${halfKey}: { value: "${mid}" },`);
      }
    }
    return lines.join("\n");
  }

  const blackLines = buildStaticLines(0, 0, 0, blackAlphas);
  const whiteLines = buildStaticLines(255, 255, 255, whiteAlphas);

  return `import { defineTokens } from "@pandacss/dev";

const black = defineTokens.colors({
  DEFAULT: { value: "#000000" },
${blackLines}
});

const white = defineTokens.colors({
  DEFAULT: { value: "#ffffff" },
${whiteLines}
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
  writeBarrelFile(palettes.map((p) => p.name));

  console.log(`\n✅ Generated ${colorNames.length} color palettes`);
}

main();
