import fs from "node:fs";
import { join } from "node:path";
import { camelCase, kebabCase } from "case-anything";
import { z } from "zod";
import figmaVariables from "./data/figma-variables.json" with { type: "json" };

const OUTPUT_DIR = "src/theme/colors";

/** Light/dark mode color pair as exported by Figma. */
const colorModeValueSchema = z
  .object({
    _light: z.string().describe("Light mode hex color"),
    _dark: z.string().describe("Dark mode hex color"),
  })
  .describe("Light/dark mode color pair");

type ColorModeValue = z.infer<typeof colorModeValueSchema>;

/** A single Figma color variable (one step in a scale). */
const figmaColorValueSchema = z
  .object({
    value: colorModeValueSchema,
    type: z.literal("color"),
  })
  .describe("Single Figma color variable");

/** A named scale of color steps (e.g. `{ "100": …, "200": … }`). */
const figmaColorScaleSchema = z
  .record(z.string(), figmaColorValueSchema)
  .describe("Scale of color steps keyed by step name");

type FigmaColorScale = z.infer<typeof figmaColorScaleSchema>;

/** The top-level `color.core` export containing multiple named scales. */
const figmaColorCoreSchema = z
  .record(z.string(), figmaColorScaleSchema)
  .describe("color.core section of Figma variables export");

/** Parse and validate `color.core` from the Figma JSON. */
const colorCore = figmaColorCoreSchema.parse(figmaVariables["color.core"]);

/**
 * Strip the Figma-export metadata (`type`) and keep only the `{ value }` shape
 * expected by Panda's `defineSemanticTokens.colors()`.
 */
function transformColorScale(
  scale: FigmaColorScale,
): Record<string, { value: ColorModeValue }> {
  return Object.fromEntries(
    Object.entries(scale).map(([step, { value }]) => [step, { value }]),
  );
}

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Convert a token object into a *TypeScript object-literal string*.
 *
 * We intentionally don't use `JSON.stringify()` for the whole structure because
 * we want unquoted keys where possible (cleaner generated code), while still
 * correctly quoting keys that are not valid identifiers.
 */
function formatTokensForOutput(tokens: Record<string, unknown>): string {
  /**
   * Recursive formatter for unknown nested values.
   *
   * It's defined inside `formatTokensForOutput()` so it can remain private and
   * so recursion is expressed naturally without exporting a helper.
   */
  const formatValue = (value: unknown): string => {
    if (value === undefined) {
      // `JSON.stringify(undefined)` returns `undefined`, which is not a string.
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
 * Generate a single color token file (one exported `defineSemanticTokens` call).
 */
function writeColorFile(name: string, tokens: Record<string, unknown>): void {
  const fileName = kebabCase(name);
  const varName = camelCase(name);
  const filePath = join(process.cwd(), OUTPUT_DIR, `${fileName}.ts`);
  const formattedTokens = formatTokensForOutput(tokens);

  const content = `import { defineSemanticTokens } from "@pandacss/dev";

export const ${varName} = defineSemanticTokens.colors(${formattedTokens});
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created ${fileName}.ts`);
}

/**
 * Generate `index.ts` that re-exports all generated color token groups.
 */
function writeIndexFile(colorNames: string[]): void {
  const filePath = join(process.cwd(), OUTPUT_DIR, "index.ts");

  const imports = colorNames
    .map((name) => `import { ${camelCase(name)} } from "./${kebabCase(name)}";`)
    .join("\n");

  const exports = colorNames.map((name) => camelCase(name)).join(",\n  ");

  const content = `${imports}

export const colors = {
  ${exports},
};
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created index.ts`);
}

/**
 * Script entry point.
 *
 * Note: this deletes and recreates the output directory before writing files.
 */
function main(): void {
  console.log("🎨 Generating semantic color tokens from Figma export...");

  const outputPath = join(process.cwd(), OUTPUT_DIR);
  fs.rmSync(outputPath, { recursive: true, force: true });
  fs.mkdirSync(outputPath, { recursive: true });

  const colorNames: string[] = [];

  for (const [colorName, scale] of Object.entries(colorCore)) {
    const tokens = transformColorScale(scale);
    writeColorFile(colorName, tokens);
    colorNames.push(colorName);
  }

  writeIndexFile(colorNames);

  console.log(`✅ Generated ${colorNames.length} color files`);
}

main();
