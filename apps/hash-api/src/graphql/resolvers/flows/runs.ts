import type {
  ExternalInputRequest,
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
  ProgressLogSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  Client as TemporalClient,
  WorkflowExecutionInfo,
} from "@temporalio/client";
import proto from "@temporalio/proto";

import { isProdEnv } from "../../../lib/env-config";
import type {
  FlowRun,
  FlowRunStatus,
  QueryGetFlowRunsArgs,
  ResolverFn,
  StepRun,
} from "../../api-types.gen";
import { FlowStepStatus } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";

const parseHistoryItemPayload = (
  inputOrResults: proto.temporal.api.common.v1.IPayloads | null | undefined,
) =>
  inputOrResults?.payloads
    ?.map(({ data }) => {
      if (!data || !data.toString()) {
        return data;
      }

      try {
        return JSON.parse(data.toString());
      } catch {
        return data.toString();
      }
    })
    .filter((item) => item !== undefined);

const eventTimeIsoStringFromEvent = (
  event?: proto.temporal.api.history.v1.IHistoryEvent,
) => {
  const { eventTime } = event ?? {};
  if (!eventTime?.seconds) {
    return;
  }

  return new Date(
    eventTime.seconds.toInt() * 1000 +
      (eventTime.nanos ? eventTime.nanos / 1_000_000 : 0),
  ).toISOString();
};

/**
 * Get details from an ActivityTaskScheduledEvent
 */
const getActivityScheduledDetails = (
  event: proto.temporal.api.history.v1.IHistoryEvent,
) => {
  if (
    event.eventType !==
    proto.temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED
  ) {
    throw new Error(
      `Unexpected event type ${event.eventType}, expected ${proto.temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED}`,
    );
  }

  if (!event.activityTaskScheduledEventAttributes?.activityId) {
    throw new Error("No activityId on scheduled event");
  }

  const scheduledAt = eventTimeIsoStringFromEvent(event);
  if (!scheduledAt) {
    throw new Error("No eventTime on scheduled event");
  }

  const inputs = parseHistoryItemPayload(
    event.activityTaskScheduledEventAttributes.input,
  );

  return {
    activityId: event.activityTaskScheduledEventAttributes.activityId,
    activityType: event.activityTaskScheduledEventAttributes.activityType?.name,
    inputs,
    scheduledAt,
    startedAt: undefined,
    attempt: 1,
  };
};

/**
 * Get the history event where this activity was last scheduled, which is the only one that contains the activityId,
 * and tells us when it was last scheduled.
 */
const getActivityStartedDetails = (
  events: proto.temporal.api.history.v1.IHistoryEvent[],
  attributes:
    | proto.temporal.api.history.v1.IActivityTaskStartedEventAttributes
    | proto.temporal.api.history.v1.IActivityTaskCompletedEventAttributes
    | proto.temporal.api.history.v1.IActivityTaskCanceledEventAttributes
    | proto.temporal.api.history.v1.IActivityTaskCancelRequestedEventAttributes
    | proto.temporal.api.history.v1.IActivityTaskTimedOutEventAttributes
    | proto.temporal.api.history.v1.IActivityTaskFailedEventAttributes,
) => {
  const { scheduledEventId } = attributes;

  const scheduledEvent = events.findLast(
    (item) =>
      item.eventId?.toString() === scheduledEventId?.toString() &&
      item.eventType ===
        proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
  );

  if (!scheduledEvent) {
    throw new Error("Could not find scheduled event for activity in history");
  }

  const { activityId, activityType, scheduledAt, inputs } =
    getActivityScheduledDetails(scheduledEvent);

  const startedEvent = events.findLast(
    (item) =>
      item.eventType ===
        proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_STARTED &&
      item.activityTaskStartedEventAttributes?.scheduledEventId?.toString() ===
        scheduledEventId?.toString(),
  );

  return {
    activityId,
    activityType,
    scheduledAt,
    inputs,
    attempt: startedEvent?.activityTaskStartedEventAttributes?.attempt ?? 1,
    startedAt: eventTimeIsoStringFromEvent(startedEvent),
  };
};

const mapTemporalWorkflowToFlowStatus = async (
  workflow: WorkflowExecutionInfo,
  temporalClient: TemporalClient,
): Promise<FlowRun> => {
  const handle = temporalClient.workflow.getHandle(
    workflow.workflowId,
    workflow.runId,
  );

  const { events } = await handle.fetchHistory();

  const workflowInputs = parseHistoryItemPayload(
    events?.find(
      (event) =>
        event.eventType ===
        proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
    )?.workflowExecutionStartedEventAttributes?.input,
  );

  const workflowOutputs = parseHistoryItemPayload(
    events?.find(
      (event) =>
        event.eventType ===
        proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED,
    )?.workflowExecutionCompletedEventAttributes?.result,
  );

  const stepMap: { [activityId: string]: StepRun } = {};

  /**
   * Collect all progress signal events when building the step map,
   * and assign them to the appropriate step afterwards.
   */
  const progressSignalEvents: proto.temporal.api.history.v1.IHistoryEvent[] =
    [];

  const inputRequestsById: Record<string, ExternalInputRequest> = {};

  if (events?.length) {
    /*
     * Walk backwards from the most recent event until we have populated the latest state data for each step
     */
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (!event) {
        throw new Error("Somehow out of bounds for events array");
      }

      if (
        event.workflowExecutionSignaledEventAttributes?.signalName ===
        "logProgress"
      ) {
        progressSignalEvents.push(event);
        continue;
      }

      if (
        event.workflowExecutionSignaledEventAttributes?.signalName ===
        "requestExternalInput"
      ) {
        const signalData = parseHistoryItemPayload(
          event.workflowExecutionSignaledEventAttributes.input,
        )?.[0] as
          | ExternalInputRequestSignal
          | ExternalInputResponseSignal
          | undefined;

        if (!signalData) {
          throw new Error(
            `No signal data on requestExternalInput signal event with id ${event.eventId}`,
          );
        }

        if ("stepId" in signalData) {
          /**
           * This is a request for external input
           */
          const existingRequest = inputRequestsById[signalData.requestId];
          if (existingRequest) {
            existingRequest.data = signalData.data;
          } else {
            /**
             * If we haven't already populated the request record, it must not have been resolved yet,
             * because we are going backwards through the event history from most recent.
             * We would already have encountered the response signal if one had been provided.
             */
            inputRequestsById[signalData.requestId] = {
              ...signalData,
              resolved: false,
            };
          }
        } else {
          const { requestId, data, type } = signalData;

          inputRequestsById[signalData.requestId] = {
            data: {} as never, // we will populate this when we hit the original request
            answer: "answer" in data ? data.answer : undefined,
            requestId,
            stepId: "unresolved",
            type,
            resolved: true,
          };
        }
      }

      const nonScheduledAttributes =
        event.activityTaskStartedEventAttributes ||
        event.activityTaskCompletedEventAttributes ||
        event.activityTaskCanceledEventAttributes ||
        event.activityTaskCancelRequestedEventAttributes ||
        event.activityTaskFailedEventAttributes ||
        event.activityTaskTimedOutEventAttributes;

      if (
        !nonScheduledAttributes &&
        !event.activityTaskScheduledEventAttributes
      ) {
        // This is not an activity-related event. It may be a signal, which we handle in bulk below
        continue;
      }

      const {
        activityId,
        activityType,
        attempt,
        inputs,
        startedAt,
        scheduledAt,
      } = event.activityTaskScheduledEventAttributes
        ? getActivityScheduledDetails(event)
        : getActivityStartedDetails(events, nonScheduledAttributes!);

      if (activityType === "persistFlowActivity") {
        continue;
      }

      if (stepMap[activityId]) {
        // We've already encountered and therefore populated all the details for this step
        continue;
      }

      const activityRecord: StepRun = {
        stepId: activityId,
        stepType: activityType ?? "UNKNOWN",
        startedAt,
        scheduledAt,
        inputs,
        logs: [],
        status: FlowStepStatus.Scheduled,
        attempt,
      };

      stepMap[activityId] = activityRecord;

      switch (event.eventType) {
        case proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_SCHEDULED: {
          activityRecord.status = FlowStepStatus.Scheduled;
          break;
        }

        case proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_STARTED: {
          activityRecord.status = FlowStepStatus.Started;
          activityRecord.lastFailure =
            event.activityTaskStartedEventAttributes?.lastFailure;
          break;
        }

        case proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_COMPLETED: {
          activityRecord.status = FlowStepStatus.Completed;
          activityRecord.outputs =
            parseHistoryItemPayload(
              event.activityTaskCompletedEventAttributes?.result,
            ) ?? [];
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_FAILED: {
          activityRecord.status = FlowStepStatus.Failed;
          activityRecord.lastFailure =
            event.activityTaskFailedEventAttributes?.failure;
          activityRecord.retryState =
            event.activityTaskFailedEventAttributes?.retryState?.toString();
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT: {
          activityRecord.status = FlowStepStatus.TimedOut;
          activityRecord.lastFailure =
            event.activityTaskTimedOutEventAttributes?.failure;
          activityRecord.retryState =
            event.activityTaskTimedOutEventAttributes?.retryState?.toString();
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_CANCELED: {
          activityRecord.status = FlowStepStatus.Canceled;
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED: {
          activityRecord.status = FlowStepStatus.CancelRequested;
          break;
        }

        default:
          throw new Error(`Unhandled event type ${event.eventType}`);
      }
    }
  }

  /**
   * Assign logs to the appropriate step. The earliest logs will be at the end of the array,
   * as we walked the events from latest to earliest. We want the logs in ascending order, so go backwards again.
   */
  for (let i = progressSignalEvents.length - 1; i >= 0; i--) {
    const progressSignalEvent = progressSignalEvents[i];
    if (!progressSignalEvent) {
      throw new Error("Somehow out of bounds for progressSignalEvents array");
    }

    if (!progressSignalEvent.workflowExecutionSignaledEventAttributes) {
      throw new Error(
        `No signal attributes on progress signal event with id ${progressSignalEvent.eventId}`,
      );
    }

    const signalData = parseHistoryItemPayload(
      progressSignalEvent.workflowExecutionSignaledEventAttributes.input,
    )?.[0] as ProgressLogSignal | undefined;

    if (!signalData) {
      throw new Error(
        `No signal data on progress signal event with id ${progressSignalEvent.eventId}`,
      );
    }

    const { attempt, logs } = signalData;
    for (const log of logs) {
      const { stepId } = log;

      const activityRecord = stepMap[stepId];
      if (!activityRecord) {
        throw new Error(`No activity record found for step with id ${stepId}`);
      }

      if (log.type === "ProposedEntity" && attempt < activityRecord.attempt) {
        /**
         * If we have a proposed entity logged from a retried attempt, don't record it as nothing will happen with it.
         * By contrast, a PersistedEntity has already been committed to the database and is therefore relevant.
         *
         * @todo H-2545: heartbeat details of persisted entities from an activity so that if it's retried, the activity
         *    can pick up where it left off.
         */
        continue;
      }

      activityRecord.logs.push(log);
    }
  }

  const { runId, status, startTime, executionTime, closeTime, memo } = workflow;

  return {
    flowDefinitionId:
      (memo?.flowDefinitionId as string | undefined) ?? "unknown",
    runId,
    status: status.name as FlowRunStatus,
    startedAt: startTime.toISOString(),
    executedAt: executionTime?.toISOString(),
    closedAt: closeTime?.toISOString(),
    inputs: workflowInputs,
    outputs: workflowOutputs,
    inputRequests: Object.values(inputRequestsById),
    steps: Object.values(stepMap),
  };
};

export const getFlowRuns: ResolverFn<
  FlowRun[],
  Record<string, never>,
  Pick<GraphQLContext, "temporal">,
  QueryGetFlowRunsArgs
> = async (_parent, args, context) => {
  if (isProdEnv) {
    throw new Error("Not yet available");
  }

  const workflows: FlowRun[] = [];

  const { flowTypes } = args;

  const workflowIterable = context.temporal.workflow.list(
    flowTypes?.length
      ? {
          /**
           * Can also filter by runId, useful for e.g. getting all Temporal runIds for a given user
           * and then retrieving a list of details from Temporal
           */
          query: `WorkflowType IN (${flowTypes
            .map((type) => `'${type}'`)
            .join(", ")})`,
        }
      : { query: "WorkflowType = 'runFlow'" },
  );

  for await (const workflow of workflowIterable) {
    const runInfo = await mapTemporalWorkflowToFlowStatus(
      workflow,
      context.temporal,
    );

    workflows.push(runInfo);
  }

  return workflows;
};
