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
  OptimizationNavigation,
  OptimizationRecord,
  OptimizationSelectionStream,
  OptimizationStatus,
} from "../context";
import type { OptimizationSurfaceAxis } from "../surface-grid";
import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";
import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

/** What a connected study publishes into its record. */
export type ConnectedStudyUpdate = Pick<
  OptimizationRecord,
  "navigation" | "selection"
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
};

export type ConnectedStudy = {
  readonly computeBackend: ExperimentComputeBackend;
  /** The navigation at creation, for the record's first render. */
  readonly initialNavigation: OptimizationNavigation;
  setNavigation(this: void, patch: Partial<OptimizationNavigation>): void;
  /**
   * A trial began evaluating. While following, the navigation moves to the
   * trial and its stream becomes the selection.
   */
  trialStarted(
    this: void,
    trial: number,
    values: Readonly<Record<string, OptimizationScalar>>,
    run: DetachedObjectiveRun,
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
  /**
   * The study reached a terminal status. Following ends, and the selection
   * refines wherever the navigation points, except after a cancellation:
   * Cancel stops compute, so only a later move starts it again.
   */
  settle(this: void, outcome: ConnectedStudyOutcome): void;
  dispose(this: void): void;
};

/**
 * The local machinery behind one connected study: where its drawer points,
 * whether that follows the trials as they are evaluated, and the objective's
 * live stream there — the followed trial's batch while following, the point
 * refinement ladder once the study is terminal or the user has moved away.
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
  let terminal: ConnectedStudyOutcome | null = null;
  let disposed = false;
  let evaluating: EvaluatingTrial | null = null;
  let followed: { trial: number; off: () => void } | null = null;

  const publish = () => {
    if (!disposed) {
      onUpdate({ navigation, selection });
    }
  };

  const refinement = createPointRefinement({
    runDetachedObjective,
    study: {
      cacheKey: optimizationId,
      definition: input.model.definition,
      scenarioId: input.scenario.id,
      metric: { id: metric.id, label: metric.name, code: metric.code },
      seed: input.execution.seed,
      dt: input.execution.dt,
      maxTime: input.execution.maxTime,
      computeBackend,
    },
    onUpdate: (next) => {
      selection = next;
      publish();
    },
  });

  const refineHere = () => {
    refinement.refine({
      key: optimizationNavigationKey(axes, booleanIdentifiers, navigation),
      scenarioParameterValues: optimizationNavigationValues(
        input,
        axes,
        booleanIdentifiers,
        navigation,
      ),
    });
  };

  const refineAfterTerminal = () => {
    if (terminal !== "cancelled") {
      refineHere();
    }
  };

  const stopFollowing = () => {
    followed?.off();
    followed = null;
  };

  const follow = ({ trial, values, run }: EvaluatingTrial) => {
    stopFollowing();
    navigation = {
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
      followTrials: true,
    };
    const key = `trial:${trial}`;
    const mirror = () => {
      selection = {
        key,
        metricFrames: run.frames.get(),
        runsCompleted: run.progress.get()?.completedRuns ?? 0,
        runTarget: null,
        computing: true,
        error: null,
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
        if (evaluating) {
          follow(evaluating);
        }
      }
      publish();
    },
    trialStarted: (trial, values, run) => {
      if (disposed) {
        return;
      }
      evaluating = { trial, values, run };
      if (terminal !== null || !navigation.followTrials) {
        return;
      }
      refinement.stop();
      follow(evaluating);
    },
    trialSettled: (trial, outcome) => {
      if (disposed) {
        return;
      }
      if (evaluating?.trial === trial) {
        evaluating = null;
      }
      if (followed?.trial !== trial) {
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
          }
        : {
            key: `trial:${trial}`,
            metricFrames: selection?.metricFrames ?? [],
            runsCompleted: selection?.runsCompleted ?? 0,
            runTarget: null,
            computing: false,
            error: outcome.cancelled ? null : outcome.reason,
          };
      publish();
      if (terminal !== null) {
        refineAfterTerminal();
      }
    },
    settle: (outcome) => {
      if (disposed || terminal !== null) {
        return;
      }
      terminal = outcome;
      if (!followed) {
        refineAfterTerminal();
      }
    },
    dispose: () => {
      disposed = true;
      stopFollowing();
      refinement.dispose();
    },
  };
};
