import type {
  TokenDataTypes as Panda_TokenDataType,
  Preset,
} from "@pandacss/types";
import setWith from "lodash.setwith";
import variablesJson from "../src/devexport.ts";
import {
  FigmaVariablesExport,
  Variable,
  VariableValueAlias,
  VariableValueColor,
} from "./figma.variables";

// This script maps the Figma variable export JSON to TypeScript types.
// Figma plugin: https://www.figma.com/community/plugin/1491572182178544621/variables-exporter-for-dev-mode
//
// If at some point we get access to the Figma API for variables, mapping will still be necessary,
// so having this script is useful for future-proofing.
//
// The goal is to keep Figma variables as the source of truth for design tokens,
// and progressively enhance them to target in the future some kind of "standard" format.

/**
 * Figma Collections Modes need to be mapped to PandaCSS conditions.
 * See: https://panda-css.com/docs/concepts/conditional-styles#reference
 *
 * No need to map Mode in case of single-mode in Figma collection.
 * Always define a "base" mapping for new modes.
 */
const MODE_TO_CONDITION_MAP: Record<string, string> = {
  // Light/Dark
  Light: "base",
  Dark: "_dark",
};

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

function isVariableAliasValue(
  variableValue: any
): variableValue is VariableValueAlias {
  return (
    typeof variableValue === "object" &&
    variableValue !== null &&
    "type" in variableValue &&
    variableValue.type === "VARIABLE_ALIAS"
  );
}

function isVariableColorValue(
  variableValue: any
): variableValue is VariableValueColor {
  return (
    typeof variableValue === "object" &&
    variableValue !== null &&
    "r" in variableValue &&
    "g" in variableValue &&
    "b" in variableValue
  );
}

/**
 * Determine to which PandaCSS token type the variable belongs
 * based on its type and scopes.
 *
 * This needs to be improved to avoid hardcoding / special cases
 * and handle better all possible variable types and scopes.
 */
function getVariablePandaTokenType(
  variable: Variable
): keyof Panda_TokenDataType {
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
    return "colors";
  } else if (variable.scopes.includes("CORNER_RADIUS")) {
    return "radii";
  } else if (variable.scopes.includes("GAP")) {
    return "spacing";
  } else if (variable.scopes.includes("FONT_SIZE")) {
    return "fontSizes";
  } else if (variable.scopes.includes("FONT_STYLE")) {
    return "fonts";
  } else if (variable.scopes.includes("LINE_HEIGHT")) {
    return "lineHeights";
  } else if (variable.scopes.includes("WIDTH_HEIGHT")) {
    return "spacing";
  }
  // Special cases
  else if (variable.name.includes("family/")) {
    return "fonts";
  } else if (
    variable.name.startsWith("core/md") ||
    variable.name.startsWith("core/sm") ||
    variable.name.startsWith("core/lg") ||
    variable.name.startsWith("core/full") ||
    variable.name.startsWith("core/none")
  ) {
    // core/md, core/sm, core/lg, core/full, core/none have no scope defined in Figma variable scopes
    // But are actually only used for as CORNER_RADIUS references in Figma variables
    return "radii";
  } else {
    throw new Error(
      `Unsupported variable scopes for variable ${
        variable.name
      }: ${variable.scopes.join(", ")}`
    );
  }
}

/**
 * Used in first pass, to extract variable info for second pass.
 *
 * Calculates:
 * - tokenRoot: "tokens" | "semanticTokens"
 * - tokenType: e.g. "colors", "fontSizes", etc.
 * - tokenName: cleaned variable name for reference, e.g. "red.500"
 * - tokenPath: full path for token reference, e.g. "colors.red.500"
 *
 * Allows the second pass to know how to expand a Figma variable ID to the correct PandaCSS token path
 */
function getVariableOutput(variable: Variable) {
  const valuesByModeEntries = Object.entries(variable.valuesByMode);

  // Is semantic if has VARIABLE_ALIAS or multiple modes
  const isSemantic =
    valuesByModeEntries.length > 1 ||
    valuesByModeEntries.some(isVariableAliasValue);

  const tokenRoot = isSemantic ? "semanticTokens" : "tokens";
  const tokenType = getVariablePandaTokenType(variable);
  const tokenName = cleanVariableName(variable.name);
  const tokenPath = `${tokenType}.${tokenName}`;

  return {
    _figmaVariable: variable, // Keep original variable for reference
    name: cleanVariableName(variable.name),
    isSemantic,
    tokenRoot,
    tokenType,
    tokenName,
    tokenPath,
  } as const;
}

function getVariablePandaValue(
  variable: ReturnType<typeof getVariableOutput>,
  modeIdToNameMap: Map<string, string>,
  varIdToVarMap: Map<string, ReturnType<typeof getVariableOutput>>
) {
  const { valuesByMode } = variable._figmaVariable;

  function transformValue(figmaValue: any): string | number {
    if (isVariableColorValue(figmaValue)) {
      // Convert RGB color to hex
      // TODO: Handle alpha channel if needed
      const r = Math.round(figmaValue.r * 255);
      const g = Math.round(figmaValue.g * 255);
      const b = Math.round(figmaValue.b * 255);
      const hexValue = `#${r.toString(16).padStart(2, "0")}${g
        .toString(16)
        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

      return hexValue;
    } else if (isVariableAliasValue(figmaValue)) {
      // Resolve alias to get token path
      console.log("figmaValue:", figmaValue);
      const aliasVar = varIdToVarMap.get(figmaValue.id);
      if (!aliasVar) {
        throw new Error(
          `Alias variable ID ${figmaValue.id} for variable ${variable.name} not found in varIdToVarMap`
        );
      }
      console.log("aliasVar:", aliasVar);
      return `{${aliasVar.isSemantic ? "semanticTokens." : ""}${
        aliasVar.tokenPath
      }${aliasVar.isSemantic ? ".base" : ""}}`;
    } else {
      // TODO: Add pixels unit if needed
      return figmaValue as string | number;
    }
  }

  if (variable.tokenRoot === "tokens") {
    // If core tokens (not semantic), just return single value
    const figmaValue = Object.values(valuesByMode)[0];

    return { value: transformValue(figmaValue) };
  } else {
    // Semantic tokens with possible multiple modes
    const valuesByModeEntries = Object.entries(valuesByMode);

    // Can be semantic token with single mode (if alias for example)
    const isSingleMode = valuesByModeEntries.length === 1;

    return Object.fromEntries(
      valuesByModeEntries.map(([modeId, figmaValue]) => {
        if (isSingleMode) {
          // If single mode, always return "base"
          return ["base", { value: transformValue(figmaValue) }];
        } else {
          // If multiple modes, need to map mode ID to PandaCSS condition
          const modeName = modeIdToNameMap.get(modeId);

          if (!modeName || !(modeName in MODE_TO_CONDITION_MAP)) {
            throw new Error(
              `Mode ID ${modeId} for variable ${variable.name} has no mapping to PandaCSS condition`
            );
          }

          return [
            MODE_TO_CONDITION_MAP[modeName],
            { value: transformValue(figmaValue) },
          ];
        }
      })
    );
  }
}

/**
 * Determine if variable should be omitted from output.
 * TODO: Discuss with @CiaranH to confirm these exclusions/adapt values
 */
function shouldOmitVariable(variable: Variable): boolean {
  return (
    variable.name === "container" ||
    // variable.scopes.length === 0 ||
    variable.name === "spacing/Number" ||
    variable.name === "weight/normal" ||
    variable.name === "weight/medium" ||
    variable.name === "weight/semibold"
  );
}

/**
 * Transform Figma export to PandaCSS preset
 */
export function toPanda(root: FigmaVariablesExport): Preset {
  const modeIdToNameMap = new Map<string, string>();
  const varIdToVarMap = new Map<string, ReturnType<typeof getVariableOutput>>();

  const output = {
    name: "@hashintel/ds-theme",
    theme: {
      tokens: {},
      semanticTokens: {},
    },
  } satisfies Preset;

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

  //
  // First pass on variables:
  // - Create map id -> variable output
  // - Keep references for second pass
  //
  for (const variable of root.variables) {
    if (shouldOmitVariable(variable)) continue;

    varIdToVarMap.set(variable.id, getVariableOutput(variable));
  }

  //
  // Second pass on variables:
  // - Map to PandaCSS token structure, and resolve references in case of aliases
  //
  for (const [_variableId, transformedVariable] of varIdToVarMap) {
    const pandaValue = getVariablePandaValue(
      transformedVariable,
      modeIdToNameMap,
      varIdToVarMap
    );

    setWith(
      output.theme[transformedVariable.tokenRoot],
      transformedVariable.tokenPath,
      pandaValue,
      Object // Use Object as customizer to prevent array creation (in case of numeric keys)
    );
  }

  return output;
}

const output = toPanda(variablesJson);

// Write to file
import { writeFileSync } from "fs";
writeFileSync(
  "./src/panda.generated.ts",
  `import { definePreset } from "@pandacss/dev";

export default definePreset(${JSON.stringify(output, null, 2)});
`
);
