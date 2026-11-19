import proto from "@temporalio/proto";

import {
  toStepErrors,
  toStepRun,
  unknownErrorMessage,
} from "@local/hash-isomorphic-utils/flows/run-events";
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
  FlowRunEnding,
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
  StepAttemptFailedSignal,
  StepAttemptStartedSignal,
  StartedForEachStep,
  StepInput,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

const { EventType, RetryState, WorkflowTaskFailedCause } =
  proto.temporal.api.enums.v1;

const nonStepActivityTypes = [
  "getFlowDefinitionActivity",
  "persistFlowActivity",
  "recordFlowRunActivity",
  "generateFlowRunName",
  "saveOpenInputRequestsActivity",
  "userHasPermissionToRunFlowInWebActivity",
];

/** A step's activity type is its action definition id with this suffix, as `processFlowWorkflow` names it. */
const actionActivitySuffix = "Action";

const gaveUpReasonByRetryState: Partial<
  Record<proto.temporal.api.enums.v1.RetryState, FlowStepGaveUpReason>
> = {
  [RetryState.RETRY_STATE_MAXIMUM_ATTEMPTS_REACHED]: "attemptsExhausted",
  [RetryState.RETRY_STATE_NON_RETRYABLE_FAILURE]: "nonRetryable",
  [RetryState.RETRY_STATE_TIMEOUT]: "timedOut",
};

type RunFinishedEvent = Extract<FlowRunEvent, { kind: "runFinished" }>;

const runFinishedStatusByEndingKind = {
  completed: FlowRunStatus.Completed,
  failed: FlowRunStatus.Failed,
  cancelled: FlowRunStatus.Cancelled,
  terminated: FlowRunStatus.Terminated,
  timedOut: FlowRunStatus.TimedOut,
} as const satisfies Record<FlowRunEnding["kind"], RunFinishedEvent["status"]>;

/** The event for how a run ended, without its place in the run's history. */
export const getRunFinishedEvent = (
  ending: FlowRunEnding,
): Omit<RunFinishedEvent, "position" | "occurredAt"> => {
  const status = runFinishedStatusByEndingKind[ending.kind];

  if (ending.kind === "terminated") {
    return {
      kind: "runFinished",
      status,
      ...(ending.reason ? { failure: { message: ending.reason } } : {}),
    };
  }

  const { kind: _kind, ...fields } = ending;

  return { kind: "runFinished", status, ...fields };
};

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
    {
      stepRun?: FlowRunEventStepRun;
      attempt: number;
      /** Attempts whose start a `stepAttemptStarted` signal recorded, before the activity's last attempt is. */
      signalledStarts: Set<number>;
      /** Attempts that are known to have failed, from a `stepAttemptFailed` signal or a later attempt's start. */
      failedAttempts: Set<number>;
      /** Whether the history has recorded the activity's last attempt (`ACTIVITY_TASK_STARTED`). */
      lastAttemptRecorded: boolean;
      /** The latest attempt an event has reported, as started or as hidden. */
      reportedUpTo: number;
    }
  >();
  /** The activity most recently scheduled with each activity id: a step run's id, for a step's activity. */
  const scheduledEventIdsByActivityId = new Map<string, string>();
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

    /**
     * Records the most recent attempt whose start a signal recorded as failed, when a later attempt starts and nothing
     * said it failed: it ended without throwing, e.g. by timing out.
     */
    const failUnfailedAttempt = (
      activity: ReturnType<typeof getActivity>,
      stepRun: FlowRunEventStepRun,
      laterAttempt: number,
      error: { message: string },
    ) => {
      const attempt = Math.max(
        0,
        ...[...activity.signalledStarts].filter(
          (signalled) => signalled < laterAttempt,
        ),
      );

      if (attempt === 0 || activity.failedAttempts.has(attempt)) {
        return;
      }

      activity.failedAttempts.add(attempt);
      addEvent({
        kind: "attemptFailed",
        stepRun,
        attempt,
        error,
        retrying: true,
      });
    };

    /**
     * How many attempts before `attempt` no event has reported, which its start reports as hidden: their signals
     * didn't arrive. Each start records itself in `reportedUpTo`, so each attempt is counted once, whether its start is
     * signalled or Temporal records it.
     */
    const countHiddenAttempts = (
      { reportedUpTo }: ReturnType<typeof getActivity>,
      attempt: number,
    ) => Math.max(0, attempt - 1 - reportedUpTo);

    /** The step activity a signal about an attempt is about, if the history has scheduled it. */
    const getSignalledStepActivity = (stepRunId: string) => {
      const scheduledEventId = scheduledEventIdsByActivityId.get(stepRunId);
      const activity =
        scheduledEventId === undefined
          ? undefined
          : activitiesByScheduledEventId.get(scheduledEventId);

      return activity?.stepRun
        ? { activity, stepRun: activity.stepRun }
        : undefined;
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
          signalledStarts: new Set(),
          failedAttempts: new Set(),
          lastAttemptRecorded: false,
          reportedUpTo: 0,
        });
        scheduledEventIdsByActivityId.set(activityId, eventId);

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
        activity.lastAttemptRecorded = true;

        if (activity.stepRun) {
          const lastErrorMessage = attributes?.lastFailure?.message;
          const previousAttemptSignalled = activity.signalledStarts.has(
            attempt - 1,
          );

          failUnfailedAttempt(activity, activity.stepRun, attempt, {
            message:
              (previousAttemptSignalled ? lastErrorMessage : undefined) ??
              unknownErrorMessage,
          });

          if (!activity.signalledStarts.has(attempt)) {
            const hiddenCount = countHiddenAttempts(activity, attempt);

            activity.reportedUpTo = Math.max(activity.reportedUpTo, attempt);

            addEvent({
              kind: "attemptStarted",
              stepRun: activity.stepRun,
              attempt,
              ...(hiddenCount > 0
                ? {
                    hiddenAttempts: {
                      count: hiddenCount,
                      ...(lastErrorMessage && !previousAttemptSignalled
                        ? { lastError: { message: lastErrorMessage } }
                        : {}),
                    },
                  }
                : {}),
            });
          }
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
          /* A timeout on the last attempt the retry policy allows has run out of attempts, not time. */
          reason:
            gaveUpReasonByRetryState[attributes?.retryState ?? 0] ??
            (historyEvent.eventType ===
            EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT
              ? "timedOut"
              : "other"),
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
          case "stepAttemptStarted": {
            const { stepRunId, attempt, previousAttemptError } =
              parseFirstPayload<StepAttemptStartedSignal>(
                attributes?.input,
                "step attempt",
              );
            const signalled = getSignalledStepActivity(stepRunId);

            if (!signalled || signalled.activity.lastAttemptRecorded) {
              break;
            }

            const { activity, stepRun } = signalled;
            const previousAttemptSignalled = activity.signalledStarts.has(
              attempt - 1,
            );

            failUnfailedAttempt(activity, stepRun, attempt, {
              message:
                (previousAttemptSignalled
                  ? previousAttemptError?.message
                  : undefined) ?? unknownErrorMessage,
            });
            const hiddenCount = countHiddenAttempts(activity, attempt);

            activity.reportedUpTo = Math.max(activity.reportedUpTo, attempt);

            activity.signalledStarts.add(attempt);
            activity.attempt = attempt;
            /* The attempts before it whose signals didn't arrive, the last of which failed with the previous attempt's error. */
            addEvent({
              kind: "attemptStarted",
              stepRun,
              attempt,
              ...(hiddenCount > 0
                ? {
                    hiddenAttempts: {
                      count: hiddenCount,
                      ...(previousAttemptError && !previousAttemptSignalled
                        ? { lastError: previousAttemptError }
                        : {}),
                    },
                  }
                : {}),
            });
            break;
          }

          case "stepAttemptFailed": {
            const { stepRunId, attempt, error } =
              parseFirstPayload<StepAttemptFailedSignal>(
                attributes?.input,
                "step attempt failure",
              );
            const signalled = getSignalledStepActivity(stepRunId);

            if (
              !signalled ||
              signalled.activity.lastAttemptRecorded ||
              signalled.activity.failedAttempts.has(attempt)
            ) {
              break;
            }

            /* Only a failure Temporal retries is signalled: the last attempt's is in the history. */
            signalled.activity.failedAttempts.add(attempt);
            addEvent({
              kind: "attemptFailed",
              stepRun: signalled.stepRun,
              attempt,
              error: { message: error.message },
              retrying: true,
            });
            break;
          }

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

        addEvent(
          getRunFinishedEvent({
            kind: "completed",
            flowOutputs: outputs ?? [],
            ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
          }),
        );
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

        addEvent(
          getRunFinishedEvent({
            kind: "failed",
            failure: {
              message: failure?.message ?? unknownErrorMessage,
              ...(details?.code ? { code: details.code } : {}),
            },
            ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
          }),
        );
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED: {
        addEvent(getRunFinishedEvent({ kind: "cancelled" }));
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED: {
        const reason =
          historyEvent.workflowExecutionTerminatedEventAttributes?.reason;

        addEvent(
          getRunFinishedEvent({
            kind: "terminated",
            ...(reason ? { reason } : {}),
          }),
        );
        break;
      }

      case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT: {
        addEvent(getRunFinishedEvent({ kind: "timedOut" }));
        break;
      }
    }
  }

  return events;
};
