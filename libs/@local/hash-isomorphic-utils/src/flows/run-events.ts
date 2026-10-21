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

/** A run of a step: the step's id in the definition and, inside `forEach` steps, its item's index in each, outermost first. */
export type FlowRunEventStepRun = { stepId: string; itemPath: number[] };

export type FlowRunEventError = { message: string };

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
    | { kind: "runStarted"; inputs: FlowInputValues }
    | { kind: "stepStarted"; stepRun: FlowRunEventStepRun; inputs: StepInput[] }
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
        stepRun?: FlowRunEventStepRun;
        requestId: string;
        response: ExternalInputResponseWithoutUser & {
          resolvedBy?: ActorEntityUuid;
        };
      }
    | {
        kind: "progressLogged";
        stepRun: FlowRunEventStepRun;
        attempt?: number;
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
        outputs?: StepOutput[];
        error?: FlowRunEventError;
        /** Steps that failed after their action returned (e.g. an output of the wrong kind), when the run records them. */
        stepErrors?: {
          stepRun: FlowRunEventStepRun;
          error: FlowRunEventError;
        }[];
      }
  );
