import fs from "node:fs";
import { join } from "node:path";
import { camelCase, kebabCase } from "case-anything";
import { z } from "zod";
import figmaVariables from "./figma-variables.json" with { type: "json" };

const OUTPUT_DIR = "src/theme/tokens";

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Convert a token object into a TypeScript object-literal string.
 */
function formatTokensForOutput(tokens: Record<string, unknown>): string {
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

// ============================================================================
// SPACING TOKENS
// ============================================================================

/** Schema for a single spacing value */
const spacingValueSchema = z.object({
  value: z.number(),
  type: z.literal("spacing"),
  resolvedType: z.literal("FLOAT"),
});

/** Schema for a spacing scale (e.g., compact, comfortable) */
const spacingScaleSchema = z.record(z.string(), spacingValueSchema);

/** Schema for the spacing section */
const spacingSchema = z.record(z.string(), spacingScaleSchema);

/**
 * Transform spacing values to Panda token format.
 * Adds "px" suffix to numeric values.
 */
function transformSpacingScale(
  scale: z.infer<typeof spacingScaleSchema>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(scale).map(([step, { value }]) => [
      step,
      { value: `${value}px` },
    ]),
  );
}

function generateSpacingTokens(): void {
  const spacing = figmaVariables.spacing;
  if (!spacing) {
    console.log("⚠️ No spacing tokens found in Figma export");
    return;
  }

  const parsed = spacingSchema.parse(spacing);
  const tokens: Record<string, Record<string, { value: string }>> = {};

  for (const [scaleName, scale] of Object.entries(parsed)) {
    tokens[camelCase(scaleName)] = transformSpacingScale(scale);
  }

  const filePath = join(process.cwd(), OUTPUT_DIR, "spacing.ts");
  const content = `import { defineTokens } from "@pandacss/dev";

export const spacing = defineTokens.spacing(${formatTokensForOutput(tokens)});
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log("📄 Created spacing.ts");
}

// ============================================================================
// TYPOGRAPHY TOKENS
// ============================================================================

/** Schema for font family */
const fontFamilyValueSchema = z.object({
  value: z.string(),
  type: z.literal("fontFamily"),
  resolvedType: z.literal("STRING"),
});

/** Schema for font weight */
const fontWeightValueSchema = z.object({
  value: z.number(),
  type: z.literal("fontWeight"),
  resolvedType: z.literal("FLOAT"),
});

/** Schema for font size */
const fontSizeValueSchema = z.object({
  value: z.number(),
  type: z.literal("fontSize"),
  resolvedType: z.literal("FLOAT"),
});

/** Schema for line height (can be number or reference) */
const lineHeightValueSchema = z.object({
  value: z.union([z.number(), z.string()]),
  type: z.literal("lineHeight"),
  resolvedType: z.literal("FLOAT"),
});

/** Schema for the typography section */
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
  const filePath = join(process.cwd(), OUTPUT_DIR, "typography.ts");

  // Font families
  const fonts: Record<string, { value: string }> = {};
  if (parsed.family) {
    for (const [name, { value }] of Object.entries(parsed.family)) {
      fonts[camelCase(name)] = { value };
    }
  }

  // Font weights (filter out deprecated entries with "-delete" suffix)
  const fontWeights: Record<string, { value: number }> = {};
  for (const [name, entry] of Object.entries(parsed.weight)) {
    if (name.includes("-delete")) continue;
    if ("type" in entry && entry.type === "fontWeight") {
      fontWeights[camelCase(name)] = { value: entry.value as number };
    }
  }

  // Font sizes (preserve original keys like "3xl", "2xl", etc.)
  const fontSizes: Record<string, { value: string }> = {};
  if (parsed.size) {
    for (const [name, { value }] of Object.entries(parsed.size)) {
      // Keep size names as-is (xs, sm, base, lg, xl, 2xl, 3xl, 4xl)
      fontSizes[name] = { value: `${value}px` };
    }
  }

  // Line heights (preserve original keys like "text-3xl")
  const lineHeights: Record<string, Record<string, { value: string }>> = {};
  if (parsed.leading) {
    for (const [category, scales] of Object.entries(parsed.leading)) {
      const categoryTokens: Record<string, { value: string }> = {};
      for (const [name, { value }] of Object.entries(scales)) {
        // Convert references like "{size.3xl}" to Panda format "{fontSizes.3xl}"
        const tokenValue =
          typeof value === "string"
            ? value.replace(/\{size\.([^}]+)\}/g, "{fontSizes.$1}")
            : `${value}px`;
        // Keep original key (e.g., "text-3xl")
        categoryTokens[name] = { value: tokenValue };
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
  console.log("📄 Created typography.ts");
}

// ============================================================================
// BORDER RADIUS TOKENS
// ============================================================================

/** Schema for a single border radius value */
const radiusValueSchema = z.object({
  value: z.union([z.number(), z.string()]),
  type: z.literal("borderRadius"),
  resolvedType: z.literal("FLOAT"),
});

/** Schema for a radius scale */
const radiusScaleSchema = z.record(z.string(), radiusValueSchema);

/** Schema for the radius section */
const radiusSchema = z.object({
  core: z.record(z.string(), radiusScaleSchema).optional(),
  component: z.record(z.string(), z.record(z.string(), radiusValueSchema)).optional(),
});

/**
 * Transform radius values to Panda token format.
 */
function transformRadiusScale(
  scale: z.infer<typeof radiusScaleSchema>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(scale).map(([step, { value }]) => {
      // Handle references like "{radius.4}"
      const tokenValue =
        typeof value === "string" ? value : value === 9999 ? "9999px" : `${value}px`;
      return [step, { value: tokenValue }];
    }),
  );
}

function generateRadiusTokens(): void {
  const radius = figmaVariables.radius;
  if (!radius) {
    console.log("⚠️ No radius tokens found in Figma export");
    return;
  }

  const parsed = radiusSchema.parse(radius);
  const filePath = join(process.cwd(), OUTPUT_DIR, "radii.ts");

  // Core radii scales (sm, md, lg, etc.)
  const coreRadii: Record<string, Record<string, { value: string }>> = {};
  if (parsed.core) {
    for (const [scaleName, scale] of Object.entries(parsed.core)) {
      coreRadii[camelCase(scaleName)] = transformRadiusScale(scale);
    }
  }

  // Component-specific radii (button, etc.)
  const componentRadii: Record<string, Record<string, { value: string }>> = {};
  if (parsed.component) {
    for (const [componentName, sizes] of Object.entries(parsed.component)) {
      const sizeTokens: Record<string, { value: string }> = {};
      for (const [size, { value }] of Object.entries(sizes)) {
        // Transform references like "{radius.4}" to Panda format "{radii.md.4}"
        // For now, we'll use the raw value
        const tokenValue =
          typeof value === "string"
            ? value.replace(/\{radius\.(\d+)\}/g, "{radii.md.$1}")
            : `${value}px`;
        sizeTokens[camelCase(size)] = { value: tokenValue };
      }
      componentRadii[camelCase(componentName)] = sizeTokens;
    }
  }

  // Merge core and component radii
  const allRadii = { ...coreRadii, component: componentRadii };

  const content = `import { defineTokens } from "@pandacss/dev";

export const radii = defineTokens.radii(${formatTokensForOutput(allRadii)});
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log("📄 Created radii.ts");
}

// ============================================================================
// BARREL FILE
// ============================================================================

/**
 * Generate barrel file at parent level (src/theme/tokens.ts) instead of index.ts inside the directory.
 */
function generateBarrelFile(): void {
  const filePath = join(process.cwd(), "src/theme/tokens.ts");

  const content = `export { spacing } from "./tokens/spacing";
export { fonts, fontWeights, fontSizes, lineHeights } from "./tokens/typography";
export { radii } from "./tokens/radii";
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log("📄 Created tokens.ts (barrel file)");
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log("🎨 Generating design tokens from Figma export...\n");

  const outputPath = join(process.cwd(), OUTPUT_DIR);

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  console.log("📦 Spacing tokens:");
  generateSpacingTokens();

  console.log("\n📦 Typography tokens:");
  generateTypographyTokens();

  console.log("\n📦 Border radius tokens:");
  generateRadiusTokens();

  console.log("\n📦 Barrel file:");
  generateBarrelFile();

  console.log("\n✅ Token generation complete!");
}

main();
