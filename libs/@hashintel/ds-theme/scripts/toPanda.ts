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
    if (collection.modes.length < 2) continue;

    for (const mode of collection.modes) {
      console.log("Mode:", mode.id, "=>", mode.name);
      modeIdToNameMap.set(mode.id, mode.name);
    }
  }

  // First pass on variables: Create map id -> name
  for (const variable of root.variables) {
    varIdToVarMap.set(variable.id, variable.name);
  }

  // Second pass on variables: Output variables
  for (const variable of root.variables) {
    console.log(`
Variable: ${variable.name} (type: ${variable.type})`);
    console.log(`  Scopes: ${variable.scopes.join(", ")}`);
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const modeName = modeIdToNameMap.get(modeId) ?? null;

      if (modeName === null) {
        console.log(
          `  [Default] Value: ${JSON.stringify(value)} (no mode mapping)`,
        );
      } else {
        console.log(`  Mode: ${modeName} => Value: ${JSON.stringify(value)}`);
      }
    }
  }

  return output;
}

const output = toPanda(variablesJson);
console.log("Transformed PandaCSS Preset:", JSON.stringify(output, null, 2));
