import proto from "@temporalio/proto";

import { parseStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { StatusCode } from "@local/status";

import { parseHistoryItemPayload } from "../../temporal/parse-history-item-payload.js";

import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type {
  FlowRunEvent,
  FlowRunEventStepRun,
  FlowStepGaveUpReason,
} from "@local/hash-isomorphic-utils/flows/run-events";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  CheckpointLog,
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
  FlowSignalType,
  ProgressLogSignal,
  SkippedStep,
  StartedForEachStep,
  StepInput,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

const { EventType, RetryState, WorkflowTaskFailedCause } =
  proto.temporal.api.enums.v1;

export const nonStepActivityTypes = [
  "getFlowDefinitionActivity",
  "persistFlowActivity",
  "generateFlowRunName",
  "userHasPermissionToRunFlowInWebActivity",
];

const unknownErrorMessage = "Unknown error";

/** A step's activity type is its action definition id with this suffix, as `processFlowWorkflow` names it. */
const actionActivitySuffix = "Action";

const toStepRun = (stepRunId: string): FlowRunEventStepRun => {
  const { stepId, itemIndex } = parseStepRunId(stepRunId);

  return { stepId, itemPath: itemIndex === undefined ? [] : [itemIndex] };
};

const gaveUpReasonByRetryState: Partial<
  Record<proto.temporal.api.enums.v1.RetryState, FlowStepGaveUpReason>
> = {
  [RetryState.RETRY_STATE_MAXIMUM_ATTEMPTS_REACHED]: "attemptsExhausted",
  [RetryState.RETRY_STATE_NON_RETRYABLE_FAILURE]: "nonRetryable",
  [RetryState.RETRY_STATE_TIMEOUT]: "timedOut",
};

const toStepErrors = (
  stepErrors: NonNullable<
    NonNullable<RunFlowWorkflowResponse["contents"][number]>["stepErrors"]
  >,
) =>
  stepErrors.map(({ message, contents: [stepError] }) => {
    if (!stepError) {
      throw new Error(`No step id on step error: ${message}`);
    }

    return {
      stepRun: toStepRun(stepError.stepId),
      error: { message: message ?? unknownErrorMessage },
    };
  });

/**
 * The events of a flow run, from its Temporal history. An event depends only on its Temporal event and the ones
 * before it, so the events of a running run's history are a prefix of its events once it has finished.
 */
export const buildFlowRunEvents = (
  history: IHistoryEvent[],
): FlowRunEvent[] => {
  const events: FlowRunEvent[] = [];

  /** The step each activity is a run of, if it is one, and its attempt, once it has started. */
  const activitiesByScheduledEventId = new Map<
    string,
    { stepRun?: FlowRunEventStepRun; attempt: number }
  >();
  const reportedForEachStepIds = new Set<string>();
  const skippedStepIds = new Set<string>();
  const inputRequestStepRunsById = new Map<string, FlowRunEventStepRun>();

  for (const historyEvent of history) {
    const eventId = historyEvent.eventId?.toString();
    const { eventTime } = historyEvent;

    if (!eventId || !eventTime?.seconds) {
      throw new Error(
        `History event ${eventId ?? "with no id"} has no id or time`,
      );
    }

    const eventTimeIsoString = new Date(
      eventTime.seconds.toNumber() * 1000 + (eventTime.nanos ?? 0) / 1_000_000,
    ).toISOString();

    let index = 0;

    const addEvent = (
      event: DistributiveOmit<FlowRunEvent, "position" | "occurredAt">,
      occurredAt = eventTimeIsoString,
    ) => {
      events.push({ ...event, position: `${eventId}.${index}`, occurredAt });
      index += 1;
    };

    const parseFirstPayload = <T>(
      payloads: proto.temporal.api.common.v1.IPayloads | null | undefined,
      description: string,
    ): T => {
      const [value] = (parseHistoryItemPayload(payloads) ?? []) as unknown[];

      if (value === undefined) {
        throw new Error(`No ${description} on history event ${eventId}`);
      }

      return value as T;
    };

    const getActivity = (scheduledEventId: unknown) => {
      const activity = activitiesByScheduledEventId.get(
        String(scheduledEventId),
      );

      if (!activity) {
        throw new Error(
          `No scheduled activity ${String(scheduledEventId)} for history event ${eventId}`,
        );
      }

      return activity;
    };

    switch (historyEvent.eventType) {
      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED: {
        const params = parseFirstPayload<RunFlowWorkflowParams>(
          historyEvent.workflowExecutionStartedEventAttributes?.input,
          "workflow input",
        );

        addEvent({ kind: "runStarted", flowInputs: params.flowInputs });
        break;
      }

      case EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED: {
        const attributes = historyEvent.activityTaskScheduledEventAttributes;
        const activityId = attributes?.activityId;
        const activityType = attributes?.activityType?.name;

        if (!activityId || !activityType) {
          throw new Error(`No activity id or type on history event ${eventId}`);
        }

        const isStep = !nonStepActivityTypes.includes(activityType);

        activitiesByScheduledEventId.set(eventId, {
          ...(isStep ? { stepRun: toStepRun(activityId) } : {}),
          attempt: 1,
        });

        if (isStep) {
          if (!activityType.endsWith(actionActivitySuffix)) {
            throw new Error(
              `Step activity type ${activityType} doesn't end in "${actionActivitySuffix}", in history event ${eventId}`,
            );
          }

          const { inputs } = parseFirstPayload<{ inputs: StepInput[] }>(
            attributes.input,
            "step input",
          );

          addEvent({
            kind: "stepStarted",
            stepRun: toStepRun(activityId),
            stepType: activityType.slice(0, -actionActivitySuffix.length),
            inputs,
          });
        }
        break;
      }

      case EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED: {
        const attributes = historyEvent.activityTaskStartedEventAttributes;
        const activity = getActivity(attributes?.scheduledEventId);
        const attempt = attributes?.attempt ?? 1;

        activity.attempt = attempt;

        if (activity.stepRun) {
          const lastErrorMessage = attributes?.lastFailure?.message;

          addEvent({
            kind: "attemptStarted",
            stepRun: activity.stepRun,
            attempt,
            ...(attempt > 1
              ? {
                  hiddenAttempts: {
                    count: attempt - 1,
                    ...(lastErrorMessage
                      ? { lastError: { message: lastErrorMessage } }
                      : {}),
                  },
                }
              : {}),
          });
        }
        break;
      }

      case EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED: {
        const attributes = historyEvent.activityTaskCompletedEventAttributes;
        const { stepRun, attempt } = getActivity(attributes?.scheduledEventId);

        if (!stepRun) {
          break;
        }

        const status = parseFirstPayload<Status<{ outputs: StepOutput[] }>>(
          attributes?.result,
          "step result",
        );

        if (status.code === StatusCode.Ok) {
          addEvent({
            kind: "attemptSucceeded",
            stepRun,
            attempt,
            outputs: status.contents[0]?.outputs ?? [],
            ...(status.message ? { message: status.message } : {}),
          });
        } else {
          addEvent({
            kind: "attemptFailed",
            stepRun,
            attempt,
            error: { message: status.message ?? unknownErrorMessage },
            retrying: false,
          });
          addEvent({
            kind: "stepGaveUp",
            stepRun,
            attempt,
            reason: "errorStatus",
          });
        }
        break;
      }

      case EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED:
      case EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT: {
        const attributes =
          historyEvent.activityTaskFailedEventAttributes ??
          historyEvent.activityTaskTimedOutEventAttributes;
        const { stepRun, attempt } = getActivity(attributes?.scheduledEventId);

        if (!stepRun) {
          break;
        }

        addEvent({
          kind: "attemptFailed",
          stepRun,
          attempt,
          error: {
            message: attributes?.failure?.message ?? unknownErrorMessage,
          },
          retrying: false,
        });
        addEvent({
          kind: "stepGaveUp",
          stepRun,
          attempt,
          reason:
            historyEvent.eventType ===
            EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT
              ? "timedOut"
              : (gaveUpReasonByRetryState[attributes?.retryState ?? 0] ??
                "other"),
        });
        break;
      }

      case EventType.EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED: {
        const { stepRun } = getActivity(
          historyEvent.activityTaskCancelRequestedEventAttributes
            ?.scheduledEventId,
        );

        if (stepRun) {
          addEvent({ kind: "attemptCancellationRequested", stepRun });
        }
        break;
      }

      case EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED: {
        const { stepRun } = getActivity(
          historyEvent.activityTaskCanceledEventAttributes?.scheduledEventId,
        );

        if (stepRun) {
          addEvent({ kind: "attemptCancelled", stepRun });
        }
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_PROPERTIES_MODIFIED: {
        const memoFields =
          historyEvent.workflowPropertiesModifiedEventAttributes?.upsertedMemo
            ?.fields;

        if (memoFields?.startedForEachSteps) {
          const startedForEachSteps = parseFirstPayload<StartedForEachStep[]>(
            { payloads: [memoFields.startedForEachSteps] },
            "started forEach steps",
          );

          for (const { stepId, itemCount, startedAt } of startedForEachSteps) {
            if (reportedForEachStepIds.has(stepId)) {
              continue;
            }

            reportedForEachStepIds.add(stepId);

            addEvent(
              { kind: "forEachStarted", stepRun: toStepRun(stepId), itemCount },
              startedAt,
            );
          }
        }

        if (memoFields?.skippedSteps) {
          const skippedSteps = parseFirstPayload<SkippedStep[]>(
            { payloads: [memoFields.skippedSteps] },
            "skipped steps",
          );

          for (const { stepId, stepType, skippedAt } of skippedSteps) {
            if (skippedStepIds.has(stepId)) {
              continue;
            }

            skippedStepIds.add(stepId);

            addEvent(
              { kind: "stepSkipped", stepRun: toStepRun(stepId), stepType },
              skippedAt,
            );
          }
        }
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED: {
        const attributes =
          historyEvent.workflowExecutionSignaledEventAttributes;

        switch (attributes?.signalName as FlowSignalType | undefined) {
          case "logProgress": {
            const { attempt, logs } = parseFirstPayload<ProgressLogSignal>(
              attributes?.input,
              "progress logs",
            );

            for (const log of logs) {
              addEvent({
                kind: "progressLogged",
                stepRun: toStepRun(log.stepId),
                loggedInAttempt: attempt,
                log,
              });
            }
            break;
          }

          case "researchActionCheckpoint": {
            const { checkpointId, recordedAt, stepId } = parseFirstPayload<
              Omit<CheckpointLog, "eventId" | "type">
            >(attributes?.input, "checkpoint");

            addEvent({
              kind: "progressLogged",
              stepRun: toStepRun(stepId),
              log: {
                type: "ResearchActionCheckpoint",
                checkpointId,
                eventId: Number(eventId) + 2,
                recordedAt,
                stepId,
              },
            });
            break;
          }

          case "externalInputRequest": {
            const request = parseFirstPayload<ExternalInputRequestSignal>(
              attributes?.input,
              "input request",
            );

            if (inputRequestStepRunsById.has(request.requestId)) {
              break;
            }

            const stepRun = toStepRun(request.stepId);
            inputRequestStepRunsById.set(request.requestId, stepRun);

            addEvent({ kind: "inputRequested", stepRun, request });
            break;
          }

          case "externalInputResponse": {
            const response = parseFirstPayload<ExternalInputResponseSignal>(
              attributes?.input,
              "input response",
            );
            const requestStepRun = inputRequestStepRunsById.get(
              response.requestId,
            );

            addEvent({
              kind: "inputResolved",
              ...(requestStepRun ? { requestStepRun } : {}),
              requestId: response.requestId,
              response,
            });
            break;
          }
        }
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_TASK_FAILED: {
        const attributes = historyEvent.workflowTaskFailedEventAttributes;

        if (
          attributes?.cause ===
          WorkflowTaskFailedCause.WORKFLOW_TASK_FAILED_CAUSE_RESET_WORKFLOW
        ) {
          if (!attributes.baseRunId) {
            throw new Error(`No base run id on reset history event ${eventId}`);
          }

          addEvent({ kind: "runReset", fromRunId: attributes.baseRunId });
        }
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED: {
        const result = parseFirstPayload<RunFlowWorkflowResponse>(
          historyEvent.workflowExecutionCompletedEventAttributes?.result,
          "workflow result",
        );
        const { outputs, stepErrors } = result.contents[0] ?? {};

        addEvent({
          kind: "runFinished",
          status: FlowRunStatus.Completed,
          ...(outputs ? { flowOutputs: outputs } : {}),
          ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
        });
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED: {
        const failure =
          historyEvent.workflowExecutionFailedEventAttributes?.failure;
        /* Not every failure's details have `contents`, e.g. a step input its action doesn't define. */
        const [details] =
          (parseHistoryItemPayload(failure?.applicationFailureInfo?.details) as
            | Partial<RunFlowWorkflowResponse>[]
            | undefined) ?? [];
        const stepErrors = details?.contents?.[0]?.stepErrors;

        addEvent({
          kind: "runFinished",
          status: FlowRunStatus.Failed,
          failure: { message: failure?.message ?? unknownErrorMessage },
          ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
        });
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED: {
        addEvent({ kind: "runFinished", status: FlowRunStatus.Cancelled });
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED: {
        const reason =
          historyEvent.workflowExecutionTerminatedEventAttributes?.reason;

        addEvent({
          kind: "runFinished",
          status: FlowRunStatus.Terminated,
          ...(reason ? { failure: { message: reason } } : {}),
        });
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT: {
        addEvent({ kind: "runFinished", status: FlowRunStatus.TimedOut });
        break;
      }
    }
  }

  return events;
};
