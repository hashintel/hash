import fs from "node:fs";
import { join } from "node:path";
import { camelCase, kebabCase } from "case-anything";
import { z } from "zod";
import figmaVariables from "./figma-variables.json" with { type: "json" };
import { cleanDescription, transformPropertyKey } from "./transforms";

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
 * A semantic token value is a reference string like `{gray.90}` or `{neutral.white}`.
 */
const semanticTokenRefSchema = z
  .object({
    value: z.string().describe("Token reference like {gray.90}"),
    type: z.literal("color"),
    resolvedType: z.literal("COLOR").optional(),
    description: z.string().optional(),
  })
  .describe("Semantic token with reference value");

type SemanticTokenRef = z.infer<typeof semanticTokenRefSchema>;

/**
 * Semantic tokens can be nested arbitrarily deep.
 * Leaf nodes have `value`/`type`, intermediate nodes are plain objects.
 */
type SemanticTokenNode =
  | SemanticTokenRef
  | { [key: string]: SemanticTokenNode };

const semanticTokenNodeSchema: z.ZodType<SemanticTokenNode> = z.lazy(() =>
  z.union([
    semanticTokenRefSchema,
    z.record(z.string(), semanticTokenNodeSchema),
  ]),
);

/** The top-level `color.semantic` export containing nested semantic tokens. */
const figmaColorSemanticSchema = z
  .record(z.string(), semanticTokenNodeSchema)
  .describe("color.semantic section of Figma variables export");

/** Parse and validate `color.semantic` from the Figma JSON (if present). */
const colorSemantic = figmaVariables["color.semantic"]
  ? figmaColorSemanticSchema.parse(figmaVariables["color.semantic"])
  : null;

/**
 * Convert a Figma reference like `{gray.90}` to a Panda token reference `{colors.gray.90}`.
 * Handles kebab-case to camelCase conversion for color names.
 */
function transformTokenReference(ref: string): string {
  // Match pattern like {colorName.step} or {colorName.nested.step}
  const match = ref.match(/^\{(.+)\}$/);
  if (!match) {
    // Not a reference, return as-is (shouldn't happen with well-formed data)
    return ref;
  }

  const parts = match[1].split(".");
  // Convert the color name (first part) from kebab-case to camelCase
  const colorName = camelCase(parts[0]);
  const rest = parts.slice(1).join(".");

  return `{colors.${colorName}.${rest}}`;
}

/**
 * Check if a node is a leaf (has `value` and `type` properties).
 */
function isSemanticLeaf(node: SemanticTokenNode): node is SemanticTokenRef {
  return (
    typeof node === "object" &&
    node !== null &&
    "value" in node &&
    "type" in node &&
    typeof node.value === "string"
  );
}

/**
 * Recursively transform semantic tokens, converting Figma references to Panda references.
 * Retains `value` and `description` properties, discarding `type` and `resolvedType`.
 * Converts `default` keys to `DEFAULT` for Panda's nested default token syntax.
 */
function transformSemanticTokens(
  node: SemanticTokenNode,
): Record<string, unknown> | { value: string; description?: string } {
  if (isSemanticLeaf(node)) {
    const result: { value: string; description?: string } = {
      value: transformTokenReference(node.value),
    };
    if (node.description) {
      result.description = cleanDescription(node.description);
    }
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    // Convert kebab-case keys to camelCase (e.g., "link-hover" -> "linkHover")
    // Also convert "default" to "DEFAULT" for Panda's nested default syntax
    const transformedKey = transformPropertyKey(camelCase(key));
    result[transformedKey] = transformSemanticTokens(
      child as SemanticTokenNode,
    );
  }
  return result;
}

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
 * Files are named with .gen.ts suffix to be gitignored.
 */
function writeColorFile(name: string, tokens: Record<string, unknown>): void {
  const fileName = kebabCase(name);
  const varName = camelCase(name);
  const filePath = join(process.cwd(), OUTPUT_DIR, `${fileName}.gen.ts`);
  const formattedTokens = formatTokensForOutput(tokens);

  const content = `import { defineSemanticTokens } from "@pandacss/dev";

export const ${varName} = defineSemanticTokens.colors(${formattedTokens});
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created ${fileName}.gen.ts`);
}

/**
 * Generate barrel file that re-exports all generated color token groups.
 * Output at parent level (src/theme/colors.gen.ts) instead of index.ts inside the directory.
 * The barrel file is also .gen.ts since it's fully generated.
 */
function writeBarrelFile(
  coreColorNames: string[],
  semanticColorNames: string[],
): void {
  const filePath = join(process.cwd(), "src/theme/colors.gen.ts");

  const coreImports = coreColorNames
    .map(
      (name) =>
        `import { ${camelCase(name)} } from "./colors/${kebabCase(name)}.gen";`,
    )
    .join("\n");

  const semanticImports = semanticColorNames
    .map(
      (name) =>
        `import { ${camelCase(name)} } from "./colors/semantic-${kebabCase(name)}.gen";`,
    )
    .join("\n");

  const coreExports = coreColorNames
    .map((name) => camelCase(name))
    .join(",\n  ");
  const semanticExports = semanticColorNames
    .map((name) => camelCase(name))
    .join(",\n  ");

  const content = `${coreImports}
${semanticImports}

/** Core color scales (gray, red, blue, etc.) with light/dark mode values. */
export const coreColors = {
  ${coreExports},
};

/** Semantic color tokens (bg, text, border, etc.) that reference core colors. */
export const semanticColors = {
  ${semanticExports},
};

/** Combined colors export for use in Panda preset. */
export const colors = {
  ...coreColors,
  ...semanticColors,
};
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created colors.gen.ts (barrel file)`);
}

/**
 * Generate a semantic color token file (references other tokens).
 * Files are named with .gen.ts suffix to be gitignored.
 */
function writeSemanticColorFile(
  name: string,
  tokens: Record<string, unknown>,
): void {
  const fileName = `semantic-${kebabCase(name)}`;
  const varName = camelCase(name);
  const filePath = join(process.cwd(), OUTPUT_DIR, `${fileName}.gen.ts`);
  const formattedTokens = formatTokensForOutput(tokens);

  const content = `import { defineSemanticTokens } from "@pandacss/dev";

export const ${varName} = defineSemanticTokens.colors(${formattedTokens});
`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`📄 Created ${fileName}.gen.ts`);
}

/**
 * Script entry point.
 *
 * Note: this deletes and recreates the output directory before writing files.
 */
function main(): void {
  console.log("🎨 Generating color tokens from Figma export...");

  const outputPath = join(process.cwd(), OUTPUT_DIR);
  fs.rmSync(outputPath, { recursive: true, force: true });
  fs.mkdirSync(outputPath, { recursive: true });

  // Generate core color files
  const coreColorNames: string[] = [];
  console.log("\n📦 Core colors:");
  for (const [colorName, scale] of Object.entries(colorCore)) {
    const tokens = transformColorScale(scale);
    writeColorFile(colorName, tokens);
    coreColorNames.push(colorName);
  }

  // Generate semantic color files
  const semanticColorNames: string[] = [];
  if (colorSemantic) {
    console.log("\n🎯 Semantic colors:");
    for (const [categoryName, node] of Object.entries(colorSemantic)) {
      const tokens = transformSemanticTokens(node as SemanticTokenNode);
      writeSemanticColorFile(categoryName, tokens);
      semanticColorNames.push(categoryName);
    }
  }

  writeBarrelFile(coreColorNames, semanticColorNames);

  console.log(
    `\n✅ Generated ${coreColorNames.length} core + ${semanticColorNames.length} semantic color files`,
  );
}

main();
