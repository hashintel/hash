/**
 * Fixtures for the study displays in the experiment drawer's stories and
 * tests: a real study manifest over the supply-chain example, deterministic
 * fake trials with the synthetic objective they share, the constrained
 * variant with its verdicts, and the importance estimate the optimizer would
 * report.
 */
import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";
import { supplyChainProfit } from "@hashintel/petrinaut-core/examples";

import { partitionParameterBindings } from "../../../../../../react/optimizations/parameter-bindings";

import type {
  OptimizationBest,
  OptimizationImportance,
  OptimizationRecord,
  OptimizationsContextValue,
  OptimizationStatus,
} from "../../../../../../react/optimizations/context";
import type {
  Constraint,
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";
import type { HirExpr } from "@hashintel/petrinaut-core/hir";

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
  { trials = 30 }: { trials?: number } = {},
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
    study: { trials, sampler: "tpe" },
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
  const { fixed: fixedValues, optimized } = partitionParameterBindings(input);
  const optimizedEntries = Object.entries(optimized);

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

/** A study driving the sweep experiment the stories mount, `experiment-1` unless overridden. */
export function makeOptimizationRecord(options: {
  input: PetrinautOptimizationInput;
  trials?: readonly PetrinautOptimizationTrialEvent[];
  best?: OptimizationBest | null;
  status?: OptimizationStatus;
  /** The latest importance estimate the study reported; none by default. */
  importance?: OptimizationImportance | null;
  experimentId?: string;
}): OptimizationRecord {
  const {
    input,
    trials = [],
    best = null,
    status = "running",
    importance = null,
    experimentId = "experiment-1",
  } = options;
  return {
    id: "optimization-story-1",
    input,
    createdAt: Date.now() - 90_000,
    origin: { kind: "sweep", experimentId },
    status,
    error: null,
    runId: "story-run-1",
    lastSeq: trials.at(-1)?.seq ?? 1,
    requestedTrials: input.study.trials,
    completedTrials: trials.filter((trial) => trial.state === "complete")
      .length,
    prunedTrials: trials.filter((trial) => trial.state === "pruned").length,
    failedTrials: trials.filter((trial) => trial.state === "failed").length,
    trials,
    best,
    importance,
  };
}

/** An optimizations context holding one record, with inert actions unless overridden. */
export function makeOptimizationsContextValue(
  optimization: OptimizationRecord,
  overrides: Partial<OptimizationsContextValue> = {},
): OptimizationsContextValue {
  return {
    optimizations: [optimization],
    createOptimization: () => Promise.resolve(optimization.id),
    cancelOptimization: () => {},
    removeOptimization: () => {},
    ...overrides,
  };
}

/** The study the drawer stories share: three optimized parameters, one on a log scale. */
export const fakeStudyInput = makeOptimizationInput(
  optimizedBindingSets.logScale,
);
export const fakeStudyTrials = makeTrials(fakeStudyInput, 30);

/** The same study asked for 60 steps: past the 50-step importance floor once it lands. */
export const fakeLongStudyInput = makeOptimizationInput(
  optimizedBindingSets.logScale,
  { trials: 60 },
);
export const fakeLongStudyTrials = makeTrials(fakeLongStudyInput, 60);

/** The study the results model and drawer tests share: the base bindings, five steps landed. */
export const fakeShortStudyInput = makeOptimizationInput(
  optimizedBindingSets.base,
);
export const fakeShortStudyTrials = makeTrials(fakeShortStudyInput, 5);

/**
 * How much of the synthetic objective's variance each parameter moves, by
 * hand: the bump over production rate and selling price dominates, marketing
 * spend's logarithm adds little, and a batch size only shifts a penalty.
 */
const SYNTHETIC_IMPORTANCE_WEIGHTS: Record<string, number> = {
  production_rate: 0.55,
  selling_price: 0.32,
  marketing_spend: 0.09,
  batch_size: 0.04,
};

/**
 * The PED-ANOVA block the optimizer would attach after `trials` landed:
 * shares over the study's optimized parameters, normalised to sum to 1,
 * fitted on the completed steps among them.
 */
export function makeImportance(
  input: PetrinautOptimizationInput,
  trials: readonly PetrinautOptimizationTrialEvent[],
): OptimizationImportance {
  const identifiers = Object.keys(partitionParameterBindings(input).optimized);
  const total = identifiers.reduce(
    (sum, identifier) =>
      sum + (SYNTHETIC_IMPORTANCE_WEIGHTS[identifier] ?? 0.05),
    0,
  );
  return {
    values: Object.fromEntries(
      identifiers.map((identifier) => [
        identifier,
        (SYNTHETIC_IMPORTANCE_WEIGHTS[identifier] ?? 0.05) / total,
      ]),
    ),
    completedTrials: Math.max(
      1,
      trials.filter((trial) => trial.state === "complete").length,
    ),
  };
}

const hirSpan = { start: 0, length: 0 };
const hirNumber = (id: number, value: number): HirExpr => ({
  kind: "numberLit",
  id,
  span: hirSpan,
  value,
  raw: String(value),
});
const hirField = (id: number, target: HirExpr, field: string): HirExpr => ({
  kind: "fieldAccess",
  id,
  span: hirSpan,
  target,
  field,
  fieldSpan: hirSpan,
});

/** The rate cap the stories' parameter constraint imposes on `production_rate`. */
export const FAKE_RATE_CAP = 320;
/** The runs each step of the constrained study runs; the state rates are fractions of it. */
export const FAKE_CONSTRAINED_RUNS = 60;

/**
 * The stories' two constraints, hand-lowered so the fixtures need no
 * TypeScript compiler: `scenario.production_rate <= 320` over the parameter
 * space, and `return state.places.FinishedGoods.count <= 500;` over the
 * state.
 */
export const fakeStudyConstraints: Constraint[] = [
  {
    space: "parameters",
    id: "rate-cap",
    name: "Production rate under 320",
    code: `scenario.production_rate <= ${FAKE_RATE_CAP}`,
    hir: {
      hirVersion: 1,
      surface: "scenario-expression",
      params: [],
      span: hirSpan,
      body: {
        kind: "binary",
        id: 0,
        span: hirSpan,
        op: "<=",
        left: {
          kind: "scenarioRef",
          id: 1,
          span: hirSpan,
          name: "production_rate",
        },
        right: hirNumber(2, FAKE_RATE_CAP),
      },
    },
  },
  {
    space: "state",
    id: "stock-cap",
    name: "Finished goods under 500",
    code: "return state.places.FinishedGoods.count <= 500;",
    hir: {
      hirVersion: 1,
      surface: "metric",
      params: [{ name: "state", span: hirSpan }],
      span: hirSpan,
      body: {
        kind: "binary",
        id: 0,
        span: hirSpan,
        op: "<=",
        left: hirField(
          1,
          hirField(
            2,
            hirField(
              3,
              { kind: "localRef", id: 4, span: hirSpan, name: "state" },
              "places",
            ),
            "FinishedGoods",
          ),
          "count",
        ),
        right: hirNumber(5, 500),
      },
    },
  },
];

/** The shared study with both constraints declared and sixty runs per step. */
export const fakeConstrainedStudyInput: PetrinautOptimizationInput =
  petrinautOptimizationInputSchema.parse({
    ...fakeStudyInput,
    constraints: fakeStudyConstraints,
    execution: {
      ...fakeStudyInput.execution,
      seedsPerTrial: FAKE_CONSTRAINED_RUNS,
    },
  });

/**
 * The shared trials with constraint results: a draw over the rate cap is
 * pruned as infeasible before it runs, every third simulated step holds the
 * stock cap on 50 of its 60 runs (limited at the default threshold), the
 * rest on 58 or more. The running best skips the infeasible draws.
 */
export function makeConstrainedTrials(
  input: PetrinautOptimizationInput,
  count: number,
): {
  trials: PetrinautOptimizationTrialEvent[];
  best: OptimizationBest | null;
} {
  const trials: PetrinautOptimizationTrialEvent[] = [];
  let best: OptimizationBest | null = null;
  for (const trial of makeTrials(input, count).trials) {
    const rate = trial.parameters.production_rate;
    const margin =
      typeof rate === "number" ? FAKE_RATE_CAP - rate : FAKE_RATE_CAP;
    const parameters = [{ constraintId: "rate-cap", margin }];
    if (margin < 0) {
      trials.push({
        ...trial,
        objective: null,
        state: "pruned",
        best,
        constraints: { parameters, state: [], infeasible: "rate-cap" },
      });
      continue;
    }
    if (
      trial.objective !== null &&
      (best === null || trial.objective > best.objective)
    ) {
      best = {
        trial: trial.trial,
        parameters: trial.parameters,
        objective: trial.objective,
      };
    }
    const runsPassed =
      trial.trial % 3 === 2
        ? 50
        : FAKE_CONSTRAINED_RUNS - (trial.trial % 2 === 0 ? 0 : 2);
    trials.push({
      ...trial,
      best,
      constraints: {
        parameters,
        state:
          trial.state === "complete"
            ? [
                {
                  constraintId: "stock-cap",
                  runsPassed,
                  runsTotal: FAKE_CONSTRAINED_RUNS,
                },
              ]
            : [],
      },
    });
  }
  return { trials, best };
}

export const fakeConstrainedStudyTrials = makeConstrainedTrials(
  fakeConstrainedStudyInput,
  30,
);
