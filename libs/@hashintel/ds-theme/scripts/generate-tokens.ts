import fs from "node:fs";
import { join } from "node:path";
import { camelCase } from "case-anything";
import { z } from "zod";
import figmaVariables from "./figma-variables.json" with { type: "json" };
import {
  formatTokensForOutput,
  shouldSkipKey,
  transformPropertyKey,
  transformSpacingScale,
  transformLineHeightReference,
} from "./transforms";

const OUTPUT_DIR = "src/theme/tokens";

// ============================================================================
// FIGMA VARIABLE TYPES - Literal types for known Figma export structure
// ============================================================================

/** Known resolved types from Figma Variables Plugin */
const resolvedTypeSchema = z.enum(["FLOAT", "STRING", "COLOR"]);

/** Known variable types from Figma Variables Plugin */
const variableTypeSchema = z.enum([
  "spacing",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "color",
]);

// ============================================================================
// SPACING TOKENS
// ============================================================================

const spacingValueSchema = z.object({
  value: z.number(),
  type: z.literal("spacing"),
  resolvedType: z.literal("FLOAT"),
});

const spacingScaleSchema = z.record(z.string(), spacingValueSchema);
const spacingSchema = z.record(z.string(), spacingScaleSchema);

function generateSpacingTokens(): void {
  const spacing = figmaVariables.spacing;
  if (!spacing) {
    console.log("⚠️ No spacing tokens found in Figma export");
    return;
  }

  const parsed = spacingSchema.parse(spacing);
  const tokens: Record<string, Record<string, { value: string }>> = {};

  for (const [scaleName, scale] of Object.entries(parsed)) {
    // Skip private/internal keys (starting with "-" or "_")
    if (shouldSkipKey(scaleName)) {
      continue;
    }
    // Convert "default" to "DEFAULT" for Panda's nested default token syntax
    const key = transformPropertyKey(camelCase(scaleName));
    tokens[key] = transformSpacingScale(scale);
  }

  const filePath = join(process.cwd(), OUTPUT_DIR, "spacing.gen.ts");
  const content = `import { defineTokens } from "@pandacss/dev";

export const spacing = defineTokens.spacing(${formatTokensForOutput(tokens)});
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log("📄 Created spacing.gen.ts");
}

// ============================================================================
// TYPOGRAPHY TOKENS
// ============================================================================

const fontFamilyValueSchema = z.object({
  value: z.string(),
  type: z.literal("fontFamily"),
  resolvedType: z.literal("STRING"),
});

const fontWeightValueSchema = z.object({
  value: z.number(),
  type: z.literal("fontWeight"),
  resolvedType: z.literal("FLOAT"),
});

const fontSizeValueSchema = z.object({
  value: z.number(),
  type: z.literal("fontSize"),
  resolvedType: z.literal("FLOAT"),
});

const lineHeightValueSchema = z.object({
  value: z.union([z.number(), z.string()]),
  type: z.literal("lineHeight"),
  resolvedType: z.literal("FLOAT"),
});

const typographySchema = z.object({
  family: z.record(z.string(), fontFamilyValueSchema).optional(),
  weight: z.record(z.string(), z.union([fontWeightValueSchema, z.any()])),
  size: z.record(z.string(), fontSizeValueSchema).optional(),
  leading: z
    .record(z.string(), z.record(z.string(), lineHeightValueSchema))
    .optional(),
});

function generateTypographyTokens(): void {
  const typography = figmaVariables.typography;
  if (!typography) {
    console.log("⚠️ No typography tokens found in Figma export");
    return;
  }

  const parsed = typographySchema.parse(typography);
  const filePath = join(process.cwd(), OUTPUT_DIR, "typography.gen.ts");

  // Font families
  const fonts: Record<string, { value: string }> = {};
  if (parsed.family) {
    for (const [name, { value }] of Object.entries(parsed.family)) {
      if (shouldSkipKey(name)) continue;
      fonts[camelCase(name)] = { value };
    }
  }

  // Font weights (filter out deprecated entries)
  const fontWeights: Record<string, { value: number }> = {};
  for (const [name, entry] of Object.entries(parsed.weight)) {
    if (shouldSkipKey(name)) continue;
    if ("type" in entry && entry.type === "fontWeight") {
      fontWeights[camelCase(name)] = { value: entry.value as number };
    }
  }

  // Font sizes (preserve original keys like "3xl", "2xl", etc.)
  const fontSizes: Record<string, { value: string }> = {};
  if (parsed.size) {
    for (const [name, { value }] of Object.entries(parsed.size)) {
      if (shouldSkipKey(name)) continue;
      fontSizes[name] = { value: `${value}px` };
    }
  }

  // Line heights (preserve original keys like "text-3xl")
  const lineHeights: Record<string, Record<string, { value: string }>> = {};
  if (parsed.leading) {
    for (const [category, scales] of Object.entries(parsed.leading)) {
      if (shouldSkipKey(category)) continue;
      const categoryTokens: Record<string, { value: string }> = {};
      for (const [name, { value }] of Object.entries(scales)) {
        if (shouldSkipKey(name)) continue;
        categoryTokens[name] = { value: transformLineHeightReference(value) };
      }
      lineHeights[category] = categoryTokens;
    }
  }

  const content = `import { defineTokens } from "@pandacss/dev";

export const fonts = defineTokens.fonts(${formatTokensForOutput(fonts)});

export const fontWeights = defineTokens.fontWeights(${formatTokensForOutput(fontWeights)});

export const fontSizes = defineTokens.fontSizes(${formatTokensForOutput(fontSizes)});

export const lineHeights = defineTokens.lineHeights(${formatTokensForOutput(lineHeights)});
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log("📄 Created typography.gen.ts");
}

// ============================================================================
// BARREL FILE
// ============================================================================

function generateBarrelFile(): void {
  const filePath = join(process.cwd(), "src/theme/tokens.gen.ts");

  const content = `export { spacing } from "./tokens/spacing.gen";
export { fonts, fontWeights, fontSizes, lineHeights } from "./tokens/typography.gen";
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log("📄 Created tokens.gen.ts (barrel file)");
}

// ============================================================================
// TOP-LEVEL SCHEMA - Validates expected structure of Figma export
// ============================================================================

/** Top-level keys we expect in the Figma variables export */
const figmaVariablesSchema = z.object({
  "color.semantic": z.record(z.string(), z.unknown()),
  spacing: spacingSchema,
  typography: typographySchema,
});

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log("🎨 Generating design tokens from Figma export...\n");

  // Validate top-level structure
  figmaVariablesSchema.parse(figmaVariables);

  const outputPath = join(process.cwd(), OUTPUT_DIR);

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  console.log("📦 Spacing tokens:");
  generateSpacingTokens();

  console.log("\n📦 Typography tokens:");
  generateTypographyTokens();

  console.log("\n📦 Barrel file:");
  generateBarrelFile();

  console.log("\n✅ Token generation complete!");
}

main();
