import { parseStepRunId } from "./step-run-id.js";

import type { FlowRunStatus } from "../graphql/api-types.gen.js";
import type {
  ExternalInputRequest,
  ExternalInputRequestSignal,
  ExternalInputResponseWithoutUser,
  FlowInputValues,
  StepInput,
  StepOutput,
  StepProgressLog,
} from "./types.js";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { Status, StatusCode } from "@local/status";

/** A run of a step: the step's id in the definition and, inside `forEach` steps, its item's index in each, outermost first. */
export type FlowRunEventStepRun = { stepId: string; itemPath: number[] };

export type FlowRunEventError = {
  message: string;
  /** The code of the status the run or step failed with, when it gave one. */
  code?: StatusCode;
};

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
  stepErrors.flatMap(({ code, message, contents: [stepError] }) =>
    stepError
      ? [
          {
            stepRun: toStepRun(stepError.stepId),
            error: { message: message ?? unknownErrorMessage, code },
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

/**
 * A run's input requests, from its events, latest first. A request takes its data and time from its first signal, and
 * once answered, its answer and time from its first response. An answered request's `stepId` is `"unresolved"`.
 */
export const getInputRequests = (
  events: FlowRunEvent[],
): ExternalInputRequest[] => {
  const inputRequestsById = new Map<string, ExternalInputRequest>();
  const lastEventIndexByRequestId = new Map<string, number>();

  for (const [index, event] of events.entries()) {
    if (event.kind !== "inputRequested" && event.kind !== "inputResolved") {
      continue;
    }

    const requestId =
      event.kind === "inputRequested"
        ? event.request.requestId
        : event.requestId;
    const existingRequest = inputRequestsById.get(requestId);

    lastEventIndexByRequestId.set(requestId, index);

    if (existingRequest?.resolvedAt) {
      continue;
    }

    if (event.kind === "inputRequested") {
      inputRequestsById.set(requestId, {
        ...event.request,
        raisedAt: event.occurredAt,
      });
    } else {
      const { data, type } = event.response;

      inputRequestsById.set(requestId, {
        data: (existingRequest?.data ?? {}) as never,
        answers: "answers" in data ? data.answers : undefined,
        requestId,
        stepId: "unresolved",
        type,
        raisedAt: existingRequest?.raisedAt ?? "",
        resolvedAt: event.occurredAt,
      });
    }
  }

  return [...inputRequestsById.values()].sort(
    (left, right) =>
      (lastEventIndexByRequestId.get(right.requestId) ?? 0) -
      (lastEventIndexByRequestId.get(left.requestId) ?? 0),
  );
};

/** A run's input requests that haven't been answered, latest first. A run that has finished has none. */
export const getOpenInputRequests = (
  events: FlowRunEvent[],
): ExternalInputRequest[] =>
  findRunFinishedEvent(events)
    ? []
    : getInputRequests(events).filter(({ resolvedAt }) => !resolvedAt);
