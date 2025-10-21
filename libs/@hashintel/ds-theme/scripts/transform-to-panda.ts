#!/usr/bin/env tsx
/**
 * Transform Design Tokens Format Module (DTCG) tokens to PandaCSS preset format
 *
 * This script reads design-tokens.json and generates a PandaCSS-compatible preset.
 * It converts DTCG token format to Panda's token structure.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface DTCGColor {
  colorSpace: string;
  components: number[];
  alpha?: number;
  hex: string;
}

interface DTCGDimension {
  value: number;
  unit: string;
}

interface DTCGShadow {
  color: DTCGColor;
  offsetX: DTCGDimension;
  offsetY: DTCGDimension;
  blur: DTCGDimension;
  spread: DTCGDimension;
}

interface DTCGTypography {
  fontFamily: string[];
  fontSize: DTCGDimension;
  fontWeight: number;
  letterSpacing: DTCGDimension;
  lineHeight: number;
}

interface DTCGToken {
  $value: any;
  $type?: string;
  $description?: string;
}

interface DTCGGroup {
  $type?: string;
  $description?: string;
  [key: string]: any;
}

/**
 * Convert DTCG color format to simple hex string for PandaCSS
 */
function convertColor(colorValue: DTCGColor): string {
  return colorValue.hex;
}

/**
 * Convert DTCG dimension format to simple string for PandaCSS
 */
function convertDimension(dimensionValue: DTCGDimension): string {
  return `${dimensionValue.value}${dimensionValue.unit}`;
}

/**
 * Convert DTCG shadow format to CSS shadow string for PandaCSS
 */
function convertShadow(shadowValue: DTCGShadow): string {
  const { color, offsetX, offsetY, blur, spread } = shadowValue;
  const colorStr =
    color.alpha !== undefined
      ? `rgba(${color.components.map((c) => Math.round(c * 255)).join(", ")}, ${color.alpha})`
      : color.hex;

  return `${convertDimension(offsetX)} ${convertDimension(offsetY)} ${convertDimension(blur)} ${colorStr}`;
}

/**
 * Check if an object is a token (has $value property)
 */
function isToken(obj: any): obj is DTCGToken {
  return obj && typeof obj === "object" && "$value" in obj;
}

/**
 * Transform a token value based on its type
 */
function transformTokenValue(value: any, type?: string): any {
  if (!value) return value;

  switch (type) {
    case "color":
      if (typeof value === "object" && "colorSpace" in value) {
        return convertColor(value);
      }
      return value;

    case "dimension":
      if (typeof value === "object" && "value" in value && "unit" in value) {
        return convertDimension(value);
      }
      return value;

    case "shadow":
      if (typeof value === "object" && "color" in value) {
        return convertShadow(value);
      }
      return value;

    case "fontFamily":
      // Keep array format for font families
      return value;

    case "fontWeight":
      // Keep numeric format
      return value;

    case "typography":
      // For typography composite tokens, we need to keep the structure
      // but transform individual dimension values
      if (typeof value === "object") {
        return {
          fontFamily: value.fontFamily,
          fontSize: value.fontSize
            ? convertDimension(value.fontSize)
            : undefined,
          fontWeight: value.fontWeight,
          letterSpacing: value.letterSpacing
            ? convertDimension(value.letterSpacing)
            : undefined,
          lineHeight: value.lineHeight,
        };
      }
      return value;

    default:
      return value;
  }
}

/**
 * Transform a group of tokens recursively
 */
function transformGroup(group: DTCGGroup, parentType?: string): any {
  const result: any = {};
  const groupType = group.$type || parentType;

  for (const [key, value] of Object.entries(group)) {
    // Skip DTCG metadata properties
    if (key.startsWith("$")) {
      continue;
    }

    if (isToken(value)) {
      // Transform token
      const tokenType = value.$type || groupType;
      result[key] = {
        value: transformTokenValue(value.$value, tokenType),
      };
    } else if (typeof value === "object") {
      // Recursively transform nested groups
      result[key] = transformGroup(value, groupType);
    }
  }

  return result;
}

/**
 * Generate PandaCSS preset from DTCG tokens
 */
function generatePandaPreset(dtcgTokens: any): string {
  const tokens: any = {};
  const semanticTokens: any = {};
  const textStyles: any = {};

  // Process each top-level group
  for (const [groupName, groupValue] of Object.entries(dtcgTokens)) {
    if (typeof groupValue !== "object") continue;

    const group = groupValue as DTCGGroup;

    // Special handling for text styles (typography composite tokens)
    if (group.$type === "typography") {
      for (const [styleName, styleValue] of Object.entries(group)) {
        if (styleName.startsWith("$")) continue;

        if (isToken(styleValue)) {
          const typography = styleValue.$value as DTCGTypography;
          textStyles[styleName] = {
            value: {
              fontFamily: typography.fontFamily.join(", "),
              fontSize: convertDimension(typography.fontSize),
              fontWeight: typography.fontWeight.toString(),
              lineHeight:
                typography.lineHeight === 1
                  ? "normal"
                  : typography.lineHeight.toString(),
            },
          };
        }
      }
    } else {
      // Transform regular token groups
      tokens[groupName] = transformGroup(group);
    }
  }

  // Generate the preset file content
  const presetContent = `import { definePreset } from "@pandacss/dev";

export default definePreset({
  name: "@hashintel/ds-theme",
  theme: {
    extend: {
      // Core tokens are the foundational design tokens.
      // https://panda-css.com/docs/theming/tokens#core-tokens
      tokens: ${JSON.stringify(tokens, null, 2)},
    },

    // Semantic tokens are tokens that are designed to be used in a specific context.
    // In most cases, the value of a semantic token references to an existing token.
    // https://panda-css.com/docs/theming/tokens#semantic-tokens
    semanticTokens: ${JSON.stringify(semanticTokens, null, 2)},

    // Text styles combine typography tokens into reusable text styles
    textStyles: ${JSON.stringify(textStyles, null, 2)},
  },
});
`;

  return presetContent;
}

/**
 * Main execution
 */
function main() {
  try {
    // Read the DTCG tokens file
    const tokensPath = resolve(__dirname, "../src/design-tokens.json");
    const tokensContent = readFileSync(tokensPath, "utf-8");
    const dtcgTokens = JSON.parse(tokensContent);

    console.log("📖 Reading design-tokens.json...");

    // Generate PandaCSS preset
    console.log("🔄 Transforming to PandaCSS format...");
    const presetContent = generatePandaPreset(dtcgTokens);

    // Write the output file
    const outputPath = resolve(__dirname, "../src/index.generated.ts");
    writeFileSync(outputPath, presetContent, "utf-8");

    console.log("✅ Successfully generated PandaCSS preset!");
    console.log(`   Output: ${outputPath}`);
    console.log(
      "\n💡 To use this preset, update your panda.config to import from index.generated.ts",
    );
  } catch (error) {
    console.error("❌ Error transforming tokens:", error);
    process.exit(1);
  }
}

main();
