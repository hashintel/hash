import {
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
} from "../../experiments/parameter-grid";
import { sweepBatchSeed } from "../../experiments/sweep-session";
import {
  estimateObjective,
  shouldStopRefining,
} from "./point-refinement/objective-estimate";

import type {
  DetachedObjectiveRun,
  DetachedObjectiveRunRequest,
  ExperimentsActionsValue,
} from "../../experiments/context";
import type { SweepCellSnapshot } from "../../experiments/sweep-session";
import type { OptimizationSelectionStream } from "../context";
import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

export { shouldStopRefining } from "./point-refinement/objective-estimate";

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
> & { seed: number; direction: "maximize" | "minimize" };

export type PointRefinementTarget = {
  key: string;
  scenarioParameterValues: DetachedObjectiveRunRequest["scenarioParameterValues"];
  /**
   * The point is the best trial's: it climbs to the top rung whatever its
   * estimate says, since it is the value the study reports.
   */
  isBest: boolean;
};

export type PointRefinement = {
  /**
   * Climbs the run ladder at `target`, streaming into `onUpdate`. A new key
   * cancels the batch in flight and resumes from the key's cached rungs; the
   * key already refining, or settled, changes nothing. A failed rung stops
   * the ladder and records the reason; refining the key again retries it.
   * Between rungs, a point whose mean sits too far from the study's best to
   * ever beat it stops with a note saying so.
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

/** The note a ladder stops with when the point cannot beat the best. */
export const cannotBeatBestNote = (runs: number): string =>
  `${runs} runs · cannot beat the best`;

/**
 * Refines one parameter point of a study, as the sweep session refines the
 * navigator's selection: cumulative batches up the run ladder, each batch
 * seeded from its first global run index so a rung repeats exactly, merged
 * into a cache keyed by the point.
 */
export const createPointRefinement = ({
  runDetachedObjective,
  study,
  bestObjective,
  maxRuns = POINT_REFINEMENT_MAX_RUNS,
  onUpdate,
}: {
  runDetachedObjective: ExperimentsActionsValue["runDetachedObjective"];
  study: PointRefinementStudy;
  /** The study's best objective so far, read before each rung. */
  bestObjective: () => number | null;
  maxRuns?: number;
  onUpdate: (selection: OptimizationSelectionStream) => void;
}): PointRefinement => {
  const cache = new Map<string, SweepCellSnapshot>();
  let active: RefinementSession | null = null;

  const stop = () => {
    active?.cancel();
    active = null;
  };

  /** Whether a point's finished rungs already rule it out against the best. */
  const cannotBeatBest = (snapshot: SweepCellSnapshot): boolean => {
    if (snapshot.runsCompleted === 0) {
      return false;
    }
    const estimate = estimateObjective(snapshot.metricFrames, study.metric.id);
    return (
      estimate !== null &&
      shouldStopRefining({
        direction: study.direction,
        best: bestObjective(),
        mean: estimate.mean,
        standardError: estimate.standardError,
      })
    );
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

    const publish = (
      snapshot: SweepCellSnapshot,
      runTarget: number | null,
      note: string | null,
    ) => {
      onUpdate({
        key: target.key,
        metricFrames: snapshot.metricFrames,
        runsCompleted: snapshot.runsCompleted,
        runTarget,
        computing: runTarget !== null,
        error: null,
        note,
      });
    };

    const climb = async (): Promise<void> => {
      let snapshot: SweepCellSnapshot = cache.get(target.key) ?? {
        runsCompleted: 0,
        metricFrames: [],
      };

      while (!isCancelled()) {
        const runTarget = getNextRunTarget(snapshot.runsCompleted, maxRuns);
        if (runTarget === null) {
          publish(snapshot, null, null);
          return;
        }
        if (!target.isBest && cannotBeatBest(snapshot)) {
          publish(snapshot, null, cannotBeatBestNote(snapshot.runsCompleted));
          return;
        }
        publish(snapshot, runTarget, null);

        const base = snapshot;
        const run = runDetachedObjective({
          ...study,
          scenarioParameterValues: target.scenarioParameterValues,
          seed: sweepBatchSeed(study.seed, base.runsCompleted),
          runCount: runTarget - base.runsCompleted,
        });
        inFlight = run;
        const offFrames = run.frames.subscribe((frames) => {
          if (!isCancelled()) {
            publish(
              {
                runsCompleted: base.runsCompleted,
                metricFrames: mergeFrames(base.metricFrames, frames),
              },
              runTarget,
              null,
            );
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
            note: null,
          });
          return;
        }
        snapshot = {
          runsCompleted: base.runsCompleted + outcome.runsCompleted,
          metricFrames: mergeFrames(base.metricFrames, outcome.metricFrames),
        };
        cache.set(target.key, snapshot);
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
