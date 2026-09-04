import { sweepCellObjective } from "../../experiments/sweep-cell-objective";
import {
  optimizationAxisMidpoint,
  optimizationAxisPositionFor,
  optimizationBooleanIdentifiers,
  optimizationNavigationKey,
  optimizationNavigationValues,
} from "../surface-grid";
import { createActivityRegistry } from "./activity-registry";
import { createPointRefinement } from "./point-refinement";

import type {
  DetachedObjectiveRun,
  DetachedObjectiveRunOutcome,
  ExperimentComputeBackend,
  ExperimentsActionsValue,
} from "../../experiments/context";
import type {
  OptimizationBatchStatus,
  OptimizationBest,
  OptimizationInFlightStep,
  OptimizationNavigation,
  OptimizationRecord,
  OptimizationSelectionStream,
  OptimizationStatus,
} from "../context";
import type { OptimizationSurfaceAxis } from "../surface-grid";
import type {
  PetrinautOptimizationInput,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";
import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

/** What a connected study publishes into its record. */
export type ConnectedStudyUpdate = Pick<
  OptimizationRecord,
  "navigation" | "selection" | "activity" | "inFlight"
>;

/** The status a study settles with. */
export type ConnectedStudyOutcome = Extract<
  OptimizationStatus,
  "complete" | "error" | "cancelled"
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
   * best trial's point, following ends, and the point refines; a navigation
   * the user moved earlier stays where it is.
   */
  settle(
    this: void,
    outcome: ConnectedStudyOutcome,
    best?: OptimizationBest | null,
  ): void;
  /**
   * More steps were asked of a settled study: following turns back on so the
   * next step is followed, and the point refining stops.
   */
  resume(this: void): void;
  dispose(this: void): void;
};

const labelValue = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 3,
});

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
  let disposed = false;
  /** Trials being evaluated, in the order they started. */
  const evaluating = new Map<number, EvaluatingTrial>();
  let followed: { trial: number; off: () => void } | null = null;

  const inFlight = (): readonly OptimizationInFlightStep[] =>
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

  const activityRegistry = createActivityRegistry((next) => {
    activity = next;
    publish();
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

  const refineLabel = (
    values: Readonly<Record<string, number | boolean>>,
  ): string =>
    `Refining ${optimizedIdentifiers
      .map((identifier) => {
        const value = values[identifier];
        return `${identifier} ${
          typeof value === "number" ? labelValue.format(value) : String(value)
        }`;
      })
      .join(" · ")}`;

  const refinement = createPointRefinement({
    runDetachedObjective: (request) => {
      const run = runDetachedObjective(request);
      const off = activityRegistry.register({
        kind: "refine",
        label: refineLabel(request.scenarioParameterValues),
        runCount: request.runCount,
        progress: run.progress,
      });
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
      isBest:
        best !== null && key === keyOf(navigationAt(best.parameters, false)),
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
        metricFrames: run.frames.get(),
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

  /** Following ends where the study did best, and that point refines. */
  const settleOnBest = () => {
    stopFollowing();
    navigation = best
      ? navigationAt(best.parameters, false)
      : { ...navigation, followTrials: false };
    refineHere();
    publish();
  };

  const foldBest = (event: PetrinautOptimizationTrialEvent) => {
    if (event.best) {
      best = event.best;
      return;
    }
    if (event.state !== "complete" || event.objective === null) {
      return;
    }
    const isBetter =
      best === null ||
      (direction === "maximize"
        ? event.objective > best.objective
        : event.objective < best.objective);
    if (isBetter) {
      best = {
        trial: event.trial,
        parameters: event.parameters,
        objective: event.objective,
      };
    }
  };

  return {
    computeBackend,
    initialNavigation: navigation,
    setNavigation: (patch) => {
      if (disposed) {
        return;
      }
      const moved =
        patch.positions !== undefined || patch.booleans !== undefined;
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
      const offActivity = activityRegistry.register({
        kind: "step",
        label: `Step ${trial + 1}`,
        runCount,
        progress: run.progress,
      });
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
            metricFrames: outcome.metricFrames,
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
        settleOnBest();
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
      if (!disposed) {
        foldBest(event);
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
        settleOnBest();
      }
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
      activityRegistry.clear();
      refinement.dispose();
    },
  };
};
