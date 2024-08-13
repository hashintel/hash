import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Context } from "@temporalio/activity";
import proto from "@temporalio/proto";

import type {
  FlowSignal,
  ResearchActionCheckpointState,
} from "../../../shared/signals.js";
import { researchActionCheckpointSignal } from "../../../shared/signals.js";
import { getTemporalClient } from "../../shared/get-flow-context.js";
import { flushLogs } from "../../shared/log-progress.js";

export const createCheckpoint = async (
  checkpointData: ResearchActionCheckpointState,
) => {
  await flushLogs();

  Context.current().heartbeat(checkpointData);

  const temporalClient = await getTemporalClient();

  const { workflowId, runId } = Context.current().info.workflowExecution;

  const handle = temporalClient.workflow.getHandle(workflowId, runId);

  await handle.signal(researchActionCheckpointSignal, {
    data: checkpointData,
    recordedAt: new Date().toISOString(),
    stepId: Context.current().info.activityId,
    checkpointId: generateUuid(),
  });
};

export const getCheckpoint = async () => {
  const { workflowId } = Context.current().info.workflowExecution;

  const temporalClient = await getTemporalClient();
  const handle = temporalClient.workflow.getHandle(workflowId);

  const { events } = await handle.fetchHistory();

  if (events) {
    let checkpointId: string | undefined | null = undefined;

    /**
     * Look back from the most recent event to see if the workflow has been reset to a specific checkpoint,
     * and if so keep going backwards until we find the checkpoint signal to restore the state from.
     */
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]!;

      const signalData = event.workflowExecutionSignaledEventAttributes?.input;
      if (signalData) {
        const parsedSignal = parseHistoryItemPayload(
          event.workflowExecutionSignaledEventAttributes?.input,
        )?.[0] as FlowSignal | undefined;

        if (
          parsedSignal &&
          checkpointId &&
          "checkpointId" in parsedSignal &&
          parsedSignal.checkpointId === checkpointId
        ) {
          return parsedSignal.data;
        }
      }

      if (
        event.eventType ===
        proto.temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_TASK_FAILED
      ) {
        if (
          event.workflowTaskFailedEventAttributes?.cause ===
          proto.temporal.api.enums.v1.WorkflowTaskFailedCause
            .WORKFLOW_TASK_FAILED_CAUSE_RESET_WORKFLOW
        ) {
          checkpointId =
            event.workflowTaskFailedEventAttributes.failure?.message;
        }
      }
    }
  }

  return Context.current().info.heartbeatDetails as
    | ResearchActionCheckpointState
    | undefined;
};
