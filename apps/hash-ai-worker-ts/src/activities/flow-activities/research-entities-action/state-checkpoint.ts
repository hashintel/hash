import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Context } from "@temporalio/activity";
import proto from "@temporalio/proto";

import type { ResearchActionCheckpointState } from "../../../shared/signals.js";
import { researchActionCheckpointSignal } from "../../../shared/signals.js";
import { getTemporalClient } from "../../shared/get-flow-context.js";

export const createCheckpoint = async (
  checkpointData: ResearchActionCheckpointState,
) => {
  Context.current().heartbeat(checkpointData);

  const temporalClient = await getTemporalClient();

  const workflowId = Context.current().info.workflowExecution.workflowId;

  const handle = temporalClient.workflow.getHandle(workflowId);

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
    let checkpointId: string | undefined = undefined;

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
        )?.[0];

        if (parsedSignal.checkpointId === checkpointId) {
          return parsedSignal.data as ResearchActionCheckpointState;
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
