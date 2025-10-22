import type { Preset } from "@pandacss/types";
import setWith from "lodash.setwith";
import variablesJson from "../src/devexport.ts";
import { FigmaVariablesExport } from "./figma.variables";

// This script maps the Figma variable export JSON to TypeScript types.
// Figma plugin: https://www.figma.com/community/plugin/1491572182178544621/variables-exporter-for-dev-mode
//
// If at some point we get access to the Figma API for variables, mapping will still be necessary,
// so having this script is useful for future-proofing.
//
// The goal is to keep Figma variables as the source of truth for design tokens,
// and progressively enhance them to target in the future some kind of "standard" format.

/**
 * Clean up variable name for use in PandaCSS:
 * - Replace slashes with dots
 * - Remove all non-alphanumeric characters except dots
 */
function cleanVariableName(name: string): string {
  return name
    .replace(/\//g, ".") // Replace slashes with dots
    .replace(/[^a-zA-Z0-9.]/g, ""); // Remove non-alphanumeric except dots
}

/**
 * Transform Figma export to PandaCSS preset
 */
export function toPanda(root: FigmaVariablesExport): Preset {
  const modeIdToNameMap = new Map<string, string>();
  const varIdToVarMap = new Map<string, string>();

  const output: Preset = {
    name: "@hashintel/ds-theme",
    theme: {},
  };

  // From collections, only extract mapping from ModeID to Mode name
  for (const collection of root.collections) {
    // If only one mode, no need to save the mapping
    // TODO: Verify if we can't just check if variable.valuesByMode has only one entry
    // But possibly valuesByMode could have only one entry even if collection has multiple modes?
    if (collection.modes.length < 2) continue;

    for (const mode of collection.modes) {
      modeIdToNameMap.set(mode.id, mode.name);
    }
  }

  // First pass on variables: Create map id -> cleaned name
  for (const variable of root.variables) {
    varIdToVarMap.set(variable.id, cleanVariableName(variable.name));
  }

  // Second pass on variables: Map to PandaCSS theme structure
  for (const variable of root.variables) {
    // Special cases: Omit these variables
    // TODO: Discuss with @CiaranH to confirm these exclusions/adapt values
    if (
      variable.name === "container" ||
      variable.scopes.length === 0 ||
      variable.name === "spacing/Number" ||
      variable.name === "weight/normal" ||
      variable.name === "weight/medium" ||
      variable.name === "weight/semibold"
    )
      continue;

    console.log(`
Variable: ${variable.name} (type: ${variable.type})`);
    console.log(`  Scopes: ${variable.scopes.join(", ")}`);

    // Determine the target path in the theme object based on scopes and type
    let targetPath:
      | "colors"
      | "spacing"
      | "radii"
      | "fonts"
      | "fontSizes"
      | "lineHeights"
      | null = null;

    if (
      variable.type === "COLOR" &&
      (variable.scopes.includes("ALL_SCOPES") ||
        variable.scopes.includes("COLOR") ||
        variable.scopes.includes("FILL_COLOR") ||
        variable.scopes.includes("STROKE_COLOR") ||
        variable.scopes.includes("TEXT_FILL") ||
        variable.scopes.includes("SHAPE_FILL") ||
        variable.scopes.includes("FRAME_FILL"))
    ) {
      targetPath = "colors";
    } else if (variable.scopes.includes("CORNER_RADIUS")) {
      targetPath = "radii";
    } else if (variable.scopes.includes("GAP")) {
      targetPath = "spacing";
    } else if (variable.scopes.includes("FONT_SIZE")) {
      targetPath = "fontSizes";
    } else if (variable.scopes.includes("FONT_STYLE")) {
      targetPath = "fonts";
    } else if (variable.scopes.includes("LINE_HEIGHT")) {
      targetPath = "lineHeights";
    } else if (variable.scopes.includes("WIDTH_HEIGHT")) {
      targetPath = "spacing";
    }
    // Special cases
    else if (variable.name.includes("family/")) {
      targetPath = "fonts";
    } else {
      throw new Error(
        `Unsupported variable scopes for variable ${
          variable.name
        }: ${variable.scopes.join(", ")}`,
      );
    }

    // Determine if this should be a semantic token:
    // 1. If it has multiple modes (modeName exists), it's semantic
    // 2. If any value is a VARIABLE_ALIAS, it's semantic
    const isSemanticVariable = Object.entries(variable.valuesByMode).some(
      ([modeId, value]) => {
        const modeName = modeIdToNameMap.get(modeId) ?? null;
        const isVariableAlias =
          typeof value === "object" &&
          value !== null &&
          "type" in value &&
          value.type === "VARIABLE_ALIAS";
        return modeName !== null || isVariableAlias;
      },
    );

    const tokenRoot = isSemanticVariable ? "semanticTokens" : "tokens";

    // Clean the variable name for use as a token path
    const cleanedVariableName = cleanVariableName(variable.name);

    // Process each mode/value
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const modeName = modeIdToNameMap.get(modeId) ?? null;

      const isVariableAlias =
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "VARIABLE_ALIAS";

      // Convert value to PandaCSS format
      let tokenValue: string | number;

      if (isVariableAlias) {
        const aliasVarName =
          varIdToVarMap.get(value.id) ?? `unknown-${value.id}`;
        tokenValue = `{${aliasVarName}}`;
      } else if (
        typeof value === "object" &&
        value !== null &&
        "r" in value &&
        "g" in value &&
        "b" in value
      ) {
        // Convert RGB color to hex
        const r = Math.round(value.r * 255);
        const g = Math.round(value.g * 255);
        const b = Math.round(value.b * 255);
        tokenValue = `#${r.toString(16).padStart(2, "0")}${g
          .toString(16)
          .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      } else {
        tokenValue = value as string | number;
      }

      if (isSemanticVariable) {
        // For semantic tokens, use the mode-based structure
        const modeKey =
          modeName === null || modeName === "Light"
            ? "base"
            : modeName === "Dark"
              ? "_dark"
              : modeName.toLowerCase();

        setWith(
          output,
          `theme.${tokenRoot}.${targetPath}.${cleanedVariableName}.value.${modeKey}`,
          tokenValue,
          Object, // Use Object as customizer to prevent array creation
        );

        console.log(
          `  [${modeName ?? "Default"}] ${modeKey}: ${JSON.stringify(
            tokenValue,
          )}`,
        );
      } else {
        // For regular tokens, use simple value
        setWith(
          output,
          `theme.${tokenRoot}.${targetPath}.${cleanedVariableName}.value`,
          tokenValue,
          Object, // Use Object as customizer to prevent array creation
        );
        console.log(`  Value: ${JSON.stringify(tokenValue)}`);
      }
    }
  }

  return output;
}

const output = toPanda(variablesJson);
console.log("Transformed PandaCSS Preset:", JSON.stringify(output, null, 2));

// Write to file
import { writeFileSync } from "fs";
writeFileSync(
  "./src/panda.generated.ts",
  `import { definePreset } from "@pandacss/dev";

export default definePreset(${JSON.stringify(output, null, 2)});
`,
);
