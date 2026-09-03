import {
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
} from "../../experiments/parameter-grid";
import { sweepBatchSeed } from "../../experiments/sweep-session";

import type {
  DetachedObjectiveRun,
  DetachedObjectiveRunRequest,
  ExperimentsActionsValue,
} from "../../experiments/context";
import type { SweepCellSnapshot } from "../../experiments/sweep-session";
import type { OptimizationSelectionStream } from "../context";
import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** The most runs the selected point is refined to. */
export const POINT_REFINEMENT_MAX_RUNS = 100;

/** The study fields every refinement batch shares. */
export type PointRefinementStudy = Pick<
  DetachedObjectiveRunRequest,
  | "cacheKey"
  | "definition"
  | "scenarioId"
  | "metric"
  | "dt"
  | "maxTime"
  | "computeBackend"
> & { seed: number };

export type PointRefinementTarget = {
  key: string;
  scenarioParameterValues: DetachedObjectiveRunRequest["scenarioParameterValues"];
};

export type PointRefinement = {
  /**
   * Climbs the run ladder at `target`, streaming into `onUpdate`. A new key
   * cancels the batch in flight and resumes from the key's cached rungs; the
   * key already refining, or saturated, changes nothing. A failed rung stops
   * the ladder and records the reason; refining the key again retries it.
   */
  refine(this: void, target: PointRefinementTarget): void;
  /** Cancels the batch in flight. Finished rungs stay cached. */
  stop(this: void): void;
  dispose(this: void): void;
};

/** The point being refined, and how to stop it. */
type RefinementSession = {
  key: string;
  cancel: () => void;
};

const mergeFrames = (
  base: readonly MonteCarloUserDefinedMetricFrame[],
  streamed: readonly MonteCarloUserDefinedMetricFrame[],
): readonly MonteCarloUserDefinedMetricFrame[] =>
  base.length === 0 ? streamed : mergeMetricFramesAcrossCells([base, streamed]);

/**
 * Refines one parameter point of a study, as the sweep session refines the
 * navigator's selection: cumulative batches up the run ladder, each batch
 * seeded from its first global run index so a rung repeats exactly, merged
 * into a cache keyed by the point.
 */
export const createPointRefinement = ({
  runDetachedObjective,
  study,
  maxRuns = POINT_REFINEMENT_MAX_RUNS,
  onUpdate,
}: {
  runDetachedObjective: ExperimentsActionsValue["runDetachedObjective"];
  study: PointRefinementStudy;
  maxRuns?: number;
  onUpdate: (selection: OptimizationSelectionStream) => void;
}): PointRefinement => {
  const cache = new Map<string, SweepCellSnapshot>();
  let active: RefinementSession | null = null;

  const stop = () => {
    active?.cancel();
    active = null;
  };

  const refine = (target: PointRefinementTarget) => {
    if (active?.key === target.key) {
      return;
    }
    stop();
    let cancelled = false;
    let inFlight: DetachedObjectiveRun | null = null;
    // Read through a call so the flag is re-checked after each await (a plain
    // property read would be control-flow-narrowed to `false`).
    const isCancelled = () => cancelled;
    active = {
      key: target.key,
      cancel: () => {
        cancelled = true;
        inFlight?.cancel();
      },
    };

    const climb = async (): Promise<void> => {
      let snapshot: SweepCellSnapshot = cache.get(target.key) ?? {
        runsCompleted: 0,
        metricFrames: [],
      };
      let runTarget = getNextRunTarget(snapshot.runsCompleted, maxRuns);
      onUpdate({
        key: target.key,
        metricFrames: snapshot.metricFrames,
        runsCompleted: snapshot.runsCompleted,
        runTarget,
        computing: runTarget !== null,
        error: null,
      });

      while (runTarget !== null && !isCancelled()) {
        const base = snapshot;
        const rungTarget = runTarget;
        const run = runDetachedObjective({
          ...study,
          scenarioParameterValues: target.scenarioParameterValues,
          seed: sweepBatchSeed(study.seed, base.runsCompleted),
          runCount: rungTarget - base.runsCompleted,
        });
        inFlight = run;
        const offFrames = run.frames.subscribe((frames) => {
          if (!isCancelled()) {
            onUpdate({
              key: target.key,
              metricFrames: mergeFrames(base.metricFrames, frames),
              runsCompleted: base.runsCompleted,
              runTarget: rungTarget,
              computing: true,
              error: null,
            });
          }
        });
        const outcome = await run.completion;
        offFrames();
        inFlight = null;
        if (isCancelled()) {
          return;
        }
        if (!outcome.ok) {
          active = null;
          onUpdate({
            key: target.key,
            metricFrames: base.metricFrames,
            runsCompleted: base.runsCompleted,
            runTarget: null,
            computing: false,
            error: outcome.cancelled ? null : outcome.reason,
          });
          return;
        }
        snapshot = {
          runsCompleted: base.runsCompleted + outcome.runsCompleted,
          metricFrames: mergeFrames(base.metricFrames, outcome.metricFrames),
        };
        cache.set(target.key, snapshot);
        runTarget = getNextRunTarget(snapshot.runsCompleted, maxRuns);
        onUpdate({
          key: target.key,
          metricFrames: snapshot.metricFrames,
          runsCompleted: snapshot.runsCompleted,
          runTarget,
          computing: runTarget !== null,
          error: null,
        });
      }
    };
    void climb();
  };

  return {
    refine,
    stop,
    dispose: () => {
      stop();
      cache.clear();
    },
  };
};
