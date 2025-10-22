import type { Preset } from "@pandacss/types";
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

  // First pass on variables: Create map id -> name
  for (const variable of root.variables) {
    varIdToVarMap.set(variable.id, variable.name);
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
        }: ${variable.scopes.join(", ")}`
      );
    }

    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const modeName = modeIdToNameMap.get(modeId) ?? null;

      const isVariableAlias =
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "VARIABLE_ALIAS";

      // Determine if this should be a semantic token:
      // 1. If it has multiple modes (modeName exists), it's semantic
      // 2. If any value is a VARIABLE_ALIAS, it's semantic
      const isSemanticVariable = modeName !== null || isVariableAlias;

      const tokenRoot = isSemanticVariable ? "semanticTokens" : "tokens";

      let displayValue: string;

      if (isVariableAlias) {
        const aliasVarName =
          varIdToVarMap.get(value.id) ?? `unknown-${value.id}`;
        displayValue = `{${aliasVarName}}`;
      } else {
        displayValue = JSON.stringify(value);
      }

      if (modeName === null) {
        console.log(`  [Default] Value: ${displayValue}`);
      } else {
        console.log(`  Mode: ${modeName} => Value: ${displayValue}`);
      }
    }
  }

  return output;
}

const output = toPanda(variablesJson);
console.log("Transformed PandaCSS Preset:", JSON.stringify(output, null, 2));
