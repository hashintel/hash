import { parseStepRunId } from "./step-run-id.js";

import type { FlowRunStatus } from "../graphql/api-types.gen.js";
import type {
  ExternalInputRequestSignal,
  ExternalInputResponseWithoutUser,
  FlowInputValues,
  StepInput,
  StepOutput,
  StepProgressLog,
} from "./types.js";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { Status } from "@local/status";

/** A run of a step: the step's id in the definition and, inside `forEach` steps, its item's index in each, outermost first. */
export type FlowRunEventStepRun = { stepId: string; itemPath: number[] };

export type FlowRunEventError = { message: string };

/** A step that failed after its action returned (e.g. an output of the wrong kind). */
export type FlowRunStepError = {
  stepRun: FlowRunEventStepRun;
  error: FlowRunEventError;
};

export const unknownErrorMessage = "Unknown error";

export const toStepRun = (stepRunId: string): FlowRunEventStepRun => {
  const { stepId, itemIndex } = parseStepRunId(stepRunId);

  return { stepId, itemPath: itemIndex === undefined ? [] : [itemIndex] };
};

/**
 * Step errors as the workflow reports them in its result. One without a step id is left out rather than thrown on: the
 * workflow converts them as it ends, where an error would fail its task and keep the run from ending.
 */
export const toStepErrors = (
  stepErrors: Status<{ stepId: string }>[],
): FlowRunStepError[] =>
  stepErrors.flatMap(({ message, contents: [stepError] }) =>
    stepError
      ? [
          {
            stepRun: toStepRun(stepError.stepId),
            error: { message: message ?? unknownErrorMessage },
          },
        ]
      : [],
  );

export type FlowStepGaveUpReason =
  | "attemptsExhausted" /* every attempt the retry policy allows failed */
  | "nonRetryable" /* the action threw a failure marked non-retryable */
  | "timedOut" /* the action ran out of time to complete */
  | "errorStatus" /* the action completed with a non-OK status */
  | "other";

type FlowRunEventBase = {
  /** `"<eventId>.<index>"`: where the event is in the run's history. */
  position: string;
  /** When it happened, as an ISO string. */
  occurredAt: string;
};

export type FlowRunEvent = FlowRunEventBase &
  (
    | { kind: "runStarted"; flowInputs: FlowInputValues }
    | {
        kind: "stepStarted";
        stepRun: FlowRunEventStepRun;
        /** The step's action definition id, as on `stepSkipped`. */
        stepType: string;
        inputs: StepInput[];
      }
    | {
        kind: "attemptStarted";
        stepRun: FlowRunEventStepRun;
        attempt: number;
        /** Earlier attempts that failed and were retried, which Temporal doesn't record one by one. */
        hiddenAttempts?: { count: number; lastError?: FlowRunEventError };
      }
    | {
        kind: "attemptSucceeded";
        stepRun: FlowRunEventStepRun;
        attempt: number;
        outputs: StepOutput[];
        /** The message of the action's status, if it gave one. */
        message?: string;
      }
    | {
        kind: "attemptFailed";
        stepRun: FlowRunEventStepRun;
        attempt: number;
        error: FlowRunEventError;
        retrying: boolean;
      }
    | {
        kind: "stepGaveUp";
        stepRun: FlowRunEventStepRun;
        attempt: number;
        reason: FlowStepGaveUpReason;
      }
    | { kind: "attemptCancellationRequested"; stepRun: FlowRunEventStepRun }
    | { kind: "attemptCancelled"; stepRun: FlowRunEventStepRun }
    | { kind: "stepSkipped"; stepRun: FlowRunEventStepRun; stepType: string }
    | {
        kind: "forEachStarted";
        stepRun: FlowRunEventStepRun;
        itemCount: number;
      }
    | {
        kind: "inputRequested";
        stepRun: FlowRunEventStepRun;
        request: ExternalInputRequestSignal;
      }
    | {
        kind: "inputResolved";
        /** The step that raised the request, if the request is in the history. */
        requestStepRun?: FlowRunEventStepRun;
        requestId: string;
        response: ExternalInputResponseWithoutUser & {
          resolvedBy?: ActorEntityUuid;
        };
      }
    | {
        kind: "progressLogged";
        stepRun: FlowRunEventStepRun;
        /** The attempt the log came from, when its signal records it. */
        loggedInAttempt?: number;
        log: StepProgressLog;
      }
    | { kind: "runReset"; fromRunId: string }
    | {
        kind: "runFinished";
        status:
          | FlowRunStatus.Completed
          | FlowRunStatus.Failed
          | FlowRunStatus.Cancelled
          | FlowRunStatus.Terminated
          | FlowRunStatus.TimedOut;
        /** The flow's outputs, when it completed. */
        flowOutputs?: StepOutput[];
        failure?: FlowRunEventError;
        /** Steps that failed after their action returned, when the run records them. */
        stepErrors?: FlowRunStepError[];
      }
  );

type RunFinishedEvent = Extract<FlowRunEvent, { kind: "runFinished" }>;

/** The event for how a run ended, if it has. */
export const findRunFinishedEvent = (
  events: FlowRunEvent[],
): RunFinishedEvent | undefined =>
  events.find(
    (event): event is RunFinishedEvent => event.kind === "runFinished",
  );
