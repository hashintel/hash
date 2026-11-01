import { defineSignal } from "@temporalio/workflow";

import type {
  FlowSignalType,
  StepAttemptFailedSignal,
  StepAttemptStartedSignal,
} from "@local/hash-isomorphic-utils/flows/types";

/*
 * Signals a step's activity sends its run's workflow about its attempts (see `signalStepAttempts`). Temporal records
 * only an activity's last attempt in the run's history, so these record the others, for the run's events.
 */

export const stepAttemptStartedSignal = defineSignal<
  [StepAttemptStartedSignal]
>("stepAttemptStarted" satisfies FlowSignalType);

export const stepAttemptFailedSignal = defineSignal<[StepAttemptFailedSignal]>(
  "stepAttemptFailed" satisfies FlowSignalType,
);
