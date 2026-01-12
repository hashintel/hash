import fs from "node:fs";
import { join } from "node:path";
import { camelCase, kebabCase } from "case-anything";
import figmaVariables from "./data/figma-variables.json" with { type: "json" };

const OUTPUT_DIR = "src/theme/colors";

type ColorModeValue = { _light: string; _dark: string };

type FigmaColorValue = {
  value: ColorModeValue;
  type: "color";
};

type FigmaColorScale = Record<string, FigmaColorValue>;

type FigmaColorCore = Record<string, FigmaColorScale>;

const colorCore = figmaVariables["color.core"] as FigmaColorCore;

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
