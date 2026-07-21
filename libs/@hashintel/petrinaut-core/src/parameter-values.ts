import type { Parameter } from "./types/sdcpn";

/**
 * A type-safe representation of parameter values that can be used in the simulation.
 */
export type DefaultParameterValues = Record<string, number | boolean>;

export function getParameterValueError(
  type: Parameter["type"],
  value: string,
): string | null {
  if (type === "boolean") {
    return value === "true" || value === "false"
      ? null
      : 'must be "true" or "false"';
  }

  if (value.trim() === "") {
    return type === "integer"
      ? "must be an integer"
      : "must be a finite number";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return type === "integer"
      ? "must be an integer"
      : "must be a finite number";
  }
  if (type === "integer" && !Number.isInteger(numericValue)) {
    return "must be an integer";
  }
  return null;
}

export function parseParameterValue(
  parameter: Pick<Parameter, "type" | "variableName">,
  value: string,
): number | boolean {
  const error = getParameterValueError(parameter.type, value);
  if (error) {
    const prefix =
      parameter.type === "boolean" ? "Boolean parameter" : "Parameter";
    throw new Error(`${prefix} "${parameter.variableName}" ${error}`);
  }

  return parameter.type === "boolean" ? value === "true" : Number(value);
}

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
    parameterValues[param.variableName] = parseParameterValue(
      param,
      param.defaultValue,
    );
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
  parameters: readonly Parameter[] = [],
): DefaultParameterValues {
  const merged: DefaultParameterValues = { ...defaultValues };
  const parameterTypes = new Map(
    parameters.map((parameter) => [parameter.variableName, parameter.type]),
  );

  // Override with SimulationStore values where they exist
  for (const [key, value] of Object.entries(simulationStoreValues)) {
    if (value !== "") {
      const defaultValue = defaultValues[key];
      const type =
        parameterTypes.get(key) ??
        (typeof defaultValue === "boolean" ? "boolean" : "real");
      merged[key] = parseParameterValue({ type, variableName: key }, value);
    }
  }

  return merged;
}

/**
 * Resolves the effective net parameter values for a run: parameter defaults
 * overridden by the run's (string) input values, keyed by variable name. This
 * mirrors how `buildSimulation` derives the parameters bound to dynamics,
 * lambdas and kernels, so metrics reading ambient `parameters.<name>` see the
 * same values. Returns `{}` when the parameters extension is disabled.
 */
export function resolveNetParameterValues(
  parameters: readonly Parameter[],
  inputValues: Record<string, string> = {},
  parametersEnabled = true,
): DefaultParameterValues {
  if (!parametersEnabled) {
    return {};
  }
  return mergeParameterValues(
    inputValues,
    deriveDefaultParameterValues([...parameters]),
    parameters,
  );
}
