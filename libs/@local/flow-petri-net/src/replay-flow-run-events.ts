import {
  type FlowNetFiring,
  type FlowNetHeldFiring,
  type FlowNetHeldTransition,
  FlowNetInterpreterError,
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
 * The events record what happened outside the net (an attempt ending, a `forEach` step's item count): each one
 * fires the held transitions it decides, and the interpreter fires everything that follows.
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
  /** The held transitions enabled after the last event: what the net waits on from outside. */
  held: FlowNetHeldTransition[];
  problems: FlowRunReplayProblem[];
  /** Steps the run skipped. The net has no transition for skipping a step yet, so it doesn't show them skipped. */
  skippedStepRuns: FlowNetStepRun[];
};

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
    const record = (fired: readonly FlowNetFiring[]) => {
      for (const firing of fired) {
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

    const fire = (startedRun: FlowNetRun, ...held: FlowNetHeldFiring[]) => {
      for (const firing of held) {
        record(startedRun.fire(firing));
      }
    };

    /**
     * Starts the step run if the events didn't record it starting, and fails and retries its attempts they didn't
     * record, so `attempt` is in progress.
     *
     * @returns whether `attempt` is now in progress.
     */
    const catchUpToAttempt = (
      startedRun: FlowNetRun,
      stepRun: FlowRunEventStepRun,
      attempt: number,
    ) => {
      if (startedRun.isHeld("startStep", stepRun)) {
        fire(startedRun, { role: "startStep", stepRun });
      }

      for (;;) {
        const inProgress = startedRun.attemptInProgress(stepRun);

        if (inProgress === null) {
          problem(`${describeStepRun(stepRun)} has no attempt in progress`);
          return false;
        }

        if (inProgress === attempt) {
          return true;
        }

        if (inProgress > attempt) {
          problem(
            `Attempt ${inProgress} of ${describeStepRun(stepRun)} is in progress, not attempt ${attempt}`,
          );
          return false;
        }

        fire(
          startedRun,
          { role: "failAttempt", stepRun },
          { role: "retryAttempt", stepRun },
        );
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

          if (run.isHeld("startStep", stepRun)) {
            fire(run, { role: "startStep", stepRun });
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
            fire(run, {
              role: "succeedAttempt",
              stepRun: event.stepRun,
              outputNames: event.outputs.map(({ outputName }) => outputName),
            });
          }
          break;

        case "attemptFailed":
          if (catchUpToAttempt(run, event.stepRun, event.attempt)) {
            fire(
              run,
              { role: "failAttempt", stepRun: event.stepRun },
              {
                role: event.retrying ? "retryAttempt" : "giveUp",
                stepRun: event.stepRun,
              },
            );
          }
          break;

        case "stepGaveUp":
          /* An `attemptFailed` that isn't retrying has already given up, so only a step still trying gives up here. */
          if (run.attemptInProgress(event.stepRun) !== null) {
            if (catchUpToAttempt(run, event.stepRun, event.attempt)) {
              fire(
                run,
                { role: "failAttempt", stepRun: event.stepRun },
                { role: "giveUp", stepRun: event.stepRun },
              );
            }
          }
          break;

        case "forEachStarted": {
          const { stepRun } = event;

          if (run.isHeld("startForEach", stepRun)) {
            fire(run, {
              role: "startForEach",
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
    held: run?.held() ?? [],
    problems,
    skippedStepRuns,
  };
};

const countAtRootPlaces = (placedTokens: readonly FlowNetPlacedToken[]) => {
  const counts: Record<string, number> = {};

  for (const { position } of placedTokens) {
    if (position.kind === "place") {
      counts[position.placeId] = (counts[position.placeId] ?? 0) + 1;
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
    .filter(({ componentInstanceId }) => componentInstanceId === undefined)
    .map((firing) => ({
      transitionId: firing.transitionId,
      input: countAtRootPlaces(firing.consumed),
      output: countAtRootPlaces(firing.produced),
      ts: firing.occurredAt,
    })),
});
