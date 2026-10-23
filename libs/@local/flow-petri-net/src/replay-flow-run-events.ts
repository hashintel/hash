import {
  type FlowNetAwaiting,
  type FlowNetFiring,
  FlowNetInterpreterError,
  type FlowNetOutcome,
  type FlowNetPlacedToken,
  type FlowNetRun,
  type FlowNetStepRun,
  startFlowNetRun,
} from "./interpret-flow-net.js";

import type {
  ActualModeMarking,
  ActualModeTransitionFiring,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type {
  FlowRunEvent,
  FlowRunEventStepRun,
} from "@local/hash-isomorphic-utils/flows/run-events";

/*
 * Replays a flow run's events (see `FlowRunEvent`) on its compiled flow net, to show where the run's tokens are.
 * The events record what happened outside the net (an action's outcome, a `forEach` step's item count); the
 * interpreter works out the firings they cause.
 */

export type FlowRunReplayFiring = FlowNetFiring & {
  /** The event that caused the firing. */
  eventPosition: string;
  occurredAt: string;
};

/** An event the net couldn't follow, such as a step starting before the net has its inputs. */
export type FlowRunReplayProblem = {
  eventPosition: string;
  message: string;
};

export type FlowRunReplay = {
  /** Empty until the run has started. */
  initialMarking: readonly FlowNetPlacedToken[];
  firings: FlowRunReplayFiring[];
  /** The tokens in the net after the last event. */
  marking: FlowNetPlacedToken[];
  /** What the net is waiting for after the last event. */
  awaiting: FlowNetAwaiting[];
  problems: FlowRunReplayProblem[];
  /** Steps the run skipped. The net has no transition for skipping a step yet, so it doesn't show them skipped. */
  skippedStepRuns: FlowNetStepRun[];
};

const isSameStepRun = (stepRun: FlowNetStepRun, other: FlowRunEventStepRun) =>
  stepRun.stepId === other.stepId &&
  stepRun.itemPath.length === other.itemPath.length &&
  stepRun.itemPath.every(
    (index, position) => other.itemPath[position] === index,
  );

const describeStepRun = ({ stepId, itemPath }: FlowRunEventStepRun) =>
  itemPath.length > 0 ? `${stepId} [${itemPath.join(", ")}]` : stepId;

export const replayFlowRunEvents = (
  net: SDCPN,
  events: readonly FlowRunEvent[],
): FlowRunReplay => {
  let run: FlowNetRun | null = null;

  const firings: FlowRunReplayFiring[] = [];
  const problems: FlowRunReplayProblem[] = [];
  const skippedStepRuns: FlowNetStepRun[] = [];

  for (const event of events) {
    const record = (applied: readonly FlowNetFiring[]) => {
      for (const firing of applied) {
        firings.push({
          ...firing,
          eventPosition: event.position,
          occurredAt: event.occurredAt,
        });
      }
    };

    const problem = (message: string) => {
      problems.push({ eventPosition: event.position, message });
    };

    const apply = (startedRun: FlowNetRun, outcome: FlowNetOutcome) => {
      record(startedRun.apply(outcome));
    };

    /**
     * Starts the step run if the events didn't record it starting, and fails its attempts they didn't record, so
     * the net waits on `attempt`.
     *
     * @returns whether the net now waits on `attempt`.
     */
    const catchUpToAttempt = (
      startedRun: FlowNetRun,
      stepRun: FlowRunEventStepRun,
      attempt: number,
    ) => {
      if (startedRun.isAwaitingStart(stepRun)) {
        apply(startedRun, { kind: "stepStarted", stepRun });
      }

      for (;;) {
        const awaited = startedRun.awaitedAttempt(stepRun);

        if (awaited === null) {
          problem(
            `The net isn't waiting on an attempt of ${describeStepRun(stepRun)}`,
          );
          return false;
        }

        if (awaited === attempt) {
          return true;
        }

        if (awaited > attempt) {
          problem(
            `The net is waiting on attempt ${awaited} of ${describeStepRun(stepRun)}, not attempt ${attempt}`,
          );
          return false;
        }

        apply(startedRun, { kind: "attemptFailed", stepRun, retrying: true });
      }
    };

    try {
      if (event.kind === "runStarted") {
        if (run) {
          problem("The run started again");
          continue;
        }

        run = startFlowNetRun(net, {
          flowInputNames: Object.keys(event.flowInputs),
          waitForStepStarts: true,
        });
        record(run.firings);
        continue;
      }

      if (!run) {
        problem(`A ${event.kind} event came before the run started`);
        continue;
      }

      switch (event.kind) {
        case "stepStarted": {
          const { stepRun } = event;

          if (run.isAwaitingStart(stepRun)) {
            apply(run, { kind: "stepStarted", stepRun });
          } else {
            problem(
              `${describeStepRun(stepRun)} started before the net had its inputs`,
            );
          }
          break;
        }

        case "attemptStarted":
          catchUpToAttempt(run, event.stepRun, event.attempt);
          break;

        case "attemptSucceeded":
          if (catchUpToAttempt(run, event.stepRun, event.attempt)) {
            apply(run, {
              kind: "attemptSucceeded",
              stepRun: event.stepRun,
              outputNames: event.outputs.map(({ outputName }) => outputName),
            });
          }
          break;

        case "attemptFailed":
          if (catchUpToAttempt(run, event.stepRun, event.attempt)) {
            apply(run, {
              kind: "attemptFailed",
              stepRun: event.stepRun,
              retrying: event.retrying,
            });
          }
          break;

        case "stepGaveUp":
          /* An `attemptFailed` that isn't retrying has already given up, so only a step still trying gives up here. */
          if (run.awaitedAttempt(event.stepRun) !== null) {
            if (catchUpToAttempt(run, event.stepRun, event.attempt)) {
              apply(run, {
                kind: "attemptFailed",
                stepRun: event.stepRun,
                retrying: false,
              });
            }
          }
          break;

        case "forEachStarted": {
          const { stepRun } = event;

          if (
            run
              .awaiting()
              .some(
                (awaiting) =>
                  awaiting.kind === "itemCount" &&
                  isSameStepRun(awaiting.stepRun, stepRun),
              )
          ) {
            apply(run, {
              kind: "itemCount",
              stepRun,
              itemCount: event.itemCount,
            });
          } else if (run.isPending(stepRun)) {
            problem(
              `${describeStepRun(stepRun)} started before the net had its array`,
            );
          }
          /* Otherwise its array is a constant, whose items the net started on its own. */
          break;
        }

        case "stepSkipped":
          skippedStepRuns.push(event.stepRun);
          break;

        case "attemptCancellationRequested":
        case "attemptCancelled":
        case "inputRequested":
        case "inputResolved":
        case "progressLogged":
        case "runReset":
        case "runFinished":
          break;
      }
    } catch (error) {
      if (!(error instanceof FlowNetInterpreterError)) {
        throw error;
      }

      problem(error.message);
    }
  }

  return {
    initialMarking: run?.initialMarking ?? [],
    firings,
    marking: run?.marking() ?? [],
    awaiting: run?.awaiting() ?? [],
    problems,
    skippedStepRuns,
  };
};

const countAtRootPlaces = (placedTokens: readonly FlowNetPlacedToken[]) => {
  const counts: Record<string, number> = {};

  for (const { path } of placedTokens) {
    if (path.length === 1) {
      const [placeId] = path;

      counts[placeId] = (counts[placeId] ?? 0) + 1;
    }
  }

  return counts;
};

/**
 * A replay as an execution for Petrinaut's Actual mode, on the root net only. Actual mode keys a marking by place id
 * alone, which can't tell the places of one instance of a subnet from another's, so it leaves out the tokens inside
 * instances and the firings of subnets' transitions.
 */
export const toRootNetActualModeExecution = (
  replay: FlowRunReplay,
): {
  initialState: ActualModeMarking;
  transitionFirings: ActualModeTransitionFiring[];
} => ({
  initialState: countAtRootPlaces(replay.initialMarking),
  transitionFirings: replay.firings
    .filter(({ transitionPath }) => transitionPath.length === 1)
    .map((firing) => ({
      transitionId: firing.transitionPath[0],
      input: countAtRootPlaces(firing.consumed),
      output: countAtRootPlaces(firing.produced),
      ts: firing.occurredAt,
    })),
});
