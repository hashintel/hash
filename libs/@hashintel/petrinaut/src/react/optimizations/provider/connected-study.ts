/**
 * @layerRoot react.optimizations.connected-study
 * @role Per-record local state of a study run in the tab: navigation and following, the refinement ladder at the navigated point, the activity list
 */
import { createBatchRegistry } from "../../experiments/shared/batch-registry";
import { sweepCellObjective } from "../../experiments/sweep-cell-objective";
import { foldBestTrial } from "../context";
import {
  optimizationAxisMidpoint,
  optimizationAxisPositionFor,
  optimizationBooleanIdentifiers,
  optimizationNavigationKey,
  optimizationNavigationValues,
} from "../surface-grid";
import { createPointRefinement } from "./point-refinement";

import type {
  DetachedObjectiveRun,
  DetachedObjectiveRunOutcome,
  ExperimentComputeBackend,
  ExperimentsActionsValue,
} from "../../experiments/context";
import type {
  ConnectedStudyState,
  OptimizationBatch,
  OptimizationBatchStatus,
  OptimizationBest,
  OptimizationInFlightTrial,
  OptimizationNavigation,
  OptimizationSelectionStream,
  OptimizationStatus,
} from "../context";
import type { OptimizationSurfaceAxis } from "../surface-grid";
import type {
  MonteCarloUserDefinedMetricFrame,
  PetrinautOptimizationInput,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";
import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

/** What a connected study publishes into its record. */
export type ConnectedStudyUpdate = Pick<
  ConnectedStudyState,
  "navigation" | "selection" | "activity" | "inFlight"
>;

/** The status a study settles with. */
export type ConnectedStudyOutcome = Extract<
  OptimizationStatus,
  "complete" | "paused" | "error" | "cancelled"
>;

/** A trial as the channel reports it: the optimizer's values and the batch evaluating them. */
type EvaluatingTrial = {
  trial: number;
  values: Readonly<Record<string, OptimizationScalar>>;
  run: DetachedObjectiveRun;
  /** Stops listing the trial in the activity and watching its frames. */
  release: () => void;
};

export type ConnectedStudy = {
  readonly computeBackend: ExperimentComputeBackend;
  /** The navigation at creation, for the record's first render. */
  readonly initialNavigation: OptimizationNavigation;
  setNavigation(this: void, patch: Partial<OptimizationNavigation>): void;
  /**
   * A trial began evaluating. While following, the navigation moves to the
   * trial and its stream becomes the selection; with several trials in
   * flight the most recently started one is followed.
   */
  trialStarted(
    this: void,
    trial: number,
    values: Readonly<Record<string, OptimizationScalar>>,
    run: DetachedObjectiveRun,
    runCount: number,
  ): void;
  /**
   * The trial's batch settled; a followed trial's selection stops computing
   * and, when the batch failed, carries its reason.
   */
  trialSettled(
    this: void,
    trial: number,
    outcome: DetachedObjectiveRunOutcome,
  ): void;
  /** A trial event landed on the record; the study keeps the best from it. */
  trialReported(this: void, event: PetrinautOptimizationTrialEvent): void;
  /**
   * The study reached a terminal status, `best` overriding the best kept from
   * the trials when given. While following, the navigation settles on the
   * best trial's point and following ends; a navigation the user moved
   * earlier stays where it is. Only a completed study refines its point:
   * a pause, a stop or a failure starts no refinement, and `refineBest` is
   * the explicit way to run at the best configuration.
   */
  settle(
    this: void,
    outcome: ConnectedStudyOutcome,
    best?: OptimizationBest | null,
  ): void;
  /**
   * Moves the navigation to the best trial's point (or keeps it where it is
   * without a best), stops following and climbs the run ladder there.
   */
  refineBest(this: void): void;
  /**
   * More steps were asked of a settled study: following turns back on so the
   * next step is followed, and the point refining stops.
   */
  resume(this: void): void;
  dispose(this: void): void;
};

const BATCH_KIND_ORDER: readonly OptimizationBatch["kind"][] = [
  "trial",
  "refine",
];

/**
 * The local machinery behind one connected study: where its drawer points,
 * whether that follows the trials as they are evaluated, the objective's
 * live stream there — the followed trial's batch while following, the point
 * refinement ladder once the study is terminal or the user has moved away —
 * and the list of every batch computing for it.
 */
export const createConnectedStudy = ({
  optimizationId,
  input,
  axes,
  computeBackend,
  runDetachedObjective,
  onUpdate,
}: {
  optimizationId: string;
  input: PetrinautOptimizationInput;
  axes: readonly OptimizationSurfaceAxis[];
  computeBackend: ExperimentComputeBackend;
  runDetachedObjective: ExperimentsActionsValue["runDetachedObjective"];
  onUpdate: (update: ConnectedStudyUpdate) => void;
}): ConnectedStudy => {
  const booleanIdentifiers = optimizationBooleanIdentifiers(input);
  const optimizedIdentifiers = [
    ...axes.map((axis) => axis.identifier),
    ...booleanIdentifiers,
  ];
  const { direction } = input.objective;
  const scenario = input.model.definition.scenarios?.find(
    (candidate) => candidate.id === input.scenario.id,
  );
  const metric = input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  );
  if (!metric) {
    throw new Error(
      `The study has no metric "${input.objective.metricId}" to optimize`,
    );
  }
  // A trial's batch also runs the study's state constraints as metrics; the
  // selection stream describes the objective alone.
  const objectiveFrames = (
    frames: readonly MonteCarloUserDefinedMetricFrame[],
  ): readonly MonteCarloUserDefinedMetricFrame[] =>
    frames.filter((frame) => frame.metricId === metric.id);

  let navigation: OptimizationNavigation = {
    positions: Object.fromEntries(
      axes.map((axis) => [axis.identifier, optimizationAxisMidpoint(axis)]),
    ),
    booleans: Object.fromEntries(
      booleanIdentifiers.map((identifier) => [
        identifier,
        (scenario?.scenarioParameters.find(
          (parameter) => parameter.identifier === identifier,
        )?.default ?? 0) !== 0,
      ]),
    ),
    followTrials: true,
  };
  let selection: OptimizationSelectionStream | null = null;
  let activity: readonly OptimizationBatchStatus[] = [];
  let best: OptimizationBest | null = null;
  let terminal: ConnectedStudyOutcome | null = null;
  /** Set while the navigation sits where settling put it, at the best; a user move clears it. */
  let parkedOnBest = false;
  let disposed = false;
  /** Trials being evaluated, in the order they started. */
  const evaluating = new Map<number, EvaluatingTrial>();
  let followed: { trial: number; off: () => void } | null = null;

  const inFlight = (): readonly OptimizationInFlightTrial[] =>
    [...evaluating.values()].map((entry) => ({
      trial: entry.trial,
      parameters: entry.values,
      objective: sweepCellObjective(entry.run.frames.get(), metric.id),
    }));

  const publish = () => {
    if (!disposed) {
      onUpdate({ navigation, selection, activity, inFlight: inFlight() });
    }
  };

  const registry = createBatchRegistry<
    OptimizationBatch["kind"],
    OptimizationBatch
  >({
    kindOrder: BATCH_KIND_ORDER,
    onPublish: (next) => {
      activity = next;
      publish();
    },
  });

  /** The navigation at a trial's values; unset axes keep their position. */
  const navigationAt = (
    values: Readonly<Record<string, OptimizationScalar>>,
    followTrials: boolean,
  ): OptimizationNavigation => ({
    positions: Object.fromEntries(
      axes.map((axis) => {
        const value = values[axis.identifier];
        return [
          axis.identifier,
          typeof value === "number"
            ? optimizationAxisPositionFor(axis, value)
            : (navigation.positions[axis.identifier] ??
              optimizationAxisMidpoint(axis)),
        ];
      }),
    ),
    booleans: Object.fromEntries(
      booleanIdentifiers.map((identifier) => {
        const value = values[identifier];
        return [
          identifier,
          typeof value === "boolean"
            ? value
            : (navigation.booleans[identifier] ?? false),
        ];
      }),
    ),
    followTrials,
  });

  const keyOf = (target: OptimizationNavigation): string =>
    optimizationNavigationKey(axes, booleanIdentifiers, target);

  /** A point's optimized parameter values, without the study's fixed ones. */
  const optimizedValues = (
    values: Readonly<Record<string, OptimizationScalar>>,
  ): Record<string, OptimizationScalar> =>
    Object.fromEntries(
      optimizedIdentifiers.flatMap((identifier) => {
        const value = values[identifier];
        return value === undefined ? [] : [[identifier, value]];
      }),
    );

  const refinement = createPointRefinement({
    runDetachedObjective: (request) => {
      const run = runDetachedObjective(request);
      const off = registry.register(
        {
          kind: "refine",
          values: optimizedValues(request.scenarioParameterValues),
        },
        request.runCount,
        run.progress,
      );
      void run.completion.then(off, off);
      return run;
    },
    study: {
      cacheKey: optimizationId,
      definition: input.model.definition,
      scenarioId: input.scenario.id,
      metric: { id: metric.id, label: metric.name, code: metric.code },
      seed: input.execution.seed,
      dt: input.execution.dt,
      maxTime: input.execution.maxTime,
      computeBackend,
      direction,
    },
    bestObjective: () => best?.objective ?? null,
    onUpdate: (next) => {
      selection = next;
      publish();
    },
  });

  /** The navigation key of the best trial's point; null without a best. */
  const bestKey = (): string | null =>
    best === null ? null : keyOf(navigationAt(best.parameters, false));

  const refineHere = () => {
    const key = keyOf(navigation);
    refinement.refine({
      key,
      scenarioParameterValues: optimizationNavigationValues(
        input,
        axes,
        booleanIdentifiers,
        navigation,
      ),
      isBest: key === bestKey(),
    });
  };

  const stopFollowing = () => {
    followed?.off();
    followed = null;
  };

  const follow = ({ trial, values, run }: EvaluatingTrial) => {
    stopFollowing();
    navigation = navigationAt(values, true);
    const key = `trial:${trial}`;
    const mirror = () => {
      selection = {
        key,
        metricFrames: objectiveFrames(run.frames.get()),
        runsCompleted: run.progress.get()?.completedRuns ?? 0,
        runTarget: null,
        computing: true,
        error: null,
        note: null,
      };
      publish();
    };
    const offFrames = run.frames.subscribe(mirror);
    const offProgress = run.progress.subscribe(mirror);
    followed = {
      trial,
      off: () => {
        offFrames();
        offProgress();
      },
    };
    mirror();
  };

  const mostRecentlyStarted = (): EvaluatingTrial | undefined =>
    [...evaluating.values()].at(-1);

  /**
   * Following ends where the study did best; the point refines only when
   * asked. Without a refinement nothing has computed at the point, so the
   * selection empties rather than keep showing the last followed step.
   */
  const settleOnBest = (refine: boolean) => {
    stopFollowing();
    navigation = best
      ? navigationAt(best.parameters, false)
      : { ...navigation, followTrials: false };
    parkedOnBest = true;
    if (refine) {
      refineHere();
    } else {
      refinement.stop();
      selection = null;
    }
    publish();
  };

  /** A completed study refines where it settles; a paused, stopped or failed one starts nothing. */
  const refinesOnSettle = (): boolean => terminal === "complete";

  return {
    computeBackend,
    initialNavigation: navigation,
    setNavigation: (patch) => {
      if (disposed) {
        return;
      }
      const moved =
        patch.positions !== undefined || patch.booleans !== undefined;
      if (moved) {
        parkedOnBest = false;
      }
      navigation = {
        positions: { ...navigation.positions, ...patch.positions },
        booleans: { ...navigation.booleans, ...patch.booleans },
        followTrials:
          patch.followTrials ?? (moved ? false : navigation.followTrials),
      };
      if (terminal !== null || !navigation.followTrials) {
        stopFollowing();
        refineHere();
      } else {
        refinement.stop();
        const latest = mostRecentlyStarted();
        if (latest) {
          follow(latest);
        }
      }
      publish();
    },
    trialStarted: (trial, values, run, runCount) => {
      if (disposed) {
        return;
      }
      const offActivity = registry.register(
        { kind: "trial", trial },
        runCount,
        run.progress,
      );
      // The followed trial's own mirror publishes its frames.
      const offFrames = run.frames.subscribe(() => {
        if (followed?.trial !== trial) {
          publish();
        }
      });
      const entry: EvaluatingTrial = {
        trial,
        values,
        run,
        release: () => {
          offActivity();
          offFrames();
        },
      };
      evaluating.set(trial, entry);
      if (terminal !== null || !navigation.followTrials) {
        publish();
        return;
      }
      refinement.stop();
      follow(entry);
    },
    trialSettled: (trial, outcome) => {
      if (disposed) {
        return;
      }
      const entry = evaluating.get(trial);
      entry?.release();
      evaluating.delete(trial);
      if (followed?.trial !== trial) {
        publish();
        return;
      }
      stopFollowing();
      selection = outcome.ok
        ? {
            key: `trial:${trial}`,
            metricFrames: objectiveFrames(outcome.metricFrames),
            runsCompleted: outcome.runsCompleted,
            runTarget: null,
            computing: false,
            error: null,
            note: null,
          }
        : {
            key: `trial:${trial}`,
            metricFrames: selection?.metricFrames ?? [],
            runsCompleted: selection?.runsCompleted ?? 0,
            runTarget: null,
            computing: false,
            error: outcome.cancelled ? null : outcome.reason,
            note: null,
          };
      if (terminal !== null) {
        settleOnBest(refinesOnSettle());
        return;
      }
      const latest = mostRecentlyStarted();
      if (latest) {
        follow(latest);
        return;
      }
      publish();
    },
    trialReported: (event) => {
      if (disposed) {
        return;
      }
      const previousBestKey = bestKey();
      best = foldBestTrial(direction, best, event);
      if (navigation.followTrials || bestKey() === previousBestKey) {
        return;
      }
      // A step draining after a pause may turn out the best: the navigation
      // settled on the best follows it there, still without refining.
      if (parkedOnBest && best && terminal !== null && !refinesOnSettle()) {
        navigation = navigationAt(best.parameters, false);
        publish();
        return;
      }
      // A parked point's standing against the best may have changed: as the
      // best it climbs past an early stop, no longer the best it may stop.
      if (terminal === null || refinesOnSettle()) {
        refineHere();
      }
    },
    settle: (outcome, settledBest) => {
      if (disposed || terminal !== null) {
        return;
      }
      terminal = outcome;
      if (settledBest !== undefined && settledBest !== null) {
        best = settledBest;
      }
      if (navigation.followTrials && !followed) {
        settleOnBest(refinesOnSettle());
      } else if (!navigation.followTrials && refinesOnSettle()) {
        // A parked point keeps its place; the settled best may be its own.
        refineHere();
      }
    },
    refineBest: () => {
      if (disposed) {
        return;
      }
      settleOnBest(true);
    },
    resume: () => {
      if (disposed || terminal === null) {
        return;
      }
      terminal = null;
      refinement.stop();
      navigation = { ...navigation, followTrials: true };
      publish();
    },
    dispose: () => {
      disposed = true;
      stopFollowing();
      for (const entry of evaluating.values()) {
        entry.release();
      }
      evaluating.clear();
      registry.clear();
      refinement.dispose();
    },
  };
};
