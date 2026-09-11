import { petrinautExperimentRequestSchema } from "@hashintel/petrinaut-core/ai";
import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core/optimization";

import { buildParameterAxis } from "../experiments/parameter-grid";

import type { CreateExperimentInput } from "../experiments/context";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { PetrinautExperimentRequest } from "@hashintel/petrinaut-core/ai";
import type {
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
} from "@hashintel/petrinaut-core/optimization";

export const prepareExperiment = (
  rawRequest: PetrinautExperimentRequest,
  definition: SDCPN,
  title: string,
): {
  request: PetrinautExperimentRequest;
  input: CreateExperimentInput;
  fixedValues: Record<string, number | boolean>;
  optimization: PetrinautOptimizationInput | null;
} => {
  const request = petrinautExperimentRequestSchema.parse(rawRequest);
  const scenario = definition.scenarios?.find(
    (candidate) => candidate.id === request.scenarioId,
  );
  if (!scenario) {
    throw new Error(`Scenario "${request.scenarioId}" does not exist`);
  }
  for (const identifier of Object.keys(request.scenarioParameterValues)) {
    if (
      !scenario.scenarioParameters.some(
        (parameter) => parameter.identifier === identifier,
      )
    ) {
      throw new Error(`Scenario parameter "${identifier}" does not exist`);
    }
  }
  const metricSpecs: CreateExperimentInput["metricSpecs"] =
    request.metricIds.map((id) => {
      const metric = definition.metrics?.find(
        (candidate) => candidate.id === id,
      );
      if (!metric) {
        throw new Error(`Metric "${id}" does not exist`);
      }
      return {
        id: metric.id,
        label: metric.name,
        kind: "expression",
        code: metric.code,
        sampleRuns: "all",
        runOutput: { type: "distribution" },
      };
    });
  const parameterBindings: Record<
    string,
    PetrinautOptimizationParameterBinding
  > = {};
  const scenarioParameterValues: CreateExperimentInput["scenarioParameterValues"] =
    {};
  const fixedValues: Record<string, number | boolean> = {};
  for (const parameter of scenario.scenarioParameters) {
    const selected = request.scenarioParameterValues[parameter.identifier];
    if (selected?.mode === "range") {
      const outcome = buildParameterAxis(parameter, selected);
      if (!outcome.ok) {
        throw new Error(outcome.error);
      }
      scenarioParameterValues[parameter.identifier] = selected;
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain:
          parameter.type === "integer"
            ? {
                kind: "integer",
                minimum: selected.min,
                maximum: selected.max,
                step: 1,
                scale: "linear",
              }
            : {
                kind: "continuous",
                minimum: selected.min,
                maximum: selected.max,
                scale: "linear",
              },
      };
    } else {
      const value =
        selected?.value ??
        (parameter.type === "boolean"
          ? parameter.default !== 0
          : parameter.default);
      if (
        (parameter.type === "boolean" && typeof value !== "boolean") ||
        (parameter.type !== "boolean" && typeof value !== "number") ||
        (parameter.type === "integer" && !Number.isInteger(value)) ||
        (parameter.type === "ratio" &&
          (typeof value !== "number" || value < 0 || value > 1))
      ) {
        throw new Error(
          `Parameter "${parameter.identifier}" requires a ${parameter.type} value`,
        );
      }
      fixedValues[parameter.identifier] = value;
      parameterBindings[parameter.identifier] = { kind: "fixed", value };
      scenarioParameterValues[parameter.identifier] = {
        mode: "fixed",
        value: String(value),
      };
    }
  }
  const input: CreateExperimentInput = {
    name: request.name,
    scenarioId: scenario.id,
    scenarioParameterValues,
    runCount: request.runCount,
    seed: request.seed,
    dt: request.dt,
    maxTime: request.maxTime,
    metricSpecs,
    computeBackend: "cpu",
  };
  const execution = request.execution;
  const optimization =
    execution.mode === "optimize"
      ? petrinautOptimizationInputSchema.parse({
          kind: "petrinaut-optimization",
          version: 1,
          name: request.name,
          model: {
            title,
            definition: {
              ...definition,
              scenarios: [scenario],
              metrics: definition.metrics?.filter(
                (metric) => metric.id === execution.objectiveMetricId,
              ),
            },
          },
          scenario: { id: scenario.id, parameterBindings },
          objective: {
            metricId: execution.objectiveMetricId,
            direction: execution.direction,
          },
          execution: {
            seed: request.seed,
            dt: request.dt,
            maxTime: request.maxTime,
            seedsPerTrial: execution.runsPerStep,
          },
          study: { trials: execution.steps, sampler: "tpe" },
        })
      : null;
  return { request, input, fixedValues, optimization };
};
