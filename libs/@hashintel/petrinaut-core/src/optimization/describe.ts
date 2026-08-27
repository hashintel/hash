/**
 * @layerRoot core.optimization
 * @role Derives an Optuna study description, trial seeds and per-trial scenario parameter values from an optimization manifest, shared by the CLI and the browser runtime
 */
import { deriveRunSeed } from "../simulation/monte-carlo/run-state";

import type {
  OptimizationScalar,
  PetrinautOptimizationDescribeParameter,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationDomain,
  PetrinautOptimizationManifest,
} from "../optimization";
import type { Scenario } from "../types/sdcpn";

type ScenarioParameter = Scenario["scenarioParameters"][number];

type OptimizedParameter = {
  parameter: ScenarioParameter;
  domain: PetrinautOptimizationDomain;
};

export const describeOptimizationParameter = (
  parameter: ScenarioParameter,
  domain: PetrinautOptimizationDomain,
): PetrinautOptimizationDescribeParameter => {
  switch (domain.kind) {
    case "continuous":
      return {
        identifier: parameter.identifier,
        type: "float",
        default: parameter.default,
        minimum: domain.minimum,
        maximum: domain.maximum,
        scale: domain.scale,
      };
    case "integer":
      return {
        identifier: parameter.identifier,
        type: "int",
        default: parameter.default,
        minimum: domain.minimum,
        maximum: domain.maximum,
        step: domain.step,
        scale: domain.scale,
      };
    case "boolean":
      return {
        identifier: parameter.identifier,
        type: "boolean",
        default: parameter.default !== 0,
      };
  }
};

export const validateSuggestedOptimizationValue = (
  parameter: ScenarioParameter,
  domain: PetrinautOptimizationDomain,
  value: OptimizationScalar,
): void => {
  if (domain.kind === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(
        `Optimization parameter "${parameter.identifier}" must be boolean`,
      );
    }
    return;
  }
  if (typeof value !== "number") {
    throw new Error(
      `Optimization parameter "${parameter.identifier}" must be numeric`,
    );
  }
  if (value < domain.minimum || value > domain.maximum) {
    throw new Error(
      `Optimization parameter "${parameter.identifier}" must be between ${domain.minimum} and ${domain.maximum}`,
    );
  }
  if (domain.kind === "integer") {
    if (!Number.isInteger(value)) {
      throw new Error(
        `Optimization parameter "${parameter.identifier}" must be an integer`,
      );
    }
    if ((value - domain.minimum) % domain.step !== 0) {
      throw new Error(
        `Optimization parameter "${parameter.identifier}" must align with step ${domain.step} from ${domain.minimum}`,
      );
    }
  }
};

/**
 * Derives one trial's run seeds. Run 0 keeps the base seed, so a single-seed
 * trial matches a plain seeded run; later runs use the Monte Carlo derivation.
 * Every trial gets the same sequence: common random numbers.
 */
export const deriveOptimizationTrialSeeds = (
  baseSeed: number,
  seedsPerTrial: number,
): number[] =>
  Array.from({ length: seedsPerTrial }, (_, index) =>
    index === 0 ? baseSeed : deriveRunSeed(baseSeed, index),
  );

const getOptimizationScenario = (
  manifest: PetrinautOptimizationManifest,
): Scenario => {
  const scenario = manifest.model.definition.scenarios?.[0];
  const metric = manifest.model.definition.metrics?.[0];
  if (!scenario || !metric) {
    throw new Error(
      "An optimization manifest requires exactly one scenario and one metric",
    );
  }
  return scenario;
};

const listOptimizedParameters = (
  manifest: PetrinautOptimizationManifest,
  scenario: Scenario,
): OptimizedParameter[] =>
  scenario.scenarioParameters.flatMap((parameter) => {
    const binding = manifest.scenario.parameterBindings[parameter.identifier];
    return binding?.kind === "optimize"
      ? [{ parameter, domain: binding.domain }]
      : [];
  });

export const describeOptimization = (
  manifest: PetrinautOptimizationManifest,
): PetrinautOptimizationDescribeResult => {
  const scenario = getOptimizationScenario(manifest);
  return {
    direction: manifest.objective.direction,
    study: {
      ...manifest.study,
      seed: manifest.execution.seed,
      seedsPerTrial: manifest.execution.seedsPerTrial ?? 1,
    },
    parameters: listOptimizedParameters(manifest, scenario).map(
      ({ parameter, domain }) =>
        describeOptimizationParameter(parameter, domain),
    ),
    // Verbatim pass-through: protocol clients (the Python binding) evaluate
    // the embedded constraint HIR themselves.
    ...(manifest.constraints ? { constraints: manifest.constraints } : {}),
  };
};

/**
 * Every scenario parameter's value for one trial: the fixed bindings merged
 * with the validated suggestions, booleans as 0/1 as the scenario compiler
 * expects. Throws when a suggestion is missing, unexpected or off-domain.
 */
export const resolveTrialScenarioParameterValues = (
  manifest: PetrinautOptimizationManifest,
  suggestedValues: Readonly<Record<string, OptimizationScalar>>,
): Record<string, number> => {
  const scenario = getOptimizationScenario(manifest);
  const optimizedParameters = listOptimizedParameters(manifest, scenario);
  const optimizedIdentifiers = new Set(
    optimizedParameters.map(({ parameter }) => parameter.identifier),
  );
  for (const { parameter } of optimizedParameters) {
    if (!Object.hasOwn(suggestedValues, parameter.identifier)) {
      throw new Error(`Missing optimized parameter "${parameter.identifier}"`);
    }
  }
  for (const identifier of Object.keys(suggestedValues)) {
    if (!optimizedIdentifiers.has(identifier)) {
      throw new Error(`Unexpected optimization parameter "${identifier}"`);
    }
  }

  const scenarioParameterValues: Record<string, number> = {};
  for (const parameter of scenario.scenarioParameters) {
    const binding = manifest.scenario.parameterBindings[parameter.identifier];
    if (!binding) {
      throw new Error(
        `Scenario parameter "${parameter.identifier}" has no binding`,
      );
    }
    const value =
      binding.kind === "fixed"
        ? binding.value
        : suggestedValues[parameter.identifier]!;
    if (binding.kind === "optimize") {
      validateSuggestedOptimizationValue(parameter, binding.domain, value);
    }
    scenarioParameterValues[parameter.identifier] =
      typeof value === "boolean" ? (value ? 1 : 0) : value;
  }
  return scenarioParameterValues;
};
