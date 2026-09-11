/**
 * @layerRoot react.optimizations.channel
 * @role Evaluates optimizer trials as detached objective runs on the experiments backend
 */
import { resolveTrialScenarioBindings } from "@hashintel/petrinaut-core/optimization";

import { errorMessage } from "../../experiments/shared/error-message";
import { constraintNameIn } from "../constraint-rates";
import {
  hasParameterConstraints,
  type ParameterConstraintOutcome,
  parameterConstraintOutcome,
  stateConstraintMetrics,
  stateConstraintResults,
} from "../shared/parameter-constraints";
import { prunedTrialOutcome } from "../shared/pruned-trial-outcome";
import { trialOutcome } from "./create-optimization-channel/trial-outcome";

import type {
  DetachedObjectiveAuxiliaryMetric,
  DetachedObjectiveRun,
  DetachedObjectiveRunOutcome,
  ExperimentComputeBackend,
  ExperimentsActionsValue,
} from "../../experiments/context";
import type {
  OptimizationScalar,
  PetrinautOptimizationChannel,
  PetrinautOptimizationTrialRequest,
} from "@hashintel/petrinaut-core/optimization";

/**
 * The study a run belongs to, as the channel needs it: which backend to ask
 * for, and who watches the trials as they evaluate.
 */
export type OptimizationChannelStudy = {
  /** The key the study's own refinement compiles under, so trials share that snapshot. */
  cacheKey: string;
  computeBackend: ExperimentComputeBackend;
  trialStarted: (
    trial: number,
    values: Readonly<Record<string, OptimizationScalar>>,
    run: DetachedObjectiveRun,
    runCount: number,
  ) => void;
  trialSettled: (trial: number, outcome: DetachedObjectiveRunOutcome) => void;
};

export type OptimizationChannel = PetrinautOptimizationChannel & {
  dispose(this: void): void;
};

/**
 * The channel a connected optimizer evaluates its trials through. Each trial
 * becomes one detached objective run compiled once per optimizer run id and
 * queued on its own, so trials the optimizer keeps in flight together
 * overlap. A study's parameter constraints are checked first, at the trial's
 * values and the net parameter values they resolve to: a draw that breaks
 * one is pruned before anything simulates, naming the constraint. Its state
 * constraints run beside the objective as 0/1 metrics, and their per-run
 * verdicts ride on the outcome; the objective stays the mean over every run.
 * The channel never throws: whatever stops a trial reaches Optuna as a pruned
 * trial carrying the reason.
 */
export const createOptimizationChannel = ({
  runDetachedObjective,
  resolveDetachedObjectiveParameters,
  resolveStudy,
}: {
  runDetachedObjective: ExperimentsActionsValue["runDetachedObjective"];
  resolveDetachedObjectiveParameters: ExperimentsActionsValue["resolveDetachedObjectiveParameters"];
  /**
   * The study behind a run id, or null for a run the provider does not
   * know, whose trials run on the CPU with nobody watching.
   */
  resolveStudy: (runId: string) => OptimizationChannelStudy | null;
}): OptimizationChannel => {
  const runsInFlight = new Set<DetachedObjectiveRun>();
  /** The state constraints' indicators, emitted once per optimizer run id. */
  const indicatorsByRun = new Map<string, DetachedObjectiveAuxiliaryMetric[]>();

  const indicatorsFor = (
    request: PetrinautOptimizationTrialRequest,
  ): DetachedObjectiveAuxiliaryMetric[] => {
    const cached = indicatorsByRun.get(request.runId);
    if (cached) {
      return cached;
    }
    const indicators = stateConstraintMetrics(request.manifest);
    indicatorsByRun.set(request.runId, indicators);
    return indicators;
  };

  const evaluateTrial: PetrinautOptimizationChannel["evaluateTrial"] = async (
    request,
  ) => {
    // Read through a call so the abort flag is re-checked after an await (a
    // plain property read would be control-flow-narrowed to `false`).
    const isCancelled = () => request.signal.aborted;
    const metric = request.manifest.model.definition.metrics?.find(
      (candidate) => candidate.id === request.manifest.objective.metricId,
    );
    const [firstSeed] = request.seeds;
    if (!metric) {
      return prunedTrialOutcome(
        `The study has no metric "${request.manifest.objective.metricId}" to optimize`,
      );
    }
    if (firstSeed === undefined) {
      return prunedTrialOutcome("The trial has no seed to run with");
    }
    if (isCancelled()) {
      return prunedTrialOutcome("cancelled");
    }

    const study = resolveStudy(request.runId);
    const cacheKey = study?.cacheKey ?? request.runId;
    let parameterOutcome: ParameterConstraintOutcome | null = null;
    let indicators: DetachedObjectiveAuxiliaryMetric[];
    try {
      indicators = indicatorsFor(request);
      if (hasParameterConstraints(request.manifest)) {
        // `parameters.*` reads what the batch would simulate with: the
        // scenario's overrides resolved at this trial's values. `scenario.*`
        // reads those values as the compiler binds them, a boolean parameter
        // as a boolean.
        const parameters = await resolveDetachedObjectiveParameters({
          cacheKey,
          definition: request.manifest.model.definition,
          scenarioId: request.manifest.scenario.id,
          scenarioParameterValues: request.scenarioParameterValues,
          metric: { id: metric.id, label: metric.name, code: metric.code },
        });
        parameterOutcome = parameterConstraintOutcome(request.manifest, {
          parameters,
          scenario: resolveTrialScenarioBindings(
            request.manifest,
            request.scenarioParameterValues,
          ),
        });
      }
    } catch (error) {
      return prunedTrialOutcome(errorMessage(error));
    }
    if (isCancelled()) {
      return prunedTrialOutcome("cancelled");
    }
    if (
      parameterOutcome?.infeasible !== undefined &&
      parameterOutcome.infeasible !== null
    ) {
      // An infeasible draw costs one trial and no simulation: nothing
      // starts, so no batch appears in the study's activity.
      const { infeasible } = parameterOutcome;
      return prunedTrialOutcome(
        `Infeasible: ${constraintNameIn(request.manifest, infeasible)}`,
        { parameters: parameterOutcome.results, state: [], infeasible },
      );
    }
    const parameterResults = parameterOutcome?.results ?? [];
    const declaresConstraints =
      parameterResults.length > 0 || indicators.length > 0;

    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    request.signal.addEventListener("abort", forwardAbort, { once: true });
    let run: DetachedObjectiveRun | null = null;
    let outcome: DetachedObjectiveRunOutcome;
    try {
      run = runDetachedObjective({
        cacheKey,
        // Trials in flight at once each take a queue of their own; the
        // compiled study is shared through the cache key.
        queueKey: `${request.runId}:trial:${request.trial}`,
        definition: request.manifest.model.definition,
        scenarioId: request.manifest.scenario.id,
        scenarioParameterValues: request.scenarioParameterValues,
        metric: { id: metric.id, label: metric.name, code: metric.code },
        ...(indicators.length > 0 ? { auxiliaryMetrics: indicators } : {}),
        seed: firstSeed,
        runCount: request.seeds.length,
        runSeeds: request.seeds,
        dt: request.manifest.execution.dt,
        maxTime: request.manifest.execution.maxTime,
        computeBackend: study?.computeBackend ?? "cpu",
        signal: controller.signal,
      });
      runsInFlight.add(run);
      study?.trialStarted(
        request.trial,
        request.suggestedValues,
        run,
        request.seeds.length,
      );
      outcome = await run.completion;
      study?.trialSettled(request.trial, outcome);
    } catch (error) {
      outcome = { ok: false, cancelled: false, reason: errorMessage(error) };
    } finally {
      if (run) {
        runsInFlight.delete(run);
      }
      request.signal.removeEventListener("abort", forwardAbort);
    }
    return trialOutcome(outcome, metric.id, (result) =>
      declaresConstraints
        ? {
            parameters: parameterResults,
            state: stateConstraintResults(request.manifest, result.runResults),
          }
        : undefined,
    );
  };

  return {
    evaluateTrial,
    dispose: () => {
      for (const run of runsInFlight) {
        run.cancel();
      }
      runsInFlight.clear();
      indicatorsByRun.clear();
    },
  };
};
