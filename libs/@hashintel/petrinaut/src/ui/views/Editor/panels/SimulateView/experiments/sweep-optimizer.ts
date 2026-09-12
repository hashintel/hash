/**
 * The optimizer behind a sweep's Parameters card: the study manifest built
 * from the experiment, and the hook that starts, stops and finds the study
 * driving the sweep. The study evaluates its trials through the sweep's own
 * compute (`createOptimization` with `sweep`), so this file only describes
 * the search and reads the record back.
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
import type { OptimizationRecord } from "../../../../../../react/optimizations/context";
import type { Metric, Scenario, SDCPN } from "@hashintel/petrinaut-core";
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
} from "@hashintel/petrinaut-core/optimization";

/** What the Optimize prompt asks for. */
export type SweepOptimizationChoice = {
  metricId: string;
  direction: PetrinautOptimizationDirection;
  /** Optimizer steps: one sweep point each. */
  steps: number;
};

/** The default number of steps the prompt proposes. */
export const SWEEP_OPTIMIZATION_DEFAULT_STEPS = 30;

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

/**
 * The manifest of a study that searches a sweep's swept parameters for the
 * best value of one of its metrics. The swept axes become optimize bindings
 * over the same intervals; every other scenario parameter is fixed at its
 * scenario default, a description only: the sweep's compiled values are what
 * runs. Throws with the schema's message when the experiment cannot be a
 * study (a step budget over the cap, say).
 */
export const buildSweepOptimizationInput = ({
  title,
  definition,
  scenario,
  experiment,
  metric,
  direction,
  steps,
  runsPerStep,
}: {
  title: string;
  definition: SDCPN;
  scenario: Scenario;
  experiment: ExperimentRecord;
  metric: Metric;
  direction: PetrinautOptimizationDirection;
  steps: number;
  /** Runs each point computes before its value is read. */
  runsPerStep: number;
}): PetrinautOptimizationInput => {
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
        value:
          parameter.type === "boolean"
            ? parameter.default !== 0
            : parameter.default,
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
  return petrinautOptimizationInputSchema.parse({
    kind: "petrinaut-optimization",
    version: 1,
    name: `${experiment.name} · ${directionWord(direction)} ${metric.name}`,
    model: {
      title,
      definition: { ...definition, scenarios: [scenario], metrics: [metric] },
    },
    scenario: { id: scenario.id, parameterBindings },
    objective: { metricId: metric.id, direction },
    execution: {
      seed: experiment.seed,
      dt: experiment.dt,
      maxTime: experiment.maxTime,
      seedsPerTrial: runsPerStep,
    },
    study: { trials: steps, sampler: "tpe" },
  });
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
   * the experiment has a saved scenario and at least one metric.
   */
  available: boolean;
  /**
   * The study started from this sweep most recently; null before any. Read
   * for its outcome and its error once `driving` is null.
   */
  study: OptimizationRecord | null;
  /** The step of the study driving the sweep now; null while none does. */
  driving: SweepStepProgress | null;
  /** Starts a study; rejects with the reason when the experiment cannot be one. */
  start: (choice: SweepOptimizationChoice) => Promise<void>;
  /** Stops the driving study; the sweep keeps its last point. */
  stop: () => void;
  /** Removes every study started from this sweep, with the experiment. */
  discard: () => void;
};

/**
 * Runs each step's point computes before the optimizer reads its value: the
 * ladder's first rung, so a step's batch boundary — and with it the seeds —
 * matches a point the user climbs to.
 */
const SWEEP_OPTIMIZATION_RUNS_PER_STEP = EXPERIMENT_RUN_LADDER[0];

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

  const studies = optimizations.filter(
    (optimization) =>
      optimization.origin?.kind === "sweep" &&
      optimization.origin.experimentId === experiment.id,
  );
  const study = studies[0] ?? null;
  const scenario =
    petriNetDefinition.scenarios?.find(
      (candidate) => candidate.id === experiment.scenarioId,
    ) ?? null;
  const available =
    source !== null &&
    isConnectedOptimization(source) &&
    experiment.sweep !== null &&
    scenario !== null &&
    experiment.metricSpecs.length > 0;

  return {
    available,
    study,
    driving:
      study !== null && isOptimizationActive(study)
        ? studyStepProgress(study)
        : null,
    start: async (choice) => {
      if (scenario === null) {
        throw new Error("The experiment's scenario is gone");
      }
      const spec = experiment.metricSpecs.find(
        (candidate) => candidate.id === choice.metricId,
      );
      if (spec === undefined) {
        throw new Error("Pick a metric to optimize");
      }
      const input = buildSweepOptimizationInput({
        title,
        definition: petriNetDefinition,
        scenario,
        experiment,
        metric: sweepOptimizationMetric(spec, petriNetDefinition),
        direction: choice.direction,
        steps: choice.steps,
        runsPerStep: SWEEP_OPTIMIZATION_RUNS_PER_STEP,
      });
      await createOptimization(input, {
        sweep: {
          experimentId: experiment.id,
          axes: experiment.parameterAxes,
          metricId: choice.metricId,
        },
      });
    },
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
