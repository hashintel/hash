import type { Parameter } from "./types/sdcpn";

/**
 * A type-safe representation of parameter values that can be used in the simulation.
 */
export type DefaultParameterValues = Record<string, number | boolean>;

/**
 * Pure function to derive default parameter values from a list of parameters.
 * This can be used in non-React contexts or for testing.
 *
 * @param parameters - The list of parameters from the SDCPN definition
 * @returns A record mapping parameter variable names to their default values
 */
export function deriveDefaultParameterValues(
  parameters: Parameter[],
): DefaultParameterValues {
  const parameterValues: DefaultParameterValues = {};

  for (const param of parameters) {
    const value = param.defaultValue;

    if (param.type === "real") {
      parameterValues[param.variableName] = Number.parseFloat(value);
    } else if (param.type === "integer") {
      parameterValues[param.variableName] = Number.parseInt(value, 10);
    } else {
      // boolean
      parameterValues[param.variableName] = value === "true";
    }
  }

  return parameterValues;
}

/**
 * Merges parameter values from SimulationStore with SDCPN defaults.
 * SimulationStore values take precedence, with SDCPN defaults as fallback.
 *
 * @param simulationStoreValues - Parameter values from SimulationStore (as strings)
 * @param defaultValues - Default parameter values from SDCPN definition
 * @returns Merged parameter values with proper type conversion
 */
export function mergeParameterValues(
  simulationStoreValues: Record<string, string>,
  defaultValues: DefaultParameterValues,
): DefaultParameterValues {
  const merged: DefaultParameterValues = { ...defaultValues };

  // Override with SimulationStore values where they exist
  for (const [key, value] of Object.entries(simulationStoreValues)) {
    if (value !== "") {
      const defaultValue = defaultValues[key];
      if (typeof defaultValue === "boolean") {
        if (value !== "true" && value !== "false") {
          throw new Error(
            `Boolean parameter "${key}" must be "true" or "false"`,
          );
        }
        merged[key] = value === "true";
      } else {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          throw new Error(`Parameter "${key}" must be a finite number`);
        }
        merged[key] = numericValue;
      }
    }
  }

  return merged;
}
