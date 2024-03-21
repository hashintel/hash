import type {
  Client as TemporalClient,
  WorkflowExecutionInfo,
} from "@temporalio/client";
import { temporal } from "@temporalio/proto";

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
  inputOrResults: temporal.api.common.v1.IPayloads | null | undefined,
) =>
  inputOrResults?.payloads?.map(({ data }) => {
    if (!data?.toString()) {
      return null;
    }
    return JSON.parse(data.toString());
  });

const eventTimeIsoStringFromEvent = (
  event?: temporal.api.history.v1.IHistoryEvent,
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
  event: temporal.api.history.v1.IHistoryEvent,
) => {
  if (
    event.eventType !==
    temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED
  ) {
    throw new Error(
      `Unexpected event type ${event.eventType}, expected ${temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED}`,
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
  events: temporal.api.history.v1.IHistoryEvent[],
  attributes:
    | temporal.api.history.v1.IActivityTaskStartedEventAttributes
    | temporal.api.history.v1.IActivityTaskCompletedEventAttributes
    | temporal.api.history.v1.IActivityTaskCanceledEventAttributes
    | temporal.api.history.v1.IActivityTaskCancelRequestedEventAttributes
    | temporal.api.history.v1.IActivityTaskTimedOutEventAttributes
    | temporal.api.history.v1.IActivityTaskFailedEventAttributes,
) => {
  const { scheduledEventId } = attributes;

  const scheduledEvent = events.findLast(
    (item) =>
      item.eventId?.toString() === scheduledEventId?.toString() &&
      item.eventType ===
        temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
  );

  if (!scheduledEvent) {
    throw new Error("Could not find scheduled event for activity in history");
  }

  const { activityId, activityType, scheduledAt, inputs } =
    getActivityScheduledDetails(scheduledEvent);

  const startedEvent = events.findLast(
    (item) =>
      item.eventType ===
        temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED &&
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
        temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
    )?.workflowExecutionStartedEventAttributes?.input,
  );

  const workflowOutputs = parseHistoryItemPayload(
    events?.find(
      (event) =>
        event.eventType ===
        temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED,
    )?.workflowExecutionCompletedEventAttributes?.result,
  );

  const stepMap: { [activityId: string]: StepRun } = {};

  if (events?.length) {
    /*
     * Walk backwards from the most recent event until we have populated the latest state data for each step
     */
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (!event) {
        throw new Error("Somehow out of bounds for events array");
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
        // This is not an activity-related event
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
        status: FlowStepStatus.Scheduled,
        attempt,
      };

      stepMap[activityId] = activityRecord;

      switch (event.eventType) {
        case temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_SCHEDULED: {
          activityRecord.status = FlowStepStatus.Scheduled;
          break;
        }

        case temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED: {
          activityRecord.status = FlowStepStatus.Started;
          activityRecord.lastFailure =
            event.activityTaskStartedEventAttributes?.lastFailure;
          break;
        }

        case temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_COMPLETED: {
          activityRecord.status = FlowStepStatus.Completed;
          activityRecord.outputs =
            parseHistoryItemPayload(
              event.activityTaskCompletedEventAttributes?.result,
            ) ?? [];
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED: {
          activityRecord.status = FlowStepStatus.Failed;
          activityRecord.lastFailure =
            event.activityTaskFailedEventAttributes?.failure;
          activityRecord.retryState =
            event.activityTaskFailedEventAttributes?.retryState?.toString();
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT: {
          activityRecord.status = FlowStepStatus.TimedOut;
          activityRecord.lastFailure =
            event.activityTaskTimedOutEventAttributes?.failure;
          activityRecord.retryState =
            event.activityTaskTimedOutEventAttributes?.retryState?.toString();
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_CANCELED: {
          activityRecord.status = FlowStepStatus.Canceled;
          activityRecord.closedAt = eventTimeIsoStringFromEvent(event);
          break;
        }

        case temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED: {
          activityRecord.status = FlowStepStatus.CancelRequested;
          break;
        }

        default:
          throw new Error(`Unhandled event type ${event.eventType}`);
      }
    }
  }

  const { type, runId, status, startTime, executionTime, closeTime } = workflow;

  return {
    flowDefinitionId: type,
    runId,
    status: status.name as FlowRunStatus,
    startedAt: startTime.toISOString(),
    executedAt: executionTime?.toISOString(),
    closedAt: closeTime?.toISOString(),
    inputs: workflowInputs,
    outputs: workflowOutputs,
    steps: Object.values(stepMap),
  };
};

export const getFlowRuns: ResolverFn<
  FlowRun[],
  never,
  GraphQLContext,
  QueryGetFlowRunsArgs
> = async (_parent, args, context) => {
  const workflows: FlowRun[] = [];

  const { flowTypes } = args;

  const workflowIterable = context.temporal.workflow.list(
    flowTypes?.length
      ? {
          /**
           * Can also filter by runId, useful for e.g. getting all Temporal runIds for a given user
           * and then retrieving a list of details from Temporal
           */
          query: `WorkflowType IN (${flowTypes.map((type) => `'${type}'`).join(", ")})`,
        }
      : {},
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
