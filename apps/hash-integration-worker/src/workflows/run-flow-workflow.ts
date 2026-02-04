import { type ProxyFlowActivity } from "@local/hash-backend-utils/flows";
import { processFlowWorkflow } from "@local/hash-backend-utils/flows/process-flow-workflow";
import type { IntegrationFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  BaseRunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import {
  ActivityCancellationType,
  proxyActivities,
} from "@temporalio/workflow";

import type { createFlowActivities } from "../activities/flow-activities.js";
import { heartbeatTimeoutSeconds } from "../shared/heartbeats.js";

type FlowActivityId = keyof ReturnType<typeof createFlowActivities>;

/**
 * Activities which send a frequent heartbeat to ensure they are known to be still running,
 * allowing for startToCloseTimeout to be longer in favour of a short heartbeatTimeout.
 */
const activitiesHeartbeating: FlowActivityId[] = [
  "persistIntegrationEntitiesAction",
];

const proxyFlowActivity: ProxyFlowActivity<
  IntegrationFlowActionDefinitionId,
  typeof createFlowActivities
> = (params) => {
  const { actionName, maximumAttempts, activityId } = params;

  const { [actionName]: action } = proxyActivities<
    ReturnType<typeof createFlowActivities>
  >({
    cancellationType: ActivityCancellationType.ABANDON,

    startToCloseTimeout: activitiesHeartbeating.includes(actionName)
      ? "36000 second" // 10 hours
      : "300 second", // 5 minutes

    /**
     * The heartbeat timeout is the time elapsed without a heartbeat after which the activity is considered to have failed.
     * Note that:
     *  - heartbeat-ing activities can receive notification when a flow is cancelled/closed, by catching Context.current().cancelled
     *  - notification will only be received when the next heartbeat is processed, and so the activity should heartbeat frequently
     *  - heartbeats are throttled by default to 80% of the heartbeatTimeout, so sending a heartbeat does not mean it will be processed then
     *  - maxHeartbeatThrottleInterval can be set in WorkerOptions, and otherwise defaults to 60s
     */
    heartbeatTimeout: activitiesHeartbeating.includes(actionName)
      ? `${heartbeatTimeoutSeconds} second`
      : undefined,

    retry: { maximumAttempts },
    activityId,
  });

  return action;
};

export const runFlowWorkflow = async (
  params: BaseRunFlowWorkflowParams<IntegrationFlowActionDefinitionId>,
): Promise<RunFlowWorkflowResponse> => {
  return await processFlowWorkflow({
    ...params,
    flowType: "integration",
    proxyFlowActivity,
  });
};
