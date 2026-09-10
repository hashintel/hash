/**
 * Fixtures for the optimization stories: a real study manifest over the
 * supply-chain example, deterministic fake trials, and the synthetic
 * objective the trials, the selection streams and the remote surface's fake
 * local compute all share — so a step's mark lands on the contour a real
 * study would give. For a connected study, a navigation at a trial's point,
 * the selection stream the provider would publish there, and a clock that
 * lands one step after another.
 */
import { useEffect, useState } from "react";

import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";
import { supplyChainProfit } from "@hashintel/petrinaut-core/examples";

import {
  buildOptimizationSurfaceAxes,
  optimizationAxisPositionFor,
  optimizationBooleanIdentifiers,
  optimizationNavigationKey,
  optimizationNavigationValues,
} from "../../../../../../react/optimizations/surface-grid";

import type {
  DetachedObjectiveRequest,
  ExperimentComputeBackend,
} from "../../../../../../react/experiments/context";
import type { SweepCellSnapshot } from "../../../../../../react/experiments/sweep-session";
import type {
  ConnectedStudyState,
  OptimizationBest,
  OptimizationImportance,
  OptimizationNavigation,
  OptimizationRecord,
  OptimizationsContextValue,
  OptimizationSelectionStream,
  OptimizationStatus,
} from "../../../../../../react/optimizations/context";
import type {
  Constraint,
  MonteCarloUserDefinedMetricFrame,
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

/** The navigation a connected study starts with: every axis at its midpoint, following. */
export function initialNavigation(
  input: PetrinautOptimizationInput,
): OptimizationNavigation {
  return {
    positions: Object.fromEntries(
      buildOptimizationSurfaceAxes(input).map((axis) => [
        axis.identifier,
        Math.round(axis.stepCount / 2),
      ]),
    ),
    booleans: Object.fromEntries(
      optimizationBooleanIdentifiers(input).map((identifier) => [
        identifier,
        false,
      ]),
    ),
    followTrials: true,
  };
}

/** A connected study's local state: idle at the initial navigation unless overridden. */
export function makeConnectedStudyState(
  input: PetrinautOptimizationInput,
  overrides: Partial<ConnectedStudyState> = {},
): ConnectedStudyState {
  return {
    navigation: initialNavigation(input),
    selection: null,
    activity: [],
    inFlight: [],
    resumable: false,
    parallelism: 1,
    computeBackendFallbackReason: null,
    ...overrides,
  };
}

export function makeOptimizationRecord(options: {
  input: PetrinautOptimizationInput;
  trials?: readonly PetrinautOptimizationTrialEvent[];
  best?: OptimizationBest | null;
  status?: OptimizationStatus;
  computeBackend?: ExperimentComputeBackend;
  /** The local state of a connected study; a remote study has none. */
  connected?: ConnectedStudyState | null;
  /** The latest importance estimate the study reported; none by default. */
  importance?: OptimizationImportance | null;
}): OptimizationRecord {
  const {
    input,
    trials = [],
    best = null,
    status = "running",
    computeBackend = "cpu",
    connected = null,
    importance = null,
  } = options;
  return {
    id: "optimization-story-1",
    input,
    createdAt: Date.now() - 90_000,
    origin: null,
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
    importance,
    computeBackend,
    axes: buildOptimizationSurfaceAxes(input),
    connected,
  };
}

/** An optimizations context holding one selected record, with inert actions unless overridden. */
export function makeOptimizationsContextValue(
  optimization: OptimizationRecord,
  overrides: Partial<OptimizationsContextValue> = {},
): OptimizationsContextValue {
  return {
    optimizations: [optimization],
    selectedOptimizationId: optimization.id,
    selectedOptimization: optimization,
    setSelectedOptimizationId: () => {},
    createOptimization: () => Promise.resolve(optimization.id),
    cancelOptimization: () => {},
    pauseOptimization: () => {},
    resumeOptimization: () => Promise.resolve(),
    refineOptimizationBest: () => {},
    removeOptimization: () => {},
    extendOptimization: () => Promise.resolve(),
    setOptimizationNavigation: () => {},
    retryOptimization: () => Promise.resolve(null),
    ...overrides,
  };
}

/** The navigation at a trial's parameters, following steps while running. */
export function navigationAtTrial(
  input: PetrinautOptimizationInput,
  trial: PetrinautOptimizationTrialEvent,
  followTrials = true,
): OptimizationNavigation {
  const positions: Record<string, number> = {};
  for (const axis of buildOptimizationSurfaceAxes(input)) {
    const value = trial.parameters[axis.identifier];
    positions[axis.identifier] =
      typeof value === "number"
        ? optimizationAxisPositionFor(axis, value)
        : Math.round(axis.stepCount / 2);
  }
  const booleans: Record<string, boolean> = {};
  for (const identifier of optimizationBooleanIdentifiers(input)) {
    booleans[identifier] = trial.parameters[identifier] === true;
  }
  return { positions, booleans, followTrials };
}

/** The provider's key for a navigated point. */
export function navigationKey(
  input: PetrinautOptimizationInput,
  navigation: OptimizationNavigation,
): string {
  return optimizationNavigationKey(
    buildOptimizationSurfaceAxes(input),
    optimizationBooleanIdentifiers(input),
    navigation,
  );
}

/**
 * Distribution frames of the objective at one point, streamed up to
 * `frameCount` of the study's time steps: the synthetic profit accrues
 * linearly over the year, spread across `runs` runs with a jitter that
 * shrinks as runs accumulate — so a refinement visibly sharpens the band.
 */
export function makeObjectiveFrames(
  input: PetrinautOptimizationInput,
  values: Readonly<Record<string, number | boolean>>,
  runs: number,
  frameCount = 40,
): MonteCarloUserDefinedMetricFrame[] {
  const metric = input.model.definition.metrics?.[0];
  if (!metric) {
    throw new Error("The study manifest carries no objective metric");
  }
  const final = syntheticObjective(values);
  const { maxTime } = input.execution;
  const frames: MonteCarloUserDefinedMetricFrame[] = [];
  for (let index = 0; index <= frameCount; index++) {
    const fraction = index / frameCount;
    const time = maxTime * fraction;
    const mean = final * fraction;
    const spread = Math.max(1, Math.abs(final) * 0.08 * (0.3 + fraction));
    const binCount = Math.min(9, 2 + Math.floor(Math.sqrt(runs)));
    const bins: (readonly [number, number])[] = [];
    let assigned = 0;
    for (let bin = 0; bin < binCount; bin++) {
      const offset = ((bin - (binCount - 1) / 2) / (binCount - 1)) * 2;
      const weight = Math.exp(-(offset ** 2) * 1.5);
      const frequency =
        bin === binCount - 1
          ? runs - assigned
          : Math.max(0, Math.round((weight * runs) / binCount));
      assigned += frequency;
      if (frequency > 0) {
        bins.push([
          Math.round((mean + offset * spread) * 100) / 100,
          frequency,
        ]);
      }
    }
    frames.push({
      metricId: metric.id,
      label: metric.name,
      outputType: "distribution",
      frameNumber: Math.round(time / input.execution.dt),
      time,
      bins,
      value: null,
      frameValue: null,
      timeValue: null,
      runSampleCount: runs,
      timeSampleCount: runs,
    });
  }
  return frames;
}

/** The selection stream a connected study publishes at a navigated point. */
export function makeSelectionStream(options: {
  input: PetrinautOptimizationInput;
  navigation: OptimizationNavigation;
  /** Set while following that step: the key becomes the trial's. */
  followedTrial?: number;
  runsCompleted: number;
  runTarget?: number | null;
  computing?: boolean;
  frameCount?: number;
  /**
   * How far through the simulated time the frames have streamed, 0..1: the
   * frames stop there, so the running objective reads part-way to its final
   * value. Complete when omitted.
   */
  progress?: number;
  /** Why the point could not compute; the stream then stops at `runsCompleted`. */
  error?: string | null;
  /** Why the ladder stopped short, e.g. "8 runs · cannot beat the best". */
  note?: string | null;
}): OptimizationSelectionStream {
  const {
    input,
    navigation,
    followedTrial,
    runsCompleted,
    runTarget = null,
    computing = false,
    frameCount,
    progress,
    error = null,
    note = null,
  } = options;
  const axes = buildOptimizationSurfaceAxes(input);
  const booleanIdentifiers = optimizationBooleanIdentifiers(input);
  const values = optimizationNavigationValues(
    input,
    axes,
    booleanIdentifiers,
    navigation,
  );
  const frames = makeObjectiveFrames(
    input,
    values,
    Math.max(1, runsCompleted),
    frameCount,
  );
  return {
    key:
      followedTrial === undefined
        ? optimizationNavigationKey(axes, booleanIdentifiers, navigation)
        : `trial:${followedTrial}`,
    metricFrames:
      progress === undefined
        ? frames
        : frames.slice(0, Math.max(1, Math.ceil(frames.length * progress))),
    runsCompleted,
    runTarget,
    computing,
    error,
    note,
  };
}

/**
 * The stories' clock for a study in flight: `landed` steps have reported and
 * the next one is `progress` of the way through its runs. Advances every
 * `tickMs`, `ticksPerStep` ticks per step, until all `steps` have landed.
 */
export function useFakeStudyClock({
  steps,
  ticksPerStep,
  tickMs,
}: {
  steps: number;
  ticksPerStep: number;
  tickMs: number;
}): { landed: number; progress: number } {
  const [tick, setTick] = useState(0);
  const total = steps * ticksPerStep;
  useEffect(() => {
    if (tick >= total) {
      return;
    }
    const timer = setTimeout(() => setTick((previous) => previous + 1), tickMs);
    return () => clearTimeout(timer);
  }, [tick, tickMs, total]);
  return {
    landed: Math.min(steps, Math.floor(tick / ticksPerStep)),
    progress: (tick % ticksPerStep) / ticksPerStep,
  };
}

/** The study the drawer and full-view stories share: three optimized parameters, one on a log scale. */
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
  const identifiers = Object.entries(input.scenario.parameterBindings)
    .filter(([, binding]) => binding.kind === "optimize")
    .map(([identifier]) => identifier);
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

/** The refinement ladder a navigated point climbs in the stories, one rung per 900 ms. */
const REFINEMENT_LADDER = [8, 25, 100];

/** How many steps the paused stories have landed before the pause. */
export const PAUSED_LANDED_STEPS = 12;

/**
 * A connected study for the drawer and full-view stories: while `running`,
 * one step lands every 1.2 s and the navigation follows the next; otherwise
 * the complete study. Picking a point by hand stops following, and the
 * selection stream is faked from the synthetic objective, refining in three
 * batches after every move. Returns the record and the context value the
 * story mounts.
 */
/** Which fake study the connected stories mount. */
export type FakeStudyKind = "base" | "constrained" | "long";

const FAKE_STUDIES: Record<
  FakeStudyKind,
  {
    input: PetrinautOptimizationInput;
    trials: ReturnType<typeof makeTrials>;
  }
> = {
  base: { input: fakeStudyInput, trials: fakeStudyTrials },
  constrained: {
    input: fakeConstrainedStudyInput,
    trials: fakeConstrainedStudyTrials,
  },
  long: { input: fakeLongStudyInput, trials: fakeLongStudyTrials },
};

export function useFakeConnectedStudy({
  running,
  paused = false,
  constrained = false,
  study = constrained ? "constrained" : "base",
  importance = false,
  fallbackReason = null,
  refinementError = null,
}: {
  running: boolean;
  /**
   * The study paused after `PAUSED_LANDED_STEPS` steps: drained, resumable,
   * parked at its best step with nothing computed there.
   */
  paused?: boolean;
  /** Use the study with two constraints and constraint results on its trials. */
  constrained?: boolean;
  /** The fake study to mount; `constrained` picks the constrained one when unset. */
  study?: FakeStudyKind;
  /** Attach the PED-ANOVA estimate the optimizer would report once the study is over. */
  importance?: boolean;
  fallbackReason?: string | null;
  /** Set to have every navigated point fail with this reason instead of refining. */
  refinementError?: string | null;
}): { optimization: OptimizationRecord; value: OptimizationsContextValue } {
  const { input, trials: allTrials } = FAKE_STUDIES[study];
  const clock = useFakeStudyClock({
    steps: running ? allTrials.trials.length : 0,
    ticksPerStep: 8,
    tickMs: 150,
  });
  const landed = running
    ? clock.landed
    : paused
      ? PAUSED_LANDED_STEPS
      : allTrials.trials.length;
  const trials = allTrials.trials.slice(0, landed);
  const inFlight = running ? allTrials.trials[landed] : undefined;
  const best = trials.at(-1)?.best ?? null;

  const [chosen, setChosen] = useState<OptimizationNavigation>(() =>
    navigationAtTrial(input, allTrials.trials[0]!, true),
  );
  // While following, the navigation is wherever the optimizer is evaluating;
  // once every step has landed it holds at the last one. A paused study is
  // parked at its best step, not following, until a control is moved.
  const parkedAtBest = paused && chosen.followTrials;
  const navigation = parkedAtBest
    ? navigationAtTrial(
        input,
        allTrials.trials[best?.trial ?? 0] ?? allTrials.trials[0]!,
        false,
      )
    : chosen.followTrials
      ? navigationAtTrial(input, inFlight ?? allTrials.trials.at(-1)!, true)
      : chosen;
  const key = navigationKey(input, navigation);

  const [refinement, setRefinement] = useState({ key, rung: 0 });
  if (refinement.key !== key) {
    setRefinement({ key, rung: 0 });
  }
  useEffect(() => {
    if (refinement.rung >= REFINEMENT_LADDER.length - 1) {
      return;
    }
    const timer = setTimeout(
      () =>
        setRefinement((previous) =>
          previous.key === key ? { key, rung: previous.rung + 1 } : previous,
        ),
      900,
    );
    return () => clearTimeout(timer);
  }, [key, refinement.rung]);

  const rung = refinement.key === key ? refinement.rung : 0;
  const selection = parkedAtBest
    ? null
    : inFlight && navigation.followTrials
      ? makeSelectionStream({
          input,
          navigation,
          followedTrial: inFlight.trial,
          runsCompleted: 1,
          computing: true,
          progress: clock.progress,
        })
      : refinementError !== null
        ? makeSelectionStream({
            input,
            navigation,
            runsCompleted: 0,
            error: refinementError,
          })
        : makeSelectionStream({
            input,
            navigation,
            runsCompleted: REFINEMENT_LADDER[rung]!,
            runTarget: REFINEMENT_LADDER[rung + 1] ?? null,
            computing: rung < REFINEMENT_LADDER.length - 1,
          });

  const optimization = makeOptimizationRecord({
    input,
    trials,
    best,
    status: inFlight ? "running" : paused ? "paused" : "complete",
    importance: importance && !inFlight ? makeImportance(input, trials) : null,
    connected: makeConnectedStudyState(input, {
      navigation,
      selection,
      resumable: !inFlight,
      computeBackendFallbackReason: fallbackReason,
    }),
  });

  const value = makeOptimizationsContextValue(optimization, {
    setOptimizationNavigation: (_optimizationId, patch) =>
      setChosen({ ...navigation, ...patch }),
  });

  return { optimization, value };
}

/**
 * The remote surface stories' local compute: the same synthetic objective
 * the fake trials used, returned as a single-bin distribution frame after
 * `delayFor` the batch — so the walked contour fills in progressively and
 * the trial rings land on it, at whatever pace the story simulates.
 */
export const makeSyntheticObjectiveSampler =
  (delayFor: (runCount: number) => number) =>
  (request: DetachedObjectiveRequest): Promise<SweepCellSnapshot | null> => {
    const objective = syntheticObjective(request.scenarioParameterValues);
    const frame: MonteCarloUserDefinedMetricFrame = {
      metricId: request.metric.id,
      label: request.metric.label,
      outputType: "distribution",
      frameNumber: 365,
      time: 365,
      bins: [[Math.round(objective * 100) / 100, request.runCount]],
      value: null,
      frameValue: null,
      timeValue: null,
      runSampleCount: request.runCount,
      timeSampleCount: request.runCount,
    };
    return new Promise((resolve) => {
      setTimeout(
        () =>
          resolve({ runsCompleted: request.runCount, metricFrames: [frame] }),
        delayFor(request.runCount),
      );
    });
  };
