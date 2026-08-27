import { readFile } from "node:fs/promises";

import {
  compileScenario,
  deriveRunSeed,
  petrinautOptimizationEvaluateParamsSchema,
  petrinautOptimizationManifestSchema,
} from "@hashintel/petrinaut-core";
import { lowerScenarioToHir } from "@hashintel/petrinaut-core/hir";

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
  evaluate(params: unknown): Promise<PetrinautOptimizationEvaluateResult>;
};

/**
 * Derives one trial's run seeds. Run 0 keeps the base seed, so a single-seed
 * trial matches the old fixed-seed behaviour; later runs use the Monte Carlo
 * derivation. Every trial gets the same sequence: common random numbers.
 */
export function deriveTrialSeeds(
  baseSeed: number,
  seedsPerTrial: number,
): number[] {
  return Array.from({ length: seedsPerTrial }, (_, index) =>
    index === 0 ? baseSeed : deriveRunSeed(baseSeed, index),
  );
}

export function createOptimizationProtocol(args: {
  manifest: PetrinautOptimizationManifest;
  model: PetrinautCompiledModel;
}): OptimizationProtocol {
  const { manifest, model } = args;
  const seedsPerTrial = manifest.execution.seedsPerTrial ?? 1;
  const trialSeeds = deriveTrialSeeds(manifest.execution.seed, seedsPerTrial);
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

  // Lower the scenario's expressions once per study; each trial re-runs only
  // the type-check and the interpreter with that trial's parameter values.
  const definition = manifest.model.definition;
  const scenarioHir = lowerScenarioToHir(scenario, {
    adHocContext: {
      netParameters: definition.parameters,
      places: definition.places,
      types: definition.types,
    },
  });

  return {
    describe() {
      return {
        direction: manifest.objective.direction,
        study: {
          ...manifest.study,
          seed: manifest.execution.seed,
          seedsPerTrial,
        },
        parameters: optimizedParameters.map(({ parameter, domain }) =>
          describeParameter(parameter, domain),
        ),
        // Verbatim pass-through: protocol clients (the Python binding)
        // evaluate the embedded HIR themselves.
        ...(manifest.constraints ? { constraints: manifest.constraints } : {}),
      };
    },
    async evaluate(params) {
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
        scenarioHir,
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

      // Sequential seeded runs: each replicate is validated as it lands, so a
      // bad objective fails the trial before the remaining seeds run.
      // Parallelising is deferred to the shared experiment-backend interface.
      const replicates = trialSeeds.map((seed) => {
        const result = model.run({
          initialMarking: compiledScenario.result.initialState,
          parameterValues: compiledScenario.result.parameterValues,
          metrics: [manifest.objective.metricId],
          seed,
          dt: manifest.execution.dt,
          maxTime: manifest.execution.maxTime,
        });
        const value = result.metrics[metric.name];
        if (value === undefined || !Number.isFinite(value)) {
          throw new Error(
            `Petrinaut result omitted a finite objective metric "${metric.name}" for seed ${seed}`,
          );
        }
        return { seed, objective: value };
      });
      // Online mean: summing the objectives first could overflow to Infinity
      // even when each one is finite.
      const objective = replicates.reduce(
        (mean, replicate, index) =>
          mean + (replicate.objective - mean) / (index + 1),
        0,
      );
      // A non-finite mean would serialize as null on the wire; fail loudly.
      if (!Number.isFinite(objective)) {
        throw new Error(
          `The mean of the objective metric "${metric.name}" is not finite`,
        );
      }
      return seedsPerTrial > 1 ? { objective, replicates } : { objective };
    },
  };
}
