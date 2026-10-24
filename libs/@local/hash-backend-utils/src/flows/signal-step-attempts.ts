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

let temporalClientConnection: Promise<TemporalClient> | undefined;

/**
 * The worker's Temporal client. Attempts that start together share one connection, and a failed connection is tried
 * again by the next signal.
 */
const getTemporalClient = () => {
  temporalClientConnection ??= createTemporalClient().catch(
    (error: unknown) => {
      temporalClientConnection = undefined;
      throw error;
    },
  );

  return temporalClientConnection;
};

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
    const temporalClient = await getTemporalClient();

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
 * Whether Temporal retries an attempt that threw `error`, from the activity's retry policy: unless the error is
 * non-retryable, or its type is one the policy lists, while the policy allows another attempt (0 is unlimited).
 */
export const isRetried = (
  { attempt, retryPolicy }: Pick<Info, "attempt" | "retryPolicy">,
  error: unknown,
) => {
  const errorType =
    error instanceof ApplicationFailure
      ? error.type
      : error instanceof Error
        ? error.name
        : undefined;

  return (
    !(error instanceof ApplicationFailure && error.nonRetryable) &&
    !(errorType && retryPolicy?.nonRetryableErrorTypes?.includes(errorType)) &&
    (!retryPolicy?.maximumAttempts || attempt < retryPolicy.maximumAttempts)
  );
};

/**
 * Wraps each of a worker's flow action activities so that it signals its run's workflow when an attempt starts, and
 * when an attempt throws and Temporal retries it. Temporal records only an activity's last attempt in its run's
 * history, so the signals record the others, for the run's events. The last attempt's failure is in the history, so
 * it isn't signalled. An attempt's error is rethrown, so retries are unchanged.
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
          if (!(error instanceof CancelledFailure) && isRetried(info, error)) {
            await signalRun(info, stepAttemptFailedSignal, {
              stepRunId,
              attempt: info.attempt,
              error: { message: (error as Error).message },
            });
          }

          throw error;
        }
      },
    ]),
  ) as Activities;
