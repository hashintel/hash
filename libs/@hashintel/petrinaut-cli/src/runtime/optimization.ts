import { readFile } from "node:fs/promises";

import {
  compileScenario,
  petrinautOptimizationEvaluateParamsSchema,
  petrinautOptimizationManifestSchema,
} from "@hashintel/petrinaut-core";

import type {
  PetrinautOptimizationDescribeParameter,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationEvaluateResult,
  PetrinautOptimizationManifest,
  Scenario,
} from "@hashintel/petrinaut-core";
import type { PetrinautCompiledModel } from "@hashintel/petrinaut-core/compiled-model";

type OptimizationScalar = number | boolean;
type ScenarioParameter = Scenario["scenarioParameters"][number];
type OptimizedBinding = Extract<
  PetrinautOptimizationManifest["scenario"]["parameterBindings"][string],
  { kind: "optimize" }
>;
type OptimizationDomain = OptimizedBinding["domain"];

function formatManifestIssues(
  prefix: string,
  issues: readonly { path: PropertyKey[]; message: string }[],
): Error {
  const details = issues
    .map(
      ({ path, message }) =>
        `${path.length > 0 ? path.join(".") : "manifest"}: ${message}`,
    )
    .join("; ");
  return new Error(`${prefix}: ${details}`);
}

export function parseOptimizationManifest(
  data: unknown,
): PetrinautOptimizationManifest {
  const parsed = petrinautOptimizationManifestSchema.safeParse(data);
  if (!parsed.success) {
    throw formatManifestIssues(
      "Invalid optimization manifest",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

export async function loadOptimizationManifest(
  path: string,
): Promise<PetrinautOptimizationManifest> {
  const text = await readFile(path, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Optimization manifest must be valid JSON");
  }
  return parseOptimizationManifest(data);
}

function describeParameter(
  parameter: ScenarioParameter,
  domain: OptimizationDomain,
): PetrinautOptimizationDescribeParameter {
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
}

function validateSuggestedValue(
  parameter: ScenarioParameter,
  domain: OptimizationDomain,
  value: OptimizationScalar,
): void {
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
}

export type OptimizationProtocol = {
  describe(): PetrinautOptimizationDescribeResult;
  evaluate(params: unknown): PetrinautOptimizationEvaluateResult;
};

export function createOptimizationProtocol(args: {
  manifest: PetrinautOptimizationManifest;
  model: PetrinautCompiledModel;
}): OptimizationProtocol {
  const { manifest, model } = args;
  const scenario = manifest.model.definition.scenarios?.[0];
  const metric = manifest.model.definition.metrics?.[0];
  if (!scenario || !metric) {
    throw new Error(
      "An optimization manifest requires exactly one scenario and one metric",
    );
  }
  const optimizedParameters = scenario.scenarioParameters.flatMap(
    (parameter) => {
      const binding = manifest.scenario.parameterBindings[parameter.identifier];
      return binding?.kind === "optimize"
        ? [{ parameter, domain: binding.domain }]
        : [];
    },
  );
  const optimizedIdentifiers = new Set(
    optimizedParameters.map(({ parameter }) => parameter.identifier),
  );

  return {
    describe() {
      return {
        direction: manifest.objective.direction,
        study: { ...manifest.study, seed: manifest.execution.seed },
        parameters: optimizedParameters.map(({ parameter, domain }) =>
          describeParameter(parameter, domain),
        ),
      };
    },
    evaluate(params) {
      const parsed =
        petrinautOptimizationEvaluateParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw formatManifestIssues(
          "Invalid optimization.evaluate params",
          parsed.error.issues,
        );
      }
      const values = parsed.data.parameterValues;
      for (const { parameter } of optimizedParameters) {
        const { identifier } = parameter;
        if (!Object.hasOwn(values, identifier)) {
          throw new Error(`Missing optimized parameter "${identifier}"`);
        }
      }
      for (const identifier of Object.keys(values)) {
        if (!optimizedIdentifiers.has(identifier)) {
          throw new Error(`Unexpected optimization parameter "${identifier}"`);
        }
      }

      const scenarioParameterValues: Record<string, number> = {};
      for (const parameter of scenario.scenarioParameters) {
        const binding =
          manifest.scenario.parameterBindings[parameter.identifier]!;
        const value =
          binding.kind === "fixed"
            ? binding.value
            : values[parameter.identifier]!;
        if (binding.kind === "optimize") {
          validateSuggestedValue(parameter, binding.domain, value);
        }
        scenarioParameterValues[parameter.identifier] =
          typeof value === "boolean" ? (value ? 1 : 0) : value;
      }

      const compiledScenario = compileScenario(
        scenario,
        manifest.model.definition.parameters,
        manifest.model.definition.places,
        manifest.model.definition.types,
        { scenarioParameterValues },
      );
      if (!compiledScenario.ok) {
        throw new Error(
          `Scenario "${scenario.name}" could not be compiled: ${compiledScenario.errors
            .map(({ message }) => message)
            .join("; ")}`,
        );
      }

      const result = model.run({
        initialMarking: compiledScenario.result.initialState,
        parameterValues: compiledScenario.result.parameterValues,
        metrics: [manifest.objective.metricId],
        seed: manifest.execution.seed,
        dt: manifest.execution.dt,
        maxTime: manifest.execution.maxTime,
      });
      const objective = result.metrics[metric.name];
      if (objective === undefined || !Number.isFinite(objective)) {
        throw new Error(
          `Petrinaut result omitted a finite objective metric "${metric.name}"`,
        );
      }
      return { objective };
    },
  };
}
