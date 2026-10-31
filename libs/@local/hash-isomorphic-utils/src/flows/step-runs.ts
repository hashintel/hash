import { FlowRunStatus, FlowStepStatus } from "../graphql/api-types.gen.js";
import { getInputRequests, unknownErrorMessage } from "./run-events.js";
import { generateStepRunId } from "./step-run-id.js";

import type {
  FlowRunEvent,
  FlowRunEventError,
  FlowRunEventStepRun,
  FlowStepGaveUpReason,
} from "./run-events.js";
import type { StepInput, StepOutput, StepProgressLog } from "./types.js";

/** A run of a step, as its run's events leave it. */
export type FlowRunStepRunState = {
  /** The step's id, or for a step inside a `forEach`, its step run id. */
  stepId: string;
  /** The step's action definition id followed by `Action`, or for a skipped step, its action definition id. */
  stepType: string;
  status: FlowStepStatus;
  /** When it was last scheduled. */
  scheduledAt: string;
  /** When its latest attempt started. */
  startedAt?: string;
  /** When it closed: empty while it's open, and when its run stopped early, when the run closed. */
  closedAt?: string;
  attempt: number;
  /** The inputs it was last scheduled with. */
  inputs: StepInput[];
  logs: StepProgressLog[];
  /** The error of its latest failed attempt, while it's retried or once it gave up because of it. */
  lastFailure?: FlowRunEventError;
  gaveUpReason?: FlowStepGaveUpReason;
  /** Its outputs, once an attempt succeeded. */
  outputs?: StepOutput[];
  /** The message of the status its action gave with its outputs, if it gave one. */
  outputsMessage?: string;
  /** The error of the non-OK status its action completed with. */
  errorStatus?: FlowRunEventError;
};

type FlowRunEventOfKind<Kind extends FlowRunEvent["kind"]> = Extract<
  FlowRunEvent,
  { kind: Kind }
>;

const toStepRunId = ({ stepId, itemPath: [itemIndex] }: FlowRunEventStepRun) =>
  itemIndex === undefined ? stepId : generateStepRunId(stepId, itemIndex);

/**
 * Each step run's state after its latest activity event, latest first: its last scheduling's inputs, its latest
 * attempt, and what happened last. A step still scheduled or running when its run stopped early counts as cancelled.
 */
const getStepRunsFromActivityEvents = (
  runEvents: FlowRunEvent[],
  {
    workflowStoppedEarly,
    workflowClosedAt,
  }: { workflowStoppedEarly: boolean; workflowClosedAt?: string },
): Map<string, FlowRunStepRunState> => {
  const activitiesByStepRunId = new Map<
    string,
    {
      stepStarted: FlowRunEventOfKind<"stepStarted">;
      attemptStarted?: FlowRunEventOfKind<"attemptStarted">;
      attemptFailed?: FlowRunEventOfKind<"attemptFailed">;
    }
  >();
  const stepRunsById = new Map<string, FlowRunStepRunState>();

  for (const event of runEvents) {
    if (
      event.kind !== "stepStarted" &&
      event.kind !== "attemptStarted" &&
      event.kind !== "attemptSucceeded" &&
      event.kind !== "attemptFailed" &&
      event.kind !== "stepGaveUp" &&
      event.kind !== "attemptCancellationRequested" &&
      event.kind !== "attemptCancelled"
    ) {
      continue;
    }

    const stepRunId = toStepRunId(event.stepRun);

    if (event.kind === "stepStarted") {
      activitiesByStepRunId.set(stepRunId, { stepStarted: event });
    }

    const activity = activitiesByStepRunId.get(stepRunId);
    if (!activity) {
      throw new Error(
        `Step run ${stepRunId} has a ${event.kind} event at ${event.position} before it started`,
      );
    }

    if (event.kind === "attemptStarted") {
      activity.attemptStarted = event;
    } else if (event.kind === "attemptFailed") {
      /* Followed by the step giving up, or for a failure Temporal retries, by the next attempt starting. */
      activity.attemptFailed = event;
      continue;
    }

    const { stepStarted, attemptStarted } = activity;

    const stepRun: FlowRunStepRunState = {
      stepId: stepRunId,
      stepType: `${stepStarted.stepType}Action`,
      startedAt: attemptStarted?.occurredAt,
      scheduledAt: stepStarted.occurredAt,
      closedAt: workflowStoppedEarly ? workflowClosedAt : "",
      inputs: stepStarted.inputs,
      logs: [],
      status: workflowStoppedEarly
        ? FlowStepStatus.Cancelled
        : FlowStepStatus.Scheduled,
      attempt: attemptStarted?.attempt ?? 1,
    };

    switch (event.kind) {
      case "attemptStarted": {
        if (!workflowStoppedEarly) {
          stepRun.status = FlowStepStatus.Started;

          /* A retry: the error is the previous attempt's, recorded by its signal if Temporal didn't record it. */
          if (event.attempt > 1) {
            const lastError =
              event.hiddenAttempts?.lastError ?? activity.attemptFailed?.error;

            stepRun.lastFailure = lastError;
            stepRun.logs.push({
              type: "ActivityFailed",
              stepId: stepRunId,
              recordedAt: event.occurredAt,
              retrying: true,
              message: lastError?.message ?? unknownErrorMessage,
            });
          }
        }
        break;
      }

      case "attemptSucceeded": {
        stepRun.outputs = event.outputs;
        if (event.message) {
          stepRun.outputsMessage = event.message;
        }
        stepRun.status = FlowStepStatus.Completed;
        stepRun.closedAt = event.occurredAt;
        break;
      }

      case "stepGaveUp": {
        const message =
          activity.attemptFailed?.error.message ?? unknownErrorMessage;

        stepRun.closedAt = event.occurredAt;
        stepRun.gaveUpReason = event.reason;

        if (event.reason === "errorStatus") {
          stepRun.errorStatus = { message };
          stepRun.status = FlowStepStatus.Failed;
          break;
        }

        stepRun.lastFailure = { message };

        if (event.reason === "timedOut") {
          stepRun.status = FlowStepStatus.TimedOut;
        } else {
          stepRun.status = FlowStepStatus.Failed;
          stepRun.logs.push({
            type: "ActivityFailed",
            stepId: stepRunId,
            recordedAt: event.occurredAt,
            retrying: false,
            message,
          });
        }
        break;
      }

      case "attemptCancellationRequested": {
        stepRun.status = FlowStepStatus.CancelRequested;
        break;
      }

      case "attemptCancelled": {
        stepRun.status = FlowStepStatus.Cancelled;
        stepRun.closedAt = event.occurredAt;
        break;
      }
    }

    stepRunsById.delete(stepRunId);
    stepRunsById.set(stepRunId, stepRun);
  }

  return new Map([...stepRunsById].reverse());
};

const stoppedEarlyStatuses: FlowRunStatus[] = [
  FlowRunStatus.Terminated,
  FlowRunStatus.Cancelled,
  FlowRunStatus.TimedOut,
  FlowRunStatus.Failed,
];

/**
 * The runs of a flow run's steps, latest first, from its events: each with its logs, sorted by when they were
 * recorded, and a step waiting on an answer to an input request as requiring information. Skipped steps come last.
 */
export const getStepRunsFromEvents = (
  runEvents: FlowRunEvent[],
  { status, closedAt }: { status: FlowRunStatus; closedAt?: string | null },
): FlowRunStepRunState[] => {
  const workflowStoppedEarly = stoppedEarlyStatuses.includes(status);

  const stepRunsById = getStepRunsFromActivityEvents(runEvents, {
    workflowStoppedEarly,
    workflowClosedAt: closedAt ?? undefined,
  });

  for (const event of runEvents) {
    if (event.kind !== "progressLogged") {
      continue;
    }

    const stepRun = stepRunsById.get(event.log.stepId);
    if (!stepRun) {
      throw new Error(
        `No step run ${event.log.stepId} for the log at ${event.position}`,
      );
    }

    stepRun.logs.push(event.log);
  }

  if (!workflowStoppedEarly) {
    for (const inputRequest of getInputRequests(runEvents)) {
      if (inputRequest.resolvedAt) {
        continue;
      }

      const step = stepRunsById.get(inputRequest.stepId);
      if (!step) {
        throw new Error(
          `Could not find step with id ${inputRequest.stepId} for input request with id ${inputRequest.requestId}`,
        );
      }
      step.status = FlowStepStatus.InformationRequired;
    }
  }

  for (const event of runEvents) {
    if (event.kind !== "stepSkipped") {
      continue;
    }

    const stepRunId = toStepRunId(event.stepRun);

    stepRunsById.set(stepRunId, {
      stepId: stepRunId,
      stepType: event.stepType,
      scheduledAt: event.occurredAt,
      closedAt: event.occurredAt,
      attempt: 0,
      inputs: [],
      logs: [],
      status: FlowStepStatus.Skipped,
    });
  }

  for (const step of stepRunsById.values()) {
    step.logs.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }

  return [...stepRunsById.values()];
};
