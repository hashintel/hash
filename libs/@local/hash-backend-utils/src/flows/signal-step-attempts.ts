import { Context } from "@temporalio/activity";
import { ApplicationFailure, CancelledFailure } from "@temporalio/common";

import { createTemporalClient } from "../temporal.js";
import {
  stepAttemptFailedSignal,
  stepAttemptStartedSignal,
} from "./step-attempt-signals.js";

import type { Info } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client";
import type { SignalDefinition } from "@temporalio/workflow";

let temporalClient: TemporalClient | undefined;

/** Signals the activity's run's workflow, logging rather than failing the action if it can't. */
const signalRun = async <Payload>(
  info: Info,
  signal: SignalDefinition<[Payload]>,
  payload: Payload,
) => {
  const { workflowExecution } = info;

  if (!workflowExecution) {
    return;
  }

  try {
    temporalClient ??= await createTemporalClient();

    await temporalClient.workflow
      .getHandle(workflowExecution.workflowId, workflowExecution.runId)
      .signal(signal, payload);
  } catch (error) {
    Context.current().log.warn(
      `Couldn't signal ${signal.name} for activity ${info.activityId}: ${(error as Error).message}`,
    );
  }
};

/**
 * Wraps each of a worker's flow action activities so that it signals its run's workflow when an attempt starts, and
 * when an attempt throws. Temporal records only an activity's last attempt in its run's history, so the signals
 * record the others, for the run's events. An attempt's error is rethrown, so retries are unchanged.
 */
export const signalStepAttempts = <
  Activities extends Record<string, (...args: never[]) => Promise<unknown>>,
>(
  activities: Activities,
): Activities =>
  Object.fromEntries(
    Object.entries(activities).map(([activityName, activity]) => [
      activityName,
      async (...args: Parameters<typeof activity>) => {
        const { info } = Context.current();
        const stepRunId = info.activityId;

        await signalRun(info, stepAttemptStartedSignal, {
          stepRunId,
          attempt: info.attempt,
        });

        try {
          return await activity(...args);
        } catch (error) {
          /* A cancelled attempt is in the history as a cancellation. */
          if (!(error instanceof CancelledFailure)) {
            await signalRun(info, stepAttemptFailedSignal, {
              stepRunId,
              attempt: info.attempt,
              error: {
                message: (error as Error).message,
                ...(error instanceof ApplicationFailure && error.type
                  ? { type: error.type }
                  : error instanceof Error
                    ? { type: error.name }
                    : {}),
              },
              nonRetryable:
                error instanceof ApplicationFailure && error.nonRetryable,
            });
          }

          throw error;
        }
      },
    ]),
  ) as Activities;
