/**
 * Fixtures for the optimization stories: a real study manifest over the
 * supply-chain example, deterministic fake trials, and the synthetic
 * objective both the trials and the stories' fake local compute share — so
 * trial rings land on the contour they would on a real study.
 */
import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";
import { supplyChainProfit } from "@hashintel/petrinaut-core/examples";

import type {
  OptimizationBest,
  OptimizationRecord,
  OptimizationStatus,
} from "../../../../../../react/optimizations/context";
import type {
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";

/**
 * A smooth profit-like surface over the supply-chain scenario's parameters:
 * a bump around production_rate ≈ 250 and selling_price ≈ 42, diminishing
 * returns on marketing_spend, and a penalty for batch sizes away from 400.
 * Parameters the study fixes contribute their fixed values.
 */
export function syntheticObjective(
  values: Readonly<Record<string, number | boolean>>,
): number {
  const number = (identifier: string, fallback: number): number => {
    const value = values[identifier];
    return typeof value === "number" ? value : fallback;
  };
  const productionRate = number("production_rate", 125);
  const sellingPrice = number("selling_price", 37);
  const marketingSpend = number("marketing_spend", 32);
  const batchSize = number("batch_size", 220);
  return (
    1_000 *
      Math.exp(
        -(((productionRate - 250) / 120) ** 2) -
          ((sellingPrice - 42) / 15) ** 2,
      ) +
    40 * Math.log(Math.max(marketingSpend, 1)) -
    Math.abs(batchSize - 400) / 10
  );
}

/** Identifiers the base study optimizes; everything else stays fixed. */
const BASE_OPTIMIZED: Record<string, PetrinautOptimizationParameterBinding> = {
  production_rate: {
    kind: "optimize",
    domain: { kind: "continuous", minimum: 50, maximum: 400, scale: "linear" },
  },
  selling_price: {
    kind: "optimize",
    domain: { kind: "continuous", minimum: 20, maximum: 60, scale: "linear" },
  },
};

const LOG_SCALE_OPTIMIZED: Record<
  string,
  PetrinautOptimizationParameterBinding
> = {
  ...BASE_OPTIMIZED,
  marketing_spend: {
    kind: "optimize",
    domain: { kind: "continuous", minimum: 1, maximum: 100, scale: "log" },
  },
};

const MANY_PARAMETERS_OPTIMIZED: Record<
  string,
  PetrinautOptimizationParameterBinding
> = {
  ...LOG_SCALE_OPTIMIZED,
  batch_size: {
    kind: "optimize",
    domain: {
      kind: "integer",
      minimum: 100,
      maximum: 1_000,
      step: 50,
      scale: "linear",
    },
  },
};

export const optimizedBindingSets = {
  base: BASE_OPTIMIZED,
  logScale: LOG_SCALE_OPTIMIZED,
  manyParameters: MANY_PARAMETERS_OPTIMIZED,
} as const;

/**
 * A validated study manifest over the supply-chain profit example, maximizing
 * `metric_profit`. `optimized` names the parameters Optuna may move; every
 * other scenario parameter is bound to its scenario default.
 */
export function makeOptimizationInput(
  optimized: Record<string, PetrinautOptimizationParameterBinding>,
): PetrinautOptimizationInput {
  const definition = supplyChainProfit.petriNetDefinition;
  const scenario = definition.scenarios?.find(
    (candidate) => candidate.id === "scenario_supply_chain_with_stock",
  );
  if (!scenario) {
    throw new Error("Supply-chain example lost its stocked scenario");
  }
  const parameterBindings: Record<
    string,
    PetrinautOptimizationParameterBinding
  > = {};
  for (const parameter of scenario.scenarioParameters) {
    parameterBindings[parameter.identifier] = optimized[
      parameter.identifier
    ] ?? { kind: "fixed", value: parameter.default };
  }
  return petrinautOptimizationInputSchema.parse({
    kind: "petrinaut-optimization",
    version: 1,
    name: "Maximize profit",
    model: {
      title: supplyChainProfit.title,
      // The manifest requires the objective to be the snapshot's sole metric.
      definition: {
        ...definition,
        scenarios: [scenario],
        metrics: definition.metrics?.filter(
          (metric) => metric.id === "metric_profit",
        ),
      },
    },
    scenario: { id: scenario.id, parameterBindings },
    objective: { metricId: "metric_profit", direction: "maximize" },
    execution: { seed: 1_234, dt: 1, maxTime: 365 },
    study: { trials: 30, sampler: "tpe" },
  });
}

/** A deterministic pseudo-random fraction in [0, 1) per (trial, axis). */
function trialFraction(trial: number, axisIndex: number): number {
  const raw = Math.sin((trial + 1) * 127.1 + (axisIndex + 1) * 311.7) * 43_758;
  return raw - Math.floor(raw);
}

/**
 * Deterministic fake trials for `input`: parameters drawn inside each
 * optimized domain, objectives from `syntheticObjective`, and the running
 * best threaded through the events the way the optimizer streams it.
 */
export function makeTrials(
  input: PetrinautOptimizationInput,
  count: number,
): {
  trials: PetrinautOptimizationTrialEvent[];
  best: OptimizationBest | null;
} {
  const optimizedEntries = Object.entries(
    input.scenario.parameterBindings,
  ).filter(
    (
      entry,
    ): entry is [
      string,
      Extract<PetrinautOptimizationParameterBinding, { kind: "optimize" }>,
    ] => entry[1].kind === "optimize",
  );
  const fixedValues: Record<string, number | boolean> = {};
  for (const [identifier, binding] of Object.entries(
    input.scenario.parameterBindings,
  )) {
    if (binding.kind === "fixed") {
      fixedValues[identifier] = binding.value;
    }
  }

  const trials: PetrinautOptimizationTrialEvent[] = [];
  let best: OptimizationBest | null = null;
  for (let trial = 0; trial < count; trial++) {
    const parameters: Record<string, number | boolean> = {};
    for (const [
      axisIndex,
      [identifier, binding],
    ] of optimizedEntries.entries()) {
      const fraction = trialFraction(trial, axisIndex);
      const domain = binding.domain;
      if (domain.kind === "boolean") {
        parameters[identifier] = fraction >= 0.5;
      } else if (domain.kind === "integer") {
        const slots = Math.floor(
          (domain.maximum - domain.minimum) / domain.step,
        );
        parameters[identifier] =
          domain.minimum + Math.round(fraction * slots) * domain.step;
      } else if (domain.scale === "log") {
        parameters[identifier] = Math.exp(
          Math.log(domain.minimum) +
            (Math.log(domain.maximum) - Math.log(domain.minimum)) * fraction,
        );
      } else {
        parameters[identifier] =
          domain.minimum + (domain.maximum - domain.minimum) * fraction;
      }
    }
    // Every ninth trial is pruned, so the stories show the mixed states a
    // real study produces.
    const state = trial % 9 === 8 ? ("pruned" as const) : ("complete" as const);
    const objective =
      state === "complete"
        ? syntheticObjective({ ...fixedValues, ...parameters })
        : null;
    if (objective !== null && (best === null || objective > best.objective)) {
      best = { trial, parameters, objective };
    }
    trials.push({
      type: "trial",
      trial,
      parameters,
      objective,
      state,
      best,
      seq: trial + 2,
    });
  }
  return { trials, best };
}

export function makeOptimizationRecord(options: {
  input: PetrinautOptimizationInput;
  trials?: readonly PetrinautOptimizationTrialEvent[];
  best?: OptimizationBest | null;
  status?: OptimizationStatus;
}): OptimizationRecord {
  const { input, trials = [], best = null, status = "running" } = options;
  return {
    id: "optimization-story-1",
    input,
    createdAt: Date.now() - 90_000,
    status,
    error: null,
    errorCategory: null,
    errorDiagnostics: null,
    runId: "story-run-1",
    lastSeq: trials.at(-1)?.seq ?? 1,
    connectionState: status === "running" ? "streaming" : null,
    requestedTrials: input.study.trials,
    completedTrials: trials.filter((trial) => trial.state === "complete")
      .length,
    prunedTrials: trials.filter((trial) => trial.state === "pruned").length,
    failedTrials: trials.filter((trial) => trial.state === "failed").length,
    trials,
    best,
  };
}
