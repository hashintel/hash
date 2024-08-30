import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Context } from "@temporalio/activity";
import proto from "@temporalio/proto";

import { heartbeatTimeoutSeconds } from "../../../shared/heartbeats.js";
import type {
  FlowSignal,
  ResearchActionCheckpointState,
} from "../../../shared/signals.js";
import { researchActionCheckpointSignal } from "../../../shared/signals.js";
import { logger } from "../../shared/activity-logger.js";
import { getTemporalClient } from "../../shared/get-flow-context.js";
import { flushLogs, logProgress } from "../../shared/log-progress.js";
import type { CoordinatingAgentState } from "./shared/coordinators.js";

/**
 * Start a frequent heartbeat so that the activity is known to be still going.
 * Because this is a long-running activity, it needs a long startToCloseTimeout, but we can set a shorter heartbeatTimeout.
 *
 * This is important to ensure that the activity is known to be not running, e.g. if the Temporal worker restarts.
 * Without a heartbeatTimeout, if the Temporal worker is restarted the workflow will do nothing until the
 * startToCloseTimeout is reached. With a heartbeatTimeout, if the Temporal worker is restarted the activity will error
 * out quickly and be restarted.
 *
 * Note that heartbeat processing are throttled to the lower of:
 * 1. 80% of the heartbeatTimeout set when proxying an activity
 * 2 the maxHeartbeatTimeout
 *
 * This means that heartbeats (and the included details) may be recorded at a lower frequency than the interval here.
 */
export const heartbeatAndWaitCancellation = async (
  state: CoordinatingAgentState,
) => {
  const secondsBetweenHeartbeats = heartbeatTimeoutSeconds - 2;

  const heartbeatInterval = setInterval(() => {
    Context.current().heartbeat({
      state,
    } satisfies ResearchActionCheckpointState);
  }, secondsBetweenHeartbeats * 1000);

  return Context.current().cancelled.catch((err) => {
    logger.error(`Cancellation received: ${err}`);
    clearInterval(heartbeatInterval);
    throw err;
  });
};

/**
 * Create a checkpoint from which the activity can be restored.
 * Temporal's heartbeat feature is only designed for an activity to resume from its last heartbeated state,
 * e.g. in the case of activity failure and retry, and prior heartbeats are not retrievable.
 * This stores prior checkpoint state by way of sending a signal so it is discoverable via the event history.
 *
 * @todo H-3129: this is only required because so much work is being done in a single long-running activity
 *   – the better and more idiomatic Temporal solution is to split it up into multiple activities,
 *     probably with the 'researchEntitiesAction' becoming a child workflow that calls activities (or its own child workflows).
 */
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
          logProgress([
            {
              type: "ResetToCheckpoint",
              stepId: Context.current().info.activityId,
              recordedAt: new Date().toISOString(),
            },
          ]);
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
