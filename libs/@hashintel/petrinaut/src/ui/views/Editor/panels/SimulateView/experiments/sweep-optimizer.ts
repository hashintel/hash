/**
 * The optimizer behind a parameter sweep: the study manifest built from the
 * experiment record, the hook that starts the study with the experiment from
 * the Create Experiment drawer, and the hook that reads the study back for
 * the sweep's Parameters card. The study evaluates its trials through the
 * sweep's own compute (`createOptimization` with `sweep`), so this file only
 * describes the search and reads the record.
 */
import { use } from "react";

import {
  isConnectedOptimization,
  petrinautOptimizationInputSchema,
} from "@hashintel/petrinaut-core/optimization";

import { EXPERIMENT_RUN_LADDER } from "../../../../../../react/experiments/parameter-grid";
import {
  currentTrialNumber,
  isOptimizationActive,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { useOptimizationSource } from "../../../../../../react/optimizations/use-optimization-source";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { directionWord } from "../shared/study-labels";

import type {
  ExperimentMetricSpecInput,
  ExperimentRecord,
} from "../../../../../../react/experiments/context";
import type {
  OptimizationRecord,
  OptimizationsContextValue,
} from "../../../../../../react/optimizations/context";
import type {
  Metric,
  Scenario,
  ScenarioParameter,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
} from "@hashintel/petrinaut-core/optimization";

/** What the Create Experiment drawer's Objective section decides. */
export type SweepObjective = {
  metricId: string;
  direction: PetrinautOptimizationDirection;
  /** Optimizer steps: one sweep point each, 1..PETRINAUT_OPTIMIZATION_MAX_TRIALS. */
  steps: number;
};

/**
 * Runs each step's point computes before the optimizer reads its value: the
 * ladder's first rung, so a step's batch boundary — and with it the seeds —
 * matches a point the user climbs to. Exported for the form's budget
 * pre-check and the story harness.
 */
export const SWEEP_OPTIMIZATION_RUNS_PER_STEP: number =
  EXPERIMENT_RUN_LADDER[0];

/**
 * The experiment metric as the study's objective `Metric`. The study never
 * runs this code — the sweep measures the metric at each point — but the
 * manifest requires a metric with a body, so the body says what is measured:
 * an expression metric's own code, a place count as the metric reads it,
 * and a stub for a transition count, which metric code cannot express.
 */
export const sweepOptimizationMetric = (
  spec: ExperimentMetricSpecInput,
  definition: SDCPN,
): Metric => {
  if (spec.kind === "expression") {
    return { id: spec.id, name: spec.label, code: spec.code };
  }
  if (spec.kind === "placeTokenCountMean") {
    const place = definition.places.find(
      (candidate) => candidate.id === spec.placeId,
    );
    return {
      id: spec.id,
      name: spec.label,
      code:
        place === undefined
          ? "return 0;"
          : `return state.places.${place.name}.count;`,
    };
  }
  return {
    id: spec.id,
    name: spec.label,
    code: "// The sweep measures this transition count at each point.\nreturn 0;",
  };
};

/** What the manifest reads of the experiment: its execution, axes, constraints and the scenario it compiled. */
export type SweepOptimizationExperiment = Pick<
  ExperimentRecord,
  | "name"
  | "seed"
  | "dt"
  | "maxTime"
  | "parameterAxes"
  | "scenarioParameterValues"
  | "constraints"
  | "constraintPolicy"
> & { scenario: Scenario };

/**
 * The manifest of a study searching the experiment's swept axes for the best
 * value of one of its metrics. Bindings come from `experiment.scenario`: an
 * axis is an optimize binding over its interval, every other parameter is
 * fixed at the value the experiment was created with, so the trials' values
 * — which the evaluator judges the experiment's parameter constraints
 * against — match what the sweep simulates. An ad-hoc record's generated
 * scenario has only axes, so every binding is optimize. The experiment's
 * constraints and pass threshold ride the manifest as they are. Throws with
 * the schema's message when the experiment cannot be a study (a step budget
 * over the cap, say).
 */
export const buildSweepOptimizationInput = ({
  title,
  definition,
  experiment,
  metric,
  objective,
  runsPerStep,
}: {
  title: string;
  definition: SDCPN;
  experiment: SweepOptimizationExperiment;
  metric: Metric;
  objective: Pick<SweepObjective, "direction" | "steps">;
  /** Runs each point computes before its value is read. */
  runsPerStep: number;
}): PetrinautOptimizationInput => {
  const { scenario } = experiment;
  const fixedValueFor = (parameter: ScenarioParameter): number | boolean => {
    const value =
      experiment.scenarioParameterValues[parameter.identifier] ??
      parameter.default;
    return parameter.type === "boolean" ? value !== 0 : value;
  };
  const parameterBindings: Record<
    string,
    PetrinautOptimizationParameterBinding
  > = {};
  for (const parameter of scenario.scenarioParameters) {
    const axis = experiment.parameterAxes.find(
      (candidate) => candidate.identifier === parameter.identifier,
    );
    if (axis === undefined) {
      parameterBindings[parameter.identifier] = {
        kind: "fixed",
        value: fixedValueFor(parameter),
      };
    } else if (axis.integer) {
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain: {
          kind: "integer",
          minimum: axis.min,
          maximum: axis.max,
          step: 1,
          scale: "linear",
        },
      };
    } else {
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: axis.min,
          maximum: axis.max,
          scale: "linear",
        },
      };
    }
  }
  const { constraints, constraintPolicy } = experiment;
  return petrinautOptimizationInputSchema.parse({
    kind: "petrinaut-optimization",
    version: 1,
    name: `${experiment.name} · ${directionWord(objective.direction)} ${metric.name}`,
    model: {
      title,
      definition: { ...definition, scenarios: [scenario], metrics: [metric] },
    },
    scenario: { id: scenario.id, parameterBindings },
    objective: { metricId: metric.id, direction: objective.direction },
    ...(constraints.length > 0 ? { constraints } : {}),
    ...(constraints.length > 0 && constraintPolicy ? { constraintPolicy } : {}),
    execution: {
      seed: experiment.seed,
      dt: experiment.dt,
      maxTime: experiment.maxTime,
      seedsPerTrial: runsPerStep,
    },
    study: { trials: objective.steps, sampler: "tpe" },
  });
};

/** What starting a study reads beside the experiment: the net, its title and the optimizations action. */
export type SweepStudyStarter = {
  title: string;
  definition: SDCPN;
  createOptimization: OptimizationsContextValue["createOptimization"];
};

/**
 * Starts the study that drives an experiment's sweep. Calls
 * `createOptimization` with no await before it, so the study record lands in
 * the same flush as whatever the caller does next. Rejects with the reason
 * before any record exists: no scenario, unknown metric, optimizer
 * unavailable or not connected, a schema cap.
 */
export const startSweepStudy = async (
  { title, definition, createOptimization }: SweepStudyStarter,
  experiment: ExperimentRecord,
  objective: SweepObjective,
): Promise<void> => {
  if (experiment.scenario === null) {
    throw new Error("The experiment sweeps nothing");
  }
  const spec = experiment.metricSpecs.find(
    (candidate) => candidate.id === objective.metricId,
  );
  if (spec === undefined) {
    throw new Error("Pick a metric to optimize");
  }
  const input = buildSweepOptimizationInput({
    title,
    definition,
    experiment: { ...experiment, scenario: experiment.scenario },
    metric: sweepOptimizationMetric(spec, definition),
    objective,
    runsPerStep: SWEEP_OPTIMIZATION_RUNS_PER_STEP,
  });
  await createOptimization(input, {
    sweep: {
      experimentId: experiment.id,
      axes: experiment.parameterAxes,
      metricId: objective.metricId,
    },
  });
};

/** {@link startSweepStudy} over the net and the optimizations context. */
export const useStartSweepStudy = (): ((
  experiment: ExperimentRecord,
  objective: SweepObjective,
) => Promise<void>) => {
  const { petriNetDefinition, title } = use(SDCPNContext);
  const { createOptimization } = use(OptimizationsContext);
  return (experiment, objective) =>
    startSweepStudy(
      { title, definition: petriNetDefinition, createOptimization },
      experiment,
      objective,
    );
};

/** The step a driving study is on, of those requested. */
export type SweepStepProgress = { step: number; total: number };

const studyStepProgress = (
  study: Pick<
    OptimizationRecord,
    "completedTrials" | "prunedTrials" | "failedTrials" | "requestedTrials"
  >,
): SweepStepProgress => ({
  step: currentTrialNumber(study),
  total: study.requestedTrials,
});

export type SweepOptimizer = {
  /**
   * The optimizer can run for this sweep: the in-browser optimizer is on,
   * the experiment kept the scenario it compiled and has at least one metric.
   */
  available: boolean;
  /**
   * Every study started from this sweep, oldest first; empty before any. The
   * objective strip draws them end to end.
   */
  studies: readonly OptimizationRecord[];
  /**
   * The study started most recently, `studies.at(-1)`; null before any. Read
   * for its outcome and its error once `driving` is null.
   */
  study: OptimizationRecord | null;
  /** The step of the study driving the sweep now; null while none does. */
  driving: SweepStepProgress | null;
  /** Starts a study; rejects with the reason when the experiment cannot be one. */
  start: (objective: SweepObjective) => Promise<void>;
  /** Stops the driving study; the sweep keeps its last point. */
  stop: () => void;
  /** Removes every study started from this sweep, with the experiment. */
  discard: () => void;
};

export const useSweepOptimizer = (
  experiment: ExperimentRecord,
): SweepOptimizer => {
  const source = useOptimizationSource();
  const { petriNetDefinition, title } = use(SDCPNContext);
  const {
    optimizations,
    createOptimization,
    cancelOptimization,
    removeOptimization,
  } = use(OptimizationsContext);

  // The provider prepends; the strip reads oldest first.
  const studies = optimizations
    .filter(
      (optimization) => optimization.origin.experimentId === experiment.id,
    )
    .toSorted((left, right) => left.createdAt - right.createdAt);
  const study = studies.at(-1) ?? null;
  const available =
    source !== null &&
    isConnectedOptimization(source) &&
    experiment.sweep !== null &&
    experiment.scenario !== null &&
    experiment.metricSpecs.length > 0;

  return {
    available,
    studies,
    study,
    driving:
      study !== null && isOptimizationActive(study)
        ? studyStepProgress(study)
        : null,
    start: (objective) =>
      startSweepStudy(
        { title, definition: petriNetDefinition, createOptimization },
        experiment,
        objective,
      ),
    stop: () => {
      if (study !== null && isOptimizationActive(study)) {
        cancelOptimization(study.id);
      }
    },
    discard: () => {
      for (const record of studies) {
        removeOptimization(record.id);
      }
    },
  };
};
