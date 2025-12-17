import fs from "node:fs";
import { join } from "node:path";
import { camelCase, kebabCase } from "case-anything";
import figmaVariables from "./data/variables.json" with { type: "json" };

const OUTPUT_DIR = "src/theme/colors";

type FigmaColorValue = {
  value: { _light: string; _dark: string };
  type: "color";
};

type FigmaColorScale = Record<string, FigmaColorValue>;

type FigmaColorCore = Record<string, FigmaColorScale>;

const colorCore = figmaVariables["color.core"] as FigmaColorCore;

function transformColorScale(
  scale: FigmaColorScale
): Record<string, { value: { _light: string; _dark: string } }> {
  return Object.fromEntries(
    Object.entries(scale).map(([step, { value }]) => [step, { value }])
  );
}

function formatTokensForOutput(tokens: Record<string, unknown>): string {
  const formatValue = (value: unknown): string => {
    if (typeof value !== "object" || value === null) {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((v) => formatValue(v)).join(", ")}]`;
    }

    const entries = Object.entries(value);
    const formatted = entries
      .map(([key, val]) => {
        const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
          ? key
          : JSON.stringify(key);
        return `${keyStr}: ${formatValue(val)}`;
      })
      .join(", ");

    return `{ ${formatted} }`;
  };

  return formatValue(tokens);
}

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
