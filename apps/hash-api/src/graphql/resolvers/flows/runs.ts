import type {
  Client as TemporalClient,
  WorkflowExecutionInfo,
} from "@temporalio/client";
import { temporal } from "@temporalio/proto";

import type { FlowRun, FlowRunStatus, ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";

const parseHistoryItemInput = (
  input: temporal.api.common.v1.IPayloads | null | undefined,
) =>
  input?.payloads?.flatMap(({ data }) => {
    if (!data) {
      return [];
    }
    console.log("Data type", typeof data);
    return JSON.parse(
      Buffer.from(data as unknown as string, "base64").toString(),
    );
  });

const mapTemporalWorkflowToFlowStatus = async (
  workflow: WorkflowExecutionInfo,
  temporalClient: TemporalClient,
): Promise<FlowRun> => {
  const handle = temporalClient.workflow.getHandle(
    workflow.workflowId,
    workflow.runId,
  );

  const { events } = await handle.fetchHistory();

  const activityMap: Record<
    number,
    {
      activityId: string;
      activityType: string;
      status: "STARTED" | "COMPLETED" | "FAILED" | "TIMED_OUT" | "CANCELED";
    }
  > = {};

  const workflowInputs = parseHistoryItemInput(
    events?.find(
      (event) =>
        event.eventType ===
        temporal.api.enums.v1.EventType
          .EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED,
    )?.workflowExecutionStartedEventAttributes?.input,
  );

  const workflowOutputs = parseHistoryItemInput(
    events?.find(
      (event) =>
        event.eventType ===
        temporal.api.enums.v1.EventType
          .EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED,
    )?.workflowExecutionCompletedEventAttributes?.result,
  );

  const parsedHistory = (history.events ?? [])
    .map((historyItem) => {
      let inputs: unknown[] = [];
      let activityId = "";
      let activityType: string = "";
      switch (historyItem.eventType) {
        case temporal.api.enums.v1.EventType
          .EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED: {
          activityId = "0";
          activityType = "trigger";
          inputs =
            parseHistoryItemInput(
              historyItem.workflowExecutionStartedEventAttributes?.input,
            ) ?? [];
          break;
        }
        case temporal.api.enums.v1.EventType
          .EVENT_TYPE_ACTIVITY_TASK_SCHEDULED: {
          activityId =
            historyItem.activityTaskScheduledEventAttributes?.activityId ??
            "ERROR";
          activityType =
            historyItem.activityTaskScheduledEventAttributes?.activityType
              ?.name ?? "ERROR";
          inputs =
            parseHistoryItemInput(
              historyItem.activityTaskScheduledEventAttributes?.input,
            ) ?? [];
          break;
        }
        default:
          return null;
      }
      return {
        activityId,
        activityType,
        inputs,
      };
    })

    .filter((item): item is NonNullable<typeof item> => !!item);

  const { type, runId, status, startTime, executionTime, closeTime } = workflow;

  return {
    flowDefinitionId: type,
    runId,
    status: status.name as FlowRunStatus,
    startTime: startTime.toISOString(),
    executionTime: executionTime?.toISOString(),
    closeTime: closeTime?.toISOString(),
    inputs: workflowInputs,
    outputs: workflowOutputs,
  };
};

export const getFlowRuns: ResolverFn<
  FlowRun[],
  never,
  GraphQLContext,
  never
> = async (_parent, _args, context) => {
  const workflows: FlowRun[] = [];

  const workflowIterable = context.temporal.workflow.list({
    /**
     * Can also filter by runId, useful for e.g. getting all Temporal runIds for a given user
     * and then retrieving a list of details from Temporal
     */
    query: "WorkflowType IN ('inferEntities', 'researchTask')",
  });
  for await (const workflow of workflowIterable) {
    const runInfo = await mapTemporalWorkflowToFlowStatus(
      workflow,
      context.temporal,
    );

    workflows.push(runInfo);
  }

  return workflows;
};
