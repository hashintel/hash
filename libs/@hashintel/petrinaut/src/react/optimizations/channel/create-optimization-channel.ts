/**
 * @layerRoot react.optimizations.channel
 * @role Evaluates optimizer trials as detached objective runs on the experiments backend
 */
import {
  prunedTrialOutcome,
  trialOutcome,
} from "./create-optimization-channel/trial-outcome";

import type {
  DetachedObjectiveRun,
  DetachedObjectiveRunOutcome,
  ExperimentComputeBackend,
  ExperimentsActionsValue,
} from "../../experiments/context";
import type {
  OptimizationScalar,
  PetrinautOptimizationChannel,
} from "@hashintel/petrinaut-core/optimization";

/**
 * The study a run belongs to, as the channel needs it: which backend to ask
 * for, and who watches the trials as they evaluate.
 */
export type OptimizationChannelStudy = {
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

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The channel a connected optimizer evaluates its trials through. Each trial
 * becomes one detached objective run compiled once per optimizer run id and
 * queued on its own, so trials the optimizer keeps in flight together
 * overlap. The channel never throws: whatever stops a trial reaches Optuna
 * as a pruned trial carrying the reason.
 */
export const createOptimizationChannel = ({
  runDetachedObjective,
  resolveStudy,
}: {
  runDetachedObjective: ExperimentsActionsValue["runDetachedObjective"];
  /**
   * The study behind a run id, or null for a run the provider does not
   * know, whose trials run on the CPU with nobody watching.
   */
  resolveStudy: (runId: string) => OptimizationChannelStudy | null;
}): OptimizationChannel => {
  const runsInFlight = new Set<DetachedObjectiveRun>();

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

    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    request.signal.addEventListener("abort", forwardAbort, { once: true });
    let run: DetachedObjectiveRun | null = null;
    let outcome: DetachedObjectiveRunOutcome;
    try {
      const study = resolveStudy(request.runId);
      run = runDetachedObjective({
        cacheKey: request.runId,
        // Trials in flight at once each take a queue of their own; the
        // compiled study is shared through the cache key.
        queueKey: `${request.runId}:trial:${request.trial}`,
        definition: request.manifest.model.definition,
        scenarioId: request.manifest.scenario.id,
        scenarioParameterValues: request.scenarioParameterValues,
        metric: { id: metric.id, label: metric.name, code: metric.code },
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
    return trialOutcome(outcome, metric.id, request.seeds);
  };

  return {
    evaluateTrial,
    dispose: () => {
      for (const run of runsInFlight) {
        run.cancel();
      }
      runsInFlight.clear();
    },
  };
};
